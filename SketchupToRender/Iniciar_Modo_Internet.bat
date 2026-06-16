@echo off
title Agente Modo Internet (Firebase) - Render Studio
cd /d "%~dp0"

echo ====================================================
echo   AGENTE RENDER STUDIO - MODO INTERNET (FIREBASE)
echo   Este script conecta tu ComfyUI local con Firebase
echo ====================================================
echo.

:: Deteccion y Lanzamiento de ComfyUI (Portable o Desktop)
if exist "%LOCALAPPDATA%\Programs\Comfy Desktop\Comfy Desktop.exe" (
    echo [ComfyUI] Iniciando Comfy Desktop...
    start "" "%LOCALAPPDATA%\Programs\Comfy Desktop\Comfy Desktop.exe"
    timeout /t 5 >nul
) else if exist "%USERPROFILE%\ComfyUI-Installs\ComfyUI\standalone-env\python.exe" (
    echo [ComfyUI] Iniciando servidor de ComfyUI en segundo plano...
    echo Set WshShell = CreateObject("WScript.Shell") > "%temp%\launch_comfy.vbs"
    echo WshShell.Run """%USERPROFILE%\ComfyUI-Installs\ComfyUI\standalone-env\python.exe"" ""%USERPROFILE%\ComfyUI-Installs\ComfyUI\ComfyUI\main.py"" --enable-manager", 0, False >> "%temp%\launch_comfy.vbs"
    pushd "%USERPROFILE%\ComfyUI-Installs\ComfyUI\ComfyUI"
    wscript "%temp%\launch_comfy.vbs"
    popd
    del "%temp%\launch_comfy.vbs"
    timeout /t 5 >nul
) else if exist "C:\ComfyUI_windows_portable\run_nvidia_gpu.bat" (
    echo [ComfyUI] Iniciando ComfyUI Portable local en segundo plano...
    echo Set WshShell = CreateObject("WScript.Shell") > "%temp%\launch_comfy.vbs"
    echo WshShell.Run """C:\ComfyUI_windows_portable\run_nvidia_gpu.bat"" --listen", 0, False >> "%temp%\launch_comfy.vbs"
    pushd "C:\ComfyUI_windows_portable"
    wscript "%temp%\launch_comfy.vbs"
    popd
    del "%temp%\launch_comfy.vbs"
    timeout /t 5 >nul
) else (
    echo [INFO] No se encontro ninguna instalacion automatica de ComfyUI.
    echo Asegurate de abrir Comfy Desktop o tu ComfyUI local manualmente.
)

echo.
echo [Agente] Iniciando agente de conexion Firebase...
python agent/agent.py
pause
