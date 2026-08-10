const express = require('express');
const request = require('supertest');

jest.mock('../../middlewares/verifyToken', () => ({
  verifyToken: (req, res, next) => {
    req.user = {
      globalUserId: '507f191e810c19729de860ea',
      userId: '507f191e810c19729de860eb',
    };
    next();
  },
}));

jest.mock('../../services/pivotCrewService', () => ({
  createPivotCrew: jest.fn(),
  listPivotCrews: jest.fn(),
  getPivotCrewDetail: jest.fn(),
  updatePivotCrewSettings: jest.fn(),
  deletePivotCrew: jest.fn(),
  rotatePivotCrewInviteLink: jest.fn(),
  joinPivotCrew: jest.fn(),
  invitePivotCrewPlaceholders: jest.fn(),
  addPivotCrewMember: jest.fn(),
  listPivotCrewInvites: jest.fn(),
  acceptPivotCrewInvite: jest.fn(),
  declinePivotCrewInvite: jest.fn(),
}));

jest.mock('../../services/pivotCrewWeekStateService', () => ({
  getPivotCrewWeekProgress: jest.fn(),
  CREW_WEEK_PROGRESS_CACHE_TTL_MS: 30000,
}));

jest.mock('../../services/pivotCrewJudgementService', () => ({
  getPivotCrewWeekJudgement: jest.fn(),
  getPivotCrewWeekJudgements: jest.fn(),
  castPivotCrewWeekBallot: jest.fn(),
  confirmPivotCrewWeekPick: jest.fn(),
  swapPivotCrewWeekPick: jest.fn(),
  resetPivotCrewWeekPick: jest.fn(),
}));

const {
  createPivotCrew,
  listPivotCrews,
  getPivotCrewDetail,
  deletePivotCrew,
  rotatePivotCrewInviteLink,
  joinPivotCrew,
  invitePivotCrewPlaceholders,
} = require('../../services/pivotCrewService');
const { getPivotCrewWeekProgress } = require('../../services/pivotCrewWeekStateService');
const {
  getPivotCrewWeekJudgement,
  getPivotCrewWeekJudgements,
  castPivotCrewWeekBallot,
  confirmPivotCrewWeekPick,
  swapPivotCrewWeekPick,
} = require('../../services/pivotCrewJudgementService');
const pivotRoutes = require('../../routes/pivotRoutes');

const CREW_ID = '665a1b2c3d4e5f6789012345';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.globalDb = {};
    req.school = 'nyc';
    next();
  });
  app.use('/pivot', pivotRoutes);
  return app;
}

describe('pivotRoutes /pivot/crews', () => {
  beforeEach(() => {
    createPivotCrew.mockReset();
    listPivotCrews.mockReset();
    getPivotCrewDetail.mockReset();
    deletePivotCrew.mockReset();
    rotatePivotCrewInviteLink.mockReset();
    joinPivotCrew.mockReset();
    invitePivotCrewPlaceholders.mockReset();
    getPivotCrewWeekProgress.mockReset();
    getPivotCrewWeekJudgement.mockReset();
    getPivotCrewWeekJudgements.mockReset();
    castPivotCrewWeekBallot.mockReset();
    confirmPivotCrewWeekPick.mockReset();
    swapPivotCrewWeekPick.mockReset();
  });

  it('GET /pivot/crews/week returns crew week progress', async () => {
    getPivotCrewWeekProgress.mockResolvedValue({
      data: {
        batchWeek: '2026-W30',
        crews: [
          {
            crewId: CREW_ID,
            name: 'Friday Plans',
            swipedCount: 2,
            activeCount: 3,
            invitedCount: 1,
            quorumMet: false,
            proposedEvent: null,
            runnerUp: null,
            judgementWindowEndsAt: null,
          },
        ],
      },
      cacheHit: false,
    });

    const response = await request(buildApp()).get('/pivot/crews/week?batchWeek=2026-W30');

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('private, max-age=30');
    expect(response.body.data.crews[0].swipedCount).toBe(2);
    expect(getPivotCrewWeekProgress).toHaveBeenCalledWith(
      expect.objectContaining({ school: 'nyc' }),
      { batchWeek: '2026-W30' },
    );
  });

  it('GET /pivot/crews/week/judgements returns 426 without X-App-Version', async () => {
    const response = await request(buildApp()).get('/pivot/crews/week/judgements?batchWeek=2026-W30');

    expect(response.status).toBe(426);
    expect(response.body.code).toBe('APP_UPGRADE_REQUIRED');
    expect(getPivotCrewWeekJudgements).not.toHaveBeenCalled();
  });

  it('GET /pivot/crews/week/judgements returns batch decide payload', async () => {
    getPivotCrewWeekJudgements.mockResolvedValue({
      data: {
        batchWeek: '2026-W30',
        decideQueueOrder: [CREW_ID, '665a1b2c3d4e5f6789012346'],
        judgements: [
          {
            crewId: CREW_ID,
            crewName: 'Friday Plans',
            needsUserAction: true,
            voteBreakdown: [{ eventId: '665a1b2c3d4e5f6789012347' }],
          },
          {
            crewId: '665a1b2c3d4e5f6789012346',
            crewName: 'Saturday Crew',
            needsUserAction: true,
            voteBreakdown: [],
          },
        ],
      },
    });

    const response = await request(buildApp())
      .get('/pivot/crews/week/judgements?batchWeek=2026-W30')
      .set('X-App-Version', '2.0.0');

    expect(response.status).toBe(200);
    expect(response.body.data.judgements).toHaveLength(2);
    expect(response.body.data.decideQueueOrder).toHaveLength(2);
    expect(getPivotCrewWeekJudgements).toHaveBeenCalledWith(
      expect.objectContaining({ school: 'nyc' }),
      expect.objectContaining({ batchWeek: '2026-W30' }),
    );
  });

  it('GET /pivot/crews/:crewId/week/judgement returns breakdown', async () => {
    getPivotCrewWeekJudgement.mockResolvedValue({
      data: {
        batchWeek: '2026-W30',
        crewId: CREW_ID,
        crewName: 'Friday Plans',
        voteBreakdown: [],
      },
    });

    const response = await request(buildApp()).get(
      `/pivot/crews/${CREW_ID}/week/judgement?batchWeek=2026-W30`,
    );

    expect(response.status).toBe(200);
    expect(response.body.data.crewName).toBe('Friday Plans');
  });

  it('POST /pivot/crews/:crewId/week/ballot casts ranking', async () => {
    castPivotCrewWeekBallot.mockResolvedValue({
      data: {
        crewId: CREW_ID,
        judgementStatus: 'balloting',
        ballot: { viewerHasBalloted: true },
      },
    });

    const response = await request(buildApp())
      .post(`/pivot/crews/${CREW_ID}/week/ballot`)
      .send({
        ranking: ['665a1b2c3d4e5f6789012346', '665a1b2c3d4e5f6789012347'],
        batchWeek: '2026-W30',
      });

    expect(response.status).toBe(200);
    expect(response.body.data.ballot.viewerHasBalloted).toBe(true);
  });

  it('POST /pivot/crews/:crewId/week/confirm returns 410 retired', async () => {
    confirmPivotCrewWeekPick.mockResolvedValue({
      error: 'Confirm is retired. Rank the shortlist via POST …/week/ballot.',
      status: 410,
      code: 'CONFIRM_RETIRED',
    });

    const response = await request(buildApp())
      .post(`/pivot/crews/${CREW_ID}/week/confirm`)
      .send({ eventId: '665a1b2c3d4e5f6789012346' });

    expect(response.status).toBe(410);
    expect(response.body.code).toBe('CONFIRM_RETIRED');
  });

  it('POST /pivot/crews/:crewId/week/swap returns 410 retired', async () => {
    swapPivotCrewWeekPick.mockResolvedValue({
      error: 'Swap is retired. Rank the shortlist via POST …/week/ballot.',
      status: 410,
      code: 'SWAP_RETIRED',
    });

    const response = await request(buildApp())
      .post(`/pivot/crews/${CREW_ID}/week/swap`)
      .send({ batchWeek: '2026-W30' });

    expect(response.status).toBe(410);
    expect(response.body.code).toBe('SWAP_RETIRED');
  });

  it('POST /pivot/crews creates a crew', async () => {
    createPivotCrew.mockResolvedValue({
      data: {
        crew: { id: CREW_ID, name: 'Friday Plans', role: 'owner' },
        inviteLink: 'meridian://pivot/crew/join?token=abc123',
      },
    });

    const response = await request(buildApp())
      .post('/pivot/crews')
      .send({ name: 'Friday Plans' });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.crew.name).toBe('Friday Plans');
    expect(createPivotCrew).toHaveBeenCalledWith(
      expect.objectContaining({ school: 'nyc' }),
      { name: 'Friday Plans' },
    );
  });

  it('GET /pivot/crews lists user crews', async () => {
    listPivotCrews.mockResolvedValue({
      data: {
        crews: [{ id: CREW_ID, name: 'Friday Plans', role: 'owner' }],
      },
    });

    const response = await request(buildApp()).get('/pivot/crews');

    expect(response.status).toBe(200);
    expect(response.body.data.crews).toHaveLength(1);
  });

  it('GET /pivot/crews/:crewId returns detail', async () => {
    getPivotCrewDetail.mockResolvedValue({
      data: {
        crew: { id: CREW_ID, name: 'Friday Plans', role: 'owner' },
        roster: [{ displayLabel: 'Owner Person', status: 'active' }],
      },
    });

    const response = await request(buildApp()).get(`/pivot/crews/${CREW_ID}`);

    expect(response.status).toBe(200);
    expect(response.body.data.roster).toHaveLength(1);
  });

  it('POST /pivot/crews/:crewId/invite-link rotates share URL', async () => {
    rotatePivotCrewInviteLink.mockResolvedValue({
      data: {
        crewId: CREW_ID,
        inviteLink: 'meridian://pivot/crew/join?token=rotated',
      },
    });

    const response = await request(buildApp()).post(`/pivot/crews/${CREW_ID}/invite-link`);

    expect(response.status).toBe(200);
    expect(response.body.data.inviteLink).toContain('token=rotated');
  });

  it('POST /pivot/crews/join accepts invite token', async () => {
    joinPivotCrew.mockResolvedValue({
      data: {
        crew: { id: CREW_ID, name: 'Friday Plans', role: 'member' },
        roster: [],
      },
    });

    const response = await request(buildApp())
      .post('/pivot/crews/join')
      .send({ token: 'abc123' });

    expect(response.status).toBe(200);
    expect(joinPivotCrew).toHaveBeenCalledWith(
      expect.objectContaining({ school: 'nyc' }),
      { token: 'abc123' },
    );
  });

  it('POST /pivot/crews/:crewId/invite creates invited placeholders', async () => {
    invitePivotCrewPlaceholders.mockResolvedValue({
      data: {
        crew: { id: CREW_ID, invitedCount: 2, activeMemberCount: 1 },
        roster: [
          { status: 'active', displayLabel: 'Owner Person' },
          { status: 'invited', displayLabel: 'invited' },
          { status: 'invited', displayLabel: 'invited' },
        ],
        quorum: { quorumEligibleCount: 1, invitedCount: 2, activeMemberCount: 1 },
      },
    });

    const response = await request(buildApp())
      .post(`/pivot/crews/${CREW_ID}/invite`)
      .send({ count: 2 });

    expect(response.status).toBe(201);
    expect(response.body.data.roster.filter((row) => row.status === 'invited')).toHaveLength(2);
    expect(invitePivotCrewPlaceholders).toHaveBeenCalledWith(
      expect.objectContaining({ school: 'nyc' }),
      CREW_ID,
      { count: 2 },
    );
  });

  it('POST /pivot/crews/join validates token body', async () => {
    const response = await request(buildApp()).post('/pivot/crews/join').send({});

    expect(response.status).toBe(400);
    expect(joinPivotCrew).not.toHaveBeenCalled();
  });

  it('DELETE /pivot/crews/:crewId archives a crew', async () => {
    deletePivotCrew.mockResolvedValue({
      data: {
        crewId: CREW_ID,
        archivedAt: '2026-08-08T08:00:00.000Z',
      },
    });

    const response = await request(buildApp()).delete(`/pivot/crews/${CREW_ID}`);

    expect(response.status).toBe(200);
    expect(response.body.data.crewId).toBe(CREW_ID);
    expect(deletePivotCrew).toHaveBeenCalledWith(
      expect.objectContaining({ school: 'nyc' }),
      CREW_ID,
    );
  });
});
