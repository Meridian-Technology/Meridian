import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import PivotVoicePage from './PivotVoicePage';

const mockUseFetch = jest.fn();
const mockAuthenticatedRequest = jest.fn();
const mockAddNotification = jest.fn();

jest.mock('../../../hooks/useFetch', () => ({
  useFetch: (...args) => mockUseFetch(...args),
  authenticatedRequest: (...args) => mockAuthenticatedRequest(...args),
}));

jest.mock('../../../NotificationContext', () => ({
  useNotification: () => ({ addNotification: mockAddNotification }),
}));

jest.mock('./PivotTenantPage', () => ({
  __esModule: true,
  default: ({ title, subtitle, children }) => (
    <div>
      <h1>{title}</h1>
      {subtitle ? <p>{subtitle}</p> : null}
      {children}
    </div>
  ),
}));

jest.mock('../../../components/Popup/Popup', () => ({
  __esModule: true,
  default: ({ isOpen, children }) => (isOpen ? <div role="dialog">{children}</div> : null),
}));

const SHIPPED_WEEK = "swipe what's on. just go";

function catalogResponse() {
  return {
    success: true,
    data: {
      schemaVersion: 1,
      tokens: [
        { name: 'brand.cta', kind: 'string', params: [], shipped: 'go' },
        { name: 'group.singular', kind: 'string', params: [], shipped: 'circle' },
      ],
      keys: [
        {
          path: 'ticker.week',
          kind: 'string',
          params: [],
          shipped: SHIPPED_WEEK,
        },
        {
          path: 'auth.joinCity',
          kind: 'template',
          params: ['city'],
          sampleArgs: { city: 'brooklyn' },
          shipped: '{brand.cta} in {city}',
          usesTokens: true,
        },
      ],
    },
  };
}

function layersResponse(weekPlatform = null) {
  return {
    success: true,
    data: {
      scope: 'platform',
      revision: weekPlatform ? 1 : 0,
      tokens: {
        'brand.cta': { shipped: 'go', platform: null, effective: 'go' },
        'group.singular': {
          shipped: 'circle',
          platform: null,
          effective: 'circle',
        },
      },
      entries: {
        'ticker.week': {
          shipped: SHIPPED_WEEK,
          platform: weekPlatform,
          effective: weekPlatform || SHIPPED_WEEK,
        },
        'auth.joinCity': {
          shipped: '{brand.cta} in {city}',
          platform: null,
          effective: '{brand.cta} in {city}',
        },
      },
    },
  };
}

function tenantLayersResponse({
  weekPlatform = 'platform week',
  weekTenant = 'nyc week',
} = {}) {
  const effective = weekTenant || weekPlatform || SHIPPED_WEEK;
  return {
    success: true,
    data: {
      scope: 'tenant',
      tenantKey: 'nyc',
      revision: weekTenant ? 1 : 0,
      tokens: {
        'brand.cta': {
          shipped: 'go',
          platform: null,
          tenant: null,
          effective: 'go',
        },
        'group.singular': {
          shipped: 'circle',
          platform: null,
          tenant: null,
          effective: 'circle',
        },
      },
      entries: {
        'ticker.week': {
          shipped: SHIPPED_WEEK,
          platform: weekPlatform,
          tenant: weekTenant,
          effective,
        },
        'auth.joinCity': {
          shipped: '{brand.cta} in {city}',
          platform: null,
          tenant: null,
          effective: '{brand.cta} in {city}',
        },
      },
    },
  };
}

function stubFetch(layers = layersResponse(), layersUrl = '/admin/pivot/copy') {
  const refetchLayers = jest.fn();
  const catalog = catalogResponse();
  mockUseFetch.mockImplementation((url) => {
    if (url === '/admin/pivot/copy/catalog') {
      return {
        data: catalog,
        loading: false,
        error: null,
        refetch: jest.fn(),
      };
    }
    if (url === layersUrl) {
      return {
        data: layers,
        loading: false,
        error: null,
        refetch: refetchLayers,
      };
    }
    return { data: null, loading: false, error: null, refetch: jest.fn() };
  });
  return { refetchLayers };
}

function renderVoice(props) {
  return render(<PivotVoicePage scope="platform" {...props} />);
}

function selectVoiceKey(path) {
  const search = screen.getByRole('searchbox', { name: 'Search voice keys' });
  fireEvent.change(search, { target: { value: path } });
  fireEvent.click(screen.getByRole('button', { name: new RegExp(path.replace(/\./g, '\\.')) }));
}

describe('PivotVoicePage', () => {
  afterEach(() => {
    jest.clearAllMocks();
    window.confirm?.mockRestore?.();
  });

  it('finds a key by path and by shipped string', () => {
    stubFetch();
    renderVoice();

    expect(screen.getByRole('heading', { name: 'Voice' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Getting started/i })).toBeInTheDocument();
    expect(screen.queryByText('ticker.week')).toBeNull();
    expect(screen.queryByText('auth.joinCity')).toBeNull();

    const search = screen.getByRole('searchbox', { name: 'Search voice keys' });
    fireEvent.change(search, { target: { value: 'ticker.week' } });
    expect(screen.getByText('ticker.week')).toBeInTheDocument();
    expect(screen.queryByText('auth.joinCity')).toBeNull();

    fireEvent.change(search, { target: { value: "swipe what's on" } });
    expect(screen.getByText('ticker.week')).toBeInTheDocument();
    expect(screen.queryByText('auth.joinCity')).toBeNull();
  });

  it('hides city overlay writes and shows tenant as inherit only on platform', () => {
    stubFetch();
    renderVoice();

    expect(screen.getByText(/platform pack/i)).toBeInTheDocument();
    selectVoiceKey('ticker.week');
    expect(screen.getByText('inherit only')).toBeInTheDocument();
    expect(screen.queryByText(/city overlays are not writable/i)).toBeNull();
  });

  it('saves one platform key through the confirm modal and shows the override', async () => {
    stubFetch();
    mockAuthenticatedRequest.mockResolvedValue({
      data: {
        success: true,
        data: {
          scope: 'platform',
          revision: 1,
          entries: { 'ticker.week': 'this week in just go' },
          tokens: {},
        },
      },
    });

    renderVoice();
    selectVoiceKey('ticker.week');

    const textarea = screen.getByRole('textbox', { name: /override/i });
    fireEvent.change(textarea, { target: { value: 'this week in just go' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Review voice change');
    expect(dialog).toHaveTextContent(SHIPPED_WEEK);
    expect(dialog).toHaveTextContent('this week in just go');

    fireEvent.click(screen.getByRole('button', { name: 'Save voice' }));

    await waitFor(() => {
      expect(mockAuthenticatedRequest).toHaveBeenCalledWith(
        '/admin/pivot/copy',
        expect.objectContaining({
          method: 'PATCH',
          data: { key: 'ticker.week', value: 'this week in just go' },
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByText('Platform').closest('div')).toHaveTextContent(
        'this week in just go',
      );
    });
    expect(screen.getByText('Effective').closest('div')).toHaveTextContent(
      'this week in just go',
    );
    expect(screen.getByText('override')).toBeInTheDocument();
  });

  it('resets a platform override back to shipped', async () => {
    stubFetch(layersResponse('this week in just go'));
    mockAuthenticatedRequest.mockResolvedValue({
      data: {
        success: true,
        data: { scope: 'platform', revision: 2, entries: {}, tokens: {} },
      },
    });
    jest.spyOn(window, 'confirm').mockReturnValue(true);

    renderVoice();
    selectVoiceKey('ticker.week');
    expect(screen.getByText('Platform').closest('div')).toHaveTextContent(
      'this week in just go',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Reset to parent' }));

    await waitFor(() => {
      expect(mockAuthenticatedRequest).toHaveBeenCalledWith(
        '/admin/pivot/copy',
        expect.objectContaining({
          method: 'DELETE',
          data: { keys: ['ticker.week'] },
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByText('Platform').closest('div')).toHaveTextContent(
        'inherit shipped',
      );
    });
    expect(screen.getByText('Effective').closest('div')).toHaveTextContent(
      SHIPPED_WEEK,
    );
  });

  it('saves a city overlay through the tenant pack path', async () => {
    stubFetch(
      tenantLayersResponse({ weekPlatform: 'platform week', weekTenant: null }),
      '/admin/pivot/tenants/nyc/copy',
    );
    mockAuthenticatedRequest.mockResolvedValue({
      data: {
        success: true,
        data: {
          scope: 'tenant',
          tenantKey: 'nyc',
          revision: 1,
          entries: { 'ticker.week': 'nyc week' },
          tokens: {},
        },
      },
    });

    renderVoice({ scope: 'tenant', tenantKey: 'nyc' });
    expect(screen.getByText(/city overlay/i)).toBeInTheDocument();

    selectVoiceKey('ticker.week');
    expect(screen.getByText('Platform').closest('div')).toHaveTextContent(
      'platform week',
    );
    expect(screen.getByText('Tenant').closest('div')).toHaveTextContent(
      'inherit platform',
    );

    const textarea = screen.getByRole('textbox', { name: /override/i });
    fireEvent.change(textarea, { target: { value: 'nyc week' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Save voice' }));

    await waitFor(() => {
      expect(mockAuthenticatedRequest).toHaveBeenCalledWith(
        '/admin/pivot/tenants/nyc/copy',
        expect.objectContaining({
          method: 'PATCH',
          data: { key: 'ticker.week', value: 'nyc week' },
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByText('Tenant').closest('div')).toHaveTextContent(
        'nyc week',
      );
    });
    expect(screen.getByText('Effective').closest('div')).toHaveTextContent(
      'nyc week',
    );
  });

  it('resets a city overlay back to platform then shipped', async () => {
    stubFetch(
      tenantLayersResponse(),
      '/admin/pivot/tenants/nyc/copy',
    );
    mockAuthenticatedRequest.mockResolvedValue({
      data: {
        success: true,
        data: { scope: 'tenant', tenantKey: 'nyc', revision: 2, entries: {}, tokens: {} },
      },
    });
    jest.spyOn(window, 'confirm').mockReturnValue(true);

    renderVoice({ scope: 'tenant', tenantKey: 'nyc' });
    selectVoiceKey('ticker.week');
    expect(screen.getByText('Tenant').closest('div')).toHaveTextContent('nyc week');

    fireEvent.click(screen.getByRole('button', { name: 'Reset to parent' }));

    await waitFor(() => {
      expect(mockAuthenticatedRequest).toHaveBeenCalledWith(
        '/admin/pivot/tenants/nyc/copy',
        expect.objectContaining({
          method: 'DELETE',
          data: { keys: ['ticker.week'] },
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByText('Tenant').closest('div')).toHaveTextContent(
        'inherit platform',
      );
    });
    expect(screen.getByText('Effective').closest('div')).toHaveTextContent(
      'platform week',
    );
  });
});
