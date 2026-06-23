# Changelog

All notable changes to `@mdv/workout-tracker-core` will be documented in this file.

## 0.1.0

Initial package-ready release.

### Added

- Local SQLite database contract and configurable SQL executor.
- Migration helper for workout tracker tables:
  - `exercises`
  - `workouts`
  - `workout_exercises`
  - `workout_exercise_sets`
  - `workout_sessions`
  - `exercise_logs`
  - `set_logs`
- Repository APIs for:
  - creating, updating, listing, and archiving exercises
  - creating, updating, listing, loading, and archiving workout templates
  - starting, hydrating, ending, deleting, and checking workout sessions
  - adding, updating, deleting, and completing set logs
- Support for grouped training structures through `group_type`:
  - `superset`
  - `drop_set`
  - `circuit`
- `setupWorkoutTrackerCoreDb` convenience helper for DB setup and migrations.
- Optional starter data seeding through `setupWorkoutTrackerCoreDb({ seed })`.
- Export/import snapshot APIs for workout tracker backups.
- Generic adapter-based sync engine with push, pull, and bidirectional modes.
- Optional Supabase sync adapter helper.
- Supabase SQL schema script at `sql/supabase_workout_tracker.sql`.
- Sync metadata columns for local tracker tables, including `user_id`, `remote_id`, `client_id`, `synced`, `version`, and `last_synced_at`.
- `createWorkoutTrackerCoreAdapter` for wiring the core local DB to `@mdv/workout-tracker`.
- Package exports for adapters, DB helpers, migrations, repositories, and types.
- Setup docs for package install, GitHub install, local DB configuration, session lifecycle, and tracker UI integration.
- Example app source at `examples/basic-workout-tracker`.

### Notes

- Apps using repository functions must call `configureWorkoutTrackerDb` or `setupWorkoutTrackerCoreDb` before first use.
- Apps should call migrations during bootstrap before rendering screens that read or write tracker data.
