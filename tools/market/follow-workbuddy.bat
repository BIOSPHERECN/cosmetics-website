@echo off
rem Follow WorkBuddy deliveries every 30 min (founder 2026-09-17 22:5x). Task: Bohui-FollowWorkBuddy.
rem NOTE: keep this file ASCII-only. cmd reads .bat as ANSI; UTF-8 comments in this file executed as garbage
rem commands on 2026-09-17 23:27 and even reached a "del F:\...\*" prompt. Same lesson as daily.bat.
setlocal
set "ROOT=F:\0cosmetic\cosmetic-sites"
set "LOCK=%TEMP%\follow-workbuddy.lock"
set "LOG=%ROOT%\tools\_follow-workbuddy.log"
set PYTHONUTF8=1
if exist "%LOCK%" ( echo [%date% %time%] previous run still going, skip >> "%LOG%" & exit /b 0 )
echo run > "%LOCK%"
cd /d "%ROOT%"
echo ===== %date% %time% ===== >> "%LOG%"
python tools\market\import_wb_json.py --apply >> "%LOG%" 2>&1
python tools\market\import_hot.py --apply >> "%LOG%" 2>&1
python tools\market\hot_zh.py --apply --limit 800 >> "%LOG%" 2>&1
rem product-ingredient index for ingredient pages (GPT V1.0 product_ingredients; exact key, no PEG-8/PEG-80 substring hits)
python tools\market\inci_index.py --only-missing >> "%LOG%" 2>&1
rem AI-written intros for new products (founder 09-17 23:0x: never copy crawled text)
python tools\market\product_summaries.py --limit 240 >> "%LOG%" 2>&1
rem Daily seen record for ingredient trends (governance 2026-09-18, idempotent)
python tools\market\seen-daily.py >> "%LOG%" 2>&1
if exist "%LOCK%" del /q "%LOCK%"
endlocal
