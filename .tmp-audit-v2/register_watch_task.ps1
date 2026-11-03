# 审核部 v2.1 · 注册每小时巡查计划任务 Bohui-AuditWatch(本线只写好,不执行;创始人或主线确认后手动跑一次)
# 用法(管理员 PowerShell):powershell -NoProfile -ExecutionPolicy Bypass -File F:\0cosmetic\tools-review\audit_v2\register_watch_task.ps1
# 做两件事:①注册任务:每小时第 47 分钟,wscript + run-hidden.vbs 调 watch.cmd(低优先级、单核),超时 10 分钟(本机只剩 7890 代理,网络抖时单次实测到过 6 分钟),不叠跑;
#          ②把这个任务登记进审核部的计划任务登记表(state/tasks.json),否则巡查会把它自己报成「没登记」。
$ErrorActionPreference = 'Stop'
$AV2 = 'F:\0cosmetic\tools-review\audit_v2'
if (-not (Test-Path "$AV2\cache\gate_approved\audit_v2\watch.py")) { throw '已批准副本不在(cache\gate_approved),先完成闸门批准再注册' }
$act = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument ('//B "F:\0cosmetic\cosmetic-sites\tools\run-hidden.vbs" "' + $AV2 + '\watch.cmd"') -WorkingDirectory $AV2
$start = (Get-Date).Date.AddHours((Get-Date).Hour).AddMinutes(47)
if ($start -lt (Get-Date)) { $start = $start.AddHours(1) }
$trg = New-ScheduledTaskTrigger -Once -At $start -RepetitionInterval (New-TimeSpan -Hours 1)
$set = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes 10) -MultipleInstances IgnoreNew -StartWhenAvailable
$pri = New-ScheduledTaskPrincipal -UserId 'Administrator' -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName 'Bohui-AuditWatch' -Action $act -Trigger $trg -Settings $set -Principal $pri `
  -Description '审核部 v2.1 每小时巡查(部署对账/台账链/追审/闸门漂移/计划任务/Jev 账本/轻冒烟/GitHub 工作流/hook 自检),:47 跑' -Force | Out-Null
& 'F:\0cosmetic\_venv\review\Scripts\python.exe' "$AV2\cache\gate_approved\audit_v2\ops.py" baseline-task Bohui-AuditWatch --reason '审核部巡查任务首次注册(register_watch_task.ps1)'
Write-Output "已注册 Bohui-AuditWatch,首次运行 $start;日志 $AV2\logs\watch.log"
