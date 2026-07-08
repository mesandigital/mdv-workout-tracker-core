import { useMutation, useQueryClient } from '@tanstack/react-query';
import { WorkoutSessionApi } from '../sessions';

export function useDeleteWorkoutLog(sessionId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await WorkoutSessionApi.deleteWorkoutSession(sessionId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries();
    },
  });
}
