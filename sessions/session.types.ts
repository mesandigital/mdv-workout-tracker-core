import type { HydratedExercise } from '../../WorkoutTracker/types/tracker.types';

export interface WorkoutSession {
  id: number;
  workout_id: number;
  started_at: string;
  finished_at?: string | null;
  notes?: string | null;
  duration?: number | null;
}

export interface WorkoutSessionData {
  workoutName: string;
  exercises: HydratedExercise[];
  workoutDescription?: string;
  workoutType?: string;
}

export interface SetRow {
  id: number;
  exercise_log_id: number;
  planned_reps: number;
  reps: number | null;
  completed: number;
  weight: number | null;
  dropSets?: HydratedExercise['sets'][number]['dropSets'];
  plannedDurationSeconds?: number | null;
  durationSeconds?: number | null;
}

export interface Set {
  exerciseLogId: number;
  setNumber: number;
  plannedReps: number;
  weight?: number | null;
  completed: number;
  dropSets?: HydratedExercise['sets'][number]['dropSets'];
  plannedDurationSeconds?: number | null;
  roundNumber?: number | null;
}
