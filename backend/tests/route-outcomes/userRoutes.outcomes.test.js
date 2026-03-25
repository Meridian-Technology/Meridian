const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const request = require('supertest');

const userSchema = require('../../schemas/user');
const { createMongoMemoryConnection, getOrCreateModel } = require('../helpers/mongoMemory');

jest.mock('../../services/profanityFilterService', () => ({
  isProfane: jest.fn(() => false),
}));

jest.mock('../../services/getModelService.js', () => {
  return (req, ...names) => {
    const models = {
      User: getOrCreateModel(req.db, 'User', userSchema, 'users'),
    };

    return names.reduce((acc, name) => {
      if (models[name]) acc[name] = models[name];
      return acc;
    }, {});
  };
});

const userRoutes = require('../../routes/userRoutes');

describe('user route outcome tests', () => {
  let mongo;
  let app;
  let User;

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';

    mongo = await createMongoMemoryConnection();
    User = getOrCreateModel(mongo.connection, 'User', userSchema, 'users');

    app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use((req, _res, next) => {
      req.db = mongo.connection;
      req.school = 'rpi';
      next();
    });
    app.use(userRoutes);
  });

  afterEach(async () => {
    jest.clearAllMocks();
    await mongo.reset();
  });

  afterAll(async () => {
    await mongo.cleanup();
  });

  test('POST /check-username returns taken when another user already has it', async () => {
    const requester = await new User({
      username: 'RequesterUser',
      email: 'requester@example.com',
      password: 'password123',
    }).save();

    await new User({
      username: 'TakenName',
      email: 'taken@example.com',
      password: 'password123',
    }).save();

    const accessToken = jwt.sign(
      { userId: requester._id.toString(), roles: ['user'] },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    const response = await request(app)
      .post('/check-username')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ username: 'TakenName' });

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toBe('Username is taken');
  });

  test('POST /check-username returns available for unused username', async () => {
    const requester = await new User({
      username: 'RequesterUser2',
      email: 'requester2@example.com',
      password: 'password123',
    }).save();

    const accessToken = jwt.sign(
      { userId: requester._id.toString(), roles: ['user'] },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    const response = await request(app)
      .post('/check-username')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ username: 'FreshName' });

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.message).toBe('Username is available');
  });
});
