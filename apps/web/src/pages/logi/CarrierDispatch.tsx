import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, Truck, Check } from "lucide-react";
import { api } from "../../api/client";
import { C, TopBar, ProductSummary } from "../../components/common";

const CARRIERS = ["新竹貨運", "大榮貨運"];

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
      const list = (await api.getOrders({ carrier: c })) as Order[];
      // 已完成的不再顯示，畫面只留今天還要處理的
      setOrders(list.filter((o) => o.status !== "COMPLETED"));
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

  async function markCompleted(o: Order) {
    if (!confirm(`確定「${o.customerName}」已交給${carrier}？`)) return;
    setBusyId(o.id);
    setError(null);
    try {
      await api.updateOrderStatus(o.id, "COMPLETED");
      setOrders((prev) => prev.filter((x) => x.id !== o.id));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  const summaryItems = useMemo(() => orders.flatMap((o) => o.items), [orders]);

  return (
    <div>
      <TopBar
        title={carrier ? `貨運派遣 — ${carrier}` : "貨運派遣"}
        accent={C.logiAccent}
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
          CARRIERS.map((c) => (
            <button
              key={c}
              onClick={() => open(c)}
              className="w-full flex items-center gap-3 rounded-2xl p-4 mb-3 shadow-sm"
              style={{ background: "#fff" }}
            >
              <div className="rounded-xl flex items-center justify-center shrink-0" style={{ width: 46, height: 46, background: C.logiAccentSoft }}>
                <Truck size={22} color={C.logiAccent} />
              </div>
              <div className="text-left flex-1">
                <div style={{ fontFamily: "'Noto Sans TC', sans-serif" }} className="font-bold text-[15px]">
                  {c}
                </div>
                <div style={{ color: C.muted }} className="text-[11px] mt-0.5">
                  待出貨 {counts[c] ?? 0} 筆
                </div>
              </div>
              <ChevronRight size={18} color={C.muted} className="shrink-0" />
            </button>
          ))
        ) : orders.length === 0 ? (
          <div className="text-center text-[13px] py-8" style={{ color: C.muted }}>
            目前沒有要交給{carrier}的派遣單
          </div>
        ) : (
          <>
            <ProductSummary
              title={`${carrier}貨品總計`}
              items={summaryItems}
              orderCount={orders.length}
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
                  </div>

                  <div className="flex justify-end mt-2">
                    {/* 這是「交貨」動作鈕，樣式固定；若跟著檢貨狀態變色，
                        會讓人誤以為已經交給貨運行了 */}
                    <button
                      onClick={() => markCompleted(o)}
                      disabled={busyId === o.id}
                      style={{ border: `1px solid ${C.logiAccent}`, color: C.logiAccent }}
                      className="flex items-center gap-1 text-[12px] font-bold px-3 py-1.5 rounded-lg disabled:opacity-60"
                    >
                      <Check size={14} /> {busyId === o.id ? "處理中…" : "已交貨運行"}
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
