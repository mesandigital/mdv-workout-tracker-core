// src/features/workouts/hooks/useStartWorkoutSession.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { startWorkoutSession } from '..';

interface StartWorkoutInput {
  workoutId: number;
}

export function useStartWorkoutSession() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async ({ workoutId }: StartWorkoutInput) => {
      return startWorkoutSession(workoutId);
    },

    onSuccess: (sessionId, variables) => {
      const { workoutId } = variables;

      // Cache active session
      queryClient.setQueryData(['activeWorkoutSession', workoutId], {
        id: sessionId,
        workout_id: workoutId
      });
      queryClient.setQueryData(['anyActiveWorkoutSession'], {
        id: sessionId,
        workout_id: workoutId
      });

      // Invalidate hydrated workout screen
      queryClient.invalidateQueries({
        queryKey: ['workoutSession', sessionId]
      });
    }
  });

  return {
    startWorkout: mutation.mutate,
    startWorkoutAsync: mutation.mutateAsync,
    sessionId: mutation.data,
    isLoading: mutation.isPending,
    error: mutation.error
  };
}
