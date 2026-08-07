# 重新啟動派遣單自動匯入（不需要重開機）
# 用法： powershell -ExecutionPolicy Bypass -File .\restart.ps1
#
# 改過 watch.mjs 或 .env 之後一定要跑這支，否則跑的還是舊版程式碼／舊設定。
# 會自動判斷是工作排程還是直接執行，兩種安裝方式都處理。

$ErrorActionPreference = "Stop"
$taskName = "三順派遣單自動匯入"
$script = Join-Path $PSScriptRoot "watch.mjs"
$logPath = Join-Path $PSScriptRoot "auto-import.log"

if (-not (Test-Path $script)) { throw "找不到 $script" }

# --- 1. 停掉正在跑的 ---
$running = Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
    Where-Object { $_.CommandLine -and $_.CommandLine -like "*watch.mjs*" }

if ($running) {
    foreach ($p in $running) {
        Write-Host ("停止舊的監看程式 PID {0}" -f $p.ProcessId)
        Stop-Process -Id $p.ProcessId -Force
    }
    Start-Sleep -Seconds 2
} else {
    Write-Host "目前沒有監看程式在跑"
}

# 鎖檔本來就會自己判斷舊程序死了沒，但剛砍掉的那一秒還是清掉比較乾淨
$lock = Join-Path $PSScriptRoot "watch.lock"
if (Test-Path $lock) { Remove-Item $lock -Force }

# --- 2. 重新啟動 ---
$task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($task) {
    Write-Host "用工作排程重新啟動"
    # 排程裡存的是註冊當下的 node 路徑與參數，程式碼是每次啟動才讀，所以不必重新註冊
    Start-ScheduledTask -TaskName $taskName
} else {
    Write-Host "直接啟動（最小化視窗）"
    Start-Process node -ArgumentList "`"$script`"" -WorkingDirectory $PSScriptRoot -WindowStyle Minimized
}

# --- 3. 確認真的換版了 ---
Start-Sleep -Seconds 4
Write-Host ""
Write-Host "--- auto-import.log 最後 12 行 ---"
if (Test-Path $logPath) { Get-Content $logPath -Tail 12 } else { Write-Host "(還沒有日誌，再等幾秒重看一次)" }
Write-Host ""
Write-Host "開頭那行「開始監看 v…」就是目前跑的版本，確認它是新的日期。"
