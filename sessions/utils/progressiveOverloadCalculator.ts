import type { HydratedExercise, SetRow } from '../../types';

export type ProgressiveOverloadReasonCode =
  | 'eligible_weight'
  | 'eligible_reps'
  | 'eligible_duration'
  | 'maintain'
  | 'incomplete_sets'
  | 'incomplete_reps'
  | 'incomplete_drop_sets'
  | 'no_sets'
  | 'no_progression_target'
  | 'no_previous_baseline'
  | 'bodyweight_progression'
  | 'timed_progression'
  | 'block_exercise'
  | 'drop_sets_maintained';

export type ProgressiveOverloadRecommendationType =
  | 'weight'
  | 'reps'
  | 'duration'
  | 'maintain';

export type ProgressiveOverloadTemplateUpdate = {
  exerciseId: number;
  exerciseLogId: number;
  setNumber: number;
  roundNumber?: number | null;
  field:
    | 'planned_weight'
    | 'planned_reps'
    | 'planned_duration_seconds'
    | 'drop_sets';
  currentValue: number | null;
  recommendedValue: number | null;
  dropSets?: SetRow['dropSets'];
};

export type ProgressiveOverloadRecommendation = {
  id: number;
  exerciseLogId: number;
  exerciseId: number;
  exerciseName: string;
  eligible: boolean;
  reasonCode: ProgressiveOverloadReasonCode;
  reasonLabel: string;
  recommendationType: ProgressiveOverloadRecommendationType;
  currentValue: number | null;
  recommendedValue: number | null;
  increment: number;
  equipmentIncrement: number;
  isBodyweight: boolean;
  isTimed: boolean;
  isBlockExercise: boolean;
  hasDropSets: boolean;
  templateUpdates: ProgressiveOverloadTemplateUpdate[];
};

export type ProgressiveOverloadCalculatorOptions = {
  defaultWeightIncrement?: number;
  defaultRepIncrement?: number;
  defaultDurationIncrementSeconds?: number;
};

const DEFAULT_WEIGHT_INCREMENT = 2.5;
const DEFAULT_REP_INCREMENT = 1;
const DEFAULT_DURATION_INCREMENT_SECONDS = 5;

const EQUIPMENT_WEIGHT_INCREMENTS: Array<{ match: RegExp; increment: number }> =
  [
    { match: /dumbbell/i, increment: 1 },
    { match: /kettlebell/i, increment: 4 },
    { match: /barbell|smith/i, increment: 2.5 },
    { match: /machine|cable|plate/i, increment: 2.5 },
    { match: /band/i, increment: 1 },
  ];

const BODYWEIGHT_EQUIPMENT = /bodyweight|none|mat/i;
const LOADABLE_BODYWEIGHT_EQUIPMENT = /dip[_ -]?belt|weighted|vest|plate/i;

const getSetNumber = (set: SetRow, index: number) =>
  set.set_number || index + 1;

const isTimedSet = (set: SetRow) =>
  typeof set.plannedDurationSeconds === 'number' &&
  set.plannedDurationSeconds > 0;

const isSetComplete = (set: SetRow) =>
  Boolean(set.completed) ||
  typeof set.reps === 'number' ||
  typeof set.durationSeconds === 'number';

const isDropComplete = (drop: NonNullable<SetRow['dropSets']>[number]) =>
  Boolean(drop.completed) || typeof drop.reps === 'number';

const getTargetReps = (
  set: SetRow,
  exercise: Pick<HydratedExercise, 'plannedReps'>,
) => {
  const target = set.plannedReps ?? set.planned_reps ?? exercise.plannedReps;
  return typeof target === 'number' && Number.isFinite(target) ? target : null;
};

const isSetProgressionTargetMet = (
  set: SetRow,
  exercise: Pick<HydratedExercise, 'plannedReps'>,
) => {
  if (isTimedSet(set)) {
    const target = set.plannedDurationSeconds ?? null;
    if (typeof target !== 'number' || target <= 0) return isSetComplete(set);
    return typeof set.durationSeconds === 'number' && set.durationSeconds >= target;
  }

  const targetReps = getTargetReps(set, exercise);
  if (typeof targetReps !== 'number' || targetReps <= 0) return isSetComplete(set);
  return typeof set.reps === 'number' && set.reps >= targetReps;
};

const isDropProgressionTargetMet = (
  drop: NonNullable<SetRow['dropSets']>[number],
) => {
  const targetReps = drop.plannedReps ?? null;
  if (typeof targetReps !== 'number' || targetReps <= 0) return isDropComplete(drop);
  return typeof drop.reps === 'number' && drop.reps >= targetReps;
};

const formatNumber = (value: number | null) =>
  typeof value === 'number' ? String(Math.round(value * 100) / 100) : '—';

export function roundUpToIncrement(value: number, increment: number) {
  if (!Number.isFinite(value) || !Number.isFinite(increment) || increment <= 0)
    return value;
  return (
    Math.round(Math.ceil(value / increment - 1e-8) * increment * 100) / 100
  );
}

export function getEquipmentIncrement(
  exercise: Pick<HydratedExercise, 'equipment'>,
  fallback = DEFAULT_WEIGHT_INCREMENT,
) {
  const equipment = String(exercise.equipment || '');
  const match = EQUIPMENT_WEIGHT_INCREMENTS.find(item =>
    item.match.test(equipment),
  );
  return match?.increment ?? fallback;
}

export function isBodyweightExercise(
  exercise: Pick<
    HydratedExercise,
    'trainingStyle' | 'equipment' | 'exerciseType'
  >,
) {
  const equipment = String(exercise.equipment || '');
  if (LOADABLE_BODYWEIGHT_EQUIPMENT.test(equipment)) return false;
  return (
    exercise.trainingStyle === 'calisthenics' ||
    BODYWEIGHT_EQUIPMENT.test(equipment) ||
    String(exercise.exerciseType || '').toLowerCase() === 'bodyweight'
  );
}

const getBestCompletedWeightedSet = (sets: SetRow[]) => {
  const completed = sets.filter(
    set => isSetComplete(set) && typeof set.weight === 'number',
  );
  if (!completed.length) return null;
  return completed.reduce((best, set) => {
    const bestWeight = best.weight ?? 0;
    const setWeight = set.weight ?? 0;
    if (setWeight > bestWeight) return set;
    if (setWeight === bestWeight && (set.reps ?? 0) > (best.reps ?? 0))
      return set;
    return best;
  }, completed[0]);
};

const getPrimaryReasonLabel = (
  code: ProgressiveOverloadReasonCode,
  values?: { from?: number | null; to?: number | null },
) => {
  switch (code) {
    case 'eligible_weight':
      return `Completed target. Increase weight from ${formatNumber(
        values?.from ?? null,
      )}kg to ${formatNumber(values?.to ?? null)}kg.`;
    case 'eligible_reps':
      return `Completed target. Increase reps from ${formatNumber(
        values?.from ?? null,
      )} to ${formatNumber(values?.to ?? null)}.`;
    case 'eligible_duration':
      return `Completed target. Increase duration from ${formatNumber(
        values?.from ?? null,
      )}s to ${formatNumber(values?.to ?? null)}s.`;
    case 'incomplete_sets':
      return 'Complete every set before progressing this exercise.';
    case 'incomplete_reps':
      return 'Complete all planned reps on every set before increasing the target.';
    case 'incomplete_drop_sets':
      return 'Complete all drop sets before progressing this exercise.';
    case 'no_sets':
      return 'No sets were logged for this exercise.';
    case 'no_previous_baseline':
      return 'Needs a previous baseline before recommending progression.';
    case 'bodyweight_progression':
      return 'Bodyweight exercise: progress reps instead of load.';
    case 'timed_progression':
      return 'Timed exercise: progress duration instead of load.';
    case 'block_exercise':
      return 'Block exercise: recommendation applies to this exercise inside the block.';
    case 'drop_sets_maintained':
      return 'Main set can progress; drop-set spacing is maintained.';
    case 'maintain':
      return 'Completed, but performance did not clearly beat the previous baseline. Maintain target.';
    default:
      return 'No clear progression target for this exercise.';
  }
};

export function calculateProgressiveOverloadRecommendations(
  exercises: HydratedExercise[],
  options: ProgressiveOverloadCalculatorOptions = {},
): ProgressiveOverloadRecommendation[] {
  const defaultWeightIncrement =
    options.defaultWeightIncrement ?? DEFAULT_WEIGHT_INCREMENT;
  const defaultRepIncrement =
    options.defaultRepIncrement ?? DEFAULT_REP_INCREMENT;
  const defaultDurationIncrementSeconds =
    options.defaultDurationIncrementSeconds ??
    DEFAULT_DURATION_INCREMENT_SECONDS;

  return exercises.map(exercise => {
    const sets = exercise.sets || [];
    const isBlockExercise = Boolean(
      exercise.blockId || exercise.groupId || exercise.supersetId,
    );
    const hasDropSets = sets.some(set => (set.dropSets || []).length > 0);
    const bodyweight = isBodyweightExercise(exercise);
    const anyTimed = sets.some(isTimedSet);
    const allSetsCompleted = sets.length > 0 && sets.every(isSetComplete);
    const allProgressionTargetsMet =
      sets.length > 0 &&
      sets.every(set => isSetProgressionTargetMet(set, exercise));
    const allDropSetsCompleted = sets.every(set =>
      (set.dropSets || []).every(isDropComplete),
    );
    const allDropSetTargetsMet = sets.every(set =>
      (set.dropSets || []).every(isDropProgressionTargetMet),
    );
    const equipmentIncrement = getEquipmentIncrement(
      exercise,
      defaultWeightIncrement,
    );

    const base = {
      id: exercise.exerciseLogId,
      exerciseLogId: exercise.exerciseLogId,
      exerciseId: exercise.exerciseId,
      exerciseName: exercise.name,
      equipmentIncrement,
      isBodyweight: bodyweight,
      isTimed: anyTimed,
      isBlockExercise,
      hasDropSets,
    };

    const makeRecommendation = (
      eligible: boolean,
      reasonCode: ProgressiveOverloadReasonCode,
      recommendationType: ProgressiveOverloadRecommendationType,
      currentValue: number | null,
      recommendedValue: number | null,
      increment: number,
      templateUpdates: ProgressiveOverloadTemplateUpdate[] = [],
    ): ProgressiveOverloadRecommendation => ({
      ...base,
      eligible,
      reasonCode,
      reasonLabel: getPrimaryReasonLabel(reasonCode, {
        from: currentValue,
        to: recommendedValue,
      }),
      recommendationType,
      currentValue,
      recommendedValue,
      increment,
      templateUpdates,
    });

    if (!sets.length)
      return makeRecommendation(false, 'no_sets', 'maintain', null, null, 0);
    if (!allSetsCompleted)
      return makeRecommendation(
        false,
        'incomplete_sets',
        'maintain',
        null,
        null,
        0,
      );
    if (!allProgressionTargetsMet)
      return makeRecommendation(
        false,
        'incomplete_reps',
        'maintain',
        null,
        null,
        0,
      );
    if (!allDropSetsCompleted)
      return makeRecommendation(
        false,
        'incomplete_drop_sets',
        'maintain',
        null,
        null,
        0,
      );
    if (!allDropSetTargetsMet)
      return makeRecommendation(
        false,
        'incomplete_drop_sets',
        'maintain',
        null,
        null,
        0,
      );

    if (anyTimed) {
      const timedSets = sets.filter(isTimedSet);
      const currentValue = Math.max(
        ...timedSets.map(
          set => set.durationSeconds ?? set.plannedDurationSeconds ?? 0,
        ),
      );
      const recommendedValue = currentValue + defaultDurationIncrementSeconds;
      const updates = timedSets.map((set, index) => ({
        exerciseId: exercise.exerciseId,
        exerciseLogId: exercise.exerciseLogId,
        setNumber: getSetNumber(set, index),
        roundNumber: set.roundNumber ?? null,
        field: 'planned_duration_seconds' as const,
        currentValue: set.plannedDurationSeconds ?? null,
        recommendedValue:
          (set.plannedDurationSeconds ?? set.durationSeconds ?? currentValue) +
          defaultDurationIncrementSeconds,
      }));
      return makeRecommendation(
        true,
        'eligible_duration',
        'duration',
        currentValue,
        recommendedValue,
        defaultDurationIncrementSeconds,
        updates,
      );
    }

    if (bodyweight) {
      const currentValue = Math.max(
        ...sets.map(
          set => set.reps ?? set.plannedReps ?? exercise.plannedReps ?? 0,
        ),
      );
      const recommendedValue = Math.max(
        1,
        Math.round(currentValue + defaultRepIncrement),
      );
      const updates = sets.map((set, index) => ({
        exerciseId: exercise.exerciseId,
        exerciseLogId: exercise.exerciseLogId,
        setNumber: getSetNumber(set, index),
        roundNumber: set.roundNumber ?? null,
        field: 'planned_reps' as const,
        currentValue: set.plannedReps ?? exercise.plannedReps ?? null,
        recommendedValue: Math.max(
          1,
          Math.round(
            (set.plannedReps ?? set.reps ?? currentValue) + defaultRepIncrement,
          ),
        ),
      }));
      return makeRecommendation(
        true,
        'eligible_reps',
        'reps',
        currentValue,
        recommendedValue,
        defaultRepIncrement,
        updates,
      );
    }

    const bestSet = getBestCompletedWeightedSet(sets);
    if (!bestSet || typeof bestSet.weight !== 'number') {
      return makeRecommendation(
        false,
        'no_progression_target',
        'maintain',
        null,
        null,
        0,
      );
    }

    const hasBaseline =
      sets.some(
        set =>
          typeof set.lastWeight === 'number' ||
          typeof set.previousBestWeight === 'number' ||
          typeof set.previousBestVolume === 'number',
      ) || Boolean(exercise.sessionStats?.lastSessionStats?.lastBestSet);

    if (!hasBaseline) {
      return makeRecommendation(
        false,
        'no_previous_baseline',
        'maintain',
        bestSet.weight,
        bestSet.weight,
        0,
      );
    }

    const currentValue = bestSet.weight;
    const recommendedValue = roundUpToIncrement(
      currentValue + equipmentIncrement,
      equipmentIncrement,
    );
    const updates = sets.map((set, index) => {
      const setCurrentWeight =
        typeof set.weight === 'number' ? set.weight : currentValue;
      const setRecommendedWeight = roundUpToIncrement(
        setCurrentWeight + equipmentIncrement,
        equipmentIncrement,
      );
      const update: ProgressiveOverloadTemplateUpdate = {
        exerciseId: exercise.exerciseId,
        exerciseLogId: exercise.exerciseLogId,
        setNumber: getSetNumber(set, index),
        roundNumber: set.roundNumber ?? null,
        field: 'planned_weight',
        currentValue: set.weight ?? null,
        recommendedValue: setRecommendedWeight,
      };
      if ((set.dropSets || []).length) {
        update.dropSets = (set.dropSets || []).map(drop => ({
          ...drop,
          plannedWeight:
            typeof (drop.weight ?? drop.plannedWeight) === 'number'
              ? roundUpToIncrement(
                  Number(drop.weight ?? drop.plannedWeight) +
                    equipmentIncrement,
                  equipmentIncrement,
                )
              : drop.plannedWeight ?? null,
        }));
      }
      return update;
    });

    return makeRecommendation(
      true,
      'eligible_weight',
      'weight',
      currentValue,
      recommendedValue,
      equipmentIncrement,
      updates,
    );
  });
}
