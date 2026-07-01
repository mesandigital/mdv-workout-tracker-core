import { getExerciseGapInfo } from './getExerciseGapInfo';

import { SetRow } from '../session.types';
import { detectPlateauForExercise } from './plateauDetection';
import { selectRawOne, selectRaw } from '../../db';

// Utility: get stats for an exercise from the previous session (PR, last session completion, etc)
export async function getExerciseSessionStats(
  exerciseId: number,
  currentSessionId: number,
  exerciseName: string,
) {
  // Find last session (excluding current)
  const lastSessionRow = await selectRawOne<{
    id: number;
    finished_at: string;
    workout_name: string | null;
  }>(
    `
        SELECT ws.id, ws.finished_at, w.name as workout_name
        FROM workout_sessions ws
        JOIN exercise_logs el ON el.workout_session_id = ws.id
        JOIN workouts w ON w.id = ws.workout_id
        WHERE el.exercise_id = ?
          AND ws.finished_at IS NOT NULL
          AND ws.id != ?
        ORDER BY ws.finished_at DESC
        LIMIT 1
        `,
    [exerciseId, currentSessionId],
  );
  if (!lastSessionRow)
    return {
      lastSessionDate: null,
      lastSessionId: null,
      lastSessionStats: null,
      isNewPR: false,
    };

  const lastSessionId = lastSessionRow.id;
  const lastSessionDate = lastSessionRow.finished_at;
  const lastSessionWorkoutName = lastSessionRow.workout_name;
  // Fetch all sets for this exercise in the last session
  const rawLastSets = await selectRaw<any>(
    `
        SELECT sl.*
        FROM set_logs sl
        JOIN exercise_logs el ON el.id = sl.exercise_log_id
        WHERE el.exercise_id = ? AND el.workout_session_id = ?
        ORDER BY sl.set_number
        `,
    [exerciseId, lastSessionId],
  );
  const lastSets = rawLastSets.map(set => {
    let dropSets = [];
    try {
      const parsed =
        typeof set.drop_sets === 'string'
          ? JSON.parse(set.drop_sets)
          : set.drop_sets;
      dropSets = Array.isArray(parsed) ? parsed : [];
    } catch {
      dropSets = [];
    }
    return {
      ...set,
      exerciseLogId: set.exercise_log_id,
      plannedReps: set.planned_reps,
      plannedDurationSeconds: set.planned_duration_seconds ?? null,
      durationSeconds: set.duration_seconds ?? null,
      roundNumber: set.round_number ?? null,
      dropSets,
    } as SetRow;
  });

  // Did user complete all sets? (all sets.completed true)
  const allSetsCompleted =
    lastSets.length > 0 && lastSets.every(s => s.completed);

  // Calculate total reps completed and if all reps were completed (all sets have reps >= planned_reps)
  const totalRepsCompleted = lastSets.reduce(
    (sum, s) => sum + (s.reps ?? 0),
    0,
  );
  const allRepsCompleted =
    lastSets.length > 0 &&
    lastSets.every(
      s =>
        typeof s.reps === 'number' &&
        typeof s.planned_reps === 'number' &&
        s.reps >= s.planned_reps,
    );

  // Find best set (weight * reps) for previous session
  const lastBestSet =
    lastSets.length > 0
      ? lastSets.reduce(
          (best, s) =>
            (s.weight ?? 0) * (s.reps ?? 0) >
            (best.weight ?? 0) * (best.reps ?? 0)
              ? s
              : best,
          lastSets[0],
        )
      : null;

  // Find best rep (highest reps in a set) for previous session
  const lastBestRep =
    lastSets.length > 0
      ? lastSets.reduce(
          (best, s) => ((s.reps ?? 0) > (best.reps ?? 0) ? s : best),
          lastSets[0],
        )
      : null;

  // Calculate total volume for previous session
  const lastTotalVolume = lastSets.reduce(
    (sum, s) => sum + (s.weight ?? 0) * (s.reps ?? 0),
    0,
  );

  // Find best set for current session
  const currentSets = await selectRaw<SetRow>(
    `
        SELECT sl.*
        FROM set_logs sl
        JOIN exercise_logs el ON el.id = sl.exercise_log_id
        WHERE el.exercise_id = ? AND el.workout_session_id = ?
        `,
    [exerciseId, currentSessionId],
  );
  const currentBestSet =
    currentSets.length > 0
      ? currentSets.reduce(
          (best, s) =>
            (s.weight ?? 0) * (s.reps ?? 0) >
            (best.weight ?? 0) * (best.reps ?? 0)
              ? s
              : best,
          currentSets[0],
        )
      : null;
  const newBestSet =
    currentBestSet && lastBestSet
      ? (currentBestSet.weight ?? 0) * (currentBestSet.reps ?? 0) >
        (lastBestSet.weight ?? 0) * (lastBestSet.reps ?? 0)
      : false;
  const totalVolume = currentSets.reduce(
    (sum, s) => sum + (s.weight ?? 0) * (s.reps ?? 0),
    0,
  );

  // OTHHERS
  // Gap info
  const gapInfo = lastSessionDate
    ? getExerciseGapInfo({
        lastSessionDate,
        today: new Date(),
        exerciseName,
      })
    : null;

  // Exercise Plateau detection (if >3 sessions, and no improvement in best set or total volume)
  // This is a simple heuristic and can be improved with more sophisticated logic
  const sessions = await selectRaw<{
    date: string;
    sessionId: string;
    weight: number;
    reps: number;
  }>(
    `
        SELECT ws.finished_at as date, sl.weight, sl.reps, ws.id as sessionId
        FROM workout_sessions ws
        JOIN exercise_logs el ON el.workout_session_id = ws.id
        JOIN set_logs sl ON sl.exercise_log_id = el.id
        WHERE el.exercise_id = ?
        ORDER BY ws.finished_at DESC
        LIMIT 50
        `,
    [exerciseId],
  );

  // create a js object grouping by sessionId, with an array of sets for each session
  const sessionsById: Record<
    string,
    { weight: number; reps: number; sessionId: string; date: string }[]
  > = {};
  sessions.forEach(s => {
    if (!sessionsById[s.sessionId]) {
      sessionsById[s.sessionId] = [];
    }
    sessionsById[s.sessionId].push({
      weight: s.weight,
      reps: s.reps,
      sessionId: s.sessionId,
      date: s.date,
    });
  });
  // convert to array of { date, sets }
  const recent = Object.entries(sessionsById).map(([_sessionId, sets]) => ({
    date: sets[0].date,
    sets,
  }));
  // only keep last 10 sessions
  recent.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
  const recentSessions = recent.slice(0, 10);

  // console.log(`Detecting plateau for exercise ${exerciseName} (ID: ${exerciseId}) with recent sessions:`, recentSessions);
  // Simple plateau detection: if in last 5 sessions there is no improvement in best set or total volume, and at least 3 sessions
  // if (recentSessions.length >= 5) {
  //     const bestSets = recentSessions.map(s => s.sets.reduce((best, set) => ((set.weight ?? 0) * (set.reps ?? 0)) > ((best.weight ?? 0) * (best.reps ?? 0)) ? set : best, s.sets[0]));
  //     const totalVolumes = recentSessions.map(s => s.sets.reduce((sum, set) => sum + (set.weight ?? 0) * (set.reps ?? 0), 0));
  //     const noImprovementInBestSet = bestSets.every(bs => ((bs.weight ?? 0) * (bs.reps ?? 0)) <= ((lastBestSet?.weight ?? 0) * (lastBestSet?.reps ?? 0)));
  //     const noImprovementInVolume = totalVolumes.every(tv => tv <= lastTotalVolume);
  //     if (noImprovementInBestSet && noImprovementInVolume) {
  //         console.log(`Possible plateau detected for exercise ${exerciseName} (ID: ${exerciseId}): no improvement in best set or total volume in last 5 sessions`);
  //     }
  // }

  detectPlateauForExercise(exerciseId, exerciseName, recentSessions);

  if (gapInfo) {
    (
      gapInfo as any
    ).transledMessage = `It has been ${gapInfo.days} days since you trained ${exerciseName}.`;
    // i18n.t('insights.gap.full_message', { exerciseName, days: gapInfo.days });
  }

  return {
    lastSessionStats: {
      lastSessionDate,
      lastSessionId,
      lastSessionWorkoutName,
      allSetsCompleted,
      allRepsCompleted,
      totalRepsCompleted,
      lastSets,
      lastBestSet,
      lastBestRep,
      lastTotalVolume,
    },
    currentSessionStats: {
      currentBestSet,
      newBestSet,
      totalVolume,
    },
    gapInfo,
  };
}
