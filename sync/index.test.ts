import { __workoutTrackerSyncInternals, createSupabaseWorkoutTrackerSyncAdapter } from './index';

describe('workout tracker sync', () => {
  it('serializes sqlite booleans and JSON strings for Supabase', () => {
    expect(__workoutTrackerSyncInternals.serializeForRemote('set_logs', {
      id: 1,
      completed: 1,
      deleted: 0,
      synced: 0,
      drop_sets: '[{"reps":5}]',
    })).toEqual({
      id: 1,
      completed: true,
      deleted: false,
      synced: false,
      drop_sets: [{ reps: 5 }],
    });
  });

  it('serializes Supabase booleans and jsonb values for sqlite', () => {
    expect(__workoutTrackerSyncInternals.serializeForLocal('set_logs', {
      id: 1,
      completed: true,
      deleted: false,
      synced: true,
      drop_sets: [{ reps: 5 }],
    })).toEqual({
      id: 1,
      completed: 1,
      deleted: 0,
      synced: 1,
      drop_sets: '[{"reps":5}]',
    });
  });

  it('uses user-scoped conflict keys when pushing authenticated rows', async () => {
    const upsert = jest.fn().mockResolvedValue({ data: [], error: null });
    const adapter = createSupabaseWorkoutTrackerSyncAdapter({
      from: jest.fn(() => ({
        select: jest.fn(),
        upsert,
      })),
    });

    await adapter.push('workouts', [{ id: 1, user_id: 'user-1', name: 'Push' }], { userId: 'user-1' });

    expect(upsert).toHaveBeenCalledWith(
      [{ id: 1, user_id: 'user-1', name: 'Push' }],
      { onConflict: 'user_id,id' },
    );
  });
});
