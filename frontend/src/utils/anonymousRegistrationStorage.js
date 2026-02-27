const STORAGE_KEY = 'meridian-anonymous-registrations';
const STORAGE_VERSION = 1;

/**
 * Normalize email for consistent storage and API verification (trim + lowercase).
 * @param {string} email
 * @returns {string}
 */
function normalizeEmail(email) {
    return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

/**
 * Get all anonymous registrations from localStorage.
 * Migrates old entries to current version and normalizes email.
 * @returns {{ [eventId: string]: { guestName: string, guestEmail: string, registeredAt: string, _v?: number } }}
 */
function getStoredRegistrations() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        const result = {};
        for (const [eventId, entry] of Object.entries(parsed)) {
            if (!entry || typeof entry !== 'object') continue;
            const guestEmail = normalizeEmail(entry.guestEmail || '');
            result[eventId] = {
                guestName: typeof entry.guestName === 'string' ? entry.guestName.trim() : '',
                guestEmail,
                registeredAt: typeof entry.registeredAt === 'string' ? entry.registeredAt : new Date().toISOString(),
                _v: STORAGE_VERSION
            };
        }
        return result;
    } catch {
        return {};
    }
}

/**
 * Save all anonymous registrations to localStorage.
 * @param {Object} registrations
 */
function setStoredRegistrations(registrations) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(registrations));
    } catch (e) {
        console.warn('Failed to save anonymous registration to localStorage:', e);
    }
}

/**
 * Check if the current browser has anonymously registered for an event.
 * (Use with verification on load so server-removed registrations are cleared.)
 * @param {string} eventId
 * @returns {boolean}
 */
export function hasAnonymousRegistration(eventId) {
    const registrations = getStoredRegistrations();
    return Boolean(registrations[eventId]);
}

/**
 * Get stored registration details for an event (if any).
 * @param {string} eventId
 * @returns {{ guestName: string, guestEmail: string, registeredAt: string } | null}
 */
export function getAnonymousRegistration(eventId) {
    const registrations = getStoredRegistrations();
    const entry = registrations[eventId];
    if (!entry) return null;
    return {
        guestName: entry.guestName,
        guestEmail: entry.guestEmail,
        registeredAt: entry.registeredAt
    };
}

/**
 * Save an anonymous registration to localStorage.
 * Email is normalized (trim + lowercase) for consistent server verification.
 * @param {string} eventId
 * @param {{ guestName: string, guestEmail: string }} details
 */
export function saveAnonymousRegistration(eventId, { guestName, guestEmail }) {
    const registrations = getStoredRegistrations();
    const normalized = normalizeEmail(guestEmail || '');
    registrations[eventId] = {
        guestName: (guestName || '').trim(),
        guestEmail: normalized,
        registeredAt: new Date().toISOString(),
        _v: STORAGE_VERSION
    };
    setStoredRegistrations(registrations);
}

/**
 * Get all anonymous registrations as an array for the claim API.
 * @returns {{ eventId: string, guestEmail: string }[]}
 */
export function getAllAnonymousRegistrations() {
    const stored = getStoredRegistrations();
    return Object.entries(stored).map(([eventId, entry]) => ({
        eventId,
        guestEmail: entry.guestEmail || ''
    })).filter(({ guestEmail }) => guestEmail !== '');
}

/**
 * Remove an anonymous registration (e.g. after server says it no longer exists).
 * @param {string} eventId
 */
export function removeAnonymousRegistration(eventId) {
    const registrations = getStoredRegistrations();
    delete registrations[eventId];
    setStoredRegistrations(registrations);
}
