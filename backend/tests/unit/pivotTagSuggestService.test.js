jest.mock('axios');
jest.mock('../../services/pivotTagCatalogService', () => ({
  listPivotTags: jest.fn(),
  validatePivotEventTags: jest.fn(),
}));

const axios = require('axios');
const { listPivotTags, validatePivotEventTags } = require('../../services/pivotTagCatalogService');
const {
  suggestPivotEventTags,
  suggestPivotEventTagsBatch,
  parseTagsFromClaudeText,
  buildTagSuggestionPrompt,
  resolveAnthropicApiKey,
  mapWithConcurrency,
  resolveBatchConcurrency,
} = require('../../services/pivotTagSuggestService');

describe('pivotTagSuggestService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, ANTHROPIC_API_KEY: 'test-key' };
    listPivotTags.mockResolvedValue({
      data: {
        tags: [
          { slug: 'live-music', label: 'live music' },
          { slug: 'board-games', label: 'board games' },
        ],
      },
    });
    validatePivotEventTags.mockResolvedValue({ tags: ['live-music'] });
    axios.post.mockReset();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('returns LLM_NOT_CONFIGURED when API key is missing', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.CLAUDE_API_KEY;

    const result = await suggestPivotEventTags({ globalDb: {} }, { name: 'Jazz Night' });

    expect(result.code).toBe('LLM_NOT_CONFIGURED');
    expect(result.status).toBe(503);
  });

  it('parses JSON tag slugs from Claude text', () => {
    expect(parseTagsFromClaudeText('{"tags":["live-music","social"]}')).toEqual([
      'live-music',
      'social',
    ]);
  });

  it('builds prompt with catalog and listing hints', () => {
    const prompt = buildTagSuggestionPrompt(
      {
        name: 'Sunset Listening Party',
        description: 'Vinyl on the roof',
        location: 'Brooklyn',
        hostName: 'Roof Records',
        sourceTags: ['Music'],
      },
      [{ slug: 'live-music', label: 'live music' }],
    );

    expect(prompt).toContain('live-music (live music)');
    expect(prompt).toContain('Sunset Listening Party');
    expect(prompt).toContain('Music');
  });

  it('suggests validated catalog tags via Claude', async () => {
    axios.post.mockResolvedValue({
      data: {
        content: [{ type: 'text', text: '{"tags":["live-music"]}' }],
      },
    });

    const result = await suggestPivotEventTags(
      { globalDb: {} },
      {
        name: 'Sunset Listening Party',
        description: 'Vinyl on the roof',
        location: 'Brooklyn',
        hostName: 'Roof Records',
      },
    );

    expect(result.data.tags).toEqual(['live-music']);
    expect(validatePivotEventTags).toHaveBeenCalled();
    expect(axios.post).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/messages',
      expect.objectContaining({
        messages: [expect.objectContaining({ role: 'user' })],
      }),
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-api-key': 'test-key' }),
      }),
    );
  });

  it('batch suggestion returns one entry per event', async () => {
    axios.post.mockResolvedValue({
      data: {
        content: [{ type: 'text', text: '{"tags":["board-games"]}' }],
      },
    });

    const result = await suggestPivotEventTagsBatch(
      { globalDb: {} },
      [{ name: 'Game Night' }, { name: 'Open Mic' }],
    );

    expect(result.data.suggestions).toHaveLength(2);
    expect(result.data.suggestedCount).toBe(2);
    expect(result.data.concurrency).toBe(4);
    // Shared catalog — one listPivotTags for the batch, not per event.
    expect(listPivotTags).toHaveBeenCalledTimes(1);
  });

  it('batch suggestion runs Claude calls concurrently (capped)', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    axios.post.mockImplementation(
      () =>
        new Promise((resolve) => {
          inFlight += 1;
          maxInFlight = Math.max(maxInFlight, inFlight);
          setTimeout(() => {
            inFlight -= 1;
            resolve({
              data: {
                content: [{ type: 'text', text: '{"tags":["live-music"]}' }],
              },
            });
          }, 30);
        }),
    );

    const events = Array.from({ length: 6 }, (_, i) => ({ name: `Event ${i}` }));
    const result = await suggestPivotEventTagsBatch(
      { globalDb: {} },
      events,
      { concurrency: 3 },
    );

    expect(result.data.suggestedCount).toBe(6);
    expect(result.data.concurrency).toBe(3);
    expect(maxInFlight).toBe(3);
    expect(axios.post).toHaveBeenCalledTimes(6);
  });

  it('mapWithConcurrency preserves order with a worker pool', async () => {
    const seen = [];
    const results = await mapWithConcurrency([1, 2, 3, 4], 2, async (value) => {
      seen.push(value);
      await new Promise((resolve) => setTimeout(resolve, 5));
      return value * 10;
    });
    expect(results).toEqual([10, 20, 30, 40]);
    expect(seen).toHaveLength(4);
  });

  it('resolveBatchConcurrency caps and falls back', () => {
    expect(resolveBatchConcurrency(3)).toBe(3);
    expect(resolveBatchConcurrency(99)).toBe(8);
    expect(resolveBatchConcurrency(0)).toBe(4);
  });

  it('batch suggestion returns error when every event fails', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.CLAUDE_API_KEY;

    const result = await suggestPivotEventTagsBatch(
      { globalDb: {} },
      [{ name: 'Game Night' }],
    );

    expect(result.error).toMatch(/ANTHROPIC_API_KEY/);
    expect(result.code).toBe('LLM_NOT_CONFIGURED');
    expect(result.data.failedCount).toBe(1);
    expect(result.data.suggestedCount).toBe(0);
  });

  it('resolveAnthropicApiKey accepts CLAUDE_API_KEY alias', () => {
    delete process.env.ANTHROPIC_API_KEY;
    process.env.CLAUDE_API_KEY = 'alias-key';
    expect(resolveAnthropicApiKey()).toBe('alias-key');
  });

  it('suggestAndApplyPivotEventTags requires tenantKey and eventIds', async () => {
    const {
      suggestAndApplyPivotEventTags,
    } = require('../../services/pivotTagSuggestService');

    await expect(
      suggestAndApplyPivotEventTags({ globalDb: {} }, { eventIds: ['x'] }),
    ).resolves.toMatchObject({ code: 'TENANT_KEY_REQUIRED' });

    await expect(
      suggestAndApplyPivotEventTags(
        { globalDb: {} },
        { tenantKey: 'nyc', eventIds: [] },
      ),
    ).resolves.toMatchObject({ code: 'EVENT_IDS_REQUIRED' });
  });
});
