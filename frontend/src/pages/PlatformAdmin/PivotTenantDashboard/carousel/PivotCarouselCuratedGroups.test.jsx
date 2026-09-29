import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import PivotCarouselCuratedGroups from './PivotCarouselCuratedGroups';

const seed = {
  ref: { sourceTenantKey: 'sf', eventId: 'seed' },
  snapshot: { name: 'Jazz Night', host: 'The Chapel', image: 'https://cdn.example/jazz.jpg', city: { name: 'San Francisco' } },
};
const neighbor = {
  ref: { sourceTenantKey: 'sf', eventId: 'neighbor' },
  snapshot: { name: 'Basement Trio', host: 'Local host', image: 'https://cdn.example/trio.jpg', city: { name: 'San Francisco' } },
};
const group = {
  id: 'sf:seed', label: 'Jazz + live music', signal: { label: 'Featured' }, seed,
  candidates: [seed, neighbor],
};

test('shows a poster fan and lets a curator add or inspect a suggested group', () => {
  const onAdd = jest.fn();
  const onToggle = jest.fn();
  render(<PivotCarouselCuratedGroups
    groups={[group]}
    sources={[]}
    selectedKeys={new Set()}
    onAdd={onAdd}
    onToggle={onToggle}
    onRetry={() => {}}
  />);

  expect(screen.getByRole('heading', { name: 'Jazz + live music' })).toBeInTheDocument();
  expect(document.querySelectorAll('.jg-curate-groups__fan img')).toHaveLength(2);
  fireEvent.click(screen.getByRole('button', { name: 'Add group' }));
  expect(onAdd).toHaveBeenCalledWith(group);
  fireEvent.click(screen.getByRole('button', { name: 'See events' }));
  fireEvent.click(screen.getByRole('button', { name: 'Add Basement Trio' }));
  expect(onToggle).toHaveBeenCalledWith(neighbor);
});
