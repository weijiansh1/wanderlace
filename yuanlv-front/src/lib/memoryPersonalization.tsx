import { Leaf, Lock, Sparkles, type LucideProps } from "lucide-react";
import type { CapsuleIconKey, MemoryThemeKey, UserSettingsData } from "../api/types";

export const DEFAULT_USER_SETTINGS: UserSettingsData = {
  user_id: 0,
  memory_theme: "dawn",
  capsule_icon: "classic",
  memory_signature: "",
  timeline_default_collapsed: false,
  updated_at: null,
};

export const MEMORY_THEME_OPTIONS: Array<{
  key: MemoryThemeKey;
  name: string;
  description: string;
}> = [
  { key: "dawn", name: "晨曦羊皮纸", description: "暖米色、金色余温，像被阳光晒过的旅行信笺。" },
  { key: "forest", name: "林间回声", description: "浅绿与雾白，适合把记忆安放得更松弛。" },
  { key: "night", name: "夜航蓝调", description: "蓝灰与月光色，像深夜列车窗外的城市。" },
];

export const CAPSULE_ICON_OPTIONS: Array<{
  key: CapsuleIconKey;
  name: string;
  description: string;
}> = [
  { key: "classic", name: "经典锁胶囊", description: "像一枚真正等人开启的旧胶囊。" },
  { key: "spark", name: "流光星屑", description: "更轻、更梦幻，像夜里会发亮的小秘密。" },
  { key: "leaf", name: "森叶书签", description: "适合温柔的埋藏感，像把一句话夹进风里。" },
];

export function resolveUserSettings(settings?: Partial<UserSettingsData> | null): UserSettingsData {
  return {
    ...DEFAULT_USER_SETTINGS,
    ...settings,
    user_id: Number(settings?.user_id || 0),
    memory_theme: (settings?.memory_theme as MemoryThemeKey) || DEFAULT_USER_SETTINGS.memory_theme,
    capsule_icon: (settings?.capsule_icon as CapsuleIconKey) || DEFAULT_USER_SETTINGS.capsule_icon,
    memory_signature: settings?.memory_signature || "",
    timeline_default_collapsed: Boolean(settings?.timeline_default_collapsed),
    updated_at: settings?.updated_at ?? null,
  };
}

export function getMemoryThemePalette(themeKey: MemoryThemeKey) {
  if (themeKey === "forest") {
    return {
      pageBackground: "#F4F8F2",
      heroGradient: "linear-gradient(180deg, rgba(219,239,223,0.82) 0%, rgba(248,250,246,0.28) 56%, rgba(244,248,242,0) 100%)",
      accent: "#2D6A4F",
      accentSoft: "#E5F3EA",
      accentText: "#25563F",
      accentGlow: "rgba(79, 168, 112, 0.28)",
      chipBg: "#EDF8F0",
      chipText: "#2D6A4F",
      borderTint: "rgba(45,106,79,0.12)",
    };
  }
  if (themeKey === "night") {
    return {
      pageBackground: "#F2F5FA",
      heroGradient: "linear-gradient(180deg, rgba(215,225,244,0.88) 0%, rgba(244,247,252,0.32) 58%, rgba(242,245,250,0) 100%)",
      accent: "#3F5F99",
      accentSoft: "#E8EEFA",
      accentText: "#365183",
      accentGlow: "rgba(89, 123, 194, 0.25)",
      chipBg: "#EDF2FF",
      chipText: "#3F5F99",
      borderTint: "rgba(63,95,153,0.12)",
    };
  }
  return {
    pageBackground: "#FBF8F1",
    heroGradient: "linear-gradient(180deg, rgba(252,236,209,0.8) 0%, rgba(252,244,238,0.26) 56%, rgba(251,248,241,0) 100%)",
    accent: "#C78A3B",
    accentSoft: "#FFF3E3",
    accentText: "#A96A1A",
    accentGlow: "rgba(222, 171, 102, 0.28)",
    chipBg: "#FFF7EC",
    chipText: "#C78A3B",
    borderTint: "rgba(199,138,59,0.12)",
  };
}

export function CapsuleIconSymbol({
  iconKey,
  ...props
}: { iconKey: CapsuleIconKey } & LucideProps) {
  const Icon = iconKey === "leaf" ? Leaf : iconKey === "spark" ? Sparkles : Lock;
  return <Icon {...props} />;
}

export function ThemePreviewMark({ themeKey }: { themeKey: MemoryThemeKey }) {
  const palette = getMemoryThemePalette(themeKey);
  return (
    <div
      className="h-10 rounded-2xl"
      style={{
        background: `linear-gradient(135deg, ${palette.accentSoft} 0%, #ffffff 100%)`,
        border: `1px solid ${palette.borderTint}`,
      }}
    />
  );
}

export function CapsuleIconPreview({
  iconKey,
  active,
}: {
  iconKey: CapsuleIconKey;
  active?: boolean;
}) {
  return (
    <div
      className="flex h-11 w-11 items-center justify-center rounded-2xl"
      style={{
        background: active ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.7)",
      }}
    >
      {iconKey === "leaf" ? (
        <Leaf size={18} className="text-emerald-600" />
      ) : iconKey === "spark" ? (
        <Sparkles size={18} className="text-amber-500" />
      ) : (
        <Lock size={18} className="text-indigo-500" />
      )}
    </div>
  );
}
