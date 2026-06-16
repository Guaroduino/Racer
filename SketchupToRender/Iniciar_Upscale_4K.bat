@echo off
title Procesador de Imagenes a 4K por Lotes
chcp 65001 >nul

:: Cambiar al directorio donde esta guardado este script batch
cd /d "%~dp0"

echo [Upscale 4K] Creando carpetas de trabajo si no existen...
if not exist "input_4k" (
    mkdir "input_4k"
    echo Carpeta 'input_4k' creada.
)
if not exist "output_4k" (
    mkdir "output_4k"
    echo Carpeta 'output_4k' creada.
)

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
echo Continuando con la ejecucion...
timeout /t 5 >nul

:comfy_end

cls
echo ====================================================
echo   PROCESADOR AUTOMÁTICO A 4K - WATCHER DE IMÁGENES
echo   ComfyUI ha sido iniciado.
echo   Copia tus renders/imágenes en la carpeta:
echo   input_4k
echo ====================================================
echo.
echo [Upscale 4K] Iniciando script de procesamiento...
node batch_upscale.js

pause
