# 派遣單自動匯入

監看公司電腦上的三個資料夾，當日有新的匯出檔就自動送到系統。

| 檔案 | 進到系統的哪裡 |
|---|---|
| `C:\server\出貨派遣\*.csv`／`*.txt` | 派遣單（自家配送） |
| `C:\server\新竹貨運\*.csv` | 新竹派遣單 |
| `C:\server\大榮貨運\*.csv` | 大榮派遣單 |
| `C:\server\新竹貨運\**\pdfSummary*.pdf` | 貨物追蹤（新竹託運報表） |
| `C:\server\大榮貨運\**\ReportDetails*.pdf` | 貨物追蹤（大榮託運報表） |

託運報表放在 `202607` 這類年月子資料夾裡，所以會連子資料夾一起找（往下最多三層）。

- **派遣單**只處理「當天更新」的檔案，避免把前幾天的舊檔又匯一次。
- **託運報表**不限日期，只要內容有變就重新匯入，並覆蓋同一天的上次版本。

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

## 三、設成自動執行

**方式 A：登入後自動執行（不需要系統管理員權限，建議先用這個）**

```powershell
powershell -ExecutionPolicy Bypass -File C:\Claude\route-scheduler\tools\auto-import\install-startup.ps1
```

會在「啟動」資料夾放一個捷徑，每次登入 Windows 後自動以最小化視窗執行。
取消：把 `啟動` 資料夾（`shell:startup`）裡的「三順派遣單自動匯入」捷徑刪掉即可。

**方式 B：工作排程（需要系統管理員權限）**

好處是開機就跑（不必等登入）、程式當掉會自動重啟。
以**系統管理員**開啟 PowerShell 後執行：

```powershell
powershell -ExecutionPolicy Bypass -File C:\Claude\route-scheduler\tools\auto-import\install-task.ps1
```

要停用：`Unregister-ScheduledTask -TaskName 三順派遣單自動匯入`。

> 兩種方式擇一即可，不要同時裝。

**注意**：`.ps1` 檔請保持 UTF-8 **含 BOM** 的存檔格式，否則 Windows PowerShell 5.1
會把中文當成 Big5 解讀而出現語法錯誤。

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
- 同時只允許一個監看程式執行（`watch.lock`）；重複啟動的那個會自己結束，
  否則兩邊共用狀態檔會互相覆蓋而重覆匯入。
- 上一輪還沒跑完就不會開下一輪（Render 冷啟動可能要 30–60 秒）。
