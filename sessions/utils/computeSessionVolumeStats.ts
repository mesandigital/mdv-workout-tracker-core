
export function computeSessionVolumeStats(session: any) {
  let tonnage = 0;
  let sets = 0;
  let intensitySum = 0;
  let intensityCount = 0;
  if (Array.isArray(session.exercises)) {
    session.exercises.forEach((ex: any) => {
      if (Array.isArray(ex.sets)) {
        ex.sets.forEach((set: any) => {
          if (set.completed) {
            const reps = typeof set.reps === 'number' ? set.reps : 0;
            const weight = typeof set.weight === 'number' ? set.weight : 0;
            tonnage += reps * weight;
            sets += 1;
            if (weight > 0) {
              intensitySum += weight;
              intensityCount += 1;
            }
          }
        });
      }
    });
  }
  return {
    date: session.startedAt || session.started_at || session.date,
    tonnage,
    sets,
    intensity: intensityCount > 0 ? intensitySum / intensityCount : 0,
  };
}
