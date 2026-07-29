# 把自動匯入設成「登入後自動執行」——放捷徑到啟動資料夾，不需要系統管理員權限。
# 用法： powershell -ExecutionPolicy Bypass -File .\install-startup.ps1
#
# 想改用正式的工作排程（開機即執行、當掉會自動重啟），請改用 install-task.ps1，
# 但那個需要以系統管理員身分執行。

$ErrorActionPreference = "Stop"

if (-not (Test-Path (Join-Path $PSScriptRoot ".env"))) {
    throw "找不到 .env，請先把 .env.example 複製成 .env 並填好 IMPORT_API_KEY。"
}

$node = (Get-Command node -ErrorAction SilentlyContinue)
if (-not $node) { throw "這台電腦找不到 node，請先安裝 Node.js（https://nodejs.org/）。" }

$startup = [Environment]::GetFolderPath("Startup")
$lnkPath = Join-Path $startup "三順派遣單自動匯入.lnk"

$ws = New-Object -ComObject WScript.Shell
$lnk = $ws.CreateShortcut($lnkPath)
$lnk.TargetPath = $node.Source
$lnk.Arguments = "`"$PSScriptRoot\watch.mjs`""
$lnk.WorkingDirectory = $PSScriptRoot
$lnk.WindowStyle = 7   # 最小化
$lnk.Description = "監看派遣單匯出檔並自動匯入三順系統"
$lnk.Save()

Write-Host "已建立登入自動啟動捷徑：$lnkPath"
Write-Host ""
Write-Host "現在就啟動： Start-Process node -ArgumentList '$PSScriptRoot\watch.mjs' -WindowStyle Minimized"
Write-Host "查看紀錄：   Get-Content '$PSScriptRoot\auto-import.log' -Tail 20"
Write-Host "取消自動啟動：Remove-Item '$lnkPath'"
