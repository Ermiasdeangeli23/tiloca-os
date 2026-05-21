@echo off
setlocal

echo ========================================
echo Spegnimento Tiloca local preview
echo ========================================
echo.
echo Chiudo i processi Next.js / Node locali...
taskkill /IM node.exe /F >nul 2>&1

if errorlevel 1 (
  echo Nessun processo node.exe trovato oppure gia' chiuso.
) else (
  echo Processi node.exe chiusi.
)

echo.
echo Backend FastAPI:
echo - chiudi il terminale "Tiloca Backend"
echo - oppure premi Ctrl+C in quel terminale
echo.
pause

