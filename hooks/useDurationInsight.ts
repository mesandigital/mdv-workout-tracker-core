import { useMemo } from 'react';

export interface DailyDuration {
  day: string; // e.g. 'Mon'
  duration: number; // in minutes
}

export interface WeeklyDurationInsight {
  total: number;
  average: number;
  mostActive: { day: string; duration: number } | null;
  leastActive: { day: string; duration: number } | null;
  missedDays: string[];
  streak: number;
  streakStart: string | null;
  streakEnd: string | null;
  summary: string[];
}

export function useDurationInsight(breakdown: DailyDuration[]): WeeklyDurationInsight {
  return useMemo(() => {
    if (!breakdown || breakdown.length === 0) {
      return {
        total: 0,
        average: 0,
        mostActive: null,
        leastActive: null,
        missedDays: [],
        streak: 0,
        streakStart: null,
        streakEnd: null,
        summary: ['No workout data for this week.'],
      };
    }
    const total = breakdown.reduce((sum, d) => sum + d.duration, 0);
    const average = Math.round(total / 7);
    let mostActive = breakdown[0];
    let leastActive = breakdown[0];
    for (const d of breakdown) {
      if (d.duration > mostActive.duration) mostActive = d;
      if (d.duration < leastActive.duration) leastActive = d;
    }
    // Only include missed days up to the latest day reached in the week
    let maxReachedIdx = -1;
    for (let i = breakdown.length - 1; i >= 0; i--) {
      if (breakdown[i].duration > 0) {
        maxReachedIdx = i;
        break;
      }
    }
    const missedDays = breakdown
      .filter((d, idx) => d.duration === 0 && idx <= maxReachedIdx)
      .map(d => d.day);
    // Find longest streak (track start and end indices)
    let maxStreak = 0, currentStreak = 0;
    let tempStartIdx = 0;
    let streakStartIdx = null, streakEndIdx = null;
    for (let i = 0; i < breakdown.length; i++) {
      if (breakdown[i].duration > 0) {
        if (currentStreak === 0) tempStartIdx = i;
        currentStreak++;
        if (currentStreak > maxStreak) {
          maxStreak = currentStreak;
          streakStartIdx = tempStartIdx;
          streakEndIdx = i;
        }
      } else {
        currentStreak = 0;
      }
    }
    const streakStart = streakStartIdx !== null ? breakdown[streakStartIdx].day : null;
    const streakEnd = streakEndIdx !== null ? breakdown[streakEndIdx].day : null;
    // Build summary
    const summary: string[] = [];
    summary.push(`Total: ${total} min, Avg: ${average} min/day.`);
    if (mostActive.duration > 0) summary.push(`Most active: ${mostActive.day} (${mostActive.duration} min).`);
    if (leastActive.duration === 0) summary.push(`Missed: ${leastActive.day}.`);
    else summary.push(`Least active: ${leastActive.day} (${leastActive.duration} min).`);
    if (missedDays.length > 0) summary.push(`Missed days: ${missedDays.join(', ')}.`);
    if (maxStreak > 1) summary.push(`Longest streak: ${maxStreak} days (${streakStart} to ${streakEnd}).`);
    if (maxStreak === 1) summary.push(`No consecutive workout streaks.`);
    if (maxStreak === 0) summary.push(`No workouts this week.`);
    if (missedDays.length === 0 && total > 0) summary.push(`Perfect consistency!`);
    return {
      total,
      average,
      mostActive,
      leastActive,
      missedDays,
      streak: maxStreak,
      streakStart,
      streakEnd,
      summary,
    };
  }, [breakdown]);
}


/*
import React from 'react';
import { useDurationInsight, DailyDuration } from './useDurationInsight';

// Example breakdown for a week
const weekBreakdown: DailyDuration[] = [
  { day: 'Mon', duration: 30 },
  { day: 'Tue', duration: 0 },
  { day: 'Wed', duration: 45 },
  { day: 'Thu', duration: 20 },
  { day: 'Fri', duration: 0 },
  { day: 'Sat', duration: 60 },
  { day: 'Sun', duration: 0 },
];

export function WeeklyInsightExample() {
  const insight = useDurationInsight(weekBreakdown);

  return (
    <div>
      <h2>Weekly Workout Insight</h2>
      <ul>
        {insight.summary.map((msg, i) => (
          <li key={i}>{msg}</li>
        ))}
      </ul>
      <div>
        <strong>Total:</strong> {insight.total} min<br />
        <strong>Average:</strong> {insight.average} min/day<br />
        <strong>Most Active:</strong> {insight.mostActive?.day} ({insight.mostActive?.duration} min)<br />
        <strong>Least Active:</strong> {insight.leastActive?.day} ({insight.leastActive?.duration} min)<br />
        <strong>Missed Days:</strong> {insight.missedDays.join(', ') || 'None'}<br />
        <strong>Longest Streak:</strong> {insight.streak} {insight.streak > 1 ? 'days' : 'day'}
      </div>
    </div>
  );
}
*/