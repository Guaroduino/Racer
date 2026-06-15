# Guía de Configuración Local // Wi-Fi Handshake

Esta guía explica cómo configurar y ejecutar tanto el servidor de la PWA como tu instancia local de ComfyUI (específicamente **Comfy Desktop**) para que se comuniquen correctamente y permitan el acceso a otros dispositivos de la red local (como laptops o tablets conectadas al mismo Wi-Fi).

---

## 1. Servidor PWA Automatizado (Iniciar_PWA.bat)

Hemos creado un archivo ejecutable **`Iniciar_PWA.bat`** en la raíz del proyecto. Este archivo automatiza todo el proceso:
1. Instala y verifica todas las dependencias del proyecto.
2. Inicia ComfyUI de forma inteligente:
   - Detecta si usas **Comfy Desktop** e inicia el servidor de Python backend directamente en segundo plano de manera oculta (evitando que tengas que abrir la ventana e iniciar la instancia manualmente).
   - Detecta si usas **ComfyUI Portable** en `C:\ComfyUI_windows_portable` e inicia el script de lote en segundo plano de forma oculta.
3. Inicia el backend de Express (puerto `3002` expuesto a toda la red con `0.0.0.0`) y el frontend de Vite simultáneamente.

### Cómo usarlo:
1. El script buscará automáticamente tu instalación de Comfy Desktop en la ruta estándar de tu usuario: `%USERPROFILE%\ComfyUI-Installs\ComfyUI`.
2. Si por algún motivo tienes ComfyUI instalado en otra ubicación diferente, puedes abrir [Iniciar_PWA.bat](file:///c:/Users/Luifer/Documents/GitHub/Racer/SketchupToRender/Iniciar_PWA.bat) con un editor de texto y cambiar las rutas de validación.
3. Haz doble clic en `Iniciar_PWA.bat` para arrancar todo.

---

## 2. Configuración de Red para ComfyUI (Comfy Desktop vs Portable)

### Caso A: Usando Comfy Desktop (Tu configuración actual)
Debido a que **Comfy Desktop** y la PWA Express corren en la **misma máquina física** (PC Servidor):
*   **No requiere ninguna configuración manual de red**: Comfy Desktop por defecto escucha localmente en `127.0.0.1:8188` (localhost).
*   **Comunicación Interna**: El Express de la PWA se comunica localmente por dentro de tu PC con Comfy Desktop.
*   **Acceso desde la laptop de tu esposa**: Ella se conecta al puerto `3001` de la PWA (`http://192.168.0.109:3001`), y el Express actúa de "puente" trayendo los datos de ComfyUI. Por ende, **no necesitas agregar ninguna bandera a Comfy Desktop**. Funciona de inmediato al abrir la aplicación.

### Caso B: Usando ComfyUI Portable (Manual)
Si en el futuro usas la versión Portable y la ejecutas fuera de nuestro script de lote:
1. Ve a tu directorio de ComfyUI Portable y edita `run_nvidia_gpu.bat`.
2. Busca la línea de ejecución de Python y agrega **`--listen`** al final:
   ```cmd
   .\python_embeded\python.exe -s ComfyUI\main.py --windows-standalone-build --listen
   ```
3. Esto permite que el servidor acepte conexiones desde adaptadores de red, reportando que escucha en `0.0.0.0`.

---

## 3. Direcciones de Acceso en Red Local

Cuando el servidor PWA esté corriendo en tu PC Servidor, cualquier dispositivo conectado al mismo Wi-Fi local podrá entrar a la aplicación ingresando a la dirección de red del host:

*   **PWA (Servidor de Producción)**: `http://192.168.0.109:3002` (Puerto `3002` - Recomendado)
*   **PWA (Servidor de Desarrollo con Hot-Reload)**: `http://192.168.0.109:5173` (Puerto `5173`)
