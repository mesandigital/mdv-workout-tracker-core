import { parseSecondaryMuscles } from '../utils/parseSecondaryMuscles';

export type MuscleTargetOverrides = Record<string, number>;
export type MuscleFocusPeriodMode = 'week' | 'month';

type MuscleFocusSummaryInput = {
  muscle: string;
  count: number;
  exercises_info?: any[];
};

type MuscleFocusProgressRow = {
  muscle: string;
  completedSets: number;
  comparisonSets: number;
  weeklyAverage: number;
  weeklyTarget: number;
  progressPercent: number;
  intensity: 1 | 2 | 3;
};

const WEEKLY_TARGETS: Record<string, number> = {
  pectorals: 10,
  core: 8,
  'upper-back': 5,
  lats: 5,
  'middle-back': 5,
  'lower-back': 4,
  trapezius: 5,
  back: 14,
  shoulders: 12,
  anterior_deltoid: 4,
  lateral_deltoid: 4,
  posterior_deltoid: 4,
  arms: 10,
  biceps: 5,
  triceps: 5,
  legs: 14,
  quadriceps: 7,
  hamstring: 7,
  glutes: 10,
  calves: 10,
};

const MUSCLE_TARGET_ALIASES: Record<string, string> = {
  chest: 'pectorals',
  deltoids: 'shoulders',
  gluteal: 'glutes',
  glutes: 'glutes',
  quads: 'quadriceps',
  hamstrings: 'hamstring',
  traps: 'trapezius',
  forearms: 'forearm',
  rear_delt: 'posterior_deltoid',
};

export const MUSCLE_FAMILIES = [
  ['deltoids', 'shoulders', 'delts', 'anterior-deltoid', 'lateral-deltoid', 'posterior-deltoid', 'rear-delt'],
  ['triceps'],
  ['trapezius', 'traps'],
  ['upper-back', 'upperback', 'middle-back', 'lats', 'back'],
  ['lower-back', 'lowerback'],
  ['gluteal', 'glutes', 'posterior-chain'],
  ['chest', 'pectorals', 'pecs'],
  ['hamstring', 'hamstrings'],
  ['forearm', 'forearms'],
  ['quadriceps', 'quads'],
];

export const MUSCLE_PREFERENCE_MUSCLES = [
  'abs',
  'adductors',
  'ankles',
  'biceps',
  'calves',
  'chest',
  'deltoids',
  'feet',
  'forearm',
  'gluteal',
  'hamstring',
  'hands',
  'head',
  'knees',
  'lower-back',
  'neck',
  'obliques',
  'quadriceps',
  'tibialis',
  'trapezius',
  'triceps',
  'upper-back',
  'anterior_deltoid',
  'lateral_deltoid',
  'posterior_deltoid',
  'lats',
  'middle-back',
];

const GROUP_MAP: Record<string, 'upper' | 'lower' | 'core'> = {
  chest: 'upper',
  pectorals: 'upper',
  deltoids: 'upper',
  delts: 'upper',
  shoulders: 'upper',
  anterior_deltoid: 'upper',
  lateral_deltoid: 'upper',
  posterior_deltoid: 'upper',
  rear_delt: 'upper',
  biceps: 'upper',
  triceps: 'upper',
  forearm: 'upper',
  forearms: 'upper',
  hands: 'upper',
  trapezius: 'upper',
  traps: 'upper',
  lats: 'upper',
  back: 'upper',
  'upper-back': 'upper',
  'middle-back': 'upper',
  'lower-back': 'lower',
  gluteal: 'lower',
  glutes: 'lower',
  hamstring: 'lower',
  hamstrings: 'lower',
  quadriceps: 'lower',
  quads: 'lower',
  adductors: 'lower',
  calves: 'lower',
  tibialis: 'lower',
  ankles: 'lower',
  feet: 'lower',
  knees: 'lower',
  posterior_chain: 'lower',
  abs: 'core',
  obliques: 'core',
  core: 'core',
  neck: 'core',
  head: 'core',
};

export const normalizeMuscleTargetKey = (muscle?: string | null) =>
  String(muscle || '').trim().toLowerCase().replace(/[\s_]+/g, '-');

export const getDefaultMuscleTarget = (muscle: string) => {
  const key = MUSCLE_TARGET_ALIASES[muscle] || muscle;
  return WEEKLY_TARGETS[key] ?? 4;
};

const getCompletedSets = (exercise: any) => {
  if (Array.isArray(exercise.sets)) {
    if (
      exercise.sets.length > 0 &&
      typeof exercise.sets[0] === 'object' &&
      exercise.sets[0] !== null &&
      'completed' in exercise.sets[0]
    ) {
      return exercise.sets.filter((set: any) => set.completed).length;
    }
    if (Array.isArray(exercise.reps)) {
      return exercise.reps.filter((reps: any) => typeof reps === 'number' && reps > 0).length;
    }
    return exercise.sets.length;
  }
  if (typeof exercise.reps === 'number' && exercise.reps > 0) return 1;
  return 0;
};

const getExerciseName = (exercise: any) =>
  exercise.name ?? exercise.exerciseName ?? exercise.exercise_name;
const getPrimaryMuscle = (exercise: any) =>
  exercise.primaryMuscle ?? exercise.primary_muscle;
const getSecondary = (exercise: any) =>
  parseSecondaryMuscles(exercise.secondaryMuscles ?? exercise.secondary_muscles);
const getSessionId = (log: any) => log.session_id ?? log.sessionId ?? log.id;
const getSessionName = (log: any) => log.name ?? log.session_name ?? log.workoutName;
const getSessionDate = (log: any) => log.startedAt ?? log.started_at ?? log.session_date;

const getTotalReps = (exercise: any) => {
  if (Array.isArray(exercise.reps)) {
    return exercise.reps
      .filter((reps: any) => typeof reps === 'number' && reps > 0)
      .reduce((sum: number, reps: number) => sum + reps, 0);
  }
  if (typeof exercise.reps === 'number') return exercise.reps;
  if (Array.isArray(exercise.sets)) {
    return exercise.sets.reduce((sum: number, set: any) => {
      const completed =
        set?.completed === true ||
        set?.completed === 1 ||
        !('completed' in (set || {}));
      const reps = typeof set?.reps === 'number' ? set.reps : 0;
      return completed ? sum + reps : sum;
    }, 0);
  }
  return undefined;
};

const normalizeGroupMuscle = (muscle?: string | null) => {
  const key = normalizeMuscleTargetKey(muscle);
  if (key === 'pecs' || key === 'pectorals') return 'chest';
  if (key === 'glutes') return 'gluteal';
  if (key === 'hamstrings') return 'hamstring';
  if (key === 'forearms') return 'forearm';
  if (key === 'quads') return 'quadriceps';
  if (key === 'traps') return 'trapezius';
  return key;
};

const getMuscleHighlightInfo = (muscle: string) => {
  const key = normalizeGroupMuscle(muscle);
  switch (key) {
    case 'chest':
      return [{ slug: 'chest', region: 'Front' as const }];
    case 'deltoids':
    case 'anterior-deltoid':
    case 'lateral-deltoid':
      return [{ slug: 'deltoids', region: 'Front' as const }];
    case 'posterior-deltoid':
    case 'rear-delt':
      return [{ slug: 'deltoids', region: 'Back' as const }];
    case 'biceps':
      return [{ slug: 'biceps', region: 'Front' as const }];
    case 'triceps':
      return [
        { slug: 'triceps', region: 'Front' as const },
        { slug: 'triceps', region: 'Back' as const },
      ];
    case 'forearm':
      return [
        { slug: 'forearm', region: 'Front' as const },
        { slug: 'forearm', region: 'Back' as const },
      ];
    case 'upper-back':
    case 'middle-back':
    case 'lats':
    case 'back':
      return [{ slug: 'upper-back', region: 'Back' as const }];
    case 'lower-back':
      return [{ slug: 'lower-back', region: 'Back' as const }];
    case 'trapezius':
      return [{ slug: 'trapezius', region: 'Back' as const }];
    case 'gluteal':
    case 'posterior-chain':
      return [{ slug: 'gluteal', region: 'Back' as const }];
    case 'hamstring':
      return [{ slug: 'hamstring', region: 'Back' as const }];
    case 'calves':
      return [{ slug: 'calves', region: 'Back' as const }];
    case 'quadriceps':
      return [{ slug: 'quadriceps', region: 'Front' as const }];
    case 'adductors':
      return [
        { slug: 'adductors', region: 'Front' as const },
        { slug: 'adductors', region: 'Back' as const },
      ];
    case 'abs':
      return [{ slug: 'abs', region: 'Front' as const }];
    case 'obliques':
      return [{ slug: 'obliques', region: 'Front' as const }];
    case 'tibialis':
      return [{ slug: 'tibialis', region: 'Front' as const }];
    default:
      return [];
  }
};

export function computeMuscleSplit(logs: any[]) {
  const muscleSplit: Record<string, number> = {};
  const muscleSplitEx: Record<string, Set<string>> = {};
  const muscleSetCount: Record<string, number> = {};
  const primaryMuscleCount: Record<string, number> = {};
  const secondaryMuscleCount: Record<string, number> = {};
  const muscleExerciseLog: Record<string, any[]> = {};

  logs.forEach(log => {
    (log.exercises || []).forEach((exercise: any) => {
      const setCount = getCompletedSets(exercise);
      if (setCount === 0) return;
      const exerciseName = getExerciseName(exercise);
      const primaryMuscle = getPrimaryMuscle(exercise);
      const secondaryMuscles = getSecondary(exercise);
      const logEntry = {
        exercise_id: exercise.id ?? exercise.exercise_id ?? exercise.exerciseId,
        exercise_name: exerciseName,
        session_date: getSessionDate(log),
        session_id: getSessionId(log),
        session_name: getSessionName(log),
        primaryMuscle,
        secondaryMuscles,
        tonnage: exercise.tonnage,
        total_reps: getTotalReps(exercise),
        total_sets: setCount,
      };

      if (primaryMuscle) {
        muscleSplit[primaryMuscle] = (muscleSplit[primaryMuscle] || 0) + 1;
        primaryMuscleCount[primaryMuscle] = (primaryMuscleCount[primaryMuscle] || 0) + 1;
        if (!muscleSplitEx[primaryMuscle]) muscleSplitEx[primaryMuscle] = new Set();
        if (exerciseName) muscleSplitEx[primaryMuscle].add(exerciseName);
        if (!muscleExerciseLog[primaryMuscle]) muscleExerciseLog[primaryMuscle] = [];
        muscleExerciseLog[primaryMuscle].push(logEntry);
      }

      secondaryMuscles.forEach((muscle: string) => {
        if (!muscle) return;
        muscleSplit[muscle] = (muscleSplit[muscle] || 0) + 1;
        secondaryMuscleCount[muscle] = (secondaryMuscleCount[muscle] || 0) + 1;
        if (!muscleSplitEx[muscle]) muscleSplitEx[muscle] = new Set();
        if (exerciseName) muscleSplitEx[muscle].add(exerciseName);
        if (!muscleExerciseLog[muscle]) muscleExerciseLog[muscle] = [];
        muscleExerciseLog[muscle].push(logEntry);
      });
    });
  });

  const muscleSplitExArr: Record<string, string[]> = {};
  Object.keys(muscleSplitEx).forEach(key => {
    muscleSplitExArr[key] = Array.from(muscleSplitEx[key]);
  });
  const totalMuscle = Object.values(muscleSplit).reduce((sum, count) => sum + count, 0);
  Object.keys(muscleSplit).forEach(key => {
    muscleSplit[key] = totalMuscle ? (muscleSplit[key] / totalMuscle) * 100 : 0;
    muscleSetCount[key] = (primaryMuscleCount[key] || 0) + (secondaryMuscleCount[key] || 0);
  });

  return {
    muscleSplit,
    muscleSplitEx: muscleSplitExArr,
    muscleSetCount,
    primaryMuscleCount,
    secondaryMuscleCount,
    muscleExerciseLog,
  };
}

export function getTrainingBias(muscleSplit: Record<string, number>): string {
  let upper = 0;
  let lower = 0;
  let core = 0;
  Object.entries(muscleSplit || {}).forEach(([muscle, pct]) => {
    const group = GROUP_MAP[normalizeGroupMuscle(muscle)];
    if (group === 'upper') upper += pct;
    else if (group === 'lower') lower += pct;
    else if (group === 'core') core += pct;
  });
  if (upper >= 60) return 'Upper Body Dominant';
  if (lower >= 60) return 'Lower Body Dominant';
  if (core >= 40) return 'Core Focused';
  return 'Balanced Training';
}

export function buildMuscleFocusSummary({
  muscleSummary,
  trackedMuscles = [],
  targetAliases = {},
}: {
  muscleSummary: MuscleFocusSummaryInput[];
  trackedMuscles?: string[];
  targetAliases?: Record<string, string>;
}) {
  const trackedByKey = new Map(
    trackedMuscles.map(muscle => [normalizeMuscleTargetKey(muscle), muscle]),
  );
  const summary = new Map<string, { muscle: string; count: number; exercises_info: any[] }>();

  trackedMuscles.forEach(muscle =>
    summary.set(normalizeMuscleTargetKey(muscle), {
      muscle,
      count: 0,
      exercises_info: [],
    }),
  );

  muscleSummary.forEach(item => {
    const rawKey = normalizeMuscleTargetKey(item.muscle);
    const aliasKey = normalizeMuscleTargetKey(targetAliases[rawKey] || rawKey);
    const resolvedKey = trackedByKey.has(rawKey)
      ? rawKey
      : trackedByKey.has(aliasKey)
      ? aliasKey
      : rawKey;

    const existing = summary.get(resolvedKey) || {
      muscle: trackedByKey.get(resolvedKey) || item.muscle,
      count: 0,
      exercises_info: [],
    };
    existing.count += item.count;
    existing.exercises_info.push(...(item.exercises_info || []));
    summary.set(resolvedKey, existing);
  });

  return Array.from(summary.values());
}

export function buildMuscleFocusRows({
  muscles,
  weeklyTargets,
  defaultWeeklyTargets,
  targetAliases = {},
  targetAggregates = {},
  periodMode,
  startDate,
  endDate,
  now = new Date(),
}: {
  muscles: Array<{ muscle: string; completedSets: number }>;
  weeklyTargets: Record<string, number>;
  defaultWeeklyTargets: Record<string, number>;
  targetAliases?: Record<string, string>;
  targetAggregates?: Record<string, string[]>;
  periodMode: MuscleFocusPeriodMode;
  startDate?: Date;
  endDate?: Date;
  now?: Date;
}): MuscleFocusProgressRow[] {
  const weekDivisor =
    periodMode === 'month' && startDate && endDate
      ? Math.max(
          1,
          (Math.max(
            1,
            Math.floor(
              ((Math.min(endDate.getTime(), now.getTime()) - startDate.getTime()) /
                86400000),
            ) + 1,
          )) / 7,
        )
      : 1;

  const merged = Array.from(
    muscles.reduce((result, item) => {
      const key = normalizeMuscleTargetKey(item.muscle);
      const existing = result.get(key);
      result.set(key, {
        muscle: existing?.muscle || item.muscle,
        completedSets: (existing?.completedSets ?? 0) + item.completedSets,
      });
      return result;
    }, new Map<string, { muscle: string; completedSets: number }>()),
  ).map(([, value]) => value);

  return merged.map(item => {
    const muscleKey = normalizeMuscleTargetKey(item.muscle);
    const targetKey = normalizeMuscleTargetKey(targetAliases[muscleKey] || muscleKey);
    const aggregateTargets = targetAggregates[targetKey]?.map(normalizeMuscleTargetKey) || [];
    const aggregateTarget = aggregateTargets.reduce(
      (sum, muscle) => sum + (weeklyTargets[muscle] ?? defaultWeeklyTargets[muscle] ?? 0),
      0,
    );
    const weeklyTarget = Math.max(
      0,
      weeklyTargets[muscleKey] ??
        defaultWeeklyTargets[muscleKey] ??
        weeklyTargets[targetKey] ??
        (aggregateTargets.length ? aggregateTarget : undefined) ??
        defaultWeeklyTargets[targetKey] ??
        0,
    );
    const weeklyAverage =
      periodMode === 'month' ? item.completedSets / weekDivisor : item.completedSets;
    const comparisonSets = Number(weeklyAverage.toFixed(1));
    const progressPercent = weeklyTarget > 0 ? (comparisonSets / weeklyTarget) * 100 : 0;
    const intensity: 1 | 2 | 3 =
      progressPercent >= 100 ? 3 : progressPercent >= 50 ? 2 : 1;

    return {
      muscle: item.muscle,
      completedSets: item.completedSets,
      comparisonSets,
      weeklyAverage: comparisonSets,
      weeklyTarget,
      progressPercent,
      intensity,
    };
  });
}

export function buildMuscleFocusSplit(
  rows: Array<Pick<MuscleFocusProgressRow, 'muscle' | 'completedSets'>>,
) {
  const totalSets = rows.reduce((sum, row) => sum + row.completedSets, 0);
  return Object.fromEntries(
    rows.map(row => [row.muscle, totalSets > 0 ? (row.completedSets / totalSets) * 100 : 0]),
  );
}

export function getWeeklyMuscleRegionData({
  muscles,
  targetOverrides = {},
  progressRows,
}: {
  muscles: { muscle: string; count: number; exercises_info?: any[] }[];
  weekNumber?: number;
  timeRange?: 'this_week' | 'this_month' | 'all_time';
  targetOverrides?: MuscleTargetOverrides;
  progressRows?: MuscleFocusProgressRow[];
}) {
  const muscleCountMap = muscles.reduce((result, item) => {
    result[item.muscle] = item.count;
    return result;
  }, {} as Record<string, number>);

  const groupIntensity = muscles.reduce((result, item) => {
    const group = GROUP_MAP[normalizeGroupMuscle(item.muscle)];
    if (group) result[group] = (result[group] || 0) + item.count;
    return result;
  }, {} as Record<string, number>);

  const notGrouped = progressRows
    ? progressRows.map(row => ({
        muscle: row.muscle,
        count: row.comparisonSets,
        completedSets: row.completedSets,
        weeklyAverage: row.weeklyAverage,
        target: row.weeklyTarget,
        progressPercent: row.progressPercent,
        intensity: row.intensity,
      }))
    : Object.keys(muscleCountMap).map(muscle => {
        const count = muscleCountMap[muscle];
        const target =
          targetOverrides[muscle] ?? getDefaultMuscleTarget(normalizeGroupMuscle(muscle));
        const progressPercent = target > 0 ? (count / target) * 100 : 0;
        return {
          muscle,
          count,
          completedSets: count,
          weeklyAverage: count,
          target,
          progressPercent,
          intensity: progressPercent >= 100 ? 3 : progressPercent >= 50 ? 2 : 1,
        };
      });

  const frontMuscles: Array<{ slug: string; intensity: number }> = [];
  const backMuscles: Array<{ slug: string; intensity: number }> = [];

  notGrouped.forEach(item => {
    const highlights = getMuscleHighlightInfo(item.muscle);
    highlights.forEach(highlight => {
      const target = highlight.region === 'Front' ? frontMuscles : backMuscles;
      if (!target.some(entry => entry.slug === highlight.slug)) {
        target.push({ slug: highlight.slug, intensity: item.intensity });
      }
    });
  });

  return {
    notGrouped,
    groupIntensity,
    frontMuscles,
    backMuscles,
    highlightColor: '#F5A623',
  };
}
