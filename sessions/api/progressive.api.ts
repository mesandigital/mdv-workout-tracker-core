
import { applyProgressiveOverload } from '../repositories/progressive.queries';
import type { ProgressiveOverloadRecommendation } from '../utils/progressiveOverloadCalculator';

export const ProgressiveOverloadApi = {
  applyProgressiveOverload: async (
    sessionId: number,
    overload: number,
    perExerciseOverload?: { [exerciseId: number]: boolean },
    perExerciseIncrement?: { [exerciseId: number]: number },
    recommendations?: ProgressiveOverloadRecommendation[],
  ): Promise<void> => {
    return await applyProgressiveOverload({ sessionId, overload, perExerciseOverload, perExerciseIncrement, recommendations });
  },
}
