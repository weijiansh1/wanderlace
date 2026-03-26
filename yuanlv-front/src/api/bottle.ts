import { get, post } from './client';
import type { BottleMineItem, BottleTrajectoryData } from './types';

export const bottleApi = {
  /** 扔远洋瓶 */
  throwBottle: async (data: {
    user_id: number; content: string; lat: number; lng: number;
    to_lat?: number; to_lng?: number; to_city?: string;
  }) => {
    return await post<{ status: string; bottle_id: number }>('/bottle/throw', data);
  },

  /** 捡远洋瓶 */
  receiveBottle: async (userId: string, lat: number, lng: number) => {
    return await post<{ received: boolean; content?: string; bottle?: any }>(
      '/bottle/receive', 
      { user_id: Number(userId), lat, lng }
    );
  },

  /** 获取我的瓶子 */
  getMine: async (userId: string, scope: 'all' | 'thrown' | 'received' = 'all') => {
    return await get<{ items: BottleMineItem[] }>(`/bottle/mine?user_id=${userId}&scope=${scope}`, false);
  },

  /** 获取瓶子轨迹 */
  getTrajectory: async (bottleId: string) => {
    return await get<BottleTrajectoryData>(`/bottle/trajectory/${bottleId}`);
  },
};
