import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ProgressiveOverloadApi,
  ProgressiveOverloadRecommendation,
  WorkoutSessionApi,
} from '../sessions';

interface ApplyPOInput {
  sessionId: number;
  progressiveOverload?: number | { [exerciseId: number]: number };
  perExerciseOverload?: { [exerciseId: number]: boolean };
  recommendations?: ProgressiveOverloadRecommendation[];
}

export function useApplyProgressiveOverload() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async ({
      sessionId,
      progressiveOverload,
      perExerciseOverload,
      recommendations,
    }: ApplyPOInput) => {
      return ProgressiveOverloadApi.applyProgressiveOverload(
        sessionId,
        typeof progressiveOverload === 'number' ? progressiveOverload : 2.5,
        perExerciseOverload,
        typeof progressiveOverload === 'object'
          ? progressiveOverload
          : undefined,
        recommendations,
      );
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['workoutSession', variables.sessionId],
      });
      queryClient.invalidateQueries({
        queryKey: ['workouts'],
      });
      queryClient.invalidateQueries({
        queryKey: ['workoutTemplateProgressiveOverloadHistory'],
      });
      queryClient.invalidateQueries({
        queryKey: ['workoutDetails'],
      });
    },
    onError: error => {
      console.error('Failed to apply progressive overload:', error);
    },
  });

  return {
    applyPOAsync: mutation.mutateAsync,
    isLoading: mutation.isPending,
    error: mutation.error,
  };
}

export function useCheckSessionCompletion() {
  const mutation = useMutation({
    mutationFn: async (sessionId: number) => {
      return WorkoutSessionApi.checkSessionCompletion(sessionId);
    },
  });
  return {
    checkCompletion: mutation.mutateAsync,
    isChecking: mutation.isPending,
    error: mutation.error,
  };
}

// export function useCheckSessionCompletion(sessionId?: string) {
//   return useQuery({
//     queryKey: ['workouts', sessionId],
//     queryFn: () => WorkoutSessionApi.checkSessionCompletion(sessionId),
//   });
// }
