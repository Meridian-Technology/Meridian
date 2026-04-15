const MAX_TASK_BOARD_STATUSES = 10;

const DEFAULT_TASK_BOARD_STATUSES = [
    { key: 'todo', label: 'To do', category: 'backlog', order: 0 },
    { key: 'in_progress', label: 'In progress', category: 'active', order: 1 },
    { key: 'done', label: 'Done', category: 'done', order: 2 }
];

const LEGACY_STATUS_CATEGORY = {
    todo: 'backlog',
    in_progress: 'active',
    blocked: 'active',
    done: 'done',
    cancelled: 'cancelled'
};

function getResolvedTaskBoardStatuses(orgLike) {
    const raw = orgLike?.taskBoardStatuses;
    if (Array.isArray(raw) && raw.length > 0) {
        return raw
            .map((s, i) => ({
                key: String(s.key || '')
                    .toLowerCase()
                    .trim(),
                label: (String(s.label || s.key || '').trim() || s.key || '').slice(0, 64),
                category: s.category,
                order: Number.isFinite(s.order) ? s.order : i
            }))
            .filter(
                (s) =>
                    s.key &&
                    s.label &&
                    ['backlog', 'active', 'done', 'cancelled'].includes(s.category)
            )
            .sort((a, b) => a.order - b.order || a.key.localeCompare(b.key))
            .slice(0, MAX_TASK_BOARD_STATUSES);
    }
    return DEFAULT_TASK_BOARD_STATUSES.map((s) => ({ ...s }));
}

function getAllowedStatusKeys(statuses) {
    return new Set((statuses || []).map((s) => s.key));
}

function resolveStatusCategory(taskStatus, statuses) {
    const key = String(taskStatus || '').toLowerCase();
    const row = (statuses || []).find((s) => s.key === key);
    if (row) return row.category;
    return LEGACY_STATUS_CATEGORY[key] || 'backlog';
}

function pickDefaultOpenKey(statuses) {
    const cfg = statuses || DEFAULT_TASK_BOARD_STATUSES;
    const b = cfg.find((s) => s.category === 'backlog');
    if (b) return b.key;
    const a = cfg.find((s) => s.category === 'active');
    return a?.key || 'todo';
}

function pickDefaultActiveKey(statuses) {
    const cfg = statuses || DEFAULT_TASK_BOARD_STATUSES;
    const a = cfg.find((s) => s.category === 'active');
    return a?.key || 'in_progress';
}

function pickFirstDoneKey(statuses) {
    const cfg = statuses || DEFAULT_TASK_BOARD_STATUSES;
    const d = cfg.find((s) => s.category === 'done');
    return d?.key || 'done';
}

function normalizeTaskStatusForOrg(status, statuses) {
    const cfg = statuses || DEFAULT_TASK_BOARD_STATUSES;
    const allowed = getAllowedStatusKeys(cfg);
    const normalized = String(status || '').toLowerCase();
    if (normalized === 'blocked') {
        return pickDefaultActiveKey(cfg);
    }
    if (allowed.has(normalized)) return normalized;
    return pickDefaultOpenKey(cfg);
}

const KEY_REGEX = /^[a-z][a-z0-9_]{0,39}$/;

function validateTaskBoardStatusesPayload(statuses) {
    if (!Array.isArray(statuses)) {
        return { error: 'statuses must be an array' };
    }
    if (statuses.length < 1 || statuses.length > MAX_TASK_BOARD_STATUSES) {
        return { error: `Provide between 1 and ${MAX_TASK_BOARD_STATUSES} columns` };
    }
    const seen = new Set();
    let hasDone = false;
    let hasOpen = false;
    const value = [];
    for (let i = 0; i < statuses.length; i += 1) {
        const s = statuses[i] || {};
        const key = String(s.key || '')
            .toLowerCase()
            .trim();
        const label = String(s.label || '').trim();
        const category = s.category;
        if (!KEY_REGEX.test(key)) {
            return { error: `Invalid key "${key}" (use lowercase letters, numbers, underscores; max 40 chars)` };
        }
        if (seen.has(key)) {
            return { error: `Duplicate key: ${key}` };
        }
        seen.add(key);
        if (!label || label.length > 64) {
            return { error: 'Each column needs a label (1–64 characters)' };
        }
        if (!['backlog', 'active', 'done', 'cancelled'].includes(category)) {
            return { error: 'Invalid category' };
        }
        if (category === 'done') hasDone = true;
        if (category === 'backlog' || category === 'active') hasOpen = true;
        value.push({ key, label, category, order: i });
    }
    if (!hasDone) {
        return { error: 'At least one column must have category "done"' };
    }
    if (!hasOpen) {
        return { error: 'At least one column must be backlog or active' };
    }
    return { value };
}

module.exports = {
    MAX_TASK_BOARD_STATUSES,
    DEFAULT_TASK_BOARD_STATUSES,
    getResolvedTaskBoardStatuses,
    getAllowedStatusKeys,
    resolveStatusCategory,
    pickDefaultOpenKey,
    pickDefaultActiveKey,
    pickFirstDoneKey,
    normalizeTaskStatusForOrg,
    validateTaskBoardStatusesPayload
};
