export type SqlValue = string | number | boolean | null | undefined;

export type SqlExecutor = <T = any>(
  sql: string,
  params?: SqlValue[],
) => Promise<T[]>;

let executor: SqlExecutor | null = null;

export function configureWorkoutTrackerDb(runSql: SqlExecutor) {
  executor = runSql;
}

export function getWorkoutTrackerDb(): SqlExecutor {
  if (!executor) {
    throw new Error(
      '@mdv/workout-tracker-core database is not configured. Call configureWorkoutTrackerDb(runSql) before using repositories.',
    );
  }
  return executor;
}

export async function execute<T = any>(sql: string, params: SqlValue[] = []) {
  return getWorkoutTrackerDb()<T>(sql, params);
}

export async function selectRaw<T = any>(sql: string, params: SqlValue[] = []) {
  return execute<T>(sql, params);
}

export async function selectRawOne<T = any>(
  sql: string,
  params: SqlValue[] = [],
) {
  const rows = await execute<T>(sql, params);
  return rows[0] ?? null;
}

export async function insert(table: string, data: Record<string, SqlValue>) {
  const keys = Object.keys(data).filter(key => data[key] !== undefined);
  const placeholders = keys.map(() => '?').join(', ');
  const values = keys.map(key => data[key]);

  await execute(
    `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`,
    values,
  );
  const row = await selectRawOne<{ id: number }>(
    'SELECT last_insert_rowid() as id',
  );
  if (!row) throw new Error(`Could not read inserted id for ${table}`);
  return row.id;
}

export async function updateWhere(
  table: string,
  data: Record<string, SqlValue>,
  where: string,
  params: SqlValue[],
) {
  const keys = Object.keys(data).filter(key => data[key] !== undefined);
  if (!keys.length) return;
  const setters = keys.map(key => `${key} = ?`).join(', ');
  await execute(`UPDATE ${table} SET ${setters} WHERE ${where}`, [
    ...keys.map(key => data[key]),
    ...params,
  ]);
}

export async function removeWhere(
  table: string,
  where: string,
  params: SqlValue[],
) {
  await execute(`DELETE FROM ${table} WHERE ${where}`, params);
}

export const executeRaw = execute;
export const selectOne = selectRawOne;

export async function update(
  table: string,
  id: string | number,
  data: Record<string, SqlValue>,
) {
  await updateWhere(table, data, 'id = ?', [id]);
}

const tableColumnsCache = new Map<string, Set<string>>();

export async function getTableColumns(table: string) {
  if (!tableColumnsCache.has(table)) {
    const columns = await selectRaw<{ name: string }>(
      `PRAGMA table_info(${table})`,
    );
    tableColumnsCache.set(table, new Set(columns.map(column => column.name)));
  }

  return tableColumnsCache.get(table)!;
}

export async function filterToExistingColumns<T extends Record<string, any>>(
  table: string,
  row: T,
) {
  const columns = await getTableColumns(table);
  return Object.fromEntries(
    Object.entries(row).filter(
      ([key, value]) => value !== undefined && columns.has(key),
    ),
  ) as Partial<T>;
}

export async function tableHasColumn(table: string, column: string) {
  const columns = await getTableColumns(table);
  return columns.has(column);
}

export * from './migrations';
export * from './setup';
