export const PIVOT_DROP_DAY_OPTIONS = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
];

export function tenantToDropFormFields(tenant) {
  return {
    pivotDropTimezone: tenant?.pivotDropTimezone || 'America/New_York',
    pivotDropDayOfWeek:
      tenant?.pivotDropDayOfWeek !== undefined && tenant?.pivotDropDayOfWeek !== null
        ? String(tenant.pivotDropDayOfWeek)
        : '4',
    pivotDropHour:
      tenant?.pivotDropHour !== undefined && tenant?.pivotDropHour !== null
        ? String(tenant.pivotDropHour)
        : '18',
    pivotDropMinute:
      tenant?.pivotDropMinute !== undefined && tenant?.pivotDropMinute !== null
        ? String(tenant.pivotDropMinute)
        : '0',
    pivotDropOverrides: Array.isArray(tenant?.pivotDropOverrides)
      ? tenant.pivotDropOverrides.map((row) => ({
          batchWeek: row.batchWeek || '',
          dayOfWeek: String(row.dayOfWeek ?? 4),
          hour: String(row.hour ?? 18),
          minute: String(row.minute ?? 0),
        }))
      : [],
  };
}

export function buildTenantDropConfigPayload(form, batchWeek) {
  return {
    batchWeek,
    pivotDropTimezone: form.pivotDropTimezone.trim(),
    pivotDropDayOfWeek: Number(form.pivotDropDayOfWeek),
    pivotDropHour: Number(form.pivotDropHour),
    pivotDropMinute: Number(form.pivotDropMinute),
    pivotDropOverrides: (form.pivotDropOverrides || [])
      .filter((row) => row.batchWeek?.trim())
      .map((row) => ({
        batchWeek: row.batchWeek.trim().toUpperCase(),
        dayOfWeek: Number(row.dayOfWeek),
        hour: Number(row.hour),
        minute: Number(row.minute),
      })),
  };
}

export function mergeTenantMetadataPayload(basePayload, form, { includeDropConfig = false } = {}) {
  if (!includeDropConfig) {
    return basePayload;
  }

  return {
    ...basePayload,
    pivotDropTimezone: form.pivotDropTimezone.trim(),
    pivotDropDayOfWeek: Number(form.pivotDropDayOfWeek),
    pivotDropHour: Number(form.pivotDropHour),
    pivotDropMinute: Number(form.pivotDropMinute),
    pivotDropOverrides: (form.pivotDropOverrides || [])
      .filter((row) => row.batchWeek?.trim())
      .map((row) => ({
        batchWeek: row.batchWeek.trim().toUpperCase(),
        dayOfWeek: Number(row.dayOfWeek),
        hour: Number(row.hour),
        minute: Number(row.minute),
      })),
  };
}
