const axios = require('axios');
const {
  buildTmdbImageUrl,
  normalizePivotMovie,
} = require('../utilities/pivotMovieMetadata');

const TMDB_API_BASE = 'https://api.themoviedb.org/3';
const REQUEST_TIMEOUT_MS = 12_000;

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function resolveTmdbCredentials() {
  const readAccessToken =
    trimString(process.env.TMDB_API_READ_ACCESS_TOKEN) ||
    trimString(process.env.TMDB_READ_ACCESS_TOKEN) ||
    trimString(process.env.TMDB_ACCESS_TOKEN);

  if (readAccessToken) {
    return { mode: 'bearer', token: readAccessToken };
  }

  const apiKey = trimString(process.env.TMDB_API_KEY);
  if (apiKey) {
    return { mode: 'api_key', key: apiKey };
  }

  return null;
}

function buildTmdbRequestConfig(params = {}) {
  const credentials = resolveTmdbCredentials();
  if (!credentials) {
    return null;
  }

  const config = {
    timeout: REQUEST_TIMEOUT_MS,
    params,
  };

  if (credentials.mode === 'bearer') {
    config.headers = {
      Authorization: `Bearer ${credentials.token}`,
    };
    return config;
  }

  config.params = {
    api_key: credentials.key,
    ...params,
  };
  return config;
}

function tmdbUnavailableResult() {
  return {
    error:
      'TMDB is not configured. Set TMDB_API_READ_ACCESS_TOKEN (recommended) or TMDB_API_KEY in the backend environment.',
    status: 503,
    code: 'TMDB_NOT_CONFIGURED',
  };
}

function extractYear(releaseDate) {
  const value = trimString(releaseDate);
  if (!value) {
    return null;
  }
  const year = Number(value.slice(0, 4));
  return Number.isFinite(year) ? year : null;
}

function extractUsContentRating(releaseDates) {
  const results = releaseDates?.results;
  if (!Array.isArray(results)) {
    return null;
  }

  const us = results.find((entry) => entry.iso_3166_1 === 'US');
  const release = us?.release_dates?.find((entry) => entry.certification);
  return trimString(release?.certification) || null;
}

function mapTmdbMovieDetails(details) {
  if (!details || typeof details !== 'object') {
    return null;
  }

  const credits = details.credits || {};
  const director = Array.isArray(credits.crew)
    ? credits.crew.find((person) => person.job === 'Director')?.name
    : null;
  const cast = Array.isArray(credits.cast)
    ? credits.cast
        .slice(0, 5)
        .map((person) => trimString(person.name))
        .filter(Boolean)
    : [];

  const raw = {
    tmdbId: details.id,
    title: details.title || details.original_title,
    year: extractYear(details.release_date),
    synopsis: details.overview,
    posterPath: details.poster_path,
    backdropPath: details.backdrop_path,
    runtimeMinutes: details.runtime,
    genres: Array.isArray(details.genres)
      ? details.genres.map((genre) => trimString(genre.name)).filter(Boolean)
      : [],
    contentRating: extractUsContentRating(details.release_dates),
    director: director ? trimString(director) : '',
    cast,
    imdbId: trimString(details.external_ids?.imdb_id),
    ratings: {
      tmdb: {
        score: details.vote_average,
        voteCount: details.vote_count,
      },
    },
  };

  return normalizePivotMovie(raw);
}

function mapTmdbSearchResult(result) {
  return {
    tmdbId: result.id,
    title: trimString(result.title || result.original_title),
    year: extractYear(result.release_date),
    overview: trimString(result.overview),
    posterUrl: buildTmdbImageUrl(result.poster_path, 'w185'),
    voteAverage: result.vote_average ?? null,
  };
}

async function searchTmdbMovies(options = {}) {
  const requestConfig = buildTmdbRequestConfig();
  if (!requestConfig) {
    return tmdbUnavailableResult();
  }

  const query = trimString(options.query);
  if (!query) {
    return {
      error: 'query is required.',
      status: 400,
      code: 'TMDB_QUERY_REQUIRED',
    };
  }

  const year = trimString(options.year);

  try {
    const response = await axios.get(`${TMDB_API_BASE}/search/movie`, {
      ...requestConfig,
      params: {
        ...requestConfig.params,
        query,
        ...(year ? { year } : {}),
        include_adult: false,
        language: 'en-US',
      },
    });

    const results = Array.isArray(response.data?.results)
      ? response.data.results.map(mapTmdbSearchResult).filter((row) => row.tmdbId && row.title)
      : [];

    return {
      data: {
        query,
        year: year || null,
        results,
      },
    };
  } catch (err) {
    const status = err.response?.status;
    return {
      error: status === 401 ? 'TMDB credentials are invalid.' : 'Unable to search TMDB.',
      status: status === 401 ? 503 : 502,
      code: status === 401 ? 'TMDB_AUTH_FAILED' : 'TMDB_SEARCH_FAILED',
    };
  }
}

async function fetchTmdbMovieDetails(options = {}) {
  const requestConfig = buildTmdbRequestConfig();
  if (!requestConfig) {
    return tmdbUnavailableResult();
  }

  const tmdbId = Number(options.tmdbId);
  if (!Number.isFinite(tmdbId) || tmdbId <= 0) {
    return {
      error: 'tmdbId is required.',
      status: 400,
      code: 'TMDB_ID_REQUIRED',
    };
  }

  try {
    const response = await axios.get(`${TMDB_API_BASE}/movie/${tmdbId}`, {
      ...requestConfig,
      params: {
        ...requestConfig.params,
        language: 'en-US',
        append_to_response: 'credits,external_ids,release_dates',
      },
    });

    const movie = mapTmdbMovieDetails(response.data);
    if (!movie) {
      return {
        error: 'TMDB movie not found.',
        status: 404,
        code: 'TMDB_MOVIE_NOT_FOUND',
      };
    }

    return {
      data: {
        movie,
      },
    };
  } catch (err) {
    const status = err.response?.status;
    if (status === 404) {
      return {
        error: 'TMDB movie not found.',
        status: 404,
        code: 'TMDB_MOVIE_NOT_FOUND',
      };
    }
    return {
      error: status === 401 ? 'TMDB credentials are invalid.' : 'Unable to load TMDB movie.',
      status: status === 401 ? 503 : 502,
      code: status === 401 ? 'TMDB_AUTH_FAILED' : 'TMDB_FETCH_FAILED',
    };
  }
}

module.exports = {
  searchTmdbMovies,
  fetchTmdbMovieDetails,
  mapTmdbMovieDetails,
  mapTmdbSearchResult,
};
