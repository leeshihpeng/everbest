import { ReactNode, useEffect, useRef, useState } from "react";
import { ArrowLeft, Building2, Star, Navigation2, Share2, Check, ChevronUp, ChevronDown, GripVertical, LucideIcon } from "lucide-react";

// 設計 tokens（沿用 reference/route-app-prototype.jsx）
export const C = {
  bg: "#F2F4F7",
  surface: "#FFFFFF",
  navy: "#1C2B45",
  navyLight: "#2E4266",
  hairline: "#E3E6EB",
  text: "#1A1F29",
  muted: "#6B7280",
  bizAccent: "#3163C9",
  bizAccentSoft: "#E8EEFC",
  logiAccent: "#1F8C7A",
  logiAccentSoft: "#E3F3EF",
  gold: "#C7902E",
  goldSoft: "#FBF1DE",
  danger: "#C4483A",
  dangerSoft: "#FBEAE7",
  success: "#1F8C4E",
  successSoft: "#E4F3E9",
};

// 標題列的星點網絡底紋（對應設計稿）。座標寫死，才不會每次算出不同的圖案。
const NETWORK_SVG = encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 160" preserveAspectRatio="xMidYMid slice">` +
    `<g stroke="rgba(255,255,255,0.16)" stroke-width="0.8" fill="none">` +
    `<path d="M18 132 L64 96 L120 118 L168 70 L232 92 L286 44 L342 78 L392 40"/>` +
    `<path d="M8 44 L58 22 L120 52 L182 18 L246 40 L300 14 L366 36"/>` +
    `<path d="M64 96 L58 22 M120 118 L120 52 M168 70 L182 18 M232 92 L246 40 M286 44 L300 14 M342 78 L366 36"/>` +
    `<path d="M40 158 L96 140 L150 156 L214 134 L270 152 L330 130 L390 148"/>` +
    `</g>` +
    `<g fill="rgba(255,255,255,0.5)">` +
    `<circle cx="64" cy="96" r="2.2"/><circle cx="120" cy="118" r="1.8"/><circle cx="168" cy="70" r="2.4"/>` +
    `<circle cx="232" cy="92" r="1.8"/><circle cx="286" cy="44" r="2.2"/><circle cx="342" cy="78" r="1.8"/>` +
    `<circle cx="58" cy="22" r="1.8"/><circle cx="120" cy="52" r="2.2"/><circle cx="182" cy="18" r="1.8"/>` +
    `<circle cx="246" cy="40" r="2.4"/><circle cx="300" cy="14" r="1.8"/><circle cx="96" cy="140" r="1.6"/>` +
    `<circle cx="214" cy="134" r="1.6"/><circle cx="330" cy="130" r="1.6"/>` +
    `</g></svg>`
);

/** 深藍標題列的底色：底色 + 星點網絡 + 左上打亮、右下壓暗，做出設計稿的層次感。
 *  各頁的 accent 不同（深藍／藍／綠），這裡用半透明疊加而不是寫死顏色，換 accent 也能用。 */
export function headerBg(accent: string) {
  return {
    backgroundColor: accent,
    backgroundImage: [
      `url("data:image/svg+xml,${NETWORK_SVG}")`,
      "radial-gradient(120% 140% at 12% 0%, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0) 55%)",
      "linear-gradient(160deg, rgba(255,255,255,0.10) 0%, rgba(0,0,0,0.22) 100%)",
    ].join(", "),
    backgroundSize: "cover, cover, cover",
    backgroundPosition: "center",
  } as const;
}

export function TopBar({
  title,
  accent,
  onBack,
  right,
}: {
  title: string;
  accent: string;
  onBack?: () => void;
  right?: ReactNode;
}) {
  return (
    <div style={{ ...headerBg(accent), color: "#fff" }} className="flex items-center gap-1 px-3 pt-5 pb-4 rounded-b-2xl shadow-sm">
      {onBack && (
        // 觸控目標至少 44px：原本只有 28px，手機上很容易按不到
        <button
          onClick={onBack}
          aria-label="返回"
          className="flex items-center justify-center rounded-full shrink-0 active:bg-white/20"
          style={{ width: 44, height: 44, marginLeft: -6 }}
        >
          <ArrowLeft size={22} />
        </button>
      )}
      <div className="flex-1 font-bold text-[16px]" style={{ fontFamily: "'Noto Sans TC', sans-serif" }}>
        {title}
      </div>
      {right}
    </div>
  );
}

/** 選單／資料夾畫面共用的大圖示磁磚。
 *  改成兩欄格狀是為了讓項目較多的畫面（主目錄 7 項、貨運追蹤 6 個資料夾、
 *  輸入許可證多個品項）在手機上不必捲頁就看得完。 */
export function TileGrid({ children, cols = 2 }: { children: ReactNode; cols?: 2 | 3 }) {
  return <div className={`grid gap-2.5 ${cols === 3 ? "grid-cols-3" : "grid-cols-2"}`}>{children}</div>;
}

export function Tile({
  icon: Icon,
  image,
  label,
  sub,
  color,
  soft,
  onClick,
  dimmed,
  compact,
}: {
  icon: LucideIcon;
  /** 有傳就用這張插畫取代線條圖示（設計稿的磁磚圖示，放在 public/tiles/） */
  image?: string;
  label: string;
  sub?: string;
  color: string;
  soft: string;
  onClick: () => void;
  /** 例如筆數為 0 的資料夾，圖示轉灰但仍可點進去 */
  dimmed?: boolean;
  /** 三欄排列時整體縮小一號，讓標籤在窄磁磚裡還讀得清楚 */
  compact?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center justify-start text-center rounded-2xl px-2 pt-2.5 pb-2 shadow-sm active:opacity-80"
      style={{ background: "#fff", minHeight: compact ? 84 : 92 }}
    >
      {image ? (
        <img
          src={image}
          alt=""
          className="rounded-xl shrink-0 mb-1 object-contain"
          style={{ width: compact ? 40 : 46, height: compact ? 40 : 46, opacity: dimmed ? 0.45 : 1 }}
        />
      ) : (
        <div
          className="rounded-2xl flex items-center justify-center shrink-0 mb-1"
          style={{ width: compact ? 36 : 40, height: compact ? 36 : 40, background: dimmed ? C.bg : soft }}
        >
          <Icon size={compact ? 18 : 21} color={dimmed ? C.muted : color} />
        </div>
      )}
      <div
        style={{ fontFamily: "'Noto Sans TC', sans-serif" }}
        className={`font-bold leading-tight ${compact ? "text-[11px]" : "text-[13px]"}`}
      >
        {label}
      </div>
      {sub && (
        <div style={{ color: C.muted }} className="text-[10px] mt-0.5 leading-tight">
          {sub}
        </div>
      )}
    </button>
  );
}

export function PriorityTag() {
  return (
    <span
      style={{ background: C.goldSoft, color: C.gold, fontFamily: "'Noto Sans TC', sans-serif" }}
      className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded"
    >
      <Star size={10} fill={C.gold} strokeWidth={0} /> 優先
    </span>
  );
}

export function Pill({
  children,
  active,
  onClick,
  accent,
}: {
  children: ReactNode;
  active: boolean;
  onClick: () => void;
  accent: string;
}) {
  return (
    <button
      onClick={onClick}
      style={active ? { background: accent, color: "#fff", borderColor: accent } : { color: C.muted, borderColor: C.hairline }}
      className="px-3 py-1.5 rounded-full text-[12px] font-medium border transition-colors"
    >
      {children}
    </button>
  );
}

export function OriginCard({
  icon: Icon,
  label,
  sub,
  active,
  accent,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  sub: string;
  active: boolean;
  accent: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex-1 text-left rounded-xl p-3"
      style={{ background: active ? accent : "#fff", border: `1px solid ${active ? accent : C.hairline}` }}
    >
      <div className="flex items-center gap-1.5">
        <Icon size={14} color={active ? "#fff" : C.text} />
        <span style={{ color: active ? "#fff" : C.text, fontFamily: "'Noto Sans TC', sans-serif" }} className="text-[13px] font-bold">
          {label}
        </span>
      </div>
      <div style={{ color: active ? "rgba(255,255,255,0.85)" : C.muted }} className="text-[10px] mt-1 leading-snug">
        {sub}
      </div>
    </button>
  );
}

export interface SummaryItem {
  productName: string;
  quantity: number;
}

/** 貨品數量統計表：把多張派遣單的品項加總（同品名合併），方便清點與裝車。
 *  傳入的 items 決定統計範圍——例如只傳已勾選的派遣單，總計就只算已勾選的。 */
export function ProductSummary({
  items,
  title,
  accent,
  orderCount,
}: {
  items: SummaryItem[];
  title: string;
  accent: string;
  orderCount?: number;
}) {
  const map = new Map<string, number>();
  for (const it of items) map.set(it.productName, (map.get(it.productName) ?? 0) + it.quantity);
  const rows = [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-Hant"));
  const total = rows.reduce((sum, [, qty]) => sum + qty, 0);

  return (
    <div className="rounded-xl mb-3 overflow-hidden" style={{ background: "#fff", border: `1px solid ${C.hairline}` }}>
      <div className="px-3 py-2 flex items-center justify-between gap-2" style={{ background: C.bg }}>
        <span style={{ fontFamily: "'Noto Sans TC', sans-serif" }} className="text-[12px] font-bold">
          {title}
        </span>
        {orderCount != null && (
          <span style={{ color: C.muted }} className="text-[11px] shrink-0">
            {orderCount} 筆派遣單
          </span>
        )}
      </div>
      {rows.length === 0 ? (
        <div className="px-3 py-3 text-center text-[12px]" style={{ color: C.muted }}>
          沒有貨品
        </div>
      ) : (
        <>
          {rows.map(([name, qty]) => (
            <div key={name} className="px-3 py-1.5 flex items-center justify-between gap-2 border-t" style={{ borderColor: C.hairline }}>
              <span className="text-[12px] flex-1 min-w-0 break-all">{name}</span>
              <span style={{ fontFamily: "Manrope", color: accent }} className="text-[13px] font-bold shrink-0">
                {qty}
              </span>
            </div>
          ))}
          <div className="px-3 py-2 flex items-center justify-between border-t" style={{ borderColor: C.hairline, background: C.bg }}>
            <span style={{ fontFamily: "'Noto Sans TC', sans-serif" }} className="text-[12px] font-bold">
              全部貨品總計
            </span>
            <span style={{ fontFamily: "Manrope", color: accent }} className="text-[15px] font-extrabold">
              {total}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

/** 單張派遣單的貨品數量小計。清單上每個客戶都要能一眼看出「這家總共幾件」，
 *  不必自己把各品項加起來。跟 ProductSummary 的「全部貨品總計」是不同層級：
 *  這裡只算單一客戶。 */
export function QtySubtotal({ total, accent }: { total: number; accent: string }) {
  return (
    <span
      style={{ background: accent, color: "#fff", fontFamily: "Manrope" }}
      className="text-[11px] font-bold px-1.5 py-0.5 rounded shrink-0"
    >
      小計 {total}
    </span>
  );
}

export function sumQty(items: { quantity: number }[]): number {
  return items.reduce((sum, i) => sum + (i.quantity || 0), 0);
}

export interface TimelineProduct {
  name: string;
  qty: number;
  checked?: boolean;
  onToggle?: () => void;
}

export interface TimelineStop {
  refId: string;
  name: string;
  subtitle: string;
  isPriority: boolean;
  legDistanceKm: number;
  legDurationMin?: number;
  products?: TimelineProduct[];
  note?: string; // 貨單附註（CSV 匯入時帶進來的交代事項）
  // 有傳才顯示上下移動按鈕（送貨人員自行調整送貨順序）；已在頭尾的站別傳 undefined
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}

export interface TimelineRoute {
  stops: TimelineStop[];
  finalLegDistanceKm: number;
  finalLegDurationMin?: number;
  totalDistanceKm: number;
  totalDurationMin?: number;
}

// 路線結果時間軸 — 本 app 的簽名視覺元素
export function RouteTimeline({
  originLabel,
  destinationLabel,
  route,
  showProducts,
  accent,
  onReorder,
}: {
  originLabel: string;
  destinationLabel: string;
  route: TimelineRoute;
  showProducts: boolean;
  accent: string;
  /** 有傳才能長按拖曳排序；放開手時以新的站別順序回呼 */
  onReorder?: (orderedRefIds: string[]) => void;
}) {
  const LONG_PRESS_MS = 300;
  // 手指按著本來就會晃幾 px，容忍值太小會讓長按幾乎永遠觸發不了
  const MOVE_TOLERANCE_PX = 18;
  const [dragRefId, setDragRefId] = useState<string | null>(null);
  // 拖曳中的暫時順序（放開手才真的送出），null＝照 route 原本的順序
  const [previewOrder, setPreviewOrder] = useState<string[] | null>(null);
  const cardRefs = useRef(new Map<string, HTMLDivElement>());
  const pressTimer = useRef<number | null>(null);
  const pressStart = useRef<{ x: number; y: number } | null>(null);
  const orderRef = useRef<string[]>([]);
  const dragYRef = useRef(0);

  const routeIds = route.stops.map((s) => s.refId);
  const currentIds = previewOrder ?? routeIds;
  orderRef.current = currentIds;
  const byId = new Map(route.stops.map((s) => [s.refId, s]));
  const orderedStops = currentIds.map((id) => byId.get(id)).filter((s): s is TimelineStop => !!s);

  // 路線重新計算完成（站別或順序變了）就丟掉拖曳中的暫時順序，改用後端算好的結果
  useEffect(() => {
    if (!dragRefId) setPreviewOrder(null);
  }, [routeIds.join("|")]);

  function cancelPress() {
    if (pressTimer.current != null) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
    pressStart.current = null;
  }

  function pointOf(e: React.TouchEvent | React.MouseEvent) {
    const t = "touches" in e ? e.touches[0] : (e as React.MouseEvent);
    return { x: t.clientX, y: t.clientY };
  }

  function beginDrag(refId: string, y: number) {
    dragYRef.current = y;
    setDragRefId(refId);
    setPreviewOrder(orderRef.current);
    navigator.vibrate?.(30); // 進入可拖曳狀態的觸覺回饋
  }

  function startPress(refId: string, e: React.TouchEvent | React.MouseEvent) {
    if (!onReorder) return;
    const p = pointOf(e);
    pressStart.current = p;
    pressTimer.current = window.setTimeout(() => beginDrag(refId, p.y), LONG_PRESS_MS);
  }

  // 長按計時中就大幅滑動＝使用者想捲動頁面，不是要拖曳
  function maybeCancelPress(e: React.TouchEvent | React.MouseEvent) {
    if (dragRefId || !pressStart.current) return;
    const p = pointOf(e);
    if (Math.abs(p.y - pressStart.current.y) > MOVE_TOLERANCE_PX || Math.abs(p.x - pressStart.current.x) > MOVE_TOLERANCE_PX) {
      cancelPress();
    }
  }

  // 拖曳握把：按住就直接進入拖曳，不必等長按，也不會跟頁面捲動搶手勢
  function handleGripStart(refId: string, e: React.TouchEvent | React.MouseEvent) {
    if (!onReorder) return;
    e.stopPropagation();
    cancelPress();
    beginDrag(refId, pointOf(e).y);
  }

  // 拖曳中：跟著手指移動，經過其他卡片的中線就即時換位；放開手才回呼儲存
  useEffect(() => {
    if (!dragRefId) return;

    function moveTo(y: number) {
      const ids = orderRef.current;
      const from = ids.indexOf(dragRefId!);
      if (from < 0) return;
      let to = ids.length - 1;
      for (let i = 0; i < ids.length; i++) {
        const el = cardRefs.current.get(ids[i]);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (y < r.top + r.height / 2) {
          to = i;
          break;
        }
      }
      if (to === from) return;
      const next = [...ids];
      next.splice(to, 0, next.splice(from, 1)[0]);
      setPreviewOrder(next);
    }

    const onMove = (ev: TouchEvent | MouseEvent) => {
      ev.preventDefault(); // 拖曳時不要跟著捲動頁面
      const y = "touches" in ev ? ev.touches[0]?.clientY : (ev as MouseEvent).clientY;
      if (y == null) return;
      dragYRef.current = y;
      // 換位直接在這裡做：requestAnimationFrame 在畫面被凍結時不會執行，
      // 不能把換位的責任交給它，否則拖曳會整個沒反應
      moveTo(y);
    };
    const onEnd = () => {
      const ids = orderRef.current;
      setDragRefId(null);
      if (ids.join("|") !== routeIds.join("|")) onReorder?.(ids);
      else setPreviewOrder(null);
    };
    // Android 長按會跳出系統選單，會把拖曳打斷
    const onContextMenu = (ev: Event) => ev.preventDefault();

    // 站別多到超過一個螢幕時，手指停在上下邊緣要自動捲動，才有辦法把第一站拖到看不見的最後面。
    // 用計時器而非 requestAnimationFrame：畫面凍結時 rAF 不會執行，計時器比較不會整個停擺。
    const EDGE_PX = 90;
    const SCROLL_STEP = 12;
    const autoScroll = window.setInterval(() => {
      const y = dragYRef.current;
      const before = window.scrollY;
      if (y < EDGE_PX) window.scrollBy(0, -SCROLL_STEP);
      else if (y > window.innerHeight - EDGE_PX) window.scrollBy(0, SCROLL_STEP);
      // 頁面捲動後各卡片位置改變，要用同一個手指位置重新判斷插入點
      if (window.scrollY !== before) moveTo(y);
    }, 16);

    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onEnd);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onEnd);
    window.addEventListener("contextmenu", onContextMenu);
    return () => {
      clearInterval(autoScroll);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onEnd);
      window.removeEventListener("contextmenu", onContextMenu);
    };
  }, [dragRefId, routeIds.join("|")]);

  const nodes = [
    { kind: "origin" as const, label: originLabel },
    ...orderedStops.map((s) => ({ kind: "stop" as const, data: s })),
    { kind: "destination" as const, label: destinationLabel, leg: route.finalLegDistanceKm, legDuration: route.finalLegDurationMin },
  ];

  return (
    <div className="relative pl-7">
      <div className="absolute left-[11px] top-2 bottom-2 w-[2px]" style={{ background: C.hairline }} />
      {nodes.map((n, i) => {
        const isEnd = n.kind === "origin" || n.kind === "destination";
        const isPriority = n.kind === "stop" && n.data.isPriority;
        return (
          <div key={i} className="relative mb-4 last:mb-0">
            <div
              className="absolute -left-7 top-0.5 flex items-center justify-center rounded-full"
              style={{
                width: 22,
                height: 22,
                background: isEnd ? C.navy : isPriority ? C.gold : "#fff",
                border: isEnd ? "none" : `2px solid ${isPriority ? C.gold : accent}`,
              }}
            >
              {isEnd ? (
                <Building2 size={12} color="#fff" />
              ) : isPriority ? (
                <Star size={11} color="#fff" fill="#fff" />
              ) : (
                <span style={{ color: accent, fontFamily: "Manrope", fontWeight: 800, fontSize: 10 }}>{i}</span>
              )}
            </div>
            <div
              ref={(el) => {
                if (n.kind === "stop" && el) cardRefs.current.set(n.data.refId, el);
              }}
              onTouchStart={n.kind === "stop" ? (e) => startPress(n.data.refId, e) : undefined}
              onTouchMove={n.kind === "stop" ? maybeCancelPress : undefined}
              onTouchEnd={n.kind === "stop" ? cancelPress : undefined}
              onMouseDown={n.kind === "stop" ? (e) => startPress(n.data.refId, e) : undefined}
              onMouseMove={n.kind === "stop" ? maybeCancelPress : undefined}
              onMouseUp={n.kind === "stop" ? cancelPress : undefined}
              className="rounded-xl px-3 py-2.5 transition-shadow"
              style={{
                background: isEnd ? C.bg : C.surface,
                border: `1px solid ${n.kind === "stop" && n.data.refId === dragRefId ? accent : C.hairline}`,
                // 拖曳中的卡片浮起來，讓使用者知道現在移動的是哪一站
                boxShadow: n.kind === "stop" && n.data.refId === dragRefId ? "0 10px 24px rgba(0,0,0,0.18)" : undefined,
                transform: n.kind === "stop" && n.data.refId === dragRefId ? "scale(1.02)" : undefined,
                // 長按時 iOS 會跳出選字放大鏡／複製選單並搶走手勢，可拖曳的卡片一律關掉
                userSelect: onReorder && n.kind === "stop" ? "none" : undefined,
                WebkitUserSelect: onReorder && n.kind === "stop" ? "none" : undefined,
                WebkitTouchCallout: onReorder && n.kind === "stop" ? "none" : undefined,
              }}
            >
              {n.kind === "stop" ? (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <div style={{ fontFamily: "'Noto Sans TC', sans-serif" }} className="font-bold text-[14px]">
                      {n.data.name}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {n.data.isPriority && <PriorityTag />}
                      {(n.data.onMoveUp || n.data.onMoveDown) && (
                        <div className="flex items-center gap-1">
                          <MoveButton dir="up" accent={accent} onClick={n.data.onMoveUp} />
                          <MoveButton dir="down" accent={accent} onClick={n.data.onMoveDown} />
                        </div>
                      )}
                      {onReorder && (
                        <div
                          role="button"
                          aria-label="拖曳排序"
                          onTouchStart={(e) => handleGripStart(n.data.refId, e)}
                          onMouseDown={(e) => handleGripStart(n.data.refId, e)}
                          className="flex items-center justify-center rounded-lg"
                          // touchAction: none＝這個握把不會被瀏覽器當成捲動手勢，按住就能直接拖
                          style={{
                            width: 30,
                            height: 28,
                            touchAction: "none",
                            border: `1px solid ${C.hairline}`,
                            background: n.data.refId === dragRefId ? accent : "#fff",
                          }}
                        >
                          <GripVertical size={16} color={n.data.refId === dragRefId ? "#fff" : C.muted} />
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ color: C.muted }} className="text-[12px] mt-0.5">
                    {n.data.subtitle}
                  </div>
                  {showProducts && n.data.products && n.data.products.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {n.data.products.map((p, pi) =>
                        p.onToggle ? (
                          <button
                            key={pi}
                            onClick={p.onToggle}
                            // 檢貨按鈕自己處理，不要被長按判定成要拖曳整張卡片
                            onTouchStart={(e) => e.stopPropagation()}
                            onMouseDown={(e) => e.stopPropagation()}
                            style={{ background: p.checked ? C.success : C.dangerSoft, color: p.checked ? "#fff" : C.danger }}
                            className="flex items-center gap-1.5 text-[13px] font-bold px-2 py-1 rounded-lg"
                          >
                            <span>
                              {p.name} ×{p.qty}
                            </span>
                            <span style={{ color: p.checked ? "rgba(255,255,255,0.85)" : C.danger }} className="text-[11px]">
                              {p.checked ? "已檢貨" : "待檢貨"}
                            </span>
                          </button>
                        ) : (
                          <span
                            key={pi}
                            style={{ background: p.checked ? C.success : C.bizAccentSoft, color: p.checked ? "#fff" : C.bizAccent }}
                            className="text-[13px] font-bold px-2 py-1 rounded-lg"
                          >
                            {p.name} ×{p.qty}
                          </span>
                        )
                      )}
                      <QtySubtotal total={n.data.products.reduce((s, p) => s + (p.qty || 0), 0)} accent={accent} />
                    </div>
                  )}
                  {/* 貨單附註：出貨時交代的事項，要讓司機一眼看到，所以獨立一列反白顯示 */}
                  {n.data.note && (
                    <div
                      className="mt-1.5 text-[12px] px-2 py-1 rounded"
                      style={{ background: C.goldSoft, color: C.text, whiteSpace: "pre-wrap" }}
                    >
                      <span style={{ color: C.gold }} className="font-bold">
                        貨單附註：
                      </span>
                      {n.data.note}
                    </div>
                  )}
                  <div style={{ fontFamily: "Manrope", color: accent }} className="text-[11px] font-bold mt-1">
                    距上一站 {n.data.legDistanceKm.toFixed(1)} km
                    {n.data.legDurationMin != null && ` ・ 約 ${Math.round(n.data.legDurationMin)} 分鐘`}
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-between">
                  <div style={{ fontFamily: "'Noto Sans TC', sans-serif" }} className="font-bold text-[13px]">
                    {n.label}
                  </div>
                  {n.kind === "destination" && (
                    <div style={{ fontFamily: "Manrope", color: C.muted }} className="text-[11px] font-bold">
                      {n.leg.toFixed(1)} km
                      {n.legDuration != null && ` ・ ${Math.round(n.legDuration)} 分`}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// 手機上拖曳排序不好按，改用上下箭頭一次移動一站
function MoveButton({ dir, accent, onClick }: { dir: "up" | "down"; accent: string; onClick?: () => void }) {
  const Icon = dir === "up" ? ChevronUp : ChevronDown;
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      onTouchStart={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      aria-label={dir === "up" ? "往前一站" : "往後一站"}
      style={{ border: `1px solid ${onClick ? accent : C.hairline}`, color: onClick ? accent : C.hairline }}
      className="flex items-center justify-center rounded-lg w-7 h-7 disabled:opacity-60"
    >
      <Icon size={15} strokeWidth={2.5} />
    </button>
  );
}

export function ActionRow({ accent, onShare, onNavigate }: { accent: string; onShare?: () => void; onNavigate?: () => void }) {
  return (
    <div className="flex gap-2 mt-4">
      <button
        onClick={onNavigate}
        style={{ background: accent }}
        className="flex-1 flex items-center justify-center gap-1.5 text-white text-[13px] font-bold py-2.5 rounded-xl active:opacity-90"
      >
        <Navigation2 size={15} /> 開始導航
      </button>
      <button
        onClick={onShare}
        style={{ background: "#fff", border: `1px solid ${C.hairline}`, color: C.text }}
        className="flex-1 flex items-center justify-center gap-1.5 text-[13px] font-bold py-2.5 rounded-xl active:opacity-80"
      >
        <Share2 size={15} /> 分享路線
      </button>
    </div>
  );
}

export function Checkbox({ checked }: { checked: boolean }) {
  return (
    <div
      className="flex items-center justify-center rounded-md shrink-0"
      style={{ width: 20, height: 20, border: `2px solid ${checked ? C.bizAccent : C.hairline}`, background: checked ? C.bizAccent : "transparent" }}
    >
      {checked && <Check size={13} color="#fff" strokeWidth={3} />}
    </div>
  );
}
