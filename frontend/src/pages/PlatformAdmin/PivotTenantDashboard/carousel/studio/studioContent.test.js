import { loadDocument, serializeDocument, commitTransaction, createHistory, findElement, undo, redo } from './studioDocument';
import {
  growTextFrame,
  insertSticker,
  removeTextField,
  resetField,
  restoreField,
  retainedAssetKeys,
  setBackgroundCrop,
  setBackgroundImage,
  setSlideText,
  validateUpload,
} from './studioEditorCommands';

function cardIssue() {
  return {
    schemaVersion: 2,
    width: 1080,
    height: 1350,
    slides: [{
      id: 's',
      width: 1080,
      height: 1350,
      background: { kind: 'fill', color: '#faf6ef' },
      elements: [{
        id: 'card',
        kind: 'card',
        role: 'event-card',
        sizing: 'content',
        gap: 12,
        padding: { top: 8, right: 8, bottom: 8, left: 8 },
        rotation: 0,
        frame: { x: 40, y: 800, width: 700, height: 400 },
        children: [
          { id: 'title', kind: 'text', role: 'event-name', layout: 'flow', presence: 'custom', text: 'Lanterns', frame: { x: 8, y: 8, width: 680, height: 80 }, rotation: 0 },
          { id: 'description', kind: 'text', role: 'description', layout: 'flow', presence: 'custom', text: 'A long walk.', frame: { x: 8, y: 100, width: 680, height: 60 }, rotation: 0, voice: { key: 'zine.body', resolved: 'A long walk.', source: 'shipped' } },
          { id: 'logistics', kind: 'text', role: 'logistics', layout: 'flow', presence: 'custom', text: 'Friday\nGrant Ave', frame: { x: 8, y: 180, width: 680, height: 70 }, rotation: 0 },
        ],
      }, {
        id: 'photo',
        kind: 'image',
        layout: 'free',
        rotation: 2,
        frame: { x: 80, y: 80, width: 400, height: 400 },
        crop: { focalX: 0.4, focalY: 0.6, scale: 1.2 },
        style: { rim: true },
        asset: { id: 'shared-photo', key: 'photos/lanterns', src: 'lanterns.jpg', credit: 'Ada' },
      }],
    }],
  };
}

describe('studio content commands', () => {
  test('removing a description reflows the card and undo restores it', () => {
    const doc = cardIssue();
    const before = findElement(doc.slides[0], 'card');
    const titleBefore = findElement(doc.slides[0], 'title').frame.y;
    const logisticsBefore = findElement(doc.slides[0], 'logistics').frame;
    let history = createHistory(doc);
    const removed = removeTextField(doc, 's', 'description');
    history = commitTransaction(history, removed, 'Remove field');
    const card = findElement(history.present.slides[0], 'card');
    const logistics = findElement(history.present.slides[0], 'logistics');
    expect(findElement(history.present.slides[0], 'description').presence).toBe('removed');
    expect(logistics.frame.y).toBeLessThan(logisticsBefore.y);
    expect(card.frame.height).toBeLessThan(before.frame.height);
    expect(findElement(history.present.slides[0], 'title').frame.y).toBe(titleBefore);
    history = undo(history);
    expect(findElement(history.present.slides[0], 'description').presence).toBe('custom');
    expect(findElement(history.present.slides[0], 'description').text).toBe('A long walk.');
    expect(findElement(history.present.slides[0], 'logistics').frame).toEqual(logisticsBefore);
    expect(findElement(history.present.slides[0], 'card').frame).toEqual(before.frame);
    history = redo(history);
    expect(findElement(history.present.slides[0], 'description').presence).toBe('removed');
  });

  test('blank, reset, and a long title stay distinct and untrimmed', () => {
    const doc = cardIssue();
    const blank = setSlideText(doc, 's', 'description', '   ');
    expect(findElement(blank.slides[0], 'description').presence).toBe('blank');
    const reset = resetField(setSlideText(doc, 's', 'description', 'custom line'), 's', 'description');
    expect(findElement(reset.slides[0], 'description').text).toBe('A long walk.');
    expect(findElement(reset.slides[0], 'description').presence).toBe('default');
    const longTitle = `${'lanterns '.repeat(400)}end`;
    const kept = setSlideText(doc, 's', 'title', longTitle);
    expect(findElement(kept.slides[0], 'title').text).toBe(longTitle);
    const restored = restoreField(removeTextField(doc, 's', 'logistics'), 's', 'logistics');
    expect(findElement(restored.slides[0], 'logistics').presence).toBe('custom');
    expect(findElement(restored.slides[0], 'logistics').text).toBe('Friday\nGrant Ave');
  });

  test('stickers, background crop, and a shared asset survive delete and reload', () => {
    let doc = cardIssue();
    doc = insertSticker(doc, 's', 'light');
    doc = insertSticker(doc, 's', 'dark');
    const stickers = doc.slides[0].elements.filter((element) => element.kind === 'sticker');
    expect(stickers).toHaveLength(2);
    expect(stickers[0].id).not.toBe(stickers[1].id);
    const grown = growTextFrame(doc, 's', stickers[0].id, 40);
    expect(findElement(grown.slides[0], stickers[0].id).frame.height).toBe(stickers[0].frame.height + 40);
    doc = setBackgroundImage(doc, 's', { src: 'cover.jpg', credit: 'Ken', id: 'cover' });
    doc = setBackgroundCrop(doc, 's', { focalX: 0.2, focalY: 0.8, scale: 1.5 });
    let history = createHistory(doc);
    const withoutPhoto = {
      ...doc,
      slides: doc.slides.map((slide) => ({
        ...slide,
        elements: slide.elements.filter((element) => element.id !== 'photo'),
      })),
    };
    history = commitTransaction(history, withoutPhoto, 'Delete');
    expect(findElement(history.present.slides[0], 'photo')).toBeNull();
    expect(retainedAssetKeys(history).has('photos/lanterns')).toBe(true);
    expect(retainedAssetKeys(history).has('sticker-light')).toBe(true);
    const loaded = loadDocument(serializeDocument(history.present));
    expect(loaded.document.slides[0].background.crop).toEqual({ focalX: 0.2, focalY: 0.8, scale: 1.5 });
    expect(loaded.document.slides[0].background.asset.credit).toBe('Ken');
    expect(loaded.document.slides[0].elements.filter((element) => element.kind === 'sticker')).toHaveLength(2);
    history = undo(history);
    expect(findElement(history.present.slides[0], 'photo').asset.credit).toBe('Ada');
    expect(findElement(history.present.slides[0], 'photo').style).toEqual({ rim: true });
  });

  test('uploads are checked before they enter the document', () => {
    expect(validateUpload({ type: 'image/png', size: 1000 }).ok).toBe(true);
    expect(validateUpload({ type: 'text/plain', size: 10 }).ok).toBe(false);
    expect(validateUpload({ type: 'image/jpeg', size: 9 * 1024 * 1024 }).ok).toBe(false);
  });
});
