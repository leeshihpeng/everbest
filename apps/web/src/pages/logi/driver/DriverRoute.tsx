import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
// Map 要改名匯入：直接叫 Map 會遮蔽內建的 Map 建構子，這個檔案裡到處都在 new Map()
import { Check, RotateCcw, HelpCircle, ChevronUp, ChevronDown, Trash2, Map as MapIcon } from "lucide-react";
import { api } from "../../../api/client";
import { getAuthedStaff, isDriverOnly } from "../../../lib/auth";
import { dispatchCityOf, dispatchCityIndex } from "../../../lib/taiwanCities";
import { C, TopBar, Pill, Checkbox, RouteTimeline, ActionRow, TimelineRoute, ProductSummary, QtySubtotal, sumQty, DispatchDateTag, HeaderActions, shipmentDay, taipeiToday } from "../../../components/common";
import { buildNavigationUrl } from "../../../lib/googleMapsLoader";
import { formatRouteShareText, shareRouteText } from "../../../lib/routeShare";

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
  orderNote?: string | null;
  createdAt?: string; // 派遣單匯入（檔案上傳）的時間
  updatedAt?: string; // 最後異動時間
  deliveryDate?: string; // 出貨日期——今日名單一律以這個為準，不是匯入時間
  routeSequence?: number | null;
  routeOrderManual?: boolean;
  inRoute: boolean; // 這趟要不要送（取消勾選＝留在名單但不排進路線）
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

// 功能使用說明。預設收合（每天都要看的畫面，不佔版面），展開狀態記在瀏覽器裡。
function HelpPanel() {
  const [open, setOpen] = useState(() => localStorage.getItem("driverHelpOpen") === "1");

  function toggle() {
    const next = !open;
    setOpen(next);
    localStorage.setItem("driverHelpOpen", next ? "1" : "0");
  }

  const items: [string, string][] = [
    ["派遣單自動指派", "派遣單一上傳就會依收件地址的縣市直接指派給你，不必等主管勾選。預設順序是台北市→新北市→基隆市→桃園市→其他。"],
    ["這趟不送的單子", "在下方「今日派遣單」把該客戶的勾選取消，他就不會排進路線與導航，但仍留在名單上，改天要送再勾回來。"],
    ["刪除單子", "確定不用送的（例如客戶取消）按該列的垃圾桶刪除。刪掉的不會因為系統重新抓檔案又跑回來。"],
    ["調整送貨順序", "按住客戶卡片右上角的把手（⠿）直接往上下拖，拖到要的位置放開即可；拖到畫面上下邊緣會自動捲動。也可以長按卡片任一處進入拖曳，或用 ↑↓ 一次移動一站。"],
    ["順序會自動儲存", "調整後系統會重算各段距離並記住你的順序，關掉App、換手機登入都還在，不會被系統重新排掉。"],
    ["依縣市／最短路徑", "路線上方兩個按鈕：「依縣市」排回台北→新北→基隆→桃園→其他；「最短路徑」改用系統依優先客戶與距離排的建議路線。"],
    ["出發地／目的地", "可切換公司或住家，切換後會重新計算路線。"],
    ["貨單附註", "出貨時如果有交代事項（例如指定收貨時間、送貨方式），會以黃色標示在該客戶的貨品上方。"],
    ["檢貨", "裝車時點各項貨品標記已檢貨；整張單全部檢完會自動變成「已派送」。"],
    ["配送完成", "送達後在「今日派遣單」按該列的「待完成」切換成已完成，該站會從路線中移除。"],
    ["開始導航", "按最下方「開始導航」會照目前順序開啟 Google 地圖導航。"],
  ];

  return (
    <div className="rounded-xl mb-3" style={{ background: "#fff", border: `1px solid ${C.hairline}` }}>
      <button onClick={toggle} className="w-full flex items-center gap-1.5 px-3 py-2">
        <HelpCircle size={14} color={C.logiAccent} />
        <span style={{ fontFamily: "'Noto Sans TC', sans-serif" }} className="font-bold text-[12px] flex-1 text-left">
          功能使用說明
        </span>
        {open ? <ChevronUp size={15} color={C.muted} /> : <ChevronDown size={15} color={C.muted} />}
      </button>
      {open && (
        <div className="px-3 pb-3 pt-0.5">
          {items.map(([title, desc]) => (
            <div key={title} className="mb-2 last:mb-0">
              <div style={{ fontFamily: "'Noto Sans TC', sans-serif", color: C.logiAccent }} className="font-bold text-[12px]">
                {title}
              </div>
              <div style={{ color: C.muted }} className="text-[12px] leading-relaxed">
                {desc}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
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
  const [route, setRoute] = useState<TimelineRoute | null>(null);
  const [routeStops, setRouteStops] = useState<Order[]>([]); // 已排序好的停靠站，供「開始導航」使用
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  // 送貨人員自行調整過順序 → 照自己排的走，不再自動重新排序
  const [manualOrder, setManualOrder] = useState<string[] | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);

  useEffect(() => {
    if (!me) {
      navigate("/login");
      return;
    }
    (async () => {
      try {
        const [orderList, staffList, s] = await Promise.all([api.getOrders({}), api.getStaff(), api.getSettings()]);
        // **只看今天出貨的單子**（使用者 2026-08-06）：依出貨日期，不是匯入日期——
        // 下班前會先把明天的配送資料匯進來，用匯入日期判斷的話明天的貨今天就會冒出來。
        // 舊日期的也不再顯示，跟貨運派遣一致。
        //
        // **今天送完的仍留在畫面上**（使用者 2026-08-05）：原本一按完成就整筆消失，
        // 看不出自己今天送了哪幾家，也沒辦法按錯再取消。改成留著並顯示為已完成（刪除線＋綠色）。
        const mine: Order[] = orderList.filter(
          (o: Order) =>
            o.assignedDriverId === me.id &&
            shipmentDay(o.deliveryDate) === taipeiToday() &&
            (o.status === "SELECTED" || o.status === "DISPATCHED" || o.status === "COMPLETED")
        );
        setOrders(mine);
        // 已完成的要一併回填，否則重新整理後會變回「待完成」而且又被排進路線
        setCompleted(new Set(mine.filter((o) => o.status === "COMPLETED").map((o) => o.id)));
        // 之前調整過順序就沿用（換手機、重新整理都還在）。orderList 已依 routeSequence 排序。
        if (mine.some((o) => o.routeOrderManual)) {
          setManualOrder(mine.filter((o) => o.lat != null && o.lng != null).map((o) => o.id));
        }
        setSelf(staffList.find((st: Staff) => st.id === me.id) ?? null);
        setSettings(s);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    })();
    // 未讀通知數改由標題列的 HeaderActions 自己抓
  }, []);

  // 排進路線的條件：還沒送完，而且送貨人員這趟有勾選要送
  const assignedOrders = useMemo(
    () => orders.filter((o) => !completed.has(o.id) && o.inRoute),
    [orders, completed]
  );

  // 目前用的是哪一種排序，讓兩顆按鈕能正確反白。
  // 不另外存狀態，直接從現況推導，這樣重新整理、換手機登入也不會顯示錯：
  //   沒有手動順序 → 系統的最短路徑
  //   有手動順序且剛好照縣市遞增 → 依縣市（匯入時的預設順序）
  //   有手動順序但不是縣市順序 → 送貨人員自己拖過，兩顆都不反白
  const sortMode: "city" | "shortest" | "custom" = useMemo(() => {
    if (!manualOrder) return "shortest";
    const ids = route ? route.stops.map((s) => s.refId) : [];
    if (ids.length === 0) return "city";
    const byId = new Map(orders.map((o) => [o.id, o]));
    const cityIdx = ids.map((id) => dispatchCityIndex(dispatchCityOf(byId.get(id)?.address ?? "")));
    const ascending = cityIdx.every((v, i) => i === 0 || cityIdx[i - 1] <= v);
    return ascending ? "city" : "custom";
  }, [manualOrder, route, orders]);

  // 今日派遣單清單依縣市分區，順序即送貨順序（台北→新北→基隆→桃園→其他）
  const cityGroups = useMemo(() => {
    const map = new Map<string, Order[]>();
    for (const o of orders) {
      const city = dispatchCityOf(o.address);
      if (!map.has(city)) map.set(city, []);
      map.get(city)!.push(o);
    }
    return [...map.entries()].sort(([a], [b]) => dispatchCityIndex(a) - dispatchCityIndex(b));
  }, [orders]);

  const originPoint = origin === "company" ? { lat: settings?.companyLat, lng: settings?.companyLng } : { lat: self?.homeLat, lng: self?.homeLng };
  const destPoint = destination === "company" ? { lat: settings?.companyLat, lng: settings?.companyLng } : { lat: self?.homeLat, lng: self?.homeLng };

  useEffect(() => {
    if (loading) return;
    (async () => {
      setRouteLoading(true);
      setRouteError(null);
      try {
        const routable = assignedOrders.filter((o) => o.lat != null && o.lng != null);
        // 自行調整過順序就照著走；已完成或新加入的單子分別剔除／補在最後
        const stops = manualOrder
          ? [
              ...manualOrder.map((id) => routable.find((o) => o.id === id)).filter((o): o is Order => !!o),
              ...routable.filter((o) => !manualOrder.includes(o.id)),
            ]
          : routable;
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
          keepOrder: !!manualOrder,
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
              note: o.orderNote ?? undefined,
              createdAt: o.createdAt,
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
  }, [origin, destination, loading, assignedOrders.length, manualOrder]);

  // 臨時調整送貨順序：存回後端後重新計算各段距離
  async function saveOrder(next: string[]) {
    setManualOrder(next);
    setSavingOrder(true);
    setError(null);
    try {
      await api.updateRouteOrder(next);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingOrder(false);
    }
  }

  // 分享今日路線：跟檢驗報告的分享一樣交給系統分享清單（可選 LINE 群組）
  async function handleShareRoute() {
    if (!liveRoute) return;
    const text = formatRouteShareText({
      title: `${me?.name ?? ""} 的今日配送路線`,
      originLabel: origin === "company" ? "公司" : "住家",
      destinationLabel: destination === "company" ? "公司" : "住家",
      route: liveRoute,
    });
    const notice = await shareRouteText("今日配送路線", text);
    setError(notice);
  }

  // ↑↓ 微調：把某一站往前／往後移一位
  function moveStop(refId: string, dir: -1 | 1) {
    const current = route ? route.stops.map((s) => s.refId) : [];
    const i = current.indexOf(refId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= current.length) return;
    const next = [...current];
    [next[i], next[j]] = [next[j], next[i]];
    void saveOrder(next);
  }

  // 放棄目前順序，改用系統依優先客戶＋最短路徑自動排的路線
  async function useShortestPath() {
    const ids = route ? route.stops.map((s) => s.refId) : [];
    setManualOrder(null);
    if (ids.length === 0) return;
    setSavingOrder(true);
    setError(null);
    try {
      await api.updateRouteOrder(ids, false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingOrder(false);
    }
  }

  // 排回縣市順序（台北→新北→基隆→桃園→其他），同縣市內維持目前順序。
  // 這是派遣單匯入時的預設順序，拖亂了可以一鍵回來。
  async function sortByCity() {
    const current = route ? route.stops.map((s) => s.refId) : [];
    if (current.length === 0) return;
    const byId = new Map(orders.map((o) => [o.id, o]));
    const next = [...current].sort((a, b) => {
      const ca = dispatchCityIndex(dispatchCityOf(byId.get(a)?.address ?? ""));
      const cb = dispatchCityIndex(dispatchCityOf(byId.get(b)?.address ?? ""));
      if (ca !== cb) return ca - cb;
      return current.indexOf(a) - current.indexOf(b);
    });
    await saveOrder(next);
  }

  // 這趟要不要送。取消勾選的單子留在名單上，只是不排進路線與導航。
  async function toggleInRoute(o: Order) {
    const next = !o.inRoute;
    setOrders((prev) => prev.map((x) => (x.id === o.id ? { ...x, inRoute: next } : x)));
    // 手動順序是一串 id，被拿掉的站要一起移除，否則恢復勾選時順序會錯亂
    if (!next) setManualOrder((prev) => (prev ? prev.filter((id) => id !== o.id) : prev));
    try {
      await api.setOrderInRoute(o.id, next);
    } catch (err) {
      setError((err as Error).message);
      setOrders((prev) => prev.map((x) => (x.id === o.id ? { ...x, inRoute: o.inRoute } : x)));
    }
  }

  // 確定不用送的單子（例如客戶取消）。標成已刪除而不是真的刪掉，
  // 否則系統下次重新抓 ERP 檔案時會把它加回來。
  async function handleDelete(o: Order) {
    if (!confirm(`確定要刪除「${o.customerName}」這筆派遣單嗎？刪除後不會再出現在你的名單上。`)) return;
    const before = orders;
    setOrders((prev) => prev.filter((x) => x.id !== o.id));
    setManualOrder((prev) => (prev ? prev.filter((id) => id !== o.id) : prev));
    try {
      await api.cancelOrder(o.id);
    } catch (err) {
      setError((err as Error).message);
      setOrders(before);
    }
  }

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
      stops: route.stops.map((s, i) => {
        const o = byId.get(s.refId);
        return {
          ...s,
          note: o?.orderNote ?? s.note,
          products: o?.items.map((it) => ({
            name: it.productName,
            qty: it.quantity,
            checked: it.checked,
            onToggle: () => toggleItemChecked(o.id, it.id),
          })),
          // 頭尾各少一個方向，避免按了沒反應
          onMoveUp: i > 0 ? () => moveStop(s.refId, -1) : undefined,
          onMoveDown: i < route.stops.length - 1 ? () => moveStop(s.refId, 1) : undefined,
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
        accent={C.header}
        // 只送貨的人是直接登入到這一頁的，沒有上一層可回；改在右側提供登出。
        // 其他人（例如業務兼司機）是從主目錄直接進來的，返回就回主目錄。
        onBack={driverOnly ? undefined : () => navigate("/")}
        // 只送貨的人沒有主目錄可回，所以不放「首頁」，但改密碼的入口只能留在這裡
        right={<HeaderActions home={!driverOnly} password={driverOnly} />}
      />
      <div className="p-4">
        <HelpPanel />
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

        {/* 今日要載的貨品總量，方便裝車前清點。只算這趟真的要送的，
            取消勾選與已送達的不列入，否則裝車會多帶 */}
        {assignedOrders.length > 0 && (
          <ProductSummary
            title="尚未送達貨品總計"
            items={assignedOrders.flatMap((o) => o.items)}
            orderCount={assignedOrders.length}
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
            <div className="mb-2">
              <div style={{ color: C.muted }} className="text-[11px] mb-1.5">
                {sortMode === "city"
                  ? "目前：依縣市順序"
                  : sortMode === "shortest"
                  ? "目前：系統最短路徑"
                  : "目前：你自己調整的順序"}
                ・按住右上角把手 ⠿ 可拖曳
                {savingOrder && "・儲存中…"}
              </div>
              {/* 兩種排序各給一顆按鈕，目前生效的那顆填滿反白——
                  只有外框深淺的話，按了之後看不出來換了沒有。 */}
              <div className="flex gap-2">
                {(
                  [
                    ["city", "依縣市排序", MapIcon, sortByCity],
                    ["shortest", "改用最短路徑", RotateCcw, useShortestPath],
                  ] as const
                ).map(([mode, label, Icon, onClick]) => {
                  const active = sortMode === mode;
                  return (
                    <button
                      key={mode}
                      onClick={onClick}
                      disabled={savingOrder}
                      style={
                        active
                          ? { background: C.logiAccent, border: `1px solid ${C.logiAccent}`, color: "#fff" }
                          : { background: "#fff", border: `1px solid ${C.hairline}`, color: C.muted }
                      }
                      className="flex items-center gap-1 text-[11px] font-bold px-2.5 py-1.5 rounded-lg disabled:opacity-60 shrink-0"
                    >
                      <Icon size={12} /> {label}
                    </button>
                  );
                })}
              </div>
            </div>
            <RouteTimeline
              originLabel={origin === "company" ? "公司" : "住家"}
              destinationLabel={destination === "company" ? "公司" : "住家"}
              route={liveRoute!}
              showProducts={true}
              accent={C.logiAccent}
              onReorder={saveOrder}
            />
          </>
        )}

        {/* 今日派遣單：勾選這趟要送哪些、標記送達、刪掉不用送的。
            依縣市分區，順序與匯入時的預設路線一致，找客戶比較快。 */}
        <div
          className="flex items-center justify-between mt-4 mb-2"
          style={{ fontFamily: "'Noto Sans TC', sans-serif", color: C.muted }}
        >
          <span className="text-[12px] font-bold">今日派遣單（依縣市）</span>
          <span style={{ fontFamily: "Manrope" }} className="text-[11px] font-bold">
            這趟要送 {assignedOrders.length}／{orders.length} 筆
          </span>
        </div>
        {orders.length > 0 && (
          <div style={{ color: C.muted }} className="text-[11px] mb-2">
            取消勾選＝這趟不送（單子留著，改天再送）；垃圾桶＝確定不用送，直接刪除。
          </div>
        )}

        {cityGroups.map(([city, group]) => (
          <div key={city} className="mb-3">
            <div className="flex items-center justify-between px-3 py-1.5 rounded-lg mb-1.5" style={{ background: C.logiAccentSoft }}>
              <span style={{ color: C.logiAccent, fontFamily: "'Noto Sans TC', sans-serif" }} className="text-[13px] font-bold">
                {city}
              </span>
              <span style={{ color: C.muted, fontFamily: "Manrope" }} className="text-[11px] font-bold">
                {group.filter((o) => o.inRoute && !completed.has(o.id)).length}／{group.length}
              </span>
            </div>
            {group.map((o) => {
              const done = completed.has(o.id);
              const skipped = !o.inRoute;
              return (
                <div
                  key={o.id}
                  className="rounded-xl px-3 py-2 mb-2"
                  style={{
                    background: "#fff",
                    border: `1px solid ${skipped ? C.hairline : C.logiAccent}`,
                    opacity: skipped ? 0.6 : 1,
                  }}
                >
                  <div className="flex items-center">
                    {/* 勾選框本身只有 20×20，直接當按鈕在手機上按不到（返回鍵與拖曳把手都踩過同一個坑）。
                        外面包一層 44×44 的點擊區，視覺大小不變。 */}
                    <button
                      onClick={() => toggleInRoute(o)}
                      aria-label={o.inRoute ? "這趟不送" : "這趟要送"}
                      style={{ width: 44, height: 44 }}
                      className="shrink-0 flex items-center justify-center -ml-2.5"
                    >
                      <Checkbox checked={o.inRoute} />
                    </button>
                    <div className="flex-1 min-w-0 pl-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span
                          style={{
                            fontFamily: "'Noto Sans TC', sans-serif",
                            textDecoration: done ? "line-through" : "none",
                            color: done ? C.muted : C.text,
                          }}
                          className="text-[13px] font-semibold"
                        >
                          {o.customerName}
                        </span>
                        <DispatchDateTag createdAt={o.createdAt} />
                      </div>
                      <div style={{ color: C.muted }} className="text-[11px] mt-0.5 break-all">
                        {o.address}
                      </div>
                    </div>
                    {/* 刪除不可逆，跟勾選拉開距離避免在晃動的車上按錯。
                        44×44 是手機最小可靠點擊尺寸，比圖示本身大一圈 */}
                    <button
                      onClick={() => handleDelete(o)}
                      aria-label="刪除這筆派遣單"
                      style={{ color: C.danger, width: 44, height: 44 }}
                      className="shrink-0 flex items-center justify-center"
                    >
                      <Trash2 size={16} />
                    </button>
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
                  <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                    {o.items.length > 0 && <QtySubtotal total={sumQty(o.items)} accent={C.logiAccent} />}
                    <button
                      onClick={() => toggleDone(o.id)}
                      disabled={skipped}
                      style={{
                        minHeight: 44, // 手機可靠點擊的最小尺寸
                        ...(done
                          ? { background: C.logiAccent, border: `1px solid ${C.logiAccent}`, color: "#fff" }
                          : { background: "#fff", border: `1px solid ${C.hairline}`, color: C.muted }),
                      }}
                      className="ml-auto flex items-center gap-1 text-[11px] font-bold px-3.5 rounded-lg disabled:opacity-50"
                    >
                      {done && <Check size={12} strokeWidth={3} />}
                      {done ? "已完成" : "待完成"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
        {orders.length === 0 && (
          <div className="text-center text-[13px] py-8" style={{ color: C.muted }}>
            今天沒有指派給你的配送任務
          </div>
        )}

        {route && (
          <ActionRow
            accent={C.logiAccent}
            onShare={handleShareRoute}
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
