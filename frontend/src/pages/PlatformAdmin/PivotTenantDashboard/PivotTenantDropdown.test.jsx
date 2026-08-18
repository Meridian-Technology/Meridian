import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import PivotTenantDropdown from './PivotTenantDropdown';

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="path">{location.pathname}</div>;
}

const TENANTS = [
  { tenantKey: 'nyc', location: 'New York', pivotPilot: true, status: 'active' },
  { tenantKey: 'brooklyn', location: 'Brooklyn', tenantType: 'pivot', status: 'active' },
];

describe('PivotTenantDropdown All cities', () => {
  it('navigates to the fleet overview from a city', () => {
    render(
      <MemoryRouter initialEntries={['/platform-admin/pivot/nyc']}>
        <Routes>
          <Route
            path="/platform-admin/pivot/:tenantKey"
            element={
              <>
                <PivotTenantDropdown
                  tenants={TENANTS}
                  currentTenantKey="nyc"
                  cityDisplayName="New York"
                />
                <LocationProbe />
              </>
            }
          />
          <Route
            path="/platform-admin/pivot"
            element={
              <>
                <div>fleet</div>
                <LocationProbe />
              </>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByLabelText('Switch pivot city'));
    fireEvent.click(screen.getByRole('option', { name: /All cities/i }));
    expect(screen.getByTestId('path')).toHaveTextContent('/platform-admin/pivot');
  });
});
