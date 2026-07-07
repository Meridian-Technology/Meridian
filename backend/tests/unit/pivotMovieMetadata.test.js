const {
  buildTmdbImageUrl,
  normalizePivotMovie,
  applyMovieListingDefaults,
  resolvePivotCoverImageUrl,
} = require('../../utilities/pivotMovieMetadata');
const {
  mapTmdbMovieDetails,
  mapTmdbSearchResult,
} = require('../../services/pivotTmdbService');

describe('pivotMovieMetadata', () => {
  it('builds TMDB image URLs from poster paths', () => {
    expect(buildTmdbImageUrl('/abc.jpg', 'w500')).toBe(
      'https://image.tmdb.org/t/p/w500/abc.jpg',
    );
  });

  it('normalizes movie metadata with TMDB ratings', () => {
    const movie = normalizePivotMovie({
      tmdbId: 123,
      title: 'The Last Garden',
      year: 2026,
      overview: 'A gardener discovers a hidden world.',
      posterPath: '/poster.jpg',
      runtimeMinutes: 118,
      genres: ['Drama', 'Sci-Fi'],
      ratings: { tmdb: { score: 7.84, voteCount: 1200 } },
    });

    expect(movie).toMatchObject({
      tmdbId: 123,
      title: 'The Last Garden',
      year: 2026,
      synopsis: 'A gardener discovers a hidden world.',
      posterUrl: 'https://image.tmdb.org/t/p/w500/poster.jpg',
      runtimeMinutes: 118,
      genres: ['Drama', 'Sci-Fi'],
      ratings: { tmdb: { score: 7.8, voteCount: 1200 } },
    });
  });

  it('applies movie defaults to listing fields', () => {
    const merged = applyMovieListingDefaults({
      hostName: 'Nitehawk Cinema',
      location: 'Brooklyn',
      movie: normalizePivotMovie({
        tmdbId: 1,
        title: 'The Last Garden',
        overview: 'Synopsis text',
        posterUrl: 'https://example.com/poster.jpg',
      }),
    });

    expect(merged.name).toBe('The Last Garden');
    expect(merged.description).toBe('Synopsis text');
    expect(merged.image).toBe('https://example.com/poster.jpg');
  });

  it('prefers movie backdrop for cover image', () => {
    const url = resolvePivotCoverImageUrl({
      image: 'https://example.com/listing.jpg',
      customFields: {
        pivot: {
          movie: {
            tmdbId: 1,
            title: 'Film',
            backdropUrl: 'https://example.com/backdrop.jpg',
            posterUrl: 'https://example.com/poster.jpg',
          },
        },
      },
    });

    expect(url).toBe('https://example.com/backdrop.jpg');
  });
});

describe('pivotTmdbService mappers', () => {
  it('maps TMDB search results', () => {
    const row = mapTmdbSearchResult({
      id: 42,
      title: 'Garden',
      release_date: '2026-05-29',
      overview: 'Plot',
      poster_path: '/p.jpg',
      vote_average: 8.1,
    });

    expect(row).toMatchObject({
      tmdbId: 42,
      title: 'Garden',
      year: 2026,
      posterUrl: 'https://image.tmdb.org/t/p/w185/p.jpg',
      voteAverage: 8.1,
    });
  });

  it('maps TMDB movie details into pivot movie metadata', () => {
    const movie = mapTmdbMovieDetails({
      id: 99,
      title: 'Garden',
      release_date: '2026-05-29',
      overview: 'Plot summary',
      poster_path: '/poster.jpg',
      backdrop_path: '/backdrop.jpg',
      runtime: 110,
      vote_average: 7.6,
      vote_count: 500,
      genres: [{ name: 'Drama' }],
      external_ids: { imdb_id: 'tt1234567' },
      release_dates: {
        results: [
          {
            iso_3166_1: 'US',
            release_dates: [{ certification: 'PG-13' }],
          },
        ],
      },
      credits: {
        crew: [{ job: 'Director', name: 'Jane Doe' }],
        cast: [{ name: 'Actor One' }, { name: 'Actor Two' }],
      },
    });

    expect(movie).toMatchObject({
      tmdbId: 99,
      title: 'Garden',
      year: 2026,
      synopsis: 'Plot summary',
      runtimeMinutes: 110,
      contentRating: 'PG-13',
      director: 'Jane Doe',
      cast: ['Actor One', 'Actor Two'],
      imdbId: 'tt1234567',
      ratings: { tmdb: { score: 7.6, voteCount: 500 } },
    });
  });
});
