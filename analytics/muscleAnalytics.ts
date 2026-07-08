export type MuscleAnalyticsExerciseStat = {
  name: string;
  count: number;
  sets: number;
  reps: number;
  tonnage: number;
};

export type MuscleAnalyticsMuscleStat = {
  muscle: string;
  sessions: number;
  sets: number;
  reps: number;
  tonnage: number;
  averageSetsPerSession: number;
  averageRepsPerSet: number;
  lastTrainedAt: string | null;
  daysSinceLastTrained: number | null;
  mostFrequentExercise: MuscleAnalyticsExerciseStat | null;
  topExercises: MuscleAnalyticsExerciseStat[];
};

export type MuscleAnalyticsSummary = {
  totalSessions: number;
  totalSets: number;
  totalReps: number;
  totalTonnage: number;
  topMuscles: MuscleAnalyticsMuscleStat[];
  muscleStats: Record<string, MuscleAnalyticsMuscleStat>;
};

const toDate = (value: unknown) => {
  if (!value) return null;
  const date = new Date(value as any);
  return Number.isNaN(date.getTime()) ? null : date;
};

const toNumber = (value: unknown) => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
};

const getExerciseName = (exercise: any) =>
  String(exercise?.exerciseName || exercise?.name || exercise?.title || 'Exercise');

const getWorkoutMuscles = (exercise: any) => {
  const muscles = [
    exercise?.primaryMuscle,
    exercise?.primary_muscle,
    exercise?.bodyPart,
    exercise?.body_part,
  ]
    .filter(Boolean)
    .map((muscle: any) => String(muscle));

  if (Array.isArray(exercise?.secondaryMuscles)) {
    muscles.push(...exercise.secondaryMuscles.map((muscle: any) => String(muscle)));
  }

  return Array.from(new Set(muscles));
};

export function buildMuscleAnalyticsSummary(workoutLogs: any[] = []): MuscleAnalyticsSummary {
  const muscleStats = new Map<string, MuscleAnalyticsMuscleStat>();
  let totalSets = 0;
  let totalReps = 0;
  let totalTonnage = 0;

  workoutLogs.forEach(log => {
    const sessionsSeen = new Set<string>();
    (log.exercises || []).forEach((exercise: any) => {
      const exerciseName = getExerciseName(exercise);
      const sets = Array.isArray(exercise.sets) ? exercise.sets : [];
      const exerciseSets = sets.length || toNumber(exercise.setsCount || exercise.total_sets || exercise.totalSets || exercise.default_sets);
      const exerciseReps = sets.reduce(
        (sum: number, set: any) => sum + toNumber(set.reps ?? set.planned_reps ?? exercise.reps),
        0,
      ) || (exerciseSets * toNumber(exercise.reps || exercise.default_reps || 0));
      const exerciseTonnage = sets.reduce(
        (sum: number, set: any) => sum + toNumber(set.weight ?? set.planned_weight ?? exercise.weight) * toNumber(set.reps ?? set.planned_reps ?? exercise.reps),
        0,
      ) || (toNumber(exercise.weight) * toNumber(exerciseReps));
      const muscles = getWorkoutMuscles(exercise);
      totalSets += exerciseSets;
      totalReps += exerciseReps;
      totalTonnage += exerciseTonnage;

      muscles.forEach(muscle => {
        const existing = muscleStats.get(muscle) || {
          muscle,
          sessions: 0,
          sets: 0,
          reps: 0,
          tonnage: 0,
          averageSetsPerSession: 0,
          averageRepsPerSet: 0,
          lastTrainedAt: null,
          daysSinceLastTrained: null,
          mostFrequentExercise: null,
          topExercises: [],
        };

        existing.sets += exerciseSets;
        existing.reps += exerciseReps;
        existing.tonnage += exerciseTonnage;
        if (!sessionsSeen.has(muscle)) {
          existing.sessions += 1;
          sessionsSeen.add(muscle);
        }

        const trainedAt = toDate(log.finishedAt || log.startedAt);
        if (trainedAt) {
          const currentLast = toDate(existing.lastTrainedAt);
          if (!currentLast || trainedAt > currentLast) {
            existing.lastTrainedAt = trainedAt.toISOString();
            existing.daysSinceLastTrained = Math.max(
              0,
              Math.floor((Date.now() - trainedAt.getTime()) / 86400000),
            );
          }
        }

        const exerciseIndex = existing.topExercises.findIndex(item => item.name === exerciseName);
        const nextEntry = {
          name: exerciseName,
          count: 1,
          sets: exerciseSets,
          reps: exerciseReps,
          tonnage: exerciseTonnage,
        };

        if (exerciseIndex >= 0) {
          const current = existing.topExercises[exerciseIndex];
          existing.topExercises[exerciseIndex] = {
            ...current,
            count: current.count + 1,
            sets: current.sets + exerciseSets,
            reps: current.reps + exerciseReps,
            tonnage: current.tonnage + exerciseTonnage,
          };
        } else {
          existing.topExercises.push(nextEntry);
        }

        existing.topExercises.sort((a, b) => b.count - a.count || b.tonnage - a.tonnage);
        existing.mostFrequentExercise = existing.topExercises[0] || null;
        existing.averageSetsPerSession = existing.sessions > 0 ? existing.sets / existing.sessions : 0;
        existing.averageRepsPerSet = existing.sets > 0 ? existing.reps / existing.sets : 0;
        muscleStats.set(muscle, existing);
      });
    });
  });

  const muscles = Array.from(muscleStats.values()).sort(
    (a, b) => b.tonnage - a.tonnage || b.sessions - a.sessions,
  );

  return {
    totalSessions: workoutLogs.length,
    totalSets,
    totalReps,
    totalTonnage,
    topMuscles: muscles,
    muscleStats: Object.fromEntries(muscleStats.entries()),
  };
}
