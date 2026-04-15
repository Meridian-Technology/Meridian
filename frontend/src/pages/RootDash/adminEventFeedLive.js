/**
 * Helpers for admin event feed: in-progress ("live") window and copy.
 */

/**
 * @param {string|Date|undefined|null} start
 * @param {string|Date|undefined|null} end
 * @param {Date} [now]
 * @returns {boolean}
 */
export function isAdminEventCurrentlyLive(start, end, now = new Date()) {
    const s = start ? new Date(start) : null;
    const e = end ? new Date(end) : null;
    const t = now.getTime();
    if (!s || Number.isNaN(s.getTime()) || !e || Number.isNaN(e.getTime())) return false;
    if (e.getTime() < s.getTime()) return false;
    return t >= s.getTime() && t <= e.getTime();
}

/**
 * @param {string|Date|undefined|null} end
 * @param {Date} [now]
 * @returns {string|null}
 */
export function formatAdminEventTimeRemaining(end, now = new Date()) {
    const e = end ? new Date(end) : null;
    if (!e || Number.isNaN(e.getTime())) return null;
    const ms = e.getTime() - now.getTime();
    if (ms <= 0) return 'Ends momentarily';
    const mins = Math.max(1, Math.ceil(ms / 60000));
    if (mins < 60) return `Ends in ${mins} min`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h < 48) return m ? `Ends in ${h}h ${m}m` : `Ends in ${h}h`;
    const days = Math.floor(h / 24);
    const remH = h % 24;
    return remH ? `Ends in ${days}d ${remH}h` : `Ends in ${days}d`;
}

/**
 * @param {unknown} location
 * @returns {string|null}
 */
export function adminEventLocationLabel(location) {
    if (location == null) return null;
    if (typeof location === 'string') {
        const t = location.trim();
        return t || null;
    }
    if (typeof location === 'object') {
        const o = location;
        const parts = [o.name, o.address, o.line1, o.city, o.region, o.state, o.postalCode, o.zip]
            .filter((x) => typeof x === 'string' && x.trim())
            .map((x) => x.trim());
        if (parts.length) return [...new Set(parts)].join(', ');
    }
    return null;
}
