/*
====================
Plateau Detection README
====================

Overview:
---------
This module provides utilities to detect performance plateaus in strength training exercises based on recent workout session data. It is used in widgets like SmartSlotWidget to surface actionable insights for users.

How Plateau Detection Works:
---------------------------
1. For each exercise, gather the last 4 sessions (most recent first), where each session contains an array of sets (with weight and reps).
2. Ignore exercises with fewer than 3 sessions.
3. Ignore if any session is more than 14 days apart from the previous (to avoid gaps).
4. For each session, compute a "performance score" as the maximum (weight × reps) across all sets, after filtering out the lowest 20% weights if there are more than 3 sets (to ignore warm-ups).
5. Take the last 3 scores, and check if the difference between the highest and lowest is within 10% of the max score (tolerance).
  - If so, a plateau is detected: the user is not making significant progress in this exercise.
6. The result includes a reason, e.g., "Same weight for all recent sessions" or "No significant change in weight or reps for last 3 sessions."

Why this approach?
------------------
- It is robust to small fluctuations but flags when the user is truly stuck.
- The 10% tolerance is a practical threshold for real-world training, but can be tuned.
- The reason field helps users understand what to change (e.g., increase weight, reps, or vary the routine).

Usage:
------
- Use getPlateauCandidate(allExercises, sessionsByExercise) to get the best plateau candidate for a user.
- Use detectPlateauForExercise(exerciseId, exerciseName, sessions) for a single exercise.

See the PlateauResult interface for the returned structure.
*/
// Plateau detection utilities for SmartSlotWidget
//
// Usage:
// - detectPlateauForExercise(exerciseSessions)
// - getPlateauCandidate(allExercises, sessions)

export interface PlateauResult {
  exerciseId: number;
  exerciseName: string;
  plateau: boolean;
  message: string;
  scores: number[];
  reason?: string;
  daysSinceLast?: number;
  lastTrained?: string;
  lastTrainedDate?: string;
  numberOfSessions?: number; // how many recent sessions are within the plateau threshold
  gapDetected?: boolean; // if true, plateau detection was skipped due to a gap in training
  score?: number;
}

/**
 * Compute performance score for a session: max(weight * reps) across all sets
 * Optionally filter out warm-up sets (lowest 20% weights)
 */
export function computePerformanceScore(sets: { weight: number; reps: number }[]): number {
  if (!sets || sets.length === 0) return 0;
  // Filter out warm-up sets: remove lowest 20% weights if more than 3 sets
  let filtered = sets;
  if (sets.length > 3) {
    const sorted = [...sets].sort((a, b) => a.weight - b.weight);
    const cutoff = Math.ceil(sets.length * 0.2);
    filtered = sorted.slice(cutoff);
  }
  return Math.max(...filtered.map(s => (s.weight || 0) * (s.reps || 0)));
}


/**
 * Detect plateau for a single exercise given its last N sessions
 * sessions: [{ date, sets: [{ weight, reps }] }], sorted newest first
 * Returns PlateauResult or null
 */
export function detectPlateauForExercise(
  exerciseId: number,
  exerciseName: string,
  sessions: Array<{ date: string | Date; sets: { weight: number; reps: number }[] }>
): PlateauResult | null {

  if (!sessions || sessions.length < 3) return null;

  let gapDetected = false;
 

  // Only consider last 4 sessions
  const recent = sessions.slice(0, 4);
  // Calculate days since last trained and last trained date
  let daysSinceLast: number | undefined = undefined;
  let lastTrainedDate: string | undefined = undefined;
  if (recent.length > 0) {
    const lastDate = new Date(recent[0].date);
    lastTrainedDate = lastDate.toISOString();
    const now = new Date();
    daysSinceLast = Math.floor((now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
  }
  // Ignore if any session is >14 days apart from previous (gap detection handles this)
  for (let i = 1; i < recent.length; i++) {
    const prev = new Date(recent[i - 1].date);
    const curr = new Date(recent[i].date);
    const diff = Math.abs(+prev - +curr) / (1000 * 60 * 60 * 24);
    if (diff > 14) {
      gapDetected = true;
      // console.log(`Skipping plateau detection for exercise ${exerciseName} (ID: ${exerciseId}) due to gap of ${diff.toFixed(1)} days between sessions on ${prev.toISOString()} and ${curr.toISOString()}`);
      return null;
    }
  }

  // Compute scores
  const scores = recent.map(s => computePerformanceScore(s.sets));
  if (scores.length < 3) return null;
  // Plateau if last 3 scores are within 10% of each other (less strict)
  const [s0, s1, s2] = scores;
  const maxScore = Math.max(s0, s1, s2);
  const minScore = Math.min(s0, s1, s2);
  if (maxScore === 0) return null;
  const scoreDiff = maxScore - minScore;
  const tolerance = 0.10 * maxScore; // 10% tolerance
  if (scoreDiff <= tolerance) {
    // Reasoning: check if weights and reps are unchanged
    // Import i18n only once at the top if not already imported
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    let reason = "No significant change in weight or reps for last";
    // i18n.t('insights.plateau.reason');

    const allWeights = recent.map(s => s.sets.map(set => set.weight || 0));
    const allReps = recent.map(s => s.sets.map(set => set.reps || 0));
    // If all weights are the same across sessions
    const flatWeights = allWeights.every((wArr, i, arr) => JSON.stringify(wArr) === JSON.stringify(arr[0]));
    const flatReps = allReps.every((rArr, i, arr) => JSON.stringify(rArr) === JSON.stringify(arr[0]));
    if (flatWeights && flatReps) {
      reason = "Same weight and reps for all recent sessions";
      // i18n.t('insights.plateau.reason.same_weight_and_reps');
    } else if (flatWeights) {
      reason = "Same weight for all recent sessions";
      // i18n.t('insights.plateau.reason.same_weight');
    } else if (flatReps) {
      reason = "Same reps for all recent sessions";
      // i18n.t('insights.plateau.reason.same_reps');
    }
    // Count how many consecutive sessions (from the most recent) are within the plateau threshold
    let plateauCount = 1;
    for (let k = 1; k < scores.length; k++) {
      const maxS = Math.max(...scores.slice(0, k + 1));
      const minS = Math.min(...scores.slice(0, k + 1));
      if (maxS - minS <= tolerance) {
        plateauCount = k + 1;
      } else {
        break;
      }
    }

        const lastTrainedFormatted = lastTrainedDate
      ? `${new Date(lastTrainedDate).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}`
      : 'No recent training data.';
    return {
      exerciseId,
      exerciseName,
      plateau: true,
      message: `${exerciseName} hasn’t improved recently`,
      scores: [s0, s1, s2],
      reason,
      daysSinceLast,
      lastTrained: lastTrainedFormatted,
      numberOfSessions: plateauCount,
      gapDetected,
    };
  }
  return null;
}

/**
 * Get the best plateau candidate from all exercises
 * allExercises: [{ id, name }]
 * sessionsByExercise: { [exerciseId]: [{ date, sets }] }
 * Returns PlateauResult or null
 */
export function getPlateauCandidate(
  allExercises: Array<{ id: number; name: string }>,
  sessionsByExercise: Record<number, Array<{ date: string | Date; sets: { weight: number; reps: number }[] }>>
): PlateauResult | null {
  return getPlateauCandidates(allExercises, sessionsByExercise)[0] ?? null;
}

export function getPlateauCandidates(
  allExercises: Array<{ id: number; name: string }>,
  sessionsByExercise: Record<number, Array<{ date: string | Date; sets: { weight: number; reps: number }[] }>>
): PlateauResult[] {
  const candidates: PlateauResult[] = [];

  for (const ex of allExercises) {
    const sessions = sessionsByExercise[ex.id];
    const exercisePlateau = detectPlateauForExercise(ex.id, ex.name, sessions);
    if (exercisePlateau && exercisePlateau.plateau) {
      const latestSessionAt = new Date(sessions?.[0]?.date || 0).getTime();
      candidates.push({
        ...exercisePlateau,
        score: latestSessionAt,
      });
    }
  }

  candidates.sort((a, b) => (b.score || 0) - (a.score || 0));
  return candidates;
}
