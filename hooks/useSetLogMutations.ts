import { useMutation, useQueryClient } from '@tanstack/react-query';
import { WorkoutSessionApi } from '../sessions';
import { Set } from '../types';

export function useAddSetLog(sessionId: number) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (data: Set) => {
      return WorkoutSessionApi.addSetLog(
        data.exerciseLogId, {
        exerciseLogId: data.exerciseLogId,
          setNumber: data.setNumber,
          plannedReps: data.plannedReps,
          weight: data.weight,
          completed: data.completed,
          dropSets: data.dropSets,
          plannedDurationSeconds: data.plannedDurationSeconds,
          roundNumber: data.roundNumber,
        }
      );
    },
    onSuccess: () => {
      // Invalidate both sessionExercises and workoutSession queries to ensure UI updates
      queryClient.invalidateQueries({ queryKey: ['sessionExercises', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['workoutSession', sessionId] });
    },
    onError: (err) => {
      console.error('Failed to add set log:', err);
    },
  });

  return {
    addSetLog: mutation.mutateAsync,
    isAdding: mutation.isPending,
    error: mutation.error,
  }
}

export function useDeleteSetLog() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (setId: number) => {
      return WorkoutSessionApi.deleteSetLog(setId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries();
    },
    onError: (err) => {
      console.error('Failed to delete set log:', err);
    },
  });

  return {
    deleteSetLog: mutation.mutateAsync,
    isDeleting: mutation.isPending,
    error: mutation.error,
  }
}

export function useAddBlockUnit(sessionId: number) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (blockId: number) => WorkoutSessionApi.addBlockUnit(sessionId, blockId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workoutSession', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['sessionExercises', sessionId] });
    },
    onError: (error) => {
      console.error('Failed to add block unit:', error);
    },
  });
  return { addBlockUnit: mutation.mutateAsync };
}

export function useUpdateBlockRest(sessionId: number) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: ({ blockId, seconds }: { blockId: number; seconds: number }) => (
      WorkoutSessionApi.updateBlockRest(sessionId, blockId, seconds)
    ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workoutSession', sessionId] });
    },
    onError: (error) => {
      console.error('Failed to update block rest:', error);
    },
  });
  return { updateBlockRest: (blockId: number, seconds: number) => mutation.mutateAsync({ blockId, seconds }) };
}

export function useConvertBlockToStandalone(sessionId: number) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (blockId: number) => WorkoutSessionApi.convertBlockToStandalone(sessionId, blockId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workoutSession', sessionId] });
    },
    onError: (error) => {
      console.error('Failed to convert block:', error);
    },
  });
  return { convertBlockToStandalone: mutation.mutateAsync };
}

export function useSetLogMutations(sessionId: number) {
  const addSetLogMutation = useAddSetLog(sessionId);
  const deleteSetLogMutation = useDeleteSetLog();
  const addBlockUnitMutation = useAddBlockUnit(sessionId);
  const updateBlockRestMutation = useUpdateBlockRest(sessionId);
  const convertBlockMutation = useConvertBlockToStandalone(sessionId);

  return {
    ...addSetLogMutation,
    ...deleteSetLogMutation,
    ...addBlockUnitMutation,
    ...updateBlockRestMutation,
    ...convertBlockMutation,
  }
}
