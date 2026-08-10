import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import JustGoCreatorListingForm from './JustGoCreatorListingForm';
import justGoCreatorCopy from './justGoCreatorCopy';

const mockApiRequest = jest.fn();
const mockUseFetch = jest.fn();

jest.mock('../../utils/postRequest', () => ({
  __esModule: true,
  default: (...args) => mockApiRequest(...args),
}));

jest.mock('../../hooks/useFetch', () => ({
  useFetch: (...args) => mockUseFetch(...args),
}));

// The shared picker reads files via FileReader; a stub keeps this test about the payload.
jest.mock('../../components/ImageUpload/ImageUpload', () => ({
  __esModule: true,
  default: () => <div data-testid="image-upload" />,
}));

const copy = justGoCreatorCopy.form;

const TAGS = [
  { slug: 'live-music', label: 'live music' },
  { slug: 'market', label: 'market' },
];

function renderForm(props = {}) {
  return render(
    <MemoryRouter>
      <JustGoCreatorListingForm mode="create" {...props} />
    </MemoryRouter>,
  );
}

function setField(label, value) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function fillRequiredFields() {
  setField(copy.nameLabel, 'Rooftop listening party');
  setField(copy.locationLabel, 'Bushwick');
  setField(copy.hostNameLabel, 'Night Shift');
  setField(copy.startLabel, '2026-08-15T20:00');
}

function submit(label = copy.submitCreate) {
  fireEvent.click(screen.getByRole('button', { name: label }));
}

beforeEach(() => {
  mockApiRequest.mockReset();
  mockUseFetch.mockReset();
  mockUseFetch.mockReturnValue({
    data: { success: true, data: { tags: TAGS } },
    loading: false,
    error: null,
    refetch: jest.fn(),
  });
});

describe('JustGoCreatorListingForm — create', () => {
  it('blocks submit and flags the missing catalog fields without calling the API', async () => {
    renderForm();

    submit();

    expect(await screen.findByText(copy.validationSummary)).toBeInTheDocument();
    expect(mockApiRequest).not.toHaveBeenCalled();
    expect(screen.getByText(copy.errors.nameRequired)).toBeInTheDocument();
    expect(screen.getByText(copy.errors.locationRequired)).toBeInTheDocument();
    expect(screen.getByText(copy.errors.hostNameRequired)).toBeInTheDocument();
    expect(screen.getByText(copy.errors.startRequired)).toBeInTheDocument();
  });

  it('blocks an end time that is not after the start', async () => {
    renderForm();

    fillRequiredFields();
    setField(copy.endLabel, '2026-08-15T19:00');
    submit();

    expect(await screen.findByText(copy.errors.endBeforeStart)).toBeInTheDocument();
    expect(mockApiRequest).not.toHaveBeenCalled();
  });

  it('posts the canonical payload and never sends locked lifecycle fields', async () => {
    mockApiRequest.mockResolvedValue({
      success: true,
      data: { event: { _id: 'evt-1' }, batchWeek: '2026-W33' },
    });
    renderForm({ onCreated: jest.fn() });

    fillRequiredFields();
    submit();

    await waitFor(() => expect(mockApiRequest).toHaveBeenCalled());
    const [url, payload, options] = mockApiRequest.mock.calls[0];

    expect(url).toBe('/pivot/creator/events');
    expect(options).toEqual({ method: 'POST' });
    expect(payload).toMatchObject({
      name: 'Rooftop listening party',
      location: 'Bushwick',
      hostName: 'Night Shift',
    });
    expect(payload.start_time).toBe(new Date('2026-08-15T20:00').toISOString());
    expect(payload).not.toHaveProperty('ingestStatus');
    expect(payload).not.toHaveProperty('batchWeek');
    expect(payload).not.toHaveProperty('source');
  });

  it('hands the target drop week to the caller for the confirmation', async () => {
    const onCreated = jest.fn();
    mockApiRequest.mockResolvedValue({
      success: true,
      data: { event: { _id: 'evt-1' }, batchWeek: '2026-W33', ingestStatus: 'draft' },
    });
    renderForm({ onCreated });

    fillRequiredFields();
    submit();

    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(onCreated.mock.calls[0][0]).toMatchObject({
      batchWeek: '2026-W33',
      event: { _id: 'evt-1' },
    });
  });

  it('defaults the host name from the signed-in profile', () => {
    renderForm({ defaultHostName: 'Night Shift' });

    expect(screen.getByLabelText(copy.hostNameLabel)).toHaveValue('Night Shift');
  });

  it('sends selected catalog tags as slugs', async () => {
    mockApiRequest.mockResolvedValue({ success: true, data: { event: { _id: 'evt-1' } } });
    renderForm();

    fillRequiredFields();
    const tagGroup = within(screen.getByRole('group', { name: copy.tagsLabel }));
    fireEvent.click(tagGroup.getByRole('button', { name: 'live music' }));
    submit();

    await waitFor(() => expect(mockApiRequest).toHaveBeenCalled());
    expect(mockApiRequest.mock.calls[0][1].tags).toEqual(['live-music']);
  });

  it('attaches a server validation code to the field it belongs to', async () => {
    mockApiRequest.mockResolvedValue({
      error: 'At least one catalog tag is required.',
      code: 400,
      errorCode: 'TAGS_REQUIRED',
    });
    const onCreated = jest.fn();
    renderForm({ onCreated });

    fillRequiredFields();
    submit();

    expect(
      await screen.findByText('At least one catalog tag is required.'),
    ).toBeInTheDocument();
    expect(onCreated).not.toHaveBeenCalled();
  });

  it('surfaces a form-level failure that belongs to no single field', async () => {
    mockApiRequest.mockResolvedValue({
      error: 'You can only manage your own Just Go listings.',
      code: 403,
      errorCode: 'CREATOR_NOT_OWNER',
    });
    renderForm();

    fillRequiredFields();
    submit();

    expect(
      await screen.findByText('You can only manage your own Just Go listings.'),
    ).toBeInTheDocument();
  });

  it('degrades to a hint when the city has no catalog tags', () => {
    mockUseFetch.mockReturnValue({
      data: { success: true, data: { tags: [] } },
      loading: false,
      error: null,
      refetch: jest.fn(),
    });
    renderForm();

    expect(screen.getByText(copy.tagsEmpty)).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: copy.tagsLabel })).not.toBeInTheDocument();
  });
});

describe('JustGoCreatorListingForm — edit', () => {
  const EVENT = {
    _id: 'evt-9',
    name: 'Sunday flea',
    description: 'Open air.',
    location: 'Greenpoint',
    start_time: '2026-08-16T15:00:00.000Z',
    host: { name: 'Flea Crew' },
    tags: ['market'],
    ingestStatus: 'draft',
  };

  function renderEdit(props = {}) {
    return render(
      <MemoryRouter>
        <JustGoCreatorListingForm mode="edit" event={EVENT} {...props} />
      </MemoryRouter>,
    );
  }

  it('seeds fields from the existing listing', () => {
    renderEdit();

    expect(screen.getByLabelText(copy.nameLabel)).toHaveValue('Sunday flea');
    expect(screen.getByLabelText(copy.locationLabel)).toHaveValue('Greenpoint');
    expect(screen.getByLabelText(copy.hostNameLabel)).toHaveValue('Flea Crew');
  });

  it('patches the listing by id and confirms the save inline', async () => {
    const onSaved = jest.fn();
    mockApiRequest.mockResolvedValue({ success: true, data: { event: EVENT, updated: true } });
    renderEdit({ onSaved });

    setField(copy.nameLabel, 'Sunday flea market');
    submit(copy.submitEdit);

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const [url, payload, options] = mockApiRequest.mock.calls[0];

    expect(url).toBe('/pivot/creator/events/evt-9');
    expect(options).toEqual({ method: 'PATCH' });
    expect(payload.name).toBe('Sunday flea market');
    expect(screen.getByText(copy.savedNotice)).toBeInTheDocument();
  });
});
