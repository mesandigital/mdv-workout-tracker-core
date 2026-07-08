import { useQuery } from '@tanstack/react-query';
import { WorkoutSessionApi } from '../sessions';

/**
 * Hook to check for any active workout session (regardless of workout)
 */
export function useAnyActiveSession() {
  return useQuery({
    queryKey: ['anyActiveWorkoutSession'],
    queryFn: () => WorkoutSessionApi.getActiveSession(undefined),
    staleTime: 30000, // 30 seconds
    refetchInterval: 30000, // Refresh every 30 seconds
  });
}
