# 把自動匯入註冊成 Windows 工作排程（開機自動在背景執行）
# 用法（系統管理員 PowerShell）：
#   powershell -ExecutionPolicy Bypass -File .\install-task.ps1

$ErrorActionPreference = "Stop"
$taskName = "三順派遣單自動匯入"
$script = Join-Path $PSScriptRoot "watch.mjs"

if (-not (Test-Path (Join-Path $PSScriptRoot ".env"))) {
    throw "找不到 .env，請先把 .env.example 複製成 .env 並填好 IMPORT_API_KEY。"
}

$node = (Get-Command node).Source
Write-Host "Node: $node"
Write-Host "監看程式: $script"

# -WindowStyle Hidden 讓它在背景跑，不跳出黑視窗
$action = New-ScheduledTaskAction -Execute $node -Argument "`"$script`"" -WorkingDirectory $PSScriptRoot
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartInterval (New-TimeSpan -Minutes 5) -RestartCount 999

if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    Write-Host "已移除舊的排程，重新建立"
}

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description "監看 C:\server 下的派遣單匯出檔並自動匯入三順系統" | Out-Null
Start-ScheduledTask -TaskName $taskName

Write-Host ""
Write-Host "已建立並啟動排程「$taskName」"
Write-Host "查看狀態: Get-ScheduledTask -TaskName '$taskName'"
Write-Host "查看紀錄: Get-Content '$PSScriptRoot\auto-import.log' -Tail 20"
Write-Host "停用排程: Unregister-ScheduledTask -TaskName '$taskName'"
