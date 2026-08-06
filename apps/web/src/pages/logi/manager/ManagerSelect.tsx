import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ClipboardList, Truck, Layers, AlertTriangle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { api } from "../../../api/client";
import OrdersPanel from "../../admin/OrdersPanel";
import {
  C,
  TopBar,
  TileGrid,
  Tile,
  ProductSummary,
  QtySubtotal,
  sumQty,
  DispatchDateTag,
  withinStatsWindow,
  STATS_KEEP_DAYS,
} from "../../../components/common";
import { DISPATCH_CARRIERS } from "../../../lib/carriers";
import { dispatchCityOf, dispatchCityIndex } from "../../../lib/taiwanCities";
import { getAuthedStaff } from "../../../lib/auth";

interface OrderItem {
  productName: string;
  quantity: number;
}

interface Order {
  id: string;
  customerCode: string;
  customerName: string;
  address: string;
  status: string;
  orderNote?: string | null;
  createdAt?: string;
  deliveryDate?: string;
  items: OrderItem[];
}

/** 出貨管道。北部＝自家送貨人員（只送北部），其餘是交給貨運行或回頭車。
 *  貨品數量統計照管道分開算，最後再加總。新增業者改 `lib/carriers.ts` 即可。 */
const CHANNELS: { key: string; label: string; sub: string; carrier: string; image: string; icon: LucideIcon }[] = [
  { key: "SELF", label: "北部", sub: "自家配送", carrier: "SELF", image: "/tiles/logi.png", icon: ClipboardList },
  ...DISPATCH_CARRIERS.map((c) => ({
    key: c.carrier,
    label: c.short,
    sub: c.carrier,
    carrier: c.carrier,
    image: "/tiles/carrier.png",
    icon: Truck as LucideIcon,
  })),
];

/** 區域主管（有 MANAGER 但沒有 ADMIN）只看自己負責的出貨管道，不看全公司。
 *
 *  目前唯一的區域主管是徐文卿：北區業務主管，**北部的送貨人員也歸他指揮**，
 *  所以他要看的是「北部（自家配送）」與「永昌」，其餘管道與總計都跟他無關。
 *  管理員（李世鵬／李世斌）與倉管仍然看得到全部管道。
 *
 *  之後若有第二位區域主管、而負責的管道不同，就得改成每人可設定（多加一個欄位），
 *  **不要在這裡用姓名去分岔**。 */
const REGIONAL_MANAGER_CHANNELS = ["SELF", "永昌貨運"];

type View = null | "manage" | "total" | string;

/** 列入統計的單子。
 *
 *  **已完成的也要算**（使用者 2026-08-05 要求）：原本一送完就從統計消失，
 *  當天的總量會愈看愈少，對不起來。改成保留最近 `STATS_KEEP_DAYS` 天，
 *  跟貨物追蹤一樣的做法——只是**不列入統計**，資料本身沒有刪除。
 *
 *  自家配送仍排除「待處理」（PENDING）：那是還沒指派出去的，首頁另有警告區塊在講。
 *  已刪除（CANCELLED）後端就不會回傳。 */
function isActive(carrier: string, o: Order): boolean {
  if (!withinStatsWindow(o.deliveryDate)) return false;
  return carrier === "SELF" ? o.status !== "PENDING" : true;
}

export default function ManagerSelect() {
  const navigate = useNavigate();
  const roles = getAuthedStaff()?.roles ?? [];
  // 倉管對物流模式是唯讀：看得到統計，但不能按「重新指派」（後端也擋著）
  const canEdit = roles.includes("MANAGER");
  // 區域主管只看自己負責的管道，也不顯示全公司總計（見 REGIONAL_MANAGER_CHANNELS）
  const isRegionalManager = roles.includes("MANAGER") && !roles.includes("ADMIN");
  const channels = useMemo(
    () => (isRegionalManager ? CHANNELS.filter((c) => REGIONAL_MANAGER_CHANNELS.includes(c.key)) : CHANNELS),
    [isRegionalManager]
  );

  const [view, setView] = useState<View>(null);
  const [byCarrier, setByCarrier] = useState<Record<string, Order[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [assignResult, setAssignResult] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const lists = await Promise.all(channels.map((c) => api.getOrders({ carrier: c.carrier }) as Promise<Order[]>));
      const next: Record<string, Order[]> = {};
      channels.forEach((c, i) => {
        next[c.key] = lists[i].filter((o) => isActive(c.carrier, o));
      });
      // 找不到送貨人員而卡在待處理的自家單子，要在畫面上講出來。
      // 明確找 SELF 那一份，不要依賴它排在第一個。
      const selfIndex = channels.findIndex((c) => c.carrier === "SELF");
      next.pending = selfIndex >= 0 ? lists[selfIndex].filter((o) => o.status === "PENDING") : [];
      setByCarrier(next);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const allActive = useMemo(() => channels.flatMap((c) => byCarrier[c.key] ?? []), [byCarrier, channels]);
  const pending = byCarrier.pending ?? [];

  async function handleAutoAssign() {
    setAssigning(true);
    setAssignResult(null);
    setError(null);
    try {
      const r = await api.autoAssignOrders();
      setAssignResult(
        r.unresolvedNames.length > 0
          ? `已指派 ${r.assigned} 筆；${r.unresolvedNames.length} 筆仍找不到對應的送貨人員（${r.unresolvedNames.join("、")}），請到內勤後台「人員」確認配送縣市設定。`
          : `已指派 ${r.assigned} 筆。`
      );
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setAssigning(false);
    }
  }

  if (loading) return <div className="p-6 text-center text-[13px]" style={{ color: C.muted }}>載入中…</div>;

  // 派遣單管理：沿用內勤後台的清單。匯入 CSV 是內勤的職責，這裡不提供。
  // 貨品數量統計也關掉：這一頁的各管道磁磚（北部等）已經有同一份數字，重複只會讓人不確定看哪個。
  if (view === "manage") {
    return (
      <div>
        <TopBar title="派遣單管理（物流管理）" accent={C.header} onBack={() => setView(null)} />
        <OrdersPanel allowImport={false} showSummary={false} />
      </div>
    );
  }

  if (view) {
    const channel = channels.find((c) => c.key === view);
    const orders = channel ? byCarrier[channel.key] ?? [] : allActive;
    const title = channel ? `${channel.label}（${channel.sub}）` : "總計（全部管道）";

    return (
      <div>
        <TopBar title={title} accent={C.header} onBack={() => setView(null)} />
        <div className="p-4">
          <ProductSummary
            title={`貨品數量統計（已指派）`}
            items={orders.flatMap((o) => o.items)}
            orderCount={orders.length}
            accent={C.logiAccent}
          />

          {/* 總計要看得出各管道各出多少，只有一個大數字沒辦法核對 */}
          {!channel && (
            <div className="rounded-xl mb-3 overflow-hidden" style={{ background: "#fff", border: `1px solid ${C.hairline}` }}>
              <div className="px-3 py-2" style={{ background: C.bg }}>
                <span style={{ fontFamily: "'Noto Sans TC', sans-serif" }} className="text-[12px] font-bold">
                  各管道明細
                </span>
              </div>
              {channels.map((c) => {
                const list = byCarrier[c.key] ?? [];
                return (
                  <div key={c.key} className="px-3 py-2 border-t flex items-center justify-between" style={{ borderColor: C.hairline }}>
                    <span style={{ fontFamily: "'Noto Sans TC', sans-serif" }} className="text-[12px] font-semibold">
                      {c.label}
                      <span style={{ color: C.muted }} className="font-normal">
                        （{c.sub}）
                      </span>
                    </span>
                    <span style={{ color: C.muted, fontFamily: "Manrope" }} className="text-[11px] font-bold">
                      {list.length} 筆・{sumQty(list.flatMap((o) => o.items))} 個
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          <ChannelOrderList orders={orders} groupByCity={channel?.carrier === "SELF"} />
        </div>
      </div>
    );
  }

  const totalQty = sumQty(allActive.flatMap((o) => o.items));

  return (
    <div>
      <TopBar title={canEdit ? "物流管理" : "物流管理（檢視）"} accent={C.header} onBack={() => navigate("/")} />
      <div className="p-4">
        {error && (
          <div className="text-[12px] mb-2" style={{ color: C.danger }}>
            {error}
          </div>
        )}

        {/* 派遣單匯入時就自動指派，所以待處理正常應該是 0。
            不是 0 就代表分工設定有缺口，要明顯地講出來並給一個補救的按鈕。 */}
        {pending.length > 0 && (
          <div className="rounded-xl p-3 mb-3" style={{ background: C.goldSoft, border: `1px solid ${C.gold}` }}>
            <div className="flex items-start gap-2">
              <AlertTriangle size={16} color={C.gold} className="mt-0.5 shrink-0" />
              <div className="text-[12px] leading-relaxed" style={{ color: C.text }}>
                有 <b>{pending.length}</b> 筆自家派遣單找不到對應的送貨人員，還沒指派出去。
                請到內勤後台「人員」確認送貨人員的<b>配送縣市</b>（不勾任何縣市＝後備，接收其他所有縣市），
                設定好之後按下面的按鈕重新指派。
              </div>
            </div>
            {canEdit && (
              <button
                onClick={handleAutoAssign}
                disabled={assigning}
                style={{ background: C.gold, minHeight: 44 }}
                className="w-full text-white text-[12px] font-bold rounded-lg mt-2 disabled:opacity-60"
              >
                {assigning ? "指派中…" : "重新指派"}
              </button>
            )}
          </div>
        )}
        {assignResult && (
          <div className="text-[12px] mb-3 rounded-xl p-3" style={{ background: C.logiAccentSoft, color: C.navy }}>
            {assignResult}
          </div>
        )}

        <TileGrid>
          {/* 這塊是「進去管理清單」的入口，不是統計。筆數由下面各管道磁磚負責，
              這裡再標一次反而讓人以為是另一個數字（使用者 2026-08-05 要求拿掉）。 */}
          <Tile
            icon={ClipboardList}
            image="/tiles/logi.png"
            label="派遣單管理"
            color={C.logiAccent}
            soft={C.logiAccentSoft}
            onClick={() => setView("manage")}
          />
          {channels.map((c) => {
            const list = byCarrier[c.key] ?? [];
            return (
              <Tile
                key={c.key}
                icon={c.icon}
                image={c.image}
                label={c.label}
                sub={`${list.length} 筆・${sumQty(list.flatMap((o) => o.items))} 個`}
                color={C.logiAccent}
                soft={C.logiAccentSoft}
                dimmed={list.length === 0}
                onClick={() => setView(c.key)}
              />
            );
          })}
          {/* 區域主管只負責部分管道，「總計」對他沒有意義（那是全公司的數字） */}
          {!isRegionalManager && (
            <Tile
              icon={Layers}
              image="/tiles/tracking.png"
              label="總計"
              sub={`${allActive.length} 筆・${totalQty} 個`}
              color={C.navy}
              soft={C.bg}
              dimmed={allActive.length === 0}
              onClick={() => setView("total")}
            />
          )}
        </TileGrid>
        {/* 統計含已完成的單子，不寫清楚會讓人以為數字沒更新 */}
        <div style={{ color: C.muted }} className="text-[11px] mt-3 leading-relaxed">
          統計含已完成配送的單子，保留最近 {STATS_KEEP_DAYS} 天。
        </div>
      </div>
    </div>
  );
}

/** 統計頁下方的單子清單。自家配送依縣市分區（送貨順序），貨運行送全台各地，分區沒意義。 */
function ChannelOrderList({ orders, groupByCity }: { orders: Order[]; groupByCity?: boolean }) {
  const groups = useMemo(() => {
    if (!groupByCity) return [["", orders] as [string, Order[]]];
    const map = new Map<string, Order[]>();
    for (const o of orders) {
      const city = dispatchCityOf(o.address);
      if (!map.has(city)) map.set(city, []);
      map.get(city)!.push(o);
    }
    return [...map.entries()].sort(([a], [b]) => dispatchCityIndex(a) - dispatchCityIndex(b));
  }, [orders, groupByCity]);

  if (orders.length === 0) {
    return (
      <div className="text-center text-[13px] py-8" style={{ color: C.muted }}>
        目前沒有待出貨的派遣單
      </div>
    );
  }

  return (
    <>
      {groups.map(([city, group]) => (
        <div key={city} className="mb-3">
          {city && (
            <div className="flex items-center justify-between px-3 py-1.5 rounded-lg mb-1.5" style={{ background: C.logiAccentSoft }}>
              <span style={{ color: C.logiAccent, fontFamily: "'Noto Sans TC', sans-serif" }} className="text-[13px] font-bold">
                {city}
              </span>
              <span style={{ color: C.muted, fontFamily: "Manrope" }} className="text-[11px] font-bold">
                {group.length} 筆
              </span>
            </div>
          )}
          <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${C.hairline}`, background: "#fff" }}>
            {group.map((o) => (
              <div key={o.id} className="px-3 py-2 border-t first:border-t-0" style={{ borderColor: C.hairline }}>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {/* 自家配送的單子沒有出貨編號時，customerCode 會直接沿用公司名，
                      兩個都印就變成同一個名字連續出現兩次 */}
                  {o.customerCode !== o.customerName && (
                    <span style={{ fontFamily: "Manrope", color: C.muted }} className="text-[11px] font-bold">
                      {o.customerCode}
                    </span>
                  )}
                  <span style={{ fontFamily: "'Noto Sans TC', sans-serif" }} className="font-semibold text-[13px]">
                    {o.customerName}
                  </span>
                  <DispatchDateTag createdAt={o.createdAt} />
                </div>
                <div style={{ color: C.muted }} className="text-[11px] mt-0.5">
                  {o.address}
                </div>
                {o.orderNote && (
                  <div
                    className="mt-1 text-[11px] px-1.5 py-0.5 rounded"
                    style={{ background: C.goldSoft, color: C.text, whiteSpace: "pre-wrap" }}
                  >
                    <span style={{ color: C.gold }} className="font-bold">
                      貨單附註：
                    </span>
                    {o.orderNote}
                  </div>
                )}
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  {o.items.map((it, i) => (
                    <span key={i} style={{ background: C.bg, color: C.text }} className="text-[11px] px-1.5 py-0.5 rounded">
                      {it.productName} ×{it.quantity}
                    </span>
                  ))}
                  {o.items.length > 0 && <QtySubtotal total={sumQty(o.items)} accent={C.logiAccent} />}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
