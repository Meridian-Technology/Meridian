import {
  collectBrokenImageEventIds,
  normalizeImageUrl,
} from './checkImageUrl';

describe('normalizeImageUrl', () => {
  it('accepts http(s) URLs and rejects the rest', () => {
    expect(normalizeImageUrl(' https://cdn.example/a.jpg ')).toBe('https://cdn.example/a.jpg');
    expect(normalizeImageUrl('ftp://cdn.example/a.jpg')).toBeNull();
    expect(normalizeImageUrl('not a url')).toBeNull();
    expect(normalizeImageUrl('')).toBeNull();
  });
});

describe('collectBrokenImageEventIds', () => {
  const OriginalImage = global.Image;

  afterEach(() => {
    global.Image = OriginalImage;
  });

  function mockImage(handler) {
    global.Image = class {
      constructor() {
        this.naturalWidth = 0;
        this.naturalHeight = 0;
        this.onload = null;
        this.onerror = null;
        this.referrerPolicy = '';
      }

      set src(value) {
        handler(this, value);
      }
    };
  }

  it('skips events with no image and flags invalid or unloadable URLs', async () => {
    mockImage((img, url) => {
      queueMicrotask(() => {
        if (String(url).includes('/ok.jpg')) {
          img.naturalWidth = 120;
          img.naturalHeight = 80;
          img.onload();
          return;
        }
        img.onerror();
      });
    });

    const broken = await collectBrokenImageEventIds([
      { _id: 'missing', name: 'No cover' },
      { _id: 'ok', image: 'https://cdn.example/ok.jpg' },
      { _id: 'dead', image: 'https://cdn.example/missing.jpg' },
      { _id: 'invalid', image: 'not-a-url' },
    ]);

    expect([...broken].sort()).toEqual(['dead', 'invalid']);
  });

  it('reuses the result for duplicate URLs', async () => {
    let loads = 0;
    mockImage((img) => {
      loads += 1;
      queueMicrotask(() => img.onerror());
    });

    const broken = await collectBrokenImageEventIds([
      { _id: 'a', image: 'https://cdn.example/same.jpg' },
      { _id: 'b', image: 'https://cdn.example/same.jpg' },
    ]);

    expect(loads).toBe(1);
    expect(broken).toEqual(new Set(['a', 'b']));
  });
});
