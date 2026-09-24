const PREFIX = 'jg-curation-draft';

export function curationDraftStorageKey({ accountId, issueId, draftId }) {
  return `${PREFIX}:${accountId || 'account'}:${issueId || 'new'}:${draftId || 'open'}`;
}

export function writeCurationDraftLocal(key, payload) {
  if (typeof window === 'undefined' || !key) return;
  try {
    window.sessionStorage.setItem(key, JSON.stringify({
      ...payload,
      savedAt: new Date().toISOString(),
    }));
  } catch {
    // Private mode or a full quota must not block curation.
  }
}

export function readCurationDraftLocal(key) {
  if (typeof window === 'undefined' || !key) return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearCurationDraftLocal(key) {
  if (typeof window === 'undefined' || !key) return;
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export function shouldRecoverLocalDraft(local, server) {
  if (!local?.selected?.length) return false;
  if (!server) return true;
  if ((server.selected || []).length) return false;
  return new Date(local.savedAt).getTime() >= new Date(server.updatedAt || 0).getTime();
}
