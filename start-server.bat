@echo off
setlocal

cd /d "%~dp0"

echo ========================================
echo TMS Pro local server
echo ========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
    echo Node.js was not found. Please install Node.js first.
    echo.
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
    if errorlevel 1 (
        echo.
        echo Failed to install dependencies.
        pause
        exit /b 1
    )
)

echo Starting server...
echo Open: http://localhost:3000/index.html
echo Press Ctrl+C in this window to stop the server.
echo.

start "" "http://localhost:3000/index.html"
call npm start

echo.
echo Server stopped.
pause
