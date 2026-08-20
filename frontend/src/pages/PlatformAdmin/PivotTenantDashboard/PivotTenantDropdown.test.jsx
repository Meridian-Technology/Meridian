import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useParams } from 'react-router-dom';
import PivotTenantDropdown, {
  remapPivotOpsSearch,
} from './PivotTenantDropdown';

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="path">{`${location.pathname}${location.search}`}</div>;
}

function SwitcherHarness() {
  const { tenantKey } = useParams();
  return (
    <>
      <PivotTenantDropdown
        tenants={TENANTS}
        currentTenantKey={tenantKey || ''}
        cityDisplayName={tenantKey ? undefined : 'All cities'}
      />
      <LocationProbe />
    </>
  );
}

const TENANTS = [
  { tenantKey: 'nyc', location: 'New York', pivotPilot: true, status: 'active' },
  { tenantKey: 'brooklyn', location: 'Brooklyn', tenantType: 'pivot', status: 'active' },
];

function renderSwitcher(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/platform-admin/pivot" element={<SwitcherHarness />} />
        <Route path="/platform-admin/pivot/:tenantKey" element={<SwitcherHarness />} />
      </Routes>
    </MemoryRouter>,
  );
}

function switchTo(optionName) {
  fireEvent.click(screen.getByLabelText('Switch pivot city'));
  fireEvent.click(screen.getByRole('option', { name: optionName }));
}

describe('remapPivotOpsSearch', () => {
  it('maps fleet Voice to city Voice and back', () => {
    expect(
      remapPivotOpsSearch(new URLSearchParams('page=1'), {
        from: 'fleet',
        to: 'city',
      }),
    ).toBe('?page=5');
    expect(
      remapPivotOpsSearch(new URLSearchParams('page=5'), {
        from: 'city',
        to: 'fleet',
      }),
    ).toBe('?page=1');
  });

  it('maps fleet Launch to city Launch and back', () => {
    expect(
      remapPivotOpsSearch(new URLSearchParams('page=2'), {
        from: 'fleet',
        to: 'city',
      }),
    ).toBe('?page=6');
    expect(
      remapPivotOpsSearch(new URLSearchParams('page=6'), {
        from: 'city',
        to: 'fleet',
      }),
    ).toBe('?page=2');
  });

  it('drops city-only pages to fleet Overview', () => {
    expect(
      remapPivotOpsSearch(new URLSearchParams('page=1'), {
        from: 'city',
        to: 'fleet',
      }),
    ).toBe('');
    expect(
      remapPivotOpsSearch(new URLSearchParams('page=4'), {
        from: 'city',
        to: 'fleet',
      }),
    ).toBe('');
    // City Drop deck is page=2; fleet Launch is also page=2 — do not confuse them.
    expect(
      remapPivotOpsSearch(new URLSearchParams('page=2'), {
        from: 'city',
        to: 'fleet',
      }),
    ).toBe('');
  });

  it('keeps city → city page (and other query params)', () => {
    expect(
      remapPivotOpsSearch(new URLSearchParams('page=4&organizerId=org-1'), {
        from: 'city',
        to: 'city',
      }),
    ).toBe('?page=4&organizerId=org-1');
  });
});

describe('PivotTenantDropdown switcher remap', () => {
  it('navigates to the fleet overview from a city', () => {
    renderSwitcher('/platform-admin/pivot/nyc');
    switchTo(/All cities/i);
    expect(screen.getByTestId('path').textContent).toBe('/platform-admin/pivot');
  });

  it('lands All cities Voice on city Voice (page=5), not Curation', () => {
    renderSwitcher('/platform-admin/pivot?page=1');
    switchTo(/New York/i);
    expect(screen.getByTestId('path').textContent).toBe(
      '/platform-admin/pivot/nyc?page=5',
    );
  });

  it('lands NYC Voice on All cities Voice (page=1)', () => {
    renderSwitcher('/platform-admin/pivot/nyc?page=5');
    switchTo(/All cities/i);
    expect(screen.getByTestId('path').textContent).toBe(
      '/platform-admin/pivot?page=1',
    );
  });

  it('lands NYC Curation on All cities Overview', () => {
    renderSwitcher('/platform-admin/pivot/nyc?page=1');
    switchTo(/All cities/i);
    expect(screen.getByTestId('path').textContent).toBe('/platform-admin/pivot');
  });

  it('lands All cities Launch on city Launch (page=6)', () => {
    renderSwitcher('/platform-admin/pivot?page=2');
    switchTo(/New York/i);
    expect(screen.getByTestId('path').textContent).toBe(
      '/platform-admin/pivot/nyc?page=6',
    );
  });

  it('lands NYC Launch on All cities Launch (page=2)', () => {
    renderSwitcher('/platform-admin/pivot/nyc?page=6');
    switchTo(/All cities/i);
    expect(screen.getByTestId('path').textContent).toBe(
      '/platform-admin/pivot?page=2',
    );
  });

  it('keeps NYC Catalog → Brooklyn Catalog at page=4', () => {
    renderSwitcher('/platform-admin/pivot/nyc?page=4');
    switchTo(/Brooklyn/i);
    expect(screen.getByTestId('path').textContent).toBe(
      '/platform-admin/pivot/brooklyn?page=4',
    );
  });
});
