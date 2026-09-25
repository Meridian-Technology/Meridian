/**
 * Full screen is how the editor gets a viewbox on a phone: the dashboard
 * heading and the scrapbook header eat the 4:5 frame unless they leave.
 */

import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import PivotCarouselEditor from './PivotCarouselEditor';

jest.mock('../../../../hooks/useFetch', () => ({ authenticatedRequest: jest.fn() }));
jest.mock('./PivotCarouselVoicePanel', () => () => null);
jest.mock('./PivotCarouselEventPicker', () => () => null);
jest.mock('./PivotCarouselAddSlide', () => () => null);
jest.mock('./PivotCarouselExportPanel', () => () => null);
jest.mock('./PivotCarouselExportPicker', () => ({ open, onConfirm, currentIndex }) => (
  open ? (
    <div data-testid="export-picker">
      <button type="button" onClick={() => onConfirm([currentIndex + 1])}>
        export this slide
      </button>
    </div>
  ) : null
));

const MANIFEST = {
  addable: ['card'],
  types: {
    cover: {
      label: 'cover',
      blurb: 'the week',
      fixed: 'first',
      events: { min: 0, max: 1 },
      fields: [],
      options: [],
    },
    back: {
      label: 'back',
      blurb: 'end',
      fixed: 'last',
      events: 'derived',
      fields: [],
      options: [],
    },
  },
};

const DECK = {
  title: 'issue 014 — oakland',
  edition: 'night',
  issue: { number: '014', city: 'oakland', dateline: 'thu 05 sep' },
  slides: [
    {
      type: 'cover',
      values: {},
      options: {},
      events: [{ snapshot: { name: 'late set' } }],
    },
    { type: 'back', values: {}, options: {}, events: [] },
  ],
};

const FRAMES = {
  cover: () => <div>cover-frame</div>,
  back: () => <div>back-frame</div>,
};

function renderEditor(props = {}) {
  const onToggleFocus = props.onToggleFocus === undefined ? jest.fn() : props.onToggleFocus;
  const view = render(
    <PivotCarouselEditor
      deck={DECK}
      manifest={MANIFEST}
      cityVoice={{}}
      frames={FRAMES}
      dirty={false}
      saving={false}
      tenantKey="oakland"
      onDeckChange={jest.fn()}
      onSave={jest.fn()}
      onSlotImage={jest.fn()}
      onVoiceSaved={jest.fn()}
      tools={<div>night press</div>}
      focused={false}
      onToggleFocus={onToggleFocus}
      {...props}
    />,
  );
  return { ...view, onToggleFocus };
}

describe('full screen', () => {
  test('offers a way back to all carousels', () => {
    const onBack = jest.fn();
    renderEditor({ onBack });
    fireEvent.click(screen.getByRole('button', { name: 'All carousels' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  test('offers a control that asks the page to enter full screen', () => {
    const { onToggleFocus } = renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'full screen' }));
    expect(onToggleFocus).toHaveBeenCalledTimes(1);
  });

  test('marks the editor focused and offers a way out', () => {
    const onToggleFocus = jest.fn();
    const { container } = renderEditor({ focused: true, onToggleFocus });
    expect(container.querySelector('.jgz-editor')).toHaveClass('is-focused');
    fireEvent.click(screen.getByRole('button', { name: 'exit' }));
    expect(onToggleFocus).toHaveBeenCalledTimes(1);
    expect(container.querySelector('.jgz__action--icon')).toBeTruthy();
  });

  test('Escape leaves full screen', () => {
    const onToggleFocus = jest.fn();
    renderEditor({ focused: true, onToggleFocus });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onToggleFocus).toHaveBeenCalledTimes(1);
  });

  test('edition tools sit in the editor bar, not only in the page header', () => {
    renderEditor();
    expect(screen.getAllByText('night press').length).toBeGreaterThan(0);
  });

  test('a saved deck offers export in the save slot', () => {
    const { container } = renderEditor({ dirty: false });
    const bar = container.querySelector('.jgz-editor__bar-actions');
    expect(within(bar).getByRole('button', { name: 'export' })).toBeInTheDocument();
    expect(within(bar).queryByRole('button', { name: 'save deck' })).not.toBeInTheDocument();
  });

  test('an unsaved deck offers save instead of export', () => {
    const { container } = renderEditor({ dirty: true });
    const bar = container.querySelector('.jgz-editor__bar-actions');
    expect(within(bar).getByRole('button', { name: 'save deck' })).toBeInTheDocument();
    expect(within(bar).queryByRole('button', { name: 'export' })).not.toBeInTheDocument();
  });

  test('export asks which slides to render', () => {
    const startExport = jest.fn();
    renderEditor({
      dirty: false,
      exportState: { uiEnabled: true, startExport },
    });
    fireEvent.click(screen.getAllByRole('button', { name: 'export' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Relay' }));
    expect(screen.getByTestId('export-picker')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'export this slide' }));
    expect(startExport).toHaveBeenCalledWith([1]);
  });

  test('a peek under the slide shows the title and the event', () => {
    const { container } = renderEditor();
    const dock = container.querySelector('.jgz-editor__dock');
    expect(dock).not.toHaveClass('is-open');
    expect(dock).toHaveTextContent('01 · cover');
    expect(dock).toHaveTextContent('late set');
    expect(screen.getByRole('button', { name: 'replace' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'all events' })).toBeInTheDocument();
  });

  test('the up arrow lifts the rest of the events, and Escape drops them', () => {
    const onToggleFocus = jest.fn();
    const { container } = renderEditor({ focused: true, onToggleFocus });
    fireEvent.click(screen.getByRole('button', { name: 'all events' }));
    expect(container.querySelector('.jgz-editor__dock')).toHaveClass('is-open');
    expect(screen.getByRole('button', { name: 'hide events' })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(container.querySelector('.jgz-editor__dock')).not.toHaveClass('is-open');
    expect(onToggleFocus).not.toHaveBeenCalled();
  });
});

describe('double-clicking the slide', () => {
  test('two clicks on the slide turn editing on, then off', () => {
    const { container } = renderEditor();
    const stage = container.querySelector('.jgz-editor__stage');
    expect(stage).not.toHaveClass('is-editing');

    fireEvent.click(stage);
    fireEvent.click(stage);
    expect(stage).toHaveClass('is-editing');

    fireEvent.click(stage);
    fireEvent.click(stage);
    expect(stage).not.toHaveClass('is-editing');
  });

  test('a single click does not toggle editing', () => {
    const { container } = renderEditor();
    const stage = container.querySelector('.jgz-editor__stage');
    fireEvent.click(stage);
    expect(stage).not.toHaveClass('is-editing');
  });
});
