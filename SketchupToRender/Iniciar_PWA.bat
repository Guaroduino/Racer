@echo off
title Servidor PWA Render Studio

:: Cambiar al directorio donde esta guardado este script batch
cd /d "%~dp0"

echo [PWA] Buscando e instalando dependencias en la raiz...
call npm install

echo [PWA] Buscando e instalando dependencias del Servidor y Cliente...
call npm run install:all

:: Deteccion y Lanzamiento de ComfyUI (Desktop App, Desktop Backend o Portable)
if exist "%LOCALAPPDATA%\Programs\Comfy Desktop\Comfy Desktop.exe" goto launch_desktop_gui
if exist "%USERPROFILE%\ComfyUI-Installs\ComfyUI\standalone-env\python.exe" goto launch_desktop_backend
if exist "C:\ComfyUI_windows_portable\run_nvidia_gpu.bat" goto launch_portable
goto no_comfy

:launch_desktop_gui
echo [ComfyUI] Iniciando Comfy Desktop (Electron GUI) automaticamente...
start "" "%LOCALAPPDATA%\Programs\Comfy Desktop\Comfy Desktop.exe"
goto comfy_end

:launch_desktop_backend
echo [ComfyUI] Iniciando servidor de ComfyUI (Desktop Backend) en segundo plano (oculto)...
echo Set WshShell = CreateObject("WScript.Shell") > "%temp%\launch_comfy.vbs"
echo WshShell.Run """%USERPROFILE%\ComfyUI-Installs\ComfyUI\standalone-env\python.exe"" ""%USERPROFILE%\ComfyUI-Installs\ComfyUI\ComfyUI\main.py"" --enable-manager", 0, False >> "%temp%\launch_comfy.vbs"
pushd "%USERPROFILE%\ComfyUI-Installs\ComfyUI\ComfyUI"
wscript "%temp%\launch_comfy.vbs"
popd
del "%temp%\launch_comfy.vbs"
goto comfy_end

:launch_portable
echo [ComfyUI] Iniciando ComfyUI Portable local en segundo plano (oculto)...
echo Set WshShell = CreateObject("WScript.Shell") > "%temp%\launch_comfy.vbs"
echo WshShell.Run """C:\ComfyUI_windows_portable\run_nvidia_gpu.bat"" --listen", 0, False >> "%temp%\launch_comfy.vbs"
pushd "C:\ComfyUI_windows_portable"
wscript "%temp%\launch_comfy.vbs"
popd
del "%temp%\launch_comfy.vbs"
goto comfy_end

:no_comfy
echo [INFO] No se encontro ninguna instalacion automatica de ComfyUI.
echo Asegurate de abrir Comfy Desktop o ComfyUI manualmente antes de renderizar.
echo Continuando con la ejecucion del servidor PWA...
timeout /t 5 >nul

:comfy_end

cls
echo ====================================================
echo   ESTUDIO DE RENDER FOTORREALISTA - ACTIVO EN RED
echo   Tu esposa puede entrar desde su laptop usando:
echo   http://192.168.0.109:3002
echo ====================================================
echo.
echo [PWA] Iniciando servidores localmente...
call npm run start:local

pause
