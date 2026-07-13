import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, Home, Search, MapPin, ChevronDown, ChevronRight, Check, Route as RouteIcon, Plus } from "lucide-react";
import { api } from "../../api/client";
import { getAuthedStaff } from "../../lib/auth";
import { C, TopBar, PriorityTag, OriginCard, RouteTimeline, ActionRow, TimelineRoute } from "../../components/common";
import { RouteMap } from "../../components/RouteMap";
import { buildNavigationUrl } from "../../lib/googleMapsLoader";
import { cityOrderIndex } from "../../lib/taiwanCities";

interface Customer {
  id: string;
  code: string;
  name: string;
  address: string;
  city: string;
  isPriority: boolean;
  lat?: number | null;
  lng?: number | null;
}

interface Staff {
  id: string;
  name: string;
  homeAddress: string;
  homeLat?: number | null;
  homeLng?: number | null;
  salesRegions?: string[];
}

interface Settings {
  companyAddress: string;
  companyLat?: number | null;
  companyLng?: number | null;
}

type Step = "setup" | "select" | "route";

export default function BizSetup() {
  const navigate = useNavigate();
  const me = getAuthedStaff();

  const [step, setStep] = useState<Step>("setup");
  const [origin, setOrigin] = useState<"company" | "home">("company");
  const [destination, setDestination] = useState<"company" | "home">("company");
  const [openCity, setOpenCity] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [self, setSelf] = useState<Staff | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [route, setRoute] = useState<TimelineRoute | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [routeStops, setRouteStops] = useState<Customer[]>([]); // 已排序好的停靠站，供地圖使用
  const [directions, setDirections] = useState<{
    legs: { refId?: string; distanceText: string; durationText: string; steps: { instruction: string; distanceText: string; durationText: string }[] }[];
    overviewPolyline: string;
  } | null>(null);
  const [directionsError, setDirectionsError] = useState<string | null>(null);
  const [showSteps, setShowSteps] = useState(false);

  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({ code: "", name: "", address: "", phone: "", isPriority: false });
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  useEffect(() => {
    if (!me) {
      navigate("/login");
      return;
    }
    (async () => {
      try {
        const [customerList, staffList, s] = await Promise.all([api.getCustomers(), api.getStaff(), api.getSettings()]);
        setCustomers(customerList);
        setSelf(staffList.find((s: Staff) => s.id === me.id) ?? null);
        setSettings(s);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // 業務人員若有指定可選縣市範圍，勾選客戶時只能看到範圍內的縣市；沒設定範圍＝不限制
  const allowedCities = self?.salesRegions && self.salesRegions.length > 0 ? new Set(self.salesRegions) : null;

  const cities = useMemo(() => {
    const m: Record<string, Customer[]> = {};
    customers
      .filter((c) => !search || c.code.includes(search) || c.name.includes(search))
      .filter((c) => !allowedCities || allowedCities.has(c.city))
      .forEach((c) => {
        (m[c.city] = m[c.city] || []).push(c);
      });
    return Object.entries(m).sort(([a], [b]) => cityOrderIndex(a) - cityOrderIndex(b));
  }, [customers, search, self]);

  const toggle = (id: string) => {
    const s = new Set(selected);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelected(s);
  };

  async function handleAddCustomer(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    setAddError(null);
    try {
      const newCustomer = await api.createCustomer(addForm);
      const updated = await api.getCustomers();
      setCustomers(updated);
      setSelected((prev) => new Set(prev).add(newCustomer.id));
      setOpenCity(newCustomer.city);
      setAddForm({ code: "", name: "", address: "", phone: "", isPriority: false });
      setShowAddForm(false);
    } catch (err) {
      setAddError((err as Error).message);
    } finally {
      setAdding(false);
    }
  }

  const originPoint =
    origin === "company"
      ? { lat: settings?.companyLat, lng: settings?.companyLng }
      : { lat: self?.homeLat, lng: self?.homeLng };
  const destPoint =
    destination === "company"
      ? { lat: settings?.companyLat, lng: settings?.companyLng }
      : { lat: self?.homeLat, lng: self?.homeLng };
  const originLabel = origin === "company" ? "公司" : "住家";
  const destLabel = destination === "company" ? "公司" : "住家";

  async function handleGenerateRoute() {
    setStep("route");
    setRouteLoading(true);
    setRouteError(null);
    setDirections(null);
    setDirectionsError(null);
    try {
      if (originPoint.lat == null || originPoint.lng == null || destPoint.lat == null || destPoint.lng == null) {
        throw new Error("出發地或目的地缺少座標，請確認公司設定與員工住家地址是否已 geocode");
      }
      const originCoords = { lat: originPoint.lat, lng: originPoint.lng };
      const destCoords = { lat: destPoint.lat, lng: destPoint.lng };
      const stops = customers.filter((c) => selected.has(c.id) && c.lat != null && c.lng != null);
      const result = await api.optimizeRoute({
        origin: originCoords,
        destination: destCoords,
        stops: stops.map((c) => ({ refId: c.id, lat: c.lat, lng: c.lng, isPriority: c.isPriority })),
      });
      const byId = new Map(stops.map((c) => [c.id, c]));
      const orderedCustomers = result.orderedStopRefIds.map((id) => byId.get(id)!);
      setRouteStops(orderedCustomers);
      setRoute({
        stops: result.legs.map((leg) => {
          const c = byId.get(leg.refId)!;
          return {
            refId: c.id,
            name: c.name,
            subtitle: c.address,
            isPriority: c.isPriority,
            legDistanceKm: leg.legDistanceKm,
            legDurationMin: leg.legDurationMin,
          };
        }),
        finalLegDistanceKm: result.finalLegDistanceKm,
        finalLegDurationMin: result.finalLegDurationMin,
        totalDistanceKm: result.totalDistanceKm,
        totalDurationMin: result.totalDurationMin,
      });
      setRouteLoading(false);

      // 真實 Google 導航路線（地圖＋逐步街名指示）為加分資訊，失敗不影響上面的路線結果顯示
      try {
        const dirResult = await api.getDirections({
          origin: originCoords,
          destination: destCoords,
          stops: orderedCustomers.map((c) => ({ refId: c.id, lat: c.lat, lng: c.lng })),
        });
        if (dirResult) setDirections(dirResult);
      } catch (err) {
        setDirectionsError((err as Error).message);
      }
    } catch (err) {
      setRouteError((err as Error).message);
      setRouteLoading(false);
    }
  }

  if (loading) {
    return <div className="p-6 text-center text-[13px]" style={{ color: C.muted }}>載入中…</div>;
  }
  if (error) {
    return <div className="p-6 text-center text-[13px]" style={{ color: C.danger }}>{error}</div>;
  }

  if (step === "setup") {
    return (
      <div>
        <TopBar title="業務模式" accent={C.bizAccent} onBack={() => navigate("/")} />
        <div className="p-4">
          <div style={{ fontFamily: "'Noto Sans TC', sans-serif", color: C.muted }} className="text-[12px] font-bold mb-2">
            出發地
          </div>
          <div className="flex gap-2 mb-4">
            <OriginCard icon={Building2} label="公司" sub={settings?.companyAddress ?? "未設定"} active={origin === "company"} accent={C.bizAccent} onClick={() => setOrigin("company")} />
            <OriginCard icon={Home} label="住家" sub={self?.homeAddress ?? "未設定"} active={origin === "home"} accent={C.bizAccent} onClick={() => setOrigin("home")} />
          </div>
          <div style={{ fontFamily: "'Noto Sans TC', sans-serif", color: C.muted }} className="text-[12px] font-bold mb-2">
            目的地
          </div>
          <div className="flex gap-2 mb-6">
            <OriginCard icon={Building2} label="公司" sub={settings?.companyAddress ?? "未設定"} active={destination === "company"} accent={C.bizAccent} onClick={() => setDestination("company")} />
            <OriginCard icon={Home} label="住家" sub={self?.homeAddress ?? "未設定"} active={destination === "home"} accent={C.bizAccent} onClick={() => setDestination("home")} />
          </div>
          <button onClick={() => setStep("select")} style={{ background: C.bizAccent }} className="w-full text-white font-bold text-[14px] py-3 rounded-xl">
            下一步：勾選今日客戶
          </button>
        </div>
      </div>
    );
  }

  if (step === "select") {
    return (
      <div>
        <TopBar title="勾選今日客戶" accent={C.bizAccent} onBack={() => setStep("setup")} />
        <div className="px-4 pt-3 pb-2">
          <div className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: "#fff", border: `1px solid ${C.hairline}` }}>
            <Search size={15} color={C.muted} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜尋客戶編號或名稱"
              className="flex-1 outline-none text-[13px]"
              style={{ color: C.text }}
            />
          </div>
          {allowedCities && (
            <div style={{ color: C.muted }} className="text-[11px] mt-1.5">
              你的業務範圍：{Array.from(allowedCities).join("、")}
            </div>
          )}
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="w-full flex items-center justify-center gap-1.5 mt-2 py-2 rounded-xl text-[12px] font-bold"
            style={{ color: C.bizAccent, border: `1px dashed ${C.bizAccent}` }}
          >
            <Plus size={14} /> {showAddForm ? "取消新增" : "新增客戶"}
          </button>
          {showAddForm && (
            <form onSubmit={handleAddCustomer} className="rounded-xl p-3 mt-2" style={{ background: "#fff", border: `1px solid ${C.hairline}` }}>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <input
                  required
                  placeholder="客戶編號"
                  value={addForm.code}
                  onChange={(e) => setAddForm({ ...addForm, code: e.target.value })}
                  className="px-2 py-1.5 rounded text-[12px]"
                  style={{ border: `1px solid ${C.hairline}` }}
                />
                <input
                  required
                  placeholder="客戶名稱"
                  value={addForm.name}
                  onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                  className="px-2 py-1.5 rounded text-[12px]"
                  style={{ border: `1px solid ${C.hairline}` }}
                />
              </div>
              <input
                required
                placeholder="住址"
                value={addForm.address}
                onChange={(e) => setAddForm({ ...addForm, address: e.target.value })}
                className="w-full mb-2 px-2 py-1.5 rounded text-[12px]"
                style={{ border: `1px solid ${C.hairline}` }}
              />
              <div className="flex items-center gap-3 mb-2">
                <input
                  placeholder="電話"
                  value={addForm.phone}
                  onChange={(e) => setAddForm({ ...addForm, phone: e.target.value })}
                  className="flex-1 px-2 py-1.5 rounded text-[12px]"
                  style={{ border: `1px solid ${C.hairline}` }}
                />
                <label className="flex items-center gap-1 text-[12px]" style={{ color: C.muted }}>
                  <input type="checkbox" checked={addForm.isPriority} onChange={(e) => setAddForm({ ...addForm, isPriority: e.target.checked })} /> 優先客戶
                </label>
              </div>
              {addError && (
                <div className="text-[11px] mb-2" style={{ color: C.danger }}>
                  {addError}
                </div>
              )}
              <button
                type="submit"
                disabled={adding}
                style={{ background: C.bizAccent }}
                className="w-full text-white text-[12px] font-bold px-3 py-2 rounded-lg disabled:opacity-60"
              >
                {adding ? "新增中…" : "新增並勾選"}
              </button>
            </form>
          )}
        </div>
        <div className="px-4 pb-28">
          {cities.map(([city, list]) => (
            <div key={city} className="mb-2 rounded-xl overflow-hidden" style={{ border: `1px solid ${C.hairline}`, background: "#fff" }}>
              <button onClick={() => setOpenCity(openCity === city ? null : city)} className="w-full flex items-center justify-between px-3 py-3">
                <div style={{ fontFamily: "'Noto Sans TC', sans-serif" }} className="font-bold text-[14px] flex items-center gap-2">
                  <MapPin size={15} color={C.bizAccent} /> {city}
                  <span style={{ color: C.muted, fontFamily: "Manrope" }} className="text-[11px] font-medium">
                    ({list.filter((c) => selected.has(c.id)).length}/{list.length})
                  </span>
                </div>
                {openCity === city ? <ChevronDown size={17} color={C.muted} /> : <ChevronRight size={17} color={C.muted} />}
              </button>
              {openCity === city && (
                <div>
                  {[...list]
                    .sort((a, b) => a.code.localeCompare(b.code))
                    .map((c) => (
                      <button key={c.id} onClick={() => toggle(c.id)} className="w-full flex items-center gap-3 px-3 py-2.5 border-t" style={{ borderColor: C.hairline }}>
                        <div
                          className="flex items-center justify-center rounded-md shrink-0"
                          style={{ width: 20, height: 20, border: `2px solid ${selected.has(c.id) ? C.bizAccent : C.hairline}`, background: selected.has(c.id) ? C.bizAccent : "transparent" }}
                        >
                          {selected.has(c.id) && <Check size={13} color="#fff" strokeWidth={3} />}
                        </div>
                        <div className="flex-1 text-left">
                          <div className="flex items-center gap-1.5">
                            <span style={{ fontFamily: "Manrope", color: C.muted }} className="text-[11px] font-bold">
                              {c.code}
                            </span>
                            <span style={{ fontFamily: "'Noto Sans TC', sans-serif" }} className="font-semibold text-[13px]">
                              {c.name}
                            </span>
                            {c.isPriority && <PriorityTag />}
                          </div>
                          <div style={{ color: C.muted }} className="text-[11px] mt-0.5">
                            {c.address}
                          </div>
                        </div>
                      </button>
                    ))}
                </div>
              )}
            </div>
          ))}
          {cities.length === 0 && (
            <div className="text-center text-[13px] py-8" style={{ color: C.muted }}>
              尚無客戶資料，請先到內勤後台匯入客戶
            </div>
          )}
        </div>
        <div className="fixed bottom-0 left-0 right-0 max-w-[420px] mx-auto p-4" style={{ background: "linear-gradient(to top, #F2F4F7 70%, transparent)" }}>
          <button
            onClick={handleGenerateRoute}
            disabled={selected.size === 0}
            style={{ background: selected.size ? C.bizAccent : "#B9C2D0" }}
            className="w-full text-white font-bold text-[14px] py-3 rounded-xl shadow-lg flex items-center justify-center gap-2"
          >
            <RouteIcon size={16} /> 產生路線（已選 {selected.size} 位客戶）
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <TopBar title="路線結果" accent={C.bizAccent} onBack={() => setStep("select")} />
      <div className="p-4">
        {routeLoading && <div className="text-center text-[13px] py-8" style={{ color: C.muted }}>路線計算中…</div>}
        {routeError && <div className="text-center text-[13px] py-4" style={{ color: C.danger }}>{routeError}</div>}
        {route && (
          <>
            <div className="rounded-xl p-3 mb-4 flex items-center justify-between" style={{ background: C.bizAccentSoft }}>
              <div>
                <div style={{ fontFamily: "'Noto Sans TC', sans-serif", color: C.navy }} className="text-[12px] font-bold">
                  今日總距離
                </div>
                {route.totalDurationMin != null && (
                  <div style={{ color: C.muted }} className="text-[11px] mt-0.5">
                    預估車程約 {Math.round(route.totalDurationMin)} 分鐘
                  </div>
                )}
              </div>
              <div style={{ fontFamily: "Manrope", color: C.bizAccent }} className="text-[18px] font-extrabold">
                {route.totalDistanceKm.toFixed(1)} km
              </div>
            </div>

            {directions && (
              <div className="mb-4">
                <RouteMap
                  origin={{ lat: originPoint.lat!, lng: originPoint.lng!, title: originLabel }}
                  destination={{ lat: destPoint.lat!, lng: destPoint.lng!, title: destLabel }}
                  stops={routeStops.map((c, i) => ({ lat: c.lat!, lng: c.lng!, label: String(i + 1), title: c.name, isPriority: c.isPriority }))}
                  overviewPolyline={directions.overviewPolyline}
                  accent={C.bizAccent}
                />
              </div>
            )}
            {directionsError && (
              <div className="text-[11px] mb-4 text-center" style={{ color: C.muted }}>
                地圖與街道導航暫時無法顯示（{directionsError}），僅顯示估算距離
              </div>
            )}

            <RouteTimeline originLabel={originLabel} destinationLabel={destLabel} route={route} showProducts={false} accent={C.bizAccent} />

            {directions && (
              <button
                onClick={() => setShowSteps(!showSteps)}
                className="w-full text-center text-[12px] font-bold mt-3 py-2 rounded-xl"
                style={{ color: C.bizAccent, border: `1px solid ${C.bizAccentSoft}` }}
              >
                {showSteps ? "收合詳細路線 ▲" : "查看詳細路線（街名／每段所需時間） ▼"}
              </button>
            )}
            {showSteps && directions && (
              <div className="mt-3 space-y-3">
                {directions.legs.map((leg, li) => (
                  <div key={li} className="rounded-xl p-3" style={{ background: "#fff", border: `1px solid ${C.hairline}` }}>
                    <div className="flex items-center justify-between mb-2">
                      <div style={{ fontFamily: "'Noto Sans TC', sans-serif" }} className="font-bold text-[12px]">
                        第 {li + 1} 段：{li === 0 ? originLabel : routeStops[li - 1]?.name} → {li === directions.legs.length - 1 ? destLabel : routeStops[li]?.name}
                      </div>
                      <div style={{ color: C.muted, fontFamily: "Manrope" }} className="text-[11px] font-bold shrink-0 ml-2">
                        {leg.distanceText} ・ {leg.durationText}
                      </div>
                    </div>
                    <ol className="space-y-1.5">
                      {leg.steps.map((step, si) => (
                        <li key={si} className="flex items-start gap-2 text-[11px]" style={{ color: C.text }}>
                          <span style={{ color: C.muted, fontFamily: "Manrope" }} className="shrink-0 font-bold">
                            {si + 1}.
                          </span>
                          <span className="flex-1">{step.instruction}</span>
                          <span style={{ color: C.muted }} className="shrink-0">
                            {step.distanceText}
                          </span>
                        </li>
                      ))}
                    </ol>
                  </div>
                ))}
              </div>
            )}

            <ActionRow
              accent={C.bizAccent}
              onNavigate={() => {
                if (originPoint.lat == null || originPoint.lng == null || destPoint.lat == null || destPoint.lng == null) return;
                const url = buildNavigationUrl(
                  { lat: originPoint.lat, lng: originPoint.lng },
                  { lat: destPoint.lat, lng: destPoint.lng },
                  routeStops.map((c) => ({ lat: c.lat!, lng: c.lng! }))
                );
                window.open(url, "_blank");
              }}
            />
          </>
        )}
        <button onClick={() => setStep("select")} className="w-full text-center text-[12px] font-bold mt-3 py-2" style={{ color: C.muted }}>
          ← 重新勾選客戶或調整路線
        </button>
      </div>
    </div>
  );
}
