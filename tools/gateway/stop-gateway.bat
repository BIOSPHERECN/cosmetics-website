@echo off
rem Stops the Bohui gateway: drop a STOP marker so start-gateway.bat's loop exits, then kill node by pid.
rem Keep THIS file pure ASCII.
setlocal
set DIR=%USERPROFILE%\.bohui-gateway
echo stop> "%DIR%\STOP"
if not exist "%DIR%\gateway.pid" (
  echo no gateway.pid - gateway not running?
  exit /b 0
)
set /p PID=<"%DIR%\gateway.pid"
taskkill /F /PID %PID% >nul 2>&1 && echo stopped pid %PID% || echo pid %PID% not running
exit /b 0
