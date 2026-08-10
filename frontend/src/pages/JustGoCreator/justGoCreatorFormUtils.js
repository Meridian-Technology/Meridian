import justGoCreatorCopy from './justGoCreatorCopy';

/**
 * Form-state helpers for the shared create/edit listing form.
 *
 * The creator write path (`POST` / `PATCH /pivot/creator/events`) owns the lifecycle: it stamps
 * `source`, `platformManaged`, `ingestStatus` and derives `batchWeek` from the event start. The
 * form must therefore **never** send `ingestStatus`, `batchWeek`, `source` or `platformManaged` —
 * the service rejects the first two outright (`CREATOR_INGEST_STATUS_LOCKED`,
 * `CREATOR_BATCH_WEEK_LOCKED`) and silently ignores the rest.
 */

export const EMPTY_LISTING_FORM = Object.freeze({
  name: '',
  description: '',
  start: '',
  end: '',
  location: '',
  hostName: '',
  externalLink: '',
  tags: [],
  coverFile: null,
  coverUrl: null,
  coverCleared: false,
});

/** Server validation codes mapped onto the field that should show the message. */
const SERVER_ERROR_FIELDS = Object.freeze({
  INVALID_NAME: 'name',
  INVALID_LOCATION: 'location',
  HOST_NAME_REQUIRED: 'hostName',
  INVALID_START_TIME: 'start',
  INVALID_END_TIME: 'end',
  TAGS_REQUIRED: 'tags',
  INVALID_TAG: 'tags',
});

/** @returns {string|null} field key to attach a server error message to, or null for form-level. */
export function fieldForServerErrorCode(code) {
  return SERVER_ERROR_FIELDS[code] || null;
}

function pad(value) {
  return String(value).padStart(2, '0');
}

/** ISO datetime → `datetime-local` input value in the viewer's timezone. */
export function toDateTimeLocalValue(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/** `datetime-local` input value (local time) → ISO string, or null when empty/unparseable. */
export function fromDateTimeLocalValue(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

/** Seed form state from a serialized creator listing (edit mode). */
export function listingToFormState(event) {
  if (!event) return { ...EMPTY_LISTING_FORM };
  return {
    ...EMPTY_LISTING_FORM,
    name: event.name || '',
    description: event.description || '',
    start: toDateTimeLocalValue(event.start_time),
    end: toDateTimeLocalValue(event.end_time),
    location: event.location || '',
    hostName: event.host?.name || event.organizerName || '',
    externalLink: event.externalLink || '',
    tags: Array.isArray(event.tags) ? [...event.tags] : [],
    coverUrl: event.image || null,
  };
}

function isHttpUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Client validation mirroring the service's required catalog fields (`name`, `location`,
 * `hostName`, `start_time`) so submit is blocked before a round trip.
 *
 * End time is a hard error rather than a silent fix: the service would quietly rewrite an end
 * that is not after the start to `start + 2h`, which is worse than telling the creator.
 */
export function validateListingForm(form) {
  const copy = justGoCreatorCopy.form.errors;
  const fieldErrors = {};

  if (!form.name?.trim()) fieldErrors.name = copy.nameRequired;
  if (!form.location?.trim()) fieldErrors.location = copy.locationRequired;
  if (!form.hostName?.trim()) fieldErrors.hostName = copy.hostNameRequired;

  const startIso = fromDateTimeLocalValue(form.start);
  if (!form.start?.trim()) {
    fieldErrors.start = copy.startRequired;
  } else if (!startIso) {
    fieldErrors.start = copy.startInvalid;
  }

  if (form.end?.trim()) {
    const endIso = fromDateTimeLocalValue(form.end);
    if (!endIso) {
      fieldErrors.end = copy.endInvalid;
    } else if (startIso && new Date(endIso) <= new Date(startIso)) {
      fieldErrors.end = copy.endBeforeStart;
    }
  }

  if (form.externalLink?.trim() && !isHttpUrl(form.externalLink.trim())) {
    fieldErrors.externalLink = copy.externalLinkInvalid;
  }

  return { fieldErrors, isValid: Object.keys(fieldErrors).length === 0 };
}

function trimmedOrNull(value) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Build the JSON body for create or update.
 *
 * Cover images are never sent as part of create — the file is uploaded after the listing exists
 * (the service only accepts an image **URL**, and the upload route needs an event id). On update
 * `image: null` is sent only when the creator explicitly cleared an existing cover, so an
 * untouched cover is never clobbered.
 */
export function buildListingPayload(form, { mode = 'create' } = {}) {
  const payload = {
    name: form.name.trim(),
    description: form.description?.trim() || '',
    location: form.location.trim(),
    hostName: form.hostName.trim(),
    start_time: fromDateTimeLocalValue(form.start),
    end_time: fromDateTimeLocalValue(form.end),
    externalLink: trimmedOrNull(form.externalLink),
    tags: Array.isArray(form.tags) ? form.tags : [],
  };

  if (mode === 'edit' && form.coverCleared && !form.coverFile) {
    payload.image = null;
  }

  return payload;
}
