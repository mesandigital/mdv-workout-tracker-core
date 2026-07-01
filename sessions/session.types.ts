import type { HydratedExercise, Set, SetRow, WorkoutSession } from '../types';

export type { Set, SetRow, WorkoutSession };

export interface WorkoutSessionData {
  workoutName: string;
  exercises: HydratedExercise[];
  workoutDescription?: string;
  workoutType?: string;
}
