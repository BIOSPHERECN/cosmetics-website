@echo off
rem Weekly social drafts (task Bohui-SocialWeekly, Monday 08:00). Since 2026-09-24: runs drafts.py (was content-weekly.py).
rem Output stops at pending human review in F:\0cosmetic\<assistant-delivery>\10-<social>\<YYYY-Www>\<drafts-auto>\ ; no DB write, no publish.
rem Rollback: copy weekly.bat.bak-0924-content-weekly over this file.
rem Keep this file ASCII-only: cmd reads .bat as ANSI, UTF-8 comments broke market/daily.bat on 2026-09-16.
rem 2026-09-24 S08: dry-run first; it runs the gate self-test and probes gateway 127.0.0.1:8788 (log line shows gateway status).
rem If the probe fails, start task Bohui-Gateway (keeper loop; exits 3 at once if an instance already holds the port), wait 20s, probe again.
cd /d F:\0cosmetic\cosmetic-sites
set PYTHONUTF8=1
set PYTHONUNBUFFERED=1
if not exist logs mkdir logs
echo ==== %date% %time% start drafts.py >> logs\social-weekly.log
python tools\social\drafts.py --dry-run >> logs\social-weekly.log 2>&1
if errorlevel 1 (
  echo [gateway probe failed, starting Bohui-Gateway] >> logs\social-weekly.log
  schtasks /run /tn Bohui-Gateway >> logs\social-weekly.log 2>&1
  ping -n 21 127.0.0.1 >nul
  python tools\social\drafts.py --dry-run >> logs\social-weekly.log 2>&1
)
python tools\social\drafts.py >> logs\social-weekly.log 2>&1
echo [exit %ERRORLEVEL%] >> logs\social-weekly.log
