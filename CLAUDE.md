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

- 前端：https://everbest-web-jade.vercel.app（Vercel）
- 後端：https://sansoon-api-702692123354.asia-east1.run.app（**Cloud Run，2026-08-04 起正式**）
- 舊後端 https://everbest.onrender.com（Render）**還活著但已無人使用**，留著當退路。
  Render 仍會隨 `git push` 自動部署；確認 Cloud Run 穩定後再關閉。
  **關掉之前先確認工作電腦的 `tools/auto-import/.env` 的 `API_BASE` 已改成 Cloud Run**——
  兩邊連同一個資料庫，打舊網址照樣成功，看不出異狀，關掉那天才會無聲停止匯入。
- **Vercel 的 GitHub 自動部署目前是壞的**，前端要用 `npx vercel --prod` 手動發佈。
- Cloud Run 部署方式、環境變數、IAM 權限見 `docs/cloud-run.md`。
  **後端改完不會自己上線**，要跑 `gcloud run deploy sansoon-api --source . --region asia-east1`。
- Cloud Run 不跑 `prisma migrate deploy`（多實例會互相衝突），
  **migration 要從本機手動套用**：`cd apps/api && npx prisma migrate deploy`。
  這跟 Render 時代不同——以前 push 上去就自動跑了，現在漏掉會出現「欄位不存在」的錯。
- Cloud Run 會**同時起多個實例**：任何存在記憶體的狀態都不可靠。
  目前登入失敗鎖定（`routes/auth.ts` 的 `fails` Map）就是記憶體計數，多實例下門檻會變寬鬆。
- Render 啟動時會跑 `prisma migrate deploy`，所以 **migration 檔一定要 commit**。
- Render Start Command 指向巢狀路徑 `apps/api/dist/apps/api/src/index.js`（因 tsc rootDir 受 path-mapped shared-types 影響）。改建置設定時注意。
  `apps/api` 的 `start` script 也指同一個路徑。**若哪天 api 不再 import shared-types，輸出會變回 `dist/src/`，兩邊都要改。**
- `build` 會先 `rm -rf dist` 再 tsc：曾經發生 Render 顯示 deploy live、實際卻在跑舊的編譯結果
  （2026-07-22，`/auth/change-password` 一直 404）。**部署後要驗證的是「新端點真的存在」，不是看 Render 的綠勾。**
  快速驗法：`curl -X POST <api>/auth/login` 看回應欄位有沒有新版才有的欄位。
- Render 免費方案會休眠，閒置後第一次請求可能要等 30–60 秒才醒來（不是壞掉）。
- 使用者回報「按了沒反應／404」時，先確認是否部署還沒跑完或 PWA 快取舊版，再懷疑程式。

## Windows / Git Bash 陷阱

- **中文參數不能直接寫在指令列**（curl `-d`、`node -e`）會變亂碼或 exit 26。
  改用 `--data-binary @file.json`、`-F 'files=@/tmp/ascii.pdf;filename=中文.pdf'`，或寫成 `.mjs` 檔執行。
  → 出現亂碼多半是 shell 編碼問題，**不是程式的 bug**，別急著「修」。
- **PowerShell 管線會在字串開頭塞 UTF-8 BOM**。`"值" | some.cmd` 餵給外部程式時，
  對方收到的是 `﻿值`。2026-08-04 就是這樣把 Vercel 的 `VITE_API_BASE_URL`
  設成 `﻿https://...`，前端因為「開頭不是 http」而當成相對路徑，
  **整站每個 API 呼叫都變成 404**，而且 bundle 裡搜得到網址字串、看起來完全正常。
  → 要餵值給外部程式，改用 `cmd /c "prog args < file.txt"`，
  檔案用 Node 寫（`writeFileSync(p, s, {encoding:'latin1'})`）確保無 BOM。
  → **驗證不能只看「字串有沒有出現」**，要看前後文（`sa="https://` 才對）或直接在瀏覽器發一次請求。
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
  - 排查用 `GET /health`：會回 `startedAt`／`corsRestricted`／`corsCount`／`hasJwtSecret`（只有布林與數量，不吐內容）。
    曾發生 Render 環境變數畫面上看起來設好了、程式卻讀不到（`corsCount:0`），
    多半是**變數名稱結尾多了空白**——整列刪掉重打即可。**判斷有沒有生效看這個端點，不要看 Render 畫面。**
- 密碼規則見 `utils/password.ts`（前端 `lib/password.ts` 有同一份，改規則兩邊一起改）：
  至少 6 個字、不能有空白。新增人員／修改密碼／重設後設定新密碼都走這個檢查。
- 忘記密碼＝主管按「重設密碼」，系統發一組**一次性 6 位臨時密碼**（只在該次回應顯示，
  資料庫只存雜湊），本人用它登入後 `mustChangePassword` 會把他鎖在 `/password` 直到設定新密碼。
  - **不要改成「清空密碼讓本人自己設定」**：那段空窗期任何知道姓名的人都能搶先接管帳號
    （尤其是 ADMIN 帳號）。使用者已在 2026-07-22 確認採用臨時密碼這個做法。
  - 修改密碼一定要驗舊密碼，否則撿到未登出的手機就能把本人鎖在外面。
- `requireAuth` **每次請求都回資料庫查帳號**（非同步），不能只信 JWT：
  - 帳號已刪除 → 401（否則離職者手上的 token 還能用到 30 天過期）。
  - **角色一律以資料庫為準**，token 裡的舊角色不算數（收回 ADMIN 立刻生效，不必等重新登入）。
  - 簽發時間早於 `passwordChangedAt` 的 token 一律作廢（改密碼／主管重設密碼會踢掉既有登入）。
  - token 裡自帶 `iatMs`（毫秒），因為 JWT 內建的 `iat` 只到秒，
    「改密碼前一刻的舊 token」跟「改完立刻簽的新 token」會落在同一秒而分不出來。
  - 因此 `/auth/change-password` **一定要回傳新 token 且前端要存起來**，否則本人改完密碼會把自己登出。
- 授權原則：**每個會改資料的端點都要驗證擁有權或角色**，不能只靠前端隱藏按鈕。
- `xlsx@0.18.5` 有已知漏洞（prototype pollution／ReDoS）且 **npm 上沒有修好的版本**（SheetJS 改在自家 CDN 發佈）。
  目前只有 ADMIN 能上傳 Excel（客戶匯入），暴露面小。若要真正修掉得改用
  `https://cdn.sheetjs.com/...` 的 tarball，屬於換相依來源，動之前先問使用者。
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
| DRIVER | 邱炫誠、李恭戎（業務兼司機，所以同時是 SALES） |
| SALES | 李世鵬、李世斌、徐文卿、李恭戎、柯月惠、許鴻章 |

- 檢驗報告／輸入許可證一致：預覽／下載／分享 = SALES 或 MANAGER；
  **上傳／修改報告日期／刪除／新增年份 = ADMIN**（徐文卿只能看與分享，不能改任何東西）。
- `MANAGER_VIEW`／`DRIVER_VIEW` 角色在資料裡存在，但**唯讀功能已暫停未實作**，不要在上面加東西，先問使用者。
- `WAREHOUSE`（倉管）：
  - 「貨運派遣」（與 MANAGER 同）：**可操作**，逐項檢貨與標記已交貨運行。
  - 物流管理（`ManagerSelect`，路線排程系統底下）：**唯讀**。用 `canEdit = roles.includes("MANAGER")`
    收掉「重新指派」鈕；後端本來就擋（`/orders/auto-assign`、`PUT /orders/:id` 要 MANAGER，
    `PATCH` 狀態／檢貨對 `SELF` 單會因為不是被指派的司機而 403）。**加唯讀畫面時不要順手放寬後端。**
  - 除此之外沒有其他入口（沒有內勤後台、業務模式、檢驗報告等）。
### 派遣單匯入即自動指派（2026-08-04 起）

自家配送（`SELF`）的派遣單**匯入當下就直接指派給送貨人員**，不再停在「待處理」等物流管理勾選。

- 分工存在 `Staff.dispatchCities`（逗號分隔縣市）。**空字串／NULL＝後備**，接收其他人沒認領的縣市。
  目前：李恭戎＝`台北市`，邱炫誠＝後備。改分工從內勤後台「人員→配送縣市」，**不要寫死在程式裡**。
- 多個後備時取 `createdAt` 最早的那位（`loadDrivers` 已排序），確保結果穩定。
  這也表示**新增送貨人員不會突然搶走既有的單子**——新人預設是後備但排在後面，拿不到東西，
  要真的接單必須明確勾選縣市。
- 找不到對應的人就留在 `PENDING` 並通知主管，**絕不硬塞給某個人**。
  物流管理首頁會跳警告並提供「重新指派」（`POST /orders/auto-assign`，限 MANAGER／ADMIN）。
  **那個端點看起來沒人用也不要刪**——「派遣單勾選」畫面移除後，它是唯一能讓卡住的單子動起來的路。
  正常情況警告不會出現，因為有人是後備（目前邱炫誠）就一定分得掉。
- 匯入後會對**有新單子進來**的送貨人員跑 `resequenceByCity()`：依 台北→新北→基隆→桃園→其他
  重排 `routeSequence` 並把 `routeOrderManual` 設為 true（＝照這個順序走，不自動重排最短路徑）。
  送貨人員畫面有「依縣市排序」／「改用最短路徑」兩顆按鈕可切換，目前生效的那顆會反白。
  - **只在「有新增」時重排，純更新不重排**。watcher 會定期重送同一份檔案，
    若連純更新也重排，送貨人員自己拖好的順序每隔十幾分鐘就會被打回縣市順序。

### watcher 會定期重送當天的派遣單（2026-08-04 起）

`tools/auto-import/watch.mjs` 原本只在「檔案內容變了」才送。問題是資料一旦被刪掉，
檔案沒動過就永遠不會再送，使用者看到的就是「自動匯入壞掉了」（已發生兩次）。

- 當天的派遣單每 `RECHECK_MINUTES`（預設 15）分鐘強制重送一次，誤刪的資料會自己補回來。
- 被標記 `CANCELLED` 的**不會**復活（匯入時會略過），所以刻意刪除仍然有效。
- 跳過檔案時會把原因寫進 `auto-import.log`（路徑不對／修改時間不是今天／內容相同／匯入失敗）。
  **排查「為什麼沒進來」先看這個日誌**，不要從後端開始猜——後端已經驗證過會正確處理。
- `todayOnly` 看的是**檔案修改時間**。用複製／同步工具搬檔案而保留原時間戳的話，
  會一直被判定成「不是今天」而跳過。
- **已指派過的單子重新匯入時不會重新指派**：主管手動改過送貨人員的話，那個調整要保留。

### 刪除派遣單一律是軟刪除（`status = "CANCELLED"`）

送貨人員與倉管的「刪除」走 `PATCH /orders/:id/status`，**不是** `DELETE /orders/:id`（那條仍限 ADMIN）。

- **絕對不要改成真的刪除**：watcher 每 15 分鐘會重送當天的 ERP 檔案（見下），
  真刪掉的單子下一輪就會原樣長回來，使用者會以為刪除功能壞了。
  內勤後台的刪除也是軟刪除；只有「已刪除」分頁上的刪除才是真的清掉。
- `GET /orders` 未指定 status 時**不回傳 CANCELLED**；要查被刪掉的要明確帶 `status=CANCELLED`
  （內勤後台的「已刪除」分頁就是這樣做的）。
- 匯入的更新規則也跟著改：只有 `PENDING`／`SELECTED` **且完全沒有品項被檢貨**的單子才會被更新內容
  （更新會 `deleteMany` 重建品項，檢貨勾選會一起消失）。其餘一律略過。
- `DispatchOrder.inRoute`＝送貨人員勾選「這趟送不送」。取消勾選的單子**留在名單上但不排進路線**，
  跟刪除是兩回事，不要混用。

### 物流管理＝統計入口（2026-08-04 改）

「派遣單勾選」整個移除（連同 `POST /orders/select` 端點與配送層級的優先標記），
`ManagerSelect` 改成資料夾式首頁：

- **派遣單管理**（`OrdersPanel`，`allowImport={false}`）
- **北部**（`carrier=SELF`）／**新竹**／**大榮**／**永昌**／**回頭車**：
  各自的「貨品數量統計（已指派）」。管道清單直接來自 `lib/carriers.ts`，不要另外寫死。
- **總計**：所有管道加總，另附各管道明細，否則只有一個大數字沒辦法核對

「已指派」的定義寫在 `isActive()`：自家配送＝`SELECTED`／`DISPATCHED`；
貨運行＝還沒交出去（非 `COMPLETED`）。改統計範圍改那一個函式就好。

`OrdersPanel` 的狀態篩選**沒有「待處理」**（使用者 2026-08-04 決定）。
那些單子仍在「全部」裡看得到，物流管理首頁也會跳警告，不需要再佔一個分頁。

- **派遣單靠 `DispatchOrder.carrier` 區分**：`SELF`＝自家送貨人員（原有流程，有座標／路線／導航）；
  `新竹貨運`／`大榮貨運`／`永昌貨運`／`回頭車`＝交給外部配送（無座標、無路線、無導航）。
  - 清單定義在**兩個地方**：後端 `routes/orders.ts` 的 `CARRIERS`、前端 `lib/carriers.ts`
    的 `DISPATCH_CARRIERS`。**加業者要兩邊一起改**，只改一邊會在匯入時被「配送方式不正確」擋下。
    改完這兩處，內勤後台分頁、貨運派遣磁磚、物流管理統計資料夾都會自動跟著長出來。
  - **貨物追蹤（`Shipment`）的業者清單是另一回事**（`routes/shipments.ts` 也有一個 `CARRIERS`）：
    只有新竹與大榮會給託運報表 PDF，**不要因為派遣單多了永昌／回頭車就一起加進去**。
  - **查詢一定要帶 carrier 條件**。`GET /orders` 未指定時預設只回 `SELF`，避免貨運單混進
    送貨人員今日名單。自動指派也只吃 `SELF`（貨運單不可指派給司機）。
  - 內勤後台「派遣單／新竹派遣單／大榮派遣單」共用 `OrdersPanel`（傳 `carrier` prop）。
    物流主管的「派遣單管理」也是同一個元件，但傳 `allowImport={false}`——
    **匯入 CSV 只在內勤後台**，物流主管不匯入派遣單（即使本人兼 ADMIN 也不顯示）。
  - 貨運派遣頁 `pages/logi/CarrierDispatch.tsx`：貨品總計＋逐項檢貨＋「已交貨運行」＋刪除，
    刻意不做導航，也**刻意不做勾選**（使用者 2026-08-04 指定：要刪除但不要勾選）。
  - **三家 CSV 欄位不同**（`importParser.ts` 以別名容錯處理）：
    自家有「出貨日期」；大榮有「出貨日期＋出貨編號之第一筆＋重量」；
    **新竹沒有出貨日期欄**，日期改從「出貨編號之第一筆」開頭取（`2026/7/21M1065-0` → 2026-07-21）。
    新竹另有「序號」「商品別編號」兩個用不到的欄位。
  - 有出貨編號時用它當 `customerCode`，避免同日同客戶的不同單被合併成一筆。
- 主目錄項目順序：內勤後台(ADMIN) → 路線排程系統(全部) → 檢驗報告／輸入許可證／貨運追蹤／產品報價單(SALES 或 MANAGER)。內勤後台**只在主目錄**，不再放路線排程首頁。
- 權限要**前後端都擋**：後端 `requireRole`（可傳陣列，符合其一即可），前端隱藏按鈕。
- 判斷誰是送貨人員一律用 `rolesToArray().includes("DRIVER")`，
  **不要用字串 `contains "DRIVER"`**（會誤中唯讀的 `DRIVER_VIEW`）。
  指派到非司機的帳號會讓派遣單卡死沒人看得到。
- 派遣單清單依縣市分區，順序是使用者指定的**送貨慣用順序**
  `台北市→新北市→基隆市→桃園市→其他`（見 `lib/taiwanCities.ts` 的 `DISPATCH_CITIES`），
  **不是**由北到南的 `TAIWAN_CITIES`，兩者不要互相取代。
  - **只有自家配送分區**（`OrdersPanel`、`ManagerSelect` 的北部統計、送貨人員今日派遣單）；
    貨運行的單子送全台各地，分區沒意義，維持單一清單。
- 只要畫面上列出貨品數量，該客戶那列尾端就要有 `QtySubtotal`（單張派遣單的數量小計）。
  跟 `ProductSummary` 的「全部貨品總計」不同層級：小計＝這一家，總計＝這批全部。
  目前四處：`OrdersPanel`、`ManagerSelect`、`CarrierDispatch`、`RouteTimeline`（送貨人員路線）。
- 清單列出客戶時，`customerCode` 與 `customerName` 相同就只印一次——
  自家配送的單子沒有出貨編號時 code 會直接沿用公司名，兩個都印會變成同一個名字連續出現兩次。

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
