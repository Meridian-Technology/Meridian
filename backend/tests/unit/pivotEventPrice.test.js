const {
  priceLabelFromLuma,
  priceLabelFromPartiful,
  priceFromJsonLdOffers,
  priceTextFromListing,
} = require('../../utilities/pivotEventPrice');
const { parsePrice } = require('../../utilities/pivotFieldParsingUtils');
const {
  buildPartifulExploreDraft,
  buildLumaDiscoverDraft,
  parseLumaDiscoverBatch,
  parsePartifulSingleEventDraft,
  buildDraft,
} = require('../../services/pivotIngestPreviewService');
const { buildSiteEventDraft } = require('../../services/pivotSiteScrapeService');

describe('event price labels', () => {
  describe('Luma ticket_info', () => {
    it('reads a free discover card', () => {
      expect(priceLabelFromLuma({
        ticket_info: { price: null, is_free: true, max_price: null },
      })).toBe('Free');
    });

    it('reads a fixed price and a max_price range', () => {
      expect(priceLabelFromLuma({
        ticket_info: {
          price: { cents: 9900, currency: 'usd', is_flexible: false },
          is_free: false,
          max_price: null,
        },
      })).toBe('$99');

      expect(priceLabelFromLuma({
        ticket_info: {
          price: { cents: 2000, currency: 'usd', is_flexible: false },
          max_price: { cents: 3000, currency: 'usd' },
        },
      })).toBe('$20–$30');
    });

    it('reads flexible and donation prices from cents', () => {
      expect(priceLabelFromLuma({
        ticket_info: {
          price: { cents: 4000, currency: 'usd', min_cents: 1000, is_flexible: true },
        },
      })).toBe('$10–$40 suggested');

      expect(priceLabelFromLuma({
        ticket_info: {
          price: { cents: 1000, currency: 'eur', min_cents: 0, is_flexible: true },
        },
      })).toBe('Free–€10 suggested');
    });

    it('accepts a numeric cents price and a preformatted string', () => {
      expect(priceLabelFromLuma({ ticket_info: { price: 2500, is_free: false } })).toBe('$25');
      expect(priceLabelFromLuma({ ticket_info: { price: '$18' } })).toBe('$18');
    });
  });

  describe('Luma ticket_types', () => {
    it('covers free, paid, and the older fiat-price type', () => {
      expect(priceLabelFromLuma({
        ticket_types: [
          { type: 'free', cents: null, currency: null, is_hidden: false },
          { type: 'fiat-price', cents: 9900, currency: 'usd', is_flexible: false },
        ],
      })).toBe('Free–$99');

      expect(priceLabelFromLuma({
        ticket_types: [
          { type: 'paid', cents: 1500, currency: 'usd', name: 'Standard' },
        ],
      })).toBe('$15');
    });

    it('skips hidden, disabled, and members-only tiers when a public tier remains', () => {
      expect(priceLabelFromLuma({
        ticket_types: [
          { type: 'fiat-price', cents: 1500, currency: 'usd', is_hidden: true },
          { type: 'fiat-price', cents: 2500, currency: 'usd', is_disabled: true },
          { type: 'fiat-price', cents: 1000, currency: 'usd', membership_restriction: { id: 'mem' } },
          { type: 'paid', cents: 2000, currency: 'usd' },
          { type: 'paid', cents: 3000, currency: 'usd' },
        ],
      })).toBe('$20–$30');
    });

    it('keeps a sold-out or members-only price when nothing else is on sale', () => {
      expect(priceLabelFromLuma({
        ticket_types: [
          { type: 'fiat-price', cents: 4500, currency: 'usd', is_disabled: true },
        ],
      })).toBe('$45');

      expect(priceLabelFromLuma({
        ticket_types: [
          { type: 'paid', cents: 800, currency: 'gbp', membership_restriction: { id: 'mem' } },
        ],
      })).toBe('£8');
    });

    it('prices flexible tiers and non-dollar currencies from cents', () => {
      expect(priceLabelFromLuma({
        ticket_types: [
          { type: 'fiat-price', cents: 1000, min_cents: 0, currency: 'usd', is_flexible: true },
        ],
      })).toBe('Free–$10 suggested');

      expect(priceLabelFromLuma({
        ticket_types: [
          { type: 'paid', cents: 250000, currency: 'jpy', is_flexible: false },
        ],
      })).toBe('¥250000');
    });

    it('prefers ticket types over the discover summary', () => {
      expect(priceLabelFromLuma({
        ticket_info: { price: { cents: 9900, currency: 'usd' }, is_free: false },
        ticket_types: [
          { type: 'free', is_hidden: false },
          { type: 'fiat-price', cents: 9900, currency: 'usd' },
        ],
      })).toBe('Free–$99');
    });
  });

  describe('Partiful', () => {
    it('reads chip-in optional, suggested, and required modes', () => {
      expect(priceLabelFromPartiful({
        ticketing: { type: 'chip_in', mode: 'optional', price: null, currency: 'USD' },
      })).toBe('Pay what you can');

      expect(priceLabelFromPartiful({
        ticketing: { type: 'chip_in', mode: 'optional', price: 15, currency: 'USD' },
      })).toBe('$15 suggested');

      expect(priceLabelFromPartiful({
        ticketing: { mode: 'required', price: 20, currency: 'GBP' },
      })).toBe('£20 per person');

      expect(priceLabelFromPartiful({
        ticketing: { mode: 'required', price: 0, currency: 'USD' },
      })).toBe('Free');
    });

    it('uses guestPrice from standard ticket mutations and skips disabled tiers', () => {
      expect(priceLabelFromPartiful({
        ticketing: { type: 'standard' },
        ticketTypes: [
          { id: 'ga', name: 'General Admission', guestPrice: 28, priceExcludingFees: 25, currencyCode: 'USD', disabled: false },
          { id: 'vip', name: 'VIP', guestPrice: 60, currencyCode: 'USD', disabled: false },
          { id: 'staff', name: 'Staff', guestPrice: 0, currencyCode: 'USD', disabled: true },
        ],
      })).toBe('$28–$60');
    });

    it('treats a missing guest price as free and falls back to the host payout', () => {
      expect(priceLabelFromPartiful({
        ticketing: { type: 'standard' },
        publicTicketTypes: [
          { id: 'ga', name: 'General Admission', currency: 'USD' },
          { id: 'late', name: 'Late', priceExcludingFees: 12, currency: 'EUR' },
        ],
      })).toBe('Free · €12');
    });

    it('reads ticket types and offers from the event page props', () => {
      expect(priceLabelFromPartiful(
        { id: 'abc', title: 'Show' },
        {
          publicTicketTypes: [
            { id: 'ga', name: 'GA', guestPrice: 18, currencyCode: 'USD' },
          ],
        },
      )).toBe('$18');

      expect(priceLabelFromPartiful(
        { id: 'abc' },
        {
          offersJsonLd: {
            '@type': 'AggregateOffer',
            lowPrice: '10',
            highPrice: '25',
            priceCurrency: 'USD',
          },
        },
      )).toBe('$10–$25');
    });

    it('keeps a host-typed cost when there is no ticketing object', () => {
      expect(priceLabelFromPartiful({ cost: 'Free' })).toBe('Free');
      expect(priceLabelFromPartiful({ cost: '$$' })).toBe('$$');
      expect(priceLabelFromPartiful({ cost: 'bring a snack' })).toBeNull();
    });
  });

  describe('generic listings', () => {
    it('reads schema.org offers', () => {
      expect(priceFromJsonLdOffers({
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
      })).toBe('Free');

      expect(priceFromJsonLdOffers([
        { '@type': 'Offer', price: '12.50', priceCurrency: 'USD' },
        { '@type': 'Offer', price: '40', priceCurrency: 'USD' },
      ])).toBe('$12.50–$40');
    });

    it('uses listing copy only when it states a price', () => {
      expect(priceTextFromListing('Doors 8. Tickets are $10-15.')).toBe('Doors 8. Tickets are $10-15.');
      expect(priceTextFromListing('Free entry')).toBe('Free entry');
      expect(priceTextFromListing('The Free Press reading')).toBeNull();
      expect(parsePrice(priceTextFromListing(
        'A very long calendar blurb that eventually mentions admission of £18 for guests who stay for the whole set and the afterparty downstairs.',
      ))).toMatchObject({ min: 18, max: 18, currency: 'GBP' });
    });
  });
});

describe('scraped drafts include price', () => {
  it('stores a Luma discover ticket_info price on the draft', () => {
    const html = `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
      props: {
        pageProps: {
          initialData: {
            data: {
              events: [{
                event: { url: 'tea', name: 'Critical Tea', start_at: '2026-10-08T02:00:00.000Z' },
                hosts: [{ name: 'Host' }],
                ticket_info: {
                  price: { cents: 4000, currency: 'usd', min_cents: 1000, is_flexible: true },
                  is_free: false,
                },
              }],
            },
          },
        },
      },
    })}</script></html>`;

    const result = parseLumaDiscoverBatch(html, 'https://luma.com/sf');
    expect(result.drafts[0].draft.price).toBe('$10–$40 suggested');
    expect(result.drafts[0].draft.parsed.price).toMatchObject({
      min: 10,
      max: 40,
      suggested: true,
      currency: 'USD',
    });
  });

  it('stores Luma JSON-LD offers on a discover card', () => {
    const { draft } = buildLumaDiscoverDraft({
      '@type': 'Event',
      name: 'Listening',
      startDate: '2026-10-08T02:00:00.000Z',
      offers: { '@type': 'AggregateOffer', lowPrice: '8', highPrice: '20', priceCurrency: 'USD' },
    });
    expect(draft.parsed.price).toMatchObject({ min: 8, max: 20, band: 'mid' });
  });

  it('stores Partiful ticket types from the event page', () => {
    const html = `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
      props: {
        pageProps: {
          event: {
            id: 'abc',
            title: 'Block party',
            startDate: '2026-10-11T00:00:00.000Z',
            ticketing: { type: 'standard' },
          },
          publicTicketTypes: [
            { id: 'ga', name: 'GA', guestPrice: 12, currencyCode: 'USD' },
            { id: 'late', name: 'Late', guestPrice: 20, currencyCode: 'USD', disabled: false },
          ],
        },
      },
    })}</script></html>`;

    const draft = parsePartifulSingleEventDraft(html, 'https://partiful.com/e/abc');
    expect(draft.price).toBe('$12–$20');
    expect(draft.parsed.price).toMatchObject({ min: 12, max: 20, band: 'mid' });
  });

  it('stores a Partiful chip-in price from an explore card', () => {
    const { draft } = buildPartifulExploreDraft({
      id: 'chip',
      title: 'Picnic',
      startDate: '2026-10-11T00:00:00.000Z',
      ticketing: { type: 'chip_in', mode: 'optional', price: 10, currency: 'USD' },
    });
    expect(draft.parsed.price).toMatchObject({ min: 10, max: 10, suggested: true });
  });

  it('stores a Luma event-page ticket type through the single-page draft', () => {
    const html = `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
      props: {
        pageProps: {
          initialData: {
            data: {
              event: { name: 'Mahjong' },
              ticket_types: [
                { type: 'paid', cents: 2000, currency: 'usd', is_hidden: false },
              ],
            },
          },
        },
      },
    })}</script>
    <script type="application/ld+json">${JSON.stringify({
      '@type': 'Event',
      name: 'Mahjong',
      startDate: '2026-10-08T02:00:00.000Z',
    })}</script></html>`;

    const { draft } = buildDraft({
      html,
      provider: 'luma',
      sourceUrl: 'https://luma.com/mahjong',
    });
    expect(draft.price).toBe('$20');
    expect(draft.parsed.price).toMatchObject({ min: 20, max: 20, band: 'mid' });
  });

  it('fills a generic-site price from listing copy when extraction left it blank', () => {
    const { draft } = buildSiteEventDraft(
      {
        name: 'Open Mic',
        description: 'Sign-ups at the door. $10-15.',
        startTime: '2026-07-10T20:00:00-05:00',
      },
      { pageUrl: 'https://icfilmscene.org/events' },
    );
    expect(draft.price).toBe('Sign-ups at the door. $10-15.');
    expect(draft.parsed.price).toMatchObject({ min: 10, max: 15, band: 'low' });
  });
});
