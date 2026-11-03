// User fields that are safe to return to anyone, including logged-out callers.
// Never add credentials, tokens, 2FA secrets or contact details here.
const PUBLIC_USER_FIELDS = ['name', 'username', 'picture', 'tags'];

module.exports = { PUBLIC_USER_FIELDS };
