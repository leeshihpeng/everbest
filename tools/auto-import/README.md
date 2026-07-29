# 派遣單自動匯入

監看公司電腦上的三個資料夾，當日有新的匯出檔就自動送到系統。

| 資料夾 | 進到系統的分頁 |
|---|---|
| `C:\server\出貨派遣` | 派遣單（自家配送） |
| `C:\server\新竹貨運` | 新竹派遣單 |
| `C:\server\大榮貨運` | 大榮派遣單 |

後端跑在 Render 雲端、讀不到公司電腦的磁碟，所以這支程式**必須在公司這台電腦上執行**；
電腦關機或睡眠時不會匯入，開機後會自動補上當天還沒匯入的檔案。

## 一、設定金鑰（只需做一次）

1. 產生一組金鑰（PowerShell）：

```powershell
[Convert]::ToBase64String((1..32|%{Get-Random -Max 256}))
```

2. 到 Render → everbest 服務 → Environment，新增環境變數
   `IMPORT_API_KEY`，值就是上一步產生的字串，儲存後等服務重啟。
   （**變數名稱結尾不要有空白**，Render 曾發生過看起來設好、程式卻讀不到的情況。）

3. 確認後端真的讀到了：開 <https://everbest.onrender.com/health>，
   `hasImportKey` 要是 `true`。

4. 把 `.env.example` 複製成 `.env`，`IMPORT_API_KEY` 填入同一組字串。

這組金鑰**只能用來匯入派遣單**，不能查客戶、改人員或刪資料，所以不需要在電腦上存放任何人的帳號密碼。

## 二、手動試跑

```powershell
node C:\Claude\route-scheduler\tools\auto-import\watch.mjs
```

畫面會顯示監看中的資料夾，有匯入時會列出「新增／更新／略過」筆數。
同樣的記錄也會寫進同目錄的 `auto-import.log`。

## 三、設成開機自動執行

以系統管理員開啟 PowerShell，執行同目錄的：

```powershell
powershell -ExecutionPolicy Bypass -File C:\Claude\route-scheduler\tools\auto-import\install-task.ps1
```

會建立一個名為 `三順派遣單自動匯入` 的工作排程，開機後自動在背景執行。
要停用：`Unregister-ScheduledTask -TaskName 三順派遣單自動匯入`。

## 搬到另一台電腦（例如工作電腦）

1. 那台電腦要先裝 [Node.js](https://nodejs.org/)（LTS 版即可）。
2. 把整個 `tools\auto-import` 資料夾複製過去（`state.json`、`auto-import.log` 可以不用帶）。
3. 編輯 `.env`：`IMPORT_API_KEY` 保持同一組；`DIR_SELF`／`DIR_HSINCHU`／`DIR_DALEN`
   改成那台電腦上實際的資料夾路徑。
4. 在那台電腦執行一次 `install-task.ps1` 註冊排程。
5. 原本這台電腦如果不再需要，執行 `Unregister-ScheduledTask -TaskName 三順派遣單自動匯入` 停掉，
   避免兩台同時匯入（同時跑其實也不會產生重複資料，但日誌會比較亂）。

## 重覆匯入不會產生重複派遣單

- 檔案內容沒變（SHA-256 相同）就不會重送。
- 就算重送，後端以「配送方式＋送貨日期＋客戶代號」判斷是不是同一張單：
  - 還沒開始作業（待處理）→ 更新內容
  - 已勾選配送／已檢貨／已完成 → **不動它**，只回報略過，不會蓋掉現場的作業狀態
- 檔案還在寫入時（大小或時間戳還在變）會等下一輪，不會匯入到半截的檔案。
