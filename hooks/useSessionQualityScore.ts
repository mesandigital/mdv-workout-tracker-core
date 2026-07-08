import { useQuery } from '@tanstack/react-query';
import { selectRaw, selectRawOne } from '../db';
import { getExerciseGapInfo, detectPlateauForExercise } from '../sessions';

type SessionQualityRating = 'Elite' | 'Strong' | 'Solid' | 'Low';

type QualitySet = {
  setNumber: number;
  reps: number;
  completed: number;
  plannedReps: number;
  weight: number;
  loggedAt: string | null;
};

type QualityExercise = {
  exerciseLogId: number;
  exerciseId: number;
  name: string;
  primaryMuscle: string | null;
  secondaryMuscles: string[];
  plannedSets: number;
  plannedReps: number;
  weight: number;
  sets: QualitySet[];
};

type PreviousExerciseSession = {
  sessionId: number;
  date: string;
  sets: Array<{ setNumber: number; weight: number; reps: number; completed: number; plannedReps: number }>;
};

type SessionQualitySource = {
  sessionId: number;
  workoutId: number;
  workoutName: string;
  startedAt: string;
  finishedAt: string | null;
  duration: number | null;
  workoutType?: string | null;
  exercises: QualityExercise[];
  previousSessionsByExercise: Record<number, PreviousExerciseSession[]>;
  recentSessionVolumes: Array<{ sessionId: number; startedAt: string; finishedAt: string | null; volume: number }>;
  weekMuscleSetsBefore: Record<string, number>;
};

export type SessionQualityDetail = {
  exerciseId: number;
  exerciseName: string;
  type: 'pr' | 'improvement' | 'plateauBroken' | 'gapRecovered';
  title: string;
  description: string;
  previousBestSetLabel?: string;
  previousBestDateLabel?: string;
  currentBestSetLabel?: string;
  previousSessionDebugSets?: Array<{
    setNumber: number;
    weight: number;
    reps: number;
    plannedReps: number;
    completed: number;
  }>;
  previousWeight?: number;
  newWeight?: number;
  previousReps?: number;
  newReps?: number;
  previousVolume?: number;
  newVolume?: number;
  daysSinceLast?: number;
  muscles?: string[];
};

export type SessionQualityTopLift = {
  exerciseId: number;
  exerciseName: string;
  bestSetLabel?: string;
  bestSetScore: number;
  volume: number;
  completedSets: number;
};

export type SessionQualityMissedWork = {
  exerciseId: number;
  exerciseName: string;
  plannedSets: number;
  completedSets: number;
  missedSets: number;
  primaryMuscle?: string;
};

export type SessionQualityFatigueFlag = {
  type: 'volumeSpike' | 'hardSession' | 'decline';
  title: string;
  description: string;
};

export type SessionQualityNextTarget = {
  target: string;
  reason: string;
};

export type SessionQualityScore = {
  qualityScore: number;
  rating: SessionQualityRating;
  summaryInsight: string;
  positiveInsights: string[];
  coachingRecommendation: string;
  components: {
    completion: number;
    performance: number;
    balance: number;
    recoveryFatigue: number;
    consistency: number;
    recoveryDebt: number;
  };
  metrics: {
    completedSets: number;
    plannedSets: number;
    setsNotCompleted: number;
    setCompletionLabel: string;
    incompleteExercises: number;
    skippedExercises: number;
    prCount: number;
    improvedExerciseCount: number;
    plateauBrokenCount: number;
    recoveredGapMuscles: string[];
    recoveredGapExercises: string[];
    neglectedMusclesTrained: string[];
    volumeSpikeRatio: number;
    sessionDurationSeconds: number;
    sessionDurationMinutes: number;
    sessionDurationLabel: string;
    lastLoggedSetAt: string | null;
  };
  details: {
    prs: SessionQualityDetail[];
    improvements: SessionQualityDetail[];
    plateauBreaks: SessionQualityDetail[];
    recoveredGaps: SessionQualityDetail[];
    topLifts: SessionQualityTopLift[];
    missedWork: SessionQualityMissedWork[];
    muscleFocus: {
      trainedMuscles: string[];
      undertrainedMuscles: string[];
    };
    fatigueFlags: SessionQualityFatigueFlag[];
    nextSessionTarget: SessionQualityNextTarget;
  };
};

const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));

const toNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseSecondaryMuscles = (value: unknown): string[] => {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter((muscle): muscle is string => typeof muscle === 'string');
  if (typeof value !== 'string') return [];

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.filter((muscle): muscle is string => typeof muscle === 'string');
    }
  } catch {
    // Fall through to comma-separated parsing.
  }

  return value.split(',').map(muscle => muscle.trim()).filter(Boolean);
};

const normalizeMuscle = (muscle: string | null | undefined) => (
  String(muscle || '')
    .trim()
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
);

const formatMuscle = (muscle: string) => (
  muscle
    .split(' ')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
);

const unique = <T,>(items: T[]) => Array.from(new Set(items));

const getExerciseMuscles = (exercise: QualityExercise) => (
  unique([exercise.primaryMuscle, ...exercise.secondaryMuscles].map(normalizeMuscle).filter(Boolean))
);

const getSetVolume = (set: { weight?: number | null; reps?: number | null; completed?: number | boolean }) => (
  (set.completed === 1 || set.completed === true ? 1 : 0) * toNumber(set.weight) * toNumber(set.reps)
);

const getSessionVolume = (exercises: QualityExercise[]) => (
  exercises.reduce((sum, exercise) => sum + exercise.sets.reduce((setSum, set) => setSum + getSetVolume(set), 0), 0)
);

const getCompletedSetCount = (exercise: QualityExercise) => (
  exercise.sets.filter(set => set.completed === 1).length
);

const getPlannedSetCount = (exercise: QualityExercise) => (
  exercise.sets.length
);

const getBestSetScore = (sets: Array<{ weight: number; reps: number; completed?: number }>) => (
  sets.reduce((best, set) => Math.max(best, toNumber(set.weight) * toNumber(set.reps)), 0)
);

const getBestSet = (sets: Array<{ weight: number; reps: number; completed?: number }>) => (
  sets.reduce<{ weight: number; reps: number; score: number } | null>((best, set) => {
    const weight = toNumber(set.weight);
    const reps = toNumber(set.reps);
    const score = weight * reps;
    if (!best || score > best.score) return { weight, reps, score };
    return best;
  }, null)
);

const getBestWeight = (sets: Array<{ weight: number; completed?: number }>) => (
  sets.reduce((best, set) => Math.max(best, toNumber(set.weight)), 0)
);

const getBestReps = (sets: Array<{ reps: number; completed?: number }>) => (
  sets.reduce((best, set) => Math.max(best, toNumber(set.reps)), 0)
);

const getSessionSetVolume = (sets: Array<{ weight: number; reps: number; completed?: number }>) => (
  sets.reduce((sum, set) => sum + toNumber(set.weight) * toNumber(set.reps), 0)
);

const formatLoad = (weight?: number, reps?: number) => (
  `${toNumber(weight)}kg x ${toNumber(reps)}`
);

const formatBestSetLabel = (set?: { weight: number; reps: number } | null) => (
  set ? formatLoad(set.weight, set.reps) : undefined
);

const formatDate = (date: string | null | undefined) => {
  if (!date) return null;
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const formatPreviousBestDate = (date: string | null | undefined) => {
  const formatted = formatDate(date);
  return formatted ? `Achieved ${formatted}` : undefined;
};

const formatDuration = (seconds: number) => {
  if (seconds <= 0) return '0 min';
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
};

const getRating = (score: number): SessionQualityRating => {
  if (score >= 85) return 'Elite';
  if (score >= 70) return 'Strong';
  if (score >= 50) return 'Solid';
  return 'Low';
};

const pickStable = (items: string[], seed: number) => (
  items[Math.abs(seed) % items.length]
);

const getSessionSummaryInsight = ({
  sessionId,
  completionRate,
  sessionDurationSeconds,
}: {
  sessionId: number;
  completionRate: number;
  sessionDurationSeconds: number;
}) => {
  const completionPercentage = Math.round(completionRate * 100);
  const minutes = Math.floor(sessionDurationSeconds / 60);
  const pick = (items: string[]) => pickStable(items, sessionId + completionPercentage + minutes);

  if (completionPercentage === 100) {
    if (minutes < 20) {
      return pick([
        'Super quick - blitzed through your workout!',
        'Lightning fast! You wasted no time.',
        'Express session - maximum efficiency!',
      ]);
    }
    if (minutes < 35) {
      return pick([
        'Quick and efficient session!',
        'In and out - great time management.',
        'You kept it tight and focused.',
      ]);
    }
    if (minutes < 50) {
      return pick([
        'Great focus - kept things moving.',
        'Smooth and steady - nice pacing.',
        'You maintained a strong tempo.',
      ]);
    }
    if (minutes < 70) {
      return pick([
        'Solid workout pace.',
        'Balanced session - well done.',
        'Consistent effort from start to finish.',
      ]);
    }
    if (minutes < 90) {
      return pick([
        'Great endurance - long session!',
        'You pushed through a lengthy workout.',
        'Stamina on display - impressive!',
      ]);
    }
    if (minutes < 120) {
      return pick([
        'Epic grind - serious dedication!',
        'You went the distance - amazing commitment.',
        'That was a marathon - way to stick with it!',
      ]);
    }
    return pick([
      'Marathon workout! Impressive commitment.',
      'Ultra-long session - legendary effort!',
      'Endurance champion - what a grind!',
    ]);
  }

  if (completionPercentage >= 90) {
    return pick([
      'So close! Just a set or two from perfect.',
      'Almost nailed it - next time, go for 100%.',
      'You nearly completed every set - awesome effort!',
    ]);
  }
  if (completionPercentage >= 80) {
    return pick([
      'Almost there! Push for full completion next time.',
      'Great work - just a little more for perfection.',
      'Strong session - finish those last sets next time!',
    ]);
  }
  if (completionPercentage >= 65) {
    return pick([
      'Good effort - try to finish all sets next time.',
      'Solid progress - aim for a few more sets.',
      'You got most of it done - keep pushing!',
    ]);
  }
  if (completionPercentage >= 50) {
    return pick([
      'Halfway there - consistency is key!',
      'You made it past the halfway mark - nice!',
      'Keep building that momentum.',
    ]);
  }
  if (completionPercentage >= 30) {
    return pick([
      'Some progress - try to push further next session.',
      'You got started - next time, go further.',
      'A little is better than nothing - keep at it!',
    ]);
  }
  if (completionPercentage > 0) {
    return pick([
      'Session started, but lots left to complete.',
      'You dipped your toes in - next time, dive deeper.',
      'A start is a start - finish strong next time!',
    ]);
  }
  return pick([
    'Workout planned, but not started.',
    'Ready when you are - let us get moving!',
    'Session is waiting for you - go crush it!',
  ]);
};

const getWeekStart = (date: Date) => {
  const result = new Date(date);
  const day = result.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  result.setDate(result.getDate() + diff);
  result.setHours(0, 0, 0, 0);
  return result;
};

const getDistributionBalance = (values: number[]) => {
  const activeValues = values.filter(value => value > 0);
  if (activeValues.length <= 1) return activeValues.length;
  const total = activeValues.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return 0;
  const mean = total / activeValues.length;
  const variance = activeValues.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / activeValues.length;
  const coefficient = Math.sqrt(variance) / mean;
  return clamp(1 - coefficient, 0, 1);
};

async function fetchPreviousExerciseSessions(exerciseId: number, currentSessionId: number, startedAt: string) {
  const rows = await selectRaw<{
    sessionId: number;
    date: string;
    weight: number | null;
    reps: number | null;
    completed: number;
    planned_reps: number | null;
    setNumber: number | null;
  }>(
    `
    SELECT
      ws.id as sessionId,
      COALESCE(ws.finished_at, ws.started_at) as date,
      sl.weight,
      sl.reps,
      sl.completed,
      sl.planned_reps,
      sl.set_number as setNumber
    FROM workout_sessions ws
    JOIN exercise_logs el ON el.workout_session_id = ws.id
    JOIN set_logs sl ON sl.exercise_log_id = el.id
    WHERE el.exercise_id = ?
      AND ws.id != ?
      AND ws.finished_at IS NOT NULL
      AND datetime(COALESCE(ws.finished_at, ws.started_at)) < datetime(?)
    ORDER BY datetime(COALESCE(ws.finished_at, ws.started_at)) DESC, sl.set_number ASC
    LIMIT 80
    `,
    [exerciseId, currentSessionId, startedAt]
  );

  const grouped = new Map<number, PreviousExerciseSession>();
  rows.forEach(row => {
    const session = grouped.get(row.sessionId) || {
      sessionId: row.sessionId,
      date: row.date,
      sets: [],
    };
    session.sets.push({
      setNumber: toNumber(row.setNumber),
      weight: toNumber(row.weight),
      reps: toNumber(row.reps),
      completed: toNumber(row.completed),
      plannedReps: toNumber(row.planned_reps),
    });
    grouped.set(row.sessionId, session);
  });

  return Array.from(grouped.values());
}

async function fetchSessionQualitySource(sessionId: number): Promise<SessionQualitySource | null> {
  const session = await selectRawOne<{
    sessionId: number;
    workoutId: number;
    workoutName: string;
    startedAt: string;
    finishedAt: string | null;
    duration: number | null;
    workoutType?: string | null;
  }>(
    `
    SELECT
      ws.id as sessionId,
      ws.workout_id as workoutId,
      w.name as workoutName,
      w.type as workoutType,
      ws.started_at as startedAt,
      ws.finished_at as finishedAt,
      ws.duration
    FROM workout_sessions ws
    JOIN workouts w ON w.id = ws.workout_id
    WHERE ws.id = ?
    `,
    [sessionId]
  );

  if (!session) return null;

  const rows = await selectRaw<{
    exerciseLogId: number;
    exerciseId: number;
    exerciseName: string;
    primaryMuscle: string | null;
    secondaryMuscles: string | null;
    plannedSets: number | null;
    plannedReps: number | null;
    exerciseWeight: number | null;
    setNumber: number | null;
    setReps: number | null;
    setCompleted: number | null;
    setPlannedReps: number | null;
    setWeight: number | null;
    setLoggedAt: string | null;
  }>(
    `
    SELECT
      el.id as exerciseLogId,
      e.id as exerciseId,
      e.name as exerciseName,
      e.primary_muscle as primaryMuscle,
      e.secondary_muscles as secondaryMuscles,
      el.planned_sets as plannedSets,
      el.planned_reps as plannedReps,
      el.weight as exerciseWeight,
      sl.set_number as setNumber,
      sl.reps as setReps,
      sl.completed as setCompleted,
      sl.planned_reps as setPlannedReps,
      sl.weight as setWeight,
      NULL as setLoggedAt
    FROM exercise_logs el
    JOIN exercises e ON e.id = el.exercise_id
    LEFT JOIN set_logs sl ON sl.exercise_log_id = el.id
    WHERE el.workout_session_id = ?
    ORDER BY el.order_index ASC, el.id ASC, sl.set_number ASC
    `,
    [sessionId]
  );

  const exercisesByLog = new Map<number, QualityExercise>();
  rows.forEach(row => {
    const exercise = exercisesByLog.get(row.exerciseLogId) || {
      exerciseLogId: row.exerciseLogId,
      exerciseId: row.exerciseId,
      name: row.exerciseName || 'Exercise',
      primaryMuscle: row.primaryMuscle,
      secondaryMuscles: parseSecondaryMuscles(row.secondaryMuscles),
      plannedSets: toNumber(row.plannedSets),
      plannedReps: toNumber(row.plannedReps),
      weight: toNumber(row.exerciseWeight),
      sets: [],
    };

    if (row.setNumber != null) {
      exercise.sets.push({
        setNumber: toNumber(row.setNumber),
        reps: toNumber(row.setReps),
        completed: toNumber(row.setCompleted),
        plannedReps: toNumber(row.setPlannedReps, exercise.plannedReps),
        weight: toNumber(row.setWeight, exercise.weight),
        loggedAt: row.setLoggedAt,
      });
    }

    exercisesByLog.set(row.exerciseLogId, exercise);
  });

  const exercises = Array.from(exercisesByLog.values());
  const previousSessionsEntries = await Promise.all(
    exercises.map(async exercise => [
      exercise.exerciseId,
      await fetchPreviousExerciseSessions(exercise.exerciseId, sessionId, session.startedAt),
    ] as const)
  );
  const previousSessionsByExercise = Object.fromEntries(previousSessionsEntries);

  const recentRows = await selectRaw<{
    sessionId: number;
    startedAt: string;
    finishedAt: string | null;
    volume: number | null;
  }>(
    `
    SELECT
      ws.id as sessionId,
      ws.started_at as startedAt,
      ws.finished_at as finishedAt,
      SUM(CASE WHEN sl.completed = 1 THEN COALESCE(sl.weight, 0) * COALESCE(sl.reps, 0) ELSE 0 END) as volume
    FROM workout_sessions ws
    LEFT JOIN exercise_logs el ON el.workout_session_id = ws.id
    LEFT JOIN set_logs sl ON sl.exercise_log_id = el.id
    WHERE ws.finished_at IS NOT NULL
      AND datetime(COALESCE(ws.finished_at, ws.started_at)) < datetime(?)
    GROUP BY ws.id
    ORDER BY datetime(COALESCE(ws.finished_at, ws.started_at)) DESC
    LIMIT 5
    `,
    [session.startedAt]
  );

  const started = new Date(session.startedAt);
  const weekStart = getWeekStart(started);
  const weekMuscleRows = await selectRaw<{
    primaryMuscle: string | null;
    secondaryMuscles: string | null;
    completedSets: number | null;
  }>(
    `
    SELECT
      e.primary_muscle as primaryMuscle,
      e.secondary_muscles as secondaryMuscles,
      SUM(CASE WHEN sl.completed = 1 THEN 1 ELSE 0 END) as completedSets
    FROM workout_sessions ws
    JOIN exercise_logs el ON el.workout_session_id = ws.id
    JOIN exercises e ON e.id = el.exercise_id
    JOIN set_logs sl ON sl.exercise_log_id = el.id
    WHERE ws.id != ?
      AND ws.finished_at IS NOT NULL
      AND datetime(COALESCE(ws.finished_at, ws.started_at)) >= datetime(?)
      AND datetime(COALESCE(ws.finished_at, ws.started_at)) < datetime(?)
    GROUP BY e.id
    `,
    [sessionId, weekStart.toISOString(), session.startedAt]
  );

  const weekMuscleSetsBefore = weekMuscleRows.reduce<Record<string, number>>((acc, row) => {
    const muscles = unique([row.primaryMuscle, ...parseSecondaryMuscles(row.secondaryMuscles)].map(normalizeMuscle).filter(Boolean));
    muscles.forEach(muscle => {
      acc[muscle] = (acc[muscle] || 0) + toNumber(row.completedSets);
    });
    return acc;
  }, {});

  return {
    ...session,
    exercises,
    previousSessionsByExercise,
    recentSessionVolumes: recentRows.map(row => ({
      sessionId: row.sessionId,
      startedAt: row.startedAt,
      finishedAt: row.finishedAt,
      volume: toNumber(row.volume),
    })),
    weekMuscleSetsBefore,
  };
}

export function calculateSessionQualityScore(source: SessionQualitySource | null): SessionQualityScore | null {
  if (!source || source.exercises.length === 0) return null;

  const plannedSets = source.exercises.reduce(
    (sum, exercise) => sum + getPlannedSetCount(exercise),
    0
  );
  const completedSets = source.exercises.reduce((sum, exercise) => sum + getCompletedSetCount(exercise), 0);
  const setsNotCompleted = Math.max(0, plannedSets - completedSets);
  const lastLoggedSetAt = source.finishedAt;
  const sessionDurationSeconds = lastLoggedSetAt
    ? Math.max(0, Math.round((new Date(lastLoggedSetAt).getTime() - new Date(source.startedAt).getTime()) / 1000))
    : 0;
  const incompleteExercises = source.exercises.filter(exercise => getCompletedSetCount(exercise) < getPlannedSetCount(exercise)).length;
  const skippedExercises = source.exercises.filter(exercise => getPlannedSetCount(exercise) > 0 && getCompletedSetCount(exercise) === 0).length;
  const completedExerciseCount = source.exercises.filter(exercise => getCompletedSetCount(exercise) > 0).length;
  const completionRate = plannedSets > 0 ? completedSets / plannedSets : 0;
  const exerciseCompletionRate = source.exercises.length > 0
    ? (source.exercises.length - incompleteExercises) / source.exercises.length
    : 0;
  const completion = clamp((completionRate * 75) + (exerciseCompletionRate * 25));

  let prCount = 0;
  let improvedExerciseCount = 0;
  let plateauBrokenCount = 0;
  const recoveredGapExercises: string[] = [];
  const recoveredGapMuscles: string[] = [];
  const neglectedMusclesTrained: string[] = [];
  const currentMuscleSets: Record<string, number> = {};
  const prs: SessionQualityDetail[] = [];
  const improvements: SessionQualityDetail[] = [];
  const plateauBreaks: SessionQualityDetail[] = [];
  const recoveredGaps: SessionQualityDetail[] = [];
  const topLifts: SessionQualityTopLift[] = [];
  const missedWork: SessionQualityMissedWork[] = source.exercises
    .map(exercise => {
      const planned = getPlannedSetCount(exercise);
      const completed = getCompletedSetCount(exercise);
      return {
        exerciseId: exercise.exerciseId,
        exerciseName: exercise.name,
        plannedSets: planned,
        completedSets: completed,
        missedSets: Math.max(0, planned - completed),
        primaryMuscle: exercise.primaryMuscle ? formatMuscle(normalizeMuscle(exercise.primaryMuscle)) : undefined,
      };
    })
    .filter(exercise => exercise.missedSets > 0);

  source.exercises.forEach(exercise => {
    const completedCurrentSets = exercise.sets.filter(set => set.completed === 1);
    if (completedCurrentSets.length === 0) return;

    const currentBestSet = getBestSetScore(completedCurrentSets);
    const currentBestSetDetail = getBestSet(completedCurrentSets);
    const currentBestWeight = getBestWeight(completedCurrentSets);
    const currentBestReps = getBestReps(completedCurrentSets);
    const currentVolume = getSessionSetVolume(completedCurrentSets);
    const previousSessions = source.previousSessionsByExercise[exercise.exerciseId] || [];
    const previousCompletedSessions = previousSessions
      .map(session => ({
        ...session,
        sets: session.sets.filter(set => set.completed === 1),
      }))
      .filter(session => session.sets.length > 0);
    const previousSessionDebugSets = previousSessions[0]?.sets.map(set => ({
      setNumber: set.setNumber,
      weight: set.weight,
      reps: set.reps,
      plannedReps: set.plannedReps,
      completed: set.completed,
    }));
    const previousBestSet = Math.max(0, ...previousCompletedSessions.map(session => getBestSetScore(session.sets)));
    const previousBestSetSession = previousCompletedSessions.reduce<PreviousExerciseSession | null>((best, session) => {
      if (!best) return session;
      return getBestSetScore(session.sets) > getBestSetScore(best.sets) ? session : best;
    }, null);
    const previousBestSetDetail = previousBestSetSession ? getBestSet(previousBestSetSession.sets) : null;
    const previousBestDateLabel = formatPreviousBestDate(previousBestSetSession?.date);
    const previousBestWeight = Math.max(0, ...previousCompletedSessions.map(session => getBestWeight(session.sets)));
    const previousBestReps = Math.max(0, ...previousCompletedSessions.map(session => getBestReps(session.sets)));
    const lastPreviousSession = previousCompletedSessions[0];
    const lastPreviousVolume = lastPreviousSession ? getSessionSetVolume(lastPreviousSession.sets) : 0;
    const exerciseMuscles = getExerciseMuscles(exercise).map(formatMuscle);

    topLifts.push({
      exerciseId: exercise.exerciseId,
      exerciseName: exercise.name,
      bestSetLabel: formatBestSetLabel(currentBestSetDetail),
      bestSetScore: currentBestSet,
      volume: currentVolume,
      completedSets: completedCurrentSets.length,
    });

    if (currentBestSet > 0 && previousBestSet > 0 && currentBestSet > previousBestSet) {
      prCount += 1;
      prs.push({
        exerciseId: exercise.exerciseId,
        exerciseName: exercise.name,
        type: 'pr',
        title: `${exercise.name} PR`,
        description: previousBestSetDetail && currentBestSetDetail
          ? `Best set improved from ${formatLoad(previousBestSetDetail.weight, previousBestSetDetail.reps)} to ${formatLoad(currentBestSetDetail.weight, currentBestSetDetail.reps)}.`
          : `Best set improved to ${formatLoad(currentBestSetDetail?.weight, currentBestSetDetail?.reps)}.`,
        previousBestSetLabel: formatBestSetLabel(previousBestSetDetail),
        previousBestDateLabel,
        currentBestSetLabel: formatBestSetLabel(currentBestSetDetail),
        previousSessionDebugSets,
        previousWeight: previousBestSetDetail?.weight,
        newWeight: currentBestSetDetail?.weight,
        previousReps: previousBestSetDetail?.reps,
        newReps: currentBestSetDetail?.reps,
        previousVolume: previousBestSet,
        newVolume: currentBestSet,
        muscles: exerciseMuscles,
      });
    }
    if (
      (currentBestWeight > previousBestWeight && previousBestWeight > 0) ||
      (currentBestReps > previousBestReps && previousBestReps > 0) ||
      (currentVolume > 0 && previousCompletedSessions[0] && currentVolume > getSessionSetVolume(previousCompletedSessions[0].sets))
    ) {
      improvedExerciseCount += 1;
      improvements.push({
        exerciseId: exercise.exerciseId,
        exerciseName: exercise.name,
        type: 'improvement',
        title: `${exercise.name} progressed`,
        description: [
          currentBestWeight > previousBestWeight && previousBestWeight > 0
            ? `weight ${previousBestWeight}kg -> ${currentBestWeight}kg`
            : null,
          currentBestReps > previousBestReps && previousBestReps > 0
            ? `reps ${previousBestReps} -> ${currentBestReps}`
            : null,
          currentVolume > lastPreviousVolume && lastPreviousVolume > 0
            ? `volume ${Math.round(lastPreviousVolume)} -> ${Math.round(currentVolume)}`
            : null,
        ].filter(Boolean).join(', '),
        previousBestSetLabel: formatBestSetLabel(previousBestSetDetail),
        previousBestDateLabel,
        currentBestSetLabel: formatBestSetLabel(currentBestSetDetail),
        previousSessionDebugSets,
        previousWeight: previousBestWeight || undefined,
        newWeight: currentBestWeight || undefined,
        previousReps: previousBestReps || undefined,
        newReps: currentBestReps || undefined,
        previousVolume: lastPreviousVolume || undefined,
        newVolume: currentVolume || undefined,
        muscles: exerciseMuscles,
      });
    }

    const previousPlateau = detectPlateauForExercise(
      exercise.exerciseId,
      exercise.name,
      previousCompletedSessions.slice(0, 4).map(session => ({ date: session.date, sets: session.sets }))
    );
    if (previousPlateau?.plateau && currentBestSet > Math.max(...previousPlateau.scores, 0) * 1.05) {
      plateauBrokenCount += 1;
      plateauBreaks.push({
        exerciseId: exercise.exerciseId,
        exerciseName: exercise.name,
        type: 'plateauBroken',
        title: `${exercise.name} plateau broken`,
        description: `Recent plateau score ${Math.round(Math.max(...previousPlateau.scores, 0))} moved to ${Math.round(currentBestSet)}.`,
        previousBestSetLabel: formatBestSetLabel(previousBestSetDetail),
        previousBestDateLabel,
        currentBestSetLabel: formatBestSetLabel(currentBestSetDetail),
        previousSessionDebugSets,
        previousWeight: previousBestSetDetail?.weight,
        newWeight: currentBestSetDetail?.weight,
        previousReps: previousBestSetDetail?.reps,
        newReps: currentBestSetDetail?.reps,
        previousVolume: Math.max(...previousPlateau.scores, 0),
        newVolume: currentBestSet,
        muscles: exerciseMuscles,
      });
    }

    const gapInfo = getExerciseGapInfo({
      lastSessionDate: lastPreviousSession?.date,
      today: new Date(source.startedAt),
      exerciseName: exercise.name,
    });
    if (gapInfo) {
      recoveredGapExercises.push(exercise.name);
      exerciseMuscles.forEach(muscle => recoveredGapMuscles.push(muscle));
      recoveredGaps.push({
        exerciseId: exercise.exerciseId,
        exerciseName: exercise.name,
        type: 'gapRecovered',
        title: `${exercise.name} gap recovered`,
        description: `${exercise.name} was trained after ${gapInfo.days} days away${formatDate(lastPreviousSession?.date) ? ` since ${formatDate(lastPreviousSession?.date)}` : ''}.`,
        previousBestSetLabel: formatBestSetLabel(previousBestSetDetail),
        previousBestDateLabel,
        currentBestSetLabel: formatBestSetLabel(currentBestSetDetail),
        previousSessionDebugSets,
        previousWeight: previousBestSetDetail?.weight,
        newWeight: currentBestSetDetail?.weight,
        previousReps: previousBestSetDetail?.reps,
        newReps: currentBestSetDetail?.reps,
        daysSinceLast: gapInfo.days,
        muscles: exerciseMuscles,
      });
    }

    getExerciseMuscles(exercise).forEach(muscle => {
      currentMuscleSets[muscle] = (currentMuscleSets[muscle] || 0) + getCompletedSetCount(exercise);
      if ((source.weekMuscleSetsBefore[muscle] || 0) === 0) {
        neglectedMusclesTrained.push(formatMuscle(muscle));
      }
    });
  });

  const performance = clamp(
    (prCount > 0 ? 45 : 0) +
    (Math.min(improvedExerciseCount, completedExerciseCount) / Math.max(completedExerciseCount, 1)) * 40 +
    (plateauBrokenCount > 0 ? 15 : 0)
  );

  const beforeMuscles = { ...source.weekMuscleSetsBefore };
  const afterMuscles = { ...source.weekMuscleSetsBefore };
  Object.entries(currentMuscleSets).forEach(([muscle, sets]) => {
    afterMuscles[muscle] = (afterMuscles[muscle] || 0) + sets;
  });
  const allWeekMuscles = unique([...Object.keys(beforeMuscles), ...Object.keys(afterMuscles)]);
  const balanceBefore = getDistributionBalance(allWeekMuscles.map(muscle => beforeMuscles[muscle] || 0));
  const balanceAfter = getDistributionBalance(allWeekMuscles.map(muscle => afterMuscles[muscle] || 0));
  const balanceImprovement = Math.max(0, balanceAfter - balanceBefore);
  const balance = clamp(
    (unique(neglectedMusclesTrained).length > 0 ? 45 : 20) +
    (balanceImprovement * 40) +
    (unique(recoveredGapMuscles).length > 0 ? 15 : 0)
  );

  const currentVolume = getSessionVolume(source.exercises);
  const previousVolumes = source.recentSessionVolumes.map(session => session.volume).filter(volume => volume > 0);
  const averageRecentVolume = previousVolumes.length
    ? previousVolumes.reduce((sum, volume) => sum + volume, 0) / previousVolumes.length
    : currentVolume;
  const volumeSpikeRatio = averageRecentVolume > 0 ? currentVolume / averageRecentVolume : 1;
  const previousSession = source.recentSessionVolumes[0];
  const hoursSincePrevious = previousSession
    ? (new Date(source.startedAt).getTime() - new Date(previousSession.finishedAt || previousSession.startedAt).getTime()) / (1000 * 60 * 60)
    : Infinity;
  const excessiveVolumePenalty = volumeSpikeRatio > 1.5 ? 35 : volumeSpikeRatio > 1.25 ? 18 : 0;
  const hardSessionPenalty = hoursSincePrevious < 36 && currentVolume >= averageRecentVolume ? 25 : 0;
  const declinePenalty = completionRate < 0.75 || (improvedExerciseCount === 0 && previousVolumes.length > 0) ? 20 : 0;
  const recoveryFatigue = clamp(100 - excessiveVolumePenalty - hardSessionPenalty - declinePenalty);
  const fatigueFlags: SessionQualityFatigueFlag[] = [
    excessiveVolumePenalty > 0 ? {
      type: 'volumeSpike',
      title: 'Volume spike',
      description: `This session was ${Number(volumeSpikeRatio.toFixed(2))}x your recent average volume.`,
    } : null,
    hardSessionPenalty > 0 ? {
      type: 'hardSession',
      title: 'Hard sessions close together',
      description: `Previous session was about ${Math.max(1, Math.round(hoursSincePrevious))} hours earlier.`,
    } : null,
    declinePenalty > 0 ? {
      type: 'decline',
      title: 'Performance dip signal',
      description: completionRate < 0.75
        ? 'Completion landed below 75% of planned sets.'
        : 'No progress markers were detected compared with recent sessions.',
    } : null,
  ].filter((flag): flag is SessionQualityFatigueFlag => Boolean(flag));

  const isFinished = Boolean(source.finishedAt);
  const sameWorkoutRecently = source.recentSessionVolumes.some(session => session.sessionId !== source.sessionId);
  const consistency = clamp(
    (isFinished ? 50 : 15) +
    (completionRate >= 0.8 ? 30 : completionRate * 30) +
    (sameWorkoutRecently ? 20 : 10)
  );

  const recoveryDebt = clamp(
    (unique(recoveredGapExercises).length > 0 ? 45 : 20) +
    (unique(recoveredGapMuscles).length > 0 ? 35 : 0) +
    (source.workoutType === 'recovery' || /recovery/i.test(source.workoutName) ? 20 : 0)
  );

  const qualityScore = Math.round(clamp(
    completion * 0.3 +
    performance * 0.25 +
    balance * 0.15 +
    recoveryFatigue * 0.1 +
    consistency * 0.1 +
    recoveryDebt * 0.1
  ));

  const positives = [
    prCount > 0 ? `${prCount} PR${prCount === 1 ? '' : 's'} achieved` : null,
    plateauBrokenCount > 0 ? `${plateauBrokenCount} plateau${plateauBrokenCount === 1 ? '' : 's'} broken` : null,
    completionRate >= 1 ? 'All planned exercises completed' : `${Math.round(completionRate * 100)}% of planned sets completed`,
    unique(recoveredGapMuscles).length > 0 ? `${unique(recoveredGapMuscles)[0]} gap recovered` : null,
    unique(neglectedMusclesTrained).length > 0 ? `${unique(neglectedMusclesTrained)[0]} brought back into balance` : null,
    recoveryFatigue >= 80 ? 'Volume stayed in a recoverable range' : null,
  ].filter((item): item is string => Boolean(item));

  const trainedMuscles = Object.keys(currentMuscleSets)
    .sort((a, b) => (currentMuscleSets[b] || 0) - (currentMuscleSets[a] || 0))
    .map(formatMuscle);
  const undertrainedMuscles = allWeekMuscles
    .filter(muscle => (afterMuscles[muscle] || 0) <= 1)
    .sort((a, b) => (afterMuscles[a] || 0) - (afterMuscles[b] || 0))
    .map(formatMuscle)
    .slice(0, 3);
  const nextMuscle = undertrainedMuscles[0] || trainedMuscles[trainedMuscles.length - 1] || null;
  const nextSessionTarget = recoveryFatigue < 65
    ? {
      target: 'Recovery or lighter full-body work',
      reason: 'Fatigue flags suggest reducing load or intensity next session.',
    }
    : completionRate < 0.8
      ? {
        target: 'Finish missed planned work',
        reason: `${setsNotCompleted} planned set${setsNotCompleted === 1 ? '' : 's'} were not completed.`,
      }
      : nextMuscle
        ? {
          target: nextMuscle,
          reason: undertrainedMuscles.includes(nextMuscle)
            ? 'This muscle is currently undertrained in the weekly balance.'
            : 'This muscle had the lowest focus from the muscles trained today.',
        }
        : {
          target: 'Balanced full-body session',
          reason: 'No single weak focus area stood out from this session.',
        };
  const coachingRecommendation = recoveryFatigue < 65
    ? 'Reduce volume or intensity next session to manage fatigue.'
    : completionRate < 0.8
      ? 'Keep the next session focused and finish the remaining planned sets.'
      : nextSessionTarget.target
        ? `Prioritize ${nextSessionTarget.target} next session.`
        : 'Prioritize a balanced full-body session next.';

  return {
    qualityScore,
    rating: getRating(qualityScore),
    summaryInsight: getSessionSummaryInsight({
      sessionId: source.sessionId,
      completionRate,
      sessionDurationSeconds,
    }),
    positiveInsights: positives.slice(0, 3),
    coachingRecommendation,
    components: {
      completion: Math.round(completion),
      performance: Math.round(performance),
      balance: Math.round(balance),
      recoveryFatigue: Math.round(recoveryFatigue),
      consistency: Math.round(consistency),
      recoveryDebt: Math.round(recoveryDebt),
    },
    metrics: {
      completedSets,
      plannedSets,
      setsNotCompleted,
      setCompletionLabel: `${completedSets}/${plannedSets}`,
      incompleteExercises,
      skippedExercises,
      prCount,
      improvedExerciseCount,
      plateauBrokenCount,
      recoveredGapMuscles: unique(recoveredGapMuscles),
      recoveredGapExercises: unique(recoveredGapExercises),
      neglectedMusclesTrained: unique(neglectedMusclesTrained),
      volumeSpikeRatio: Number(volumeSpikeRatio.toFixed(2)),
      sessionDurationSeconds,
      sessionDurationMinutes: Math.round(sessionDurationSeconds / 60),
      sessionDurationLabel: formatDuration(sessionDurationSeconds),
      lastLoggedSetAt,
    },
    details: {
      prs,
      improvements,
      plateauBreaks,
      recoveredGaps,
      topLifts: topLifts
        .sort((a, b) => (b.volume + b.bestSetScore) - (a.volume + a.bestSetScore))
        .slice(0, 3),
      missedWork,
      muscleFocus: {
        trainedMuscles: trainedMuscles.slice(0, 5),
        undertrainedMuscles,
      },
      fatigueFlags,
      nextSessionTarget,
    },
  };
}

export function useSessionQualityScore(sessionId: number | string | null | undefined) {
  const normalizedSessionId = sessionId == null ? null : Number(sessionId);

  return useQuery({
    queryKey: ['sessionQualityScore', normalizedSessionId],
    queryFn: async () => {
      if (!normalizedSessionId || !Number.isFinite(normalizedSessionId)) return null;
      const source = await fetchSessionQualitySource(normalizedSessionId);
      return calculateSessionQualityScore(source);
    },
    enabled: Boolean(normalizedSessionId && Number.isFinite(normalizedSessionId)),
  });
}
