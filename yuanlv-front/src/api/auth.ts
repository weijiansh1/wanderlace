import { get, post } from './client';

export interface RegisterData {
  username: string;
  password: string;
  nickname: string;
}

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface BackendAuthResponse {
  user_id: number;
  username: string;
  nickname: string | null;
  avatar_url: string | null;
  created_at: string;
}

export const authApi = {
  /** 用户注册 */
  register: async (data: RegisterData): Promise<BackendAuthResponse> => {
    return await post<BackendAuthResponse>('/auth/register', data);
  },

  /** 用户登录 */
  login: async (username: string, password: string): Promise<BackendAuthResponse> => {
    return await post<BackendAuthResponse>('/auth/login', {
      username,
      password,
    });
  },

  /** 获取当前用户信息 */
  getCurrentUser: async (userId?: string): Promise<BackendAuthResponse> => {
    const uid = userId ?? localStorage.getItem('yuanlv_user_id');
    if (!uid) throw new Error('No user_id available');
    return await get<BackendAuthResponse>(`/auth/me?user_id=${uid}`, false);
  },

  /** 用户登出 */
  logout: async (): Promise<void> => {
    await post('/auth/logout', {});
    // 清除本地存储的认证信息
    localStorage.removeItem('access_token');
  },

  /** 刷新令牌 */
  refreshToken: async (): Promise<{ access_token: string }> => {
    return await post('/auth/refresh', {});
  },
};
