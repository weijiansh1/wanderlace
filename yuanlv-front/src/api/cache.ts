/**
 * API缓存管理器
 * 用于缓存API响应数据，减少重复请求
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number; // Time to live in milliseconds
}

class ApiCache {
  private cache: Map<string, CacheEntry<any>> = new Map();

  /**
   * 设置缓存
   */
  set<T>(key: string, data: T, ttl: number = 5 * 60 * 1000): void { // 默认5分钟
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    });
  }

  /**
   * 获取缓存
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return null;
    }

    // 检查是否过期
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  /**
   * 删除缓存
   */
  delete(key: string): void {
    this.cache.delete(key);
  }

  /**
   * 清空所有缓存
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * 检查缓存是否存在且未过期
   */
  hasValidCache(key: string): boolean {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return false;
    }

    return Date.now() - entry.timestamp <= entry.ttl;
  }

  /**
   * 清理过期缓存
   */
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * 获取缓存统计信息
   */
  getStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    };
  }
}

// 创建全局缓存实例
export const apiCache = new ApiCache();

// 带缓存的请求函数
export async function requestWithCache<T>(
  key: string,
  requestFn: () => Promise<T>,
  ttl: number = 5 * 60 * 1000 // 默认5分钟
): Promise<T> {
  // 检查缓存
  const cachedData = apiCache.get<T>(key);
  if (cachedData !== null) {
    return cachedData;
  }

  // 执行请求
  const data = await requestFn();
  
  // 存储到缓存
  apiCache.set(key, data, ttl);
  
  return data;
}

// 常用缓存键生成器
export const cacheKeys = {
  // 用户相关
  userProfile: (userId: string) => `user_profile_${userId}`,
  userStats: (userId: string) => `user_stats_${userId}`,
  
  // 旅行相关
  travelList: (userId: string, limit: number = 20) => `travel_list_${userId}_${limit}`,
  travelDetails: (travelId: string) => `travel_details_${travelId}`,
  travelAnchors: (travelId: string) => `travel_anchors_${travelId}`,
  
  // 胶囊相关
  nearbyCapsules: (lat: number, lng: number, radius: number = 500) => 
    `capsules_nearby_${lat.toFixed(4)}_${lng.toFixed(4)}_${radius}`,
  
  // 社区相关
  communityPosts: (params: { tag?: string; page?: number; pageSize?: number } = {}) => {
    const tag = params.tag ? `_tag_${params.tag}` : '';
    const page = params.page ? `_page_${params.page}` : '_page_1';
    const pageSize = params.pageSize ? `_size_${params.pageSize}` : '_size_20';
    return `community_posts${tag}${page}${pageSize}`;
  },
  
  // 地图相关
  mapContext: (lat: number, lng: number) => `map_context_${lat.toFixed(4)}_${lng.toFixed(4)}`,
  
  // 日记相关
  diary: (travelId: string) => `diary_${travelId}`,
};

// 缓存清理工具
export const cacheUtils = {
  // 清理特定用户的缓存
  clearUserCache: (userId: string) => {
    apiCache.delete(cacheKeys.userProfile(userId));
    apiCache.delete(cacheKeys.userStats(userId));
    apiCache.delete(cacheKeys.travelList(userId));
  },
  
  // 清理旅行相关缓存
  clearTravelCache: (travelId: string) => {
    apiCache.delete(cacheKeys.travelDetails(travelId));
    apiCache.delete(cacheKeys.travelAnchors(travelId));
    apiCache.delete(cacheKeys.diary(travelId));
    apiCache.delete(`/travel/${travelId}`);
    apiCache.delete(`/travel/${travelId}/anchors`);
    apiCache.delete(`/travel/${travelId}/diary`);
  },
  
  // 清理附近胶囊缓存
  clearNearbyCapsulesCache: (lat: number, lng: number) => {
    // 清理不同半径的缓存
    [100, 300, 500, 1000].forEach(radius => {
      apiCache.delete(cacheKeys.nearbyCapsules(lat, lng, radius));
    });
  },
  
  // 清理社区帖子缓存
  clearCommunityCache: () => {
    // 获取所有社区帖子相关的缓存键并清理
    const stats = apiCache.getStats();
    stats.keys
      .filter(key => key.startsWith('community_posts'))
      .forEach(key => apiCache.delete(key));
  }
};
