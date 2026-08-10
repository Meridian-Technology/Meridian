import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import JustGoCreatorDemoIndicator from './JustGoCreatorDemoIndicator';
import { isDemoActive, setDemoActive } from './justGoCreatorDemoMode';

/**
 * The indicator is the only thing standing between generated fixtures and someone reading a fake
 * audience number as real, so its state has to track demo mode in both directions.
 */

beforeEach(() => {
  setDemoActive(false);
});

afterEach(() => {
  setDemoActive(false);
});

describe('JustGoCreatorDemoIndicator', () => {
  it('sits quiet and unpressed while demo mode is off', () => {
    render(<JustGoCreatorDemoIndicator />);

    const chip = screen.getByRole('button', { name: /demo/i });

    expect(chip).toHaveAttribute('aria-pressed', 'false');
    expect(chip).not.toHaveClass('jg-demo-chip--active');
  });

  it('turns demo mode on and marks itself active', () => {
    render(<JustGoCreatorDemoIndicator />);

    fireEvent.click(screen.getByRole('button', { name: /demo/i }));

    const chip = screen.getByRole('button', { name: 'Demo data' });

    expect(isDemoActive()).toBe(true);
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    expect(chip).toHaveClass('jg-demo-chip--active');
  });

  it('turns demo mode back off', () => {
    setDemoActive(true);
    render(<JustGoCreatorDemoIndicator />);

    fireEvent.click(screen.getByRole('button', { name: 'Demo data' }));

    expect(isDemoActive()).toBe(false);
    expect(screen.getByRole('button', { name: 'Demo' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });
});
