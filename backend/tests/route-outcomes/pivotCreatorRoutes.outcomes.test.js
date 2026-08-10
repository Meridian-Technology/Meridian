const express = require('express');
const request = require('supertest');

jest.mock('../../middlewares/verifyToken', () => ({
  verifyToken: (req, res, next) => {
    req.user = {
      globalUserId: '507f191e810c19729de860ea',
      userId: 'tenant-user-1',
    };
    next();
  },
}));

jest.mock('../../middlewares/requirePivotCreator', () => ({
  requirePivotCreator: jest.fn((req, res, next) => {
    req.pivotCreator = {
      tenantKey: 'brooklyn',
      tenant: { tenantKey: 'brooklyn', tenantType: 'pivot' },
      globalUserId: '507f191e810c19729de860ea',
      grant: { status: 'active' },
    };
    next();
  }),
}));

jest.mock('../../services/pivotCreatorListingService', () => ({
  createListing: jest.fn(),
  updateListing: jest.fn(),
  listListings: jest.fn(),
  getListing: jest.fn(),
}));

const { requirePivotCreator } = require('../../middlewares/requirePivotCreator');
const {
  createListing,
  updateListing,
  listListings,
  getListing,
} = require('../../services/pivotCreatorListingService');
const pivotCreatorRoutes = require('../../routes/pivotCreatorRoutes');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.school = 'brooklyn';
    req.db = {};
    req.globalDb = {};
    next();
  });
  app.use('/pivot/creator', pivotCreatorRoutes);
  return app;
}

describe('pivotCreatorRoutes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requirePivotCreator.mockImplementation((req, res, next) => {
      req.pivotCreator = {
        tenantKey: 'brooklyn',
        tenant: { tenantKey: 'brooklyn', tenantType: 'pivot' },
        globalUserId: '507f191e810c19729de860ea',
        grant: { status: 'active' },
      };
      next();
    });
  });

  it('GET /events lists creator listings', async () => {
    listListings.mockResolvedValue({
      data: {
        tenantKey: 'brooklyn',
        events: [
          {
            _id: '507f1f77bcf86cd799439099',
            name: 'Rooftop Vinyl Night',
            ingestStatus: 'draft',
            source: 'justgo',
            createdByUserId: '507f191e810c19729de860ea',
          },
        ],
        total: 1,
      },
    });

    const response = await request(buildApp())
      .get('/pivot/creator/events')
      .query({ ingestStatus: 'draft' });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.total).toBe(1);
    expect(listListings).toHaveBeenCalledWith(
      expect.objectContaining({ school: 'brooklyn' }),
      { ingestStatus: 'draft' },
    );
  });

  it('GET /events/:eventId returns detail with zero-safe stats shape', async () => {
    getListing.mockResolvedValue({
      data: {
        tenantKey: 'brooklyn',
        event: {
          _id: '507f1f77bcf86cd799439099',
          name: 'Rooftop Vinyl Night',
          ingestStatus: 'draft',
          source: 'justgo',
        },
        stats: {
          intents: {
            interested: 0,
            registered: 0,
            passed: 0,
            externalOpens: 0,
            externalOpenUsers: 0,
          },
          analytics: {
            views: 0,
            uniqueViews: 0,
            anonymousViews: 0,
            uniqueAnonymousViews: 0,
            registrations: 0,
            uniqueRegistrations: 0,
          },
        },
      },
    });

    const response = await request(buildApp()).get(
      '/pivot/creator/events/507f1f77bcf86cd799439099',
    );

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.stats.intents.interested).toBe(0);
    expect(response.body.data.stats.analytics.views).toBe(0);
    expect(getListing).toHaveBeenCalledWith(
      expect.objectContaining({ school: 'brooklyn' }),
      '507f1f77bcf86cd799439099',
    );
  });

  it('GET /events/:eventId returns 403 when not owner', async () => {
    getListing.mockResolvedValue({
      error: 'You can only manage your own Just Go listings.',
      status: 403,
      code: 'CREATOR_NOT_OWNER',
    });

    const response = await request(buildApp()).get(
      '/pivot/creator/events/507f1f77bcf86cd799439099',
    );

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      success: false,
      code: 'CREATOR_NOT_OWNER',
    });
  });

  it('POST /events creates a listing', async () => {
    createListing.mockResolvedValue({
      data: {
        event: {
          _id: '507f1f77bcf86cd799439099',
          name: 'Rooftop Vinyl Night',
          ingestStatus: 'draft',
          batchWeek: '2026-W21',
          source: 'justgo',
        },
        created: true,
        ingestStatus: 'draft',
        batchWeek: '2026-W21',
      },
    });

    const response = await request(buildApp())
      .post('/pivot/creator/events')
      .send({
        name: 'Rooftop Vinyl Night',
        location: 'Bushwick',
        start_time: '2026-05-23T19:00:00.000Z',
        hostName: 'Just Go Host',
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.ingestStatus).toBe('draft');
    expect(response.body.data.event.source).toBe('justgo');
    expect(createListing).toHaveBeenCalledWith(
      expect.objectContaining({
        school: 'brooklyn',
        db: {},
        pivotCreator: expect.objectContaining({ tenantKey: 'brooklyn' }),
      }),
      expect.objectContaining({ name: 'Rooftop Vinyl Night' }),
    );
  });

  it('POST /events returns forbidden publish flip', async () => {
    createListing.mockResolvedValue({
      error:
        'Creators cannot publish listings to the live feed. Submit as a draft; Just Go ops release the weekly drop.',
      status: 403,
      code: 'CREATOR_PUBLISH_FORBIDDEN',
    });

    const response = await request(buildApp())
      .post('/pivot/creator/events')
      .send({
        name: 'Rooftop Vinyl Night',
        ingestStatus: 'published',
      });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      success: false,
      code: 'CREATOR_PUBLISH_FORBIDDEN',
    });
  });

  it('PATCH /events/:eventId updates a listing', async () => {
    updateListing.mockResolvedValue({
      data: {
        event: { _id: '507f1f77bcf86cd799439099', name: 'Updated' },
        updated: true,
        ingestStatus: 'draft',
        batchWeek: '2026-W21',
      },
    });

    const response = await request(buildApp())
      .patch('/pivot/creator/events/507f1f77bcf86cd799439099')
      .send({ name: 'Updated' });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(updateListing).toHaveBeenCalledWith(
      expect.objectContaining({ school: 'brooklyn' }),
      '507f1f77bcf86cd799439099',
      expect.objectContaining({ name: 'Updated' }),
    );
  });

  it('returns 403 when creator gate rejects', async () => {
    requirePivotCreator.mockImplementation((req, res) =>
      res.status(403).json({
        success: false,
        message: 'You do not have Just Go Creator access for this city.',
        code: 'CREATOR_FORBIDDEN',
      }),
    );

    const response = await request(buildApp()).post('/pivot/creator/events').send({
      name: 'Nope',
    });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('CREATOR_FORBIDDEN');
    expect(createListing).not.toHaveBeenCalled();
  });
});
