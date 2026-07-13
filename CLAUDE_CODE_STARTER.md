# 業務／物流路線排程系統 — 開發啟動包

> 給 Claude Code 使用的技術交接文件。對應規格書 `業務送貨路線排程系統_規格書_v2_2.md`。

---

## 1. 技術棧決策

| 層 | 選擇 | 理由 |
|---|---|---|
| 手機端（業務／物流） | **PWA**（React + Vite + TypeScript，可加到手機主畫面） | 不需相機、背景定位等原生功能；免上架審核、可即時更新；符合規格「精簡、單階段」原則 |
| 網頁後台（內勤） | 同一個 React 專案內的 `/admin` 路由（共用元件與 API） | 避免維護兩套前端專案 |
| 後端 | Node.js + Express + TypeScript | 與前端同語言，方便 Claude Code 在同一 repo 內開發 |
| 資料庫 | PostgreSQL + Prisma ORM | 關聯式資料最適合客戶／人員／派遣單的關聯與狀態機；Prisma 型別安全、migration 方便 |
| 地圖／距離計算 | Google Maps Distance Matrix API（**只能在後端呼叫**，勿把 API Key 放前端） | 規格書 8. 技術選型建議 |
| 排序演算法 | 最近鄰居法（Nearest Neighbor），伺服器端實作，優先/一般分組 | 規格書 7. 路線最佳化邏輯 |
| LINE 推播 | LINE Messaging API（Push Message，後端呼叫） | 規格書 8. |
| 檔案匯入 | `multer` 收檔 + `xlsx`（客戶 Excel）／`csv-parse`（派遣單 CSV） | |
| 部署建議 | 後端＋DB：Render / Zeabur / Fly.io + Supabase or Neon Postgres；前端 PWA：Vercel / Netlify | 免費方案即可跑 MVP |

---

## 2. Monorepo 檔案結構

```
route-scheduler/
├── apps/
│   ├── api/                        # Express 後端
│   │   ├── src/
│   │   │   ├── routes/             # customers.ts, staff.ts, orders.ts, route.ts, auth.ts, notify.ts
│   │   │   ├── controllers/
│   │   │   ├── services/
│   │   │   │   ├── googleMaps.ts   # Distance Matrix 封裝
│   │   │   │   ├── routeOptimizer.ts # 優先/一般分組 + 最近鄰居法
│   │   │   │   ├── lineNotify.ts
│   │   │   │   └── importParser.ts # Excel/CSV 解析
│   │   │   ├── middleware/         # auth.ts (JWT), errorHandler.ts
│   │   │   └── index.ts
│   │   ├── prisma/
│   │   │   └── schema.prisma
│   │   └── package.json
│   └── web/                        # React PWA + 後台
│       ├── src/
│       │   ├── pages/
│       │   │   ├── biz/            # 業務模式：Setup, SelectCustomers, RouteResult
│       │   │   ├── logi/
│       │   │   │   ├── manager/    # 派遣單勾選
│       │   │   │   └── driver/     # 配送名單、路線調整
│       │   │   └── admin/          # 內勤：客戶、人員、派遣單匯入與查詢
│       │   ├── components/
│       │   ├── api/                # fetch 封裝
│       │   ├── manifest.json       # PWA installable
│       │   └── App.tsx
│       └── package.json
├── packages/
│   └── shared-types/                # Customer, Staff, Order, RouteResult 共用型別
├── .env.example
└── README.md
```

---

## 3. 資料庫 Schema（Prisma）

```prisma
enum StaffRole {
  SALES     // 業務人員
  MANAGER   // 物流主管
  DRIVER    // 送貨人員
}

enum OrderStatus {
  PENDING       // 待處理
  SELECTED      // 已勾選配送
  DISPATCHED    // 已派送給送貨人員
  COMPLETED     // 已完成
}

model Customer {
  id         String   @id @default(cuid())
  code       String   @unique          // 客戶編號 C001
  name       String                     // 客戶名稱
  address    String                     // 住址
  city       String                     // 自動解析的縣市
  phone      String?
  isPriority Boolean  @default(false)   // 優先客戶（客戶主檔層級）
  lat        Float?
  lng        Float?
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
}

model Staff {
  id          String    @id @default(cuid())
  name        String
  roles       StaffRole[]              // 業務人員可與其他角色並存；主管/送貨互斥（應用層檢查）
  homeAddress String
  homeLat     Float?
  homeLng     Float?
  lineGroupId String?                   // 固定 LINE 群組
  createdAt   DateTime  @default(now())
}

model SystemSetting {
  id            String @id @default("singleton")
  companyAddress String
  companyLat    Float?
  companyLng    Float?
}

model DispatchOrder {                    // 派遣單
  id            String       @id @default(cuid())
  deliveryDate  DateTime                  // 送貨日期
  customerCode  String                    // 純文字，不強制對應 Customer
  customerName  String
  address       String
  phone         String?
  status        OrderStatus  @default(PENDING)
  isPriority    Boolean      @default(false) // 本次配送優先標記
  assignedDriverId String?
  routeSequence Int?                      // 系統排定的路線順序
  lat           Float?
  lng           Float?
  items         DispatchOrderItem[]
  createdAt     DateTime     @default(now())
  updatedAt     DateTime     @updatedAt
}

model DispatchOrderItem {                 // 產品項目（可多筆）
  id        String        @id @default(cuid())
  order     DispatchOrder @relation(fields: [orderId], references: [id])
  orderId   String
  productName String
  quantity  Int
}

model Notification {                      // 5.4 派遣單異動通知
  id        String   @id @default(cuid())
  orderId   String
  staffId   String                        // 通知對象（主管或送貨人員）
  message   String
  isRead    Boolean  @default(false)
  createdAt DateTime @default(now())
}
```

---

## 4. API 合約（REST）

| Method | Path | 說明 |
|---|---|---|
| POST | `/auth/login` | 員工登入（姓名＋密碼或簡易 PIN） |
| GET/POST | `/customers` | 客戶清單／新增 |
| POST | `/customers/import` | Excel 匯入（沿用 `customer_import_template.xlsx` 格式） |
| GET/POST/PUT | `/staff` | 人員資料（含角色） |
| GET | `/orders?date=&status=` | 派遣單查詢 |
| POST | `/orders/import` | CSV 批次匯入派遣單 → 觸發 5.4 通知邏輯（狀態為待處理時通知主管） |
| PATCH | `/orders/:id/select` | 主管勾選配送＋優先標記 → 狀態轉「已勾選配送」，觸發路線產生＋指派送貨人員 |
| PATCH | `/orders/:id/status` | 更新狀態（如已完成） |
| POST | `/route/optimize` | Body: `{ origin, destination, stops[] }` → 回傳依優先/一般分組排序後的完整路線與距離 |
| GET | `/notifications?staffId=` | 該員工的未讀通知列表 |
| POST | `/notify/line` | 內部呼叫，推送訊息到指定 LINE 群組 |

---

## 5. 路線最佳化服務邏輯（對應規格書 7.）

```
function optimizeRoute(origin, destination, stops):
  priorityStops = stops.filter(isPriority)
  normalStops   = stops.filter(not isPriority)

  orderedPriority = nearestNeighbor(origin, priorityStops)
  lastPoint = orderedPriority.last ?? origin
  orderedNormal = nearestNeighbor(lastPoint, normalStops)

  fullRoute = orderedPriority + orderedNormal
  # 用 Google Distance Matrix API 批次查詢座標間實際距離/時間，取代直線距離
  return { stops: fullRoute, legDistances, totalDistance, totalDuration }
```

實作提醒：
- Distance Matrix API 有查詢筆數上限，客戶數多時要分批呼叫並快取結果。
- 座標（lat/lng）建議在客戶／派遣單建檔或匯入時，透過 Geocoding API 轉換並存入資料庫，避免每次排路線都重新 geocode。

---

## 6. 環境變數（`.env.example`）

```
DATABASE_URL=postgresql://user:pass@host:5432/route_scheduler
GOOGLE_MAPS_API_KEY=
LINE_CHANNEL_ACCESS_TOKEN=
JWT_SECRET=
PORT=4000
```

---

## 7. 建議開發順序（給 Claude Code）

1. Scaffold monorepo（apps/api, apps/web, packages/shared-types）+ Prisma schema + 跑 migration
2. Auth（簡易員工登入）＋ 客戶／人員 CRUD ＋ 客戶 Excel 匯入
3. 路線最佳化服務（先接 Google Distance Matrix，本地測試用假座標 fallback）
4. 業務模式前端三步驟頁面（出發地/目的地 → 縣市手風琴勾選 → 路線結果時間軸）
5. 派遣單 CRUD ＋ CSV 匯入 ＋ 物流主管頁面（勾選＋優先標記）＋ 送貨人員頁面（調整＋導航＋LINE分享＋完成標記）
6. LINE 推播整合 ＋ 5.4 派遣單異動通知機制（含未讀角標）
7. PWA 設定（manifest、加到主畫面、路線結果離線快取）
8. 內勤後台頁面（客戶／人員／派遣單管理）

---

## 8. 交給 Claude Code 前，建議先拍板的事項

沿用規格書「10. 待確認事項」，再加上本次技術決策衍生的項目：

- 派遣單「已完成」觸發方式：送貨人員手動標記，或僅代表路線已產生？（本文件暫採「手動標記」）
- 派遣單異動通知是否需要「已讀」機制？（本 schema 已預留 `isRead` 欄位，但邏輯待定）
- 員工登入方式：姓名＋簡易密碼／PIN，或是否需要更完整的帳號系統？
- 部署環境：是否已有偏好的主機服務商（本文件建議 Render/Zeabur + Supabase，皆有免費額度）？

---

## 9. 貼給 Claude Code 的起始訊息（建議）

```
請根據 CLAUDE_CODE_STARTER.md 和附上的規格書，初始化一個 monorepo 專案：
apps/api（Express + TypeScript + Prisma + PostgreSQL）
apps/web（React + Vite + TypeScript PWA）
packages/shared-types

先完成第 7 節「建議開發順序」的第 1～2 步：建好 Prisma schema 並跑 migration，
然後實作客戶／人員 CRUD API 與 Excel 匯入功能。完成後回報進度，我再確認下一步。
```
