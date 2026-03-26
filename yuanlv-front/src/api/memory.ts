import { get, post } from './client';
import { resolveMediaUrl } from './media';
import type {
  MemoryCalendarResponse,
  MemoryNotification,
  MemoryOverviewResponse,
  MemoryRecord,
  MemorySearchResult,
  MemoryTimelineItem,
  MemoryTimelineResponse,
  UserProfile,
} from './types';

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月`;
}

function mapProfile(overview: MemoryOverviewResponse): UserProfile {
  const profile = overview.profile;
  return {
    id: String(profile.user_id),
    name: profile.nickname || profile.username || '旅人',
    avatar: resolveMediaUrl(profile.avatar_url || ''),
    joinDate: profile.created_at,
    stats: {
      journeys: profile.stats.travels,
      days: profile.stats.diaries,
      memories: profile.stats.travels + profile.stats.capsules + profile.stats.bottles,
    },
    level: profile.level,
    levelName: profile.level_name,
    points: profile.points,
    bio: profile.bio || undefined,
    unreadNotifications: profile.stats.unread_notifications,
  };
}

function mapTimelineItems(items: MemoryTimelineItem[]): MemoryRecord[] {
  return items.map((item) => ({
    id: item.id,
    travelId: item.travel_id,
    date: item.start_time ? formatDate(item.start_time) : '',
    title: item.diary_title || item.city || '旅途记录',
    desc: item.diary_excerpt,
    image: resolveMediaUrl(item.diary_image || ''),
    distance: item.total_distance,
    city: item.city || undefined,
    status: item.status,
    diaryStatus: item.diary_status || undefined,
    weatherSummary: item.weather_summary || undefined,
    anchorCount: item.anchor_count,
    locationCount: item.location_count,
    replayAvailable: item.replay_available,
  }));
}

function mapTimeline(overview: MemoryOverviewResponse): MemoryRecord[] {
  return mapTimelineItems(overview.timeline);
}

export const memoryApi = {
  /** 获取记忆总览 */
  getOverview: async (userId: string, timelineLimit = 30, notificationLimit = 12): Promise<MemoryOverviewResponse> => {
    return await get<MemoryOverviewResponse>(
      `/memory/overview?user_id=${userId}&timeline_limit=${timelineLimit}&notification_limit=${notificationLimit}`,
      false
    );
  },

  /** 获取用户资料 */
  getProfile: async (userId?: string): Promise<UserProfile> => {
    if (!userId) return _fallbackProfile();
    try {
      const overview = await memoryApi.getOverview(userId, 1, 6);
      return mapProfile(overview);
    } catch {
      return _fallbackProfile();
    }
  },

  /** 获取记忆时间线 */
  getTimeline: async (userId?: string): Promise<MemoryRecord[]> => {
    if (!userId) return [];
    try {
      const overview = await memoryApi.getOverview(userId, 50, 6);
      return mapTimeline(overview);
    } catch {
      return [];
    }
  },

  getTimelineByRange: async (
    userId: string,
    dateFrom: string,
    dateTo: string,
    limit = 200
  ): Promise<MemoryRecord[]> => {
    const qs = new URLSearchParams({
      user_id: userId,
      date_from: dateFrom,
      date_to: dateTo,
      limit: String(limit),
    });
    const response = await get<MemoryTimelineResponse>(`/memory/timeline?${qs.toString()}`, false);
    return mapTimelineItems(response.items || []);
  },

  getCalendarMonth: async (userId: string, month: string): Promise<MemoryCalendarResponse> => {
    const qs = new URLSearchParams({
      user_id: userId,
      month,
    });
    return await get<MemoryCalendarResponse>(`/memory/calendar?${qs.toString()}`, false);
  },

  /** 获取最近通知 */
  getNotifications: async (userId?: string): Promise<MemoryNotification[]> => {
    if (!userId) return [];
    try {
      const overview = await memoryApi.getOverview(userId, 10, 12);
      return overview.notifications || [];
    } catch {
      return [];
    }
  },

  /** 搜索历史记忆（RAG） */
  searchHistory: async (
    userId: string,
    query: string,
    city?: string,
    topK = 5
  ): Promise<{ has_history: boolean; items: MemorySearchResult[] }> => {
    const qs = new URLSearchParams({
      user_id: userId,
      query,
      top_k: String(topK),
    });
    if (city) qs.set('city', city);
    return await get<{ has_history: boolean; items: MemorySearchResult[] }>(`/memory/history/search?${qs.toString()}`);
  },

  /** 更新用户资料 */
  updateProfile: async (data: {
    user_id: number;
    nickname?: string;
    avatar_url?: string;
    bio?: string;
  }): Promise<{ success: boolean }> => {
    try {
      return await post<{ success: boolean }>('/user/profile', data);
    } catch {
      return { success: false };
    }
  },

  /** 获取用户统计数据 */
  getUserStats: async (userId: string) => {
    try {
      const overview = await memoryApi.getOverview(userId, 10, 6);
      return overview.profile.stats;
    } catch {
      return { travels: 0, capsules: 0, bottles: 0, diaries: 0, anchors: 0, cities: 0, city_names: [], unread_notifications: 0 };
    }
  },

  /** 获取用户等级信息 */
  getUserLevel: async (userId: string) => {
    try {
      const overview = await memoryApi.getOverview(userId, 5, 6);
      return {
        level: overview.profile.level,
        level_name: overview.profile.level_name,
        points: overview.profile.points,
      };
    } catch {
      return { level: 1, level_name: '新手旅人', points: 0 };
    }
  },

  mapProfile,
  mapTimeline,
  mapTimelineItems,
};

function _fallbackProfile(): UserProfile {
  return {
    id: 'u_me',
    name: '旅人',
    avatar: '',
    joinDate: '',
    stats: { journeys: 0, days: 0, memories: 0 },
  };
}
