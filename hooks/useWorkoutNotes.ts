import { useState, useEffect, useRef } from 'react';
import { useUpdateSessionNotes } from './useUpdateSessionNotes';

interface UseWorkoutNotesProps {
  sessionId: number;
  initialNotes?: string | null;
}

/**
 * Hook to manage workout notes with auto-save functionality
 * @param sessionId - The ID of the workout session
 * @param initialNotes - Initial notes from the database
 * @returns notes value and setter function
 */
export function useWorkoutNotes({ sessionId, initialNotes }: UseWorkoutNotesProps) {
  const { updateNotes } = useUpdateSessionNotes();
  const [notes, setNotes] = useState<string>(initialNotes || '');
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load initial notes when they become available
  useEffect(() => {
    if (initialNotes !== undefined && initialNotes !== null) {
      setNotes(initialNotes);
    }
  }, [initialNotes]);

  // Debounced save of notes to database
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      if (notes !== undefined) {
        updateNotes({ sessionId, notes }).catch((error) => {
          console.error('Failed to save notes:', error);
        });
      }
    }, 1000); // Save 1 second after user stops typing

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [notes, sessionId, updateNotes]);

  return { notes, setNotes };
}
