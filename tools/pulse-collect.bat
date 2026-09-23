@echo off
rem Site pulse collector for the scheduled task.
rem Rationale in tools/pulse-collect.py (UTF-8). Keep THIS file pure ASCII:
rem .bat is read in the OEM code page and Chinese rem lines get run as commands.
setlocal
set ROOT=F:\0cosmetic\cosmetic-sites
if not exist "%ROOT%\logs" mkdir "%ROOT%\logs"
echo ==== %DATE% %TIME% ==== >> "%ROOT%\logs\pulse.log"
python -X utf8 "%ROOT%\tools\pulse-collect.py" >> "%ROOT%\logs\pulse.log" 2>&1
set RC=%ERRORLEVEL%
echo [exit %RC%] >> "%ROOT%\logs\pulse.log"
exit /b %RC%
