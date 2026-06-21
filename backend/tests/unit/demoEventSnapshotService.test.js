const {
    applyPhaseToTasks,
    applyPhaseToAgenda,
    applyPhaseToAttendees,
    applyPhaseToRegistrationStats,
    summarizeTasks,
    LIVE_AGENDA_ITEM_INDEX,
} = require('../../services/demoEventSnapshotService');

describe('demoEventSnapshotService', () => {
    const sampleTasks = [
        { title: 'Finalize run-of-show', status: 'done', dueRule: { anchorType: 'event_start', direction: 'before' } },
        { title: 'Send reminder announcement', status: 'in_progress', dueRule: { anchorType: 'event_start', direction: 'before' } },
        { title: 'Send thank-you to volunteers', status: 'todo', dueRule: { anchorType: 'event_end', direction: 'after' } },
    ];

    const sampleAgenda = {
        items: [
            { id: 'agenda-1', title: 'Doors open' },
            { id: 'agenda-2', title: 'Welcome' },
            { id: 'agenda-3', title: 'Spotlight' },
            { id: 'agenda-4', title: 'Community spotlight' },
            { id: 'agenda-5', title: 'Break' },
        ],
        isPublished: true,
    };

    test('planning phase keeps pre-event tasks open', () => {
        const tasks = applyPhaseToTasks(sampleTasks, 'planning');
        expect(tasks.find((task) => task.title.includes('Finalize')).status).toBe('done');
        expect(tasks.find((task) => task.title.includes('reminder')).status).toBe('in_progress');
        expect(tasks.filter((task) => task.status === 'todo').length).toBeGreaterThan(0);
    });

    test('runOfShow phase completes pre-event tasks', () => {
        const tasks = applyPhaseToTasks(sampleTasks, 'runOfShow');
        expect(tasks.every((task) => task.dueRule.direction === 'before' ? task.status === 'done' : true)).toBe(true);
    });

    test('postMortem phase opens retro tasks', () => {
        const tasks = applyPhaseToTasks(sampleTasks, 'postMortem');
        expect(tasks.find((task) => task.title.includes('thank-you')).status).toBe('in_progress');
    });

    test('runOfShow marks live agenda item', () => {
        const agenda = applyPhaseToAgenda(sampleAgenda, 'runOfShow');
        expect(agenda.liveItemId).toBe(`agenda-${LIVE_AGENDA_ITEM_INDEX + 1}`);
        expect(agenda.items[LIVE_AGENDA_ITEM_INDEX].isLive).toBe(true);
        expect(agenda.items[0].isPast).toBe(true);
    });

    test('planning phase clears check-ins', () => {
        const attendees = applyPhaseToAttendees([
            { guestName: 'A', checkedIn: true },
            { guestName: 'B', checkedIn: true },
        ], 'planning');
        expect(attendees.every((row) => !row.checkedIn)).toBe(true);
    });

    test('planning registration stats are lower than full count', () => {
        expect(applyPhaseToRegistrationStats(100, 'planning')).toBe(88);
        expect(applyPhaseToRegistrationStats(100, 'runOfShow')).toBe(100);
    });

    test('summarizeTasks counts open work', () => {
        const summary = summarizeTasks(applyPhaseToTasks(sampleTasks, 'planning'));
        expect(summary.total).toBe(3);
        expect(summary.open).toBeGreaterThan(0);
    });
});
