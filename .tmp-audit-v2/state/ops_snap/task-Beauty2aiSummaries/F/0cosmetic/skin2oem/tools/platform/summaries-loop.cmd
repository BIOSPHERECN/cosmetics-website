@echo off
chcp 65001 >nul
rem Beauty2AI summaries loop (task Beauty2aiSummaries, every 2 hours): keep writing product summaries + EN titles until the library is covered.
rem Lock file holds this run's id; only the run that wrote it deletes it (09-21 19:1x: two overlapping runs kept deleting each other's lock).
cd /d F:\0cosmetic\skin2oem
set PYTHONIOENCODING=utf-8
if exist data\summaries-loop.lock (
  rem 09-22 01:1x: a run killed mid-way leaves a stale lock; older than 3 hours = stale, remove and continue
  powershell -NoProfile -Command "if ((Get-Date) - (Get-Item 'data\summaries-loop.lock').LastWriteTime -gt (New-TimeSpan -Hours 3)) { Remove-Item 'data\summaries-loop.lock'; exit 1 } else { exit 0 }"
  if not errorlevel 1 (
    echo %date% %time% skip: lock exists >> data\summaries-loop.log
    exit /b 0
  )
  echo %date% %time% stale lock removed >> data\summaries-loop.log
)
set RUNID=%RANDOM%%RANDOM%
<nul set /p "=%RUNID%" > data\summaries-loop.lock
rem 09-22 05:5x: echo added a trailing space so LOCKID never equalled RUNID and the lock was never deleted; set /p writes the bare id
rem 09-22 17:1x: summaries moved to the cloud worker (bohui-automation .github/workflows/summaries.yml, every 2 hours, model pool x6 threads);
rem local run is only a fallback now: 1100 -> 200 so it neither hogs this machine nor races the cloud for the same rows
python tools\platform\product_summaries.py --limit 200 >> data\summaries-loop.log 2>&1
python tools\platform\sync-summaries.py >> data\sync-summaries.log 2>&1
python tools\platform\title-en.py --limit 3000 >> data\title-en.log 2>&1
set /p LOCKID=<data\summaries-loop.lock
if "%LOCKID%"=="%RUNID%" del data\summaries-loop.lock
echo %date% %time% done %RUNID% >> data\summaries-loop.log
