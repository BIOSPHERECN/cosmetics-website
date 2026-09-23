@echo off
rem Daily market snapshot: crawl Amazon bestsellers -> load D1 -> weekly report. Task: BohuiMarketDaily 06:30.
rem NOTE: keep this file ASCII-only. cmd reads .bat as ANSI; UTF-8 Chinese comments broke it on 2026-09-16.
cd /d F:\0cosmetic\cosmetic-sites
for /f "usebackq tokens=1,* delims==" %%a in (`findstr /r "^CLOUDFLARE_" .env`) do set "%%a=%%b"
set PYTHONUTF8=1
python tools\market\amazon_bestsellers.py --pages 2 >> data\market\daily.log 2>&1
python tools\market\load.py >> data\market\daily.log 2>&1
python tools\market\report.py >> data\market\daily.log 2>&1
python tools\fx_rates.py >> data\market\daily.log 2>&1
