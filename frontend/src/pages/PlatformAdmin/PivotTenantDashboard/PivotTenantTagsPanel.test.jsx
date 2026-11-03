import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import PivotTenantTagsPanel, { formatTagNumber, summarizeTags, tagStatus } from './PivotTenantTagsPanel';

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

const TAGS = [
  { id: 't3', number: 3, status: 'active', note: '', writtenAt: null, createdAt: '2026-10-18T00:00:00.000Z' },
  { id: 't2', number: 2, status: 'revoked', note: 'lost', writtenAt: '2026-10-18T01:00:00.000Z', createdAt: '2026-10-18T00:00:00.000Z' },
  { id: 't1', number: 1, status: 'active', note: 'black, batch 1', writtenAt: '2026-10-18T01:00:00.000Z', createdAt: '2026-10-18T00:00:00.000Z' },
];

function respondWith(tags, refetch = jest.fn()) {
  mockUseFetch.mockReturnValue({
    data: { success: true, data: { tenantKey: 'sf', cityDisplayName: 'San Francisco', tags } },
    loading: false,
    error: null,
    refetch,
  });
  return refetch;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('helpers', () => {
  it('prints numbers like the tag and sorts tags into states', () => {
    expect(formatTagNumber(7)).toBe('№007');
    expect(TAGS.map((tag) => tagStatus(tag).label)).toEqual(['Not written', 'Retired', 'Written']);
    expect(summarizeTags(TAGS)).toEqual({ made: 3, written: 1, unwritten: 1, retired: 1 });
  });
});

describe('PivotTenantTagsPanel', () => {
  it('loads the city\'s tags and lists them with status and note', () => {
    respondWith(TAGS);
    render(<PivotTenantTagsPanel tenantKey="sf" cityDisplayName="San Francisco" />);
    expect(mockUseFetch).toHaveBeenCalledWith('/admin/pivot/tenants/sf/tags', expect.anything());
    expect(screen.getByText(/NFC dog tags for San Francisco/)).toBeInTheDocument();
    expect(screen.getByText('№001')).toBeInTheDocument();
    expect(screen.getByText('black, batch 1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Restore №002' })).toBeInTheDocument();
  });

  it('retires a tag after confirming, then refreshes', async () => {
    const refetch = respondWith(TAGS);
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    mockAuthenticatedRequest.mockResolvedValue({ data: { success: true } });
    render(<PivotTenantTagsPanel tenantKey="sf" />);

    fireEvent.click(screen.getByRole('button', { name: 'Retire №001' }));
    await waitFor(() => expect(refetch).toHaveBeenCalled());
    expect(mockAuthenticatedRequest).toHaveBeenCalledWith(
      '/admin/pivot/tenants/sf/tags/t1/status',
      expect.objectContaining({ method: 'POST', data: { status: 'revoked' } }),
    );
  });

  it('does nothing when the retire is cancelled, and restores without asking', async () => {
    respondWith(TAGS);
    jest.spyOn(window, 'confirm').mockReturnValue(false);
    mockAuthenticatedRequest.mockResolvedValue({ data: { success: true } });
    render(<PivotTenantTagsPanel tenantKey="sf" />);

    fireEvent.click(screen.getByRole('button', { name: 'Retire №001' }));
    expect(mockAuthenticatedRequest).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Restore №002' }));
    await waitFor(() =>
      expect(mockAuthenticatedRequest).toHaveBeenCalledWith(
        '/admin/pivot/tenants/sf/tags/t2/status',
        expect.objectContaining({ data: { status: 'active' } }),
      ),
    );
  });

  it('points to the app when the city has no tags', () => {
    respondWith([]);
    render(<PivotTenantTagsPanel tenantKey="sf" />);
    expect(screen.getByText(/No dog tags in San Francisco yet/)).toBeInTheDocument();
  });
});
