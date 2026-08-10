const {
  validateRankingAgainstShortlist,
  resolveBordaWinner,
  upsertMemberBallot,
  allActivesHaveBalloted,
  memberHasBalloted,
  computeBallotEndsAt,
  isBallotExpired,
} = require('../../utilities/pivotCrewBorda');

describe('pivotCrewBorda', () => {
  const shortlist = ['a', 'b', 'c'];

  describe('validateRankingAgainstShortlist', () => {
    it('accepts a full ranking', () => {
      const result = validateRankingAgainstShortlist(['b', 'a', 'c'], shortlist);
      expect(result.ok).toBe(true);
      expect(result.ranking).toEqual(['b', 'a', 'c']);
    });

    it('rejects ids outside the shortlist', () => {
      const result = validateRankingAgainstShortlist(['a', 'z'], shortlist);
      expect(result.ok).toBe(false);
      expect(result.error).toBe('RANKING_INVALID');
    });

    it('rejects duplicates', () => {
      const result = validateRankingAgainstShortlist(['a', 'a'], shortlist);
      expect(result.ok).toBe(false);
      expect(result.error).toBe('RANKING_DUPLICATE');
    });
  });

  describe('resolveBordaWinner', () => {
    it('scores 2/1/0 for a 3-candidate shortlist', () => {
      const { winnerEventId, scores } = resolveBordaWinner({
        ballots: [
          { ranking: ['a', 'b', 'c'] },
          { ranking: ['b', 'a', 'c'] },
          { ranking: ['b', 'c', 'a'] },
        ],
        shortlistEventIds: shortlist,
      });

      expect(winnerEventId).toBe('b');
      expect(scores.find((row) => row.eventId === 'a').score).toBe(3);
      expect(scores.find((row) => row.eventId === 'b').score).toBe(5);
      expect(scores.find((row) => row.eventId === 'c').score).toBe(1);
    });

    it('breaks score ties with most first-place votes', () => {
      const { winnerEventId } = resolveBordaWinner({
        ballots: [
          { ranking: ['a', 'b'] },
          { ranking: ['b', 'a'] },
          { ranking: ['a'] },
        ],
        shortlistEventIds: ['a', 'b'],
      });
      // a: 1+0+1 = 2 with two #1s; b: 0+1+0 = 1 with one #1
      expect(winnerEventId).toBe('a');
    });

    it('returns top N winners for multi-slot crews', () => {
      const { winnerEventId, winnerEventIds } = resolveBordaWinner({
        ballots: [
          { ranking: ['a', 'b', 'c'] },
          { ranking: ['b', 'a', 'c'] },
          { ranking: ['b', 'c', 'a'] },
        ],
        shortlistEventIds: shortlist,
        maxWinners: 2,
      });

      // b=5, a=3, c=1 — lock top two for maxPickSlots=2
      expect(winnerEventId).toBe('b');
      expect(winnerEventIds).toEqual(['b', 'a']);
    });
  });

  describe('ballot bookkeeping', () => {
    it('upserts and detects completion', () => {
      let ballots = [];
      ballots = upsertMemberBallot(ballots, {
        userId: 'u1',
        ranking: ['a', 'b'],
        at: new Date('2026-08-01T00:00:00.000Z'),
      });
      ballots = upsertMemberBallot(ballots, {
        userId: 'u2',
        ranking: ['b', 'a'],
        at: new Date('2026-08-01T00:01:00.000Z'),
      });

      expect(memberHasBalloted(ballots, 'u1')).toBe(true);
      expect(allActivesHaveBalloted(ballots, ['u1', 'u2'])).toBe(true);
      expect(allActivesHaveBalloted(ballots, ['u1', 'u2', 'u3'])).toBe(false);
    });
  });

  describe('computeBallotEndsAt / isBallotExpired', () => {
    it('caps soft window by hard window', () => {
      const endsAt = computeBallotEndsAt({
        quorumMetAt: new Date('2026-08-01T12:00:00.000Z'),
        hardWindowEndsAt: new Date('2026-08-01T13:00:00.000Z'),
        ballotWindowMinutes: 180,
      });
      expect(endsAt.toISOString()).toBe('2026-08-01T13:00:00.000Z');
    });

    it('detects expired balloting rows', () => {
      expect(
        isBallotExpired(
          {
            judgementStatus: 'balloting',
            ballotEndsAt: new Date('2026-08-01T12:00:00.000Z'),
          },
          new Date('2026-08-01T12:00:01.000Z'),
        ),
      ).toBe(true);
      expect(
        isBallotExpired(
          {
            judgementStatus: 'confirmed',
            ballotEndsAt: new Date('2026-08-01T12:00:00.000Z'),
          },
          new Date('2026-08-01T13:00:00.000Z'),
        ),
      ).toBe(false);
    });
  });
});
