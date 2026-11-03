# 保底定时:w8848/bohui-automation 的 schedule 从不触发(09-24 查因未果),由本机计划任务 Bohui-GhDispatch-<wf> 按原定时刻手动触发。
# 自愈:若该工作流近一个周期内(packjob 2h/health 10h/其余 26h)已有 schedule 运行(云端定时恢复了),本次跳过,不重复烧分钟。
# 不切换 gh 活动账号:只取 w8848 令牌放进本进程 GH_TOKEN,别的线不受影响。
param([Parameter(Mandatory)][ValidateSet('packjob','health','news-cn','trend-media')][string]$Workflow)
$ErrorActionPreference = 'Stop'
$repo = 'w8848/bohui-automation'
$log  = 'F:/0cosmetic/bohui-automation/local/logs/gh-dispatch.log'
function Log($m) { Add-Content -Path $log -Encoding utf8 -Value ("{0} [{1}] {2}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Workflow, $m) }
try {
  $env:GH_TOKEN = (gh auth token --user w8848).Trim()
  if (-not $env:GH_TOKEN) { throw '取不到 w8848 令牌' }
  $env:GH_PROMPT_DISABLED = '1'
  # 网络:直连 → 7890 → 1082,每次调用都轮换(本机网络时通时断)
  # 09-24 S05:每次 gh 限 40 秒,超时就杀掉换下一条网(wscript 起的是脱离进程,计划任务的 5 分钟上限杀不到它)
  function Invoke-Gh {
    foreach ($p in @('', 'http://127.0.0.1:7890', 'http://127.0.0.1:1082')) {
      $env:HTTPS_PROXY = $p
      $psi = [Diagnostics.ProcessStartInfo]::new('gh.exe'); foreach ($a in $args) { $psi.ArgumentList.Add([string]$a) }
      $psi.UseShellExecute = $false; $psi.RedirectStandardOutput = $true; $psi.RedirectStandardError = $true
      $pr = [Diagnostics.Process]::Start($psi); $out = $pr.StandardOutput.ReadToEndAsync(); $null = $pr.StandardError.ReadToEndAsync()
      if (-not $pr.WaitForExit(40000)) { try { $pr.Kill($true) } catch {}; continue }
      if ($pr.ExitCode -eq 0) { return $out.Result.Trim() }
    }
    throw "gh $($args[0]) 三条网络都不通(每条限 40 秒)"
  }
  $last = Invoke-Gh api "repos/$repo/actions/workflows/$Workflow.yml/runs?event=schedule&per_page=1" --jq '.workflow_runs[0].created_at // ""'
  # 09-24 验收改:窗口按各自周期约 2 倍(原一律 24h:云端只来一次又断时 packjob 会停一整天)
  $win = @{ 'packjob' = 2; 'health' = 10; 'news-cn' = 26; 'trend-media' = 26 }[$Workflow]
  if ($last -and ((Get-Date) - [datetime]$last).TotalHours -lt $win) { Log "跳过:云端定时已恢复(最近 schedule 运行 $last)"; exit 0 }
  # ponytail: 回包丢失(EOF)时换网重发可能重复触发一次;工作流有 concurrency 排队,最坏多 1 次分钟
  Invoke-Gh workflow run "$Workflow.yml" -R $repo --ref main | Out-Null
  Log "已触发(代理='$($env:HTTPS_PROXY)')"
} catch { Log "失败:$_"; exit 1 }
