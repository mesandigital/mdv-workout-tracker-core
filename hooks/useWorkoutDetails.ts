import { useQuery } from '@tanstack/react-query';
import { WorkoutSessionApi } from '../sessions';

export function useWorkoutDetails(workoutId: number | null) {
  return useQuery({
    queryKey: ['workoutDetails', workoutId],
    queryFn: () => {
      if (!workoutId) return null;
      return WorkoutSessionApi.fetchWorkoutDetails(workoutId!.toString());
    },
    enabled: !!workoutId,
  });
}
