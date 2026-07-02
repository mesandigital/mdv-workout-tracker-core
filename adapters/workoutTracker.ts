import { useCallback, useEffect, useMemo, useState } from 'react';
import { removeWhere } from '../db';
import {
  addSetLog,
  addWorkoutSessionBlockUnit,
  updateWorkoutSessionBlockRest,
  convertWorkoutSessionBlockToStandalone,
  checkWorkoutSessionCompletion,
  deleteWorkoutSession,
  endWorkoutSession,
  getWorkoutSession,
  setCompletedReps,
  updateSetLog,
} from '../repositories';
import { updateSessionNotes } from '../sessions/repositories/session.queries';
import { saveProgressiveOverloadRecommendationSnapshots } from '../sessions/repositories/progressive.queries';
import { calculateProgressiveOverloadRecommendations } from '../sessions/utils';
import type { HydratedWorkoutSession } from '../types';

type AddSetLogInput = {
  exerciseLogId: number;
  setNumber: number;
  plannedReps: number;
  weight?: number | null;
  completed: number;
  dropSets?: UpdateSetRowInput['dropSets'];
  plannedDurationSeconds?: number | null;
  roundNumber?: number | null;
};

type UpdateSetRowInput = {
  setId?: number;
  reps?: number;
  weight?: number;
  exerciseLogId?: number;
  plannedReps?: number;
  dropSets?: Array<{
    plannedReps?: number | null;
    plannedWeight?: number | null;
    reps?: number | null;
    weight?: number | null;
    completed?: number;
  }>;
  plannedDurationSeconds?: number | null;
  durationSeconds?: number | null;
  completed?: number;
};

type UpdateCompletedRepInput = {
  setId: number;
  currentReps: number | null;
  maxReps: number;
  sessionId: number;
};

type HydratedExercise = {
  id?: number;
  exerciseId: number;
  exerciseLogId: number;
  name: string;
  plannedReps: number;
  weight?: number;
  restSeconds?: number | null;
  section?: string | null;
  blockId?: number | null;
  blockType?: 'straight_sets' | 'circuit' | 'superset' | 'giant_set' | 'interval' | null;
  blockName?: string | null;
  blockRounds?: number | null;
  blockRestBetweenRounds?: number | null;
  blockOrder?: number | null;
  supersetId?: number | null;
  groupId?: number | null;
  groupType?: 'superset' | 'drop_set' | 'circuit' | null;
  sets: Array<{
    id: number;
    exercise_log_id: number;
    planned_reps: number;
    plannedReps: number;
    reps: number | null;
    weight?: number | null;
    roundNumber?: number | null;
    completed: number;
    dropSets?: UpdateSetRowInput['dropSets'];
    plannedDurationSeconds?: number | null;
    durationSeconds?: number | null;
    previousBestWeight?: number | null;
    previousBestRepsAtWeight?: number | null;
    previousBestVolume?: number | null;
  }>;
};

type ActiveWorkoutSessionController = {
  sessionId: number | null;
  isLoading: boolean;
  setSessionId: (id: number | null) => void;
  exercises: HydratedExercise[];
  activeSession: any;
  workoutDetails?: any;
  isSessionExercisesLoading: boolean;
  sessionError?: any;
  isRemovingExercise: boolean;
  isChecking: boolean;
  isEndingWorkout: boolean;
  removeExercise: (exerciseId: number) => Promise<any>;
  addSetLog: (data: AddSetLogInput) => Promise<any>;
  addBlockUnit?: (blockId: number) => Promise<number>;
  updateBlockRest?: (blockId: number, seconds: number) => Promise<any>;
  convertBlockToStandalone?: (blockId: number) => Promise<any>;
  deleteSetLog: (setId: number) => Promise<any>;
  updateSetRow: (data: UpdateSetRowInput) => Promise<any>;
  updateCompletedRep: (data: UpdateCompletedRepInput) => Promise<any>;
  deleteSession: (sessionId: number) => Promise<any>;
  endSession: (sessionId: number, notes?: string, notificationContext?: any) => Promise<any>;
  checkCompletion: (sessionId: number | null) => Promise<any>;
  applyPOAsync: (data: any) => Promise<any>;
  refetchActiveSession?: () => Promise<any>;
  defaultRestSeconds?: number;
  defaultBlockRestSeconds?: number;
  progressionIncrement?: number;
};

export type CreateWorkoutTrackerCoreAdapterOptions = {
  onSessionIdChange?: (sessionId: number | null) => void;
  applyProgressiveOverload?: (data: any) => Promise<any>;
  defaultRestSeconds?: number;
  defaultBlockRestSeconds?: number;
  progressionIncrement?: number;
};

const mapSessionExercises = (session: HydratedWorkoutSession | null): HydratedExercise[] => (
  session?.exercises.map((exercise) => ({
    id: exercise.exerciseLogId,
    exerciseId: exercise.exerciseId,
    exerciseLogId: exercise.exerciseLogId,
    name: exercise.name,
    plannedReps: exercise.plannedReps || 0,
    weight: exercise.weight ?? undefined,
    restSeconds: exercise.restSeconds,
    section: exercise.section,
    blockId: exercise.blockId,
    blockType: exercise.blockType,
    blockName: exercise.blockName,
    blockRounds: exercise.blockRounds,
    blockRestBetweenRounds: exercise.blockRestBetweenRounds,
    blockOrder: exercise.blockOrder,
    supersetId: exercise.supersetId,
    groupId: exercise.groupId,
    groupType: exercise.groupType,
    sets: exercise.sets.map((set) => ({
      id: set.id,
      exercise_log_id: set.exercise_log_id,
      planned_reps: set.plannedReps,
      plannedReps: set.plannedReps,
      roundNumber: set.roundNumber,
      reps: set.reps,
      weight: set.weight,
      completed: set.completed,
      dropSets: set.dropSets,
      plannedDurationSeconds: set.plannedDurationSeconds,
      durationSeconds: set.durationSeconds,
      previousBestWeight: set.previousBestWeight,
      previousBestRepsAtWeight: set.previousBestRepsAtWeight,
      previousBestVolume: set.previousBestVolume,
    })),
  })) || []
);

export function createWorkoutTrackerCoreAdapter(options: CreateWorkoutTrackerCoreAdapterOptions = {}) {
  return {
    calculateProgressiveOverloadRecommendations,
    saveProgressiveOverloadRecommendationSnapshots,
    saveCompletionFeedback: (feedback: { sessionId: number; formattedNotes: string }) =>
      updateSessionNotes(feedback.sessionId, feedback.formattedNotes),
    useActiveWorkoutSession(sessionId: number | null): ActiveWorkoutSessionController {
      const [data, setData] = useState<HydratedWorkoutSession | null>(null);
      const [isLoading, setIsLoading] = useState(Boolean(sessionId));
      const [error, setError] = useState<unknown>(null);
      const [isMutating, setIsMutating] = useState(false);

      const loadSession = useCallback(async () => {
        if (!sessionId) {
          setData(null);
          setIsLoading(false);
          return null;
        }

        setIsLoading(true);
        setError(null);

        try {
          const session = await getWorkoutSession(sessionId);
          setData(session);
          return session;
        } catch (err) {
          setError(err);
          throw err;
        } finally {
          setIsLoading(false);
        }
      }, [sessionId]);

      useEffect(() => {
        loadSession();
      }, [loadSession]);

      const withRefresh = useCallback(async <T,>(action: () => Promise<T>) => {
        setIsMutating(true);
        try {
          const result = await action();
          await loadSession();
          return result;
        } finally {
          setIsMutating(false);
        }
      }, [loadSession]);

      const exercises = useMemo(() => mapSessionExercises(data), [data]);

      return useMemo(() => ({
        sessionId,
        setSessionId: options.onSessionIdChange || (() => {}),
        isLoading,
        exercises,
        activeSession: data?.session || null,
        workoutDetails: data ? {
          id: data.session.workout_id,
          name: data.workoutName,
          description: data.workoutDescription,
          exercises,
        } : null,
        isSessionExercisesLoading: isLoading,
        sessionError: error,
        isRemovingExercise: isMutating,
        isChecking: false,
        isEndingWorkout: isMutating,
        removeExercise: (exerciseLogId: number) => withRefresh(async () => {
          await removeWhere('set_logs', 'exercise_log_id = ?', [exerciseLogId]);
          await removeWhere('exercise_logs', 'id = ?', [exerciseLogId]);
        }),
        addSetLog: (input: AddSetLogInput) => withRefresh(() => addSetLog({
          exercise_log_id: input.exerciseLogId,
          set_number: input.setNumber,
          planned_reps: input.plannedReps,
          weight: input.weight,
          completed: input.completed,
          drop_sets: input.dropSets,
          planned_duration_seconds: input.plannedDurationSeconds,
          round_number: input.roundNumber,
        })),
        addBlockUnit: (blockId: number) => withRefresh(() => addWorkoutSessionBlockUnit(sessionId!, blockId)),
        updateBlockRest: (blockId: number, seconds: number) => withRefresh(() => updateWorkoutSessionBlockRest(sessionId!, blockId, seconds)),
        convertBlockToStandalone: (blockId: number) => withRefresh(() => convertWorkoutSessionBlockToStandalone(sessionId!, blockId)),
        deleteSetLog: (setId: number) => withRefresh(() => removeWhere('set_logs', 'id = ?', [setId])),
        updateSetRow: (input: UpdateSetRowInput) => {
          if (!input.setId) return Promise.resolve();

          return withRefresh(() => updateSetLog(input.setId!, {
            exercise_log_id: input.exerciseLogId,
            planned_reps: input.plannedReps,
            reps: input.reps,
            weight: input.weight,
            drop_sets: input.dropSets,
            planned_duration_seconds: input.plannedDurationSeconds,
            duration_seconds: input.durationSeconds,
            completed: input.completed,
          }));
        },
        updateCompletedRep: (input: UpdateCompletedRepInput) => withRefresh(() => {
          const nextReps = input.currentReps === null
            ? input.maxReps
            : input.currentReps <= 1
              ? null
              : input.currentReps - 1;

          return setCompletedReps(input.setId, nextReps);
        }),
        deleteSession: (id: number) => deleteWorkoutSession(id),
        endSession: (id: number, notes?: string) => endWorkoutSession(id, notes),
        checkCompletion: (id: number | null) => (
          id ? checkWorkoutSessionCompletion(id) : Promise.resolve(null)
        ),
        applyPOAsync: options.applyProgressiveOverload || (async () => null),
        refetchActiveSession: loadSession,
        defaultRestSeconds: options.defaultRestSeconds,
        defaultBlockRestSeconds: options.defaultBlockRestSeconds,
        progressionIncrement: options.progressionIncrement,
      }), [data, error, exercises, isLoading, isMutating, loadSession, sessionId, withRefresh]);
    },
  };
}
