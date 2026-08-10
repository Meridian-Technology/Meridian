const {
  clampMaxPickSlots,
  resolveEffectiveMaxPickSlots,
  normalizeProposedEventIds,
  syncPrimaryProposedFields,
  validateProposedEventIdsInput,
  resolveSwapTargetEventIdExcluding,
} = require('../../utilities/pivotCrewPickSlots');

describe('pivotCrewPickSlots', () => {
  describe('clampMaxPickSlots', () => {
    it('clamps to 1–2 with default 1', () => {
      expect(clampMaxPickSlots(undefined)).toBe(1);
      expect(clampMaxPickSlots(0)).toBe(1);
      expect(clampMaxPickSlots(1)).toBe(1);
      expect(clampMaxPickSlots(2)).toBe(2);
      expect(clampMaxPickSlots(9)).toBe(2);
    });
  });

  describe('resolveEffectiveMaxPickSlots', () => {
    it('prefers weekState, then crew, then tenant config', () => {
      expect(
        resolveEffectiveMaxPickSlots({
          weekState: { maxPickSlots: 2 },
          crew: { maxPickSlots: 1 },
          crewConfig: { judgement: { maxPickSlots: 1 } },
        }),
      ).toBe(2);
      expect(
        resolveEffectiveMaxPickSlots({
          crew: { maxPickSlots: 2 },
          crewConfig: { judgement: { maxPickSlots: 1 } },
        }),
      ).toBe(2);
      expect(
        resolveEffectiveMaxPickSlots({
          crew: { maxPickSlots: null },
          crewConfig: { judgement: { maxPickSlots: 1 } },
        }),
      ).toBe(1);
    });
  });

  describe('normalizeProposedEventIds', () => {
    it('reads proposedEventIds and falls back to proposedEventId', () => {
      expect(
        normalizeProposedEventIds(
          { proposedEventIds: ['a', 'b', 'a'], proposedEventId: 'z' },
          2,
        ),
      ).toEqual(['a', 'b']);
      expect(
        normalizeProposedEventIds({ proposedEventId: 'solo' }, 2),
      ).toEqual(['solo']);
    });
  });

  describe('syncPrimaryProposedFields', () => {
    it('mirrors primary scalars from the ordered set', () => {
      expect(syncPrimaryProposedFields(['a', 'b'], ['a'])).toEqual({
        proposedEventIds: ['a', 'b'],
        proposedEventId: 'a',
        originalProposedEventIds: ['a'],
        originalProposedEventId: 'a',
      });
    });
  });

  describe('validateProposedEventIdsInput', () => {
    it('accepts a capped unique subset of allowed candidates', () => {
      expect(
        validateProposedEventIdsInput(['a', 'b'], {
          maxPickSlots: 2,
          allowedEventIds: ['a', 'b', 'c'],
        }),
      ).toEqual({ ok: true, eventIds: ['a', 'b'] });
    });

    it('rejects too many picks or unknown candidates', () => {
      expect(
        validateProposedEventIdsInput(['a', 'b'], {
          maxPickSlots: 1,
          allowedEventIds: ['a', 'b'],
        }).code,
      ).toBe('TOO_MANY_PICKS');
      expect(
        validateProposedEventIdsInput(['z'], {
          maxPickSlots: 2,
          allowedEventIds: ['a'],
        }).code,
      ).toBe('INVALID_CANDIDATE');
    });
  });

  describe('resolveSwapTargetEventIdExcluding', () => {
    it('picks the next voteBreakdown id not already slotted', () => {
      const weekState = {
        proposedEventId: 'a',
        voteBreakdown: [
          { eventId: 'a' },
          { eventId: 'b' },
          { eventId: 'c' },
        ],
      };
      expect(resolveSwapTargetEventIdExcluding(weekState, ['a', 'b'])).toBe('c');
      expect(resolveSwapTargetEventIdExcluding(weekState, ['a'])).toBe('b');
    });
  });
});
