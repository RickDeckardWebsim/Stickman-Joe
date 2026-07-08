@echo off
title Stickman Joe - Local Server
echo ============================================
echo    STICKMAN JOE - Starting up...
echo ============================================
echo.

::: Check if server is already running on port 8765
::: Exit code 0 = server is UP, exit code 1 = server is DOWN
powershell -Command "try { $r = Invoke-WebRequest http://127.0.0.1:8765/index.html -UseBasicParsing -TimeoutSec 2; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }"
if %errorlevel%==0 (
    echo  Server already running — opening browser...
    start http://127.0.0.1:8765/index.html
    timeout /t 3 /nobreak >nul
    exit /b
)

::: Server not running — kill any stale python on 8765 just in case
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8765" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)

::: Start the no-cache dev server
start /b python serve.py

::: Wait for server to be ready (check up to 10 seconds)
set /a tries=0
:waitloop
set /a tries+=1
timeout /t 1 /nobreak >nul
powershell -Command "try { $r = Invoke-WebRequest http://127.0.0.1:8765/index.html -UseBasicParsing -TimeoutSec 2; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }"
if %errorlevel%==0 goto :ready
if %tries% lss 10 goto :waitloop

echo.
echo  [ERROR] Could not start the server.
echo  Make sure Python is installed and in your PATH.
echo  Try running: python serve.py
echo.
pause
exit /b 1

:ready
::: Open the default browser to the game
start http://127.0.0.1:8765/index.html

echo  Game opened in your browser!
echo.
echo  Close this window to stop the server.
echo ============================================
echo.

::: Keep the window open so the server stays alive
cmd /k
