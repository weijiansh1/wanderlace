import { useEffect, useMemo, useRef, useState } from 'react';
import mapboxgl, { Map, type GeoJSONSource, type MapLayerMouseEvent } from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import type { AnchorData, CapsuleData } from '../api/types';

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN || '';

interface Props {
  center: { lat: number; lng: number } | null;
  trajectoryPath: Array<{ lat: number; lng: number }>;
  anchors: AnchorData[];
  capsules: CapsuleData[];
  routePath?: Array<{ lat: number; lng: number }>;
  onCapsuleClick?: (capsule: CapsuleData) => void;
  onAnchorClick?: (anchor: AnchorData) => void;
  zoom?: number;
  pitch?: number;
  rotation?: number;
  passive?: boolean;
  lineColor?: string;
  lineWidth?: number;
}

const EMPTY_FC = {
  type: 'FeatureCollection',
  features: [],
} as const;

const SOURCE_IDS = {
  trajectory: 'trajectory',
  route: 'planned-route',
  anchors: 'anchors-source',
  capsules: 'capsules-source',
  user: 'user-location-source',
} as const;

const LAYER_IDS = {
  trajectory: 'trajectory-line',
  route: 'planned-route-line',
  anchorsGlow: 'anchors-glow',
  anchorsCore: 'anchors-core',
  capsulesGlow: 'capsules-glow',
  capsulesCore: 'capsules-core',
  userGlow: 'user-location-glow',
  userCore: 'user-location-core',
} as const;

function toLineFeature(points: Array<{ lat: number; lng: number }>) {
  return {
    type: 'FeatureCollection',
    features:
      points.length >= 2
        ? [
            {
              type: 'Feature',
              properties: {},
              geometry: {
                type: 'LineString',
                coordinates: points.map((p) => [p.lng, p.lat]),
              },
            },
          ]
        : [],
  } as const;
}

function toPointFeatures<T extends { id: string | number; lat: number; lng: number }>(items: T[]) {
  return {
    type: 'FeatureCollection',
    features: items.map((item) => ({
      type: 'Feature',
      properties: { id: String(item.id) },
      geometry: {
        type: 'Point',
        coordinates: [item.lng, item.lat],
      },
    })),
  } as const;
}

function ensureGeoJsonSource(map: Map, id: string) {
  const existing = map.getSource(id) as GeoJSONSource | undefined;
  if (existing) return existing;
  map.addSource(id, {
    type: 'geojson',
    data: EMPTY_FC,
  });
  return map.getSource(id) as GeoJSONSource;
}

function ensureLineLayer(map: Map, id: string, source: string, paint: Record<string, unknown>) {
  if (map.getLayer(id)) return;
  map.addLayer({
    id,
    type: 'line',
    source,
    layout: {
      'line-join': 'round',
      'line-cap': 'round',
    },
    paint,
  });
}

function ensureCircleLayer(
  map: Map,
  id: string,
  source: string,
  paint: Record<string, unknown>,
  minzoom = 0
) {
  if (map.getLayer(id)) return;
  map.addLayer({
    id,
    type: 'circle',
    source,
    minzoom,
    paint,
  });
}

export function MapboxRomanceMap({
  center,
  trajectoryPath,
  anchors,
  capsules,
  routePath,
  onCapsuleClick,
  onAnchorClick,
  zoom = 16,
  pitch = 42,
  rotation = -18,
  passive = false,
  lineColor = '#e85d3a',
  lineWidth = 7,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const handlersRef = useRef({ anchors, capsules, onAnchorClick, onCapsuleClick });
  const [loadError, setLoadError] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);

  handlersRef.current = { anchors, capsules, onAnchorClick, onCapsuleClick };

  const centerKey = useMemo(
    () => (center ? `${center.lat.toFixed(6)}-${center.lng.toFixed(6)}` : 'empty'),
    [center]
  );
  const trajectoryKey = useMemo(
    () =>
      trajectoryPath.length
        ? `${trajectoryPath.length}-${trajectoryPath[trajectoryPath.length - 1].lat.toFixed(5)}-${trajectoryPath[
            trajectoryPath.length - 1
          ].lng.toFixed(5)}`
        : 'empty',
    [trajectoryPath]
  );
  const routeKey = useMemo(
    () =>
      routePath && routePath.length
        ? `${routePath.length}-${routePath[routePath.length - 1].lat.toFixed(5)}-${routePath[
            routePath.length - 1
          ].lng.toFixed(5)}`
        : 'empty',
    [routePath]
  );
  const anchorKey = useMemo(() => anchors.map((item) => item.id).join(','), [anchors]);
  const capsuleKey = useMemo(() => capsules.map((item) => item.id).join(','), [capsules]);

  useEffect(() => {
    if (!containerRef.current) return;

    try {
      const map = new Map({
        container: containerRef.current,
        style: 'mapbox://styles/mapbox/light-v11',
        center: center ? [center.lng, center.lat] : [121.4737, 31.2304],
        zoom,
        pitch,
        bearing: rotation,
        interactive: !passive,
      });
      mapRef.current = map;

      const handleAnchorClick = (event: MapLayerMouseEvent) => {
        const featureId = String(event.features?.[0]?.properties?.id || '');
        const anchor = handlersRef.current.anchors.find((item) => String(item.id) === featureId);
        if (anchor) handlersRef.current.onAnchorClick?.(anchor);
      };

      const handleCapsuleClick = (event: MapLayerMouseEvent) => {
        const featureId = String(event.features?.[0]?.properties?.id || '');
        const capsule = handlersRef.current.capsules.find((item) => String(item.id) === featureId);
        if (capsule) handlersRef.current.onCapsuleClick?.(capsule);
      };

      const setPointer = () => {
        map.getCanvas().style.cursor = 'pointer';
      };
      const resetPointer = () => {
        map.getCanvas().style.cursor = '';
      };

      map.on('load', () => {
        setMapLoaded(true);
        map.resize();

        ensureGeoJsonSource(map, SOURCE_IDS.trajectory);
        ensureGeoJsonSource(map, SOURCE_IDS.route);
        ensureGeoJsonSource(map, SOURCE_IDS.anchors);
        ensureGeoJsonSource(map, SOURCE_IDS.capsules);
        ensureGeoJsonSource(map, SOURCE_IDS.user);

        ensureLineLayer(map, LAYER_IDS.route, SOURCE_IDS.route, {
          'line-color': '#3b82f6',
          'line-width': 6,
          'line-opacity': 0.88,
          'line-dasharray': [2, 1.4],
        });

        ensureLineLayer(map, LAYER_IDS.trajectory, SOURCE_IDS.trajectory, {
          'line-color': lineColor,
          'line-width': lineWidth,
          'line-opacity': 0.95,
        });

        ensureCircleLayer(map, LAYER_IDS.anchorsGlow, SOURCE_IDS.anchors, {
          'circle-radius': 16,
          'circle-color': 'rgba(251, 146, 60, 0.22)',
          'circle-blur': 0.65,
        });
        ensureCircleLayer(map, LAYER_IDS.anchorsCore, SOURCE_IDS.anchors, {
          'circle-radius': 9,
          'circle-color': '#f97316',
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        });

        ensureCircleLayer(map, LAYER_IDS.capsulesGlow, SOURCE_IDS.capsules, {
          'circle-radius': 18,
          'circle-color': 'rgba(129, 140, 248, 0.18)',
          'circle-blur': 0.65,
        });
        ensureCircleLayer(map, LAYER_IDS.capsulesCore, SOURCE_IDS.capsules, {
          'circle-radius': 10,
          'circle-color': '#818cf8',
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        });

        ensureCircleLayer(map, LAYER_IDS.userGlow, SOURCE_IDS.user, {
          'circle-radius': 14,
          'circle-color': 'rgba(239, 68, 68, 0.22)',
          'circle-blur': 0.65,
        });
        ensureCircleLayer(map, LAYER_IDS.userCore, SOURCE_IDS.user, {
          'circle-radius': 6,
          'circle-color': '#ef4444',
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        });

        map.on('click', LAYER_IDS.anchorsGlow, handleAnchorClick);
        [LAYER_IDS.anchorsCore, LAYER_IDS.anchorsGlow].forEach((layerId) => {
          map.on('mouseenter', layerId, setPointer);
          map.on('mouseleave', layerId, resetPointer);
        });

        map.on('click', LAYER_IDS.capsulesGlow, handleCapsuleClick);
        [LAYER_IDS.capsulesCore, LAYER_IDS.capsulesGlow].forEach((layerId) => {
          map.on('mouseenter', layerId, setPointer);
          map.on('mouseleave', layerId, resetPointer);
        });
      });

      map.on('error', (e) => {
        console.error('[Mapbox] error:', e);
        setLoadError(true);
      });
    } catch (error) {
      console.error('[Mapbox] init failed:', error);
      setLoadError(true);
    }

    return () => {
      setMapLoaded(false);
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !center) return;

    map.easeTo({
      center: [center.lng, center.lat],
      duration: 1000,
      essential: true,
    });
  }, [centerKey, mapLoaded]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const source = map.getSource(SOURCE_IDS.trajectory) as GeoJSONSource | undefined;
    source?.setData(toLineFeature(trajectoryPath));
  }, [mapLoaded, trajectoryKey, trajectoryPath]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const source = map.getSource(SOURCE_IDS.route) as GeoJSONSource | undefined;
    source?.setData(toLineFeature(routePath || []));
  }, [mapLoaded, routeKey, routePath]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const source = map.getSource(SOURCE_IDS.anchors) as GeoJSONSource | undefined;
    source?.setData(toPointFeatures(anchors));
  }, [anchorKey, anchors, mapLoaded]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const source = map.getSource(SOURCE_IDS.capsules) as GeoJSONSource | undefined;
    source?.setData(toPointFeatures(capsules));
  }, [capsuleKey, capsules, mapLoaded]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const source = map.getSource(SOURCE_IDS.user) as GeoJSONSource | undefined;
    source?.setData(
      center && !passive
        ? {
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                properties: { id: 'user' },
                geometry: {
                  type: 'Point',
                  coordinates: [center.lng, center.lat],
                },
              },
            ],
          }
        : EMPTY_FC
    );
  }, [center?.lat, center?.lng, mapLoaded, passive]);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-[inherit]">
      <div ref={containerRef} className="h-full w-full" />

      {loadError && (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[#fde68a]/40 via-[#fff7ed] to-[#fbcfe8]/40">
          <div className="rounded-3xl bg-white/70 px-6 py-5 text-center text-sm text-stone-500 backdrop-blur-xl">
            地图暂时没有赶来，
            <br />
            但旅途的光已经在路上。
          </div>
        </div>
      )}

      <style>{`
        .mapboxgl-ctrl-bottom-right { display: none; }
        .mapboxgl-ctrl-bottom-left { display: none; }
        .mapboxgl-ctrl-top-right { display: none; }
        .mapboxgl-ctrl-top-left { display: none; }
      `}</style>
    </div>
  );
}
