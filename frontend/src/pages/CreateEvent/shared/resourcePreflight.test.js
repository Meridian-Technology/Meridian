const { extractResourceId, buildResourcePreflightPayload } = require('./resourcePreflight');

describe('resourcePreflight helpers', () => {
    test('extractResourceId prefers classroom_id then classroomId', () => {
        expect(extractResourceId({ classroom_id: 'a', classroomId: 'b' })).toBe('a');
        expect(extractResourceId({ classroomId: 'b' })).toBe('b');
        expect(extractResourceId({})).toBe(null);
    });

    test('buildResourcePreflightPayload maps to API keys', () => {
        const payload = buildResourcePreflightPayload({
            resourceId: 'r1',
            startTime: '2026-01-01T10:00:00.000Z',
            endTime: '2026-01-01T11:00:00.000Z',
            excludeEventId: 'e1'
        });
        expect(payload).toEqual({
            resourceId: 'r1',
            start_time: '2026-01-01T10:00:00.000Z',
            end_time: '2026-01-01T11:00:00.000Z',
            excludeEventId: 'e1'
        });
    });
});
