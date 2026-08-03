import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { Truck, Building2, Map, ClipboardCheck, FileText, PackageSearch, Tags } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import ManagerSelect from "./pages/logi/manager/ManagerSelect";
import DriverRoute from "./pages/logi/driver/DriverRoute";
import BizSetup from "./pages/biz/BizSetup";
import AdminHome from "./pages/admin/AdminHome";
import Login from "./pages/Login";
import Notifications from "./pages/Notifications";
import InspectionReports from "./pages/InspectionReports";
import ImportPermits from "./pages/ImportPermits";
import ShipmentTracking from "./pages/ShipmentTracking";
import CarrierDispatch from "./pages/logi/CarrierDispatch";
import QuoteSheetPage from "./pages/QuoteSheetPage";
import ChangePassword from "./pages/ChangePassword";
import { getAuthedStaff, isLoggedIn, isDriverOnly } from "./lib/auth";
import { C, TileGrid, Tile, headerBg, HeaderActions } from "./components/common";

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

  // 兩欄磁磚放不下長句，說明一律縮短成一個短詞。
  // image 是設計稿裁下來的插畫圖示（scripts/slice-tile-icons.mjs 產生）。
  const systems: {
    key: string; label: string; sub: string; icon: LucideIcon; image?: string;
    to: string; color: string; soft: string; show: boolean;
  }[] = [
    { key: "admin", label: "內勤後台", sub: "客戶／人員／派遣單", icon: Building2, image: "/tiles/admin.png", to: "/admin", color: C.navy, soft: "#EDEFF2", show: isAdmin },
    { key: "logi", label: "物流主管", sub: "派遣單勾選與指派", icon: Map, image: "/tiles/logi.png", to: "/logi/manager", color: C.logiAccent, soft: C.logiAccentSoft, show: canLogiManager },
    // 原本是「路線排程系統 → 業務模式 → 勾選客戶」，中間那個 ICON 只是多點一下，
    // 因此主目錄直接進到勾選客戶的畫面。
    { key: "biz", label: "路線排程系統", sub: "勾選客戶產生路線", icon: Map, image: "/tiles/biz.png", to: "/biz", color: C.bizAccent, soft: C.bizAccentSoft, show: !!staff?.roles.includes("SALES") },
    { key: "driver", label: "送貨人員", sub: "今日配送名單", icon: Truck, image: "/tiles/carrier.png", to: "/logi/driver", color: C.logiAccent, soft: C.logiAccentSoft, show: !!staff?.roles.includes("DRIVER") },
    { key: "carrier", label: "貨運派遣", sub: "新竹／大榮清點", icon: Truck, image: "/tiles/carrier.png", to: "/carrier", color: C.logiAccent, soft: C.logiAccentSoft, show: canCarrierDispatch },
    { key: "inspection", label: "檢驗報告", sub: "查詢與管理", icon: ClipboardCheck, image: "/tiles/inspection.png", to: "/inspection", color: C.bizAccent, soft: C.bizAccentSoft, show: canBizSystems },
    { key: "permit", label: "輸入許可證", sub: "進口許可證", icon: FileText, image: "/tiles/permit.png", to: "/permit", color: C.gold, soft: C.goldSoft, show: canBizSystems },
    { key: "tracking", label: "貨運追蹤", sub: "出貨狀態追蹤", icon: PackageSearch, image: "/tiles/tracking.png", to: "/tracking", color: C.navy, soft: "#EDEFF2", show: canBizSystems },
    { key: "quote", label: "產品報價單", sub: "規格與價格", icon: Tags, image: "/tiles/quote.png", to: "/quote", color: C.logiAccent, soft: C.logiAccentSoft, show: canBizSystems },
  ];

  return (
    <div>
      {/* 標題列壓低高度：右側三顆動作鈕會吃掉寬度，標題字級太大就會換行，
          所以字級縮小並強制不換行，問候語也併到同一區塊 */}
      <div style={headerBg(C.header)} className="pl-6 pr-3 pt-4 pb-5 rounded-b-3xl text-white">
        <div className="flex items-center gap-2.5">
          {/* 公司 logo 放最左（與加到主畫面的 App 圖示同一張） */}
          <img src="/icon-192.png" alt="三順" width={38} height={38} className="rounded-lg shrink-0" />
          <div className="flex-1 min-w-0">
            <div style={{ fontFamily: "Manrope", color: "#9FB0C9" }} className="text-[10px] font-bold tracking-wide">
              SANSOON PORTAL
            </div>
            <div
              style={{ fontFamily: "'Noto Sans TC', sans-serif" }}
              className="text-[18px] font-black leading-tight whitespace-nowrap"
            >
              三順 主目錄
            </div>
            <div style={{ color: "#B7C2D6" }} className="text-[11px] truncate">
              {staff ? `你好，${staff.name}` : ""}
            </div>
          </div>
          {/* 已經在首頁，所以不放「首頁」；改密碼只在主目錄提供 */}
          <HeaderActions home={false} password />
        </div>
      </div>
      {/* 原本用負邊距讓磁磚往上疊在藍色標題上，會把標題底部蓋掉；改成接在標題下方 */}
      <div className="p-4 pt-3">
        <TileGrid>
          {systems
            .filter((s) => s.show)
            .map((s) => (
              <Tile
                key={s.key}
                icon={s.icon}
                image={s.image}
                label={s.label}
                sub={s.sub}
                color={s.color}
                soft={s.soft}
                onClick={() => navigate(s.to)}
              />
            ))}
        </TileGrid>
      </div>
    </div>
  );
}

// 原本的「路線排程系統」首頁已移除：業務模式拿掉、物流主管與送貨人員都改成主目錄的
// 獨立入口後，那一層只剩一個選項，等於白點一下。通知鈴鐺已移到主目錄。

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
              {/* 舊的 /route 中繼頁已移除；有人從舊書籤或 PWA 捷徑進來就導回主目錄 */}
              <Route path="/route" element={<Navigate to="/" replace />} />
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
              {/* 業務勾選客戶產生路線。主目錄的「路線排程系統」直接進這裡，不再經過中間那層 ICON */}
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
