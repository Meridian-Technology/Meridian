import justGoLandingCopy, {
  resolveJustGoLandingCopy,
} from './justGoLandingCopy';

describe('resolveJustGoLandingCopy', () => {
  it('keeps bundled strings when the pack is empty', () => {
    expect(resolveJustGoLandingCopy(null)).toEqual(justGoLandingCopy);
    expect(resolveJustGoLandingCopy({ entries: {}, tokens: {} }).cta).toBe(
      justGoLandingCopy.cta,
    );
    expect(resolveJustGoLandingCopy({ entries: {}, tokens: {} }).story).toEqual(
      justGoLandingCopy.story,
    );
  });

  it('overlays landing keys and brand.name', () => {
    const copy = resolveJustGoLandingCopy({
      entries: {
        'landing.cta': 'get {brand.name}',
        'brand.name': 'block',
        'landing.story2': 'overlay story',
      },
      tokens: { 'brand.name': 'block' },
    });
    expect(copy.cta).toBe('get block');
    expect(copy.productName).toBe('block');
    expect(copy.story[2]).toBe('overlay story');
    expect(copy.headlineLead).toBe(justGoLandingCopy.headlineLead);
  });

  it('uses a brand.name token overlay for productName', () => {
    const copy = resolveJustGoLandingCopy({
      tokens: { 'brand.name': 'block' },
      entries: {},
    });
    expect(copy.productName).toBe('block');
    expect(copy.cta).toBe(justGoLandingCopy.cta);
  });

  it('falls back when a template is broken', () => {
    const copy = resolveJustGoLandingCopy({
      entries: { 'landing.cta': '{unterminated' },
    });
    expect(copy.cta).toBe(justGoLandingCopy.cta);
  });
});
