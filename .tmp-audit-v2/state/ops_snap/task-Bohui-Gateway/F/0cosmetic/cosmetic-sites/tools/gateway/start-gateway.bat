@echo off
rem Bohui gateway keeper: runs node bohui-gateway.mjs and restarts it if it crashes.
rem Keep THIS file pure ASCII (.bat is read in the OEM code page; Chinese rem lines get run as commands).
rem Exit codes from the gateway: 3 = port already taken (another instance) -> stop looping;
rem STOP file (written by stop-gateway.bat) -> stop looping; anything else -> restart after 5s.
setlocal
set DIR=%USERPROFILE%\.bohui-gateway
if not exist "%DIR%\logs" mkdir "%DIR%\logs"
if exist "%DIR%\STOP" del "%DIR%\STOP"
cd /d F:\0cosmetic\cosmetic-sites\tools\gateway
:loop
echo ==== %DATE% %TIME% start >> "%DIR%\logs\gateway.log"
node bohui-gateway.mjs >> "%DIR%\logs\gateway.log" 2>&1
set RC=%ERRORLEVEL%
echo ==== %DATE% %TIME% exit %RC% >> "%DIR%\logs\gateway.log"
if exist "%DIR%\STOP" exit /b 0
if "%RC%"=="3" exit /b 3
ping -n 6 127.0.0.1 >nul
goto loop
