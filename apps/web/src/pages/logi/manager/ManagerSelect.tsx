import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import { api } from "../../../api/client";
import OrdersPanel from "../../admin/OrdersPanel";
import { C, TopBar, Checkbox, RouteTimeline, TimelineRoute, ProductSummary } from "../../../components/common";
import { dispatchCityOf, dispatchCityIndex } from "../../../lib/taiwanCities";

interface OrderItem {
  productName: string;
  quantity: number;
}

interface Order {
  id: string;
  customerCode: string;
  customerName: string;
  address: string;
  items: OrderItem[];
}

interface Staff {
  id: string;
  name: string;
  roles: string[];
}

interface Settings {
  companyAddress: string;
  companyLat?: number | null;
  companyLng?: number | null;
}

export default function ManagerSelect() {
  const navigate = useNavigate();

  const [orders, setOrders] = useState<Order[]>([]);
  const [drivers, setDrivers] = useState<Staff[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [priorityOverride, setPriorityOverride] = useState<Set<string>>(new Set());
  const [driverId, setDriverId] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [route, setRoute] = useState<TimelineRoute | null>(null);
  const [driverName, setDriverName] = useState("");
  const [unrouted, setUnrouted] = useState<string[]>([]);
  const [tab, setTab] = useState<"select" | "manage">("select");

  useEffect(() => {
    (async () => {
      try {
        const [orderList, staffList, s] = await Promise.all([api.getOrders({ status: "PENDING" }), api.getStaff(), api.getSettings()]);
        setOrders(orderList);
        const driverList = staffList.filter((st: Staff) => st.roles.includes("DRIVER"));
        setDrivers(driverList);
        if (driverList.length > 0) setDriverId(driverList[0].id);
        setSettings(s);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const toggleSel = (id: string) => {
    const s = new Set(selected);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelected(s);
  };
  // 尚未勾選時先顯示全部待處理的總計，勾選後只算已勾選的——兩者數量本來就不同
  const summaryOrders = selected.size > 0 ? orders.filter((o) => selected.has(o.id)) : orders;
  const summaryTitle = selected.size > 0 ? `已勾選貨品總計（${selected.size} 筆）` : "待處理貨品總計（尚未勾選）";

  const allSelected = orders.length > 0 && selected.size === orders.length;
  const toggleSelectAll = () => {
    setSelected(allSelected ? new Set() : new Set(orders.map((o) => o.id)));
  };

  // 依縣市分組，順序為使用者指定的送貨路線順序（台北→新北→基隆→桃園→其他）
  const cityGroups = useMemo(() => {
    const map = new Map<string, Order[]>();
    for (const o of orders) {
      const city = dispatchCityOf(o.address);
      if (!map.has(city)) map.set(city, []);
      map.get(city)!.push(o);
    }
    return [...map.entries()].sort(([a], [b]) => dispatchCityIndex(a) - dispatchCityIndex(b));
  }, [orders]);

  const toggleCity = (group: Order[]) => {
    const wasAll = group.every((o) => selected.has(o.id));
    const s = new Set(selected);
    for (const o of group) (wasAll ? s.delete(o.id) : s.add(o.id));
    setSelected(s);
  };
  const togglePriority = (id: string) => {
    const s = new Set(priorityOverride);
    s.has(id) ? s.delete(id) : s.add(id);
    setPriorityOverride(s);
  };

  async function handleSubmit() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      if (settings?.companyLat == null || settings?.companyLng == null) {
        throw new Error("公司座標未設定，請確認系統設定");
      }
      const companyPoint = { lat: settings.companyLat, lng: settings.companyLng };
      const result = await api.selectOrders({
        orderIds: Array.from(selected),
        priorityOrderIds: Array.from(priorityOverride),
        driverId,
        originPoint: companyPoint,
        destinationPoint: companyPoint,
      });
      const byId = new Map(orders.map((o) => [o.id, o]));
      setRoute({
        stops: result.legs.map((leg) => {
          const o = byId.get(leg.refId)!;
          return {
            refId: o.id,
            name: o.customerName,
            subtitle: o.address,
            isPriority: priorityOverride.has(o.id),
            legDistanceKm: leg.legDistanceKm,
            legDurationMin: leg.legDurationMin,
            products: o.items.map((i) => ({ name: i.productName, qty: i.quantity })),
          };
        }),
        finalLegDistanceKm: result.finalLegDistanceKm,
        totalDistanceKm: result.totalDistanceKm,
      });
      setUnrouted(result.unroutedOrderNames ?? []);
      setDriverName(drivers.find((d) => d.id === driverId)?.name ?? "");
    } catch (err) {
      setSubmitError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="p-6 text-center text-[13px]" style={{ color: C.muted }}>載入中…</div>;
  if (error) return <div className="p-6 text-center text-[13px]" style={{ color: C.danger }}>{error}</div>;

  if (route) {
    return (
      <div>
        <TopBar title="已送出配送指派" accent={C.logiAccent} onBack={() => navigate("/route")} />
        <div className="p-4">
          <div className="rounded-xl p-3 mb-4 flex items-start gap-2" style={{ background: C.logiAccentSoft }}>
            <CheckCircle2 size={18} color={C.logiAccent} className="mt-0.5" />
            <div style={{ fontFamily: "'Noto Sans TC', sans-serif", color: C.navy }} className="text-[12px] font-medium leading-relaxed">
              已將 {selected.size} 筆派遣單狀態更新為「已勾選配送」，並產生預設路線順序，指派給送貨人員
              <b>{driverName}</b>。
            </div>
          </div>
          {unrouted.length > 0 && (
            <div className="rounded-xl p-3 mb-4" style={{ background: C.goldSoft, color: C.gold }}>
              <div className="text-[12px] font-bold">{unrouted.length} 筆缺少座標，已指派給送貨人員但未排進路線：</div>
              <div className="text-[11px] mt-1">{unrouted.join("、")}</div>
              <div className="text-[11px] mt-1">請到內勤後台「派遣單」補齊座標後，送貨人員頁面會自動重新排入路線。</div>
            </div>
          )}
          <ProductSummary
            title="本次配送貨品總計"
            items={orders.filter((o) => selected.has(o.id)).flatMap((o) => o.items)}
            orderCount={selected.size}
            accent={C.logiAccent}
          />
          <div style={{ fontFamily: "'Noto Sans TC', sans-serif", color: C.muted }} className="text-[12px] font-bold mb-2">
            預設路線順序（公司 → 公司）
          </div>
          <RouteTimeline originLabel="公司" destinationLabel="公司" route={route} showProducts={true} accent={C.logiAccent} />
          <button onClick={() => navigate("/route")} style={{ background: C.logiAccent }} className="w-full text-white font-bold text-[14px] py-3 rounded-xl mt-4">
            完成
          </button>
        </div>
      </div>
    );
  }

  const tabBar = (
    <div className="px-4 pt-3 flex gap-2">
      {(
        [
          ["select", "派遣單勾選"],
          ["manage", "派遣單管理"],
        ] as ["select" | "manage", string][]
      ).map(([key, label]) => (
        <button
          key={key}
          onClick={() => setTab(key)}
          style={tab === key ? { background: C.logiAccent, color: "#fff" } : { color: C.muted, border: `1px solid ${C.hairline}` }}
          className="px-3 py-1.5 rounded-full text-[12px] font-bold"
        >
          {label}
        </button>
      ))}
    </div>
  );

  // 派遣單管理：沿用內勤後台的清單（含各狀態分頁）；匯入／刪除等僅 ADMIN 可見
  if (tab === "manage") {
    return (
      <div>
        <TopBar title="派遣單管理（物流主管）" accent={C.logiAccent} onBack={() => navigate("/route")} />
        {tabBar}
        <OrdersPanel />
      </div>
    );
  }

  return (
    <div>
      <TopBar title="派遣單勾選（物流主管）" accent={C.logiAccent} onBack={() => navigate("/route")} />
      {tabBar}
      {drivers.length > 0 && (
        <div className="px-4 pt-3 pb-2">
          <label style={{ color: C.muted, fontFamily: "'Noto Sans TC', sans-serif" }} className="text-[12px] font-bold block mb-1">
            指派送貨人員
          </label>
          <select
            value={driverId}
            onChange={(e) => setDriverId(e.target.value)}
            className="w-full px-3 py-2 rounded-lg text-[13px]"
            style={{ border: `1px solid ${C.hairline}` }}
          >
            {drivers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="px-4 pb-28">
        {orders.length > 0 && (
          <ProductSummary title={summaryTitle} items={summaryOrders.flatMap((o) => o.items)} orderCount={summaryOrders.length} accent={C.logiAccent} />
        )}
        {/* 待處理清單放在總計下方，中間用分隔線拉開，不要讓人誤讀成總計的一部分 */}
        {orders.length > 0 && (
          <div
            className="mt-4 pt-3 mb-1 flex items-center justify-between border-t"
            style={{ borderColor: C.hairline, color: C.muted, fontFamily: "'Noto Sans TC', sans-serif" }}
          >
            <div className="text-[12px]">待處理派遣單（依縣市分區）</div>
            <button onClick={toggleSelectAll} className="flex items-center gap-1.5">
              <Checkbox checked={allSelected} />
              <span style={{ color: C.text }} className="text-[12px] font-bold">
                全部勾選
              </span>
            </button>
          </div>
        )}
        {cityGroups.map(([city, group]) => {
          const cityAll = group.every((o) => selected.has(o.id));
          const citySelected = group.filter((o) => selected.has(o.id)).length;
          return (
            <div key={city} className="mt-3">
              {/* 縣市分隔＋整區勾選 */}
              <button
                onClick={() => toggleCity(group)}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg mb-2"
                style={{ background: C.logiAccentSoft }}
              >
                <Checkbox checked={cityAll} />
                <span style={{ color: C.logiAccent, fontFamily: "'Noto Sans TC', sans-serif" }} className="text-[13px] font-bold">
                  {city}
                </span>
                <span style={{ color: C.muted, fontFamily: "Manrope" }} className="text-[11px] font-bold ml-auto">
                  {citySelected}/{group.length}
                </span>
              </button>
              {group.map((o) => {
                const isSel = selected.has(o.id);
                const isPriority = priorityOverride.has(o.id);
                return (
                  <div key={o.id} className="mb-2 rounded-xl p-3" style={{ background: "#fff", border: `1px solid ${isSel ? C.logiAccent : C.hairline}` }}>
                    <div className="flex items-start gap-3">
                      <button onClick={() => toggleSel(o.id)} className="mt-0.5">
                        <Checkbox checked={isSel} />
                      </button>
                      <div className="flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span style={{ fontFamily: "Manrope", color: C.muted }} className="text-[11px] font-bold">
                            {o.customerCode}
                          </span>
                          <span style={{ fontFamily: "'Noto Sans TC', sans-serif" }} className="font-semibold text-[13px]">
                            {o.customerName}
                          </span>
                        </div>
                        <div style={{ color: C.muted }} className="text-[11px] mt-0.5">
                          {o.address}
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {o.items.map((p, pi) => (
                            <span key={pi} style={{ background: C.bg, color: C.text }} className="text-[11px] px-1.5 py-0.5 rounded">
                              {p.productName} ×{p.quantity}
                            </span>
                          ))}
                        </div>
                        {isSel && (
                          <button onClick={() => togglePriority(o.id)} className="mt-2 flex items-center gap-1">
                            <div
                              className="flex items-center justify-center rounded"
                              style={{
                                width: 16,
                                height: 16,
                                border: `2px solid ${isPriority ? C.gold : C.hairline}`,
                                background: isPriority ? C.gold : "transparent",
                              }}
                            >
                              {isPriority && <span style={{ color: "#fff", fontSize: 10 }}>✓</span>}
                            </div>
                            <span style={{ color: isPriority ? C.gold : C.muted, fontFamily: "'Noto Sans TC', sans-serif" }} className="text-[11px] font-bold">
                              標記為優先客戶（本次配送）
                            </span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
        {orders.length === 0 && (
          <div className="text-center text-[13px] py-8" style={{ color: C.muted }}>
            目前沒有待處理派遣單
          </div>
        )}
      </div>
      {submitError && (
        <div className="px-4 text-[12px] mb-2" style={{ color: C.danger }}>
          {submitError}
        </div>
      )}
      <div className="fixed bottom-0 left-0 right-0 max-w-[420px] mx-auto p-4" style={{ background: "linear-gradient(to top, #F2F4F7 70%, transparent)" }}>
        <button
          onClick={handleSubmit}
          disabled={selected.size === 0 || !driverId || submitting}
          style={{ background: selected.size && driverId ? C.logiAccent : "#B9C2D0" }}
          className="w-full text-white font-bold text-[14px] py-3 rounded-xl shadow-lg disabled:opacity-70"
        >
          {submitting ? "送出中…" : `送出（已選 ${selected.size} 筆・指派送貨人員並產生路線）`}
        </button>
      </div>
    </div>
  );
}
