import justGoLandingCopy, {
  JUSTGO_IOS_STORE_URL,
  JUSTGO_LANDING_STORY_KEYS,
  JUSTGO_PUBLIC_ORIGIN,
  formatWaitlistFriendsJoined,
  justGoCanonicalLandingPath,
  justGoLandingPath,
  justGoPublicLandingUrl,
  justGoPublicOrigin,
  justGoPublicUrl,
  landingStoryGrafKey,
  resolveJustGoLandingCopy,
  resolveWaitlistShareUrl,
} from './justGoLandingCopy';

it('pins iOS acquisition to the standalone Just Go listing', () => {
  expect(JUSTGO_IOS_STORE_URL).toBe(
    'https://apps.apple.com/us/app/just-go-weekly-curated-events/id6801364892',
  );
});

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
        'landing.web.cta': 'get {brand.name}',
        'brand.name': 'block',
        'landing.web.story.graf2': 'overlay story',
      },
      tokens: { 'brand.name': 'block' },
    });
    expect(copy.cta).toBe('get block');
    expect(copy.productName).toBe('block');
    expect(copy.story[2]).toBe('overlay story');
    expect(copy.headlineLead).toBe(justGoLandingCopy.headlineLead);
  });

  it('ships a configurable number of story grafs', () => {
    expect(justGoLandingCopy.story).toHaveLength(5);
    expect(JUSTGO_LANDING_STORY_KEYS).toEqual(
      justGoLandingCopy.story.map((_, index) => landingStoryGrafKey(index)),
    );
    expect(resolveJustGoLandingCopy(null).story).toEqual(justGoLandingCopy.story);
  });

  it('appends extra overlay story grafs past the bundled count', () => {
    const copy = resolveJustGoLandingCopy({
      entries: { 'landing.web.story.graf5': 'sixth graf' },
    });
    expect(copy.story).toHaveLength(6);
    expect(copy.story[5]).toBe('sixth graf');
    expect(copy.story.slice(0, 5)).toEqual([...justGoLandingCopy.story]);
  });

  it('uses blank-line-separated voice copy to customize the story graf count', () => {
    const copy = resolveJustGoLandingCopy({
      entries: {
        'landing.web.story.grafs': 'first graf\n\nsecond graf\n\n\nthird graf',
        'landing.web.story.graf0': 'legacy graf',
      },
    });
    expect(copy.story).toEqual(['first graf', 'second graf', 'third graf']);
  });

  it('overlays waitlist keys', () => {
    const copy = resolveJustGoLandingCopy({
      entries: { 'landing.web.waitlist.cta': 'hold my spot' },
    });
    expect(copy.waitlistCta).toBe('hold my spot');
    expect(copy.waitlistSubmit).toBe(justGoLandingCopy.waitlistSubmit);
  });

  it('keeps {count} in waitlist friends-joined overlays', () => {
    const copy = resolveJustGoLandingCopy({
      entries: {
        'landing.web.waitlist.friendsJoined': '{count} people in',
        'landing.web.qr.missingTitle': 'no poster',
      },
    });
    expect(copy.waitlistFriendsJoined).toBe('{count} people in');
    expect(formatWaitlistFriendsJoined(copy, 3)).toBe('3 people in');
    expect(copy.qrMissingTitle).toBe('no poster');
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
      entries: { 'landing.web.cta': '{unterminated' },
    });
    expect(copy.cta).toBe(justGoLandingCopy.cta);
  });
});

describe('justGoLandingPath', () => {
  it('builds the general and tenant landings', () => {
    expect(justGoLandingPath()).toBe('/justgo');
    expect(justGoLandingPath('Troy')).toBe('/justgo/troy');
    expect(justGoLandingPath('creator')).toBe('/justgo');
  });
});

describe('justGoPublicOrigin / justGoPublicUrl', () => {
  const prod = { nodeEnv: 'production' };

  it('uses justgo.lol in production, not meridian.study', () => {
    expect(justGoPublicOrigin(prod)).toBe(JUSTGO_PUBLIC_ORIGIN);
    expect(justGoPublicUrl('/', prod)).toBe('https://justgo.lol');
    expect(justGoPublicUrl('/troy', prod)).toBe('https://justgo.lol/troy');
    expect(justGoPublicUrl('qr/poster-night', prod)).toBe('https://justgo.lol/qr/poster-night');
    expect(justGoPublicLandingUrl('Troy', prod)).toBe('https://justgo.lol/troy');
    expect(justGoPublicLandingUrl('creator', prod)).toBe('https://justgo.lol');
  });

  it('uses the current origin in development', () => {
    const dev = { nodeEnv: 'development', windowOrigin: 'http://localhost:3000' };
    expect(justGoPublicOrigin(dev)).toBe('http://localhost:3000');
    expect(justGoPublicUrl('/justgo', dev)).toBe('http://localhost:3000/justgo');
    expect(justGoPublicLandingUrl('troy', dev)).toBe('http://localhost:3000/troy');
  });

  it('honors an explicit origin override', () => {
    expect(
      justGoPublicOrigin({ nodeEnv: 'production', origin: 'https://preview.justgo.lol/' }),
    ).toBe('https://preview.justgo.lol');
  });

  it('keeps /justgo as an alias path, not the canonical city path', () => {
    expect(justGoCanonicalLandingPath('troy')).toBe('/troy');
    expect(justGoLandingPath('troy')).toBe('/justgo/troy');
  });
});

describe('resolveWaitlistShareUrl', () => {
  const prod = { nodeEnv: 'production' };

  it('rewrites the API share path through justGoPublicUrl', () => {
    expect(
      resolveWaitlistShareUrl(
        { shareUrl: 'https://justgo.lol/troy?ref=abc12', tenantKey: 'troy' },
        prod,
      ),
    ).toBe('https://justgo.lol/troy?ref=abc12');
    expect(resolveWaitlistShareUrl({ shareUrl: '/hudson?ref=zz' }, prod)).toBe(
      'https://justgo.lol/hudson?ref=zz',
    );
  });

  it('does not mint meridian.study as the public share host', () => {
    expect(
      resolveWaitlistShareUrl(
        { shareUrl: 'https://meridian.study/troy?ref=abc12', tenantKey: 'troy' },
        prod,
      ),
    ).toBe('https://justgo.lol/troy?ref=abc12');
  });

  it('falls back to the city landing when shareUrl is missing', () => {
    expect(resolveWaitlistShareUrl({ tenantKey: 'Troy' }, prod)).toBe('https://justgo.lol/troy');
  });
});

describe('formatWaitlistFriendsJoined', () => {
  it('shows 0 on first submit and pluralizes', () => {
    expect(formatWaitlistFriendsJoined(justGoLandingCopy, 0)).toBe('0 friends joined');
    expect(formatWaitlistFriendsJoined(justGoLandingCopy, 1)).toBe('1 friend joined');
    expect(formatWaitlistFriendsJoined(justGoLandingCopy, 3)).toBe('3 friends joined');
    expect(formatWaitlistFriendsJoined(justGoLandingCopy, undefined)).toBe('0 friends joined');
  });
});
