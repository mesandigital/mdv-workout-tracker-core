export type CompletedWorkoutExerciseSummary = {
  name: string;
  setsCompleted: number;
  muscleGroups: string[];
  unNormalizedPrimaryMuscle: string[];
};

export type LastWorkoutSummary = {
  completedExercises: CompletedWorkoutExerciseSummary[];
  primaryMuscles: string[];
  skippedPrimaryMuscles: string[];
  totalSets: number;
};

export type PersonalRecordSummaryInput = {
  record_type?: 'weight' | 'reps' | 'volume' | string | null;
};

export function summarizeLastWorkoutExercises(
  exercises: any[] = [],
  options: {
    getMuscleKey?: (muscle?: string | null) => string;
    normalizeMuscleName?: (muscle: string, display?: boolean) => string;
  } = {},
): LastWorkoutSummary {
  const primaryMuscles: string[] = [];
  const skippedPrimaryMuscles: string[] = [];
  let totalSets = 0;

  const completedExercises = Array.isArray(exercises)
    ? exercises.map((exercise) => {
      const setsCompleted = Array.isArray(exercise?.sets)
        ? exercise.sets.filter((set: any) => set.completed === 1 || set.completed === true).length
        : 0;
      totalSets += setsCompleted;

      const rawPrimaryMuscle = exercise?.primaryMuscle || exercise?.primary_muscle || '';
      const primaryMuscleKey = options.getMuscleKey?.(rawPrimaryMuscle) || rawPrimaryMuscle;
      const primaryMuscle = primaryMuscleKey
        ? options.normalizeMuscleName?.(primaryMuscleKey, true) || primaryMuscleKey
        : '';

      if (setsCompleted > 0 && primaryMuscle && !primaryMuscles.includes(primaryMuscle)) {
        primaryMuscles.push(primaryMuscle);
      }

      if (setsCompleted === 0 && primaryMuscle && !skippedPrimaryMuscles.includes(primaryMuscle)) {
        skippedPrimaryMuscles.push(primaryMuscle);
      }

      return {
        name: exercise?.name,
        setsCompleted,
        muscleGroups: primaryMuscle ? [primaryMuscle] : [],
        unNormalizedPrimaryMuscle: rawPrimaryMuscle ? [rawPrimaryMuscle] : [],
      };
    }).filter(exercise => exercise.setsCompleted > 0)
    : [];

  return {
    completedExercises,
    primaryMuscles,
    skippedPrimaryMuscles: skippedPrimaryMuscles.filter(
      muscle => !primaryMuscles.includes(muscle),
    ),
    totalSets,
  };
}

export function summarizePersonalRecords(records: PersonalRecordSummaryInput[] = []) {
  const counts = records.reduce(
    (result, record) => {
      if (record.record_type === 'weight' || record.record_type === 'reps' || record.record_type === 'volume') {
        result[record.record_type] += 1;
      }
      return result;
    },
    { weight: 0, reps: 0, volume: 0 },
  );

  if (records.length === 0) return null;

  return [
    `${records.length} PR${records.length === 1 ? '' : 's'}`,
    counts.weight > 0 ? `${counts.weight} weight` : null,
    counts.reps > 0 ? `${counts.reps} reps` : null,
    counts.volume > 0 ? `${counts.volume} volume` : null,
  ].filter(Boolean).join(' · ');
}
