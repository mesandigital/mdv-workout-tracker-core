import {
  updateSessionNotes,
  updateExerciseLog,
  updateSessionDateQuery,
  addExerciseToSession,
  fetchWorkoutSessionWithLastSessionDate,
  removeExerciseFromSession,
  reorderSessionExercises,
  saveSessionExerciseStructure,
  fetchWorkoutDetails,
  Workout,
  type SessionExerciseStructureInput,
} from '../repositories/session.queries';
import {
  startProgramWorkoutSession,
  startWorkoutTemplateSession,
  type ProgramWorkoutSessionSnapshot,
  type WorkoutTemplateSessionSnapshot,
} from '../repositories/programWorkoutBridge.queries';

import { HydratedExercise, WorkoutSession, Set } from '../../types';
import type { PersonalRecord } from '../../types';
import type { WorkoutSessionData } from '../session.types';
import {
  addSetLog as addCoreSetLog,
  addWorkoutSessionBlockUnit,
  updateWorkoutSessionBlockRest,
  convertWorkoutSessionBlockToStandalone,
  checkWorkoutSessionCompletion,
  createWorkoutSession as createCoreWorkoutSession,
  deleteWorkoutSession as deleteCoreWorkoutSession,
  deleteSetLog as deleteCoreSetLog,
  endWorkoutSession as endCoreWorkoutSession,
  generateExerciseLogsAndSets as generateCoreExerciseLogsAndSets,
  getActiveWorkoutSession,
  setCompletedReps,
  updateSetLog as updateCoreSetLog,
} from '../../repositories/sessions';

export const WorkoutSessionApi = {
  createWorkoutSession: async (workoutId: number): Promise<number> => {
    return await createCoreWorkoutSession(workoutId);
  },
  startProgramWorkoutSession: async (
    snapshot: ProgramWorkoutSessionSnapshot,
  ) => {
    return await startProgramWorkoutSession(snapshot);
  },
  startWorkoutTemplateSession: async (
    snapshot: WorkoutTemplateSessionSnapshot,
  ) => {
    return await startWorkoutTemplateSession(snapshot);
  },
  getActiveSession: async (
    workoutId?: number,
  ): Promise<WorkoutSession | null> => {
    return (await getActiveWorkoutSession(workoutId)) as WorkoutSession | null;
  },
  fetchWorkoutDetails: async (id: string): Promise<Workout | null> => {
    return await fetchWorkoutDetails(Number(id));
  },
  fetchWorkoutSession: async (
    sessionId: string,
  ): Promise<WorkoutSessionData> => {
    return await fetchWorkoutSessionWithLastSessionDate(Number(sessionId));
  },
  checkSessionCompletion: async (sessionId: number) => {
    return await checkWorkoutSessionCompletion(sessionId);
  },
  updateSessionDate: async (
    sessionId: number,
    newDate: string,
    duration?: number,
  ): Promise<void> => {
    return await updateSessionDateQuery(sessionId, newDate, duration);
  },
  updateSessionNotes: async (
    sessionId: number,
    notes: string,
  ): Promise<void> => {
    return await updateSessionNotes(sessionId, notes);
  },
  // Only ends the session and saves notes
  endWorkoutSession: async (
    sessionId: number,
    notes?: string,
    finishedAt?: string,
    duration?: number,
  ): Promise<PersonalRecord[]> => {
    return await endCoreWorkoutSession(sessionId, notes, finishedAt, duration);
  },
  deleteWorkoutSession: async (sessionId: number): Promise<void> => {
    return await deleteCoreWorkoutSession(sessionId);
  },

  // EXERCISE MANAGEMENT
  addExerciseToSession: async (sessionId: number, exerciseId: number) => {
    return addExerciseToSession(sessionId, exerciseId);
  },
  removeExerciseFromSession: async (exerciseId: number) => {
    return removeExerciseFromSession(exerciseId);
  },
  reorderSessionExercises: async (
    sessionId: number,
    orderedExerciseIds: number[],
  ) => {
    return await reorderSessionExercises(sessionId, orderedExerciseIds);
  },
  saveSessionExerciseStructure: async (
    sessionId: number,
    exercises: SessionExerciseStructureInput[],
  ) => {
    return await saveSessionExerciseStructure(sessionId, exercises);
  },
  generateExerciseLogsAndSets: async (
    sessionId: number,
    workoutId: number,
  ): Promise<void> => {
    return generateCoreExerciseLogsAndSets(sessionId, workoutId);
  },
  updateExerciseLog: async (
    exerciseLogId: number,
    weight?: number | null,
    plannedReps?: number,
  ) => {
    await updateExerciseLog(exerciseLogId, weight, plannedReps);
    return { exerciseLogId, weight, plannedReps };
  },

  // SET LOGS MANAGEMENT
  addSetLog: async (exerciseLogId: number, data: Set) => {
    return await addCoreSetLog({
      exercise_log_id: exerciseLogId,
      set_number: data.setNumber,
      planned_reps: data.plannedReps,
      weight: data.weight,
      completed: data.completed,
      drop_sets: data.dropSets,
      planned_duration_seconds: data.plannedDurationSeconds,
      round_number: data.roundNumber,
    });
  },
  addBlockUnit: async (sessionId: number, blockId: number) => {
    return addWorkoutSessionBlockUnit(sessionId, blockId);
  },
  updateBlockRest: async (
    sessionId: number,
    blockId: number,
    seconds: number,
  ) => {
    return updateWorkoutSessionBlockRest(sessionId, blockId, seconds);
  },
  convertBlockToStandalone: async (sessionId: number, blockId: number) => {
    return convertWorkoutSessionBlockToStandalone(sessionId, blockId);
  },
  updateSetLog: async (
    setId: number,
    plannedReps: number,
    weight: number | null,
    reps?: number,
    dropSets?: HydratedExercise['sets'][number]['dropSets'],
    plannedDurationSeconds?: number | null,
    durationSeconds?: number | null,
    completed?: number,
  ) => {
    await updateCoreSetLog(setId, {
      planned_reps: plannedReps,
      weight,
      reps,
      drop_sets: dropSets,
      planned_duration_seconds: plannedDurationSeconds,
      duration_seconds: durationSeconds,
      completed,
    });
    return {
      setId,
      plannedReps,
      weight,
      reps,
      dropSets,
      plannedDurationSeconds,
      durationSeconds,
      completed,
    };
  },
  updateSetLogStatus: async (
    setId: number,
    reps: number | null,
    completed: 0 | 1,
  ) => {
    await setCompletedReps(setId, reps);
    return { setId, reps, completed };
  },
  deleteSetLog: async (setId: number) => {
    return await deleteCoreSetLog(setId);
  },
};
