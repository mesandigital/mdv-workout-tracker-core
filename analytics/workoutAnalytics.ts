export type WorkoutDateRange = {
  startDate: Date;
  endDate: Date;
};

export type WorkoutMetricByDate = Record<string, { duration: number; tonnage: number }>;

export type WorkoutLogLike = {
  date?: string;
  startedAt?: string;
  finishedAt?: string | null;
  started_at?: string;
  finished_at?: string | null;
  exercises?: any[] | Array<{
    sets?: Array<{
      completed?: boolean | number;
      reps?: number | string | null;
      weight?: number | string | null;
    }>;
  }>;
  [key: string]: any;
};

export type LastWorkoutInfoExercise = {
  name: string;
  muscles: string;
};

export type LastWorkoutInfo = {
  daysAgo: number;
  workoutName: string;
  date: string;
  exercises: LastWorkoutInfoExercise[];
  muscleList: string;
  workoutLogId: string | number | null;
};

export function getLocalDateKey(dateValue: string | Date) {
  const date = typeof dateValue === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateValue)
    ? new Date(
      Number(dateValue.slice(0, 4)),
      Number(dateValue.slice(5, 7)) - 1,
      Number(dateValue.slice(8, 10)),
    )
    : typeof dateValue === 'string' ? new Date(dateValue) : dateValue;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getLogStartedAt(log: WorkoutLogLike) {
  return log.startedAt || log.started_at || log.date || '';
}

export function getLogFinishedAt(log: WorkoutLogLike) {
  return log.finishedAt || log.finished_at || null;
}

export function getWorkoutDateKey(log: WorkoutLogLike) {
  const startedAt = getLogStartedAt(log);
  return startedAt ? getLocalDateKey(startedAt) : '';
}

export function isCompletedWorkoutLog(log: WorkoutLogLike) {
  return Boolean(getLogStartedAt(log) && getLogFinishedAt(log));
}

export function normalizeDateRange(range: WorkoutDateRange) {
  const start = new Date(range.startDate);
  const end = new Date(range.endDate);
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

export function isDateValueInRange(dateValue: string | Date | undefined, range?: WorkoutDateRange) {
  if (!dateValue || !range) return false;
  const { start, end } = normalizeDateRange(range);
  const date = typeof dateValue === 'string' ? new Date(dateValue) : dateValue;
  return date >= start && date <= end;
}

export function filterLogsByDateRange<T extends WorkoutLogLike>(logs: T[] = [], range?: WorkoutDateRange) {
  if (!range) return logs.filter(isCompletedWorkoutLog);
  return logs.filter(log => isCompletedWorkoutLog(log) && isDateValueInRange(getLogStartedAt(log), range));
}

export function filterDateKeysByDateRange(dateKeys: string[] = [], range?: WorkoutDateRange) {
  if (!range) return Array.from(new Set(dateKeys)).sort();
  const startKey = getLocalDateKey(range.startDate);
  const endKey = getLocalDateKey(range.endDate);
  return Array.from(new Set(dateKeys))
    .filter(dateKey => dateKey >= startKey && dateKey <= endKey)
    .sort();
}

export function getWorkoutDateKeys(logs: WorkoutLogLike[] = []) {
  return Array.from(new Set(
    logs
      .filter(isCompletedWorkoutLog)
      .map(getWorkoutDateKey)
      .filter(Boolean)
  )).sort();
}

export function getWorkoutDurationMinutes(log: WorkoutLogLike) {
  const startedAt = getLogStartedAt(log);
  const finishedAt = getLogFinishedAt(log);
  if (!startedAt || !finishedAt) return 0;

  const duration = Math.round((new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 60000);
  return Number.isFinite(duration) ? Math.max(0, duration) : 0;
}

export function getWorkoutTonnage(log: WorkoutLogLike, options: { completedOnly?: boolean } = {}) {
  const completedOnly = options.completedOnly ?? true;
  if (!Array.isArray(log.exercises)) return 0;

  return log.exercises.reduce((total, exercise) => {
    if (!Array.isArray(exercise?.sets)) return total;

    return total + exercise.sets.reduce((setTotal: number, set: any) => {
      if (completedOnly && !(set?.completed === 1 || set?.completed === true)) return setTotal;
      const weight = Number(set?.weight || 0);
      const reps = Number(set?.reps || 0);
      return setTotal + (Number.isFinite(weight) && Number.isFinite(reps) ? weight * reps : 0);
    }, 0);
  }, 0);
}

export function getWorkoutMetricsByDate(logs: WorkoutLogLike[] = []) {
  const metricByDate: WorkoutMetricByDate = {};

  logs.filter(isCompletedWorkoutLog).forEach(log => {
    const dateKey = getWorkoutDateKey(log);
    if (!dateKey) return;
    if (!metricByDate[dateKey]) {
      metricByDate[dateKey] = { duration: 0, tonnage: 0 };
    }
    metricByDate[dateKey].duration += getWorkoutDurationMinutes(log);
    metricByDate[dateKey].tonnage += getWorkoutTonnage(log);
  });

  return metricByDate;
}

export function getLongestStreak(dateKeys: string[]) {
  const sorted = Array.from(new Set(dateKeys)).sort();
  let longest = 0;
  let current = 0;
  let previous: Date | null = null;

  sorted.forEach(dateKey => {
    const date = new Date(`${dateKey}T00:00:00`);
    if (previous) {
      const diffDays = Math.round((date.getTime() - previous.getTime()) / 86400000);
      current = diffDays === 1 ? current + 1 : 1;
    } else {
      current = 1;
    }
    longest = Math.max(longest, current);
    previous = date;
  });

  return longest;
}

export function getCurrentStreak(dateKeys: string[], referenceDate: Date = new Date()) {
  const dateSet = new Set(dateKeys);
  const cursor = new Date(referenceDate);
  let current = 0;
  cursor.setHours(0, 0, 0, 0);

  while (dateSet.has(getLocalDateKey(cursor))) {
    current += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return current;
}

export function getWorkoutStreaks(dateKeys: string[], referenceDate: Date = new Date()) {
  const uniqueDateKeys = Array.from(new Set(dateKeys)).sort();
  return {
    currentStreak: getCurrentStreak(uniqueDateKeys, referenceDate),
    bestStreak: getLongestStreak(uniqueDateKeys),
  };
}

export function getWorkoutConsistency(dateKeys: string[], range: WorkoutDateRange) {
  const periodDateKeys = filterDateKeysByDateRange(dateKeys, range);
  const start = new Date(range.startDate);
  const end = new Date(range.endDate);
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
  return Math.round((periodDateKeys.length / days) * 100);
}

export function getLastWorkoutInfo(
  sessions: Array<{
    finishedAt?: string | null;
    startedAt?: string | null;
    workoutName?: string | null;
    name?: string | null;
    sessionId?: string | number | null;
    id?: string | number | null;
    exercises?: Array<{
      exerciseName?: string | null;
      name?: string | null;
      primaryMuscle?: string | null;
      primary_muscle?: string | null;
      muscles?: string | null;
    }>;
  }> = [],
): LastWorkoutInfo | null {
  if (!Array.isArray(sessions) || sessions.length === 0) return null;

  const lastSession = sessions
    .filter(session => session.finishedAt || session.startedAt)
    .sort(
      (a, b) =>
        new Date(b.finishedAt || b.startedAt || '').getTime() -
        new Date(a.finishedAt || a.startedAt || '').getTime(),
    )[0];

  if (!lastSession) return null;

  const workoutName = lastSession.workoutName || lastSession.name || 'Workout';
  const workoutLogId = lastSession.sessionId || lastSession.id || null;
  const dateObj = new Date(lastSession.finishedAt || lastSession.startedAt || '');
  const date = dateObj.toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const daysAgo = Math.floor(
    (Date.now() - dateObj.getTime()) / (1000 * 60 * 60 * 24),
  );

  const exercises: LastWorkoutInfoExercise[] = Array.isArray(lastSession.exercises)
    ? lastSession.exercises.map(exercise => ({
        name: exercise.exerciseName || exercise.name || 'Exercise',
        muscles: String(
          exercise.primaryMuscle ||
            exercise.primary_muscle ||
            exercise.muscles ||
            '',
        ),
      }))
    : [];

  const muscleSet = new Set<string>();
  exercises.forEach(exercise => {
    if (!exercise.muscles) return;
    exercise.muscles.split(',').forEach(muscle => muscleSet.add(muscle.trim()));
  });

  const muscleList = Array.from(muscleSet)
    .filter(Boolean)
    .map(muscle => muscle.charAt(0).toUpperCase() + muscle.slice(1).toLowerCase())
    .join(', ');

  return { daysAgo, workoutName, date, exercises, muscleList, workoutLogId };
}
