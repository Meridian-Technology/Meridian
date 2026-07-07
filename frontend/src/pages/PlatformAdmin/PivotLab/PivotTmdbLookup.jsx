import React, { useCallback, useState } from 'react';
import { authenticatedRequest } from '../../../hooks/useFetch';
import './PivotTmdbLookup.scss';

function formatTmdbRating(score) {
  if (score == null || Number.isNaN(Number(score))) {
    return null;
  }
  return `${Number(score).toFixed(1)}/10`;
}

function PivotTmdbLookup({ movie, onMovieChange, disabled }) {
  const [query, setQuery] = useState(movie?.title || '');
  const [year, setYear] = useState(movie?.year ? String(movie.year) : '');
  const [results, setResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSearch = useCallback(async () => {
    const trimmed = query.trim();
    if (!trimmed) {
      setError('Enter a film title to search TMDB.');
      return;
    }

    setSearchLoading(true);
    setError('');
    const { data, error: requestError } = await authenticatedRequest('/admin/pivot/tmdb/search', {
      params: {
        query: trimmed,
        ...(year.trim() ? { year: year.trim() } : {}),
      },
    });
    setSearchLoading(false);

    if (requestError || !data?.success) {
      setResults([]);
      setError(requestError || data?.message || 'TMDB search failed.');
      return;
    }

    setResults(data.data?.results || []);
    if (!data.data?.results?.length) {
      setError('No TMDB matches found.');
    }
  }, [query, year]);

  const handleSelect = useCallback(
    async (tmdbId) => {
      setDetailLoading(true);
      setError('');
      const { data, error: requestError } = await authenticatedRequest(
        `/admin/pivot/tmdb/movies/${tmdbId}`,
      );
      setDetailLoading(false);

      if (requestError || !data?.success) {
        setError(requestError || data?.message || 'Could not load TMDB movie.');
        return;
      }

      const nextMovie = data.data?.movie;
      if (!nextMovie) {
        setError('TMDB movie payload was empty.');
        return;
      }

      onMovieChange?.(nextMovie);
      setResults([]);
      setQuery(nextMovie.title || query);
      setYear(nextMovie.year ? String(nextMovie.year) : year);
    },
    [onMovieChange, query, year],
  );

  const handleClear = useCallback(() => {
    onMovieChange?.(null);
    setResults([]);
    setError('');
  }, [onMovieChange]);

  return (
    <div className="pivot-tmdb-lookup">
      <div className="pivot-tmdb-lookup__head">
        <h4 className="pivot-tmdb-lookup__title">Film (TMDB)</h4>
        {movie ? (
          <button
            type="button"
            className="pivot-tmdb-lookup__clear"
            onClick={handleClear}
            disabled={disabled || detailLoading}
          >
            Remove film
          </button>
        ) : null}
      </div>

      {movie ? (
        <div className="pivot-tmdb-lookup__attached">
          {movie.posterUrl ? (
            <img
              className="pivot-tmdb-lookup__poster"
              src={movie.posterUrl}
              alt={`${movie.title} poster`}
              referrerPolicy="no-referrer"
            />
          ) : null}
          <div className="pivot-tmdb-lookup__attached-copy">
            <p className="pivot-tmdb-lookup__attached-title">
              {movie.title}
              {movie.year ? ` (${movie.year})` : ''}
            </p>
            {movie.ratings?.tmdb?.score != null ? (
              <p className="pivot-tmdb-lookup__attached-meta">
                TMDB {formatTmdbRating(movie.ratings.tmdb.score)}
                {movie.ratings.tmdb.voteCount
                  ? ` · ${movie.ratings.tmdb.voteCount.toLocaleString()} votes`
                  : ''}
              </p>
            ) : null}
            {movie.runtimeMinutes ? (
              <p className="pivot-tmdb-lookup__attached-meta">{movie.runtimeMinutes} min</p>
            ) : null}
            {movie.synopsis ? (
              <p className="pivot-tmdb-lookup__attached-synopsis">{movie.synopsis}</p>
            ) : null}
          </div>
        </div>
      ) : (
        <>
          <div className="pivot-tmdb-lookup__search-row">
            <label className="pivot-tmdb-lookup__field pivot-tmdb-lookup__field--grow">
              <span className="pivot-tmdb-lookup__label">Search TMDB</span>
              <input
                className="linear-input pivot-tmdb-lookup__input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="The Last Garden"
                autoComplete="off"
                disabled={disabled || searchLoading || detailLoading}
              />
            </label>
            <label className="pivot-tmdb-lookup__field">
              <span className="pivot-tmdb-lookup__label">Year</span>
              <input
                className="linear-input pivot-tmdb-lookup__input pivot-tmdb-lookup__year"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                placeholder="2026"
                inputMode="numeric"
                autoComplete="off"
                disabled={disabled || searchLoading || detailLoading}
              />
            </label>
            <button
              type="button"
              className="linear-btn linear-btn--ghost pivot-tmdb-lookup__search-btn"
              onClick={handleSearch}
              disabled={disabled || searchLoading || detailLoading || !query.trim()}
            >
              {searchLoading ? 'Searching…' : 'Search'}
            </button>
          </div>

          {results.length ? (
            <ul className="pivot-tmdb-lookup__results">
              {results.map((result) => (
                <li key={result.tmdbId}>
                  <button
                    type="button"
                    className="pivot-tmdb-lookup__result"
                    onClick={() => handleSelect(result.tmdbId)}
                    disabled={disabled || detailLoading}
                  >
                    {result.posterUrl ? (
                      <img
                        className="pivot-tmdb-lookup__result-poster"
                        src={result.posterUrl}
                        alt=""
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <span className="pivot-tmdb-lookup__result-poster pivot-tmdb-lookup__result-poster--empty" />
                    )}
                    <span className="pivot-tmdb-lookup__result-copy">
                      <span className="pivot-tmdb-lookup__result-title">
                        {result.title}
                        {result.year ? ` (${result.year})` : ''}
                      </span>
                      {result.voteAverage != null ? (
                        <span className="pivot-tmdb-lookup__result-meta">
                          TMDB {formatTmdbRating(result.voteAverage)}
                        </span>
                      ) : null}
                      {result.overview ? (
                        <span className="pivot-tmdb-lookup__result-overview">{result.overview}</span>
                      ) : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}

      {detailLoading ? (
        <p className="pivot-tmdb-lookup__status">Loading film details from TMDB…</p>
      ) : null}
      {error ? <p className="pivot-tmdb-lookup__error">{error}</p> : null}
    </div>
  );
}

export default PivotTmdbLookup;
