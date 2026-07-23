import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert } from 'react-native';
import { SetRow, WorkoutSessionApi } from '../sessions';

export function useUpdateSetRows(sessionId: number) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    // Accepts either set update or exercise_log update
    mutationFn: async (params: {
      setId?: number;
      reps?: number;
      weight?: number | null;
      exerciseLogId?: number;
      plannedReps?: number;
      dropSets?: SetRow['dropSets'];
      plannedDurationSeconds?: number | null;
      durationSeconds?: number | null;
      completed?: number;
    }) => {
      if (params.setId !== undefined) {
        // Update set_log (set row)
        return WorkoutSessionApi.updateSetLog(
          params.setId,
          params.plannedReps ?? 0,
          params.weight ?? null,
          params.reps,
          params.dropSets,
          params.plannedDurationSeconds,
          params.durationSeconds,
          params.completed,
        );
      } else if (params.exerciseLogId !== undefined) {
        // Update exercise_log (weight/plannedReps for the exercise in this session)
        return WorkoutSessionApi.updateExerciseLog(
          params.exerciseLogId,
          params.weight,
          params.plannedReps,
        );
      } else {
        throw new Error('Either setId or exerciseLogId must be provided');
      }
    },
    onMutate: async variables => {
      await queryClient.cancelQueries({
        queryKey: ['workoutSession', sessionId],
      });
      const prev = queryClient.getQueryData<any>(['workoutSession', sessionId]);
      // Optimistic update: update exercises array inside the session object
      queryClient.setQueryData(['workoutSession', sessionId], (old: any) => {
        if (!old || !Array.isArray(old.exercises)) {
          return old;
        }
        let newExercises;
        if (variables.setId !== undefined) {
          // Set update
          newExercises = old.exercises.map((ex: any) => ({
            ...ex,
            sets: ex.sets.map((s: SetRow) =>
              s.id === variables.setId
                ? {
                    ...s,
                    reps: variables.reps,
                    weight:
                      variables.weight !== undefined
                        ? variables.weight
                        : s.weight,
                    dropSets: variables.dropSets ?? s.dropSets,
                    plannedDurationSeconds:
                      variables.plannedDurationSeconds ??
                      s.plannedDurationSeconds,
                    durationSeconds: variables.durationSeconds,
                    completed: variables.completed ?? s.completed,
                  }
                : s,
            ),
          }));
        } else if (variables.exerciseLogId !== undefined) {
          // Exercise_log update (weight/plannedReps)
          newExercises = old.exercises.map((ex: any) =>
            ex.exerciseLogId === variables.exerciseLogId
              ? {
                  ...ex,
                  weight:
                    variables.weight !== undefined
                      ? variables.weight
                      : ex.weight,
                  plannedReps:
                    variables.plannedReps !== undefined
                      ? variables.plannedReps
                      : ex.plannedReps,
                }
              : ex,
          );
        } else {
          newExercises = old.exercises;
        }
        return {
          ...old,
          exercises: newExercises,
        };
      });
      return { prev };
    },
    onError: (_err, _variables, context) => {
      if (context?.prev) {
        queryClient.setQueryData(['workoutSession', sessionId], context.prev);
      }
      Alert.alert('Error', 'Failed to update set');
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: ['workoutSession', sessionId],
      });
    },
  });

  return mutation;
}
