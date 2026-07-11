import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useFetch, authenticatedRequest } from '../../../hooks/useFetch';
import { useNotification } from '../../../NotificationContext';
import {
  toIsoWeek,
  isValidIsoWeek,
  shiftIsoWeek,
  formatEventWhen,
  formatSnapshotAge,
  formatPivotDeckWhen,
} from '../../../utils/pivotIsoWeek';
import { PivotDeckPhonePreview, DeckPreviewModal } from './PivotDeckCardPreview';
import PivotTagMultiSelect from './PivotTagMultiSelect';
import PivotLabOverview from './PivotLabOverview';
import PivotManualImportModal, {
  isTypingTarget,
  manualDraftToImportEntry,
  applyMovieMetadataToDraft,
} from './PivotManualImportModal';
import PivotCatalogEventEditModal, {
  catalogEditDraftToOverrides,
} from './PivotCatalogEventEditModal';
import IngestStatusPill from './IngestStatusPill';
import PivotImportThumb from './PivotImportThumb';
import {
  autoMatchTmdbMovieForEvent,
  autoMatchFilmsForImportEntries,
  isFilmImportCandidate,
} from './pivotTmdbClient';
import '../TenantManagement/TenantManagementPage.scss';
import './PivotLabPage.scss';
import './PivotDeckCardPreview.scss';

const EMPTY_LIST = [];
const NO_FETCH_CACHE = { enabled: false };
const PURGE_CONFIRM_TOKEN = 'PURGE';
// Batch tag suggestion runs one Claude call per event server-side; sending the whole
// selection in a single request can exceed the production gateway timeout (bare 503).
// Split it into small chunks so each request stays short and results save incrementally.
const AI_TAG_CHUNK_SIZE = 4;

const PIVOT_JSON_IMPORT_EXAMPLE = `{
  "label": "Brooklyn week crawl",
  "events": [
    {
      "source": "manual",
      "name": "Board Game Night",
      "hostName": "Brooklyn Board Game Cafe",
      "location": "123 Main St, Brooklyn, NY",
      "start_time": "2026-05-28T19:00:00.000Z",
      "description": "Weekly open board game night.",
      "image": "https://example.com/poster.jpg",
      "tags": ["board-games", "social"],
      "sourceUrl": "https://example.com/events/board-game-night"
    },
    {
      "source": "manual",
      "name": "Indie Film Night — The Last Garden",
      "hostName": "Nitehawk Cinema",
      "location": "136 Metropolitan Ave, Brooklyn, NY",
      "start_time": "2026-05-29T22:00:00.000Z",
      "end_time": "2026-05-30T05:15:00.000Z",
      "description": "Limited run — pick your showtime in the app.",
      "tags": ["film-and-tv", "art-and-culture"],
      "sourceUrl": "https://example.com/events/indie-film-night",
      "movie": {
        "tmdbId": 12345,
        "title": "The Last Garden",
        "year": 2026,
        "synopsis": "A gardener discovers a hidden world beneath the city.",
        "posterUrl": "https://example.com/film-poster.jpg",
        "runtimeMinutes": 118,
        "genres": ["drama", "sci-fi"],
        "contentRating": "PG-13",
        "ratings": { "tmdb": { "score": 7.8, "voteCount": 1240 } }
      },
      "timeSlots": [
        {
          "id": "6pm",
          "label": "6:00 PM",
          "start_time": "2026-05-29T22:00:00.000Z",
          "end_time": "2026-05-30T00:15:00.000Z"
        },
        {
          "id": "830pm",
          "label": "8:30 PM",
          "start_time": "2026-05-30T00:30:00.000Z",
          "end_time": "2026-05-30T02:45:00.000Z"
        },
        {
          "id": "11pm",
          "label": "11:00 PM",
          "start_time": "2026-05-30T03:00:00.000Z",
          "end_time": "2026-05-30T05:15:00.000Z"
        }
      ]
    }
  ]
}`;

const PIVOT_JSON_IMPORT_AGENT_PROMPT = `You are preparing events for the Just Go weekly local-events pilot (internal code name Pivot). Output a single JSON object only — no markdown fences, no commentary.

Schema:
{
  "label": "optional batch label for ops",
  "events": [
    {
      "source": "optional — manual | partiful | luma (default manual)",
      "sourceUrl": "optional — original listing or ticket URL (any site)",
      "name": "required — event title",
      "hostName": "required — display organizer (venue or host name users see)",
      "location": "required — venue or neighborhood",
      "start_time": "required — ISO-8601 datetime, e.g. 2026-05-28T19:00:00.000Z",
      "end_time": "optional — ISO-8601 datetime",
      "description": "optional — short listing copy",
      "image": "optional — poster image URL",
      "tags": ["required for publish — 1+ catalog slugs, kebab-case"],
      "sourceTags": ["optional — hints from the listing, not validated"],
      "timeSlots": [
        {
          "id": "required per slot — stable slug, e.g. 6pm or matinee",
          "label": "optional — display label, e.g. 6:00 PM",
          "start_time": "required — ISO-8601 datetime for this showtime",
          "end_time": "optional — ISO-8601 datetime"
        }
      ]
    }
  ]
}

Rules:
- Events do not have to come from Partiful or Luma. Use source: "manual" when there is no platform listing.
- sourceUrl is optional but recommended when a public listing or ticket page exists (Eventbrite, venue site, Instagram, etc.).
- hostName is the public-facing organizer, not "Meridian" or the city name.
- tags must use active Pivot catalog slugs only: live-music, board-games, food-and-drink, outdoors, art-and-culture, nightlife, fitness, tech, comedy, film-and-tv, wellness, gaming, dance, volunteering, markets-and-fairs, workshops, family-friendly, social.
- Use timeSlots for movies, theatre, and other multi-showtime listings. Each slot needs a unique id plus start_time; omit timeSlots for single-start events.
- When timeSlots is present, set top-level start_time to the earliest showtime and end_time to the latest (used for feed windowing).
- For film screenings, tag with film-and-tv and use the film title as name — TMDB metadata is matched automatically when you preview or load JSON in Pivot Lab. You can omit the movie object in agent output.
- Use null or omit fields you cannot verify; do not invent URLs or times.
- Prefer UTC or include an explicit timezone offset in start_time.

Example:
${PIVOT_JSON_IMPORT_EXAMPLE}`;

function trimImportString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function buildImportShowtimeId(label, startTime, index, usedIds) {
  const fromLabel = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (fromLabel) {
    let candidate = fromLabel;
    let suffix = 2;
    while (usedIds.has(candidate)) {
      candidate = `${fromLabel}-${suffix}`;
      suffix += 1;
    }
    return candidate;
  }

  if (startTime) {
    const parsed = new Date(startTime);
    if (!Number.isNaN(parsed.getTime())) {
      const hours = String(parsed.getHours()).padStart(2, '0');
      const minutes = String(parsed.getMinutes()).padStart(2, '0');
      let candidate = `${hours}${minutes}`;
      let suffix = 2;
      while (usedIds.has(candidate)) {
        candidate = `${hours}${minutes}-${suffix}`;
        suffix += 1;
      }
      return candidate;
    }
  }

  let candidate = `slot-${index + 1}`;
  let suffix = 2;
  while (usedIds.has(candidate)) {
    candidate = `slot-${index + 1}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function normalizeImportTimeSlots(rawSlots) {
  if (!Array.isArray(rawSlots)) {
    return [];
  }

  const slots = [];
  const seenIds = new Set();

  for (const [index, raw] of rawSlots.entries()) {
    if (!raw || typeof raw !== 'object') {
      continue;
    }

    const start_time = trimImportString(raw.start_time || raw.startTime);
    if (!start_time) {
      continue;
    }

    const label = trimImportString(raw.label);
    let id = trimImportString(raw.id);
    if (!id || seenIds.has(id)) {
      id = buildImportShowtimeId(label, start_time, index, seenIds);
    }

    seenIds.add(id);
    const end_time = trimImportString(raw.end_time || raw.endTime);

    slots.push({
      id,
      start_time,
      ...(end_time ? { end_time } : {}),
      ...(label ? { label } : {}),
    });
  }

  slots.sort(
    (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime(),
  );

  return slots;
}

function deriveImportEventWindowFromTimeSlots(timeSlots) {
  if (!Array.isArray(timeSlots) || !timeSlots.length) {
    return { start_time: '', end_time: '' };
  }

  const start_time = timeSlots[0].start_time;
  let end_time = timeSlots[0].end_time || timeSlots[0].start_time;
  for (const slot of timeSlots) {
    const candidate = slot.end_time || slot.start_time;
    if (new Date(candidate).getTime() > new Date(end_time).getTime()) {
      end_time = candidate;
    }
  }

  return { start_time, end_time };
}

function buildBatchPublishOverrides(row) {
  const timeSlots = Array.isArray(row.timeSlots) ? row.timeSlots : [];
  const derivedWindow = timeSlots.length ? deriveImportEventWindowFromTimeSlots(timeSlots) : null;
  const startTime = trimImportString(row.startTime) || derivedWindow?.start_time || '';
  const endTime = trimImportString(row.endTime) || derivedWindow?.end_time || '';

  return {
    hostName: row.organizerName.trim(),
    name: row.name.trim(),
    location: row.location.trim(),
    ...(startTime ? { start_time: startTime } : {}),
    ...(endTime ? { end_time: endTime } : {}),
    description: row.description.trim() || undefined,
    image: row.imageUrl.trim() || undefined,
    source: row.source || 'manual',
    sourceUrl: row.sourceUrl.trim() || undefined,
    tags: row.tags,
    ...(timeSlots.length ? { timeSlots } : {}),
    ...(row.movie ? { movie: row.movie } : {}),
  };
}

function formatEventTimeSlots(timeSlots) {
  if (!Array.isArray(timeSlots) || !timeSlots.length) {
    return '—';
  }
  if (timeSlots.length === 1) {
    return formatEventWhen(timeSlots[0].start_time);
  }
  return `${timeSlots.length} showtimes`;
}

function normalizeJsonImportEvent(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }

  const nestedDraft = raw.draft && typeof raw.draft === 'object' ? raw.draft : null;
  const host =
    raw.host && typeof raw.host === 'object'
      ? raw.host
      : nestedDraft?.host && typeof nestedDraft.host === 'object'
        ? nestedDraft.host
        : null;

  const sourceUrl = trimImportString(
    raw.sourceUrl || raw.url || raw.externalLink || nestedDraft?.sourceUrl || nestedDraft?.url,
  );
  const name = trimImportString(raw.name || nestedDraft?.name);
  const hostName = trimImportString(
    raw.hostName || raw.organizerName || host?.name || nestedDraft?.hostName || nestedDraft?.organizerName,
  );
  const location = trimImportString(raw.location || nestedDraft?.location);
  const start_time = trimImportString(raw.start_time || raw.startTime || nestedDraft?.start_time);
  const end_time = trimImportString(raw.end_time || raw.endTime || nestedDraft?.end_time);
  const description = trimImportString(raw.description || nestedDraft?.description);
  const image = trimImportString(raw.image || raw.imageUrl || nestedDraft?.image || nestedDraft?.imageUrl);
  const source = trimImportString(raw.source || nestedDraft?.source) || 'manual';
  const tags = Array.isArray(raw.tags)
    ? raw.tags
    : Array.isArray(nestedDraft?.tags)
      ? nestedDraft.tags
      : [];
  const sourceTags = Array.isArray(raw.sourceTags)
    ? raw.sourceTags
    : Array.isArray(nestedDraft?.sourceTags)
      ? nestedDraft.sourceTags
      : [];
  const timeSlots = normalizeImportTimeSlots(raw.timeSlots ?? nestedDraft?.timeSlots);
  const movie = raw.movie ?? nestedDraft?.movie ?? null;

  let resolvedStartTime = start_time;
  let resolvedEndTime = end_time;

  if (timeSlots.length) {
    const window = deriveImportEventWindowFromTimeSlots(timeSlots);
    if (!resolvedStartTime) {
      resolvedStartTime = window.start_time;
    }
    if (!resolvedEndTime) {
      resolvedEndTime = window.end_time;
    }
  }

  if (!sourceUrl && !name && !hostName && !location && !resolvedStartTime && !timeSlots.length) {
    return null;
  }

  const warnings = [];
  if (!name) warnings.push('Missing event title (name).');
  if (!hostName) warnings.push('Missing organizer (hostName).');
  if (!location) warnings.push('Missing location.');
  if (!resolvedStartTime && !timeSlots.length) warnings.push('Missing start_time.');
  if (!tags.length) warnings.push('No catalog tags — pick or suggest tags before publishing.');
  if (timeSlots.length) {
    const slotIds = new Set();
    for (const slot of timeSlots) {
      if (slotIds.has(slot.id)) {
        warnings.push(`Duplicate showtime id "${slot.id}".`);
      }
      slotIds.add(slot.id);
    }
  }

  return {
    sourceUrl,
    draft: {
      name,
      hostName,
      location,
      start_time: resolvedStartTime,
      end_time: resolvedEndTime || undefined,
      description,
      image,
      sourceUrl,
      source,
      sourceTags,
      tags,
      ...(timeSlots.length ? { timeSlots } : {}),
      ...(movie ? { movie } : {}),
    },
    warnings: [...(Array.isArray(raw.warnings) ? raw.warnings : []), ...warnings],
  };
}

function extractJsonImportEvents(parsed) {
  if (Array.isArray(parsed)) {
    return { label: 'JSON import', events: parsed };
  }

  if (!parsed || typeof parsed !== 'object') {
    return { label: 'JSON import', events: [] };
  }

  const label = trimImportString(parsed.label || parsed.listLabel) || 'JSON import';
  const events = parsed.events || parsed.drafts || parsed.items;
  if (Array.isArray(events)) {
    return { label, events };
  }

  const single = normalizeJsonImportEvent(parsed);
  if (single) {
    return { label, events: [single] };
  }

  return { label, events: [] };
}

function parsePivotJsonImport(text) {
  const trimmed = text.trim();
  if (!trimmed) {
    return { error: 'Paste JSON from an agent or export.' };
  }

  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch (err) {
    return { error: `Invalid JSON: ${err.message}` };
  }

  const { label, events: rawEvents } = extractJsonImportEvents(parsed);
  const entries = rawEvents
    .map((raw) => normalizeJsonImportEvent(raw))
    .filter(Boolean);

  if (!entries.length) {
    return { error: 'No events found. Use { "events": [ … ] } or a top-level array.' };
  }

  return { label, entries };
}

function isJsonImportEntryReady(entry) {
  const draft = entry?.draft || {};
  const hasWhen = Boolean(draft.start_time || draft.timeSlots?.length);
  return Boolean(
    draft.hostName && draft.name && draft.location && hasWhen && draft.tags?.length,
  );
}

function buildJsonImportPreviewDocument(preview) {
  if (!preview?.entries) return '';
  return JSON.stringify(
    {
      label: preview.label,
      events: preview.entries.map((entry) => entry.draft),
    },
    null,
    2,
  );
}

function buildDeckPreviewProps({
  name,
  organizerName,
  startTime,
  endTime,
  location,
  description,
  imageUrl,
  timeSlots,
}) {
  const derivedWindow =
    Array.isArray(timeSlots) && timeSlots.length
      ? deriveImportEventWindowFromTimeSlots(timeSlots)
      : null;
  const resolvedStart = startTime || derivedWindow?.start_time || '';
  const resolvedEnd = endTime || derivedWindow?.end_time || '';
  const whenLabel =
    Array.isArray(timeSlots) && timeSlots.length > 1
      ? `${timeSlots.length} showtimes`
      : formatPivotDeckWhen(resolvedStart, resolvedEnd);
  return {
    title: name,
    hostName: organizerName,
    whenLabel: whenLabel || undefined,
    locationLabel: location || undefined,
    description: description || undefined,
    imageUrl: imageUrl || undefined,
  };
}

function isBlockingImportDuplicate(duplicate) {
  if (!duplicate) return false;
  // sourceUrl and fingerprint matches update an existing catalog event; only collisions
  // between two rows of the same import batch have nothing to update against.
  return duplicate.matchType === 'batchSourceUrl' || duplicate.matchType === 'batchFingerprint';
}

function duplicateBadgeLabel(duplicate) {
  if (!duplicate) return null;
  if (duplicate.matchType === 'batchSourceUrl' || duplicate.matchType === 'batchFingerprint') {
    return 'Batch duplicate';
  }
  // sourceUrl (exact) or fingerprint (fuzzy) → publishing updates the existing row.
  return 'Will update';
}

function createBatchImportRow(entry, index) {
  const draft = entry?.draft || {};
  const duplicate = entry?.duplicate || null;
  const isBlockingDuplicate = isBlockingImportDuplicate(duplicate);
  const sourceUrl = entry?.sourceUrl || draft.sourceUrl || '';
  const tags = Array.isArray(draft.tags) ? draft.tags : [];
  const timeSlots = Array.isArray(draft.timeSlots) ? draft.timeSlots : [];
  const movie = draft.movie || null;
  const derivedWindow = timeSlots.length ? deriveImportEventWindowFromTimeSlots(timeSlots) : null;
  const startTime = draft.start_time || derivedWindow?.start_time || '';
  const endTime = draft.end_time || derivedWindow?.end_time || undefined;
  const hasRequiredFields = Boolean(
    draft.hostName &&
      draft.name &&
      draft.location &&
      (startTime || timeSlots.length) &&
      tags.length > 0,
  );

  return {
    key: sourceUrl || `batch-row-${index}`,
    selected: hasRequiredFields && !isBlockingDuplicate,
    sourceUrl,
    source: draft.source || 'manual',
    name: draft.name || '',
    organizerName: draft.hostName || '',
    location: draft.location || '',
    startTime,
    endTime,
    description: draft.description || '',
    imageUrl: draft.image || '',
    sourceTags: Array.isArray(draft.sourceTags) ? draft.sourceTags : [],
    tags,
    timeSlots,
    movie,
    aiTagged: false,
    warnings: entry?.warnings || [],
    duplicate,
    isBlockingDuplicate,
    duplicateLabel: duplicateBadgeLabel(duplicate),
  };
}

function formatEventTags(tags) {
  if (!Array.isArray(tags) || !tags.length) return '—';
  if (tags.length === 1) return tags[0];
  return `${tags[0]} +${tags.length - 1}`;
}

function applyMovieMetadataToImportDraft(draft, movie) {
  const applied = applyMovieMetadataToDraft(movie);
  return {
    ...draft,
    movie: applied.movie,
    name: applied.name || draft.name,
    description: applied.description || draft.description,
    image: applied.imageUrl || draft.image,
  };
}

function applyMovieMetadataToBatchRow(row, movie) {
  const applied = applyMovieMetadataToDraft(movie);
  return {
    ...row,
    movie: applied.movie,
    name: applied.name || row.name,
    description: applied.description || row.description,
    imageUrl: applied.imageUrl || row.imageUrl,
  };
}

function formatEventFilmStatus(draft) {
  const movie = draft?.movie;
  if (movie?.title) {
    return movie.year ? `${movie.title} (${movie.year})` : movie.title;
  }
  if (isFilmImportCandidate(draft || {})) {
    return 'Needs TMDB';
  }
  return '—';
}

const LAB_TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'import', label: 'Import' },
  { key: 'catalog', label: 'Catalog' },
  { key: 'notes', label: 'Notes' },
];

function PivotLabPage() {
  const { addNotification } = useNotification();
  const [activeTab, setActiveTab] = useState('overview');
  const [batchWeek, setBatchWeek] = useState(() => toIsoWeek());
  const [forceBatchWeek, setForceBatchWeek] = useState(false);
  const [selectedTenantKey, setSelectedTenantKey] = useState('');
  const [notesDraft, setNotesDraft] = useState('');
  const [notesDirty, setNotesDirty] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const [rebuildingSnapshot, setRebuildingSnapshot] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [importJsonDraft, setImportJsonDraft] = useState('');
  const [jsonImportPreview, setJsonImportPreview] = useState(null);
  const [importMode, setImportMode] = useState(null);
  const [importPreview, setImportPreview] = useState(null);
  const [importBatchLabel, setImportBatchLabel] = useState('');
  const [importBatchRows, setImportBatchRows] = useState([]);
  const [importWarnings, setImportWarnings] = useState([]);
  const [importDuplicate, setImportDuplicate] = useState(null);
  const [importProvider, setImportProvider] = useState('');
  const [importOrganizerName, setImportOrganizerName] = useState('');
  const [importSelectedTags, setImportSelectedTags] = useState([]);
  const [importSourceTags, setImportSourceTags] = useState([]);
  const [batchApplyTags, setBatchApplyTags] = useState([]);
  const [tmdbMatchLoadingKey, setTmdbMatchLoadingKey] = useState(null);
  const [tagSuggestLoadingKey, setTagSuggestLoadingKey] = useState(null);
  const [batchTagProgress, setBatchTagProgress] = useState(null);
  const [tagSeeding, setTagSeeding] = useState(false);
  const [importName, setImportName] = useState('');
  const [importLocation, setImportLocation] = useState('');
  const [importStartTime, setImportStartTime] = useState('');
  const [importDescription, setImportDescription] = useState('');
  const [importLoading, setImportLoading] = useState(false);
  const [importPublishLoading, setImportPublishLoading] = useState(false);
  const [importError, setImportError] = useState('');
  const [editingEvent, setEditingEvent] = useState(null);
  const [editSaving, setEditSaving] = useState(false);
  const [deckPreviewState, setDeckPreviewState] = useState(null);
  const [purgeScope, setPurgeScope] = useState('selected');
  const [purgeWeekScope, setPurgeWeekScope] = useState('week');
  const [purgeConfirm, setPurgeConfirm] = useState('');
  const [purgingCatalog, setPurgingCatalog] = useState(false);
  const [manualImportOpen, setManualImportOpen] = useState(false);
  const [manualImportSticky, setManualImportSticky] = useState({
    organizerName: '',
    location: '',
    tags: [],
    startTimeLocal: '',
    endTimeLocal: '',
    scheduleMode: 'single',
    timeSlots: [],
  });
  const [manualImportPublishLoading, setManualImportPublishLoading] = useState(false);

  const overviewParams = useMemo(() => ({ batchWeek }), [batchWeek]);
  const {
    data: overviewResponse,
    loading: overviewLoading,
    error: overviewError,
    refetch: refetchOverview,
  } = useFetch('/admin/pivot/overview', {
    params: overviewParams,
    cache: NO_FETCH_CACHE,
  });

  const retentionParams = useMemo(() => ({ batchWeek, weeks: 6 }), [batchWeek]);
  const {
    data: retentionResponse,
    loading: retentionLoading,
    error: retentionError,
  } = useFetch('/admin/pivot/retention', {
    params: retentionParams,
    cache: NO_FETCH_CACHE,
  });

  const eventsParams = useMemo(
    () => ({ batchWeek, tenantKey: selectedTenantKey }),
    [batchWeek, selectedTenantKey],
  );
  const eventsUrl = selectedTenantKey ? '/admin/pivot/events' : null;
  const {
    data: eventsResponse,
    loading: eventsLoading,
    error: eventsError,
    refetch: refetchEvents,
  } = useFetch(eventsUrl, {
    params: eventsParams,
    cache: NO_FETCH_CACHE,
  });

  const notesParams = useMemo(() => ({ batchWeek }), [batchWeek]);
  const {
    data: notesResponse,
    loading: notesLoading,
    refetch: refetchNotes,
  } = useFetch('/admin/pivot/interview-notes', {
    params: notesParams,
    cache: NO_FETCH_CACHE,
  });

  const {
    data: tagsResponse,
    loading: tagsLoading,
    refetch: refetchTags,
  } = useFetch('/admin/pivot/tags', {
    cache: NO_FETCH_CACHE,
  });

  const catalogTags = tagsResponse?.success ? (tagsResponse.data?.tags ?? EMPTY_LIST) : EMPTY_LIST;

  const handleSeedTagCatalog = useCallback(async () => {
    setTagSeeding(true);
    const { data, error } = await authenticatedRequest('/admin/pivot/tags/seed', {
      method: 'POST',
      data: {},
      headers: { 'Content-Type': 'application/json' },
    });
    setTagSeeding(false);

    if (error || !data?.success) {
      addNotification({
        title: 'Seed failed',
        message: error || data?.message || 'Unable to seed tag catalog',
        type: 'error',
      });
      return;
    }

    const { upserted, activeCount } = data.data || {};
    addNotification({
      title: 'Tag catalog seeded',
      message: `Upserted ${upserted} tags (${activeCount} active).`,
      type: 'success',
    });
    refetchTags();
  }, [addNotification, refetchTags]);

  const buildTagSuggestPayload = useCallback((fields) => ({
    name: fields.name?.trim() || undefined,
    description: fields.description?.trim() || undefined,
    location: fields.location?.trim() || undefined,
    hostName: fields.organizerName?.trim() || fields.hostName?.trim() || undefined,
    sourceTags: fields.sourceTags || undefined,
  }), []);

  const requestSuggestedTags = useCallback(async (payload) => {
    const { data, error } = await authenticatedRequest('/admin/pivot/ingest/suggest-tags', {
      method: 'POST',
      data: { event: payload },
    });

    if (error || !data?.success) {
      return {
        error: error || data?.message || 'Could not suggest tags.',
        code: data?.code,
      };
    }

    return { tags: data.data?.tags || [] };
  }, []);

  const overview = overviewResponse?.success ? overviewResponse.data : null;
  const tenants = overview?.tenants ?? EMPTY_LIST;
  const events = eventsResponse?.success
    ? (eventsResponse.data?.events ?? EMPTY_LIST)
    : EMPTY_LIST;
  const firstTenantKey = tenants[0]?.tenantKey ?? '';
  const referralRows = useMemo(
    () =>
      tenants.flatMap((tenant) =>
        (tenant.referralCodes || []).map((code) => ({
          ...code,
          cityDisplayName: tenant.cityDisplayName || tenant.tenantKey,
        })),
      ),
    [tenants],
  );

  useEffect(() => {
    if (!firstTenantKey) {
      setSelectedTenantKey((prev) => (prev === '' ? prev : ''));
      return;
    }
    setSelectedTenantKey((prev) =>
      prev && tenants.some((row) => row.tenantKey === prev) ? prev : firstTenantKey,
    );
  }, [firstTenantKey, tenants]);

  useEffect(() => {
    if (notesLoading) return;
    const savedNotes = notesResponse?.success ? notesResponse.data?.notes || '' : '';
    setNotesDraft(savedNotes);
    setNotesDirty(false);
  }, [notesResponse, notesLoading, batchWeek]);

  const handleSaveNotes = useCallback(async () => {
    setSavingNotes(true);
    const { data, error } = await authenticatedRequest('/admin/pivot/interview-notes', {
      method: 'PUT',
      data: { batchWeek, notes: notesDraft },
    });
    setSavingNotes(false);

    if (error || !data?.success) {
      addNotification({
        title: 'Save failed',
        message: error || data?.message || 'Could not save interview notes.',
        type: 'error',
      });
      return;
    }

    setNotesDirty(false);
    refetchNotes({ silent: true });
    addNotification({
      title: 'Saved',
      message: 'Interview notes updated.',
      type: 'success',
    });
  }, [addNotification, batchWeek, notesDraft, refetchNotes]);

  const handleRebuildSnapshot = useCallback(async () => {
    setRebuildingSnapshot(true);
    const { data, error } = await authenticatedRequest('/admin/pivot/snapshots/rebuild', {
      method: 'POST',
      data: { batchWeek },
    });
    setRebuildingSnapshot(false);

    if (error || !data?.success) {
      addNotification({
        title: 'Rebuild failed',
        message: error || data?.message || 'Could not rebuild snapshot.',
        type: 'error',
      });
      return;
    }

    refetchOverview();
    addNotification({
      title: 'Snapshot rebuilt',
      message: `Weekly snapshot refreshed for ${batchWeek}.`,
      type: 'success',
    });
  }, [addNotification, batchWeek, refetchOverview]);

  const handlePurgeCatalog = useCallback(async () => {
    if (purgeConfirm.trim() !== PURGE_CONFIRM_TOKEN) {
      addNotification({
        title: 'Confirmation required',
        message: `Type ${PURGE_CONFIRM_TOKEN} to delete catalog data.`,
        type: 'error',
      });
      return;
    }

    const scopeLabel =
      purgeScope === 'all'
        ? 'all pivot cities'
        : tenants.find((row) => row.tenantKey === selectedTenantKey)?.cityDisplayName ||
          selectedTenantKey ||
          'this city';

    const weekLabel = purgeWeekScope === 'week' ? batchWeek : 'every batch week';

    if (
      !window.confirm(
        `Permanently delete pivot catalog events for ${weekLabel} and related intents, feedback, and analytics for ${scopeLabel}? This cannot be undone.`,
      )
    ) {
      return;
    }

    setPurgingCatalog(true);
    const { data, error } = await authenticatedRequest('/admin/pivot/dev/purge-catalog', {
      method: 'POST',
      data: {
        confirm: PURGE_CONFIRM_TOKEN,
        tenantKey: purgeScope === 'all' ? undefined : selectedTenantKey || undefined,
        batchWeek: purgeWeekScope === 'week' ? batchWeek : undefined,
        clearSnapshots: true,
      },
    });
    setPurgingCatalog(false);

    if (error || !data?.success) {
      addNotification({
        title: 'Purge failed',
        message: error || data?.message || 'Could not purge pivot catalog data.',
        type: 'error',
      });
      return;
    }

    const totals = data.data?.totals || {};
    const purgedWeekLabel = purgeWeekScope === 'week' ? ` for ${batchWeek}` : ' across all weeks';
    setPurgeConfirm('');
    refetchOverview();
    refetchEvents();
    addNotification({
      title: 'Catalog purged',
      message: `Removed ${totals.events ?? 0} events, ${totals.intents ?? 0} intents, and ${totals.feedback ?? 0} feedback rows${purgedWeekLabel}.`,
      type: 'success',
    });
  }, [
    addNotification,
    batchWeek,
    purgeConfirm,
    purgeScope,
    purgeWeekScope,
    refetchEvents,
    refetchOverview,
    selectedTenantKey,
    tenants,
  ]);

  const handlePreviewImport = useCallback(async () => {
    const trimmedUrl = importUrl.trim();
    if (!trimmedUrl) {
      setImportError('Paste a Partiful or Luma event or explore URL.');
      return;
    }

    setImportLoading(true);
    setImportError('');
    setImportMode(null);
    setImportPreview(null);
    setImportBatchLabel('');
    setImportBatchRows([]);
    setDeckPreviewState(null);
    setImportWarnings([]);
    setImportDuplicate(null);
    setImportName('');
    setImportLocation('');
    setImportStartTime('');
    setImportDescription('');
    setImportOrganizerName('');
    setImportSelectedTags([]);
    setImportSourceTags([]);
    setBatchApplyTags([]);

    const { data, error } = await authenticatedRequest('/admin/pivot/ingest/preview', {
      method: 'POST',
      data: {
        url: trimmedUrl,
        tenantKey: selectedTenantKey || undefined,
      },
    });
    setImportLoading(false);

    if (error || !data?.success) {
      setImportError(error || data?.message || 'Could not preview this URL.');
      return;
    }

    const previewData = data.data || {};
    setImportProvider(previewData.providerLabel || previewData.provider || '');
    setImportWarnings(previewData.warnings || []);

    if (previewData.mode === 'batch') {
      setImportMode('batch');
      setImportBatchLabel(previewData.listLabel || 'Explore page');
      setImportBatchRows((previewData.drafts || []).map(createBatchImportRow));
      return;
    }

    const draft = previewData.draft || {};
    setImportMode('single');
    setImportPreview(draft);
    setImportOrganizerName(draft.hostName || '');
    setImportName(draft.name || '');
    setImportLocation(draft.location || '');
    setImportStartTime(draft.start_time || '');
    setImportDescription(draft.description || '');
    setImportSourceTags(Array.isArray(draft.sourceTags) ? draft.sourceTags : []);
    setImportSelectedTags([]);
    setImportDuplicate(previewData.duplicate || null);
  }, [importUrl, selectedTenantKey]);

  useEffect(() => {
    if (activeTab !== 'import' || manualImportOpen) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key !== 'm' && event.key !== 'M') return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      event.preventDefault();
      setManualImportOpen(true);
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, manualImportOpen]);

  const handleAddManualToBatch = useCallback(
    (entry) => {
      setImportError('');
      setImportMode('batch');
      setImportProvider((current) => current || 'Manual');
      setImportBatchLabel((current) =>
        current && !current.startsWith('Manual') ? current : 'Manual queue',
      );
      setImportBatchRows((rows) => {
        const nextRow = createBatchImportRow(entry, rows.length);
        return [
          ...rows,
          {
            ...nextRow,
            key: nextRow.sourceUrl || `manual-${Date.now()}-${rows.length}`,
          },
        ];
      });
      addNotification({
        title: 'Queued',
        message: `${entry.draft?.name || 'Event'} added to batch.`,
        type: 'success',
      });
    },
    [addNotification],
  );

  const handlePublishManualImport = useCallback(
    async (draft) => {
      if (!selectedTenantKey) {
        addNotification({
          title: 'Choose a city',
          message: 'Select a pivot city before staging.',
          type: 'warning',
        });
        return false;
      }

      setManualImportPublishLoading(true);
      const entry = manualDraftToImportEntry(draft);
      const { data, error } = await authenticatedRequest('/admin/pivot/ingest', {
        method: 'POST',
        data: {
          tenantKey: selectedTenantKey,
          batchWeek,
          forceBatchWeek,
          overrides: {
            hostName: entry.draft.hostName,
            name: entry.draft.name,
            location: entry.draft.location,
            start_time: entry.draft.start_time,
            end_time: entry.draft.end_time || undefined,
            description: entry.draft.description || undefined,
            image: entry.draft.image || undefined,
            source: 'manual',
            sourceUrl: entry.draft.sourceUrl || undefined,
            tags: entry.draft.tags,
            ...(entry.draft.timeSlots?.length
              ? { timeSlots: entry.draft.timeSlots }
              : {}),
            ...(entry.draft.movie ? { movie: entry.draft.movie } : {}),
          },
        },
      });
      setManualImportPublishLoading(false);

      if (error || !data?.success) {
        addNotification({
          title: 'Stage failed',
          message: error || data?.message || 'Could not stage event.',
          type: 'error',
        });
        return false;
      }

      const assignedWeek = data.data?.batchWeek || batchWeek;
      refetchEvents();
      refetchOverview();
      addNotification({
        title: 'Staged',
        message: `${data.data?.event?.name || entry.draft.name} added to ${selectedTenantKey} for ${assignedWeek} (not live until Release).`,
        type: 'success',
      });
      return true;
    },
    [
      addNotification,
      batchWeek,
      forceBatchWeek,
      refetchEvents,
      refetchOverview,
      selectedTenantKey,
    ],
  );

  const suggestTagsForManualImport = useCallback(
    async (draft, patchDraft) => {
      setTagSuggestLoadingKey('manual-import');
      const result = await requestSuggestedTags(
        buildTagSuggestPayload({
          name: draft.name,
          description: draft.description,
          location: draft.location,
          organizerName: draft.organizerName,
          sourceTags: [],
        }),
      );
      setTagSuggestLoadingKey(null);

      if (result.error) {
        addNotification({
          title: 'Tag suggestion failed',
          message: result.error,
          type: result.code === 'LLM_NOT_CONFIGURED' ? 'warning' : 'error',
        });
        return;
      }

      patchDraft({ tags: result.tags });
      if (!result.tags.length) {
        addNotification({
          title: 'No tag matches',
          message: 'Claude did not return catalog tags for this event.',
          type: 'warning',
        });
      }
    },
    [addNotification, buildTagSuggestPayload, requestSuggestedTags],
  );

  const syncJsonImportDraftFromEntries = useCallback((label, entries) => {
    setImportJsonDraft(
      JSON.stringify(
        {
          label,
          events: entries.map((entry) => entry.draft),
        },
        null,
        2,
      ),
    );
  }, []);

  // Fuzzy/exact duplicate detection for JSON entries, matched against the selected city's
  // catalog so publishing updates existing rows instead of creating duplicates.
  const annotateJsonEntriesWithDuplicates = useCallback(
    async (entries) => {
      if (!selectedTenantKey || !entries.length) {
        return { entries, duplicateWarnings: [] };
      }

      const { data, error } = await authenticatedRequest(
        '/admin/pivot/ingest/annotate-duplicates',
        {
          method: 'POST',
          data: { tenantKey: selectedTenantKey, drafts: entries },
        },
      );

      if (error || !data?.success) {
        return { entries, duplicateWarnings: [] };
      }

      return {
        entries: data.data?.drafts || entries,
        duplicateWarnings: data.data?.duplicateWarnings || [],
      };
    },
    [selectedTenantKey],
  );

  const handlePreviewJsonImport = useCallback(async () => {
    const result = parsePivotJsonImport(importJsonDraft);
    if (result.error) {
      setJsonImportPreview({ error: result.error });
      return;
    }

    let entries = result.entries;
    const pendingFilmCount = entries.filter((entry) =>
      isFilmImportCandidate(entry.draft || {}),
    ).length;

    let matched = 0;
    let failed = 0;

    if (pendingFilmCount) {
      setTmdbMatchLoadingKey('json-preview');
      const matchResult = await autoMatchFilmsForImportEntries(entries);
      setTmdbMatchLoadingKey(null);
      matched = matchResult.matched;
      failed = matchResult.failed;

      if (matchResult.moviesByIndex.size) {
        entries = entries.map((entry, index) =>
          matchResult.moviesByIndex.has(index)
            ? {
                ...entry,
                draft: applyMovieMetadataToImportDraft(
                  entry.draft || {},
                  matchResult.moviesByIndex.get(index),
                ),
              }
            : entry,
        );
        syncJsonImportDraftFromEntries(result.label, entries);
      }
    }

    const { entries: annotatedEntries, duplicateWarnings } =
      await annotateJsonEntriesWithDuplicates(entries);
    entries = annotatedEntries;

    setJsonImportPreview({
      label: result.label,
      entries,
      tmdbMatch: { matched, failed, pending: pendingFilmCount },
      duplicateWarnings,
    });

    if (pendingFilmCount) {
      addNotification({
        title: matched ? 'Films matched from TMDB' : 'TMDB matching finished',
        message: matched
          ? `${matched} film(s) matched automatically${failed ? `, ${failed} failed` : ''}.`
          : failed
            ? `${failed} film event(s) could not be matched.`
            : 'No TMDB matches found for film events.',
        type: matched ? (failed ? 'warning' : 'success') : 'warning',
      });
    }
  }, [
    addNotification,
    annotateJsonEntriesWithDuplicates,
    importJsonDraft,
    syncJsonImportDraftFromEntries,
  ]);

  const handleLoadJsonImport = useCallback(async () => {
    const result =
      jsonImportPreview?.entries?.length && !jsonImportPreview.error
        ? { label: jsonImportPreview.label, entries: jsonImportPreview.entries }
        : parsePivotJsonImport(importJsonDraft);
    if (result.error) {
      setImportError(result.error);
      setJsonImportPreview({ error: result.error });
      return;
    }

    let entries = result.entries;
    const pendingFilmCount = entries.filter((entry) =>
      isFilmImportCandidate(entry.draft || {}),
    ).length;

    let matched = 0;
    let failed = 0;

    if (pendingFilmCount) {
      setTmdbMatchLoadingKey('json-load');
      const matchResult = await autoMatchFilmsForImportEntries(entries);
      setTmdbMatchLoadingKey(null);
      matched = matchResult.matched;
      failed = matchResult.failed;

      if (matchResult.moviesByIndex.size) {
        entries = entries.map((entry, index) =>
          matchResult.moviesByIndex.has(index)
            ? {
                ...entry,
                draft: applyMovieMetadataToImportDraft(
                  entry.draft || {},
                  matchResult.moviesByIndex.get(index),
                ),
              }
            : entry,
        );
        syncJsonImportDraftFromEntries(result.label, entries);
      }
    }

    const { entries: annotatedEntries, duplicateWarnings } =
      await annotateJsonEntriesWithDuplicates(entries);
    entries = annotatedEntries;
    const updateCount = entries.filter((entry) => entry.duplicate?.willUpdate).length;

    setImportError('');
    setJsonImportPreview({
      label: result.label,
      entries,
      tmdbMatch: { matched, failed, pending: pendingFilmCount },
      duplicateWarnings,
    });
    setImportMode('batch');
    setImportUrl('');
    setImportPreview(null);
    setImportProvider('JSON');
    setImportBatchLabel(result.label);
    setImportBatchRows(entries.map(createBatchImportRow));
    const missingTagCount = entries.filter((entry) => !entry.draft?.tags?.length).length;
    const loadWarnings = [];
    if (missingTagCount) {
      loadWarnings.push(
        `${missingTagCount} event(s) have no tags — pick or suggest catalog tags before publishing.`,
      );
    }
    if (failed) {
      loadWarnings.push(
        `${failed} film event(s) could not be matched to TMDB — use Retry on those rows.`,
      );
    }
    if (updateCount) {
      loadWarnings.push(
        `${updateCount} event(s) match existing catalog rows and will update them on publish.`,
      );
    }
    setImportWarnings(loadWarnings);
    setImportDuplicate(null);
    setDeckPreviewState(null);
    setBatchApplyTags([]);

    addNotification({
      title: 'JSON loaded',
      message:
        matched > 0
          ? `${entries.length} event(s) loaded · ${matched} film(s) matched from TMDB.`
          : `${entries.length} event(s) ready for review${
              updateCount ? ` · ${updateCount} will update existing rows` : ''
            }.`,
      type: 'success',
    });
  }, [
    addNotification,
    annotateJsonEntriesWithDuplicates,
    importJsonDraft,
    jsonImportPreview,
    syncJsonImportDraftFromEntries,
  ]);

  const handleMatchTmdbForJsonEntry = useCallback(
    async (index) => {
      const entry = jsonImportPreview?.entries?.[index];
      if (!entry) {
        return;
      }

      const draft = entry.draft || {};
      if (draft.movie?.tmdbId) {
        addNotification({
          title: 'Already matched',
          message: `${draft.name || 'Event'} already has TMDB metadata.`,
          type: 'warning',
        });
        return;
      }

      setTmdbMatchLoadingKey(`json-${index}`);
      const result = await autoMatchTmdbMovieForEvent({
        name: draft.name,
        startTime: draft.start_time || draft.timeSlots?.[0]?.start_time,
        movie: draft.movie,
      });
      setTmdbMatchLoadingKey(null);

      if (result.error) {
        addNotification({
          title: 'TMDB match failed',
          message: `${draft.name || 'Event'}: ${result.error}`,
          type: 'error',
        });
        return;
      }

      setJsonImportPreview((prev) => {
        if (!prev?.entries) {
          return prev;
        }
        const entries = prev.entries.map((item, itemIndex) =>
          itemIndex === index
            ? {
                ...item,
                draft: applyMovieMetadataToImportDraft(item.draft || {}, result.movie),
              }
            : item,
        );
        syncJsonImportDraftFromEntries(prev.label, entries);
        return { ...prev, entries };
      });

      addNotification({
        title: 'Film matched',
        message: `${result.movie.title} attached to ${draft.name || 'event'}.`,
        type: 'success',
      });
    },
    [addNotification, jsonImportPreview, syncJsonImportDraftFromEntries],
  );

  const jsonImportPreviewDocument = useMemo(
    () => buildJsonImportPreviewDocument(jsonImportPreview),
    [jsonImportPreview],
  );

  const jsonImportReadyCount = useMemo(() => {
    if (!jsonImportPreview?.entries) return 0;
    return jsonImportPreview.entries.filter(isJsonImportEntryReady).length;
  }, [jsonImportPreview]);

  const jsonImportTmdbMatching = Boolean(
    tmdbMatchLoadingKey === 'json-preview' || tmdbMatchLoadingKey === 'json-load',
  );

  const handleCopyJsonAgentPrompt = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(PIVOT_JSON_IMPORT_AGENT_PROMPT);
      addNotification({
        title: 'Copied',
        message: 'Agent JSON prompt copied to clipboard.',
        type: 'success',
      });
    } catch {
      addNotification({
        title: 'Copy failed',
        message: 'Could not copy the agent prompt to clipboard.',
        type: 'error',
      });
    }
  }, [addNotification]);

  const updateBatchImportRow = useCallback((key, patch) => {
    setImportBatchRows((rows) =>
      rows.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );
  }, []);

  const handleMatchTmdbForBatchRow = useCallback(
    async (rowKey) => {
      const row = importBatchRows.find((item) => item.key === rowKey);
      if (!row) {
        return;
      }

      if (row.movie?.tmdbId) {
        addNotification({
          title: 'Already matched',
          message: `${row.name || 'Event'} already has TMDB metadata.`,
          type: 'warning',
        });
        return;
      }

      setTmdbMatchLoadingKey(rowKey);
      const result = await autoMatchTmdbMovieForEvent({
        name: row.name,
        startTime: row.startTime || row.timeSlots?.[0]?.start_time,
        movie: row.movie,
      });
      setTmdbMatchLoadingKey(null);

      if (result.error) {
        addNotification({
          title: 'TMDB match failed',
          message: `${row.name || 'Event'}: ${result.error}`,
          type: 'error',
        });
        return;
      }

      updateBatchImportRow(rowKey, applyMovieMetadataToBatchRow(row, result.movie));
      addNotification({
        title: 'Film matched',
        message: `${result.movie.title} attached to ${row.name || 'event'}.`,
        type: 'success',
      });
    },
    [addNotification, importBatchRows, updateBatchImportRow],
  );

  const selectedBatchRows = useMemo(
    () => importBatchRows.filter((row) => row.selected),
    [importBatchRows],
  );

  const suggestTagsForImport = useCallback(async () => {
    setTagSuggestLoadingKey('single-import');
    const result = await requestSuggestedTags(
      buildTagSuggestPayload({
        name: importName,
        description: importDescription,
        location: importLocation,
        organizerName: importOrganizerName,
        sourceTags: importSourceTags,
      }),
    );
    setTagSuggestLoadingKey(null);

    if (result.error) {
      addNotification({
        title: 'Tag suggestion failed',
        message: result.error,
        type: result.code === 'LLM_NOT_CONFIGURED' ? 'warning' : 'error',
      });
      return;
    }

    setImportSelectedTags(result.tags);
    if (!result.tags.length) {
      addNotification({
        title: 'No tags suggested',
        message: 'Claude did not return valid catalog tags for this event.',
        type: 'warning',
      });
      return;
    }

    addNotification({
      title: 'Tags suggested',
      message: result.tags.length
        ? `Claude picked: ${result.tags.join(', ')}`
        : 'No catalog tags matched this event.',
      type: result.tags.length ? 'success' : 'warning',
    });
  }, [
    addNotification,
    buildTagSuggestPayload,
    importDescription,
    importLocation,
    importName,
    importOrganizerName,
    importSourceTags,
    requestSuggestedTags,
  ]);

  const suggestTagsForBatchRow = useCallback(
    async (rowKey) => {
      const row = importBatchRows.find((entry) => entry.key === rowKey);
      if (!row) return;

      setTagSuggestLoadingKey(rowKey);
      const result = await requestSuggestedTags(
        buildTagSuggestPayload({
          name: row.name,
          description: row.description,
          location: row.location,
          organizerName: row.organizerName,
          sourceTags: row.sourceTags,
        }),
      );
      setTagSuggestLoadingKey(null);

      if (result.error) {
        addNotification({
          title: 'Tag suggestion failed',
          message: result.error,
          type: result.code === 'LLM_NOT_CONFIGURED' ? 'warning' : 'error',
        });
        return;
      }

      updateBatchImportRow(rowKey, { tags: result.tags, aiTagged: true });
    },
    [addNotification, buildTagSuggestPayload, importBatchRows, requestSuggestedTags, updateBatchImportRow],
  );

  const suggestTagsForSelectedBatchRows = useCallback(async () => {
    if (!selectedBatchRows.length) return;

    // Resume-friendly: target selected rows that haven't been through Claude yet. If every
    // selected row is already AI-tagged, treat the click as a deliberate re-run of all of them.
    const pending = selectedBatchRows.filter((row) => !row.aiTagged);
    const targetRows = pending.length ? pending : selectedBatchRows;
    const total = targetRows.length;

    setTagSuggestLoadingKey('batch-all');
    setBatchTagProgress({ done: 0, total });

    let suggestedTotal = 0;
    let failedTotal = 0;
    let stoppedError = null;

    // Chunk the selection into several short requests so one slow/large call can't trip the
    // production gateway timeout, and each chunk's tags are saved as soon as it returns.
    for (let start = 0; start < targetRows.length; start += AI_TAG_CHUNK_SIZE) {
      const chunk = targetRows.slice(start, start + AI_TAG_CHUNK_SIZE);

      const { data, error } = await authenticatedRequest('/admin/pivot/ingest/suggest-tags', {
        method: 'POST',
        data: {
          events: chunk.map((row) =>
            buildTagSuggestPayload({
              name: row.name,
              description: row.description,
              location: row.location,
              organizerName: row.organizerName,
              sourceTags: row.sourceTags,
            }),
          ),
        },
      });

      if (error || !data?.success) {
        // A transport-level failure (gateway 503/timeout) carries no structured body. Stop
        // here so already-processed chunks stay saved and the user can click again to resume.
        stoppedError = {
          message: error || data?.message || 'Could not reach the tag suggestion service.',
          type: data?.code === 'LLM_NOT_CONFIGURED' ? 'warning' : 'error',
        };
        break;
      }

      const suggestions = data.data?.suggestions || [];
      failedTotal += data.data?.failedCount ?? 0;

      const tagsByKey = new Map();
      for (let i = 0; i < chunk.length; i += 1) {
        const tags = suggestions[i]?.tags || [];
        if (tags.length) suggestedTotal += 1;
        tagsByKey.set(chunk[i].key, tags);
      }

      setImportBatchRows((rows) =>
        rows.map((row) =>
          tagsByKey.has(row.key)
            ? {
                ...row,
                tags: tagsByKey.get(row.key).length ? tagsByKey.get(row.key) : row.tags || [],
                aiTagged: true,
              }
            : row,
        ),
      );

      setBatchTagProgress({ done: Math.min(start + chunk.length, total), total });
    }

    setTagSuggestLoadingKey(null);
    setBatchTagProgress(null);

    if (stoppedError) {
      addNotification({
        title: suggestedTotal
          ? 'Tagging interrupted — partial results saved'
          : 'Batch tag suggestion failed',
        message: suggestedTotal
          ? `${suggestedTotal} row(s) tagged before the error — click again to resume the rest. (${stoppedError.message})`
          : stoppedError.message,
        type: suggestedTotal ? 'warning' : stoppedError.type,
      });
      return;
    }

    if (suggestedTotal === 0) {
      addNotification({
        title: 'No tags suggested',
        message: 'Claude did not return valid catalog tags for the selected rows.',
        type: 'warning',
      });
      return;
    }

    addNotification({
      title: failedTotal ? 'Batch partially tagged' : 'Batch tags suggested',
      message: failedTotal
        ? `${suggestedTotal} row(s) tagged, ${failedTotal} failed.`
        : `${suggestedTotal} row(s) tagged via Claude.`,
      type: failedTotal ? 'warning' : 'success',
    });
  }, [addNotification, buildTagSuggestPayload, selectedBatchRows]);

  const suggestTagsForEdit = useCallback(
    async (draft, patchDraft) => {
      setTagSuggestLoadingKey('edit');
      const result = await requestSuggestedTags(
        buildTagSuggestPayload({
          name: draft.name,
          description: draft.description,
          location: draft.location,
          organizerName: draft.organizerName,
        }),
      );
      setTagSuggestLoadingKey(null);

      if (result.error) {
        addNotification({
          title: 'Tag suggestion failed',
          message: result.error,
          type: result.code === 'LLM_NOT_CONFIGURED' ? 'warning' : 'error',
        });
        return;
      }

      patchDraft({ tags: result.tags });
    },
    [addNotification, buildTagSuggestPayload, requestSuggestedTags],
  );

  const applyTagsToSelectedBatchRows = useCallback(() => {
    if (!batchApplyTags.length) return;
    setImportBatchRows((rows) =>
      rows.map((row) => (row.selected ? { ...row, tags: [...batchApplyTags] } : row)),
    );
  }, [batchApplyTags]);

  const publishableBatchRows = useMemo(
    () =>
      selectedBatchRows.filter(
        (row) =>
          !row.isBlockingDuplicate &&
          row.organizerName.trim() &&
          row.name.trim() &&
          row.location.trim() &&
          (row.startTime.trim() || row.timeSlots?.length) &&
          row.tags.length > 0,
      ),
    [selectedBatchRows],
  );

  const selectableBatchRows = useMemo(
    () => importBatchRows.filter((row) => !row.isBlockingDuplicate),
    [importBatchRows],
  );

  const importBlockingDuplicate = isBlockingImportDuplicate(importDuplicate);

  const singleImportDeckPreview = useMemo(
    () =>
      importMode === 'single' && importPreview
        ? buildDeckPreviewProps({
            name: importName,
            organizerName: importOrganizerName,
            startTime: importStartTime,
            location: importLocation,
            description: importDescription,
            imageUrl: importPreview.image,
          })
        : null,
    [
      importDescription,
      importLocation,
      importMode,
      importName,
      importOrganizerName,
      importPreview,
      importStartTime,
    ],
  );

  const deckPreviewContent = useMemo(() => {
    if (!deckPreviewState) return null;

    if (deckPreviewState.type === 'batch') {
      const row = importBatchRows.find((entry) => entry.key === deckPreviewState.rowKey);
      if (!row) return null;
      return {
        props: buildDeckPreviewProps({
          name: row.name,
          organizerName: row.organizerName,
          startTime: row.startTime,
          endTime: row.endTime,
          location: row.location,
          description: row.description,
          imageUrl: row.imageUrl,
          timeSlots: row.timeSlots,
        }),
        hint: 'Preview updates as you edit the selected batch row.',
      };
    }

    return {
      props: deckPreviewState.props,
      hint: deckPreviewState.hint,
    };
  }, [deckPreviewState, importBatchRows]);

  const handlePublishBatchImport = useCallback(async () => {
    if (!publishableBatchRows.length || !selectedTenantKey) {
      setImportError('Select events with title, organizer, location, start time, and at least one tag.');
      return;
    }

    setImportPublishLoading(true);
    setImportError('');

    const { data, error } = await authenticatedRequest('/admin/pivot/ingest/batch', {
      method: 'POST',
      data: {
        tenantKey: selectedTenantKey,
        batchWeek,
        forceBatchWeek,
        events: publishableBatchRows.map((row) => ({
          url: row.sourceUrl.trim() || undefined,
          overrides: buildBatchPublishOverrides(row),
        })),
      },
    });
    setImportPublishLoading(false);

    if (error || !data?.success) {
      setImportError(error || data?.message || 'Could not stage selected events.');
      return;
    }

    const publishedCount = data.data?.publishedCount ?? data.data?.published?.length ?? 0;
    const failedCount = data.data?.failedCount ?? data.data?.failures?.length ?? 0;
    const updatedCount = data.data?.updatedCount ?? 0;
    const createdCount = Math.max(publishedCount - updatedCount, 0);
    const updatedSuffix = updatedCount ? ` (${updatedCount} updated existing)` : '';
    const weekCounts = data.data?.batchWeekCounts || {};
    const weekKeys = Object.keys(weekCounts).sort();
    const weekSuffix =
      weekKeys.length > 1
        ? ` Weeks: ${weekKeys.map((w) => `${w} (${weekCounts[w]})`).join(', ')}.`
        : weekKeys.length === 1
          ? ` Week ${weekKeys[0]}.`
          : '';

    refetchEvents();
    refetchOverview();
    addNotification({
      title: failedCount ? 'Batch partially staged' : 'Batch staged',
      message: failedCount
        ? `${createdCount} staged, ${updatedCount} updated, ${failedCount} failed.${weekSuffix} Release separately to go live.`
        : `${publishedCount} event(s) staged for ${selectedTenantKey}${updatedSuffix}.${weekSuffix} Not live until Release.`,
      type: failedCount ? 'warning' : 'success',
    });
  }, [
    addNotification,
    batchWeek,
    forceBatchWeek,
    publishableBatchRows,
    refetchEvents,
    refetchOverview,
    selectedTenantKey,
  ]);

  const handleStageAndReleaseNow = useCallback(async () => {
    if (importMode === 'batch') {
      if (!publishableBatchRows.length || !selectedTenantKey) {
        setImportError('Select events with title, organizer, location, start time, and at least one tag.');
        return;
      }
      const typed = window.prompt(
        'Emergency: stage & release now puts events in the live feed immediately.\n\nType RELEASE_NOW to confirm:',
      );
      if (typed !== 'RELEASE_NOW') {
        if (typed != null) {
          setImportError('Release cancelled — type RELEASE_NOW exactly to confirm.');
        }
        return;
      }

      setImportPublishLoading(true);
      setImportError('');
      const { data, error } = await authenticatedRequest('/admin/pivot/ingest/batch', {
        method: 'POST',
        data: {
          tenantKey: selectedTenantKey,
          batchWeek,
          forceBatchWeek,
          releaseNow: true,
          confirm: 'RELEASE_NOW',
          events: publishableBatchRows.map((row) => ({
            url: row.sourceUrl.trim() || undefined,
            overrides: buildBatchPublishOverrides(row),
          })),
        },
      });
      setImportPublishLoading(false);

      if (error || !data?.success) {
        setImportError(error || data?.message || 'Could not release selected events.');
        return;
      }

      const publishedCount = data.data?.publishedCount ?? data.data?.published?.length ?? 0;
      const weekCounts = data.data?.batchWeekCounts || {};
      const weekKeys = Object.keys(weekCounts).sort();
      const weekLabel =
        weekKeys.length > 1
          ? weekKeys.map((w) => `${w} (${weekCounts[w]})`).join(', ')
          : weekKeys[0] || batchWeek;
      refetchEvents();
      refetchOverview();
      addNotification({
        title: 'Released to deck',
        message: `${publishedCount} event(s) live in ${selectedTenantKey} for ${weekLabel}.`,
        type: 'success',
      });
      return;
    }

    if (!importPreview || !selectedTenantKey) {
      setImportError('Preview an event and choose a city before releasing.');
      return;
    }
    if (!importOrganizerName.trim()) {
      setImportError('Organizer name is required.');
      return;
    }
    if (!importSelectedTags.length) {
      setImportError('Select at least one catalog tag.');
      return;
    }

    const typed = window.prompt(
      'Emergency: stage & release now puts this event in the live feed immediately.\n\nType RELEASE_NOW to confirm:',
    );
    if (typed !== 'RELEASE_NOW') {
      if (typed != null) {
        setImportError('Release cancelled — type RELEASE_NOW exactly to confirm.');
      }
      return;
    }

    setImportPublishLoading(true);
    setImportError('');
    const { data, error } = await authenticatedRequest('/admin/pivot/ingest', {
      method: 'POST',
      data: {
        tenantKey: selectedTenantKey,
        url: importUrl.trim(),
        batchWeek,
        forceBatchWeek,
        releaseNow: true,
        confirm: 'RELEASE_NOW',
        overrides: {
          hostName: importOrganizerName.trim(),
          name: importName.trim() || undefined,
          location: importLocation.trim() || undefined,
          start_time: importStartTime.trim() || undefined,
          description: importDescription.trim() || undefined,
          tags: importSelectedTags,
        },
      },
    });
    setImportPublishLoading(false);

    if (error || !data?.success) {
      setImportError(error || data?.message || 'Could not release event.');
      return;
    }

    const assignedWeek = data.data?.batchWeek || batchWeek;
    refetchEvents();
    refetchOverview();
    addNotification({
      title: 'Released to deck',
      message: `${data.data?.event?.name || 'Event'} is live in ${selectedTenantKey} for ${assignedWeek}.`,
      type: 'success',
    });
  }, [
    addNotification,
    batchWeek,
    forceBatchWeek,
    importDescription,
    importLocation,
    importMode,
    importName,
    importOrganizerName,
    importPreview,
    importSelectedTags,
    importStartTime,
    importUrl,
    publishableBatchRows,
    refetchEvents,
    refetchOverview,
    selectedTenantKey,
  ]);

  const handlePublishImport = useCallback(async () => {
    if (importMode === 'batch') {
      return handlePublishBatchImport();
    }

    if (!importPreview || !selectedTenantKey) {
      setImportError('Preview an event and choose a city before staging.');
      return;
    }
    if (!importOrganizerName.trim()) {
      setImportError('Organizer name is required.');
      return;
    }
    if (!importSelectedTags.length) {
      setImportError('Select at least one catalog tag.');
      return;
    }

    setImportPublishLoading(true);
    setImportError('');

    const { data, error } = await authenticatedRequest('/admin/pivot/ingest', {
      method: 'POST',
      data: {
        tenantKey: selectedTenantKey,
        url: importUrl.trim(),
        batchWeek,
        forceBatchWeek,
        overrides: {
          hostName: importOrganizerName.trim(),
          name: importName.trim() || undefined,
          location: importLocation.trim() || undefined,
          start_time: importStartTime.trim() || undefined,
          description: importDescription.trim() || undefined,
          tags: importSelectedTags,
        },
      },
    });
    setImportPublishLoading(false);

    if (error || !data?.success) {
      setImportError(error || data?.message || 'Could not stage event.');
      return;
    }

    refetchEvents();
    refetchOverview();
    const wasUpdated = data.data?.updated;
    const assignedWeek = data.data?.batchWeek || batchWeek;
    addNotification({
      title: wasUpdated ? 'Updated' : 'Staged',
      message: `${data.data?.event?.name || 'Event'} ${
        wasUpdated ? 'updated in' : 'staged for'
      } ${selectedTenantKey} (${assignedWeek}). Not live until Release.`,
      type: 'success',
    });
  }, [
    addNotification,
    batchWeek,
    forceBatchWeek,
    handlePublishBatchImport,
    importDescription,
    importLocation,
    importMode,
    importName,
    importOrganizerName,
    importSelectedTags,
    importPreview,
    importStartTime,
    importUrl,
    importBlockingDuplicate,
    refetchEvents,
    refetchOverview,
    selectedTenantKey,
  ]);

  const openEditEvent = useCallback((event) => {
    setEditingEvent(event);
  }, []);

  const handleSaveCatalogEdit = useCallback(
    async (draft) => {
      if (!editingEvent || !selectedTenantKey) return false;

      setEditSaving(true);
      const overrides = catalogEditDraftToOverrides(draft);
      const { data, error } = await authenticatedRequest(
        `/admin/pivot/ingest/${editingEvent._id}`,
        {
          method: 'PATCH',
          data: {
            tenantKey: selectedTenantKey,
            overrides,
          },
        },
      );
      setEditSaving(false);

      if (error || !data?.success) {
        addNotification({
          title: 'Update failed',
          message: error || data?.message || 'Could not update event.',
          type: 'error',
        });
        return false;
      }

      setEditingEvent(null);
      refetchEvents();
      addNotification({
        title: 'Updated',
        message: 'Catalog event saved.',
        type: 'success',
      });
      return true;
    },
    [addNotification, editingEvent, refetchEvents, selectedTenantKey],
  );

  const snapshotLabel = formatSnapshotAge(overview?.snapshotGeneratedAt);
  const selectedTenant = useMemo(
    () => tenants.find((row) => row.tenantKey === selectedTenantKey) || null,
    [tenants, selectedTenantKey],
  );

  const stepBatchWeek = useCallback((delta) => {
    setBatchWeek((current) => {
      const next = shiftIsoWeek(current, delta);
      return next || current;
    });
  }, []);

  const batchWeekValid = isValidIsoWeek(batchWeek);

  return (
    <div className="pivot-lab linear-admin">
      <header className="pivot-lab__header">
        <div>
          <p className="pivot-lab__eyebrow">Internal · Just Go pilot</p>
          <h1>Pivot Lab</h1>
          <p className="pivot-lab__subtitle">
            Curate the weekly catalog, watch the funnel, and decide with data.
          </p>
        </div>
        <div className="pivot-lab__controls">
          <label className="linear-field pivot-lab__tenant-filter">
            <span className="linear-field__label">City</span>
            <select
              className="linear-input"
              value={selectedTenantKey}
              onChange={(e) => setSelectedTenantKey(e.target.value)}
              disabled={!tenants.length}
            >
              {tenants.map((tenant) => (
                <option key={tenant.tenantKey} value={tenant.tenantKey}>
                  {tenant.cityDisplayName || tenant.tenantKey}
                </option>
              ))}
            </select>
          </label>
          <label className="linear-field">
            <span className="linear-field__label">Batch week</span>
            <div className="pivot-lab__week-stepper">
              <button
                type="button"
                className="linear-btn linear-btn--ghost pivot-lab__week-step"
                onClick={() => stepBatchWeek(-1)}
                disabled={!batchWeekValid}
                aria-label="Previous week"
              >
                ‹
              </button>
              <input
                className="linear-input pivot-lab__week-input"
                value={batchWeek}
                onChange={(e) => setBatchWeek(e.target.value.toUpperCase())}
                placeholder="2026-W26"
              />
              <button
                type="button"
                className="linear-btn linear-btn--ghost pivot-lab__week-step"
                onClick={() => stepBatchWeek(1)}
                disabled={!batchWeekValid}
                aria-label="Next week"
              >
                ›
              </button>
            </div>
          </label>
          <label
            className="pivot-lab__check"
            title="When off, ingest assigns each event to the ISO week of its start date. When on, every event is pinned to the selected batch week."
          >
            <input
              type="checkbox"
              checked={forceBatchWeek}
              onChange={(e) => setForceBatchWeek(e.target.checked)}
            />
            <span>Force into batch week</span>
          </label>
          <button
            type="button"
            className="linear-btn linear-btn--ghost"
            onClick={() => refetchOverview()}
            disabled={overviewLoading}
          >
            {overviewLoading ? 'Loading…' : 'Refresh'}
          </button>
          <button
            type="button"
            className="linear-btn linear-btn--primary"
            onClick={handleRebuildSnapshot}
            disabled={rebuildingSnapshot}
          >
            {rebuildingSnapshot ? 'Rebuilding…' : 'Rebuild snapshot'}
          </button>
        </div>
      </header>

      {!tagsLoading && !catalogTags.length ? (
        <div className="pivot-lab__tag-seed-banner" role="status">
          <p>
            The global tag catalog is empty. Seed it before publishing events or using tag pickers in Lab.
          </p>
          <button
            type="button"
            className="linear-btn linear-btn--primary linear-btn--sm"
            onClick={handleSeedTagCatalog}
            disabled={tagSeeding}
          >
            {tagSeeding ? 'Seeding…' : 'Seed tag catalog'}
          </button>
        </div>
      ) : null}

      <div className="pivot-lab__context-bar">
        <span className={`pivot-lab__snapshot-meta${snapshotLabel ? '' : ' pivot-lab__snapshot-meta--stale'}`}>
          {snapshotLabel
            ? `Snapshot generated ${snapshotLabel}`
            : 'No stored snapshot for this week — live aggregates shown.'}
        </span>
        {selectedTenant?.dropSchedule ? (
          <span className="pivot-lab__next-drop">
            Next drop ({batchWeek}): {selectedTenant.dropSchedule.nextDropFormatted}
            {' · '}
            {selectedTenant.dropSchedule.localSchedule}
          </span>
        ) : null}
      </div>

      {overviewError ? (
        <p className="pivot-lab__error">{overviewError}</p>
      ) : null}

      <nav className="pivot-lab__tabs" aria-label="Pivot Lab sections">
        {LAB_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`pivot-lab__tab${activeTab === tab.key ? ' pivot-lab__tab--active' : ''}`}
            aria-current={activeTab === tab.key ? 'page' : undefined}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
            {tab.key === 'catalog' && events.length ? (
              <span className="pivot-lab__tab-count"> {events.length}</span>
            ) : null}
          </button>
        ))}
      </nav>

      {activeTab === 'overview' ? (
        <PivotLabOverview
          tenants={tenants}
          selectedTenant={selectedTenant}
          batchWeek={batchWeek}
          retention={retentionResponse?.success ? retentionResponse.data : null}
          retentionLoading={retentionLoading}
          retentionError={retentionError}
          overviewLoading={overviewLoading}
          referralRows={referralRows}
        />
      ) : null}

      {activeTab === 'import' ? (
      <section className="linear-section pivot-lab__section" aria-labelledby="pivot-lab-import">
        <div className="pivot-lab__section-head">
          <div>
            <h2 id="pivot-lab-import" className="linear-section__title">
              Import event
            </h2>
            <p className="pivot-lab__notes-hint">
              Paste a URL, quick-add manual events (<kbd className="pivot-lab__key-hint">M</kbd>), load
              agent JSON, then stage into the ISO week of each event’s start date (or force the
              selected batch week). Release separately to go
              live.
            </p>
          </div>
          <span className="pivot-lab__import-target">
            Staging for <strong>{selectedTenant?.cityDisplayName || selectedTenantKey || '—'}</strong>
          </span>
        </div>
        <div className="pivot-lab__import-toolbar">
          <button
            type="button"
            className="linear-btn linear-btn--primary pivot-lab__manual-import-btn"
            onClick={() => setManualImportOpen(true)}
          >
            Manual import
          </button>
          <span className="pivot-lab__import-toolbar-hint">
            Quick entry for ops · press <kbd className="pivot-lab__key-hint">M</kbd>
          </span>
        </div>
        <div className="pivot-lab__import-row">
          <label className="linear-field pivot-lab__import-url">
            <span className="linear-field__label">Event or explore URL</span>
            <input
              className="linear-input"
              value={importUrl}
              onChange={(e) => setImportUrl(e.target.value)}
              placeholder="https://partiful.com/e/…, https://partiful.com/explore/sf, or https://luma.com/sf"
            />
          </label>
          <button
            type="button"
            className="linear-btn linear-btn--primary"
            onClick={handlePreviewImport}
            disabled={importLoading}
          >
            {importLoading ? 'Fetching…' : 'Preview import'}
          </button>
        </div>
        <details className="pivot-lab__json-import">
          <summary className="pivot-lab__json-import-summary">JSON import (agents)</summary>
          <div className="pivot-lab__json-import-body">
            <p className="pivot-lab__json-import-hint">
              For Just Go weekly ops: give agents the prompt below, paste their JSON here, then review
              in the batch table. Listing URLs are optional — manual events work without a sourceUrl.
              Film events tagged <code>film-and-tv</code> auto-match TMDB on preview and load.
            </p>
            <div className="pivot-lab__json-import-actions">
              <button
                type="button"
                className="linear-btn linear-btn--ghost"
                onClick={handleCopyJsonAgentPrompt}
              >
                Copy agent prompt
              </button>
            </div>
            <pre className="pivot-lab__json-import-prompt" aria-label="Agent JSON format">
              {PIVOT_JSON_IMPORT_AGENT_PROMPT}
            </pre>
            <label className="linear-field pivot-lab__json-import-field">
              <span className="linear-field__label">Agent JSON</span>
              <textarea
                className="linear-input pivot-lab__json-import-textarea"
                value={importJsonDraft}
                onChange={(e) => {
                  setImportJsonDraft(e.target.value);
                  setJsonImportPreview(null);
                }}
                placeholder={PIVOT_JSON_IMPORT_EXAMPLE}
                rows={8}
                spellCheck={false}
              />
            </label>
            <div className="pivot-lab__notes-actions pivot-lab__json-import-buttons">
              <button
                type="button"
                className="linear-btn linear-btn--ghost"
                onClick={handlePreviewJsonImport}
                disabled={!importJsonDraft.trim() || jsonImportTmdbMatching}
              >
                {tmdbMatchLoadingKey === 'json-preview' ? 'Matching films…' : 'Preview JSON'}
              </button>
              <button
                type="button"
                className="linear-btn linear-btn--primary"
                onClick={handleLoadJsonImport}
                disabled={!importJsonDraft.trim() || jsonImportTmdbMatching}
              >
                {tmdbMatchLoadingKey === 'json-load' ? 'Matching films…' : 'Load JSON into batch'}
              </button>
            </div>
            {jsonImportPreview?.error ? (
              <p className="pivot-lab__json-preview-error">{jsonImportPreview.error}</p>
            ) : null}
            {jsonImportPreview?.entries?.length ? (
              <div className="pivot-lab__json-preview">
                <p className="pivot-lab__json-preview-summary">
                  Found {jsonImportPreview.entries.length} event(s) in{' '}
                  <strong>{jsonImportPreview.label}</strong>. {jsonImportReadyCount} ready to
                  stage as-is; others need tags or missing fields.
                  {jsonImportPreview.tmdbMatch?.matched
                    ? ` ${jsonImportPreview.tmdbMatch.matched} film(s) matched from TMDB.`
                    : ''}
                  {jsonImportPreview.tmdbMatch?.failed
                    ? ` ${jsonImportPreview.tmdbMatch.failed} film match(es) failed.`
                    : ''}
                </p>
                <div className="pivot-lab__table-wrap">
                  <table className="pivot-lab__table pivot-lab__json-preview-table">
                    <thead>
                      <tr>
                        <th scope="col">Image</th>
                        <th scope="col">Event</th>
                        <th scope="col">Organizer</th>
                        <th scope="col">When</th>
                        <th scope="col">Showtimes</th>
                        <th scope="col">Location</th>
                        <th scope="col">Tags</th>
                        <th scope="col">Film</th>
                        <th scope="col">Status</th>
                        <th scope="col">Catalog</th>
                        <th scope="col">TMDB</th>
                      </tr>
                    </thead>
                    <tbody>
                      {jsonImportPreview.entries.map((entry, index) => {
                        const draft = entry.draft || {};
                        const ready = isJsonImportEntryReady(entry);
                        const rowLoadingKey = `json-${index}`;
                        return (
                          <tr
                            key={`${draft.name || 'event'}-${index}`}
                            className={ready ? '' : 'pivot-lab__json-preview-row--warn'}
                          >
                            <td className="pivot-lab__thumb-cell">
                              <PivotImportThumb src={draft.image} alt={draft.name} />
                            </td>
                            <td>{draft.name || '—'}</td>
                            <td>{draft.hostName || '—'}</td>
                            <td>{formatEventWhen(draft.start_time || draft.timeSlots?.[0]?.start_time)}</td>
                            <td>{formatEventTimeSlots(draft.timeSlots)}</td>
                            <td>{draft.location || '—'}</td>
                            <td>{formatEventTags(draft.tags)}</td>
                            <td>{formatEventFilmStatus(draft)}</td>
                            <td>
                              {ready ? (
                                <span className="pivot-lab__pill pivot-lab__pill--ok">Ready</span>
                              ) : (
                                <span className="pivot-lab__pill pivot-lab__pill--warn">Needs review</span>
                              )}
                            </td>
                            <td>
                              {entry.duplicate ? (
                                <span
                                  className={`pivot-lab__duplicate-pill${
                                    isBlockingImportDuplicate(entry.duplicate)
                                      ? ' pivot-lab__duplicate-pill--blocking'
                                      : ' pivot-lab__duplicate-pill--update'
                                  }`}
                                  title={
                                    entry.duplicate.existingName
                                      ? `Matches "${entry.duplicate.existingName}"`
                                      : undefined
                                  }
                                >
                                  {duplicateBadgeLabel(entry.duplicate)}
                                </span>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td>
                              {draft.movie?.tmdbId ? (
                                '—'
                              ) : (
                                <button
                                  type="button"
                                  className="linear-btn linear-btn--ghost pivot-lab__tmdb-btn"
                                  onClick={() => handleMatchTmdbForJsonEntry(index)}
                                  disabled={
                                    Boolean(tmdbMatchLoadingKey) &&
                                    tmdbMatchLoadingKey !== rowLoadingKey
                                  }
                                >
                                  {tmdbMatchLoadingKey === rowLoadingKey ? '…' : 'Retry'}
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {jsonImportPreview.duplicateWarnings?.length ? (
                  <ul className="pivot-lab__import-warnings pivot-lab__json-preview-warnings">
                    {jsonImportPreview.duplicateWarnings.map((warning) => (
                      <li key={`dup-${warning}`}>{warning}</li>
                    ))}
                  </ul>
                ) : null}
                {jsonImportPreview.entries.some((entry) => entry.warnings?.length) ? (
                  <ul className="pivot-lab__import-warnings pivot-lab__json-preview-warnings">
                    {jsonImportPreview.entries.flatMap((entry, index) =>
                      (entry.warnings || []).map((warning) => (
                        <li key={`${entry.draft?.name || 'event'}-${index}-${warning}`}>
                          {entry.draft?.name ? `${entry.draft.name}: ` : `Event ${index + 1}: `}
                          {warning}
                        </li>
                      )),
                    )}
                  </ul>
                ) : null}
                <details className="pivot-lab__json-preview-raw">
                  <summary className="pivot-lab__json-preview-raw-summary">Normalized JSON</summary>
                  <pre className="pivot-lab__json-preview-code">{jsonImportPreviewDocument}</pre>
                </details>
              </div>
            ) : null}
          </div>
        </details>
        {importError ? <p className="pivot-lab__error">{importError}</p> : null}
        {importMode === 'batch' && importBatchRows.length ? (
          <div className="pivot-lab__import-preview">
            {importProvider ? (
              <p className="pivot-lab__import-provider">Detected provider: {importProvider}</p>
            ) : null}
            <p className="pivot-lab__batch-summary">
              Found {importBatchRows.length} event(s) from {importBatchLabel}. Select rows to stage
              and fill any missing organizer names.
            </p>
            {importWarnings.length ? (
              <ul className="pivot-lab__import-warnings">
                {importWarnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            ) : null}
            <div className="pivot-lab__batch-tag-tools">
              <PivotTagMultiSelect
                catalogTags={catalogTags}
                selectedSlugs={batchApplyTags}
                onChange={setBatchApplyTags}
                labelId="pivot-lab-batch-apply-tags"
                hint="Optional shortcut: pick tags once, then apply to all selected rows."
                compact
              />
              <div className="pivot-lab__notes-actions pivot-lab__batch-tag-actions">
                <button
                  type="button"
                  className="linear-btn linear-btn--ghost"
                  onClick={applyTagsToSelectedBatchRows}
                  disabled={!batchApplyTags.length || !selectedBatchRows.length}
                >
                  Apply to selected
                </button>
                <button
                  type="button"
                  className="linear-btn linear-btn--ghost"
                  onClick={suggestTagsForSelectedBatchRows}
                  disabled={!selectedBatchRows.length || tagSuggestLoadingKey === 'batch-all'}
                >
                  {tagSuggestLoadingKey === 'batch-all'
                    ? batchTagProgress
                      ? `Suggesting ${batchTagProgress.done}/${batchTagProgress.total}…`
                      : 'Suggesting…'
                    : 'Suggest tags for selected (Claude)'}
                </button>
              </div>
            </div>
            <div className="pivot-lab__table-wrap">
              <table className="pivot-lab__table pivot-lab__batch-table">
                <thead>
                  <tr>
                    <th scope="col">
                      <input
                        type="checkbox"
                        aria-label="Select all events"
                        checked={
                          selectableBatchRows.length > 0 &&
                          selectableBatchRows.every((row) => row.selected)
                        }
                        onChange={(e) => {
                          const { checked } = e.target;
                          setImportBatchRows((rows) =>
                            rows.map((row) => ({
                              ...row,
                              selected: checked && !row.isBlockingDuplicate,
                            })),
                          );
                        }}
                      />
                    </th>
                    <th scope="col">Image</th>
                    <th scope="col">Event</th>
                    <th scope="col">Status</th>
                    <th scope="col">Organizer</th>
                    <th scope="col">When</th>
                    <th scope="col">Showtimes</th>
                    <th scope="col">Location</th>
                    <th scope="col">Tags</th>
                    <th scope="col">Film</th>
                    <th scope="col">Source</th>
                    <th scope="col">Deck</th>
                    <th scope="col">TMDB</th>
                  </tr>
                </thead>
                <tbody>
                  {importBatchRows.map((row) => (
                    <tr
                      key={row.key}
                      className={
                        row.isBlockingDuplicate
                          ? 'pivot-lab__batch-row--duplicate'
                          : row.warnings.length || row.duplicate
                            ? 'pivot-lab__batch-row--warn'
                            : ''
                      }
                    >
                      <td>
                        <input
                          type="checkbox"
                          checked={row.selected}
                          disabled={row.isBlockingDuplicate}
                          onChange={(e) =>
                            updateBatchImportRow(row.key, { selected: e.target.checked })
                          }
                          aria-label={`Select ${row.name || 'event'}`}
                        />
                      </td>
                      <td className="pivot-lab__thumb-cell">
                        <PivotImportThumb src={row.imageUrl} alt={row.name} />
                      </td>
                      <td>{row.name || '—'}</td>
                      <td>
                        {row.duplicateLabel ? (
                          <span
                            className={`pivot-lab__duplicate-pill${
                              row.isBlockingDuplicate
                                ? ' pivot-lab__duplicate-pill--blocking'
                                : ' pivot-lab__duplicate-pill--update'
                            }`}
                          >
                            {row.duplicateLabel}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>
                        <input
                          className="linear-input pivot-lab__batch-input"
                          value={row.organizerName}
                          onChange={(e) =>
                            updateBatchImportRow(row.key, { organizerName: e.target.value })
                          }
                          placeholder="Required"
                        />
                      </td>
                      <td>{formatEventWhen(row.startTime)}</td>
                      <td>{formatEventTimeSlots(row.timeSlots)}</td>
                      <td>{row.location || '—'}</td>
                      <td className="pivot-lab__batch-tags-cell">
                        <PivotTagMultiSelect
                          catalogTags={catalogTags}
                          selectedSlugs={row.tags}
                          onChange={(tags) => updateBatchImportRow(row.key, { tags })}
                          labelId={`pivot-lab-batch-tags-${row.key}`}
                          compact
                          showLabel={false}
                        />
                        <button
                          type="button"
                          className="linear-btn linear-btn--ghost pivot-lab__tag-ai-btn"
                          onClick={() => suggestTagsForBatchRow(row.key)}
                          disabled={
                            tagSuggestLoadingKey === row.key ||
                            tagSuggestLoadingKey === 'batch-all'
                          }
                        >
                          {tagSuggestLoadingKey === row.key
                            ? '…'
                            : row.aiTagged
                              ? 'Redo'
                              : 'AI'}
                        </button>
                        {row.aiTagged ? (
                          <span
                            className="pivot-lab__ai-done"
                            title="Tags suggested by Claude"
                          >
                            ✓ AI
                          </span>
                        ) : null}
                      </td>
                      <td>{formatEventFilmStatus(row)}</td>
                      <td>
                        {row.sourceUrl ? (
                          <a href={row.sourceUrl} target="_blank" rel="noreferrer">
                            Open
                          </a>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="linear-btn linear-btn--ghost pivot-lab__edit-btn"
                          onClick={() =>
                            setDeckPreviewState({ type: 'batch', rowKey: row.key })
                          }
                        >
                          Preview
                        </button>
                      </td>
                      <td>
                        {row.movie?.tmdbId ? (
                          '—'
                        ) : (
                          <button
                            type="button"
                            className="linear-btn linear-btn--ghost pivot-lab__tmdb-btn"
                            onClick={() => handleMatchTmdbForBatchRow(row.key)}
                            disabled={
                              Boolean(tmdbMatchLoadingKey) && tmdbMatchLoadingKey !== row.key
                            }
                          >
                            {tmdbMatchLoadingKey === row.key ? '…' : 'Retry'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pivot-lab__notes-actions">
              <button
                type="button"
                className="linear-btn linear-btn--primary"
                onClick={handlePublishBatchImport}
                disabled={
                  importPublishLoading || !selectedTenantKey || !publishableBatchRows.length
                }
              >
                {importPublishLoading
                  ? 'Staging…'
                  : `Stage ${publishableBatchRows.length} selected for ${selectedTenantKey || 'city'}`}
              </button>
              <button
                type="button"
                className="linear-btn linear-btn--ghost"
                onClick={handleStageAndReleaseNow}
                disabled={
                  importPublishLoading || !selectedTenantKey || !publishableBatchRows.length
                }
              >
                Stage &amp; release now…
              </button>
            </div>
          </div>
        ) : null}
        {importMode === 'single' && importPreview ? (
          <div className="pivot-lab__import-preview">
            {importProvider ? (
              <p className="pivot-lab__import-provider">Detected provider: {importProvider}</p>
            ) : null}
            <div className="pivot-lab__import-layout">
              <div className="pivot-lab__import-main">
                <div className="pivot-lab__import-grid">
                  <label className="linear-field">
                    <span className="linear-field__label">Event title</span>
                    <input
                      className="linear-input"
                      value={importName}
                      onChange={(e) => setImportName(e.target.value)}
                    />
                  </label>
                  <label className="linear-field">
                    <span className="linear-field__label">Organizer name</span>
                    <input
                      className="linear-input"
                      value={importOrganizerName}
                      onChange={(e) => setImportOrganizerName(e.target.value)}
                      placeholder="Required before stage"
                    />
                  </label>
                  <label className="linear-field">
                    <span className="linear-field__label">Start time</span>
                    <input
                      className="linear-input"
                      value={importStartTime}
                      onChange={(e) => setImportStartTime(e.target.value)}
                      placeholder="ISO datetime or edit after preview"
                    />
                  </label>
                  <label className="linear-field">
                    <span className="linear-field__label">Location</span>
                    <input
                      className="linear-input"
                      value={importLocation}
                      onChange={(e) => setImportLocation(e.target.value)}
                    />
                  </label>
                </div>
                <div className="pivot-lab__tag-actions">
                  <PivotTagMultiSelect
                    catalogTags={catalogTags}
                    selectedSlugs={importSelectedTags}
                    onChange={setImportSelectedTags}
                    labelId="pivot-lab-import-tags"
                    hint={
                      importSourceTags.length
                        ? `Required — pick catalog tags. Listing hints: ${importSourceTags.join(', ')}`
                        : 'Required — pick at least one tag from the catalog.'
                    }
                  />
                  <button
                    type="button"
                    className="linear-btn linear-btn--ghost"
                    onClick={suggestTagsForImport}
                    disabled={tagSuggestLoadingKey === 'single-import'}
                  >
                    {tagSuggestLoadingKey === 'single-import'
                      ? 'Suggesting…'
                      : 'Suggest tags with Claude'}
                  </button>
                </div>
                <label className="linear-field">
                  <span className="linear-field__label">Description</span>
                  <textarea
                    className="pivot-lab__notes"
                    value={importDescription}
                    onChange={(e) => setImportDescription(e.target.value)}
                    rows={3}
                  />
                </label>
                {importPreview.image ? (
                  <div className="pivot-lab__import-image">
                    <span className="pivot-lab__import-image-label">Cover image</span>
                    <a
                      href={importPreview.image}
                      target="_blank"
                      rel="noreferrer"
                      className="pivot-lab__thumb-link"
                    >
                      <PivotImportThumb src={importPreview.image} alt={importName} />
                    </a>
                  </div>
                ) : null}
                {importWarnings.length ? (
                  <ul className="pivot-lab__import-warnings">
                    {importWarnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                ) : null}
                <div className="pivot-lab__notes-actions">
                  <button
                    type="button"
                    className="linear-btn linear-btn--primary"
                    onClick={handlePublishImport}
                    disabled={
                      importPublishLoading ||
                      !selectedTenantKey ||
                      importBlockingDuplicate ||
                      !importSelectedTags.length
                    }
                  >
                    {importPublishLoading
                      ? 'Staging…'
                      : `Stage for ${selectedTenantKey || 'city'}`}
                  </button>
                  <button
                    type="button"
                    className="linear-btn linear-btn--ghost"
                    onClick={handleStageAndReleaseNow}
                    disabled={
                      importPublishLoading ||
                      !selectedTenantKey ||
                      importBlockingDuplicate ||
                      !importSelectedTags.length
                    }
                  >
                    Stage &amp; release now…
                  </button>
                </div>
              </div>
              {singleImportDeckPreview ? (
                <PivotDeckPhonePreview
                  {...singleImportDeckPreview}
                  hint="Live preview of the swipe deck card."
                />
              ) : null}
            </div>
          </div>
        ) : null}
      </section>
      ) : null}

      {activeTab === 'catalog' ? (
      <section className="linear-section pivot-lab__section" aria-labelledby="pivot-lab-events">
        <div className="pivot-lab__section-head">
          <div>
            <h2 id="pivot-lab-events" className="linear-section__title">
              Catalog events · {selectedTenant?.cityDisplayName || selectedTenantKey || '—'}
            </h2>
            <p className="pivot-lab__section-hint">
              Draft, staged, and published events for {batchWeek}. Staged events stay off the
              mobile feed until Release.
            </p>
          </div>
        </div>
        {eventsError ? <p className="pivot-lab__error">{eventsError}</p> : null}
        {eventsLoading ? (
          <p className="pivot-lab__empty">Loading events…</p>
        ) : events.length ? (
          <div className="pivot-lab__table-wrap">
            <table className="pivot-lab__table">
              <thead>
                <tr>
                  <th scope="col">
                    <span className="visually-hidden">Image</span>
                  </th>
                  <th scope="col">Event</th>
                  <th scope="col">Batch</th>
                  <th scope="col">Organizer</th>
                  <th scope="col">When</th>
                  <th scope="col">Location</th>
                  <th scope="col">Tags</th>
                  <th scope="col">Source</th>
                  <th scope="col">Status</th>
                  <th scope="col" title="Interested swipes">Int.</th>
                  <th scope="col" title="Self-confirmed going">Going</th>
                  <th scope="col" title="Passed swipes">Pass</th>
                  <th scope="col" title="Ticket-link opens (unique users)">Opens</th>
                  <th scope="col">Tickets</th>
                  <th scope="col">Deck</th>
                  <th scope="col">Edit</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event._id}>
                    <td className="pivot-lab__thumb-cell">
                      {event.externalLink || event.sourceUrl ? (
                        <a
                          className="pivot-lab__thumb-link"
                          href={event.externalLink || event.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          title="Open source listing"
                        >
                          <PivotImportThumb src={event.image} alt={event.name} />
                        </a>
                      ) : (
                        <PivotImportThumb src={event.image} alt={event.name} />
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="pivot-lab__event-name-btn"
                        onClick={() => openEditEvent(event)}
                      >
                        {event.name}
                      </button>
                    </td>
                    <td>
                      <span className="pivot-lab__batch-pill">{event.batchWeek || '—'}</span>
                    </td>
                    <td>{event.organizerName || '—'}</td>
                    <td>{formatEventWhen(event.start_time)}</td>
                    <td>{event.location || '—'}</td>
                    <td>{formatEventTags(event.tags)}</td>
                    <td>{event.source || '—'}</td>
                    <td>
                      <IngestStatusPill status={event.ingestStatus} />
                    </td>
                    <td>{event.intentStats?.interested ?? 0}</td>
                    <td>{event.intentStats?.registered ?? 0}</td>
                    <td>{event.intentStats?.passed ?? 0}</td>
                    <td>
                      {event.intentStats?.externalOpens ?? 0}
                      {event.intentStats?.externalOpenUsers
                        ? ` (${event.intentStats.externalOpenUsers})`
                        : ''}
                    </td>
                    <td>
                      {event.externalLink ? (
                        <a href={event.externalLink} target="_blank" rel="noreferrer">
                          Open
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="linear-btn linear-btn--ghost pivot-lab__edit-btn"
                        onClick={() =>
                          setDeckPreviewState({
                            type: 'static',
                            props: buildDeckPreviewProps({
                              name: event.name,
                              organizerName: event.organizerName,
                              startTime: event.start_time,
                              endTime: event.end_time,
                              location: event.location,
                            }),
                          })
                        }
                      >
                        Preview
                      </button>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="linear-btn linear-btn--ghost pivot-lab__edit-btn"
                        onClick={() => openEditEvent(event)}
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="pivot-lab__empty">No catalog events for this city and week.</p>
        )}
      </section>
      ) : null}

      {activeTab === 'notes' ? (
      <>
      <section className="linear-section pivot-lab__section" aria-labelledby="pivot-lab-notes">
        <h2 id="pivot-lab-notes" className="linear-section__title">
          Interview notes
        </h2>
        <p className="pivot-lab__notes-hint">
          Log qualitative themes from pilot interviews. Saved per batch week in the global DB.
        </p>
        <textarea
          className="pivot-lab__notes"
          value={notesDraft}
          onChange={(e) => {
            setNotesDraft(e.target.value);
            setNotesDirty(true);
          }}
          rows={8}
          placeholder="Week themes, quotes, blockers…"
          disabled={notesLoading}
        />
        <div className="pivot-lab__notes-actions">
          <button
            type="button"
            className="linear-btn linear-btn--primary"
            onClick={handleSaveNotes}
            disabled={savingNotes || notesLoading || !notesDirty}
          >
            {savingNotes ? 'Saving…' : 'Save notes'}
          </button>
        </div>
      </section>

      <section
        className="linear-section pivot-lab__section pivot-lab__dev-tools"
        aria-labelledby="pivot-lab-danger-zone"
      >
        <h2 id="pivot-lab-danger-zone" className="linear-section__title">
          Danger zone
        </h2>
        <p className="pivot-lab__notes-hint">
          Permanently deletes pivot catalog events, attendee intents, event feedback, analytics, and
          stored weekly snapshots for the chosen scope. Referral codes and interview notes are kept.
          This runs against production data and cannot be undone — scope carefully.
        </p>
        <div className="pivot-lab__dev-tools-grid">
          <label className="linear-field">
            <span className="linear-field__label">City scope</span>
            <select
              className="linear-input"
              value={purgeScope}
              onChange={(e) => setPurgeScope(e.target.value)}
            >
              <option value="selected">Selected city only</option>
              <option value="all">All pivot cities</option>
            </select>
          </label>
          <label className="linear-field">
            <span className="linear-field__label">Weeks</span>
            <select
              className="linear-input"
              value={purgeWeekScope}
              onChange={(e) => setPurgeWeekScope(e.target.value)}
            >
              <option value="week">Selected week only ({batchWeek})</option>
              <option value="all">All batch weeks</option>
            </select>
          </label>
          <label className="linear-field">
            <span className="linear-field__label">Type {PURGE_CONFIRM_TOKEN} to confirm</span>
            <input
              className="linear-input"
              value={purgeConfirm}
              onChange={(e) => setPurgeConfirm(e.target.value)}
              placeholder={PURGE_CONFIRM_TOKEN}
              autoComplete="off"
            />
          </label>
        </div>
        <div className="pivot-lab__notes-actions">
          <button
            type="button"
            className="linear-btn pivot-lab__purge-btn"
            onClick={handlePurgeCatalog}
            disabled={
              purgingCatalog ||
              purgeConfirm.trim() !== PURGE_CONFIRM_TOKEN ||
              (purgeScope === 'selected' && !selectedTenantKey)
            }
          >
            {purgingCatalog
              ? 'Purging…'
              : purgeWeekScope === 'week'
                ? `Purge catalog events (${batchWeek})`
                : 'Purge catalog events (all weeks)'}
          </button>
        </div>
      </section>
      </>
      ) : null}

      <DeckPreviewModal
        previewProps={deckPreviewContent?.props}
        hint={deckPreviewContent?.hint}
        onClose={() => setDeckPreviewState(null)}
      />

      <PivotCatalogEventEditModal
        open={Boolean(editingEvent)}
        event={editingEvent}
        onClose={() => setEditingEvent(null)}
        catalogTags={catalogTags}
        cityLabel={selectedTenant?.cityDisplayName || selectedTenantKey}
        batchWeek={batchWeek}
        onSave={handleSaveCatalogEdit}
        saving={editSaving}
        onSuggestTags={suggestTagsForEdit}
        tagSuggestLoading={tagSuggestLoadingKey === 'edit'}
      />

      <PivotManualImportModal
        open={manualImportOpen}
        onClose={() => setManualImportOpen(false)}
        catalogTags={catalogTags}
        cityLabel={selectedTenant?.cityDisplayName || selectedTenantKey}
        batchWeek={batchWeek}
        selectedTenantKey={selectedTenantKey}
        stickyDefaults={manualImportSticky}
        onStickyChange={setManualImportSticky}
        onAddToBatch={handleAddManualToBatch}
        onPublish={handlePublishManualImport}
        publishLoading={manualImportPublishLoading}
        onSuggestTags={suggestTagsForManualImport}
        tagSuggestLoading={tagSuggestLoadingKey === 'manual-import'}
      />
    </div>
  );
}

export default PivotLabPage;
