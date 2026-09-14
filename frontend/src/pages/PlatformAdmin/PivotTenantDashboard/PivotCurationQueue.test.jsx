import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { EditorialInfluenceControl } from './PivotCurationQueue';

jest.mock('../PivotLab/PivotManualImportModal', () => ({
  __esModule: true,
  default: () => null,
  isTypingTarget: () => false,
}));

describe('EditorialInfluenceControl', () => {
  const event = { _id: 'event-1', name: 'Night Market', rankingOverride: null };

  it('offers semantic stepped controls and clears Standard', () => {
    const onSave = jest.fn();
    render(<EditorialInfluenceControl event={event} busy={false} onSave={onSave} />);

    expect(screen.getByRole('radio', { name: 'Standard' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByRole('radio', { name: 'Strong promote' }));
    expect(screen.getByText(/equivalent of one friend-going signal/i)).toBeInTheDocument();
    expect(screen.getByText('People with matching interests')).toBeInTheDocument();

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'matching_interests' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save influence' }));
    expect(onSave).toHaveBeenCalledWith(
      event,
      expect.objectContaining({ tier: 'strong_promote', audience: 'matching_interests' }),
    );

    fireEvent.click(screen.getByRole('radio', { name: 'Standard' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save influence' }));
    expect(onSave).toHaveBeenLastCalledWith(event, null);
  });

  it('loads an existing override and exposes an optional note', () => {
    render(
      <EditorialInfluenceControl
        event={{
          ...event,
          rankingOverride: { tier: 'promote', audience: 'everyone', note: 'Launch pick' },
        }}
        busy={false}
        onSave={jest.fn()}
      />,
    );
    expect(screen.getByRole('radio', { name: 'Promote' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByDisplayValue('Launch pick')).toBeInTheDocument();
  });
});
