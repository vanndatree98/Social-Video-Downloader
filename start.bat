@echo off
title HD Social Video Downloader
echo ========================================================
echo   HD Social Video Downloader កំពុងចាប់ផ្ដើម...
echo   សូមរង់ចាំបន្តិច ប្រព័ន្ធនឹងបើក Browser ដោយស្វ័យប្រវត្តិ
echo ========================================================
cd /d "%~dp0"
timeout /t 2 /nobreak >nul
start http://localhost:3000
cmd.exe /c "npm run dev"
pause
