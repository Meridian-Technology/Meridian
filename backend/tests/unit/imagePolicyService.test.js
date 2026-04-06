const {
  IMAGE_ENTITY_TYPES,
  IMAGE_ROLE_PRESETS,
  buildImageObjectPrefix,
  buildVariantObjectKey,
  buildImageUploadPlan,
  normalizeTenantKey,
} = require('../../services/imagePolicyService');

describe('imagePolicyService', () => {
  test('normalizes tenant keys and rejects invalid values', () => {
    expect(normalizeTenantKey('RPI')).toBe('rpi');
    expect(() => normalizeTenantKey('')).toThrow('tenantKey is required');
    expect(() => normalizeTenantKey('rpi!')).toThrow('tenantKey must match');
  });

  test('builds deterministic tenant-aware prefix', () => {
    const prefix = buildImageObjectPrefix({
      tenantKey: 'rpi',
      entityType: IMAGE_ENTITY_TYPES.ORG,
      entityId: '65f1a',
      role: 'org_profile',
      assetId: 'asset-123',
      version: 'v2',
      now: new Date('2026-04-01T00:00:00Z'),
    });

    expect(prefix).toBe('v2/tenants/rpi/images/org/65f1a/org_profile/2026/04/asset-123/v2');
  });

  test('builds deterministic variant key', () => {
    const key = buildVariantObjectKey({
      tenantKey: 'tvcog',
      entityType: IMAGE_ENTITY_TYPES.USER,
      entityId: 'abc123',
      role: 'user_avatar',
      assetId: 'asset-xyz',
      version: 'v1',
      variant: 'thumb',
      format: 'webp',
      now: new Date('2026-04-01T00:00:00Z'),
    });

    expect(key).toBe('v2/tenants/tvcog/images/user/abc123/user_avatar/2026/04/asset-xyz/v1/thumb.webp');
  });

  test('builds complete upload plan with all default variants and formats', () => {
    const plan = buildImageUploadPlan({
      tenantKey: 'rpi',
      entityType: IMAGE_ENTITY_TYPES.ORG,
      entityId: 'org1',
      role: 'org_profile',
      assetId: 'asset-1',
      now: new Date('2026-04-01T00:00:00Z'),
    });

    const variantCount = Object.keys(IMAGE_ROLE_PRESETS.org_profile.variants).length;
    expect(plan.entries).toHaveLength(variantCount * 3);
    expect(plan.entries[0].key.startsWith('v2/tenants/rpi/images/org/org1/org_profile/2026/04/asset-1/v1/')).toBe(true);
  });

  test('validates role-to-entity alignment and variant allowlist', () => {
    expect(() => buildImageUploadPlan({
      tenantKey: 'rpi',
      entityType: IMAGE_ENTITY_TYPES.ORG,
      entityId: 'org1',
      role: 'user_avatar',
      assetId: 'asset-2',
    })).toThrow('requires entityType user');

    expect(() => buildImageUploadPlan({
      tenantKey: 'rpi',
      entityType: IMAGE_ENTITY_TYPES.ORG,
      entityId: 'org1',
      role: 'org_profile',
      assetId: 'asset-3',
      variants: ['invalid_variant'],
    })).toThrow('Unsupported variant');
  });
});
