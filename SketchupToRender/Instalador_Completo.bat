@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul

echo =====================================================================
echo              ESTUDIO RENDER IA - INSTALADOR INTEGRAL
echo =====================================================================
echo Este script configurará el entorno del frontend/backend de Node.js
echo y descargará los nodos y modelos necesarios para tu ComfyUI.
echo =====================================================================
echo.

:: 1. Comprobar Node.js
echo [1/5] Verificando requisitos de sistema...
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js no está instalado en este equipo.
    echo Por favor, descarga e instala Node.js LTS desde: https://nodejs.org/
    echo Luego de instalarlo, vuelve a iniciar este instalador.
    echo.
    pause
    exit /b
)
echo - Node.js: OK

:: 2. Comprobar Git
git --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Git no está instalado en este equipo.
    echo Por favor, descarga e instala Git desde: https://git-scm.com/
    echo Luego de instalarlo, vuelve a iniciar este instalador.
    echo.
    pause
    exit /b
)
echo - Git: OK
echo.

:: 3. Instalar dependencias del proyecto
echo [2/5] Instalando dependencias de la aplicación (Frontend y Backend)...
call npm run install:all
if %errorlevel% neq 0 (
    echo [ERROR] Falló la instalación de dependencias de Node.js.
    echo Asegúrate de tener conexión a Internet y vuelve a intentarlo.
    echo.
    pause
    exit /b
)
echo.
echo [3/5] Compilando el cliente de producción...
call npm run build:client
if %errorlevel% neq 0 (
    echo [ERROR] Falló la compilación del frontend.
    echo.
    pause
    exit /b
)
echo.

:: 4. Solicitar ruta de ComfyUI
echo [4/5] Configurando ComfyUI...
:input_path
echo.
echo ¿Tienes ComfyUI instalado ya? Si lo tienes, introduce la ruta de la carpeta ComfyUI base
echo (por ejemplo: C:\ComfyUI_windows_portable\ComfyUI).
echo.
echo Nota: Si no lo tienes, puedes descargarlo de aquí:
echo https://github.com/comfyanonymous/ComfyUI/releases (Windows Portable)
echo Descomprímelo con 7-Zip, busca la carpeta llamada 'ComfyUI' e ingresa su ruta abajo.
echo.
set /p "COMFY_PATH=Ingresa la ruta de tu carpeta 'ComfyUI': "

:: Remover comillas si el usuario arrastró la carpeta
set "COMFY_PATH=%COMFY_PATH:"=%"

:: Quitar contrabarra al final si existe
if "%COMFY_PATH:~-1%"=="\" set "COMFY_PATH=%COMFY_PATH:~0,-1%"

if not exist "%COMFY_PATH%\models" (
    echo.
    echo [ERROR] La ruta ingresada no es válida.
    echo No se encontró la subcarpeta 'models' en: "%COMFY_PATH%"
    echo Por favor, revisa la ruta e inténtalo nuevamente.
    goto :input_path
)

echo.
echo [✓] ComfyUI detectado con éxito en: "%COMFY_PATH%"
echo.

:: 5. Instalar Custom Node
echo [5/5] Instalando nodos personalizados y descargando modelos...
echo.
echo Verificando nodo personalizado 'Comfyui-QwenEditUtils'...
if not exist "%COMFY_PATH%\custom_nodes\Comfyui-QwenEditUtils" (
    echo.
    echo Descargando nodo de Qwen Edit de Github...
    git clone https://github.com/lrzjason/Comfyui-QwenEditUtils.git "%COMFY_PATH%\custom_nodes\Comfyui-QwenEditUtils"
    if %errorlevel% neq 0 (
        echo [ERROR] No se pudo clonar el repositorio del nodo personalizado. Revisa tu conexión.
        pause
        exit /b
    )
) else (
    echo [✓] El nodo personalizado ya está en custom_nodes.
)

:: Intentar instalar requerimientos del nodo en el entorno de Python embebido si es portable
if exist "%COMFY_PATH%\..\python_embeded\python.exe" (
    echo.
    echo Entorno de Python embebido detectado. Instalando librerías necesarias...
    "%COMFY_PATH%\..\python_embeded\python.exe" -m pip install -r "%COMFY_PATH%\custom_nodes\Comfyui-QwenEditUtils\requirements.txt"
) else (
    echo.
    echo [NOTA] No se detectó python_embeded en la carpeta superior.
    echo Recuerda correr 'pip install -r requirements.txt' dentro de:
    echo "%COMFY_PATH%\custom_nodes\Comfyui-QwenEditUtils"
    echo si ComfyUI presenta errores al iniciar.
)

:: Crear subcarpetas de modelos si no existen
if not exist "%COMFY_PATH%\models\diffusion_models" mkdir "%COMFY_PATH%\models\diffusion_models"
if not exist "%COMFY_PATH%\models\text_encoders" mkdir "%COMFY_PATH%\models\text_encoders"
if not exist "%COMFY_PATH%\models\vae" mkdir "%COMFY_PATH%\models\vae"
if not exist "%COMFY_PATH%\models\loras" mkdir "%COMFY_PATH%\models\loras"

echo.
echo =====================================================================
echo                DESCARGA DE MODELOS DE INTELIGENCIA ARTIFICIAL
echo =====================================================================
echo Se van a verificar y descargar los modelos necesarios de Hugging Face.
echo Peso total aproximado: 18 GB. Esto puede demorar bastante según tu velocidad.
echo Los archivos que ya existan en tu carpeta se omitirán automáticamente.
echo =====================================================================
echo.

:: Omitir o descargar VAE
set "VAE_FILE=%COMFY_PATH%\models\vae\qwen_image_vae.safetensors"
if not exist "!VAE_FILE!" (
    echo [1/4] Descargando VAE (qwen_image_vae.safetensors)...
    curl -L -o "!VAE_FILE!" "https://huggingface.co/Comfy-Org/Qwen-Image_ComfyUI/resolve/main/split_files/vae/qwen_image_vae.safetensors"
) else (
    echo [✓] VAE (qwen_image_vae.safetensors) ya existe en tu carpeta. Omitido.
)
echo.

:: Omitir o descargar CLIP
set "CLIP_FILE=%COMFY_PATH%\models\text_encoders\qwen_2.5_vl_7b_fp8_scaled.safetensors"
if not exist "!CLIP_FILE!" (
    echo [2/4] Descargando CLIP (qwen_2.5_vl_7b_fp8_scaled.safetensors)...
    curl -L -o "!CLIP_FILE!" "https://huggingface.co/Comfy-Org/Qwen-Image_ComfyUI/resolve/main/split_files/text_encoders/qwen_2.5_vl_7b_fp8_scaled.safetensors"
) else (
    echo [✓] CLIP (qwen_2.5_vl_7b_fp8_scaled.safetensors) ya existe en tu carpeta. Omitido.
)
echo.

:: Omitir o descargar Diffusion Model
set "UNET_FILE=%COMFY_PATH%\models\diffusion_models\qwen_image_edit_2509_fp8_e4m3fn.safetensors"
if not exist "!UNET_FILE!" (
    echo [3/4] Descargando Diffusion Model (qwen_image_edit_2509_fp8_e4m3fn.safetensors)...
    curl -L -o "!UNET_FILE!" "https://huggingface.co/Comfy-Org/Qwen-Image-Edit_ComfyUI/resolve/main/split_files/diffusion_models/qwen_image_edit_2509_fp8_e4m3fn.safetensors"
) else (
    echo [✓] Diffusion Model (qwen_image_edit_2509_fp8_e4m3fn.safetensors) ya existe en tu carpeta. Omitido.
)
echo.

:: Omitir o descargar LoRA
set "LORA_FILE=%COMFY_PATH%\models\loras\Qwen-Image-Edit-2509-Lightning-4steps-V1.0-bf16.safetensors"
if not exist "!LORA_FILE!" (
    echo [4/4] Descargando LoRA (Qwen-Image-Edit-2509-Lightning-4steps-V1.0-bf16.safetensors)...
    curl -L -o "!LORA_FILE!" "https://huggingface.co/lightx2v/Qwen-Image-Lightning/resolve/main/Qwen-Image-Edit-2509/Qwen-Image-Edit-2509-Lightning-4steps-V1.0-bf16.safetensors"
) else (
    echo [✓] LoRA (Qwen-Image-Edit-2509-Lightning-4steps-V1.0-bf16.safetensors) ya existe en tu carpeta. Omitido.
)
echo.

echo =====================================================================
echo          ¡INSTALACIÓN Y CONFIGURACIÓN COMPLETADAS CON ÉXITO!
echo =====================================================================
echo.
echo Para iniciar el programa:
echo 1. Enciende tu servidor de ComfyUI (ej: run_nvidia_gpu.bat).
echo 2. Ejecuta 'Iniciar_PWA.bat' en esta misma carpeta para encender el servidor y el cliente.
echo 3. Abre 'http://localhost:3002' en tu navegador para usar la app.
echo.
pause
