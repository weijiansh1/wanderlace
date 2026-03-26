import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, Clock, MapPin, MessageCircleMore, Sparkles } from "lucide-react";
import { capsuleApi } from "../api/capsule";
import { userApi } from "../api/user";
import type { CapsuleDetailData, CapsuleMineItem, UserSettingsData } from "../api/types";
import { useAuth } from "../context/AuthContext";
import {
  CapsuleIconSymbol,
  DEFAULT_USER_SETTINGS,
  getMemoryThemePalette,
  resolveUserSettings,
} from "../lib/memoryPersonalization";

type CapsuleFilter = "all" | "created" | "found" | "echoing";

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("zh-CN");
}

function getCapsuleStatusMeta(item: CapsuleMineItem) {
  const isLocked =
    item.is_locked &&
    item.time_lock_until &&
    new Date(item.time_lock_until).getTime() > Date.now();

  if (isLocked) {
    return {
      label: "时间锁中",
      className: "bg-violet-50 text-violet-600",
    };
  }
  if (item.status === "found") {
    return {
      label: "已开启",
      className: "bg-emerald-50 text-emerald-600",
    };
  }
  return {
    label: "等待被发现",
    className: "bg-amber-50 text-amber-600",
  };
}

export function MemoryCapsules() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [items, setItems] = useState<CapsuleMineItem[]>([]);
  const [activeFilter, setActiveFilter] = useState<CapsuleFilter>("all");
  const [selectedItem, setSelectedItem] = useState<CapsuleMineItem | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<CapsuleDetailData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [echoEditorOpen, setEchoEditorOpen] = useState(false);
  const [echoDraft, setEchoDraft] = useState("");
  const [echoSubmitting, setEchoSubmitting] = useState(false);
  const [settings, setSettings] = useState<UserSettingsData>(DEFAULT_USER_SETTINGS);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;

    userApi
      .getSettings(user.id)
      .then((response) => {
        if (!cancelled) {
          setSettings(resolveUserSettings(response));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSettings(resolveUserSettings({ ...DEFAULT_USER_SETTINGS, user_id: Number(user.id) }));
        }
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
    capsuleApi
      .getMine(user.id, "all")
      .then((response) => {
        if (!cancelled) {
          setItems(response.items || []);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setPageError(error instanceof Error ? error.message : "胶囊列表加载失败。");
          setItems([]);
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
    if (!selectedItem || !user?.id) {
      setSelectedDetail(null);
      setDetailLoading(false);
      setEchoEditorOpen(false);
      setEchoDraft("");
      setEchoSubmitting(false);
      return;
    }

    let cancelled = false;
    setDetailLoading(true);
    capsuleApi
      .getDetail(selectedItem.id, user.id)
      .then((detail) => {
        if (!cancelled) {
          setSelectedDetail(detail);
          setEchoEditorOpen(false);
          setEchoDraft("");
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setPageError(error instanceof Error ? error.message : "胶囊详情加载失败。");
          setSelectedDetail(null);
        }
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedItem, user?.id]);

  const summary = useMemo(
    () => ({
      created: items.filter((item) => item.role === "creator").length,
      found: items.filter((item) => item.role === "finder").length,
      echoing: items.filter((item) => (item.echo_count || 0) > 0).length,
    }),
    [items]
  );

  const filteredItems = useMemo(() => {
    switch (activeFilter) {
      case "created":
        return items.filter((item) => item.role === "creator");
      case "found":
        return items.filter((item) => item.role === "finder");
      case "echoing":
        return items.filter((item) => (item.echo_count || 0) > 0);
      default:
        return items;
    }
  }, [activeFilter, items]);

  const activeTheme = useMemo(() => getMemoryThemePalette(settings.memory_theme), [settings.memory_theme]);

  const handleSubmitEcho = async () => {
    if (!selectedItem || !selectedDetail?.can_echo || !user?.id || !echoDraft.trim() || echoSubmitting) return;

    setEchoSubmitting(true);
    setPageError("");
    try {
      await capsuleApi.addEcho(selectedItem.id, echoDraft.trim(), user.id);
      const detail = await capsuleApi.getDetail(selectedItem.id, user.id);
      setSelectedDetail(detail);
      setItems((current) =>
        current.map((item) =>
          String(item.id) === String(selectedItem.id)
            ? {
                ...item,
                echo_count: Math.max(item.echo_count || 0, detail.echo_count || 0),
              }
            : item
        )
      );
      setEchoDraft("");
      setEchoEditorOpen(false);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "留下回响失败。");
    } finally {
      setEchoSubmitting(false);
    }
  };

  return (
    <div
      className="min-h-full pb-32"
      style={{ fontFamily: "'Noto Serif SC', serif", background: activeTheme.pageBackground }}
    >
      <div className="px-5 pb-5 pt-12" style={{ background: activeTheme.heroGradient }}>
        <button
          onClick={() => navigate("/memory")}
          className="mb-4 flex items-center gap-2 text-sm text-stone-500"
        >
          <ArrowLeft size={18} />
          返回记忆
        </button>

        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl tracking-wider text-stone-800">胶囊管理</h1>
            <p className="mt-2 text-sm leading-6 text-stone-500">
              管理你埋下、找到，以及收到回响的时空胶囊。
            </p>
          </div>
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/85 shadow-sm">
            <CapsuleIconSymbol iconKey={settings.capsule_icon} size={20} className="text-indigo-500" />
          </div>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-3">
          <SummaryBox label="我埋下的" value={loading ? "--" : String(summary.created)} />
          <SummaryBox label="我找到的" value={loading ? "--" : String(summary.found)} />
          <SummaryBox label="有回响的" value={loading ? "--" : String(summary.echoing)} />
        </div>
      </div>

      <div className="space-y-5 px-5">
        {pageError && (
          <div className="rounded-2xl border border-rose-100 bg-rose-50/80 px-4 py-3 text-sm text-rose-500">
            {pageError}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <FilterChip label="全部" active={activeFilter === "all"} onClick={() => setActiveFilter("all")} />
          <FilterChip label="我埋下的" active={activeFilter === "created"} onClick={() => setActiveFilter("created")} />
          <FilterChip label="我找到的" active={activeFilter === "found"} onClick={() => setActiveFilter("found")} />
          <FilterChip label="有回响的" active={activeFilter === "echoing"} onClick={() => setActiveFilter("echoing")} />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-stone-300 border-t-indigo-500" />
          </div>
        ) : filteredItems.length === 0 ? (
          <EmptyState
            iconKey={settings.capsule_icon}
            title="这里还没有胶囊"
            subtitle="等你埋下一枚，或在旅途中找到一枚之后，这里会开始发亮。"
          />
        ) : (
          <div className="space-y-3">
            {filteredItems.map((item, index) => {
              const statusMeta = getCapsuleStatusMeta(item);
              return (
                <motion.button
                  key={item.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.04 }}
                  onClick={() => setSelectedItem(item)}
                  className="w-full rounded-[1.8rem] border border-white/50 bg-white/70 p-4 text-left shadow-[0_4px_20px_rgba(180,140,100,0.06)] backdrop-blur-xl"
                >
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-[10px] ${statusMeta.className}`} style={{ fontFamily: "sans-serif" }}>
                      {statusMeta.label}
                    </span>
                    <span className="rounded-full bg-stone-100 px-2.5 py-1 text-[10px] text-stone-500" style={{ fontFamily: "sans-serif" }}>
                      {item.role === "creator" ? "我埋下的" : "我找到的"}
                    </span>
                    {(item.echo_count || 0) > 0 && (
                      <span className="rounded-full bg-rose-50 px-2.5 py-1 text-[10px] text-rose-500" style={{ fontFamily: "sans-serif" }}>
                        {item.echo_count} 段回响
                      </span>
                    )}
                  </div>

                  <h3 className="text-base text-stone-800">{item.key_question || "未命名胶囊"}</h3>
                  <p className="mt-2 line-clamp-2 text-sm leading-6 text-stone-500">
                    {item.yuan_ji_preview || "这枚胶囊的正文会在详情里继续展开。"}
                  </p>

                  <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-stone-400" style={{ fontFamily: "sans-serif" }}>
                    {item.city && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin size={12} />
                        {item.city}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1">
                      <Clock size={12} />
                      {formatDateTime(item.found_at || item.created_at)}
                    </span>
                  </div>
                </motion.button>
              );
            })}
          </div>
        )}
      </div>

      <AnimatePresence>
        {selectedItem && (
          <ModalShell title="胶囊详情" onClose={() => setSelectedItem(null)}>
            {detailLoading && (
              <div className="flex items-center justify-center py-10">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-stone-300 border-t-indigo-500" />
              </div>
            )}

            {!detailLoading && selectedDetail && (
              <div className="space-y-4">
                <div className="rounded-2xl bg-indigo-50 px-4 py-4">
                  <div className="mb-2 flex items-center gap-2 text-indigo-600">
                    <Sparkles size={14} />
                    <span className="text-sm">钥题</span>
                  </div>
                  <p className="text-sm leading-7 text-indigo-700">{selectedDetail.key_question || "这枚胶囊没有留下问题。"}</p>
                  {selectedDetail.key_answer_hint && (
                    <p className="mt-2 text-xs text-indigo-500">标准答案锚点：{selectedDetail.key_answer_hint}</p>
                  )}
                </div>

                {selectedDetail.is_accessible && selectedDetail.yuan_ji ? (
                  <div className="rounded-2xl bg-stone-50 px-4 py-4">
                    <p className="mb-2 text-[11px] tracking-[0.18em] text-stone-400" style={{ fontFamily: "sans-serif" }}>
                      胶囊正文
                    </p>
                    <p className="text-sm leading-7 text-stone-700">{selectedDetail.yuan_ji}</p>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-stone-200 px-4 py-4 text-sm text-stone-400">
                    这枚胶囊此刻还没有向你完全打开。
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3 text-sm text-stone-500">
                  <DetailStat label="所在城市" value={selectedDetail.city || "未标记"} />
                  <DetailStat label="天气" value={selectedDetail.weather_when_created || "未记录"} />
                  <DetailStat label="埋下时间" value={formatDateTime(selectedDetail.created_at)} />
                  <DetailStat label="开启时间" value={formatDateTime(selectedDetail.found_at)} />
                </div>

                <div className="rounded-2xl border border-stone-200 bg-white px-4 py-4">
                  <div className="mb-3 flex items-center gap-2 text-stone-600">
                    <MessageCircleMore size={15} />
                    <span className="text-sm">回响</span>
                  </div>
                  {selectedDetail.echoes.length === 0 ? (
                    <p className="text-sm text-stone-400">还没有人给这枚胶囊留下回响。</p>
                  ) : (
                    <div className="space-y-3">
                      {selectedDetail.echoes.map((echo) => (
                        <div key={echo.id} className="rounded-2xl bg-stone-50 px-3 py-3">
                          <p className="text-sm leading-6 text-stone-700">{echo.content}</p>
                          <p className="mt-2 text-[11px] text-stone-400" style={{ fontFamily: "sans-serif" }}>
                            {formatDateTime(echo.created_at)}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}

                  {selectedDetail.can_echo && (
                    <div className="mt-4 rounded-2xl border border-dashed border-stone-200 bg-stone-50/80 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm text-stone-700">给这枚胶囊留一句回响</p>
                          <p className="mt-1 text-[11px] text-stone-400" style={{ fontFamily: "sans-serif" }}>
                            按下按键后再写，体验会更清楚一些。
                          </p>
                        </div>
                        <button
                          onClick={() => setEchoEditorOpen((current) => !current)}
                          className="shrink-0 rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs text-stone-600 shadow-sm"
                          style={{ fontFamily: "sans-serif" }}
                        >
                          {echoEditorOpen ? "收起" : "写回响"}
                        </button>
                      </div>

                      <AnimatePresence initial={false}>
                        {echoEditorOpen && (
                          <motion.div
                            initial={{ opacity: 0, height: 0, y: -6 }}
                            animate={{ opacity: 1, height: "auto", y: 0 }}
                            exit={{ opacity: 0, height: 0, y: -6 }}
                            className="overflow-hidden"
                          >
                            <textarea
                              value={echoDraft}
                              onChange={(event) => setEchoDraft(event.target.value)}
                              placeholder="把你收到的感受写给这枚胶囊。"
                              className="mt-3 min-h-24 w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700 outline-none"
                            />
                            <div className="mt-3 flex gap-2">
                              <button
                                onClick={() => {
                                  setEchoDraft("");
                                  setEchoEditorOpen(false);
                                }}
                                disabled={echoSubmitting}
                                className="flex-1 rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-500 disabled:opacity-60"
                              >
                                取消
                              </button>
                              <button
                                onClick={() => void handleSubmitEcho()}
                                disabled={echoSubmitting || !echoDraft.trim()}
                                className="flex-1 rounded-2xl bg-stone-800 px-4 py-3 text-sm text-white disabled:opacity-60"
                              >
                                {echoSubmitting ? "发送中…" : "发送回响"}
                              </button>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}
                </div>
              </div>
            )}
          </ModalShell>
        )}
      </AnimatePresence>
    </div>
  );
}

function SummaryBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/50 bg-white/70 px-3 py-3 text-center backdrop-blur-xl">
      <div className="text-lg text-stone-700">{value}</div>
      <div className="mt-1 text-[10px] tracking-[0.18em] text-stone-400" style={{ fontFamily: "sans-serif" }}>
        {label}
      </div>
    </div>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3.5 py-2 text-xs transition-colors ${
        active ? "bg-stone-800 text-white" : "bg-white/80 text-stone-500"
      }`}
      style={{ fontFamily: "sans-serif" }}
    >
      {label}
    </button>
  );
}

function DetailStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/80 px-4 py-3">
      <p className="text-[11px] text-stone-400" style={{ fontFamily: "sans-serif" }}>
        {label}
      </p>
      <p className="mt-1 text-sm text-stone-700">{value}</p>
    </div>
  );
}

function EmptyState({
  title,
  subtitle,
  iconKey,
}: {
  title: string;
  subtitle: string;
  iconKey: UserSettingsData["capsule_icon"];
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[2rem] border border-white/40 bg-white/60 px-6 py-16 text-center backdrop-blur-xl">
      <CapsuleIconSymbol iconKey={iconKey} size={28} className="mb-3 text-stone-300" />
      <p className="text-sm text-stone-500">{title}</p>
      <p className="mt-2 text-xs leading-6 text-stone-400">{subtitle}</p>
    </div>
  );
}

function ModalShell({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/35 px-5 backdrop-blur-sm"
    >
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.98 }}
        className="max-h-[82vh] w-full max-w-lg overflow-y-auto rounded-[2rem] bg-white p-5 shadow-2xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg text-stone-800">{title}</h3>
          <button onClick={onClose} className="text-sm text-stone-400">
            关闭
          </button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  );
}
