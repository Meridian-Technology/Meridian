import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AUTOSAVE_DEBOUNCE_MS,
  applySaveOutcome,
  classifySaveResult,
  clearRecoveryDraft,
  readRecoveryDraft,
  recoveryStorageKey,
  shouldOfferRecovery,
  writeRecoveryDraft,
} from './studioPersistence';

const storage = () => (typeof window === 'undefined' ? null : window.localStorage);

/**
 * Debounced, serialized saves. Local recovery is written before the request
 * and is never reported as Saved.
 */
export default function useStudioAutosave({
  userId,
  accountId,
  issueId,
  schemaVersion = 2,
  serverUpdatedAt,
  serverDocument,
  serverEditorial,
  initialRevision = 1,
  getSnapshot,
  onSave,
  onResult,
  autosaveMs = AUTOSAVE_DEBOUNCE_MS,
  enabled = true,
}) {
  const key = recoveryStorageKey({ userId, accountId, issueId, schemaVersion });
  const [saveState, setSaveState] = useState('saved');
  const [conflict, setConflict] = useState(null);
  const [recovery, setRecovery] = useState(null);
  const revisionRef = useRef(initialRevision);
  const generation = useRef(0);
  const chain = useRef(Promise.resolve());
  const timer = useRef(null);
  const saveStateRef = useRef(saveState);
  saveStateRef.current = saveState;
  const getSnapshotRef = useRef(getSnapshot);
  getSnapshotRef.current = getSnapshot;
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  const serverDocumentRef = useRef(serverDocument);
  serverDocumentRef.current = serverDocument;
  const serverEditorialRef = useRef(serverEditorial);
  serverEditorialRef.current = serverEditorial;
  useEffect(() => {
    const local = readRecoveryDraft(storage(), key);
    const offer = shouldOfferRecovery(local, {
      userId,
      accountId,
      issueId,
      schemaVersion,
      updatedAt: serverUpdatedAt,
      document: serverDocumentRef.current,
      editorial: serverEditorialRef.current,
    });
    setRecovery(offer ? local : null);
  }, [key, userId, accountId, issueId, schemaVersion, serverUpdatedAt]);

  const persistLocal = useCallback((snapshot) => {
    if (!key) return;
    writeRecoveryDraft(storage(), key, {
      userId,
      accountId,
      issueId,
      schemaVersion,
      baseRevision: revisionRef.current,
      document: snapshot.document,
      editorial: snapshot.editorial,
      savedAt: new Date().toISOString(),
    });
  }, [key, userId, accountId, issueId, schemaVersion]);

  const runSave = useCallback(async () => {
    if (!onSaveRef.current || saveStateRef.current === 'conflict') return;
    const online = typeof navigator === 'undefined' ? true : navigator.onLine !== false;
    const flightGeneration = generation.current;
    const snapshot = getSnapshotRef.current();
    const snapshotJson = JSON.stringify(snapshot);
    if (!online) {
      setSaveState('offline');
      return;
    }
    setSaveState('saving');
    let result;
    try {
      result = await onSaveRef.current(snapshot.document, snapshot.editorial, revisionRef.current);
    } catch (error) {
      result = { error: error?.message || 'The save failed.' };
    }
    const outcome = classifySaveResult(result, online);
    if (outcome === 'conflict') {
      const next = {
        serverIssue: result.issue || null,
        storedRevision: result.storedRevision || result.issue?.revision || null,
        message: result.error || 'This issue changed in another session.',
      };
      setConflict(next);
      setSaveState('conflict');
      onResultRef.current?.({ outcome, result });
      return;
    }
    if (outcome === 'offline') {
      setSaveState('offline');
      onResultRef.current?.({ outcome, result });
      return;
    }
    if (outcome !== 'saved') {
      setSaveState('failed');
      onResultRef.current?.({ outcome, result });
      return result;
    }
    revisionRef.current = result.revision || revisionRef.current;
    const current = getSnapshotRef.current();
    const decision = applySaveOutcome({
      flightGeneration,
      currentGeneration: generation.current,
      snapshotJson,
      currentJson: JSON.stringify(current),
    });
    const applied = { ...result, replaceDocument: decision.replaceDocument, captured: snapshot };
    if (decision.replaceDocument) {
      clearRecoveryDraft(storage(), key);
      setSaveState('saved');
    } else {
      setSaveState('unsaved');
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        enqueueRef.current();
      }, autosaveMs);
    }
    onResultRef.current?.({ outcome: 'saved', result: applied });
    return applied;
  }, [autosaveMs, key]);

  const enqueueRef = useRef(() => {});

  const busy = useRef(false);
  const queued = useRef(false);
  const enqueue = useCallback(() => {
    if (saveStateRef.current === 'conflict') return Promise.resolve(null);
    if (busy.current) {
      queued.current = true;
      return chain.current;
    }
    busy.current = true;
    const job = runSave().catch(() => {
      setSaveState('failed');
      return null;
    }).finally(() => {
      busy.current = false;
      if (queued.current && saveStateRef.current !== 'conflict') {
        queued.current = false;
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          timer.current = null;
          enqueueRef.current();
        }, autosaveMs);
      }
    });
    chain.current = job;
    return job;
  }, [autosaveMs, runSave]);
  enqueueRef.current = enqueue;

  const noteEdit = useCallback((snapshot) => {
    generation.current += 1;
    persistLocal(snapshot);
    if (saveStateRef.current === 'conflict') return;
    setSaveState((current) => (current === 'saving' ? current : 'unsaved'));
    if (!enabled || !onSaveRef.current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      enqueue();
    }, autosaveMs);
  }, [autosaveMs, enabled, enqueue, persistLocal]);

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (saveStateRef.current === 'conflict') return Promise.resolve(null);
    return enqueue();
  }, [enqueue]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  useEffect(() => {
    const retry = () => { if (saveStateRef.current === 'offline') flush(); };
    const lost = () => { if (saveStateRef.current !== 'conflict') setSaveState('offline'); };
    window.addEventListener('online', retry);
    window.addEventListener('offline', lost);
    return () => {
      window.removeEventListener('online', retry);
      window.removeEventListener('offline', lost);
    };
  }, [flush]);

  const dismissRecovery = useCallback(() => {
    clearRecoveryDraft(storage(), key);
    setRecovery(null);
  }, [key]);

  const clearConflict = useCallback((revision) => {
    if (Number.isInteger(revision)) revisionRef.current = revision;
    setConflict(null);
    clearRecoveryDraft(storage(), key);
    generation.current += 1;
    setSaveState('saved');
  }, [key]);

  return {
    saveState,
    setSaveState,
    conflict,
    recovery,
    revisionRef,
    noteEdit,
    flush,
    dismissRecovery,
    clearConflict,
    persistLocal,
  };
}
