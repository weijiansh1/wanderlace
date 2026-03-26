import { get, post } from './client';
import type { CapsuleData, CapsuleDetailData, CapsuleMineItem, CapsuleVerifyResponse } from './types';

export const capsuleApi = {
  /** 获取附近胶囊 */
  getNearby: async (lat: number, lng: number, radius = 2000) => {
    const response = await get<{ items: CapsuleData[] }>(`/capsule/nearby?lat=${lat}&lng=${lng}&radius=${radius}`, false);
    return response;
  },

  /** 创建胶囊 */
  create: async (data: {
    user_id: number; lat: number; lng: number; city?: string;
    yuan_ji: string; key_question: string; key_answer_hint?: string;
    time_lock_until?: string;
    weather_when_created?: string;
  }) => {
    return await post<{ capsule_id: number; status: string; is_locked: boolean; time_lock_until?: string | null }>('/capsule/create', data);
  },

  /** 验证胶囊 */
  verify: async (
    capsuleId: string | number,
    userAnswer: string,
    options?: {
      finderUserId?: string | number;
      finderLat?: number;
      finderLng?: number;
    }
  ) => {
    return await post<CapsuleVerifyResponse>('/capsule/verify', {
      capsule_id: Number(capsuleId),
      user_answer: userAnswer,
      finder_user_id: options?.finderUserId ? Number(options.finderUserId) : undefined,
      finder_lat: options?.finderLat,
      finder_lng: options?.finderLng,
    });
  },

  /** 添加回响 */
  addEcho: async (capsuleId: string | number, content: string, finderUserId: string | number) => {
    return await post<{ status: string; echo_id: number }>('/capsule/echo', {
      capsule_id: Number(capsuleId),
      finder_user_id: Number(finderUserId),
      content,
    });
  },

  /** 获取我的胶囊 */
  getMine: async (userId: string | number, scope: 'all' | 'created' | 'found' = 'all') => {
    return await get<{ items: CapsuleMineItem[] }>(`/capsule/mine?user_id=${userId}&scope=${scope}`, false);
  },

  /** 获取胶囊详情 */
  getDetail: async (capsuleId: string | number, viewerUserId?: string | number) => {
    const query = viewerUserId != null ? `?viewer_user_id=${Number(viewerUserId)}` : '';
    return await get<CapsuleDetailData>(`/capsule/${capsuleId}${query}`, false);
  },

  /** 在当前位置埋下胶囊 */
  createAtCurrentLocation: async (data: {
    user_id: number;
    lat: number;
    lng: number;
    city?: string;
    yuan_ji: string;
    key_question: string;
    key_answer_hint?: string;
    time_lock_until?: string;
    weather_when_created?: string;
  }) => {
    return await post<{ capsule_id: number; status: string; is_locked: boolean; time_lock_until?: string | null }>('/capsule/create', data);
  },
};
