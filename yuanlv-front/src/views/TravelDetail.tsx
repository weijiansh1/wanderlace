import { Suspense, lazy, useEffect, useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router';
import { ArrowLeft, MapPin, Clock, Navigation, Anchor, BookOpen, Wind, Play } from 'lucide-react';
import { motion } from 'motion/react';
import { journeyApi } from '../api/journey';
import { TimelineController } from '../components/TimelineController';
import { useAppAppearance } from '../context/AppAppearanceContext';
import { interpolateTrajectory, getPositionAtProgress, calculateTrajectoryLength, formatDistance, formatDuration as formatTrajectoryDuration } from '../utils/trajectory';
import type { TravelDetail, TravelLocation, AnchorData, DiaryResponse } from '../api/types';

const MapboxRomanceMap = lazy(() =>
  import('../components/MapboxRomanceMap').then((module) => ({ default: module.MapboxRomanceMap }))
);

function MapPanelFallback() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-[linear-gradient(180deg,#f8f1e6_0%,#f4eadf_100%)] text-xs tracking-wide text-stone-500">
      地图正在铺开…
    </div>
  );
}

export function TravelDetail() {
  const { travelId } = useParams<{ travelId: string }>();
  const navigate = useNavigate();
  const { palette } = useAppAppearance();

  const [travel, setTravel] = useState<TravelDetail | null>(null);
  const [locations, setLocations] = useState<TravelLocation[]>([]);
  const [anchors, setAnchors] = useState<AnchorData[]>([]);
  const [diary, setDiary] = useState<DiaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'map' | 'diary' | 'anchors'>('map');

  // 轨迹回放状态
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const [interpolatedLocations, setInterpolatedLocations] = useState<TravelLocation[]>([]);

  useEffect(() => {
    if (!travelId) return;
    let cancelled = false;

    setLoading(true);

    Promise.all([
      journeyApi.getTravelDetail(travelId),
      journeyApi.getTravelLocations(travelId),
      journeyApi.getAnchors(travelId),
      journeyApi.getTravelDiary(travelId),
    ])
      .then(([travelData, locationsData, anchorsData, diaryData]) => {
        if (!cancelled) {
          setTravel(travelData);
          setLocations(locationsData);
          setAnchors(anchorsData);
          setDiary(diaryData.status !== 'pending' ? diaryData : null);

          // 对轨迹进行插值，使回放更平滑
          const interpolated = interpolateTrajectory(locationsData, 20);
          setInterpolatedLocations(interpolated);
        }
      })
      .catch((error) => {
        console.error('Failed to load travel detail:', error);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [travelId]);

  const trajectoryPath = useMemo(
    () => locations.map((loc) => ({ lat: loc.lat, lng: loc.lng })),
    [locations]
  );

  // 根据回放进度计算当前位置
  const playbackPosition = useMemo(() => {
    if (interpolatedLocations.length === 0) return null;

    const pos = getPositionAtProgress(interpolatedLocations, playbackProgress / 100);
    return { lat: pos.lat, lng: pos.lng };
  }, [interpolatedLocations, playbackProgress]);

  const mapCenter = useMemo(() => {
    // 如果在回放模式，使用回放位置；否则使用最后一个位置
    if (isPlaying || playbackProgress > 0) {
      return playbackPosition;
    }
    if (locations.length > 0) {
      const last = locations[locations.length - 1];
      return { lat: last.lat, lng: last.lng };
    }
    return null;
  }, [locations, playbackPosition, isPlaying, playbackProgress]);

  const anchorMarkers = useMemo(
    () =>
      anchors
        .filter(anchor => anchor.status === 'confirmed' || anchor.is_manual)
        .map((anchor) => ({
          ...anchor,
          id: String(anchor.id),
          travel_id: String(anchor.travel_id),
        })),
    [anchors]
  );

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDuration = (startTime: string, endTime?: string | null) => {
    const start = new Date(startTime);
    const end = endTime ? new Date(endTime) : new Date();
    const diffMs = end.getTime() - start.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    return `${diffHours}小时${diffMinutes}分钟`;
  };

  // 计算轨迹时长（用于回放）
  const trajectoryDuration = useMemo(() => {
    if (interpolatedLocations.length < 2) return 0;
    const firstTime = new Date(interpolatedLocations[0].timestamp).getTime();
    const lastTime = new Date(interpolatedLocations[interpolatedLocations.length - 1].timestamp).getTime();
    return lastTime - firstTime;
  }, [interpolatedLocations]);

  // 计算当前回放位置的距离
  const currentDistance = useMemo(() => {
    if (interpolatedLocations.length === 0) return 0;
    const partialLocations = interpolatedLocations.slice(
      0,
      Math.max(1, Math.floor((playbackProgress / 100) * interpolatedLocations.length))
    );
    return calculateTrajectoryLength(partialLocations);
  }, [interpolatedLocations, playbackProgress]);

  if (loading) {
    return (
      <div className="min-h-full flex items-center justify-center bg-[#FBF8F1]">
        <div className="w-6 h-6 border-2 border-amber-300 border-t-amber-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!travel) {
    return (
      <div className="min-h-full flex flex-col items-center justify-center bg-[#FBF8F1] p-8">
        <BookOpen size={48} className="text-stone-300 mb-4" />
        <p className="text-stone-500 text-center">旅途不存在或已被删除</p>
        <button
          onClick={() => navigate('/memory')}
          className="mt-4 px-6 py-2 bg-amber-600 text-white rounded-full text-sm"
        >
          返回记忆页
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-full pb-32" style={{ fontFamily: "'Noto Serif SC', serif", background: palette.pageBackground }}>
      {/* Header */}
      <div className="relative pb-4" style={{ background: palette.heroGradient }}>
        <div className="relative px-5 pt-12 pb-4">
          <button
            onClick={() => navigate('/memory')}
            className="flex items-center gap-2 text-stone-500 hover:text-stone-700 transition-colors mb-4"
          >
            <ArrowLeft size={18} />
            <span className="text-sm">返回记忆</span>
          </button>

          <h1 className="text-2xl text-stone-800 tracking-wider mb-2" style={{ fontWeight: 400 }}>
            {travel.diary_title || travel.city || '旅途回忆'}
          </h1>

          <div className="flex items-center gap-3 text-xs text-stone-500">
            <span className="flex items-center gap-1">
              <Calendar size={12} />
              {formatDate(travel.start_time)}
            </span>
            {travel.total_distance > 0 && (
              <span className="flex items-center gap-1">
                <Navigation size={12} />
                {travel.total_distance.toFixed(1)} km
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-5 mt-4">
        <div className="flex gap-2 border-b border-stone-200/50">
          <TabButton
            label="轨迹"
            icon={<MapPin size={14} />}
            active={activeTab === 'map'}
            onClick={() => setActiveTab('map')}
          />
          <TabButton
            label="日记"
            icon={<BookOpen size={14} />}
            active={activeTab === 'diary'}
            onClick={() => setActiveTab('diary')}
          />
          <TabButton
            label="锚点"
            icon={<Anchor size={14} />}
            active={activeTab === 'anchors'}
            onClick={() => setActiveTab('anchors')}
          />
        </div>
      </div>

      {/* Content */}
      <div className="px-5 mt-4">
        {activeTab === 'map' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-4"
          >
            {/* 地图 */}
            <div className="h-[45vh] rounded-2xl overflow-hidden border border-white/40 shadow-[0_4px_20px_rgba(180,140,100,0.08)]">
              <Suspense fallback={<MapPanelFallback />}>
                <MapboxRomanceMap
                  center={mapCenter}
                  trajectoryPath={trajectoryPath}
                  anchors={anchorMarkers}
                  capsules={[]}
                  passive={false}
                  lineColor="#e85d3a"
                  lineWidth={6}
                />
              </Suspense>
            </div>

            {/* 轨迹回放控制器 */}
            {interpolatedLocations.length > 1 && (
              <TimelineController
                duration={trajectoryDuration}
                isPlaying={isPlaying}
                onPlayChange={setIsPlaying}
                onProgressChange={setPlaybackProgress}
                currentProgress={playbackProgress}
              />
            )}

            {/* 回放统计 */}
            {(isPlaying || playbackProgress > 0) && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="grid grid-cols-2 gap-3"
              >
                <div className="bg-white/60 backdrop-blur-xl rounded-2xl p-3 border border-white/40">
                  <div className="flex items-center gap-2 text-stone-500 text-xs">
                    <Navigation size={12} />
                    <span>已行走</span>
                  </div>
                  <p className="text-lg text-stone-700 mt-1">{formatDistance(currentDistance)}</p>
                </div>
                <div className="bg-white/60 backdrop-blur-xl rounded-2xl p-3 border border-white/40">
                  <div className="flex items-center gap-2 text-stone-500 text-xs">
                    <Clock size={12} />
                    <span>用时</span>
                  </div>
                  <p className="text-lg text-stone-700 mt-1">
                    {formatTrajectoryDuration((playbackProgress / 100) * trajectoryDuration)}
                  </p>
                </div>
              </motion.div>
            )}
          </motion.div>
        )}

        {activeTab === 'diary' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white/60 backdrop-blur-xl rounded-2xl p-6 border border-white/40"
          >
            {diary && diary.status === 'ready' && diary.content_json ? (
              <>
                {diary.content_json.image && (
                  <div className="mb-5 overflow-hidden rounded-2xl border border-white/50">
                    <img
                      src={diary.content_json.image}
                      alt={diary.content_json.title || '旅途手帐'}
                      className="h-48 w-full object-cover"
                    />
                  </div>
                )}
                <h2 className="text-xl text-amber-700 mb-2 tracking-wider">
                  {diary.content_json.title}
                </h2>
                <p className="text-xs text-stone-400 mb-6 tracking-[0.2em]" style={{ fontFamily: 'sans-serif' }}>
                  {diary.content_json.date}
                </p>
                <div className="space-y-4">
                  {(diary.content_json.segments || []).map((segment, idx) => (
                    <p
                      key={idx}
                      className={`text-sm leading-relaxed ${
                        segment.source === 'user'
                          ? 'text-stone-800'
                          : segment.source === 'rag'
                            ? 'text-pink-400 italic'
                            : 'text-stone-600'
                      }`}
                    >
                      {segment.text}
                    </p>
                  ))}
                </div>
              </>
            ) : diary?.status === 'generating' ? (
              <div className="flex flex-col items-center justify-center py-12">
                <div className="w-5 h-5 border-2 border-amber-300 border-t-amber-600 rounded-full animate-spin mb-3" />
                <p className="text-stone-400 text-sm">日记正在生成中...</p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12">
                <BookOpen size={32} className="text-stone-300 mb-3" />
                <p className="text-stone-400 text-sm">暂无日记</p>
              </div>
            )}
          </motion.div>
        )}

        {activeTab === 'anchors' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col gap-3"
          >
            {anchors.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Anchor size={32} className="text-stone-300 mb-3" />
                <p className="text-stone-400 text-sm">暂无锚点</p>
              </div>
            ) : (
              anchors.map((anchor, idx) => <AnchorCard key={anchor.id} anchor={anchor} index={idx} />)
            )}
          </motion.div>
        )}
      </div>

      {/* Stats */}
      <div className="px-5 mt-6">
        <div className="grid grid-cols-3 gap-3">
          <StatBox icon={<Clock size={16} />} value={formatDuration(travel.start_time, travel.end_time)} label="时长" />
          <StatBox icon={<Navigation size={16} />} value={travel.total_distance.toFixed(1)} label="公里" />
          <StatBox icon={<Anchor size={16} />} value={String(travel.anchor_count)} label="锚点" />
        </div>

        {/* 轨迹回放按钮 */}
        {interpolatedLocations.length > 1 && (
          <button
            onClick={() => {
              setActiveTab('map');
              setIsPlaying(true);
            }}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-white transition-colors shadow-md"
            style={{ fontFamily: 'sans-serif', background: palette.accent }}
          >
            <Play size={18} className="ml-0.5" />
            <span>开始轨迹回放</span>
          </button>
        )}
      </div>

      {/* Info Card */}
      {travel.weather_summary && (
        <div className="px-5 mt-4">
          <div className="bg-white/50 backdrop-blur-xl rounded-2xl p-4 border border-white/40">
            <div className="flex items-center gap-2 text-stone-500">
              <Wind size={14} />
              <span className="text-xs">{travel.weather_summary}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TabButton({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  const { palette } = useAppAppearance();
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-t-lg px-4 py-2.5 text-sm transition-all ${
        active ? 'bg-white/80 border-b-2' : 'text-stone-500 hover:text-stone-700'
      }`}
      style={{
        fontFamily: 'sans-serif',
        ...(active ? { color: palette.accentText, borderBottomColor: palette.accent } : {}),
      }}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function StatBox({ icon, value, label }: { icon: React.ReactNode; value: string | number; label: string }) {
  const { palette } = useAppAppearance();
  return (
    <div className="bg-white/50 backdrop-blur-xl rounded-2xl p-3.5 flex flex-col items-center justify-center gap-1 border border-white/40">
      <div className="mb-0.5" style={{ color: palette.accent }}>{icon}</div>
      <span className="text-lg text-stone-700" style={{ fontWeight: 400 }}>
        {value}
      </span>
      <span className="text-[10px] text-stone-400 tracking-widest" style={{ fontFamily: 'sans-serif' }}>
        {label}
      </span>
    </div>
  );
}

function AnchorCard({ anchor, index }: { anchor: AnchorData; index: number }) {
  const { palette } = useAppAppearance();
  const statusLabel =
    anchor.status === 'candidate'
      ? '候选'
      : anchor.status === 'observation'
        ? '观察中'
        : anchor.status === 'confirmed'
          ? '已确认'
          : anchor.status === 'rejected'
            ? '已取消'
            : anchor.is_manual
              ? '手动'
              : anchor.status;
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className={`bg-white/60 backdrop-blur-xl rounded-2xl p-4 border border-white/40 ${
        anchor.status === 'rejected' ? 'opacity-70' : ''
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ background: palette.accentSoft }}>
          <Anchor size={16} style={{ color: palette.accent }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="mb-1 flex items-center gap-2">
            <h3 className="text-stone-700 font-medium">{anchor.poi_name || '未命名锚点'}</h3>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] ${
                anchor.status === 'confirmed'
                  ? 'bg-emerald-50 text-emerald-600'
                  : anchor.status === 'candidate' || anchor.status === 'observation'
                    ? 'bg-amber-50 text-amber-600'
                    : anchor.status === 'rejected'
                      ? 'bg-rose-50 text-rose-500'
                      : 'bg-stone-100 text-stone-500'
              }`}
              style={{ fontFamily: 'sans-serif' }}
            >
              {statusLabel}
            </span>
          </div>
          {anchor.user_text ? (
            <p className="text-stone-600 text-sm leading-relaxed">{anchor.user_text}</p>
          ) : anchor.ai_description ? (
            <p className="text-stone-500 text-sm leading-relaxed">{anchor.ai_description}</p>
          ) : (
            <p className="text-stone-400 text-sm">无描述</p>
          )}
          <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-stone-400">
            {anchor.weather && (
              <span className="flex items-center gap-1">
                <Wind size={10} />
                {anchor.weather}
              </span>
            )}
            {anchor.temperature && <span>{anchor.temperature}°C</span>}
            {anchor.created_at && <span>{new Date(anchor.created_at).toLocaleString('zh-CN')}</span>}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function Calendar({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}
