import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Dashboard from './Dashboard';

jest.mock('../../hooks/useAuth', () => () => ({ user: null }));
jest.mock('@iconify-icon/react', () => ({ Icon: () => null }));
jest.mock('../ProfilePopup/ProfilePopup', () => () => null);
jest.mock('../NotificationInbox/NotificationInbox', () => () => null);
jest.mock('../../utils/overlayRegistry', () => ({
  getOverlayStateFromParams: () => null,
  restoreOverlay: () => Promise.resolve(),
  clearOverlaySearchParams: (params) => params,
}));

it('keeps a hidden page slot without exposing it in navigation', async () => {
  render(
    <MemoryRouter initialEntries={['/dashboard?page=2']}>
      <Dashboard
        menuItems={[
          { label: 'First', element: <p>First content</p> },
          { label: 'Reserved', hideFromNav: true, element: <p>Reserved content</p> },
          { label: 'Later', element: <p>Later content</p> },
        ]}
      />
    </MemoryRouter>,
  );

  expect(await screen.findByText('Later content')).toBeInTheDocument();
  expect(screen.queryByText('Reserved')).toBeNull();
  expect(screen.getByText('Later')).toBeInTheDocument();
});

it('highlights the parent workspace for a hidden legacy page', async () => {
  render(
    <MemoryRouter initialEntries={['/dashboard?page=1']}>
      <Dashboard
        menuItems={[
          { label: 'First', element: <p>First content</p> },
          { label: 'Legacy Copy', hideFromNav: true, navParentIndex: 2, element: <p>Copy content</p> },
          { label: 'Creative studio', element: <p>Studio content</p> },
        ]}
      />
    </MemoryRouter>,
  );

  expect(await screen.findByText('Copy content')).toBeInTheDocument();
  expect(screen.queryByText('Legacy Copy')).toBeNull();
  const studioItem = screen.getAllByRole('listitem').find(
    (item) => within(item).queryByText('Creative studio'),
  );
  expect(studioItem).toHaveClass('selected');
});

it('orders the sidebar by navOrder without changing page indexes', async () => {
  render(
    <MemoryRouter initialEntries={['/dashboard?page=2']}>
      <Dashboard
        menuItems={[
          { label: 'Home', element: <p>Home content</p> },
          { label: 'Voice', element: <p>Voice content</p> },
          { label: 'Growth', navOrder: 0.5, element: <p>Growth content</p> },
        ]}
      />
    </MemoryRouter>,
  );

  expect(await screen.findByText('Growth content')).toBeInTheDocument();
  const labels = screen.getAllByRole('listitem').map((item) => item.textContent);
  expect(labels.slice(0, 3)).toEqual(['Home', 'Growth', 'Voice']);
  const growthItem = screen.getAllByRole('listitem').find(
    (item) => within(item).queryByText('Growth'),
  );
  expect(growthItem).toHaveClass('selected');
});
