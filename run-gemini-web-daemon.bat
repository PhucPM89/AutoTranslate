@echo off
chcp 65001 >nul
cd /d "%~dp0" || exit /b 1
title Tram Chu - Gemini Web Reviewer Local
color 0b
echo ========================================================
echo       TRAM CHU - GEMINI WEB REVIEWER LOCAL
echo ========================================================
echo.
echo API key van dich 24/7 tren cloud. Tool nay dung Gemini Web
echo de dich bo truyen khac, khong tranh cung book voi API worker.
echo Tat va bat lai se tiep tuc tu checkpoint gan nhat.
echo.
set "WEB_REVIEW_PROVIDER=gemini"
node scripts\gemini-web-daemon.js
set "REVIEW_EXIT=%ERRORLEVEL%"
echo.
echo ========================================================
echo Gemini Web reviewer da dung voi ma loi: %REVIEW_EXIT%
echo ========================================================
pause
exit /b %REVIEW_EXIT%
