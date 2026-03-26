import { Suspense, lazy, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Anchor as AnchorIcon,
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Clock,
  Lock,
  MapPin,
  Navigation,
  Play,
  Plus,
  ScrollText,
  Sparkles,
  StopCircle,
} from "lucide-react";
import { journeyApi } from "../api/journey";
import { mapApi } from "../api/map";
import { capsuleApi } from "../api/capsule";
import type { AnchorData, CapsuleData, CapsuleDetailData, JourneySummary } from "../api/types";
import { HeroPhotoCarousel, type HeroPhotoCarouselItem } from "../components/HeroPhotoCarousel";
import { useAppAppearance } from "../context/AppAppearanceContext";
import { useAuth } from "../context/AuthContext";
import { useTravelContext } from "../context/TravelContext";
import { haversineDistance } from "../utils/trajectory";

type JourneyState = "idle" | "traveling" | "generating" | "summary";

const CAPSULE_INTERACT_DISTANCE_M = 150;
const ROMANTIC_ROUTE_COPY = "这枚胶囊还在远一点的风里等你，要不要沿着蓝色的路，慢慢去把它找回来？";

interface WeatherData {
  city?: string | null;
  poi_name?: string | null;
  weather?: string | null;
  temperature?: string | number | null;
  wind?: string | null;
  lat?: number;
  lng?: number;
  label?: string;
  poi_type?: string;
  full_address?: string;
  is_seaside?: boolean;
}

interface LastJourneyData {
  id: number;
  city?: string | null;
  total_distance: number;
  start_time: string;
  diary_title?: string | null;
  diary_excerpt?: string | null;
}

interface WalkingRouteResponse {
  provider?: string;
  mode?: string;
  paths?: Array<{
    steps?: Array<{
      lat?: number | string | null;
      lng?: number | string | null;
      instruction?: string;
    }>;
    distance?: number | string | null;
    duration?: number | string | null;
  }>;
  navigation_links?: {
    gaode_uri?: string;
    gaode_web?: string;
    apple_maps?: string;
  };
}

interface RouteGuidanceStep {
  lat: number;
  lng: number;
  instruction: string;
}

interface RouteLiveState {
  currentInstruction: string;
  nextInstruction: string | null;
  remainingDistanceM: number | null;
  remainingDurationS: number | null;
  offRouteDistanceM: number | null;
}

interface SummarySegment {
  text: string;
  source: "ai" | "user" | "rag";
}

interface SummaryDraft {
  title: string;
  content: SummarySegment[];
}

const LOADING_PHRASES = [
  "正在汇总本次旅途的数据…",
  "正在等待日记生成结果…",
  "让脚步、天气与停留慢慢编织成旅记…",
];

const MapboxRomanceMap = lazy(() =>
  import("../components/MapboxRomanceMap").then((module) => ({ default: module.MapboxRomanceMap }))
);

const CAPSULE_SPARK_PARTICLES = Array.from({ length: 11 }, (_, index) => ({
  id: index,
  left: 12 + ((index * 7) % 74),
  size: index % 3 === 0 ? 8 : index % 2 === 0 ? 6 : 5,
  delay: index * 0.06,
  duration: 1.2 + (index % 4) * 0.18,
  x: (index % 2 === 0 ? -1 : 1) * (18 + (index % 5) * 6),
  y: -78 - (index % 4) * 16,
}));

function JourneyMapFallback() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.32),transparent_30%),linear-gradient(180deg,#f8f1e6_0%,#f5eadc_100%)]">
      <div className="rounded-full border border-white/70 bg-white/80 px-4 py-2 text-xs tracking-wide text-stone-500 shadow-[0_10px_30px_rgba(180,140,100,0.08)] backdrop-blur-xl">
        地图正在铺开…
      </div>
    </div>
  );
}

function playCapsuleUnlockChime() {
  if (typeof window === "undefined") return;

  const AudioCtor =
    window.AudioContext ||
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  if (!AudioCtor) return;

  try {
    const audioContext = new AudioCtor();
    const now = audioContext.currentTime;
    const master = audioContext.createGain();
    master.connect(audioContext.destination);
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(0.06, now + 0.04);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 1.25);

    const tones = [
      { frequency: 523.25, start: 0, duration: 0.22 },
      { frequency: 659.25, start: 0.08, duration: 0.22 },
      { frequency: 783.99, start: 0.18, duration: 0.4 },
    ];

    tones.forEach((tone, index) => {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = index === tones.length - 1 ? "triangle" : "sine";
      oscillator.frequency.setValueAtTime(tone.frequency, now + tone.start);
      gain.gain.setValueAtTime(0.0001, now + tone.start);
      gain.gain.exponentialRampToValueAtTime(0.18, now + tone.start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + tone.start + tone.duration);
      oscillator.connect(gain);
      gain.connect(master);
      oscillator.start(now + tone.start);
      oscillator.stop(now + tone.start + tone.duration + 0.02);
    });

    window.setTimeout(() => {
      void audioContext.close().catch(() => undefined);
    }, 1500);
  } catch {
    // 某些浏览器可能拦截音频初始化，这里静默降级。
  }
}

function normalizeRoutePoints(
  points: Array<{ lat: number; lng: number }>
): Array<{ lat: number; lng: number }> {
  return points.filter((point, index, array) => {
    if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return false;
    if (index === 0) return true;
    const prev = array[index - 1];
    return Math.abs(prev.lat - point.lat) > 0.000001 || Math.abs(prev.lng - point.lng) > 0.000001;
  });
}

function normalizeGuidanceSteps(steps: RouteGuidanceStep[]): RouteGuidanceStep[] {
  return steps.filter((step, index, array) => {
    if (!Number.isFinite(step.lat) || !Number.isFinite(step.lng)) return false;
    if (index === 0) return true;
    const prev = array[index - 1];
    const samePoint =
      Math.abs(prev.lat - step.lat) <= 0.000001 &&
      Math.abs(prev.lng - step.lng) <= 0.000001;
    return !samePoint || prev.instruction !== step.instruction;
  });
}

function extractRoutePoints(
  routeData: WalkingRouteResponse | null | undefined
): Array<{ lat: number; lng: number }> {
  const primaryPath = routeData?.paths?.[0];
  if (!primaryPath?.steps?.length) return [];

  return normalizeRoutePoints(
    primaryPath.steps
      .map((step) => ({
        lat: Number(step.lat),
        lng: Number(step.lng),
      }))
      .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng))
  );
}

function extractRouteGuidanceSteps(routeData: WalkingRouteResponse | null | undefined): RouteGuidanceStep[] {
  const primaryPath = routeData?.paths?.[0];
  if (!primaryPath?.steps?.length) return [];

  return normalizeGuidanceSteps(
    primaryPath.steps
      .map((step) => ({
        lat: Number(step.lat),
        lng: Number(step.lng),
        instruction: step.instruction?.trim() || "沿着蓝色的路继续走",
      }))
      .filter((step) => Number.isFinite(step.lat) && Number.isFinite(step.lng))
  );
}

function findNearestPointIndex(
  current: { lat: number; lng: number },
  points: Array<{ lat: number; lng: number }>
): { index: number; distanceM: number } {
  let index = 0;
  let distanceM = Number.POSITIVE_INFINITY;

  points.forEach((point, pointIndex) => {
    const currentDistance = haversineDistance(current.lat, current.lng, point.lat, point.lng);
    if (currentDistance < distanceM) {
      distanceM = currentDistance;
      index = pointIndex;
    }
  });

  return { index, distanceM: Number.isFinite(distanceM) ? distanceM : 0 };
}

function sumPathDistance(points: Array<{ lat: number; lng: number }>): number {
  if (points.length < 2) return 0;
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += haversineDistance(points[index - 1].lat, points[index - 1].lng, points[index].lat, points[index].lng);
  }
  return total;
}

function readNumber(value: number | string | null | undefined): number | null {
  if (value == null) return null;
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : null;
}

function formatMeters(distance: number | null | undefined): string {
  if (distance == null || !Number.isFinite(distance)) return "未知距离";
  if (distance >= 1000) return `${(distance / 1000).toFixed(1)} km`;
  return `${Math.round(distance)} m`;
}

function formatMinutes(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return "步行片刻";
  const minutes = Math.max(1, Math.round(seconds / 60));
  return `约 ${minutes} 分钟`;
}

function normalizeSummarySegments(content: JourneySummary["content"]): SummarySegment[] {
  return content.map((paragraph) => {
    if (typeof paragraph === "string") {
      return { text: paragraph, source: "ai" };
    }
    return {
      text: paragraph.text,
      source: paragraph.source || "ai",
    };
  });
}

export function Journey() {
  const travel = useTravelContext();
  const { user } = useAuth();
  const { palette } = useAppAppearance();
  const isDemoUser = user?.email === "demo" || user?.email === "demo@yuanlv.local";

  const [journeyState, setJourneyState] = useState<JourneyState>("idle");
  const [weatherData, setWeatherData] = useState<WeatherData | null>(null);
  const [lastJourney, setLastJourney] = useState<LastJourneyData | null>(null);
  const [recentJourneys, setRecentJourneys] = useState<LastJourneyData[]>([]);
  const [summaryData, setSummaryData] = useState<JourneySummary | null>(null);
  const [summaryError, setSummaryError] = useState("");
  const [summaryEditing, setSummaryEditing] = useState(false);
  const [summarySaving, setSummarySaving] = useState(false);
  const [summaryDraft, setSummaryDraft] = useState<SummaryDraft | null>(null);
  const [pageError, setPageError] = useState("");
  const [phraseIndex, setPhraseIndex] = useState(0);

  const [anchorModalOpen, setAnchorModalOpen] = useState(false);
  const [anchorText, setAnchorText] = useState("");
  const [anchorSubmitting, setAnchorSubmitting] = useState(false);

  const [selectedAnchor, setSelectedAnchor] = useState<AnchorData | null>(null);
  const [selectedAnchorText, setSelectedAnchorText] = useState("");
  const [selectedAnchorSaving, setSelectedAnchorSaving] = useState(false);
  const [activeCapsule, setActiveCapsule] = useState<CapsuleData | null>(null);
  const [activeCapsuleDetail, setActiveCapsuleDetail] = useState<CapsuleDetailData | null>(null);
  const [capsuleDetailLoading, setCapsuleDetailLoading] = useState(false);
  const [capsuleAnswer, setCapsuleAnswer] = useState("");
  const [capsuleUnlocking, setCapsuleUnlocking] = useState(false);
  const [capsuleMessage, setCapsuleMessage] = useState("");
  const [capsuleMessageTone, setCapsuleMessageTone] = useState<"neutral" | "success" | "warning" | "error">("neutral");
  const [capsuleRevealStage, setCapsuleRevealStage] = useState<"idle" | "opening" | "opened">("idle");
  const [capsuleJustUnlocked, setCapsuleJustUnlocked] = useState(false);
  const [capsuleContentWaiting, setCapsuleContentWaiting] = useState(false);
  const [capsuleEcho, setCapsuleEcho] = useState("");
  const [capsuleEchoEditorOpen, setCapsuleEchoEditorOpen] = useState(false);
  const [capsuleEchoSubmitting, setCapsuleEchoSubmitting] = useState(false);
  const [notebookActionLoading, setNotebookActionLoading] = useState(false);
  const capsuleDetailRequestId = useRef(0);

  useEffect(() => {
    if (travel.isActive) {
      setJourneyState((current) => (current === "summary" ? current : "traveling"));
      return;
    }
    setShowRoute(false);
    setRoutePoints([]);
    setTargetCapsule(null);
    setRouteSummary(null);
    setRouteExternalLink(null);
    setRouteGuidanceSteps([]);
    setRouteLiveState(null);
    setArrivalPromptCapsule(null);
    setRoutePromptCapsule(null);
    setRoutePromptDistance(null);
    setRoutePromptMessage("");
    setActiveCapsule(null);
    setSelectedAnchor(null);
    setSummaryEditing(false);
    setSummaryDraft(null);
    setJourneyState((current) => (current === "generating" || current === "summary" ? current : "idle"));
  }, [travel.isActive]);

  useEffect(() => {
    if (
      journeyState !== "summary" ||
      !travel.travelId ||
      !summaryData?.notebookImageRequested ||
      summaryData.notebookImageStatus !== "generating"
    ) {
      return;
    }

    let cancelled = false;

    const pollNotebookImage = async () => {
      for (let attempt = 0; attempt < 20 && !cancelled; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 2500));
        const snapshot = await journeyApi.getSummarySnapshot(travel.travelId!);
        if (cancelled || !snapshot) {
          continue;
        }

        setSummaryData((current) => (current ? { ...current, ...snapshot } : snapshot));
        if (snapshot.image || snapshot.notebookImageStatus !== "generating") {
          break;
        }
      }
    };

    void pollNotebookImage();

    return () => {
      cancelled = true;
    };
  }, [
    journeyState,
    summaryData?.notebookImageRequested,
    summaryData?.notebookImageStatus,
    travel.travelId,
  ]);

  // 请求位置权限并在获取位置后获取天气和附近胶囊
  useEffect(() => {
    const useDemoCampusFallback = isDemoUser;
    const fallbackContext: WeatherData = useDemoCampusFallback
      ? {
          lat: 31.2985,
          lng: 121.5018,
          city: "上海 · 复旦大学邯郸校区",
          label: "复旦大学邯郸校区",
          poi_name: "复旦大学正门",
          poi_type: "校园",
          full_address: "上海市杨浦区邯郸路 220 号",
          is_seaside: false,
        }
      : {
          lat: 31.2304,
          lng: 121.4737,
          city: "上海",
          label: "当前位置",
          poi_name: "城市街角",
          poi_type: "地点",
          full_address: "上海市",
          is_seaside: false,
        };

    const applyFallbackContext = async () => {
      setWeatherData(fallbackContext);
      try {
        const nearby = await capsuleApi.getNearby(fallbackContext.lat!, fallbackContext.lng!, 2000);
        setNearbyCapsules(nearby.items || []);
      } catch {
        setNearbyCapsules([]);
      }
    };

    if (!navigator.geolocation) {
      console.warn("Geolocation is not supported by this browser.");
      void applyFallbackContext();
      return;
    }

    // 请求位置权限
    const getPosition = () => {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          try {
            // 获取位置上下文（天气、POI等）
            const contextData = await mapApi.getContext(pos.coords.latitude, pos.coords.longitude);
            setWeatherData(contextData as WeatherData);

            // 立即获取附近的胶囊
            const nearbyCapsules = await capsuleApi.getNearby(pos.coords.latitude, pos.coords.longitude);
            setNearbyCapsules(nearbyCapsules.items || []);
          } catch (error) {
            console.error("Error getting location context:", error);
            setWeatherData(null);
          }
        },
        (error) => {
          console.error("Geolocation error:", error);
          setWeatherData(null);
          void applyFallbackContext();
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
      );
    };

    // 检查位置权限状态
    if ("permissions" in navigator) {
      navigator.permissions.query({ name: "geolocation" }).then((permission) => {
        if (permission.state === "granted") {
          // 权限已授予，直接获取位置
          getPosition();
        } else if (permission.state === "prompt") {
          // 需要请求权限
          getPosition();
        } else {
          // 权限被拒绝，显示提示
          void applyFallbackContext();
        }
      });
    } else {
      // 无法检查权限状态，直接请求
      getPosition();
    }
  }, [isDemoUser, user?.id]);

  // 添加状态管理附近的胶囊
  const [nearbyCapsules, setNearbyCapsules] = useState<CapsuleData[]>([]);
  const [routePoints, setRoutePoints] = useState<Array<{ lat: number; lng: number }>>([]);
  const [showRoute, setShowRoute] = useState(false);
  const [targetCapsule, setTargetCapsule] = useState<CapsuleData | null>(null);
  const [routePromptCapsule, setRoutePromptCapsule] = useState<CapsuleData | null>(null);
  const [routePromptDistance, setRoutePromptDistance] = useState<number | null>(null);
  const [routePlanning, setRoutePlanning] = useState(false);
  const [routePromptMessage, setRoutePromptMessage] = useState("");
  const [routeSummary, setRouteSummary] = useState<{ distanceM: number | null; durationS: number | null } | null>(
    null
  );
  const [routeExternalLink, setRouteExternalLink] = useState<string | null>(null);
  const [routeGuidanceSteps, setRouteGuidanceSteps] = useState<RouteGuidanceStep[]>([]);
  const [routeLiveState, setRouteLiveState] = useState<RouteLiveState | null>(null);
  const [routeRefreshing, setRouteRefreshing] = useState(false);
  const [arrivalPromptCapsule, setArrivalPromptCapsule] = useState<CapsuleData | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;

    (async () => {
      try {
        const items = await journeyApi.getTravelList(user.id, 4);
        if (!cancelled) {
          setRecentJourneys(items as LastJourneyData[]);
          setLastJourney(items[0] as LastJourneyData ?? null);
        }
      } catch {
        if (!cancelled) {
          setRecentJourneys([]);
          setLastJourney(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    if (journeyState !== "generating") return;
    const timer = window.setInterval(() => {
      setPhraseIndex((current) => (current + 1) % LOADING_PHRASES.length);
    }, 2200);
    return () => window.clearInterval(timer);
  }, [journeyState]);

  const trajectoryPath = useMemo(
    () => travel.positions.map((point) => ({ lat: point.lat, lng: point.lng })),
    [travel.positions]
  );

  // 只过滤已确认的锚点（confirmed 状态或手动锚点）
  const displayAnchors = useMemo(() => {
    return travel.anchors.filter(anchor => 
      anchor.status === 'confirmed' || anchor.is_manual
    );
  }, [travel.anchors]);

  const pendingAnchorCount = useMemo(
    () => travel.anchors.filter((anchor) => anchor.status === "candidate" || anchor.status === "observation").length,
    [travel.anchors]
  );

  const visibleCapsules = useMemo(
    () => (travel.capsules.length > 0 ? travel.capsules : nearbyCapsules),
    [nearbyCapsules, travel.capsules]
  );

  useEffect(() => {
    setSelectedAnchorText(selectedAnchor?.user_text || "");
  }, [selectedAnchor]);

  useEffect(() => {
    if (!activeCapsule) {
      capsuleDetailRequestId.current += 1;
      setActiveCapsuleDetail(null);
      setCapsuleAnswer("");
      setCapsuleMessage("");
      setCapsuleMessageTone("neutral");
      setCapsuleRevealStage("idle");
      setCapsuleJustUnlocked(false);
      setCapsuleContentWaiting(false);
      setCapsuleEcho("");
      setCapsuleEchoEditorOpen(false);
      setCapsuleDetailLoading(false);
      return;
    }

    let cancelled = false;
    const requestId = ++capsuleDetailRequestId.current;
    setCapsuleDetailLoading(true);
    void (async () => {
      try {
        const detail = await capsuleApi.getDetail(activeCapsule.id, user?.id);
        if (!cancelled && requestId === capsuleDetailRequestId.current) {
          setActiveCapsuleDetail(detail);
        }
      } catch (error) {
        if (!cancelled && requestId === capsuleDetailRequestId.current) {
          setCapsuleMessage(error instanceof Error ? error.message : "胶囊详情加载失败。");
          setCapsuleMessageTone("error");
          setActiveCapsuleDetail(null);
        }
      } finally {
        if (!cancelled && requestId === capsuleDetailRequestId.current) {
          setCapsuleDetailLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeCapsule, user?.id]);

  useEffect(() => {
    if (!activeCapsuleDetail?.is_accessible || !activeCapsuleDetail?.yuan_ji) return;
    if (capsuleJustUnlocked || capsuleRevealStage === "opening") return;
    setCapsuleRevealStage("opened");
  }, [activeCapsuleDetail?.is_accessible, activeCapsuleDetail?.yuan_ji, capsuleJustUnlocked, capsuleRevealStage]);

  useEffect(() => {
    if (capsuleRevealStage !== "opening") return;
    const timer = window.setTimeout(() => {
      setCapsuleRevealStage("opened");
    }, 980);
    return () => window.clearTimeout(timer);
  }, [capsuleRevealStage]);

  useEffect(() => {
    if (capsuleRevealStage !== "opening" || !capsuleJustUnlocked) return;
    playCapsuleUnlockChime();
  }, [capsuleJustUnlocked, capsuleRevealStage]);

  useEffect(() => {
    if (!capsuleJustUnlocked || capsuleRevealStage !== "opened") return;
    const timer = window.setTimeout(() => {
      setCapsuleJustUnlocked(false);
    }, 2200);
    return () => window.clearTimeout(timer);
  }, [capsuleJustUnlocked, capsuleRevealStage]);

  useEffect(() => {
    if (!activeCapsule || capsuleRevealStage === "idle") {
      setCapsuleContentWaiting(false);
      return;
    }
    if (activeCapsuleDetail?.yuan_ji) {
      setCapsuleContentWaiting(false);
      return;
    }

    setCapsuleContentWaiting(false);
    const timer = window.setTimeout(() => {
      setCapsuleContentWaiting(true);
    }, 1500);

    return () => window.clearTimeout(timer);
  }, [activeCapsule, activeCapsuleDetail?.yuan_ji, capsuleRevealStage]);

  const mapCenter = useMemo(() => {
    if (travel.currentLat != null && travel.currentLng != null) {
      return { lat: travel.currentLat, lng: travel.currentLng };
    }
    const lastPoint = trajectoryPath[trajectoryPath.length - 1];
    if (lastPoint) return lastPoint;
    if (weatherData?.lat != null && weatherData?.lng != null) {
      return { lat: weatherData.lat, lng: weatherData.lng };
    }
    return null;
  }, [travel.currentLat, travel.currentLng, trajectoryPath, weatherData?.lat, weatherData?.lng]);

  const shouldShowCapsuleReveal = capsuleRevealStage !== "idle" || Boolean(activeCapsuleDetail?.is_accessible && activeCapsuleDetail?.yuan_ji);

  const getDistanceToCapsule = (capsule: CapsuleData) => {
    if (mapCenter) {
      return haversineDistance(mapCenter.lat, mapCenter.lng, capsule.lat, capsule.lng);
    }
    if (typeof capsule.distance_m === "number" && Number.isFinite(capsule.distance_m)) {
      return capsule.distance_m;
    }
    return null;
  };

  const clearRoutePlan = () => {
    setShowRoute(false);
    setRoutePoints([]);
    setTargetCapsule(null);
    setRouteSummary(null);
    setRouteExternalLink(null);
    setRouteGuidanceSteps([]);
    setRouteLiveState(null);
  };

  const handleCapsuleMarkerClick = (capsule: CapsuleData) => {
    setPageError("");
    setArrivalPromptCapsule(null);
    const distance = getDistanceToCapsule(capsule);
    if (distance == null) {
      setPageError("先等定位安静下来，我们再去寻找这枚胶囊。");
      return;
    }

    if (distance <= CAPSULE_INTERACT_DISTANCE_M) {
      if (targetCapsule && String(targetCapsule.id) === String(capsule.id)) {
        clearRoutePlan();
      }
      setRoutePromptCapsule(null);
      setRoutePromptDistance(null);
      setRoutePromptMessage("");
      setActiveCapsule(capsule);
      return;
    }

    setActiveCapsule(null);
    setRoutePromptCapsule(capsule);
    setRoutePromptDistance(distance);
    setRoutePromptMessage("");
  };

  const requestRouteToCapsule = async (
    capsule: CapsuleData,
    onError?: (message: string) => void
  ) => {
    if (!mapCenter) {
      const message = "还没拿到你的坐标，等风把位置带回来一些。";
      onError?.(message);
      return false;
    }

    try {
      const routeData = (await mapApi.getWalkingRoute(
        mapCenter.lat,
        mapCenter.lng,
        capsule.lat,
        capsule.lng
      )) as WalkingRouteResponse;

      const guidanceSteps = extractRouteGuidanceSteps(routeData);
      const extracted = extractRoutePoints(routeData);
      const mergedRoute = normalizeRoutePoints([
        { lat: mapCenter.lat, lng: mapCenter.lng },
        ...extracted,
        { lat: capsule.lat, lng: capsule.lng },
      ]);

      if (mergedRoute.length < 2) {
        throw new Error("路线还没有织好，再试一次吧。");
      }

      const primaryPath = routeData.paths?.[0];
      setRoutePoints(mergedRoute);
      setShowRoute(true);
      setTargetCapsule(capsule);
      setRouteSummary({
        distanceM: readNumber(primaryPath?.distance),
        durationS: readNumber(primaryPath?.duration),
      });
      setRouteExternalLink(routeData.navigation_links?.gaode_web || routeData.navigation_links?.apple_maps || null);
      setRouteGuidanceSteps(
        guidanceSteps.length > 0
          ? guidanceSteps
          : mergedRoute.map((point, index) => ({
              ...point,
              instruction: index === mergedRoute.length - 1 ? "你已经来到胶囊身边了" : "沿着蓝色的路继续走",
            }))
      );
      setPageError("");
      setArrivalPromptCapsule(null);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "寻路失败了，再轻点一次试试。";
      onError?.(message);
      return false;
    }
  };

  const handlePlanRouteToCapsule = async () => {
    if (!routePromptCapsule) return;
    setRoutePlanning(true);
    setRoutePromptMessage("");
    try {
      const success = await requestRouteToCapsule(routePromptCapsule, setRoutePromptMessage);
      if (!success) return;
      setRoutePromptCapsule(null);
      setRoutePromptDistance(null);
    } finally {
      setRoutePlanning(false);
    }
  };

  useEffect(() => {
    if (!showRoute || !targetCapsule || !mapCenter || routePoints.length === 0) {
      setRouteLiveState(null);
      return;
    }

    const distanceToTarget = haversineDistance(mapCenter.lat, mapCenter.lng, targetCapsule.lat, targetCapsule.lng);
    if (distanceToTarget <= CAPSULE_INTERACT_DISTANCE_M) {
      setArrivalPromptCapsule(targetCapsule);
      clearRoutePlan();
      return;
    }

    const routePathDistance = routeSummary?.distanceM ?? sumPathDistance(routePoints);
    const nearestRoute = findNearestPointIndex(mapCenter, routePoints);
    const remainingPath = [mapCenter, ...routePoints.slice(nearestRoute.index)];
    if (
      remainingPath.length === 0 ||
      Math.abs(remainingPath[remainingPath.length - 1].lat - targetCapsule.lat) > 0.000001 ||
      Math.abs(remainingPath[remainingPath.length - 1].lng - targetCapsule.lng) > 0.000001
    ) {
      remainingPath.push({ lat: targetCapsule.lat, lng: targetCapsule.lng });
    }
    const remainingDistanceM = sumPathDistance(remainingPath);

    const guidanceSource =
      routeGuidanceSteps.length > 0
        ? routeGuidanceSteps
        : routePoints.map((point, index) => ({
            ...point,
            instruction: index === routePoints.length - 1 ? "你已经来到胶囊身边了" : "沿着蓝色的路继续走",
          }));
    const nearestGuidance = findNearestPointIndex(mapCenter, guidanceSource);
    const currentInstruction =
      guidanceSource[nearestGuidance.index]?.instruction || "沿着蓝色的路继续走";
    const nextInstruction =
      guidanceSource
        .slice(nearestGuidance.index + 1)
        .find((step) => step.instruction && step.instruction !== currentInstruction)?.instruction || null;

    setRouteLiveState({
      currentInstruction,
      nextInstruction,
      remainingDistanceM,
      remainingDurationS:
        routeSummary?.durationS != null && routePathDistance > 0
          ? (routeSummary.durationS * remainingDistanceM) / routePathDistance
          : remainingDistanceM / 1.4,
      offRouteDistanceM: nearestRoute.distanceM,
    });
  }, [mapCenter, routeGuidanceSteps, routePoints, routeSummary, showRoute, targetCapsule]);

  const handleRefreshRoute = async () => {
    if (!targetCapsule) return;
    setRouteRefreshing(true);
    try {
      const success = await requestRouteToCapsule(targetCapsule, (message) => setPageError(message));
      if (!success) return;
      setPageError("");
    } finally {
      setRouteRefreshing(false);
    }
  };

  const heroItems = useMemo<HeroPhotoCarouselItem[]>(
    () =>
      recentJourneys.map((item) => ({
        id: String(item.id),
        title: item.diary_title || item.city || "旅途回忆",
        subtitle: item.diary_excerpt || "这段旅途的细节已经被好好收进记忆里。",
        location: item.city || "未知城市",
        meta: `${new Date(item.start_time).getFullYear()}/${new Date(item.start_time).getMonth() + 1}/${new Date(item.start_time).getDate()} · ${item.total_distance.toFixed(1)} km`,
      })),
    [recentJourneys]
  );

  const handleStartJourney = async () => {
    setPageError("");
    try {
      await travel.startTravel(weatherData?.city || undefined);
      if (weatherData?.lat != null && weatherData?.lng != null) {
        try {
          const nearby = await capsuleApi.getNearby(weatherData.lat, weatherData.lng, 2000);
          setNearbyCapsules(nearby.items || []);
        } catch {
          // ignore nearby refresh failure here; TravelContext will keep retrying after GPS settles
        }
      }
      setJourneyState("traveling");
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "开启旅途失败，请稍后重试。");
    }
  };

  const handleGenerateNotebook = async () => {
    if (!travel.travelId || !summaryData || notebookActionLoading) return;

    const currentStatus = summaryData.notebookImageStatus;
    if (currentStatus === "generating" || (currentStatus === "ready" && summaryData.image)) {
      return;
    }

    setNotebookActionLoading(true);
    setSummaryError("");
    try {
      const updated = await journeyApi.generateNotebookImage(travel.travelId);
      if (!updated) {
        throw new Error("手帐任务没有成功唤起，请稍后再试。");
      }
      setSummaryData(updated);
    } catch (error) {
      setSummaryError(error instanceof Error ? error.message : "手帐生成失败，请稍后重试。");
    } finally {
      setNotebookActionLoading(false);
    }
  };

  const handleEndJourney = async () => {
    setPageError("");
    setSummaryError("");
    setPhraseIndex(0);
    setSummaryData(null);
    setSummaryEditing(false);
    setSummaryDraft(null);
    setNotebookActionLoading(false);
    setJourneyState("generating");

    const currentTravelId = travel.travelId ?? undefined;

    try {
      await travel.endTravel({ generateNotebookImage: false });
      const summary = await journeyApi.generateSummary(currentTravelId);
      if (!summary) {
        setSummaryError("旅记暂未生成完成，请稍后到记忆页查看。");
        setJourneyState("idle");
        return;
      }
      setSummaryData(summary);
      setJourneyState("summary");
    } catch (error) {
      setSummaryError(error instanceof Error ? error.message : "旅记生成失败，请稍后重试。");
      setJourneyState("idle");
    }
  };

  const handleStartSummaryEdit = () => {
    if (!summaryData) return;
    setSummaryError("");
    setSummaryDraft({
      title: summaryData.title,
      content: normalizeSummarySegments(summaryData.content),
    });
    setSummaryEditing(true);
  };

  const handleCancelSummaryEdit = () => {
    setSummaryEditing(false);
    setSummaryDraft(null);
    setSummaryError("");
  };

  const handleSummarySegmentChange = (index: number, text: string) => {
    setSummaryDraft((current) => {
      if (!current) return current;
      const next = [...current.content];
      next[index] = { ...next[index], text };
      return { ...current, content: next };
    });
  };

  const handleAddSummarySegment = () => {
    setSummaryDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        content: [...current.content, { text: "", source: "user" }],
      };
    });
  };

  const handleRemoveSummarySegment = (index: number) => {
    setSummaryDraft((current) => {
      if (!current || current.content.length <= 1) return current;
      return {
        ...current,
        content: current.content.filter((_, itemIndex) => itemIndex !== index),
      };
    });
  };

  const handleSaveSummary = async () => {
    if (!travel.travelId || !summaryDraft || summarySaving) return;

    const normalizedTitle = summaryDraft.title.trim();
    const normalizedSegments = summaryDraft.content
      .map((segment) => ({
        ...segment,
        text: segment.text.trim(),
      }))
      .filter((segment) => segment.text);

    if (!normalizedTitle) {
      setSummaryError("请先为这段旅途写一个标题。");
      return;
    }
    if (normalizedSegments.length === 0) {
      setSummaryError("至少保留一段旅途回忆，再保存。");
      return;
    }

    setSummarySaving(true);
    setSummaryError("");
    try {
      const updated = await journeyApi.updateDiary(travel.travelId, {
        title: normalizedTitle,
        segments: normalizedSegments,
      });
      if (!updated) {
        throw new Error("旅记保存失败，请稍后再试。");
      }
      setSummaryData(updated);
      setSummaryEditing(false);
      setSummaryDraft(null);
    } catch (error) {
      setSummaryError(error instanceof Error ? error.message : "旅记保存失败，请稍后再试。");
    } finally {
      setSummarySaving(false);
    }
  };

  const handleAddAnchor = async () => {
    if (!anchorText.trim() || anchorSubmitting) return;
    setAnchorSubmitting(true);
    setPageError("");
    try {
      await travel.addManualAnchor(anchorText.trim());
      setAnchorText("");
      setAnchorModalOpen(false);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "添加锚点失败，请稍后重试。");
    } finally {
      setAnchorSubmitting(false);
    }
  };

  const handleUnlockCapsule = async () => {
    if (!activeCapsule || !capsuleAnswer.trim()) return;
    setCapsuleUnlocking(true);
    setCapsuleMessage("");
    setCapsuleMessageTone("neutral");
    try {
      const result = await capsuleApi.verify(activeCapsule.id, capsuleAnswer.trim(), {
        finderUserId: user?.id,
        finderLat: mapCenter?.lat,
        finderLng: mapCenter?.lng,
      });
      if (result.is_opened) {
        const nowIso = new Date().toISOString();
        setCapsuleJustUnlocked(Boolean(result.opened_now));
        setCapsuleRevealStage(result.opened_now ? "opening" : "opened");
        setCapsuleMessage(
          result.poetic_line || result.message || (result.opened_now ? "胶囊已经向你轻轻打开了。" : "这枚胶囊仍记得你。")
        );
        setCapsuleMessageTone("success");
        setCapsuleAnswer("");
        setActiveCapsuleDetail((current) => ({
          id: current?.id ?? activeCapsule.id,
          user_id: current?.user_id ?? 0,
          lat: current?.lat ?? activeCapsule.lat,
          lng: current?.lng ?? activeCapsule.lng,
          city: current?.city ?? activeCapsule.city ?? null,
          status: result.capsule_status,
          is_locked: current?.is_locked ?? Boolean(activeCapsule.is_locked),
          time_lock_until: current?.time_lock_until ?? activeCapsule.time_lock_until ?? null,
          key_question: current?.key_question ?? activeCapsule.key_question ?? null,
          key_answer_hint: current?.key_answer_hint ?? null,
          weather_when_created: current?.weather_when_created ?? null,
          created_at: current?.created_at ?? nowIso,
          found_at: result.found_at ?? current?.found_at ?? nowIso,
          found_by_user_id: user?.id != null ? Number(user.id) : current?.found_by_user_id ?? null,
          is_accessible: true,
          can_echo: result.can_echo,
          echo_count: current?.echo_count ?? 0,
          yuan_ji: result.content ?? current?.yuan_ji ?? null,
          echoes: current?.echoes ?? [],
        }));
        setActiveCapsule((current) =>
          current
            ? {
                ...current,
                status: result.capsule_status,
              }
            : current
        );
        const refreshRequestId = ++capsuleDetailRequestId.current;
        setCapsuleDetailLoading(true);
        void capsuleApi
          .getDetail(activeCapsule.id, user?.id)
          .then((detail) => {
            if (refreshRequestId === capsuleDetailRequestId.current) {
              setActiveCapsuleDetail(detail);
            }
          })
          .catch(() => {
            // 即时反馈已经展示，这里静默回退，避免把“已开启”误报成失败。
          })
          .finally(() => {
            if (refreshRequestId === capsuleDetailRequestId.current) {
              setCapsuleDetailLoading(false);
            }
          });
      } else {
        setCapsuleJustUnlocked(false);
        setCapsuleRevealStage("idle");
        setCapsuleMessage(result.message || (result.result === "close" ? "方向对了，再想想。" : "暂未解锁成功。"));
        setCapsuleMessageTone(result.result === "close" ? "warning" : "neutral");
      }
    } catch (error) {
      setCapsuleMessage(error instanceof Error ? error.message : "胶囊解锁失败。");
      setCapsuleMessageTone("error");
    } finally {
      setCapsuleUnlocking(false);
    }
  };

  const handleSaveSelectedAnchor = async () => {
    if (!selectedAnchor || selectedAnchorSaving) return;
    setSelectedAnchorSaving(true);
    setPageError("");
    try {
      const updated = await travel.updateAnchor(selectedAnchor.id, { user_text: selectedAnchorText.trim() });
      if (updated) {
        setSelectedAnchor(updated);
      }
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "保存锚点失败，请稍后重试。");
    } finally {
      setSelectedAnchorSaving(false);
    }
  };

  const handleSubmitCapsuleEcho = async () => {
    if (!activeCapsule || !user?.id || !capsuleEcho.trim() || capsuleEchoSubmitting) return;
    setCapsuleEchoSubmitting(true);
    setCapsuleMessage("");
    try {
      await capsuleApi.addEcho(activeCapsule.id, capsuleEcho.trim(), user.id);
      const detail = await capsuleApi.getDetail(activeCapsule.id, user.id);
      setActiveCapsuleDetail(detail);
      setCapsuleEcho("");
      setCapsuleEchoEditorOpen(false);
      setCapsuleMessage("回响已留下，对方下次经过这里时会收到通知。");
    } catch (error) {
      setCapsuleMessage(error instanceof Error ? error.message : "留下回响失败。");
    } finally {
      setCapsuleEchoSubmitting(false);
    }
  };

  const [capsuleModalOpen, setCapsuleModalOpen] = useState(false);
  const [capsuleYuanji, setCapsuleYuanji] = useState("");
  const [capsuleKeyQuestion, setCapsuleKeyQuestion] = useState("");
  const [capsuleKeyAnswer, setCapsuleKeyAnswer] = useState("");
  const [capsuleTimeLockEnabled, setCapsuleTimeLockEnabled] = useState(false);
  const [capsuleTimeLockUntil, setCapsuleTimeLockUntil] = useState("");
  const [capsuleSubmitting, setCapsuleSubmitting] = useState(false);

  const handleCreateCapsule = async () => {
    if (!capsuleYuanji.trim() || !capsuleKeyQuestion.trim() || capsuleSubmitting) return;
    if (capsuleTimeLockEnabled && !capsuleTimeLockUntil) {
      setPageError("请先设置时间锁日期。");
      return;
    }
    setCapsuleSubmitting(true);
    setPageError("");

    try {
      const result = await travel.createCapsule(
        capsuleYuanji.trim(),
        capsuleKeyQuestion.trim(),
        capsuleKeyAnswer.trim(),
        {
          city: weatherData?.city || undefined,
          timeLockUntil: capsuleTimeLockEnabled && capsuleTimeLockUntil ? new Date(capsuleTimeLockUntil).toISOString() : undefined,
          weatherWhenCreated: weatherData?.weather || undefined,
        }
      );
      if (result.success) {
        setCapsuleYuanji("");
        setCapsuleKeyQuestion("");
        setCapsuleKeyAnswer("");
        setCapsuleTimeLockEnabled(false);
        setCapsuleTimeLockUntil("");
        setCapsuleModalOpen(false);
      } else {
        setPageError(result.error || "创建胶囊失败，请稍后重试。");
      }
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "创建胶囊失败，请稍后重试。");
    } finally {
      setCapsuleSubmitting(false);
    }
  };

  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remain = seconds % 60;
    return `${minutes.toString().padStart(2, "0")}:${remain.toString().padStart(2, "0")}`;
  };

  return (
    <div
      className="relative min-h-full w-full overflow-hidden"
      style={{ fontFamily: "'Noto Serif SC', serif", background: palette.pageBackground }}
    >
      <AnimatePresence mode="wait">
        {journeyState === "idle" && (
          <motion.div
            key="idle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="min-h-full pb-28"
          >
            <div className="relative h-[58dvh] overflow-hidden">
              <HeroPhotoCarousel items={heroItems} />
            </div>

            <div className="relative -mt-6 space-y-4 px-5">
              {pageError && <InlineNotice message={pageError} />}
              {summaryError && <InlineNotice message={summaryError} />}

              <motion.button
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                whileTap={{ scale: 0.98 }}
                onClick={travel.isActive ? () => setJourneyState("traveling") : handleStartJourney}
                className="w-full rounded-[1.8rem] border border-white/60 bg-white/80 p-5 text-left shadow-[0_8px_40px_rgba(180,140,100,0.1)] backdrop-blur-2xl"
              >
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-amber-100 to-orange-50 shadow-inner">
                      {travel.isActive ? (
                        <div className="relative h-3 w-3 rounded-full bg-rose-400">
                          <div className="absolute inset-0 rounded-full bg-rose-400 opacity-40 animate-ping" />
                        </div>
                      ) : (
                        <Play size={22} className="ml-0.5 text-amber-700" />
                      )}
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-lg tracking-wide text-stone-800">
                      {travel.isActive ? "返回旅途中" : "开启缘旅"}
                    </h3>
                    <p className="mt-0.5 text-xs tracking-wide text-stone-400" style={{ fontFamily: "sans-serif" }}>
                      {travel.isActive
                        ? `${formatDuration(travel.duration)} · ${travel.distance.toFixed(2)} km · ${travel.anchors.length} 个锚点`
                        : "轨迹 · 锚点 · 胶囊 · 旅记"}
                    </p>
                  </div>
                </div>
              </motion.button>

              {lastJourney && (
                <InfoCard
                  icon={<BookOpen size={15} className="text-stone-400" />}
                  label="上次旅途"
                  title={lastJourney.diary_title || lastJourney.city || "最近一段旅程"}
                  subtitle={lastJourney.diary_excerpt || "已存入记忆页"}
                  meta={`${lastJourney.total_distance.toFixed(1)} km`}
                  extra={new Date(lastJourney.start_time).toLocaleDateString("zh-CN")}
                />
              )}
            </div>
          </motion.div>
        )}

        {journeyState === "traveling" && (
          <motion.div
            key="traveling"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-20 flex h-full flex-col"
          >
            <div className="absolute inset-0">
              <Suspense fallback={<JourneyMapFallback />}>
                <MapboxRomanceMap
                  center={mapCenter}
                  trajectoryPath={trajectoryPath}
                  anchors={displayAnchors}
                  capsules={visibleCapsules}
                  onAnchorClick={setSelectedAnchor}
                  onCapsuleClick={handleCapsuleMarkerClick}
                  routePath={showRoute ? routePoints : undefined}
                  lineColor="#e85d3a"
                  lineWidth={8}
                />
              </Suspense>
            </div>

            <div className="relative z-30 px-4 pb-6 pt-12">
              <div className="rounded-[1.5rem] border border-white/60 bg-white/80 px-4 py-3 shadow-[0_4px_30px_rgba(0,0,0,0.06)] backdrop-blur-2xl">
                <div className="mb-2 flex items-center justify-between">
                  <button
                    onClick={() => setJourneyState("idle")}
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-stone-600 shadow-md"
                    title="返回首页"
                  >
                    <ArrowLeft size={16} />
                  </button>
                  <button
                    onClick={() => void handleEndJourney()}
                    className="flex items-center gap-1.5 rounded-full bg-stone-800 px-4 py-2 text-xs text-white"
                    style={{ fontFamily: "sans-serif" }}
                  >
                    <StopCircle size={13} />
                    <span>结束旅途</span>
                  </button>
                </div>

                <div className="flex items-center gap-3">
                  <TravelMetric icon={<Clock size={13} className="text-amber-600/70" />} text={formatDuration(travel.duration)} />
                  <TravelMetric icon={<Navigation size={13} className="text-amber-600/70" />} text={`${travel.distance.toFixed(2)} km`} />
                  <TravelMetric icon={<AnchorIcon size={13} className="text-amber-600/70" />} text={`${displayAnchors.length} 锚点`} />
                </div>

                {pageError && <p className="mt-2 text-[11px] text-rose-500">{pageError}</p>}
                {pendingAnchorCount > 0 && (
                  <p className="mt-2 text-[11px] text-amber-600">
                    正在识别 {pendingAnchorCount} 个停留点…
                  </p>
                )}
                {showRoute && targetCapsule && (
                  <div className="mt-3 rounded-2xl border border-sky-100 bg-sky-50/90 px-3 py-3 text-[11px] text-sky-700">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">正沿着蓝色的路去寻找一枚胶囊</p>
                        <p className="mt-1 text-sky-700">
                          {routeLiveState?.currentInstruction || "沿着蓝色的路继续走"}
                        </p>
                        <p className="mt-1 text-sky-600/80">
                          还要走 {formatMeters(routeLiveState?.remainingDistanceM ?? routeSummary?.distanceM ?? getDistanceToCapsule(targetCapsule))} ·{" "}
                          {formatMinutes(routeLiveState?.remainingDurationS ?? routeSummary?.durationS)}
                        </p>
                        {routeLiveState?.nextInstruction && (
                          <p className="mt-1 text-sky-500/90">接下来：{routeLiveState.nextInstruction}</p>
                        )}
                        {(routeLiveState?.offRouteDistanceM ?? 0) > 45 && (
                          <p className="mt-1 text-amber-600">
                            你好像偏离蓝线 {formatMeters(routeLiveState?.offRouteDistanceM)}，可以重新织一条路。
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 gap-2">
                        {(routeLiveState?.offRouteDistanceM ?? 0) > 45 && (
                          <button
                            onClick={handleRefreshRoute}
                            disabled={routeRefreshing}
                            className="rounded-full bg-white px-3 py-1 text-[11px] text-sky-700 shadow-sm disabled:opacity-60"
                            style={{ fontFamily: "sans-serif" }}
                          >
                            {routeRefreshing ? "重算中…" : "重新织路"}
                          </button>
                        )}
                        {routeExternalLink && (
                          <button
                            onClick={() => window.open(routeExternalLink, "_blank", "noopener,noreferrer")}
                            className="rounded-full bg-white px-3 py-1 text-[11px] text-sky-700 shadow-sm"
                            style={{ fontFamily: "sans-serif" }}
                          >
                            打开导航
                          </button>
                        )}
                        <button
                          onClick={clearRoutePlan}
                          className="rounded-full bg-white px-3 py-1 text-[11px] text-sky-700 shadow-sm"
                          style={{ fontFamily: "sans-serif" }}
                        >
                          取消寻路
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                {!mapCenter && <p className="mt-2 text-[11px] text-stone-400">正在等待定位结果…</p>}
              </div>
            </div>

            <div className="relative z-30 mt-auto px-4 pb-8">
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setAnchorText("");
                    setAnchorModalOpen(true);
                  }}
                  className="flex flex-1 items-center gap-2.5 rounded-2xl border border-white/60 bg-white/80 px-4 py-3 shadow-[0_4px_20px_rgba(0,0,0,0.06)] backdrop-blur-2xl"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-50 text-amber-600">
                    <Plus size={16} />
                  </div>
                  <div className="text-left">
                    <h4 className="text-xs text-stone-700">添加锚点</h4>
                    <p className="text-[10px] text-stone-400" style={{ fontFamily: "sans-serif" }}>
                      把这一刻悄悄留在旅途中
                    </p>
                  </div>
                </button>

                <button
                  onClick={() => {
                    setCapsuleYuanji("");
                    setCapsuleKeyQuestion("");
                    setCapsuleKeyAnswer("");
                    setCapsuleTimeLockEnabled(false);
                    setCapsuleTimeLockUntil("");
                    setCapsuleModalOpen(true);
                  }}
                  className="flex items-center gap-2.5 rounded-2xl border border-white/60 bg-white/80 px-4 py-3 shadow-[0_4px_20px_rgba(0,0,0,0.06)] backdrop-blur-2xl"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
                    <Lock size={16} />
                  </div>
                  <div className="text-left">
                    <h4 className="text-xs text-stone-700">埋下胶囊</h4>
                    <p className="text-[10px] text-stone-400" style={{ fontFamily: "sans-serif" }}>
                      在当前位置埋下时空胶囊
                    </p>
                  </div>
                </button>

                <div className="flex items-center rounded-2xl border border-white/60 bg-white/80 px-4 text-xs text-stone-500 shadow-[0_4px_20px_rgba(0,0,0,0.06)] backdrop-blur-2xl">
                  <span style={{ fontFamily: "sans-serif" }}>
                    胶囊 {visibleCapsules.length}
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {journeyState === "generating" && (
          <motion.div
            key="generating"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-[linear-gradient(135deg,#1a1714_0%,#2d2520_40%,#1e1b18_100%)] px-8 text-center"
          >
            <div className="relative mb-10 h-20 w-20">
              <motion.div
                className="absolute inset-0 rounded-full border border-amber-400/20"
                animate={{ rotate: 360 }}
                transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
              />
              <motion.div
                className="absolute inset-2 rounded-full border-t border-amber-300/40"
                animate={{ rotate: -360 }}
                transition={{ duration: 5, repeat: Infinity, ease: "linear" }}
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <Sparkles size={20} className="text-amber-300/60" />
              </div>
            </div>
            <p className="text-lg tracking-[0.15em] text-amber-100/70">{LOADING_PHRASES[phraseIndex]}</p>
          </motion.div>
        )}

        {journeyState === "summary" && summaryData && (
          <motion.div
            key="summary"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 z-40 overflow-y-auto bg-[linear-gradient(135deg,#ffecd2_0%,#fcb69f_100%)]"
          >
            <div className="pb-20">
              <div className="relative h-[34dvh] overflow-hidden">
                {summaryData.image ? (
                  <img src={summaryData.image} alt={summaryData.title} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.4),_transparent_40%),linear-gradient(135deg,_rgba(251,191,36,0.2),_rgba(251,146,60,0.35))]">
                    <div className="flex flex-col items-center gap-3 px-6 text-center">
                      {summaryData.notebookImageRequested && summaryData.notebookImageStatus === "generating" ? (
                        <>
                          <div className="h-8 w-8 rounded-full border-2 border-white/30 border-t-white/90 animate-spin" />
                          <div>
                            <p className="text-sm text-white/95">Qwen-Image 正在显影这页手帐…</p>
                            <p className="mt-1 text-xs text-white/75">文字已经生成，封面会自动补上。</p>
                          </div>
                        </>
                      ) : summaryData.notebookImageRequested && summaryData.notebookImageStatus === "failed" ? (
                        <>
                          <BookOpen size={30} className="text-white/80" />
                          <div>
                            <p className="text-sm text-white/95">这次手帐显影慢了一步</p>
                            <p className="mt-1 text-xs text-white/75">旅记文字已保存，稍后可以继续查看。</p>
                          </div>
                        </>
                      ) : (
                        <BookOpen size={30} className="text-white/80" />
                      )}
                    </div>
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-orange-900/50 via-transparent to-transparent" />
              </div>

              <div className="relative -mt-14 mx-4 rounded-[2.5rem] border border-white/50 bg-white/95 p-8 shadow-[0_20px_60px_rgba(0,0,0,0.25)] backdrop-blur-2xl">
                {summaryEditing && summaryDraft ? (
                  <input
                    value={summaryDraft.title}
                    onChange={(event) =>
                      setSummaryDraft((current) => (current ? { ...current, title: event.target.value } : current))
                    }
                    placeholder="给这段旅途起个名字"
                    className="mb-3 w-full border-none bg-transparent text-center text-3xl tracking-wider text-orange-500 outline-none"
                    style={{ fontWeight: 600 }}
                  />
                ) : (
                  <h2 className="mb-3 text-center text-3xl tracking-wider text-orange-500" style={{ fontWeight: 600 }}>
                    {summaryData.title}
                  </h2>
                )}
                <p className="mb-8 text-center text-xs tracking-[0.25em] text-orange-400" style={{ fontFamily: "sans-serif" }}>
                  {summaryData.date}
                </p>
                {summaryError && (
                  <p className="mb-5 text-center text-xs text-rose-500/90">{summaryError}</p>
                )}
                {summaryData.notebookImageRequested && summaryData.notebookImageStatus === "generating" && (
                  <p className="mb-5 text-center text-xs text-orange-500/90">
                    AI 手帐仍在显影中，封面生成后会自动回到这里。
                  </p>
                )}
                {summaryData.notebookImageRequested && summaryData.notebookImageStatus === "failed" && (
                  <p className="mb-5 text-center text-xs text-rose-500/80">
                    AI 手帐暂未生成成功，但旅记正文已经完整保存。
                  </p>
                )}

                <div className="space-y-5">
                  {summaryEditing && summaryDraft ? (
                    <>
                      {summaryDraft.content.map((segment, index) => (
                        <div key={`${index}-${segment.source}`} className="rounded-2xl border border-orange-100 bg-orange-50/35 p-4">
                          <div className="mb-2 flex items-center justify-between gap-3">
                            <span
                              className={`rounded-full px-2.5 py-1 text-[10px] tracking-[0.18em] ${
                                segment.source === "ai"
                                  ? "bg-orange-100 text-orange-600"
                                  : segment.source === "user"
                                    ? "bg-stone-100 text-stone-600"
                                    : "bg-pink-100 text-pink-500"
                              }`}
                              style={{ fontFamily: "sans-serif" }}
                            >
                              {segment.source === "ai" ? "AI 织写" : segment.source === "user" ? "我的补写" : "记忆回声"}
                            </span>
                            {summaryDraft.content.length > 1 && (
                              <button
                                onClick={() => handleRemoveSummarySegment(index)}
                                className="text-xs text-stone-400"
                                style={{ fontFamily: "sans-serif" }}
                              >
                                删除
                              </button>
                            )}
                          </div>
                          <textarea
                            value={segment.text}
                            onChange={(event) => handleSummarySegmentChange(index, event.target.value)}
                            placeholder="把这段旅途改成你更喜欢的样子"
                            className="min-h-24 w-full resize-none border-none bg-transparent text-sm leading-[1.9] tracking-wide text-stone-700 outline-none"
                          />
                        </div>
                      ))}
                      <button
                        onClick={handleAddSummarySegment}
                        className="w-full rounded-2xl border border-dashed border-orange-200 px-4 py-3 text-sm text-orange-500"
                        style={{ fontFamily: "sans-serif" }}
                      >
                        + 新增一段我的补写
                      </button>
                    </>
                  ) : (
                    summaryData.content.map((paragraph, index) => {
                      const source = typeof paragraph === "string" ? "plain" : paragraph.source;
                      const text = typeof paragraph === "string" ? paragraph : paragraph.text;
                      return (
                        <p
                          key={`${index}-${text.slice(0, 12)}`}
                          className={`text-sm leading-[1.9] tracking-wide ${
                            source === "ai"
                              ? "font-medium text-orange-600"
                              : source === "user"
                                ? "text-stone-800"
                                : source === "rag"
                                  ? "italic text-pink-400"
                                  : "text-stone-700"
                          }`}
                        >
                          {text}
                        </p>
                      );
                    })
                  )}
                </div>

                <div className="mt-8 flex flex-wrap gap-3">
                  {summaryEditing ? (
                    <>
                      <button
                        onClick={handleSaveSummary}
                        disabled={summarySaving}
                        className="flex flex-1 items-center justify-center rounded-full bg-stone-800 px-6 py-4 text-sm text-white disabled:opacity-60"
                        style={{ fontFamily: "sans-serif" }}
                      >
                        {summarySaving ? "正在保存…" : "保存修改"}
                      </button>
                      <button
                        onClick={handleCancelSummaryEdit}
                        disabled={summarySaving}
                        className="rounded-full border-2 border-orange-200 bg-white px-6 py-4 font-medium text-orange-600 disabled:opacity-60"
                      >
                        取消编辑
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => void handleGenerateNotebook()}
                        disabled={
                          notebookActionLoading ||
                          summaryData.notebookImageStatus === "generating" ||
                          (summaryData.notebookImageStatus === "ready" && Boolean(summaryData.image))
                        }
                        className="flex flex-1 items-center justify-center gap-2 rounded-full bg-stone-800 px-6 py-4 text-sm text-white disabled:opacity-60"
                        style={{ fontFamily: "sans-serif" }}
                      >
                        <Sparkles size={18} />
                        <span>
                          {notebookActionLoading
                            ? "正在唤起手帐…"
                            : summaryData.notebookImageStatus === "generating"
                              ? "手帐显影中…"
                              : summaryData.notebookImageStatus === "ready" && summaryData.image
                                ? "手帐已生成"
                                : summaryData.notebookImageStatus === "failed"
                                  ? "重新生成手帐"
                                  : "生成手帐"}
                        </span>
                      </button>
                      <button
                        onClick={handleStartSummaryEdit}
                        className="rounded-full border-2 border-orange-200 bg-white px-6 py-4 font-medium text-orange-600"
                      >
                        编辑旅记
                      </button>
                      <button
                        onClick={() => {
                          setSummaryData(null);
                          setSummaryEditing(false);
                          setSummaryDraft(null);
                          setJourneyState("idle");
                        }}
                        className="rounded-full border-2 border-orange-200 bg-white px-6 py-4 font-medium text-orange-600"
                      >
                        完成
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {anchorModalOpen && (
          <ModalShell title="添加锚点" onClose={() => setAnchorModalOpen(false)}>
            <textarea
              value={anchorText}
              onChange={(event) => setAnchorText(event.target.value)}
              placeholder="把这一刻写下来，留给未来的自己回看。"
              className="min-h-28 w-full rounded-2xl border border-stone-200 bg-stone-50/80 px-4 py-3 text-sm text-stone-700 outline-none"
            />
            <button
              onClick={handleAddAnchor}
              disabled={anchorSubmitting || !anchorText.trim()}
              className="mt-4 w-full rounded-2xl bg-stone-800 px-4 py-3 text-sm text-white disabled:opacity-60"
            >
              {anchorSubmitting ? "正在保存…" : "保存锚点"}
            </button>
          </ModalShell>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {capsuleModalOpen && (
          <ModalShell title="埋下时空胶囊" onClose={() => setCapsuleModalOpen(false)}>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">胶囊内容</label>
                <textarea
                  value={capsuleYuanji}
                  onChange={(event) => setCapsuleYuanji(event.target.value)}
                  placeholder="写下你想留给未来的文字，可以是心情、感悟或对陌生人的寄语..."
                  className="w-full min-h-20 rounded-2xl border border-stone-200 bg-stone-50/80 px-4 py-3 text-sm text-stone-700 outline-none"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">解锁问题</label>
                <input
                  type="text"
                  value={capsuleKeyQuestion}
                  onChange={(event) => setCapsuleKeyQuestion(event.target.value)}
                  placeholder="设置一个只有特定人群才能回答的问题"
                  className="w-full rounded-2xl border border-stone-200 bg-stone-50/80 px-4 py-3 text-sm text-stone-700 outline-none"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">标准答案锚点（强烈建议填写）</label>
                <input
                  type="text"
                  value={capsuleKeyAnswer}
                  onChange={(event) => setCapsuleKeyAnswer(event.target.value)}
                  placeholder="例如：海风、复旦大学邯郸校区、梧桐叶"
                  className="w-full rounded-2xl border border-stone-200 bg-stone-50/80 px-4 py-3 text-sm text-stone-700 outline-none"
                />
                <p className="mt-2 text-[11px] leading-5 text-stone-400" style={{ fontFamily: "sans-serif" }}>
                  它会作为解锁时的语义锚点，不会展示给其他旅人；不填写时，别人会更难稳定打开它。
                </p>
              </div>

              <div className="rounded-2xl border border-stone-200 bg-stone-50/70 px-4 py-3">
                <label className="flex items-center justify-between gap-3 text-sm text-stone-700">
                  <span>时间锁</span>
                  <input
                    type="checkbox"
                    checked={capsuleTimeLockEnabled}
                    onChange={(event) => {
                      setCapsuleTimeLockEnabled(event.target.checked);
                      if (!event.target.checked) {
                        setCapsuleTimeLockUntil("");
                      }
                    }}
                    className="h-4 w-4"
                  />
                </label>
                <p className="mt-1 text-[11px] text-stone-400" style={{ fontFamily: "sans-serif" }}>
                  开启后，胶囊将在指定时间后才会被附近旅人发现。
                </p>
                {capsuleTimeLockEnabled && (
                  <input
                    type="datetime-local"
                    value={capsuleTimeLockUntil}
                    onChange={(event) => setCapsuleTimeLockUntil(event.target.value)}
                    className="mt-3 w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700 outline-none"
                  />
                )}
              </div>
            </div>
            
            <button
              onClick={handleCreateCapsule}
              disabled={
                capsuleSubmitting ||
                !capsuleYuanji.trim() ||
                !capsuleKeyQuestion.trim() ||
                (capsuleTimeLockEnabled && !capsuleTimeLockUntil)
              }
              className="mt-4 w-full rounded-2xl bg-indigo-600 px-4 py-3 text-sm text-white disabled:opacity-60"
            >
              {capsuleSubmitting ? "正在创建…" : "埋下胶囊"}
            </button>
          </ModalShell>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {arrivalPromptCapsule && (
          <ModalShell
            title="你已经走到它身边"
            onClose={() => setArrivalPromptCapsule(null)}
          >
            <div className="rounded-2xl bg-amber-50 px-4 py-4 text-sm text-amber-800">
              <p className="leading-7">
                风已经把你带到了这枚胶囊身边。现在，你可以轻轻把它打开了。
              </p>
              <p className="mt-2 text-xs text-amber-600">
                路线已经替你收起，接下来只剩下和它相遇。
              </p>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <button
                onClick={() => setArrivalPromptCapsule(null)}
                className="rounded-2xl border border-stone-200 px-4 py-3 text-sm text-stone-500"
              >
                稍后再看
              </button>
              <button
                onClick={() => {
                  setActiveCapsule(arrivalPromptCapsule);
                  setArrivalPromptCapsule(null);
                }}
                className="rounded-2xl bg-amber-500 px-4 py-3 text-sm text-white"
              >
                开启胶囊
              </button>
            </div>
          </ModalShell>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {routePromptCapsule && (
          <ModalShell
            title="去寻找它吗？"
            onClose={() => {
              if (routePlanning) return;
              setRoutePromptCapsule(null);
              setRoutePromptDistance(null);
              setRoutePromptMessage("");
            }}
          >
            <div className="rounded-2xl bg-sky-50 px-4 py-4 text-sm text-sky-800">
              <p className="leading-7">{ROMANTIC_ROUTE_COPY}</p>
              <p className="mt-2 text-xs text-sky-600">
                它离你还有 {formatMeters(routePromptDistance)}，轻轻点下去，我会把路铺成蓝色。
              </p>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <button
                onClick={() => {
                  setRoutePromptCapsule(null);
                  setRoutePromptDistance(null);
                  setRoutePromptMessage("");
                }}
                disabled={routePlanning}
                className="rounded-2xl border border-stone-200 px-4 py-3 text-sm text-stone-500 disabled:opacity-60"
              >
                先记下它
              </button>
              <button
                onClick={handlePlanRouteToCapsule}
                disabled={routePlanning}
                className="rounded-2xl bg-sky-600 px-4 py-3 text-sm text-white disabled:opacity-60"
              >
                {routePlanning ? "正在把路铺开…" : "沿着风去找"}
              </button>
            </div>

            {routePromptMessage && <p className="mt-3 text-sm text-stone-500">{routePromptMessage}</p>}
          </ModalShell>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedAnchor && (
          <ModalShell title={selectedAnchor.poi_name || "锚点详情"} onClose={() => setSelectedAnchor(null)}>
            <div className="space-y-4 text-sm text-stone-600">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <StatusBadge label={anchorStatusLabel(selectedAnchor.status)} tone={selectedAnchor.status} />
                <StatusBadge label={agentStatusLabel(selectedAnchor.agent_status)} tone={selectedAnchor.agent_status} />
              </div>

              <div className="space-y-1 text-xs text-stone-400">
                <p>时间：{selectedAnchor.created_at ? new Date(selectedAnchor.created_at).toLocaleString("zh-CN") : "未知"}</p>
                {selectedAnchor.weather && <p>天气：{selectedAnchor.weather}{selectedAnchor.temperature != null ? ` · ${selectedAnchor.temperature}°C` : ""}</p>}
                {selectedAnchor.poi_type && <p>地点类型：{selectedAnchor.poi_type}</p>}
              </div>

              {selectedAnchor.ai_description && (
                <div className="rounded-2xl bg-amber-50/80 px-4 py-3">
                  <p className="mb-1 text-[11px] tracking-[0.2em] text-amber-600/70" style={{ fontFamily: "sans-serif" }}>
                    AI 感知
                  </p>
                  <p className="leading-7 text-stone-700">{selectedAnchor.ai_description}</p>
                </div>
              )}

              {selectedAnchor.photo_url && (
                <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
                  <img
                    src={selectedAnchor.photo_url}
                    alt={selectedAnchor.poi_name || "锚点照片"}
                    className="h-44 w-full object-cover"
                  />
                </div>
              )}

              <div>
                <label className="mb-2 block text-xs tracking-[0.18em] text-stone-400" style={{ fontFamily: "sans-serif" }}>
                  我的补写
                </label>
                <textarea
                  value={selectedAnchorText}
                  onChange={(event) => setSelectedAnchorText(event.target.value)}
                  placeholder="补写你在这里的感受，让这枚锚点更完整。"
                  className="min-h-28 w-full rounded-2xl border border-stone-200 bg-stone-50/80 px-4 py-3 text-sm text-stone-700 outline-none"
                />
              </div>

              {!!selectedAnchor.emotion_tags && Array.isArray(selectedAnchor.emotion_tags) && selectedAnchor.emotion_tags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {selectedAnchor.emotion_tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-stone-100 px-3 py-1 text-[11px] text-stone-500"
                      style={{ fontFamily: "sans-serif" }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              <button
                onClick={handleSaveSelectedAnchor}
                disabled={selectedAnchorSaving}
                className="w-full rounded-2xl bg-stone-800 px-4 py-3 text-sm text-white disabled:opacity-60"
              >
                {selectedAnchorSaving ? "正在保存…" : "保存补写"}
              </button>
            </div>
          </ModalShell>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {activeCapsule && (
          <ModalShell title="时空胶囊" onClose={() => setActiveCapsule(null)}>
            <div className="rounded-2xl bg-indigo-50 px-4 py-3 text-sm text-indigo-700">
              <div className="mb-2 flex items-center gap-2">
                <Lock size={15} />
                <span>{activeCapsuleDetail?.key_question || activeCapsule.key_question || "回答问题后即可尝试解锁。"}</span>
              </div>
              <p className="text-xs text-indigo-500">
                {getDistanceToCapsule(activeCapsule) != null
                  ? `距离 ${Math.round(getDistanceToCapsule(activeCapsule) ?? 0)} m`
                  : "靠近后即可尝试开启"}
              </p>
            </div>

            {capsuleDetailLoading && (
              <p className="mt-4 text-xs text-stone-400" style={{ fontFamily: "sans-serif" }}>
                正在读取胶囊状态…
              </p>
            )}

            {shouldShowCapsuleReveal ? (
              <div className="mt-4 space-y-4">
                {capsuleMessage && (
                  <CapsuleFeedbackCard message={capsuleMessage} tone={capsuleMessageTone} />
                )}

                <CapsuleRevealCard
                  detail={activeCapsuleDetail}
                  revealStage={capsuleRevealStage}
                  justUnlocked={capsuleJustUnlocked}
                  detailLoading={capsuleDetailLoading}
                  contentWaiting={capsuleContentWaiting}
                />

                {activeCapsuleDetail?.echoes && activeCapsuleDetail.echoes.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs tracking-[0.18em] text-stone-400" style={{ fontFamily: "sans-serif" }}>
                      已有回响
                    </p>
                    {activeCapsuleDetail.echoes.map((echo) => (
                      <div key={echo.id} className="rounded-2xl border border-stone-200 bg-white px-4 py-3">
                        <p className="text-sm leading-6 text-stone-700">{echo.content}</p>
                        <p className="mt-2 text-[11px] text-stone-400" style={{ fontFamily: "sans-serif" }}>
                          {new Date(echo.created_at).toLocaleString("zh-CN")}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                {activeCapsuleDetail?.can_echo && (
                  <div className="rounded-2xl border border-stone-200 bg-stone-50/70 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm text-stone-700">想给这枚胶囊留一句回响吗？</p>
                        <p className="mt-1 text-[11px] text-stone-400" style={{ fontFamily: "sans-serif" }}>
                          会以匿名方式送回给埋下它的人。
                        </p>
                      </div>
                      <button
                        onClick={() => setCapsuleEchoEditorOpen((current) => !current)}
                        className="shrink-0 rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs text-stone-600 shadow-sm"
                        style={{ fontFamily: "sans-serif" }}
                      >
                        {capsuleEchoEditorOpen ? "收起回响" : "写回响"}
                      </button>
                    </div>

                    <AnimatePresence initial={false}>
                      {capsuleEchoEditorOpen && (
                        <motion.div
                          initial={{ opacity: 0, height: 0, y: -6 }}
                          animate={{ opacity: 1, height: "auto", y: 0 }}
                          exit={{ opacity: 0, height: 0, y: -6 }}
                          className="overflow-hidden"
                        >
                          <label className="mb-2 mt-3 block text-xs tracking-[0.18em] text-stone-400" style={{ fontFamily: "sans-serif" }}>
                            留下一段匿名回响
                          </label>
                          <textarea
                            value={capsuleEcho}
                            onChange={(event) => setCapsuleEcho(event.target.value)}
                            placeholder="写下你在这里收到的感受。"
                            className="min-h-24 w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700 outline-none"
                          />
                          <div className="mt-3 flex gap-2">
                            <button
                              onClick={() => {
                                setCapsuleEcho("");
                                setCapsuleEchoEditorOpen(false);
                              }}
                              disabled={capsuleEchoSubmitting}
                              className="flex-1 rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-500 disabled:opacity-60"
                            >
                              取消
                            </button>
                            <button
                              onClick={handleSubmitCapsuleEcho}
                              disabled={capsuleEchoSubmitting || !capsuleEcho.trim()}
                              className="flex-1 rounded-2xl bg-stone-800 px-4 py-3 text-sm text-white disabled:opacity-60"
                            >
                              {capsuleEchoSubmitting ? "正在留下回响…" : "发送回响"}
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}
              </div>
            ) : (
              <>
                <textarea
                  value={capsuleAnswer}
                  onChange={(event) => setCapsuleAnswer(event.target.value)}
                  placeholder="写下你的回答"
                  className="mt-4 min-h-28 w-full rounded-2xl border border-stone-200 bg-stone-50/80 px-4 py-3 text-sm text-stone-700 outline-none"
                />
                <button
                  onClick={handleUnlockCapsule}
                  disabled={capsuleUnlocking || !capsuleAnswer.trim()}
                  className="mt-4 w-full rounded-2xl bg-indigo-600 px-4 py-3 text-sm text-white disabled:opacity-60"
                >
                  {capsuleUnlocking ? "正在判断…" : "提交答案"}
                </button>
                {capsuleUnlocking && (
                  <p className="mt-3 text-center text-xs text-stone-400" style={{ fontFamily: "sans-serif" }}>
                    正在轻轻比对你的回答与这枚胶囊的记忆。
                  </p>
                )}
              </>
            )}

            {!shouldShowCapsuleReveal && capsuleMessage && (
              <CapsuleFeedbackCard message={capsuleMessage} tone={capsuleMessageTone} className="mt-3" />
            )}
          </ModalShell>
        )}
      </AnimatePresence>
    </div>
  );
}

function TravelMetric({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="flex flex-1 items-center gap-1.5">
      {icon}
      <span className="text-xs text-stone-600" style={{ fontFamily: "sans-serif" }}>
        {text}
      </span>
    </div>
  );
}

function InfoCard({
  icon,
  label,
  title,
  subtitle,
  meta,
  extra,
}: {
  icon: ReactNode;
  label: string;
  title: string;
  subtitle: string;
  meta: string;
  extra: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-[1.8rem] border border-white/40 bg-white/50 p-5 backdrop-blur-xl"
    >
      <div className="mb-3 flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-stone-100">{icon}</div>
        <span className="text-xs tracking-widest text-stone-500" style={{ fontFamily: "sans-serif" }}>
          {label}
        </span>
      </div>
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-2">
            <MapPin size={13} className="text-amber-500/70" />
            <span className="text-sm text-stone-700">{title}</span>
          </div>
          <p className="text-xs text-stone-400">{subtitle}</p>
          <p className="mt-1 text-[10px] text-stone-300">{extra}</p>
        </div>
        <div className="text-right">
          <span className="text-2xl text-stone-600" style={{ fontWeight: 200 }}>
            {meta}
          </span>
        </div>
      </div>
    </motion.div>
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
        className="w-full max-w-sm rounded-[2rem] bg-white p-5 shadow-2xl"
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

function InlineNotice({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-rose-100 bg-rose-50/80 px-4 py-3 text-sm text-rose-500">
      {message}
    </div>
  );
}

function CapsuleFeedbackCard({
  message,
  tone,
  className = "",
}: {
  message: string;
  tone: "neutral" | "success" | "warning" | "error";
  className?: string;
}) {
  const palette =
    tone === "success"
      ? "border-emerald-200 bg-emerald-50/90 text-emerald-700"
      : tone === "warning"
        ? "border-amber-200 bg-amber-50/90 text-amber-700"
        : tone === "error"
          ? "border-rose-200 bg-rose-50/90 text-rose-600"
          : "border-stone-200 bg-stone-50/90 text-stone-600";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl border px-4 py-3 shadow-sm ${palette} ${className}`.trim()}
    >
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 shrink-0">
          {tone === "success" ? (
            <CheckCircle2 size={16} />
          ) : tone === "warning" ? (
            <Sparkles size={16} />
          ) : (
            <ScrollText size={16} />
          )}
        </div>
        <p className="text-sm leading-6">{message}</p>
      </div>
    </motion.div>
  );
}

function CapsuleRevealCard({
  detail,
  revealStage,
  justUnlocked,
  detailLoading,
  contentWaiting,
}: {
  detail: CapsuleDetailData | null;
  revealStage: "idle" | "opening" | "opened";
  justUnlocked: boolean;
  detailLoading: boolean;
  contentWaiting: boolean;
}) {
  const isOpening = revealStage === "opening";
  const hasContent = Boolean(detail?.yuan_ji);
  const shouldShowContent = hasContent && revealStage === "opened";
  const noteTitle = detail?.city ? `${detail.city} 的纸条` : "一张被风留住的纸条";
  const question = detail?.key_question?.trim() || "这枚胶囊没有留下额外的问题。";
  const timestamp = detail?.found_at || detail?.created_at;
  const shouldShowSparkles = justUnlocked || isOpening;
  const noteStatus = shouldShowContent ? "已展开" : contentWaiting ? "内容抵达中" : "纸条展开中";
  const notePlaceholder = contentWaiting
    ? "内容正在抵达，请再给它半秒钟。"
    : "纸条展开中，字迹正慢慢浮出来。";
  const [typedContent, setTypedContent] = useState("");
  const [isTypingContent, setIsTypingContent] = useState(false);

  useEffect(() => {
    if (!shouldShowContent || !detail?.yuan_ji) {
      setTypedContent("");
      setIsTypingContent(false);
      return;
    }

    if (!justUnlocked) {
      setTypedContent(detail.yuan_ji);
      setIsTypingContent(false);
      return;
    }

    const fullText = detail.yuan_ji;
    let currentIndex = 0;
    let cancelled = false;
    let timer: number | null = null;

    setTypedContent("");
    setIsTypingContent(true);

    const tick = () => {
      if (cancelled) return;
      const chunk = fullText.length > 110 ? 3 : fullText.length > 70 ? 2 : 1;
      currentIndex = Math.min(fullText.length, currentIndex + chunk);
      setTypedContent(fullText.slice(0, currentIndex));
      if (currentIndex >= fullText.length) {
        setIsTypingContent(false);
        return;
      }
      timer = window.setTimeout(tick, fullText.length > 110 ? 22 : 32);
    };

    timer = window.setTimeout(tick, 120);

    return () => {
      cancelled = true;
      if (timer != null) {
        window.clearTimeout(timer);
      }
    };
  }, [detail?.id, detail?.yuan_ji, justUnlocked, shouldShowContent]);

  return (
    <div className="overflow-hidden rounded-[2rem] border border-indigo-100 bg-[radial-gradient(circle_at_top,_rgba(224,231,255,0.9),_rgba(255,255,255,0.96)_55%,_rgba(244,244,245,0.95)_100%)] p-4 shadow-[0_18px_40px_rgba(79,70,229,0.08)]">
      <div className="relative h-[318px] rounded-[1.6rem] bg-[linear-gradient(180deg,rgba(79,70,229,0.08),rgba(255,255,255,0.3))] px-4 py-5">
        <div className="pointer-events-none absolute inset-x-10 top-5 h-20 rounded-full bg-indigo-300/20 blur-3xl" />
        <div className="pointer-events-none absolute inset-x-12 bottom-4 h-24 rounded-full bg-amber-200/25 blur-3xl" />

        <AnimatePresence>
          {justUnlocked && (
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.92 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8 }}
              className="absolute left-1/2 top-3 z-20 -translate-x-1/2 rounded-full bg-emerald-500 px-3 py-1 text-[11px] text-white shadow-lg"
              style={{ fontFamily: "sans-serif" }}
            >
              已为你打开
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {shouldShowSparkles &&
            CAPSULE_SPARK_PARTICLES.map((particle) => (
              <motion.span
                key={`capsule-spark-${particle.id}`}
                initial={{ opacity: 0, x: 0, y: 0, scale: 0.5 }}
                animate={{ opacity: [0, 0.95, 0], x: particle.x, y: particle.y, scale: [0.5, 1, 0.7] }}
                exit={{ opacity: 0 }}
                transition={{
                  duration: particle.duration,
                  delay: particle.delay,
                  ease: "easeOut",
                }}
                className="absolute bottom-[38%] z-[5] rounded-full bg-gradient-to-br from-amber-200 via-white to-indigo-200 shadow-[0_0_14px_rgba(255,255,255,0.85)]"
                style={{
                  left: `${particle.left}%`,
                  width: particle.size,
                  height: particle.size,
                }}
              />
            ))}
        </AnimatePresence>

        <div className="relative flex h-full items-center justify-center">
          <motion.div
            className="absolute top-[20%] h-[92px] w-[176px] rounded-t-[999px] border border-indigo-200/80 bg-[linear-gradient(180deg,rgba(129,140,248,0.92),rgba(79,70,229,0.9))] shadow-[0_14px_30px_rgba(79,70,229,0.22)]"
            animate={
              isOpening
                ? { y: -46, rotate: -10, opacity: 0.88, scaleX: 0.98 }
                : { y: hasContent ? -34 : -8, rotate: hasContent ? -6 : 0, opacity: 1, scaleX: 1 }
            }
            transition={{ duration: 0.72, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="absolute inset-x-4 top-3 h-3 rounded-full bg-white/25" />
            <div className="absolute inset-x-7 bottom-3 h-8 rounded-full bg-white/10" />
          </motion.div>

          <motion.div
            className="absolute bottom-[19%] h-[92px] w-[176px] rounded-b-[999px] border border-indigo-200/80 bg-[linear-gradient(180deg,rgba(99,102,241,0.92),rgba(67,56,202,0.94))] shadow-[0_18px_34px_rgba(79,70,229,0.22)]"
            animate={
              isOpening
                ? { y: 46, rotate: 10, opacity: 0.88, scaleX: 0.98 }
                : { y: hasContent ? 34 : 8, rotate: hasContent ? 6 : 0, opacity: 1, scaleX: 1 }
            }
            transition={{ duration: 0.72, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="absolute inset-x-4 bottom-3 h-3 rounded-full bg-white/22" />
            <div className="absolute inset-x-7 top-3 h-8 rounded-full bg-white/10" />
          </motion.div>

          <motion.div
            className="absolute h-32 w-32 rounded-full border border-indigo-200/60 bg-indigo-300/15 blur-2xl"
            animate={{
              scale: isOpening ? [0.96, 1.18, 1.04] : [1, 1.08, 1],
              opacity: isOpening ? [0.25, 0.5, 0.2] : [0.16, 0.24, 0.16],
            }}
            transition={{ duration: isOpening ? 0.95 : 2.8, repeat: Infinity, ease: "easeInOut" }}
          />

          <motion.div
            initial={false}
            animate={
              isOpening
                ? { opacity: [0, 0.08, 1], y: [34, 28, 0], scale: [0.72, 0.88, 1], rotate: [-11, -8, -2] }
                : shouldShowContent
                  ? { opacity: 1, y: [0, -8, 0], scale: [1, 1.018, 1], rotate: [-2, -1.1, -2] }
                  : { opacity: 1, y: 0, scale: 1, rotate: -2 }
            }
            transition={
              isOpening
                ? { duration: 1.05, ease: [0.16, 1, 0.3, 1] }
                : shouldShowContent
                  ? { duration: 0.56, times: [0, 0.56, 1], ease: "easeOut" }
                  : { duration: 0.32, ease: [0.16, 1, 0.3, 1] }
            }
            className="relative z-10 w-[84%] max-w-[248px]"
          >
            <div className="absolute left-7 top-[-10px] h-6 w-16 -rotate-6 rounded-sm bg-amber-100/90 shadow-sm" />
            <div className="absolute right-7 top-[-8px] h-5 w-14 rotate-6 rounded-sm bg-amber-50/90 shadow-sm" />
            <div
              className="rounded-[1.4rem] border border-amber-100 bg-[#fffdf7] px-5 pb-5 pt-6 text-stone-700 shadow-[0_18px_40px_rgba(15,23,42,0.12)]"
              style={{
                backgroundImage:
                  "linear-gradient(180deg, rgba(255,255,255,0.92), rgba(255,251,235,0.96)), repeating-linear-gradient(180deg, transparent, transparent 27px, rgba(59,130,246,0.08) 27px, rgba(59,130,246,0.08) 28px)",
              }}
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] tracking-[0.22em] text-stone-400" style={{ fontFamily: "sans-serif" }}>
                    CAPSULE NOTE
                  </p>
                  <h4 className="mt-1 text-sm text-stone-800">{noteTitle}</h4>
                </div>
                <div className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] text-emerald-600" style={{ fontFamily: "sans-serif" }}>
                  {noteStatus}
                </div>
              </div>

              <div className="mb-4 rounded-2xl bg-indigo-50/75 px-3 py-2.5">
                <p className="text-[11px] tracking-[0.18em] text-indigo-400" style={{ fontFamily: "sans-serif" }}>
                  留下的问题
                </p>
                <p className="mt-1 text-sm leading-6 text-indigo-700">{question}</p>
              </div>

              <div className="min-h-[108px] text-[15px] leading-8 text-stone-700">
                <AnimatePresence mode="wait" initial={false}>
                  {shouldShowContent ? (
                    <motion.p
                      key={`capsule-content-${detail?.id ?? "note"}`}
                      initial={{ opacity: 0, y: 8, filter: "blur(6px)" }}
                      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                      exit={{ opacity: 0, y: -6, filter: "blur(4px)" }}
                      transition={{ duration: 0.42, ease: "easeOut" }}
                    >
                      {typedContent}
                      {isTypingContent && (
                        <motion.span
                          aria-hidden="true"
                          animate={{ opacity: [0.25, 1, 0.25] }}
                          transition={{ duration: 0.9, repeat: Infinity, ease: "easeInOut" }}
                          className="ml-1 inline-block h-5 w-[2px] rounded-full bg-amber-500 align-[-2px]"
                        />
                      )}
                    </motion.p>
                  ) : (
                    <motion.div
                      key={contentWaiting ? "capsule-waiting" : "capsule-opening"}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.24, ease: "easeOut" }}
                      className="space-y-2"
                    >
                      <p className="text-stone-500">{notePlaceholder}</p>
                      {detailLoading && (
                        <p className="text-xs tracking-[0.14em] text-stone-300" style={{ fontFamily: "sans-serif" }}>
                          正在把这段话轻轻送到你面前
                        </p>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="mt-4 flex items-center justify-between gap-3 text-[11px] text-stone-400" style={{ fontFamily: "sans-serif" }}>
                <span>{timestamp ? new Date(timestamp).toLocaleString("zh-CN") : "刚刚抵达"}</span>
                <span>{detail?.echo_count ? `已有 ${detail.echo_count} 段回响` : "等待新的回响"}</span>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

function anchorStatusLabel(status: string) {
  switch (status) {
    case "candidate":
      return "候选锚点";
    case "observation":
      return "观察中";
    case "confirmed":
      return "已确认";
    case "rejected":
      return "已取消";
    default:
      return status;
  }
}

function agentStatusLabel(status: string) {
  switch (status) {
    case "candidate":
      return "等待观察";
    case "observation":
      return "等待确认";
    case "processing":
      return "AI 生成中";
    case "ready":
      return "AI 已完成";
    case "failed":
      return "AI 超时";
    case "skipped":
      return "未触发 AI";
    default:
      return status || "未知状态";
  }
}

function StatusBadge({ label, tone }: { label: string; tone: string }) {
  const palette =
    tone === "confirmed" || tone === "ready"
      ? "bg-emerald-50 text-emerald-600"
      : tone === "candidate" || tone === "observation" || tone === "processing"
        ? "bg-amber-50 text-amber-600"
        : tone === "failed" || tone === "rejected"
          ? "bg-rose-50 text-rose-500"
          : "bg-stone-100 text-stone-500";

  return (
    <span className={`rounded-full px-3 py-1 ${palette}`} style={{ fontFamily: "sans-serif" }}>
      {label}
    </span>
  );
}
