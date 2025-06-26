@echo off
REM Script para iniciar el Bot Fantasma con login manual

echo.
echo ===================================================================
echo                       INICIO DEL BOT FANTASMA
echo ===================================================================
echo.

REM --- PASO 1: INICIAR CHROME ---
echo [1] Abriendo Google Chrome en modo de depuracion...

REM Ruta de tu instalacion de Chrome
set CHROME_PATH="C:\chrome-win\chrome.exe"
set BROKER_URL="https://qxbroker.com/es/trade"

REM Inicia Chrome en una nueva ventana con la URL del broker
start "Chrome para Bot Fantasma" %CHROME_PATH% --remote-debugging-port=9222 %BROKER_URL%

echo.
echo --- ACCION REQUERIDA ---
echo.
echo    1. Inicia sesion en la pagina del broker.
echo    2. Asegurate de que estas en la pantalla principal de trading.
echo    3. Vuelve a esta ventana de consola.
echo.
echo ===================================================================
echo    PRESIONA 'ENTER' CUANDO ESTES LISTO PARA ACTIVAR EL BOT...
echo ===================================================================

REM Pausa y espera a que el usuario presione ENTER
pause > nul

REM --- PASO 2: INICIAR EL BOT ---
echo.
echo [2] Iniciando el Bot Fantasma... El bot tomara el control ahora.
echo.

npm start