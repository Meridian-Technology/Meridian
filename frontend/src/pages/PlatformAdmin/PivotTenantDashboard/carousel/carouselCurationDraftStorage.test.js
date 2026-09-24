import {
  clearCurationDraftLocal,
  curationDraftStorageKey,
  readCurationDraftLocal,
  shouldRecoverLocalDraft,
  writeCurationDraftLocal,
} from './carouselCurationDraftStorage';

describe('curation draft recovery', () => {
  const key = curationDraftStorageKey({ accountId: 'acc', issueId: null, draftId: 'draft-1' });

  beforeEach(() => {
    sessionStorage.clear();
  });

  test('reload can recover a newer local tray when the server draft is still empty', () => {
    writeCurationDraftLocal(key, { selected: [{ ref: { sourceTenantKey: 'sf', eventId: 'a' } }] });
    const local = readCurationDraftLocal(key);
    expect(shouldRecoverLocalDraft(local, { selected: [], updatedAt: '2026-01-01T00:00:00.000Z' })).toBe(true);
    expect(shouldRecoverLocalDraft(local, { selected: [{ ref: { eventId: 'b' } }] })).toBe(false);
    clearCurationDraftLocal(key);
    expect(readCurationDraftLocal(key)).toBeNull();
  });
});
