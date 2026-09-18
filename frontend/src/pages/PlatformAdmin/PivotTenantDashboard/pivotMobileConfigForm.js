import { isPivotTenant } from '../TenantManagement/tenantPivotUtils';

export const PIVOT_MOBILE_CONFIG_DEFAULTS = Object.freeze({
  minAppVersion: '1.0.0',
  forceUpdate: false,
  message: 'update to keep going with your crew this week',
});

const APP_VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)$/;

export function mergePivotMobileForm(stored) {
  const message = String(stored?.message || '').trim();
  const minAppVersion = String(stored?.minAppVersion || '').trim();
  return {
    minAppVersion: APP_VERSION_PATTERN.test(minAppVersion)
      ? minAppVersion
      : PIVOT_MOBILE_CONFIG_DEFAULTS.minAppVersion,
    forceUpdate: stored?.forceUpdate === true,
    message: message || PIVOT_MOBILE_CONFIG_DEFAULTS.message,
  };
}

export function validateMobileUpdateForm(form) {
  const minAppVersion = String(form?.minAppVersion || '').trim();
  if (!APP_VERSION_PATTERN.test(minAppVersion)) {
    return { error: 'Minimum version must be semver (e.g. 1.2.0).' };
  }
  const message = String(form?.message || '').trim();
  if (!message || message.length > 240) {
    return { error: 'Gate message must be 1–240 characters.' };
  }
  return { ok: true, value: mergePivotMobileForm({ ...form, minAppVersion, message }) };
}

export function mobileFormsEqual(a, b) {
  return (
    a?.minAppVersion === b?.minAppVersion &&
    Boolean(a?.forceUpdate) === Boolean(b?.forceUpdate) &&
    String(a?.message || '').trim() === String(b?.message || '').trim()
  );
}

export function formSignature(form) {
  const merged = mergePivotMobileForm(form);
  return `${merged.minAppVersion}|${merged.forceUpdate ? '1' : '0'}|${merged.message}`;
}

export function buildMobileConfigPatch(form, existingStored) {
  const validation = validateMobileUpdateForm(form);
  if (validation.error) {
    return { error: validation.error };
  }
  const patch = {
    minAppVersion: validation.value.minAppVersion,
    forceUpdate: validation.value.forceUpdate,
    message: validation.value.message,
  };
  const ios = String(existingStored?.storeUrls?.ios || '').trim();
  const android = String(existingStored?.storeUrls?.android || '').trim();
  if (ios || android) {
    patch.storeUrls = {
      ...(ios ? { ios } : {}),
      ...(android ? { android } : {}),
    };
  }
  return { patch };
}

export function summarizeFleetMobileConfig(tenants = []) {
  const cities = (tenants || [])
    .filter(isPivotTenant)
    .map((tenant) => {
      const stored = tenant.pivotMobileConfig || null;
      const form = mergePivotMobileForm(stored);
      return {
        tenantKey: tenant.tenantKey,
        cityDisplayName: tenant.location || tenant.name || tenant.tenantKey,
        stored,
        form,
        forceUpdate: form.forceUpdate,
        minAppVersion: form.minAppVersion,
      };
    })
    .sort((a, b) =>
      String(a.cityDisplayName).localeCompare(String(b.cityDisplayName), undefined, {
        sensitivity: 'base',
      }),
    );

  const signatures = new Set(cities.map((city) => formSignature(city.form)));
  const mixed = signatures.size > 1;
  const blockingCount = cities.filter((city) => city.forceUpdate).length;
  const seed = cities[0]?.form || mergePivotMobileForm(null);

  return {
    cities,
    mixed,
    blockingCount,
    seed,
  };
}

export function envOverrideLabels(envOverrides = {}) {
  return Object.entries(envOverrides || {})
    .filter(([, value]) => value !== undefined && value !== '')
    .map(([key, value]) => {
      if (key === 'storeUrls' && value && typeof value === 'object') {
        return `storeUrls`;
      }
      return `${key}=${String(value)}`;
    });
}
