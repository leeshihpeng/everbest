import React, { useState, useMemo } from "react";
import {
  MapPin, Star, Truck, User, Users, Package, Navigation2, Share2,
  CheckCircle2, ChevronDown, ChevronRight, ArrowLeft, Building2, Home,
  Route as RouteIcon, Bell, Search, Circle, Check
} from "lucide-react";

/* ---------------------------------------------------------------
   設計 tokens
--------------------------------------------------------------- */
const C = {
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
};

const fontImport = `
@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@500;700;800&family=Noto+Sans+TC:wght@400;500;700;900&display=swap');
`;

/* ---------------------------------------------------------------
   Mock 資料：客戶（依縣市，含虛擬座標供路線試算）
--------------------------------------------------------------- */
const CITY_BASE = {
  "台北市": { x: 122, y: 42 },
  "新北市": { x: 108, y: 58 },
  "桃園市": { x: 90, y: 74 },
  "台中市": { x: 58, y: 118 },
};

const seedCustomers = [
  { id: "C001", name: "永安五金行", city: "台北市", addr: "台北市大安區敦化南路 123 號", phone: "02-2711-1234", priority: true, x: 124, y: 40 },
  { id: "C002", name: "祥發餐飲有限公司", city: "台北市", addr: "台北市信義區松仁路 58 號", phone: "02-2758-2222", priority: false, x: 128, y: 45 },
  { id: "C003", name: "大山超商", city: "台北市", addr: "台北市士林區中山北路 6 段 12 號", phone: "02-2831-5566", priority: false, x: 118, y: 30 },
  { id: "C004", name: "誠信百貨", city: "新北市", addr: "新北市板橋區文化路 88 號", phone: "02-2965-7788", priority: true, x: 106, y: 60 },
  { id: "C005", name: "永盛五金材料行", city: "新北市", addr: "新北市三重區重新路 200 號", phone: "02-2977-3344", priority: false, x: 100, y: 50 },
  { id: "C006", name: "喜互惠超市", city: "新北市", addr: "新北市中和區中山路 3 段 66 號", phone: "02-2942-9911", priority: false, x: 112, y: 68 },
  { id: "C007", name: "全興機械行", city: "桃園市", addr: "桃園市桃園區中正路 300 號", phone: "03-333-4455", priority: false, x: 92, y: 76 },
  { id: "C008", name: "桃園日式料理", city: "桃園市", addr: "桃園市中壢區中山東路 150 號", phone: "03-422-1188", priority: true, x: 86, y: 82 },
  { id: "C009", name: "台中精機工業社", city: "台中市", addr: "台中市西屯區台灣大道 3 段 99 號", phone: "04-2255-6677", priority: false, x: 56, y: 116 },
  { id: "C010", name: "龍門五金", city: "台中市", addr: "台中市北屯區崇德路 2 段 55 號", phone: "04-2439-8877", priority: false, x: 62, y: 108 },
  { id: "C011", name: "福星食品行", city: "台中市", addr: "台中市南屯區文心南路 88 號", phone: "04-2473-6655", priority: false, x: 52, y: 124 },
];

const seedStaff = [
  { id: "S1", name: "陳建宏", role: "業務人員", homeX: 116, homeY: 44, home: "台北市中山區林森北路 88 號" },
  { id: "S2", name: "林美惠", role: "物流主管", homeX: 110, homeY: 56, home: "新北市新莊區中正路 120 號" },
  { id: "S3", name: "黃志偉", role: "送貨人員", homeX: 104, homeY: 64, home: "新北市板橋區民生路 45 號" },
];

const COMPANY = { name: "公司", x: 120, y: 45, addr: "台北市內湖區瑞光路 399 號" };

const seedOrders = [
  { id: "O1001", date: "今日", code: "C004", name: "誠信百貨", addr: "新北市板橋區文化路 88 號", phone: "02-2965-7788", x: 106, y: 60, products: [{ n: "礦泉水 600ml", q: 48 }, { n: "沙拉油 3L", q: 12 }], status: "待處理" },
  { id: "O1002", date: "今日", code: "C005", name: "永盛五金材料行", addr: "新北市三重區重新路 200 號", phone: "02-2977-3344", x: 100, y: 50, products: [{ n: "螺絲組合包", q: 30 }], status: "待處理" },
  { id: "O1003", date: "今日", code: "C007", name: "全興機械行", addr: "桃園市桃園區中正路 300 號", phone: "03-333-4455", x: 92, y: 76, products: [{ n: "潤滑油 5L", q: 8 }, { n: "工業手套", q: 20 }], status: "待處理" },
  { id: "O1004", date: "今日", code: "C008", name: "桃園日式料理", addr: "桃園市中壢區中山東路 150 號", phone: "03-422-1188", x: 86, y: 82, products: [{ n: "生鮮鮭魚", q: 15 }, { n: "醬油 1L", q: 10 }], status: "待處理" },
  { id: "O1005", date: "今日", code: "C006", name: "喜互惠超市", addr: "新北市中和區中山路 3 段 66 號", phone: "02-2942-9911", x: 112, y: 68, products: [{ n: "洗衣精 2L", q: 24 }], status: "待處理" },
];

/* ---------------------------------------------------------------
   工具函式
--------------------------------------------------------------- */
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) * 1.85; // 換算成公里的假比例尺

function nearestNeighborRoute(startPoint, points) {
  const remaining = [...points];
  const ordered = [];
  let cur = startPoint;
  while (remaining.length) {
    let bi = 0, bd = Infinity;
    remaining.forEach((p, i) => {
      const d = dist(cur, p);
      if (d < bd) { bd = d; bi = i; }
    });
    const chosen = remaining.splice(bi, 1)[0];
    ordered.push({ ...chosen, legDistance: bd });
    cur = chosen;
  }
  return ordered;
}

function buildRoute(origin, destination, stops) {
  const priority = stops.filter(s => s.priority);
  const normal = stops.filter(s => !s.priority);
  const orderedPriority = nearestNeighborRoute(origin, priority);
  const lastPoint = orderedPriority.length ? orderedPriority[orderedPriority.length - 1] : origin;
  const orderedNormal = nearestNeighborRoute(lastPoint, normal);
  const full = [...orderedPriority, ...orderedNormal];
  const finalLeg = dist(full.length ? full[full.length - 1] : origin, destination);
  const total = full.reduce((s, p) => s + p.legDistance, 0) + finalLeg;
  return { stops: full, finalLeg, total };
}

/* ---------------------------------------------------------------
   共用元件
--------------------------------------------------------------- */
function TopBar({ title, accent, onBack, right }) {
  return (
    <div style={{ background: accent, color: "#fff" }} className="flex items-center gap-2 px-4 pt-5 pb-4 rounded-b-2xl shadow-sm">
      {onBack && (
        <button onClick={onBack} className="p-1 -ml-1 rounded-full active:bg-white/15">
          <ArrowLeft size={20} />
        </button>
      )}
      <div className="flex-1 font-bold text-[16px]" style={{ fontFamily: "'Noto Sans TC', sans-serif" }}>{title}</div>
      {right}
    </div>
  );
}

function PriorityTag() {
  return (
    <span style={{ background: C.goldSoft, color: C.gold, fontFamily: "'Noto Sans TC', sans-serif" }}
      className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded">
      <Star size={10} fill={C.gold} strokeWidth={0} /> 優先
    </span>
  );
}

function Pill({ children, active, onClick, accent }) {
  return (
    <button onClick={onClick}
      style={active ? { background: accent, color: "#fff", borderColor: accent } : { color: C.muted, borderColor: C.hairline }}
      className="px-3 py-1.5 rounded-full text-[12px] font-medium border transition-colors"
      >{children}</button>
  );
}

/* ---------------------------------------------------------------
   路線結果（時間軸元件）— 本 app 的簽名視覺元素
--------------------------------------------------------------- */
function RouteTimeline({ originLabel, destinationLabel, route, showProducts }) {
  const nodes = [
    { kind: "origin", label: originLabel },
    ...route.stops.map(s => ({ kind: "stop", data: s })),
    { kind: "destination", label: destinationLabel, leg: route.finalLeg },
  ];
  return (
    <div className="relative pl-7">
      <div className="absolute left-[11px] top-2 bottom-2 w-[2px]" style={{ background: C.hairline }} />
      {nodes.map((n, i) => {
        const isEnd = n.kind === "origin" || n.kind === "destination";
        const isPriority = n.kind === "stop" && n.data.priority;
        return (
          <div key={i} className="relative mb-4 last:mb-0">
            <div className="absolute -left-7 top-0.5 flex items-center justify-center rounded-full"
              style={{
                width: 22, height: 22,
                background: isEnd ? C.navy : isPriority ? C.gold : "#fff",
                border: isEnd ? "none" : `2px solid ${isPriority ? C.gold : C.bizAccent}`,
              }}>
              {isEnd ? <Building2 size={12} color="#fff" /> : isPriority ? <Star size={11} color="#fff" fill="#fff" /> : <span style={{ color: C.bizAccent, fontFamily: "Manrope", fontWeight: 800, fontSize: 10 }}>{i}</span>}
            </div>
            <div className="rounded-xl px-3 py-2.5" style={{ background: isEnd ? C.bg : C.surface, border: `1px solid ${C.hairline}` }}>
              {n.kind === "stop" ? (
                <>
                  <div className="flex items-center justify-between">
                    <div style={{ fontFamily: "'Noto Sans TC', sans-serif" }} className="font-bold text-[14px]" >{n.data.name}</div>
                    {n.data.priority && <PriorityTag />}
                  </div>
                  <div style={{ color: C.muted }} className="text-[12px] mt-0.5">{n.data.addr || n.data.city}</div>
                  {showProducts && n.data.products && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {n.data.products.map((p, pi) => (
                        <span key={pi} style={{ background: C.logiAccentSoft, color: C.logiAccent }} className="text-[11px] px-1.5 py-0.5 rounded">{p.n} ×{p.q}</span>
                      ))}
                    </div>
                  )}
                  <div style={{ fontFamily: "Manrope", color: C.bizAccent }} className="text-[11px] font-bold mt-1">
                    距上一站 {n.data.legDistance.toFixed(1)} km
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-between">
                  <div style={{ fontFamily: "'Noto Sans TC', sans-serif" }} className="font-bold text-[13px]">{n.label}</div>
                  {n.kind === "destination" && <div style={{ fontFamily: "Manrope", color: C.muted }} className="text-[11px] font-bold">{n.leg.toFixed(1)} km</div>}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ActionRow({ accent }) {
  const [shared, setShared] = useState(false);
  return (
    <div className="flex gap-2 mt-4">
      <button style={{ background: accent }} className="flex-1 flex items-center justify-center gap-1.5 text-white text-[13px] font-bold py-2.5 rounded-xl active:opacity-90">
        <Navigation2 size={15} /> 開始導航
      </button>
      <button onClick={() => setShared(true)}
        style={{ background: shared ? "#EDEFF2" : "#fff", border: `1px solid ${C.hairline}`, color: shared ? C.muted : C.text }}
        className="flex-1 flex items-center justify-center gap-1.5 text-[13px] font-bold py-2.5 rounded-xl active:opacity-80">
        <Share2 size={15} /> {shared ? "已分享至 LINE" : "分享到 LINE 群組"}
      </button>
    </div>
  );
}

/* ---------------------------------------------------------------
   業務模式
--------------------------------------------------------------- */
function BizMode({ onExit }) {
  const [step, setStep] = useState("setup"); // setup -> select -> route
  const [origin, setOrigin] = useState("company");
  const [destination, setDestination] = useState("company");
  const [openCity, setOpenCity] = useState("台北市");
  const [selected, setSelected] = useState(new Set(["C001", "C004", "C008"]));
  const staff = seedStaff[0];

  const cities = useMemo(() => {
    const m = {};
    seedCustomers.forEach(c => { (m[c.city] = m[c.city] || []).push(c); });
    return m;
  }, []);

  const toggle = (id) => {
    const s = new Set(selected);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelected(s);
  };

  const originPoint = origin === "company" ? COMPANY : { x: staff.homeX, y: staff.homeY };
  const destPoint = destination === "company" ? COMPANY : { x: staff.homeX, y: staff.homeY };
  const originLabel = origin === "company" ? "公司" : "住家";
  const destLabel = destination === "company" ? "公司" : "住家";

  const stops = seedCustomers.filter(c => selected.has(c.id));
  const route = useMemo(() => buildRoute(originPoint, destPoint, stops),
    [origin, destination, selected]); // eslint-disable-line

  if (step === "setup") {
    return (
      <div>
        <TopBar title="業務模式" accent={C.bizAccent} onBack={onExit} />
        <div className="p-4">
          <div style={{ fontFamily: "'Noto Sans TC', sans-serif", color: C.muted }} className="text-[12px] font-bold mb-2">出發地</div>
          <div className="flex gap-2 mb-4">
            <OriginCard icon={Building2} label="公司" sub={COMPANY.addr} active={origin === "company"} accent={C.bizAccent} onClick={() => setOrigin("company")} />
            <OriginCard icon={Home} label="住家" sub={staff.home} active={origin === "home"} accent={C.bizAccent} onClick={() => setOrigin("home")} />
          </div>
          <div style={{ fontFamily: "'Noto Sans TC', sans-serif", color: C.muted }} className="text-[12px] font-bold mb-2">目的地</div>
          <div className="flex gap-2 mb-6">
            <OriginCard icon={Building2} label="公司" sub={COMPANY.addr} active={destination === "company"} accent={C.bizAccent} onClick={() => setDestination("company")} />
            <OriginCard icon={Home} label="住家" sub={staff.home} active={destination === "home"} accent={C.bizAccent} onClick={() => setDestination("home")} />
          </div>
          <button onClick={() => setStep("select")} style={{ background: C.bizAccent }} className="w-full text-white font-bold text-[14px] py-3 rounded-xl">下一步：勾選今日客戶</button>
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
            <span style={{ color: C.muted }} className="text-[13px]">搜尋客戶編號或名稱</span>
          </div>
        </div>
        <div className="px-4 pb-28">
          {Object.entries(cities).map(([city, list]) => (
            <div key={city} className="mb-2 rounded-xl overflow-hidden" style={{ border: `1px solid ${C.hairline}`, background: "#fff" }}>
              <button onClick={() => setOpenCity(openCity === city ? null : city)} className="w-full flex items-center justify-between px-3 py-3">
                <div style={{ fontFamily: "'Noto Sans TC', sans-serif" }} className="font-bold text-[14px] flex items-center gap-2">
                  <MapPin size={15} color={C.bizAccent} /> {city}
                  <span style={{ color: C.muted, fontFamily: "Manrope" }} className="text-[11px] font-medium">({list.filter(c => selected.has(c.id)).length}/{list.length})</span>
                </div>
                {openCity === city ? <ChevronDown size={17} color={C.muted} /> : <ChevronRight size={17} color={C.muted} />}
              </button>
              {openCity === city && (
                <div>
                  {list.sort((a, b) => a.id.localeCompare(b.id)).map(c => (
                    <button key={c.id} onClick={() => toggle(c.id)} className="w-full flex items-center gap-3 px-3 py-2.5 border-t" style={{ borderColor: C.hairline }}>
                      <div className="flex items-center justify-center rounded-md shrink-0" style={{ width: 20, height: 20, border: `2px solid ${selected.has(c.id) ? C.bizAccent : C.hairline}`, background: selected.has(c.id) ? C.bizAccent : "transparent" }}>
                        {selected.has(c.id) && <Check size={13} color="#fff" strokeWidth={3} />}
                      </div>
                      <div className="flex-1 text-left">
                        <div className="flex items-center gap-1.5">
                          <span style={{ fontFamily: "Manrope", color: C.muted }} className="text-[11px] font-bold">{c.id}</span>
                          <span style={{ fontFamily: "'Noto Sans TC', sans-serif" }} className="font-semibold text-[13px]">{c.name}</span>
                          {c.priority && <PriorityTag />}
                        </div>
                        <div style={{ color: C.muted }} className="text-[11px] mt-0.5">{c.addr}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="fixed bottom-0 left-0 right-0 max-w-[420px] mx-auto p-4" style={{ background: "linear-gradient(to top, #F2F4F7 70%, transparent)" }}>
          <button onClick={() => setStep("route")} disabled={selected.size === 0} style={{ background: selected.size ? C.bizAccent : "#B9C2D0" }} className="w-full text-white font-bold text-[14px] py-3 rounded-xl shadow-lg flex items-center justify-center gap-2">
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
        <div className="rounded-xl p-3 mb-4 flex items-center justify-between" style={{ background: C.bizAccentSoft }}>
          <div style={{ fontFamily: "'Noto Sans TC', sans-serif", color: C.navy }} className="text-[12px] font-bold">今日總距離</div>
          <div style={{ fontFamily: "Manrope", color: C.bizAccent }} className="text-[18px] font-extrabold">{route.total.toFixed(1)} km</div>
        </div>
        <RouteTimeline originLabel={originLabel} destinationLabel={destLabel} route={route} showProducts={false} />
        <ActionRow accent={C.bizAccent} />
        <button onClick={() => setStep("select")} className="w-full text-center text-[12px] font-bold mt-3 py-2" style={{ color: C.muted }}>← 重新勾選客戶或調整路線</button>
      </div>
    </div>
  );
}

function OriginCard({ icon: Icon, label, sub, active, accent, onClick }) {
  return (
    <button onClick={onClick} className="flex-1 text-left rounded-xl p-3"
      style={{ background: active ? accent : "#fff", border: `1px solid ${active ? accent : C.hairline}` }}>
      <div className="flex items-center gap-1.5">
        <Icon size={14} color={active ? "#fff" : C.text} />
        <span style={{ color: active ? "#fff" : C.text, fontFamily: "'Noto Sans TC', sans-serif" }} className="text-[13px] font-bold">{label}</span>
      </div>
      <div style={{ color: active ? "rgba(255,255,255,0.85)" : C.muted }} className="text-[10px] mt-1 leading-snug">{sub}</div>
    </button>
  );
}

/* ---------------------------------------------------------------
   物流模式 — 物流主管
--------------------------------------------------------------- */
function ManagerFlow({ onBack, onAssigned }) {
  const [selected, setSelected] = useState(new Set(["O1001", "O1004"]));
  const [priorityOverride, setPriorityOverride] = useState(new Set(["O1004"]));
  const [submitted, setSubmitted] = useState(false);

  const toggleSel = (id) => {
    const s = new Set(selected);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelected(s);
  };
  const togglePriority = (id) => {
    const s = new Set(priorityOverride);
    s.has(id) ? s.delete(id) : s.add(id);
    setPriorityOverride(s);
  };

  if (submitted) {
    const stops = seedOrders.filter(o => selected.has(o.id)).map(o => ({ ...o, priority: priorityOverride.has(o.id) }));
    const route = buildRoute(COMPANY, COMPANY, stops);
    return (
      <div>
        <TopBar title="已送出配送指派" accent={C.logiAccent} onBack={onBack} />
        <div className="p-4">
          <div className="rounded-xl p-3 mb-4 flex items-start gap-2" style={{ background: C.logiAccentSoft }}>
            <CheckCircle2 size={18} color={C.logiAccent} className="mt-0.5" />
            <div style={{ fontFamily: "'Noto Sans TC', sans-serif", color: C.navy }} className="text-[12px] font-medium leading-relaxed">
              已將 {selected.size} 筆派遣單狀態更新為「已勾選配送」，並產生預設路線順序，指派給送貨人員<b>黃志偉</b>。
            </div>
          </div>
          <div style={{ fontFamily: "'Noto Sans TC', sans-serif", color: C.muted }} className="text-[12px] font-bold mb-2">預設路線順序（公司 → 公司）</div>
          <RouteTimeline originLabel="公司" destinationLabel="公司" route={route} showProducts={true} />
          <button onClick={onBack} style={{ background: C.logiAccent }} className="w-full text-white font-bold text-[14px] py-3 rounded-xl mt-4">完成</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <TopBar title="派遣單勾選（物流主管）" accent={C.logiAccent} onBack={onBack} />
      <div className="px-4 pt-3 pb-2" style={{ color: C.muted, fontFamily: "'Noto Sans TC', sans-serif" }}>
        <div className="text-[12px]">待處理派遣單・今日</div>
      </div>
      <div className="px-4 pb-28">
        {seedOrders.map(o => {
          const isSel = selected.has(o.id);
          const isPriority = priorityOverride.has(o.id);
          return (
            <div key={o.id} className="mb-2 rounded-xl p-3" style={{ background: "#fff", border: `1px solid ${isSel ? C.logiAccent : C.hairline}` }}>
              <div className="flex items-start gap-3">
                <button onClick={() => toggleSel(o.id)} className="flex items-center justify-center rounded-md shrink-0 mt-0.5" style={{ width: 20, height: 20, border: `2px solid ${isSel ? C.logiAccent : C.hairline}`, background: isSel ? C.logiAccent : "transparent" }}>
                  {isSel && <Check size={13} color="#fff" strokeWidth={3} />}
                </button>
                <div className="flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span style={{ fontFamily: "Manrope", color: C.muted }} className="text-[11px] font-bold">{o.code}</span>
                    <span style={{ fontFamily: "'Noto Sans TC', sans-serif" }} className="font-semibold text-[13px]">{o.name}</span>
                  </div>
                  <div style={{ color: C.muted }} className="text-[11px] mt-0.5">{o.addr}</div>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {o.products.map((p, pi) => (
                      <span key={pi} style={{ background: C.bg, color: C.text }} className="text-[11px] px-1.5 py-0.5 rounded">{p.n} ×{p.q}</span>
                    ))}
                  </div>
                  {isSel && (
                    <button onClick={() => togglePriority(o.id)} className="mt-2 flex items-center gap-1">
                      <div className="flex items-center justify-center rounded" style={{ width: 16, height: 16, border: `2px solid ${isPriority ? C.gold : C.hairline}`, background: isPriority ? C.gold : "transparent" }}>
                        {isPriority && <Check size={11} color="#fff" strokeWidth={3} />}
                      </div>
                      <span style={{ color: isPriority ? C.gold : C.muted, fontFamily: "'Noto Sans TC', sans-serif" }} className="text-[11px] font-bold">標記為優先客戶（本次配送）</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="fixed bottom-0 left-0 right-0 max-w-[420px] mx-auto p-4" style={{ background: "linear-gradient(to top, #F2F4F7 70%, transparent)" }}>
        <button onClick={() => setSubmitted(true)} disabled={selected.size === 0} style={{ background: selected.size ? C.logiAccent : "#B9C2D0" }} className="w-full text-white font-bold text-[14px] py-3 rounded-xl shadow-lg">
          送出（已選 {selected.size} 筆・指派送貨人員並產生路線）
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------
   物流模式 — 送貨人員
--------------------------------------------------------------- */
function DriverFlow({ onBack }) {
  const [origin, setOrigin] = useState("company");
  const [destination, setDestination] = useState("company");
  const [selected, setSelected] = useState(new Set(["O1001", "O1004"]));
  const [completed, setCompleted] = useState(new Set());
  const staff = seedStaff[2];

  const originPoint = origin === "company" ? COMPANY : { x: staff.homeX, y: staff.homeY };
  const destPoint = destination === "company" ? COMPANY : { x: staff.homeX, y: staff.homeY };

  const assignedOrders = seedOrders.filter(o => selected.has(o.id)).map(o => ({ ...o, priority: o.id === "O1004" }));
  const route = useMemo(() => buildRoute(originPoint, destPoint, assignedOrders), [origin, destination, selected]); // eslint-disable-line

  const toggleDone = (id) => {
    const s = new Set(completed);
    s.has(id) ? s.delete(id) : s.add(id);
    setCompleted(s);
  };

  return (
    <div>
      <TopBar title="今日配送名單（送貨人員）" accent={C.logiAccent} onBack={onBack} right={
        <button className="relative p-1">
          <Bell size={18} />
          <span style={{ background: C.danger }} className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full" />
        </button>
      } />
      <div className="p-4">
        <div style={{ fontFamily: "'Noto Sans TC', sans-serif", color: C.muted }} className="text-[12px] font-bold mb-2">出發地／目的地（可調整）</div>
        <div className="flex gap-2 mb-2">
          <Pill accent={C.logiAccent} active={origin === "company"} onClick={() => setOrigin("company")}>出發：公司</Pill>
          <Pill accent={C.logiAccent} active={origin === "home"} onClick={() => setOrigin("home")}>出發：住家</Pill>
        </div>
        <div className="flex gap-2 mb-4">
          <Pill accent={C.logiAccent} active={destination === "company"} onClick={() => setDestination("company")}>目的：公司</Pill>
          <Pill accent={C.logiAccent} active={destination === "home"} onClick={() => setDestination("home")}>目的：住家</Pill>
        </div>

        <div className="rounded-xl p-3 mb-4 flex items-center justify-between" style={{ background: C.logiAccentSoft }}>
          <div style={{ fontFamily: "'Noto Sans TC', sans-serif", color: C.navy }} className="text-[12px] font-bold">今日配送總距離</div>
          <div style={{ fontFamily: "Manrope", color: C.logiAccent }} className="text-[18px] font-extrabold">{route.total.toFixed(1)} km</div>
        </div>

        <RouteTimeline originLabel={origin === "company" ? "公司" : "住家"} destinationLabel={destination === "company" ? "公司" : "住家"} route={route} showProducts={true} />

        <div style={{ fontFamily: "'Noto Sans TC', sans-serif", color: C.muted }} className="text-[12px] font-bold mt-4 mb-2">配送完成標記</div>
        {assignedOrders.map(o => (
          <button key={o.id} onClick={() => toggleDone(o.id)} className="w-full flex items-center gap-2 rounded-xl px-3 py-2 mb-2" style={{ background: "#fff", border: `1px solid ${C.hairline}` }}>
            <div className="flex items-center justify-center rounded-md" style={{ width: 18, height: 18, border: `2px solid ${completed.has(o.id) ? C.logiAccent : C.hairline}`, background: completed.has(o.id) ? C.logiAccent : "transparent" }}>
              {completed.has(o.id) && <Check size={12} color="#fff" strokeWidth={3} />}
            </div>
            <span style={{ fontFamily: "'Noto Sans TC', sans-serif", textDecoration: completed.has(o.id) ? "line-through" : "none", color: completed.has(o.id) ? C.muted : C.text }} className="text-[13px] font-semibold flex-1 text-left">{o.name}</span>
            <span style={{ color: completed.has(o.id) ? C.logiAccent : C.muted, fontFamily: "'Noto Sans TC', sans-serif" }} className="text-[11px] font-bold">{completed.has(o.id) ? "已完成" : "待完成"}</span>
          </button>
        ))}

        <ActionRow accent={C.logiAccent} />
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------
   物流模式入口 — 依角色分流
--------------------------------------------------------------- */
function LogisticsMode({ onExit }) {
  const [role, setRole] = useState(null);
  if (role === "manager") return <ManagerFlow onBack={() => setRole(null)} />;
  if (role === "driver") return <DriverFlow onBack={() => setRole(null)} />;
  return (
    <div>
      <TopBar title="物流模式" accent={C.logiAccent} onBack={onExit} />
      <div className="p-4">
        <div style={{ fontFamily: "'Noto Sans TC', sans-serif", color: C.muted }} className="text-[12px] font-bold mb-3">選擇登入角色（示意，實務由帳號角色自動判斷）</div>
        <button onClick={() => setRole("manager")} className="w-full flex items-center gap-3 rounded-xl p-4 mb-3" style={{ background: "#fff", border: `1px solid ${C.hairline}` }}>
          <div className="rounded-full flex items-center justify-center" style={{ width: 40, height: 40, background: C.logiAccentSoft }}>
            <Users size={19} color={C.logiAccent} />
          </div>
          <div className="text-left">
            <div style={{ fontFamily: "'Noto Sans TC', sans-serif" }} className="font-bold text-[14px]">物流主管</div>
            <div style={{ color: C.muted }} className="text-[11px]">林美惠・派遣單勾選與優先標記</div>
          </div>
          <ChevronRight size={17} color={C.muted} className="ml-auto" />
        </button>
        <button onClick={() => setRole("driver")} className="w-full flex items-center gap-3 rounded-xl p-4" style={{ background: "#fff", border: `1px solid ${C.hairline}` }}>
          <div className="rounded-full flex items-center justify-center" style={{ width: 40, height: 40, background: C.logiAccentSoft }}>
            <Truck size={19} color={C.logiAccent} />
          </div>
          <div className="text-left">
            <div style={{ fontFamily: "'Noto Sans TC', sans-serif" }} className="font-bold text-[14px]">送貨人員</div>
            <div style={{ color: C.muted }} className="text-[11px]">黃志偉・今日配送名單與路線</div>
          </div>
          <ChevronRight size={17} color={C.muted} className="ml-auto" />
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------
   首頁
--------------------------------------------------------------- */
function Home_({ onPick }) {
  return (
    <div>
      <div style={{ background: C.navy }} className="px-5 pt-8 pb-10 rounded-b-3xl text-white">
        <div style={{ fontFamily: "Manrope", color: "#9FB0C9" }} className="text-[11px] font-bold tracking-wide mb-1">ROUTE SCHEDULER</div>
        <div style={{ fontFamily: "'Noto Sans TC', sans-serif" }} className="text-[22px] font-black leading-tight">路線排程系統</div>
        <div style={{ color: "#B7C2D6" }} className="text-[12px] mt-1">選擇今日操作身份</div>
      </div>
      <div className="p-4 -mt-5">
        <button onClick={() => onPick("biz")} className="w-full flex items-center gap-3 rounded-2xl p-4 mb-3 shadow-sm" style={{ background: "#fff" }}>
          <div className="rounded-xl flex items-center justify-center" style={{ width: 46, height: 46, background: C.bizAccentSoft }}>
            <User size={22} color={C.bizAccent} />
          </div>
          <div className="text-left flex-1">
            <div style={{ fontFamily: "'Noto Sans TC', sans-serif" }} className="font-bold text-[15px]">業務</div>
            <div style={{ color: C.muted }} className="text-[11px] mt-0.5">自行勾選拜訪客戶，產生最佳化路線</div>
          </div>
          <ChevronRight size={18} color={C.muted} />
        </button>
        <button onClick={() => onPick("logi")} className="w-full flex items-center gap-3 rounded-2xl p-4 shadow-sm" style={{ background: "#fff" }}>
          <div className="rounded-xl flex items-center justify-center" style={{ width: 46, height: 46, background: C.logiAccentSoft }}>
            <Truck size={22} color={C.logiAccent} />
          </div>
          <div className="text-left flex-1">
            <div style={{ fontFamily: "'Noto Sans TC', sans-serif" }} className="font-bold text-[15px]">物流</div>
            <div style={{ color: C.muted }} className="text-[11px] mt-0.5">派遣單勾選、配送名單與路線調整</div>
          </div>
          <ChevronRight size={18} color={C.muted} />
        </button>

        <div style={{ fontFamily: "'Noto Sans TC', sans-serif", color: C.muted }} className="text-[11px] font-bold mt-6 mb-2">系統設定</div>
        <div className="rounded-2xl p-4" style={{ background: "#fff" }}>
          <div className="flex items-center gap-2 text-[12px]" style={{ color: C.text }}><Building2 size={14} color={C.muted} /> 公司地址：{COMPANY.addr}</div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------
   App 根元件（含手機外框）
--------------------------------------------------------------- */
export default function App() {
  const [mode, setMode] = useState("home"); // home / biz / logi

  return (
    <div style={{ background: "#0F1720", minHeight: "100vh" }} className="flex items-center justify-center p-4">
      <style>{fontImport}</style>
      <div style={{ width: 390, maxWidth: "100%", background: C.bg, borderRadius: 36, border: "8px solid #0B0F14", boxShadow: "0 30px 60px rgba(0,0,0,0.5)" }} className="overflow-hidden relative">
        <div style={{ background: "#0B0F14" }} className="h-6 flex items-center justify-center">
          <div style={{ background: "#222", width: 90, height: 4, borderRadius: 3 }} />
        </div>
        <div style={{ height: 780, overflowY: "auto" }} className="relative">
          {mode === "home" && <Home_ onPick={setMode} />}
          {mode === "biz" && <BizMode onExit={() => setMode("home")} />}
          {mode === "logi" && <LogisticsMode onExit={() => setMode("home")} />}
        </div>
      </div>
    </div>
  );
}
