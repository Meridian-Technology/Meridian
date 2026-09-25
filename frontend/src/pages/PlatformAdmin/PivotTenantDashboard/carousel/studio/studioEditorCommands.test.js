import {
  FRAME_RATIOS,
  applyRatio,
  bringForward,
  canExportDocument,
  copyElements,
  deleteSlide,
  duplicateSlide,
  groupElements,
  insertSlide,
  moveElements,
  pasteElements,
  replaceImageAsset,
  resizeElement,
  resizeRotatedFrame,
  screenDeltaToLocal,
  sendBackward,
  setLocked,
  snapTranslation,
  ungroupElements,
} from './studioEditorCommands';
import { findElement } from './studioDocument';

function issue(slides) {
  return { schemaVersion: 2, width: 1080, height: 1350, slides };
}

function box(id, frame, extra = {}) {
  return {
    id,
    kind: 'shape',
    layout: 'free',
    rotation: 0,
    frame,
    ...extra,
  };
}

describe('studio editor commands', () => {
  test('screen deltas stay correct under zoom and group rotation', () => {
    expect(screenDeltaToLocal(10, 0, 0.5, 0)).toEqual({ dx: 20, dy: 0 });
    const turned = screenDeltaToLocal(0, 10, 1, 90);
    expect(turned.dx).toBeCloseTo(10);
    expect(turned.dy).toBeCloseTo(0);
  });

  test('resize keeps the opposite edge fixed when the frame is rotated', () => {
    const frame = { x: 100, y: 80, width: 200, height: 100 };
    const east = resizeRotatedFrame(frame, 0, 'e', 40, 0);
    expect(east).toMatchObject({ x: 100, width: 240, height: 100 });
    const rotated = resizeRotatedFrame(frame, 90, 'e', 40, 0);
    expect(rotated.width).toBe(240);
    expect(rotated.x).toBeCloseTo(80);
    expect(rotated.y).toBeCloseTo(100);
  });

  test('locked elements ignore moves and snaps report a guide', () => {
    const doc = issue([
      { id: 's', width: 1080, height: 1350, elements: [box('a', { x: 10, y: 10, width: 100, height: 80 }), box('b', { x: 0, y: 40, width: 50, height: 20 }, { locked: true })] },
    ]);
    const moved = moveElements(doc, 's', ['a', 'b'], 15, 0);
    expect(findElement(moved.slides[0], 'a').frame.x).toBe(25);
    expect(findElement(moved.slides[0], 'b').frame.x).toBe(0);
    const snap = snapTranslation({ x: 2, y: 10, width: 80, height: 40 }, [{ x: 400, y: 0, width: 10, height: 10 }]);
    expect(snap.dx).toBe(-2);
    expect(snap.guides[0]).toEqual({ axis: 'x', at: 0 });
  });

  test('group, stack, ratio, and image replace keep the frame treatment', () => {
    const photo = box('photo', { x: 20, y: 30, width: 100, height: 80 }, {
      kind: 'image',
      rotation: 4,
      crop: { focalX: 0.2, focalY: 0.3, scale: 1.4 },
      style: { rim: true },
      asset: { src: 'old', credit: 'Ada' },
    });
    const doc = issue([{ id: 's', elements: [photo, box('mark', { x: 140, y: 30, width: 40, height: 40 }, { stack: 1 })] }]);
    const grouped = groupElements(doc, 's', ['photo', 'mark']);
    const group = grouped.slides[0].elements.find((element) => element.role === 'group');
    expect(group.children).toHaveLength(2);
    const flat = ungroupElements(grouped, 's', [group.id]);
    expect(flat.slides[0].elements.some((element) => element.role === 'group')).toBe(false);
    const forward = bringForward(doc, 's', ['photo']);
    expect(findElement(forward.slides[0], 'photo').stack).not.toBe(findElement(sendBackward(forward, 's', ['photo']).slides[0], 'photo').stack);
    const ratio = applyRatio(doc, 's', 'photo', FRAME_RATIOS[0]);
    expect(findElement(ratio.slides[0], 'photo').frame.height).toBe(100);
    const replaced = replaceImageAsset(doc, 's', 'photo', { src: 'new' });
    const next = findElement(replaced.slides[0], 'photo');
    expect(next.asset).toMatchObject({ src: 'new', credit: 'Ada' });
    expect(next.frame).toEqual(photo.frame);
    expect(next.crop).toEqual(photo.crop);
    expect(next.style).toEqual({ rim: true });
    expect(next.rotation).toBe(4);
  });

  test('slides can be inserted, duplicated, reordered, and deleted, including cover and back', () => {
    let doc = issue([]);
    doc = insertSlide(doc, 0, 'cover');
    doc = insertSlide(doc, 1, 'back');
    expect(doc.slides.map((slide) => slide.role)).toEqual(['cover', 'back']);
    expect(doc.slides[1].preset.id).toBe('paper-close');
    expect(canExportDocument(doc)).toBe(true);
    const coverId = doc.slides[0].id;
    doc = duplicateSlide(doc, coverId);
    expect(doc.slides).toHaveLength(3);
    expect(doc.slides[1].id).not.toBe(coverId);
    doc = deleteSlide(doc, doc.slides[2].id);
    doc = deleteSlide(doc, doc.slides[0].id);
    doc = deleteSlide(doc, doc.slides[0].id);
    expect(doc.slides).toHaveLength(0);
    expect(canExportDocument(doc)).toBe(false);
  });

  test('copy and paste assign new ids and a locked element stays locked', () => {
    const doc = issue([{ id: 's', elements: [box('a', { x: 0, y: 0, width: 20, height: 20 })] }]);
    copyElements(doc, 's', ['a']);
    const pasted = pasteElements(doc, 's');
    expect(pasted.slides[0].elements).toHaveLength(2);
    expect(pasted.slides[0].elements[1].id).not.toBe('a');
    const locked = setLocked(doc, 's', ['a'], true);
    const resized = resizeElement(locked, 's', 'a', 'e', 30, 0);
    expect(findElement(resized.slides[0], 'a').frame.width).toBe(20);
  });
});
