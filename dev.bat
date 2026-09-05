@echo off
title GrandTheftMeta — dev
rem Adds the Rust cargo bin dir (in case the terminal has a stale PATH),
rem then launches the app in dev mode. Double-click me, or run from a terminal.
setlocal
set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
cd /d "%~dp0app"
npm run tauri dev
endlocal
