import {
  execute,
  filterToExistingColumns,
  selectRaw,
  type SqlValue,
} from '../db';
import {
  getWorkoutTrackerTablesForClear,
  getWorkoutTrackerTablesForExport,
  getWorkoutTrackerTablesForImport,
  WORKOUT_TRACKER_SCHEMA_VERSION,
  WORKOUT_TRACKER_TABLES,
  type WorkoutTrackerTableName,
} from '../db/schema';

export type WorkoutTrackerSnapshotData = Partial<Record<WorkoutTrackerTableName, Array<Record<string, any>>>>;

export type WorkoutTrackerSnapshot = {
  type: 'workout-tracker';
  schemaVersion: number;
  exportedAt: string;
  data: WorkoutTrackerSnapshotData;
};

export type ExportWorkoutTrackerDataOptions = {
  includeEmptyTables?: boolean;
};

export type ImportWorkoutTrackerDataOptions = {
  clearExisting?: boolean;
};

export type ImportWorkoutTrackerDataResult = {
  imported: Partial<Record<WorkoutTrackerTableName, number>>;
};

const isTableName = (value: string): value is WorkoutTrackerTableName => (
  (WORKOUT_TRACKER_TABLES as readonly string[]).includes(value)
);

function normalizeSnapshot(input: WorkoutTrackerSnapshot | WorkoutTrackerSnapshotData): WorkoutTrackerSnapshot {
  if ('data' in input && input.type === 'workout-tracker') {
    return input;
  }

  return {
    type: 'workout-tracker',
    schemaVersion: 0,
    exportedAt: new Date().toISOString(),
    data: input as WorkoutTrackerSnapshotData,
  };
}

function assertValidSnapshot(snapshot: WorkoutTrackerSnapshot) {
  if (!snapshot || typeof snapshot !== 'object') {
    throw new Error('Invalid workout tracker snapshot.');
  }

  if (!snapshot.data || typeof snapshot.data !== 'object') {
    throw new Error('Workout tracker snapshot is missing data.');
  }

  for (const [table, rows] of Object.entries(snapshot.data)) {
    if (!isTableName(table)) {
      continue;
    }

    if (!Array.isArray(rows)) {
      throw new Error(`Workout tracker snapshot table "${table}" must be an array.`);
    }
  }
}

export async function exportWorkoutTrackerData(
  options: ExportWorkoutTrackerDataOptions = {}
): Promise<WorkoutTrackerSnapshot> {
  const data: WorkoutTrackerSnapshotData = {};

  for (const table of getWorkoutTrackerTablesForExport()) {
    const rows = await selectRaw<Record<string, any>>(`SELECT * FROM ${table}`);
    if (rows.length || options.includeEmptyTables) {
      data[table] = rows;
    }
  }

  return {
    type: 'workout-tracker',
    schemaVersion: WORKOUT_TRACKER_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    data,
  };
}

export function serializeWorkoutTrackerSnapshot(snapshot: WorkoutTrackerSnapshot) {
  return JSON.stringify(snapshot, null, 2);
}

export function validateWorkoutTrackerSnapshot(input: WorkoutTrackerSnapshot | WorkoutTrackerSnapshotData) {
  const snapshot = normalizeSnapshot(input);
  assertValidSnapshot(snapshot);
  return snapshot;
}

export async function clearWorkoutTrackerData() {
  for (const table of getWorkoutTrackerTablesForClear()) {
    await execute(`DELETE FROM ${table}`);
  }
}

async function insertRows(table: WorkoutTrackerTableName, rows: Array<Record<string, any>>) {
  let count = 0;

  for (const row of rows) {
    const cleanRow = await filterToExistingColumns(table, row);
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

export async function importWorkoutTrackerData(
  input: WorkoutTrackerSnapshot | WorkoutTrackerSnapshotData,
  options: ImportWorkoutTrackerDataOptions = {}
): Promise<ImportWorkoutTrackerDataResult> {
  const snapshot = validateWorkoutTrackerSnapshot(input);
  const imported: ImportWorkoutTrackerDataResult['imported'] = {};

  await execute('BEGIN');
  try {
    if (options.clearExisting ?? true) {
      await clearWorkoutTrackerData();
    }

    for (const table of getWorkoutTrackerTablesForImport()) {
      const rows = snapshot.data[table] || [];
      if (!rows.length) continue;
      imported[table] = await insertRows(table, rows);
    }

    await execute('COMMIT');
  } catch (error) {
    await execute('ROLLBACK');
    throw error;
  }

  return { imported };
}

export function workoutTrackerSnapshotToCSV(snapshot: WorkoutTrackerSnapshot | WorkoutTrackerSnapshotData) {
  const normalized = validateWorkoutTrackerSnapshot(snapshot);
  let csv = '';

  for (const table of getWorkoutTrackerTablesForExport()) {
    const rows = normalized.data[table] || [];
    if (!rows.length) continue;

    csv += `Table: ${table}\n`;
    const headers = Object.keys(rows[0]);
    csv += `${headers.join(',')}\n`;
    for (const row of rows) {
      csv += `${headers.map((header) => JSON.stringify(row[header] ?? '')).join(',')}\n`;
    }
    csv += '\n';
  }

  return csv;
}

export function workoutTrackerSnapshotToText(snapshot: WorkoutTrackerSnapshot | WorkoutTrackerSnapshotData) {
  const normalized = validateWorkoutTrackerSnapshot(snapshot);
  let text = '';

  for (const table of getWorkoutTrackerTablesForExport()) {
    const rows = normalized.data[table] || [];
    text += `==== ${table} ====\n`;
    for (const row of rows) {
      text += `${JSON.stringify(row)}\n`;
    }
    text += '\n';
  }

  return text;
}
