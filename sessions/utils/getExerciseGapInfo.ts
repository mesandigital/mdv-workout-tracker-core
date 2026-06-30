/**
 * Returns gap info for an exercise: days since last trained, message, level, and color
 * @param lastSessionDate ISO string or Date of last session for this exercise
 * @param today Date (default: now)
 * @param isPremium boolean (default: false)
 */

export function getExerciseGapInfo({
  lastSessionDate,
  today = new Date(),
  exerciseName = 'this exercise',
}: {
  lastSessionDate: string | Date | null | undefined;
  today?: Date;
  exerciseName?: string;
  messages?: Record<string, string>;
}) {
  const messages = {
    			"high": `Long gap detected — performance may drop for ${exerciseName}`,
			"medium": `You haven’t trained ${exerciseName} in a while`,
			// "medium_time": " in 3 weeks — try to get back to it soon!",
			"low": `It has been a while since you trained ${exerciseName}`,
			"full_message": `It has been days since you trained ${exerciseName}.`,

    // "high": i18n.t('insights.gap.long_gap', { exerciseName }),
    // "medium": i18n.t('insights.gap.medium_gap', { exerciseName }),
    // "low": i18n.t('insights.gap.short_gap', { exerciseName }),
    // full_message: i18n.t('insights.gap.full_message', { exerciseName, days: 0 }),
    recommendation: "Reduce weight by ~10%"
    // i18n.t('insights.recommendation'),
  }
  if (!lastSessionDate) return null;
  const last = typeof lastSessionDate === 'string' ? new Date(lastSessionDate) : lastSessionDate;
  if (isNaN(last.getTime())) return null;
  const msPerDay = 1000 * 60 * 60 * 24;
  const days = Math.floor((today.getTime() - last.getTime()) / msPerDay);
  if (days < 7) return null; // No gap message for <7 days
  let level: 'low' | 'medium' | 'high';
  let color: string;
  let message: string | undefined;

  if (days >= 30) {
    level = 'high';
    color = '#FF3B30'; // red
    message = messages?.high;
  } else if (days >= 14) {
    level = 'medium';
    color = '#FFA500'; // orange
    message = messages?.medium;
  } else {
    level = 'low';
    color = '#888'; // grey
    message = messages?.low;
  }
  // Recommendation for premium
  let recommendation: string | undefined = '';
  if (days >= 7) {
    recommendation = messages?.recommendation;
  }
  return {
    days,
    level,
    color,
    message,
    recommendation,
    fullMessage: messages?.full_message,
    contextualMessage: message,
    exerciseName,
    lastSessionDate
  };
}