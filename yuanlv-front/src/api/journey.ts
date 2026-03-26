/**
 * 旅途相关 API
 */

import { get, post, request } from './client';
import { cacheUtils } from './cache';
import { resolveMediaUrl } from './media';
import type {
  JourneySummary,
  CapsuleUnlockResult,
  LocationPoint,
  AnchorData,
  DiaryResponse,
  TravelStartResult,
  CapsuleVerifyResult,
  TravelDetail,
  TravelLocation,
} from './types';

function diaryToJourneySummary(diary: DiaryResponse): JourneySummary | null {
  if (diary.status !== 'ready' || !diary.content_json) {
    return null;
  }
  const cj = diary.content_json;
  const meta = cj.meta || {};
  return {
    title: cj.title || '旅途回忆',
    date: cj.date || new Date().toLocaleDateString('zh-CN'),
    image: resolveMediaUrl(cj.image || ''),
    notebookImageRequested: Boolean(meta.notebook_image_requested),
    notebookImageStatus: (meta.notebook_image_status as JourneySummary['notebookImageStatus']) || 'idle',
    notebookImageError:
      typeof meta.notebook_image_error === 'string' ? meta.notebook_image_error : null,
    content: (cj.segments || []).map((seg) => ({
      text: seg.text,
      source: seg.source || 'ai',
    })),
  };
}

type SummarySegment = { text: string; source: 'ai' | 'user' | 'rag' };

function mapAnchorMedia(anchor: AnchorData): AnchorData {
  return {
    ...anchor,
    photo_url: resolveMediaUrl(anchor.photo_url || ''),
  };
}

export const journeyApi = {
  /** 开始旅途 */
  start: async (userId: string, city?: string): Promise<TravelStartResult> =>
    post<TravelStartResult>('/travel/start', { user_id: Number(userId), city }),

  /** 批量上传位置 */
  uploadLocations: async (travelId: string | number, points: LocationPoint[]): Promise<boolean> => {
    try {
      await post('/travel/location', {
        travel_id: Number(travelId),
        points: points.map((point) => ({
          ...point,
          timestamp: new Date(point.timestamp).toISOString(),
        })),
      });
      return true;
    } catch {
      return false;
    }
  },

  /** 手动添加锚点 */
  addManualAnchor: async (
    travelId: string | number,
    lat: number,
    lng: number,
    userText: string
  ): Promise<AnchorData> =>
    mapAnchorMedia(
      await post<AnchorData>('/travel/anchor/manual', {
        travel_id: Number(travelId),
        lat,
        lng,
        user_text: userText,
      })
    ),

  /** 更新锚点补写内容 */
  updateAnchor: async (
    anchorId: string | number,
    payload: { user_text?: string; audio_url?: string; photo_url?: string }
  ): Promise<AnchorData> =>
    requestAnchorPatch(anchorId, payload),

  /** 结束旅途 */
  end: async (
    travelId: string | number,
    options?: { generateNotebookImage?: boolean }
  ): Promise<{ status: string; diary_generating?: boolean; notebook_image_requested?: boolean }> => {
    const response = await post<{ status: string; diary_generating?: boolean; notebook_image_requested?: boolean }>(
      '/travel/end',
      {
        travel_id: Number(travelId),
        generate_notebook_image: Boolean(options?.generateNotebookImage),
      }
    );
    cacheUtils.clearTravelCache(String(travelId));
    return response;
  },

  /** 获取锚点列表 */
  getAnchors: async (travelId: string | number): Promise<AnchorData[]> => {
    const res = await get<{ items: AnchorData[] }>(`/travel/${travelId}/anchors`, false);
    return (res.items || []).map((item) => mapAnchorMedia(item));
  },

  /** 获取用户全部锚点 */
  getUserAnchors: async (userId: string | number, limit = 200): Promise<AnchorData[]> => {
    const res = await get<{ items: AnchorData[] }>(`/travel/anchors/user?user_id=${userId}&limit=${limit}`);
    return (res.items || []).map((item) => mapAnchorMedia(item));
  },

  /** 获取旅途日记 */
  getDiary: async (travelId: string | number): Promise<DiaryResponse> => {
    try {
      const diary = await get<DiaryResponse>(`/travel/${travelId}/diary`, false);
      if (diary.content_json) {
        diary.content_json.image = resolveMediaUrl(diary.content_json.image || '');
      }
      return diary;
    } catch {
      return { status: 'pending' };
    }
  },

  /** AI 判定胶囊解锁（调用后端 verify 接口） */
  unlockCapsule: async (answer: string, capsuleId?: string): Promise<CapsuleUnlockResult> => {
    if (!capsuleId) {
      return { success: false, message: '缺少胶囊标识。' };
    }
    // 使用capsuleApi进行验证
    const { capsuleApi } = await import('./capsule');
    const res = await capsuleApi.verify(capsuleId, answer);
    return {
      success: res.result === 'pass',
      message: res.content || res.poetic_line || res.message || '胶囊已解锁',
    };
  },

  /** AI 生成旅途散文 — 轮询后端 diary 接口 */
  generateSummary: async (travelId?: string | number): Promise<JourneySummary | null> => {
    if (!travelId) {
      return null;
    }
    cacheUtils.clearTravelCache(String(travelId));
    for (let i = 0; i < 14; i++) {
      try {
        const diary = await get<DiaryResponse>(`/travel/${travelId}/diary`, false);
        const summary = diaryToJourneySummary(diary);
        if (summary) {
          return summary;
        }
        if (diary.status === 'failed') break;
      } catch {
        // Backend unreachable, wait and retry
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
    return null;
  },

  /** 获取用户旅行列表 */
  getTravelList: async (userId: string, limit = 20): Promise<unknown[]> => {
    try {
      const res = await get<{ items: unknown[] }>(`/travel/list?user_id=${userId}&limit=${limit}`);
      return res.items || [];
    } catch {
      return [];
    }
  },

  /** 获取未读通知 */
  getNotifications: async (userId: string) => {
    try {
      return await get<unknown[]>(`/notifications/unread?user_id=${userId}`);
    } catch {
      return [];
    }
  },

  /** 获取旅行详情 */
  getTravelDetail: async (travelId: string | number): Promise<TravelDetail> => {
    return await get<TravelDetail>(`/travel/${travelId}`);
  },

  /** 获取旅行位置列表 */
  getTravelLocations: async (travelId: string | number): Promise<TravelLocation[]> => {
    const res = await get<{ items: TravelLocation[] }>(`/travel/${travelId}/locations`);
    return res.items || [];
  },

  /** 获取旅行日记详情 */
  getTravelDiary: async (travelId: string | number): Promise<DiaryResponse> => {
    try {
      const diary = await get<DiaryResponse>(`/travel/${travelId}/diary`, false);
      if (diary.content_json) {
        diary.content_json.image = resolveMediaUrl(diary.content_json.image || '');
      }
      return diary;
    } catch {
      return { status: 'pending' };
    }
  },

  getSummarySnapshot: async (travelId: string | number): Promise<JourneySummary | null> => {
    try {
      const diary = await get<DiaryResponse>(`/travel/${travelId}/diary`, false);
      return diaryToJourneySummary(diary);
    } catch {
      return null;
    }
  },

  generateNotebookImage: async (travelId: string | number): Promise<JourneySummary | null> => {
    const diary = await request<DiaryResponse>(`/travel/${travelId}/diary/notebook`, {
      method: 'POST',
    });
    if (diary.content_json) {
      diary.content_json.image = resolveMediaUrl(diary.content_json.image || '');
    }
    cacheUtils.clearTravelCache(String(travelId));
    return diaryToJourneySummary(diary);
  },

  updateDiary: async (
    travelId: string | number,
    payload: {
      title?: string;
      segments?: SummarySegment[];
    }
  ): Promise<JourneySummary | null> => {
    const diary = await request<DiaryResponse>(`/travel/${travelId}/diary`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    if (diary.content_json) {
      diary.content_json.image = resolveMediaUrl(diary.content_json.image || '');
    }
    cacheUtils.clearTravelCache(String(travelId));
    return diaryToJourneySummary(diary);
  },
};

async function requestAnchorPatch(
  anchorId: string | number,
  payload: { user_text?: string; audio_url?: string; photo_url?: string }
): Promise<AnchorData> {
  return mapAnchorMedia(
    await request<AnchorData>(`/travel/anchor/${anchorId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })
  );
}
