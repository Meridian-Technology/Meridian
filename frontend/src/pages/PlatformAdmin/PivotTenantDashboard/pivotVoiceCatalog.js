export const COPY_ENTRY_MAX_LENGTH = 500;
export const COPY_TOKEN_MAX_LENGTH = 240;

export function pivotCopyAdminPaths(scope, tenantKey) {
  const cityKey =
    typeof tenantKey === 'string' && tenantKey.trim()
      ? tenantKey.trim().toLowerCase()
      : '';
  const isTenant = scope === 'tenant' && Boolean(cityKey);
  const pack = isTenant
    ? `/admin/pivot/tenants/${encodeURIComponent(cityKey)}/copy`
    : '/admin/pivot/copy';
  return {
    catalog: '/admin/pivot/copy/catalog',
    layers: pack,
    write: pack,
    canWrite: scope === 'platform' || isTenant,
  };
}

function layerFor(map, key) {
  const layer = map?.[key];
  if (!layer || typeof layer !== 'object') {
    return { shipped: undefined, platform: null, tenant: null, effective: undefined };
  }
  return {
    shipped: layer.shipped,
    platform: layer.platform ?? null,
    tenant: layer.tenant ?? null,
    effective: layer.effective,
  };
}

function buildRow({
  id,
  type,
  path,
  section,
  kind,
  params,
  sampleArgs,
  usesTokens,
  shipped,
  platform,
  tenant,
  scope,
}) {
  const cityValue = scope === 'tenant' ? tenant : null;
  const effective = cityValue ?? platform ?? shipped ?? '';
  return {
    id,
    type,
    path,
    section,
    kind: kind || 'string',
    params: Array.isArray(params) ? params : [],
    sampleArgs: sampleArgs && typeof sampleArgs === 'object' ? sampleArgs : undefined,
    usesTokens: Boolean(usesTokens),
    shipped: shipped ?? '',
    platform: platform ?? null,
    tenant: cityValue,
    effective,
    overridden: scope === 'tenant' ? cityValue != null : platform != null,
    maxLength: type === 'token' ? COPY_TOKEN_MAX_LENGTH : COPY_ENTRY_MAX_LENGTH,
  };
}

export function buildVoiceRows({
  keys = [],
  tokens = [],
  layers = {},
  scope = 'platform',
} = {}) {
  const entryLayers = layers.entries || {};
  const tokenLayers = layers.tokens || {};

  const tokenRows = tokens.map((token) => {
    const name = token.name;
    const layer = layerFor(tokenLayers, name);
    return buildRow({
      id: `token:${name}`,
      type: 'token',
      path: name,
      section: 'tokens',
      kind: 'string',
      params: [],
      usesTokens: false,
      shipped: layer.shipped ?? token.shipped,
      platform: layer.platform,
      tenant: layer.tenant,
      scope,
    });
  });

  const entryRows = keys.map((key) => {
    const layer = layerFor(entryLayers, key.path);
    return buildRow({
      id: `entry:${key.path}`,
      type: 'entry',
      path: key.path,
      section: key.path.split('.')[0] || 'other',
      kind: key.kind,
      params: key.params,
      sampleArgs: key.sampleArgs,
      usesTokens: key.usesTokens,
      shipped: layer.shipped ?? key.shipped,
      platform: layer.platform,
      tenant: layer.tenant,
      scope,
    });
  });

  return [...tokenRows, ...entryRows];
}

export function sparseOverlayFromLayers(layers = {}, scope = 'platform') {
  const field = scope === 'tenant' ? 'tenant' : 'platform';
  const pick = (map) => {
    const out = {};
    for (const [key, layer] of Object.entries(map || {})) {
      if (layer && layer[field] != null && layer[field] !== '') {
        out[key] = layer[field];
      }
    }
    return out;
  };
  return {
    entries: pick(layers.entries),
    tokens: pick(layers.tokens),
  };
}

export function applySparseOverlay(rows, overlay, scope = 'platform') {
  if (!overlay) return rows;
  return rows.map((row) => {
    const map = row.type === 'token' ? overlay.tokens : overlay.entries;
    const stored = map && Object.prototype.hasOwnProperty.call(map, row.path)
      ? map[row.path]
      : null;
    if (scope === 'tenant') {
      const tenant = stored;
      return {
        ...row,
        tenant,
        effective: tenant ?? row.platform ?? row.shipped,
        overridden: tenant != null,
      };
    }
    const platform = stored;
    return {
      ...row,
      platform,
      tenant: null,
      effective: platform ?? row.shipped,
      overridden: platform != null,
    };
  });
}

export function filterVoiceRows(
  rows,
  { query = '', overridden = false, interpolator = false, tokenUsing = false } = {},
) {
  const needle = String(query || '').trim().toLowerCase();
  return rows.filter((row) => {
    if (needle) {
      const hay = `${row.path}\n${row.shipped || ''}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    if (overridden && !row.overridden) return false;
    if (interpolator && row.kind !== 'template') return false;
    if (tokenUsing && !row.usesTokens) return false;
    return true;
  });
}

const VOICE_FAMILY_ORDER = [
  {
    id: 'tokens',
    label: 'Tokens',
    hint: 'Ripple through the rest of the catalog',
    sections: ['tokens'],
  },
  {
    id: 'getting-started',
    label: 'Getting started',
    sections: [
      'brand',
      'placeholders',
      'ticker',
      'welcome',
      'entry',
      'referral',
      'auth',
      'onboarding',
      'interestsOnboarding',
      'calendarOnboarding',
      'themeOnboarding',
      'ageOnboarding',
    ],
  },
  {
    id: 'week',
    label: 'Week & drop',
    sections: ['week', 'recap', 'cardStack', 'swipeTutorial'],
  },
  {
    id: 'explore',
    label: 'Explore & plans',
    sections: ['explore', 'plans', 'calendar', 'eventDetail'],
  },
  {
    id: 'people',
    label: 'People',
    sections: ['friends', 'social', 'invite', 'inviteDeepLink'],
  },
  {
    id: 'you',
    label: 'Profile',
    sections: ['profile', 'feedback', 'editInterests'],
  },
  {
    id: 'crew',
    label: 'Crew',
    sections: ['crew'],
  },
  {
    id: 'landing',
    label: 'Web landing',
    sections: ['landing'],
  },
];

const SECTION_LABELS = {
  tokens: 'Tokens',
  brand: 'Brand',
  placeholders: 'Placeholders',
  ticker: 'Tickers',
  welcome: 'Welcome',
  entry: 'City entry',
  referral: 'Referral',
  auth: 'Sign in',
  onboarding: 'Onboarding',
  interestsOnboarding: 'Interests',
  calendarOnboarding: 'Calendar intro',
  themeOnboarding: 'Theme',
  ageOnboarding: 'Age gate',
  week: 'Week',
  recap: 'Recap',
  cardStack: 'Card stack',
  swipeTutorial: 'Swipe tutorial',
  explore: 'Explore',
  plans: 'Plans',
  calendar: 'Calendar',
  eventDetail: 'Event detail',
  friends: 'Friends',
  social: 'Social',
  invite: 'Invite',
  inviteDeepLink: 'Invite link',
  profile: 'Profile',
  feedback: 'Feedback',
  editInterests: 'Edit interests',
  crew: 'Crew',
  landing: 'Landing',
  overview: 'Overview',
  push: 'Push',
  contacts: 'Contacts',
  getStarted: 'Get started',
  join: 'Join',
};

const CREW_SUBGROUP_LABELS = {
  overview: 'Overview',
  week: 'Week ritual',
  push: 'Push',
  contacts: 'Contacts',
  onboarding: 'Onboarding',
  getStarted: 'Get started',
  join: 'Join',
  profile: 'Profile',
};

const LANDING_SUBGROUP_LABELS = {
  overview: 'Overview',
  nav: 'Nav',
  countdown: 'Countdown',
  headline: 'Headline',
  cities: 'Cities',
  flyers: 'Flyers',
  deck: 'Deck',
  story: 'Story',
  waitlist: 'Waitlist',
  footer: 'Footer',
  qr: 'QR',
};

const LANDING_SUBGROUP_ORDER = Object.keys(LANDING_SUBGROUP_LABELS);

const FAMILY_BY_SECTION = new Map(
  VOICE_FAMILY_ORDER.flatMap((family) =>
    family.sections.map((section) => [section, family]),
  ),
);

function titleCaseSegment(segment, familyId) {
  if (familyId === 'crew' && CREW_SUBGROUP_LABELS[segment]) {
    return CREW_SUBGROUP_LABELS[segment];
  }
  if (familyId === 'landing' && LANDING_SUBGROUP_LABELS[segment]) {
    return LANDING_SUBGROUP_LABELS[segment];
  }
  if (SECTION_LABELS[segment]) return SECTION_LABELS[segment];
  return String(segment || 'Other')
    .replace(/([A-Z])/g, ' $1')
    .replace(/[-_]/g, ' ')
    .replace(/^\s*\w/, (ch) => ch.toUpperCase())
    .trim();
}

function rowSubgroup(row) {
  const parts = String(row.path || '').split('.');
  if (row.section === 'crew') {
    if (parts.length >= 3) return parts[1];
    return 'overview';
  }
  if (row.section === 'landing') {
    // landing.web.waitlist.cta → Waitlist. landing.web.cta → Overview.
    const start = parts[1] === 'web' ? 2 : 1;
    if (parts.length > start + 1) return parts[start];
    return 'overview';
  }
  return row.section;
}

function sortLandingGroups(groups) {
  const rank = new Map(LANDING_SUBGROUP_ORDER.map((id, index) => [id, index]));
  return [...groups].sort((a, b) => {
    const left = rank.has(a.section) ? rank.get(a.section) : 99;
    const right = rank.has(b.section) ? rank.get(b.section) : 99;
    return left - right || a.label.localeCompare(b.label);
  });
}

/**
 * Product-area folders with nested subgroups (crew, landing web).
 * Unknown sections land in Other.
 */
export function groupVoiceRows(rows) {
  const buckets = new Map();
  const ensureFamily = (family) => {
    let bucket = buckets.get(family.id);
    if (!bucket) {
      bucket = {
        id: family.id,
        label: family.label,
        hint: family.hint || '',
        groups: [],
        groupIndex: new Map(),
        count: 0,
        overrideCount: 0,
      };
      buckets.set(family.id, bucket);
    }
    return bucket;
  };

  for (const row of rows) {
    const family = FAMILY_BY_SECTION.get(row.section) || {
      id: 'other',
      label: 'Other',
      hint: '',
      sections: [],
    };
    const bucket = ensureFamily(family);
    const subgroupId = rowSubgroup(row);
    let group = bucket.groupIndex.get(subgroupId);
    if (!group) {
      group = {
        id: `${family.id}:${subgroupId}`,
        section: subgroupId,
        label: titleCaseSegment(subgroupId, family.id),
        items: [],
      };
      bucket.groupIndex.set(subgroupId, group);
      bucket.groups.push(group);
    }
    group.items.push(row);
    bucket.count += 1;
    if (row.overridden) bucket.overrideCount += 1;
  }

  const ordered = [];
  for (const family of VOICE_FAMILY_ORDER) {
    const bucket = buckets.get(family.id);
    if (bucket) ordered.push(bucket);
  }
  if (buckets.has('other')) ordered.push(buckets.get('other'));

  return ordered.map(({ groupIndex, ...family }) => {
    if (family.id === 'landing') {
      return { ...family, groups: sortLandingGroups(family.groups) };
    }
    return family;
  });
}

export { VOICE_FAMILY_ORDER };

export function tokenParamsFromRows(rows) {
  const tokens = {};
  for (const row of rows) {
    if (row.type === 'token' && row.effective != null) {
      tokens[row.path] = row.effective;
    }
  }
  return tokens;
}

export function writePayloadForRow(row, value) {
  if (row.type === 'token') {
    return { token: row.path, value };
  }
  return { key: row.path, value };
}

export function resetPayloadForRow(row) {
  if (row.type === 'token') {
    return { tokens: [row.path] };
  }
  return { keys: [row.path] };
}
