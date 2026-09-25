import {
  applySaveOutcome,
  classifySaveResult,
  compareDocuments,
  exportAvailability,
  recoveryStorageKey,
  shouldOfferRecovery,
  writeRecoveryDraft,
  readRecoveryDraft,
} from './studioPersistence';

const identity = { userId: 'user-a', accountId: 'acct', issueId: 'issue', schemaVersion: 2 };

test('recovery stays inside the user, account, issue, and schema', () => {
  const storage = { store: new Map(), setItem(k, v) { this.store.set(k, v); }, getItem(k) { return this.store.get(k) || null; }, removeItem(k) { this.store.delete(k); } };
  expect(recoveryStorageKey({ ...identity, userId: '' })).toBeNull();
  const key = recoveryStorageKey(identity);
  writeRecoveryDraft(storage, key, { ...identity, document: { slides: [{}] }, savedAt: '2026-09-24T02:00:00.000Z' });
  const local = readRecoveryDraft(storage, key);
  const server = { ...identity, updatedAt: '2026-09-24T01:00:00.000Z', document: { slides: [] }, editorial: null };
  expect(shouldOfferRecovery(local, server)).toBe(true);
  expect(shouldOfferRecovery(local, { ...server, userId: 'user-b' })).toBe(false);
  expect(shouldOfferRecovery(local, { ...server, accountId: 'other' })).toBe(false);
  expect(shouldOfferRecovery(local, { ...server, issueId: 'other' })).toBe(false);
  expect(shouldOfferRecovery(local, { ...server, updatedAt: '2026-09-24T03:00:00.000Z' })).toBe(false);
  expect(shouldOfferRecovery({ ...local, document: server.document, editorial: null }, server)).toBe(false);
});

test('an older save response does not replace a newer local edit', () => {
  expect(applySaveOutcome({ flightGeneration: 1, currentGeneration: 2, snapshotJson: 'a', currentJson: 'b' })).toEqual({ replaceDocument: false, stillDirty: true });
  expect(applySaveOutcome({ flightGeneration: 2, currentGeneration: 2, snapshotJson: 'b', currentJson: 'b' })).toEqual({ replaceDocument: true, stillDirty: false });
});

test('save results distinguish offline, conflict, and failure', () => {
  expect(classifySaveResult({ error: 'Network Error' })).toBe('offline');
  expect(classifySaveResult({ error: 'offline' }, false)).toBe('offline');
  expect(classifySaveResult({ error: 'Changed', code: 'REVISION_CONFLICT' })).toBe('conflict');
  expect(classifySaveResult({ error: 'Changed', status: 409 })).toBe('conflict');
  expect(classifySaveResult({ error: 'nope', code: 500 })).toBe('failed');
  expect(classifySaveResult({ revision: 2 })).toBe('saved');
});

test('export stays closed until a confirmed saved revision', () => {
  expect(exportAvailability({ dirty: true, saveState: 'saved', confirmedRevision: 2 }).reason).toMatch(/confirmed saved revision/);
  expect(exportAvailability({ dirty: false, saveState: 'offline', confirmedRevision: 2 }).enabled).toBe(false);
  const ready = exportAvailability({ dirty: false, saveState: 'saved', confirmedRevision: 2 });
  expect(ready.enabled).toBe(true);
  expect(ready.reason).toMatch(/saved revision/);
});

test('compare lists text that differs and keeps both sides', () => {
  const diff = compareDocuments(
    { slides: [{ elements: [{ id: 't', kind: 'text', text: 'local' }] }] },
    { slides: [{ elements: [{ id: 't', kind: 'text', text: 'server' }] }] },
  );
  expect(diff.changes).toEqual([{ id: 't', role: 'text', local: 'local', server: 'server' }]);
});
