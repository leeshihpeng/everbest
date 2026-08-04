import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ClipboardList, Truck, Layers, AlertTriangle } from "lucide-react";
import { api } from "../../../api/client";
import OrdersPanel from "../../admin/OrdersPanel";
import { C, TopBar, TileGrid, Tile, ProductSummary, QtySubtotal, sumQty, DispatchDateTag } from "../../../components/common";
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
  items: OrderItem[];
}

/** 三個出貨管道。北部＝自家送貨人員（只送北部），另外兩個是交給貨運行的。
 *  貨品數量統計就是照這三個管道分開算，最後再加總。 */
const CHANNELS = [
  { key: "north", label: "北部", sub: "自家配送", carrier: "SELF", image: "/tiles/logi.png", icon: ClipboardList },
  { key: "hsinchu", label: "新竹", sub: "新竹貨運", carrier: "新竹貨運", image: "/tiles/carrier.png", icon: Truck },
  { key: "dalen", label: "大榮", sub: "大榮貨運", carrier: "大榮貨運", image: "/tiles/carrier.png", icon: Truck },
] as const;

type View = null | "manage" | "north" | "hsinchu" | "dalen" | "total";

/** 已指派＝這批貨真的要出去的單子。
 *  自家配送：已指派給送貨人員（SELECTED）或已檢貨（DISPATCHED）。
 *  貨運行：還沒交給貨運行的都算（已刪除的後端就不會回傳了）。 */
function isActive(carrier: string, status: string): boolean {
  return carrier === "SELF" ? status === "SELECTED" || status === "DISPATCHED" : status !== "COMPLETED";
}

export default function ManagerSelect() {
  const navigate = useNavigate();
  // 倉管對物流模式是唯讀：看得到統計，但不能按「重新指派」（後端也擋著）
  const canEdit = !!getAuthedStaff()?.roles.includes("MANAGER");

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
      const lists = await Promise.all(CHANNELS.map((c) => api.getOrders({ carrier: c.carrier }) as Promise<Order[]>));
      const next: Record<string, Order[]> = {};
      CHANNELS.forEach((c, i) => {
        next[c.key] = lists[i].filter((o) => isActive(c.carrier, o.status));
      });
      // 找不到送貨人員而卡在待處理的自家單子，要在畫面上講出來
      next.pending = lists[0].filter((o) => o.status === "PENDING");
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

  const allActive = useMemo(() => CHANNELS.flatMap((c) => byCarrier[c.key] ?? []), [byCarrier]);
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
  if (view === "manage") {
    return (
      <div>
        <TopBar title="派遣單管理（物流管理）" accent={C.header} onBack={() => setView(null)} />
        <OrdersPanel allowImport={false} />
      </div>
    );
  }

  if (view) {
    const channel = CHANNELS.find((c) => c.key === view);
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
              {CHANNELS.map((c) => {
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
          <Tile
            icon={ClipboardList}
            image="/tiles/logi.png"
            label="派遣單管理"
            sub={`${allActive.length} 筆`}
            color={C.logiAccent}
            soft={C.logiAccentSoft}
            onClick={() => setView("manage")}
          />
          {CHANNELS.map((c) => {
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
        </TileGrid>
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
