# CLAUDE.md — 三順系統開發須知

只記錄「讀程式碼看不出來、但做錯會出事」的事情。程式結構請直接讀原始碼。

## ⚠️ 資料庫直接連正式環境

`apps/api/.env` 的 `DATABASE_URL` **直接指向正式 Neon 資料庫，沒有另外的開發／測試資料庫**。
本機跑 dev server、`prisma migrate`、任何 `node xxx.mjs` 腳本，動到的都是**線上真實資料**。

- 使用者已同意「用 migration 直接改正式資料庫結構」來加功能（新增欄位／資料表）。沿用此模式即可，破壞性變更（刪欄位／刪表）仍要先說明。
- 正式資料包含：真實員工帳號、客戶、派遣單、檢驗報告。**測試時絕對不要動到這些**。
- **使用者會自己從網頁上傳檢驗報告、新增年份目錄**，所以資料筆數會自己長。
  **不要把任何筆數寫死當成「正確值」**，也不要看到筆數變多就當成 bug 或重複資料——
  先查 `createdAt`／`year`／檔名確認來源，很可能是使用者新增的真實資料。

### 測試慣例（務必遵守）
1. 另建臨時帳號／資料，id 用可辨識前綴（如 `ui-test-`、`perm-`）。
2. 需要測破壞性操作（刪除）時，**另建 dummy 資料來刪**，不要拿真實資料測。
3. 測試**開始前先記下筆數**，測完清除臨時資料後確認筆數回到原值（而不是回到某個寫死的數字）。
4. 臨時腳本用 `_` 開頭命名，用完刪掉，不要 commit。
5. 刪除任何非自己建立的資料前，**先停下來問使用者**。

## 部署

`git push origin main` → Render（後端）與 Vercel（前端）各自**自動部署**，約 1–2 分鐘。

- 前端：https://everbest-web-jade.vercel.app
- 後端：https://everbest.onrender.com
- Render 啟動時會跑 `prisma migrate deploy`，所以 **migration 檔一定要 commit**。
- Render Start Command 指向巢狀路徑 `apps/api/dist/apps/api/src/index.js`（因 tsc rootDir 受 path-mapped shared-types 影響）。改建置設定時注意。
- Render 免費方案會休眠，閒置後第一次請求可能要等 30–60 秒才醒來（不是壞掉）。
- 使用者回報「按了沒反應／404」時，先確認是否部署還沒跑完或 PWA 快取舊版，再懷疑程式。

## Windows / Git Bash 陷阱

- **中文參數不能直接寫在指令列**（curl `-d`、`node -e`）會變亂碼或 exit 26。
  改用 `--data-binary @file.json`、`-F 'files=@/tmp/ascii.pdf;filename=中文.pdf'`，或寫成 `.mjs` 檔執行。
  → 出現亂碼多半是 shell 編碼問題，**不是程式的 bug**，別急著「修」。
- 跑 `prisma migrate` / `generate` 前**先停掉 dev server**，否則 Windows 會 EPERM 鎖住 query engine DLL。
- `prisma migrate dev` 在此環境是非互動的，需要回填資料的欄位請**手寫 migration SQL**（先加 DEFAULT 回填再 DROP DEFAULT）。
- 本機有 `pdftotext`，但 **Render 上沒有**。伺服器端解析 PDF 一律用 `pdf-parse`：
  `new PDFParse({ data }).getText({ first: 2 })`（注意 `last` 是「最後幾頁」，日期在第 1 頁）。

## 安全性（2026-07 檢視後修補，勿回退）

- `JWT_SECRET` **不再有預設值**：正式環境沒設就拒絕啟動；本機沒設會用隨機值。
  絕對不要為了方便再加回寫死的預設密鑰。
- 登入有**失敗鎖定**（帳號與 IP 各 5 次 → 鎖 10 分鐘），因為密碼是短數字 PIN。
- `errorHandler` **只回概括訊息**，詳細錯誤僅寫入伺服器日誌
  （原本會把 Neon 主機位址、原始碼路徑吐給前端）。
- 設 `CORS_ORIGINS` 限制來源；所有上傳都有 30MB 上限；JSON 限 1MB。
- 授權原則：**每個會改資料的端點都要驗證擁有權或角色**，不能只靠前端隱藏按鈕。
  - 送貨人員只能改**指派給自己**的派遣單（狀態、檢貨）。
  - 通知只能標記／刪除**自己的**。
  - LINE 推播限 MANAGER／ADMIN（否則任何人都能冒名發訊息）。
  - `GET /staff` 對非主管**遮蔽他人住家地址與 LINE 群組**（只保留自己的完整資料）。

## 權限模型

`Staff.roles` 是**逗號分隔字串**（非陣列），轉換見 `apps/api/src/utils/roles.ts`。
角色寫死在登入時簽發的 JWT 裡 → **改角色後必須重新登入才生效**。

實際對應（改權限前先確認，不要臆測）：

| 角色 | 人員 |
|---|---|
| ADMIN | 李世鵬、李世斌（僅此兩人） |
| MANAGER | 李世鵬、李世斌、徐文卿 |
| DRIVER | 邱炫誠 |
| SALES | 李世鵬、李世斌、徐文卿、李恭戎、柯月惠、許鴻章 |

- 檢驗報告／輸入許可證一致：預覽／下載／分享 = SALES 或 MANAGER；
  **上傳／修改報告日期／刪除／新增年份 = ADMIN**（徐文卿只能看與分享，不能改任何東西）。
- `MANAGER_VIEW`／`DRIVER_VIEW` 角色在資料裡存在，但**唯讀功能已暫停未實作**，不要在上面加東西，先問使用者。
- `WAREHOUSE`（倉管）：可用主目錄的「貨運派遣」（與 MANAGER 同）。除此之外沒有其他入口。
- **派遣單分兩種，靠 `DispatchOrder.carrier` 區分**：`SELF`＝自家送貨人員（原有流程，有座標／路線／導航）；
  `新竹貨運`／`大榮貨運`＝交給貨運行（無座標、無路線、無導航）。
  - **查詢一定要帶 carrier 條件**。`GET /orders` 未指定時預設只回 `SELF`，避免貨運單混進
    物流主管勾選與送貨人員今日名單。`POST /orders/select` 也只吃 `SELF`（貨運單不可指派給司機）。
  - 內勤後台「派遣單／新竹派遣單／大榮派遣單」共用 `OrdersPanel`（傳 `carrier` prop）。
  - 貨運派遣頁 `pages/logi/CarrierDispatch.tsx`：貨品總計＋逐項檢貨＋「已交貨運行」，刻意不做導航。
- 主目錄項目順序：內勤後台(ADMIN) → 路線排程系統(全部) → 檢驗報告／輸入許可證／貨運追蹤／產品報價單(SALES 或 MANAGER)。內勤後台**只在主目錄**，不再放路線排程首頁。
- 權限要**前後端都擋**：後端 `requireRole`（可傳陣列，符合其一即可），前端隱藏按鈕。

## 其他

- monorepo（npm workspaces）：`apps/api`、`apps/web`、`packages/shared-types`。
- 驗證用 `.claude/launch.json` 的 `api`(4000) / `web`(5173) 搭配 preview 工具。
- 檢驗報告 PDF 存在資料庫（`InspectionReport.content` bytea），不是檔案系統——Render 磁碟是暫存的。
- 年份目錄 `ReportYear` 可獨立存在（允許空目錄），年份清單 = 目錄 ∪ 報告實際年份。
- `apps/api/seed-reports.mjs` 是本機工具，掃 `C:\Claude\檢驗報告\20xx檢驗報告` 匯入；會保留主管手動填的日期。
- 輸入許可證 `ImportPermit`：依**產品項目**（`category` = 來源資料夾名，如「A 杏仁粒」）分類，
  **不分年份**；同項目內依 `fileDate` 由新到舊。權限與檢驗報告一致（讀 = SALES/MANAGER，上傳／刪除 = ADMIN）。
  - `fileDate` 取自**檔名的民國日期**（「A 116 11 14」→ 2027-11-14，允許少空白如「11510 02」），
    取不到才用檔案時間。檔名有多個日期時取第一個。
  - 檔名／資料夾名一律**照抄**，不要自作聰明改寫或重新分類。
  - `apps/api/seed-permits.mjs` 掃 `C:\Claude\輸入許可證`；會略過 Thumbs.db／desktop.ini，支援 PDF 與圖檔。
- 產品報價單 `QuoteSheet`（固定 id `singleton`）：**永遠只有一份原始 PDF**，上傳即覆蓋。
  讀取＝SALES／MANAGER，上傳＝ADMIN。只存檔案本身，畫面只有上傳／預覽／下載。
  （曾做過自動判讀表格，因原始 PDF 排版導致少數列判讀有落差、有報錯價風險，使用者要求移除。）
- 貨物追蹤 `Shipment`：新竹／大榮託運報表 PDF，六個目錄 = 業者(2) × 區域(3)，各自保留原報表欄位風格。
  - 解析在 `src/services/shipmentParser.ts`（伺服器端 pdf-parse）。報表右邊界會把長公司名／單號**折行**，
    已用「中文接中文才黏合」處理，改動解析器時務必用真檔驗證。
  - 分區依收件地址縣市；地址沒有縣市時（例如「潮州鎮太平路」）用收貨人比對 `Customer.city` 補，
    再判不出來才歸「未分類」（只有 ADMIN 看得到）。
  - **權限由業務範圍 `salesRegions` 換算**（縣市→北中南），不是另外設定：ADMIN 全部；
    徐文卿／李恭戎→北部、柯月惠→中部、許鴻章→南部。改業務範圍會連動追蹤權限，這是刻意的。
  - 區域過濾在後端強制（越權查其他區回 403），不能只靠前端隱藏。
