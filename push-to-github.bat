@echo off
chcp 65001 >nul
title Push to GitHub
echo ========================================================
echo        ភ្ជាប់ និង Push កូដទៅកាន់ GitHub ដោយស្វ័យប្រវត្តិ
echo ========================================================
echo.
cd /d "%~dp0"

echo 1. ពិនិត្យមើល Git Repository...
if not exist ".git" (
    git init
    git branch -M main
)

echo.
echo 2. បញ្ចូលឯកសារ និង Commit កូដ...
git add .
git commit -m "update: HD Social Video Downloader source code" >nul 2>&1

echo.
echo --------------------------------------------------------
set /p REPO_URL="សូមបិទភ្ជាប់ (Paste) GitHub Repository URL របស់អ្នកនៅទីនេះ: "
if "%REPO_URL%"=="" (
    echo [ERROR] មិនបានបញ្ចូល Repository URL ទេ។
    pause
    exit /b
)

echo.
echo 3. កំពុងកំណត់ Remote origin...
git remote remove origin >nul 2>&1
git remote add origin %REPO_URL%

echo 4. កំពុង Push ឡើងទៅ GitHub branch main...
git push -u origin main

echo.
if %errorlevel% equ 0 (
    echo [ជោគជ័យ] កូដត្រូវបាន Push ឡើងទៅកាន់ GitHub ដោយជោគជ័យ!
) else (
    echo [បរាជ័យ] មានបញ្ហាក្នុងការ Push! សូមពិនិត្យមើលសិទ្ធិ ឬ Sign in គណនី GitHub របស់អ្នក។
)

echo.
pause
