'use strict';

// supertest(app) starts each test server with app.listen(0), which binds every
// address, then requests http://127.0.0.1:<port>. macOS will hand that wildcard
// server a port another user's process holds on 127.0.0.1 alone (Tailscale's
// local API, for one), and the request reaches that process instead: a 401 in
// whichever test drew the port. Request an IPv6 server over ::1, which only the
// test server can own on that port.
const Test = require('supertest/lib/test');

const { serverAddress } = Test.prototype;

function loopbackUrl(url, address) {
  return address === '::' ? url.replace('://127.0.0.1:', '://[::1]:') : url;
}

Test.prototype.serverAddress = function serverAddressOnBoundLoopback(app, path) {
  const url = serverAddress.call(this, app, path);
  return loopbackUrl(url, app.address().address);
};

module.exports = { loopbackUrl };
