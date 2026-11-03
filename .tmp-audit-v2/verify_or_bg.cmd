@echo off
rem Audit v2.1 wrangler custom build step (build.command in dist wrangler config). ASCII only.
rem Break-glass first (BOHUI_BREAKGLASS >= 6 non-space chars, counted by system python -I -S bg_log.py),
rem otherwise ticket.py verify --stage wrangler. If python/bg_log itself is broken: non-empty counts (len_unchecked).
setlocal
set "HERE=%~dp0"
set "PYS=C:\Users\Administrator\AppData\Local\Programs\Python\Python312\python.exe"
set "PYV=F:\0cosmetic\_venv\review\Scripts\python.exe"
set "LG=%HERE%ledger"
if exist "%HERE%..\..\..\ledger\" set "LG=%HERE%..\..\..\ledger"
if not defined BOHUI_BREAKGLASS goto verify
"%PYS%" -I -S "%HERE%bg_log.py" --layer build.command --worker %1 --from-env
if %errorlevel%==0 exit /b 0
if %errorlevel%==5 goto verify
if not exist "%LG%\" mkdir "%LG%"
echo {"ts":"%date% %time%","layer":"build.command","worker":"%1","len_unchecked":true}>>"%LG%\breakglass.jsonl"
exit /b 0
:verify
"%PYV%" "%HERE%ticket.py" verify --worker %1 --stage wrangler
exit /b %errorlevel%
