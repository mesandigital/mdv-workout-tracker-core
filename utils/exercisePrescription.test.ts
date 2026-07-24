import {
  normalizePlannedWeight,
  usesDuration,
  usesReps,
  usesWeight,
} from './exercisePrescription';

describe('exercisePrescription helpers', () => {
  it('detects whether an exercise type uses weight', () => {
    expect(usesWeight('weight_reps')).toBe(true);
    expect(usesWeight('reps')).toBe(false);
    expect(usesWeight('duration')).toBe(false);
  });

  it('detects rep and duration based exercise types', () => {
    expect(usesReps('reps')).toBe(true);
    expect(usesReps('weight_reps')).toBe(true);
    expect(usesReps('duration')).toBe(false);
    expect(usesDuration('duration')).toBe(true);
  });

  it('stores planned weight only for weighted exercises', () => {
    expect(normalizePlannedWeight('weight_reps', 20)).toBe(20);
    expect(normalizePlannedWeight('reps', 20)).toBeNull();
    expect(normalizePlannedWeight('duration', 20)).toBeNull();
    expect(normalizePlannedWeight('reps', 0)).toBeNull();
  });
});
