import { calculatePersonalRecordCandidates } from './personalRecords';

describe('calculatePersonalRecordCandidates', () => {
  const performances = [
    {
      sessionId: 1,
      exerciseId: 10,
      exerciseName: 'Bench Press',
      setLogId: 101,
      weight: 20,
      reps: 8,
      achievedAt: '2026-01-01T10:00:00.000Z',
    },
    {
      sessionId: 2,
      exerciseId: 10,
      exerciseName: 'Bench Press',
      setLogId: 201,
      weight: 20,
      reps: 10,
      achievedAt: '2026-01-08T10:00:00.000Z',
    },
    {
      sessionId: 2,
      exerciseId: 10,
      exerciseName: 'Bench Press',
      setLogId: 202,
      weight: 22.5,
      reps: 8,
      achievedAt: '2026-01-08T10:00:00.000Z',
    },
  ];

  it('uses prior sessions as the baseline and emits each achieved PR type', () => {
    const records = calculatePersonalRecordCandidates(performances, 2);

    expect(records.map((record) => [record.set_log_id, record.record_type])).toEqual([
      [201, 'reps'],
      [201, 'volume'],
      [202, 'weight'],
      [202, 'reps'],
    ]);
  });

  it('does not create weight or volume records for bodyweight sets', () => {
    const records = calculatePersonalRecordCandidates([{
      sessionId: 3,
      exerciseId: 11,
      exerciseName: 'Pull-Up',
      setLogId: 301,
      weight: 0,
      reps: 10,
      achievedAt: '2026-01-09T10:00:00.000Z',
    }]);

    expect(records.map((record) => record.record_type)).toEqual(['reps']);
  });
});
