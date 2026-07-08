import { useQuery } from '@tanstack/react-query';
import { WorkoutSessionApi } from '../sessions';

export function useActiveSession(workoutId?: number) {
  return useQuery({
    queryKey: ['activeWorkoutSession', workoutId],
    queryFn: () => WorkoutSessionApi.getActiveSession(workoutId),
    staleTime: 0,
    refetchOnMount: 'always',
  });
}
