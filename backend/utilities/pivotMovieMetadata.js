/**
 * Movie metadata stored on `customFields.pivot.movie` (TMDB-backed film listings).
 */

const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function toNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function roundRating(value) {
  const num = toNumber(value);
  if (num == null) {
    return null;
  }
  return Math.round(num * 10) / 10;
}

function buildTmdbImageUrl(path, size = 'w500') {
  const normalized = trimString(path);
  if (!normalized) {
    return null;
  }
  if (normalized.startsWith('http://') || normalized.startsWith('https://')) {
    return normalized;
  }
  return `${TMDB_IMAGE_BASE}/${size}${normalized.startsWith('/') ? normalized : `/${normalized}`}`;
}

function normalizeRatings(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const tmdbScore = roundRating(raw.tmdb?.score ?? raw.tmdbScore);
  const tmdbVoteCount = toNumber(raw.tmdb?.voteCount ?? raw.tmdbVoteCount);
  if (tmdbScore == null && tmdbVoteCount == null) {
    return null;
  }

  return {
    ...(tmdbScore != null
      ? {
          tmdb: {
            score: tmdbScore,
            ...(tmdbVoteCount != null ? { voteCount: tmdbVoteCount } : {}),
          },
        }
      : {}),
  };
}

function normalizeStringArray(raw) {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.map((entry) => trimString(entry)).filter(Boolean);
}

/**
 * @param {unknown} raw
 * @returns {object | null}
 */
function normalizePivotMovie(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const tmdbId = toNumber(raw.tmdbId);
  const title = trimString(raw.title);
  if (!tmdbId || !title) {
    return null;
  }

  const year = toNumber(raw.year);
  const synopsis = trimString(raw.synopsis || raw.overview);
  const posterUrl = trimString(raw.posterUrl) || buildTmdbImageUrl(raw.posterPath, 'w500');
  const backdropUrl =
    trimString(raw.backdropUrl) || buildTmdbImageUrl(raw.backdropPath, 'w780');
  const runtimeMinutes = toNumber(raw.runtimeMinutes ?? raw.runtime);
  const genres = normalizeStringArray(raw.genres);
  const contentRating = trimString(raw.contentRating);
  const director = trimString(raw.director);
  const cast = normalizeStringArray(raw.cast);
  const imdbId = trimString(raw.imdbId);
  const ratings = normalizeRatings(raw.ratings);

  return {
    tmdbId,
    title,
    ...(year != null ? { year } : {}),
    ...(synopsis ? { synopsis } : {}),
    ...(posterUrl ? { posterUrl } : {}),
    ...(backdropUrl ? { backdropUrl } : {}),
    ...(runtimeMinutes != null ? { runtimeMinutes } : {}),
    ...(genres.length ? { genres } : {}),
    ...(contentRating ? { contentRating } : {}),
    ...(director ? { director } : {}),
    ...(cast.length ? { cast } : {}),
    ...(imdbId ? { imdbId } : {}),
    ...(ratings ? { ratings } : {}),
  };
}

function serializePivotMovie(movie) {
  if (!movie || typeof movie !== 'object') {
    return null;
  }

  return normalizePivotMovie(movie);
}

function applyMovieListingDefaults(merged) {
  if (!merged?.movie) {
    return merged;
  }

  const movie = merged.movie;
  return {
    ...merged,
    name: trimString(merged.name) || movie.title,
    description: trimString(merged.description) || movie.synopsis || '',
    image: trimString(merged.image) || movie.posterUrl || '',
  };
}

function resolvePivotCoverImageUrl(event) {
  const pivot = event?.customFields?.pivot || {};
  const movie = serializePivotMovie(pivot.movie);
  const eventImage = trimString(event?.image);
  if (movie?.backdropUrl) {
    return movie.backdropUrl;
  }
  if (movie?.posterUrl) {
    return movie.posterUrl;
  }
  return eventImage || null;
}

module.exports = {
  buildTmdbImageUrl,
  normalizePivotMovie,
  serializePivotMovie,
  applyMovieListingDefaults,
  resolvePivotCoverImageUrl,
};
