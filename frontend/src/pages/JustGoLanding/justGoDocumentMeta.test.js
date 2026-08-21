import justGoLandingCopy from './justGoLandingCopy';
import {
  JUSTGO_OG_IMAGE_PATH,
  applyJustGoDocumentMeta,
  justGoDocumentCanonicalPath,
} from './justGoDocumentMeta';

describe('justGoDocumentCanonicalPath', () => {
  it('strips the campus /justgo alias', () => {
    expect(justGoDocumentCanonicalPath('/justgo')).toBe('/');
    expect(justGoDocumentCanonicalPath('/justgo/troy')).toBe('/troy');
    expect(justGoDocumentCanonicalPath('/qr/sf-1')).toBe('/qr/sf-1');
  });
});

describe('applyJustGoDocumentMeta', () => {
  beforeEach(() => {
    document.head.innerHTML = `
      <title>Meridian</title>
      <meta name="description" content="Discover and book the best study spaces at RPI.">
      <meta property="og:title" content="All of campus in one place | Meridian">
      <meta property="og:image" content="https://meridian.study/icon.svg">
      <meta name="theme-color" content="#000000">
      <link rel="icon" href="/icon.svg" />
    `;
    document.title = 'Meridian';
  });

  it('replaces campus title, description, and share tags', () => {
    applyJustGoDocumentMeta();

    expect(document.title).toBe(justGoLandingCopy.documentTitle);
    expect(document.querySelector('meta[name="description"]').getAttribute('content')).toBe(
      justGoLandingCopy.metaDescription,
    );
    expect(document.querySelector('meta[name="theme-color"]').getAttribute('content')).toBe(
      '#1E1A16',
    );
    expect(document.querySelector('meta[property="og:title"]').getAttribute('content')).toBe(
      justGoLandingCopy.documentTitle,
    );
    expect(document.querySelector('meta[property="og:site_name"]').getAttribute('content')).toBe(
      'just go',
    );
    expect(document.querySelector('meta[property="og:image"]').getAttribute('content')).toContain(
      JUSTGO_OG_IMAGE_PATH,
    );
    expect(document.querySelector('link[rel="icon"]').getAttribute('href')).toContain(
      'justgo-icon.svg',
    );
  });
});
