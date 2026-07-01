import {
  fetchAllLastPlannedRepsForExercise,
  fetchAllLastSetRepsForExercise,
  fetchAllLastSetWeightsForExercise,
} from './progression.queries';

import { Set, WorkoutSession } from '../session.types';
import type { ExerciseRow, HydratedExercise, SetRow } from '../../types';
import {
  executeRaw,
  insert,
  selectOne,
  selectRaw,
  selectRawOne,
  update,
} from '../../db';
import { getExerciseSessionStats } from '../utils/getPreviousExerciseSessionStats';
import { repairWorkoutSessionBlocks } from '../../repositories/sessions';

const TABLES = {
  workouts: 'workouts',
  exercises: 'exercises',
  workout_sessions: 'workout_sessions',
  workout_exercises: 'workout_exercises',
  workout_blocks: 'workout_blocks',
  workout_exercise_sets: 'workout_exercise_sets',
  set_logs: 'set_logs',
  exercise_logs: 'exercise_logs',
};

const parseJsonArray = (value: unknown) => {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed;
    if (typeof parsed === 'string') {
      const nested = JSON.parse(parsed);
      return Array.isArray(nested) ? nested : [];
    }
    return [];
  } catch {
    return [];
  }
};

const createSessionDropSets = (value: unknown) =>
  parseJsonArray(value).map((drop: any) => {
    if (drop.plannedReps !== undefined || drop.plannedWeight !== undefined)
      return drop;
    return {
      plannedReps: drop.reps ?? null,
      plannedWeight: drop.weight ?? null,
      reps: null,
      weight: drop.weight ?? null,
      completed: 0,
    };
  });

type SessionExerciseStructureSetInput = {
  id?: number | null;
  setNumber?: number | null;
  set_number?: number | null;
  roundNumber?: number | null;
  plannedReps?: number | null;
  planned_reps?: number | null;
  plannedDurationSeconds?: number | null;
  durationSeconds?: number | null;
  weight?: number | null;
  reps?: number | null;
  completed?: number | null;
  dropSets?: unknown;
  drop_sets?: unknown;
};

export type SessionExerciseStructureInput = {
  exerciseLogId: number;
  plannedReps?: number | null;
  weight?: number | null;
  restSeconds?: number | null;
  orderIndex?: number | null;
  blockId?: number | null;
  blockType?:
    | 'straight_sets'
    | 'circuit'
    | 'superset'
    | 'giant_set'
    | 'interval'
    | null;
  blockName?: string | null;
  blockRounds?: number | null;
  blockRestBetweenRounds?: number | null;
  blockOrder?: number | null;
  supersetId?: number | null;
  groupId?: number | null;
  groupType?: 'superset' | 'drop_set' | 'circuit' | null;
  sets?: SessionExerciseStructureSetInput[];
};

const getSetNumber = (set: SessionExerciseStructureSetInput, index: number) =>
  Math.max(
    1,
    Math.round(
      Number(set.setNumber ?? set.set_number ?? index + 1) || index + 1,
    ),
  );

const getSetPlannedReps = (
  set: SessionExerciseStructureSetInput,
  fallback: number | null | undefined,
) =>
  Math.max(
    0,
    Math.round(
      Number(set.plannedReps ?? set.planned_reps ?? fallback ?? 1) || 0,
    ),
  );

const normalizeDropSets = (value: unknown) =>
  parseJsonArray(value).map((drop: any) => ({
    plannedReps: drop.plannedReps ?? drop.reps ?? null,
    plannedWeight: drop.plannedWeight ?? drop.weight ?? null,
    reps: drop.reps ?? null,
    weight: drop.weight ?? drop.plannedWeight ?? null,
    completed: drop.completed ? 1 : 0,
  }));

/**
 * Fetches planned sets for an exercise in a workout template
 */
export async function getPlannedSetsForExercise(
  workoutId: number,
  exerciseId: number,
): Promise<
  Array<{
    set_number: number;
    round_number?: number | null;
    plannedReps: number;
    planned_weight: number | null;
    duration_seconds?: number | null;
    drop_sets?: any[];
  }>
> {
  const sets = await selectRaw<any>(
    `SELECT set_number, planned_reps as plannedReps, planned_weight, duration_seconds, drop_sets FROM ${TABLES.workout_exercise_sets} WHERE workout_id = ? AND exercise_id = ? ORDER BY set_number`,
    [workoutId, exerciseId],
  );
  return sets.map(set => ({
    ...set,
    drop_sets: parseJsonArray(set.drop_sets),
  }));
}

type WorkoutSessionMetadata = {
  organizationId?: string | null;
  programId?: number | string | null;
  programWorkoutId?: number | string | null;
  assignmentId?: number | string | null;
  progressId?: number | string | null;
  clientSessionId?: string | null;
  remoteSource?: string | null;
  userId?: string | null;
};

/**
 *  Creates a new workout session
 */
export async function createWorkoutSession(
  workoutId: number,
  metadata: WorkoutSessionMetadata = {},
): Promise<number> {
  const sessionId = await insert(TABLES.workout_sessions, {
    user_id: metadata.userId || null,
    workout_id: workoutId,
    // organization_id: metadata.organizationId || null,
    // program_id: toTextId(metadata.programId),
    // program_workout_id: toTextId(metadata.programWorkoutId),
    // assignment_id: toTextId(metadata.assignmentId),
    // progress_id: toTextId(metadata.progressId),
    // client_session_id: metadata.clientSessionId || null,
    // remote_source: metadata.remoteSource || null,
    // sync_status: metadata.remoteSource ? 'pending' : 'local',
    // synced: metadata.remoteSource ? 0 : 1,
    started_at: new Date().toISOString(),
    finished_at: null,
  });
  return sessionId;
}

/**
 * Generates exercise_logs + set_logs from workout template
 */
export async function generateExerciseLogsAndSets(
  sessionId: number,
  workoutId: number,
) {
  try {
    const templateExercises = await selectRaw<{
      exercise_id: number;
      block_id?: number | null;
      block_type?:
        | 'straight_sets'
        | 'circuit'
        | 'superset'
        | 'giant_set'
        | 'interval'
        | null;
      block_name?: string | null;
      block_rounds?: number | null;
      block_rest_between_rounds?: number | null;
      block_order?: number | null;
      default_sets: number;
      default_reps: number;
      weight: number | null;
      superset_id?: number | null;
      group_id?: number | null;
      group_type?: 'superset' | 'drop_set' | 'circuit' | null;
      order_index?: number | null;
      setsArray?: string | null;
    }>(
      `
      SELECT
      we.exercise_id,
      we.block_id,
      wb.type as block_type,
      wb.name as block_name,
      wb.rounds as block_rounds,
      wb.rest_between_rounds as block_rest_between_rounds,
      wb.order_index as block_order,
      we.default_sets,
      we.default_reps,
      we.setsArray,
      we.weight,
      we.superset_id,
      we.group_id,
      we.group_type,
      we.order_index
      FROM ${TABLES.workout_exercises} we
      LEFT JOIN ${TABLES.workout_blocks} wb ON wb.id = we.block_id
      WHERE we.workout_id = ?
      ORDER BY COALESCE(wb.order_index, we.order_index), we.order_index
      `,
      [workoutId],
    );

    if (templateExercises.length === 0) {
      return;
    }

    for (const row of templateExercises) {
      const exerciseLogId = await insert('exercise_logs', {
        workout_session_id: sessionId,
        block_id: row.block_id || null,
        block_type: row.block_type || null,
        block_name: row.block_name || null,
        block_rounds: row.block_rounds || null,
        block_rest_between_rounds: row.block_rest_between_rounds ?? null,
        block_order: row.block_order ?? null,
        exercise_id: row.exercise_id,
        planned_sets:
          row.block_type === 'circuit' ||
          row.block_type === 'superset' ||
          row.block_type === 'giant_set'
            ? row.block_rounds || 1
            : row.default_sets,
        planned_reps: row.default_reps,
        weight: row.weight,
        superset_id: row.superset_id || null,
        group_id: row.group_id || row.superset_id || null,
        group_type: row.group_type || (row.superset_id ? 'superset' : null),
        order_index: row.order_index ?? null,
      });

      // Try to get per-set planned weights from workout_exercise_sets
      const plannedSets = await getPlannedSetsForExercise(
        workoutId,
        row.exercise_id,
      );
      if (plannedSets && plannedSets.length > 0) {
        const sessionSets =
          row.block_type === 'circuit' ||
          row.block_type === 'superset' ||
          row.block_type === 'giant_set'
            ? Array.from(
                { length: Math.max(1, Math.round(row.block_rounds || 1)) },
                (_, index) => ({
                  ...(plannedSets[0] || {}),
                  set_number: index + 1,
                  round_number: index + 1,
                }),
              )
            : plannedSets;
        for (const set of sessionSets) {
          await insert(TABLES.set_logs, {
            exercise_log_id: exerciseLogId,
            set_number: set.set_number,
            round_number: set.round_number || null,
            reps: null,
            completed: 0,
            planned_reps: set.plannedReps,
            planned_duration_seconds: set.duration_seconds ?? null,
            duration_seconds: null,
            weight: set.planned_weight,
            drop_sets: JSON.stringify(createSessionDropSets(set.drop_sets)),
          });
        }
      } else {
        // create an array based on the row.default_sets count
        const parsedSetsArray = row.setsArray
          ? JSON.parse(row.setsArray)
          : row.default_sets
          ? Array.from({ length: row.default_sets }, (_, i) => ({
              set_number: i + 1,
              planned_reps: row.default_reps,
              planned_weight: row.weight,
            }))
          : [];
        const setsArray =
          row.block_type === 'circuit' ||
          row.block_type === 'superset' ||
          row.block_type === 'giant_set'
            ? Array.from(
                { length: Math.max(1, Math.round(row.block_rounds || 1)) },
                (_, i) => ({
                  ...(parsedSetsArray[0] || {}),
                  set_number: i + 1,
                  round_number: i + 1,
                }),
              )
            : parsedSetsArray;
        // Fallback: generate sets using workout_exercises defaults
        for (let i = 1; i <= setsArray.length; i++) {
          await insert(TABLES.set_logs, {
            exercise_log_id: exerciseLogId,
            set_number: i,
            round_number: setsArray[i - 1].round_number || null,
            reps: null,
            completed: 0,
            planned_reps:
              setsArray[i - 1].planned_reps ||
              setsArray[i - 1].reps ||
              row.default_reps,
            planned_duration_seconds:
              setsArray[i - 1].duration_seconds ??
              setsArray[i - 1].durationSeconds ??
              null,
            duration_seconds: null,
            weight:
              setsArray[i - 1].planned_weight ??
              setsArray[i - 1].weight ??
              row.weight,
            drop_sets: JSON.stringify(
              createSessionDropSets(
                setsArray[i - 1].drop_sets || setsArray[i - 1].dropSets,
              ),
            ),
          });
        }
      }
    }
  } catch (error) {
    console.error('❌ Error in generateExerciseLogsAndSets:', error);
    throw error;
  }
}

/**
 * Finds an unfinished workout session for a specific workout
 * If no workoutId is provided, returns any active session
 */
export async function getActiveSession(
  workoutId?: number,
): Promise<WorkoutSession | null> {
  if (workoutId) {
    return selectRawOne<WorkoutSession>(
      `
      SELECT *
      FROM ${TABLES.workout_sessions}
      WHERE finished_at IS NULL AND workout_id = ?
      ORDER BY started_at DESC
      LIMIT 1
      `,
      [workoutId],
    );
  }

  // Return any active session
  return selectRawOne<WorkoutSession>(
    `
    SELECT *
    FROM ${TABLES.workout_sessions}
    WHERE finished_at IS NULL
    ORDER BY started_at DESC
    LIMIT 1
    `,
  );
}

/**
 * For each exercise, fetch last set weights for all its set numbers and lastSessionDate, plus previous session stats
 */
const hydrateExercisesWithLastSessionDate = async (
  sessionId: number,
  exercises: ExerciseRow[],
  sets: SetRow[],
) => {
  // Group sets by exercise, normalizing keys to numbers
  const setsByExercise = new Map<number, SetRow[]>();
  sets.forEach((set: SetRow) => {
    const exerciseLogId = Number(set.exercise_log_id);
    if (!setsByExercise.has(exerciseLogId)) {
      setsByExercise.set(exerciseLogId, []);
    }
    setsByExercise.get(exerciseLogId)!.push({
      ...set,
      plannedReps: set.plannedReps,
      exercise_log_id: exerciseLogId,
    });
  });

  const hydratedExercises = await Promise.all(
    exercises.map(async (ex: ExerciseRow) => {
      const exerciseLogId = Number(ex.exerciseLogId);
      const exerciseSets = setsByExercise.get(exerciseLogId) ?? [];
      const setNumbers = exerciseSets.map((set: any) => set.set_number);
      let lastSetWeights: Record<number, number | null> = {};
      let lastSetReps: Record<number, number | null> = {};
      let lastPlannedReps: Record<number, number | null> = {};
      if (setNumbers.length > 0) {
        lastSetWeights = await fetchAllLastSetWeightsForExercise(
          ex.exerciseId,
          setNumbers,
        );
        lastSetReps = await fetchAllLastSetRepsForExercise(
          ex.exerciseId,
          setNumbers,
        );
        lastPlannedReps = await fetchAllLastPlannedRepsForExercise(
          ex.exerciseId,
          setNumbers,
        );
      }
      const historicalSets = await selectRaw<{
        weight: number | null;
        reps: number | null;
      }>(
        `
        SELECT sl.weight, sl.reps
        FROM set_logs sl
        JOIN exercise_logs el ON el.id = sl.exercise_log_id
        JOIN workout_sessions ws ON ws.id = el.workout_session_id
        WHERE el.exercise_id = ?
          AND ws.id != ?
          AND ws.finished_at IS NOT NULL
          AND sl.reps IS NOT NULL
          AND sl.reps > 0
      `,
        [ex.exerciseId, sessionId],
      );
      const previousBestWeight = historicalSets.reduce<number | null>(
        (best, set) =>
          typeof set.weight === 'number' &&
          set.weight > 0 &&
          (best === null || set.weight > best)
            ? set.weight
            : best,
        null,
      );
      const previousBestVolume = historicalSets.reduce<number | null>(
        (best, set) => {
          const volume = (set.weight || 0) * (set.reps || 0);
          return volume > 0 && (best === null || volume > best) ? volume : best;
        },
        null,
      );
      // Attach lastWeight and lastReps to each set
      const setsWithLastWeightAndReps = exerciseSets.map((set: any) => ({
        ...set,
        lastWeight: lastSetWeights[set.set_number] ?? null,
        lastReps: lastSetReps[set.set_number] ?? null,
        lastPlannedReps: lastPlannedReps[set.set_number] ?? null,
        previousBestWeight,
        previousBestVolume,
        previousBestRepsAtWeight: historicalSets.reduce<number | null>(
          (best, historicalSet) =>
            Number(historicalSet.weight || 0) === Number(set.weight || 0) &&
            typeof historicalSet.reps === 'number' &&
            (best === null || historicalSet.reps > best)
              ? historicalSet.reps
              : best,
          null,
        ),
      }));

      // Fetch previous session stats for this exercise
      const sessionStats = await getExerciseSessionStats(
        ex.exerciseId,
        sessionId,
        ex.name,
      );
      return {
        exerciseId: ex.exerciseId,
        exerciseLogId: ex.exerciseLogId,
        name: ex.name,
        category: ex.category ?? '',
        weight: ex.weight,
        restSeconds: ex.restSeconds ?? null,
        blockId: ex.blockId ?? null,
        blockType: ex.blockType ?? null,
        blockName: ex.blockName ?? null,
        blockRounds: ex.blockRounds ?? null,
        blockRestBetweenRounds: ex.blockRestBetweenRounds ?? null,
        blockOrder: ex.blockOrder ?? null,
        orderIndex: ex.order_index ?? 0,
        supersetId: ex.supersetId ?? null,
        groupId: ex.groupId ?? ex.supersetId ?? null,
        groupType: ex.groupType ?? (ex.supersetId ? 'superset' : null),
        plannedReps: ex.plannedReps,
        image_key: ex.image_key ?? null,
        imageKey: ex.image_key ?? null,
        primary_muscle: ex.primary_muscle ?? null,
        primaryMuscle: ex.primary_muscle ?? null,
        secondaryMuscles: ex.secondary_muscles ?? null,
        equipment: ex.equipment ?? null,
        sets: setsWithLastWeightAndReps,
        image_url: ex.image_url ?? null,
        imageUrl: ex.image_url ?? null,
        sessionStats,
      };
    }),
  );
  return hydratedExercises;
};

/**
 * Fetches hydrated workout data for a session, including lastSessionDate for each exercise
 * Leaves the original fetchWorkoutSession untouched
 */
export async function fetchWorkoutSessionWithLastSessionDate(
  sessionId: number,
): Promise<{ workoutName: string; exercises: HydratedExercise[] }> {
  try {
    await repairWorkoutSessionBlocks(sessionId);
    console.log(
      '[fetchWorkoutSessionWithLastSessionDate] Fetching session data for sessionId:',
      sessionId,
    );
    // Get the workout name for this session
    const sessionInfo = await selectRawOne<{ workout_name: string }>(
      `
      SELECT w.name as workout_name, w.description
      FROM ${TABLES.workout_sessions} ws
      JOIN ${TABLES.workouts} w ON w.id = ws.workout_id
      WHERE ws.id = ?
      `,
      [sessionId],
    );
    console.log(
      '[fetchWorkoutSessionWithLastSessionDate] Session info:',
      sessionInfo,
    );
    if (!sessionInfo) {
      throw new Error('Session not found');
    }

    // Get all exercises for this session
    const exercises = await selectRaw<ExerciseRow>(
      `
      SELECT
        el.id AS exerciseLogId,
        e.id AS exerciseId,
        e.name,
        el.block_id AS blockId,
        el.block_type AS blockType,
        el.block_name AS blockName,
        el.block_rounds AS blockRounds,
        el.block_rest_between_rounds AS blockRestBetweenRounds,
        el.block_order AS blockOrder,
        el.planned_reps,
        el.planned_reps AS plannedReps,
        el.weight,
        el.rest_seconds AS restSeconds,
        el.order_index,
        el.superset_id AS supersetId,
        el.group_id AS groupId,
        el.group_type AS groupType,
        e.image_url,
        e.category,
        e.image_key,
        e.primary_muscle,
        e.secondary_muscles,
        e.equipment,
        e.exercise_type AS exerciseType,
        e.difficulty,
        e.training_style AS trainingStyle,
        e.progression_group AS progressionGroup,
        e.progression_level AS progressionLevel
      FROM ${TABLES.exercise_logs} el
      JOIN ${TABLES.exercises} e ON e.id = el.exercise_id
      WHERE el.workout_session_id = ?
    ORDER BY el.order_index ASC, el.id ASC
      `,
      [sessionId],
    );
    if (!exercises || exercises.length === 0) {
      return { workoutName: sessionInfo.workout_name, exercises: [] };
    }

    // Get the exercise log IDs
    const exerciseLogIds = exercises.map((e: ExerciseRow) => e.exerciseLogId);

    let sets: SetRow[] = [];
    sets = await getSetsForExercise(exerciseLogIds, sets);
    // try {
    //   if (exerciseLogIds.length > 0) {
    //     sets = await selectRaw<SetRow>(
    //       `
    //       SELECT
    //         sl.id,
    //         sl.exercise_log_id,
    //         sl.reps,
    //         sl.completed,
    //         sl.set_number,
    //         sl.planned_reps as plannedReps,
    //         sl.weight
    //       FROM set_logs sl
    //       WHERE sl.exercise_log_id IN (${exerciseLogIds.map(() => '?').join(',')})
    //       ORDER BY sl.set_number
    //       `,
    //       exerciseLogIds
    //     );
    //   }
    // } catch (error) {
    //   console.error('[fetchWorkoutSessionWithLastSessionDate] ❌ Error fetching sets:', error);
    //   throw error;
    // }

    // Group sets by exercise, normalizing keys to numbers
    const setsByExercise = new Map<number, SetRow[]>();
    sets.forEach((set: SetRow) => {
      const exerciseLogId = Number(set.exercise_log_id);
      if (!setsByExercise.has(exerciseLogId)) {
        setsByExercise.set(exerciseLogId, []);
      }
      setsByExercise.get(exerciseLogId)!.push({
        ...set,
        plannedReps: set.plannedReps,
        exercise_log_id: exerciseLogId,
      });
    });

    // For each exercise, fetch last set weights for all its set numbers and lastSessionDate, plus previous session stats
    const hydratedExercises = await hydrateExercisesWithLastSessionDate(
      sessionId,
      exercises,
      sets,
    );

    return {
      workoutName: sessionInfo.workout_name,
      exercises: hydratedExercises as unknown as HydratedExercise[],
    };
  } catch (err) {
    console.error('[fetchWorkoutSessionWithLastSessionDate] ❌ Error:', err);
    throw err;
  }
}
export interface Workout {
  id: number;
  name: string;
  type: string;
  description?: string;
  exercises?: Array<{
    exerciseId?: number;
    exerciseName?: string;
    name?: string;
    sets: number;
    reps: number;
    weight?: number;
    image_url?: string;
    supersetId?: number | null;
    setsArray?: any[];
  }>;
  stats?: {
    timesPerformed: number;
    lastDate: string | null;
    avgDuration: number | null;
    totalTonnage: number | null;
  };
  tonnageProgression?: Array<{
    date: string;
    tonnage: number;
  }>;
  created_at?: string;
  updated_at?: string;
}

export async function fetchWorkoutDetails(
  workoutId: number,
): Promise<Workout | null> {
  // Get workout info
  const workout = await selectOne<{
    id: number;
    name: string;
    type: string;
    description?: string;
  }>('SELECT id, name, type, description FROM workouts WHERE id = ?', [
    workoutId,
  ]);

  if (!workout) return null;

  // Get exercises with full details for editing using the shared helper
  return {
    id: workout.id,
    name: workout.name,
    type: workout.type,
    description: workout.description,
  };
}

async function getSetsForExercise(exerciseLogIds: number[], sets: SetRow[]) {
  try {
    sets = await selectRaw<SetRow>(
      `
          SELECT
            sl.id,
            sl.exercise_log_id,
            sl.reps,
            sl.completed,
            sl.set_number,
            sl.round_number as roundNumber,
            sl.planned_reps as plannedReps,
            sl.planned_duration_seconds as plannedDurationSeconds,
            sl.duration_seconds as durationSeconds,
            sl.weight,
            sl.drop_sets as dropSets
          FROM ${TABLES.set_logs} sl
          WHERE sl.exercise_log_id IN (${exerciseLogIds
            .map(() => '?')
            .join(',')})
          ORDER BY sl.set_number
          `,
      exerciseLogIds,
    );
    return sets.map((set: any) => ({
      ...set,
      dropSets: parseJsonArray(set.dropSets),
    }));
  } catch (error) {
    console.error(
      '[fetchWorkoutSessionWithLastSessionDate] ❌ Error fetching sets:',
      error,
    );
    throw error;
  }
}

/**
 * Adds an exercise to a workout session (creates an exercise_log row)
 */
export async function addExerciseToSession(
  sessionId: number,
  exerciseId: number,
): Promise<void> {
  await insert(TABLES.exercise_logs, {
    workout_session_id: sessionId,
    exercise_id: exerciseId,
    planned_sets: 3,
    planned_reps: 10,
    weight: 0,
  });
}

/**
 * Removes an exercise from a workout session (deletes the exercise_log row by log id)
 */
export async function removeExerciseFromSession(
  exerciseLogId: number,
): Promise<void> {
  try {
    await executeRaw(`DELETE FROM ${TABLES.exercise_logs} WHERE id = ?`, [
      exerciseLogId,
    ]);
  } catch (error) {
    console.error('❌ Error removing exercise log:', error);
    throw error;
  }
}

/**
 * Reorders exercises in a workout session based on the provided order of exercise log IDs
 */
export async function reorderSessionExercises(
  sessionId: number,
  orderedExerciseLogIds: number[],
): Promise<void> {
  try {
    // Update the order of exercises by setting a new "order_index" field
    // This requires adding an "order_index" column to the exercise_logs table in a migration
    for (let i = 0; i < orderedExerciseLogIds.length; i++) {
      const exerciseLogId = orderedExerciseLogIds[i];
      await update(TABLES.exercise_logs, String(exerciseLogId), {
        order_index: i,
      });
    }
  } catch (error) {
    console.error('❌ Error reordering session exercises:', error);
    throw error;
  }
}

export async function saveSessionExerciseStructure(
  sessionId: number,
  exercises: SessionExerciseStructureInput[],
): Promise<void> {
  if (!sessionId) throw new Error('Invalid session ID');

  await executeRaw('BEGIN');
  try {
    for (let index = 0; index < exercises.length; index += 1) {
      const exercise = exercises[index];
      if (!exercise.exerciseLogId) continue;

      const groupType =
        exercise.groupType || (exercise.supersetId ? 'superset' : null);
      const blockType =
        exercise.blockType === 'circuit' ||
        exercise.blockType === 'superset' ||
        exercise.blockType === 'giant_set'
          ? exercise.blockType
          : null;
      const blockRounds = blockType
        ? Math.max(1, Math.round(Number(exercise.blockRounds) || 1))
        : null;
      const sets = Array.isArray(exercise.sets) ? exercise.sets : [];

      await executeRaw(
        `
        UPDATE ${TABLES.exercise_logs}
        SET
          order_index = ?,
          block_id = ?,
          block_type = ?,
          block_name = ?,
          block_rounds = ?,
          block_rest_between_rounds = ?,
          block_order = ?,
          planned_sets = ?,
          planned_reps = ?,
          weight = ?,
          rest_seconds = ?,
          superset_id = ?,
          group_id = ?,
          group_type = ?
        WHERE id = ? AND workout_session_id = ?
        `,
        [
          index,
          blockType ? exercise.blockId ?? null : null,
          blockType,
          blockType
            ? exercise.blockName ||
              (blockType === 'circuit' ? 'Circuit' : 'Superset')
            : null,
          blockRounds,
          blockType ? exercise.blockRestBetweenRounds ?? 60 : null,
          blockType ? exercise.blockOrder ?? index : null,
          blockType ? blockRounds : Math.max(1, sets.length || 1),
          Math.max(0, Math.round(Number(exercise.plannedReps) || 1)),
          exercise.weight ?? null,
          exercise.restSeconds ?? null,
          groupType === 'superset'
            ? exercise.groupId || exercise.supersetId || null
            : null,
          groupType ? exercise.groupId || exercise.supersetId || null : null,
          groupType,
          exercise.exerciseLogId,
          sessionId,
        ],
      );

      const existingSetIds = sets
        .map(set => set.id)
        .filter((id): id is number => typeof id === 'number' && id > 0);

      if (existingSetIds.length > 0) {
        await executeRaw(
          `
          DELETE FROM ${TABLES.set_logs}
          WHERE exercise_log_id = ?
            AND id NOT IN (${existingSetIds.map(() => '?').join(', ')})
          `,
          [exercise.exerciseLogId, ...existingSetIds],
        );
      } else {
        await executeRaw(
          `DELETE FROM ${TABLES.set_logs} WHERE exercise_log_id = ?`,
          [exercise.exerciseLogId],
        );
      }

      for (let setIndex = 0; setIndex < sets.length; setIndex += 1) {
        const set = sets[setIndex];
        const setNumber = getSetNumber(set, setIndex);
        const plannedReps = getSetPlannedReps(set, exercise.plannedReps);
        const roundNumber = blockType
          ? set.roundNumber ?? setNumber
          : set.roundNumber ?? null;
        const dropSets = JSON.stringify(
          normalizeDropSets(set.dropSets ?? set.drop_sets),
        );

        if (typeof set.id === 'number' && set.id > 0) {
          await executeRaw(
            `
            UPDATE ${TABLES.set_logs}
            SET
              set_number = ?,
              round_number = ?,
              planned_reps = ?,
              planned_duration_seconds = ?,
              duration_seconds = ?,
              reps = ?,
              weight = ?,
              completed = ?,
              drop_sets = ?
            WHERE id = ? AND exercise_log_id = ?
            `,
            [
              setNumber,
              roundNumber,
              plannedReps,
              set.plannedDurationSeconds ?? null,
              set.durationSeconds ?? null,
              set.reps ?? null,
              set.weight ?? exercise.weight ?? null,
              set.completed ? 1 : 0,
              dropSets,
              set.id,
              exercise.exerciseLogId,
            ],
          );
          continue;
        }

        await insert(TABLES.set_logs, {
          exercise_log_id: exercise.exerciseLogId,
          set_number: setNumber,
          round_number: roundNumber,
          planned_reps: plannedReps,
          planned_duration_seconds: set.plannedDurationSeconds ?? null,
          duration_seconds: set.durationSeconds ?? null,
          reps: set.reps ?? null,
          weight: set.weight ?? exercise.weight ?? null,
          completed: set.completed ? 1 : 0,
          drop_sets: dropSets,
        });
      }
    }

    await executeRaw('COMMIT');
  } catch (error) {
    await executeRaw('ROLLBACK');
    console.error('❌ Error saving session exercise structure:', error);
    throw error;
  }
}

/**
 * Updates the started_at date for a workout session
 * @param sessionId - The ID of the session to update
 * @param newDate - The new date (ISO string)
 */
export async function updateSessionDateQuery(
  sessionId: number,
  newDate: string,
  duration?: number,
): Promise<void> {
  try {
    const updateFields: any = { started_at: newDate };
    if (typeof duration === 'number') updateFields.duration = duration;
    await update(TABLES.workout_sessions, String(sessionId), updateFields);
  } catch (error) {
    console.error('❌ Error updating session date:', error);
    throw error;
  }
}

/**
 * Updates an exercise log (weight and planned reps) for a session
 * @param exerciseLogId - The ID of the exercise_log to update
 * @param weight - The new weight
 * @param plannedReps - The new planned reps
 */
export async function updateExerciseLog(
  exerciseLogId: number,
  weight?: number,
  plannedReps?: number,
): Promise<void> {
  try {
    const updateFields: any = {};
    if (typeof weight === 'number') updateFields.weight = weight;
    if (typeof plannedReps === 'number')
      updateFields.planned_reps = plannedReps;
    if (Object.keys(updateFields).length === 0) return;
    await update(TABLES.exercise_logs, exerciseLogId.toString(), updateFields);
  } catch (error) {
    console.error('❌ Error updating exercise log:', error);
    throw error;
  }
}

/**
 * Ends a workout session and applies progressive overload
 * @param sessionId - The ID of the session to end
 * @param progressiveOverload - Amount to increase weight (default: 2.5kg)
 * @param notes - Optional workout notes
 */
/**
 * Optionally accepts per-exercise overloads: { [exerciseId]: true/false }
 * If not provided, falls back to old logic (all or none)
 */
export async function endWorkoutSession(
  sessionId: number,
  notes?: string,
  finishedAt: string = new Date().toISOString(),
  duration?: number,
): Promise<void> {
  try {
    // Mark session as finished
    await update(TABLES.workout_sessions, String(sessionId), {
      finished_at: finishedAt,
      notes: notes || null,
      ...(typeof duration === 'number' ? { duration } : {}),
    });

    // Persist latest weights from this session to the workout template
    // 1. Get the workout_id for this session
    const session = await selectRawOne<{ workout_id: number }>(
      `SELECT workout_id FROM ${TABLES.workout_sessions} WHERE id = ?`,
      [sessionId],
    );
    if (!session) throw new Error('Session not found');
    const workoutId = session.workout_id;

    // 2. Get all exercise logs and their latest weights for this session
    const exerciseLogs = await selectRaw<{
      exercise_id: number;
      weight: number | null;
    }>(
      `SELECT exercise_id, weight FROM ${TABLES.exercise_logs} WHERE workout_session_id = ?`,
      [sessionId],
    );

    // 3. Update the workout_exercises template with the latest weights
    for (const log of exerciseLogs) {
      if (typeof log.weight === 'number') {
        await selectRaw(
          `UPDATE ${TABLES.workout_exercises} SET weight = ? WHERE workout_id = ? AND exercise_id = ?`,
          [log.weight, workoutId, log.exercise_id],
        );
      }
    }
  } catch (error) {
    console.error('❌ Error ending workout session:', error);
    throw error;
  }
}

/**
 * Adds a new set log
 * @param exerciseLogId - The exercise_log this set belongs to
 * @param setNumber - The set number (1-based)
 * @param plannedReps - The number of reps planned
 * @param weight - The weight used (optional)
 * @param completed - Whether the set is completed (0 or 1)
 * @returns The id of the new set_log row
 */
export async function addSetLog(
  exerciseLogId: number,
  { setNumber, plannedReps, weight, completed }: Set,
): Promise<number> {
  try {
    const newId = await insert(TABLES.set_logs, {
      exercise_log_id: exerciseLogId,
      set_number: setNumber,
      planned_reps: plannedReps,
      // reps: reps ?? null,
      weight: weight ?? null,
      completed,
    });
    // insert returns the new row id as a number
    return newId;
  } catch (error) {
    console.error('❌ Error adding set log:', error);
    throw error;
  }
}

/**
 * Updates a set log (planned reps and weight)
 * @param setId - The ID of the set log to update
 * @param planned_reps - The number of reps planned
 * @param weight - The weight used
 */
export async function updateSetLog(
  setId: number,
  plannedReps?: number,
  weight?: number,
): Promise<void> {
  try {
    const updateFields: any = {};
    if (typeof plannedReps === 'number') {
      updateFields.planned_reps = plannedReps;
      updateFields.reps = null; // Reset reps only if planned_reps is changed
    }
    if (typeof weight === 'number') {
      updateFields.weight = weight;
    }
    if (Object.keys(updateFields).length === 0) return;
    await update(TABLES.set_logs, setId.toString(), updateFields);
  } catch (error) {
    console.error('❌ Error updating set log:', error);
    throw error;
  }
}

/**
 * Deletes a set log by id
 * @param setId - The ID of the set_log to delete
 */
export async function deleteSetLog(setId: number): Promise<void> {
  try {
    await selectRaw(`DELETE FROM ${TABLES.set_logs} WHERE id = ?`, [setId]);
  } catch (error) {
    console.error('❌ Error deleting set log:', error);
    throw error;
  }
}

/**
 * Updates notes for an active workout session
 * @param sessionId - The ID of the session to update
 * @param notes - The notes to save
 */
export async function updateSessionNotes(
  sessionId: number,
  notes: string,
): Promise<void> {
  try {
    await update(TABLES.workout_sessions, String(sessionId), {
      notes: notes || null,
    });
  } catch (error) {
    console.error('❌ Error updating session notes:', error);
    throw error;
  }
}

/**
 * Checks if all sets and exercises in a session are completed
 * @param sessionId - The ID of the session to check
 * @returns Object with completion status and details
 */
export async function checkSessionCompletion(sessionId: number): Promise<{
  isComplete: boolean;
  totalSets: number;
  completedSets: number;
  totalExercises: number;
  exercisesWithCompletedSets: number;
}> {
  try {
    // Get total sets and completed sets
    const setStats = await selectRawOne<{ total: number; completed: number }>(
      `
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN reps IS NOT NULL THEN 1 ELSE 0 END) as completed
      FROM ${TABLES.set_logs}
      WHERE exercise_log_id IN (
        SELECT id FROM ${TABLES.exercise_logs} WHERE workout_session_id = ?
      )
      `,
      [sessionId],
    );

    // Get total exercises and exercises with at least one completed set
    const exerciseStats = await selectRawOne<{
      total_exercises: number;
      exercises_with_completed_sets: number;
    }>(
      `
      SELECT 
        COUNT(DISTINCT el.id) as total_exercises,
        COUNT(DISTINCT CASE WHEN sl.reps IS NOT NULL THEN el.id END) as exercises_with_completed_sets
      FROM ${TABLES.exercise_logs} el
      LEFT JOIN ${TABLES.set_logs} sl ON sl.exercise_log_id = el.id
      WHERE el.workout_session_id = ?
      `,
      [sessionId],
    );

    const totalSets = setStats?.total || 0;
    const completedSets = setStats?.completed || 0;
    const totalExercises = exerciseStats?.total_exercises || 0;
    const exercisesWithCompletedSets =
      exerciseStats?.exercises_with_completed_sets || 0;

    const isComplete = totalSets > 0 && totalSets === completedSets;

    return {
      isComplete,
      totalSets,
      completedSets,
      totalExercises,
      exercisesWithCompletedSets,
    };
  } catch (error) {
    console.error('❌ Error checking session completion:', error);
    throw error;
  }
}

/**
 * Deletes a specific workout session and its related data
 */
export async function deleteWorkoutSession(sessionId: number): Promise<void> {
  // Delete in correct order due to foreign key constraints
  await selectRaw(
    `DELETE FROM ${TABLES.set_logs} WHERE exercise_log_id IN (SELECT id FROM ${TABLES.exercise_logs} WHERE workout_session_id = ?)`,
    [sessionId],
  );
  await selectRaw(
    `DELETE FROM ${TABLES.exercise_logs} WHERE workout_session_id = ?`,
    [sessionId],
  );
  await selectRaw(`DELETE FROM ${TABLES.workout_sessions} WHERE id = ?`, [
    sessionId,
  ]);
}

/**
 * Deletes all workout sessions and related data
 */
export async function deleteAllWorkoutSessions(): Promise<void> {
  // Delete in correct order due to foreign key constraints
  await selectRaw(`DELETE FROM ${TABLES.set_logs}`);
  await selectRaw(`DELETE FROM ${TABLES.exercise_logs}`);
  await selectRaw(`DELETE FROM ${TABLES.workout_sessions}`);
}

export async function updateSetLogStatus(
  setId: number,
  reps: number | null,
  completed: 0 | 1,
): Promise<void> {
  await update('set_logs', setId.toString(), {
    reps,
    completed,
  });
}
