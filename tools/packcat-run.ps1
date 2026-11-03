# 6 路分片渲染,Idle 优先级 —— 创始人一动电脑,Windows 自动把 CPU 让给他。
# 限速靠猜不可靠,优先级是系统保证的。
$root = "F:\0cosmetic\cosmetic-sites"
Set-Location $root
0..5 | ForEach-Object {
  $i = $_
  $env:PACKCAT_SHARD = "$i/6"
  $p = Start-Process -FilePath "python" -ArgumentList "tools/packcat-pages.py" -WindowStyle Hidden -PassThru -RedirectStandardOutput "$root\tools\packcat-s$i.log" -RedirectStandardError "$root\tools\packcat-s$i.err"
  Start-Sleep -Milliseconds 400
  try { $p.PriorityClass = 'Idle' } catch {}
  "shard $i -> pid $($p.Id)"
}
