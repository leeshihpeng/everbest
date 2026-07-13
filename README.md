# 業務／物流路線排程系統

依據 `業務送貨路線排程系統_規格書_v2_2.md` 建置。詳細架構決策見 `CLAUDE_CODE_STARTER.md`。

## 目前完成度

✅ 已完成：
- Monorepo 結構（apps/api, apps/web, packages/shared-types）
- Prisma schema（客戶、人員、系統設定、派遣單、派遣單項目、通知）
- 後端 API：
  - 登入（`POST /auth/login`）
  - 客戶 CRUD ＋ Excel 匯入（`POST /customers/import`，對應 `customer_import_template.xlsx`）
  - 人員 CRUD（含角色互斥檢查）
  - 派遣單 CSV 匯入（自動合併同客戶多產品項目）
  - 路線最佳化服務（`POST /route/optimize`，優先/一般分組＋最近鄰居法，未設定 Google API Key 時自動用估算距離）
  - 物流主管勾選配送＋指派送貨人員（`POST /orders/select`，會自動產生路線並推播 LINE）
  - 5.4 派遣單異動通知機制（新增/修改時依狀態通知主管或送貨人員）
- 前端骨架：React Router 路由結構、API client、PWA 設定（manifest + workbox 離線快取）

🚧 待開發（頁面 UI）：
- `apps/web/src/pages/**` 目前都是最小 stub，**請參考 `route-app-prototype.jsx`**（先前做的互動原型，含完整 UI／互動設計：縣市手風積、時間軸路線畫面、優先客戶標籤等），把邏輯換成呼叫 `src/api/client.ts` 打真實 API
- 內勤後台頁面（客戶／人員／派遣單管理介面）完全未做
- 地址 → 座標的 geocoding 目前只在有 `GOOGLE_MAPS_API_KEY` 時運作，本機開發沒 Key 時客戶/派遣單會沒有 lat/lng，路線最佳化會被跳過（因為 `orders.ts` 的 `select` 會過濾掉沒座標的訂單）——開發階段可以考慮先手動塞測試座標，或申請一組 Google Maps API Key

## 安裝與啟動

```bash
# 1. 安裝套件
npm install

# 2. 設定環境變數
cp .env.example apps/api/.env
# 編輯 apps/api/.env，填入 DATABASE_URL（PostgreSQL 連線字串）

# 3. 建立資料庫 schema
npm run prisma:migrate

# 4. 啟動後端（http://localhost:4000）
npm run dev:api

# 5. 另開一個 terminal 啟動前端（http://localhost:5173）
npm run dev:web
```

首次啟動需要手動塞一筆 `Staff` 資料才能登入測試（之後應該做一支種子資料 script，或先透過 Prisma Studio `npx prisma studio` 手動新增）。

## 下一步建議順序

1. 寫一支 seed script（`apps/api/prisma/seed.ts`），把 `customer_import_template.xlsx` 的範例資料 + 三個測試人員（業務／主管／送貨）灌進資料庫，方便本機測試
2. 把 `apps/web/src/pages/biz/BizSetup.tsx` 換成 `route-app-prototype.jsx` 裡 `BizMode` 的完整 UI，接上真實 API
3. 同樣把 `logi/manager` 與 `logi/driver` 換成 `ManagerFlow` / `DriverFlow` 的 UI
4. 做內勤後台頁面（客戶／人員／派遣單管理，含匯入表單）
5. 申請 Google Maps API Key（Distance Matrix + Geocoding）與 LINE Messaging API channel token，填入 `.env` 做真實串接測試
