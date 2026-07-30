import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Link, Navigate, useNavigate } from "react-router-dom";
import { Truck, Building2, LogOut, Bell, ArrowLeft, Map, ClipboardCheck, FileText, PackageSearch, Tags, KeyRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";
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
import ChangePassword from "./pages/ChangePassword";
import { getAuthedStaff, isLoggedIn, clearSession, isDriverOnly } from "./lib/auth";
import { C, TileGrid, Tile } from "./components/common";
import { api } from "./api/client";

function RequireAuth({ children }: { children: JSX.Element }) {
  if (!isLoggedIn()) return <Navigate to="/login" replace />;
  // 密碼被主管重設過的人，任何頁面都先導到設定新密碼，避免用臨時密碼繼續操作
  if (getAuthedStaff()?.mustChangePassword) return <Navigate to="/password" replace />;
  return children;
}

// 依角色限制頁面存取；role 可為單一角色或多個角色（符合其中一個即可）。
// 沒有權限就導回主目錄。
function RequireRole({ role, children }: { role: string | string[]; children: JSX.Element }) {
  if (!isLoggedIn()) return <Navigate to="/login" replace />;
  if (getAuthedStaff()?.mustChangePassword) return <Navigate to="/password" replace />;
  const staff = getAuthedStaff();
  const allowed = Array.isArray(role) ? role : [role];
  if (!staff || !allowed.some((r) => staff.roles.includes(r))) return <Navigate to="/" replace />;
  return children;
}

// 修改密碼：被主管重設過密碼的人是「強制」進來的（不給返回鍵），其他人是自己點進來改的
function ChangePasswordRoute() {
  if (!isLoggedIn()) return <Navigate to="/login" replace />;
  return <ChangePassword forced={!!getAuthedStaff()?.mustChangePassword} />;
}

// 三順主目錄 — 各應用系統的入口。
// 檢驗報告／輸入許可證／貨運追蹤僅限業務(SALES)與主管(MANAGER)。
function MainDirectory() {
  const navigate = useNavigate();
  const staff = getAuthedStaff();
  const canBizSystems = !!staff && (staff.roles.includes("SALES") || staff.roles.includes("MANAGER"));
  const isAdmin = !!staff?.roles.includes("ADMIN");
  // 貨運派遣是倉管的作業，內勤（ADMIN）需要查看；一般物流主管不列入
  const canCarrierDispatch = !!staff && (staff.roles.includes("WAREHOUSE") || staff.roles.includes("ADMIN"));
  // 物流主管（派遣單勾選與指派）改成主目錄的獨立入口；倉管進去是唯讀
  const canLogiManager = !!staff && (staff.roles.includes("MANAGER") || staff.roles.includes("WAREHOUSE"));

  // 只送貨的人在主目錄沒有其他可選項目，直接帶到今日配送名單
  if (staff && isDriverOnly(staff.roles)) return <Navigate to="/logi/driver" replace />;

  function handleLogout() {
    clearSession();
    navigate("/login");
  }

  // 兩欄磁磚放不下長句，說明一律縮短成一個短詞
  const systems: { key: string; label: string; sub: string; icon: LucideIcon; to: string; color: string; soft: string; show: boolean }[] = [
    { key: "admin", label: "內勤後台", sub: "客戶／人員／派遣單", icon: Building2, to: "/admin", color: C.navy, soft: "#EDEFF2", show: isAdmin },
    { key: "logi", label: "物流主管", sub: "派遣單勾選與指派", icon: Map, to: "/logi/manager", color: C.logiAccent, soft: C.logiAccentSoft, show: canLogiManager },
    // 業務模式已移除，路線排程系統底下只剩送貨人員，因此只對送貨人員顯示
    { key: "route", label: "路線排程系統", sub: "今日配送名單", icon: Truck, to: "/route", color: C.logiAccent, soft: C.logiAccentSoft, show: !!staff?.roles.includes("DRIVER") },
    { key: "carrier", label: "貨運派遣", sub: "新竹／大榮清點", icon: Truck, to: "/carrier", color: C.logiAccent, soft: C.logiAccentSoft, show: canCarrierDispatch },
    { key: "inspection", label: "檢驗報告", sub: "查詢與管理", icon: ClipboardCheck, to: "/inspection", color: C.bizAccent, soft: C.bizAccentSoft, show: canBizSystems },
    { key: "permit", label: "輸入許可證", sub: "進口許可證", icon: FileText, to: "/permit", color: C.gold, soft: C.goldSoft, show: canBizSystems },
    { key: "tracking", label: "貨運追蹤", sub: "出貨狀態追蹤", icon: PackageSearch, to: "/tracking", color: C.navy, soft: "#EDEFF2", show: canBizSystems },
    { key: "quote", label: "產品報價單", sub: "規格與價格", icon: Tags, to: "/quote", color: C.logiAccent, soft: C.logiAccentSoft, show: canBizSystems },
  ];

  return (
    <div>
      <div style={{ background: C.navy }} className="px-5 pt-6 pb-8 rounded-b-3xl text-white">
        <div style={{ fontFamily: "Manrope", color: "#9FB0C9" }} className="text-[11px] font-bold tracking-wide mb-1">
          SANSOON PORTAL
        </div>
        <div style={{ fontFamily: "'Noto Sans TC', sans-serif" }} className="text-[22px] font-black leading-tight">
          三順 主目錄
        </div>
        <div style={{ color: "#B7C2D6" }} className="text-[12px] mt-1 flex items-center justify-between">
          <span>{staff ? `你好，${staff.name}` : ""}</span>
          {staff && (
            <div className="flex items-center gap-3">
              <Link to="/password" className="flex items-center gap-1 text-white/80">
                <KeyRound size={12} /> 修改密碼
              </Link>
              <button onClick={handleLogout} className="flex items-center gap-1 text-white/80">
                <LogOut size={12} /> 登出
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="p-4 -mt-5">
        <TileGrid>
          {systems
            .filter((s) => s.show)
            .map((s) => (
              <Tile key={s.key} icon={s.icon} label={s.label} sub={s.sub} color={s.color} soft={s.soft} onClick={() => navigate(s.to)} />
            ))}
        </TileGrid>
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
        {/* 業務模式已移除；物流主管改成主目錄的獨立入口，這裡只留送貨人員 */}
        <TileGrid>
          {staff?.roles.includes("DRIVER") && (
            <Tile
              icon={Truck}
              label="送貨人員"
              sub="今日配送名單"
              color={C.logiAccent}
              soft={C.logiAccentSoft}
              onClick={() => navigate("/logi/driver")}
            />
          )}
        </TileGrid>
        {/* 內勤後台與物流主管都在主目錄，這裡不再重複顯示 */}
        {staff && !staff.roles.includes("DRIVER") && (
          <div style={{ color: C.muted }} className="text-center text-[13px] py-8">
            這裡只有送貨人員的今日配送名單，你的帳號沒有這個身份。
          </div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      {/* 手機上滿版顯示（不留深色外框與圓角），電腦版才維持置中的手機外框樣式。
          高度用 dvh：外框若寫死 780px，螢幕較矮的手機不論內容多少都會被迫捲動。 */}
      <div style={{ background: "#0F1720" }} className="flex items-center justify-center min-h-[100dvh] p-0 sm:p-4">
        <div
          style={{ width: 420, maxWidth: "100%", background: C.bg }}
          className="overflow-hidden relative w-full sm:rounded-3xl sm:shadow-2xl"
        >
          <div className="relative min-h-[100dvh] sm:min-h-[780px]">
            <Routes>
              <Route path="/login" element={<Login />} />
              {/* 不能包 RequireAuth，否則被重設密碼的人會在這裡無限轉圈 */}
              <Route path="/password" element={<ChangePasswordRoute />} />
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
                  // 貨運派遣是倉管作業，內勤需要查看；一般物流主管（例如徐文卿）不進這裡
                  <RequireRole role={["ADMIN", "WAREHOUSE"]}>
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
              {/* 業務模式（/biz）已依需求移除入口與路由；頁面原始碼保留在 pages/biz，要恢復時把這段加回來即可 */}
              <Route
                path="/logi/manager"
                element={
                  // 倉管可進入，但頁面內是唯讀（後端也擋：/orders/select 與 PUT /orders 都要 MANAGER）
                  <RequireRole role={["MANAGER", "WAREHOUSE"]}>
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
