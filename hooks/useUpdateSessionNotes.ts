import { useMutation } from '@tanstack/react-query';
import { WorkoutSessionApi } from '../sessions';

interface UpdateNotesInput {
  sessionId: number;
  notes: string;
}

export function useUpdateSessionNotes() {
  const mutation = useMutation({
    mutationFn: async ({ sessionId, notes }: UpdateNotesInput) => {
      return WorkoutSessionApi.updateSessionNotes(sessionId, notes);
    },

    onError: (error) => {
      console.error('Failed to update session notes:', error);
    }
  });

  return {
    updateNotes: mutation.mutateAsync,
    isUpdating: mutation.isPending,
    error: mutation.error
  };
}
