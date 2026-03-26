import { get, post } from './client';
import type { UserProfile, UserSettingsData } from './types';

export const userApi = {
  /** 获取用户信息 */
  getProfile: async (userId: string): Promise<UserProfile> => {
    return await get<UserProfile>(`/user/profile?user_id=${userId}`);
  },

  /** 更新用户信息 */
  updateProfile: async (userId: string, data: Partial<UserProfile>): Promise<UserProfile> => {
    return await post<UserProfile>('/user/profile', { user_id: Number(userId), ...data });
  },

  /** 获取用户个性化设置 */
  getSettings: async (userId: string): Promise<UserSettingsData> => {
    return await get<UserSettingsData>(`/user/settings?user_id=${userId}`, false);
  },

  /** 更新用户个性化设置 */
  updateSettings: async (
    userId: string,
    data: Partial<Omit<UserSettingsData, 'user_id' | 'updated_at'>>
  ): Promise<UserSettingsData> => {
    return await post<UserSettingsData>('/user/settings', { user_id: Number(userId), ...data });
  },

  /** 获取用户统计数据 */
  getUserStats: async (userId: string) => {
    return await get(`/user/stats?user_id=${userId}`);
  },
};
