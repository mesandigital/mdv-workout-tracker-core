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
  if (exercise.sets?.length) {
    return exercise.sets.map((set, index) => ({
      set_number: set.set_number || index + 1,
      planned_reps: set.planned_reps || exercise.default_reps || 1,
      planned_weight: set.planned_weight ?? exercise.weight ?? null,
      duration_seconds: set.duration_seconds ?? null,
      drop_sets: Array.isArray(set.drop_sets) ? set.drop_sets : [],
    }));
  }

  const totalSets = Math.max(1, exercise.default_sets || 1);
  return Array.from({ length: totalSets }, (_, index) => ({
    set_number: index + 1,
    planned_reps: exercise.default_reps || 1,
    planned_weight: exercise.weight ?? null,
    duration_seconds: null,
    drop_sets: [],
  }));
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
) {
  const sets = normalizeSets(exercise);
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
          planned_reps: exercise.default_reps || sets[0]?.planned_reps || 1,
          planned_weight: exercise.weight ?? sets[0]?.planned_weight ?? null,
          duration_seconds: sets[0]?.duration_seconds ?? null,
          drop_sets: [],
        },
      ]
    : sets;

  const workoutExerciseId = await insert('workout_exercises', {
    workout_id: workoutId,
    block_id: blockId,
    exercise_id: exercise.exercise_id,
    order_index: exercise.order_index ?? index,
    default_sets: isRoundBasedBlock(blockType) ? 1 : effectiveSets.length,
    default_reps: exercise.default_reps || effectiveSets[0]?.planned_reps || 1,
    weight: exercise.weight ?? effectiveSets[0]?.planned_weight ?? 0,
    rest_seconds: exercise.rest_seconds ?? null,
    section: exercise.section || 'main',
    superset_id: groupType === 'superset' ? groupId : null,
    group_id: groupId,
    group_type: groupType,
    setsArray: JSON.stringify(effectiveSets),
  });

  for (const set of effectiveSets) {
    await insert('workout_exercise_sets', {
      workout_id: workoutId,
      workout_exercise_id: workoutExerciseId,
      exercise_id: exercise.exercise_id,
      set_number: set.set_number,
      planned_reps: set.planned_reps,
      planned_weight: set.planned_weight ?? null,
      duration_seconds: set.duration_seconds ?? null,
      drop_sets: JSON.stringify(set.drop_sets || []),
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
    await insertWorkoutExercise(id, input.exercises[index], index, blockIds);
  }
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
