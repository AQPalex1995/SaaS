@echo off
title FB Terreno Scout - Login Facebook
cd /d "%~dp0"
echo.
echo ====================================================
echo   FB Terreno Scout - Inicio de Sesion Facebook
echo ====================================================
echo.
echo Iniciando navegador visible...
call node_modules\.bin\tsx.cmd src/login-manual.ts
echo.
pause
