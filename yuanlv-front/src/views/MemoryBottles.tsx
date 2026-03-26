import { Suspense, lazy, useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, Clock, Compass, MapPin, Send, Sparkles } from "lucide-react";
import { bottleApi } from "../api/bottle";
import type { AnchorData, BottleMineItem, BottleTrajectoryData, CapsuleData } from "../api/types";
import { useAppAppearance } from "../context/AppAppearanceContext";
import { useAuth } from "../context/AuthContext";

type BottleFilter = "all" | "thrown" | "received" | "drifting";

const MapboxRomanceMap = lazy(() =>
  import("../components/MapboxRomanceMap").then((module) => ({ default: module.MapboxRomanceMap }))
);

function BottleMapFallback() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-[linear-gradient(180deg,#f8f1e6_0%,#f4eadf_100%)] text-xs tracking-wide text-stone-500">
      地图正在铺开…
    </div>
  );
}

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("zh-CN");
}

function bottleStatusLabel(item: BottleMineItem) {
  if (item.status === "received") {
    return {
      label: "已抵达",
      className: "bg-emerald-50 text-emerald-600",
    };
  }
  if (item.status === "expired") {
    return {
      label: "已结束",
      className: "bg-stone-100 text-stone-500",
    };
  }
  return {
    label: "漂流中",
    className: "bg-sky-50 text-sky-600",
  };
}

export function MemoryBottles() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { palette } = useAppAppearance();

  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [items, setItems] = useState<BottleMineItem[]>([]);
  const [activeFilter, setActiveFilter] = useState<BottleFilter>("all");
  const [selectedItem, setSelectedItem] = useState<BottleMineItem | null>(null);
  const [selectedTrajectory, setSelectedTrajectory] = useState<BottleTrajectoryData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;

    setLoading(true);
    setPageError("");
    bottleApi
      .getMine(user.id, "all")
      .then((response) => {
        if (!cancelled) {
          setItems(response.items || []);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setPageError(error instanceof Error ? error.message : "远洋瓶列表加载失败。");
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
    if (!selectedItem) {
      setSelectedTrajectory(null);
      setDetailLoading(false);
      return;
    }

    let cancelled = false;
    setDetailLoading(true);
    bottleApi
      .getTrajectory(String(selectedItem.id))
      .then((trajectory) => {
        if (!cancelled) {
          setSelectedTrajectory(trajectory);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setPageError(error instanceof Error ? error.message : "远洋瓶轨迹加载失败。");
          setSelectedTrajectory(null);
        }
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedItem]);

  const summary = useMemo(
    () => ({
      thrown: items.filter((item) => item.role === "sender").length,
      received: items.filter((item) => item.role === "receiver").length,
      drifting: items.filter((item) => item.role === "sender" && item.status === "drifting").length,
    }),
    [items]
  );

  const filteredItems = useMemo(() => {
    switch (activeFilter) {
      case "thrown":
        return items.filter((item) => item.role === "sender");
      case "received":
        return items.filter((item) => item.role === "receiver");
      case "drifting":
        return items.filter((item) => item.role === "sender" && item.status === "drifting");
      default:
        return items;
    }
  }, [activeFilter, items]);

  const trajectoryMapData = useMemo(() => {
    if (!selectedItem) {
      return {
        center: null as { lat: number; lng: number } | null,
        path: [] as Array<{ lat: number; lng: number }>,
        anchors: [] as AnchorData[],
        capsules: [] as CapsuleData[],
        hasDestination: false,
      };
    }

    const fromLat = selectedTrajectory?.from.lat ?? selectedItem.from.lat;
    const fromLng = selectedTrajectory?.from.lng ?? selectedItem.from.lng;
    const toLat = selectedTrajectory?.to.lat ?? selectedItem.to.lat ?? null;
    const toLng = selectedTrajectory?.to.lng ?? selectedItem.to.lng ?? null;
    const hasDestination = toLat != null && toLng != null;

    const center = hasDestination
      ? {
          lat: (fromLat + toLat) / 2,
          lng: (fromLng + toLng) / 2,
        }
      : {
          lat: fromLat,
          lng: fromLng,
        };

    const path = hasDestination ? [{ lat: fromLat, lng: fromLng }, { lat: toLat, lng: toLng }] : [];

    const anchors: AnchorData[] = [
      {
        id: `bottle-from-${selectedItem.id}`,
        travel_id: `bottle-${selectedItem.id}`,
        lat: fromLat,
        lng: fromLng,
        poi_name: selectedTrajectory?.from.city || selectedItem.from.city || "起点",
        is_manual: true,
        status: "confirmed",
        agent_status: "ready",
        created_at: selectedItem.created_at,
      },
    ];

    const capsules: CapsuleData[] = hasDestination
      ? [
          {
            id: `bottle-to-${selectedItem.id}`,
            lat: toLat,
            lng: toLng,
            city: selectedTrajectory?.to.city || selectedItem.to.city || "终点",
            status: "active",
          },
        ]
      : [];

    return {
      center,
      path,
      anchors,
      capsules,
      hasDestination,
    };
  }, [selectedItem, selectedTrajectory]);

  return (
    <div className="min-h-full pb-32" style={{ fontFamily: "'Noto Serif SC', serif", background: palette.pageBackground }}>
      <div className="px-5 pb-5 pt-12" style={{ background: palette.heroGradient }}>
        <button
          onClick={() => navigate("/memory")}
          className="mb-4 flex items-center gap-2 text-sm text-stone-500"
        >
          <ArrowLeft size={18} />
          返回记忆
        </button>

        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl tracking-wider text-stone-800">远洋瓶管理</h1>
            <p className="mt-2 text-sm leading-6 text-stone-500">
              看看你扔出的瓶子漂到了哪里，也看看有哪些故事被海风送到了你手里。
            </p>
          </div>
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/80 shadow-sm">
            <Send size={20} className="text-sky-500" />
          </div>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-3">
          <SummaryBox label="我扔出的" value={loading ? "--" : String(summary.thrown)} />
          <SummaryBox label="我收到的" value={loading ? "--" : String(summary.received)} />
          <SummaryBox label="漂流中" value={loading ? "--" : String(summary.drifting)} />
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
          <FilterChip label="我扔出的" active={activeFilter === "thrown"} onClick={() => setActiveFilter("thrown")} />
          <FilterChip label="我收到的" active={activeFilter === "received"} onClick={() => setActiveFilter("received")} />
          <FilterChip label="漂流中" active={activeFilter === "drifting"} onClick={() => setActiveFilter("drifting")} />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-stone-300 border-t-sky-500" />
          </div>
        ) : filteredItems.length === 0 ? (
          <EmptyState
            title="这里还没有远洋瓶"
            subtitle="下一次站在海边时，把一句话扔进浪里，这里就会多出一条漂流轨迹。"
          />
        ) : (
          <div className="space-y-3">
            {filteredItems.map((item, index) => {
              const statusMeta = bottleStatusLabel(item);
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
                      {item.role === "sender" ? "我扔出的" : "我收到的"}
                    </span>
                  </div>

                  <p className="line-clamp-3 text-sm leading-6 text-stone-700">
                    {item.content_preview || item.content || "这一只远洋瓶里还没有留下内容。"}
                  </p>

                  <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-stone-400" style={{ fontFamily: "sans-serif" }}>
                    <span className="inline-flex items-center gap-1">
                      <MapPin size={12} />
                      {item.from.city || "未知起点"}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Clock size={12} />
                      {formatDateTime(item.received_at || item.created_at)}
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
          <ModalShell title="远洋瓶详情" onClose={() => setSelectedItem(null)}>
            {detailLoading && (
              <div className="flex items-center justify-center py-10">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-stone-300 border-t-sky-500" />
              </div>
            )}

            {!detailLoading && (
              <div className="space-y-4">
                <div className="rounded-2xl bg-sky-50 px-4 py-4">
                  <div className="mb-2 flex items-center gap-2 text-sky-600">
                    <Sparkles size={14} />
                    <span className="text-sm">瓶中内容</span>
                  </div>
                  <p className="text-sm leading-7 text-sky-700">{selectedItem.content}</p>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm text-stone-500">
                  <DetailStat label="身份" value={selectedItem.role === "sender" ? "投递者" : "收到者"} />
                  <DetailStat label="状态" value={bottleStatusLabel(selectedItem).label} />
                  <DetailStat label="投递时间" value={formatDateTime(selectedItem.created_at)} />
                  <DetailStat label="抵达时间" value={formatDateTime(selectedItem.received_at)} />
                </div>

                <div className="rounded-2xl border border-stone-200 bg-white px-4 py-4">
                  <div className="mb-3 flex items-center gap-2 text-stone-600">
                    <Compass size={15} />
                    <span className="text-sm">漂流轨迹</span>
                  </div>
                  <div className="mb-4 h-56 overflow-hidden rounded-2xl border border-stone-100 shadow-[0_4px_20px_rgba(180,140,100,0.06)]">
                    <Suspense fallback={<BottleMapFallback />}>
                      <MapboxRomanceMap
                        center={trajectoryMapData.center}
                        trajectoryPath={trajectoryMapData.path}
                        anchors={trajectoryMapData.anchors}
                        capsules={trajectoryMapData.capsules}
                        passive
                        zoom={trajectoryMapData.hasDestination ? 4.5 : 9.5}
                        pitch={0}
                        rotation={0}
                        lineColor="#0ea5e9"
                        lineWidth={5}
                      />
                    </Suspense>
                  </div>
                  <p className="mb-4 text-[11px] leading-5 text-stone-400" style={{ fontFamily: "sans-serif" }}>
                    {trajectoryMapData.hasDestination
                      ? "蓝线把它的起点与终点连了起来，像一段真正漂过海风的路径。"
                      : "它还没有靠岸，小地图先替你守着它离开的地方。"}
                  </p>
                  <div className="space-y-3">
                    <RoutePoint
                      title="起点"
                      city={selectedTrajectory?.from.city || selectedItem.from.city || "未知海岸"}
                      coords={`${(selectedTrajectory?.from.lat ?? selectedItem.from.lat).toFixed(4)}, ${(selectedTrajectory?.from.lng ?? selectedItem.from.lng).toFixed(4)}`}
                    />
                    <div className="pl-3 text-xs text-stone-300">↓</div>
                    <RoutePoint
                      title="终点"
                      city={selectedTrajectory?.to.city || selectedItem.to.city || (selectedItem.status === "drifting" ? "仍在海上漂流" : "尚未记录")}
                      coords={
                        selectedTrajectory?.to.lat != null && selectedTrajectory?.to.lng != null
                          ? `${selectedTrajectory.to.lat.toFixed(4)}, ${selectedTrajectory.to.lng.toFixed(4)}`
                          : "等它靠岸后再来看看"
                      }
                    />
                  </div>
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
  const { palette } = useAppAppearance();
  return (
    <div className="rounded-2xl border bg-white/70 px-3 py-3 text-center backdrop-blur-xl" style={{ borderColor: palette.borderTint }}>
      <div className="text-lg text-stone-700">{value}</div>
      <div className="mt-1 text-[10px] tracking-[0.18em] text-stone-400" style={{ fontFamily: "sans-serif" }}>
        {label}
      </div>
    </div>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  const { palette } = useAppAppearance();
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3.5 py-2 text-xs transition-colors ${active ? "text-white" : "bg-white/80 text-stone-500"}`}
      style={{ fontFamily: "sans-serif", ...(active ? { background: palette.accent } : {}) }}
    >
      {label}
    </button>
  );
}

function RoutePoint({ title, city, coords }: { title: string; city: string; coords: string }) {
  return (
    <div className="rounded-2xl bg-stone-50 px-3 py-3">
      <p className="text-[11px] text-stone-400" style={{ fontFamily: "sans-serif" }}>
        {title}
      </p>
      <p className="mt-1 text-sm text-stone-700">{city}</p>
      <p className="mt-1 text-[11px] text-stone-400" style={{ fontFamily: "sans-serif" }}>
        {coords}
      </p>
    </div>
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

function EmptyState({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[2rem] border border-white/40 bg-white/60 px-6 py-16 text-center backdrop-blur-xl">
      <Send size={28} className="mb-3 text-stone-300" />
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
