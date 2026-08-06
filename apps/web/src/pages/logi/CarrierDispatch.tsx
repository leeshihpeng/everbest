import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Truck, Check, Trash2 } from "lucide-react";
import { api } from "../../api/client";
import { C, TopBar, ProductSummary, QtySubtotal, sumQty, TileGrid, Tile } from "../../components/common";
import { CARRIER_VALUES as CARRIERS } from "../../lib/carriers";

interface OrderItem {
  id: string;
  productName: string;
  quantity: number;
  checked: boolean;
}

interface Order {
  id: string;
  customerCode: string;
  customerName: string;
  address: string;
  phone?: string | null;
  orderNo?: string | null;
  weight?: number | null;
  status: string;
  items: OrderItem[];
}

// 貨運派遣：交給貨運行送的派遣單，功能同送貨人員（貨品清點、逐項檢貨、配送完成），
// 但貨運行自行安排路線，所以沒有路線規劃與導航。
export default function CarrierDispatch() {
  const navigate = useNavigate();

  const [carrier, setCarrier] = useState<string | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function loadCounts() {
    setLoading(true);
    setError(null);
    try {
      const result: Record<string, number> = {};
      for (const c of CARRIERS) {
        const list = (await api.getOrders({ carrier: c })) as Order[];
        result[c] = list.filter((o) => o.status !== "COMPLETED").length;
      }
      setCounts(result);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function loadOrders(c: string) {
    setLoading(true);
    setError(null);
    try {
      // **已交出去的也留在畫面上**（使用者 2026-08-05 要求），只是按鈕變色。
      // 原本一按就整筆消失，看不出到底交了哪幾家、也沒辦法按錯再取消。
      setOrders(await api.getOrders({ carrier: c }) as Order[]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCounts();
  }, []);

  function open(c: string) {
    setCarrier(c);
    loadOrders(c);
  }

  function back() {
    setCarrier(null);
    setOrders([]);
    setError(null);
    loadCounts();
  }

  async function toggleItem(orderId: string, itemId: string) {
    const order = orders.find((o) => o.id === orderId);
    const item = order?.items.find((i) => i.id === itemId);
    if (!item) return;
    const next = !item.checked;
    setOrders((prev) =>
      prev.map((o) =>
        o.id === orderId ? { ...o, items: o.items.map((i) => (i.id === itemId ? { ...i, checked: next } : i)) } : o
      )
    );
    try {
      await api.updateItemChecked(itemId, next);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  // 標記／取消「已交貨運行」。不再跳確認框，改成按了立即生效、單子留在畫面上
  // 讓按鈕變色顯示狀態，按錯再按一次就取消（離開頁面後已交的才不再顯示）。
  async function toggleCompleted(o: Order) {
    const next = o.status === "COMPLETED" ? "PENDING" : "COMPLETED";
    setBusyId(o.id);
    setError(null);
    try {
      await api.updateOrderStatus(o.id, next);
      setOrders((prev) => prev.map((x) => (x.id === o.id ? { ...x, status: next } : x)));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  // 刪除不需要交的單子。標成已刪除而不是真的刪掉——自動匯入會重讀同一份託運報表，
  // 真刪掉的單子下一輪就會再長回來。這裡沒有勾選，一次刪一筆。
  async function handleDelete(o: Order) {
    if (!confirm(`確定要刪除「${o.customerName}」這筆派遣單嗎？`)) return;
    setBusyId(o.id);
    setError(null);
    try {
      await api.cancelOrder(o.id);
      setOrders((prev) => prev.filter((x) => x.id !== o.id));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  // 貨品總計只算還沒交出去的，交完的不必再清點
  const summaryOrders = useMemo(() => orders.filter((o) => o.status !== "COMPLETED"), [orders]);
  const summaryItems = useMemo(() => summaryOrders.flatMap((o) => o.items), [summaryOrders]);

  return (
    <div>
      <TopBar
        title={carrier ? `貨運派遣 — ${carrier}` : "貨運派遣"}
        accent={C.header}
        onBack={() => (carrier ? back() : navigate("/"))}
      />
      <div className="p-4">
        {error && (
          <div className="text-[12px] mb-2" style={{ color: C.danger }}>
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-center text-[13px] py-8" style={{ color: C.muted }}>
            載入中…
          </div>
        ) : !carrier ? (
          <TileGrid>
            {CARRIERS.map((c) => (
              <Tile
                key={c}
                icon={Truck}
                image="/tiles/carrier.png"
                label={c}
                sub={`待出貨 ${counts[c] ?? 0} 筆`}
                color={C.logiAccent}
                soft={C.logiAccentSoft}
                dimmed={(counts[c] ?? 0) === 0}
                onClick={() => open(c)}
              />
            ))}
          </TileGrid>
        ) : orders.length === 0 ? (
          <div className="text-center text-[13px] py-8" style={{ color: C.muted }}>
            目前沒有要交給{carrier}的派遣單
          </div>
        ) : (
          <>
            <ProductSummary
              title={`${carrier}貨品總計（未交出去的）`}
              items={summaryItems}
              orderCount={summaryOrders.length}
              accent={C.logiAccent}
            />
            {orders.map((o) => {
              return (
                <div key={o.id} className="rounded-xl p-3 mb-2" style={{ background: "#fff", border: `1px solid ${C.hairline}` }}>
                  <div className="flex items-start justify-between gap-2">
                    <span style={{ fontFamily: "'Noto Sans TC', sans-serif" }} className="font-bold text-[14px] min-w-0">
                      {o.customerName}
                    </span>
                    {o.weight != null && (
                      <span style={{ fontFamily: "Manrope", color: C.muted }} className="text-[11px] font-bold shrink-0">
                        {o.weight} 公斤
                      </span>
                    )}
                  </div>
                  {o.orderNo && (
                    <div style={{ fontFamily: "Manrope", color: C.bizAccent }} className="text-[11px] font-bold mt-0.5">
                      {o.orderNo}
                    </div>
                  )}
                  <div style={{ color: C.muted }} className="text-[11px] mt-0.5 break-all">
                    {o.address}
                    {o.phone ? `　${o.phone}` : ""}
                  </div>

                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {o.items.map((i) => (
                      <button
                        key={i.id}
                        onClick={() => toggleItem(o.id, i.id)}
                        style={{ background: i.checked ? C.success : C.dangerSoft, color: i.checked ? "#fff" : C.danger }}
                        className="flex items-center gap-1.5 text-[13px] font-bold px-2 py-1 rounded-lg"
                      >
                        <span>
                          {i.productName} ×{i.quantity}
                        </span>
                        <span style={{ color: i.checked ? "rgba(255,255,255,0.85)" : C.danger }} className="text-[11px]">
                          {i.checked ? "已檢貨" : "待檢貨"}
                        </span>
                      </button>
                    ))}
                    {o.items.length > 0 && <QtySubtotal total={sumQty(o.items)} accent={C.logiAccent} />}
                  </div>

                  <div className="flex items-center justify-end gap-2 mt-2">
                    {/* 刪除放在左邊、用文字而非只有圖示，避免跟右邊的主要動作混淆 */}
                    <button
                      onClick={() => handleDelete(o)}
                      disabled={busyId === o.id}
                      style={{ color: C.danger, border: `1px solid ${C.danger}` }}
                      className="mr-auto flex items-center gap-1 text-[12px] font-bold px-3 py-1.5 rounded-lg disabled:opacity-60"
                    >
                      <Trash2 size={14} /> 刪除
                    </button>
                    {/* 按鈕文字與顏色跟著「是否已交貨運行」變化：
                        沒按＝白底「交貨運行」，按了＝綠底「✓ 已交貨運行」，再按一次取消 */}
                    <button
                      onClick={() => toggleCompleted(o)}
                      disabled={busyId === o.id}
                      style={
                        o.status === "COMPLETED"
                          ? { background: C.success, border: `1px solid ${C.success}`, color: "#fff" }
                          : { background: "#fff", border: `1px solid ${C.logiAccent}`, color: C.logiAccent }
                      }
                      className="flex items-center gap-1 text-[12px] font-bold px-3 py-1.5 rounded-lg disabled:opacity-60"
                    >
                      {o.status === "COMPLETED" && <Check size={14} />}
                      {busyId === o.id ? "處理中…" : o.status === "COMPLETED" ? "已交貨運行" : "交貨運行"}
                    </button>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
