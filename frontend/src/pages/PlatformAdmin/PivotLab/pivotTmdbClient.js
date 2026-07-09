import { authenticatedRequest } from '../../../hooks/useFetch';

const FILM_TAG_SLUGS = new Set(['film-and-tv', 'movies']);

export function deriveTmdbSearchQuery(eventName) {
  const trimmed = typeof eventName === 'string' ? eventName.trim() : '';
  if (!trimmed) {
    return '';
  }

  const emDashParts = trimmed.split(/\s*[—–-]\s+/);
  if (emDashParts.length > 1) {
    return emDashParts[emDashParts.length - 1].trim();
  }

  const colonMatch = trimmed.match(/^[^:]+:\s*(.+)$/);
  if (colonMatch) {
    return colonMatch[1].trim();
  }

  return trimmed;
}

export function deriveTmdbSearchYear(startTime) {
  if (!startTime) {
    return null;
  }
  const parsed = new Date(startTime);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.getFullYear();
}

export function isFilmImportCandidate(draft) {
  if (!draft || typeof draft !== 'object') {
    return false;
  }
  if (draft.movie?.tmdbId) {
    return false;
  }

  const tags = Array.isArray(draft.tags) ? draft.tags : [];
  return tags.some((tag) => FILM_TAG_SLUGS.has(String(tag).trim().toLowerCase()));
}

export async function searchTmdbMovies(query, year) {
  const trimmed = typeof query === 'string' ? query.trim() : '';
  if (!trimmed) {
    return { error: 'Enter a film title to search TMDB.' };
  }

  const { data, error } = await authenticatedRequest('/admin/pivot/tmdb/search', {
    params: {
      query: trimmed,
      ...(year ? { year: String(year) } : {}),
    },
  });

  if (error || !data?.success) {
    return {
      error: error || data?.message || 'TMDB search failed.',
      code: data?.code,
    };
  }

  return {
    results: Array.isArray(data.data?.results) ? data.data.results : [],
  };
}

export async function fetchTmdbMovieDetails(tmdbId) {
  const id = Number(tmdbId);
  if (!Number.isFinite(id) || id <= 0) {
    return { error: 'Invalid TMDB id.' };
  }

  const { data, error } = await authenticatedRequest(`/admin/pivot/tmdb/movies/${id}`);
  if (error || !data?.success) {
    return {
      error: error || data?.message || 'Could not load TMDB movie.',
      code: data?.code,
    };
  }

  const movie = data.data?.movie;
  if (!movie) {
    return { error: 'TMDB movie payload was empty.' };
  }

  return { movie };
}

export async function autoMatchTmdbMovieForEvent({ name, startTime, movie }) {
  if (movie?.tmdbId) {
    return { movie, skipped: true };
  }

  const query = deriveTmdbSearchQuery(name);
  if (!query) {
    return { error: 'Event title is required for TMDB lookup.' };
  }

  const year = deriveTmdbSearchYear(startTime);
  const searchResult = await searchTmdbMovies(query, year);
  if (searchResult.error) {
    return searchResult;
  }

  const topMatch = searchResult.results[0];
  if (!topMatch?.tmdbId) {
    return { error: `No TMDB matches for "${query}".` };
  }

  return fetchTmdbMovieDetails(topMatch.tmdbId);
}

export async function autoMatchFilmsForImportEntries(entries) {
  if (!Array.isArray(entries) || !entries.length) {
    return { moviesByIndex: new Map(), matched: 0, failed: 0 };
  }

  const moviesByIndex = new Map();
  let matched = 0;
  let failed = 0;

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (!isFilmImportCandidate(entry?.draft || {})) {
      continue;
    }

    const draft = entry.draft || {};
    const result = await autoMatchTmdbMovieForEvent({
      name: draft.name,
      startTime: draft.start_time || draft.timeSlots?.[0]?.start_time,
      movie: draft.movie,
    });

    if (result.movie && !result.skipped) {
      moviesByIndex.set(index, result.movie);
      matched += 1;
    } else if (result.error) {
      failed += 1;
    }
  }

  return { moviesByIndex, matched, failed };
}
