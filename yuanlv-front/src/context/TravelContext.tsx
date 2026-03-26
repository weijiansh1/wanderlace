import {
  createContext,
  useContext,
  useState,
  useRef,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react';
import { journeyApi } from '../api/journey';
import type { LocationPoint, AnchorData, CapsuleData } from '../api/types';
import { useAuth } from './AuthContext';

interface TravelState {
  isActive: boolean;
  travelId: number | string | null;
  positions: LocationPoint[];
  anchors: AnchorData[];
  capsules: CapsuleData[];
  duration: number;
  distance: number;
  currentLat: number | null;
  currentLng: number | null;
}

interface TravelContextValue extends TravelState {
  startTravel: (city?: string) => Promise<void>;
  endTravel: (options?: { generateNotebookImage?: boolean }) => Promise<void>;
  addManualAnchor: (userText: string) => Promise<AnchorData | null>;
  updateAnchor: (anchorId: string | number, payload: { user_text?: string; audio_url?: string; photo_url?: string }) => Promise<AnchorData | null>;
  createCapsule: (
    yuanJi: string,
    keyQuestion: string,
    keyAnswerHint?: string,
    options?: { city?: string; timeLockUntil?: string; weatherWhenCreated?: string }
  ) => Promise<{ success: boolean; capsuleId?: number; error?: string }>;
}

const TravelContext = createContext<TravelContextValue | null>(null);

const DEMO_CENTER = {
  lat: 31.2985,
  lng: 121.5018,
  city: '上海 · 复旦大学邯郸校区',
};

export function useTravelContext() {
  const ctx = useContext(TravelContext);
  if (!ctx) throw new Error('useTravelContext must be used within TravelProvider');
  return ctx;
}

/** Calculate distance (meters) between two lat/lng pairs using Haversine */
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function TravelProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const isDemoUser = user?.email === 'demo' || user?.email === 'demo@yuanlv.local';
  const [isActive, setIsActive] = useState(false);
  const [travelId, setTravelId] = useState<number | string | null>(null);
  const [positions, setPositions] = useState<LocationPoint[]>([]);
  const [anchors, setAnchors] = useState<AnchorData[]>([]);
  const [capsules, setCapsules] = useState<CapsuleData[]>([]);
  const [duration, setDuration] = useState(0);
  const [distance, setDistance] = useState(0);
  const [currentLat, setCurrentLat] = useState<number | null>(null);
  const [currentLng, setCurrentLng] = useState<number | null>(null);

  // Refs to avoid stale closures in intervals/callbacks
  const watchIdRef = useRef<number | null>(null);
  const uploadBufferRef = useRef<LocationPoint[]>([]);
  const travelIdRef = useRef<number | string | null>(null);
  const currentLatRef = useRef<number | null>(null);
  const currentLngRef = useRef<number | null>(null);
  const intervalsRef = useRef<ReturnType<typeof setInterval>[]>([]);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep refs in sync with state
  useEffect(() => { travelIdRef.current = travelId; }, [travelId]);
  useEffect(() => { currentLatRef.current = currentLat; }, [currentLat]);
  useEffect(() => { currentLngRef.current = currentLng; }, [currentLng]);

  const stopAllPolling = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (fallbackTimerRef.current !== null) {
      clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
    intervalsRef.current.forEach((id) => clearInterval(id));
    intervalsRef.current = [];
  }, []);

  const loadNearbyCapsules = useCallback(async (lat: number, lng: number) => {
    try {
      const { capsuleApi } = await import('../api/capsule');
      const caps = await capsuleApi.getNearby(lat, lng, 2000);
      setCapsules(caps.items || []);
    } catch (error) {
      console.warn('Load nearby capsules failed:', error);
    }
  }, []);

  const applyLocationPoint = useCallback((point: LocationPoint) => {
    if (fallbackTimerRef.current !== null) {
      clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }

    setCurrentLat(point.lat);
    setCurrentLng(point.lng);
    currentLatRef.current = point.lat;
    currentLngRef.current = point.lng;

    let accepted = false;
    setPositions((prev) => {
      if (prev.length > 0) {
        const last = prev[prev.length - 1];
        const d = haversine(last.lat, last.lng, point.lat, point.lng);
        // Filter GPS jitter — ignore tiny movements (< 2m)
        if (d < 2) return prev;
        setDistance((prevDist) => prevDist + d / 1000);
      }
      accepted = true;
      return [...prev, point];
    });

    if (accepted) {
      uploadBufferRef.current.push(point);
    } else if (uploadBufferRef.current.length === 0) {
      // 首个点允许进入上传队列，即使后续被视作同点
      uploadBufferRef.current.push(point);
    }

    void loadNearbyCapsules(point.lat, point.lng);
  }, [loadNearbyCapsules]);

  const startTravel = useCallback(async (city?: string) => {
    // Clean up any previous travel
    stopAllPolling();

    if (!user?.id) {
      throw new Error('请先登录后再开始旅途。');
    }

    const userId = user.id;
    const res = await journeyApi.start(userId, city);
    const id = res.travel_id;

    setTravelId(id);
    travelIdRef.current = id;
    setPositions([]);
    setAnchors([]);
    setCapsules([]);
    setDuration(0);
    setDistance(0);
    setCurrentLat(null);
    setCurrentLng(null);
    currentLatRef.current = null;
    currentLngRef.current = null;
    uploadBufferRef.current = [];
    setIsActive(true);

    const intervals: ReturnType<typeof setInterval>[] = [];
    const shouldUseDemoFallback = isDemoUser;

    const fallbackPoint: LocationPoint = {
      lat: DEMO_CENTER.lat,
      lng: DEMO_CENTER.lng,
      speed: 0,
      timestamp: Date.now(),
    };

    // Duration timer
    intervals.push(
      setInterval(() => {
        setDuration((d) => d + 1);
      }, 1000)
    );

    // GPS tracking
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const point: LocationPoint = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            speed: pos.coords.speed ?? undefined,
            timestamp: pos.timestamp,
          };
          applyLocationPoint(point);
        },
        () => {
          if (shouldUseDemoFallback && currentLatRef.current == null && currentLngRef.current == null) {
            applyLocationPoint(fallbackPoint);
          }
        },
        { enableHighAccuracy: true, maximumAge: 60000, timeout: 6000 }
      );

      if (shouldUseDemoFallback) {
        fallbackTimerRef.current = setTimeout(() => {
          if (currentLatRef.current == null || currentLngRef.current == null) {
            applyLocationPoint({
              ...fallbackPoint,
              timestamp: Date.now(),
            });
          }
        }, 1800);
      }

      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          const point: LocationPoint = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            speed: pos.coords.speed ?? undefined,
            timestamp: pos.timestamp,
          };
          applyLocationPoint(point);
        },
        (err) => {
          console.warn('Geolocation error:', err.message);
          if (shouldUseDemoFallback && currentLatRef.current == null && currentLngRef.current == null) {
            applyLocationPoint({
              ...fallbackPoint,
              timestamp: Date.now(),
            });
          }
        },
        { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 }
      );
    } else if (shouldUseDemoFallback) {
      applyLocationPoint(fallbackPoint);
    }

    // Upload positions every 5s
    intervals.push(
      setInterval(async () => {
        const tid = travelIdRef.current;
        if (tid && uploadBufferRef.current.length > 0) {
          const batch = [...uploadBufferRef.current];
          uploadBufferRef.current = [];
          const uploaded = await journeyApi.uploadLocations(tid, batch);
          if (!uploaded) {
            uploadBufferRef.current = [...batch, ...uploadBufferRef.current];
          }
        }
      }, 5000)
    );

    // Poll nearby capsules every 30s (use refs for fresh lat/lng)
    intervals.push(
      setInterval(async () => {
        const lat = currentLatRef.current;
        const lng = currentLngRef.current;
        if (lat != null && lng != null) {
          await loadNearbyCapsules(lat, lng);
        }
      }, 30000)
    );

    // Poll anchors every 10s
    intervals.push(
      setInterval(async () => {
        const tid = travelIdRef.current;
        if (tid) {
          try {
            const ancs = await journeyApi.getAnchors(tid);
            setAnchors(ancs);
          } catch (error) {
            console.warn('Load anchors failed:', error);
          }
        }
      }, 10000)
    );

    intervalsRef.current = intervals;
  }, [applyLocationPoint, isDemoUser, loadNearbyCapsules, stopAllPolling, user?.id]);

  const endTravel = useCallback(async (options?: { generateNotebookImage?: boolean }) => {
    const tid = travelIdRef.current;
    if (tid) {
      // Flush remaining positions
      if (uploadBufferRef.current.length > 0) {
        const batch = [...uploadBufferRef.current];
        const uploaded = await journeyApi.uploadLocations(tid, batch);
        if (uploaded) {
          uploadBufferRef.current = [];
        }
      }
      await journeyApi.end(tid, options);
    }
    stopAllPolling();
    setIsActive(false);
    setCapsules([]);
  }, [stopAllPolling]);

  const addManualAnchor = useCallback(
    async (userText: string): Promise<AnchorData | null> => {
      const tid = travelIdRef.current;
      const lat = currentLatRef.current;
      const lng = currentLngRef.current;
      if (!tid || lat == null || lng == null) return null;
      const anchor = await journeyApi.addManualAnchor(tid, lat, lng, userText);
      setAnchors((prev) => [...prev, anchor]);
      return anchor;
    },
    []
  );

  const updateAnchor = useCallback(
    async (
      anchorId: string | number,
      payload: { user_text?: string; audio_url?: string; photo_url?: string }
    ): Promise<AnchorData | null> => {
      const updated = await journeyApi.updateAnchor(anchorId, payload);
      setAnchors((prev) =>
        prev.map((anchor) => (String(anchor.id) === String(updated.id) ? updated : anchor))
      );
      return updated;
    },
    []
  );

  const createCapsule = useCallback(
    async (
      yuanJi: string,
      keyQuestion: string,
      keyAnswerHint?: string,
      options?: { city?: string; timeLockUntil?: string; weatherWhenCreated?: string }
    ): Promise<{ success: boolean; capsuleId?: number; error?: string }> => {
      const lat = currentLatRef.current;
      const lng = currentLngRef.current;
      if (lat == null || lng == null) {
        return { success: false, error: '无法获取当前位置' };
      }

      try {
        const capsuleApi = (await import('../api/capsule')).capsuleApi;
        const result = await capsuleApi.createAtCurrentLocation({
          user_id: parseInt(user?.id || '0'),
          lat,
          lng,
          city: options?.city,
          yuan_ji: yuanJi,
          key_question: keyQuestion,
          key_answer_hint: keyAnswerHint,
          time_lock_until: options?.timeLockUntil,
          weather_when_created: options?.weatherWhenCreated,
        });
        // 将新创建的胶囊加入状态，使地图立即显示
        setCapsules((prev) => [
          ...prev,
          {
            id: result.capsule_id,
            lat,
            lng,
            city: options?.city ?? null,
            key_question: keyQuestion,
            distance_m: 0,
            status: result.status,
            is_locked: result.is_locked,
            time_lock_until: result.time_lock_until ?? null,
          } as CapsuleData,
        ]);
        return { success: true, capsuleId: result.capsule_id };
      } catch (error) {
        console.error('Create capsule failed:', error);
        return { success: false, error: error instanceof Error ? error.message : '创建胶囊失败' };
      }
    },
    [user?.id]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => { stopAllPolling(); };
  }, [stopAllPolling]);

  return (
    <TravelContext.Provider
      value={{
        isActive,
        travelId,
        positions,
        anchors,
        capsules,
        duration,
        distance,
        currentLat,
        currentLng,
        startTravel,
        endTravel,
        addManualAnchor,
        updateAnchor,
        createCapsule,
      }}
    >
      {children}
    </TravelContext.Provider>
  );
}
