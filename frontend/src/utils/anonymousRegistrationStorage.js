const STORAGE_KEY = 'meridian-anonymous-registrations';

/**
 * Get all anonymous registrations from localStorage.
 * @returns {{ [eventId: string]: { guestName: string, guestEmail: string, registeredAt: string } }}
 */
function getStoredRegistrations() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : {};
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
    return registrations[eventId] || null;
}

/**
 * Save an anonymous registration to localStorage to prevent double-registration.
 * @param {string} eventId
 * @param {{ guestName: string, guestEmail: string }} details
 */
export function saveAnonymousRegistration(eventId, { guestName, guestEmail }) {
    const registrations = getStoredRegistrations();
    registrations[eventId] = {
        guestName: guestName || '',
        guestEmail: guestEmail || '',
        registeredAt: new Date().toISOString()
    };
    setStoredRegistrations(registrations);
}

/**
 * Remove an anonymous registration (e.g. if user withdraws - would need backend support).
 * @param {string} eventId
 */
export function removeAnonymousRegistration(eventId) {
    const registrations = getStoredRegistrations();
    delete registrations[eventId];
    setStoredRegistrations(registrations);
}
