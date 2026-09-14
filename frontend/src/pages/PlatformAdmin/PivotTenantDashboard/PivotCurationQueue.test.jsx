import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { EditorialWeightControl } from './PivotCurationQueue';

jest.mock('../PivotLab/PivotManualImportModal', () => ({
  __esModule: true,
  default: () => null,
  isTypingTarget: () => false,
}));

describe('EditorialWeightControl', () => {
  const event = { _id: 'event-1', name: 'Night Market', rankingOverride: null };

  it('offers a semantic six-stop slider and clears Standard', () => {
    const onSave = jest.fn();
    const { rerender } = render(
      <EditorialWeightControl event={event} busy={false} onSave={onSave} />,
    );

    const slider = screen.getByRole('slider', { name: 'Editorial weight' });
    expect(slider).toHaveAttribute('aria-valuetext', 'Standard');
    expect(slider).toHaveAttribute('max', '5');
    expect(screen.queryByRole('button', { name: 'Save weight' })).not.toBeInTheDocument();
    fireEvent.change(slider, { target: { value: '4' } });
    expect(slider).toHaveAttribute('aria-valuetext', 'Strong Promote');
    expect(screen.getByText(/one friend-going boost/i)).toBeInTheDocument();
    expect(screen.getByText('People with matching interests')).toBeInTheDocument();

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'matching_interests' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save weight' }));
    expect(onSave).toHaveBeenCalledWith(
      event,
      expect.objectContaining({ tier: 'strong_promote', audience: 'matching_interests' }),
    );

    const savedEvent = {
      ...event,
      rankingOverride: { tier: 'strong_promote', audience: 'matching_interests' },
    };
    rerender(<EditorialWeightControl event={savedEvent} busy={false} onSave={onSave} />);
    expect(screen.queryByRole('button', { name: 'Save weight' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reset editorial weight to Standard' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save weight' }));
    expect(onSave).toHaveBeenLastCalledWith(savedEvent, null);
  });

  it('loads an existing override without showing internal notes or a redundant save action', () => {
    render(
      <EditorialWeightControl
        event={{
          ...event,
          rankingOverride: { tier: 'promote', audience: 'everyone', note: 'Launch pick' },
        }}
        busy={false}
        onSave={jest.fn()}
      />,
    );
    expect(screen.getByRole('slider', { name: 'Editorial weight' }))
      .toHaveAttribute('aria-valuetext', 'Promote');
    expect(screen.queryByText(/internal note/i)).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue('Launch pick')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save weight' })).not.toBeInTheDocument();
  });
});
