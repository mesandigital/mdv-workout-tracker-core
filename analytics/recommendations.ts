import { getCurrentWeekNumber } from '../../../shared';
import { getMostRelevantExerciseGap } from '../sessions/utils/getMostRelevantExerciseGap';
import { getPlateauCandidates } from '../sessions/utils/plateauDetection';
import { getNormalisedMuscleName } from '../../WorkoutTracker/utils/muscleMap';

export type SmartSlotConsistencyDecline = {
  currentWeekCount: number;
  averageWeekCount: number;
  declineDays: number;
};

export type ExerciseGapInput = {
  name: string;
  lastSessionDate: string | Date | null | undefined;
  frequency?: number;
};

export type ExerciseGapResult = ReturnType<typeof getMostRelevantExerciseGap>;

export type MusclePlateauInsight = Record<
  string,
  {
    name: string;
    plateau: boolean;
    plateauBroken: boolean;
    scores: number[];
    plateauRange?: [number, number];
    message: string;
    dismissed: boolean;
    onDismiss: () => void;
    reason: string;
    recommendation: string;
    frequency: number;
    lastTrained: string | null;
    days: number | null;
    pr: number;
    exerciseVariety: number;
    exerciseNames: string[];
  }
>;

export function getConsistencyDeclineStats(
  currentWeekDates: string[] = [],
  allWorkoutDates: string[] = [],
  recentWeeks = 4,
): SmartSlotConsistencyDecline {
  const currentWeekCount = currentWeekDates.length;
  const currentWeekNumber = getCurrentWeekNumber();
  const recentWindow = Math.max(1, recentWeeks * 7);
  const recentDates = allWorkoutDates.slice(Math.max(0, allWorkoutDates.length - recentWindow));
  const averageWeekCount = recentWeeks > 0 ? Math.round((recentDates.length / recentWeeks) * 10) / 10 : 0;
  const declineDays = currentWeekNumber > 0 && currentWeekCount < averageWeekCount ? 7 : 0;

  return {
    currentWeekCount,
    averageWeekCount,
    declineDays,
  };
}

export function getSmartSlotExerciseGap(
  exercises: ExerciseGapInput[] = [],
  cooldowns: Record<string, number> = {},
  now: Date = new Date(),
  cooldownHours = 48,
  minDaysSinceLast = 10,
) {
  return getMostRelevantExerciseGap(exercises, cooldowns, now, cooldownHours, minDaysSinceLast);
}

export function getSmartSlotExercisePlateaus(
  allExercises: Array<{ id: number; name: string }> = [],
  sessionsByExercise: Record<number, Array<{ date: string | Date; sets: { weight: number; reps: number }[] }>> = {},
) {
  return getPlateauCandidates(allExercises, sessionsByExercise);
}

export function getSmartSlotMusclePlateaus(
  sessions: any[] = [],
  options?: {
    minSessions?: number;
    tolerance?: number;
    secondaryWeight?: number;
  },
): MusclePlateauInsight {
  const minSessions = options?.minSessions ?? 3;
  const tolerance = options?.tolerance ?? 0.1;
  const secondaryWeight = options?.secondaryWeight ?? 0.5;

  const scores: Record<string, Array<{ date: string | Date; score: number }>> = {};
  const muscleDates: Record<string, Array<string | Date>> = {};
  const musclePRs: Record<string, number> = {};
  const muscleExercises: Record<string, Set<string>> = {};

  sessions.forEach(session => {
    const date = session.startedAt || session.started_at;
    (session.exercises || []).forEach((exercise: any) => {
      const sets = exercise.sets || [];
      let perf = 0;
      if (sets.length > 0) {
        let filtered = sets;
        if (sets.length > 3) {
          const sorted = [...sets].sort((a, b) => (a.weight || 0) - (b.weight || 0));
          const cutoff = Math.ceil(sets.length * 0.2);
          filtered = sorted.slice(cutoff);
        }
        perf = Math.max(...filtered.map((set: any) => (set.weight || 0) * (set.reps || 0)));
      }

      const addMuscle = (muscle?: string | null, weight = 1) => {
        if (!muscle) return;
        if (!scores[muscle]) scores[muscle] = [];
        scores[muscle].push({ date, score: perf * weight });
        if (!muscleDates[muscle]) muscleDates[muscle] = [];
        muscleDates[muscle].push(date);
        musclePRs[muscle] = Math.max(musclePRs[muscle] || 0, perf * weight);
        if (!muscleExercises[muscle]) muscleExercises[muscle] = new Set();
        if (exercise.name) muscleExercises[muscle].add(exercise.name);
      };

      addMuscle(exercise.primaryMuscle, 1);
      if (Array.isArray(exercise.secondaryMuscles)) {
        exercise.secondaryMuscles.forEach((muscle: string) => addMuscle(muscle, secondaryWeight));
      }
    });
  });

  const result: MusclePlateauInsight = {};
  Object.entries(scores).forEach(([muscle, arr]) => {
    if (arr.length < minSessions) return;
    const lastScores = arr.slice(0, 3).map(item => item.score);
    const maxScore = Math.max(...lastScores);
    const minScore = Math.min(...lastScores);
    if (maxScore === 0) return;

    const plateau = maxScore - minScore <= tolerance * maxScore;
    const displayName = getNormalisedMuscleName(muscle, true) || muscle;
    const lastTrained = muscleDates[muscle]?.[0] ? new Date(muscleDates[muscle][0] as any) : null;
    const lastTrainedLabel = lastTrained
      ? lastTrained.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
      : null;

    result[muscle] = {
      name: displayName,
      plateau,
      plateauBroken: false,
      scores: lastScores,
      plateauRange: plateau ? [minScore, maxScore] : undefined,
      message: plateau ? `${displayName} progress has stalled recently.` : `${displayName} is progressing normally.`,
      dismissed: false,
      onDismiss: () => undefined,
      reason: lastTrainedLabel ? `Last trained on ${lastTrainedLabel}` : 'No recent training data.',
      recommendation: plateau
        ? `Try increasing weight, reps, or changing exercise selection for ${displayName}.`
        : `Continue your current training for ${displayName}.`,
      frequency: muscleDates[muscle]?.length || 0,
      lastTrained: lastTrainedLabel,
      days: lastTrained ? Math.floor((Date.now() - lastTrained.getTime()) / (1000 * 60 * 60 * 24)) : null,
      pr: musclePRs[muscle] || 0,
      exerciseVariety: muscleExercises[muscle]?.size || 0,
      exerciseNames: muscleExercises[muscle] ? Array.from(muscleExercises[muscle]) : [],
    };
  });

  return result;
}

export function buildSmartSlotRecommendations(input: {
  currentWeekDates: string[];
  allWorkoutDates: string[];
  missedExercises?: any[];
  gapExercises?: ExerciseGapInput[];
  gapCooldowns?: Record<string, number>;
  exercisePlateauCandidates?: Array<{ id: number; name: string }>;
  sessionsByExercise?: Record<number, Array<{ date: string | Date; sets: { weight: number; reps: number }[] }>>;
  muscleSessions?: any[];
  musclePlateauOptions?: { minSessions?: number; tolerance?: number; secondaryWeight?: number };
}) {
  return {
    consistencyDecline: getConsistencyDeclineStats(
      input.currentWeekDates,
      input.allWorkoutDates,
      4,
    ),
    gapDetection: input.gapExercises
      ? getSmartSlotExerciseGap(input.gapExercises, input.gapCooldowns)
      : null,
    plateauCandidates: input.exercisePlateauCandidates && input.sessionsByExercise
      ? getSmartSlotExercisePlateaus(input.exercisePlateauCandidates, input.sessionsByExercise)
      : [],
    musclePlateaus: input.muscleSessions
      ? getSmartSlotMusclePlateaus(input.muscleSessions, input.musclePlateauOptions)
      : {},
    missedExercises: input.missedExercises ?? [],
    currentWeekNumber: getCurrentWeekNumber(),
  };
}
