jest.mock('../../services/pivotTagSuggestService', () => ({
  suggestPivotEventTags: jest.fn(),
}));
jest.mock('../../services/pivotTagCatalogService', () => ({
  validatePivotEventTags: jest.fn(),
}));

const {
  suggestPivotEventTags,
} = require('../../services/pivotTagSuggestService');
const { validatePivotEventTags } = require('../../services/pivotTagCatalogService');
const {
  assignTags,
  resolveTagAssignerProvider,
} = require('../../utilities/pivotTagAssigner');

describe('pivotTagAssigner', () => {
  const originalEnv = process.env;
  const req = { globalDb: {} };
  const catalogTags = [
    { slug: 'live-music', label: 'live music' },
    { slug: 'board-games', label: 'board games' },
  ];
  const event = {
    name: 'Sunset Listening Party',
    description: 'Vinyl on the roof',
    location: 'Brooklyn',
  };

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.PIVOT_TAG_ASSIGNER;
    suggestPivotEventTags.mockReset();
    validatePivotEventTags.mockReset();
    suggestPivotEventTags.mockResolvedValue({
      data: { tags: ['live-music', 'invented-slug'], model: 'claude-sonnet-4-6' },
    });
    validatePivotEventTags.mockImplementation(async (_req, rawTags, options = {}) => {
      const allowed = options.catalogSlugSet || new Set(['live-music', 'board-games']);
      const tags = (Array.isArray(rawTags) ? rawTags : []).filter((slug) =>
        allowed.has(slug),
      );
      if (!tags.length) {
        return {
          error: 'At least one catalog tag is required.',
          status: 400,
          code: 'TAGS_REQUIRED',
        };
      }
      return { tags };
    });
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('defaults to the claude provider', () => {
    expect(resolveTagAssignerProvider()).toBe('claude');
  });

  it('claude path validates slugs against the catalog', async () => {
    const result = await assignTags({ event, catalogTags, tenantKey: 'nyc', req });

    expect(result).toEqual({
      tags: ['live-music'],
      provider: 'claude',
      model: 'claude-sonnet-4-6',
    });
    expect(suggestPivotEventTags).toHaveBeenCalledWith(
      req,
      event,
      { catalogTags },
    );
    expect(validatePivotEventTags).toHaveBeenCalledWith(
      req,
      ['live-music', 'invented-slug'],
      expect.objectContaining({
        required: true,
        catalogSlugSet: expect.any(Set),
      }),
    );
    expect(validatePivotEventTags.mock.calls[0][2].catalogSlugSet.has('live-music')).toBe(
      true,
    );
    expect(validatePivotEventTags.mock.calls[0][2].catalogSlugSet.has('invented-slug')).toBe(
      false,
    );
  });

  it('passes through Claude/suggest errors without calling Anthropic', async () => {
    suggestPivotEventTags.mockResolvedValue({
      error: 'Tag suggestion requires ANTHROPIC_API_KEY (or CLAUDE_API_KEY) in the environment.',
      status: 503,
      code: 'LLM_NOT_CONFIGURED',
    });

    const result = await assignTags({ event, catalogTags, req });

    expect(result).toMatchObject({
      code: 'LLM_NOT_CONFIGURED',
      status: 503,
    });
    expect(validatePivotEventTags).not.toHaveBeenCalled();
  });

  it('caps assigned tags at three catalog slugs', async () => {
    suggestPivotEventTags.mockResolvedValue({
      data: {
        tags: ['live-music', 'board-games', 'social', 'nightlife'],
        model: 'claude-sonnet-4-6',
      },
    });
    validatePivotEventTags.mockResolvedValue({
      tags: ['live-music', 'board-games', 'social', 'nightlife'],
    });

    const result = await assignTags({ event, req });

    expect(result.tags).toEqual(['live-music', 'board-games', 'social']);
  });

  it('jev path fails closed with TAG_ASSIGNER_UNAVAILABLE', async () => {
    process.env.PIVOT_TAG_ASSIGNER = 'jev';

    const result = await assignTags({ event, catalogTags, req });

    expect(result).toMatchObject({
      code: 'TAG_ASSIGNER_UNAVAILABLE',
      status: 503,
    });
    expect(suggestPivotEventTags).not.toHaveBeenCalled();
    expect(validatePivotEventTags).not.toHaveBeenCalled();
  });

  it('unknown provider fails closed', async () => {
    process.env.PIVOT_TAG_ASSIGNER = 'openai';

    const result = await assignTags({ event, req });

    expect(result.code).toBe('TAG_ASSIGNER_UNAVAILABLE');
    expect(suggestPivotEventTags).not.toHaveBeenCalled();
  });
});
