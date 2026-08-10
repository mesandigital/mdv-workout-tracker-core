import { useMutation, useQueryClient } from '@tanstack/react-query';
import { startQuickWorkoutSession } from '..';

export function useStartQuickWorkoutSession() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => startQuickWorkoutSession(),
    onSuccess: sessionId => {
      queryClient.invalidateQueries({ queryKey: ['anyActiveWorkoutSession'] });
      queryClient.invalidateQueries({ queryKey: ['workoutSession', sessionId] });
    },
  });

  return {
    startQuickWorkout: mutation.mutate,
    startQuickWorkoutAsync: mutation.mutateAsync,
    sessionId: mutation.data,
    isLoading: mutation.isPending,
    error: mutation.error,
  };
}
