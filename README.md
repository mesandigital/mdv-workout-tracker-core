# @mdv/workout-tracker-core

Local database core for workout tracking apps. It owns the reusable data layer for:

- exercises
- workout templates
- workout sessions
- exercise logs and set logs
- supersets, drop sets, and circuits through `group_type`
- optional first-run seeding
- local export/import backups
- adapter-based cloud sync

This package is UI-free. Use it with `@mdv/workout-tracker`, `@mdv/training-template-kit`, or your own screens.

For a full app example with SQLite setup, tracker UI, demo workout creation, and nested navigation, see `examples/basic-workout-tracker`.

## Contents

- [Install](#install)
- [Quick Start](#quick-start)
- [Setup Options](#setup-options)
- [Seed Initial Data](#seed-initial-data)
- [Create Exercises and Workouts](#create-exercises-and-workouts)
- [Start and Log Sessions](#start-and-log-sessions)
- [Export and Import Backups](#export-and-import-backups)
- [Cloud Sync](#cloud-sync)
- [Connect to the Tracker UI](#connect-to-the-tracker-ui)
- [Package Boundary](#package-boundary)

## Install

Published package:

```sh
npm install @mdv/workout-tracker-core @op-engineering/op-sqlite
```

From a dedicated GitHub repo whose root is this package:

```sh
npm install github:mesandigital/mdv-workout-tracker-core
npm install @op-engineering/op-sqlite
```

Pin a branch, tag, or commit:

```sh
npm install github:mesandigital/mdv-workout-tracker-core#main
npm install github:mesandigital/mdv-workout-tracker-core#v0.1.0
npm install github:mesandigital/mdv-workout-tracker-core#abc1234
```

If this package stays inside a larger monorepo at `src/modules/workout-tracker-core`, npm will not install that subfolder as a normal GitHub package by default. Use one of these approaches:

- publish `src/modules/workout-tracker-core` to npm or GitHub Packages
- move/copy this package into its own GitHub repo
- use a workspace-aware release tool
- pack the module locally and install the generated tarball

Local tarball test:

```sh
cd src/modules/workout-tracker-core
npm pack

cd /path/to/your/app
npm install /path/to/mdv-workout-tracker-core-0.1.0.tgz
```

## Quick Start

Call `setupWorkoutTrackerCoreDb` once during app bootstrap, before rendering screens that read or write workout data.

```ts
import { open } from '@op-engineering/op-sqlite';
import { setupWorkoutTrackerCoreDb } from '@mdv/workout-tracker-core';

const db = open({ name: 'workout-tracker.db' });

export async function setupWorkoutTracker() {
  await setupWorkoutTrackerCoreDb({
    runSql: async (sql, params = []) => {
      const result = await db.execute(sql, params);
      return Array.isArray(result.rows) ? result.rows : [];
    },
  });
}
```

Example React Native bootstrap:

```tsx
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { AppNavigator } from './AppNavigator';
import { setupWorkoutTracker } from './workoutTrackerSetup';

export function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setupWorkoutTracker().finally(() => setReady(true));
  }, []);

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return <AppNavigator />;
}
```

## Setup Options

`setupWorkoutTrackerCoreDb` is the recommended bootstrap helper. It configures the SQL executor, optionally runs migrations, and optionally seeds starter data.

```ts
type SqlValue = string | number | boolean | null | undefined;
type SqlExecutor = <T = any>(sql: string, params?: SqlValue[]) => Promise<T[]>;

type SetupWorkoutTrackerCoreDbOptions = {
  runSql: SqlExecutor;
  migrate?: boolean;
  seed?: WorkoutTrackerSeedInput;
};
```

| Param | Required | Default | Description |
| --- | --- | --- | --- |
| `runSql` | Yes | none | SQL executor used by all core repositories. |
| `migrate` | No | `true` | Runs table creation and additive migrations. Keep enabled during normal app bootstrap. |
| `seed` | No | `undefined` | Optional initial exercises and workout templates. |

Use `migrate: false` only if your app already runs `migrateWorkoutTrackerDb` elsewhere:

```ts
await setupWorkoutTrackerCoreDb({
  runSql,
  migrate: false,
});
```

You can also configure and migrate manually:

```ts
import {
  configureWorkoutTrackerDb,
  migrateWorkoutTrackerDb,
} from '@mdv/workout-tracker-core';

configureWorkoutTrackerDb(runSql);
await migrateWorkoutTrackerDb();
```

## Seed Initial Data

Seeding is optional. Use it when a fresh install should start with a starter exercise library or default workout templates.

```ts
await setupWorkoutTrackerCoreDb({
  runSql,
  seed: {
    exercises: [
      {
        seeded_id: 'barbell-squat',
        name: 'Barbell Squat',
        body_part: 'legs',
        primary_muscle: 'quadriceps',
        equipment: 'barbell',
        exercise_type: 'strength',
        seeded_version: 1,
      },
    ],
    workouts: [
      {
        seeded_id: 'starter-strength',
        name: 'Starter Strength',
        type: 'strength',
        seeded_version: 1,
        exercises: [
          {
            seeded_id: 'barbell-squat',
            section: 'main',
            plannedSets: 3,
            plannedReps: 8,
            plannedWeight: 60,
          },
        ],
      },
    ],
  },
});
```

Seed behavior:

- exercises are matched by `seeded_id` when provided, otherwise by name
- workouts are matched by `seeded_id` when provided, otherwise by name
- `seeded_version` controls updates; bump it to reseed an exercise or workout
- workout exercises can reference exercises by `seeded_id`, `exercise_seeded_id`, or `exercise_id`
- arrays such as `secondary_muscles` and `instructions` are serialized before insert

The current app passes its existing `AllExercisess` and `workoutsToSeed` constants into this option.

## Create Exercises and Workouts

```ts
import {
  createExercise,
  createWorkoutTemplate,
  listExercises,
} from '@mdv/workout-tracker-core';

const squatId = await createExercise({
  name: 'Back Squat',
  body_part: 'legs',
  primary_muscle: 'quadriceps',
  equipment: 'barbell',
  exercise_type: 'strength',
});

const pushUpId = await createExercise({
  name: 'Push Up',
  body_part: 'chest',
  primary_muscle: 'pectorals',
  equipment: 'bodyweight',
  exercise_type: 'bodyweight',
});

const workoutId = await createWorkoutTemplate({
  name: 'Lower Body Strength',
  type: 'strength',
  section: 'legs',
  description: 'Main lower body session',
  exercises: [
    {
      exercise_id: squatId,
      order_index: 0,
      default_sets: 3,
      default_reps: 8,
      weight: 100,
      sets: [
        { set_number: 1, planned_reps: 8, planned_weight: 100 },
        { set_number: 2, planned_reps: 8, planned_weight: 105 },
        { set_number: 3, planned_reps: 8, planned_weight: 110 },
      ],
    },
    {
      exercise_id: pushUpId,
      order_index: 1,
      default_sets: 3,
      default_reps: 12,
      group_type: 'circuit',
      group_id: 1,
    },
  ],
});

const exercises = await listExercises();
```

Use `group_type` and `group_id` for grouped work:

```ts
type WorkoutGroupType = 'superset' | 'drop_set' | 'circuit';
```

## Start and Log Sessions

```ts
import {
  addSetLog,
  endWorkoutSession,
  getWorkoutSession,
  setCompletedReps,
  startWorkoutSession,
} from '@mdv/workout-tracker-core';

const sessionId = await startWorkoutSession(workoutId);
const session = await getWorkoutSession(sessionId);

const firstSet = session?.exercises[0]?.sets[0];

if (firstSet) {
  await setCompletedReps(firstSet.id, 8);
}

await addSetLog({
  exercise_log_id: session!.exercises[0].exerciseLogId,
  set_number: 4,
  planned_reps: 8,
  reps: 7,
  weight: 100,
  completed: 1,
});

await endWorkoutSession(sessionId, 'Felt strong today');
```

## Export and Import Backups

The core package exports and imports only workout tracker tables:

- `exercises`
- `workouts`
- `workout_exercises`
- `workout_exercise_sets`
- `workout_sessions`
- `exercise_logs`
- `set_logs`

The package does not open a file picker or share sheet. Host apps should handle file UI and pass content to the core APIs.

```ts
import {
  exportWorkoutTrackerData,
  importWorkoutTrackerData,
  serializeWorkoutTrackerSnapshot,
  workoutTrackerSnapshotToCSV,
  workoutTrackerSnapshotToText,
} from '@mdv/workout-tracker-core';

const snapshot = await exportWorkoutTrackerData({ includeEmptyTables: true });

const json = serializeWorkoutTrackerSnapshot(snapshot);
const csv = workoutTrackerSnapshotToCSV(snapshot);
const text = workoutTrackerSnapshotToText(snapshot);

await importWorkoutTrackerData(JSON.parse(json), {
  clearExisting: true,
});
```

Import behavior:

- runs inside a transaction
- clears tracker tables by dependency order when `clearExisting` is `true`
- imports tables in dependency order
- filters unknown columns for safer old/new backup compatibility
- supports the new snapshot shape and the old plain `{ workouts, exercises, ... }` shape

Snapshot shape:

```ts
type WorkoutTrackerSnapshot = {
  type: 'workout-tracker';
  schemaVersion: number;
  exportedAt: string;
  data: {
    exercises?: any[];
    workouts?: any[];
    workout_exercises?: any[];
    workout_exercise_sets?: any[];
    workout_sessions?: any[];
    exercise_logs?: any[];
    set_logs?: any[];
  };
};
```

## Cloud Sync

The core package includes a generic sync engine. It does not require Supabase directly; instead, it accepts a remote adapter.

```ts
import {
  createSupabaseWorkoutTrackerSyncAdapter,
  syncWorkoutTrackerData,
} from '@mdv/workout-tracker-core';
import { supabase } from './supabaseClient';

const result = await syncWorkoutTrackerData({
  adapter: createSupabaseWorkoutTrackerSyncAdapter(supabase),
  direction: 'push',
  userId: currentUser.id,
});

if (!result.success) {
  console.log(result.errors);
}
```

Supported directions:

| Direction | Behavior |
| --- | --- |
| `push` | Pushes local unsynced rows to the remote adapter. |
| `pull` | Pulls remote rows and upserts them locally. |
| `bidirectional` | Pulls first, then pushes local rows. |

Sync a subset of tables:

```ts
await syncWorkoutTrackerData({
  adapter,
  direction: 'push',
  userId,
  tables: ['workouts', 'workout_sessions', 'exercise_logs', 'set_logs'],
});
```

For Supabase, run this SQL script first:

```txt
src/modules/workout-tracker-core/sql/supabase_workout_tracker.sql
```

The sync engine uses these optional local columns when present:

- `user_id`
- `remote_id`
- `client_id`
- `deleted`
- `synced`
- `version`
- `last_synced_at`
- `updated_at`

Host apps still own:

- Supabase client setup and auth
- premium checks
- background sync scheduling
- file picker/share UI
- app-specific tables such as `weekly_plans`, dashboard widgets, users, or settings

## Connect to the Tracker UI

Use `@mdv/workout-tracker` for the reusable active-session screens.

```sh
npm install @mdv/workout-tracker @mdv/workout-tracker-core @op-engineering/op-sqlite @react-navigation/native @react-navigation/native-stack
```

Minimal setup:

```tsx
import { open } from '@op-engineering/op-sqlite';
import { configureWorkoutTrackerDependencyAdapter } from '@mdv/workout-tracker';
import {
  createWorkoutTrackerCoreAdapter,
  setupWorkoutTrackerCoreDb,
} from '@mdv/workout-tracker-core';

const db = open({ name: 'workout-tracker.db' });

export async function setupWorkoutTracker() {
  await setupWorkoutTrackerCoreDb({
    runSql: async (sql, params = []) => {
      const result = await db.execute(sql, params);
      return Array.isArray(result.rows) ? result.rows : [];
    },
  });

  configureWorkoutTrackerDependencyAdapter(createWorkoutTrackerCoreAdapter());
}
```

Render the tracker after creating or selecting a session:

```tsx
import { WorkoutSessionNavigator } from '@mdv/workout-tracker';
import { startWorkoutSession } from '@mdv/workout-tracker-core';

const sessionId = await startWorkoutSession(workoutId);

<WorkoutSessionNavigator initialSessionId={sessionId} />;
```

If your app already has a root `NavigationContainer`, render `WorkoutSessionNavigator` inside your existing navigator. Full navigation examples and the `useActiveWorkoutSession` adapter contract belong in the `@mdv/workout-tracker` README.

## Package Boundary

This package should stay focused on reusable workout tracker data behavior.

Keep in core:

- `db/` for the SQL executor, migrations, and schema registry
- `repositories/` for CRUD, sessions, logs, seed, and backup APIs
- `sync/` for adapter-based sync
- `sql/` for provider setup scripts
- `types.ts` for shared data contracts

Keep in the host app:

- file picker and share UI
- auth and premium/paywall UI
- app-specific tables and settings
- navigation and screen layout
- custom analytics, widgets, and dashboards
