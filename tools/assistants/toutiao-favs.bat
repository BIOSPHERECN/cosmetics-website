@echo off
rem Pull founder's Toutiao favorites into local knowledge base twice a day (founder 2026-09-18: auto, not manual).
rem Task: Bohui-ToutiaoFavs. Keep this file ASCII-only (cmd reads .bat as ANSI).
setlocal
set PYTHONUTF8=1
cd /d F:\0cosmetic\cosmetic-sites
python tools\assistants\toutiao-favs.py >> tools\_toutiao-favs.log 2>&1
endlocal
