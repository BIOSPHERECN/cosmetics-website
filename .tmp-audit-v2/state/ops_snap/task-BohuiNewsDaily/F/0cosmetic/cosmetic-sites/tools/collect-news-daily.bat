@echo off
rem News pipeline entry point for the scheduled task.
rem Full rationale lives in tools/news-write.py (UTF-8, keeps Chinese fine).
rem Keep THIS file pure ASCII: .bat is read in the OEM code page, and
rem Chinese `rem` lines get parsed as commands (2026-09-07, seen live).
setlocal
set ROOT=F:\0cosmetic\cosmetic-sites
if not exist "%ROOT%\logs" mkdir "%ROOT%\logs"
echo. >> "%ROOT%\logs\news-cron.log"
echo ==== %DATE% %TIME% ==== >> "%ROOT%\logs\news-cron.log"
python -X utf8 "%ROOT%\tools\news-write.py" --n 4 --workers 2 >> "%ROOT%\logs\news-cron.log" 2>&1
set RC=%ERRORLEVEL%
echo [exit %RC%] >> "%ROOT%\logs\news-cron.log"
exit /b %RC%
