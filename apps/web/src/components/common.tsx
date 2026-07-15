import { ReactNode } from "react";
import { ArrowLeft, Building2, Star, Navigation2, Share2, Check, LucideIcon } from "lucide-react";

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
};

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
    <div style={{ background: accent, color: "#fff" }} className="flex items-center gap-2 px-4 pt-5 pb-4 rounded-b-2xl shadow-sm">
      {onBack && (
        <button onClick={onBack} className="p-1 -ml-1 rounded-full active:bg-white/15">
          <ArrowLeft size={20} />
        </button>
      )}
      <div className="flex-1 font-bold text-[16px]" style={{ fontFamily: "'Noto Sans TC', sans-serif" }}>
        {title}
      </div>
      {right}
    </div>
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
}: {
  originLabel: string;
  destinationLabel: string;
  route: TimelineRoute;
  showProducts: boolean;
  accent: string;
}) {
  const nodes = [
    { kind: "origin" as const, label: originLabel },
    ...route.stops.map((s) => ({ kind: "stop" as const, data: s })),
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
            <div className="rounded-xl px-3 py-2.5" style={{ background: isEnd ? C.bg : C.surface, border: `1px solid ${C.hairline}` }}>
              {n.kind === "stop" ? (
                <>
                  <div className="flex items-center justify-between">
                    <div style={{ fontFamily: "'Noto Sans TC', sans-serif" }} className="font-bold text-[14px]">
                      {n.data.name}
                    </div>
                    {n.data.isPriority && <PriorityTag />}
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
                            style={{ background: p.checked ? C.bizAccent : C.bizAccentSoft, color: p.checked ? "#fff" : C.bizAccent }}
                            className="flex items-center gap-1.5 text-[13px] font-bold px-2 py-1 rounded-lg"
                          >
                            <span>
                              {p.name} ×{p.qty}
                            </span>
                            <span style={{ color: p.checked ? "rgba(255,255,255,0.85)" : C.bizAccent }} className="text-[11px]">
                              {p.checked ? "已完成" : "待完成"}
                            </span>
                          </button>
                        ) : (
                          <span key={pi} style={{ background: C.bizAccentSoft, color: C.bizAccent }} className="text-[13px] font-bold px-2 py-1 rounded-lg">
                            {p.name} ×{p.qty}
                          </span>
                        )
                      )}
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
        <Share2 size={15} /> 分享到 LINE 群組
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
