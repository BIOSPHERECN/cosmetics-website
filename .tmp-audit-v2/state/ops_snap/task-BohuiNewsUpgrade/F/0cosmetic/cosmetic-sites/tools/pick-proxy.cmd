@echo off
rem Pick a network route for the calling .bat: direct -> 7890 -> 1082 (rule: never hard-code a port).
rem Usage: call F:\0cosmetic\cosmetic-sites\tools\pick-proxy.cmd <url> [url...]
rem A route counts only if every URL answers with any HTTP code within 8s. Sets or clears HTTP(S)_PROXY.
rem ASCII only: .bat/.cmd files are read in the OEM code page.
set HTTP_PROXY=
set HTTPS_PROXY=
for %%r in (direct 7890 1082) do call :try %%r %* && goto :eof
echo [pick-proxy] %DATE% %TIME% no route to %*, proxy left unset
exit /b 0
:try
set PP_R=%1
shift
set PP_X=--noproxy *
if not "%PP_R%"=="direct" set PP_X=-x http://127.0.0.1:%PP_R%
:loop
if "%~1"=="" goto ok
curl -s -o nul -m 8 %PP_X% "%~1" || exit /b 1
shift
goto loop
:ok
if not "%PP_R%"=="direct" (set "HTTP_PROXY=http://127.0.0.1:%PP_R%" & set "HTTPS_PROXY=http://127.0.0.1:%PP_R%")
echo [pick-proxy] %DATE% %TIME% via %PP_R%
exit /b 0
