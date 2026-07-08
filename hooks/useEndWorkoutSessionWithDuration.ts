import { useMutation, useQueryClient } from '@tanstack/react-query';
import { WorkoutSessionApi } from '../sessions';

interface EndSessionWithDurationInput {
  sessionId: number;
  notes?: string;
  startedAt: string;
}

export function useEndWorkoutSessionWithDuration() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async ({ sessionId, notes, startedAt }: EndSessionWithDurationInput) => {
      // Calculate duration in seconds
      const finishedAt = new Date().toISOString();
      const start = new Date(startedAt).getTime();
      const end = new Date(finishedAt).getTime();
      const duration = Math.floor((end - start) / 1000); // seconds
      return WorkoutSessionApi.endWorkoutSession(sessionId, notes, finishedAt, duration);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['workoutSession', variables.sessionId]
      });
      queryClient.setQueryData(['anyActiveWorkoutSession'], null);
      queryClient.setQueriesData({ queryKey: ['activeWorkoutSession'] }, null);
      queryClient.invalidateQueries({
        queryKey: ['activeWorkoutSession']
      });
      queryClient.invalidateQueries({
        queryKey: ['anyActiveWorkoutSession']
      });
      queryClient.invalidateQueries({
        queryKey: ['workouts']
      });
      queryClient.invalidateQueries({
        queryKey: ['workoutLogs']
      });
      queryClient.invalidateQueries({
        queryKey: ['workoutStreak']
      });
    },
    onError: (error) => {
      console.error('Failed to end workout session with duration:', error);
    }
  });

  return {
    endWorkoutWithDurationAsync: mutation.mutateAsync,
    isLoading: mutation.isPending,
    error: mutation.error
  };
}
