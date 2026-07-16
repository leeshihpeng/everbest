import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { TopBar, C } from "../../components/common";
import CustomersPanel from "./CustomersPanel";
import StaffPanel from "./StaffPanel";
import OrdersPanel from "./OrdersPanel";
import SettingsPanel from "./SettingsPanel";

type Tab = "customers" | "staff" | "orders" | "settings";

export default function AdminHome() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("orders");

  return (
    <div>
      <TopBar title="內勤後台" accent={C.navy} onBack={() => navigate("/route")} />
      <div className="px-4 pt-3 flex gap-2">
        {(
          [
            ["orders", "派遣單"],
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
      {tab === "customers" && <CustomersPanel />}
      {tab === "staff" && <StaffPanel />}
      {tab === "orders" && <OrdersPanel />}
      {tab === "settings" && <SettingsPanel />}
    </div>
  );
}
