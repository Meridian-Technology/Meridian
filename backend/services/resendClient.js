const { Resend } = require('resend');
const {
  STAGING_NOTICE,
  isStagingEnvironment,
  getPlatformAdminEmails,
} = require('../utilities/stagingEnvironment');

let _client = null;

function getResend() {
  if (!process.env.RESEND_API_KEY) return null;
  if (!_client) _client = new Resend(process.env.RESEND_API_KEY);
  return isStagingEnvironment() ? stagingResend(_client) : _client;
}

function addressOf(recipient) {
  const value = String(recipient || '').trim();
  const bracketed = value.match(/<([^>]+)>/);
  return (bracketed ? bracketed[1] : value).trim().toLowerCase();
}

function asList(value) {
  if (value == null || value === '') return [];
  return Array.isArray(value) ? value : [value];
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
}

function stagingBanner(withheld) {
  const note = withheld ? ` ${withheld} other recipient(s) on this message were withheld.` : '';
  return '<div style="padding:12px 16px;margin:0 0 16px;border:2px solid #d97706;border-radius:8px;'
    + 'background:#fffbeb;color:#92400e;font:14px/1.4 sans-serif;"><strong>Staging environment.</strong> '
    + `${escapeHtml(STAGING_NOTICE)}${escapeHtml(note)}</div>`;
}

/**
 * The only client staging code sees: it delivers to platform admins, drops every
 * other recipient, and marks what it sends. Anything but emails.send is absent,
 * so a new Resend call path fails closed on staging instead of reaching users.
 */
function stagingResend(client) {
  return {
    emails: {
      async send(payload = {}, options) {
        const admins = await getPlatformAdminEmails();
        const fields = ['to', 'cc', 'bcc'];
        const original = fields.reduce((count, field) => count + asList(payload[field]).length, 0);
        const filtered = {};
        for (const field of fields) {
          const kept = asList(payload[field]).filter((recipient) => admins.has(addressOf(recipient)));
          filtered[field] = kept.length ? kept : undefined;
        }
        const kept = fields.reduce((count, field) => count + (filtered[field]?.length || 0), 0);
        if (!filtered.to) {
          console.warn(`[staging] suppressed email "${payload.subject || ''}": no platform admin among ${original} recipient(s)`);
          return { data: { id: null, suppressedOnStaging: true }, error: null };
        }
        const withheld = original - kept;
        const message = {
          ...payload,
          ...filtered,
          subject: `[Staging] ${payload.subject || ''}`.trim(),
        };
        if (payload.html) message.html = `${stagingBanner(withheld)}${payload.html}`;
        if (payload.text || !payload.html) {
          const note = withheld ? ` ${withheld} other recipient(s) on this message were withheld.` : '';
          message.text = `${STAGING_NOTICE}${note}\n\n${payload.text || ''}`;
        }
        return client.emails.send(message, options);
      },
    },
  };
}

module.exports = { getResend };
