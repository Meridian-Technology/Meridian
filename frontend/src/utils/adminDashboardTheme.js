/**
 * Platform-admin / Pivot dashboard appearance preference.
 *
 * Scoped to those shells only (via `data-admin-dashboard-theme` + CSS). Stored
 * locally so it does not need a profile API field; the Account Settings control
 * is shown only to platform admins.
 */

export const ADMIN_DASHBOARD_THEME_KEY = 'meridian.admin.dashboardTheme';
export const ADMIN_DASHBOARD_THEME_EVENT = 'meridian:admin-dashboard-theme';

export function isPlatformAdminUser(user) {
  const roles = user?.platformRoles || [];
  return roles.includes('platform_admin') || roles.includes('root');
}

export function readAdminDashboardTheme() {
  try {
    const stored = localStorage.getItem(ADMIN_DASHBOARD_THEME_KEY);
    if (stored === 'dark' || stored === 'light') return stored;
  } catch {
    /* private mode / blocked storage */
  }
  return 'light';
}

export function applyAdminDashboardTheme(theme) {
  const next = theme === 'dark' ? 'dark' : 'light';
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-admin-dashboard-theme', next);
  }
  return next;
}

export function writeAdminDashboardTheme(theme) {
  const next = applyAdminDashboardTheme(theme);
  try {
    localStorage.setItem(ADMIN_DASHBOARD_THEME_KEY, next);
  } catch {
    /* ignore */
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(ADMIN_DASHBOARD_THEME_EVENT, { detail: { theme: next } }),
    );
  }
  return next;
}

export function clearAdminDashboardThemeAttribute() {
  if (typeof document === 'undefined') return;
  document.documentElement.removeAttribute('data-admin-dashboard-theme');
}
