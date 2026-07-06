jest.mock('../../services/getGlobalModelService', () => jest.fn());

const getGlobalModels = require('../../services/getGlobalModelService');
const {
  listPivotTags,
  seedPivotTagCatalog,
  validatePivotInterestTags,
} = require('../../services/pivotTagCatalogService');

describe('pivotTagCatalogService', () => {
  let PivotTagCatalog;

  beforeEach(() => {
    PivotTagCatalog = {
      find: jest.fn(),
    };
    getGlobalModels.mockReturnValue({ PivotTagCatalog });
  });

  it('returns active tags sorted by sortOrder', async () => {
    const sort = jest.fn().mockReturnThis();
    const select = jest.fn().mockReturnThis();
    const lean = jest.fn().mockResolvedValue([
      { slug: 'live-music', label: 'live music', sortOrder: 10, active: true },
      { slug: 'board-games', label: 'board games', sortOrder: 20, active: true },
    ]);
    PivotTagCatalog.find.mockReturnValue({ sort, select, lean });

    const result = await listPivotTags({ globalDb: {} });

    expect(PivotTagCatalog.find).toHaveBeenCalledWith({ active: true });
    expect(sort).toHaveBeenCalledWith({ sortOrder: 1, slug: 1 });
    expect(result.data.tags).toEqual([
      { slug: 'live-music', label: 'live music' },
      { slug: 'board-games', label: 'board games' },
    ]);
  });

  it('returns error when global DB context is missing', async () => {
    const result = await listPivotTags({});

    expect(result.error).toMatch(/Global database context required/);
    expect(result.status).toBe(500);
  });

  it('upserts seed rows and returns counts', async () => {
    const findOneAndUpdate = jest.fn().mockResolvedValue({});
    const countDocuments = jest
      .fn()
      .mockResolvedValueOnce(18)
      .mockResolvedValueOnce(18)
      .mockResolvedValueOnce(0);
    PivotTagCatalog = { findOneAndUpdate, countDocuments };
    getGlobalModels.mockReturnValue({ PivotTagCatalog });

    const result = await seedPivotTagCatalog({ globalDb: {} });

    expect(findOneAndUpdate).toHaveBeenCalled();
    expect(result.data.upserted).toBeGreaterThan(0);
    expect(result.data.activeCount).toBe(18);
    expect(result.data.tags.some((tag) => tag.slug === 'live-music')).toBe(true);
  });
});

describe('pivotTagCatalogService validatePivotInterestTags', () => {
  let PivotTagCatalog;

  beforeEach(() => {
    PivotTagCatalog = {
      find: jest.fn(),
    };
    getGlobalModels.mockReturnValue({ PivotTagCatalog });
  });

  it('accepts empty interest tags', async () => {
    const result = await validatePivotInterestTags({ globalDb: {} }, []);

    expect(result.tags).toEqual([]);
    expect(PivotTagCatalog.find).not.toHaveBeenCalled();
  });

  it('normalizes, dedupes, and validates active catalog slugs', async () => {
    const select = jest.fn().mockReturnThis();
    const lean = jest.fn().mockResolvedValue([
      { slug: 'live-music' },
      { slug: 'board-games' },
    ]);
    PivotTagCatalog.find.mockReturnValue({ select, lean });

    const result = await validatePivotInterestTags(
      { globalDb: {} },
      [' Live-Music ', 'live-music', 'board-games'],
    );

    expect(PivotTagCatalog.find).toHaveBeenCalledWith({ active: true });
    expect(result.tags).toEqual(['live-music', 'board-games']);
  });

  it('rejects unknown catalog slugs', async () => {
    const select = jest.fn().mockReturnThis();
    const lean = jest.fn().mockResolvedValue([{ slug: 'live-music' }]);
    PivotTagCatalog.find.mockReturnValue({ select, lean });

    const result = await validatePivotInterestTags(
      { globalDb: {} },
      ['live-music', 'fake-tag'],
    );

    expect(result.code).toBe('INVALID_TAG');
    expect(result.status).toBe(400);
  });

  it('rejects more than eight interest tags', async () => {
    const result = await validatePivotInterestTags(
      { globalDb: {} },
      [
        'tag-one',
        'tag-two',
        'tag-three',
        'tag-four',
        'tag-five',
        'tag-six',
        'tag-seven',
        'tag-eight',
        'tag-nine',
      ],
    );

    expect(result.code).toBe('INTEREST_TAGS_LIMIT');
    expect(result.status).toBe(400);
    expect(PivotTagCatalog.find).not.toHaveBeenCalled();
  });
});
