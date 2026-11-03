@echo off
rem Assistant progress watch (task BohuiAssistantWatch, every 2 hours 08:00-22:00): merge deliveries, count, append one line to the progress log.
cd /d F:\0cosmetic\cosmetic-sites
for /f "usebackq tokens=1,* delims==" %%a in (`findstr /r "^CLOUDFLARE_" .env`) do set "%%a=%%b"
set PYTHONUTF8=1
python tools\assistants\progress.py >> data\collect\watch.log 2>&1
