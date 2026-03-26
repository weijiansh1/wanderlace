import { API_BASE_URL } from './config';

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? API_BASE_URL;

export function resolveMediaUrl(url?: string | null): string {
  const value = `${url || ''}`.trim();
  if (!value) return '';
  if (value.startsWith('http://') || value.startsWith('https://') || value.startsWith('data:')) {
    return value;
  }
  if (value.startsWith('/')) {
    return `${BASE_URL}${value}`;
  }
  return `${BASE_URL}/${value}`;
}

export function resolveMediaList(urls?: Array<string | null | undefined> | null): string[] {
  return (urls || []).map((item) => resolveMediaUrl(item)).filter(Boolean);
}
