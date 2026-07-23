export type ExercisePrescriptionType = string | null | undefined;

export const normalizeExerciseType = (
  exerciseType?: ExercisePrescriptionType,
) =>
  String(exerciseType || 'weight_reps')
    .trim()
    .toLowerCase();

export const usesWeight = (exerciseType?: ExercisePrescriptionType) =>
  normalizeExerciseType(exerciseType).includes('weight');

export const usesDuration = (exerciseType?: ExercisePrescriptionType) => {
  const normalized = normalizeExerciseType(exerciseType);
  return normalized.includes('duration') || normalized.includes('time');
};

export const usesReps = (exerciseType?: ExercisePrescriptionType) =>
  !usesDuration(exerciseType) ||
  normalizeExerciseType(exerciseType).includes('reps');

export const isRepsOnlyExerciseType = (
  exerciseType?: ExercisePrescriptionType,
) => {
  const normalized = normalizeExerciseType(exerciseType);
  return (
    normalized === 'reps' ||
    (normalized.includes('reps') && !normalized.includes('weight'))
  );
};

export const normalizePlannedWeight = (
  exerciseType: ExercisePrescriptionType,
  weight?: number | null,
) => (usesWeight(exerciseType) && typeof weight === 'number' ? weight : null);
