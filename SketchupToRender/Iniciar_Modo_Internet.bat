@echo off
title Agente Modo Internet (Firebase) - Render Studio
cd /d "%~dp0"

echo ====================================================
echo   AGENTE RENDER STUDIO - MODO INTERNET (FIREBASE)
echo   Este script conecta tu ComfyUI local con Firebase
echo ====================================================
echo.

:: Deteccion y Lanzamiento de ComfyUI (Portable o Desktop)
if exist "%LOCALAPPDATA%\Programs\Comfy Desktop\Comfy Desktop.exe" goto launch_desktop_gui
if exist "%USERPROFILE%\ComfyUI-Installs\ComfyUI\standalone-env\python.exe" goto launch_desktop_backend
if exist "C:\ComfyUI_windows_portable\run_nvidia_gpu.bat" goto launch_portable
goto no_comfy

:launch_desktop_gui
echo [ComfyUI] Iniciando Comfy Desktop...
start "" "%LOCALAPPDATA%\Programs\Comfy Desktop\Comfy Desktop.exe"
goto comfy_end

:launch_desktop_backend
echo [ComfyUI] Iniciando servidor de ComfyUI en segundo plano...
echo Set WshShell = CreateObject("WScript.Shell") > "%temp%\launch_comfy.vbs"
echo WshShell.Run """%USERPROFILE%\ComfyUI-Installs\ComfyUI\standalone-env\python.exe"" ""%USERPROFILE%\ComfyUI-Installs\ComfyUI\ComfyUI\main.py"" --enable-manager", 0, False >> "%temp%\launch_comfy.vbs"
pushd "%USERPROFILE%\ComfyUI-Installs\ComfyUI\ComfyUI"
wscript "%temp%\launch_comfy.vbs"
popd
del "%temp%\launch_comfy.vbs"
goto comfy_end

:launch_portable
echo [ComfyUI] Iniciando ComfyUI Portable local en segundo plano...
echo Set WshShell = CreateObject("WScript.Shell") > "%temp%\launch_comfy.vbs"
echo WshShell.Run """C:\ComfyUI_windows_portable\run_nvidia_gpu.bat"" --listen", 0, False >> "%temp%\launch_comfy.vbs"
pushd "C:\ComfyUI_windows_portable"
wscript "%temp%\launch_comfy.vbs"
popd
del "%temp%\launch_comfy.vbs"
goto comfy_end

:no_comfy
echo [INFO] No se encontro ninguna instalacion automatica de ComfyUI.
echo Asegurate de abrir Comfy Desktop o tu ComfyUI local manualmente.
timeout /t 5 >nul
goto comfy_end

:comfy_end
echo.
echo [Agente] Limpiando posibles instancias huerfanas de agentes anteriores...
powershell -Command "Get-CimInstance Win32_Process -Filter \"name = 'python.exe'\" | Where-Object { $_.CommandLine -like '*agent.py*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }" 2>nul
echo.
echo [Agente] Iniciando agente de conexion Firebase...
python agent/agent.py
pause
