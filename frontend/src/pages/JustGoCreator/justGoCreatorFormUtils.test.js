import {
  EMPTY_LISTING_FORM,
  buildListingPayload,
  fieldForServerErrorCode,
  fromDateTimeLocalValue,
  listingToFormState,
  toDateTimeLocalValue,
  validateListingForm,
} from './justGoCreatorFormUtils';
import justGoCreatorCopy from './justGoCreatorCopy';

const VALID_FORM = Object.freeze({
  ...EMPTY_LISTING_FORM,
  name: 'Rooftop listening party',
  location: 'Bushwick',
  hostName: 'Night Shift',
  start: '2026-08-15T20:00',
});

describe('validateListingForm', () => {
  it('accepts a form with every required catalog field', () => {
    expect(validateListingForm(VALID_FORM)).toEqual({ fieldErrors: {}, isValid: true });
  });

  it('blocks submit when the server-required fields are missing', () => {
    const { fieldErrors, isValid } = validateListingForm(EMPTY_LISTING_FORM);

    expect(isValid).toBe(false);
    expect(Object.keys(fieldErrors).sort()).toEqual(['hostName', 'location', 'name', 'start']);
  });

  it('flags each missing required field individually', () => {
    const errors = justGoCreatorCopy.form.errors;

    expect(validateListingForm({ ...VALID_FORM, name: '  ' }).fieldErrors.name).toBe(
      errors.nameRequired,
    );
    expect(validateListingForm({ ...VALID_FORM, location: '' }).fieldErrors.location).toBe(
      errors.locationRequired,
    );
    expect(validateListingForm({ ...VALID_FORM, hostName: '' }).fieldErrors.hostName).toBe(
      errors.hostNameRequired,
    );
    expect(validateListingForm({ ...VALID_FORM, start: '' }).fieldErrors.start).toBe(
      errors.startRequired,
    );
  });

  it('rejects an end time that is not after the start', () => {
    const { fieldErrors, isValid } = validateListingForm({
      ...VALID_FORM,
      end: '2026-08-15T19:00',
    });

    expect(isValid).toBe(false);
    expect(fieldErrors.end).toBe(justGoCreatorCopy.form.errors.endBeforeStart);
  });

  it('allows an omitted end time', () => {
    expect(validateListingForm({ ...VALID_FORM, end: '' }).isValid).toBe(true);
  });

  it('requires an http(s) scheme on the ticket link when one is given', () => {
    expect(
      validateListingForm({ ...VALID_FORM, externalLink: 'tickets.example.com' }).fieldErrors
        .externalLink,
    ).toBe(justGoCreatorCopy.form.errors.externalLinkInvalid);
    expect(
      validateListingForm({ ...VALID_FORM, externalLink: 'https://tickets.example.com' }).isValid,
    ).toBe(true);
  });
});

describe('buildListingPayload', () => {
  it('sends the canonical creator field names', () => {
    const payload = buildListingPayload(
      { ...VALID_FORM, description: ' Bring a friend. ', externalLink: ' https://t.co/x ', tags: ['live-music'] },
      { mode: 'create' },
    );

    expect(payload).toEqual({
      name: 'Rooftop listening party',
      description: 'Bring a friend.',
      location: 'Bushwick',
      hostName: 'Night Shift',
      start_time: new Date('2026-08-15T20:00').toISOString(),
      end_time: null,
      externalLink: 'https://t.co/x',
      tags: ['live-music'],
    });
  });

  it('never sends lifecycle fields the service locks', () => {
    const payload = buildListingPayload(VALID_FORM, { mode: 'create' });

    expect(payload).not.toHaveProperty('ingestStatus');
    expect(payload).not.toHaveProperty('batchWeek');
    expect(payload).not.toHaveProperty('source');
    expect(payload).not.toHaveProperty('platformManaged');
  });

  it('omits the cover on create — the file uploads after the listing exists', () => {
    const payload = buildListingPayload(
      { ...VALID_FORM, coverFile: new File(['x'], 'cover.png') },
      { mode: 'create' },
    );

    expect(payload).not.toHaveProperty('image');
  });

  it('leaves an untouched cover alone on edit', () => {
    const payload = buildListingPayload(
      { ...VALID_FORM, coverUrl: 'https://cdn.example.com/a.png' },
      { mode: 'edit' },
    );

    expect(payload).not.toHaveProperty('image');
  });

  it('clears the cover on edit only when the creator explicitly removed it', () => {
    const payload = buildListingPayload(
      { ...VALID_FORM, coverUrl: 'https://cdn.example.com/a.png', coverCleared: true },
      { mode: 'edit' },
    );

    expect(payload.image).toBeNull();
  });

  it('does not clear the cover when a replacement file is queued', () => {
    const payload = buildListingPayload(
      {
        ...VALID_FORM,
        coverCleared: true,
        coverFile: new File(['x'], 'cover.png'),
      },
      { mode: 'edit' },
    );

    expect(payload).not.toHaveProperty('image');
  });
});

describe('datetime-local conversion', () => {
  it('round-trips a local datetime through ISO', () => {
    const iso = fromDateTimeLocalValue('2026-08-15T20:00');

    expect(toDateTimeLocalValue(iso)).toBe('2026-08-15T20:00');
  });

  it('returns null for empty or unparseable input', () => {
    expect(fromDateTimeLocalValue('')).toBeNull();
    expect(fromDateTimeLocalValue(null)).toBeNull();
    expect(fromDateTimeLocalValue('not-a-date')).toBeNull();
  });

  it('returns an empty string when there is no datetime to show', () => {
    expect(toDateTimeLocalValue(null)).toBe('');
    expect(toDateTimeLocalValue('not-a-date')).toBe('');
  });
});

describe('listingToFormState', () => {
  it('seeds the form from a serialized listing', () => {
    const form = listingToFormState({
      _id: 'evt-1',
      name: 'Sunday flea',
      description: 'Open air.',
      location: 'Greenpoint',
      start_time: '2026-08-16T15:00:00.000Z',
      end_time: null,
      host: { name: 'Flea Crew' },
      externalLink: 'https://tickets.example.com',
      tags: ['market'],
      image: 'https://cdn.example.com/a.png',
    });

    expect(form).toMatchObject({
      name: 'Sunday flea',
      description: 'Open air.',
      location: 'Greenpoint',
      hostName: 'Flea Crew',
      externalLink: 'https://tickets.example.com',
      tags: ['market'],
      coverUrl: 'https://cdn.example.com/a.png',
      end: '',
    });
    expect(form.start).not.toBe('');
  });

  it('falls back to the flat organizer name when host is absent', () => {
    expect(listingToFormState({ organizerName: 'Legacy Host' }).hostName).toBe('Legacy Host');
  });

  it('returns a blank form for a missing listing', () => {
    expect(listingToFormState(null)).toEqual(EMPTY_LISTING_FORM);
  });
});

describe('fieldForServerErrorCode', () => {
  it('routes catalog tag failures to the tag picker', () => {
    expect(fieldForServerErrorCode('TAGS_REQUIRED')).toBe('tags');
    expect(fieldForServerErrorCode('INVALID_TAG')).toBe('tags');
  });

  it('routes field-specific codes to their field', () => {
    expect(fieldForServerErrorCode('INVALID_START_TIME')).toBe('start');
    expect(fieldForServerErrorCode('INVALID_END_TIME')).toBe('end');
    expect(fieldForServerErrorCode('HOST_NAME_REQUIRED')).toBe('hostName');
  });

  it('leaves ownership and lifecycle failures at form level', () => {
    expect(fieldForServerErrorCode('CREATOR_NOT_OWNER')).toBeNull();
    expect(fieldForServerErrorCode('CREATOR_EDIT_LOCKED')).toBeNull();
    expect(fieldForServerErrorCode(undefined)).toBeNull();
  });
});
