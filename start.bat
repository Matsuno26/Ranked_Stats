@echo off
title Ranked Stats
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js n'est pas installe : https://nodejs.org & pause & exit /b 1)
node server.js --open
pause
