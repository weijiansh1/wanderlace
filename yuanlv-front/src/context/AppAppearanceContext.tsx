import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { userApi } from "../api/user";
import type { UserSettingsData } from "../api/types";
import {
  DEFAULT_USER_SETTINGS,
  getMemoryThemePalette,
  resolveUserSettings,
} from "../lib/memoryPersonalization";
import { useAuth } from "./AuthContext";

type ThemePalette = ReturnType<typeof getMemoryThemePalette>;

interface AppAppearanceContextValue {
  settings: UserSettingsData;
  palette: ThemePalette;
  loading: boolean;
  applySettings: (next: UserSettingsData) => void;
  refreshSettings: () => Promise<void>;
}

const AppAppearanceContext = createContext<AppAppearanceContextValue | null>(null);

export function AppAppearanceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [settings, setSettings] = useState<UserSettingsData>(DEFAULT_USER_SETTINGS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) {
      setSettings(DEFAULT_USER_SETTINGS);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const fallback = resolveUserSettings({ ...DEFAULT_USER_SETTINGS, user_id: Number(user.id) });

    setLoading(true);
    setSettings(fallback);

    void userApi
      .getSettings(user.id)
      .then((response) => {
        if (!cancelled) {
          setSettings(resolveUserSettings(response));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSettings(fallback);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const palette = useMemo(() => getMemoryThemePalette(settings.memory_theme), [settings.memory_theme]);

  const value = useMemo<AppAppearanceContextValue>(
    () => ({
      settings,
      palette,
      loading,
      applySettings: (next) => setSettings(resolveUserSettings(next)),
      refreshSettings: async () => {
        if (!user?.id) return;
        const response = await userApi.getSettings(user.id);
        setSettings(resolveUserSettings(response));
      },
    }),
    [loading, palette, settings, user?.id]
  );

  return <AppAppearanceContext.Provider value={value}>{children}</AppAppearanceContext.Provider>;
}

export function useAppAppearance() {
  const context = useContext(AppAppearanceContext);
  if (!context) {
    throw new Error("useAppAppearance must be used within AppAppearanceProvider");
  }
  return context;
}
