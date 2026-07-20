import {
  execute,
  insert,
  removeWhere,
  selectRaw,
  selectRawOne,
  tableHasColumn,
  updateWhere,
} from '../db';
import type {
  HydratedWorkoutSession,
  SetLogInput,
  WorkoutSession,
} from '../types';
import { persistPersonalRecordsForSession } from './personalRecords';

const parseTemplateSets = (value: string | null | undefined) => {
  if (!value) return [];
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

const parseJsonArray = (value: unknown) => {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
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

const buildDefaultSets = (exercise: any) => {
  const totalSets = Math.max(1, Math.round(Number(exercise.default_sets) || 1));
  return Array.from({ length: totalSets }, (_, index) => ({
    set_number: index + 1,
    planned_reps: exercise.default_reps || 1,
    planned_weight: exercise.weight ?? null,
    duration_seconds: null,
    drop_sets: [],
  }));
};

export async function getActiveWorkoutSession(workoutId?: number) {
  if (typeof workoutId === 'number') {
    return selectRawOne<WorkoutSession>(
      'SELECT * FROM workout_sessions WHERE workout_id = ? AND finished_at IS NULL ORDER BY started_at DESC LIMIT 1',
      [workoutId],
    );
  }

  return selectRawOne<WorkoutSession>(
    'SELECT * FROM workout_sessions WHERE finished_at IS NULL ORDER BY started_at DESC LIMIT 1',
  );
}

export async function createWorkoutSession(
  workoutId: number,
  startedAt = new Date().toISOString(),
) {
  return insert('workout_sessions', {
    workout_id: workoutId,
    started_at: startedAt,
    finished_at: null,
  });
}

export async function generateExerciseLogsAndSets(
  sessionId: number,
  workoutId: number,
) {
  const templateExercises = await selectRaw<any>(
    `
    SELECT
      we.*,
      COALESCE(e.id, we.exercise_id) as exercise_id,
      wb.type as block_type,
      wb.name as block_name,
      wb.rounds as block_rounds,
      wb.rest_between_rounds as block_rest_between_rounds,
      wb.order_index as block_order
    FROM workout_exercises we
    LEFT JOIN exercises e
      ON e.id = we.exercise_id
      OR e.seeded_id = CAST(we.exercise_id AS TEXT)
    LEFT JOIN workout_blocks wb ON wb.id = we.block_id
    WHERE we.workout_id = ?
    ORDER BY COALESCE(wb.order_index, we.order_index) ASC, we.order_index ASC
  `,
    [workoutId],
  );

  for (const exercise of templateExercises) {
    const exerciseLogId = await insert('exercise_logs', {
      workout_session_id: sessionId,
      block_id: exercise.block_id || null,
      block_type: exercise.block_type || null,
      block_name: exercise.block_name || null,
      block_rounds: exercise.block_rounds || null,
      block_rest_between_rounds: exercise.block_rest_between_rounds ?? null,
      block_order: exercise.block_order ?? null,
      exercise_id: exercise.exercise_id,
      planned_sets:
        exercise.block_type === 'circuit' ||
        exercise.block_type === 'superset' ||
        exercise.block_type === 'giant_set'
          ? exercise.block_rounds || 1
          : exercise.default_sets,
      planned_reps: exercise.default_reps,
      weight: exercise.weight,
      rest_seconds: exercise.rest_seconds ?? null,
      source: 'template',
      section: exercise.section || 'main',
      order_index: exercise.order_index,
      superset_id: exercise.superset_id || null,
      group_id: exercise.group_id || exercise.superset_id || null,
      group_type:
        exercise.group_type || (exercise.superset_id ? 'superset' : null),
    });

    const supportsWorkoutExerciseId = await tableHasColumn(
      'workout_exercise_sets',
      'workout_exercise_id',
    );
    const supportsDeleted = await tableHasColumn(
      'workout_exercise_sets',
      'deleted',
    );
    const deletedFilter = supportsDeleted ? 'AND COALESCE(deleted, 0) = 0' : '';
    let sets = supportsWorkoutExerciseId
      ? await selectRaw<any>(
          `
        SELECT *
        FROM workout_exercise_sets
        WHERE workout_exercise_id = ?
          ${deletedFilter}
        ORDER BY set_number ASC
      `,
          [exercise.id],
        )
      : await selectRaw<any>(
          `
        SELECT *
        FROM workout_exercise_sets
        WHERE workout_id = ?
          AND exercise_id = ?
          ${deletedFilter}
        ORDER BY set_number ASC
      `,
          [workoutId, exercise.exercise_id],
        );
    if (sets.length === 0 && supportsWorkoutExerciseId) {
      sets = await selectRaw<any>(
        `
        SELECT *
        FROM workout_exercise_sets
        WHERE workout_id = ?
          AND exercise_id = ?
          ${deletedFilter}
        ORDER BY set_number ASC
      `,
        [workoutId, exercise.exercise_id],
      );
    }

    const templateSets = parseTemplateSets(exercise.setsArray);
    const fallbackSets = sets.length
      ? sets
      : templateSets.length
      ? templateSets
      : buildDefaultSets(exercise);
    const sessionSets =
      exercise.block_type === 'circuit' ||
      exercise.block_type === 'superset' ||
      exercise.block_type === 'giant_set'
        ? Array.from(
            { length: Math.max(1, Math.round(exercise.block_rounds || 1)) },
            (_, index) => ({
              ...(fallbackSets[0] || {}),
              set_number: index + 1,
              round_number: index + 1,
            }),
          )
        : fallbackSets;

    for (let index = 0; index < sessionSets.length; index += 1) {
      const set = sessionSets[index];
      await insert('set_logs', {
        exercise_log_id: exerciseLogId,
        set_number: set.set_number || index + 1,
        round_number: set.round_number || null,
        planned_reps:
          set.planned_reps || set.plannedReps || exercise.default_reps || 1,
        planned_duration_seconds:
          set.duration_seconds ?? set.durationSeconds ?? null,
        duration_seconds: null,
        reps: null,
        weight:
          set.planned_weight ??
          set.plannedWeight ??
          set.weight ??
          exercise.weight ??
          null,
        completed: 0,
        drop_sets: JSON.stringify(
          createSessionDropSets(set.drop_sets || set.dropSets),
        ),
      });
    }
  }
}

export async function startWorkoutSession(workoutId: number) {
  const activeSession = await getActiveWorkoutSession(workoutId);
  if (activeSession) return activeSession.id;

  const sessionId = await createWorkoutSession(workoutId);
  await generateExerciseLogsAndSets(sessionId, workoutId);
  return sessionId;
}

export async function repairWorkoutSessionBlocks(sessionId: number) {
  const exerciseLogs = await selectRaw<any>(
    `
    SELECT id, block_id, block_type, block_rounds, planned_reps, weight
    FROM exercise_logs
    WHERE workout_session_id = ? AND block_id IS NOT NULL
    ORDER BY order_index ASC, id ASC
  `,
    [sessionId],
  );
  const blocks = new Map<number, any[]>();
  exerciseLogs.forEach(log => {
    if (
      log.block_type !== 'circuit' &&
      log.block_type !== 'superset' &&
      log.block_type !== 'giant_set'
    )
      return;
    const members = blocks.get(log.block_id) || [];
    members.push(log);
    blocks.set(log.block_id, members);
  });

  for (const members of blocks.values()) {
    if (members.length < 2) {
      for (const member of members) {
        await updateWhere(
          'exercise_logs',
          {
            block_id: null,
            block_type: null,
            block_name: null,
            block_rounds: null,
            block_rest_between_rounds: null,
            block_order: null,
            superset_id: null,
            group_id: null,
            group_type: null,
          },
          'id = ?',
          [member.id],
        );
      }
      continue;
    }

    const memberSets = new Map<number, any[]>();
    let targetUnits = Math.max(
      1,
      ...members.map(member => Number(member.block_rounds) || 1),
    );
    for (const member of members) {
      const sets = await selectRaw<any>(
        `
        SELECT * FROM set_logs WHERE exercise_log_id = ? ORDER BY set_number ASC
      `,
        [member.id],
      );
      memberSets.set(member.id, sets);
      targetUnits = Math.max(
        targetUnits,
        ...sets.map(set => Number(set.round_number || set.set_number) || 1),
      );
    }

    for (const member of members) {
      const sets = memberSets.get(member.id) || [];
      const template = sets[0];
      for (let unit = 1; unit <= targetUnits; unit += 1) {
        const exists = sets.some(
          set => Number(set.round_number || set.set_number) === unit,
        );
        if (exists) continue;
        await insert('set_logs', {
          exercise_log_id: member.id,
          set_number: unit,
          round_number: unit,
          planned_reps: template?.planned_reps || member.planned_reps || 1,
          planned_duration_seconds: template?.planned_duration_seconds ?? null,
          duration_seconds: null,
          reps: null,
          weight: template?.weight ?? member.weight ?? null,
          completed: 0,
          drop_sets: template?.drop_sets || '[]',
        });
      }
      if (Number(member.block_rounds) !== targetUnits) {
        await updateWhere(
          'exercise_logs',
          {
            block_rounds: targetUnits,
            planned_sets: targetUnits,
          },
          'id = ?',
          [member.id],
        );
      }
    }
  }
}

export async function getHydratedWorkoutSession(
  sessionId: number,
): Promise<HydratedWorkoutSession | null> {
  const session = await selectRawOne<WorkoutSession>(
    'SELECT * FROM workout_sessions WHERE id = ?',
    [sessionId],
  );
  if (!session) return null;

  await repairWorkoutSessionBlocks(sessionId);

  const workout = await selectRawOne<{
    name: string;
    description?: string | null;
  }>('SELECT name, description FROM workouts WHERE id = ?', [
    session.workout_id,
  ]);

  const exercises = await selectRaw<any>(
    `
    SELECT
      el.id as exerciseLogId,
      e.id as exerciseId,
      e.name,
      el.block_id as blockId,
      el.block_type as blockType,
      el.block_name as blockName,
      el.block_rounds as blockRounds,
      el.block_rest_between_rounds as blockRestBetweenRounds,
      el.block_order as blockOrder,
      el.planned_sets as plannedSets,
      el.planned_reps as plannedReps,
      el.weight,
      el.rest_seconds as restSeconds,
      el.section,
      el.order_index as orderIndex,
      el.superset_id as supersetId,
      el.group_id as groupId,
      el.group_type as groupType,
      e.category,
      e.image_url,
      e.image_key,
      e.primary_muscle as primaryMuscle,
      e.secondary_muscles as secondaryMuscles,
      e.equipment,
      e.exercise_type as exerciseType,
      e.difficulty,
      e.training_style as trainingStyle,
      e.progression_group as progressionGroup,
      e.progression_level as progressionLevel
    FROM exercise_logs el
    JOIN exercises e
      ON e.id = el.exercise_id
      OR e.seeded_id = CAST(el.exercise_id AS TEXT)
    WHERE el.workout_session_id = ?
    ORDER BY el.order_index ASC, el.id ASC
  `,
    [sessionId],
  );

  const hydrated = await Promise.all(
    exercises.map(async exercise => {
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
        [exercise.exerciseId, sessionId],
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
      const sets = await selectRaw<any>(
        `
      SELECT
        id,
        exercise_log_id,
        set_number,
        round_number as roundNumber,
        planned_reps as plannedReps,
        planned_duration_seconds as plannedDurationSeconds,
        duration_seconds as durationSeconds,
        reps,
        weight,
        completed,
        drop_sets as dropSets
      FROM set_logs
      WHERE exercise_log_id = ?
      ORDER BY set_number ASC
    `,
        [exercise.exerciseLogId],
      );

      return {
        ...exercise,
        sets: sets.map(set => ({
          ...set,
          dropSets: parseJsonArray(set.dropSets),
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
        })),
      };
    }),
  );

  return {
    session,
    workoutName: workout?.name || '',
    workoutDescription: workout?.description || null,
    exercises: hydrated,
  };
}

export const getWorkoutSession = getHydratedWorkoutSession;

export async function listWorkoutSessions(workoutId?: number) {
  if (typeof workoutId === 'number') {
    return selectRaw<WorkoutSession>(
      'SELECT * FROM workout_sessions WHERE workout_id = ? ORDER BY started_at DESC',
      [workoutId],
    );
  }

  return selectRaw<WorkoutSession>(
    'SELECT * FROM workout_sessions ORDER BY started_at DESC',
  );
}

export async function addSetLog(input: SetLogInput) {
  return insert('set_logs', {
    exercise_log_id: input.exercise_log_id,
    set_number: input.set_number,
    round_number: input.round_number ?? null,
    planned_reps: input.planned_reps || 1,
    planned_duration_seconds: input.planned_duration_seconds ?? null,
    duration_seconds: input.duration_seconds ?? null,
    reps: input.reps ?? null,
    weight: input.weight ?? null,
    completed: input.completed ?? 0,
    drop_sets: JSON.stringify(input.drop_sets || []),
  });
}

export async function addWorkoutSessionBlockUnit(
  sessionId: number,
  blockId: number,
) {
  const members = await selectRaw<any>(
    `
    SELECT id, planned_reps, weight
    FROM exercise_logs
    WHERE workout_session_id = ? AND block_id = ?
    ORDER BY order_index ASC, id ASC
  `,
    [sessionId, blockId],
  );
  if (members.length < 2)
    throw new Error('A block needs at least two exercises.');

  let nextUnit = 1;
  const setsByMember = new Map<number, any[]>();
  for (const member of members) {
    const sets = await selectRaw<any>(
      `
      SELECT * FROM set_logs WHERE exercise_log_id = ? ORDER BY set_number ASC
    `,
      [member.id],
    );
    setsByMember.set(member.id, sets);
    nextUnit = Math.max(
      nextUnit,
      ...sets.map(set => Number(set.round_number || set.set_number) + 1),
    );
  }

  await execute('BEGIN');
  try {
    for (const member of members) {
      const sets = setsByMember.get(member.id) || [];
      const source = sets[sets.length - 1] || sets[0];
      await insert('set_logs', {
        exercise_log_id: member.id,
        set_number: nextUnit,
        round_number: nextUnit,
        planned_reps: source?.planned_reps || member.planned_reps || 1,
        planned_duration_seconds: source?.planned_duration_seconds ?? null,
        duration_seconds: null,
        reps: null,
        weight: source?.weight ?? member.weight ?? null,
        completed: 0,
        drop_sets: source?.drop_sets || '[]',
      });
      await updateWhere(
        'exercise_logs',
        {
          block_rounds: nextUnit,
          planned_sets: nextUnit,
        },
        'id = ?',
        [member.id],
      );
    }
    await execute('COMMIT');
  } catch (error) {
    await execute('ROLLBACK');
    throw error;
  }

  return nextUnit;
}

export async function updateWorkoutSessionBlockRest(
  sessionId: number,
  blockId: number,
  seconds: number,
) {
  await updateWhere(
    'exercise_logs',
    {
      block_rest_between_rounds: Math.max(0, Math.round(seconds)),
    },
    'workout_session_id = ? AND block_id = ?',
    [sessionId, blockId],
  );
}

export async function convertWorkoutSessionBlockToStandalone(
  sessionId: number,
  blockId: number,
) {
  await updateWhere(
    'exercise_logs',
    {
      block_id: null,
      block_type: null,
      block_name: null,
      block_rounds: null,
      block_rest_between_rounds: null,
      block_order: null,
      superset_id: null,
      group_id: null,
      group_type: null,
    },
    'workout_session_id = ? AND block_id = ?',
    [sessionId, blockId],
  );
}

export async function updateSetLog(setId: number, input: Partial<SetLogInput>) {
  await updateWhere(
    'set_logs',
    {
      planned_reps: input.planned_reps,
      reps: input.reps,
      weight: input.weight,
      completed: input.completed,
      planned_duration_seconds: input.planned_duration_seconds,
      duration_seconds: input.duration_seconds,
      drop_sets: input.drop_sets ? JSON.stringify(input.drop_sets) : undefined,
      updated_at: new Date().toISOString(),
    },
    'id = ?',
    [setId],
  );
}

export async function deleteSetLog(setId: number) {
  await removeWhere('set_logs', 'id = ?', [setId]);
}

export async function setCompletedReps(setId: number, reps: number | null) {
  await updateWhere(
    'set_logs',
    {
      reps,
      completed: reps === null ? 0 : 1,
      updated_at: new Date().toISOString(),
    },
    'id = ?',
    [setId],
  );
}

export async function checkWorkoutSessionCompletion(sessionId: number) {
  const rows = await selectRaw<{
    completed: number;
    reps: number | null;
    drop_sets?: string | null;
  }>(
    `
    SELECT
      sl.completed,
      sl.reps,
      sl.drop_sets
    FROM set_logs sl
    JOIN exercise_logs el ON el.id = sl.exercise_log_id
    WHERE el.workout_session_id = ?
  `,
    [sessionId],
  );

  const totalSets = rows.reduce(
    (sum, row) => sum + 1 + parseJsonArray(row.drop_sets).length,
    0,
  );
  const completedSets = rows.reduce((sum, row) => {
    const completedDrops = parseJsonArray(row.drop_sets).filter(
      (drop: any) => drop.completed === 1 || typeof drop.reps === 'number',
    ).length;
    return (
      sum + (row.completed === 1 || row.reps !== null ? 1 : 0) + completedDrops
    );
  }, 0);

  return {
    totalSets,
    completedSets,
    isComplete: totalSets > 0 && completedSets >= totalSets,
  };
}

export async function endWorkoutSession(
  sessionId: number,
  notes?: string,
  finishedAt = new Date().toISOString(),
  duration?: number,
) {
  await updateWhere(
    'workout_sessions',
    {
      finished_at: finishedAt,
      notes: notes || null,
      duration,
      updated_at: new Date().toISOString(),
    },
    'id = ?',
    [sessionId],
  );

  const session = await selectRawOne<{ workout_id: number }>(
    'SELECT workout_id FROM workout_sessions WHERE id = ?',
    [sessionId],
  );

  if (!session) return [];

  const exerciseLogs = await selectRaw<{
    exercise_id: number;
    weight: number | null;
  }>(
    'SELECT exercise_id, weight FROM exercise_logs WHERE workout_session_id = ?',
    [sessionId],
  );

  for (const log of exerciseLogs) {
    if (typeof log.weight === 'number') {
      await updateWhere(
        'workout_exercises',
        { weight: log.weight, updated_at: new Date().toISOString() },
        'workout_id = ? AND exercise_id = ? AND COALESCE(deleted, 0) = 0',
        [session.workout_id, log.exercise_id],
      );
    }
  }

  return persistPersonalRecordsForSession(sessionId);
}

export async function deleteWorkoutSession(sessionId: number) {
  await removeWhere('personal_records', 'workout_session_id = ?', [sessionId]);
  await removeWhere(
    'set_logs',
    'exercise_log_id IN (SELECT id FROM exercise_logs WHERE workout_session_id = ?)',
    [sessionId],
  );
  await removeWhere('exercise_logs', 'workout_session_id = ?', [sessionId]);
  await removeWhere('workout_sessions', 'id = ?', [sessionId]);
}
