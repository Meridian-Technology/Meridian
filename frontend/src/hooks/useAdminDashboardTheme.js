import { useCallback, useEffect, useState } from 'react';
import useAuth from './useAuth';
import {
  ADMIN_DASHBOARD_THEME_EVENT,
  ADMIN_DASHBOARD_THEME_KEY,
  applyAdminDashboardTheme,
  clearAdminDashboardThemeAttribute,
  isPlatformAdminUser,
  readAdminDashboardTheme,
  writeAdminDashboardTheme,
} from '../utils/adminDashboardTheme';

/**
 * Platform-admin dashboard light/dark preference.
 *
 * Syncs `data-admin-dashboard-theme` on <html> so portal popups (discovery
 * console, etc.) can inherit the same tokens while the preference stays off
 * for everyone who is not a platform admin.
 */
function useAdminDashboardTheme() {
  const { user } = useAuth();
  const isAdmin = isPlatformAdminUser(user);
  const [theme, setThemeState] = useState(readAdminDashboardTheme);
  const isDark = theme === 'dark';

  useEffect(() => {
    if (!isAdmin) {
      clearAdminDashboardThemeAttribute();
      return undefined;
    }

    applyAdminDashboardTheme(theme);

    const onCustom = (event) => {
      const next = event?.detail?.theme;
      if (next === 'dark' || next === 'light') {
        setThemeState(next);
        applyAdminDashboardTheme(next);
      }
    };

    const onStorage = (event) => {
      if (event.key !== ADMIN_DASHBOARD_THEME_KEY) return;
      const next = event.newValue === 'dark' ? 'dark' : 'light';
      setThemeState(next);
      applyAdminDashboardTheme(next);
    };

    window.addEventListener(ADMIN_DASHBOARD_THEME_EVENT, onCustom);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(ADMIN_DASHBOARD_THEME_EVENT, onCustom);
      window.removeEventListener('storage', onStorage);
    };
  }, [isAdmin, theme]);

  const setTheme = useCallback(
    (next) => {
      if (!isAdmin) return;
      const resolved = writeAdminDashboardTheme(next);
      setThemeState(resolved);
    },
    [isAdmin],
  );

  const toggleTheme = useCallback(() => {
    setTheme(isDark ? 'light' : 'dark');
  }, [isDark, setTheme]);

  return {
    theme,
    setTheme,
    toggleTheme,
    isDark: isAdmin && isDark,
    isAdmin,
  };
}

export default useAdminDashboardTheme;
