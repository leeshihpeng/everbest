// 封裝 Google Maps Distance Matrix／Directions API。
// 未設定 GOOGLE_MAPS_API_KEY 時，自動退回用 Haversine 公式估算直線距離 * 1.3 道路係數，
// 方便本機開發／demo 時不需要真的 API Key 也能跑。

import type { DirectionsResult, RoutePoint } from "@route-scheduler/shared-types";

const API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const ROAD_FACTOR = 1.3; // 直線距離換算道路距離的粗估係數（無 API Key 時使用）
const ESTIMATED_SPEED_KMH = 30; // 無 API Key 時，用來粗估行車時間的市區平均車速

function haversineKm(a: RoutePoint, b: RoutePoint): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(h));
}

export interface DistanceDuration {
  distanceKm: number;
  durationMin: number;
}

/**
 * 回傳 origins x destinations 的距離＋時間矩陣。
 * 有 API Key 時打真正的 Distance Matrix API；否則用估算值。
 * 注意：Distance Matrix API 有查詢筆數上限（單次最多 25x25），客戶數多時要分批呼叫。
 */
export async function getDistanceMatrix(
  origins: RoutePoint[],
  destinations: RoutePoint[]
): Promise<DistanceDuration[][]> {
  if (!API_KEY) {
    return origins.map((o) =>
      destinations.map((d) => {
        const distanceKm = haversineKm(o, d) * ROAD_FACTOR;
        return { distanceKm, durationMin: (distanceKm / ESTIMATED_SPEED_KMH) * 60 };
      })
    );
  }

  const originsParam = origins.map((p) => `${p.lat},${p.lng}`).join("|");
  const destinationsParam = destinations.map((p) => `${p.lat},${p.lng}`).join("|");
  const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(
    originsParam
  )}&destinations=${encodeURIComponent(destinationsParam)}&key=${API_KEY}`;

  const res = await fetch(url);
  const data = (await res.json()) as any;

  if (data.status !== "OK") {
    throw new Error(`Distance Matrix API error: ${data.status}`);
  }

  return data.rows.map((row: any) =>
    row.elements.map((el: any) =>
      el.status === "OK"
        ? { distanceKm: el.distance.value / 1000, durationMin: el.duration.value / 60 }
        : { distanceKm: Infinity, durationMin: Infinity }
    )
  );
}

/** 舊介面（僅回傳距離），保留給還沒改用 getDistanceMatrix 的呼叫端 */
export async function getDistanceMatrixKm(origins: RoutePoint[], destinations: RoutePoint[]): Promise<number[][]> {
  const matrix = await getDistanceMatrix(origins, destinations);
  return matrix.map((row) => row.map((c) => c.distanceKm));
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
}

/**
 * 依「起點 → 停靠站（依序）→ 終點」呼叫 Directions API，取得逐步導航指示（含街名）與整段路線的
 * 編碼座標（overview polyline，前端用來在地圖上畫路線）。停靠站順序已由 optimizeRoute 決定，
 * 這裡固定 optimize:false，不讓 Google 自己重新排序。
 * 沒有 API Key 時回傳 null，呼叫端應該 fallback 成只顯示距離／時間，不顯示地圖與街名。
 */
export async function getDirections(
  origin: RoutePoint,
  destination: RoutePoint,
  waypoints: RoutePoint[]
): Promise<DirectionsResult | null> {
  if (!API_KEY) return null;

  const originParam = `${origin.lat},${origin.lng}`;
  const destinationParam = `${destination.lat},${destination.lng}`;
  const waypointsParam = waypoints.length
    ? `&waypoints=${encodeURIComponent(waypoints.map((p) => `${p.lat},${p.lng}`).join("|"))}`
    : "";

  const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${originParam}&destination=${destinationParam}${waypointsParam}&language=zh-TW&region=tw&key=${API_KEY}`;
  const res = await fetch(url);
  const data = (await res.json()) as any;

  if (data.status !== "OK" || !data.routes?.[0]) {
    throw new Error(`Directions API error: ${data.status}`);
  }

  const route = data.routes[0];
  const legs = route.legs.map((leg: any) => ({
    distanceText: leg.distance.text,
    durationText: leg.duration.text,
    steps: leg.steps.map((step: any) => ({
      instruction: stripHtml(step.html_instructions),
      distanceText: step.distance.text,
      durationText: step.duration.text,
    })),
  }));

  const totalDistanceMeters = route.legs.reduce((s: number, leg: any) => s + leg.distance.value, 0);
  const totalDurationSeconds = route.legs.reduce((s: number, leg: any) => s + leg.duration.value, 0);

  return {
    legs,
    overviewPolyline: route.overview_polyline.points,
    totalDistanceText: `${(totalDistanceMeters / 1000).toFixed(1)} 公里`,
    totalDurationText: `${Math.round(totalDurationSeconds / 60)} 分鐘`,
  };
}

/** 地址轉座標，建檔／匯入客戶或派遣單時呼叫一次即可，避免每次排路線都重新 geocode */
export async function geocodeAddress(address: string): Promise<RoutePoint | null> {
  if (!API_KEY) return null; // 開發模式下由呼叫端另外提供假座標
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
    address
  )}&key=${API_KEY}`;
  const res = await fetch(url);
  const data = (await res.json()) as any;
  if (data.status !== "OK" || !data.results?.[0]) return null;
  const loc = data.results[0].geometry.location;
  return { lat: loc.lat, lng: loc.lng };
}
