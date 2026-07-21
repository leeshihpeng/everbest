import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { TopBar, C } from "../../components/common";
import CustomersPanel from "./CustomersPanel";
import StaffPanel from "./StaffPanel";
import OrdersPanel from "./OrdersPanel";
import SettingsPanel from "./SettingsPanel";

type Tab = "orders" | "hsinchu" | "dalen" | "customers" | "staff" | "settings";

export default function AdminHome() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("orders");

  return (
    <div>
      {/* 內勤後台已移到主目錄，返回時回主目錄而非路線排程首頁 */}
      <TopBar title="內勤後台" accent={C.navy} onBack={() => navigate("/")} />
      <div className="px-4 pt-3 flex gap-2 flex-wrap">
        {(
          [
            ["orders", "派遣單"],
            ["hsinchu", "新竹派遣單"],
            ["dalen", "大榮派遣單"],
            ["customers", "客戶"],
            ["staff", "人員"],
            ["settings", "設定"],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={tab === key ? { background: C.navy, color: "#fff" } : { color: C.muted, border: `1px solid ${C.hairline}` }}
            className="px-3 py-1.5 rounded-full text-[12px] font-bold"
          >
            {label}
          </button>
        ))}
      </div>
      {/* 三種派遣單共用同一個面板，用 key 強制重新掛載，避免切換時殘留上一個貨運行的資料 */}
      {tab === "orders" && <OrdersPanel key="SELF" />}
      {tab === "hsinchu" && <OrdersPanel key="新竹貨運" carrier="新竹貨運" />}
      {tab === "dalen" && <OrdersPanel key="大榮貨運" carrier="大榮貨運" />}
      {tab === "customers" && <CustomersPanel />}
      {tab === "staff" && <StaffPanel />}
      {tab === "settings" && <SettingsPanel />}
    </div>
  );
}
