import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Link, Navigate, useNavigate } from "react-router-dom";
import { ChevronRight, Truck, User, Building2, LogOut, Bell, ArrowLeft, Map, ClipboardCheck, FileText, PackageSearch, Tags } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import BizSetup from "./pages/biz/BizSetup";
import ManagerSelect from "./pages/logi/manager/ManagerSelect";
import DriverRoute from "./pages/logi/driver/DriverRoute";
import AdminHome from "./pages/admin/AdminHome";
import Login from "./pages/Login";
import Notifications from "./pages/Notifications";
import InspectionReports from "./pages/InspectionReports";
import ImportPermits from "./pages/ImportPermits";
import ShipmentTracking from "./pages/ShipmentTracking";
import CarrierDispatch from "./pages/logi/CarrierDispatch";
import QuoteSheetPage from "./pages/QuoteSheetPage";
import { getAuthedStaff, isLoggedIn, clearSession, isDriverOnly } from "./lib/auth";
import { C } from "./components/common";
import { api } from "./api/client";

function RequireAuth({ children }: { children: JSX.Element }) {
  if (!isLoggedIn()) return <Navigate to="/login" replace />;
  return children;
}

// 依角色限制頁面存取；role 可為單一角色或多個角色（符合其中一個即可）。
// 沒有權限就導回主目錄。
function RequireRole({ role, children }: { role: string | string[]; children: JSX.Element }) {
  if (!isLoggedIn()) return <Navigate to="/login" replace />;
  const staff = getAuthedStaff();
  const allowed = Array.isArray(role) ? role : [role];
  if (!staff || !allowed.some((r) => staff.roles.includes(r))) return <Navigate to="/" replace />;
  return children;
}

// 三順主目錄 — 各應用系統的入口。路線排程系統所有登入者皆可進入（內部再依角色顯示模組）；
// 檢驗報告／輸入許可證／貨運追蹤僅限業務(SALES)與主管(MANAGER)。
function MainDirectory() {
  const navigate = useNavigate();
  const staff = getAuthedStaff();
  const canBizSystems = !!staff && (staff.roles.includes("SALES") || staff.roles.includes("MANAGER"));
  const isAdmin = !!staff?.roles.includes("ADMIN");
  // 貨運派遣：主管與倉管使用
  const canCarrierDispatch = !!staff && (staff.roles.includes("MANAGER") || staff.roles.includes("WAREHOUSE"));

  // 只送貨的人在主目錄沒有其他可選項目，直接帶到今日配送名單
  if (staff && isDriverOnly(staff.roles)) return <Navigate to="/logi/driver" replace />;

  function handleLogout() {
    clearSession();
    navigate("/login");
  }

  const systems: { key: string; label: string; sub: string; icon: LucideIcon; to: string; color: string; soft: string; show: boolean }[] = [
    { key: "admin", label: "內勤後台", sub: "客戶／人員／派遣單管理", icon: Building2, to: "/admin", color: C.navy, soft: "#EDEFF2", show: isAdmin },
    // 路線排程系統裡的模組只對業務／物流主管／送貨人員開放，其他人進去會是空的，所以不顯示
    { key: "route", label: "路線排程系統", sub: "業務／物流／送貨／內勤管理", icon: Map, to: "/route", color: C.logiAccent, soft: C.logiAccentSoft, show: !!staff && ["SALES", "MANAGER", "DRIVER"].some((r) => staff.roles.includes(r)) },
    { key: "carrier", label: "貨運派遣", sub: "新竹貨運／大榮貨運出貨清點", icon: Truck, to: "/carrier", color: C.logiAccent, soft: C.logiAccentSoft, show: canCarrierDispatch },
    { key: "inspection", label: "檢驗報告", sub: "產品檢驗報告查詢與管理", icon: ClipboardCheck, to: "/inspection", color: C.bizAccent, soft: C.bizAccentSoft, show: canBizSystems },
    { key: "permit", label: "輸入許可證", sub: "進口許可證申請與追蹤", icon: FileText, to: "/permit", color: C.gold, soft: C.goldSoft, show: canBizSystems },
    { key: "tracking", label: "貨運追蹤", sub: "進出口貨運狀態追蹤", icon: PackageSearch, to: "/tracking", color: C.navy, soft: "#EDEFF2", show: canBizSystems },
    { key: "quote", label: "產品報價單", sub: "產品項目、規格與價格查詢", icon: Tags, to: "/quote", color: C.logiAccent, soft: C.logiAccentSoft, show: canBizSystems },
  ];

  return (
    <div>
      <div style={{ background: C.navy }} className="px-5 pt-8 pb-10 rounded-b-3xl text-white">
        <div style={{ fontFamily: "Manrope", color: "#9FB0C9" }} className="text-[11px] font-bold tracking-wide mb-1">
          SANSOON PORTAL
        </div>
        <div style={{ fontFamily: "'Noto Sans TC', sans-serif" }} className="text-[22px] font-black leading-tight">
          三順 主目錄
        </div>
        <div style={{ color: "#B7C2D6" }} className="text-[12px] mt-1 flex items-center justify-between">
          <span>{staff ? `你好，${staff.name}` : ""}</span>
          {staff && (
            <button onClick={handleLogout} className="flex items-center gap-1 text-white/80">
              <LogOut size={12} /> 登出
            </button>
          )}
        </div>
      </div>
      <div className="p-4 -mt-5">
        {systems
          .filter((s) => s.show)
          .map((s) => {
            const Icon = s.icon;
            return (
              <Link
                key={s.key}
                to={s.to}
                className="w-full flex items-center gap-3 rounded-2xl p-4 mb-3 shadow-sm"
                style={{ background: "#fff" }}
              >
                <div className="rounded-xl flex items-center justify-center" style={{ width: 46, height: 46, background: s.soft }}>
                  <Icon size={22} color={s.color} />
                </div>
                <div className="text-left flex-1">
                  <div style={{ fontFamily: "'Noto Sans TC', sans-serif" }} className="font-bold text-[15px]">
                    {s.label}
                  </div>
                  <div style={{ color: C.muted }} className="text-[11px] mt-0.5">
                    {s.sub}
                  </div>
                </div>
                <ChevronRight size={18} color={C.muted} />
              </Link>
            );
          })}
      </div>
    </div>
  );
}

// 路線排程系統首頁 — 依角色顯示各操作模組（業務／物流主管／送貨人員／內勤後台）。
function RouteSchedulerHome() {
  const navigate = useNavigate();
  const staff = getAuthedStaff();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    api
      .getNotifications()
      .then((list) => setUnreadCount(list.filter((n) => !n.isRead).length))
      .catch(() => {});
  }, []);

  return (
    <div>
      <div style={{ background: C.navy }} className="px-5 pt-8 pb-10 rounded-b-3xl text-white">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <button onClick={() => navigate("/")} className="p-1 -ml-1 rounded-full active:bg-white/15">
              <ArrowLeft size={18} color="#fff" />
            </button>
            <div style={{ fontFamily: "Manrope", color: "#9FB0C9" }} className="text-[11px] font-bold tracking-wide">
              ROUTE SCHEDULER
            </div>
          </div>
          {staff && (
            <button onClick={() => navigate("/notifications")} className="relative p-1 -mr-1">
              <Bell size={18} color="#fff" />
              {unreadCount > 0 && (
                <span
                  style={{ background: C.danger }}
                  className="absolute -top-0.5 -right-0.5 text-white text-[9px] font-bold rounded-full min-w-[14px] h-[14px] flex items-center justify-center px-0.5"
                >
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>
          )}
        </div>
        <div style={{ fontFamily: "'Noto Sans TC', sans-serif" }} className="text-[22px] font-black leading-tight">
          路線排程系統
        </div>
        <div style={{ color: "#B7C2D6" }} className="text-[12px] mt-1">
          {staff ? `你好，${staff.name}` : "選擇今日操作身份"}
        </div>
      </div>
      <div className="p-4 -mt-5">
        {staff?.roles.includes("SALES") && (
          <Link to="/biz" className="w-full flex items-center gap-3 rounded-2xl p-4 mb-3 shadow-sm" style={{ background: "#fff" }}>
            <div className="rounded-xl flex items-center justify-center" style={{ width: 46, height: 46, background: C.bizAccentSoft }}>
              <User size={22} color={C.bizAccent} />
            </div>
            <div className="text-left flex-1">
              <div style={{ fontFamily: "'Noto Sans TC', sans-serif" }} className="font-bold text-[15px]">
                業務模式
              </div>
              <div style={{ color: C.muted }} className="text-[11px] mt-0.5">
                自行勾選拜訪客戶，產生最佳化路線
              </div>
            </div>
            <ChevronRight size={18} color={C.muted} />
          </Link>
        )}
        {staff?.roles.includes("MANAGER") && (
          <Link to="/logi/manager" className="w-full flex items-center gap-3 rounded-2xl p-4 mb-3 shadow-sm" style={{ background: "#fff" }}>
            <div className="rounded-xl flex items-center justify-center" style={{ width: 46, height: 46, background: C.logiAccentSoft }}>
              <Truck size={22} color={C.logiAccent} />
            </div>
            <div className="text-left flex-1">
              <div style={{ fontFamily: "'Noto Sans TC', sans-serif" }} className="font-bold text-[15px]">
                物流模式 — 物流主管
              </div>
              <div style={{ color: C.muted }} className="text-[11px] mt-0.5">
                派遣單勾選與優先標記
              </div>
            </div>
            <ChevronRight size={18} color={C.muted} />
          </Link>
        )}
        {staff?.roles.includes("DRIVER") && (
          <Link to="/logi/driver" className="w-full flex items-center gap-3 rounded-2xl p-4 mb-3 shadow-sm" style={{ background: "#fff" }}>
            <div className="rounded-xl flex items-center justify-center" style={{ width: 46, height: 46, background: C.logiAccentSoft }}>
              <Truck size={22} color={C.logiAccent} />
            </div>
            <div className="text-left flex-1">
              <div style={{ fontFamily: "'Noto Sans TC', sans-serif" }} className="font-bold text-[15px]">
                物流模式 — 送貨人員
              </div>
              <div style={{ color: C.muted }} className="text-[11px] mt-0.5">
                今日配送名單與路線調整
              </div>
            </div>
            <ChevronRight size={18} color={C.muted} />
          </Link>
        )}
        {/* 內勤後台已移到主目錄首位，這裡不再重複顯示 */}
        {staff && !["SALES", "MANAGER", "DRIVER"].some((r) => staff.roles.includes(r)) && (
          <div style={{ color: C.muted }} className="text-center text-[13px] py-8">
            你的帳號目前沒有指派任何操作權限，請聯絡管理員。
          </div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <div style={{ background: "#0F1720", minHeight: "100vh" }} className="flex items-center justify-center p-4">
        <div
          style={{ width: 420, maxWidth: "100%", background: C.bg, borderRadius: 24, boxShadow: "0 30px 60px rgba(0,0,0,0.4)" }}
          className="overflow-hidden relative"
        >
          <div style={{ minHeight: 780 }} className="relative">
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route
                path="/"
                element={
                  <RequireAuth>
                    <MainDirectory />
                  </RequireAuth>
                }
              />
              <Route
                path="/route"
                element={
                  <RequireAuth>
                    <RouteSchedulerHome />
                  </RequireAuth>
                }
              />
              <Route
                path="/inspection"
                element={
                  <RequireRole role={["SALES", "MANAGER"]}>
                    <InspectionReports />
                  </RequireRole>
                }
              />
              <Route
                path="/permit"
                element={
                  <RequireRole role={["SALES", "MANAGER"]}>
                    <ImportPermits />
                  </RequireRole>
                }
              />
              <Route
                path="/tracking"
                element={
                  <RequireRole role={["SALES", "MANAGER"]}>
                    <ShipmentTracking />
                  </RequireRole>
                }
              />
              <Route
                path="/carrier"
                element={
                  <RequireRole role={["MANAGER", "WAREHOUSE"]}>
                    <CarrierDispatch />
                  </RequireRole>
                }
              />
              <Route
                path="/quote"
                element={
                  <RequireRole role={["SALES", "MANAGER"]}>
                    <QuoteSheetPage />
                  </RequireRole>
                }
              />
              <Route
                path="/biz"
                element={
                  <RequireRole role="SALES">
                    <BizSetup />
                  </RequireRole>
                }
              />
              <Route
                path="/logi/manager"
                element={
                  <RequireRole role="MANAGER">
                    <ManagerSelect />
                  </RequireRole>
                }
              />
              <Route
                path="/logi/driver"
                element={
                  <RequireRole role="DRIVER">
                    <DriverRoute />
                  </RequireRole>
                }
              />
              <Route
                path="/admin"
                element={
                  <RequireRole role="ADMIN">
                    <AdminHome />
                  </RequireRole>
                }
              />
              <Route
                path="/notifications"
                element={
                  <RequireAuth>
                    <Notifications />
                  </RequireAuth>
                }
              />
            </Routes>
          </div>
        </div>
      </div>
    </BrowserRouter>
  );
}
