const STORAGE_KEY = 'meridian-agenda-view';

const MINUTE_HEIGHT_MAP = {
    compact: 1,
    normal: 3,
    expanded: 5
};

export function getStoredAgendaView() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            const parsed = JSON.parse(stored);
            return {
                viewMode: parsed.viewMode === 'creator' || parsed.viewMode === 'calendar' ? parsed.viewMode : 'creator',
                calendarMinuteHeight: ['compact', 'normal', 'expanded'].includes(parsed.calendarMinuteHeight)
                    ? parsed.calendarMinuteHeight
                    : 'normal'
            };
        }
    } catch {
        // ignore parse errors
    }
    return { viewMode: 'creator', calendarMinuteHeight: 'normal' };
}

export function getStoredMinuteHeightPx() {
    const { calendarMinuteHeight } = getStoredAgendaView();
    return MINUTE_HEIGHT_MAP[calendarMinuteHeight] ?? 3;
}
