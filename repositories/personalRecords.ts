import { execute, selectRaw, selectRawOne } from '../db';
import type {
  PersonalRecord,
  PersonalRecordHistoryFilters,
  PersonalRecordHistoryPage,
  PersonalRecordExerciseOption,
  PersonalRecordType,
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
