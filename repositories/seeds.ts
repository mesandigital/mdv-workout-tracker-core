import {
  execute,
  insert,
  selectRaw,
  selectRawOne,
  updateWhere,
  type SqlValue,
} from '../db';
import type {
  WorkoutTemplateExerciseInput,
  WorkoutTemplateExerciseSetInput,
  WorkoutTrackerSeedExerciseInput,
  WorkoutTrackerSeedInput,
  WorkoutTrackerSeedWorkoutExerciseInput,
  WorkoutTrackerSeedWorkoutInput,
} from '../types';
import { createWorkoutTemplate, updateWorkoutTemplate } from './workouts';

const tableColumnsCache = new Map<string, Set<string>>();

async function getTableColumns(table: string) {
  if (!tableColumnsCache.has(table)) {
    const columns = await selectRaw<{ name: string }>(
      `PRAGMA table_info(${table})`,
    );
    tableColumnsCache.set(table, new Set(columns.map(column => column.name)));
  }

  return tableColumnsCache.get(table)!;
}

async function filterToTableColumns(
  table: string,
  data: Record<string, SqlValue>,
) {
  const columns = await getTableColumns(table);
  return Object.fromEntries(
    Object.entries(data).filter(
      ([key, value]) => value !== undefined && columns.has(key),
    ),
  );
}

const asSeedFlag = (value: boolean | number | undefined) => {
  if (typeof value === 'number') return value ? 1 : 0;
  return value === false ? 0 : 1;
};

const serializeSeedValue = (value: unknown) =>
  Array.isArray(value) ? JSON.stringify(value) : value;

async function upsertSeedExercise(exercise: WorkoutTrackerSeedExerciseInput) {
  const seededId = exercise.seeded_id || null;
  const seededVersion = exercise.seeded_version ?? 1;
  const existing = seededId
    ? await selectRawOne<{ id: number; seeded_version?: number | null }>(
        'SELECT id, seeded_version FROM exercises WHERE seeded_id = ?',
        [seededId],
      )
    : await selectRawOne<{ id: number; seeded_version?: number | null }>(
        'SELECT id, seeded_version FROM exercises WHERE lower(name) = lower(?)',
        [exercise.name],
      );

  const data = await filterToTableColumns('exercises', {
    name: exercise.name,
    category: exercise.category || null,
    description: exercise.description || null,
    body_part: exercise.body_part || null,
    primary_muscle: exercise.primary_muscle || null,
    secondary_muscles: serializeSeedValue(
      exercise.secondary_muscles,
    ) as SqlValue,
    equipment: exercise.equipment || null,
    movement: exercise.movement || null,
    exercise_type: exercise.exercise_type || null,
    exercise_category: exercise.exercise_category || null,
    image_url: exercise.image_url || null,
    image_key: exercise.image_key || null,
    instructions: serializeSeedValue(exercise.instructions) as SqlValue,
    difficulty: exercise.difficulty || null,
    training_style: exercise.training_style || null,
    progression_group: exercise.progression_group || null,
    progression_level: exercise.progression_level ?? null,
    source: exercise.source || 'system',
    seeded: asSeedFlag(exercise.seeded),
    seeded_id: seededId,
    seeded_version: seededVersion,
    updated_at: new Date().toISOString(),
  });

  if (existing) {
    if ((existing.seeded_version || 0) < seededVersion) {
      await updateWhere('exercises', data, 'id = ?', [existing.id]);
    }
    return existing.id;
  }

  return insert('exercises', {
    ...data,
    created_at: new Date().toISOString(),
  });
}

async function getExerciseSeedMap() {
  const rows = await selectRaw<{ id: number; seeded_id: string | null }>(
    'SELECT id, seeded_id FROM exercises WHERE seeded_id IS NOT NULL',
  );

  return new Map(rows.map(row => [row.seeded_id, row.id]));
}

async function getWorkoutExerciseCount(workoutId: number) {
  const row = await selectRawOne<{ total: number }>(
    'SELECT COUNT(*) as total FROM workout_exercises WHERE workout_id = ?',
    [workoutId],
  );

  return row?.total || 0;
}

async function getResolvedWorkoutExerciseCount(workoutId: number) {
  const row = await selectRawOne<{ total: number }>(
    `
    SELECT COUNT(e.id) as total
    FROM workout_exercises we
    LEFT JOIN exercises e
      ON e.id = we.exercise_id
      OR e.seeded_id = CAST(we.exercise_id AS TEXT)
    WHERE we.workout_id = ?
    `,
    [workoutId],
  );

  return row?.total || 0;
}

const normalizeSeedSets = (
  exercise: WorkoutTrackerSeedWorkoutExerciseInput,
  defaultReps: number,
  defaultWeight: number | null,
): WorkoutTemplateExerciseSetInput[] => {
  if (exercise.sets?.length) {
    return exercise.sets.map((set, index) => ({
      set_number: set.set_number || index + 1,
      planned_reps: set.planned_reps || set.plannedReps || defaultReps,
      planned_weight: set.planned_weight ?? set.plannedWeight ?? defaultWeight,
      duration_seconds: set.duration_seconds ?? null,
      drop_sets: Array.isArray(set.drop_sets) ? set.drop_sets : [],
    }));
  }

  const totalSets = exercise.default_sets || exercise.plannedSets || 3;
  return Array.from({ length: totalSets }, (_, index) => ({
    set_number: index + 1,
    planned_reps: exercise.default_reps || exercise.plannedReps || defaultReps,
    planned_weight: exercise.weight ?? exercise.plannedWeight ?? defaultWeight,
    duration_seconds: null,
    drop_sets: [],
  }));
};

function toWorkoutTemplateExercise(
  exercise: WorkoutTrackerSeedWorkoutExerciseInput,
  exerciseId: number,
  index: number,
): WorkoutTemplateExerciseInput {
  const defaultReps = exercise.default_reps || exercise.plannedReps || 10;
  const defaultWeight = exercise.weight ?? exercise.plannedWeight ?? 0;

  return {
    exercise_id: exerciseId,
    block_id: exercise.block_id ?? null,
    block_type: exercise.block_type ?? null,
    block_name: exercise.block_name ?? null,
    block_rounds: exercise.block_rounds ?? null,
    block_rest_between_rounds: exercise.block_rest_between_rounds ?? null,
    block_order: exercise.block_order ?? null,
    order_index: index + 1,
    default_sets:
      exercise.default_sets ||
      exercise.plannedSets ||
      exercise.sets?.length ||
      3,
    default_reps: defaultReps,
    weight: defaultWeight,
    rest_seconds: exercise.rest_seconds ?? null,
    section: exercise.section || 'main',
    superset_id: exercise.superset_id ?? null,
    group_id: exercise.group_id ?? exercise.superset_id ?? null,
    group_type:
      exercise.group_type ?? (exercise.superset_id ? 'superset' : null),
    sets: normalizeSeedSets(exercise, defaultReps, defaultWeight),
  };
}

async function seedWorkout(
  workout: WorkoutTrackerSeedWorkoutInput,
  exerciseSeedMap: Map<string | null, number>,
) {
  const seededId = workout.seeded_id || null;
  const seededVersion = workout.seeded_version ?? 1;
  const existing = seededId
    ? await selectRawOne<{ id: number; seeded_version?: number | null }>(
        'SELECT id, seeded_version FROM workouts WHERE seeded_id = ?',
        [seededId],
      )
    : await selectRawOne<{ id: number; seeded_version?: number | null }>(
        'SELECT id, seeded_version FROM workouts WHERE lower(name) = lower(?)',
        [workout.name],
      );

  const exercises = (workout.exercises || [])
    .map((exercise, index) => {
      const exerciseId =
        exercise.exercise_id ||
        exerciseSeedMap.get(
          exercise.exercise_seeded_id || exercise.seeded_id || null,
        );
      return exerciseId
        ? toWorkoutTemplateExercise(exercise, exerciseId, index)
        : null;
    })
    .filter(Boolean) as WorkoutTemplateExerciseInput[];

  if (existing && (existing.seeded_version || 0) >= seededVersion) {
    const existingExerciseCount = await getWorkoutExerciseCount(existing.id);
    const resolvedExerciseCount =
      existingExerciseCount > 0
        ? await getResolvedWorkoutExerciseCount(existing.id)
        : 0;
    if (
      exercises.length === 0 ||
      (existingExerciseCount > 0 && resolvedExerciseCount >= exercises.length)
    ) {
      return existing.id;
    }
  }

  if (existing) {
    await updateWorkoutTemplate(existing.id, {
      name: workout.name,
      type: workout.type || null,
      section: workout.section || null,
      description: workout.description || null,
      difficulty: workout.difficulty || null,
      training_style: workout.training_style || null,
      exercises,
    });

    await updateWhere(
      'workouts',
      await filterToTableColumns('workouts', {
        seeded: asSeedFlag(workout.seeded),
        seeded_id: seededId,
        seeded_version: Math.max(existing.seeded_version || 0, seededVersion),
        updated_at: workout.updated_at || new Date().toISOString(),
      }),
      'id = ?',
      [existing.id],
    );

    return existing.id;
  }

  const workoutId = await createWorkoutTemplate({
    name: workout.name,
    type: workout.type || null,
    section: workout.section || null,
    description: workout.description || null,
    difficulty: workout.difficulty || null,
    training_style: workout.training_style || null,
    exercises,
  });

  await updateWhere(
    'workouts',
    await filterToTableColumns('workouts', {
      seeded: asSeedFlag(workout.seeded),
      seeded_id: seededId,
      seeded_version: seededVersion,
      difficulty: workout.difficulty || null,
      training_style: workout.training_style || null,
      created_at: workout.created_at,
      updated_at: workout.updated_at || new Date().toISOString(),
    }),
    'id = ?',
    [workoutId],
  );

  return workoutId;
}

export async function seedWorkoutTrackerData(seed: WorkoutTrackerSeedInput) {
  const exercises = seed.exercises || [];
  const workouts = seed.workouts || [];

  await execute('BEGIN');
  try {
    for (const exercise of exercises) {
      await upsertSeedExercise(exercise);
    }

    const exerciseSeedMap = await getExerciseSeedMap();

    for (const workout of workouts) {
      await seedWorkout(workout, exerciseSeedMap);
    }

    await execute('COMMIT');
  } catch (error) {
    await execute('ROLLBACK');
    throw error;
  }
}
