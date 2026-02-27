const { Resend } = require('resend');

let _client = null;

function getResend() {
  if (!process.env.RESEND_API_KEY) return null;
  if (!_client) _client = new Resend(process.env.RESEND_API_KEY);
  return _client;
}

module.exports = { getResend };
