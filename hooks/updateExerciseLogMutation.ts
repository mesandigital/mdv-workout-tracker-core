import { useMutation, useQueryClient } from '@tanstack/react-query';
import { WorkoutSessionApi } from '../sessions';

// Dedicated mutation for exercise log (plannedReps, weight)
const queryClient = useQueryClient();
export const updateExerciseLogMutation = useMutation({
    mutationFn: async ({ exerciseLogId, weight, plannedReps }: { exerciseLogId: number; weight?: number; plannedReps?: number }) => {
        return WorkoutSessionApi.updateExerciseLog(exerciseLogId, weight, plannedReps);
    },
    onSuccess: () => {
        queryClient.invalidateQueries();
    },
    onError: (err) => {
        // Optionally handle error
    },
});

