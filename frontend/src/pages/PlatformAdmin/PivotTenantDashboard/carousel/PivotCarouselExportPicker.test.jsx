import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import PivotCarouselExportPicker from './PivotCarouselExportPicker';

jest.mock('./PivotCarouselPopup', () => ({
  __esModule: true,
  default: ({ open, children }) => (open ? <div>{children}</div> : null),
}));

const SLIDES = [
  { type: 'cover' },
  { type: 'card' },
  { type: 'back' },
];

const MANIFEST = {
  types: {
    cover: { label: 'cover' },
    card: { label: 'card' },
    back: { label: 'back' },
  },
};

describe('carousel export picker', () => {
  it('defaults to the current slide and exports without requiring the rest', () => {
    const onConfirm = jest.fn();
    render(
      <PivotCarouselExportPicker
        open
        slides={SLIDES}
        manifest={MANIFEST}
        currentIndex={1}
        onClose={() => {}}
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByLabelText(/02/)).toBeChecked();
    expect(screen.getByLabelText(/01/)).not.toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'export 1 slide' }));
    expect(onConfirm).toHaveBeenCalledWith([2]);
  });

  it('can export the whole deck', () => {
    const onConfirm = jest.fn();
    render(
      <PivotCarouselExportPicker
        open
        slides={SLIDES}
        manifest={MANIFEST}
        currentIndex={0}
        onClose={() => {}}
        onConfirm={onConfirm}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'all slides' }));
    fireEvent.click(screen.getByRole('button', { name: 'export 3 slides' }));
    expect(onConfirm).toHaveBeenCalledWith([1, 2, 3]);
  });
});
