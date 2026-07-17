import { formatEventWhen } from '../../../utils/pivotIsoWeek';
import { applyMovieMetadataToDraft } from './PivotManualImportModal';
import { isFilmImportCandidate } from './pivotTmdbClient';

export const PIVOT_JSON_IMPORT_EXAMPLE = `{
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
    }
  ]
}`;

export const PIVOT_JSON_IMPORT_AGENT_PROMPT = `You are preparing events for the Just Go weekly local-events pilot (internal code name Pivot). Output a single JSON object only — no markdown fences, no commentary.

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

export function deriveImportEventWindowFromTimeSlots(timeSlots) {
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

export function buildBatchPublishOverrides(row) {
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

export function buildBatchPublishOverridesFromEntry(entry) {
  const draft = entry?.draft || {};
  const timeSlots = Array.isArray(draft.timeSlots) ? draft.timeSlots : [];
  const derivedWindow = timeSlots.length ? deriveImportEventWindowFromTimeSlots(timeSlots) : null;
  const startTime = trimImportString(draft.start_time) || derivedWindow?.start_time || '';
  const endTime = trimImportString(draft.end_time) || derivedWindow?.end_time || '';

  return {
    hostName: trimImportString(draft.hostName),
    name: trimImportString(draft.name),
    location: trimImportString(draft.location),
    ...(startTime ? { start_time: startTime } : {}),
    ...(endTime ? { end_time: endTime } : {}),
    description: trimImportString(draft.description) || undefined,
    image: trimImportString(draft.image) || undefined,
    source: trimImportString(draft.source) || 'manual',
    sourceUrl: trimImportString(entry?.sourceUrl || draft.sourceUrl) || undefined,
    tags: Array.isArray(draft.tags) ? draft.tags : [],
    ...(timeSlots.length ? { timeSlots } : {}),
    ...(draft.movie ? { movie: draft.movie } : {}),
  };
}

export function formatEventTimeSlots(timeSlots) {
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

export function parsePivotJsonImport(text) {
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

export function isJsonImportEntryReady(entry) {
  const draft = entry?.draft || {};
  const hasWhen = Boolean(draft.start_time || draft.timeSlots?.length);
  return Boolean(
    draft.hostName && draft.name && draft.location && hasWhen && draft.tags?.length,
  );
}

export function buildJsonImportPreviewDocument(preview) {
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

export function formatEventTags(tags) {
  if (!Array.isArray(tags) || !tags.length) return '—';
  if (tags.length === 1) return tags[0];
  return `${tags[0]} +${tags.length - 1}`;
}

export function applyMovieMetadataToImportDraft(draft, movie) {
  const applied = applyMovieMetadataToDraft(movie);
  return {
    ...draft,
    movie: applied.movie,
    name: applied.name || draft.name,
    description: applied.description || draft.description,
    image: applied.imageUrl || draft.image,
  };
}

export function formatEventFilmStatus(draft) {
  const movie = draft?.movie;
  if (movie?.title) {
    return movie.year ? `${movie.title} (${movie.year})` : movie.title;
  }
  if (isFilmImportCandidate(draft || {})) {
    return 'Needs TMDB';
  }
  return '—';
}

export function isBlockingImportDuplicate(duplicate) {
  if (!duplicate) return false;
  return duplicate.matchType === 'batchSourceUrl' || duplicate.matchType === 'batchFingerprint';
}

export function duplicateBadgeLabel(duplicate) {
  if (!duplicate) return null;
  if (duplicate.matchType === 'batchSourceUrl' || duplicate.matchType === 'batchFingerprint') {
    return 'Batch duplicate';
  }
  return 'Will update';
}

export function serializeJsonImportDraft(label, entries) {
  return JSON.stringify(
    {
      label,
      events: entries.map((entry) => entry.draft),
    },
    null,
    2,
  );
}
