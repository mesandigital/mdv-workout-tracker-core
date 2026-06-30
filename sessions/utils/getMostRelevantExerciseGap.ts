// Utility for gap detection
/**
 * Returns the most relevant exercise gap info from a list, with cooldown support.
 * @param exercises Array of { name, lastSessionDate, frequency }
 * @param cooldowns Object mapping exercise name to last dismissed timestamp (ms)
 * @param now Date (default: now)
 * @param cooldownHours Number of hours for cooldown (default: 48)
 * @param minDaysSinceLast Minimum number of days since last session (default: 10)
 * @returns { exercise: string, gapInfo: ReturnType<typeof getExerciseGapInfo>, days: number, frequency: number, score: number } | null
 */
import { getExerciseGapInfo } from './getExerciseGapInfo';


export function getMostRelevantExerciseGap(
  exercises: Array<{ name: string; lastSessionDate: string | Date | null | undefined; frequency?: number }>,
  cooldowns: Record<string, number> = {},
  now: Date = new Date(),
  cooldownHours: number = 48,
  minDaysSinceLast: number = 10
) {
  const nowMs = now.getTime();
  const cooldownMs = cooldownHours * 60 * 60 * 1000;
  // Filter out exercises in cooldown
  const eligible = exercises.filter(e => {
    const lastDismissed = cooldowns[e.name];
    if (!lastDismissed) return true;
    return nowMs - lastDismissed > cooldownMs;
  });

  // Map to gap info and filter by minDaysSinceLast and frequency
  const withScore = eligible
    .map(e => {
      const gapInfo = getExerciseGapInfo({
        lastSessionDate: e.lastSessionDate,
        today: now,
        exerciseName: e.name,
      });
      const frequency = typeof e.frequency === 'number' ? e.frequency : 0;
      const days = gapInfo?.days ?? 0;
      const score = (days >= minDaysSinceLast && frequency > 0) ? days * frequency : -1;
      return { ...e, gapInfo, days, frequency, score };
    })
    .filter(e => e.score > 0);

  if (withScore.length > 0) {
    // Pick the highest score
    withScore.sort((a, b) => b.score - a.score);
    return { exercise: withScore[0].name, gapInfo: withScore[0].gapInfo, days: withScore[0].days, frequency: withScore[0].frequency, score: withScore[0].score };
  }
  return null;
}