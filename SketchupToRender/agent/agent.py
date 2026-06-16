import os
import sys
import time
import json
import uuid
import queue
import threadpoolctl # not strictly required, but standard imports
import threading
import tempfile
import requests
from urllib.parse import quote_plus
import firebase_admin
from firebase_admin import credentials, firestore, storage

# Configuración del entorno
CREDENTIALS_PATH = os.path.join(os.path.dirname(__file__), 'serviceAccountKey.json')
WORKFLOWS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))

# Verificar archivo de credenciales
if not os.path.exists(CREDENTIALS_PATH):
    print("=" * 80)
    print(" ERROR: No se encontró el archivo de cuenta de servicio 'serviceAccountKey.json'.")
    print(f" Por favor descárgalo desde la consola de Firebase y colócalo en: {CREDENTIALS_PATH}")
    print("=" * 80)
    sys.exit(1)

# Inicializar Firebase Admin SDK
cred = credentials.Certificate(CREDENTIALS_PATH)
firebase_admin.initialize_app(cred, {
    'storageBucket': 'localimagegenerator.firebasestorage.app'
})

db = firestore.client()
bucket = storage.bucket()

# Configurar CORS para permitir subidas desde el navegador web
print("[Firebase] Configurando políticas CORS en el bucket de Storage...")
try:
    bucket.cors = [
        {
            'origin': ['*'],
            'method': ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
            'responseHeader': ['Content-Type', 'Authorization', 'x-firebase-storage-version', 'x-requested-with'],
            'maxAgeSeconds': 3600
        }
    ]
    bucket.update()
    print("[Firebase] ¡CORS configurado con éxito!")
except Exception as e:
    print(f"[Firebase Warning] No se pudo configurar CORS automáticamente: {e}")
    print("Asegúrate de que tu cuenta de servicio tenga los permisos de rol 'Administrador de Storage' o configura CORS manualmente.")


# Cola de procesamiento en memoria para no sobrecargar la GPU
job_queue = queue.Queue()

def scan_comfy_url():
    """Detecta el puerto activo de ComfyUI (8188 o 8000)"""
    ports = [8188, 8000]
    for port in ports:
        url = f"http://127.0.0.1:{port}"
        try:
            response = requests.get(url, timeout=1.0)
            if response.status_code == 200:
                return url
        except requests.exceptions.RequestException:
            continue
    return "http://127.0.0.1:8188" # Fallback por defecto

def upload_file_to_firebase(local_path, destination_blob_name):
    """Sube un archivo local a Firebase Storage y retorna su URL de descarga pública de Firebase"""
    blob = bucket.blob(destination_blob_name)
    download_token = str(uuid.uuid4())
    
    # Inyectar metadatos para simular token de acceso público de Firebase
    blob.metadata = {"firebaseStorageDownloadTokens": download_token}
    
    # Subir archivo
    blob.upload_from_filename(local_path)
    blob.patch() # Aplicar metadatos
    
    # Generar URL pública con formato de descarga web de Firebase
    encoded_name = quote_plus(destination_blob_name)
    download_url = f"https://firebasestorage.googleapis.com/v0/b/{bucket.name}/o/{encoded_name}?alt=media&token={download_token}"
    return download_url

def download_file_from_url(url, local_dest_path):
    """Descarga una imagen desde una URL web a un archivo local"""
    response = requests.get(url, stream=True)
    if response.status_code == 200:
        with open(local_dest_path, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)
    else:
        raise Exception(f"No se pudo descargar la imagen de entrada: HTTP {response.status_code}")

def clean_comfy_cache(comfy_url):
    """Limpia la memoria cache de ComfyUI"""
    try:
        requests.post(
            f"{comfy_url}/free", 
            json={"unload_models": False, "free_memory": True},
            timeout=5.0
        )
    except Exception as e:
        print(f"Advertencia: No se pudo limpiar la cache de ComfyUI: {e}")

def process_job(job_id, doc_data):
    """Función principal que ejecuta el render interactuando con ComfyUI"""
    doc_ref = db.collection('cola_trabajos').document(job_id)
    temp_files = []
    
    try:
        # 1. Actualizar estado a procesando
        print(f"\n[{job_id}] Iniciando procesamiento...")
        doc_ref.update({
            'estado': 'procesando',
            'progreso': 5,
            'progresoMsg': 'Descargando recursos de la nube...'
        })
        
        comfy_url = scan_comfy_url()
        print(f"[{job_id}] Usando servidor ComfyUI en: {comfy_url}")
        
        tipo_trabajo = doc_data.get('tipo', 'generate')
        params = doc_data.get('parametros', {})
        imagenes_entrada = doc_data.get('imagenesEntrada', {})
        userId = doc_data.get('userId')
        
        # Crear directorio temporal para descargas
        with tempfile.TemporaryDirectory() as temp_dir:
            
            # --- CASO 1: GENERACIÓN DE RENDER ---
            if tipo_trabajo == 'generate':
                # Descargar imagen principal
                main_image_url = imagenes_entrada.get('image')
                if not main_image_url:
                    raise Exception("Falta la imagen principal de SketchUp ('image') en la solicitud.")
                
                local_main_path = os.path.join(temp_dir, 'main_sketchup.jpg')
                download_file_from_url(main_image_url, local_main_path)
                temp_files.append(local_main_path)
                
                # Descargar imágenes de referencia de estilo (si existen)
                ref1_url = imagenes_entrada.get('refImage1')
                local_ref1_path = None
                if ref1_url:
                    local_ref1_path = os.path.join(temp_dir, 'ref_style_1.jpg')
                    download_file_from_url(ref1_url, local_ref1_path)
                    temp_files.append(local_ref1_path)
                    
                ref2_url = imagenes_entrada.get('refImage2')
                local_ref2_path = None
                if ref2_url:
                    local_ref2_path = os.path.join(temp_dir, 'ref_style_2.jpg')
                    download_file_from_url(ref2_url, local_ref2_path)
                    temp_files.append(local_ref2_path)
                    
                doc_ref.update({
                    'progreso': 15,
                    'progresoMsg': 'Subiendo imágenes al motor ComfyUI local...'
                })
                
                # Subir imágenes a la API local de ComfyUI
                timestamp = int(time.time() * 1000)
                
                # Imagen principal
                unique_main_name = f"{timestamp}-sketchup_render.jpg"
                with open(local_main_path, 'rb') as f:
                    files = {'image': (unique_main_name, f, 'image/jpeg'), 'overwrite': (None, 'true')}
                    resp = requests.post(f"{comfy_url}/upload/image", files=files)
                if resp.status_code != 200:
                    raise Exception(f"Fallo al subir imagen principal a ComfyUI: {resp.text}")
                comfy_main_filename = resp.json().get('name')
                
                # Imagen referencia 1
                unique_ref1_name = None
                if local_ref1_path:
                    unique_ref1_name = f"{timestamp}-ref1.jpg"
                    with open(local_ref1_path, 'rb') as f:
                        files = {'image': (unique_ref1_name, f, 'image/jpeg'), 'overwrite': (None, 'true')}
                        resp = requests.post(f"{comfy_url}/upload/image", files=files)
                    if resp.status_code != 200:
                        print(f"Fallo no-bloqueante al subir ref1: {resp.text}")
                        unique_ref1_name = None
                
                # Imagen referencia 2
                unique_ref2_name = None
                if local_ref2_path:
                    unique_ref2_name = f"{timestamp}-ref2.jpg"
                    with open(local_ref2_path, 'rb') as f:
                        files = {'image': (unique_ref2_name, f, 'image/jpeg'), 'overwrite': (None, 'true')}
                        resp = requests.post(f"{comfy_url}/upload/image", files=files)
                    if resp.status_code != 200:
                        print(f"Fallo no-bloqueante al subir ref2: {resp.text}")
                        unique_ref2_name = None

                # Cargar el archivo de flujo de trabajo JSON correcto
                scene_type = params.get('sceneType', 'exterior')
                use_two_pass = params.get('useTwoPass', False)
                
                if scene_type == 'exterior':
                    workflow_file = 'comfy_workflow - exteriores.json' if use_two_pass else 'comfy_workflow_1pass - exteriores.json'
                else:
                    workflow_file = 'comfy_workflow.json' if use_two_pass else 'comfy_workflow_1pass.json'
                    
                workflow_path = os.path.join(WORKFLOWS_DIR, workflow_file)
                print(f"[{job_id}] Cargando workflow local: {workflow_file}")
                
                if not os.path.exists(workflow_path):
                    raise Exception(f"No se encontró el workflow '{workflow_file}' en la ruta: {workflow_path}")
                
                with open(workflow_path, 'r', encoding='utf-8') as wf:
                    workflow = json.load(wf)
                
                # --- Modificar Parámetros del Workflow ---
                # LoadImage del Render Principal (Nodo 78)
                if '78' in workflow and 'inputs' in workflow['78']:
                    workflow['78']['inputs']['image'] = comfy_main_filename
                else:
                    raise Exception("No se encontró el nodo '78' (LoadImage) en el flujo de trabajo.")
                
                # Ref1 (Nodo 120)
                if unique_ref1_name:
                    if '120' not in workflow:
                        workflow['120'] = {"inputs": {"image": unique_ref1_name}, "class_type": "LoadImage"}
                    else:
                        workflow['120']['inputs']['image'] = unique_ref1_name
                    # Reconectar en nodos de prompt
                    for n_id in ['115:111', '115:110']:
                        if n_id in workflow and 'inputs' in workflow[n_id]:
                            workflow[n_id]['inputs']['image2'] = ["120", 0]
                else:
                    # Eliminar enlaces si no hay ref
                    for n_id in ['115:111', '115:110']:
                        if n_id in workflow and 'inputs' in workflow[n_id]:
                            workflow[n_id]['inputs'].pop('image2', None)
                    workflow.pop('120', None)

                # Ref2 (Nodo 121)
                if unique_ref2_name:
                    if '121' not in workflow:
                        workflow['121'] = {"inputs": {"image": unique_ref2_name}, "class_type": "LoadImage"}
                    else:
                        workflow['121']['inputs']['image'] = unique_ref2_name
                    # Reconectar en nodos de prompt
                    for n_id in ['115:111', '115:110']:
                        if n_id in workflow and 'inputs' in workflow[n_id]:
                            workflow[n_id]['inputs']['image3'] = ["121", 0]
                else:
                    # Eliminar enlaces si no hay ref
                    for n_id in ['115:111', '115:110']:
                        if n_id in workflow and 'inputs' in workflow[n_id]:
                            workflow[n_id]['inputs'].pop('image3', None)
                    workflow.pop('121', None)

                # Denoise y CFG del boceto intermedio (Nodo 141:137)
                if '141:137' in workflow and 'inputs' in workflow['141:137']:
                    workflow['141:137']['inputs']['seed'] = int(uuid.uuid4().int >> 64) % 1000000000000000
                    workflow['141:137']['inputs']['denoise'] = float(params.get('sketchDenoise', 1.0))
                    workflow['141:137']['inputs']['cfg'] = float(params.get('sketchCfg', 1.0))
                
                # Custom Sketch Prompt (Nodo 141:132)
                sketch_prompt = params.get('sketchPrompt', '')
                if sketch_prompt and '141:132' in workflow and 'inputs' in workflow['141:132']:
                    workflow['141:132']['inputs']['prompt'] = sketch_prompt

                # Denoise y CFG del render fotorrealista (Nodo 115:3)
                if '115:3' in workflow and 'inputs' in workflow['115:3']:
                    workflow['115:3']['inputs']['seed'] = int(uuid.uuid4().int >> 64) % 1000000000000000
                    workflow['115:3']['inputs']['denoise'] = float(params.get('renderDenoise', 0.94))
                    workflow['115:3']['inputs']['cfg'] = float(params.get('renderCfg', 7.0))

                # Master Prompt (Nodo 115:111)
                full_prompt = params.get('fullPrompt', '')
                if '115:111' in workflow and 'inputs' in workflow['115:111']:
                    workflow['115:111']['inputs']['prompt'] = full_prompt

                # Encolar en ComfyUI
                doc_ref.update({
                    'progreso': 25,
                    'progresoMsg': 'Encolando en la GPU local...'
                })
                
                client_id = f"remote_agent_{uuid.uuid4().hex[:8]}"
                prompt_resp = requests.post(f"{comfy_url}/prompt", json={"prompt": workflow, "client_id": client_id})
                if prompt_resp.status_code != 200:
                    raise Exception(f"Fallo al encolar en ComfyUI: {prompt_resp.text}")
                
                prompt_id = prompt_resp.json().get('prompt_id')
                print(f"[{job_id}] Generación iniciada en ComfyUI con Prompt ID: {prompt_id}")
                
                # Sondeo de la cola
                doc_ref.update({
                    'progreso': 35,
                    'progresoMsg': 'Renderizando en GPU local (Fase 1/2)...'
                })

                # Bucle de espera e informes de progreso
                completed = False
                retries = 0
                max_retries = 300 # 5 minutos
                
                output_filename = None
                sketch_filename = None
                
                while not completed and retries < max_retries:
                    time.sleep(1.0)
                    hist_resp = requests.get(f"{comfy_url}/history/{prompt_id}")
                    if hist_resp.status_code == 200:
                        hist_data = hist_resp.json()
                        if prompt_id in hist_data:
                            completed = True
                            outputs = hist_data[prompt_id].get('outputs', {})
                            print(f"[{job_id}] Render completado en ComfyUI. Extrayendo resultados...")
                            
                            # Final Output (Nodo 60)
                            if '60' in outputs and 'images' in outputs['60'] and len(outputs['60']['images']) > 0:
                                output_filename = outputs['60']['images'][0]['filename']
                                
                            # Sketch Output (Nodo 142)
                            if '142' in outputs and 'images' in outputs['142'] and len(outputs['142']['images']) > 0:
                                sketch_filename = outputs['142']['images'][0]['filename']
                                
                            # Fallback si no está el nodo 60
                            if not output_filename:
                                for node_out in outputs.values():
                                    if 'images' in node_out and len(node_out['images']) > 0:
                                        output_filename = node_out['images'][0]['filename']
                                        break
                    
                    retries += 1
                    # Simular avance intermedio de barra de progreso en frontend
                    if retries % 10 == 0 and not completed:
                        prog_est = min(35 + (retries // 3), 90)
                        doc_ref.update({
                            'progreso': prog_est,
                            'progresoMsg': f'Generando fotorrealismo en GPU ({retries}s)...'
                        })

                if not completed or not output_filename:
                    raise Exception("ComfyUI tardó demasiado en responder o no generó las imágenes esperadas.")
                
                # Descargar imágenes generadas desde ComfyUI a local temporal
                doc_ref.update({
                    'progreso': 90,
                    'progresoMsg': 'Transfiriendo render a Firebase Storage...'
                })
                
                local_output_path = os.path.join(temp_dir, output_filename)
                download_file_from_url(f"{comfy_url}/view?filename={output_filename}", local_output_path)
                
                local_sketch_path = None
                if sketch_filename:
                    local_sketch_path = os.path.join(temp_dir, sketch_filename)
                    download_file_from_url(f"{comfy_url}/view?filename={sketch_filename}", local_sketch_path)
                
                # Subir resultados a Firebase Storage en outputs
                print(f"[{job_id}] Subiendo render final a Storage...")
                storage_dest_render = f"usuarios/{userId}/outputs/{job_id}_{output_filename}"
                render_public_url = upload_file_to_firebase(local_output_path, storage_dest_render)
                
                sketch_public_url = None
                if local_sketch_path:
                    print(f"[{job_id}] Subiendo boceto intermedio a Storage...")
                    storage_dest_sketch = f"usuarios/{userId}/outputs/{job_id}_sketch_{sketch_filename}"
                    sketch_public_url = upload_file_to_firebase(local_sketch_path, storage_dest_sketch)
                
                # Finalizar documento
                doc_ref.update({
                    'estado': 'completado',
                    'progreso': 100,
                    'progresoMsg': '¡Procesado exitoso!',
                    'imagenesSalida': {
                        'image': render_public_url,
                        'sketchImage': sketch_public_url
                    },
                    'actualizadoEn': firestore.SERVER_TIMESTAMP
                })
                print(f"[{job_id}] Trabajo completado con éxito. Render: {render_public_url}")

            # --- CASO 2: ESCALADO A 4K (UHD) ---
            elif tipo_trabajo == 'upscale':
                image_url = imagenes_entrada.get('image')
                if not image_url:
                    raise Exception("Falta la imagen a escalar ('image') en la solicitud.")
                
                # Descargar imagen a procesar
                local_input_path = os.path.join(temp_dir, 'to_upscale.jpg')
                download_file_from_url(image_url, local_input_path)
                temp_files.append(local_input_path)
                
                doc_ref.update({
                    'progreso': 15,
                    'progresoMsg': 'Subiendo imagen UHD al motor local...'
                })
                
                # Subir imagen a ComfyUI
                timestamp = int(time.time() * 1000)
                unique_input_name = f"{timestamp}-to_upscale.jpg"
                with open(local_input_path, 'rb') as f:
                    files = {'image': (unique_input_name, f, 'image/jpeg'), 'overwrite': (None, 'true')}
                    resp = requests.post(f"{comfy_url}/upload/image", files=files)
                if resp.status_code != 200:
                    raise Exception(f"Fallo al subir imagen a ComfyUI para upscale: {resp.text}")
                comfy_input_filename = resp.json().get('name')
                
                # Cargar workflow de Upscale
                upscale_method = params.get('upscaleMethod', 'creative_photo')
                if upscale_method in ['ultrasharp', 'ultrasharp_analog']:
                    workflow_file = 'to4K_ultrasharp.json'
                elif upscale_method == 'analog':
                    workflow_file = 'to4K_analog.json'
                elif upscale_method == 'creative_photo':
                    workflow_file = 'to4K_fotos.json'
                else:
                    workflow_file = 'to4K.json'
                    
                workflow_path = os.path.join(WORKFLOWS_DIR, workflow_file)
                print(f"[{job_id}] Cargando workflow upscale: {workflow_file}")
                
                if not os.path.exists(workflow_path):
                    raise Exception(f"No se encontró el workflow de upscale '{workflow_file}' en: {workflow_path}")
                
                with open(workflow_path, 'r', encoding='utf-8') as wf:
                    workflow = json.load(wf)
                    
                # Inyectar nombre de archivo
                if '1' in workflow and 'inputs' in workflow['1']:
                    workflow['1']['inputs']['image'] = comfy_input_filename
                else:
                    raise Exception("No se encontró el nodo '1' (LoadImage) en el workflow de upscale.")
                
                # Encolar prompt
                doc_ref.update({
                    'progreso': 30,
                    'progresoMsg': 'Encolando escalado a 4K en GPU...'
                })
                
                client_id = f"remote_agent_upscale_{uuid.uuid4().hex[:8]}"
                prompt_resp = requests.post(f"{comfy_url}/prompt", json={"prompt": workflow, "client_id": client_id})
                if prompt_resp.status_code != 200:
                    raise Exception(f"Fallo al encolar upscale en ComfyUI: {prompt_resp.text}")
                
                prompt_id = prompt_resp.json().get('prompt_id')
                
                doc_ref.update({
                    'progreso': 45,
                    'progresoMsg': 'Escalando texturas y mejorando resolución (GPU)...'
                })
                
                completed = False
                retries = 0
                max_retries = 300
                output_filename = None
                
                while not completed and retries < max_retries:
                    time.sleep(1.0)
                    hist_resp = requests.get(f"{comfy_url}/history/{prompt_id}")
                    if hist_resp.status_code == 200:
                        hist_data = hist_resp.json()
                        if prompt_id in hist_data:
                            completed = True
                            outputs = hist_data[prompt_id].get('outputs', {})
                            
                            # Nodo de guardado (SaveImage)
                            save_node_id = '10' if '10' in outputs else ('4' if '4' in outputs else None)
                            if save_node_id and 'images' in outputs[save_node_id] and len(outputs[save_node_id]['images']) > 0:
                                output_filename = outputs[save_node_id]['images'][0]['filename']
                                
                            if not output_filename:
                                # Fallback
                                for node_out in outputs.values():
                                    if 'images' in node_out and len(node_out['images']) > 0:
                                        output_filename = node_out['images'][0]['filename']
                                        break
                                        
                    retries += 1
                    if retries % 5 == 0 and not completed:
                        prog_est = min(45 + (retries // 2), 90)
                        doc_ref.update({
                            'progreso': prog_est,
                            'progresoMsg': f'Aumentando nitidez y detalles ({retries}s)...'
                        })
                        
                if not completed or not output_filename:
                    raise Exception("El escalado en ComfyUI superó el tiempo límite.")
                    
                doc_ref.update({
                    'progreso': 90,
                    'progresoMsg': 'Subiendo imagen UHD a la nube...'
                })
                
                local_output_path = os.path.join(temp_dir, output_filename)
                download_file_from_url(f"{comfy_url}/view?filename={output_filename}", local_output_path)
                
                # Subir a Firebase Storage
                storage_dest_upscale = f"usuarios/{userId}/outputs/{job_id}_4k_{output_filename}"
                upscaled_public_url = upload_file_to_firebase(local_output_path, storage_dest_upscale)
                
                # Finalizar documento
                doc_ref.update({
                    'estado': 'completado',
                    'progreso': 100,
                    'progresoMsg': '¡Escalado a 4K completado!',
                    'imagenesSalida': {
                        'image': upscaled_public_url
                    },
                    'actualizadoEn': firestore.SERVER_TIMESTAMP
                })
                print(f"[{job_id}] Escalado completado con éxito: {upscaled_public_url}")

            # Limpiar cache de ComfyUI
            clean_comfy_cache(comfy_url)

    except Exception as e:
        print(f"[{job_id}] ERROR en el procesamiento: {str(e)}")
        try:
            doc_ref.update({
                'estado': 'error',
                'progresoMsg': f"Error local: {str(e)}",
                'error': str(e),
                'actualizadoEn': firestore.SERVER_TIMESTAMP
            })
        except Exception as fe:
            print(f"No se pudo escribir el error en Firestore: {fe}")

def worker():
    """Bucle del hilo worker que extrae y procesa solicitudes secuencialmente"""
    print("[Agente] Hilo de procesamiento iniciado. Esperando trabajos...")
    while True:
        try:
            job_id, doc_data = job_queue.get()
            if job_id is None: # Señal de apagado
                break
            
            # Ejecutar el procesamiento
            process_job(job_id, doc_data)
            
            job_queue.task_done()
        except Exception as e:
            print(f"[Worker Error] {e}")
            time.sleep(1)

# Iniciar hilo del worker
worker_thread = threading.Thread(target=worker, daemon=True)
worker_thread.start()

def on_snapshot_listener(doc_snapshot, changes, read_time):
    """Callback de Firestore que se ejecuta ante inserciones o cambios en tiempo real"""
    for change in changes:
        if change.type.name == 'ADDED':
            doc = change.document
            data = doc.to_dict()
            estado = data.get('estado')
            
            # Si el documento recién añadido (o que entra en vista) está 'pendiente'
            if estado == 'pendiente':
                job_id = doc.id
                print(f"\n[Agente] ¡Nuevo render detectado! JobID: {job_id} (Encolando...)")
                job_queue.put((job_id, data))

def main():
    print("=" * 80)
    print(" AGENTE PUENTE LOCAL FIREBASE <-> COMFYUI ")
    print(" Conectado a Firestore y en escucha activa de renders remotos...")
    print(" Presiona Ctrl+C para detener el agente.")
    print("=" * 80)
    
    # Iniciar la escucha en tiempo real de Firestore
    query = db.collection('cola_trabajos').where('estado', '==', 'pendiente')
    query_watch = query.on_snapshot(on_snapshot_listener)
    
    try:
        # Mantener el script vivo
        while True:
            time.sleep(1.0)
    except KeyboardInterrupt:
        print("\nDeteniendo el agente local...")
        query_watch.close()
        job_queue.put((None, None)) # Detener worker
        worker_thread.join(timeout=3.0)
        print("Agente detenido. ¡Adiós!")

if __name__ == "__main__":
    main()
