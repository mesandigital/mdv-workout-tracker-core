import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type ExerciseQueueSource =
  | 'exercise_details'
  | 'exercise_gap'
  | 'smart_slot'
  | 'recovery'
  | 'today_focus'
  | 'workout_generator'
  | 'session';

export type ExerciseQueueItem = {
  exerciseId: string;
  name: string;
  source: ExerciseQueueSource;
  bodyPart?: string | null;
  primaryMuscle?: string | null;
  reason?: string | null;
  addedAt: number;
  metadata?: Record<string, unknown>;
};

type ExerciseQueueState = {
  items: ExerciseQueueItem[];
  addExercise: (item: Omit<ExerciseQueueItem, 'addedAt'>) => void;
  removeExercise: (exerciseId: string) => void;
  clearExercises: () => void;
  replaceExercises: (items: Omit<ExerciseQueueItem, 'addedAt'>[]) => void;
  hasExercise: (exerciseId: string) => boolean;
};

export const useExerciseQueueStore = create<ExerciseQueueState>()(
  persist(
    (set, get) => ({
      items: [],
      addExercise: item =>
        set(state => {
          const nextId = String(item.exerciseId);
          const filtered = state.items.filter(entry => entry.exerciseId !== nextId);
          return {
            items: [
              {
                ...item,
                exerciseId: nextId,
                addedAt: Date.now(),
              },
              ...filtered,
            ],
          };
        }),
      removeExercise: exerciseId =>
        set(state => ({
          items: state.items.filter(item => item.exerciseId !== String(exerciseId)),
        })),
      clearExercises: () => set({ items: [] }),
      replaceExercises: items =>
        set({
          items: items.map((item, index) => ({
            ...item,
            exerciseId: String(item.exerciseId),
            addedAt: Date.now() + index,
          })),
        }),
      hasExercise: exerciseId =>
        get().items.some(item => item.exerciseId === String(exerciseId)),
    }),
    {
      name: 'mdv.exerciseQueue.v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: state => ({ items: state.items }),
    },
  ),
);
