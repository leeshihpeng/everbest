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

- 檢驗報告：預覽／下載／分享 = SALES 或 MANAGER；**刪除／匯入／新增年份 = ADMIN**（徐文卿不可刪除）。
- 修改報告日期目前是 MANAGER（徐文卿可改）——使用者尚未決定是否收緊，動之前先問。
- `MANAGER_VIEW`／`DRIVER_VIEW` 角色在資料裡存在，但**唯讀功能已暫停未實作**，不要在上面加東西，先問使用者。
- 權限要**前後端都擋**：後端 `requireRole`（可傳陣列，符合其一即可），前端隱藏按鈕。

## 其他

- monorepo（npm workspaces）：`apps/api`、`apps/web`、`packages/shared-types`。
- 驗證用 `.claude/launch.json` 的 `api`(4000) / `web`(5173) 搭配 preview 工具。
- 檢驗報告 PDF 存在資料庫（`InspectionReport.content` bytea），不是檔案系統——Render 磁碟是暫存的。
- 年份目錄 `ReportYear` 可獨立存在（允許空目錄），年份清單 = 目錄 ∪ 報告實際年份。
- `apps/api/seed-reports.mjs` 是本機工具，掃 `C:\Claude\檢驗報告\20xx檢驗報告` 匯入；會保留主管手動填的日期。
