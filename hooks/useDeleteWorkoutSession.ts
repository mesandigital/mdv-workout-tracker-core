import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert } from 'react-native';
import { WorkoutSessionApi } from '../sessions';
import { completePlannedWorkoutsForSession } from '../../../features/planner/plannerReconciliation';

interface EndSessionInput {
  sessionId: number;
  notes?: string;
}

export function useDeleteWorkoutSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sessionId }: { sessionId: number }) => {
      await WorkoutSessionApi.deleteWorkoutSession(sessionId);
    },
    onSuccess: (_, variables) => {
      const sessionId = variables.sessionId;

      queryClient.setQueryData(['anyActiveWorkoutSession'], null);
      queryClient.setQueriesData({ queryKey: ['activeWorkoutSession'] }, null);
      queryClient.removeQueries({ queryKey: ['workoutSession', sessionId] });

      queryClient.invalidateQueries({ queryKey: ['activeWorkoutSession'] });
      queryClient.invalidateQueries({ queryKey: ['anyActiveWorkoutSession'] });
      queryClient.invalidateQueries({ queryKey: ['workoutSession'] });
    },
    onError: (error) => {
      console.error('❌ Failed to delete workout session:', error);
      Alert.alert('Error', 'Failed to delete workout session.');
    },
  });
}

export function useEndWorkoutSession() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async ({ sessionId, notes }: EndSessionInput) => {
      return WorkoutSessionApi.endWorkoutSession(sessionId, notes);
    },
    onSuccess: async (_, variables) => {
      await completePlannedWorkoutsForSession(variables.sessionId);
      // Invalidate relevant queries
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
      queryClient.invalidateQueries({
        queryKey: ['weeklyWorkouts']
      });
      queryClient.invalidateQueries({
        queryKey: ['allWorkoutDates']
      });
      queryClient.invalidateQueries({
        queryKey: ['missedExercisesThisWeek']
      });
      queryClient.invalidateQueries({
        queryKey: ['bodyPartTrainedThisWeek']
      });
      queryClient.invalidateQueries({
        queryKey: ['workoutDetails']
      });
      queryClient.invalidateQueries({
        queryKey: ['weeklyPlans']
      });
      queryClient.invalidateQueries({
        queryKey: ['weeklyPlanWorkouts']
      });
      queryClient.invalidateQueries({
        queryKey: ['todaysWorkout']
      });
    },
    onError: (error) => {
      console.error('Failed to end workout session:', error);
    }
  });

  return {
    endWorkoutAsync: mutation.mutateAsync,
    isLoading: mutation.isPending,
    error: mutation.error
  };
}
