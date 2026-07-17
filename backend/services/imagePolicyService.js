const crypto = require('crypto');

const IMAGE_ENTITY_TYPES = Object.freeze({
  ORG: 'org',
  USER: 'user',
  CLASSROOM: 'classroom',
  EVENT: 'event',
});

const IMAGE_FORMATS = Object.freeze(['avif', 'webp', 'jpeg']);
const DEFAULT_DELIVERY_FORMAT_ORDER = Object.freeze(['avif', 'webp', 'jpeg']);
const SUPPORTED_INPUT_MIME_TYPES = Object.freeze([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

const DELIVERY_ACCESS_MODE = Object.freeze({
  default: 'private_signed',
  description: 'Private S3 objects delivered through signed CDN URLs/cookies',
});

const POLICY_LIMITS = Object.freeze({
  maxUploadBytes: 10 * 1024 * 1024,
  maxPixelCount: 20_000_000,
  maxWidth: 6000,
  maxHeight: 6000,
});

/**
 * Variant presets are intentionally role-based, not route-based:
 * a route chooses one role and receives deterministic outputs.
 */
const IMAGE_ROLE_PRESETS = Object.freeze({
  org_profile: {
    entityType: IMAGE_ENTITY_TYPES.ORG,
    variants: {
      thumb: { width: 96, height: 96, fit: 'cover' },
      card: { width: 256, height: 256, fit: 'cover' },
      full: { width: 512, height: 512, fit: 'cover' },
    },
  },
  org_banner: {
    entityType: IMAGE_ENTITY_TYPES.ORG,
    variants: {
      thumb: { width: 480, height: 200, fit: 'cover' },
      card: { width: 960, height: 360, fit: 'cover' },
      full: { width: 1920, height: 720, fit: 'cover' },
    },
  },
  user_avatar: {
    entityType: IMAGE_ENTITY_TYPES.USER,
    variants: {
      thumb: { width: 64, height: 64, fit: 'cover' },
      card: { width: 128, height: 128, fit: 'cover' },
      full: { width: 320, height: 320, fit: 'cover' },
    },
  },
  classroom_photo: {
    entityType: IMAGE_ENTITY_TYPES.CLASSROOM,
    variants: {
      thumb: { width: 320, height: 180, fit: 'cover' },
      card: { width: 640, height: 360, fit: 'cover' },
      full: { width: 1600, height: 900, fit: 'inside' },
    },
  },
  event_cover: {
    entityType: IMAGE_ENTITY_TYPES.EVENT,
    variants: {
      thumb: { width: 320, height: 180, fit: 'cover' },
      card: { width: 640, height: 360, fit: 'cover' },
      full: { width: 1600, height: 900, fit: 'inside' },
      hero: { width: 1920, height: 1080, fit: 'inside' },
    },
  },
});

function normalizeTenantKey(tenantKey) {
  const normalized = String(tenantKey || '').trim().toLowerCase();
  if (!normalized) {
    throw new Error('tenantKey is required');
  }
  if (!/^[a-z0-9-]+$/.test(normalized)) {
    throw new Error('tenantKey must match ^[a-z0-9-]+$');
  }
  return normalized;
}

function sanitizePathSegment(value, label) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) {
    throw new Error(`${label} is required`);
  }
  if (!/^[a-z0-9-_]+$/.test(normalized)) {
    throw new Error(`${label} must match ^[a-z0-9-_]+$`);
  }
  return normalized;
}

function normalizeEntityId(entityId) {
  const normalized = String(entityId || '').trim();
  if (!normalized) {
    throw new Error('entityId is required');
  }
  return normalized;
}

function assertRolePreset(role) {
  const preset = IMAGE_ROLE_PRESETS[role];
  if (!preset) {
    throw new Error(`Unsupported image role: ${role}`);
  }
  return preset;
}

function createAssetId() {
  return crypto.randomUUID();
}

function isSupportedInputMimeType(mimeType) {
  return SUPPORTED_INPUT_MIME_TYPES.includes(String(mimeType || '').toLowerCase());
}

function buildImageObjectPrefix({
  tenantKey,
  entityType,
  entityId,
  role,
  assetId,
  version = 'v1',
  now = new Date(),
}) {
  const tenant = normalizeTenantKey(tenantKey);
  const normalizedEntityType = sanitizePathSegment(entityType, 'entityType');
  const normalizedEntityId = normalizeEntityId(entityId);
  const normalizedRole = sanitizePathSegment(role, 'role');
  const normalizedAssetId = sanitizePathSegment(assetId, 'assetId');
  const normalizedVersion = sanitizePathSegment(version, 'version');

  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');

  return [
    'v2',
    'tenants',
    tenant,
    'images',
    normalizedEntityType,
    normalizedEntityId,
    normalizedRole,
    String(year),
    month,
    normalizedAssetId,
    normalizedVersion,
  ].join('/');
}

function buildVariantObjectKey({
  tenantKey,
  entityType,
  entityId,
  role,
  assetId,
  version = 'v1',
  variant,
  format,
  now = new Date(),
}) {
  const normalizedVariant = sanitizePathSegment(variant, 'variant');
  const normalizedFormat = sanitizePathSegment(format, 'format');
  const prefix = buildImageObjectPrefix({
    tenantKey,
    entityType,
    entityId,
    role,
    assetId,
    version,
    now,
  });

  return `${prefix}/${normalizedVariant}.${normalizedFormat}`;
}

function buildImageUploadPlan({
  tenantKey,
  entityType,
  entityId,
  role,
  version = 'v1',
  assetId = createAssetId(),
  variants,
  formats = IMAGE_FORMATS,
  now = new Date(),
}) {
  const preset = assertRolePreset(role);
  const normalizedEntityType = sanitizePathSegment(entityType, 'entityType');
  if (preset.entityType !== normalizedEntityType) {
    throw new Error(`Role ${role} requires entityType ${preset.entityType}`);
  }

  const allVariantNames = Object.keys(preset.variants);
  const selectedVariants = variants && variants.length ? variants : allVariantNames;

  selectedVariants.forEach((variantName) => {
    if (!preset.variants[variantName]) {
      throw new Error(`Unsupported variant ${variantName} for role ${role}`);
    }
  });

  const normalizedFormats = formats.map((fmt) => sanitizePathSegment(fmt, 'format'));
  normalizedFormats.forEach((fmt) => {
    if (!IMAGE_FORMATS.includes(fmt)) {
      throw new Error(`Unsupported format ${fmt}`);
    }
  });

  const entries = [];
  selectedVariants.forEach((variantName) => {
    normalizedFormats.forEach((format) => {
      entries.push({
        role,
        variant: variantName,
        format,
        resize: preset.variants[variantName],
        key: buildVariantObjectKey({
          tenantKey,
          entityType: normalizedEntityType,
          entityId,
          role,
          assetId,
          version,
          variant: variantName,
          format,
          now,
        }),
      });
    });
  });

  return {
    tenantKey: normalizeTenantKey(tenantKey),
    entityType: normalizedEntityType,
    entityId: normalizeEntityId(entityId),
    role,
    assetId,
    version,
    formats: normalizedFormats,
    variants: selectedVariants,
    entries,
  };
}

module.exports = {
  IMAGE_ENTITY_TYPES,
  IMAGE_FORMATS,
  SUPPORTED_INPUT_MIME_TYPES,
  DEFAULT_DELIVERY_FORMAT_ORDER,
  DELIVERY_ACCESS_MODE,
  POLICY_LIMITS,
  IMAGE_ROLE_PRESETS,
  normalizeTenantKey,
  buildImageObjectPrefix,
  buildVariantObjectKey,
  buildImageUploadPlan,
  createAssetId,
  isSupportedInputMimeType,
};
