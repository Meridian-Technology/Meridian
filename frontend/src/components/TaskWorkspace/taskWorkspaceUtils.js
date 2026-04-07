import DOMPurify from 'dompurify';

const TASK_DESCRIPTION_ALLOWED_TAGS = ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 'ul', 'ol', 'li'];

function escapeHtml(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/** Sanitized HTML for task descriptions (bold, italic, underline, lists only). */
export function sanitizeTaskDescriptionHtml(html) {
    return DOMPurify.sanitize(html || '', {
        ALLOWED_TAGS: TASK_DESCRIPTION_ALLOWED_TAGS,
        ALLOWED_ATTR: []
    });
}

/**
 * Plain text or legacy HTML → safe HTML for the rich-text editor.
 * Plain text is wrapped in paragraphs; double newlines become new paragraphs.
 */
export function descriptionToEditorContent(raw) {
    if (raw == null || String(raw).trim() === '') return '';
    const s = String(raw);
    const trimmed = s.trim();
    if (/^<[a-z][a-z0-9]*/i.test(trimmed)) {
        return sanitizeTaskDescriptionHtml(s);
    }
    const blocks = s.split(/\n\n+/);
    const html = blocks
        .map((block) => {
            const inner = escapeHtml(block).replace(/\n/g, '<br>');
            return `<p>${inner}</p>`;
        })
        .join('');
    return sanitizeTaskDescriptionHtml(html);
}

/** After editing: sanitize and collapse visually-empty docs to ''. */
export function normalizeStoredTaskDescription(html) {
    const s = sanitizeTaskDescriptionHtml(html);
    const div = document.createElement('div');
    div.innerHTML = s;
    const text = (div.textContent || '').replace(/\u00a0/g, ' ').trim();
    return text ? s : '';
}

/** Strip tags for task card previews / search-friendly snippets. */
export function descriptionToPreviewPlain(htmlOrPlain) {
    if (htmlOrPlain == null || htmlOrPlain === '') return '';
    const str = String(htmlOrPlain);
    if (!str.includes('<')) return str;
    const clean = sanitizeTaskDescriptionHtml(str);
    const div = document.createElement('div');
    div.innerHTML = clean;
    return (div.textContent || '').replace(/\s+/g, ' ').trim();
}

export function userDisplayName(user) {
    if (!user) return '';
    return user.name || user.username || user.email || 'Member';
}

export function toDatetimeLocalValue(isoOrDate) {
    if (!isoOrDate) return '';
    const d = new Date(isoOrDate);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatTaskDueDisplay(dateLike) {
    if (!dateLike) return 'No due date';
    const d = new Date(dateLike);
    if (Number.isNaN(d.getTime())) return 'No due date';
    return d.toLocaleString();
}

/** Stable string id for Task.ownerUserId whether populated or raw ObjectId. */
export function taskOwnerUserIdString(task) {
    const o = task?.ownerUserId;
    if (o == null || o === '') return '';
    if (typeof o === 'object' && o._id) return String(o._id);
    return String(o);
}

export function buildTaskDraft(task, getTaskStatusFn) {
    return {
        title: task.title || '',
        description: task.description || '',
        status: getTaskStatusFn(task),
        priority: task.priority || 'medium',
        isCritical: Boolean(task.isCritical),
        ownerUserId: taskOwnerUserIdString(task),
        dueAt: toDatetimeLocalValue(task.dueAt)
    };
}

/** Shape compatible with populated Task.ownerUserId for list/card UI */
export function ownerUserFromMembers(members, userId) {
    if (!userId) return null;
    const id = String(userId);
    const list = members || [];
    for (let i = 0; i < list.length; i += 1) {
        const u = list[i]?.user_id;
        if (u && String(u._id) === id) {
            return {
                _id: u._id,
                name: u.name,
                username: u.username,
                picture: u.picture
            };
        }
    }
    return { _id: id };
}

export function memberUserInitials(user) {
    const name = userDisplayName(user);
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
        return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
    }
    return (name[0] || '?').toUpperCase();
}
