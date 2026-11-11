@echo off
chcp 65001 >nul
title Auto Push to GitHub
echo ========================================================
echo        កំពុង Update និង Push កូដទៅ GitHub ដោយស្វ័យប្រវត្តិ
echo ========================================================
echo.
cd /d "%~dp0"

echo 1. កំពុងពិនិត្យ និង Stage ឯកសារដែលបានកែប្រែ...
git add .

set /p MSG="បញ្ចូលសារ Commit (ចុច Enter យកសារស្វ័យប្រវត្តិ): "
if "%MSG%"=="" set MSG=Update code changes

echo 2. កំពុង Commit: "%MSG%"...
git commit -m "%MSG%"

echo.
echo 3. កំពុង Push ឡើងទៅ GitHub...
git push origin main

echo.
if %errorlevel% equ 0 (
    echo [ជោគជ័យ] កូដថ្មីត្រូវបាន Push ទៅ GitHub រួចរាល់ហើយ!
) else (
    echo [បរាជ័យ] មានបញ្ហាក្នុងការ Push! សូមពិនិត្យមើលការតភ្ជាប់ Internet។
)

echo.
pause
