import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import IntegrationsPage from './IntegrationsPage';

const mockUseFetch = jest.fn();
const mockAuthenticatedRequest = jest.fn();
const mockAddNotification = jest.fn();
const mockRefetchSettings = jest.fn();
const mockRefetchTokens = jest.fn();

jest.mock('../../../hooks/useFetch', () => ({
  useFetch: (...args) => mockUseFetch(...args),
  authenticatedRequest: (...args) => mockAuthenticatedRequest(...args),
}));

jest.mock('../../../NotificationContext', () => ({
  useNotification: () => ({ addNotification: mockAddNotification }),
}));

jest.mock('@iconify-icon/react', () => ({
  Icon: () => null,
}));

jest.mock('../../../components/Popup/Popup', () => ({ isOpen, children }) =>
  (isOpen ? <div>{children}</div> : null));

const SECRET = 'mcp_abcdefgh-secret-shown-once';
const MFA_MESSAGE = 'Admin MFA is required';

const settings = {
  source: 'database',
  webhookUrl: 'https://grokbot.example.com/routines/r1/webhook',
  enabled: true,
  keySet: true,
  keyLast4: '1234',
  mcpServerUrl: 'https://www.meridian.study/mcp/carousel',
  deliveries: [
    { at: '2026-11-07T15:00:00.000Z', event: 'preview-ready', jobId: 'job:compose:1', attempt: 1, status: 204, error: null },
    { at: '2026-11-07T14:00:00.000Z', event: 'wait', jobId: 'job:compose:0', attempt: 2, status: null, error: 'fetch failed' },
  ],
};

const tokens = [
  {
    id: 'tok-1',
    globalUserId: 'u1',
    ownerEmail: 'ops@example.com',
    label: 'grokbot',
    displayPrefix: 'mcp_abcdefgh',
    expiresAt: '2027-11-07T00:00:00.000Z',
    lastUsedAt: null,
    revokedAt: null,
  },
  {
    id: 'tok-0',
    globalUserId: 'u1',
    ownerEmail: 'ops@example.com',
    label: 'old',
    displayPrefix: 'mcp_zzzzzzzz',
    expiresAt: '2027-01-01T00:00:00.000Z',
    lastUsedAt: '2026-10-01T00:00:00.000Z',
    revokedAt: '2026-10-02T00:00:00.000Z',
  },
];

function mockFetches({ settingsData = settings, tokenList = tokens } = {}) {
  mockUseFetch.mockImplementation((url) => {
    if (url === '/admin/platform/access-tokens') {
      return { data: { success: true, data: tokenList }, loading: false, error: null, refetch: mockRefetchTokens };
    }
    return { data: { success: true, data: settingsData }, loading: false, error: null, refetch: mockRefetchSettings };
  });
}

describe('IntegrationsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetches();
    Object.assign(navigator, { clipboard: { writeText: jest.fn(async () => {}) } });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shows the connector server URL with a copy button', async () => {
    render(<IntegrationsPage />);
    expect(screen.getByText('https://www.meridian.study/mcp/carousel')).toBeInTheDocument();
    const connector = screen.getByRole('region', { name: 'Grokbot connector' });
    fireEvent.click(within(connector).getByRole('button', { name: 'Copy' }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      'https://www.meridian.study/mcp/carousel',
    ));
  });

  it('creates a token and shows its secret once, with a warning and a copy button', async () => {
    mockAuthenticatedRequest.mockResolvedValue({
      data: { success: true, data: { ...tokens[0], secret: SECRET } },
    });
    render(<IntegrationsPage />);

    fireEvent.change(screen.getByLabelText('Token label'), { target: { value: 'grokbot prod' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create token' }));

    const dialog = await screen.findByRole('dialog', { name: 'Token created' });
    expect(mockAuthenticatedRequest).toHaveBeenCalledWith('/admin/platform/access-tokens', expect.objectContaining({
      method: 'POST',
      data: { label: 'grokbot prod' },
    }));
    expect(within(dialog).getByText(SECRET)).toBeInTheDocument();
    expect(within(dialog).getByText(/can't be shown again/)).toBeInTheDocument();
    expect(mockRefetchTokens).toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Copy token' }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(SECRET));

    fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }));
    expect(screen.queryByText(SECRET)).not.toBeInTheDocument();
  });

  it('lists tokens and asks before revoking', async () => {
    const confirm = jest.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    mockAuthenticatedRequest.mockResolvedValue({ data: { success: true, data: { ...tokens[0], revokedAt: 'now' } } });
    render(<IntegrationsPage />);

    expect(screen.getAllByText('ops@example.com')).toHaveLength(2);
    expect(screen.getByText('Revoked')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Revoke old' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Revoke grokbot' }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(mockAuthenticatedRequest).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Revoke grokbot' }));
    await waitFor(() => expect(mockAuthenticatedRequest).toHaveBeenCalledWith(
      '/admin/platform/access-tokens/tok-1/revoke',
      { method: 'POST' },
    ));
    await waitFor(() => expect(mockRefetchTokens).toHaveBeenCalled());
  });

  it('shows the API error when the session has not passed MFA', async () => {
    mockAuthenticatedRequest.mockResolvedValue({ error: MFA_MESSAGE, code: 403, errorCode: 'ADMIN_MFA_REQUIRED' });
    render(<IntegrationsPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Create token' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(MFA_MESSAGE);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    const webhook = screen.getByRole('region', { name: 'Grokbot webhook' });
    fireEvent.click(within(webhook).getByRole('button', { name: 'Save' }));
    expect(await within(webhook).findByRole('alert')).toHaveTextContent(MFA_MESSAGE);
  });

  it('keeps the key write-only and sends it only when typed', async () => {
    mockAuthenticatedRequest.mockResolvedValue({ data: { success: true, data: settings } });
    render(<IntegrationsPage />);
    const webhook = screen.getByRole('region', { name: 'Grokbot webhook' });

    const keyField = within(webhook).getByLabelText(/Routine key/);
    expect(keyField).toHaveAttribute('type', 'password');
    expect(keyField).toHaveValue('');
    expect(keyField).toHaveAttribute('placeholder', 'set, ends in ••••1234');
    expect(within(webhook).getByLabelText('Webhook URL')).toHaveValue(settings.webhookUrl);
    expect(within(webhook).getByLabelText('Send notices')).toBeChecked();

    fireEvent.click(within(webhook).getByLabelText('Send notices'));
    fireEvent.click(within(webhook).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(mockAuthenticatedRequest).toHaveBeenCalledWith(
      '/admin/platform/integrations/grokbot',
      expect.objectContaining({ method: 'PUT', data: { webhookUrl: settings.webhookUrl, enabled: false } }),
    ));
    await waitFor(() => expect(mockRefetchSettings).toHaveBeenCalled());

    fireEvent.change(keyField, { target: { value: 'new-routine-key' } });
    fireEvent.click(within(webhook).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(mockAuthenticatedRequest).toHaveBeenLastCalledWith(
      '/admin/platform/integrations/grokbot',
      expect.objectContaining({
        data: { webhookUrl: settings.webhookUrl, enabled: false, webhookKey: 'new-routine-key' },
      }),
    ));
    await waitFor(() => expect(keyField).toHaveValue(''));
  });

  it('sends a test and shows the returned status', async () => {
    mockAuthenticatedRequest.mockResolvedValue({ data: { success: true, data: { ok: false, status: 401, error: 'Webhook returned 401' } } });
    render(<IntegrationsPage />);
    const webhook = screen.getByRole('region', { name: 'Grokbot webhook' });

    fireEvent.click(within(webhook).getByRole('button', { name: 'Send test' }));
    expect(await within(webhook).findByRole('status')).toHaveTextContent('Not accepted: HTTP 401');
    expect(mockAuthenticatedRequest).toHaveBeenCalledWith('/admin/platform/integrations/grokbot/test', { method: 'POST' });
    expect(mockRefetchSettings).toHaveBeenCalled();
  });

  it('lists recent deliveries with their status or error', () => {
    render(<IntegrationsPage />);
    const table = screen.getByRole('table', { name: 'Recent deliveries' });
    expect(within(table).getByText('preview-ready')).toBeInTheDocument();
    expect(within(table).getByText('job:compose:1')).toBeInTheDocument();
    expect(within(table).getByText('HTTP 204')).toBeInTheDocument();
    expect(within(table).getByText('fetch failed')).toBeInTheDocument();
  });

  it('says when notices still come from the environment and no key is set', () => {
    mockFetches({
      settingsData: { ...settings, source: 'environment', keySet: false, keyLast4: null, deliveries: [] },
    });
    render(<IntegrationsPage />);
    expect(screen.getByText(/GROKBOT_CAROUSEL_WEBHOOK_URL/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Routine key/)).toHaveAttribute('placeholder', 'Not set');
    expect(screen.getByText('No deliveries yet.')).toBeInTheDocument();
  });
});
