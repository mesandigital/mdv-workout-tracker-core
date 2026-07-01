import { selectRaw, selectRawOne } from '../../db';
import { getExercise } from '../../repositories/exercises';

type WeightProgressionData = {
  exerciseId: number;
  exerciseName: string;
  imageKey?: string | null;
  description?: string | null;
  primaryMuscle?: string | null;
  secondaryMuscles?: string | string[] | null;
  equipment?: string | null;
  bodyPart?: string | null;
  instructions?: string | null;
  dataPoints: Array<{
    date: string;
    weight: number;
    reps?: number;
    setNumber?: number;
    plannedReps?: number;
  }>;
  startingWeight?: number | null;
  currentWeight?: number | null;
  weightChange?: number | null;
  sessions?: any[];
  sessionsCount?: number;
  setsCount?: number;
  repsCount?: number;
  tonnage?: number;
};

/**
 * Fetches the last set reps for multiple set numbers in a single exercise
 * @param exerciseId - The ID of the exercise
 * @param setNumbers - Array of set numbers to fetch last reps for
 * @returns Object mapping setNumber to last reps (or null if not found)
 */
export async function fetchAllLastSetRepsForExercise(
  exerciseId: number,
  setNumbers: number[],
): Promise<Record<number, number | null>> {
  if (!exerciseId || !setNumbers.length) return {};
  // Query all relevant set_logs for this exercise and set numbers
  const placeholders = setNumbers.map(() => '?').join(',');
  const setLogs = await selectRaw<any>(
    `
      SELECT sl.set_number, sl.reps, sl.id
      FROM set_logs sl
      JOIN exercise_logs el ON el.id = sl.exercise_log_id
      JOIN workout_sessions ws ON ws.id = el.workout_session_id
      WHERE el.exercise_id = ?
        AND sl.set_number IN (${placeholders})
        AND ws.finished_at IS NOT NULL
        AND sl.reps IS NOT NULL
        AND sl.reps > 0
      ORDER BY sl.set_number, sl.id DESC
    `,
    [exerciseId, ...setNumbers],
  );
  // For each set number, find the first (latest) log
  const result: Record<number, number | null> = {};
  for (const setNumber of setNumbers) {
    const found = setLogs.find((row: any) => row.set_number === setNumber);
    result[setNumber] = found && found.reps !== null ? found.reps : null;
  }
  return result;
}

/**
 * Fetches the last set weights for multiple set numbers in a single exercise
 * @param exerciseId - The ID of the exercise
 * @param setNumbers - Array of set numbers to fetch last weights for
 * @returns Object mapping setNumber to last weight (or null if not found)
 */
export async function fetchAllLastSetWeightsForExercise(
  exerciseId: number,
  setNumbers: number[],
): Promise<Record<number, number | null>> {
  if (!exerciseId || !setNumbers.length) return {};
  // Query all relevant set_logs for this exercise and set numbers
  const placeholders = setNumbers.map(() => '?').join(',');
  const setLogs = await selectRaw<any>(
    `
      SELECT sl.set_number, sl.weight, sl.id
      FROM set_logs sl
      JOIN exercise_logs el ON el.id = sl.exercise_log_id
      JOIN workout_sessions ws ON ws.id = el.workout_session_id
      WHERE el.exercise_id = ?
        AND sl.set_number IN (${placeholders})
        AND ws.finished_at IS NOT NULL
        AND sl.weight IS NOT NULL
        AND sl.reps IS NOT NULL
        AND sl.reps > 0
      ORDER BY sl.set_number, sl.id DESC
    `,
    [exerciseId, ...setNumbers],
  );
  // For each set number, find the first (latest) log
  const result: Record<number, number | null> = {};
  for (const setNumber of setNumbers) {
    const found = setLogs.find((row: any) => row.set_number === setNumber);
    result[setNumber] = found && found.weight !== null ? found.weight : null;
  }
  return result;
}

/**
 * Fetches the last set planned for multiple set numbers in a single exercise
 * @param exerciseId - The ID of the exercise
 * @param setNumbers - Array of set numbers to fetch last planned sets for
 * @returns Object mapping setNumber to last planned sets (or null if not found)
 */
export async function fetchAllLastPlannedRepsForExercise(
  exerciseId: number,
  setNumbers: number[],
): Promise<Record<number, number | null>> {
  if (!exerciseId || !setNumbers.length) return {};
  // Query all relevant set_logs for this exercise and set numbers
  const placeholders = setNumbers.map(() => '?').join(',');
  const setLogs = await selectRaw<any>(
    `
      SELECT sl.set_number, sl.reps, sl.planned_reps, sl.id
      FROM set_logs sl
      JOIN exercise_logs el ON el.id = sl.exercise_log_id
      JOIN workout_sessions ws ON ws.id = el.workout_session_id
      WHERE el.exercise_id = ?
        AND sl.set_number IN (${placeholders})
        AND ws.finished_at IS NOT NULL
        AND sl.planned_reps IS NOT NULL
        AND sl.reps IS NOT NULL
        AND sl.reps > 0
      ORDER BY sl.set_number, sl.id DESC
    `,
    [exerciseId, ...setNumbers],
  );
  // For each set number, find the first (latest) log
  const result: Record<number, number | null> = {};
  for (const setNumber of setNumbers) {
    const found = setLogs.find((row: any) => row.set_number === setNumber);
    result[setNumber] =
      found && found.planned_reps !== null ? found.planned_reps : null;
  }
  return result;
}
/**
 * Fetches the weight for a specific set number in the last finished session for an exercise
 */
export async function fetchLastSetWeightForExercise(
  exerciseId: number,
  setNumber: number,
): Promise<number | null> {
  try {
    // Find the last set_log for this exercise and set number with completed reps
    const setLog = await selectRawOne<{ weight: number }>(
      `
      SELECT weight
      FROM set_logs
      WHERE exercise_log_id IN (
        SELECT id FROM exercise_logs WHERE exercise_id = ?
          AND reps IS NOT NULL
      )
      AND set_number = ?
      AND weight IS NOT NULL
      AND reps IS NOT NULL
      ORDER BY id DESC
      LIMIT 1
      `,
      [exerciseId, setNumber],
    );
    return setLog && setLog.weight !== null ? setLog.weight : null;
  } catch (error) {
    console.error('❌ Error fetching last set weight:', error);
    return null;
  }
}

// EXERCISE PROGRESSION QUERIES
// Function to get all the sessions an exercise was performed in, with details (for progression screen) - can be used in the future
export async function fetchExerciseProgression(exerciseId: number) {
  try {
    // Fetch all sessions for the exercise
    const sessions = await selectRaw<{
      session_id: number;
      workout_name: string;
      started_at: string;
      finished_at: string | null;
      planned_sets: number;
      planned_reps: number;
      best_weight: number | null;
      best_reps: number | null;
      total_sets: number;
      total_reps: number;
      tonnage: number;
    }>(
      `
      SELECT 
        ws.id as session_id,
        w.name as workout_name,
        ws.started_at,
        ws.finished_at,
        el.planned_sets,
        el.planned_reps,
        MAX(CASE WHEN sl.completed = 1 THEN sl.weight END) as best_weight,
        MAX(CASE WHEN sl.completed = 1 THEN sl.reps END) as best_reps,
        COUNT(CASE WHEN sl.completed = 1 THEN sl.id END) as total_sets,
        SUM(CASE WHEN sl.completed = 1 THEN sl.reps ELSE 0 END) as total_reps,
        SUM(CASE WHEN sl.completed = 1 THEN sl.weight * sl.reps ELSE 0 END) as tonnage
      FROM exercise_logs el
      JOIN workout_sessions ws ON ws.id = el.workout_session_id
      JOIN workouts w ON w.id = ws.workout_id
      JOIN exercises e ON e.id = el.exercise_id
      LEFT JOIN set_logs sl ON sl.exercise_log_id = el.id
      WHERE el.exercise_id = ?
      GROUP BY ws.id
      ORDER BY ws.started_at DESC
      `,
      [exerciseId],
    );

    // Aggregate stats across all sessions
    let sessionsCount = 0;
    let setsCount = 0;
    let repsCount = 0;
    let tonnage = 0;
    if (sessions && sessions.length > 0) {
      sessionsCount = sessions.length;
      setsCount = sessions.reduce((sum, s) => sum + (s.total_sets || 0), 0);
      repsCount = sessions.reduce((sum, s) => sum + (s.total_reps || 0), 0);
      tonnage = sessions.reduce((sum, s) => sum + (s.tonnage || 0), 0);
    }

    const result = {
      sessions,
      sessionsCount,
      setsCount,
      repsCount,
      tonnage,
    };

    return result;
  } catch (error) {
    console.error('❌ Error fetching exercise progression:', error);
    throw error;
  }
}

/**
 * Fetches weight progression for ALL exercises across all workouts
 * Shows comprehensive progression data for every exercise that has been logged
 */
export async function fetchAllExercisesWeightProgression(): Promise<
  WeightProgressionData[]
> {
  try {
    // Get all exercises that have been logged with weight data
    const exercises = await selectRaw<{ exercise_id: number }>(
      `
      SELECT DISTINCT el.exercise_id
      FROM exercise_logs el
      JOIN workout_sessions ws ON ws.id = el.workout_session_id
      WHERE ws.finished_at IS NOT NULL
        AND el.weight IS NOT NULL
      ORDER BY el.exercise_id
      `,
    );

    const progressionData: WeightProgressionData[] = [];

    for (const exercise of exercises) {
      const data = await fetchExerciseWeightProgression(exercise.exercise_id);
      if (data && data.dataPoints.length > 0) {
        progressionData.push(data);
      }
    }
    return progressionData;
  } catch (error) {
    console.error('❌ Error fetching all exercises weight progression:', error);
    throw error;
  }
}

/**
 * Fetches weight progression data for a specific exercise across all workout sessions
 * @param exerciseId - The ID of the exercise to track
 * @returns Weight progression data with dates and weights
 */
export async function fetchExerciseWeightProgression(
  exerciseId: number,
): Promise<WeightProgressionData | null> {
  try {
    // Get exercise details
    const exerciseInfo = await getExercise(exerciseId);
    if (!exerciseInfo) {
      return null;
    }

    // Get weight progression data from completed sessions
    const progressionData = await selectRaw<{
      session_id: number;
      started_at: string;
      weight: number;
      set_number: number;
      reps: number;
      planned_reps: number;
    }>(
      `
      SELECT 
        ws.id as session_id,
        ws.started_at,
        sl.weight,
        sl.set_number,
        sl.reps,
        sl.planned_reps
      FROM set_logs sl
      JOIN exercise_logs el ON el.id = sl.exercise_log_id
      JOIN workout_sessions ws ON ws.id = el.workout_session_id
      WHERE el.exercise_id = ?
        AND ws.finished_at IS NOT NULL
        AND sl.weight IS NOT NULL
        AND sl.reps IS NOT NULL
        AND sl.reps > 0
      ORDER BY ws.started_at ASC
      `,
      [exerciseId],
    );

    const { sessions, sessionsCount, setsCount, repsCount, tonnage } =
      await fetchExerciseProgression(exerciseId);

    // Prepare dataPoints array
    const dataPoints = progressionData.map(row => ({
      date: row.started_at,
      weight: row.weight,
      sessionId: row.session_id,
      setNumber: row.set_number,
      reps: row.reps,
      plannedReps: row.planned_reps,
    }));

    // Calculate starting, current, and change
    let startingWeight = null;
    let currentWeight = null;
    let weightChange = null;
    if (dataPoints.length > 0) {
      startingWeight = dataPoints[0].weight;
      currentWeight = dataPoints[dataPoints.length - 1].weight;
      weightChange = currentWeight - startingWeight;
    }

    const exerciseFields = exerciseInfo as typeof exerciseInfo & {
      imageKey?: string | null;
      image_key?: string | null;
      primaryMuscle?: string | null;
      primary_muscle?: string | null;
      secondaryMuscles?: string | string[] | null;
      secondary_muscles?: string | string[] | null;
      bodyPart?: string | null;
      body_part?: string | null;
      instructions?: string | null;
    };
    const rawSecondaryMuscles =
      exerciseFields.secondaryMuscles ?? exerciseFields.secondary_muscles;

    let secondaryMuscles: string[] = [];
    if (Array.isArray(rawSecondaryMuscles)) {
      secondaryMuscles = rawSecondaryMuscles;
    } else if (rawSecondaryMuscles) {
      try {
        // Try to parse as JSON array
        const parsed = JSON.parse(rawSecondaryMuscles);
        if (Array.isArray(parsed)) {
          secondaryMuscles = parsed.map(m =>
            typeof m === 'string' ? m.replace(/^"|"$/g, '') : m,
          );
        } else {
          // fallback: treat as comma-separated string
          secondaryMuscles = rawSecondaryMuscles.split(',').map(m => m.trim());
        }
      } catch {
        // fallback: treat as comma-separated string
        secondaryMuscles = rawSecondaryMuscles.split(',').map(m => m.trim());
      }
    }
    return {
      exerciseId,
      exerciseName: exerciseInfo.name,
      imageKey: exerciseFields.imageKey ?? exerciseFields.image_key,
      description: exerciseInfo.description,
      primaryMuscle:
        exerciseFields.primaryMuscle ?? exerciseFields.primary_muscle,
      secondaryMuscles: secondaryMuscles,
      equipment: exerciseInfo.equipment,
      bodyPart: exerciseFields.bodyPart ?? exerciseFields.body_part,
      instructions: exerciseFields.instructions,
      dataPoints,
      startingWeight,
      currentWeight,
      weightChange,
      sessions,
      sessionsCount,
      setsCount,
      repsCount,
      tonnage,
      ...exerciseInfo,
    };
  } catch (error) {
    console.error('❌ Error fetching exercise weight progression:', error);
    throw error;
  }
}

/**
 * Fetches the latest weight for each exercise to show current progress
 */
export async function fetchAllExercisesLatestWeight(): Promise<
  {
    exerciseId: number;
    exerciseName: string;
    latestWeight: number;
    previousWeight: number | null;
    lastWorkoutDate: string;
  }[]
> {
  try {
    const data = await selectRaw<{
      exercise_id: number;
      exercise_name: string;
      latest_weight: number;
      last_workout_date: string;
    }>(
      `
      SELECT 
        e.id as exercise_id,
        e.name as exercise_name,
        el.weight as latest_weight,
        ws.started_at as last_workout_date
      FROM exercises e
      JOIN exercise_logs el ON el.exercise_id = e.id
      JOIN workout_sessions ws ON ws.id = el.workout_session_id
      WHERE ws.finished_at IS NOT NULL
        AND el.weight IS NOT NULL
        AND ws.started_at = (
          SELECT MAX(ws2.started_at)
          FROM workout_sessions ws2
          JOIN exercise_logs el2 ON el2.workout_session_id = ws2.id
          WHERE el2.exercise_id = e.id
            AND ws2.finished_at IS NOT NULL
        )
      ORDER BY ws.started_at DESC
      `,
    );

    // Get previous weight for comparison
    const results = await Promise.all(
      data.map(async row => {
        const previousWeightData = await selectRaw<{ weight: number }>(
          `
          SELECT el.weight
          FROM exercise_logs el
          JOIN workout_sessions ws ON ws.id = el.workout_session_id
          WHERE el.exercise_id = ?
            AND ws.finished_at IS NOT NULL
            AND el.weight IS NOT NULL
            AND ws.started_at < ?
          ORDER BY ws.started_at DESC
          LIMIT 1
          `,
          [row.exercise_id, row.last_workout_date],
        );

        return {
          exerciseId: row.exercise_id,
          exerciseName: row.exercise_name,
          latestWeight: row.latest_weight,
          previousWeight: previousWeightData[0]?.weight || null,
          lastWorkoutDate: row.last_workout_date,
        };
      }),
    );

    return results;
  } catch (error) {
    console.error('❌ Error fetching latest weights:', error);
    throw error;
  }
}

// WORKOUT PROGRESSION QUERIES
/**
 * Fetches weight progression for all exercises in a workout
 * @param workoutId - The ID of the workout
 * @returns Array of weight progression data for each exercise
 */
export async function fetchWorkoutWeightProgression(
  workoutId: number,
): Promise<WeightProgressionData[]> {
  try {
    // Get all exercises in this workout
    const exercises = await selectRaw<{ exercise_id: number }>(
      `
      SELECT DISTINCT exercise_id
      FROM workout_exercises
      WHERE workout_id = ?
      ORDER BY order_index
      `,
      [workoutId],
    );

    const progressionData: WeightProgressionData[] = [];

    for (const exercise of exercises) {
      const data = await fetchExerciseWeightProgression(exercise.exercise_id);
      if (data && data.dataPoints.length > 0) {
        progressionData.push(data);
      }
    }

    return progressionData;
  } catch (error) {
    console.error('❌ Error fetching workout weight progression:', error);
    throw error;
  }
}

// Function to get the tonnage for each session completed for a workout, to show progression in total tonnage lifted over time
export async function fetchWorkoutTonnageProgression(
  workoutId: number,
): Promise<
  {
    sessionId: number;
    date: string;
    tonnage: number;
  }[]
> {
  try {
    const data = await selectRaw<{
      session_id: number;
      started_at: string;
      tonnage: number;
    }>(
      `
      SELECT 
        ws.id as session_id,
        ws.started_at,
        SUM(sl.weight * sl.reps) as tonnage
      FROM workout_sessions ws
      JOIN exercise_logs el ON el.workout_session_id = ws.id
      JOIN set_logs sl ON sl.exercise_log_id = el.id
      WHERE ws.workout_id = ?
        AND ws.finished_at IS NOT NULL
        AND sl.weight IS NOT NULL
        AND sl.reps IS NOT NULL
        AND sl.reps > 0
      GROUP BY ws.id
      ORDER BY ws.started_at ASC
      `,
      [workoutId],
    );

    return data.map(row => ({
      sessionId: row.session_id,
      date: row.started_at,
      tonnage: row.tonnage,
    }));
  } catch (error) {
    console.error('❌ Error fetching workout tonnage progression:', error);
    throw error;
  }
}
/**
 * Shared helper to fetch workout stats for a user (times performed, last date, avg duration, total tonnage)
 */

/**
 * Returns how many times a workout was performed and the last time it was performed for a user.
 * Returns 0 and null if no completed sessions exist.
 */
export async function getWorkoutTimesPerformedAndLastDate(
  workoutId: number,
): Promise<{
  timesPerformed: number;
  lastDate: string | null;
}> {
  const result = await selectRaw(
    `SELECT 
      COUNT(ws.id) as timesPerformed,
      MAX(ws.finished_at) as lastDate
    FROM workout_sessions ws
    WHERE ws.workout_id = ? AND ws.finished_at IS NOT NULL AND ws.started_at IS NOT NULL`,
    [workoutId],
  );
  const stat = result[0] || {};
  const statAny = stat as any;
  return {
    timesPerformed: statAny['timesPerformed'],
    lastDate: statAny['lastDate'],
  };
}

/**
 * Returns the average duration (in minutes) for completed sessions of a workout for a user.
 * Returns 0 if no completed sessions exist.
 */
export async function getWorkoutAverageDuration(
  workoutId: number,
): Promise<number> {
  const result = await selectRaw(
    `SELECT 
      AVG((julianday(ws.finished_at) - julianday(ws.started_at)) * 24 * 60) as avgDuration
    FROM workout_sessions ws
    WHERE ws.workout_id = ? AND ws.finished_at IS NOT NULL AND ws.started_at IS NOT NULL`,
    [workoutId],
  );
  const stat = result[0] || {};
  const statAny = stat as any;
  return (
    statAny['avgDuration'] ??
    statAny['avg_duration'] ??
    statAny['avgduration'] ??
    0
  );
}

// Deprecated: Use getWorkoutTimesPerformedAndLastDate and getWorkoutAverageDuration instead
/**
 * @deprecated Use getWorkoutTimesPerformedAndLastDate and getWorkoutAverageDuration instead
 */
export async function getWorkoutStatsForUser(
  workoutId: number,
  userId: number,
): Promise<{
  timesPerformed: number;
  lastDate: string | null;
  avgDuration: number;
  totalTonnage: number;
}> {
  const [timesAndLast, avgDuration] = await Promise.all([
    getWorkoutTimesPerformedAndLastDate(workoutId),
    getWorkoutAverageDuration(workoutId),
  ]);
  // totalTonnage logic preserved from before
  const tonnageResult = await selectRaw(
    `SELECT SUM(sl.weight * sl.reps) as totalTonnage
      FROM workout_sessions ws2
      JOIN exercise_logs el ON el.workout_session_id = ws2.id
      JOIN set_logs sl ON sl.exercise_log_id = el.id
      WHERE ws2.workout_id = ? AND ws2.user_id = ? AND ws2.finished_at IS NOT NULL AND sl.reps IS NOT NULL AND sl.weight IS NOT NULL`,
    [workoutId, userId],
  );
  const tonnageAny = (tonnageResult[0] || {}) as any;
  return {
    timesPerformed: timesAndLast.timesPerformed,
    lastDate: timesAndLast.lastDate,
    avgDuration: avgDuration,
    totalTonnage:
      tonnageAny['totalTonnage'] ??
      tonnageAny['total_tonnage'] ??
      tonnageAny['totaltonnage'] ??
      0,
  };
}

// Returns the total tonnage for all completed sessions of a workout
export async function fetchWorkoutTotalTonnage(
  workoutId: number,
): Promise<number> {
  try {
    const result = await selectRaw<{ total_tonnage: number }>(
      `
      SELECT 
        SUM(sl.weight * sl.reps) as total_tonnage
      FROM workout_sessions ws
      JOIN exercise_logs el ON el.workout_session_id = ws.id
      JOIN set_logs sl ON sl.exercise_log_id = el.id
      WHERE el.exercise_id IN (
        SELECT exercise_id FROM workout_exercises WHERE workout_id = ?
      )
        AND ws.finished_at IS NOT NULL
        AND sl.weight IS NOT NULL
        AND sl.reps IS NOT NULL
        AND sl.reps > 0
      `,
      [workoutId],
    );
    return result[0]?.total_tonnage || 0;
  } catch (error) {
    console.error('❌ Error fetching workout total tonnage:', error);
    throw error;
  }
}
