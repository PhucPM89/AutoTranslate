@echo off
title Tram Chu - Gemini Web Translator 24/7
color 0b
echo ========================================================
echo        TRAM CHU - GEMINI WEB TRANSLATOR 24/7
echo ========================================================
echo.
echo Tool dung Chrome profile rieng de dieu khien Gemini Web.
echo Lan dau chay neu Chrome yeu cau dang nhap, hay dang nhap roi chay lai.
echo Mac dinh chay du 7 ngay; dat GEMINI_WEB_REST_DAY=sun neu muon nghi Chu Nhat.
echo.

node scripts/gemini-web-daemon.js
