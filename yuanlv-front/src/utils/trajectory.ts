/**
 * 轨迹插值和动画工具函数
 */

import type { TravelLocation } from '../api/types';

/**
 * 在两个坐标点之间进行线性插值
 */
export function interpolatePosition(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
  t: number // 0-1 之间的插值参数
): { lat: number; lng: number } {
  return {
    lat: lat1 + (lat2 - lat1) * t,
    lng: lng1 + (lng2 - lng1) * t,
  };
}

/**
 * 对轨迹进行插值，增加中间点使动画更平滑
 */
export function interpolateTrajectory(
  locations: TravelLocation[],
  pointsPerSegment = 10
): TravelLocation[] {
  if (locations.length < 2) return locations;

  const result: TravelLocation[] = [];

  for (let i = 0; i < locations.length - 1; i++) {
    const current = locations[i];
    const next = locations[i + 1];

    result.push(current);

    // 在当前点和下一点之间插入中间点
    for (let j = 1; j <= pointsPerSegment; j++) {
      const t = j / (pointsPerSegment + 1);
      const pos = interpolatePosition(current.lat, current.lng, next.lat, next.lng, t);

      // 计算插值时间
      const currentTime = new Date(current.timestamp).getTime();
      const nextTime = new Date(next.timestamp).getTime();
      const插值时间 = currentTime + (nextTime - currentTime) * t;

      result.push({
        id: -1,
        travel_id: current.travel_id,
        lat: pos.lat,
        lng: pos.lng,
        speed: current.speed,
        timestamp: new Date(插值时间).toISOString(),
      });
    }
  }

  // 添加最后一个点
  result.push(locations[locations.length - 1]);

  return result;
}

/**
 * 计算两个坐标点之间的距离（Haversine 公式）
 */
export function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000; // 地球半径（米）
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * 计算轨迹总长度
 */
export function calculateTrajectoryLength(locations: TravelLocation[]): number {
  if (locations.length < 2) return 0;

  let total = 0;
  for (let i = 1; i < locations.length; i++) {
    total += haversineDistance(
      locations[i - 1].lat,
      locations[i - 1].lng,
      locations[i].lat,
      locations[i].lng
    );
  }

  return total; // 单位：米
}

/**
 * 根据进度获取轨迹上的位置
 * @param locations 轨迹点列表
 * @param progress 进度 (0-1)
 * @returns 当前位置和已走距离
 */
export function getPositionAtProgress(
  locations: TravelLocation[],
  progress: number
): {
  lat: number;
  lng: number;
  distance: number;
  timestamp: string;
} {
  if (locations.length === 0) {
    return { lat: 0, lng: 0, distance: 0, timestamp: '' };
  }

  if (locations.length === 1 || progress <= 0) {
    return {
      lat: locations[0].lat,
      lng: locations[0].lng,
      distance: 0,
      timestamp: locations[0].timestamp,
    };
  }

  if (progress >= 1) {
    const last = locations[locations.length - 1];
    return {
      lat: last.lat,
      lng: last.lng,
      distance: calculateTrajectoryLength(locations),
      timestamp: last.timestamp,
    };
  }

  const totalLength = calculateTrajectoryLength(locations);
  const targetDistance = totalLength * progress;

  let accumulatedDistance = 0;

  for (let i = 1; i < locations.length; i++) {
    const prev = locations[i - 1];
    const curr = locations[i];
    const segmentLength = haversineDistance(prev.lat, prev.lng, curr.lat, curr.lng);

    if (accumulatedDistance + segmentLength >= targetDistance) {
      // 目标点在这个线段上
      const remainingDistance = targetDistance - accumulatedDistance;
      const t = segmentLength > 0 ? remainingDistance / segmentLength : 0;

      const pos = interpolatePosition(prev.lat, prev.lng, curr.lat, curr.lng, t);

      // 插值时间
      const prevTime = new Date(prev.timestamp).getTime();
      const currTime = new Date(curr.timestamp).getTime();
      const插值时间 = prevTime + (currTime - prevTime) * t;

      return {
        lat: pos.lat,
        lng: pos.lng,
        distance: targetDistance,
        timestamp: new Date(插值时间).toISOString(),
      };
    }

    accumulatedDistance += segmentLength;
  }

  // 理论上不会到这里
  const last = locations[locations.length - 1];
  return {
    lat: last.lat,
    lng: last.lng,
    distance: totalLength,
    timestamp: last.timestamp,
  };
}

/**
 * 格式化距离显示
 */
export function formatDistance(meters: number): string {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(2)} km`;
  }
  return `${Math.round(meters)} m`;
}

/**
 * 格式化时间显示
 */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}
