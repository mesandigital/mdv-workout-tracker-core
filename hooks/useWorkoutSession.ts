
import { useState, useEffect } from 'react';
import { Alert } from 'react-native';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { WorkoutSessionApi } from '../sessions';
import { useActiveSession } from './useActiveSession';
import { useWorkoutDetails } from './useWorkoutDetails';

/**
 * Hook to fetch hydrated workout session data, including workout name
 * @param sessionId - The workout session ID
 * @returns Query with workout name and exercises
 */
export function useWorkoutSession(sessionId: number | null) {
  return useQuery({
    queryKey: ['workoutSession', sessionId],
    queryFn: () => WorkoutSessionApi.fetchWorkoutSession(sessionId!.toString()),
    enabled: !!sessionId,
  });
}

/**
 * Hook to manage workout session data for the WorkoutScreen
 * Handles workout details, active session detection, and auto-resume logic
 */
export function useWorkoutSessionData(workoutId: number) {
  const [sessionId, setSessionId] = useState<number | null>(null);
  const { data: workoutDetails } = useWorkoutDetails(workoutId);
  const { data: activeSession, refetch: refetchActiveSession } = useActiveSession(workoutId);
  const { data: { exercises = [] } = {} } = useWorkoutSession(sessionId);

  // Auto-resume active session if it exists for this workout
  useEffect(() => {
    if (activeSession?.id && !sessionId) {
      setSessionId(activeSession.id);
    }
  }, [activeSession, sessionId]);

  return {
    sessionId,
    setSessionId,
    workoutDetails,
    exercises,
    activeSession,
    refetchActiveSession,
  };
}

/**
 * Hook to manage adding/removing exercises from a workout session
 * @param sessionId - The workout session ID
 * @param onSuccess - Callback function to be called on successful mutation
 * @returns Object containing addExercise and removeExercise mutations
 */
export function useSessionExercises(sessionId: number, onSuccess?: () => void) {
  const queryClient = useQueryClient();

  // Add exercise to session
  const addExercise = useMutation({
    mutationFn: (exerciseId: number) => WorkoutSessionApi.addExerciseToSession(sessionId, exerciseId),
    onError: () => {
      Alert.alert('Error', 'Failed to add exercise');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['workoutSession', sessionId] });
    },
    onSuccess,
  });

  // Remove exercise from session
  const removeExercise = useMutation({
    mutationFn: (exerciseId: number) => {
      if (!sessionId) throw new Error('Invalid session ID');
      if (!exerciseId) throw new Error('Invalid exercise ID');
      return WorkoutSessionApi.removeExerciseFromSession(exerciseId);
    },
    onError: () => {
      Alert.alert('Error', 'Failed to remove exercise');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['workoutSession', sessionId] });
    },
    onSuccess,
  });

  // Reorder exercises in session
  const reorderExercises = useMutation({
    mutationFn: (exerciseIds: number[]) => {
      if (!sessionId) throw new Error('Invalid session ID');
      return WorkoutSessionApi.reorderSessionExercises(sessionId, exerciseIds);
    },
    onError: () => {
      Alert.alert('Error', 'Failed to reorder exercises');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['workoutSession', sessionId] });
    },
    onSuccess,
  });

  const saveExerciseStructure = useMutation({
    mutationFn: (exercises: Parameters<typeof WorkoutSessionApi.saveSessionExerciseStructure>[1]) => {
      if (!sessionId) throw new Error('Invalid session ID');
      return WorkoutSessionApi.saveSessionExerciseStructure(sessionId, exercises);
    },
    onError: () => {
      Alert.alert('Error', 'Failed to save exercise structure');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['workoutSession', sessionId] });
    },
    onSuccess,
  });
  
    // Query for current session exercises
  const sessionExercisesQuery = useQuery({
    queryKey: ['workoutSession', sessionId, 'exercises'],
    queryFn: () => WorkoutSessionApi.fetchWorkoutSession(sessionId!.toString()),
    enabled: !!sessionId,
  });

  // Helper to update session exercises in bulk
  const updateSessionExercises = async (selectedExercises: any[]) => {
    const current = sessionExercisesQuery.data?.exercises || [];
    const currentIds = current.map(ex => ex.exerciseLogId || ex.id);
    const selectedIds = selectedExercises.map(ex => ex.exerciseLogId || ex.id);
    // Add new exercises
    for (const ex of selectedExercises) {
      const selectedId = ex.exerciseLogId || ex.id;
      if (!currentIds.includes(selectedId)) {
        await addExercise.mutateAsync(ex.exerciseId || ex.id);
      }
    }
    // Remove unselected exercises
    for (const ex of current) {
      const currentId = ex.exerciseLogId || ex.id;
      if (currentId && !selectedIds.includes(currentId)) {
        await removeExercise.mutateAsync(currentId);
      }
    }
  };

  return {
    addExercise,
    removeExercise,
    reorderExercises,
    saveExerciseStructure,
    updateSessionExercises,
    sessionExercises: sessionExercisesQuery,
  };
}
