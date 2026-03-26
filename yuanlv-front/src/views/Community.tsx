import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ChevronLeft,
  Clock,
  Compass,
  Feather,
  Flame,
  Heart,
  MapPin,
  MessageCircle,
  Search,
  Send,
  Share2,
  Sparkles,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { communityApi } from "../api/community";
import { journeyApi } from "../api/journey";
import type {
  AnchorData,
  CommunityCommentData,
  CommunityHeatSpot,
  CommunityPostDetail,
  CommunityPostFeedItem,
  CommunityTagData,
} from "../api/types";
import { useAppAppearance } from "../context/AppAppearanceContext";
import { useAuth } from "../context/AuthContext";

interface TagOption {
  label: string;
  icon?: ReactNode;
}

interface TravelOption {
  id: number;
  city?: string | null;
  start_time: string;
}

function parseBackendDate(dateStr: string): Date {
  const raw = `${dateStr || ""}`.trim();
  if (!raw) return new Date(NaN);
  const hasTimezone = /([zZ]|[+\-]\d{2}:\d{2})$/.test(raw);
  return new Date(hasTimezone ? raw : `${raw}Z`);
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - parseBackendDate(dateStr).getTime();
  const mins = Math.max(1, Math.floor(diff / 60000));
  if (mins < 60) return `${mins} 分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} 天前`;
  if (days < 30) return `${Math.floor(days / 7)} 周前`;
  return `${Math.floor(days / 30)} 个月前`;
}

function formatTravelLabel(item: TravelOption) {
  const date = parseBackendDate(item.start_time);
  return `${item.city || "未命名旅途"} · ${date.toLocaleDateString("zh-CN")}`;
}

function formatAnchorLabel(item: AnchorData) {
  const title = item.poi_name || item.user_text || "锚点";
  return `${title} · ${parseBackendDate(item.created_at).toLocaleDateString("zh-CN")}`;
}

export function Community() {
  const { user } = useAuth();
  const { palette } = useAppAppearance();

  const [activeTag, setActiveTag] = useState(0);
  const [likedPosts, setLikedPosts] = useState<Set<number>>(new Set());
  const [posts, setPosts] = useState<CommunityPostFeedItem[]>([]);
  const [tagOptions, setTagOptions] = useState<TagOption[]>([
    { label: "热门", icon: <Flame size={13} className="text-rose-400" /> },
  ]);
  const [popularTags, setPopularTags] = useState<CommunityTagData[]>([]);
  const [tagSuggestions, setTagSuggestions] = useState<CommunityTagData[]>([]);
  const [hotspots, setHotspots] = useState<CommunityHeatSpot[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [searchKeyword, setSearchKeyword] = useState("");

  const [selectedPostId, setSelectedPostId] = useState<number | null>(null);
  const [selectedPost, setSelectedPost] = useState<CommunityPostDetail | null>(null);
  const [detailComments, setDetailComments] = useState<CommunityCommentData[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [commentSubmitting, setCommentSubmitting] = useState(false);

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [createContent, setCreateContent] = useState("");
  const [createCity, setCreateCity] = useState("");
  const [createImageUrl, setCreateImageUrl] = useState("");
  const [createAnonymous, setCreateAnonymous] = useState(true);
  const [createTravelId, setCreateTravelId] = useState("");
  const [createAnchorId, setCreateAnchorId] = useState("");
  const [createAiSummary, setCreateAiSummary] = useState("");
  const [sourceTravels, setSourceTravels] = useState<TravelOption[]>([]);
  const [sourceAnchors, setSourceAnchors] = useState<AnchorData[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [tags, heatmap] = await Promise.all([
          communityApi.getPopularTags(),
          communityApi.getHeatmapData(),
        ]);
        if (!cancelled) {
          setPopularTags(tags);
          if (tags.length > 0) {
            setTagOptions([
              { label: "热门", icon: <Flame size={13} className="text-rose-400" /> },
              ...tags.slice(0, 8).map((tag) => ({ label: tag.name })),
            ]);
          }
          setHotspots(heatmap.spots.slice(0, 6));
        }
      } catch (error) {
        if (!cancelled) {
          setPageError(error instanceof Error ? error.message : "社区信息加载失败。");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const keyword = searchInput.trim();
    if (!keyword) {
      setTagSuggestions([]);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const items = await communityApi.searchTags(keyword);
          if (!cancelled) {
            setTagSuggestions(items.slice(0, 6));
          }
        } catch {
          if (!cancelled) setTagSuggestions([]);
        }
      })();
    }, 240);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [searchInput]);

  useEffect(() => {
    let cancelled = false;
    const activeLabel = tagOptions[activeTag]?.label || "热门";
    void (async () => {
      setLoading(true);
      setPageError("");
      try {
        const data = await communityApi.getFeed({
          tag: activeLabel,
          search: searchKeyword || undefined,
          pageSize: 30,
        });
        if (!cancelled) {
          setPosts(data);
        }
      } catch (error) {
        if (!cancelled) {
          setPosts([]);
          setPageError(error instanceof Error ? error.message : "社区内容加载失败。");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTag, searchKeyword, tagOptions]);

  useEffect(() => {
    if (!user?.id || !createModalOpen) return;
    let cancelled = false;
    void (async () => {
      try {
        const [travels, anchors] = await Promise.all([
          journeyApi.getTravelList(user.id, 20),
          journeyApi.getUserAnchors(user.id, 100),
        ]);
        if (!cancelled) {
          setSourceTravels((travels as TravelOption[]) || []);
          setSourceAnchors(anchors || []);
        }
      } catch {
        if (!cancelled) {
          setSourceTravels([]);
          setSourceAnchors([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [createModalOpen, user?.id]);

  useEffect(() => {
    if (selectedPostId == null) {
      setSelectedPost(null);
      setDetailComments([]);
      setCommentText("");
      setDetailLoading(false);
      return;
    }

    let cancelled = false;
    setDetailLoading(true);
    void (async () => {
      try {
        const [detail, comments] = await Promise.all([
          communityApi.getPostDetail(selectedPostId),
          communityApi.getComments(selectedPostId),
        ]);
        if (!cancelled) {
          setSelectedPost(detail);
          setDetailComments(comments);
        }
      } catch (error) {
        if (!cancelled) {
          setPageError(error instanceof Error ? error.message : "帖子详情加载失败。");
        }
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedPostId]);

  const availableAnchors = useMemo(() => {
    if (!createTravelId) return sourceAnchors;
    return sourceAnchors.filter((anchor) => String(anchor.travel_id) === createTravelId);
  }, [createTravelId, sourceAnchors]);

  const toggleLike = async (id: number) => {
    const isLiked = likedPosts.has(id);
    setLikedPosts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

    try {
      const res = await communityApi.toggleLike(id, isLiked);
      setPosts((prev) => prev.map((post) => (post.id === id ? { ...post, likes: res.likes } : post)));
      setSelectedPost((prev) => (prev && prev.id === id ? { ...prev, likes: res.likes } : prev));
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "点赞失败。");
      setLikedPosts((prev) => {
        const next = new Set(prev);
        if (isLiked) next.add(id);
        else next.delete(id);
        return next;
      });
    }
  };

  const handleOpenCreate = () => {
    setCreateTitle("");
    setCreateContent("");
    setCreateCity("");
    setCreateImageUrl("");
    setCreateAnonymous(true);
    setCreateTravelId("");
    setCreateAnchorId("");
    setCreateAiSummary("");
    setCreateModalOpen(true);
  };

  const handleCreatePost = async () => {
    if (!user?.id || !createTitle.trim() || !createContent.trim() || createSubmitting) return;
    setCreateSubmitting(true);
    setPageError("");
    try {
      const result = await communityApi.createPost({
        user_id: Number(user.id),
        title: createTitle.trim(),
        content: createContent.trim(),
        city: createCity.trim() || undefined,
        is_anonymous: createAnonymous,
        cover_image: createImageUrl.trim() || undefined,
        image_urls: createImageUrl.trim() ? [createImageUrl.trim()] : undefined,
        source_travel_id: createTravelId ? Number(createTravelId) : undefined,
        source_anchor_id: createAnchorId ? Number(createAnchorId) : undefined,
      });
      setCreateAiSummary(result.ai_tags.summary || "");
      setPosts((prev) => [result.post, ...prev]);
      setCreateModalOpen(false);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "发布失败，请稍后重试。");
    } finally {
      setCreateSubmitting(false);
    }
  };

  const handleSubmitComment = async () => {
    if (!selectedPost || !user?.id || !commentText.trim() || commentSubmitting) return;
    setCommentSubmitting(true);
    try {
      const comment = await communityApi.addComment(selectedPost.id, Number(user.id), commentText.trim());
      setDetailComments((prev) => [...prev, comment]);
      setSelectedPost((prev) => (prev ? { ...prev, comment_count: prev.comment_count + 1 } : prev));
      setPosts((prev) =>
        prev.map((post) => (post.id === selectedPost.id ? { ...post, comment_count: post.comment_count + 1 } : post))
      );
      setCommentText("");
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "评论发布失败。");
    } finally {
      setCommentSubmitting(false);
    }
  };

  return (
    <div className="min-h-full pb-32" style={{ fontFamily: "'Noto Serif SC', serif", background: palette.pageBackground }}>
      <div className="px-5 pb-2 pt-12" style={{ background: palette.heroGradient }}>
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-1 flex items-end justify-between"
        >
          <div>
            <p className="mb-1 text-[10px] tracking-[0.3em] text-stone-400" style={{ fontFamily: "sans-serif" }}>
              DISCOVER
            </p>
            <h1 className="text-2xl tracking-wider text-stone-800" style={{ fontWeight: 400 }}>
              社区
            </h1>
          </div>
          <button
            onClick={handleOpenCreate}
            className="flex h-9 w-9 items-center justify-center rounded-full border bg-white/60 text-stone-400 backdrop-blur-xl"
            style={{ borderColor: palette.borderTint, color: palette.accentText }}
            title="发布社区内容"
          >
            <Feather size={16} />
          </button>
        </motion.div>
        <p className="text-xs tracking-wide text-stone-400" style={{ fontWeight: 300 }}>
          来自远方旅人的温柔碎片
        </p>
      </div>

      <div className="px-5">
        <div className="flex items-center gap-2 rounded-2xl border border-white/40 bg-white/70 px-4 py-3 shadow-[0_4px_20px_rgba(180,140,100,0.05)] backdrop-blur-xl">
          <Search size={14} className="text-stone-400" />
          <input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                setSearchKeyword(searchInput.trim());
              }
            }}
            placeholder="搜索地点、情绪、故事片段"
            className="flex-1 bg-transparent text-sm text-stone-700 outline-none"
            style={{ fontFamily: "sans-serif" }}
          />
          <button
            onClick={() => setSearchKeyword(searchInput.trim())}
            className="rounded-full px-3 py-1.5 text-[11px] text-white"
            style={{ background: palette.accent, fontFamily: "sans-serif" }}
          >
            搜索
          </button>
        </div>

        {tagSuggestions.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {tagSuggestions.map((tag) => (
              <button
                key={`${tag.category}-${tag.name}`}
                onClick={() => {
                  setSearchInput(tag.name);
                  setSearchKeyword(tag.name);
                }}
                className="rounded-full bg-stone-100 px-3 py-1 text-[11px] text-stone-500"
                style={{ fontFamily: "sans-serif" }}
              >
                #{tag.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="no-scrollbar flex gap-2 overflow-x-auto px-5 py-4">
        {tagOptions.map((tag, index) => (
          <button
            key={tag.label}
            onClick={() => setActiveTag(index)}
            className={`flex whitespace-nowrap rounded-full px-4 py-2 text-xs transition-all duration-300 ${
              activeTag === index
                ? "text-white shadow-md"
                : "border border-white/30 bg-white/60 text-stone-500 backdrop-blur-md hover:bg-white/80"
            }`}
            style={{
              fontFamily: "sans-serif",
              ...(activeTag === index ? { background: palette.accent, boxShadow: `0 8px 18px ${palette.accentGlow}` } : {}),
            }}
          >
            <span className="mr-1.5">{tag.icon}</span>
            {tag.label}
          </button>
        ))}
      </div>

      {popularTags.length > 0 && (
        <div className="px-5 pb-2">
          <div className="rounded-2xl border border-white/40 bg-white/60 p-4 backdrop-blur-xl">
            <div className="mb-3 flex items-center gap-2">
              <Sparkles size={14} style={{ color: palette.accent }} />
              <h3 className="text-sm text-stone-700">热门标签</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {popularTags.slice(0, 10).map((tag) => (
                <button
                  key={`${tag.category}-${tag.name}`}
                  onClick={() => {
                    setSearchInput(tag.name);
                    setSearchKeyword(tag.name);
                  }}
                  className="rounded-full px-3 py-1 text-[11px]"
                  style={{ background: palette.accentSoft, color: palette.accentText, fontFamily: "sans-serif" }}
                >
                  #{tag.name} {tag.count ? `· ${tag.count}` : ""}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {hotspots.length > 0 && (
        <div className="px-5 pb-3">
          <div className="mb-3 flex items-center gap-2">
            <Compass size={14} className="text-stone-400" />
            <h3 className="text-sm text-stone-700">城市热区</h3>
          </div>
          <div className="no-scrollbar flex gap-3 overflow-x-auto pb-1">
            {hotspots.map((spot) => (
              <button
                key={spot.id}
                onClick={() => {
                  if (spot.city) {
                    setSearchInput(spot.city);
                    setSearchKeyword(spot.city);
                  }
                }}
                className="min-w-[180px] rounded-2xl border border-white/40 bg-white/70 p-4 text-left backdrop-blur-xl"
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm text-stone-700">{spot.name}</span>
                  <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] text-rose-500" style={{ fontFamily: "sans-serif" }}>
                    热度 {spot.count}
                  </span>
                </div>
                <p className="text-xs text-stone-400">{spot.city || "未知城市"}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {spot.emotions.slice(0, 3).map((emotion) => (
                    <span
                      key={emotion.name}
                      className="rounded-full bg-stone-100 px-2 py-1 text-[10px] text-stone-500"
                      style={{ fontFamily: "sans-serif" }}
                    >
                      {emotion.name} · {emotion.count}
                    </span>
                  ))}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {pageError && (
        <div className="px-5 pb-3">
          <div className="rounded-2xl border border-rose-100 bg-rose-50/80 px-4 py-3 text-sm text-rose-500">
            {pageError}
          </div>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-stone-300" style={{ borderTopColor: palette.accent }} />
        </div>
      )}

      <div className="mt-1 grid grid-cols-2 gap-2.5 px-5">
        {posts.map((post, index) => (
          <motion.div
            key={post.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.03 }}
            onClick={() => setSelectedPostId(post.id)}
            className="cursor-pointer overflow-hidden rounded-xl border border-white/40 bg-white/70 shadow-[0_2px_12px_rgba(180,140,100,0.05)] transition-shadow hover:shadow-lg"
          >
            <div className="relative aspect-[4/3] overflow-hidden">
              {post.cover_image ? (
                <img src={post.cover_image} alt={post.title} className="h-full w-full object-cover transition-transform duration-500 hover:scale-105" />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-amber-50 to-rose-50">
                  <MapPin size={20} className="text-amber-300" />
                </div>
              )}
              <div className="absolute left-1.5 top-1.5 flex flex-wrap gap-1">
                {post.tags.slice(0, 2).map((tag) => (
                  <span
                    key={`${post.id}-${tag}`}
                    className="rounded-full bg-black/50 px-1.5 py-0.5 text-[8px] text-white backdrop-blur-sm"
                    style={{ fontFamily: "sans-serif" }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            <div className="p-2">
              <div className="mb-1 flex items-center gap-1">
                <MapPin size={8} className="text-amber-500/70" />
                <span className="truncate text-[9px] text-stone-500" style={{ fontFamily: "sans-serif" }}>
                  {post.city || "未知地点"}
                </span>
              </div>
              <p className="mb-1 text-[11px] text-stone-700">{post.title}</p>
              <p className="mb-1.5 line-clamp-2 text-[10px] leading-snug text-stone-500">{post.excerpt}</p>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <Heart
                    size={10}
                    className={`stroke-[1.5] ${likedPosts.has(post.id) ? "fill-rose-400 text-rose-400" : "text-stone-400"}`}
                  />
                  <span className="text-[8px] text-stone-400" style={{ fontFamily: "sans-serif" }}>
                    {post.likes}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <MessageCircle size={10} className="stroke-[1.5] text-stone-400" />
                  <span className="text-[8px] text-stone-400" style={{ fontFamily: "sans-serif" }}>
                    {post.comment_count}
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {!loading && posts.length === 0 && (
        <div className="flex flex-col items-center justify-center px-5 py-16 text-center">
          <Compass size={28} className="mb-3 text-stone-300" />
          <p className="text-sm text-stone-500">还没有可展示的社区内容</p>
          <p className="mt-1 text-xs text-stone-400">写下你的旅途片段，让这里慢慢热闹起来。</p>
        </div>
      )}

      <AnimatePresence>
        {createModalOpen && (
          <ModalShell title="发布到社区" onClose={() => setCreateModalOpen(false)}>
            <div className="space-y-4">
              <input
                value={createTitle}
                onChange={(event) => setCreateTitle(event.target.value)}
                placeholder="给这段旅途起一个标题"
                className="w-full rounded-2xl border border-stone-200 bg-stone-50/80 px-4 py-3 text-sm text-stone-700 outline-none"
              />
              <textarea
                value={createContent}
                onChange={(event) => setCreateContent(event.target.value)}
                placeholder="写下这次路过、停留、偶遇与情绪。AI 会为它补全城市 / 情绪 / 场景标签。"
                className="min-h-32 w-full rounded-2xl border border-stone-200 bg-stone-50/80 px-4 py-3 text-sm text-stone-700 outline-none"
              />
              <input
                value={createCity}
                onChange={(event) => setCreateCity(event.target.value)}
                placeholder="城市（可选，不填则由 AI / 来源推断）"
                className="w-full rounded-2xl border border-stone-200 bg-stone-50/80 px-4 py-3 text-sm text-stone-700 outline-none"
              />
              <input
                value={createImageUrl}
                onChange={(event) => setCreateImageUrl(event.target.value)}
                placeholder="封面图 URL（可选）"
                className="w-full rounded-2xl border border-stone-200 bg-stone-50/80 px-4 py-3 text-sm text-stone-700 outline-none"
                style={{ fontFamily: "sans-serif" }}
              />

              <div className="rounded-2xl border border-stone-200 bg-stone-50/70 p-4">
                <p className="mb-3 text-xs tracking-[0.18em] text-stone-400" style={{ fontFamily: "sans-serif" }}>
                  来源绑定（可选）
                </p>
                <div className="space-y-3">
                  <select
                    value={createTravelId}
                    onChange={(event) => {
                      setCreateTravelId(event.target.value);
                      setCreateAnchorId("");
                    }}
                    className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700 outline-none"
                  >
                    <option value="">不绑定旅途</option>
                    {sourceTravels.map((travel) => (
                      <option key={travel.id} value={travel.id}>
                        {formatTravelLabel(travel)}
                      </option>
                    ))}
                  </select>

                  <select
                    value={createAnchorId}
                    onChange={(event) => setCreateAnchorId(event.target.value)}
                    className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700 outline-none"
                  >
                    <option value="">不绑定锚点</option>
                    {availableAnchors.map((anchor) => (
                      <option key={anchor.id} value={anchor.id}>
                        {formatAnchorLabel(anchor)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <label className="flex items-center justify-between rounded-2xl border border-stone-200 bg-stone-50/70 px-4 py-3 text-sm text-stone-700">
                <span>匿名发布</span>
                <input
                  type="checkbox"
                  checked={createAnonymous}
                  onChange={(event) => setCreateAnonymous(event.target.checked)}
                  className="h-4 w-4"
                />
              </label>

              <button
                onClick={handleCreatePost}
                disabled={createSubmitting || !createTitle.trim() || !createContent.trim()}
                className="w-full rounded-2xl bg-stone-800 px-4 py-3 text-sm text-white disabled:opacity-60"
              >
                {createSubmitting ? "正在发布…" : "发布帖子"}
              </button>

              {createAiSummary && (
                <div className="rounded-2xl bg-amber-50/70 px-4 py-3">
                  <p className="mb-1 text-[11px] tracking-[0.18em] text-amber-600/70" style={{ fontFamily: "sans-serif" }}>
                    AI 摘要
                  </p>
                  <p className="text-sm leading-6 text-stone-700">{createAiSummary}</p>
                </div>
              )}
            </div>
          </ModalShell>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedPostId != null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={() => setSelectedPostId(null)}
          >
            <motion.div
              initial={{ scale: 0.94, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.96, opacity: 0, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="mx-4 max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-3xl bg-white"
              onClick={(event) => event.stopPropagation()}
            >
              {detailLoading || !selectedPost ? (
                <div className="flex items-center justify-center px-6 py-20">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-stone-300 border-t-amber-500" />
                </div>
              ) : (
                <>
                  <div className="relative aspect-[4/3] overflow-hidden rounded-t-3xl">
                    {selectedPost.cover_image ? (
                      <img src={selectedPost.cover_image} alt={selectedPost.title} className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full bg-gradient-to-br from-amber-50 to-rose-50" />
                    )}
                    <button
                      onClick={() => setSelectedPostId(null)}
                      className="absolute left-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-xl"
                    >
                      <ChevronLeft size={18} />
                    </button>
                  </div>

                  <div className="p-5">
                    <div className="mb-4 flex items-center gap-3">
                      {selectedPost.author_avatar_url ? (
                        <img
                          src={selectedPost.author_avatar_url}
                          alt={selectedPost.author_name}
                          className="h-10 w-10 rounded-full border-2 border-white object-cover shadow-md"
                        />
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-white bg-gradient-to-br from-amber-100 to-rose-100 text-sm font-medium text-amber-600 shadow-md">
                          {selectedPost.author_name.charAt(0)}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <h4 className="truncate text-sm font-medium text-stone-800">{selectedPost.author_name}</h4>
                        <div className="flex items-center gap-2 text-xs text-stone-400">
                          <Clock size={10} />
                          <span>{timeAgo(selectedPost.created_at)}</span>
                          <span>· {selectedPost.views} 阅读</span>
                        </div>
                      </div>
                      {selectedPost.city && (
                        <div className="flex items-center gap-1 rounded-full bg-stone-50 px-3 py-1.5">
                          <MapPin size={11} className="text-amber-500/70" />
                          <span className="text-xs text-stone-600" style={{ fontFamily: "sans-serif" }}>
                            {selectedPost.city}
                          </span>
                        </div>
                      )}
                    </div>

                    <h3 className="mb-3 text-xl text-stone-800">{selectedPost.title}</h3>

                    {selectedPost.tags.length > 0 && (
                      <div className="mb-4 flex flex-wrap gap-2">
                        {selectedPost.tags.map((tag) => (
                          <span
                            key={`${selectedPost.id}-${tag}`}
                            className="rounded-full bg-amber-50 px-3 py-1 text-xs text-amber-600"
                            style={{ fontFamily: "sans-serif" }}
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}

                    {selectedPost.source && (
                      <div className="mb-4 rounded-2xl bg-stone-50/80 px-4 py-3 text-sm text-stone-600">
                        <p className="mb-1 text-[11px] tracking-[0.18em] text-stone-400" style={{ fontFamily: "sans-serif" }}>
                          来源绑定
                        </p>
                        <p>
                          {selectedPost.source.travel_city || "某段旅途"}
                          {selectedPost.source.anchor_name ? ` · ${selectedPost.source.anchor_name}` : ""}
                        </p>
                      </div>
                    )}

                    <p className="mb-5 text-sm leading-relaxed text-stone-600">{selectedPost.content}</p>

                    <div className="mb-5 flex items-center gap-3 border-t border-stone-100 pt-4">
                      <button
                        onClick={() => toggleLike(selectedPost.id)}
                        className={`flex items-center gap-2 rounded-full px-4 py-2 transition-colors ${
                          likedPosts.has(selectedPost.id)
                            ? "bg-rose-50 text-rose-500"
                            : "bg-stone-50 text-stone-500 hover:bg-stone-100"
                        }`}
                      >
                        <Heart
                          size={16}
                          className={`stroke-[1.5] ${likedPosts.has(selectedPost.id) ? "fill-rose-400" : ""}`}
                        />
                        <span className="text-xs" style={{ fontFamily: "sans-serif" }}>
                          {selectedPost.likes}
                        </span>
                      </button>
                      <div className="flex items-center gap-2 rounded-full bg-stone-50 px-4 py-2 text-stone-500">
                        <MessageCircle size={16} className="stroke-[1.5]" />
                        <span className="text-xs" style={{ fontFamily: "sans-serif" }}>
                          {selectedPost.comment_count} 评论
                        </span>
                      </div>
                      <button className="ml-auto flex items-center gap-2 rounded-full bg-stone-50 px-4 py-2 text-stone-500 hover:bg-stone-100">
                        <Share2 size={16} className="stroke-[1.5]" />
                        <span className="text-xs" style={{ fontFamily: "sans-serif" }}>
                          分享
                        </span>
                      </button>
                    </div>

                    <div className="mb-4">
                      <p className="mb-3 text-xs tracking-[0.18em] text-stone-400" style={{ fontFamily: "sans-serif" }}>
                        评论
                      </p>
                      <div className="space-y-3">
                        {detailComments.map((comment) => (
                          <div key={comment.id} className="rounded-2xl bg-stone-50/80 px-4 py-3">
                            <div className="mb-1 flex items-center justify-between gap-3">
                              <span className="text-sm text-stone-700">{comment.nickname}</span>
                              <span className="text-[11px] text-stone-400" style={{ fontFamily: "sans-serif" }}>
                                {timeAgo(comment.created_at)}
                              </span>
                            </div>
                            <p className="text-sm leading-6 text-stone-600">{comment.content}</p>
                          </div>
                        ))}
                        {detailComments.length === 0 && (
                          <div className="rounded-2xl bg-stone-50/70 px-4 py-4 text-sm text-stone-400">
                            还没有评论，留下第一句回应吧。
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-end gap-3">
                      <textarea
                        value={commentText}
                        onChange={(event) => setCommentText(event.target.value)}
                        placeholder={user ? "写下你的回应" : "登录后可参与评论"}
                        disabled={!user}
                        className="min-h-24 flex-1 rounded-2xl border border-stone-200 bg-stone-50/80 px-4 py-3 text-sm text-stone-700 outline-none disabled:opacity-60"
                      />
                      <button
                        onClick={handleSubmitComment}
                        disabled={!user || commentSubmitting || !commentText.trim()}
                        className="flex h-12 w-12 items-center justify-center rounded-2xl bg-stone-800 text-white disabled:opacity-60"
                      >
                        <Send size={16} />
                      </button>
                    </div>
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
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
        className="w-full max-w-lg rounded-[2rem] bg-white p-5 shadow-2xl"
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
