@echo off
title World of Navy Launcher
echo Starting World of Navy Server...
echo.
echo Opening Game in your default browser...
start http://localhost:8000
echo.
echo Server is running. Close this window to stop the server.
python -m http.server 8000
pause
