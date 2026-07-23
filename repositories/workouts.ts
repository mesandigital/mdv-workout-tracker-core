import {
  execute,
  insert,
  removeWhere,
  selectRaw,
  selectRawOne,
  updateWhere,
} from '../db';
import type {
  WorkoutBlockType,
  WorkoutTemplate,
  WorkoutTemplateExerciseInput,
  WorkoutTemplateExerciseSetInput,
  WorkoutTemplateInput,
} from '../types';
import { normalizeExerciseType, normalizePlannedWeight } from '../utils';

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

const normalizeSets = (
  exercise: WorkoutTemplateExerciseInput,
): WorkoutTemplateExerciseSetInput[] => {
  const exerciseType = normalizeExerciseType(exercise.exercise_type);
  if (exercise.sets?.length) {
    return exercise.sets.map((set, index) => ({
      set_number: set.set_number || index + 1,
      planned_reps: set.planned_reps || exercise.default_reps || 1,
      planned_weight: normalizePlannedWeight(
        exerciseType,
        set.planned_weight ?? exercise.weight ?? null,
      ),
      duration_seconds: set.duration_seconds ?? null,
      drop_sets: Array.isArray(set.drop_sets) ? set.drop_sets : [],
    }));
  }

  const totalSets = Math.max(1, exercise.default_sets || 1);
  return Array.from({ length: totalSets }, (_, index) => ({
    set_number: index + 1,
    planned_reps: exercise.default_reps || 1,
    planned_weight: normalizePlannedWeight(
      exerciseType,
      exercise.weight ?? null,
    ),
    duration_seconds: null,
    drop_sets: [],
  }));
};

const getExerciseTypeForExerciseId = async (exerciseId: number) => {
  const exercise = await selectRawOne<{ exercise_type?: string | null }>(
    `
    SELECT exercise_type
    FROM exercises
    WHERE id = ? OR seeded_id = CAST(? AS TEXT)
    LIMIT 1
  `,
    [exerciseId, exerciseId],
  );
  return normalizeExerciseType(exercise?.exercise_type);
};

const normalizeBlockType = (
  exercise: WorkoutTemplateExerciseInput,
): WorkoutBlockType | null => {
  const blockType =
    exercise.block_type ||
    (exercise.group_type === 'circuit' || exercise.group_type === 'superset'
      ? exercise.group_type
      : null);
  if (
    blockType === 'straight_sets' ||
    blockType === 'circuit' ||
    blockType === 'superset' ||
    blockType === 'giant_set' ||
    blockType === 'interval'
  ) {
    return blockType;
  }
  return null;
};

const isRoundBasedBlock = (blockType: WorkoutBlockType | null) =>
  blockType === 'circuit' ||
  blockType === 'superset' ||
  blockType === 'giant_set';

async function ensureWorkoutBlock(
  workoutId: number,
  exercise: WorkoutTemplateExerciseInput,
  index: number,
  blockIds: Map<string, number>,
) {
  const blockType = normalizeBlockType(exercise);
  if (!blockType) return null;

  const sourceGroupId =
    exercise.group_id || exercise.superset_id || exercise.block_id || index + 1;
  const key = `${blockType}:${sourceGroupId}`;
  const existing = blockIds.get(key);
  if (existing) return existing;

  const blockId = await insert('workout_blocks', {
    workout_id: workoutId,
    type: blockType,
    name:
      exercise.block_name ||
      (blockType === 'circuit'
        ? 'Circuit'
        : blockType === 'superset'
        ? 'Superset'
        : null),
    rounds: isRoundBasedBlock(blockType)
      ? Math.max(
          1,
          Math.round(exercise.block_rounds || exercise.default_sets || 1),
        )
      : null,
    rest_between_rounds: exercise.block_rest_between_rounds ?? null,
    order_index: exercise.block_order ?? exercise.order_index ?? index,
  });
  blockIds.set(key, blockId);
  return blockId;
}

async function insertWorkoutExercise(
  workoutId: number,
  exercise: WorkoutTemplateExerciseInput,
  index: number,
  blockIds: Map<string, number>,
  createdAt?: string | null,
) {
  const exerciseType =
    exercise.exercise_type ||
    (await getExerciseTypeForExerciseId(exercise.exercise_id));
  const normalizedExercise = {
    ...exercise,
    exercise_type: exerciseType,
    weight: normalizePlannedWeight(exerciseType, exercise.weight ?? null),
  };
  const sets = normalizeSets(normalizedExercise);
  const groupType =
    exercise.group_type || (exercise.superset_id ? 'superset' : null);
  const groupId = exercise.group_id || exercise.superset_id || null;
  const blockId = await ensureWorkoutBlock(
    workoutId,
    exercise,
    index,
    blockIds,
  );
  const blockType = normalizeBlockType(exercise);
  const effectiveSets = isRoundBasedBlock(blockType)
    ? [
        {
          set_number: 1,
          planned_reps:
            normalizedExercise.default_reps || sets[0]?.planned_reps || 1,
          planned_weight: normalizePlannedWeight(
            exerciseType,
            normalizedExercise.weight ?? sets[0]?.planned_weight ?? null,
          ),
          duration_seconds: sets[0]?.duration_seconds ?? null,
          drop_sets: [],
        },
      ]
    : sets;

  const workoutExerciseId = await insert('workout_exercises', {
    workout_id: workoutId,
    block_id: blockId,
    exercise_id: normalizedExercise.exercise_id,
    order_index: normalizedExercise.order_index ?? index,
    default_sets: isRoundBasedBlock(blockType) ? 1 : effectiveSets.length,
    default_reps:
      normalizedExercise.default_reps || effectiveSets[0]?.planned_reps || 1,
    weight: normalizePlannedWeight(
      exerciseType,
      normalizedExercise.weight ?? effectiveSets[0]?.planned_weight ?? null,
    ),
    rest_seconds: normalizedExercise.rest_seconds ?? null,
    section: normalizedExercise.section || 'main',
    superset_id: groupType === 'superset' ? groupId : null,
    group_id: groupId,
    group_type: groupType,
    setsArray: JSON.stringify(effectiveSets),
    created_at: createdAt || undefined,
    updated_at: new Date().toISOString(),
  });

  for (const set of effectiveSets) {
    await insert('workout_exercise_sets', {
      workout_id: workoutId,
      workout_exercise_id: workoutExerciseId,
      exercise_id: normalizedExercise.exercise_id,
      set_number: set.set_number,
      planned_reps: set.planned_reps,
      planned_weight: set.planned_weight ?? null,
      duration_seconds: set.duration_seconds ?? null,
      drop_sets: JSON.stringify(set.drop_sets || []),
      created_at: createdAt || undefined,
      updated_at: new Date().toISOString(),
    });
  }
}

export async function createWorkoutTemplate(input: WorkoutTemplateInput) {
  const workoutId = await insert('workouts', {
    name: input.name,
    type: input.type || null,
    section: input.section || null,
    description: input.description || null,
    difficulty: input.difficulty || null,
    training_style: input.training_style || null,
    created_at: new Date().toISOString(),
  });

  const blockIds = new Map<string, number>();
  for (let index = 0; index < input.exercises.length; index += 1) {
    await insertWorkoutExercise(
      workoutId,
      input.exercises[index],
      index,
      blockIds,
    );
  }

  return workoutId;
}

export async function updateWorkoutTemplate(
  id: number,
  input: WorkoutTemplateInput,
) {
  const existingLinks = await selectRaw<{
    workoutExerciseId: number;
    exercise_id: number;
    exerciseName: string;
    orderIndex: number;
    defaultSets: number;
    defaultReps: number;
    weight: number | null;
    created_at?: string | null;
  }>(
    `
    SELECT
      we.id as workoutExerciseId,
      we.exercise_id as exercise_id,
      COALESCE(e.name, 'Exercise') as exerciseName,
      we.order_index as orderIndex,
      we.default_sets as defaultSets,
      we.default_reps as defaultReps,
      we.weight as weight,
      we.created_at as created_at
    FROM workout_exercises we
    LEFT JOIN exercises e
      ON e.id = we.exercise_id
      OR e.seeded_id = CAST(we.exercise_id AS TEXT)
    WHERE we.workout_id = ? AND COALESCE(we.deleted, 0) = 0
    ORDER BY we.order_index ASC, we.id ASC
  `,
    [id],
  );
  const existingByExercise = new Map<
    number,
    Array<{
      workoutExerciseId: number;
      exerciseId: number;
      exerciseName: string;
      orderIndex: number;
      defaultSets: number;
      defaultReps: number;
      weight: number | null;
      createdAt: string | null | undefined;
    }>
  >();
  existingLinks.forEach(link => {
    const bucket = existingByExercise.get(link.exercise_id) || [];
    bucket.push({
      workoutExerciseId: link.workoutExerciseId,
      exerciseId: link.exercise_id,
      exerciseName: link.exerciseName,
      orderIndex: link.orderIndex,
      defaultSets: link.defaultSets,
      defaultReps: link.defaultReps,
      weight: link.weight,
      createdAt: link.created_at,
    });
    existingByExercise.set(link.exercise_id, bucket);
  });
  const addedExercises: Array<{
    exercise: WorkoutTemplateExerciseInput;
    orderIndex: number;
  }> = [];

  await updateWhere(
    'workouts',
    {
      name: input.name,
      type: input.type || null,
      section: input.section || null,
      description: input.description || null,
      difficulty: input.difficulty || null,
      training_style: input.training_style || null,
      updated_at: new Date().toISOString(),
    },
    'id = ?',
    [id],
  );

  await removeWhere('workout_exercise_sets', 'workout_id = ?', [id]);
  await removeWhere('workout_exercises', 'workout_id = ?', [id]);
  await removeWhere('workout_blocks', 'workout_id = ?', [id]);

  const blockIds = new Map<string, number>();
  for (let index = 0; index < input.exercises.length; index += 1) {
    const exercise = input.exercises[index];
    const bucket = existingByExercise.get(exercise.exercise_id);
    const retained = bucket?.shift();
    const createdAt = retained?.createdAt;
    if (!retained) {
      addedExercises.push({
        exercise,
        orderIndex: exercise.order_index ?? index,
      });
    }
    await insertWorkoutExercise(id, exercise, index, blockIds, createdAt);
  }

  const removedExercises = Array.from(existingByExercise.values()).flat();
  const eventAt = new Date().toISOString();

  for (const exercise of addedExercises) {
    await recordWorkoutTemplateHistoryEvent({
      workoutId: id,
      exerciseId: exercise.exercise.exercise_id,
      exerciseName: null,
      action: 'added',
      source: 'template_edit',
      orderIndex: exercise.orderIndex,
      defaultSets: exercise.exercise.default_sets ?? null,
      defaultReps: exercise.exercise.default_reps ?? null,
      weight: exercise.exercise.weight ?? null,
      eventAt,
    });
  }

  for (const exercise of removedExercises) {
    await recordWorkoutTemplateHistoryEvent({
      workoutId: id,
      workoutExerciseId: exercise.workoutExerciseId,
      exerciseId: exercise.exerciseId,
      exerciseName: exercise.exerciseName,
      action: 'removed',
      source: 'template_edit',
      orderIndex: exercise.orderIndex,
      defaultSets: exercise.defaultSets,
      defaultReps: exercise.defaultReps,
      weight: exercise.weight,
      eventAt,
    });
  }
}

export type WorkoutTemplateExerciseHistoryItem = {
  id: number;
  workoutId: number;
  workoutSessionId: number | null;
  workoutExerciseId: number | null;
  exerciseId: number;
  exerciseName: string;
  action: 'added' | 'removed';
  source: string;
  orderIndex: number | null;
  defaultSets: number | null;
  defaultReps: number | null;
  weight: number | null;
  addedAt: string;
  updatedAt: string;
  startedAt?: string | null;
  finishedAt?: string | null;
};

export type SessionAddedExerciseSuggestion = {
  sessionId: number;
  exerciseLogId: number;
  exerciseId: number;
  exerciseName: string;
  startedAt: string;
  finishedAt: string | null;
  plannedSets: number | null;
  plannedReps: number | null;
  weight: number | null;
};

export type WorkoutTemplateProgressiveOverloadHistoryChange = {
  exerciseId: number;
  exerciseName: string;
  exerciseLogId: number | null;
  setNumber: number;
  field: string;
  previousValue: number | null;
  newValue: number | null;
  recommendationType: string;
  reasonCode: string;
};

export type WorkoutTemplateProgressiveOverloadHistoryEvent = {
  workoutId: number;
  sessionId: number;
  appliedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  changeCount: number;
  exerciseCount: number;
  changes: WorkoutTemplateProgressiveOverloadHistoryChange[];
};

type WorkoutTemplateHistoryEventInput = {
  workoutId: number;
  workoutSessionId?: number | null;
  workoutExerciseId?: number | null;
  exerciseId: number;
  exerciseName?: string | null;
  action: 'added' | 'removed';
  source?: string | null;
  orderIndex?: number | null;
  defaultSets?: number | null;
  defaultReps?: number | null;
  weight?: number | null;
  notes?: string | null;
  eventAt?: string;
};

async function ensureWorkoutTemplateHistoryTable() {
  await execute(`
    CREATE TABLE IF NOT EXISTS workout_template_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workout_id INTEGER NOT NULL,
      workout_session_id INTEGER,
      workout_exercise_id INTEGER,
      exercise_id INTEGER NOT NULL,
      exercise_name_snapshot TEXT,
      action TEXT NOT NULL CHECK(action IN ('added', 'removed')),
      source TEXT NOT NULL DEFAULT 'template_edit',
      order_index INTEGER,
      default_sets INTEGER,
      default_reps INTEGER,
      weight REAL,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(workout_id) REFERENCES workouts(id) ON DELETE CASCADE,
      FOREIGN KEY(workout_session_id) REFERENCES workout_sessions(id) ON DELETE SET NULL,
      FOREIGN KEY(workout_exercise_id) REFERENCES workout_exercises(id) ON DELETE SET NULL,
      FOREIGN KEY(exercise_id) REFERENCES exercises(id) ON DELETE CASCADE
    )
  `);
  await execute(`
    CREATE INDEX IF NOT EXISTS idx_workout_template_history_workout
    ON workout_template_history(workout_id, created_at DESC)
  `);
  await execute(`
    CREATE INDEX IF NOT EXISTS idx_workout_template_history_session
    ON workout_template_history(workout_session_id)
  `);
}

async function recordWorkoutTemplateHistoryEvent(
  event: WorkoutTemplateHistoryEventInput,
) {
  await ensureWorkoutTemplateHistoryTable();
  const timestamp = event.eventAt || new Date().toISOString();
  await insert('workout_template_history', {
    workout_id: event.workoutId,
    workout_session_id: event.workoutSessionId ?? null,
    workout_exercise_id: event.workoutExerciseId ?? null,
    exercise_id: event.exerciseId,
    exercise_name_snapshot: event.exerciseName ?? null,
    action: event.action,
    source: event.source ?? 'template_edit',
    order_index: event.orderIndex ?? null,
    default_sets: event.defaultSets ?? null,
    default_reps: event.defaultReps ?? null,
    weight: event.weight ?? null,
    notes: event.notes ?? null,
    created_at: timestamp,
    updated_at: timestamp,
  });
}

async function seedLegacyWorkoutTemplateHistory(workoutId: number) {
  await ensureWorkoutTemplateHistoryTable();

  const existingHistory = await selectRawOne<{ count: number }>(
    `
    SELECT COUNT(*) as count
    FROM workout_template_history
    WHERE workout_id = ?
  `,
    [workoutId],
  );

  if (Number(existingHistory?.count || 0) > 0) return;

  const legacyRows = await selectRaw<{
    workoutExerciseId: number;
    exerciseId: number;
    exerciseName: string | null;
    orderIndex: number | null;
    defaultSets: number | null;
    defaultReps: number | null;
    weight: number | null;
    createdAt: string | null;
    updatedAt: string | null;
  }>(
    `
    SELECT
      we.id as workoutExerciseId,
      we.exercise_id as exerciseId,
      e.name as exerciseName,
      we.order_index as orderIndex,
      we.default_sets as defaultSets,
      we.default_reps as defaultReps,
      we.weight as weight,
      we.created_at as createdAt,
      we.updated_at as updatedAt
    FROM workout_exercises we
    LEFT JOIN exercises e
      ON e.id = we.exercise_id
      OR e.seeded_id = CAST(we.exercise_id AS TEXT)
    WHERE we.workout_id = ? AND COALESCE(we.deleted, 0) = 0
    ORDER BY COALESCE(we.order_index, we.id) ASC, we.id ASC
  `,
    [workoutId],
  );

  for (const row of legacyRows) {
    const timestamp =
      row.createdAt || row.updatedAt || new Date().toISOString();
    await insert('workout_template_history', {
      workout_id: workoutId,
      workout_session_id: null,
      workout_exercise_id: row.workoutExerciseId,
      exercise_id: row.exerciseId,
      exercise_name_snapshot: row.exerciseName ?? null,
      action: 'added',
      source: 'legacy_seed',
      order_index: row.orderIndex ?? null,
      default_sets: row.defaultSets ?? null,
      default_reps: row.defaultReps ?? null,
      weight: row.weight ?? null,
      notes: 'Seeded from the current template for legacy history support.',
      created_at: timestamp,
      updated_at: row.updatedAt || timestamp,
    });
  }
}

export async function getWorkoutTemplateExerciseHistory(
  workoutId: number,
): Promise<WorkoutTemplateExerciseHistoryItem[]> {
  await seedLegacyWorkoutTemplateHistory(workoutId);

  const rows = await selectRaw<WorkoutTemplateExerciseHistoryItem>(
    `
    SELECT
      h.id as id,
      h.workout_id as workoutId,
      h.workout_session_id as workoutSessionId,
      h.workout_exercise_id as workoutExerciseId,
      h.exercise_id as exerciseId,
      COALESCE(e.name, h.exercise_name_snapshot, 'Exercise') as exerciseName,
      h.action as action,
      h.source as source,
      h.order_index as orderIndex,
      h.default_sets as defaultSets,
      h.default_reps as defaultReps,
      h.weight as weight,
      h.created_at as addedAt,
      h.updated_at as updatedAt,
      ws.started_at as startedAt,
      ws.finished_at as finishedAt
    FROM workout_template_history h
    LEFT JOIN exercises e
      ON e.id = h.exercise_id
      OR e.seeded_id = CAST(h.exercise_id AS TEXT)
    LEFT JOIN workout_sessions ws
      ON ws.id = h.workout_session_id
    WHERE h.workout_id = ?
    ORDER BY datetime(h.created_at) DESC, h.id DESC
  `,
    [workoutId],
  );

  return rows;
}

export async function getWorkoutTemplateProgressiveOverloadHistory(
  workoutId: number,
): Promise<WorkoutTemplateProgressiveOverloadHistoryEvent[]> {
  const { ensureProgressiveOverloadApplicationsTable } = await import(
    '../sessions/repositories/progressive.queries'
  );
  await ensureProgressiveOverloadApplicationsTable();

  const rows = await selectRaw<{
    workoutId: number;
    sessionId: number;
    exerciseId: number;
    exerciseName: string;
    exerciseLogId: number | null;
    setNumber: number;
    field: string;
    previousValue: number | null;
    newValue: number | null;
    recommendationType: string;
    reasonCode: string;
    appliedAt: string;
    startedAt: string | null;
    finishedAt: string | null;
  }>(
    `
    SELECT
      poa.workout_id as workoutId,
      poa.workout_session_id as sessionId,
      poa.exercise_id as exerciseId,
      COALESCE(e.name, 'Exercise') as exerciseName,
      poa.exercise_log_id as exerciseLogId,
      poa.set_number as setNumber,
      poa.field as field,
      poa.previous_value as previousValue,
      poa.new_value as newValue,
      poa.recommendation_type as recommendationType,
      poa.reason_code as reasonCode,
      poa.applied_at as appliedAt,
      ws.started_at as startedAt,
      ws.finished_at as finishedAt
    FROM progressive_overload_applications poa
    LEFT JOIN workout_sessions ws ON ws.id = poa.workout_session_id
    LEFT JOIN exercises e
      ON e.id = poa.exercise_id
      OR e.seeded_id = CAST(poa.exercise_id AS TEXT)
    WHERE poa.workout_id = ?
    ORDER BY datetime(poa.applied_at) DESC, poa.workout_session_id DESC, poa.exercise_id ASC, poa.set_number ASC, poa.field ASC
  `,
    [workoutId],
  );

  const events = new Map<
    string,
    {
      workoutId: number;
      sessionId: number;
      appliedAt: string;
      startedAt: string | null;
      finishedAt: string | null;
      changes: WorkoutTemplateProgressiveOverloadHistoryChange[];
    }
  >();

  rows.forEach(row => {
    const key = `${row.sessionId}-${row.appliedAt}`;
    const event = events.get(key) || {
      workoutId: row.workoutId,
      sessionId: row.sessionId,
      appliedAt: row.appliedAt,
      startedAt: row.startedAt,
      finishedAt: row.finishedAt,
      changes: [],
    };

    event.changes.push({
      exerciseId: row.exerciseId,
      exerciseName: row.exerciseName,
      exerciseLogId: row.exerciseLogId,
      setNumber: row.setNumber,
      field: row.field,
      previousValue: row.previousValue,
      newValue: row.newValue,
      recommendationType: row.recommendationType,
      reasonCode: row.reasonCode,
    });
    events.set(key, event);
  });

  return Array.from(events.values()).map(event => ({
    ...event,
    changeCount: event.changes.length,
    exerciseCount: new Set(event.changes.map(change => change.exerciseId)).size,
  }));
}

export async function getSessionAddedExerciseSuggestions(
  workoutId: number,
): Promise<SessionAddedExerciseSuggestion[]> {
  return selectRaw<SessionAddedExerciseSuggestion>(
    `
    SELECT
      ws.id as sessionId,
      el.id as exerciseLogId,
      el.exercise_id as exerciseId,
      COALESCE(e.name, 'Exercise') as exerciseName,
      ws.started_at as startedAt,
      ws.finished_at as finishedAt,
      el.planned_sets as plannedSets,
      el.planned_reps as plannedReps,
      el.weight as weight
    FROM exercise_logs el
    JOIN workout_sessions ws ON ws.id = el.workout_session_id
    LEFT JOIN exercises e
      ON e.id = el.exercise_id
      OR e.seeded_id = CAST(el.exercise_id AS TEXT)
    WHERE ws.workout_id = ?
      AND ws.finished_at IS NOT NULL
      AND COALESCE(el.deleted, 0) = 0
      AND NOT EXISTS (
        SELECT 1
        FROM workout_exercises we
        WHERE we.workout_id = ws.workout_id
          AND we.exercise_id = el.exercise_id
          AND COALESCE(we.deleted, 0) = 0
      )
    ORDER BY datetime(ws.started_at) DESC, COALESCE(el.order_index, el.id) ASC
  `,
    [workoutId],
  );
}

export async function addExerciseToWorkoutTemplate(
  workoutId: number,
  exercise: {
    exercise_id: number;
    default_sets?: number | null;
    default_reps?: number | null;
    weight?: number | null;
    workout_session_id?: number | null;
  },
) {
  const exerciseType = await getExerciseTypeForExerciseId(exercise.exercise_id);
  const weight = normalizePlannedWeight(exerciseType, exercise.weight ?? null);
  const existing = await selectRawOne<{ id: number }>(
    `
    SELECT id
    FROM workout_exercises
    WHERE workout_id = ? AND exercise_id = ? AND COALESCE(deleted, 0) = 0
    LIMIT 1
  `,
    [workoutId, exercise.exercise_id],
  );
  if (existing) return existing.id;

  const row = await selectRawOne<{ nextOrder: number }>(
    `
    SELECT COALESCE(MAX(order_index), 0) + 1 as nextOrder
    FROM workout_exercises
    WHERE workout_id = ? AND COALESCE(deleted, 0) = 0
  `,
    [workoutId],
  );
  const blockIds = new Map<string, number>();
  await insertWorkoutExercise(
    workoutId,
    {
      exercise_id: exercise.exercise_id,
      exercise_type: exerciseType,
      order_index: row?.nextOrder || 1,
      default_sets: exercise.default_sets || 3,
      default_reps: exercise.default_reps || 10,
      weight,
      section: 'main',
    },
    row?.nextOrder || 1,
    blockIds,
  );
  await updateWhere(
    'workouts',
    { updated_at: new Date().toISOString() },
    'id = ?',
    [workoutId],
  );
  await recordWorkoutTemplateHistoryEvent({
    workoutId,
    workoutSessionId: exercise.workout_session_id ?? null,
    exerciseId: exercise.exercise_id,
    action: 'added',
    source: exercise.workout_session_id ? 'session_addition' : 'template_edit',
    orderIndex: row?.nextOrder || 1,
    defaultSets: exercise.default_sets || 3,
    defaultReps: exercise.default_reps || 10,
    weight,
  });
}

export async function getWorkoutTemplate(
  id: number,
): Promise<WorkoutTemplate | null> {
  const workout = await selectRawOne<{
    id: number;
    name: string;
    type?: string | null;
    section?: string | null;
    description?: string | null;
    difficulty?: import('../types').TrainingDifficulty | null;
    training_style?: import('../types').TrainingStyle | null;
  }>('SELECT * FROM workouts WHERE id = ? AND archived = 0', [id]);

  if (!workout) return null;

  const exercises = await selectRaw<any>(
    `
    SELECT
      we.*,
      e.name as exercise_name,
      e.body_part as body_part,
      e.primary_muscle as primary_muscle,
      e.secondary_muscles as secondary_muscles,
      e.equipment as equipment,
      e.exercise_type as exercise_type,
      e.description as exercise_description,
      e.image_key as image_key,
      e.image_url as image_url,
      wb.type as block_type,
      wb.name as block_name,
      wb.rounds as block_rounds,
      wb.rest_between_rounds as block_rest_between_rounds,
      wb.order_index as block_order
    FROM workout_exercises we
    JOIN exercises e
      ON e.id = we.exercise_id
      OR e.seeded_id = CAST(we.exercise_id AS TEXT)
    LEFT JOIN workout_blocks wb ON wb.id = we.block_id
    WHERE we.workout_id = ?
    ORDER BY we.order_index ASC
  `,
    [id],
  );

  const blocks = await selectRaw<any>(
    `
    SELECT *
    FROM workout_blocks
    WHERE workout_id = ? AND deleted = 0
    ORDER BY order_index ASC, id ASC
  `,
    [id],
  );

  const hydratedExercises = await Promise.all(
    exercises.map(async exercise => {
      const sets = await selectRaw<WorkoutTemplateExerciseSetInput>(
        `
      SELECT set_number, planned_reps, planned_weight, duration_seconds, drop_sets
      FROM workout_exercise_sets
      WHERE workout_exercise_id = ?
      ORDER BY set_number ASC
    `,
        [exercise.id],
      );

      return {
        ...exercise,
        exerciseName: exercise.exercise_name,
        bodyPart: exercise.body_part,
        primaryMuscle: exercise.primary_muscle,
        secondaryMuscles: parseJsonArray(exercise.secondary_muscles),
        equipment: exercise.equipment,
        exerciseType: exercise.exercise_type,
        description: exercise.exercise_description,
        imageKey: exercise.image_key,
        imageUrl: exercise.image_url,
        sets: sets.map((set: any) => ({
          ...set,
          drop_sets: parseJsonArray(set.drop_sets),
        })),
      };
    }),
  );

  return {
    ...workout,
    blocks,
    exercises: hydratedExercises,
  };
}

export async function listWorkoutTemplates() {
  return selectRaw(
    'SELECT * FROM workouts WHERE archived = 0 ORDER BY created_at DESC',
  );
}

export async function archiveWorkoutTemplate(id: number) {
  await execute(
    'UPDATE workouts SET archived = 1, updated_at = ? WHERE id = ?',
    [new Date().toISOString(), id],
  );
}
