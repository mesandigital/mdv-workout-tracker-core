import { execute, selectRaw, selectRawOne } from '../db';
import type {
  PersonalRecord,
  PersonalRecordHistoryFilters,
  PersonalRecordHistoryPage,
  PersonalRecordExerciseOption,
  PersonalRecordType,
  PersonalRecordTrendPoint,
  PersonalRecordPeriodComparison,
  EstimatedOneRepMaxPoint,
  PersonalRecordFrequencySummary,
  PersonalRecordPlateauSignal,
} from '../types';

export const PERSONAL_RECORD_CALCULATION_VERSION = 1;
const PR_BACKFILL_KEY = `personal_records_backfill_v${PERSONAL_RECORD_CALCULATION_VERSION}`;

type PersonalRecordSourceFingerprint = {
  completedSetCount: number;
  latestSetLogId: number;
  repsTotal: number;
  weightTotal: number;
  completedTotal: number;
  latestFinishedAt: string | null;
};

type CompletedSetPerformance = {
  sessionId: number;
  exerciseId: number;
  exerciseName: string;
  setLogId: number;
  weight: number | null;
  reps: number;
  achievedAt: string;
};

type ExerciseRecordState = {
  weight: number | null;
  volume: number | null;
  repsByWeight: Map<string, number>;
};

type PersonalRecordCandidate = Omit<PersonalRecord, 'id'>;

const getWeightKey = (weight: number) => String(Math.round(weight * 1000) / 1000);

async function getCompletedSetPerformances(): Promise<CompletedSetPerformance[]> {
  return selectRaw<CompletedSetPerformance>(`
    SELECT
      ws.id AS sessionId,
      el.exercise_id AS exerciseId,
      e.name AS exerciseName,
      sl.id AS setLogId,
      sl.weight,
      sl.reps,
      COALESCE(ws.finished_at, ws.started_at) AS achievedAt
    FROM set_logs sl
    JOIN exercise_logs el ON el.id = sl.exercise_log_id
    JOIN workout_sessions ws ON ws.id = el.workout_session_id
    JOIN exercises e ON e.id = el.exercise_id
    WHERE ws.finished_at IS NOT NULL
      AND sl.reps IS NOT NULL
      AND sl.reps > 0
      AND (sl.completed = 1 OR sl.reps IS NOT NULL)
    ORDER BY datetime(COALESCE(ws.finished_at, ws.started_at)) ASC,
      ws.id ASC,
      el.order_index ASC,
      sl.set_number ASC,
      sl.id ASC
  `);
}

export function calculatePersonalRecordCandidates(
  performances: CompletedSetPerformance[],
  onlySessionId?: number,
): PersonalRecordCandidate[] {
  const stateByExercise = new Map<number, ExerciseRecordState>();
  const candidates: PersonalRecordCandidate[] = [];

  const addCandidate = (
    performance: CompletedSetPerformance,
    recordType: PersonalRecordType,
    value: number,
    previousValue: number | null,
  ) => {
    if (onlySessionId !== undefined && performance.sessionId !== onlySessionId) return;
    candidates.push({
      exercise_id: performance.exerciseId,
      exercise_name: performance.exerciseName,
      workout_session_id: performance.sessionId,
      set_log_id: performance.setLogId,
      record_type: recordType,
      value,
      previous_value: previousValue,
      weight: performance.weight,
      reps: performance.reps,
      achieved_at: performance.achievedAt,
      calculation_version: PERSONAL_RECORD_CALCULATION_VERSION,
    });
  };

  performances.forEach((performance) => {
    const weight = Math.max(0, performance.weight || 0);
    const volume = weight * performance.reps;
    const state = stateByExercise.get(performance.exerciseId) || {
      weight: null,
      volume: null,
      repsByWeight: new Map<string, number>(),
    };

    if (weight > 0 && (state.weight === null || weight > state.weight)) {
      addCandidate(performance, 'weight', weight, state.weight);
      state.weight = weight;
    }

    const weightKey = getWeightKey(weight);
    const previousReps = state.repsByWeight.get(weightKey) ?? null;
    if (previousReps === null || performance.reps > previousReps) {
      addCandidate(performance, 'reps', performance.reps, previousReps);
      state.repsByWeight.set(weightKey, performance.reps);
    }

    if (weight > 0 && (state.volume === null || volume > state.volume)) {
      addCandidate(performance, 'volume', volume, state.volume);
      state.volume = volume;
    }

    stateByExercise.set(performance.exerciseId, state);
  });

  return candidates;
}

async function insertCandidates(candidates: PersonalRecordCandidate[]) {
  for (const record of candidates) {
    await execute(`
      INSERT OR IGNORE INTO personal_records (
        exercise_id,
        workout_session_id,
        set_log_id,
        record_type,
        value,
        previous_value,
        weight,
        reps,
        achieved_at,
        calculation_version,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `, [
      record.exercise_id,
      record.workout_session_id,
      record.set_log_id,
      record.record_type,
      record.value,
      record.previous_value,
      record.weight,
      record.reps,
      record.achieved_at,
      record.calculation_version,
    ]);
  }
}

export async function getPersonalRecordsForSession(sessionId: number): Promise<PersonalRecord[]> {
  return selectRaw<PersonalRecord>(`
    SELECT pr.*, e.name AS exercise_name
    FROM personal_records pr
    JOIN exercises e ON e.id = pr.exercise_id
    WHERE pr.workout_session_id = ?
    ORDER BY pr.exercise_id ASC, pr.set_log_id ASC,
      CASE pr.record_type WHEN 'weight' THEN 1 WHEN 'reps' THEN 2 ELSE 3 END
  `, [sessionId]);
}

export async function getRecentPersonalRecords({
  from,
  to,
  limit = 20,
}: Pick<PersonalRecordHistoryFilters, 'from' | 'to' | 'limit'> = {}): Promise<PersonalRecord[]> {
  const conditions: string[] = [];
  const params: Array<string | number> = [];
  if (from) {
    conditions.push('datetime(pr.achieved_at) >= datetime(?)');
    params.push(from);
  }
  if (to) {
    conditions.push('datetime(pr.achieved_at) <= datetime(?)');
    params.push(to);
  }
  params.push(Math.max(1, Math.min(limit, 100)));

  return selectRaw<PersonalRecord>(`
    SELECT pr.*, e.name AS exercise_name
    FROM personal_records pr
    JOIN exercises e ON e.id = pr.exercise_id
    ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
    ORDER BY datetime(pr.achieved_at) DESC, pr.id DESC
    LIMIT ?
  `, params);
}

export async function getCurrentPersonalRecords(exerciseId?: number): Promise<PersonalRecord[]> {
  const params: number[] = [];
  const exerciseFilter = exerciseId === undefined ? '' : 'AND pr.exercise_id = ?';
  if (exerciseId !== undefined) params.push(exerciseId);

  return selectRaw<PersonalRecord>(`
    SELECT pr.*, e.name AS exercise_name
    FROM personal_records pr
    JOIN exercises e ON e.id = pr.exercise_id
    WHERE NOT EXISTS (
      SELECT 1
      FROM personal_records newer
      WHERE newer.exercise_id = pr.exercise_id
        AND newer.record_type = pr.record_type
        AND (
          newer.value > pr.value
          OR (newer.value = pr.value AND datetime(newer.achieved_at) > datetime(pr.achieved_at))
          OR (newer.value = pr.value AND newer.achieved_at = pr.achieved_at AND newer.id > pr.id)
        )
    )
    ${exerciseFilter}
    ORDER BY e.name ASC, pr.record_type ASC
  `, params);
}

export async function getPersonalRecordExerciseOptions(): Promise<PersonalRecordExerciseOption[]> {
  return selectRaw<PersonalRecordExerciseOption>(`
    SELECT
      pr.exercise_id,
      e.name AS exercise_name,
      COUNT(*) AS record_count
    FROM personal_records pr
    JOIN exercises e ON e.id = pr.exercise_id
    GROUP BY pr.exercise_id, e.name
    ORDER BY e.name ASC
  `);
}

export async function getPersonalRecordHistory(
  filters: PersonalRecordHistoryFilters = {},
): Promise<PersonalRecordHistoryPage> {
  const limit = Math.max(1, Math.min(filters.limit ?? 30, 100));
  const offset = Math.max(0, filters.offset ?? 0);
  const conditions: string[] = [];
  const params: Array<string | number> = [];
  if (filters.exerciseId !== undefined) {
    conditions.push('pr.exercise_id = ?');
    params.push(filters.exerciseId);
  }
  if (filters.recordType) {
    conditions.push('pr.record_type = ?');
    params.push(filters.recordType);
  }
  if (filters.from) {
    conditions.push('datetime(pr.achieved_at) >= datetime(?)');
    params.push(filters.from);
  }
  if (filters.to) {
    conditions.push('datetime(pr.achieved_at) <= datetime(?)');
    params.push(filters.to);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const count = await selectRawOne<{ total: number }>(
    `SELECT COUNT(*) AS total FROM personal_records pr ${where}`,
    params,
  );
  const records = await selectRaw<PersonalRecord>(`
    SELECT pr.*, e.name AS exercise_name
    FROM personal_records pr
    JOIN exercises e ON e.id = pr.exercise_id
    ${where}
    ORDER BY datetime(pr.achieved_at) DESC, pr.id DESC
    LIMIT ? OFFSET ?
  `, [...params, limit, offset]);
  const total = Number(count?.total || 0);
  return { records, total, limit, offset, hasMore: offset + records.length < total };
}

export async function getPersonalRecordTrend({
  exerciseId,
  recordType,
  from,
  to,
  limit = 100,
}: PersonalRecordHistoryFilters = {}): Promise<PersonalRecordTrendPoint[]> {
  const conditions: string[] = [];
  const params: Array<string | number> = [];
  if (exerciseId !== undefined) {
    conditions.push('pr.exercise_id = ?');
    params.push(exerciseId);
  }
  if (recordType) {
    conditions.push('pr.record_type = ?');
    params.push(recordType);
  }
  if (from) {
    conditions.push('datetime(pr.achieved_at) >= datetime(?)');
    params.push(from);
  }
  if (to) {
    conditions.push('datetime(pr.achieved_at) <= datetime(?)');
    params.push(to);
  }
  params.push(Math.max(1, Math.min(limit, 500)));
  return selectRaw<PersonalRecordTrendPoint>(`
    SELECT pr.exercise_id, e.name AS exercise_name, pr.record_type, pr.value, pr.previous_value, pr.achieved_at
    FROM personal_records pr
    JOIN exercises e ON e.id = pr.exercise_id
    ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
    ORDER BY datetime(pr.achieved_at) ASC, pr.id ASC
    LIMIT ?
  `, params);
}

export async function getPersonalRecordPeriodComparison({
  currentFrom,
  currentTo,
  previousFrom,
  previousTo,
  exerciseId,
  recordType,
}: {
  currentFrom: string;
  currentTo: string;
  previousFrom: string;
  previousTo: string;
  exerciseId?: number;
  recordType?: PersonalRecordType;
}): Promise<PersonalRecordPeriodComparison> {
  const buildQuery = async (from: string, to: string) => {
    const conditions = ['datetime(pr.achieved_at) >= datetime(?)', 'datetime(pr.achieved_at) <= datetime(?)'];
    const params: Array<string | number> = [from, to];
    if (exerciseId !== undefined) {
      conditions.push('pr.exercise_id = ?');
      params.push(exerciseId);
    }
    if (recordType) {
      conditions.push('pr.record_type = ?');
      params.push(recordType);
    }
    return selectRawOne<{ count: number; bestValue: number | null }>(`
      SELECT COUNT(*) AS count, MAX(pr.value) AS bestValue
      FROM personal_records pr
      WHERE ${conditions.join(' AND ')}
    `, params);
  };

  const current = await buildQuery(currentFrom, currentTo);
  const previous = await buildQuery(previousFrom, previousTo);
  const currentCount = Number(current?.count || 0);
  const previousCount = Number(previous?.count || 0);
  return {
    currentCount,
    previousCount,
    delta: currentCount - previousCount,
    currentBestValue: current?.bestValue ?? null,
    previousBestValue: previous?.bestValue ?? null,
  };
}

export async function getEstimatedOneRepMaxHistory({
  exerciseId,
  from,
  to,
  limit = 100,
}: Pick<PersonalRecordHistoryFilters, 'exerciseId' | 'from' | 'to' | 'limit'> = {}): Promise<EstimatedOneRepMaxPoint[]> {
  const conditions = ['sl.weight IS NOT NULL', 'sl.weight > 0', 'sl.reps IS NOT NULL', 'sl.reps > 0'];
  const params: Array<string | number> = [];
  if (exerciseId !== undefined) {
    conditions.push('el.exercise_id = ?');
    params.push(exerciseId);
  }
  if (from) {
    conditions.push('datetime(COALESCE(ws.finished_at, ws.started_at)) >= datetime(?)');
    params.push(from);
  }
  if (to) {
    conditions.push('datetime(COALESCE(ws.finished_at, ws.started_at)) <= datetime(?)');
    params.push(to);
  }
  params.push(Math.max(1, Math.min(limit, 500)));

  return selectRaw<EstimatedOneRepMaxPoint>(`
    SELECT
      el.exercise_id,
      e.name AS exercise_name,
      COALESCE(ws.finished_at, ws.started_at) AS achieved_at,
      sl.weight,
      sl.reps,
      ROUND(sl.weight * (1 + (sl.reps / 30.0)), 2) AS estimated_one_rep_max
    FROM set_logs sl
    JOIN exercise_logs el ON el.id = sl.exercise_log_id
    JOIN workout_sessions ws ON ws.id = el.workout_session_id
    JOIN exercises e ON e.id = el.exercise_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY datetime(COALESCE(ws.finished_at, ws.started_at)) ASC, sl.id ASC
    LIMIT ?
  `, params);
}

export async function getPersonalRecordFrequency({
  exerciseId,
  recordType,
  from,
  to,
}: PersonalRecordHistoryFilters = {}): Promise<PersonalRecordFrequencySummary> {
  const records = await getPersonalRecordTrend({ exerciseId, recordType, from, to, limit: 500 });
  if (!records.length) return { total: 0, daysSinceLastPr: null, averageDaysBetweenPrs: null };

  const timestamps = records.map(record => new Date(record.achieved_at).getTime()).filter(Number.isFinite);
  const last = Math.max(...timestamps);
  const daysSinceLastPr = Math.max(0, Math.floor((Date.now() - last) / 86400000));
  const gaps = timestamps.slice(1).map((timestamp, index) => (timestamp - timestamps[index]) / 86400000);
  const averageDaysBetweenPrs = gaps.length
    ? Math.round((gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length) * 10) / 10
    : null;

  return { total: records.length, daysSinceLastPr, averageDaysBetweenPrs };
}

export async function getPersonalRecordPlateauSignal(
  exerciseId: number,
  staleDays = 30,
): Promise<PersonalRecordPlateauSignal> {
  const latest = await selectRawOne<{ exercise_id: number; exercise_name: string; last_pr_at: string | null }>(`
    SELECT pr.exercise_id, e.name AS exercise_name, MAX(pr.achieved_at) AS last_pr_at
    FROM personal_records pr
    JOIN exercises e ON e.id = pr.exercise_id
    WHERE pr.exercise_id = ?
    GROUP BY pr.exercise_id, e.name
  `, [exerciseId]);

  const recentSessions = await selectRawOne<{ total: number }>(`
    SELECT COUNT(DISTINCT ws.id) AS total
    FROM workout_sessions ws
    JOIN exercise_logs el ON el.workout_session_id = ws.id
    WHERE el.exercise_id = ?
      AND ws.finished_at IS NOT NULL
      AND datetime(ws.finished_at) >= datetime('now', '-${Math.max(1, staleDays)} days')
  `, [exerciseId]);

  const daysSinceLastPr = latest?.last_pr_at
    ? Math.max(0, Math.floor((Date.now() - new Date(latest.last_pr_at).getTime()) / 86400000))
    : null;
  const recentSessionCount = Number(recentSessions?.total || 0);
  const plateau = daysSinceLastPr !== null && daysSinceLastPr >= staleDays && recentSessionCount >= 3;

  return {
    exercise_id: exerciseId,
    exercise_name: latest?.exercise_name,
    last_pr_at: latest?.last_pr_at ?? null,
    days_since_last_pr: daysSinceLastPr,
    recent_session_count: recentSessionCount,
    plateau,
    reason: plateau
      ? `No PR in ${daysSinceLastPr} days despite ${recentSessionCount} recent sessions.`
      : 'No plateau signal detected.',
  };
}

export async function persistPersonalRecordsForSession(sessionId: number): Promise<PersonalRecord[]> {
  const performances = await getCompletedSetPerformances();
  const candidates = calculatePersonalRecordCandidates(performances, sessionId);
  await insertCandidates(candidates);
  return getPersonalRecordsForSession(sessionId);
}

async function getPersonalRecordSourceFingerprint(): Promise<PersonalRecordSourceFingerprint> {
  const row = await selectRawOne<{
    completedSetCount: number;
    latestSetLogId: number;
    repsTotal: number;
    weightTotal: number;
    completedTotal: number;
    latestFinishedAt: string | null;
  }>(`
    SELECT
      COUNT(*) AS completedSetCount,
      COALESCE(MAX(sl.id), 0) AS latestSetLogId,
      COALESCE(SUM(sl.reps), 0) AS repsTotal,
      COALESCE(SUM(COALESCE(sl.weight, 0)), 0) AS weightTotal,
      COALESCE(SUM(COALESCE(sl.completed, 0)), 0) AS completedTotal,
      MAX(ws.finished_at) AS latestFinishedAt
    FROM set_logs sl
    JOIN exercise_logs el ON el.id = sl.exercise_log_id
    JOIN workout_sessions ws ON ws.id = el.workout_session_id
    WHERE ws.finished_at IS NOT NULL
      AND sl.reps IS NOT NULL
      AND sl.reps > 0
      AND (sl.completed = 1 OR sl.reps IS NOT NULL)
  `);
  return {
    completedSetCount: Number(row?.completedSetCount || 0),
    latestSetLogId: Number(row?.latestSetLogId || 0),
    repsTotal: Number(row?.repsTotal || 0),
    weightTotal: Number(row?.weightTotal || 0),
    completedTotal: Number(row?.completedTotal || 0),
    latestFinishedAt: row?.latestFinishedAt || null,
  };
}

export async function backfillPersonalRecordsOnce(): Promise<{ skipped: boolean; inserted: number }> {
  const marker = await selectRawOne<{ value: string }>(
    'SELECT value FROM workout_tracker_meta WHERE key = ?',
    [PR_BACKFILL_KEY],
  );
  const fingerprint = await getPersonalRecordSourceFingerprint();
  if (marker?.value === JSON.stringify(fingerprint)) return { skipped: true, inserted: 0 };

  const before = await selectRawOne<{ total: number }>('SELECT COUNT(*) AS total FROM personal_records');
  const performances = await getCompletedSetPerformances();
  const candidates = calculatePersonalRecordCandidates(performances);

  await execute('BEGIN');
  try {
    await insertCandidates(candidates);
    await execute(
      `INSERT OR REPLACE INTO workout_tracker_meta (key, value, updated_at) VALUES (?, ?, datetime('now'))`,
      [PR_BACKFILL_KEY, JSON.stringify(fingerprint)],
    );
    await execute('COMMIT');
  } catch (error) {
    await execute('ROLLBACK');
    throw error;
  }

  const after = await selectRawOne<{ total: number }>('SELECT COUNT(*) AS total FROM personal_records');
  return { skipped: false, inserted: (after?.total || 0) - (before?.total || 0) };
}
