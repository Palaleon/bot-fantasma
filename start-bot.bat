@echo off
REM Script para iniciar el Bot Fantasma con login manual

echo.
echo ===================================================================
echo                       INICIO DEL BOT FANTASMA
echo ===================================================================
echo.

REM --- PASO 1: INICIAR CHROME ---
echo [1] Abriendo Google Chrome en modo de depuracion...

REM Intenta encontrar Chrome en las ubicaciones comunes de Windows
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
    set "CHROME_PATH=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
) else if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
    set "CHROME_PATH=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
) else if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" (
    set "CHROME_PATH=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
) else (
    REM Si no se encuentra, usa la ruta que estaba antes o pide al usuario
    set "CHROME_PATH=C:\chrome-win\chrome.exe"
    echo.
    echo [ADVERTENCIA] No se pudo encontrar Chrome automaticamente.
    echo             Usando la ruta por defecto: %CHROME_PATH%
    echo             Si es incorrecta, por favor edita este archivo (start-bot.bat).
    echo.
)

set BROKER_URL="https://qxbroker.com/es/trade"
set DEBUG_PORT=9222

echo Usando Chrome desde: "%CHROME_PATH%"
REM Inicia Chrome en una nueva ventana con la URL del broker
start "Chrome para Bot Fantasma" "%CHROME_PATH%" --remote-debugging-port=%DEBUG_PORT% %BROKER_URL%

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

echo.
echo ===================================================================
echo El proceso ha finalizado. Presiona 'ENTER' para cerrar esta ventana.
pause > nul