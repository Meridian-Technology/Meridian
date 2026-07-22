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
  rotatePivotCrewInviteLink: jest.fn(),
  joinPivotCrew: jest.fn(),
  invitePivotCrewPlaceholders: jest.fn(),
}));

const {
  createPivotCrew,
  listPivotCrews,
  getPivotCrewDetail,
  rotatePivotCrewInviteLink,
  joinPivotCrew,
  invitePivotCrewPlaceholders,
} = require('../../services/pivotCrewService');
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
    rotatePivotCrewInviteLink.mockReset();
    joinPivotCrew.mockReset();
    invitePivotCrewPlaceholders.mockReset();
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
});
