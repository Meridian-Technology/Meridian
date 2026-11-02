const express = require('express');
const request = require('supertest');

const { loopbackUrl } = require('../helpers/supertestLoopback');

describe('supertest test servers', () => {
  it('request an IPv6 test server over ::1, not 127.0.0.1', async () => {
    const app = express();
    app.get('/', (_req, res) => res.status(201).send('test app'));
    const test = request(app).get('/');
    expect(test.url).toMatch(/^http:\/\/\[::1\]:\d+\/$/);
    const response = await test;
    expect(response.status).toBe(201);
    expect(response.text).toBe('test app');
  });

  it('keep 127.0.0.1 for a server bound to IPv4 only', () => {
    expect(loopbackUrl('http://127.0.0.1:5001/x', '0.0.0.0')).toBe('http://127.0.0.1:5001/x');
    expect(loopbackUrl('http://127.0.0.1:5001/x', '127.0.0.1')).toBe('http://127.0.0.1:5001/x');
    expect(loopbackUrl('http://127.0.0.1:5001/x', '::')).toBe('http://[::1]:5001/x');
  });
});
