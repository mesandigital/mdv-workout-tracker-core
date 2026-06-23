import { insert, selectRaw, selectRawOne, updateWhere } from '../db';
import type { Exercise, ExerciseInput } from '../types';

export async function createExercise(input: ExerciseInput) {
  return insert('exercises', {
    name: input.name,
    category: input.category || null,
    description: input.description || null,
    body_part: input.body_part || null,
    primary_muscle: input.primary_muscle || null,
    secondary_muscles: input.secondary_muscles || null,
    equipment: input.equipment || null,
    exercise_type: input.exercise_type || null,
    difficulty: input.difficulty || null,
    training_style: input.training_style || null,
    progression_group: input.progression_group || null,
    progression_level: input.progression_level ?? null,
    image_url: input.image_url || null,
    image_key: input.image_key || null,
  });
}

export async function updateExercise(id: number, input: Partial<ExerciseInput>) {
  await updateWhere('exercises', {
    ...input,
    updated_at: new Date().toISOString(),
  }, 'id = ?', [id]);
}

export async function getExercise(id: number) {
  return selectRawOne<Exercise>('SELECT * FROM exercises WHERE id = ?', [id]);
}

export async function listExercises() {
  return selectRaw<Exercise>('SELECT * FROM exercises WHERE archived = 0 ORDER BY name ASC');
}

export async function archiveExercise(id: number) {
  await updateWhere('exercises', {
    archived: 1,
    updated_at: new Date().toISOString(),
  }, 'id = ?', [id]);
}
