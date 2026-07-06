#!/usr/bin/env node
/**
 * Seed published Pivot catalog events into the NYC tenant DB for feed testing.
 *
 * Usage (from Meridian/backend):
 *   npm run seed:pivot-feed-events
 *
 * Requires MONGO_URI / tenant routing for `nyc` (same as local pivot pilot).
 */
require('./ensureBackendNodeModules');
require('dotenv').config();

const mongoose = require('mongoose');
const { connectToDatabase } = require('../connectionsManager');
const getModels = require('../services/getModelService');
const { PILOT_TENANT_KEY } = require('../constants/pivotPilotReferralCodes');
const { toIsoWeek } = require('../utilities/pivotIsoWeek');

const DEMO_EVENTS = [
  {
    slug: 'pivot-seed-board-games',
    name: 'Friday Night Board Games',
    description: 'Open tables, BYOB. All skill levels welcome.',
    location: '123 Atlantic Ave, Brooklyn, NY',
    dayOffset: 1,
    startHour: 19,
    durationHours: 4,
    externalLink: 'https://partiful.com/e/pivot-seed-board-games',
    host: { name: 'Brooklyn Board Game Cafe', profileUrl: 'https://partiful.com/u/bkbgcafe' },
    tags: ['board-games', 'social'],
    registrationCount: 18,
  },
  {
    slug: 'pivot-seed-sunset-listening',
    name: 'Sunset Listening Party',
    description: 'Roof records spins until late.',
    location: 'Williamsburg, Brooklyn, NY',
    dayOffset: 1,
    startHour: 20,
    durationHours: 3,
    externalLink: 'https://partiful.com/e/pivot-seed-sunset-listening',
    host: { name: 'Roof Records' },
    tags: ['live-music'],
    registrationCount: 24,
  },
  {
    slug: 'pivot-seed-open-mic',
    name: 'Late Open Mic',
    description: 'Sign up at the door. Five-minute slots.',
    location: 'Lower East Side, New York, NY',
    dayOffset: 2,
    startHour: 21,
    durationHours: 2,
    externalLink: 'https://partiful.com/e/pivot-seed-open-mic',
    host: { name: 'Canal Street Poetry Club' },
    tags: ['live-music', 'social'],
    registrationCount: 9,
  },
  {
    slug: 'pivot-seed-rooftop-yoga',
    name: 'Rooftop Yoga at Dusk',
    description: 'All levels. Mats provided, arrive 10 min early.',
    location: 'Long Island City, Queens, NY',
    dayOffset: 2,
    startHour: 18,
    durationHours: 1.5,
    externalLink: 'https://partiful.com/e/pivot-seed-rooftop-yoga',
    host: { name: 'Skyline Studio LIC' },
    tags: ['fitness', 'wellness'],
    registrationCount: 32,
  },
  {
    slug: 'pivot-seed-comedy-show',
    name: 'Underground Comedy Night',
    description: 'Three headliners, one mic. 21+.',
    location: 'East Village, New York, NY',
    dayOffset: 2,
    startHour: 20,
    durationHours: 2.5,
    externalLink: 'https://partiful.com/e/pivot-seed-comedy-show',
    host: { name: 'Basement Laughs NYC' },
    tags: ['comedy', 'nightlife'],
    registrationCount: 41,
  },
  {
    slug: 'pivot-seed-pottery-workshop',
    name: 'Hand-Building Pottery Workshop',
    description: 'Make a mug. Glazing included, pickup next week.',
    location: 'Gowanus, Brooklyn, NY',
    dayOffset: 3,
    startHour: 14,
    durationHours: 3,
    externalLink: 'https://partiful.com/e/pivot-seed-pottery-workshop',
    host: { name: 'Clay & Co Gowanus' },
    tags: ['art-and-culture', 'workshops'],
    registrationCount: 12,
  },
  {
    slug: 'pivot-seed-wine-tasting',
    name: 'Natural Wine Tasting',
    description: 'Six pours, small bites, chill vibes only.',
    location: 'West Village, New York, NY',
    dayOffset: 3,
    startHour: 19,
    durationHours: 2,
    externalLink: 'https://partiful.com/e/pivot-seed-wine-tasting',
    host: { name: 'Orange Peel Wine Bar' },
    tags: ['food-and-drink', 'social'],
    registrationCount: 28,
  },
  {
    slug: 'pivot-seed-vinyl-market',
    name: 'Brooklyn Vinyl Market',
    description: '40+ vendors, live DJ sets all afternoon.',
    location: 'Industry City, Brooklyn, NY',
    dayOffset: 3,
    startHour: 12,
    durationHours: 6,
    externalLink: 'https://partiful.com/e/pivot-seed-vinyl-market',
    host: { name: 'Crate Diggers Collective' },
    tags: ['live-music', 'markets-and-fairs'],
    registrationCount: 156,
  },
  {
    slug: 'pivot-seed-run-club',
    name: 'Prospect Park Run Club',
    description: '5K loop, coffee after. Pace groups at the start.',
    location: 'Prospect Park, Brooklyn, NY',
    dayOffset: 4,
    startHour: 8,
    durationHours: 1.5,
    externalLink: 'https://partiful.com/e/pivot-seed-run-club',
    host: { name: 'Parkside Runners' },
    tags: ['fitness', 'social'],
    registrationCount: 67,
  },
  {
    slug: 'pivot-seed-photo-walk',
    name: 'Golden Hour Photo Walk',
    description: 'Bring any camera. We end at a rooftop bar.',
    location: 'DUMBO, Brooklyn, NY',
    dayOffset: 4,
    startHour: 17,
    durationHours: 2,
    externalLink: 'https://partiful.com/e/pivot-seed-photo-walk',
    host: { name: 'NYC Shutter Club' },
    tags: ['art-and-culture', 'social'],
    registrationCount: 22,
  },
  {
    slug: 'pivot-seed-trivia-night',
    name: 'Pub Trivia — Pop Culture Edition',
    description: 'Teams of 4 max. Prizes for top three.',
    location: 'Astoria, Queens, NY',
    dayOffset: 4,
    startHour: 20,
    durationHours: 2,
    externalLink: 'https://partiful.com/e/pivot-seed-trivia-night',
    host: { name: 'The Astoria Taproom' },
    tags: ['social', 'board-games'],
    registrationCount: 38,
  },
  {
    slug: 'pivot-seed-jazz-brunch',
    name: 'Live Jazz Brunch',
    description: 'Reservations recommended. Full menu until 3pm.',
    location: 'Harlem, New York, NY',
    dayOffset: 5,
    startHour: 11,
    durationHours: 3,
    externalLink: 'https://partiful.com/e/pivot-seed-jazz-brunch',
    host: { name: 'Lenox Room' },
    tags: ['live-music', 'food-and-drink'],
    registrationCount: 54,
  },
  {
    slug: 'pivot-seed-makers-fair',
    name: 'Queens Makers Fair',
    description: 'Local artists, zines, and screen printing demos.',
    location: 'Sunnyside, Queens, NY',
    dayOffset: 5,
    startHour: 13,
    durationHours: 5,
    externalLink: 'https://partiful.com/e/pivot-seed-makers-fair',
    host: { name: 'Sunnyside Creative Guild' },
    tags: ['art-and-culture', 'markets-and-fairs'],
    registrationCount: 89,
  },
  {
    slug: 'pivot-seed-dance-class',
    name: 'Beginner Salsa Class',
    description: 'No partner needed. Sneakers fine for hour one.',
    location: 'Washington Heights, New York, NY',
    dayOffset: 5,
    startHour: 19,
    durationHours: 1.5,
    externalLink: 'https://partiful.com/e/pivot-seed-dance-class',
    host: { name: 'Uptown Dance Loft' },
    tags: ['dance', 'fitness'],
    registrationCount: 19,
  },
  {
    slug: 'pivot-seed-book-club',
    name: 'Monthly Book Club — Sci-Fi',
    description: 'This month: a short novel. Spoilers welcome after hour one.',
    location: 'Fort Greene, Brooklyn, NY',
    dayOffset: 6,
    startHour: 18,
    durationHours: 2,
    externalLink: 'https://partiful.com/e/pivot-seed-book-club',
    host: { name: 'Greenlight Bookstore Events' },
    tags: ['social', 'art-and-culture'],
    registrationCount: 14,
  },
  {
    slug: 'pivot-seed-food-trucks',
    name: 'Night Market — Food Trucks',
    description: 'Twelve trucks, live acoustic set, cash and card.',
    location: 'Flushing Meadows, Queens, NY',
    dayOffset: 6,
    startHour: 17,
    durationHours: 4,
    externalLink: 'https://partiful.com/e/pivot-seed-food-trucks',
    host: { name: 'Queens Night Eats' },
    tags: ['food-and-drink', 'markets-and-fairs'],
    registrationCount: 203,
  },
  {
    slug: 'pivot-seed-film-screening',
    name: 'Indie Film Screening + Q&A',
    description: 'Director in attendance. Limited seating.',
    location: 'Bushwick, Brooklyn, NY',
    dayOffset: 6,
    startHour: 20,
    durationHours: 2.5,
    externalLink: 'https://partiful.com/e/pivot-seed-film-screening',
    host: { name: 'Bushwick Cinema Lab' },
    tags: ['film-and-tv', 'art-and-culture'],
    registrationCount: 45,
  },
  {
    slug: 'pivot-seed-coffee-cupping',
    name: 'Coffee Cupping Session',
    description: 'Taste four single origins. Take-home bag for attendees.',
    location: 'Red Hook, Brooklyn, NY',
    dayOffset: 7,
    startHour: 10,
    durationHours: 1.5,
    externalLink: 'https://partiful.com/e/pivot-seed-coffee-cupping',
    host: { name: 'Red Hook Roasters' },
    tags: ['food-and-drink', 'workshops'],
    registrationCount: 16,
  },
  {
    slug: 'pivot-seed-climbing-social',
    name: 'Bouldering Social Night',
    description: 'Day pass included. First-timers get a quick intro.',
    location: 'Greenpoint, Brooklyn, NY',
    dayOffset: 7,
    startHour: 18,
    durationHours: 3,
    externalLink: 'https://partiful.com/e/pivot-seed-climbing-social',
    host: { name: 'Greenpoint Cliffs' },
    tags: ['fitness', 'social'],
    registrationCount: 31,
  },
  {
    slug: 'pivot-seed-karaoke',
    name: 'Private Room Karaoke',
    description: 'Groups of 6 rotate rooms. Soft drinks on the house.',
    location: 'Koreatown, New York, NY',
    dayOffset: 7,
    startHour: 21,
    durationHours: 3,
    externalLink: 'https://partiful.com/e/pivot-seed-karaoke',
    host: { name: 'Midtown Mic Lounge' },
    tags: ['live-music', 'nightlife'],
    registrationCount: 52,
  },
  {
    slug: 'pivot-seed-plant-swap',
    name: 'Plant Swap & Repotting',
    description: 'Bring a cutting, leave with something new. Soil provided.',
    location: 'Park Slope, Brooklyn, NY',
    dayOffset: 1,
    startHour: 11,
    durationHours: 2,
    externalLink: 'https://partiful.com/e/pivot-seed-plant-swap',
    host: { name: 'Slope Succulents' },
    tags: ['social', 'wellness'],
    registrationCount: 27,
  },
  {
    slug: 'pivot-seed-chess-park',
    name: 'Washington Square Chess Meetup',
    description: 'Blitz and long games. Boards on the south lawn.',
    location: 'Washington Square Park, New York, NY',
    dayOffset: 2,
    startHour: 15,
    durationHours: 3,
    externalLink: 'https://partiful.com/e/pivot-seed-chess-park',
    host: { name: 'Village Chess Club' },
    tags: ['gaming', 'social'],
    registrationCount: 11,
  },
  {
    slug: 'pivot-seed-ramen-pop-up',
    name: 'Late-Night Ramen Pop-Up',
    description: 'Limited bowls until sold out. Cash bar.',
    location: 'Chinatown, New York, NY',
    dayOffset: 3,
    startHour: 22,
    durationHours: 2,
    externalLink: 'https://partiful.com/e/pivot-seed-ramen-pop-up',
    host: { name: 'Midnight Noodle Lab' },
    tags: ['food-and-drink', 'nightlife'],
    registrationCount: 73,
  },
  {
    slug: 'pivot-seed-museum-late',
    name: 'Museum Late Hours — Modern Wing',
    description: 'After-hours access, guided highlights tour at 7:30.',
    location: 'Upper East Side, New York, NY',
    dayOffset: 4,
    startHour: 18,
    durationHours: 3,
    externalLink: 'https://partiful.com/e/pivot-seed-museum-late',
    host: { name: 'City Modern Museum' },
    tags: ['art-and-culture'],
    registrationCount: 98,
  },
  {
    slug: 'pivot-seed-coding-meetup',
    name: 'Creative Coding Meetup',
    description: 'Lightning talks + open project share. Laptops encouraged.',
    location: 'Flatiron, New York, NY',
    dayOffset: 5,
    startHour: 18,
    durationHours: 2.5,
    externalLink: 'https://partiful.com/e/pivot-seed-coding-meetup',
    host: { name: 'NYC Creative Devs' },
    tags: ['tech', 'social'],
    registrationCount: 44,
  },
  {
    slug: 'pivot-seed-salsa-rooftop',
    name: 'Rooftop Salsa Social',
    description: 'Lesson at 8, open dance floor after. No experience needed.',
    location: 'Midtown West, New York, NY',
    dayOffset: 6,
    startHour: 20,
    durationHours: 3,
    externalLink: 'https://partiful.com/e/pivot-seed-salsa-rooftop',
    host: { name: 'Skyline Social Club' },
    tags: ['dance', 'nightlife'],
    registrationCount: 61,
  },
  {
    slug: 'pivot-seed-volleyball-beach',
    name: 'Sunset Beach Volleyball',
    description: 'Pick-up games, teams formed on site. Sand socks optional.',
    location: 'Rockaway Beach, Queens, NY',
    dayOffset: 7,
    startHour: 17,
    durationHours: 2,
    externalLink: 'https://partiful.com/e/pivot-seed-volleyball-beach',
    host: { name: 'Rockaway Rec League' },
    tags: ['fitness', 'outdoors'],
    registrationCount: 36,
  },
  {
    slug: 'pivot-seed-poetry-slam',
    name: 'Poetry Slam Finals',
    description: 'Audience judges round two. Sign-up list closes at 7:45.',
    location: 'Bed-Stuy, Brooklyn, NY',
    dayOffset: 1,
    startHour: 20,
    durationHours: 2,
    externalLink: 'https://partiful.com/e/pivot-seed-poetry-slam',
    host: { name: 'Bed-Stuy Word House' },
    tags: ['live-music', 'art-and-culture'],
    registrationCount: 33,
  },
  {
    slug: 'pivot-seed-flea-market',
    name: 'Brooklyn Flea — Williamsburg',
    description: 'Vintage, food stalls, and live brass band.',
    location: 'Williamsburg, Brooklyn, NY',
    dayOffset: 2,
    startHour: 10,
    durationHours: 5,
    externalLink: 'https://partiful.com/e/pivot-seed-flea-market',
    host: { name: 'Brooklyn Flea Co.' },
    tags: ['markets-and-fairs', 'food-and-drink'],
    registrationCount: 412,
  },
  {
    slug: 'pivot-seed-meditation',
    name: 'Sound Bath & Meditation',
    description: 'Mats and blankets provided. Silence phones on arrival.',
    location: 'Cobble Hill, Brooklyn, NY',
    dayOffset: 3,
    startHour: 19,
    durationHours: 1,
    externalLink: 'https://partiful.com/e/pivot-seed-meditation',
    host: { name: 'Still Room Brooklyn' },
    tags: ['wellness'],
    registrationCount: 21,
  },
];

async function resolveCatalogOrgId(Org) {
  const existing = await Org.findOne({
    org_name: /pivot catalog/i,
  })
    .select('_id org_name')
    .lean();

  if (existing?._id) {
    return existing._id;
  }

  const created = await Org.create({
    org_name: 'Pivot Catalog — NYC',
    org_description: 'Internal technical host for Pivot catalog imports (not shown in Pivot UI).',
    visibility: 'private',
  });

  return created._id;
}

function buildEventWindow(dayOffset, durationHours, now, startHour = 19) {
  const start = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + dayOffset,
      startHour,
      0,
      0,
    ),
  );
  const end = new Date(start.getTime() + durationHours * 60 * 60 * 1000);
  return { start, end };
}

async function run() {
  const now = new Date();
  const batchWeek = toIsoWeek(now);
  const db = await connectToDatabase(PILOT_TENANT_KEY);
  const req = { db, school: PILOT_TENANT_KEY };
  const { Event, Org } = getModels(req, 'Event', 'Org');
  const catalogOrgId = await resolveCatalogOrgId(Org);

  let upserted = 0;
  for (const demo of DEMO_EVENTS) {
    const { start, end } = buildEventWindow(
      demo.dayOffset,
      demo.durationHours,
      now,
      demo.startHour ?? 19,
    );

    await Event.findOneAndUpdate(
      { 'customFields.pivot.sourceUrl': demo.externalLink },
      {
        $set: {
          name: demo.name,
          description: demo.description,
          type: 'social',
          location: demo.location,
          start_time: start,
          end_time: end,
          status: 'not-applicable',
          visibility: 'public',
          registrationEnabled: true,
          registrationCount: demo.registrationCount,
          externalLink: demo.externalLink,
          hostingType: 'Org',
          hostingId: catalogOrgId,
          isDeleted: false,
          customFields: {
            pivot: {
              batchWeek,
              source: 'manual',
              sourceUrl: demo.externalLink,
              host: demo.host,
              tags: demo.tags,
              ingestStatus: 'published',
              importedAt: now.toISOString(),
              importedBy: 'seed:pivot-feed-events',
            },
          },
        },
      },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
    );
    upserted += 1;
  }

  const publishedCount = await Event.countDocuments({
    'customFields.pivot.batchWeek': batchWeek,
    'customFields.pivot.ingestStatus': 'published',
    isDeleted: { $ne: true },
  });

  console.log(
    `[seedPivotFeedEvents] tenant=${PILOT_TENANT_KEY} batchWeek=${batchWeek} upserted=${upserted} published_in_batch=${publishedCount}`,
  );
  console.log(
    `[seedPivotFeedEvents] Verify: GET /pivot/feed?batchWeek=${batchWeek} with X-Tenant: ${PILOT_TENANT_KEY}`,
  );
}

run()
  .catch((error) => {
    console.error('[seedPivotFeedEvents] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
