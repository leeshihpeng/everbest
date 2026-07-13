import { useEffect, useRef, useState } from "react";
import { loadGoogleMaps } from "../lib/googleMapsLoader";
import { C } from "./common";

export interface RouteMapStop {
  lat: number;
  lng: number;
  label: string; // 顯示在地圖標記上的文字，通常是站點順序數字
  title?: string; // 滑鼠移過去/點擊顯示的名稱
  isPriority?: boolean;
}

export interface RouteMapProps {
  origin: { lat: number; lng: number; title?: string };
  destination: { lat: number; lng: number; title?: string };
  stops: RouteMapStop[];
  overviewPolyline?: string;
  accent: string;
  height?: number;
}

export function RouteMap({ origin, destination, stops, overviewPolyline, accent, height = 220 }: RouteMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    loadGoogleMaps()
      .then((g) => {
        if (cancelled || !mapRef.current) return;

        const bounds = new g.maps.LatLngBounds();
        const map = new g.maps.Map(mapRef.current, {
          center: origin,
          zoom: 13,
          disableDefaultUI: true,
          zoomControl: true,
        });

        new g.maps.Marker({
          position: origin,
          map,
          title: origin.title ?? "出發地",
          icon: {
            path: g.maps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: C.navy,
            fillOpacity: 1,
            strokeColor: "#fff",
            strokeWeight: 2,
          },
        });
        bounds.extend(origin);

        stops.forEach((s) => {
          new g.maps.Marker({
            position: { lat: s.lat, lng: s.lng },
            map,
            title: s.title,
            label: { text: s.label, color: "#fff", fontSize: "11px", fontWeight: "bold" },
            icon: {
              path: g.maps.SymbolPath.CIRCLE,
              scale: 12,
              fillColor: s.isPriority ? C.gold : accent,
              fillOpacity: 1,
              strokeColor: "#fff",
              strokeWeight: 2,
            },
          });
          bounds.extend({ lat: s.lat, lng: s.lng });
        });

        new g.maps.Marker({
          position: destination,
          map,
          title: destination.title ?? "目的地",
          icon: {
            path: g.maps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: C.navy,
            fillOpacity: 1,
            strokeColor: "#fff",
            strokeWeight: 2,
          },
        });
        bounds.extend(destination);

        if (overviewPolyline) {
          const path = g.maps.geometry.encoding.decodePath(overviewPolyline);
          new g.maps.Polyline({
            path,
            map,
            strokeColor: accent,
            strokeOpacity: 0.9,
            strokeWeight: 4,
          });
          path.forEach((p) => bounds.extend(p));
        }

        map.fitBounds(bounds, 40);
      })
      .catch((err) => setError((err as Error).message));

    return () => {
      cancelled = true;
    };
  }, [origin.lat, origin.lng, destination.lat, destination.lng, overviewPolyline, stops.length]);

  if (error) {
    return (
      <div
        style={{ height, background: C.bg, border: `1px solid ${C.hairline}`, color: C.muted }}
        className="rounded-xl flex items-center justify-center text-[12px] text-center px-4"
      >
        地圖載入失敗：{error}
      </div>
    );
  }

  return <div ref={mapRef} style={{ height }} className="rounded-xl overflow-hidden" />;
}
