import { useMemo } from 'react';
import { computeMuscleSplit, getTrainingBias, getWeeklyMuscleRegionData, MuscleTargetOverrides, MUSCLE_FAMILIES } from '../../../features/sessions/utils';
import {
  buildMuscleFocusRows,
  buildMuscleFocusSplit,
  buildMuscleFocusSummary,
  normalizeMuscleTargetKey,
  type MuscleFocusPeriodMode,
} from '../../muscle-focus-kit';
import { getDefaultMuscleTarget, MUSCLE_PREFERENCE_MUSCLES } from '../../../features/settings/musclePreferences';

const DEFAULT_WEEKLY_TARGETS = Object.fromEntries(
  MUSCLE_PREFERENCE_MUSCLES.map(muscle => [muscle, getDefaultMuscleTarget(muscle)]),
);
const TARGET_ALIASES = MUSCLE_FAMILIES.reduce((aliases, family) => {
  const canonical = normalizeMuscleTargetKey(family[0]);
  family.forEach(muscle => {
    aliases[normalizeMuscleTargetKey(muscle)] = canonical;
  });
  return aliases;
}, {} as Record<string, string>);

export function useMusclesSplits({
  weekNumber,
  periodRange,
  periodMode = 'week',
  trackedMuscles = [],
  targetOverrides = {},
  workoutLogs = []
}: {
  weekNumber?: number,
  periodRange?: { startDate: Date; endDate: Date },
  periodMode?: MuscleFocusPeriodMode,
  trackedMuscles?: string[],
  targetOverrides?: MuscleTargetOverrides,
  workoutLogs?: any[],
}) {
  // Filter logs by timeRange (now using hook)
  // const { filteredLogs = [], isLoading: filteredLogsLoading } = useFilteredLogsByTimeRange(timeRange, weekNumber, periodRange);
  // Muscle split & Training bias
  const { 
    muscleSplit, 
    muscleSplitEx, 
    muscleSetCount, 
    primaryMuscleCount, 
    secondaryMuscleCount, 
    muscleExerciseLog 
  } = useMemo(() => computeMuscleSplit(workoutLogs), [workoutLogs]);
  const trainingBias = getTrainingBias(muscleSplit || {});

  const muscleSummary = useMemo(() => Object.entries(muscleExerciseLog || {}).map(([muscle, exercises_info]) => ({
    muscle,
    count: Array.isArray(exercises_info) ? exercises_info.reduce((sum, ex) => sum + (ex.total_sets || 0), 0) : 0,
    exercises_info: exercises_info || [],
  })), [muscleExerciseLog]);

  const muscleFocusSummary = useMemo(() => {
    return buildMuscleFocusSummary({
      muscleSummary,
      trackedMuscles,
      targetAliases: TARGET_ALIASES,
    });
  }, [muscleSummary, trackedMuscles]);

  const muscleFocusRows = useMemo(() => {
    return buildMuscleFocusRows({
      muscles: muscleFocusSummary.map(item => ({ muscle: item.muscle, completedSets: item.count })),
      weeklyTargets: targetOverrides,
      defaultWeeklyTargets: DEFAULT_WEEKLY_TARGETS,
      targetAliases: TARGET_ALIASES,
      targetAggregates: {
        deltoids: ['anterior_deltoid', 'lateral_deltoid', 'posterior_deltoid'],
      },
      periodMode,
      startDate: periodRange?.startDate,
      endDate: periodRange?.endDate,
    });
  }, [muscleFocusSummary, periodMode, periodRange?.endDate, periodRange?.startDate, targetOverrides]);

  const muscleFocusSplit = useMemo(() => {
    return buildMuscleFocusSplit(muscleFocusRows);
  }, [muscleFocusRows]);

  const muscleRegionData = useMemo(() => {
    return getWeeklyMuscleRegionData({
      muscles: muscleFocusSummary,
      weekNumber,
      timeRange: periodMode === 'month' ? 'this_month' : 'this_week',
      targetOverrides,
      progressRows: muscleFocusRows,
    });
  }, [muscleFocusRows, muscleFocusSummary, periodMode, targetOverrides, weekNumber]);

  return { 
    muscleSplit, 
    muscleSplitEx, 
    muscleSetCount, 
    trainingBias, 
    primaryMuscleCount, 
    secondaryMuscleCount, 
    muscleExerciseLog,
    muscleSummary,
    muscleFocusSummary,
    muscleFocusRows,
    muscleFocusSplit,
    muscleRegionData,
  }
}
