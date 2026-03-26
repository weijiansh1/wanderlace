import { get } from './client';
import type { MapClientConfig } from './types';

export const mapApi = {
  /** 获取地图客户端配置 */
  getClientConfig: async (): Promise<MapClientConfig> => {
    return await get<MapClientConfig>('/map/client-config');
  },

  /** 获取位置上下文信息 */
  getContext: async (lat: number, lng: number) => {
    return await get(`/map/context?lat=${lat}&lng=${lng}`);
  },

  /** 获取天气信息 */
  getWeather: async (lat: number, lng: number) => {
    return await get(`/map/weather?lat=${lat}&lng=${lng}`);
  },

  /** 获取步行路线规划 */
  getWalkingRoute: async (startLat: number, startLng: number, endLat: number, endLng: number) => {
    return await get(`/map/route/walking?start_lat=${startLat}&start_lng=${startLng}&end_lat=${endLat}&end_lng=${endLng}`);
  },
};