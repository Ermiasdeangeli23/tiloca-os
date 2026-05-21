@echo off
setlocal

set "ROOT_DIR=%~dp0"

echo ========================================
echo Avvio Tiloca local preview
echo ========================================
echo.
echo Backend: FastAPI su http://127.0.0.1:8000
echo Frontend: Next.js preview
echo.

if not exist "%ROOT_DIR%tiloca-mvp-backend\.venv\Scripts\python.exe" (
  echo ERRORE: Python venv non trovato in tiloca-mvp-backend\.venv
  echo Crea o ripara la venv prima di avviare Tiloca.
  pause
  exit /b 1
)

if not exist "%ROOT_DIR%tiloca-map-mvp\package.json" (
  echo ERRORE: progetto frontend non trovato in tiloca-map-mvp
  pause
  exit /b 1
)

echo Apro terminale backend...
start "Tiloca Backend" cmd /k "cd /d ""%ROOT_DIR%tiloca-mvp-backend"" && echo Avvio backend FastAPI... && .venv\Scripts\python.exe -m uvicorn app.main:app --reload"

echo Apro terminale frontend...
start "Tiloca Frontend" cmd /k "cd /d ""%ROOT_DIR%tiloca-map-mvp"" && echo Build frontend... && npm.cmd run build && echo Avvio frontend Next.js... && npm.cmd run start"

echo.
echo Tiloca si sta avviando in due terminali separati.
echo Chiudi questa finestra quando vuoi.
echo.
pause
