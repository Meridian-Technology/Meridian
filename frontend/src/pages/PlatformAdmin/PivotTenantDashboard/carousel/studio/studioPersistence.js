/**
 * Autosave, local recovery, and export gating for the carousel studio.
 *
 * A local recovery draft is not a server save. Recovery keys include the
 * user, account, issue, and schema so a draft cannot open under another
 * identity. Writes are serialized by the editor; an older response never
 * replaces a newer local document.
 */

export const AUTOSAVE_DEBOUNCE_MS = 800;
export const RECOVERY_SCHEMA = 2;

export function recoveryStorageKey({ userId, accountId, issueId, schemaVersion }) {
  if (!userId || !accountId || !issueId || schemaVersion !== RECOVERY_SCHEMA) return null;
  return `jg-studio-recovery:${userId}:${accountId}:${issueId}:v${schemaVersion}`;
}

export function writeRecoveryDraft(storage, key, payload) {
  if (!storage || !key || !payload?.userId) return false;
  try {
    storage.setItem(key, JSON.stringify({ ...payload, savedAt: payload.savedAt || new Date().toISOString() }));
    return true;
  } catch {
    return false;
  }
}

export function readRecoveryDraft(storage, key) {
  if (!storage || !key) return null;
  try {
    const raw = storage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearRecoveryDraft(storage, key) {
  if (!storage || !key) return;
  try { storage.removeItem(key); } catch { /* quota or private mode */ }
}

function sameIdentity(local, server) {
  return Boolean(local?.userId)
    && local.userId === server?.userId
    && local.accountId === server?.accountId
    && local.issueId === server?.issueId
    && local.schemaVersion === server?.schemaVersion
    && local.schemaVersion === RECOVERY_SCHEMA;
}

export function shouldOfferRecovery(local, server) {
  if (!sameIdentity(local, server) || !local.document) return false;
  const localTime = Date.parse(local.savedAt || '');
  if (!Number.isFinite(localTime)) return false;
  const serverTime = Date.parse(server.updatedAt || '');
  const serverStamp = Number.isFinite(serverTime) ? serverTime : 0;
  if (localTime <= serverStamp) return false;
  const localBody = JSON.stringify({ document: local.document, editorial: local.editorial || null });
  const serverBody = JSON.stringify({ document: server.document, editorial: server.editorial || null });
  return localBody !== serverBody;
}

export function classifySaveResult(result, online = true) {
  if (!online || !result) return 'offline';
  if (!result.error) return 'saved';
  const status = Number(result.status ?? result.code);
  const code = result.errorCode || result.code;
  if (code === 'REVISION_CONFLICT' || status === 409) return 'conflict';
  if (result.offline || code === 'ERR_NETWORK' || /network error/i.test(String(result.error))) return 'offline';
  return 'failed';
}

/**
 * A successful write advances the revision the client will send next.
 * The document is replaced only when the user has not edited since this
 * request captured its snapshot.
 */
export function applySaveOutcome({ flightGeneration, currentGeneration, snapshotJson, currentJson }) {
  const newerLocal = currentGeneration !== flightGeneration || currentJson !== snapshotJson;
  return { replaceDocument: !newerLocal, stillDirty: newerLocal };
}

export function exportAvailability({ dirty, saveState, confirmedRevision }) {
  const confirmed = !dirty
    && saveState === 'saved'
    && Number.isInteger(confirmedRevision)
    && confirmedRevision >= 1;
  return {
    enabled: confirmed,
    confirmed,
    reason: confirmed
      ? 'Export renders this saved revision. Later edits do not change it.'
      : 'Export uses a confirmed saved revision. Save this issue first.',
  };
}

function textNodes(document) {
  const rows = [];
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (node.kind === 'text' && node.presence !== 'removed') {
      rows.push({ id: node.id, role: node.role || node.kind, text: String(node.text || '') });
    }
    for (const child of node.children || node.elements || node.slides || []) visit(child);
  };
  visit(document);
  return rows;
}

export function compareDocuments(localDocument, serverDocument) {
  const local = textNodes(localDocument);
  const server = textNodes(serverDocument);
  const serverById = new Map(server.map((row) => [row.id, row]));
  const changes = [];
  for (const row of local) {
    const other = serverById.get(row.id);
    if (!other) changes.push({ id: row.id, role: row.role, local: row.text, server: null });
    else if (other.text !== row.text) changes.push({ id: row.id, role: row.role, local: row.text, server: other.text });
    serverById.delete(row.id);
  }
  for (const other of serverById.values()) {
    changes.push({ id: other.id, role: other.role, local: null, server: other.text });
  }
  return {
    localSlides: localDocument?.slides?.length || 0,
    serverSlides: serverDocument?.slides?.length || 0,
    changes: changes.slice(0, 8),
    hiddenChanges: Math.max(0, changes.length - 8),
  };
}
