import { executeRaw, selectRaw, selectRawOne, updateWhere } from "../../../db-adapter";
import type { ProgressiveOverloadRecommendation, ProgressiveOverloadTemplateUpdate } from "../utils/progressiveOverloadCalculator";

export interface ProgressiveOverloadApplication {
  id: number;
  workout_session_id: number;
  workout_id: number;
  exercise_id: number;
  exercise_log_id: number | null;
  set_number: number;
  field: ProgressiveOverloadTemplateUpdate['field'];
  previous_value: number | null;
  new_value: number | null;
  recommendation_type: ProgressiveOverloadRecommendation['recommendationType'];
  reason_code: ProgressiveOverloadRecommendation['reasonCode'];
  drop_sets_snapshot: string | null;
  applied_at: string;
  created_at: string;
  updated_at: string;
}

export interface ProgressiveOverloadRecommendationSnapshot {
  id: number;
  workout_session_id: number;
  exercise_id: number;
  exercise_log_id: number;
  eligible: number;
  reason_code: ProgressiveOverloadRecommendation['reasonCode'];
  reason_label: string;
  recommendation_type: ProgressiveOverloadRecommendation['recommendationType'];
  current_value: number | null;
  recommended_value: number | null;
  increment: number;
  equipment_increment: number;
  is_bodyweight: number;
  is_timed: number;
  is_block_exercise: number;
  has_drop_sets: number;
  recommendation_json: string;
  created_at: string;
  updated_at: string;
}

interface ApplyProgressiveOverloadOptions {
  sessionId: number;
  overload?: number;
  perExerciseOverload?: { [exerciseId: number]: boolean };
  perExerciseIncrement?: { [exerciseId: number]: number };
  recommendations?: ProgressiveOverloadRecommendation[];
}

const getTemplateColumnForUpdate = (update: ProgressiveOverloadTemplateUpdate) => {
  if (update.field === 'planned_duration_seconds') return 'duration_seconds';
  if (update.field === 'planned_reps') return 'planned_reps';
  if (update.field === 'planned_weight') return 'planned_weight';
  return 'drop_sets';
};

export async function ensureProgressiveOverloadApplicationsTable() {
  await executeRaw(`
    CREATE TABLE IF NOT EXISTS progressive_overload_recommendation_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workout_session_id INTEGER NOT NULL,
      exercise_id INTEGER NOT NULL,
      exercise_log_id INTEGER NOT NULL,
      eligible INTEGER NOT NULL DEFAULT 0,
      reason_code TEXT NOT NULL,
      reason_label TEXT NOT NULL,
      recommendation_type TEXT NOT NULL,
      current_value REAL,
      recommended_value REAL,
      increment REAL NOT NULL DEFAULT 0,
      equipment_increment REAL NOT NULL DEFAULT 0,
      is_bodyweight INTEGER NOT NULL DEFAULT 0,
      is_timed INTEGER NOT NULL DEFAULT 0,
      is_block_exercise INTEGER NOT NULL DEFAULT 0,
      has_drop_sets INTEGER NOT NULL DEFAULT 0,
      recommendation_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(workout_session_id, exercise_id, exercise_log_id)
    );
  `);

  await executeRaw(`
    CREATE INDEX IF NOT EXISTS idx_progressive_overload_recommendation_snapshots_session
    ON progressive_overload_recommendation_snapshots(workout_session_id);
  `);

  await executeRaw(`
    CREATE TABLE IF NOT EXISTS progressive_overload_applications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workout_session_id INTEGER NOT NULL,
      workout_id INTEGER NOT NULL,
      exercise_id INTEGER NOT NULL,
      exercise_log_id INTEGER,
      set_number INTEGER NOT NULL,
      field TEXT NOT NULL,
      previous_value REAL,
      new_value REAL,
      recommendation_type TEXT NOT NULL,
      reason_code TEXT NOT NULL,
      drop_sets_snapshot TEXT,
      applied_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(workout_session_id, exercise_id, set_number, field)
    );
  `);

  await executeRaw(`
    CREATE INDEX IF NOT EXISTS idx_progressive_overload_applications_session
    ON progressive_overload_applications(workout_session_id);
  `);
}

const parseRecommendationSnapshot = (snapshot: ProgressiveOverloadRecommendationSnapshot): ProgressiveOverloadRecommendation | null => {
  try {
    return JSON.parse(snapshot.recommendation_json) as ProgressiveOverloadRecommendation;
  } catch {
    return {
      id: snapshot.exercise_log_id,
      exerciseLogId: snapshot.exercise_log_id,
      exerciseId: snapshot.exercise_id,
      exerciseName: `Exercise #${snapshot.exercise_id}`,
      eligible: Boolean(snapshot.eligible),
      reasonCode: snapshot.reason_code,
      reasonLabel: snapshot.reason_label,
      recommendationType: snapshot.recommendation_type,
      currentValue: snapshot.current_value,
      recommendedValue: snapshot.recommended_value,
      increment: snapshot.increment,
      equipmentIncrement: snapshot.equipment_increment,
      isBodyweight: Boolean(snapshot.is_bodyweight),
      isTimed: Boolean(snapshot.is_timed),
      isBlockExercise: Boolean(snapshot.is_block_exercise),
      hasDropSets: Boolean(snapshot.has_drop_sets),
      templateUpdates: [],
    };
  }
};

export async function saveProgressiveOverloadRecommendationSnapshots(
  sessionId: number,
  recommendations: ProgressiveOverloadRecommendation[],
) {
  if (!Number.isFinite(sessionId) || !recommendations.length) return;
  await ensureProgressiveOverloadApplicationsTable();

  for (const recommendation of recommendations) {
    await executeRaw(
      `
      INSERT OR REPLACE INTO progressive_overload_recommendation_snapshots (
        workout_session_id,
        exercise_id,
        exercise_log_id,
        eligible,
        reason_code,
        reason_label,
        recommendation_type,
        current_value,
        recommended_value,
        increment,
        equipment_increment,
        is_bodyweight,
        is_timed,
        is_block_exercise,
        has_drop_sets,
        recommendation_json,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `,
      [
        sessionId,
        recommendation.exerciseId,
        recommendation.exerciseLogId,
        recommendation.eligible ? 1 : 0,
        recommendation.reasonCode,
        recommendation.reasonLabel,
        recommendation.recommendationType,
        recommendation.currentValue,
        recommendation.recommendedValue,
        recommendation.increment,
        recommendation.equipmentIncrement,
        recommendation.isBodyweight ? 1 : 0,
        recommendation.isTimed ? 1 : 0,
        recommendation.isBlockExercise ? 1 : 0,
        recommendation.hasDropSets ? 1 : 0,
        JSON.stringify(recommendation),
      ]
    );
  }
}

export async function getProgressiveOverloadRecommendationSnapshotsForSession(sessionId: number) {
  await ensureProgressiveOverloadApplicationsTable();
  const rows = await selectRaw<ProgressiveOverloadRecommendationSnapshot>(
    `
    SELECT *
    FROM progressive_overload_recommendation_snapshots
    WHERE workout_session_id = ?
    ORDER BY exercise_id ASC, exercise_log_id ASC
    `,
    [sessionId]
  );

  return rows
    .map(parseRecommendationSnapshot)
    .filter((recommendation): recommendation is ProgressiveOverloadRecommendation => Boolean(recommendation));
}

export async function getProgressiveOverloadApplicationsForSession(sessionId: number) {
  await ensureProgressiveOverloadApplicationsTable();
  return selectRaw<ProgressiveOverloadApplication>(
    `
    SELECT *
    FROM progressive_overload_applications
    WHERE workout_session_id = ?
    ORDER BY exercise_id ASC, set_number ASC, field ASC
    `,
    [sessionId]
  );
}

export async function getStaleProgressiveOverloadExerciseIdsForSession(sessionId: number, exerciseIds: number[]) {
  const uniqueExerciseIds = Array.from(new Set(exerciseIds.filter(Number.isFinite)));
  if (!uniqueExerciseIds.length) return [];

  const currentSession = await selectRawOne<{ id: number; started_at: string | null }>(
    `SELECT id, started_at FROM workout_sessions WHERE id = ?`,
    [sessionId]
  );
  if (!currentSession?.started_at) return [];

  const placeholders = uniqueExerciseIds.map(() => '?').join(',');
  const rows = await selectRaw<{ exercise_id: number }>(
    `
    SELECT DISTINCT el.exercise_id
    FROM exercise_logs el
    JOIN workout_sessions ws ON ws.id = el.workout_session_id
    WHERE el.exercise_id IN (${placeholders})
      AND ws.finished_at IS NOT NULL
      AND ws.id != ?
      AND (
        datetime(ws.started_at) > datetime(?)
        OR (ws.started_at = ? AND ws.id > ?)
      )
    `,
    [
      ...uniqueExerciseIds,
      sessionId,
      currentSession.started_at,
      currentSession.started_at,
      sessionId,
    ]
  );

  return rows.map(row => row.exercise_id);
}

const getTemplateValueForColumn = (
  row: { planned_weight: number | null; planned_reps: number | null; duration_seconds: number | null } | null,
  column: string,
) => {
  if (!row) return null;
  if (column === 'planned_weight') return row.planned_weight ?? null;
  if (column === 'planned_reps') return row.planned_reps ?? null;
  if (column === 'duration_seconds') return row.duration_seconds ?? null;
  return null;
};

async function applyRecommendationTemplateUpdates(
  sessionId: number,
  workoutId: number,
  recommendations: ProgressiveOverloadRecommendation[],
) {
  await ensureProgressiveOverloadApplicationsTable();

  for (const recommendation of recommendations) {
    if (!recommendation.eligible) continue;
    for (const update of recommendation.templateUpdates) {
      const column = getTemplateColumnForUpdate(update);
      const value = column === 'drop_sets'
        ? JSON.stringify(update.dropSets || [])
        : update.recommendedValue;

      if (value === undefined) continue;

      const existingTemplateSet = await selectRawOne<{
        planned_weight: number | null;
        planned_reps: number | null;
        duration_seconds: number | null;
      }>(
        `
        SELECT planned_weight, planned_reps, duration_seconds
        FROM workout_exercise_sets
        WHERE workout_id = ? AND exercise_id = ? AND set_number = ?
        `,
        [workoutId, update.exerciseId, update.setNumber]
      );

      await updateWhere(
        'workout_exercise_sets',
        { [column]: value, updated_at: new Date().toISOString() },
        `workout_id = ? AND exercise_id = ? AND set_number = ?`,
        [workoutId, update.exerciseId, update.setNumber]
      );

      if (update.dropSets?.length && update.field === 'planned_weight') {
        await updateWhere(
          'workout_exercise_sets',
          { drop_sets: JSON.stringify(update.dropSets), updated_at: new Date().toISOString() },
          `workout_id = ? AND exercise_id = ? AND set_number = ?`,
          [workoutId, update.exerciseId, update.setNumber]
        );
      }

      await executeRaw(
        `
        INSERT OR REPLACE INTO progressive_overload_applications (
          workout_session_id,
          workout_id,
          exercise_id,
          exercise_log_id,
          set_number,
          field,
          previous_value,
          new_value,
          recommendation_type,
          reason_code,
          drop_sets_snapshot,
          applied_at,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), datetime('now'))
        `,
        [
          sessionId,
          workoutId,
          update.exerciseId,
          update.exerciseLogId ?? recommendation.exerciseLogId ?? null,
          update.setNumber,
          update.field,
          update.field === 'drop_sets' ? null : getTemplateValueForColumn(existingTemplateSet, column),
          update.field === 'drop_sets' ? null : update.recommendedValue ?? null,
          recommendation.recommendationType,
          recommendation.reasonCode,
          update.dropSets?.length ? JSON.stringify(update.dropSets) : null,
        ]
      );
    }
  }
}

/**
 * Updates planned weights for all sets of an exercise log
 * @param setLogs - Array of set logs with performed weights
 * @param applyOverload - Whether to apply overload or just copy performed weight
 * @param overloadValue - The amount to increase the planned weight by if applying overload
 * @param workoutId - The ID of the workout
 * @param exerciseId - The ID of the exercise
 */
export async function updatePlannedWeightsForExerciseSets(
  setLogs: Array<{ id: number; set_number: number; weight: number | null }>,
  applyOverload: boolean,
  overloadValue: number,
  workoutId: number,
  exerciseId: number
) {
  if (!applyOverload) return;
  for (const set of setLogs) {
    const performedWeight = set.weight || 0;
    const newPlannedWeight = performedWeight + overloadValue;
    await updateWhere(
      'workout_exercise_sets',
      { planned_weight: newPlannedWeight },
      `workout_id = ? AND exercise_id = ? AND set_number = ?`,
      [workoutId, exerciseId, set.set_number]
    );
  }
}

/**
 * Determines if overload should be applied and the value for a given exercise
 * @param exerciseId - The ID of the exercise
 * @param options - The overload options provided to the main function
 * @returns An object indicating whether to apply overload and the overload value
 */
export function getOverloadDecision(
  exerciseId: number,
  options: ApplyProgressiveOverloadOptions
): { applyOverload: boolean; overloadValue: number } {
  let applyOverload = false;
  let overloadValue = 0;
  // Priority: perExerciseIncrement > perExerciseOverload+overload > overload
  if (options.perExerciseIncrement && options.perExerciseIncrement[exerciseId] !== undefined) {
    overloadValue = options.perExerciseIncrement[exerciseId] || 0;
    applyOverload = overloadValue !== 0;
  } else if (options.perExerciseOverload) {
    applyOverload = !!options.perExerciseOverload[exerciseId];
    overloadValue = applyOverload ? (typeof options.overload === 'number' ? options.overload : 2.5) : 0;
  } else {
    applyOverload = typeof options.overload === 'number' ? true : false;
    overloadValue = typeof options.overload === 'number' ? options.overload : 2.5;
  }
  return { applyOverload, overloadValue };
}

/**
 * Applies progressive overload to exercises in a workout session
 * @param sessionId - The ID of the session
 * @param progressiveOverload - Amount to increase weight (default: 2.5kg) or per-exercise map
 * @param perExerciseOverload - Optional boolean map for which exercises to apply overload
 */
export async function applyProgressiveOverload(options: ApplyProgressiveOverloadOptions): Promise<void> {
  try {
    // 1- Get the workout_id from the session
    const session = await selectRawOne<{ workout_id: number }>(
      `SELECT workout_id FROM workout_sessions WHERE id = ?`,
      [options.sessionId]
    );
    if (!session)  throw new Error('Session not found');
    
    // Extract workoutId for later use
    const workoutId = session.workout_id;

    if (options.recommendations?.length) {
      await applyRecommendationTemplateUpdates(options.sessionId, workoutId, options.recommendations);
      return;
    }

    // 2- Get all exercise logs for this session
    const exerciseLogs = await selectRaw<{ id: number; exercise_id: number }>(
      `SELECT id, exercise_id FROM exercise_logs WHERE workout_session_id = ?`,
      [options.sessionId]
    );

    // 3- For each exercise log, get the performed weight for each set and update planned weights
    for (const log of exerciseLogs) {
      // 3a - Get all set_logs for this exercise_log
      const setLogs = await selectRaw<{ id: number; set_number: number; weight: number | null }>(
        `SELECT id, set_number, weight FROM set_logs WHERE exercise_log_id = ? ORDER BY set_number`,
        [log.id]
      );

      // 3b - Use helper to determine overload
      const { applyOverload, overloadValue } = getOverloadDecision(log.exercise_id, options);

      // 3c - Update planned weights for all sets of this exercise
      await updatePlannedWeightsForExerciseSets(
        setLogs,
        applyOverload,
        overloadValue,
        workoutId,
        log.exercise_id
      );
    }
  } catch (error) {
    console.error('❌ Error applying per-set progressive overload:', error);
    throw error;
  }
}

/**
 * Increases the planned weight for a specific set of an exercise in a workout by a given increment
 * @param workoutId - The ID of the workout
 * @param exerciseId - The ID of the exercise
 * @param setNumber - The set number to update
 * @param increment - The amount to increase the planned weight by (e.g., 2.5 for 2.5kg)
 */
export async function increaseWorkoutExerciseSetPlannedWeight(
  workoutId: number,
  exerciseId: number,
  setNumber: number,
  increment: number
): Promise<void> {
  try {
    await executeRaw(
      `UPDATE workout_exercise_sets 
       SET planned_weight = COALESCE(planned_weight, 0) + ?
       WHERE workout_id = ? AND exercise_id = ? AND set_number = ?`,
      [increment, workoutId, exerciseId, setNumber]
    );
  } catch (error) {
    console.error('❌ Error increasing planned weight for workout exercise set:', error);
    throw error;
  }
}



/***********************
 * USAGE EXAMPLES
 ***********************/

// Example 1: Apply a flat 2.5kg overload to all exercises in a session
// await applyProgressiveOverload(123);

// Example 2: Apply a 5kg overload only to exercise ID 10 in the session
// await applyProgressiveOverload(123, { 10: 5 });

// Example 3: Use a boolean map to apply a 2.5kg overload to specific exercises
// await applyProgressiveOverload(123, undefined, { 10: true, 12: true });

// Example 4: Increase planned weight for set 2 of exercise ID 10 in workout ID 5 by 2.5kg
// await increaseWorkoutExerciseSetPlannedWeight(5, 10, 2, 2.5);

// Example 5: Increase planned weight for set 1 of exercise ID 15 in workout ID 5 by 1.25kg
// await increaseWorkoutExerciseSetPlannedWeight(5, 15, 1, 1.25);

// Example 6: Apply a 3kg overload to all exercises in a session
// await applyProgressiveOverload(123, 3);

// Example 7: Apply a 0.5kg overload only to exercise ID 20 in the session
// await applyProgressiveOverload(123, { 20: 0.5 });

// Example 8: Use a boolean map to apply a 1.25kg overload to specific exercises
// await applyProgressiveOverload(123, undefined, { 10: true, 15: true, 20: true });
