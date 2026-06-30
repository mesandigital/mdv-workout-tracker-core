import { executeRaw, insert, selectRaw, selectRawOne } from '../../../db-adapter';
import { createWorkoutSession, generateExerciseLogsAndSets, getActiveSession } from './session.queries';

type RemoteExercise = {
  id: number;
  name: string;
  category?: string | null;
  description?: string | null;
  secondary_muscle?: string | null;
  body_part?: string | null;
  primary_muscle?: string | null;
  secondary_muscles?: string | null;
  instructions?: string | null;
  difficulty?: string | null;
  equipment?: string | null;
  movement?: string | null;
  exercise_type?: string | null;
  exercise_category?: string | null;
  image_url?: string | null;
  image_key?: string | null;
};

type ProgramExerciseSetSnapshot = {
  id?: number;
  set_number: number;
  planned_reps?: number | null;
  planned_weight?: number | null;
  duration_seconds?: number | null;
};

type ProgramExerciseSnapshot = {
  id?: number;
  exercise_id: number;
  exercise?: RemoteExercise | null;
  exercises?: RemoteExercise | null;
  order_index: number;
  section?: string | null;
  default_sets: number;
  default_reps: number;
  weight?: number | null;
  superset_id?: number | null;
  sets?: ProgramExerciseSetSnapshot[];
  workout_program_exercise_sets?: ProgramExerciseSetSnapshot[];
};

export type ProgramWorkoutSessionSnapshot = {
  organizationId: string;
  userId?: string | null;
  programId: number | string;
  programWorkoutId: number | string;
  workoutId?: number | string | null;
  assignmentId?: number | string | null;
  progressId?: number | string | null;
  name?: string | null;
  description?: string | null;
  weekNumber?: number | null;
  dayNumber?: number | null;
  exercises: ProgramExerciseSnapshot[];
};

export type WorkoutTemplateSessionSnapshot = {
  organizationId?: string | null;
  userId?: string | null;
  workoutId: number | string;
  name: string;
  type?: string | null;
  section?: string | null;
  description?: string | null;
  exercises: ProgramExerciseSnapshot[];
};

const toTextId = (value: number | string | null | undefined) => (
  value == null ? null : String(value)
);

const getOrCreateLocalExercise = async (
  remoteExerciseId: number,
  exercise?: RemoteExercise | null,
  organizationId?: string | null,
  userId?: string | null
) => {
  const remoteId = toTextId(remoteExerciseId);
  const existing = await selectRawOne<{ id: number }>(
    'SELECT id FROM exercises WHERE remote_id = ? OR id = ? LIMIT 1',
    [remoteId, remoteExerciseId]
  );

  if (existing?.id) {
    if (exercise?.name) {
      await executeRaw(
        `UPDATE exercises
         SET name = ?,
             category = COALESCE(?, category),
             description = COALESCE(?, description),
             secondary_muscle = COALESCE(?, secondary_muscle),
             body_part = COALESCE(?, body_part),
             primary_muscle = COALESCE(?, primary_muscle),
             secondary_muscles = COALESCE(?, secondary_muscles),
             instructions = COALESCE(?, instructions),
             difficulty = COALESCE(?, difficulty),
             equipment = COALESCE(?, equipment),
             movement = COALESCE(?, movement),
             exercise_type = COALESCE(?, exercise_type),
             exercise_category = COALESCE(?, exercise_category),
             image_url = COALESCE(?, image_url),
             image_key = COALESCE(?, image_key),
             updated_at = datetime('now')
         WHERE id = ?`,
        [
          exercise.name,
          exercise.category || null,
          exercise.description || null,
          exercise.secondary_muscle || null,
          exercise.body_part || null,
          exercise.primary_muscle || null,
          exercise.secondary_muscles || null,
          exercise.instructions || null,
          exercise.difficulty || null,
          exercise.equipment || null,
          exercise.movement || null,
          exercise.exercise_type || null,
          exercise.exercise_category || null,
          exercise.image_url || null,
          exercise.image_key || null,
          existing.id,
        ]
      );
    }
    return existing.id;
  }

  const localExerciseId = await insert('exercises', {
    user_id: userId || null,
    organization_id: organizationId || null,
    tenant_id: organizationId || null,
    remote_id: remoteId,
    remote_source: 'workout_program',
    name: exercise?.name || `Exercise ${remoteExerciseId}`,
    category: exercise?.category || null,
    description: exercise?.description || null,
    secondary_muscle: exercise?.secondary_muscle || null,
    body_part: exercise?.body_part || null,
    primary_muscle: exercise?.primary_muscle || null,
    secondary_muscles: exercise?.secondary_muscles || null,
    instructions: exercise?.instructions || null,
    difficulty: exercise?.difficulty || null,
    equipment: exercise?.equipment || null,
    movement: exercise?.movement || null,
    exercise_type: exercise?.exercise_type || null,
    exercise_category: exercise?.exercise_category || null,
    image_url: exercise?.image_url || null,
    image_key: exercise?.image_key || null,
    source: 'program',
    archived: 0,
    synced: 1,
  });

  return Number(localExerciseId);
};

const getOrCreateLocalWorkout = async (snapshot: ProgramWorkoutSessionSnapshot) => {
  const remoteId = toTextId(snapshot.programWorkoutId);
  const existing = await selectRawOne<{ id: number }>(
    'SELECT id FROM workouts WHERE remote_id = ? AND remote_source = ? LIMIT 1',
    [remoteId, 'workout_program']
  );

  if (existing?.id) {
    await executeRaw(
      `UPDATE workouts
       SET name = ?,
           description = ?,
           organization_id = ?,
           tenant_id = ?,
           program_id = ?,
           program_workout_id = ?,
           assignment_id = ?,
           source_workout_id = ?,
           updated_at = datetime('now')
       WHERE id = ?`,
      [
        snapshot.name || `Program Workout ${snapshot.programWorkoutId}`,
        snapshot.description || null,
        snapshot.organizationId,
        snapshot.organizationId,
        toTextId(snapshot.programId),
        toTextId(snapshot.programWorkoutId),
        toTextId(snapshot.assignmentId),
        toTextId(snapshot.workoutId),
        existing.id,
      ]
    );
    return existing.id;
  }

  const localWorkoutId = await insert('workouts', {
    user_id: snapshot.userId || null,
    organization_id: snapshot.organizationId,
    tenant_id: snapshot.organizationId,
    remote_id: remoteId,
    remote_source: 'workout_program',
    program_id: toTextId(snapshot.programId),
    program_workout_id: toTextId(snapshot.programWorkoutId),
    assignment_id: toTextId(snapshot.assignmentId),
    source_workout_id: toTextId(snapshot.workoutId),
    name: snapshot.name || `Program Workout ${snapshot.programWorkoutId}`,
    type: 'program',
    section: snapshot.weekNumber ? `week-${snapshot.weekNumber}` : null,
    description: snapshot.description || null,
    deleted: 0,
    archived: 0,
    synced: 1,
  });

  return Number(localWorkoutId);
};

const getOrCreateLocalWorkoutTemplate = async (snapshot: WorkoutTemplateSessionSnapshot) => {
  const remoteId = toTextId(snapshot.workoutId);
  const existing = await selectRawOne<{ id: number }>(
    'SELECT id FROM workouts WHERE remote_id = ? AND remote_source = ? LIMIT 1',
    [remoteId, 'workout_template']
  );

  if (existing?.id) {
    await executeRaw(
      `UPDATE workouts
       SET name = ?,
           type = ?,
           section = ?,
           description = ?,
           organization_id = ?,
           tenant_id = ?,
           source_workout_id = ?,
           updated_at = datetime('now')
       WHERE id = ?`,
      [
        snapshot.name,
        snapshot.type || null,
        snapshot.section || null,
        snapshot.description || null,
        snapshot.organizationId || null,
        snapshot.organizationId || null,
        remoteId,
        existing.id,
      ]
    );
    return existing.id;
  }

  const localWorkoutId = await insert('workouts', {
    user_id: snapshot.userId || null,
    organization_id: snapshot.organizationId || null,
    tenant_id: snapshot.organizationId || null,
    remote_id: remoteId,
    remote_source: 'workout_template',
    source_workout_id: remoteId,
    name: snapshot.name,
    type: snapshot.type || null,
    section: snapshot.section || null,
    description: snapshot.description || null,
    deleted: 0,
    archived: 0,
    synced: 1,
  });

  return Number(localWorkoutId);
};

export async function importProgramWorkoutSnapshot(snapshot: ProgramWorkoutSessionSnapshot): Promise<number> {
  const localWorkoutId = await getOrCreateLocalWorkout(snapshot);

  // await executeRaw('DELETE FROM workout_exercise_sets WHERE workout_id = ?', [localWorkoutId]);
  // await executeRaw('DELETE FROM workout_exercises WHERE workout_id = ?', [localWorkoutId]);

  for (const programExercise of snapshot.exercises) {
    const remoteExercise = programExercise.exercise || programExercise.exercises || null;
    const localExerciseId = await getOrCreateLocalExercise(
      programExercise.exercise_id,
      remoteExercise,
      snapshot.organizationId,
      snapshot.userId
    );

    const sets = programExercise.sets || programExercise.workout_program_exercise_sets || [];
    await insert('workout_exercises', {
      user_id: snapshot.userId || null,
      tenant_id: snapshot.organizationId,
      remote_id: toTextId(programExercise.id),
      remote_source: 'workout_program_exercise',
      workout_id: localWorkoutId,
      exercise_id: localExerciseId,
      superset_id: programExercise.superset_id || null,
      order_index: programExercise.order_index || 0,
      default_sets: programExercise.default_sets || sets.length || 1,
      default_reps: programExercise.default_reps || sets[0]?.planned_reps || 1,
      weight: programExercise.weight || 0,
      section: programExercise.section || 'main',
      setsArray: JSON.stringify(sets),
      deleted: 0,
      synced: 1,
    });

    for (const set of sets) {
      await insert('workout_exercise_sets', {
        tenant_id: snapshot.organizationId,
        workout_id: localWorkoutId,
        exercise_id: localExerciseId,
        set_number: set.set_number,
        planned_reps: set.planned_reps || programExercise.default_reps || 1,
        planned_weight: set.planned_weight ?? programExercise.weight ?? null,
        duration_seconds: set.duration_seconds ?? null,
        deleted: 0,
        synced: 1,
      });
    }
  }

  return localWorkoutId;
}

export async function importWorkoutTemplateSnapshot(snapshot: WorkoutTemplateSessionSnapshot): Promise<number> {
  const localWorkoutId = await getOrCreateLocalWorkoutTemplate(snapshot);

  // await executeRaw('DELETE FROM workout_exercise_sets WHERE workout_id = ?', [localWorkoutId]);
  // await executeRaw('DELETE FROM workout_exercises WHERE workout_id = ?', [localWorkoutId]);

  for (const templateExercise of snapshot.exercises) {
    const remoteExercise = templateExercise.exercise || templateExercise.exercises || null;
    const localExerciseId = await getOrCreateLocalExercise(
      templateExercise.exercise_id,
      remoteExercise,
      snapshot.organizationId,
      snapshot.userId
    );

    const sets = templateExercise.sets || templateExercise.workout_program_exercise_sets || [];
    await insert('workout_exercises', {
      user_id: snapshot.userId || null,
      tenant_id: snapshot.organizationId || null,
      remote_id: toTextId(templateExercise.id),
      remote_source: 'workout_template_exercise',
      workout_id: localWorkoutId,
      exercise_id: localExerciseId,
      superset_id: templateExercise.superset_id || null,
      order_index: templateExercise.order_index || 0,
      default_sets: templateExercise.default_sets || sets.length || 1,
      default_reps: templateExercise.default_reps || sets[0]?.planned_reps || 1,
      weight: templateExercise.weight || 0,
      section: templateExercise.section || 'main',
      setsArray: JSON.stringify(sets),
      deleted: 0,
      synced: 1,
    });

    for (const set of sets) {
      await insert('workout_exercise_sets', {
        tenant_id: snapshot.organizationId || null,
        workout_id: localWorkoutId,
        exercise_id: localExerciseId,
        set_number: set.set_number,
        planned_reps: set.planned_reps || templateExercise.default_reps || 1,
        planned_weight: set.planned_weight ?? templateExercise.weight ?? null,
        duration_seconds: set.duration_seconds ?? null,
        deleted: 0,
        synced: 1,
      });
    }
  }

  return localWorkoutId;
}

export async function startWorkoutTemplateSession(snapshot: WorkoutTemplateSessionSnapshot): Promise<{
  localWorkoutId: number;
  localSessionId: number;
}> {
  const localWorkoutId = await importWorkoutTemplateSnapshot(snapshot);
  const activeSession = await getActiveSession();

  if (activeSession?.id) {
    if (activeSession.workout_id === localWorkoutId) {
      return { localWorkoutId, localSessionId: activeSession.id };
    }

    throw new Error('You already have an active workout session. Finish or cancel it before starting another workout.');
  }

  const localSessionId = await createWorkoutSession(localWorkoutId, {
    organizationId: snapshot.organizationId,
    clientSessionId: `template-${snapshot.workoutId}-${Date.now()}`,
    remoteSource: 'workout_template',
    userId: snapshot.userId,
  });
  await generateExerciseLogsAndSets(localSessionId, localWorkoutId);

  return { localWorkoutId, localSessionId };
}

export async function startProgramWorkoutSession(snapshot: ProgramWorkoutSessionSnapshot): Promise<{
  localWorkoutId: number;
  localSessionId: number;
}> {
  const localWorkoutId = await importProgramWorkoutSnapshot(snapshot);
  const activeSession = await getActiveSession(localWorkoutId);
  if (activeSession?.id) {
    return { localWorkoutId, localSessionId: activeSession.id };
  }

  const localSessionId = await createWorkoutSession(localWorkoutId, {
    organizationId: snapshot.organizationId,
    programId: snapshot.programId,
    programWorkoutId: snapshot.programWorkoutId,
    assignmentId: snapshot.assignmentId,
    progressId: snapshot.progressId,
    clientSessionId: `program-${snapshot.programWorkoutId}-${Date.now()}`,
    remoteSource: 'workout_program',
    userId: snapshot.userId,
  });
  await generateExerciseLogsAndSets(localSessionId, localWorkoutId);
  await hydrateSessionClientIds(localSessionId);

  return { localWorkoutId, localSessionId };
}

async function hydrateSessionClientIds(localSessionId: number) {
  const exerciseLogs = await selectRaw<{ id: number }>(
    'SELECT id FROM exercise_logs WHERE workout_session_id = ? ORDER BY id',
    [localSessionId]
  );

  for (const exerciseLog of exerciseLogs) {
    await executeRaw(
      'UPDATE exercise_logs SET client_exercise_log_id = ? WHERE id = ?',
      [`exercise-log-${localSessionId}-${exerciseLog.id}`, exerciseLog.id]
    );

    const setLogs = await selectRaw<{ id: number; set_number: number }>(
      'SELECT id, set_number FROM set_logs WHERE exercise_log_id = ? ORDER BY set_number',
      [exerciseLog.id]
    );

    for (const setLog of setLogs) {
      await executeRaw(
        'UPDATE set_logs SET client_set_log_id = ? WHERE id = ?',
        [`set-log-${localSessionId}-${exerciseLog.id}-${setLog.set_number}`, setLog.id]
      );
    }
  }
}
