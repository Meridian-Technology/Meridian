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
});
