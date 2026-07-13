// LINE Messaging API 推播封裝 — 用於「分享到 LINE 群組」與 5.4 派遣單異動通知

const CHANNEL_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;

export async function pushLineMessage(groupId: string, text: string): Promise<void> {
  if (!CHANNEL_TOKEN) {
    console.warn("[lineNotify] LINE_CHANNEL_ACCESS_TOKEN 未設定，略過實際推播:", text);
    return;
  }

  const res = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${CHANNEL_TOKEN}`,
    },
    body: JSON.stringify({
      to: groupId,
      messages: [{ type: "text", text }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`LINE push failed: ${res.status} ${body}`);
  }
}

/** 依規格書 4./5.3 格式，組出路線分享文字（含產品項目與數量，供物流模式使用） */
export function formatRouteShareMessage(params: {
  staffName: string;
  originLabel: string;
  destinationLabel: string;
  stops: { name: string; address: string; isPriority: boolean; products?: { name: string; qty: number }[] }[];
  totalDistanceKm: number;
}): string {
  const lines = [
    `${params.staffName} 的今日路線`,
    `出發：${params.originLabel} → 目的地：${params.destinationLabel}`,
    `總距離：約 ${params.totalDistanceKm.toFixed(1)} km`,
    "",
    ...params.stops.map((s, i) => {
      const tag = s.isPriority ? "【優先】" : "";
      const productsText = s.products?.length
        ? " - " + s.products.map((p) => `${p.name} x${p.qty}`).join("、")
        : "";
      return `${i + 1}. ${tag}${s.name}（${s.address}）${productsText}`;
    }),
  ];
  return lines.join("\n");
}
