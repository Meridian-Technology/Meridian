const express = require('express');
const cookieParser = require('cookie-parser');
const request = require('supertest');

const userSchema = require('../../schemas/user');
const orgInviteSchema = require('../../schemas/orgInvite');
const orgMemberSchema = require('../../schemas/orgMember');
const { createMongoMemoryConnection, getOrCreateModel } = require('../helpers/mongoMemory');

jest.mock('../../services/userServices.js', () => ({
  authenticateWithGoogle: jest.fn(),
  authenticateWithApple: jest.fn(),
  loginUser: jest.fn(),
  registerUser: jest.fn(),
  authenticateWithGoogleIdToken: jest.fn(),
}));

jest.mock('../../services/discordWebookService', () => ({
  sendDiscordMessage: jest.fn(),
}));

jest.mock('../../services/profanityFilterService', () => ({
  isProfane: jest.fn(() => false),
}));

jest.mock('../../utilities/sessionUtils', () => ({
  createSession: jest.fn().mockResolvedValue(undefined),
  validateSession: jest.fn(),
  deleteSession: jest.fn(),
  deleteAllUserSessions: jest.fn(),
  getUserSessions: jest.fn(),
  deleteSessionById: jest.fn(),
}));

jest.mock('../../services/autoClaimEventRegistrationsService', () => ({
  runAutoClaimAsync: jest.fn(),
}));

jest.mock('../../services/getModelService.js', () => {
  return (req, ...names) => {
    const models = {
      User: getOrCreateModel(req.db, 'User', userSchema, 'users'),
      OrgInvite: getOrCreateModel(req.db, 'OrgInvite', orgInviteSchema, 'orgInvites'),
      OrgMember: getOrCreateModel(req.db, 'OrgMember', orgMemberSchema, 'members'),
    };
    return names.reduce((acc, name) => {
      if (models[name]) acc[name] = models[name];
      return acc;
    }, {});
  };
});

const { isProfane } = require('../../services/profanityFilterService');
const { createSession } = require('../../utilities/sessionUtils');
const authRoutes = require('../../routes/authRoutes');

describe('auth route outcome tests', () => {
  let mongo;
  let app;
  let User;
  let OrgInvite;

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';
    process.env.JWT_REFRESH_SECRET =
      process.env.JWT_REFRESH_SECRET || 'test-jwt-refresh-secret';

    mongo = await createMongoMemoryConnection();
    User = getOrCreateModel(mongo.connection, 'User', userSchema, 'users');
    OrgInvite = getOrCreateModel(
      mongo.connection,
      'OrgInvite',
      orgInviteSchema,
      'orgInvites'
    );

    app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use((req, _res, next) => {
      req.db = mongo.connection;
      req.school = 'rpi';
      next();
    });
    app.use(authRoutes);
  });

  afterEach(async () => {
    jest.clearAllMocks();
    await mongo.reset();
  });

  afterAll(async () => {
    await mongo.cleanup();
  });

  test('POST /register creates a user and returns auth cookies', async () => {
    const payload = {
      username: 'RouteUser123',
      email: 'route.user@example.com',
      password: 'password123',
    };

    const response = await request(app).post('/register').send(payload);

    expect(response.statusCode).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.user.email).toBe(payload.email);
    expect(response.headers['set-cookie']).toEqual(
      expect.arrayContaining([
        expect.stringContaining('accessToken='),
        expect.stringContaining('refreshToken='),
      ])
    );
    expect(createSession).toHaveBeenCalledTimes(1);

    const savedUser = await User.findOne({ email: payload.email }).lean();
    expect(savedUser).toBeTruthy();
    expect(savedUser.password).not.toBe(payload.password);
    expect(savedUser.password.startsWith('$2')).toBe(true);
  });

  test('POST /register rejects duplicate email with explicit message', async () => {
    await new User({
      username: 'ExistingUser',
      email: 'existing@example.com',
      password: 'password123',
    }).save();

    const response = await request(app).post('/register').send({
      username: 'AnotherUser',
      email: 'existing@example.com',
      password: 'password123',
    });

    expect(response.statusCode).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toBe('Email is taken');
  });

  test('POST /register rejects profane usernames', async () => {
    isProfane.mockReturnValue(true);

    const response = await request(app).post('/register').send({
      username: 'BadWordUser',
      email: 'clean@example.com',
      password: 'password123',
    });

    expect(response.statusCode).toBe(405);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toBe('Username does not abide by community standards');
  });

  test('POST /register enforces invite email match when invite token exists', async () => {
    await new OrgInvite({
      org_id: '507f1f77bcf86cd799439011',
      email: 'invite-only@example.com',
      invited_by: '507f1f77bcf86cd799439012',
      role: 'member',
      token: 'invite-token-1',
      expires_at: new Date(Date.now() + 60 * 60 * 1000),
      status: 'pending',
    }).save();

    const response = await request(app).post('/register').send({
      username: 'InviteMismatchUser',
      email: 'different@example.com',
      password: 'password123',
      invite_token: 'invite-token-1',
    });

    expect(response.statusCode).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.code).toBe('INVITE_EMAIL_MISMATCH');
  });
});
