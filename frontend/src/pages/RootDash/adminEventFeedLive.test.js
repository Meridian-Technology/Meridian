import {
    adminEventLocationLabel,
    formatAdminEventTimeRemaining,
    isAdminEventCurrentlyLive,
} from './adminEventFeedLive';

describe('adminEventFeedLive', () => {
    it('isAdminEventCurrentlyLive is true inside [start, end]', () => {
        const start = new Date('2026-06-01T12:00:00Z');
        const end = new Date('2026-06-01T14:00:00Z');
        const now = new Date('2026-06-01T13:00:00Z');
        expect(isAdminEventCurrentlyLive(start, end, now)).toBe(true);
    });

    it('isAdminEventCurrentlyLive is false before start or after end', () => {
        const start = new Date('2026-06-01T12:00:00Z');
        const end = new Date('2026-06-01T14:00:00Z');
        expect(isAdminEventCurrentlyLive(start, end, new Date('2026-06-01T11:59:59Z'))).toBe(false);
        expect(isAdminEventCurrentlyLive(start, end, new Date('2026-06-01T14:00:01Z'))).toBe(false);
    });

    it('formatAdminEventTimeRemaining uses minutes under an hour', () => {
        const end = new Date('2026-06-01T14:00:00Z');
        const now = new Date('2026-06-01T13:30:00Z');
        expect(formatAdminEventTimeRemaining(end, now)).toBe('Ends in 30 min');
    });

    it('adminEventLocationLabel flattens common object shapes', () => {
        expect(adminEventLocationLabel(' Room A ')).toBe('Room A');
        expect(adminEventLocationLabel({ name: 'Hall', city: 'Boston' })).toBe('Hall, Boston');
    });
});
