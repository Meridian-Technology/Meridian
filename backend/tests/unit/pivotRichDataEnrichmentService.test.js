jest.mock('axios');
jest.mock('../../connectionsManager', () => ({ connectToDatabase: jest.fn() }));
jest.mock('../../services/getModelService', () => jest.fn());
jest.mock('../../services/pivotIngestPublishService', () => ({
  resolvePivotTenant: jest.fn(),
}));
jest.mock('../../services/pivotIngestPreviewService', () => ({
  buildDraft: jest.fn(),
  sanitizeEventPosterImage: jest.fn((value) => value || null),
}));
jest.mock('../../services/pivotSiteScrapeService', () => ({
  normalizeSiteUrl: jest.fn((url) =>
    /^https?:\/\//.test(url || '') ? { url } : { error: 'Invalid URL.', code: 'INVALID_URL' },
  ),
  scrapeSiteEvents: jest.fn(),
}));

const axios = require('axios');
const { connectToDatabase } = require('../../connectionsManager');
const getModels = require('../../services/getModelService');
const { resolvePivotTenant } = require('../../services/pivotIngestPublishService');
const { buildDraft } = require('../../services/pivotIngestPreviewService');
const { scrapeSiteEvents } = require('../../services/pivotSiteScrapeService');
const {
  enrichPivotEventRichData,
  missingRichDataFields,
  titleLooksRelevant,
} = require('../../services/pivotRichDataEnrichmentService');

const EVENT_ID = '665a1b2c3d4e5f6789012345';

describe('pivotRichDataEnrichmentService', () => {
  let Event;

  beforeEach(() => {
    jest.clearAllMocks();
    connectToDatabase.mockResolvedValue({});
    resolvePivotTenant.mockResolvedValue({
      tenant: { tenantKey: 'ic', pivotDropTimezone: 'America/Chicago' },
    });
    Event = {
      find: jest.fn(),
      findByIdAndUpdate: jest.fn().mockResolvedValue({}),
    };
    getModels.mockReturnValue({ Event });
  });

  it('identifies only description and image as rich-data gaps', () => {
    expect(missingRichDataFields({})).toEqual(['description', 'image']);
    expect(missingRichDataFields({ description: 'Details' })).toEqual(['image']);
    expect(missingRichDataFields({ image: 'https://x.test/a.jpg' })).toEqual(['description']);
  });

  it('rejects unrelated page titles before applying metadata', () => {
    expect(titleLooksRelevant('Late Night Jazz', 'Late Night Jazz | The Englert')).toBe(true);
    expect(titleLooksRelevant('Late Night Jazz', 'Upcoming events at The Englert')).toBe(false);
  });

  it('fills gaps from detail-page metadata without changing status', async () => {
    Event.find.mockReturnValue({
      lean: jest.fn().mockResolvedValue([
        {
          _id: EVENT_ID,
          name: 'Late Night Jazz',
          description: '',
          image: null,
          externalLink: 'https://venue.test/events/late-night-jazz',
          customFields: { pivot: { ingestStatus: 'draft' } },
        },
      ]),
    });
    axios.get.mockResolvedValue({ status: 200, data: '<html />', headers: {} });
    buildDraft.mockReturnValue({
      draft: {
        name: 'Late Night Jazz | Venue',
        description: 'A quartet plays until midnight.',
        image: '/posters/jazz.jpg',
      },
    });

    const result = await enrichPivotEventRichData({}, { tenantKey: 'ic', eventIds: [EVENT_ID] });

    expect(result.data.totals.enriched).toBe(1);
    expect(Event.findByIdAndUpdate).toHaveBeenCalledWith(
      EVENT_ID,
      { $set: {
        description: 'A quartet plays until midnight.',
        image: 'https://venue.test/posters/jazz.jpg',
      } },
      { runValidators: true },
    );
    expect(scrapeSiteEvents).not.toHaveBeenCalled();
  });

  it('keeps an event draft when the selected detail page cannot fill every gap', async () => {
    Event.find.mockReturnValue({
      lean: jest.fn().mockResolvedValue([
        {
          _id: EVENT_ID,
          name: 'Late Night Jazz',
          description: '',
          image: null,
          externalLink: 'https://venue.test/events/late-night-jazz',
          customFields: { pivot: { ingestStatus: 'staged' } },
        },
      ]),
    });
    axios.get.mockRejectedValue(new Error('blocked'));
    scrapeSiteEvents.mockResolvedValue({ error: 'No structured data.' });

    const result = await enrichPivotEventRichData({}, { tenantKey: 'ic', eventIds: [EVENT_ID] });

    expect(result.data.totals.incomplete).toBe(1);
    expect(Event.findByIdAndUpdate).toHaveBeenCalledWith(
      EVENT_ID,
      { $set: { 'customFields.pivot.ingestStatus': 'draft' } },
      { runValidators: true },
    );
  });
});
