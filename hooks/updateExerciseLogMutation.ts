import { useMutation, useQueryClient } from '@tanstack/react-query';
import { WorkoutSessionApi } from '../sessions';

// Dedicated mutation for exercise log (plannedReps, weight)
export function useUpdateExerciseLogMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      exerciseLogId,
      weight,
      plannedReps,
    }: {
      exerciseLogId: number;
      weight?: number | null;
      plannedReps?: number;
    }) => {
      return WorkoutSessionApi.updateExerciseLog(
        exerciseLogId,
        weight,
        plannedReps,
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries();
    },
  });
}
