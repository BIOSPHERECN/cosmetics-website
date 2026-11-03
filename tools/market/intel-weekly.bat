@echo off
rem Weekly market intel: market x category stats + model report -> D1 market_intel -> /bohui/market-intel/. Task: Bohui-MarketIntel, Monday 07:00.
rem NOTE: keep this file ASCII-only. cmd reads .bat as ANSI; UTF-8 Chinese comments broke daily.bat on 2026-09-16.
cd /d F:\0cosmetic\cosmetic-sites
for /f "usebackq tokens=1,* delims==" %%a in (`findstr /r "^CLOUDFLARE_" .env`) do set "%%a=%%b"
set PYTHONUTF8=1
set PYTHONUNBUFFERED=1
python tools\market\intel-build.py >> tools\_intel.log 2>&1
