export const WORKOUT_TRACKER_SCHEMA_VERSION = 4;

export const WORKOUT_TRACKER_TABLES = [
  'exercises',
  'workouts',
  'workout_blocks',
  'workout_exercises',
  'workout_exercise_sets',
  'workout_template_history',
  'workout_sessions',
  'exercise_logs',
  'set_logs',
  'personal_records',
  'progressive_overload_applications',
  'progressive_overload_recommendation_snapshots',
] as const;

export type WorkoutTrackerTableName = typeof WORKOUT_TRACKER_TABLES[number];

export type WorkoutTrackerTableDefinition = {
  name: WorkoutTrackerTableName;
  exportOrder: number;
  importOrder: number;
  clearOrder: number;
  syncOrder: number;
  primaryKey: 'id';
  timestampColumn: 'updated_at';
  softDeleteColumn?: 'deleted' | 'archived';
};

export const WORKOUT_TRACKER_TABLE_DEFINITIONS: Record<WorkoutTrackerTableName, WorkoutTrackerTableDefinition> = {
  exercises: {
    name: 'exercises',
    exportOrder: 10,
    importOrder: 10,
    clearOrder: 70,
    syncOrder: 10,
    primaryKey: 'id',
    timestampColumn: 'updated_at',
    softDeleteColumn: 'archived',
  },
  workouts: {
    name: 'workouts',
    exportOrder: 20,
    importOrder: 20,
    clearOrder: 60,
    syncOrder: 20,
    primaryKey: 'id',
    timestampColumn: 'updated_at',
    softDeleteColumn: 'archived',
  },
  workout_blocks: {
    name: 'workout_blocks',
    exportOrder: 25,
    importOrder: 25,
    clearOrder: 55,
    syncOrder: 25,
    primaryKey: 'id',
    timestampColumn: 'updated_at',
    softDeleteColumn: 'deleted',
  },
  workout_exercises: {
    name: 'workout_exercises',
    exportOrder: 30,
    importOrder: 30,
    clearOrder: 50,
    syncOrder: 30,
    primaryKey: 'id',
    timestampColumn: 'updated_at',
    softDeleteColumn: 'deleted',
  },
  workout_exercise_sets: {
    name: 'workout_exercise_sets',
    exportOrder: 40,
    importOrder: 40,
    clearOrder: 40,
    syncOrder: 40,
    primaryKey: 'id',
    timestampColumn: 'updated_at',
    softDeleteColumn: 'deleted',
  },
  workout_template_history: {
    name: 'workout_template_history',
    exportOrder: 45,
    importOrder: 45,
    clearOrder: 35,
    syncOrder: 45,
    primaryKey: 'id',
    timestampColumn: 'updated_at',
  },
  workout_sessions: {
    name: 'workout_sessions',
    exportOrder: 50,
    importOrder: 50,
    clearOrder: 30,
    syncOrder: 50,
    primaryKey: 'id',
    timestampColumn: 'updated_at',
  },
  exercise_logs: {
    name: 'exercise_logs',
    exportOrder: 60,
    importOrder: 60,
    clearOrder: 20,
    syncOrder: 60,
    primaryKey: 'id',
    timestampColumn: 'updated_at',
    softDeleteColumn: 'deleted',
  },
  set_logs: {
    name: 'set_logs',
    exportOrder: 70,
    importOrder: 70,
    clearOrder: 10,
    syncOrder: 70,
    primaryKey: 'id',
    timestampColumn: 'updated_at',
    softDeleteColumn: 'deleted',
  },
  personal_records: {
    name: 'personal_records',
    exportOrder: 80,
    importOrder: 80,
    clearOrder: 5,
    syncOrder: 80,
    primaryKey: 'id',
    timestampColumn: 'updated_at',
  },
  progressive_overload_applications: {
    name: 'progressive_overload_applications',
    exportOrder: 90,
    importOrder: 90,
    clearOrder: 4,
    syncOrder: 90,
    primaryKey: 'id',
    timestampColumn: 'updated_at',
  },
  progressive_overload_recommendation_snapshots: {
    name: 'progressive_overload_recommendation_snapshots',
    exportOrder: 85,
    importOrder: 85,
    clearOrder: 4,
    syncOrder: 85,
    primaryKey: 'id',
    timestampColumn: 'updated_at',
  },
};

export const getWorkoutTrackerTablesForExport = () => (
  [...WORKOUT_TRACKER_TABLES].sort(
    (a, b) => WORKOUT_TRACKER_TABLE_DEFINITIONS[a].exportOrder - WORKOUT_TRACKER_TABLE_DEFINITIONS[b].exportOrder
  )
);

export const getWorkoutTrackerTablesForImport = () => (
  [...WORKOUT_TRACKER_TABLES].sort(
    (a, b) => WORKOUT_TRACKER_TABLE_DEFINITIONS[a].importOrder - WORKOUT_TRACKER_TABLE_DEFINITIONS[b].importOrder
  )
);

export const getWorkoutTrackerTablesForClear = () => (
  [...WORKOUT_TRACKER_TABLES].sort(
    (a, b) => WORKOUT_TRACKER_TABLE_DEFINITIONS[a].clearOrder - WORKOUT_TRACKER_TABLE_DEFINITIONS[b].clearOrder
  )
);

export const getWorkoutTrackerTablesForSync = () => (
  [...WORKOUT_TRACKER_TABLES].sort(
    (a, b) => WORKOUT_TRACKER_TABLE_DEFINITIONS[a].syncOrder - WORKOUT_TRACKER_TABLE_DEFINITIONS[b].syncOrder
  )
);
