export type WorkoutGroupType = 'superset' | 'drop_set' | 'circuit';
export type WorkoutBlockType = 'straight_sets' | 'circuit' | 'superset' | 'giant_set' | 'interval';
export type PersonalRecordType = 'weight' | 'reps' | 'volume';
export type TrainingStyle = 'gym' | 'calisthenics';
export type TrainingDifficulty = 'beginner' | 'intermediate' | 'advanced';

export type PersonalRecord = {
  id: number;
  exercise_id: number;
  exercise_name?: string;
  workout_session_id: number;
  set_log_id: number;
  record_type: PersonalRecordType;
  value: number;
  previous_value?: number | null;
  weight?: number | null;
  reps?: number | null;
  achieved_at: string;
  calculation_version: number;
};

export type PersonalRecordHistoryFilters = {
  exerciseId?: number;
  recordType?: PersonalRecordType;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
};

export type PersonalRecordHistoryPage = {
  records: PersonalRecord[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
};

export type PersonalRecordExerciseOption = {
  exercise_id: number;
  exercise_name: string;
  record_count: number;
};

export type ExerciseInput = {
  name: string;
  category?: string | null;
  description?: string | null;
  body_part?: string | null;
  primary_muscle?: string | null;
  secondary_muscles?: string | null;
  equipment?: string | null;
  exercise_type?: string | null;
  difficulty?: TrainingDifficulty | null;
  training_style?: TrainingStyle | null;
  progression_group?: string | null;
  progression_level?: number | null;
  image_url?: string | null;
  image_key?: string | null;
};

export type Exercise = ExerciseInput & {
  id: number;
  created_at?: string;
  updated_at?: string;
};

export type WorkoutTemplateExerciseSetInput = {
  set_number?: number;
  planned_reps: number;
  planned_weight?: number | null;
  duration_seconds?: number | null;
  drop_sets?: WorkoutDropSetInput[];
};

export type WorkoutDropSetInput = {
  plannedReps?: number | null;
  plannedWeight?: number | null;
  reps?: number | null;
  weight?: number | null;
  completed?: number;
};

export type WorkoutTemplateExerciseInput = {
  exercise_id: number;
  block_id?: number | null;
  block_type?: WorkoutBlockType | null;
  block_name?: string | null;
  block_rounds?: number | null;
  block_rest_between_rounds?: number | null;
  block_order?: number | null;
  order_index?: number;
  default_sets?: number;
  default_reps?: number;
  weight?: number | null;
  rest_seconds?: number | null;
  section?: string | null;
  superset_id?: number | null;
  group_id?: number | null;
  group_type?: WorkoutGroupType | null;
  sets?: WorkoutTemplateExerciseSetInput[];
};

export type WorkoutTemplateInput = {
  name: string;
  type?: string | null;
  section?: string | null;
  description?: string | null;
  difficulty?: TrainingDifficulty | null;
  training_style?: TrainingStyle | null;
  exercises: WorkoutTemplateExerciseInput[];
};

export type WorkoutTemplateBlock = {
  id: number;
  workout_id: number;
  type: WorkoutBlockType;
  name?: string | null;
  rounds?: number | null;
  rest_between_rounds?: number | null;
  order_index?: number | null;
};

export type WorkoutTrackerSeedExerciseInput = Omit<ExerciseInput, 'secondary_muscles'> & {
  id?: number;
  seeded_id?: string | null;
  seeded?: boolean | number;
  seeded_version?: number;
  secondary_muscles?: string[] | string | null;
  movement?: string | null;
  exercise_category?: string | null;
  instructions?: string[] | string | null;
  source?: string | null;
};

export type WorkoutTrackerSeedWorkoutExerciseInput = {
  exercise_id?: number;
  exercise_seeded_id?: string;
  seeded_id?: string;
  section?: string | null;
  block_id?: number | null;
  block_type?: WorkoutBlockType | null;
  block_name?: string | null;
  block_rounds?: number | null;
  block_rest_between_rounds?: number | null;
  block_order?: number | null;
  default_sets?: number;
  default_reps?: number;
  plannedSets?: number;
  plannedReps?: number;
  plannedWeight?: number | null;
  weight?: number | null;
  rest_seconds?: number | null;
  group_id?: number | null;
  group_type?: WorkoutGroupType | null;
  superset_id?: number | null;
  sets?: Array<WorkoutTemplateExerciseSetInput & {
    plannedReps?: number;
    plannedWeight?: number | null;
  }>;
};

export type WorkoutTrackerSeedWorkoutInput = {
  id?: number;
  seeded_id?: string | null;
  seeded?: boolean | number;
  seeded_version?: number;
  name: string;
  type?: string | null;
  section?: string | null;
  description?: string | null;
  difficulty?: TrainingDifficulty | null;
  training_style?: TrainingStyle | null;
  created_at?: string;
  updated_at?: string;
  exercises?: WorkoutTrackerSeedWorkoutExerciseInput[];
};

export type WorkoutTrackerSeedInput = {
  exercises?: WorkoutTrackerSeedExerciseInput[];
  workouts?: WorkoutTrackerSeedWorkoutInput[];
  reseedUpdated?: boolean;
};

export type WorkoutTemplate = {
  id: number;
  name: string;
  type?: string | null;
  section?: string | null;
  description?: string | null;
  difficulty?: TrainingDifficulty | null;
  training_style?: TrainingStyle | null;
  blocks?: WorkoutTemplateBlock[];
  exercises: Array<WorkoutTemplateExerciseInput & {
    id: number;
    exercise_name?: string;
    sets: WorkoutTemplateExerciseSetInput[];
  }>;
};

export type WorkoutSession = {
  id: number;
  workout_id: number;
  started_at: string;
  finished_at?: string | null;
  notes?: string | null;
  duration?: number | null;
};

export type SetLogInput = {
  exercise_log_id: number;
  set_number: number;
  planned_reps?: number;
  reps?: number | null;
  weight?: number | null;
  completed?: number;
  drop_sets?: WorkoutDropSetInput[];
  round_number?: number | null;
  planned_duration_seconds?: number | null;
  duration_seconds?: number | null;
};

export type HydratedSessionExercise = {
  exerciseLogId: number;
  exerciseId: number;
  name: string;
  plannedSets?: number | null;
  plannedReps?: number | null;
  weight?: number | null;
  restSeconds?: number | null;
  blockId?: number | null;
  blockType?: WorkoutBlockType | null;
  blockName?: string | null;
  blockRounds?: number | null;
  blockRestBetweenRounds?: number | null;
  blockOrder?: number | null;
  orderIndex?: number | null;
  supersetId?: number | null;
  groupId?: number | null;
  groupType?: WorkoutGroupType | null;
  sets: Array<{
    id: number;
    exercise_log_id: number;
    set_number: number;
    plannedReps: number;
    reps: number | null;
    weight: number | null;
    completed: number;
    dropSets?: WorkoutDropSetInput[];
    roundNumber?: number | null;
    plannedDurationSeconds?: number | null;
    durationSeconds?: number | null;
    previousBestWeight?: number | null;
    previousBestRepsAtWeight?: number | null;
    previousBestVolume?: number | null;
  }>;
};

export type HydratedWorkoutSession = {
  session: WorkoutSession;
  workoutName: string;
  workoutDescription?: string | null;
  exercises: HydratedSessionExercise[];
};
