import { configureWorkoutTrackerDb, type SqlExecutor } from './index';
import { migrateWorkoutTrackerDb } from './migrations';
import { seedWorkoutTrackerData } from '../repositories/seeds';
import type { WorkoutTrackerSeedInput } from '../types';
import { backfillPersonalRecordsOnce } from '../repositories/personalRecords';

export type SetupWorkoutTrackerCoreDbOptions = {
  runSql: SqlExecutor;
  migrate?: boolean;
  seed?: WorkoutTrackerSeedInput;
};

export async function setupWorkoutTrackerCoreDb({
  runSql,
  migrate = true,
  seed,
}: SetupWorkoutTrackerCoreDbOptions) {
  configureWorkoutTrackerDb(runSql);

  if (migrate) {
    await migrateWorkoutTrackerDb();
    try {
      await backfillPersonalRecordsOnce();
    } catch (error) {
      // PRs are derived from completed set logs. A failed rebuild must not make
      // the primary workout database unavailable; no marker is written on
      // failure, so setup will safely retry next time.
      console.error('[workout-tracker-core] Personal-record backfill failed:', error);
    }
  }

  if (seed) {
    await seedWorkoutTrackerData(seed);
  }
}
