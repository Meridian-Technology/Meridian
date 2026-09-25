/* eslint-disable testing-library/no-node-access, testing-library/no-container, testing-library/render-result-naming-convention -- Renderer contract tests inspect nested logical-pixel surfaces at two sizes. */
import { render, screen } from '@testing-library/react';
import StudioSlide, { frameStyle } from './StudioSlide';
import { createPhotoNoteDocument } from './photoNoteFixture';
import { cqw, findElement, reflowCard } from './studioDocument';

function nestedDocument() {
  const inner = {
    id: 'inner',
    kind: 'card',
    layout: 'free',
    sizing: 'fixed',
    gap: 0,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    rotation: -6,
    frame: { x: 20, y: 30, width: 200, height: 120 },
    children: [{
      id: 'inner-title',
      kind: 'text',
      role: 'title',
      layout: 'flow',
      presence: 'custom',
      text: 'nested\nline',
      rotation: 3,
      frame: { x: 0, y: 0, width: 180, height: 40 },
    }],
  };
  reflowCard(inner);
  return {
    schemaVersion: 2,
    width: 1080,
    height: 1350,
    preset: { id: 'event.note', round: '06' },
    elements: [inner],
  };
}

describe('studio slide renderer', () => {
  test('fonts, multiline text, rotation, and nested groups match at two zoom levels', () => {
    const doc = createPhotoNoteDocument();
    const nested = nestedDocument();
    doc.elements.push(nested.elements[0]);
    const narrow = render(<StudioSlide doc={doc} width={360} />);
    const wide = render(<StudioSlide doc={doc} width={1080} />);
    for (const view of [narrow, wide]) {
      const root = view.container.querySelector('[data-export-root]');
      expect(root.getAttribute('data-font-faces')).toBe('Les Flos Sans, Les Flos Chaos, Les Flos Sage, Instrument Sans, Space Mono');
      expect(root.querySelector('[data-handle]')).toBeNull();
      expect(root.querySelector('[data-element-id="title"]')).toHaveTextContent('lanterns');
      expect(root.querySelector('[data-element-id="photo"]').style.transform).toContain('rotate(');
      expect(root.querySelector('[data-element-id="inner"]').style.transform).toBe('rotate(-6deg)');
      expect(root.querySelector('[data-element-id="inner-title"]').style.transform).toBe('rotate(3deg)');
    }
    const photo = findElement(doc, 'photo');
    const narrowPhoto = narrow.container.querySelector('[data-element-id="photo"]');
    const widePhoto = wide.container.querySelector('[data-element-id="photo"]');
    expect(narrowPhoto.getAttribute('data-frame')).toBe(widePhoto.getAttribute('data-frame'));
    expect(narrowPhoto.getAttribute('data-frame')).toBe(`${photo.frame.x},${photo.frame.y},${photo.frame.width},${photo.frame.height}`);
    expect(narrowPhoto.getAttribute('data-rotation')).toBe('2');
    expect(frameStyle(photo).left).toBe(photo.frame.x);
    expect(narrow.container.querySelector('[data-element-id="inner-title"]').getAttribute('data-frame'))
      .toBe(wide.container.querySelector('[data-element-id="inner-title"]').getAttribute('data-frame'));
    expect(narrow.container.querySelector('[data-export-root]').style.width).toBe('1080px');
    expect(narrow.container.querySelector('[data-export-root]').style.transform).toBe('scale(0.3333333333333333)');
    expect(wide.container.querySelector('[data-export-root]').style.width).toBe('1080px');
    expect(cqw(1)).toBe(10.8);
  });

  test('seeded event roles use the note type styles', () => {
    const doc = {
      schemaVersion: 2,
      width: 1080,
      height: 1350,
      slides: [{
        id: 's',
        preset: { id: 'photo-note' },
        width: 1080,
        height: 1350,
        elements: [
          { id: 'name', kind: 'text', role: 'event-name', text: 'Book club', presence: 'custom', frame: { x: 80, y: 800, width: 700, height: 80 }, rotation: 0 },
          { id: 'about', kind: 'text', role: 'event-description', text: 'afters', presence: 'custom', frame: { x: 80, y: 900, width: 700, height: 40 }, rotation: 0 },
          { id: 'when', kind: 'text', role: 'event-logistics', text: 'When\nFriday\nWhere\nGrant Ave', presence: 'custom', frame: { x: 80, y: 960, width: 700, height: 80 }, rotation: 0 },
        ],
      }],
    };
    const view = render(<StudioSlide doc={doc} width={360} />);
    expect(view.container.querySelector('[data-element-id="name"] .studio-art__text').style.fontFamily).toBe('Les Flos Sans');
    expect(view.container.querySelector('[data-element-id="about"] .studio-art__text').style.fontFamily).toBe('Instrument Sans');
    expect(view.container.querySelector('[data-element-id="when"]')).toHaveTextContent('Friday');
    expect(view.container.querySelector('[data-element-id="name"]').style.top).toBe('800px');
  });
});

test('legacy ISO dates display as bold local dates without rewriting saved copy', () => {
  const value = '2026-09-25T01:00:00.000Z';
  const doc = { width: 1080, height: 1350, sourceTimezone: 'America/Los_Angeles', elements: [{ id: 'date', kind: 'text', role: 'event-logistics', text: `${value}\nGrant Avenue`, frame: { x: 10, y: 10, width: 800, height: 100 } }] };
  const { container } = render(<StudioSlide doc={doc} width={200} />);
  expect(screen.getByText('Thu, Sep 24, 6:00 PM PDT')).toBeInTheDocument();
  expect(screen.queryByText(value)).not.toBeInTheDocument();
  expect(container.querySelector('strong')).toHaveStyle({ fontWeight: '700' });
  expect(doc.elements[0].text).toContain(value);
});

test('blank text fields are marked and filled fields are not', () => {
  const doc = { width: 1080, height: 1350, elements: [
    { id: 'empty', kind: 'text', text: '', presence: 'blank', frame: { x: 10, y: 10, width: 200, height: 40 } },
    { id: 'filled', kind: 'text', text: 'Lanterns', presence: 'custom', frame: { x: 10, y: 60, width: 200, height: 40 } },
  ] };
  const { container } = render(<StudioSlide doc={doc} width={200} />);
  expect(container.querySelector('[data-element-id="empty"]')).toHaveClass('is-blank');
  expect(container.querySelector('[data-element-id="filled"]')).not.toHaveClass('is-blank');
});
