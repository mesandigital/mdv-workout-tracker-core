import { useMutation, useQueryClient } from '@tanstack/react-query';
import { WorkoutSessionApi } from '../sessions';

interface CycleSetInput {
  setId: number;
  currentReps: number | null;
  maxReps: number;
  sessionId: number;
}

export function useCycleSetReps() {
  const queryClient = useQueryClient();

  // mutationFn log will confirm if this is called
  // Recommend using mutateAsync for better error visibility
  const mutation = useMutation({
    mutationFn: async ({
      setId,
      currentReps,
      maxReps
    }: CycleSetInput) => {
      // Determine next state
      let nextReps: number | null;
      let completed: 0 | 1;

      if (currentReps === null) {
        nextReps = maxReps;
        completed = 1;
      } else if (currentReps > 0) {
        nextReps = currentReps - 1;
        completed = 1;
      } else {
        nextReps = null;
        completed = 0;
      }

      await WorkoutSessionApi.updateSetLogStatus(setId, nextReps, completed);

      return { setId, reps: nextReps, completed };
    },

    onMutate: async (variables) => {
      const { sessionId, setId, currentReps, maxReps } = variables;

      await queryClient.cancelQueries({
        queryKey: ['workoutSession', sessionId]
      });

      const prev = queryClient.getQueryData<any[]>([
        'workoutSession',
        sessionId
      ]);

      // Optimistic update: update exercises array inside the session object
      queryClient.setQueryData(
        ['workoutSession', sessionId],
        (old: any) => {
          if (!old || !Array.isArray(old.exercises)) {
            return old;
          }
          return {
            ...old,
            exercises: old.exercises.map((ex: any) => ({
              ...ex,
              sets: ex.sets.map((s: any) => {
                if (s.id !== setId) return s;
                let nextReps: number | null;
                let completed: 0 | 1;
                if (currentReps === null) {
                  nextReps = maxReps;
                  completed = 1;
                } else if (currentReps > 0) {
                  nextReps = currentReps - 1;
                  completed = 1;
                } else {
                  nextReps = null;
                  completed = 0;
                }
                return {
                  ...s,
                  reps: nextReps,
                  completed
                };
              })
            }))
          };
        }
      );

      return { prev };
    },

    onSuccess: () => {
      // alert('useCycleSetReps onSuccess called', data);
    },

    onError: (_err, variables, context) => {
      if (context?.prev) {
        queryClient.setQueryData(
          ['workoutSession', variables.sessionId],
          context.prev
        );
      }
    }
  });

  return {
    updateCompletedRep: mutation.mutateAsync,
    isUpdating: mutation.isPending,
    error: mutation.error
  };
}
