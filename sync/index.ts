import {
  execute,
  filterToExistingColumns,
  selectRaw,
  tableHasColumn,
  updateWhere,
  type SqlValue,
} from '../db';
import {
  getWorkoutTrackerTablesForImport,
  getWorkoutTrackerTablesForSync,
  type WorkoutTrackerTableName,
} from '../db/schema';

export type WorkoutTrackerSyncDirection = 'push' | 'pull' | 'bidirectional';

export type WorkoutTrackerRemoteAdapter = {
  pull: (table: WorkoutTrackerTableName, options: WorkoutTrackerSyncTableOptions) => Promise<Array<Record<string, any>>>;
  push: (
    table: WorkoutTrackerTableName,
    rows: Array<Record<string, any>>,
    options: WorkoutTrackerSyncTableOptions
  ) => Promise<Array<Record<string, any>> | void>;
};

export type WorkoutTrackerSyncTableOptions = {
  userId?: string | number | null;
  since?: string | null;
};

export type SyncWorkoutTrackerDataOptions = WorkoutTrackerSyncTableOptions & {
  adapter: WorkoutTrackerRemoteAdapter;
  direction?: WorkoutTrackerSyncDirection;
  tables?: WorkoutTrackerTableName[];
  includeDeleted?: boolean;
};

export type SyncWorkoutTrackerDataResult = {
  success: boolean;
  pushed: Partial<Record<WorkoutTrackerTableName, number>>;
  pulled: Partial<Record<WorkoutTrackerTableName, number>>;
  errors: Array<{ table: WorkoutTrackerTableName; phase: 'push' | 'pull'; error: unknown }>;
};

const now = () => new Date().toISOString();

const BOOLEAN_COLUMNS: Partial<Record<WorkoutTrackerTableName, string[]>> = {
  exercises: ['archived', 'seeded', 'synced'],
  workouts: ['archived', 'deleted', 'seeded', 'synced'],
  workout_blocks: ['deleted', 'synced'],
  workout_exercises: ['deleted', 'synced'],
  workout_exercise_sets: ['deleted', 'synced'],
  workout_sessions: ['synced'],
  exercise_logs: ['deleted', 'synced'],
  set_logs: ['completed', 'deleted', 'synced'],
  personal_records: ['synced'],
};

const JSON_COLUMNS: Partial<Record<WorkoutTrackerTableName, string[]>> = {
  workout_exercise_sets: ['drop_sets'],
  set_logs: ['drop_sets'],
};

function parseJsonValue(value: unknown, fallback: unknown) {
  if (value == null || value === '') return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function serializeForRemote(table: WorkoutTrackerTableName, row: Record<string, any>) {
  const next = { ...row };

  (BOOLEAN_COLUMNS[table] || []).forEach((column) => {
    if (column in next && next[column] != null) {
      next[column] = Boolean(next[column]);
    }
  });

  (JSON_COLUMNS[table] || []).forEach((column) => {
    if (column in next) {
      next[column] = parseJsonValue(next[column], []);
    }
  });

  return next;
}

function serializeForLocal(table: WorkoutTrackerTableName, row: Record<string, any>) {
  const next = { ...row };

  (BOOLEAN_COLUMNS[table] || []).forEach((column) => {
    if (column in next && next[column] != null) {
      next[column] = next[column] ? 1 : 0;
    }
  });

  (JSON_COLUMNS[table] || []).forEach((column) => {
    if (column in next && next[column] != null && typeof next[column] !== 'string') {
      next[column] = JSON.stringify(next[column]);
    }
  });

  return next;
}

export const __workoutTrackerSyncInternals = {
  serializeForLocal,
  serializeForRemote,
};

function getSyncTables(tables?: WorkoutTrackerTableName[]) {
  const ordered = getWorkoutTrackerTablesForSync();
  if (!tables?.length) return ordered;
  return ordered.filter((table) => tables.includes(table));
}

async function getRowsToPush(table: WorkoutTrackerTableName, includeDeleted: boolean) {
  const hasSynced = await tableHasColumn(table, 'synced');
  const hasDeleted = await tableHasColumn(table, 'deleted');

  if (hasSynced && hasDeleted && !includeDeleted) {
    return selectRaw<Record<string, any>>(`SELECT * FROM ${table} WHERE synced = 0 AND deleted = 0`);
  }

  if (hasSynced) {
    return selectRaw<Record<string, any>>(`SELECT * FROM ${table} WHERE synced = 0`);
  }

  if (hasDeleted && !includeDeleted) {
    return selectRaw<Record<string, any>>(`SELECT * FROM ${table} WHERE deleted = 0`);
  }

  return selectRaw<Record<string, any>>(`SELECT * FROM ${table}`);
}

async function markRowsSynced(table: WorkoutTrackerTableName, rows: Array<Record<string, any>>, syncedAt: string) {
  const hasSynced = await tableHasColumn(table, 'synced');
  const hasLastSyncedAt = await tableHasColumn(table, 'last_synced_at');
  const hasRemoteId = await tableHasColumn(table, 'remote_id');
  if (!hasSynced && !hasLastSyncedAt && !hasRemoteId) return;

  for (const row of rows) {
    if (row.id == null) continue;
    await updateWhere(table, await filterToExistingColumns(table, {
      synced: hasSynced ? 1 : undefined,
      last_synced_at: hasLastSyncedAt ? syncedAt : undefined,
      remote_id: hasRemoteId ? row.remote_id ?? row.id : undefined,
    }), 'id = ?', [row.id as SqlValue]);
  }
}

async function upsertPulledRows(table: WorkoutTrackerTableName, rows: Array<Record<string, any>>) {
  let count = 0;

  for (const row of rows) {
    const cleanRow = await filterToExistingColumns(table, serializeForLocal(table, row));
    const columns = Object.keys(cleanRow);
    if (!columns.length) continue;

    const placeholders = columns.map(() => '?').join(', ');
    const values = columns.map((column) => cleanRow[column] as SqlValue);

    await execute(
      `INSERT OR REPLACE INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`,
      values
    );
    count += 1;
  }

  return count;
}

export async function syncWorkoutTrackerData({
  adapter,
  direction = 'bidirectional',
  tables,
  userId,
  since,
  includeDeleted = true,
}: SyncWorkoutTrackerDataOptions): Promise<SyncWorkoutTrackerDataResult> {
  const pushed: SyncWorkoutTrackerDataResult['pushed'] = {};
  const pulled: SyncWorkoutTrackerDataResult['pulled'] = {};
  const errors: SyncWorkoutTrackerDataResult['errors'] = [];
  const syncedAt = now();

  if (direction === 'pull' || direction === 'bidirectional') {
    for (const table of getWorkoutTrackerTablesForImport().filter((tableName) => !tables?.length || tables.includes(tableName))) {
      try {
        const rows = await adapter.pull(table, { userId, since });
        pulled[table] = await upsertPulledRows(table, rows);
      } catch (error) {
        errors.push({ table, phase: 'pull', error });
      }
    }
  }

  if (direction === 'push' || direction === 'bidirectional') {
    for (const table of getSyncTables(tables)) {
      try {
        const rows = await getRowsToPush(table, includeDeleted);
        const rowsWithUserId = userId == null
          ? rows
          : rows.map((row) => ({ ...row, user_id: row.user_id ?? userId }));

        await adapter.push(table, rowsWithUserId.map(row => serializeForRemote(table, row)), { userId, since });
        await markRowsSynced(table, rowsWithUserId, syncedAt);
        pushed[table] = rowsWithUserId.length;
      } catch (error) {
        errors.push({ table, phase: 'push', error });
      }
    }
  }

  return {
    success: errors.length === 0,
    pushed,
    pulled,
    errors,
  };
}

export type SupabaseLikeClient = {
  from: (table: string) => {
    select: (columns?: string) => {
      eq?: (column: string, value: string | number) => Promise<{ data: any[] | null; error: any }>;
    } | Promise<{ data: any[] | null; error: any }>;
    upsert: (
      rows: Array<Record<string, any>>,
      options?: { onConflict?: string }
    ) => Promise<{ data: any[] | null; error: any }>;
  };
};

export function createSupabaseWorkoutTrackerSyncAdapter(supabase: SupabaseLikeClient): WorkoutTrackerRemoteAdapter {
  return {
    async pull(table, options) {
      const query = supabase.from(table).select('*') as any;
      const result = options.userId != null && typeof query.eq === 'function'
        ? await query.eq('user_id', options.userId)
        : await query;

      if (result.error) throw result.error;
      return result.data || [];
    },
    async push(table, rows, options) {
      if (!rows.length) return [];
      const { data, error } = await supabase
        .from(table)
        .upsert(rows, { onConflict: options.userId != null ? 'user_id,id' : 'id' });
      if (error) throw error;
      return data || [];
    },
  };
}
