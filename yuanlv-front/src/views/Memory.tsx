import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import {
  Award,
  Calendar,
  ChevronDown,
  ChevronRight,
  Image as ImageIcon,
  Lock,
  LogOut,
  Map as MapIcon,
  MessageCircleMore,
  Search,
  Send,
  Settings,
  Sparkles,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useAuth } from "../context/AuthContext";
import { useAppAppearance } from "../context/AppAppearanceContext";
import { bottleApi } from "../api/bottle";
import { capsuleApi } from "../api/capsule";
import { memoryApi } from "../api/memory";
import { userApi } from "../api/user";
import type {
  BottleMineItem,
  CapsuleMineItem,
  MemoryCalendarDay,
  MemoryNotification,
  MemoryOverviewResponse,
  MemoryRecord,
  MemorySearchResult,
  UserSettingsData,
  UserProfile,
} from "../api/types";
import {
  CAPSULE_ICON_OPTIONS,
  CapsuleIconPreview,
  CapsuleIconSymbol,
  DEFAULT_USER_SETTINGS,
  getMemoryThemePalette,
  MEMORY_THEME_OPTIONS,
  resolveUserSettings,
  ThemePreviewMark,
} from "../lib/memoryPersonalization";

const TIMELINE_COLLAPSED_KEY_PREFIX = "yuanlv-memory-timeline-collapsed";

function summarizeCapsules(items: CapsuleMineItem[]) {
  return {
    created: items.filter((item) => item.role === "creator").length,
    found: items.filter((item) => item.role === "finder").length,
    echoing: items.filter((item) => (item.echo_count || 0) > 0).length,
  };
}

function summarizeBottles(items: BottleMineItem[]) {
  return {
    thrown: items.filter((item) => item.role === "sender").length,
    received: items.filter((item) => item.role === "receiver").length,
    drifting: items.filter((item) => item.role === "sender" && item.status === "drifting").length,
  };
}

function isBrowser() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function timelineCollapsedStorageKey(userId: string) {
  return `${TIMELINE_COLLAPSED_KEY_PREFIX}-${userId}`;
}

function readTimelineCollapsed(userId?: string, fallback = false) {
  if (!userId || !isBrowser()) return fallback;
  const raw = window.localStorage.getItem(timelineCollapsedStorageKey(userId));
  if (raw == null) return fallback;
  return raw === "1";
}

function writeTimelineCollapsed(userId: string, collapsed: boolean) {
  if (!isBrowser()) return;
  window.localStorage.setItem(timelineCollapsedStorageKey(userId), collapsed ? "1" : "0");
}

function firstOfMonth(source: Date) {
  return new Date(source.getFullYear(), source.getMonth(), 1);
}

function shiftMonth(source: Date, offset: number) {
  return new Date(source.getFullYear(), source.getMonth() + offset, 1);
}

function toDateKey(source: Date) {
  const year = source.getFullYear();
  const month = String(source.getMonth() + 1).padStart(2, "0");
  const day = String(source.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateKey(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

function toMonthKey(source: Date) {
  const year = source.getFullYear();
  const month = String(source.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function formatShortDate(value: string | null | undefined) {
  if (!value) return "全部";
  const [year, month, day] = value.split("-");
  return `${year}/${month}/${day}`;
}

function formatRangeLabel(dateFrom: string | null, dateTo: string | null) {
  if (!dateFrom || !dateTo) return "全部";
  if (dateFrom === dateTo) return formatShortDate(dateFrom);
  return `${formatShortDate(dateFrom)} - ${formatShortDate(dateTo)}`;
}

function buildCalendarCells(month: Date) {
  const firstDay = firstOfMonth(month);
  const startOffset = firstDay.getDay();
  const gridStart = new Date(firstDay);
  gridStart.setDate(firstDay.getDate() - startOffset);

  return Array.from({ length: 42 }).map((_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    return {
      date,
      dateKey: toDateKey(date),
      inCurrentMonth: date.getMonth() === month.getMonth(),
    };
  });
}

function normalizeRange(start: string | null, end: string | null) {
  if (!start && !end) return { start: null, end: null };
  if (start && !end) return { start, end: start };
  if (!start && end) return { start: end, end };
  if ((start || "") <= (end || "")) return { start, end };
  return { start: end, end: start };
}

function isDateInRange(dateKey: string, start: string | null, end: string | null) {
  if (!start) return false;
  const normalized = normalizeRange(start, end);
  return dateKey >= (normalized.start || "") && dateKey <= (normalized.end || normalized.start || "");
}

export function Memory() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { applySettings } = useAppAppearance();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [baseTimeline, setBaseTimeline] = useState<MemoryRecord[]>([]);
  const [timeline, setTimeline] = useState<MemoryRecord[]>([]);
  const [notifications, setNotifications] = useState<MemoryNotification[]>([]);
  const [historyReady, setHistoryReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [pageError, setPageError] = useState("");

  const [searchInput, setSearchInput] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<MemorySearchResult[]>([]);
  const [searchHasHistory, setSearchHasHistory] = useState(false);

  const [collectionLoading, setCollectionLoading] = useState(true);
  const [capsuleSummary, setCapsuleSummary] = useState({ created: 0, found: 0, echoing: 0 });
  const [bottleSummary, setBottleSummary] = useState({ thrown: 0, received: 0, drifting: 0 });
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsNotice, setSettingsNotice] = useState("");
  const [settings, setSettings] = useState<UserSettingsData>(DEFAULT_USER_SETTINGS);
  const [settingsDraft, setSettingsDraft] = useState<UserSettingsData>(DEFAULT_USER_SETTINGS);

  const [timelineCollapsed, setTimelineCollapsed] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => firstOfMonth(new Date()));
  const [calendarCache, setCalendarCache] = useState<Record<string, MemoryCalendarDay[]>>({});
  const [timelineDateFrom, setTimelineDateFrom] = useState<string | null>(null);
  const [timelineDateTo, setTimelineDateTo] = useState<string | null>(null);
  const [calendarDraftStart, setCalendarDraftStart] = useState<string | null>(null);
  const [calendarDraftEnd, setCalendarDraftEnd] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    setSettingsLoading(true);
    setSettings(resolveUserSettings({ ...DEFAULT_USER_SETTINGS, user_id: Number(user.id) }));
    setSettingsDraft(resolveUserSettings({ ...DEFAULT_USER_SETTINGS, user_id: Number(user.id) }));
    setTimelineCollapsed(false);
    setCalendarLoading(false);
    setCalendarCache({});
    setTimelineDateFrom(null);
    setTimelineDateTo(null);
    setCalendarDraftStart(null);
    setCalendarDraftEnd(null);
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;

    userApi
      .getSettings(user.id)
      .then((response) => {
        if (cancelled) return;
        const resolved = resolveUserSettings(response);
        setSettings(resolved);
        setSettingsDraft(resolved);
        setTimelineCollapsed(readTimelineCollapsed(user.id, resolved.timeline_default_collapsed));
      })
      .catch((error) => {
        if (cancelled) return;
        setPageError(error instanceof Error ? error.message : "个性化设置加载失败。");
        const fallback = resolveUserSettings({ ...DEFAULT_USER_SETTINGS, user_id: Number(user.id) });
        setSettings(fallback);
        setSettingsDraft(fallback);
        setTimelineCollapsed(readTimelineCollapsed(user.id, fallback.timeline_default_collapsed));
      })
      .finally(() => {
        if (!cancelled) setSettingsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;

    setLoading(true);
    setPageError("");
    memoryApi
      .getOverview(user.id, 50, 12)
      .then((overview: MemoryOverviewResponse) => {
        if (cancelled) return;
        const mappedTimeline = memoryApi.mapTimeline(overview);
        setProfile(memoryApi.mapProfile(overview));
        setBaseTimeline(mappedTimeline);
        setNotifications(overview.notifications || []);
        setHistoryReady(overview.history_ready);
      })
      .catch((error) => {
        if (!cancelled) {
          setPageError(error instanceof Error ? error.message : "记忆页加载失败。");
          setProfile(null);
          setBaseTimeline([]);
          setTimeline([]);
          setNotifications([]);
          setHistoryReady(false);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    setCollectionLoading(true);

    Promise.all([capsuleApi.getMine(user.id, "all"), bottleApi.getMine(user.id, "all")])
      .then(([capsuleRes, bottleRes]) => {
        if (cancelled) return;
        setCapsuleSummary(summarizeCapsules(capsuleRes.items || []));
        setBottleSummary(summarizeBottles(bottleRes.items || []));
      })
      .catch(() => {
        if (cancelled) return;
        setCapsuleSummary({ created: 0, found: 0, echoing: 0 });
        setBottleSummary({ thrown: 0, received: 0, drifting: 0 });
      })
      .finally(() => {
        if (!cancelled) setCollectionLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;

    if (!timelineDateFrom || !timelineDateTo) {
      setTimeline(baseTimeline);
      return;
    }

    let cancelled = false;
    setTimelineLoading(true);
    memoryApi
      .getTimelineByRange(user.id, timelineDateFrom, timelineDateTo, 300)
      .then((items) => {
        if (!cancelled) {
          setTimeline(items);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setPageError(error instanceof Error ? error.message : "记忆阶段加载失败。");
          setTimeline([]);
        }
      })
      .finally(() => {
        if (!cancelled) setTimelineLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [baseTimeline, timelineDateFrom, timelineDateTo, user?.id]);

  useEffect(() => {
    if (!user?.id || !calendarOpen) {
      setCalendarLoading(false);
      return;
    }
    const monthKey = toMonthKey(calendarMonth);
    if (calendarCache[monthKey]) {
      setCalendarLoading(false);
      return;
    }

    let cancelled = false;
    setCalendarLoading(true);
    memoryApi
      .getCalendarMonth(user.id, monthKey)
      .then((payload) => {
        if (!cancelled) {
          setCalendarCache((current) => ({
            ...current,
            [payload.month]: payload.days || [],
          }));
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setPageError(error instanceof Error ? error.message : "日历阶段加载失败。");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setCalendarLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [calendarCache, calendarMonth, calendarOpen, user?.id]);

  const joinYear = useMemo(() => {
    const raw = profile?.joinDate || user?.createdAt;
    return raw ? new Date(raw).getFullYear() : new Date().getFullYear();
  }, [profile?.joinDate, user?.createdAt]);

  const stats = profile?.stats ?? { journeys: 0, days: 0, memories: 0 };
  const displayName = profile?.name || user?.name || "旅人";
  const avatarUrl = profile?.avatar || "";
  const activeTheme = useMemo(() => getMemoryThemePalette(settings.memory_theme), [settings.memory_theme]);
  const memorySignature = settings.memory_signature?.trim() || profile?.bio || "把途中的风与光，慢慢收进自己的藏馆。";

  const displayedTimelineLoading = loading || timelineLoading;
  const hasTimelineRange = Boolean(timelineDateFrom && timelineDateTo);
  const timelineStageLabel = useMemo(
    () => formatRangeLabel(timelineDateFrom, timelineDateTo),
    [timelineDateFrom, timelineDateTo]
  );
  const currentCalendarMonthKey = useMemo(() => toMonthKey(calendarMonth), [calendarMonth]);
  const currentCalendarDays = useMemo(
    () => calendarCache[currentCalendarMonthKey] || [],
    [calendarCache, currentCalendarMonthKey]
  );
  const currentCalendarMarkedDays = currentCalendarDays.length;
  const calendarDayMap = useMemo<Map<string, number>>(
    () => new Map(currentCalendarDays.map((item) => [item.date, item.travel_count])),
    [currentCalendarDays]
  );
  const calendarCells = useMemo(() => buildCalendarCells(calendarMonth), [calendarMonth]);

  const handleSearch = async () => {
    if (!user?.id || !searchInput.trim()) return;
    setSearching(true);
    setPageError("");
    try {
      const result = await memoryApi.searchHistory(user.id, searchInput.trim());
      setSearchResults(result.items || []);
      setSearchHasHistory(result.has_history);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "记忆检索失败。");
      setSearchResults([]);
      setSearchHasHistory(false);
    } finally {
      setSearching(false);
    }
  };

  const handleTimelineCollapse = () => {
    if (!user?.id) return;
    const next = !timelineCollapsed;
    setTimelineCollapsed(next);
    writeTimelineCollapsed(user.id, next);
  };

  const handleOpenSettings = () => {
    setSettingsDraft(settings);
    setSettingsNotice("");
    setSettingsOpen(true);
  };

  const handleSaveSettings = async () => {
    if (!user?.id) return;
    setSettingsSaving(true);
    setSettingsNotice("");
    try {
      const saved = resolveUserSettings(
        await userApi.updateSettings(user.id, {
          memory_theme: settingsDraft.memory_theme,
          capsule_icon: settingsDraft.capsule_icon,
          memory_signature: settingsDraft.memory_signature?.trim() || "",
          timeline_default_collapsed: settingsDraft.timeline_default_collapsed,
        })
      );
      setSettings(saved);
      setSettingsDraft(saved);
      applySettings(saved);
      writeTimelineCollapsed(user.id, saved.timeline_default_collapsed);
      setTimelineCollapsed(saved.timeline_default_collapsed);
      setSettingsNotice("已经把这页记忆整理成你喜欢的样子了。");
      setTimeout(() => {
        setSettingsOpen(false);
      }, 520);
    } catch (error) {
      setSettingsNotice(error instanceof Error ? error.message : "设置保存失败。");
    } finally {
      setSettingsSaving(false);
    }
  };

  const openCalendarModal = () => {
    const initial = timelineDateFrom || timelineDateTo;
    setCalendarDraftStart(timelineDateFrom);
    setCalendarDraftEnd(timelineDateTo);
    setCalendarMonth(firstOfMonth(initial ? parseDateKey(initial) : new Date()));
    setCalendarOpen(true);
  };

  const handleCalendarDayClick = (dateKey: string, enabled: boolean) => {
    if (!enabled) return;

    if (!calendarDraftStart || (calendarDraftStart && calendarDraftEnd)) {
      setCalendarDraftStart(dateKey);
      setCalendarDraftEnd(null);
      return;
    }

    if (dateKey < calendarDraftStart) {
      setCalendarDraftStart(dateKey);
      setCalendarDraftEnd(calendarDraftStart);
      return;
    }

    setCalendarDraftEnd(dateKey);
  };

  const handleApplyCalendarRange = () => {
    const normalized = normalizeRange(calendarDraftStart, calendarDraftEnd);
    if (!normalized.start || !normalized.end) return;
    setTimelineDateFrom(normalized.start);
    setTimelineDateTo(normalized.end);
    setCalendarOpen(false);
  };

  const handleClearCalendarDraft = () => {
    setCalendarDraftStart(null);
    setCalendarDraftEnd(null);
  };

  const handleResetTimelineRange = () => {
    setTimelineDateFrom(null);
    setTimelineDateTo(null);
    setCalendarDraftStart(null);
    setCalendarDraftEnd(null);
    setCalendarOpen(false);
  };

  return (
    <div
      className="min-h-full pb-32"
      style={{ fontFamily: "'Noto Serif SC', serif", background: activeTheme.pageBackground }}
    >
      <div className="relative overflow-hidden">
        <div className="absolute inset-0" style={{ background: activeTheme.heroGradient }} />

        <div className="relative px-5 pb-6 pt-12">
          <div className="mb-5 flex items-start justify-between">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="relative"
            >
              <div className="relative z-10 overflow-hidden rounded-full border-[3px] border-white/70 shadow-[0_6px_24px_rgba(180,140,100,0.15)]">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Avatar" className="h-[72px] w-[72px] object-cover" />
                ) : (
                  <div
                    className="flex h-[72px] w-[72px] items-center justify-center text-2xl font-medium"
                    style={{
                      background: `linear-gradient(135deg, ${activeTheme.accentSoft} 0%, #ffffff 100%)`,
                      color: activeTheme.accentText,
                    }}
                  >
                    {displayName.charAt(0)}
                  </div>
                )}
              </div>
              <div className="absolute inset-0 rounded-full blur-2xl" style={{ background: activeTheme.accentGlow, opacity: 0.9 }} />
            </motion.div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleOpenSettings}
                className="rounded-full border p-2.5 transition-colors hover:bg-white/90"
                style={{
                  borderColor: activeTheme.borderTint,
                  background: settingsLoading ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.82)",
                  color: activeTheme.accentText,
                }}
                title="个性化设置"
              >
                <Settings size={18} className="stroke-[1.5]" />
              </button>
              <button
                onClick={logout}
                className="rounded-full border border-white/40 bg-white/50 p-2.5 text-stone-400 transition-colors hover:bg-white/70"
                title="退出登录"
              >
                <LogOut size={18} className="stroke-[1.5]" />
              </button>
            </div>
          </div>

          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <h1 className="mb-0.5 text-xl tracking-wider text-stone-800" style={{ fontWeight: 400 }}>
              {displayName}
            </h1>
            <p className="mb-2 text-sm leading-6 text-stone-500">{memorySignature}</p>
            <div className="flex items-center gap-2">
              <p className="text-xs tracking-wide text-stone-400" style={{ fontWeight: 300 }}>
                漫游于 {joinYear} 至今
              </p>
              {profile?.levelName && (
                <span
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px]"
                  style={{ fontFamily: "sans-serif", background: activeTheme.chipBg, color: activeTheme.chipText }}
                >
                  <Award size={10} />
                  {profile.levelName}
                </span>
              )}
              {typeof profile?.points === "number" && (
                <span className="text-[10px] text-stone-400" style={{ fontFamily: "sans-serif" }}>
                  {profile.points} 分
                </span>
              )}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="mt-5 grid grid-cols-4 gap-3"
          >
            <StatBox icon={<MapIcon size={16} />} value={String(stats.journeys)} label="旅途" />
            <StatBox icon={<Calendar size={16} />} value={String(stats.days)} label="日记" />
            <StatBox icon={<ImageIcon size={16} />} value={String(stats.memories)} label="记忆" />
            <StatBox icon={<MessageCircleMore size={16} />} value={String(profile?.unreadNotifications || 0)} label="通知" />
          </motion.div>
        </div>
      </div>

      <div className="space-y-6 px-5">
        {pageError && (
          <div className="rounded-2xl border border-rose-100 bg-rose-50/80 px-4 py-3 text-sm text-rose-500">
            {pageError}
          </div>
        )}

        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg tracking-wider text-stone-800" style={{ fontWeight: 400 }}>
              记忆藏馆
            </h2>
            <span className="text-[10px] tracking-[0.2em] text-stone-400" style={{ fontFamily: "sans-serif" }}>
              COLLECT
            </span>
          </div>

          <div className="mb-4 rounded-2xl border border-white/40 bg-white/55 px-4 py-3 text-sm text-stone-500 backdrop-blur-xl">
            那些被你留在远方、也被远方送回来的东西。
          </div>

          <div className="grid grid-cols-2 gap-3">
            <CollectionEntryCard
              icon={<CapsuleIconSymbol iconKey={settings.capsule_icon} size={18} className="text-indigo-500" />}
              title="胶囊管理"
              subtitle="埋下、找到与收到回响"
              metrics={[
                { label: "我埋下的", value: collectionLoading ? "--" : String(capsuleSummary.created) },
                { label: "我找到的", value: collectionLoading ? "--" : String(capsuleSummary.found) },
                { label: "有回响的", value: collectionLoading ? "--" : String(capsuleSummary.echoing) },
              ]}
              onClick={() => navigate("/memory/capsules")}
            />
            <CollectionEntryCard
              icon={<Send size={18} className="text-sky-500" />}
              title="远洋瓶管理"
              subtitle="漂流出去，也被海风带回"
              metrics={[
                { label: "我扔出的", value: collectionLoading ? "--" : String(bottleSummary.thrown) },
                { label: "我收到的", value: collectionLoading ? "--" : String(bottleSummary.received) },
                { label: "漂流中", value: collectionLoading ? "--" : String(bottleSummary.drifting) },
              ]}
              onClick={() => navigate("/memory/bottles")}
            />
          </div>
        </section>

        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg tracking-wider text-stone-800" style={{ fontWeight: 400 }}>
              记忆检索
            </h2>
            <span className="text-[10px] tracking-[0.2em] text-stone-400" style={{ fontFamily: "sans-serif" }}>
              RAG
            </span>
          </div>

          <div className="rounded-2xl border border-white/40 bg-white/60 p-4 backdrop-blur-xl">
            <div className="flex items-center gap-2 rounded-2xl border border-stone-200 bg-stone-50/80 px-4 py-3">
              <Search size={14} className="text-stone-400" />
              <input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void handleSearch();
                }}
                placeholder="搜索一句旧日心情、地点或片段"
                className="flex-1 bg-transparent text-sm text-stone-700 outline-none"
                style={{ fontFamily: "sans-serif" }}
              />
              <button
                onClick={() => void handleSearch()}
                disabled={searching || !searchInput.trim()}
                className="rounded-full bg-stone-800 px-3 py-1.5 text-[11px] text-white disabled:opacity-60"
                style={{ fontFamily: "sans-serif" }}
              >
                {searching ? "检索中…" : "搜索"}
              </button>
            </div>

            {!historyReady && !loading && (
              <p className="mt-3 text-xs text-stone-400">你还没有足够的历史记忆样本，先多走几段旅途吧。</p>
            )}

            {searchHasHistory && searchResults.length === 0 && !searching && searchInput.trim() && (
              <p className="mt-3 text-xs text-stone-400">有历史记忆，但这次没有找到足够接近的片段。</p>
            )}

            {searchResults.length > 0 && (
              <div className="mt-4 space-y-3">
                {searchResults.map((item, index) => (
                  <motion.button
                    key={`${item.source_type}-${item.source_id}-${index}`}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.04 }}
                    onClick={() => item.travel_id && navigate(`/travel/${item.travel_id}`)}
                    className="w-full rounded-2xl bg-stone-50/80 px-4 py-3 text-left"
                  >
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span className="text-sm text-stone-700">{item.location_name || "旧日片段"}</span>
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] text-amber-600" style={{ fontFamily: "sans-serif" }}>
                        {item.source_type === "diary" ? "日记" : "锚点"}
                      </span>
                      <span className="text-[10px] text-stone-400" style={{ fontFamily: "sans-serif" }}>
                        匹配度 {(item.score * 100).toFixed(0)}%
                      </span>
                    </div>
                    <p className="text-sm leading-6 text-stone-600">{item.summary || "暂无摘要"}</p>
                    {item.emotion_tags.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {item.emotion_tags.slice(0, 3).map((tag) => (
                          <span
                            key={`${item.source_id}-${tag}`}
                            className="rounded-full bg-white px-2 py-1 text-[10px] text-stone-500"
                            style={{ fontFamily: "sans-serif" }}
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </motion.button>
                ))}
              </div>
            )}
          </div>
        </section>

        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg tracking-wider text-stone-800" style={{ fontWeight: 400 }}>
              最新通知
            </h2>
            <span className="text-[10px] tracking-[0.2em] text-stone-400" style={{ fontFamily: "sans-serif" }}>
              REPLAY
            </span>
          </div>

          <div className="space-y-3">
            {notifications.slice(0, 6).map((item, index) => (
              <motion.button
                key={item.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + index * 0.04 }}
                onClick={() => item.travel_id && navigate(`/travel/${item.travel_id}`)}
                className="w-full rounded-2xl border border-white/40 bg-white/60 px-4 py-4 text-left backdrop-blur-xl"
              >
                <div className="mb-1 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Sparkles size={14} className={item.type === "memory_replay" ? "text-amber-500" : "text-rose-400"} />
                    <span className="text-sm text-stone-700">{item.title}</span>
                  </div>
                  {!item.is_read && (
                    <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] text-rose-500" style={{ fontFamily: "sans-serif" }}>
                      未读
                    </span>
                  )}
                </div>
                <p className="text-sm leading-6 text-stone-500">{item.content}</p>
                <p className="mt-2 text-[11px] text-stone-400" style={{ fontFamily: "sans-serif" }}>
                  {new Date(item.created_at).toLocaleString("zh-CN")}
                </p>
              </motion.button>
            ))}

            {!loading && notifications.length === 0 && (
              <div className="rounded-2xl border border-white/40 bg-white/60 px-4 py-5 text-sm text-stone-400 backdrop-blur-xl">
                还没有新的通知，等下一段旅途写完、下一次周年来到时，这里会亮起来。
              </div>
            )}
          </div>
        </section>

        <section>
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg tracking-wider text-stone-800" style={{ fontWeight: 400 }}>
                记忆轨迹
              </h2>
              <p className="mt-1 text-[11px] text-stone-400" style={{ fontFamily: "sans-serif" }}>
                {timelineStageLabel} · {displayedTimelineLoading ? "正在整理…" : `共 ${timeline.length} 段旅途`}
              </p>
              {hasTimelineRange && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span
                    className="inline-flex items-center rounded-full px-2.5 py-1 text-[10px]"
                    style={{ fontFamily: "sans-serif", background: activeTheme.chipBg, color: activeTheme.chipText }}
                  >
                    已显示 {timelineStageLabel}
                  </span>
                  <button
                    onClick={handleResetTimelineRange}
                    className="text-[11px] text-stone-400 underline decoration-stone-300 underline-offset-4"
                    style={{ fontFamily: "sans-serif" }}
                  >
                    查看全部
                  </button>
                </div>
              )}
            </div>

            <div className="flex shrink-0 gap-2">
              <button
                onClick={openCalendarModal}
                className="inline-flex items-center gap-1 rounded-full px-3 py-2 text-[11px] shadow-sm"
                style={{ fontFamily: "sans-serif", background: "rgba(255,255,255,0.85)", color: activeTheme.accentText }}
              >
                <Calendar size={12} />
                显示阶段
              </button>
              <button
                onClick={handleTimelineCollapse}
                className="inline-flex items-center gap-1 rounded-full px-3 py-2 text-[11px] shadow-sm"
                style={{ fontFamily: "sans-serif", background: "rgba(255,255,255,0.85)", color: activeTheme.accentText }}
              >
                {timelineCollapsed ? "展开" : "收起"}
                <ChevronDown size={12} className={`transition-transform ${timelineCollapsed ? "-rotate-90" : ""}`} />
              </button>
            </div>
          </div>

          {timelineCollapsed ? (
            <div className="rounded-[1.8rem] border border-white/40 bg-white/60 px-4 py-4 text-sm text-stone-500 backdrop-blur-xl">
              当前显示 <span className="text-stone-700">{timelineStageLabel}</span>
              <span className="mx-2 text-stone-300">·</span>
              {displayedTimelineLoading ? "正在整理这一段旅程…" : `共 ${timeline.length} 段旅途`}
              {hasTimelineRange && (
                <button
                  onClick={handleResetTimelineRange}
                  className="ml-3 text-[11px] underline underline-offset-4"
                  style={{ fontFamily: "sans-serif", color: activeTheme.accentText, textDecorationColor: activeTheme.accentSoft }}
                >
                  查看全部
                </button>
              )}
            </div>
          ) : displayedTimelineLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-stone-300 border-t-amber-500" />
            </div>
          ) : timeline.length > 0 ? (
            <div className="relative flex flex-col gap-4 border-l border-stone-200/50 pl-4">
              {timeline.map((item, idx) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2 + idx * 0.05 }}
                >
                  <TimelineItem
                    item={item}
                    active={idx === 0}
                    onClick={() => {
                      if (item.travelId) navigate(`/travel/${item.travelId}`);
                    }}
                  />
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16">
              <MapIcon size={32} className="mb-3 text-stone-300" />
              <p className="text-center text-sm text-stone-400">
                {timelineDateFrom && timelineDateTo ? "这一阶段还没有旅途记录" : "还没有旅途记录"}
              </p>
              <p className="mt-1 text-center text-xs text-stone-300">
                {timelineDateFrom && timelineDateTo ? "换一个时间段再看看吧" : "开始你的第一段旅程吧"}
              </p>
            </div>
          )}
        </section>
      </div>

      <AnimatePresence>
        {calendarOpen && (
          <TimelineCalendarModal
            month={calendarMonth}
            cells={calendarCells}
            dayCountMap={calendarDayMap}
            loading={calendarLoading}
            markedDays={currentCalendarMarkedDays}
            draftStart={calendarDraftStart}
            draftEnd={calendarDraftEnd}
            onClose={() => setCalendarOpen(false)}
            onPrevMonth={() => setCalendarMonth((current) => shiftMonth(current, -1))}
            onNextMonth={() => setCalendarMonth((current) => shiftMonth(current, 1))}
            onDayClick={handleCalendarDayClick}
            onShowAll={handleResetTimelineRange}
            onClear={handleClearCalendarDraft}
            onApply={handleApplyCalendarRange}
          />
        )}
        {settingsOpen && (
          <MemorySettingsModal
            draft={settingsDraft}
            saving={settingsSaving}
            notice={settingsNotice}
            onClose={() => {
              if (settingsSaving) return;
              setSettingsOpen(false);
            }}
            onChange={(next) => setSettingsDraft((current) => ({ ...current, ...next }))}
            onSave={() => void handleSaveSettings()}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function MemorySettingsModal({
  draft,
  saving,
  notice,
  onClose,
  onChange,
  onSave,
}: {
  draft: UserSettingsData;
  saving: boolean;
  notice: string;
  onClose: () => void;
  onChange: (next: Partial<UserSettingsData>) => void;
  onSave: () => void;
}) {
  const palette = getMemoryThemePalette(draft.memory_theme);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/35 px-5 backdrop-blur-sm"
    >
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.98 }}
        onClick={(event) => event.stopPropagation()}
        className="max-h-[86vh] w-full max-w-xl overflow-y-auto rounded-[2rem] bg-white p-5 shadow-2xl"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg text-stone-800">记忆页个性化</h3>
            <p className="mt-1 text-[11px] text-stone-400" style={{ fontFamily: "sans-serif" }}>
              让这间藏馆更像你留给自己的房间。
            </p>
          </div>
          <button onClick={onClose} disabled={saving} className="text-sm text-stone-400 disabled:opacity-50">
            关闭
          </button>
        </div>

        <div
          className="mb-5 rounded-[1.8rem] px-4 py-4"
          style={{
            background: `linear-gradient(135deg, ${palette.accentSoft} 0%, rgba(255,255,255,0.98) 100%)`,
            border: `1px solid ${palette.borderTint}`,
          }}
        >
          <div className="mb-2 flex items-center gap-2" style={{ color: palette.accentText }}>
            <Sparkles size={14} />
            <span className="text-sm">当前预览</span>
          </div>
          <p className="text-base text-stone-700">
            {draft.memory_signature?.trim() || "把途中的风与光，慢慢收进自己的藏馆。"}
          </p>
          <div className="mt-3 flex items-center gap-3">
            <CapsuleIconPreview iconKey={draft.capsule_icon} active />
            <div className="text-[11px] text-stone-500" style={{ fontFamily: "sans-serif" }}>
              胶囊图标会同步出现在记忆页与胶囊管理页。
            </div>
          </div>
        </div>

        <section className="mb-5">
          <div className="mb-3">
            <h4 className="text-sm text-stone-800">页面主题</h4>
            <p className="mt-1 text-[11px] text-stone-400" style={{ fontFamily: "sans-serif" }}>
              选一种属于你此刻记忆气味的色调。
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {MEMORY_THEME_OPTIONS.map((option) => {
              const active = draft.memory_theme === option.key;
              const optionPalette = getMemoryThemePalette(option.key);
              return (
                <button
                  key={option.key}
                  onClick={() => onChange({ memory_theme: option.key })}
                  className="rounded-[1.4rem] border px-3 py-3 text-left transition-all"
                  style={{
                    borderColor: active ? optionPalette.accent : "rgba(231,229,228,0.9)",
                    boxShadow: active ? `0 10px 24px ${optionPalette.accentGlow}` : "none",
                    background: active ? optionPalette.accentSoft : "rgba(255,255,255,0.75)",
                  }}
                >
                  <ThemePreviewMark themeKey={option.key} />
                  <p className="mt-3 text-sm text-stone-800">{option.name}</p>
                  <p className="mt-1 text-[11px] leading-5 text-stone-500" style={{ fontFamily: "sans-serif" }}>
                    {option.description}
                  </p>
                </button>
              );
            })}
          </div>
        </section>

        <section className="mb-5">
          <div className="mb-3">
            <h4 className="text-sm text-stone-800">胶囊图标</h4>
            <p className="mt-1 text-[11px] text-stone-400" style={{ fontFamily: "sans-serif" }}>
              让你埋下的东西，也带一点自己的审美。
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {CAPSULE_ICON_OPTIONS.map((option) => {
              const active = draft.capsule_icon === option.key;
              return (
                <button
                  key={option.key}
                  onClick={() => onChange({ capsule_icon: option.key })}
                  className="flex items-start gap-3 rounded-[1.4rem] border px-3 py-3 text-left transition-all"
                  style={{
                    borderColor: active ? palette.accent : "rgba(231,229,228,0.9)",
                    background: active ? palette.accentSoft : "rgba(255,255,255,0.78)",
                  }}
                >
                  <CapsuleIconPreview iconKey={option.key} active={active} />
                  <div>
                    <p className="text-sm text-stone-800">{option.name}</p>
                    <p className="mt-1 text-[11px] leading-5 text-stone-500" style={{ fontFamily: "sans-serif" }}>
                      {option.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <section className="mb-5">
          <div className="mb-3">
            <h4 className="text-sm text-stone-800">记忆签名</h4>
            <p className="mt-1 text-[11px] text-stone-400" style={{ fontFamily: "sans-serif" }}>
              会显示在记忆页名字下方，像一条只属于你的副标题。
            </p>
          </div>
          <textarea
            value={draft.memory_signature || ""}
            maxLength={120}
            onChange={(event) => onChange({ memory_signature: event.target.value })}
            rows={3}
            placeholder="比如：把沿途的风景，收成晚一点再读的信。"
            className="w-full rounded-[1.4rem] border border-stone-200 bg-stone-50/70 px-4 py-3 text-sm text-stone-700 outline-none"
            style={{ fontFamily: "'Noto Serif SC', serif" }}
          />
          <div className="mt-2 text-right text-[11px] text-stone-400" style={{ fontFamily: "sans-serif" }}>
            {(draft.memory_signature || "").length}/120
          </div>
        </section>

        <section className="mb-5 rounded-[1.4rem] border border-stone-200 bg-stone-50/65 px-4 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h4 className="text-sm text-stone-800">默认收起记忆轨迹</h4>
              <p className="mt-1 text-[11px] leading-5 text-stone-400" style={{ fontFamily: "sans-serif" }}>
                打开记忆页时先看到概览，需要时再展开完整旅途轨迹。
              </p>
            </div>
            <button
              type="button"
              onClick={() => onChange({ timeline_default_collapsed: !draft.timeline_default_collapsed })}
              className={`relative h-7 w-12 rounded-full transition-colors ${
                draft.timeline_default_collapsed ? "bg-stone-800" : "bg-stone-300"
              }`}
              aria-pressed={draft.timeline_default_collapsed}
            >
              <span
                className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-transform ${
                  draft.timeline_default_collapsed ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>
        </section>

        {notice && (
          <div
            className="mb-4 rounded-2xl px-4 py-3 text-sm"
            style={{
              background: notice.includes("失败") ? "#FEF2F2" : palette.accentSoft,
              color: notice.includes("失败") ? "#DC2626" : palette.accentText,
            }}
          >
            {notice}
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={onClose}
            disabled={saving}
            className="rounded-full border border-stone-200 px-4 py-2 text-xs text-stone-500 disabled:opacity-50"
            style={{ fontFamily: "sans-serif" }}
          >
            取消
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="ml-auto rounded-full px-5 py-2 text-xs text-white disabled:opacity-60"
            style={{ fontFamily: "sans-serif", background: palette.accent }}
          >
            {saving ? "保存中…" : "保存设置"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function CollectionEntryCard({
  icon,
  title,
  subtitle,
  metrics,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  metrics: Array<{ label: string; value: string }>;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-[1.6rem] border border-white/50 bg-white/70 p-4 text-left shadow-[0_4px_20px_rgba(180,140,100,0.06)] backdrop-blur-xl transition-transform duration-200 active:scale-[0.98]"
    >
      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-stone-50">{icon}</div>
        <div>
          <h3 className="text-sm text-stone-800">{title}</h3>
          <p className="text-[10px] text-stone-400" style={{ fontFamily: "sans-serif" }}>
            {subtitle}
          </p>
        </div>
      </div>

      <div className="space-y-2">
        {metrics.map((metric) => (
          <div key={metric.label} className="flex items-center justify-between rounded-xl bg-stone-50/70 px-3 py-2">
            <span className="text-[11px] text-stone-400" style={{ fontFamily: "sans-serif" }}>
              {metric.label}
            </span>
            <span className="text-sm text-stone-700">{metric.value}</span>
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-1 text-[11px] text-amber-600" style={{ fontFamily: "sans-serif" }}>
        <span>进入管理</span>
        <ChevronRight size={13} />
      </div>
    </button>
  );
}

function StatBox({ icon, value, label }: { icon: ReactNode; value: string; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 rounded-2xl border border-white/40 bg-white/50 p-3.5 backdrop-blur-xl">
      <div className="mb-0.5 text-amber-600/60">{icon}</div>
      <span className="text-lg text-stone-700" style={{ fontWeight: 400 }}>
        {value}
      </span>
      <span className="text-[10px] tracking-widest text-stone-400" style={{ fontFamily: "sans-serif" }}>
        {label}
      </span>
    </div>
  );
}

function TimelineItem({
  item,
  active,
  onClick,
}: {
  item: MemoryRecord;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <div className="group relative cursor-pointer pl-5" onClick={onClick}>
      <div
        className={`absolute left-0 top-4 h-2.5 w-2.5 -translate-x-[calc(50%+0.5px)] rounded-full transition-all duration-300 ${
          active
            ? "bg-amber-400 ring-4 ring-amber-100/80"
            : "bg-stone-300 group-hover:bg-amber-300 group-hover:ring-4 group-hover:ring-amber-50"
        }`}
      />

      <div className="rounded-2xl border border-white/40 bg-white/60 p-4 shadow-[0_2px_12px_rgba(180,140,100,0.04)] transition-all duration-300 group-hover:shadow-[0_4px_20px_rgba(180,140,100,0.08)] backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <span className="text-[11px] tracking-wide text-amber-600/70" style={{ fontFamily: "sans-serif" }}>
            {item.date}
          </span>
          {item.city && (
            <span
              className="rounded-full bg-stone-50 px-1.5 py-0.5 text-[9px] text-stone-400"
              style={{ fontFamily: "sans-serif" }}
            >
              {item.city}
            </span>
          )}
          {item.distance != null && item.distance > 0 && (
            <span className="text-[9px] text-stone-400" style={{ fontFamily: "sans-serif" }}>
              {item.distance.toFixed(1)}km
            </span>
          )}
          {item.replayAvailable && (
            <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[9px] text-emerald-600" style={{ fontFamily: "sans-serif" }}>
              可回放
            </span>
          )}
        </div>

        <div className="mt-2 flex gap-3">
          <div className="flex-1">
            <h3 className="mb-1 text-base tracking-wide text-stone-700">{item.title}</h3>
            <p className="line-clamp-3 text-xs leading-relaxed text-stone-400">{item.desc}</p>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px] text-stone-300" style={{ fontFamily: "sans-serif" }}>
              {item.weatherSummary && <span>{item.weatherSummary}</span>}
              {item.anchorCount != null && <span>{item.anchorCount} 个锚点</span>}
              {item.locationCount != null && <span>{item.locationCount} 个轨迹点</span>}
            </div>
          </div>
          {item.image && (
            <img
              src={item.image}
              alt={item.title}
              className="h-14 w-14 shrink-0 rounded-xl object-cover opacity-85 shadow-sm transition-opacity group-hover:opacity-100"
            />
          )}
        </div>

        <div className="mt-2 flex items-center gap-1 text-stone-300 transition-colors group-hover:text-amber-500/60">
          <span className="text-[10px]" style={{ fontFamily: "sans-serif" }}>
            查看详情
          </span>
          <ChevronRight size={12} />
        </div>
      </div>
    </div>
  );
}

function TimelineCalendarModal({
  month,
  cells,
  dayCountMap,
  loading,
  markedDays,
  draftStart,
  draftEnd,
  onClose,
  onPrevMonth,
  onNextMonth,
  onDayClick,
  onShowAll,
  onClear,
  onApply,
}: {
  month: Date;
  cells: Array<{ date: Date; dateKey: string; inCurrentMonth: boolean }>;
  dayCountMap: Map<string, number>;
  loading: boolean;
  markedDays: number;
  draftStart: string | null;
  draftEnd: string | null;
  onClose: () => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onDayClick: (dateKey: string, enabled: boolean) => void;
  onShowAll: () => void;
  onClear: () => void;
  onApply: () => void;
}) {
  const monthLabel = `${month.getFullYear()} 年 ${month.getMonth() + 1} 月`;
  const normalizedDraft = normalizeRange(draftStart, draftEnd);
  const draftLabel = normalizedDraft.start
    ? formatRangeLabel(normalizedDraft.start, normalizedDraft.end)
    : "还没有选中阶段";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 px-5 backdrop-blur-sm"
    >
      <motion.div
        initial={{ opacity: 0, y: 18, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.98 }}
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-lg rounded-[2rem] bg-white p-5 shadow-2xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg text-stone-800">选择显示阶段</h3>
            <p className="mt-1 text-[11px] text-stone-400" style={{ fontFamily: "sans-serif" }}>
              绿色日期表示这一天有旅行记录
            </p>
          </div>
          <button onClick={onClose} className="text-sm text-stone-400">
            关闭
          </button>
        </div>

        <div className="mb-4 rounded-2xl bg-emerald-50/70 px-4 py-3 text-sm text-emerald-700">
          当前选择：{draftLabel}
        </div>

        <div className="mb-3 flex items-center justify-between">
          <button onClick={onPrevMonth} className="rounded-full bg-stone-100 px-3 py-1.5 text-xs text-stone-600">
            上月
          </button>
          <span className="text-sm text-stone-700">{monthLabel}</span>
          <button onClick={onNextMonth} className="rounded-full bg-stone-100 px-3 py-1.5 text-xs text-stone-600">
            下月
          </button>
        </div>

        <p className="mb-3 text-[11px] text-stone-400" style={{ fontFamily: "sans-serif" }}>
          {loading
            ? "正在翻找这一个月留下的旅行日…"
            : markedDays > 0
              ? `这一个月有 ${markedDays} 个旅行日可以选择`
              : "这一个月还没有旅行记录，换一个月份试试吧"}
        </p>

        <div className="grid grid-cols-7 gap-2 text-center text-[11px] text-stone-400" style={{ fontFamily: "sans-serif" }}>
          {["日", "一", "二", "三", "四", "五", "六"].map((label) => (
            <div key={label} className="py-1">
              {label}
            </div>
          ))}
        </div>

        <div className="mt-2 grid grid-cols-7 gap-2">
          {cells.map((cell) => {
            const travelCount = dayCountMap.get(cell.dateKey) || 0;
            const hasTravel = travelCount > 0;
            const selected = cell.dateKey === normalizedDraft.start || cell.dateKey === normalizedDraft.end;
            const inRange = isDateInRange(cell.dateKey, normalizedDraft.start, normalizedDraft.end);

            const cellClass = selected
              ? "bg-stone-800 text-white border-stone-800"
              : inRange
                ? "bg-amber-100 text-amber-700 border-amber-200"
                : hasTravel
                  ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                  : "bg-white text-stone-300 border-stone-100";

            return (
              <button
                key={cell.dateKey}
                onClick={() => onDayClick(cell.dateKey, cell.inCurrentMonth && hasTravel)}
                disabled={!cell.inCurrentMonth || !hasTravel}
                className={`flex aspect-square flex-col items-center justify-center rounded-2xl border text-xs transition-colors disabled:cursor-default ${cellClass} ${
                  !cell.inCurrentMonth ? "opacity-30" : ""
                }`}
                style={{ fontFamily: "sans-serif" }}
              >
                <span>{cell.date.getDate()}</span>
                {hasTravel && cell.inCurrentMonth && !selected && !inRange && (
                  <span className="mt-0.5 text-[9px] opacity-70">{travelCount}</span>
                )}
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex items-center justify-between text-[11px] text-stone-400" style={{ fontFamily: "sans-serif" }}>
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />
            有旅行的日子
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-amber-200" />
            已选阶段
          </div>
        </div>

        <div className="mt-5 flex gap-2">
          <button
            onClick={onShowAll}
            className="rounded-full border border-stone-200 px-4 py-2 text-xs text-stone-500"
            style={{ fontFamily: "sans-serif" }}
          >
            全部
          </button>
          <button
            onClick={onClear}
            className="rounded-full border border-stone-200 px-4 py-2 text-xs text-stone-500"
            style={{ fontFamily: "sans-serif" }}
          >
            清除
          </button>
          <button
            onClick={onApply}
            disabled={!normalizedDraft.start}
            className="ml-auto rounded-full bg-stone-800 px-5 py-2 text-xs text-white disabled:opacity-60"
            style={{ fontFamily: "sans-serif" }}
          >
            应用阶段
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
