import canopy from '../../assets/pivot/pivot-hero-canopy.webp';
import coast from '../../assets/pivot/pivot-hero-coast.jpg';

/**
 * Brand artifacts for the flyer wall — nights the product is for, not a live catalog.
 * City names are stamped on at render time from GET /pivot/landing/config.
 */
export const JUSTGO_LANDING_FLYERS = Object.freeze([
  Object.freeze({
    id: 'night-market',
    title: 'night market',
    when: 'fri night',
    tag: 'food',
    tone: 'photo',
    cover: canopy,
  }),
  Object.freeze({
    id: 'board-games',
    title: 'board game night',
    when: 'thu · 8pm',
    tag: 'games',
    tone: 'pop',
    cover: null,
  }),
  Object.freeze({
    id: 'warehouse-show',
    title: 'warehouse show',
    when: 'late sat',
    tag: 'live music',
    tone: 'photo',
    cover: coast,
  }),
  Object.freeze({
    id: 'gallery',
    title: 'gallery opening',
    when: 'thu evening',
    tag: 'art',
    tone: 'ticker',
    cover: null,
  }),
  Object.freeze({
    id: 'sunrise-hike',
    title: 'sunrise hike',
    when: 'sun · 6am',
    tag: 'outdoors',
    tone: 'accent',
    cover: null,
  }),
  Object.freeze({
    id: 'rooftop-film',
    title: 'rooftop film',
    when: 'sat dusk',
    tag: 'film',
    tone: 'sage',
    cover: null,
  }),
  Object.freeze({
    id: 'park-dinner',
    title: 'dinner in the park',
    when: 'fri · 7pm',
    tag: 'food',
    tone: 'pop',
    cover: null,
  }),
  Object.freeze({
    id: 'comedy',
    title: 'basement comedy',
    when: 'sat · 9pm',
    tag: 'nightlife',
    tone: 'accent',
    cover: null,
  }),
]);
