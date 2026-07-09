const {
  normalizePivotTimeSlots,
  serializePivotTimeSlots,
  findTimeSlotById,
  isUpcomingWithTimeSlots,
  resolveTimeSlotLabel,
} = require('../../utilities/pivotTimeSlots');

describe('pivotTimeSlots', () => {
  it('normalizes and sorts slots by start time', () => {
    const slots = normalizePivotTimeSlots([
      { id: 'late', start_time: '2026-05-24T02:00:00.000Z' },
      { id: 'early', startTime: '2026-05-23T23:00:00.000Z', label: '7:00 PM' },
    ]);

    expect(slots.map((slot) => slot.id)).toEqual(['early', 'late']);
    expect(resolveTimeSlotLabel(slots[0])).toBe('7:00 PM');
  });

  it('findTimeSlotById resolves stored slots', () => {
    const pivot = {
      timeSlots: [{ id: '7pm', start_time: '2026-05-23T23:00:00.000Z' }],
    };
    expect(findTimeSlotById(pivot, '7pm')?.id).toBe('7pm');
    expect(findTimeSlotById(pivot, 'missing')).toBeNull();
  });

  it('isUpcomingWithTimeSlots returns true when any slot is still upcoming', () => {
    const now = new Date('2026-05-23T22:00:00.000Z');
    const pivot = {
      timeSlots: [
        { id: 'early', start_time: '2026-05-23T21:00:00.000Z', end_time: '2026-05-23T22:30:00.000Z' },
        { id: 'late', start_time: '2026-05-24T01:00:00.000Z', end_time: '2026-05-24T03:00:00.000Z' },
      ],
    };

    expect(isUpcomingWithTimeSlots(pivot, now)).toBe(true);
  });

  it('serializePivotTimeSlots attaches per-slot friend social', () => {
    const slots = normalizePivotTimeSlots([
      { id: '7pm', start_time: '2026-05-23T23:00:00.000Z' },
    ]);
    const socialBySlotId = new Map([
      [
        '7pm',
        {
          friendsGoingCount: 2,
          friendsGoing: [{ id: 'a', name: 'Alex', picture: null }],
        },
      ],
    ]);

    expect(serializePivotTimeSlots(slots, socialBySlotId)).toEqual([
      expect.objectContaining({
        id: '7pm',
        friendsGoingCount: 2,
        friendsGoing: [{ id: 'a', name: 'Alex', picture: null }],
      }),
    ]);
  });
});
