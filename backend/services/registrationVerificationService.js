/**
 * Email verification for sign-ups whose email already belongs to a GlobalUser.
 *
 * /register links a new tenant account to the GlobalUser with the same email,
 * so registering someone else's email used to hand over their identity on every
 * tenant. The sign-up now waits until a code sent to that address is entered.
 * Platform-admin identities never get a self-serve code: it goes to the platform
 * approver instead.
 */

const crypto = require('crypto');
const bcrypt = require('bcrypt');
const getGlobalModels = require('./getGlobalModelService');
const { getResend } = require('./resendClient');

const PLATFORM_ADMIN_VERIFICATION_EMAIL =
    process.env.PLATFORM_ADMIN_VERIFICATION_EMAIL || 'james@meridian.study';
const CODE_TTL_MS = 15 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function hashCode(code) {
    return crypto.createHash('sha256').update(String(code)).digest('hex');
}

function codesMatch(code, codeHash) {
    const given = Buffer.from(hashCode(code), 'hex');
    const stored = Buffer.from(String(codeHash || ''), 'hex');
    return given.length === stored.length && crypto.timingSafeEqual(given, stored);
}

function maskEmail(email) {
    const [local, domain] = String(email).split('@');
    if (!domain) return '***';
    return `${local.slice(0, 1)}***@${domain}`;
}

async function isPlatformAdminIdentity(req, globalUserId) {
    const { PlatformRole } = getGlobalModels(req, 'PlatformRole');
    const pr = await PlatformRole.findOne({ globalUserId }).lean();
    const roles = pr?.roles || [];
    return roles.includes('platform_admin') || roles.includes('root');
}

function buildEmail({ deliveryRoute, code, email, username, tenantKey }) {
    if (deliveryRoute === 'platform_admin_approver') {
        return {
            to: PLATFORM_ADMIN_VERIFICATION_EMAIL,
            subject: `Approve sign-up for platform admin ${email}`,
            html: `
                <p>Someone is creating a <strong>${escapeHtml(tenantKey)}</strong> account
                with the email <strong>${escapeHtml(email)}</strong>, which belongs to a
                platform admin.</p>
                <p>Username: ${escapeHtml(username)}</p>
                <p>Anyone holding this code finishes the sign-up as that admin, so share it only
                after confirming who is asking. The code is:</p>
                <p style="font-size:24px;letter-spacing:4px;"><strong>${escapeHtml(code)}</strong></p>
                <p>If not, ignore this email. The sign-up expires in 15 minutes and no account is created.</p>
            `,
        };
    }
    return {
        to: email,
        subject: 'Confirm your Meridian email',
        html: `
            <p>Someone is creating a <strong>${escapeHtml(tenantKey)}</strong> account with this
            email address. Enter this code to finish signing up:</p>
            <p style="font-size:24px;letter-spacing:4px;"><strong>${escapeHtml(code)}</strong></p>
            <p>The code expires in 15 minutes. If this wasn't you, ignore this email and no account will be created.</p>
        `,
    };
}

/**
 * Hold a sign-up for an email that already has a GlobalUser and send its code.
 * Returns { status, body } for the route to send.
 */
async function startRegistrationVerification(req, { globalUser, email, username, password, inviteToken }) {
    const { PendingRegistration } = getGlobalModels(req, 'PendingRegistration');
    const tenantKey = String(req.school).trim().toLowerCase();
    const normalizedEmail = String(email).trim().toLowerCase();
    const now = Date.now();

    const existing = await PendingRegistration.findOne({ email: normalizedEmail, tenantKey });
    if (existing && now - existing.lastSentAt.getTime() < RESEND_COOLDOWN_MS) {
        return {
            status: 429,
            body: {
                success: false,
                code: 'VERIFICATION_RESEND_TOO_SOON',
                message: 'A code was just sent. Wait a minute before asking for another.',
            },
        };
    }

    const resend = getResend();
    if (!resend) {
        return { status: 503, body: { success: false, message: 'Email service not configured' } };
    }

    const deliveryRoute = (await isPlatformAdminIdentity(req, globalUser._id))
        ? 'platform_admin_approver'
        : 'account_email';
    const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    const verificationId = crypto.randomBytes(16).toString('hex');
    const passwordHash = await bcrypt.hash(String(password), 12);

    await PendingRegistration.findOneAndUpdate(
        { email: normalizedEmail, tenantKey },
        {
            $set: {
                verificationId,
                username,
                passwordHash,
                inviteToken: inviteToken || null,
                globalUserId: globalUser._id,
                deliveryRoute,
                codeHash: hashCode(code),
                attempts: 0,
                lastSentAt: new Date(now),
                expiresAt: new Date(now + CODE_TTL_MS),
            },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    const message = buildEmail({ deliveryRoute, code, email: normalizedEmail, username, tenantKey });
    const { error } = await resend.emails.send({
        from: 'Meridian Support <support@meridian.study>',
        to: [message.to],
        subject: message.subject,
        html: message.html,
    });
    if (error) {
        console.log('POST: /register verification email error', error);
        await PendingRegistration.deleteOne({ verificationId });
        return { status: 500, body: { success: false, message: 'Error sending verification email' } };
    }

    const isApprover = deliveryRoute === 'platform_admin_approver';
    return {
        status: 202,
        body: {
            success: false,
            code: 'EMAIL_VERIFICATION_REQUIRED',
            message: isApprover
                ? 'This email belongs to an administrator account. A Meridian administrator has to approve this sign-up and give you the code.'
                : `This email already has a Meridian account. We sent a code to ${maskEmail(normalizedEmail)} to confirm it's yours.`,
            data: {
                requiresEmailVerification: true,
                verificationId,
                sentTo: isApprover ? null : maskEmail(normalizedEmail),
                requiresAdminApproval: isApprover,
            },
        },
    };
}

/**
 * Check a code. Returns { pending } on success or { status, body } on failure.
 * The caller deletes the pending record once the account exists.
 */
async function checkRegistrationCode(req, { verificationId, code }) {
    const { PendingRegistration } = getGlobalModels(req, 'PendingRegistration');
    const invalid = {
        status: 400,
        body: { success: false, code: 'VERIFICATION_INVALID', message: 'That code is invalid or has expired. Start sign-up again.' },
    };
    if (typeof verificationId !== 'string' || typeof code !== 'string' || !/^\d{6}$/.test(code)) {
        return invalid;
    }

    // Count the attempt before comparing so parallel guesses can't exceed the cap.
    const pending = await PendingRegistration.findOneAndUpdate(
        { verificationId, attempts: { $lt: MAX_ATTEMPTS }, expiresAt: { $gt: new Date() } },
        { $inc: { attempts: 1 } },
        { new: true }
    );
    if (!pending) return invalid;

    if (!codesMatch(code, pending.codeHash)) {
        return {
            status: 400,
            body: {
                success: false,
                code: 'VERIFICATION_CODE_MISMATCH',
                message: pending.attempts >= MAX_ATTEMPTS
                    ? 'Too many incorrect codes. Start sign-up again.'
                    : 'Incorrect code. Please try again.',
            },
        };
    }
    return { pending };
}

module.exports = {
    PLATFORM_ADMIN_VERIFICATION_EMAIL,
    MAX_ATTEMPTS,
    startRegistrationVerification,
    checkRegistrationCode,
    maskEmail,
};
