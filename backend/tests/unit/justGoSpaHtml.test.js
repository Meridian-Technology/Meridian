const fs = require('fs');
const path = require('path');
const {
  JUSTGO_TITLE,
  JUSTGO_DESCRIPTION,
  wantsJustGoHtmlMeta,
  justGoCanonicalPath,
  applyJustGoIndexHtml,
} = require('../../utilities/justGoSpaHtml');

const INDEX_HTML = fs.readFileSync(
  path.join(__dirname, '../../../frontend/public/index.html'),
  'utf8',
);

function req({ host = 'justgo.lol', originalUrl = '/' } = {}) {
  return {
    headers: { host },
    originalUrl,
    path: originalUrl.split('?')[0],
    get: (header) => (header === 'host' ? host : undefined),
  };
}

describe('justGoSpaHtml', () => {
  it('rewrites justgo.lol and campus /justgo aliases, not campus home', () => {
    expect(wantsJustGoHtmlMeta(req({ host: 'justgo.lol', originalUrl: '/' }))).toBe(true);
    expect(wantsJustGoHtmlMeta(req({ host: 'justgo.lol', originalUrl: '/qr/sf-1' }))).toBe(true);
    expect(wantsJustGoHtmlMeta(req({ host: 'www.justgo.lol', originalUrl: '/troy' }))).toBe(true);
    expect(wantsJustGoHtmlMeta(req({ host: 'meridian.study', originalUrl: '/justgo' }))).toBe(true);
    expect(wantsJustGoHtmlMeta(req({ host: 'meridian.study', originalUrl: '/justgo/qr/sf-1' }))).toBe(
      true,
    );
    expect(wantsJustGoHtmlMeta(req({ host: 'meridian.study', originalUrl: '/' }))).toBe(false);
    expect(wantsJustGoHtmlMeta(req({ host: 'rpi.meridian.study', originalUrl: '/qr/sf-1' }))).toBe(
      false,
    );
  });

  it('strips the campus /justgo alias for canonical paths', () => {
    expect(justGoCanonicalPath(req({ originalUrl: '/justgo' }))).toBe('/');
    expect(justGoCanonicalPath(req({ originalUrl: '/justgo/' }))).toBe('/');
    expect(justGoCanonicalPath(req({ originalUrl: '/justgo/troy?ref=1' }))).toBe('/troy');
    expect(justGoCanonicalPath(req({ originalUrl: '/qr/sf-1' }))).toBe('/qr/sf-1');
  });

  it('replaces Meridian title, description, and share tags on the landing HTML', () => {
    const html = applyJustGoIndexHtml(INDEX_HTML, req({ originalUrl: '/' }));

    expect(html).toContain(`<title>${JUSTGO_TITLE}</title>`);
    expect(html).not.toMatch(/<title>Meridian<\/title>/);
    expect(html).toContain(`content="${JUSTGO_DESCRIPTION}"`);
    expect(html).toContain('property="og:site_name" content="just go"');
    expect(html).toContain('property="og:url" content="https://justgo.lol"');
    expect(html).toContain('property="og:image" content="https://justgo.lol/justgo/og.jpg"');
    expect(html).toContain('name="twitter:image" content="https://justgo.lol/justgo/og.jpg"');
    expect(html).toContain('name="theme-color" content="#1E1A16"');
    expect(html).toContain('href="https://justgo.lol/justgo-icon.svg"');
    expect(html).not.toMatch(/All of campus in one place/);
    expect(html).not.toMatch(/Study Compass/);
    expect(html).not.toMatch(/study-compass\.com/);
    expect(html).not.toMatch(/meridian\.study\/icon\.svg/);
  });

  it('uses the QR path as the canonical URL', () => {
    const html = applyJustGoIndexHtml(
      INDEX_HTML,
      req({ originalUrl: '/qr/sf-1?utm=ig' }),
    );
    expect(html).toContain('property="og:url" content="https://justgo.lol/qr/sf-1"');
    expect(html).toContain(`<title>${JUSTGO_TITLE}</title>`);
  });

  it('leaves campus HTML unchanged when not applied', () => {
    expect(INDEX_HTML).toContain('<title>Meridian</title>');
    expect(INDEX_HTML).toContain('All of campus in one place | Meridian');
  });
});
