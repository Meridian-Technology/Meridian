const express = require('express');
const http = require('http');
const request = require('supertest');

const { loopbackUrl } = require('../helpers/supertestLoopback');

describe('supertest test servers', () => {
  const servers = [];

  async function listen(server, options) {
    servers.push(server);
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(options, () => {
        server.removeListener('error', reject);
        resolve();
      });
    });
    return server;
  }

  afterEach(async () => {
    await Promise.all(servers.splice(0).map(server => new Promise((resolve, reject) => {
      if (!server.listening) return resolve();
      server.close(error => error ? reject(error) : resolve());
      server.closeAllConnections();
    })));
  });

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

  it('reaches the test app when another IPv4 server on its port returns 401', async () => {
    const app = express();
    app.get('/', (_req, res) => res.status(201).send('test app'));
    const server = await listen(http.createServer(app), { host: '::', port: 0, ipv6Only: true });
    const other = express();
    other.get('/', (_req, res) => res.status(401).send('other listener'));
    const ipv4 = await listen(http.createServer(other), { host: '127.0.0.1', port: server.address().port });

    // Demonstrate the wrong address produces the unexpected authentication error.
    const wrong = await request(ipv4).get('/');
    expect(wrong.status).toBe(401);
    expect(wrong.text).toBe('other listener');
    const response = await request(server).get('/');
    expect(response.status).toBe(201);
    expect(response.text).toBe('test app');
  });

  it('reaches a server bound explicitly to IPv6 loopback', async () => {
    const app = express();
    app.get('/', (_req, res) => res.status(201).send('IPv6 app'));
    const server = await listen(http.createServer(app), { host: '::1', port: 0, ipv6Only: true });
    const response = await request(server).get('/');
    expect(response.status).toBe(201);
    expect(response.text).toBe('IPv6 app');
  });
});
