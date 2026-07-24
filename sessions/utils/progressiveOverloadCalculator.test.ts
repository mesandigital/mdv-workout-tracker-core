import {
  calculateProgressiveOverloadRecommendations,
  roundUpToIncrement,
} from './progressiveOverloadCalculator';
import type { HydratedExercise } from '../../types';

const makeWeightedExercise = (
  sets: HydratedExercise['sets'],
): HydratedExercise => ({
  id: 101,
  exerciseId: 10,
  exerciseLogId: 101,
  name: 'Barbell Incline Bench Press',
  plannedReps: 8,
  equipment: 'barbell',
  sets,
});

describe('progressiveOverloadCalculator', () => {
  it('rounds up to the nearest equipment increment', () => {
    expect(roundUpToIncrement(41.2, 2.5)).toBe(42.5);
  });

  it('does not recommend weighted progression when some sets miss planned reps', () => {
    const [recommendation] = calculateProgressiveOverloadRecommendations([
      makeWeightedExercise([
        {
          id: 1,
          exercise_log_id: 101,
          set_number: 1,
          planned_reps: 8,
          plannedReps: 8,
          reps: 8,
          weight: 40,
          completed: 1,
          previousBestWeight: 40,
        },
        {
          id: 2,
          exercise_log_id: 101,
          set_number: 2,
          planned_reps: 8,
          plannedReps: 8,
          reps: 5,
          weight: 40,
          completed: 1,
          previousBestWeight: 40,
        },
        {
          id: 3,
          exercise_log_id: 101,
          set_number: 3,
          planned_reps: 8,
          plannedReps: 8,
          reps: 4,
          weight: 40,
          completed: 1,
          previousBestWeight: 40,
        },
      ]),
    ]);

    expect(recommendation.eligible).toBe(false);
    expect(recommendation.reasonCode).toBe('incomplete_reps');
    expect(recommendation.recommendationType).toBe('maintain');
    expect(recommendation.recommendedValue).toBeNull();
  });

  it('recommends weighted progression when every set hits planned reps', () => {
    const [recommendation] = calculateProgressiveOverloadRecommendations([
      makeWeightedExercise([
        {
          id: 1,
          exercise_log_id: 101,
          set_number: 1,
          planned_reps: 8,
          plannedReps: 8,
          reps: 8,
          weight: 40,
          completed: 1,
          previousBestWeight: 40,
        },
        {
          id: 2,
          exercise_log_id: 101,
          set_number: 2,
          planned_reps: 8,
          plannedReps: 8,
          reps: 8,
          weight: 40,
          completed: 1,
          previousBestWeight: 40,
        },
        {
          id: 3,
          exercise_log_id: 101,
          set_number: 3,
          planned_reps: 8,
          plannedReps: 8,
          reps: 8,
          weight: 40,
          completed: 1,
          previousBestWeight: 40,
        },
      ]),
    ]);

    expect(recommendation.eligible).toBe(true);
    expect(recommendation.reasonCode).toBe('eligible_weight');
    expect(recommendation.recommendedValue).toBe(42.5);
  });

  it('recommends reps progression for reps-only exercises even when weight exists', () => {
    const [recommendation] = calculateProgressiveOverloadRecommendations([
      {
        ...makeWeightedExercise([
          {
            id: 1,
            exercise_log_id: 101,
            set_number: 1,
            planned_reps: 12,
            plannedReps: 12,
            reps: 12,
            weight: 20,
            completed: 1,
          },
        ]),
        name: 'Push-Up',
        equipment: 'bodyweight',
        exerciseType: 'reps',
        plannedReps: 12,
      },
    ]);

    expect(recommendation.eligible).toBe(true);
    expect(recommendation.reasonCode).toBe('eligible_reps');
    expect(recommendation.recommendationType).toBe('reps');
    expect(recommendation.templateUpdates[0]?.field).toBe('planned_reps');
    expect(recommendation.recommendedValue).toBe(13);
  });

  it('recommends duration progression for duration exercises', () => {
    const [recommendation] = calculateProgressiveOverloadRecommendations([
      {
        ...makeWeightedExercise([
          {
            id: 1,
            exercise_log_id: 101,
            set_number: 1,
            planned_reps: 0,
            plannedReps: 0,
            reps: null,
            plannedDurationSeconds: 30,
            durationSeconds: 30,
            weight: 20,
            completed: 1,
          },
        ]),
        name: 'Plank',
        equipment: 'bodyweight',
        exerciseType: 'duration',
        plannedReps: 0,
      },
    ]);

    expect(recommendation.eligible).toBe(true);
    expect(recommendation.reasonCode).toBe('eligible_duration');
    expect(recommendation.recommendationType).toBe('duration');
    expect(recommendation.templateUpdates[0]?.field).toBe(
      'planned_duration_seconds',
    );
    expect(recommendation.recommendedValue).toBe(35);
  });
});
