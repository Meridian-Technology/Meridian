import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import PivotCoverLab from './PivotCoverLab';

afterEach(() => window.localStorage.clear());

it('keeps the design-review shortlist after the workspace remounts', () => {
  const { unmount } = render(<PivotCoverLab tenantKey="nyc" />);
  fireEvent.click(screen.getByRole('button', { name: '01 / Original studies' }));
  fireEvent.click(screen.getByRole('button', { name: 'Shortlist A1' }));

  expect(window.localStorage.getItem('justgo-cover-lab-v1:nyc')).toBe('["a1"]');
  unmount();

  render(<PivotCoverLab tenantKey="nyc" />);
  fireEvent.click(screen.getByRole('button', { name: '01 / Original studies' }));
  expect(screen.getByRole('button', { name: 'Remove A1' })).toHaveAttribute('aria-pressed', 'true');
});
