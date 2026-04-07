/** Mirrors backend DEFAULT_TASK_BOARD_STATUSES when API is unavailable */
export const DEFAULT_TASK_BOARD_STATUSES = [
    { key: 'todo', label: 'To do', category: 'backlog', order: 0 },
    { key: 'in_progress', label: 'In progress', category: 'active', order: 1 },
    { key: 'done', label: 'Done', category: 'done', order: 2 }
];

export function pickFirstBacklogKey(statuses) {
    const row = (statuses || []).find((s) => s.category === 'backlog');
    return row?.key || (statuses && statuses[0]?.key) || 'todo';
}

export function pickFirstActiveKey(statuses) {
    const row = (statuses || []).find((s) => s.category === 'active');
    return row?.key || 'in_progress';
}

export function pickFirstDoneKey(statuses) {
    const row = (statuses || []).find((s) => s.category === 'done');
    return row?.key || 'done';
}

export function formatTaskStatusLabel(statusKey, statuses, options = {}) {
    const { effectiveBlocked } = options;
    if (effectiveBlocked || statusKey === 'blocked') return 'Blocked';
    const row = (statuses || []).find((s) => s.key === statusKey);
    if (row) return row.label;
    return String(statusKey || '')
        .split('_')
        .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
        .join(' ');
}

export function slugTaskStatusKey(label, existingKeys) {
    let base = String(label || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 30);
    if (!base) base = 'column';
    if (!/^[a-z]/.test(base)) base = `c_${base}`;
    const set = new Set(existingKeys);
    let key = base;
    let n = 2;
    while (set.has(key)) {
        const suffix = `_${n++}`;
        key = (base + suffix).slice(0, 40);
    }
    return key.slice(0, 40);
}
