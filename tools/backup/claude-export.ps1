# 导出 Claude Code 的记忆 + 聊天记录 + 技能 + 设置到指定目录(移动硬盘或任意盘),可在别的电脑复制回同路径。
# 用法:powershell -ExecutionPolicy Bypass -File tools\backup\claude-export.ps1 -Dest E:\claude-backup
# 只复制帛卉项目(projects\F--0cosmetic*)与通用技能;SueAI / 0book / 古方 等其他项目的记忆、会话、专属技能一律不带。
# 只复制文本类资产,跳过 cache/downloads/file-history 等可再生大目录;不改任何设置。
param([string]$Dest = "F:\0cosmetic\_备份\claude")
$src = "$env:USERPROFILE\.claude"
$stamp = Get-Date -Format "yyyyMMdd-HHmm"
$out = Join-Path $Dest $stamp
New-Item -ItemType Directory -Force $out | Out-Null
$items = @(
  @{ from = "projects\F--0cosmetic\memory"; to = "projects\F--0cosmetic\memory" },   # 记忆(最重要)
  @{ from = "projects\F--0cosmetic";        to = "projects\F--0cosmetic";  only = "*.jsonl" },  # 聊天记录(会话 JSONL)
  @{ from = "skills";                        to = "skills" },
  @{ from = "plugins";                       to = "plugins" },
  @{ from = "settings.json";                 to = "settings.json" },
  @{ from = "history.jsonl";                 to = "history.jsonl" },
  @{ from = "scheduled-tasks";               to = "scheduled-tasks" }
)
foreach ($i in $items) {
  $s = Join-Path $src $i.from; $d = Join-Path $out $i.to
  if (-not (Test-Path $s)) { continue }
  if ((Get-Item $s).PSIsContainer) {
    New-Item -ItemType Directory -Force $d | Out-Null
    if ($i.only) { Copy-Item (Join-Path $s $i.only) $d -Force -ErrorAction SilentlyContinue }
    else { robocopy $s $d /E /R:1 /W:1 /NFL /NDL /NJH /NJS /XD node_modules cache sueai-fingerprint zero-r2-move | Out-Null }   # 只带帛卉:SueAI/古方线的技能不进帛卉备份
  } else { New-Item -ItemType Directory -Force (Split-Path $d) | Out-Null; Copy-Item $s $d -Force }
}
$mb = [math]::Round(((Get-ChildItem $out -Recurse -File | Measure-Object Length -Sum).Sum)/1MB)
"导出完成 $out · $mb MB"
"还原:把 $out 下的内容复制回 %USERPROFILE%\.claude\ 同路径(另一台机器路径一致即可续用记忆与会话)。"
