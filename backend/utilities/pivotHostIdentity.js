/**
 * Per-host identity capture for Pivot ingest drafts.
 *
 * Drafts carry `hostIdentities[]`. Publish persists them as
 * `customFields.pivot.host.identities[]`. `host.name` stays the joined
 * display snapshot and is never a unique key.
 */

const IDENTITY_PROVIDERS = Object.freeze([
  'luma',
  'partiful',
  'generic-site',
  'justgo',
  'manual',
]);

const PROVIDER_SET = new Set(IDENTITY_PROVIDERS);

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const trimmed = trimString(value);
    if (trimmed) return trimmed;
  }
  return null;
}

function isInvalidHostName(name) {
  if (typeof name !== 'string') return true;
  const normalized = name.trim().toLowerCase();
  return (
    !normalized ||
    normalized === 'partiful.com' ||
    normalized === 'luma.com' ||
    normalized === 'lu.ma' ||
    normalized === 'partiful' ||
    normalized === 'luma'
  );
}

function isHttpUrl(value) {
  const trimmed = trimString(value);
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function normalizeProfileUrl(url) {
  const trimmed = trimString(url);
  if (!trimmed || !isHttpUrl(trimmed)) return null;

  try {
    const parsed = new URL(trimmed);
    let host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    if (host === 'lu.ma') host = 'luma.com';
    const path = parsed.pathname.replace(/\/+$/, '') || '/';
    return `${parsed.protocol}//${host}${path}`;
  } catch {
    return trimmed;
  }
}

function normalizeProvider(provider) {
  const trimmed = trimString(provider).toLowerCase();
  if (PROVIDER_SET.has(trimmed)) return trimmed;
  if (trimmed === 'lu.ma') return 'luma';
  return null;
}

/**
 * @param {object} raw
 * @returns {object|null}
 */
function normalizeHostIdentity(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const provider = normalizeProvider(raw.provider);
  if (!provider) return null;

  const name = firstNonEmpty(raw.name);
  const externalId = firstNonEmpty(raw.externalId, raw.id, raw.userId, raw.api_id);
  const profileUrl = normalizeProfileUrl(raw.profileUrl || raw.url);
  const imageUrl = firstNonEmpty(raw.imageUrl, raw.avatarUrl, raw.avatar_url, raw.photo);

  if (!name && !externalId && !profileUrl) return null;
  if (name && isInvalidHostName(name) && !externalId && !profileUrl) return null;

  return {
    provider,
    ...(externalId ? { externalId } : {}),
    ...(profileUrl ? { profileUrl } : {}),
    ...(name && !isInvalidHostName(name) ? { name } : {}),
    ...(imageUrl && isHttpUrl(imageUrl) ? { imageUrl } : {}),
  };
}

function identityKey(identity) {
  if (!identity || typeof identity !== 'object') return '';
  const provider = trimString(identity.provider).toLowerCase();
  const externalId = trimString(identity.externalId).toLowerCase();
  const profileUrl = normalizeProfileUrl(identity.profileUrl);
  const name = trimString(identity.name).toLowerCase();

  if (provider && externalId) return `${provider}::id::${externalId}`;
  if (profileUrl) return `url::${profileUrl.toLowerCase()}`;
  if (provider && name) return `${provider}::name::${name}`;
  if (name) return `name::${name}`;
  return '';
}

function unionHostIdentities(...lists) {
  const seen = new Set();
  const out = [];

  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const raw of list) {
      const identity = normalizeHostIdentity(raw);
      if (!identity) continue;
      const key = identityKey(identity);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(identity);
    }
  }

  return out;
}

function primaryHostIdentity(identities) {
  if (!Array.isArray(identities) || !identities.length) return null;
  return identities.find((row) => row && (row.profileUrl || row.externalId || row.imageUrl || row.name)) || null;
}

function identityFromDisplayName(name, provider) {
  return normalizeHostIdentity({ provider, name });
}

function pickHostImageUrl(...values) {
  for (const value of values) {
    const trimmed = trimString(value);
    if (trimmed && isHttpUrl(trimmed)) return trimmed;
  }
  return null;
}

function lumaHostDisplayName(host) {
  if (typeof host === 'string') return host.trim();
  if (!host || typeof host !== 'object') return '';
  return (
    firstNonEmpty(
      host.name,
      [host.first_name, host.last_name]
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .filter(Boolean)
        .join(' '),
    ) || ''
  );
}

function partifulProfileUrlFromHost(host) {
  const direct = normalizeProfileUrl(host?.url || host?.profileUrl || host?.profile_url);
  if (direct) return direct;

  const slug = firstNonEmpty(host?.username, host?.slug, host?.id, host?.userId);
  if (!slug) return null;
  if (/^https?:\/\//i.test(slug)) return normalizeProfileUrl(slug);
  return `https://partiful.com/u/${encodeURIComponent(slug)}`;
}

function lumaProfileUrlFromHost(host) {
  const direct = normalizeProfileUrl(host?.url || host?.profileUrl || host?.profile_url);
  if (direct) return direct;

  const slug = firstNonEmpty(host?.username, host?.slug);
  if (!slug) return null;
  if (/^https?:\/\//i.test(slug)) return normalizeProfileUrl(slug);
  if (/^[a-z0-9_-]+$/i.test(slug)) {
    return `https://luma.com/user/${encodeURIComponent(slug)}`;
  }
  return null;
}

/**
 * One identity per Partiful host. Managed hosts are listed first; others stay.
 */
function identitiesFromPartifulHosts(hosts) {
  if (!Array.isArray(hosts) || !hosts.length) return [];

  const normalized = hosts
    .map((host) => ({
      host,
      name: typeof host?.name === 'string' ? host.name.trim() : '',
      isManaged: host?.isManaged === true,
    }))
    .filter((entry) => entry.name && !isInvalidHostName(entry.name));

  const ordered = [
    ...normalized.filter((entry) => entry.isManaged),
    ...normalized.filter((entry) => !entry.isManaged),
  ];

  return unionHostIdentities(
    ordered.map((entry) => ({
      provider: 'partiful',
      name: entry.name,
      externalId: firstNonEmpty(entry.host?.id, entry.host?.userId, entry.host?.username, entry.host?.slug),
      profileUrl: partifulProfileUrlFromHost(entry.host),
      imageUrl: firstNonEmpty(
        entry.host?.photo,
        entry.host?.image,
        entry.host?.avatar,
        entry.host?.avatarUrl,
        entry.host?.photoUrl,
      ),
    })),
  );
}

/**
 * One identity per Luma host object (or calendar personal_user).
 */
function identitiesFromLumaHosts(hosts) {
  if (!Array.isArray(hosts) || !hosts.length) return [];

  return unionHostIdentities(
    hosts.map((host) => {
      if (typeof host === 'string') {
        return { provider: 'luma', name: host };
      }
      const name = lumaHostDisplayName(host);
      return {
        provider: 'luma',
        name,
        externalId: firstNonEmpty(host?.api_id, host?.user_id, host?.id, host?.username, host?.slug),
        profileUrl: lumaProfileUrlFromHost(host),
        imageUrl: firstNonEmpty(host?.avatar_url, host?.avatarUrl, host?.image, host?.photo),
      };
    }),
  );
}

function jsonLdImageUrl(node) {
  if (!node || typeof node !== 'object') return null;
  if (typeof node.image === 'string') return node.image.trim();
  if (Array.isArray(node.image) && typeof node.image[0] === 'string') {
    return node.image[0].trim();
  }
  if (node.image && typeof node.image.url === 'string') {
    return node.image.url.trim();
  }
  return null;
}

function jsonLdOrganizerNodes(organizer) {
  if (!organizer) return [];
  return Array.isArray(organizer) ? organizer : [organizer];
}

/**
 * One identity per JSON-LD organizer node — do not join into a single row.
 */
function identitiesFromJsonLdOrganizer(organizer, provider = 'manual') {
  const resolvedProvider = normalizeProvider(provider) || 'manual';
  return unionHostIdentities(
    jsonLdOrganizerNodes(organizer).map((node) => {
      if (!node || typeof node !== 'object') return null;
      const name = typeof node.name === 'string' ? node.name.trim() : '';
      return {
        provider: resolvedProvider,
        name,
        externalId: firstNonEmpty(node.identifier, typeof node['@id'] === 'string' && !isHttpUrl(node['@id']) ? node['@id'] : null),
        profileUrl: firstNonEmpty(node.url, isHttpUrl(node['@id']) ? node['@id'] : null),
        imageUrl: jsonLdImageUrl(node),
      };
    }),
  );
}

/**
 * Fill display image/profile from the primary identity when the snapshot is empty.
 * Never returns an explicit null — callers omit the field instead of clobbering.
 */
function displayFieldsFromIdentities(identities, existing = {}) {
  const primary = primaryHostIdentity(identities);
  return {
    imageUrl: pickHostImageUrl(existing.imageUrl, existing.hostImageUrl, primary?.imageUrl),
    profileUrl: firstNonEmpty(existing.profileUrl, existing.hostProfileUrl, primary?.profileUrl),
  };
}

module.exports = {
  IDENTITY_PROVIDERS,
  isInvalidHostName,
  normalizeHostIdentity,
  normalizeProfileUrl,
  identityKey,
  unionHostIdentities,
  primaryHostIdentity,
  identityFromDisplayName,
  identitiesFromPartifulHosts,
  identitiesFromLumaHosts,
  identitiesFromJsonLdOrganizer,
  displayFieldsFromIdentities,
  lumaHostDisplayName,
};
