import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, Check, LogOut, KeyRound } from "lucide-react";
import { api } from "../../../api/client";
import { getAuthedStaff, isDriverOnly, clearSession } from "../../../lib/auth";
import { C, TopBar, Pill, RouteTimeline, ActionRow, TimelineRoute, ProductSummary } from "../../../components/common";
import { buildNavigationUrl } from "../../../lib/googleMapsLoader";

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
  isPriority: boolean;
  assignedDriverId?: string | null;
  lat?: number | null;
  lng?: number | null;
  items: OrderItem[];
  status: string;
}

interface Staff {
  id: string;
  name: string;
  homeAddress: string;
  homeLat?: number | null;
  homeLng?: number | null;
}

interface Settings {
  companyAddress: string;
  companyLat?: number | null;
  companyLng?: number | null;
}

export default function DriverRoute() {
  const navigate = useNavigate();
  const me = getAuthedStaff();
  const driverOnly = !!me && isDriverOnly(me.roles);

  const [origin, setOrigin] = useState<"company" | "home">("company");
  const [destination, setDestination] = useState<"company" | "home">("company");
  const [orders, setOrders] = useState<Order[]>([]);
  const [self, setSelf] = useState<Staff | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [completed, setCompleted] = useState<Set<string>>(new Set());

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [route, setRoute] = useState<TimelineRoute | null>(null);
  const [routeStops, setRouteStops] = useState<Order[]>([]); // 已排序好的停靠站，供「開始導航」使用
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);

  useEffect(() => {
    if (!me) {
      navigate("/login");
      return;
    }
    (async () => {
      try {
        const [orderList, staffList, s] = await Promise.all([api.getOrders({}), api.getStaff(), api.getSettings()]);
        setOrders(
          orderList.filter((o: Order) => o.assignedDriverId === me.id && (o.status === "SELECTED" || o.status === "DISPATCHED"))
        );
        setSelf(staffList.find((st: Staff) => st.id === me.id) ?? null);
        setSettings(s);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    })();
    api
      .getNotifications()
      .then((list) => setUnreadCount(list.filter((n) => !n.isRead).length))
      .catch(() => {});
  }, []);

  const assignedOrders = useMemo(() => orders.filter((o) => !completed.has(o.id)), [orders, completed]);

  const originPoint = origin === "company" ? { lat: settings?.companyLat, lng: settings?.companyLng } : { lat: self?.homeLat, lng: self?.homeLng };
  const destPoint = destination === "company" ? { lat: settings?.companyLat, lng: settings?.companyLng } : { lat: self?.homeLat, lng: self?.homeLng };

  useEffect(() => {
    if (loading) return;
    (async () => {
      setRouteLoading(true);
      setRouteError(null);
      try {
        const stops = assignedOrders.filter((o) => o.lat != null && o.lng != null);
        if (stops.length === 0) {
          setRoute(null);
          return;
        }
        if (originPoint.lat == null || originPoint.lng == null || destPoint.lat == null || destPoint.lng == null) {
          throw new Error("出發地或目的地缺少座標");
        }
        const result = await api.optimizeRoute({
          origin: { lat: originPoint.lat, lng: originPoint.lng },
          destination: { lat: destPoint.lat, lng: destPoint.lng },
          stops: stops.map((o) => ({ refId: o.id, lat: o.lat, lng: o.lng, isPriority: o.isPriority })),
        });
        const byId = new Map(stops.map((o) => [o.id, o]));
        setRouteStops(result.orderedStopRefIds.map((id) => byId.get(id)!));
        setRoute({
          stops: result.legs.map((leg) => {
            const o = byId.get(leg.refId)!;
            return {
              refId: o.id,
              name: o.customerName,
              subtitle: o.address,
              isPriority: o.isPriority,
              legDistanceKm: leg.legDistanceKm,
              legDurationMin: leg.legDurationMin,
              products: o.items.map((i) => ({ name: i.productName, qty: i.quantity })),
            };
          }),
          finalLegDistanceKm: result.finalLegDistanceKm,
          finalLegDurationMin: result.finalLegDurationMin,
          totalDistanceKm: result.totalDistanceKm,
          totalDurationMin: result.totalDurationMin,
        });
      } catch (err) {
        setRouteError((err as Error).message);
      } finally {
        setRouteLoading(false);
      }
    })();
  }, [origin, destination, loading, assignedOrders.length]);

  async function toggleItemChecked(orderId: string, itemId: string) {
    const order = orders.find((o) => o.id === orderId);
    const item = order?.items.find((i) => i.id === itemId);
    if (!item) return;
    const nextChecked = !item.checked;
    // 同步後端邏輯：全部品項檢貨完成 → 已派送；取消其中一項 → 退回已勾選配送
    setOrders((prev) =>
      prev.map((o) => {
        if (o.id !== orderId) return o;
        const items = o.items.map((i) => (i.id === itemId ? { ...i, checked: nextChecked } : i));
        const allChecked = items.length > 0 && items.every((i) => i.checked);
        let status = o.status;
        if (allChecked && status === "SELECTED") status = "DISPATCHED";
        else if (!allChecked && status === "DISPATCHED") status = "SELECTED";
        return { ...o, items, status };
      })
    );
    try {
      await api.updateItemChecked(itemId, nextChecked);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  // 檢貨勾選狀態存在 orders 裡（即時更新），route 是路線計算完成當下的快照，
  // 這裡合併兩者：路線順序／距離用 route 的，品項勾選狀態即時反映 orders 的最新值
  const liveRoute = useMemo(() => {
    if (!route) return null;
    const byId = new Map(orders.map((o) => [o.id, o]));
    return {
      ...route,
      stops: route.stops.map((s) => {
        const o = byId.get(s.refId);
        return {
          ...s,
          products: o?.items.map((i) => ({
            name: i.productName,
            qty: i.quantity,
            checked: i.checked,
            onToggle: () => toggleItemChecked(o.id, i.id),
          })),
        };
      }),
    };
  }, [route, orders]);

  async function toggleDone(id: string) {
    const wasCompleted = completed.has(id);
    const s = new Set(completed);
    wasCompleted ? s.delete(id) : s.add(id);
    setCompleted(s);
    try {
      await api.updateOrderStatus(id, wasCompleted ? "DISPATCHED" : "COMPLETED");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (loading) return <div className="p-6 text-center text-[13px]" style={{ color: C.muted }}>載入中…</div>;
  if (error) return <div className="p-6 text-center text-[13px]" style={{ color: C.danger }}>{error}</div>;

  return (
    <div>
      <TopBar
        title="今日配送名單（送貨人員）"
        accent={C.logiAccent}
        // 只送貨的人是直接登入到這一頁的，沒有上一層可回；改在右側提供登出
        onBack={driverOnly ? undefined : () => navigate("/route")}
        right={
          <div className="flex items-center gap-1">
            <button onClick={() => navigate("/notifications")} className="relative p-1">
              <Bell size={18} />
              {unreadCount > 0 && (
                <span
                  style={{ background: C.danger }}
                  className="absolute -top-0.5 -right-0.5 text-white text-[9px] font-bold rounded-full min-w-[14px] h-[14px] flex items-center justify-center px-0.5"
                >
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>
            {/* 只送貨的人看不到主目錄，改密碼的入口只能放這裡 */}
            {driverOnly && (
              <>
                <button onClick={() => navigate("/password")} className="p-1 text-white/90">
                  <KeyRound size={16} />
                </button>
                <button
                  onClick={() => {
                    clearSession();
                    navigate("/login");
                  }}
                  className="flex items-center gap-1 p-1 text-white/90 text-[12px] font-bold"
                >
                  <LogOut size={14} /> 登出
                </button>
              </>
            )}
          </div>
        }
      />
      <div className="p-4">
        <div style={{ fontFamily: "'Noto Sans TC', sans-serif", color: C.muted }} className="text-[12px] font-bold mb-2">
          出發地／目的地（可調整）
        </div>
        <div className="flex gap-2 mb-2">
          <Pill accent={C.logiAccent} active={origin === "company"} onClick={() => setOrigin("company")}>
            出發：公司
          </Pill>
          <Pill accent={C.logiAccent} active={origin === "home"} onClick={() => setOrigin("home")}>
            出發：住家
          </Pill>
        </div>
        <div className="flex gap-2 mb-4">
          <Pill accent={C.logiAccent} active={destination === "company"} onClick={() => setDestination("company")}>
            目的：公司
          </Pill>
          <Pill accent={C.logiAccent} active={destination === "home"} onClick={() => setDestination("home")}>
            目的：住家
          </Pill>
        </div>

        {routeLoading && <div className="text-center text-[13px] py-4" style={{ color: C.muted }}>路線計算中…</div>}
        {routeError && <div className="text-center text-[13px] py-2" style={{ color: C.danger }}>{routeError}</div>}

        {/* 今日要載的貨品總量（含尚未送達的派遣單），方便裝車前清點 */}
        {orders.length > 0 && (
          <ProductSummary
            title="今日配送貨品總計"
            items={orders.flatMap((o) => o.items)}
            orderCount={orders.length}
            accent={C.logiAccent}
          />
        )}

        {route && (
          <>
            <div className="rounded-xl p-3 mb-4 flex items-center justify-between" style={{ background: C.logiAccentSoft }}>
              <div style={{ fontFamily: "'Noto Sans TC', sans-serif", color: C.navy }} className="text-[12px] font-bold">
                今日配送總距離
              </div>
              <div style={{ fontFamily: "Manrope", color: C.logiAccent }} className="text-[18px] font-extrabold">
                {route.totalDistanceKm.toFixed(1)} km
              </div>
            </div>
            <RouteTimeline
              originLabel={origin === "company" ? "公司" : "住家"}
              destinationLabel={destination === "company" ? "公司" : "住家"}
              route={liveRoute!}
              showProducts={true}
              accent={C.logiAccent}
            />
          </>
        )}

        <div style={{ fontFamily: "'Noto Sans TC', sans-serif", color: C.muted }} className="text-[12px] font-bold mt-4 mb-2">
          配送完成標記
        </div>
        {orders.map((o) => (
          <button
            key={o.id}
            onClick={() => toggleDone(o.id)}
            className="w-full flex items-center gap-2 rounded-xl px-3 py-2 mb-2"
            style={{ background: "#fff", border: `1px solid ${C.hairline}` }}
          >
            <div
              className="flex items-center justify-center rounded-md"
              style={{ width: 18, height: 18, border: `2px solid ${completed.has(o.id) ? C.logiAccent : C.hairline}`, background: completed.has(o.id) ? C.logiAccent : "transparent" }}
            >
              {completed.has(o.id) && <Check size={12} color="#fff" strokeWidth={3} />}
            </div>
            <span
              style={{ fontFamily: "'Noto Sans TC', sans-serif", textDecoration: completed.has(o.id) ? "line-through" : "none", color: completed.has(o.id) ? C.muted : C.text }}
              className="text-[13px] font-semibold flex-1 text-left"
            >
              {o.customerName}
            </span>
            <span style={{ color: completed.has(o.id) ? C.logiAccent : C.muted, fontFamily: "'Noto Sans TC', sans-serif" }} className="text-[11px] font-bold">
              {completed.has(o.id) ? "已完成" : "待完成"}
            </span>
          </button>
        ))}
        {orders.length === 0 && (
          <div className="text-center text-[13px] py-8" style={{ color: C.muted }}>
            今天沒有指派給你的配送任務
          </div>
        )}

        {route && (
          <ActionRow
            accent={C.logiAccent}
            onNavigate={() => {
              if (originPoint.lat == null || originPoint.lng == null || destPoint.lat == null || destPoint.lng == null) return;
              const url = buildNavigationUrl(
                { lat: originPoint.lat, lng: originPoint.lng },
                { lat: destPoint.lat, lng: destPoint.lng },
                routeStops.map((o) => ({ lat: o.lat!, lng: o.lng! }))
              );
              window.open(url, "_blank");
            }}
          />
        )}
      </div>
    </div>
  );
}
