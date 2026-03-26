/**
 * HTTP 客户端基础配置
 * 后端联调时只需修改 VITE_API_BASE_URL 环境变量，或在此处调整请求头/拦截器
 */

import { API_BASE_URL } from './config';
import { requestWithInterceptors } from './interceptors';
import { requestWithCache, cacheKeys } from './cache';

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? API_BASE_URL;

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });

  if (!res.ok) {
    let message = `API ${res.status}: ${res.statusText}`;
    try {
      const raw = await res.text();
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as { detail?: string; message?: string };
          if (typeof parsed.detail === 'string' && parsed.detail.trim()) {
            message = parsed.detail.trim();
          } else if (typeof parsed.message === 'string' && parsed.message.trim()) {
            message = parsed.message.trim();
          } else {
            message = raw;
          }
        } catch {
          message = raw;
        }
      }
    } catch {
      // ignore body parsing failure and fall back to default status text
    }
    throw new Error(message);
  }

  return res.json() as Promise<T>;
}

// 带缓存的GET请求
export const get = <T>(path: string, useCache: boolean = true, ttl: number = 5 * 60 * 1000) => {
  if (useCache) {
    // 为不同的路径生成合适的缓存键
    const cacheKey = path; // 在实际使用中，可以根据路径生成更具体的缓存键
    return requestWithCache<T>(cacheKey, () => requestWithInterceptors<T>(path), ttl);
  }
  return requestWithInterceptors<T>(path);
};

export const post = <T>(path: string, body: unknown) =>
  requestWithInterceptors<T>(path, { method: 'POST', body: JSON.stringify(body) });
