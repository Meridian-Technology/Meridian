import { generateCoverSlide, generateEventSlide, generateBackSlide, applyPreset, titleOf, walkElements } from '../../../../../shared/carouselStudio/presets';
import { normalizeSlide, reflowCard } from '../../../../../shared/carouselStudio/document';
import { insertSticker, applySlidePreset, moveInSlideSpace, copyElements, pasteElements, deleteElements, selectionBounds, groupElements, resizeElement, setNumericFrame } from './studioEditorCommands';
import { createHistory, commitTransaction, undo } from './studioDocument';
const doc = slide => ({ schemaVersion: 2, width: 1080, height: 1350, slides: [slide] });
test('reset keeps authored copy, removed fields, source/credit, and added stickers; undo is exact', () => {
  const slide = generateEventSlide({ ref: { sourceTenantKey: 'sf', eventId: 'event' }, snapshot: { name: 'A very real title', image: '/real.jpg', credit: 'Author', location: 'Here' } }, 'photo-note');
  walkElements(slide.elements, e => { if (e.role === 'event-location') { e.text = ''; e.presence = 'removed'; } });
  const before = insertSticker(doc(slide), slide.id, 'dark'); const next = applySlidePreset(before, slide.id, 'in-the-room');
  expect(next.slides[0].source).toEqual(slide.source);
  expect(next.slides[0].elements.filter(e => e.kind === 'sticker')).toHaveLength(1);
  let location; walkElements(next.slides[0].elements, e => { if (e.role === 'event-location') location = e; });
  expect(location.presence).toBe('removed'); expect(next.slides[0].elements[0].asset.credit).toBe('Author');
  expect(undo(commitTransaction(createHistory(before), next, 'Template')).present).toEqual(before);
});
test('all cover variations stack photos below titles and preserve authored text', () => {
  for (const family of ['loose-letters', 'open-invitation', 'kept-somewhere']) for (const variation of [1,2,3]) {
    const slide = generateCoverSlide({ theme: 'Our\nnight', coverPreset: family, variation, coverImage: '/ours.jpg' });
    expect(slide.elements.find(e => e.role === 'cover-photo').stack).toBeLessThan(slide.elements.find(e => e.role === 'cover-title').stack);
    expect(titleOf(applyPreset(slide, family, variation % 3 + 1))).toBe('Our\nnight');
  }
});
test('loading preserves geometry and explicit reflow shrinks a content card', () => {
  const slide = generateEventSlide({ snapshot: { name: 'A\nlong title', location: 'Here' } }, 'in-the-room');
  const card = slide.elements.find(e => e.kind === 'card'); card.frame.x = 19; card.children[0].frame.y = 27;
  expect(normalizeSlide(slide, 0).elements.find(e => e.kind === 'card').children[0].frame.y).toBe(27);
  const original = card.frame.height; card.children[0].presence = 'removed'; reflowCard(card);
  expect(card.frame.height).toBeLessThan(original); expect(card.frame.y + card.frame.height + card.bottom).toBe(1350);
});
test('mixed-parent moves and clipboard preserve world-space placement and parent locks', () => {
  const slide = { id: 's', elements: [{ id: 'g', kind: 'card', role: 'group', rotation: 90, frame: { x: 100, y: 100, width: 300, height: 300 }, children: [{ id: 'a', kind: 'shape', frame: { x: 20, y: 30, width: 60, height: 50 } }] }, { id: 'b', kind: 'shape', frame: { x: 500, y: 500, width: 60, height: 50 } }] };
  const before = selectionBounds(slide, ['a']); const moved = moveInSlideSpace(doc(slide), 's', ['a','b'], 50, 20); const after = selectionBounds(moved.slides[0], ['a']);
  expect(after.x - before.x).toBeCloseTo(50); expect(after.y - before.y).toBeCloseTo(20);
  copyElements(doc(slide), 's', ['a']); const copy = pasteElements(doc(slide), 's').slides[0].elements.at(-1); expect(copy.rotation).toBe(90);
  slide.elements[0].locked = true; expect(deleteElements(doc(slide), 's', ['a']).slides[0].elements[0].children).toHaveLength(1);
});

test('deleting preset text remains removed after reset and grouped preset objects keep unique IDs', () => {
  const slide = generateEventSlide({ snapshot: { name: 'Keep me', image: '/photo.jpg' } });
  let title; walkElements(slide.elements, element => { if (element.role === 'event-name') title = element; });
  const deleted = deleteElements(doc(slide), slide.id, [title.id]);
  const reset = applySlidePreset(deleted, slide.id, 'on-the-bill');
  let restored; walkElements(reset.slides[0].elements, element => { if (element.id === title.id) restored = element; });
  expect(restored.presence).toBe('removed');
  const grouped = groupElements(doc(slide), slide.id, [slide.elements[0].id, slide.elements.at(-1).id]);
  const next = applySlidePreset(grouped, slide.id, 'in-the-room'); const ids = [];
  walkElements(next.slides[0].elements, element => ids.push(element.id));
  expect(new Set(ids).size).toBe(ids.length);
});
test('resizing a rotated group scales children and moving a bottom card detaches its anchor', () => {
  const slide = generateEventSlide({ snapshot: { name: 'Our night', image: '/photo.jpg' } });
  const grouped = groupElements(doc(slide), slide.id, [slide.elements[0].id, slide.elements.at(-1).id]); const group = grouped.slides[0].elements.at(-1);
  const bigger = resizeElement(grouped, slide.id, group.id, 'se', 100, 100);
  expect(bigger.slides[0].elements.at(-1).children[0].frame.width).toBeGreaterThan(group.children[0].frame.width);
  const scene = generateEventSlide({ snapshot: { name: 'Room' } }, 'in-the-room'); const card = scene.elements[1];
  const moved = setNumericFrame(doc(scene), scene.id, card.id, { y: 300 });
  expect(moved.slides[0].elements[1].frame.y).toBe(300); expect(moved.slides[0].elements[1].anchor).toBeUndefined();
});

test('event seeding leaves source descriptions out and formats dates in the source city', () => {
  const slide = generateEventSlide({ snapshot: { name: 'Night', description: 'Source paragraph '.repeat(100), startTime: '2026-09-25T01:00:00Z', city: { timezone: 'America/Los_Angeles' } } });
  const fields = []; walkElements(slide.elements, e => { if (e.kind === 'text') fields.push(e); });
  expect(fields.find(e => e.role === 'event-description')).toMatchObject({ text: '', presence: 'blank', placeholder: 'Write your blurb' });
  const date = fields.find(e => e.role === 'event-date'); expect(date.text).toMatch(/Sep 24/); expect(date.text).toMatch(/6:00 PM PDT/); expect(date.style.fontWeight).toBe(700);
  expect(JSON.stringify(slide)).not.toContain('Source paragraph');
});

test('a back slide has two closing layouts and keeps edited copy', () => {
  const paper = generateBackSlide('paper-close');
  const orange = generateBackSlide('orange-close');
  expect(paper.background.color).toBe('#faf6ef');
  expect(orange.background.color).toBe('#ff4f1f');
  expect(paper.elements.find(element => element.role === 'back-mark').kind).toBe('sticker');
  expect(paper.elements.find(element => element.role === 'back-line').text).toBe('find the rest in the app');
  expect(paper.elements.some(element => element.role === 'back-badge')).toBe(true);
  expect(orange.elements.find(element => element.role === 'back-mark').asset.finish).toBe('light');
  paper.elements.find(element => element.role === 'back-line').text = 'see you monday';
  const next = applyPreset(paper, 'orange-close', 2);
  let line; walkElements(next.elements, element => { if (element.role === 'back-line') line = element; });
  expect(line.text).toBe('see you monday');
  expect(next.preset.id).toBe('orange-close');
});
