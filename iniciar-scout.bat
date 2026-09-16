@echo off
chcp 65001 >nul
title FB Terreno Scout - Arequipa
mode con: cols=120 lines=40
color 0A
cd /d "%~dp0"

if not exist node_modules\playwright\package.json (
  echo Instalando dependencias, esto puede tardar unos minutos.
  call npm.cmd install --no-fund --no-audit
)
if not exist "%LOCALAPPDATA%\ms-playwright" (
  echo Descargando Chromium. Solo la primera vez.
  call npx.cmd playwright install chromium
)

echo.
echo Iniciando FB Terreno Scout...
echo Espera el mensaje: [OK] Panel web en http://127.0.0.1:8787
echo El navegador se abrira solo cuando el servidor este listo.
echo Manten esta ventana abierta mientras quieras que el bot funcione.
echo.
call node_modules\.bin\tsx.cmd src\main.ts
pause
