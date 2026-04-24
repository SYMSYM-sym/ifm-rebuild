@echo off
setlocal
title Igor For Men - local server (port 5463)

REM ===== IGOR FOR MEN - one-click local dev server =====
REM Serves this folder at http://localhost:5463 and opens your browser.

cd /d "%~dp0"

echo.
echo  ============================================
echo   IGOR FOR MEN  --  local preview
echo  ============================================
echo   Folder: %cd%
echo   URL:    http://localhost:5463
echo   Press Ctrl+C in this window to stop.
echo  ============================================
echo.

REM ---- Try Python first (most likely to be installed) ----
where python >nul 2>&1
if %errorlevel%==0 (
  start "" "http://localhost:5463"
  python -m http.server 5463
  goto :END
)

REM ---- Try py launcher (Windows Python launcher) ----
where py >nul 2>&1
if %errorlevel%==0 (
  start "" "http://localhost:5463"
  py -3 -m http.server 5463
  goto :END
)

REM ---- Try Node.js http-server / npx ----
where npx >nul 2>&1
if %errorlevel%==0 (
  start "" "http://localhost:5463"
  npx --yes http-server -p 5463 -c-1
  goto :END
)

REM ---- No runtime? Open the file directly as a fallback ----
echo  No Python or Node found on PATH.
echo  Opening index.html directly in your default browser instead.
echo  (For the full localhost:5463 experience, install Python from python.org)
echo.
start "" "%cd%\index.html"
pause

:END
endlocal
