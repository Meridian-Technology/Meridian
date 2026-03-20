const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const QRCode = require('qrcode');
const { generateSecret, generateURI, verify } = require('otplib');
const {
    generateRegistrationOptions,
    verifyRegistrationResponse,
    generateAuthenticationOptions,
    verifyAuthenticationResponse,
} = require('@simplewebauthn/server');
const { isoBase64URL } = require('@simplewebauthn/server/helpers');

const MFA_ISSUER = process.env.MFA_ISSUER || 'Meridian';
const MFA_PENDING_EXPIRY = '10m';
const MFA_PENDING_MAX_AGE_MS = 10 * 60 * 1000;
const CHALLENGE_MAX_AGE_MS = 5 * 60 * 1000;

const loginPasskeyChallenges = new Map();
const registrationPasskeyChallenges = new Map();

function getMfaJwtSecret() {
    return process.env.JWT_MFA_SECRET || process.env.JWT_SECRET;
}

function getMfaEncryptionKey() {
    const base = process.env.MFA_ENCRYPTION_KEY || process.env.JWT_SECRET || '';
    return crypto.createHash('sha256').update(base).digest();
}

function encryptSecret(plainText) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', getMfaEncryptionKey(), iv);
    const encrypted = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decryptSecret(payload) {
    if (!payload) return null;
    const [ivHex, tagHex, encryptedHex] = String(payload).split(':');
    if (!ivHex || !tagHex || !encryptedHex) return null;
    const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        getMfaEncryptionKey(),
        Buffer.from(ivHex, 'hex'),
    );
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    const decrypted = Buffer.concat([
        decipher.update(Buffer.from(encryptedHex, 'hex')),
        decipher.final(),
    ]);
    return decrypted.toString('utf8');
}

function isAdminLevelAccount(tenantUser, platformRoles = []) {
    const tenantRoles = Array.isArray(tenantUser?.roles) ? tenantUser.roles : [];
    const platform = Array.isArray(platformRoles) ? platformRoles : [];
    const tenantAdmin = tenantRoles.includes('admin') || tenantRoles.includes('root');
    const platformAdmin = platform.includes('platform_admin') || platform.includes('root');
    return tenantAdmin || platformAdmin;
}

function getConfiguredMethods(tenantUser) {
    const methods = [];
    if (tenantUser?.adminMfa?.totp?.enabled && tenantUser?.adminMfa?.totp?.secret) {
        methods.push('totp');
    }
    if (Array.isArray(tenantUser?.adminMfa?.passkeys) && tenantUser.adminMfa.passkeys.length > 0) {
        methods.push('passkey');
    }
    return methods;
}

function getMfaStatus(tenantUser) {
    const methods = getConfiguredMethods(tenantUser);
    return {
        configured: methods.length > 0,
        methods,
        totpEnabled: methods.includes('totp'),
        passkeyCount: Array.isArray(tenantUser?.adminMfa?.passkeys) ? tenantUser.adminMfa.passkeys.length : 0,
    };
}

function buildTokenMfaClaims({ isAdminLevel, mfaConfigured, mfaVerified }) {
    if (!isAdminLevel) {
        return {
            mfaConfigured: false,
            mfaVerified: true,
        };
    }
    return {
        mfaConfigured: Boolean(mfaConfigured),
        mfaVerified: Boolean(mfaVerified),
    };
}

function normalizeTotpCode(code) {
    return String(code || '').replace(/\s+/g, '');
}

function getRequestOrigin(req) {
    const protoHeader = req.headers['x-forwarded-proto'];
    const proto = protoHeader ? String(protoHeader).split(',')[0].trim() : req.protocol;
    return `${proto}://${req.get('host')}`;
}

function getRpID(req) {
    if (process.env.PASSKEY_RP_ID) {
        return process.env.PASSKEY_RP_ID;
    }
    const host = req.get('host') || '';
    return host.split(':')[0];
}

function getExpectedOrigins(req) {
    const configured = (process.env.PASSKEY_EXPECTED_ORIGINS || '')
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean);
    const requestOrigin = getRequestOrigin(req);
    if (!configured.includes(requestOrigin)) {
        configured.push(requestOrigin);
    }
    return configured;
}

function cleanupExpiredChallenges(store) {
    const now = Date.now();
    for (const [key, value] of store.entries()) {
        if (!value || value.expiresAt <= now) {
            store.delete(key);
        }
    }
}

function setChallenge(store, key, challenge) {
    cleanupExpiredChallenges(store);
    store.set(key, {
        challenge,
        expiresAt: Date.now() + CHALLENGE_MAX_AGE_MS,
    });
}

function consumeChallenge(store, key) {
    cleanupExpiredChallenges(store);
    const entry = store.get(key);
    store.delete(key);
    if (!entry) return null;
    return entry.challenge;
}

function createPendingMfaToken(payload) {
    return jwt.sign(payload, getMfaJwtSecret(), { expiresIn: MFA_PENDING_EXPIRY });
}

function verifyPendingMfaToken(token) {
    return jwt.verify(token, getMfaJwtSecret());
}

function getMfaPendingCookieOptions(req) {
    const { getCookieDomain } = require('../utilities/cookieUtils');
    const opts = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
        maxAge: MFA_PENDING_MAX_AGE_MS,
    };
    const domain = getCookieDomain(req);
    if (domain) opts.domain = domain;
    return opts;
}

function getPendingMfaTokenFromRequest(req) {
    return req.body?.mfaToken || req.cookies?.adminMfaPending || null;
}

function getPasskeySummary(tenantUser) {
    const passkeys = Array.isArray(tenantUser?.adminMfa?.passkeys) ? tenantUser.adminMfa.passkeys : [];
    return passkeys.map((p) => ({
        id: p.id,
        nickname: p.nickname || null,
        deviceType: p.deviceType || null,
        backedUp: Boolean(p.backedUp),
        createdAt: p.createdAt,
        lastUsedAt: p.lastUsedAt || null,
    }));
}

async function createTotpEnrollment(tenantUser) {
    const secret = generateSecret();
    const encryptedSecret = encryptSecret(secret);
    const label = tenantUser.email || tenantUser.username || String(tenantUser._id);
    const otpauthUrl = generateURI({
        secret,
        issuer: MFA_ISSUER,
        label,
    });
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

    if (!tenantUser.adminMfa) tenantUser.adminMfa = {};
    if (!tenantUser.adminMfa.totp) tenantUser.adminMfa.totp = {};
    tenantUser.adminMfa.totp.pendingSecret = encryptedSecret;
    tenantUser.adminMfa.totp.enabled = false;
    await tenantUser.save();

    return {
        otpauthUrl,
        qrCodeDataUrl,
    };
}

async function enableTotpEnrollment(tenantUser, code) {
    const encryptedSecret = tenantUser?.adminMfa?.totp?.pendingSecret;
    if (!encryptedSecret) {
        throw new Error('No pending authenticator setup was found');
    }
    const secret = decryptSecret(encryptedSecret);
    const normalizedCode = normalizeTotpCode(code);
    const result = await verify({ token: normalizedCode, secret, window: 1 });
    const valid = Boolean(result?.valid);
    if (!valid) {
        throw new Error('Invalid authenticator code');
    }

    tenantUser.adminMfa.totp.secret = encryptedSecret;
    tenantUser.adminMfa.totp.pendingSecret = null;
    tenantUser.adminMfa.totp.enabled = true;
    tenantUser.adminMfa.totp.enabledAt = new Date();
    tenantUser.adminMfa.totp.lastUsedAt = new Date();
    await tenantUser.save();
}

async function verifyTotpForLogin(tenantUser, code) {
    const encryptedSecret = tenantUser?.adminMfa?.totp?.secret;
    if (!encryptedSecret || !tenantUser?.adminMfa?.totp?.enabled) {
        return false;
    }
    const secret = decryptSecret(encryptedSecret);
    const result = await verify({
        token: normalizeTotpCode(code),
        secret,
        window: 1,
    });
    const valid = Boolean(result?.valid);
    if (valid) {
        tenantUser.adminMfa.totp.lastUsedAt = new Date();
        await tenantUser.save();
    }
    return valid;
}

async function disableTotp(tenantUser, code) {
    const valid = await verifyTotpForLogin(tenantUser, code);
    if (!valid) {
        throw new Error('Invalid authenticator code');
    }
    tenantUser.adminMfa.totp.enabled = false;
    tenantUser.adminMfa.totp.secret = null;
    tenantUser.adminMfa.totp.pendingSecret = null;
    await tenantUser.save();
}

function getRegistrationChallengeKey(req, tenantUser) {
    return `${req.school}:${tenantUser._id.toString()}`;
}

async function generatePasskeyRegistration(req, tenantUser) {
    const existingPasskeys = Array.isArray(tenantUser?.adminMfa?.passkeys) ? tenantUser.adminMfa.passkeys : [];
    const rpID = getRpID(req);
    const options = await generateRegistrationOptions({
        rpName: process.env.PASSKEY_RP_NAME || 'Meridian',
        rpID,
        userName: tenantUser.email || tenantUser.username || `user-${tenantUser._id}`,
        userID: Uint8Array.from(Buffer.from(tenantUser._id.toString(), 'utf8')),
        userDisplayName: tenantUser.name || tenantUser.username || tenantUser.email || 'Meridian Admin',
        attestationType: 'none',
        timeout: 60000,
        authenticatorSelection: {
            residentKey: 'preferred',
            userVerification: 'required',
        },
        excludeCredentials: existingPasskeys.map((passkey) => ({
            id: passkey.id,
            transports: passkey.transports || [],
        })),
        supportedAlgorithmIDs: [-7, -257],
    });

    setChallenge(registrationPasskeyChallenges, getRegistrationChallengeKey(req, tenantUser), options.challenge);
    return options;
}

async function verifyPasskeyRegistration(req, tenantUser, response, nickname) {
    const expectedChallenge = consumeChallenge(registrationPasskeyChallenges, getRegistrationChallengeKey(req, tenantUser));
    if (!expectedChallenge) {
        throw new Error('Passkey registration challenge expired. Please try again.');
    }

    const verification = await verifyRegistrationResponse({
        response,
        expectedChallenge,
        expectedOrigin: getExpectedOrigins(req),
        expectedRPID: getRpID(req),
        requireUserVerification: true,
    });

    if (!verification.verified || !verification.registrationInfo) {
        throw new Error('Could not verify passkey registration');
    }

    const credential = verification.registrationInfo.credential;
    if (!tenantUser.adminMfa) tenantUser.adminMfa = {};
    if (!Array.isArray(tenantUser.adminMfa.passkeys)) tenantUser.adminMfa.passkeys = [];

    const existingIndex = tenantUser.adminMfa.passkeys.findIndex((item) => item.id === credential.id);
    const entry = {
        id: credential.id,
        publicKey: isoBase64URL.fromBuffer(credential.publicKey),
        counter: credential.counter,
        transports: (response?.response?.transports || []).filter(Boolean),
        deviceType: verification.registrationInfo.credentialDeviceType,
        backedUp: verification.registrationInfo.credentialBackedUp,
        nickname: nickname ? String(nickname).trim() : null,
        createdAt: new Date(),
    };

    if (existingIndex >= 0) {
        tenantUser.adminMfa.passkeys[existingIndex] = {
            ...tenantUser.adminMfa.passkeys[existingIndex].toObject?.(),
            ...entry,
        };
    } else {
        tenantUser.adminMfa.passkeys.push(entry);
    }

    await tenantUser.save();
}

async function generatePasskeyAuthentication(req, tenantUser, pendingMfaToken) {
    const passkeys = Array.isArray(tenantUser?.adminMfa?.passkeys) ? tenantUser.adminMfa.passkeys : [];
    if (!passkeys.length) {
        throw new Error('No passkeys configured for this admin account');
    }

    const options = await generateAuthenticationOptions({
        rpID: getRpID(req),
        timeout: 60000,
        userVerification: 'required',
        allowCredentials: passkeys.map((passkey) => ({
            id: passkey.id,
            transports: passkey.transports || [],
        })),
    });

    setChallenge(loginPasskeyChallenges, pendingMfaToken, options.challenge);
    return options;
}

async function verifyPasskeyAuthentication(req, tenantUser, pendingMfaToken, response) {
    const expectedChallenge = consumeChallenge(loginPasskeyChallenges, pendingMfaToken);
    if (!expectedChallenge) {
        throw new Error('Passkey challenge expired. Please try again.');
    }

    const passkeys = Array.isArray(tenantUser?.adminMfa?.passkeys) ? tenantUser.adminMfa.passkeys : [];
    const stored = passkeys.find((passkey) => passkey.id === response?.id);
    if (!stored) {
        throw new Error('Passkey not recognized for this admin account');
    }

    const verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge,
        expectedOrigin: getExpectedOrigins(req),
        expectedRPID: getRpID(req),
        credential: {
            id: stored.id,
            publicKey: isoBase64URL.toBuffer(stored.publicKey),
            counter: stored.counter || 0,
            transports: stored.transports || [],
        },
        requireUserVerification: true,
    });

    if (!verification.verified) {
        throw new Error('Passkey authentication failed');
    }

    stored.counter = verification.authenticationInfo.newCounter;
    stored.deviceType = verification.authenticationInfo.credentialDeviceType;
    stored.backedUp = verification.authenticationInfo.credentialBackedUp;
    stored.lastUsedAt = new Date();
    await tenantUser.save();
}

async function removePasskey(tenantUser, credentialId) {
    const before = Array.isArray(tenantUser?.adminMfa?.passkeys) ? tenantUser.adminMfa.passkeys.length : 0;
    tenantUser.adminMfa.passkeys = (tenantUser.adminMfa.passkeys || []).filter((item) => item.id !== credentialId);
    const removed = before !== tenantUser.adminMfa.passkeys.length;
    if (removed) {
        await tenantUser.save();
    }
    return removed;
}

module.exports = {
    MFA_PENDING_MAX_AGE_MS,
    isAdminLevelAccount,
    getConfiguredMethods,
    getMfaStatus,
    buildTokenMfaClaims,
    createPendingMfaToken,
    verifyPendingMfaToken,
    getMfaPendingCookieOptions,
    getPendingMfaTokenFromRequest,
    createTotpEnrollment,
    enableTotpEnrollment,
    verifyTotpForLogin,
    disableTotp,
    getPasskeySummary,
    generatePasskeyRegistration,
    verifyPasskeyRegistration,
    generatePasskeyAuthentication,
    verifyPasskeyAuthentication,
    removePasskey,
};
