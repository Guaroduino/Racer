const fs = require('fs').promises;
const { existsSync } = require('fs');
const path = require('path');
const readline = require('readline');
const { execSync } = require('child_process');

// Configurations
const INPUT_DIR = path.join(__dirname, 'input_4k');
const OUTPUT_DIR = path.join(__dirname, 'output_4k');
const CHECK_INTERVAL = 5000; // 5 seconds

// Helper to ask user via terminal
function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => rl.question(query, (ans) => {
    rl.close();
    resolve(ans.trim());
  }));
}

// Helper to find the active ComfyUI port (checking 8188 and 8000)
async function getComfyUrl() {
  const ports = [8188, 8000];
  for (const port of ports) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 500);
      const res = await fetch(`http://127.0.0.1:${port}/`, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (res.status === 200 || res.status === 404 || res.status === 405) {
        return `http://127.0.0.1:${port}`;
      }
    } catch (e) {
      // Ignore
    }
  }
  return null;
}

// Sleep helper
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  console.log('========================================================');
  console.log('       PROCESADOR DE IMÁGENES A 4K POR LOTES (WATCHER)');
  console.log('========================================================');
  console.log(`Carpeta de Entrada:  ${INPUT_DIR}`);
  console.log(`Carpeta de Salida:   ${OUTPUT_DIR}`);
  console.log('========================================================\n');

  // 1. Ensure folders exist
  try {
    await fs.mkdir(INPUT_DIR, { recursive: true });
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
  } catch (err) {
    console.error('Error al crear las carpetas:', err.message);
    process.exit(1);
  }

  // 2. Determine scaling method (from argument or interactive prompt)
  let chosenMode = process.argv[2];
  if (!chosenMode || !['1', '2', '3', '4', '5'].includes(chosenMode)) {
    console.log('Selecciona el método de escalado 4K:');
    console.log(' [1] IA Creativa (Arquitectura)   - Inyecta grano de madera, mármol y concreto.');
    console.log(' [2] IA Creativa (Fotografías)   - Para fotos reales. Mezcla costuras y evita invenciones.');
    console.log(' [3] Escalado Ultra-Fiel (Rápido) - 4x-UltraSharp directo sin reconstrucción de IA (100% fiel).');
    console.log(' [4] IA Creativa (Filtro de Rollo) - Añade grano de 35mm y tonos cálidos estilo Kodak Portra.');
    console.log(' [5] Escalado Fiel + Filtro Rollo - Escalado Ultra-Fiel rápido (1s) + grano y tono cálido en memoria.');
    console.log('');
    const answer = await askQuestion('Selecciona una opción (1, 2, 3, 4 o 5) [Por defecto: 3]: ');
    chosenMode = answer || '3';
    if (!['1', '2', '3', '4', '5'].includes(chosenMode)) {
      console.log('Opción no válida. Usando opción por defecto [3].');
      chosenMode = '3';
    }
  }

  let workflowFilename = 'to4K_ultrasharp.json';
  let saveImageNodeId = '4';
  let modeName = 'Escalado Ultra-Fiel (4x-UltraSharp)';

  if (chosenMode === '1') {
    workflowFilename = 'to4K.json';
    saveImageNodeId = '10';
    modeName = 'IA Creativa (Arquitectura)';
  } else if (chosenMode === '2') {
    workflowFilename = 'to4K_fotos.json';
    saveImageNodeId = '10';
    modeName = 'IA Creativa (Fotografías)';
  } else if (chosenMode === '3') {
    workflowFilename = 'to4K_ultrasharp.json';
    saveImageNodeId = '4';
    modeName = 'Escalado Ultra-Fiel (4x-UltraSharp)';
  } else if (chosenMode === '4') {
    workflowFilename = 'to4K_analog.json';
    saveImageNodeId = '10';
    modeName = 'IA Creativa (Filtro de Rollo / Ruido)';
  } else if (chosenMode === '5') {
    workflowFilename = 'to4K_ultrasharp.json';
    saveImageNodeId = '4';
    modeName = 'Escalado Ultra-Fiel + Filtro de Rollo (Rápido)';
  }

  const WORKFLOW_PATH = path.join(__dirname, workflowFilename);

  console.log(`\n🟢 Modo Activo:       ${modeName}`);
  console.log(`🟢 Flujo Utilizado:   ${workflowFilename}`);
  console.log('========================================================\n');

  // 3. Wait for ComfyUI to become available
  let comfyUrl = null;
  while (!comfyUrl) {
    comfyUrl = await getComfyUrl();
    if (!comfyUrl) {
      process.stdout.write('⏳ Esperando a que ComfyUI esté activo en el puerto 8188 o 8000...\r');
      await sleep(3000);
    }
  }
  // Clear waiting line
  process.stdout.write('                                                              \r');
  console.log(`🟢 ComfyUI detectado y listo en: ${comfyUrl}\n`);

  // 4. Main processing loop
  while (true) {
    let files = [];
    try {
      files = await fs.readdir(INPUT_DIR);
    } catch (err) {
      console.error('Error al leer la carpeta de entrada:', err.message);
      await sleep(CHECK_INTERVAL);
      continue;
    }

    // Filter image files
    const imageExtensions = ['.png', '.jpg', '.jpeg', '.webp', '.bmp'];
    const imageFiles = files.filter((file) => {
      const ext = path.extname(file).toLowerCase();
      return imageExtensions.includes(ext);
    });

    if (imageFiles.length === 0) {
      process.stdout.write('🔍 Escaneando "input_4k"... (esperando imágenes nuevas)\r');
      await sleep(CHECK_INTERVAL);
      continue;
    }

    // Clear the scanning line
    process.stdout.write('                                                              \r');

    // Find files that haven't been upscaled yet
    const pendingFiles = [];
    for (const file of imageFiles) {
      const parsed = path.parse(file);
      const outputFilename = `${parsed.name}_4K.png`;
      const outputPath = path.join(OUTPUT_DIR, outputFilename);
      if (!existsSync(outputPath)) {
        pendingFiles.push({
          inputName: file,
          inputPath: path.join(INPUT_DIR, file),
          outputName: outputFilename,
          outputPath: outputPath
        });
      }
    }

    if (pendingFiles.length === 0) {
      process.stdout.write('✅ Todas las imágenes en "input_4k" ya fueron procesadas a 4K.\r');
      await sleep(CHECK_INTERVAL);
      continue;
    }

    // Clear the line again
    process.stdout.write('                                                              \r');
    console.log(`🚀 Se encontraron ${pendingFiles.length} imágenes nuevas pendientes de procesar.`);

    for (let i = 0; i < pendingFiles.length; i++) {
      const item = pendingFiles[i];
      console.log(`\n========================================================`);
      console.log(`🖼️  [${i + 1}/${pendingFiles.length}] Procesando: ${item.inputName}`);
      console.log(`========================================================`);

      try {
        // A. Upload image to ComfyUI
        console.log('📤 Subiendo imagen original a ComfyUI...');
        const fileBuffer = await fs.readFile(item.inputPath);
        const uploadForm = new FormData();
        const blob = new Blob([fileBuffer], { type: 'image/png' });
        const uniqueComfyName = `${Date.now()}-upscale-${item.inputName}`;
        uploadForm.append('image', blob, uniqueComfyName);
        uploadForm.append('overwrite', 'true');

        const uploadRes = await fetch(`${comfyUrl}/upload/image`, {
          method: 'POST',
          body: uploadForm
        });

        if (!uploadRes.ok) {
          const errText = await uploadRes.text();
          throw new Error(`Error al subir imagen a ComfyUI: ${errText}`);
        }

        const uploadData = await uploadRes.json();
        const comfyFilename = uploadData.name;
        console.log(`✅ Imagen subida con éxito como: ${comfyFilename}`);

        // B. Load selected workflow JSON
        if (!existsSync(WORKFLOW_PATH)) {
          throw new Error(`El archivo de flujo ${WORKFLOW_PATH} no existe.`);
        }
        const workflowRaw = await fs.readFile(WORKFLOW_PATH, 'utf8');
        const workflow = JSON.parse(workflowRaw);

        // C. Configure workflow LoadImage node (ID: "1")
        if (workflow['1'] && workflow['1'].inputs) {
          workflow['1'].inputs.image = comfyFilename;
        } else {
          throw new Error("El nodo '1' (LoadImage) no existe en el flujo de trabajo.");
        }

        // D. Send workflow to ComfyUI prompt queue
        console.log('📨 Enviando tarea a la cola de ComfyUI...');
        const promptRes = await fetch(`${comfyUrl}/prompt`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: workflow })
        });

        if (!promptRes.ok) {
          const errText = await promptRes.text();
          throw new Error(`Error al encolar en ComfyUI: ${errText}`);
        }

        const promptData = await promptRes.json();
        const promptId = promptData.prompt_id;
        console.log(`🎯 Tarea encolada. ID de Prompt: ${promptId}`);

        // E. Poll for completion
        console.log('⏳ Procesando y escalando a 4K... (Esto puede tomar de 5 a 60 segundos)');
        let completed = false;
        let outputComfyFilename = null;
        let retries = 0;
        const maxRetries = 1200; // Hasta 10 minutos por imagen

        while (!completed && retries < maxRetries) {
          const historyRes = await fetch(`${comfyUrl}/history/${promptId}`);
          if (historyRes.ok) {
            const historyData = await historyRes.json();
            if (historyData[promptId]) {
              completed = true;
              const outputs = historyData[promptId].outputs;
              
              // Obtener la salida del nodo SaveImage configurado
              if (outputs[saveImageNodeId] && outputs[saveImageNodeId].images && outputs[saveImageNodeId].images.length > 0) {
                outputComfyFilename = outputs[saveImageNodeId].images[0].filename;
              }

              // Fallback por si acaso
              if (!outputComfyFilename) {
                const saveNode = Object.values(outputs).find(nodeOut => nodeOut.images && nodeOut.images.length > 0);
                if (saveNode && saveNode.images && saveNode.images.length > 0) {
                  outputComfyFilename = saveNode.images[0].filename;
                }
              }
              break;
            }
          }
          await sleep(1000); // Consultar cada 1 segundo
          retries++;
        }

        if (!completed) {
          throw new Error('Tiempo límite de espera superado para esta imagen.');
        }

        if (!outputComfyFilename) {
          throw new Error(`La ejecución terminó pero no se encontró la imagen final guardada (Nodo ${saveImageNodeId}).`);
        }

        // F. Download output image
        console.log('📥 Descargando imagen 4K generada...');
        const viewUrl = `${comfyUrl}/view?filename=${encodeURIComponent(outputComfyFilename)}&subfolder=&type=output`;
        const viewRes = await fetch(viewUrl);
        if (!viewRes.ok) {
          throw new Error(`No se pudo descargar la imagen: ${viewRes.statusText}`);
        }
        const imgBuffer = await viewRes.arrayBuffer();
        await fs.writeFile(item.outputPath, Buffer.from(imgBuffer));

        if (chosenMode === '5') {
          try {
            console.log('🎞️ Aplicando filtro analógico rápido en memoria...');
            const psScript = path.join(__dirname, 'apply_film_filter.ps1');
            execSync(`powershell -ExecutionPolicy Bypass -File "${psScript}" -InputPath "${item.outputPath}" -OutputPath "${item.outputPath}"`);
            console.log('🎞️ Filtro analógico rápido aplicado con éxito!');
          } catch (err) {
            console.error('❌ Error al aplicar el filtro analógico rápido:', err.message);
          }
        }

        console.log(`🎉 ¡ÉXITO! Imagen guardada en: ${item.outputPath}`);

      } catch (err) {
        console.error(`❌ ERROR procesando ${item.inputName}:`, err.message);
        console.log('Saltando al siguiente archivo...');
      } finally {
        // G. Clean up ComfyUI VRAM/RAM cache
        try {
          await fetch(`${comfyUrl}/free`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ unload_models: false, free_memory: true })
          });
        } catch (e) {
          // Ignorar fallo de limpieza de caché
        }
      }
    }

    console.log('\n😴 Lote actual finalizado. Esperando nuevas imágenes...');
    await sleep(CHECK_INTERVAL);
  }
}

main().catch((err) => {
  console.error('Ocurrió un error fatal:', err);
});
