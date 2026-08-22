@echo off
title Tram Chu - Auto Translate Daemon (Groq AI 24/7)
color 0b
echo ========================================================
echo        TRAM CHU - TIEN TRINH DICH TU DONG 24/7
echo ========================================================
echo.
echo He thong dang chay dich lien tuc cac bo truyen bang Groq Qwen AI...
echo Tien do va chuong moi se tu dong upload len R2 va Supabase.
echo Ban co the thu nho cua so nay de chay ngam.
echo.

:loop
node scripts/translate-worker.js --continuous --minutes 300 --budget 10000
echo.
echo [%date% %time%] Phien dich hoan tat hoac nghi 5 giay de khoi dong phien tiep theo...
timeout /t 5 /nobreak >nul
goto loop
