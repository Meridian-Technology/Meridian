import { createPhotoNoteDocument } from './photoNoteFixture';
import {
  checkWriteRevision,
  createHistory,
  commitTransaction,
  findElement,
  loadDocument,
  materializeVoice,
  moveElement,
  redo,
  removeField,
  resetText,
  resizeFrame,
  serializeDocument,
  setCrop,
  setText,
  undo,
  validateDocument,
} from './studioDocument';

describe('carousel studio document', () => {
  const doc = createPhotoNoteDocument();

  test('photo note fixture is a valid 1080 × 1350 document', () => {
    expect(validateDocument(doc)).toEqual({ valid: true, errors: [] });
    expect(doc.preset.id).toBe('event.note');
  });

  test('frame resize leaves the crop untouched', () => {
    const before = findElement(doc, 'photo');
    const next = resizeFrame(doc, 'photo', {
      ...before.frame,
      width: before.frame.width + 40,
      height: before.frame.height - 20,
    });
    const photo = findElement(next, 'photo');
    expect(photo.frame.width).toBe(before.frame.width + 40);
    expect(photo.crop).toEqual(before.crop);
  });

  test('crop changes the picture inside an unchanged frame', () => {
    const before = findElement(doc, 'photo').frame;
    const next = setCrop(doc, 'photo', { focalX: 0.2, focalY: 0.8, scale: 1.4 });
    const photo = findElement(next, 'photo');
    expect(photo.frame).toEqual(before);
    expect(photo.crop).toEqual({ focalX: 0.2, focalY: 0.8, scale: 1.4 });
  });

  test('moving a card translates the card and reflows children in place', () => {
    const before = findElement(doc, 'card');
    const titleBefore = before.children.find((child) => child.id === 'title').frame.y;
    const next = moveElement(doc, 'card', 30, -12);
    const card = findElement(next, 'card');
    const title = card.children.find((child) => child.id === 'title');
    expect(card.frame.x).toBe(before.frame.x + 30);
    expect(card.frame.y).toBe(before.frame.y - 12);
    expect(title.layout).toBe('flow');
    expect(title.frame.y).toBe(titleBefore);
  });

  test('dragging a flow child detaches it and leaves its sibling in the flow', () => {
    const next = moveElement(doc, 'description', 10, 8);
    const card = findElement(next, 'card');
    const description = card.children.find((child) => child.id === 'description');
    const title = card.children.find((child) => child.id === 'title');
    expect(description.layout).toBe('free');
    expect(title.layout).toBe('flow');
  });

  test('removing a flow field drops it from the stack without moving free elements', () => {
    const detached = moveElement(doc, 'title', 4, 4);
    const title = findElement(detached, 'title');
    const next = removeField(detached, 'description');
    const card = findElement(next, 'card');
    const description = card.children.find((child) => child.id === 'description');
    const kept = card.children.find((child) => child.id === 'title');
    expect(description.presence).toBe('removed');
    expect(kept.layout).toBe('free');
    expect(kept.frame).toEqual(title.frame);
  });

  test('blank text stays blank instead of falling back', () => {
    const next = setText(doc, 'description', '   ');
    expect(findElement(next, 'description').presence).toBe('blank');
    expect(findElement(next, 'description').text).toBe('   ');
  });

  test('a drag or a text edit is one undo step', () => {
    let history = createHistory(doc);
    const moved = moveElement(moveElement(doc, 'photo', 5, 0), 'photo', 7, 0);
    history = commitTransaction(history, moved, 'Move');
    history = commitTransaction(history, setText(history.present, 'title', 'late lanterns'), 'Edit text');
    expect(history.past.map((entry) => entry.label)).toEqual(['Move', 'Edit text']);
    history = undo(history);
    expect(findElement(history.present, 'title').text).toContain('lanterns');
    history = undo(history);
    expect(findElement(history.present, 'photo').frame.x).toBe(findElement(doc, 'photo').frame.x);
    history = redo(history);
    expect(findElement(history.present, 'photo').frame.x).not.toBe(findElement(doc, 'photo').frame.x);
  });

  test('a stale revision conflicts instead of overwriting', () => {
    expect(checkWriteRevision(3, 3)).toEqual({ ok: true, nextRevision: 4 });
    expect(checkWriteRevision(3, 2).code).toBe('REVISION_CONFLICT');
  });

  test('serialize and load keep transforms, crop, text, visibility, and stacking', () => {
    const marked = setCrop(doc, 'photo', { focalX: 0.25, focalY: 0.75, scale: 1.6 });
    const photo = findElement(marked, 'photo');
    photo.visibility = 'hidden';
    photo.stack = 4;
    const loaded = loadDocument(JSON.stringify(serializeDocument(marked)));
    const again = findElement(loaded.document, 'photo');
    expect(loaded.ok).toBe(true);
    expect(again.frame).toEqual(photo.frame);
    expect(again.rotation).toBe(photo.rotation);
    expect(again.crop).toEqual({ focalX: 0.25, focalY: 0.75, scale: 1.6 });
    expect(again.visibility).toBe('hidden');
    expect(again.stack).toBe(4);
    expect(findElement(loaded.document, 'title').text).toBe(findElement(doc, 'title').text);
    expect(loadDocument({ schemaVersion: 1 }).code).toBe('SCHEMA_VERSION_UNSUPPORTED');
    expect(loadDocument({ schemaVersion: 9 }).code).toBe('SCHEMA_VERSION_UNSUPPORTED');
  });

  test('removing middle, last, and every flow field collapses gaps and leaves free elements', () => {
    const card = findElement(doc, 'card');
    const loose = {
      id: 'sticker-note',
      kind: 'text',
      layout: 'free',
      presence: 'custom',
      text: 'kept',
      frame: { x: 12, y: 40, width: 80, height: 24 },
    };
    card.children = [...card.children, loose];
    card.sizing = 'content';
    const middle = removeField(doc, 'description');
    const title = findElement(middle, 'title');
    const afterMiddle = findElement(middle, 'logistics');
    const free = findElement(middle, 'sticker-note');
    expect(findElement(middle, 'description').presence).toBe('removed');
    expect(findElement(middle, 'description').text).toBe(findElement(doc, 'description').text);
    expect(free.frame).toEqual(loose.frame);
    expect(afterMiddle.frame.y).toBeGreaterThan(title.frame.y);

    const last = removeField(middle, 'logistics');
    expect(findElement(last, 'logistics').presence).toBe('removed');
    expect(findElement(last, 'title').frame.y).toBe(title.frame.y);
    expect(findElement(last, 'sticker-note').frame).toEqual(loose.frame);

    const none = removeField(last, 'title');
    const emptied = findElement(none, 'card');
    expect(findElement(none, 'title').presence).toBe('removed');
    expect(emptied.children.filter((child) => child.presence !== 'removed' && child.layout === 'flow')).toHaveLength(0);
    expect(findElement(none, 'sticker-note').frame).toEqual(loose.frame);
    expect(emptied.frame.height).toBeLessThan(card.frame.height);
  });

  test('voice is materialized once and reset does not read a later layer', () => {
    const seeded = createPhotoNoteDocument();
    findElement(seeded, 'title').presence = 'default';
    findElement(seeded, 'title').voice = { key: 'zine.cover.name' };
    const created = materializeVoice(seeded, {
      version: 'city:2026-09-23',
      shipped: { 'zine.cover.name': 'shipped title' },
      city: { 'zine.cover.name': 'city title' },
      account: { 'zine.cover.name': 'account title' },
    });
    expect(findElement(created, 'title').text).toBe('account title');
    expect(findElement(created, 'title').voice).toMatchObject({
      source: 'account',
      version: 'city:2026-09-23',
      resolved: 'account title',
    });
    const edited = setText(created, 'title', 'a custom line');
    const reset = resetText(materializeVoice(edited, {
      version: 'city:later',
      account: { 'zine.cover.name': 'rewritten later' },
      shipped: { 'zine.cover.name': 'shipped title' },
    }), 'title');
    expect(findElement(reset, 'title').text).toBe('account title');
    expect(findElement(reset, 'title').presence).toBe('default');
  });
});
