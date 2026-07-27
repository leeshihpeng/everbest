// 路線分享：交給手機的系統分享清單（可選 LINE 群組、訊息等），實際送出仍由使用者在該 App 確認。
// 與檢驗報告的「分享」同一套做法，差別只在這裡分享的是文字而非檔案。
import type { TimelineRoute } from "../components/common";

export function formatRouteShareText(params: {
  title: string;
  originLabel: string;
  destinationLabel: string;
  route: TimelineRoute;
}): string {
  const { title, originLabel, destinationLabel, route } = params;
  return [
    title,
    `出發：${originLabel} → 目的地：${destinationLabel}`,
    `總距離：約 ${route.totalDistanceKm.toFixed(1)} km`,
    "",
    ...route.stops.map((s, i) => {
      const tag = s.isPriority ? "【優先】" : "";
      const products = s.products?.length ? " - " + s.products.map((p) => `${p.name} x${p.qty}`).join("、") : "";
      return `${i + 1}. ${tag}${s.name}（${s.subtitle}）${products}`;
    }),
  ].join("\n");
}

/** 回傳 null＝已交給系統分享（或使用者自行取消）；回傳字串＝要顯示給使用者的提示訊息 */
export async function shareRouteText(title: string, text: string): Promise<string | null> {
  if (navigator.share) {
    try {
      await navigator.share({ title, text });
      return null;
    } catch (err) {
      // 使用者自行取消分享不算錯誤
      if ((err as Error).name === "AbortError") return null;
    }
  }
  // 電腦版瀏覽器多半沒有系統分享清單，改成複製文字讓使用者自己貼到 LINE
  try {
    await navigator.clipboard.writeText(text);
    return "此裝置不支援系統分享，已複製路線內容，請自行貼到 LINE 群組。";
  } catch {
    return "此裝置不支援系統分享，也無法自動複製，請手動選取路線內容複製。";
  }
}
