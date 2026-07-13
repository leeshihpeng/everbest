// 動態載入 Google Maps JavaScript API（含 geometry library，用來解碼 Directions API 回傳的 overview polyline）

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

let loadPromise: Promise<typeof google> | null = null;

export function loadGoogleMaps(): Promise<typeof google> {
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    if (!API_KEY) {
      reject(new Error("未設定 VITE_GOOGLE_MAPS_API_KEY，無法載入地圖"));
      return;
    }
    if (window.google?.maps) {
      resolve(window.google);
      return;
    }
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${API_KEY}&libraries=geometry`;
    script.async = true;
    script.onload = () => resolve(window.google);
    script.onerror = () => reject(new Error("Google Maps script 載入失敗"));
    document.head.appendChild(script);
  });

  return loadPromise;
}

/**
 * 組出 Google Maps 導航網址（開啟 Google Maps App／網頁版，讓使用者用手機原生導航），
 * 依序帶入出發地、停靠站（最多 9 站，超過的話 Google Maps 會忽略多出來的部分）、目的地。
 */
export function buildNavigationUrl(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  waypoints: { lat: number; lng: number }[]
): string {
  const params = new URLSearchParams({
    api: "1",
    origin: `${origin.lat},${origin.lng}`,
    destination: `${destination.lat},${destination.lng}`,
    travelmode: "driving",
  });
  if (waypoints.length > 0) {
    params.set("waypoints", waypoints.map((p) => `${p.lat},${p.lng}`).join("|"));
  }
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
