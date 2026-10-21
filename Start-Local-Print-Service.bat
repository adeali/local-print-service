@echo off
title Local Print Service (Port 5000)
color 0A
echo ========================================================
echo        MEMULAI LOCAL PRINT SERVICE UNTUK CETAK OTOMATIS
echo ========================================================
echo.
echo Menjalankan service... Jangan tutup jendela hitam ini!
echo.
cd /d "%~dp0"
node server.js
pause
