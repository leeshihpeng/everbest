import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { TopBar, C } from "../../components/common";
import { DISPATCH_CARRIERS } from "../../lib/carriers";
import CustomersPanel from "./CustomersPanel";
import StaffPanel from "./StaffPanel";
import OrdersPanel from "./OrdersPanel";
import SettingsPanel from "./SettingsPanel";

// 分頁鍵：自家配送用 "SELF"，貨運行／回頭車直接用 carrier 值當鍵，
// 這樣新增一家業者只要改 lib/carriers.ts 一個地方。
type Tab = string;

const OTHER_TABS: [Tab, string][] = [
  ["customers", "客戶"],
  ["staff", "人員"],
  ["settings", "設定"],
];

export default function AdminHome() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("SELF");

  const tabs: [Tab, string][] = [
    ["SELF", "派遣單"],
    ...DISPATCH_CARRIERS.map((c) => [c.carrier, `${c.short}派遣單`] as [Tab, string]),
    ...OTHER_TABS,
  ];

  const isCarrierTab = DISPATCH_CARRIERS.some((c) => c.carrier === tab);

  return (
    <div>
      {/* 內勤後台已移到主目錄，返回時回主目錄而非路線排程首頁 */}
      <TopBar title="內勤後台" accent={C.header} onBack={() => navigate("/")} />
      <div className="px-4 pt-3 flex gap-2 flex-wrap">
        {tabs.map(([key, label]) => (
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
      {/* 各種派遣單共用同一個面板，用 key 強制重新掛載，避免切換時殘留上一個管道的資料 */}
      {tab === "SELF" && <OrdersPanel key="SELF" />}
      {isCarrierTab && <OrdersPanel key={tab} carrier={tab} />}
      {tab === "customers" && <CustomersPanel />}
      {tab === "staff" && <StaffPanel />}
      {tab === "settings" && <SettingsPanel />}
    </div>
  );
}
