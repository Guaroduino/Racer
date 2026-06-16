const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3002;

const TEMP_FILTERED_DIR = path.join(__dirname, 'temp_filtered');
fs.mkdir(TEMP_FILTERED_DIR, { recursive: true }).catch(() => {});

// Dynamic ComfyUI port resolution (handles both 8188 for Portable and 8000 for Desktop)
let comfyUrl = 'http://127.0.0.1:8188';

async function getComfyUrl() {
  const ports = [8188, 8000];
  for (const port of ports) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 500);
      const res = await fetch(`http://127.0.0.1:${port}/`, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (res.status === 200 || res.status === 404 || res.status === 405) {
        comfyUrl = `http://127.0.0.1:${port}`;
        return comfyUrl;
      }
    } catch (e) {
      // Ignore and check next port
    }
  }
  return comfyUrl;
}

const LIGHTING_PRESETS_EXTERIOR = {
  default: "realistic ambient occlusion, volumetric natural sunlight",
  sunlight: "sharp crisp afternoon sunlight striking the facade at a dynamic angle, volumetric natural light, deep contrasting shadows, realistic ambient occlusion",
  golden_hour: "warm golden hour sunset lighting, long soft shadows, amber sunlight bathing the facade, peaceful evening ambiance",
  overcast: "soft diffused overcast daylight, shadowless ambient lighting, realistic flat shadows, neutral white balance, professional soft light photography",
  twilight: "dusk twilight blue hour, deep blue sky, warm glowing interior lights visible through windows, glowing external landscape lighting, architectural spotlighting, cozy night mood",
  morning: "clean cool morning daylight, soft directional sunlight, fresh atmosphere, natural clear light",
  none: ""
};

const LIGHTING_PRESETS_INTERIOR = {
  default: "soft natural light filtering through windows, realistic ambient occlusion",
  sunlight: "bright direct sunlight beams streaming through large windows, visible light shafts, high contrast shadow patterns cast on the floor and furniture, warm natural lighting",
  cozy_warm: "cozy warm artificial lighting, glowing designer lamps, soft ambient light, warm light pools, inviting domestic atmosphere, low contrast shadows",
  studio_soft: "even soft diffused white light, professional interior studio photography setup, clean soft shadows, no direct harsh sunlight, neutral color balance",
  morning: "soft cool morning light filtering through curtains, fresh natural atmosphere, clean bright interior lighting",
  twilight_night: "dusk blue hour outside windows, warm indoor accent lighting, dim ambient light, elegant spotlights highlighting architectural features, cozy night ambiance",
  none: ""
};

const STYLE_PRESETS = {
  default: "seamless wall junctions, borderless geometry, smooth transitions between surfaces, subtle organic imperfections, rich textures on concrete and wood, lived-in luxury atmosphere",
  minimalist: "minimalist architectural design, exposed smooth concrete, natural oak wood panels, black steel frames, large clean glass panes, seamless surfaces",
  industrial: "industrial loft aesthetic, exposed red brick walls, matte black iron beams, polished concrete floors, visible metal fixtures, raw structural elements",
  scandinavian: "cozy scandinavian design, light birch wood, clean white plaster walls, soft beige accents, wool and linen textures, warm minimalist furniture",
  classic: "classic architectural elegance, rich dark mahogany wood panels, polished white marble tiles, detailed plaster wall moldings, brass fixtures, natural limestone",
  rustic: "mediterranean rustic villa style, texturized white plaster walls, ancient hand-hewn oak beams, terracotta floor tiles, dry stone masonry, warm organic textures",
  brutalist: "monumental brutalist architecture, raw board-formed concrete, board-formed texture, bold geometric volumes, rough textures, dramatic monolithic scale, simple heavy materials",
  none: ""
};

const COLOR_PRESETS = {
  default: "masterpiece, professional architectural photography, award-winning interior design, hyper-realistic, high-end real estate photo, shot on Sony A7R V, 35mm lens, f/2.8, 8k resolution, cinematic color grading",
  editorial: "clean editorial architectural photography style, natural color rendering, realistic white balance, clean highlights, high fidelity, published in ArchDaily, shot on Hasselblad H6D, 8k resolution",
  cinematic: "cinematic color grading, rich dynamic range, filmic contrast, atmospheric depth, shot on anamorphic lens, sophisticated color palette, 8k resolution",
  cozy: "warm cozy color grading, soft golden and amber tones, inviting domestic atmosphere, low contrast shadows, comforting ambiance, 8k resolution",
  cool: "cool professional color grading, clean blue and silver tones, crisp clinical modern look, clean metallic highlights, high-tech corporate mood, 8k resolution",
  vintage: "vintage photography aesthetic, subtle analog film grain, slightly faded shadows, warm nostalgic colors, classic retro architecture photo style, 8k resolution",
  moody: "moody dark atmosphere, high contrast, deep shadows, low-key lighting, rich textures emerging from darkness, mysterious architectural look, 8k resolution",
  none: "8k resolution"
};

function generateMasterPrompt(body) {
  const sceneType = body.sceneType || 'exterior';
  const spaceType = body.spaceType || (sceneType === 'exterior' ? 'house' : 'living_room');
  const userPrompt = body.prompt || '';
  const refImage1 = body.refImage1 === 'true' || body.refImage1 === true;
  const refImage2 = body.refImage2 === 'true' || body.refImage2 === true;
  const ref1Materials = body.ref1Materials === 'true' || body.ref1Materials === true;
  const ref1Illumination = body.ref1Illumination === 'true' || body.ref1Illumination === true;
  const ref1CustomPrompt = body.ref1CustomPrompt || '';
  const ref2Materials = body.ref2Materials === 'true' || body.ref2Materials === true;
  const ref2Illumination = body.ref2Illumination === 'true' || body.ref2Illumination === true;
  const ref2CustomPrompt = body.ref2CustomPrompt || '';

  const lightingPreset = body.lightingPreset || 'default';
  const stylePreset = body.stylePreset || 'default';
  const colorPreset = body.colorPreset || 'default';

  // Map space types to English terms
  const spaceMap = {
    // Exterior
    house: 'modern residential house',
    building: 'apartment building',
    commercial: 'commercial building',
    villa: 'luxury villa',
    pavilion: 'architectural pavilion',
    // Interior
    living_room: 'modern living room',
    kitchen: 'modern kitchen',
    bedroom: 'modern bedroom',
    bathroom: 'modern bathroom',
    office: 'modern office workspace',
    restaurant: 'modern restaurant dining room',
    lobby: 'hotel lobby reception'
  };

  const spaceTypeEnglish = spaceMap[spaceType] || spaceType;
  
  const mainInstruction = `convert this image into a photorealistic architectural ${sceneType} photograph of a ${spaceTypeEnglish}, completely blending and removing all technical lines and outlines. Use the attached image solely as a reference for layout, material style, and soft natural illumination.`;

  let detailsPart = "";
  if (userPrompt.trim()) {
    detailsPart = `Additional details to incorporate: ${userPrompt.trim()}.`;
  }

  let styleRefPart = "";
  if (refImage1) {
    const uses = [];
    if (ref1Illumination) uses.push("illumination");
    if (ref1Materials) uses.push("materials");
    
    let line = "";
    if (uses.length > 0) {
      line = `image2 should be used only for reference for ${uses.join(" and ")}.`;
    } else {
      line = `image2 is provided as a general style reference.`;
    }
    if (ref1CustomPrompt && ref1CustomPrompt.trim()) {
      line += ` Additional instruction for image2: ${ref1CustomPrompt.trim()}.`;
    }
    styleRefPart += line;
  }

  if (refImage2) {
    const uses = [];
    if (ref2Illumination) uses.push("illumination");
    if (ref2Materials) uses.push("materials");
    
    let line = "";
    if (uses.length > 0) {
      line = `image3 should be used only for reference for ${uses.join(" and ")}.`;
    } else {
      line = `image3 is provided as a general style reference.`;
    }
    if (ref2CustomPrompt && ref2CustomPrompt.trim()) {
      line += ` Additional instruction for image3: ${ref2CustomPrompt.trim()}.`;
    }
    if (styleRefPart) styleRefPart += "\n\n";
    styleRefPart += line;
  }

  const isExterior = sceneType === 'exterior';
  const lightingDict = isExterior ? LIGHTING_PRESETS_EXTERIOR : LIGHTING_PRESETS_INTERIOR;
  const lightingStr = lightingDict[lightingPreset] || lightingDict.default;
  const styleStr = STYLE_PRESETS[stylePreset] || STYLE_PRESETS.default;
  const colorStr = COLOR_PRESETS[colorPreset] || COLOR_PRESETS.default;

  const promptParts = [
    mainInstruction,
    detailsPart,
    styleRefPart,
    [colorStr, styleStr, lightingStr].filter(Boolean).join(", "),
    `Avoid: 3d render, sketchup lines, black outlines, cartoon edges, drawing contours, wireframe, visible geometric borders, sharp artificial ink lines, architectural draft style, CGI, plastic textures, perfect CAD lines, rendering white dots, solid black creases`
  ].filter(Boolean);

  return promptParts.join("\n\n");
}

// Enable CORS for frontend development server
app.use(cors());
app.use(express.json());

// Set up Multer for memory storage of file uploads
const upload = multer({ storage: multer.memoryStorage() });

// Endpoint to get active ComfyUI port for WebSocket connection
app.get('/api/comfy-port', async (req, res) => {
  try {
    const currentComfyUrl = await getComfyUrl();
    const comfyPort = currentComfyUrl.split(':').pop();
    res.json({ port: comfyPort });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint to generate photorealistic render
app.post('/api/generate', upload.any(), async (req, res) => {
  try {
    const currentComfyUrl = await getComfyUrl();
    console.log(`Using ComfyUI active URL: ${currentComfyUrl}`);

    const mainFile = req.files ? req.files.find(file => file.fieldname === 'image') : null;
    if (!mainFile) {
      return res.status(400).json({ success: false, error: 'SketchUp render image is required.' });
    }

    const sceneType = req.body.sceneType || 'exterior';
    const spaceType = req.body.spaceType || (sceneType === 'exterior' ? 'house' : 'living_room');
    const userPrompt = req.body.prompt || '';
    const fullPrompt = req.body.fullPrompt || '';
    const clientId = req.body.clientId || '';
    const useTwoPass = req.body.useTwoPass === 'true' || req.body.useTwoPass === true;
    const sketchPrompt = req.body.sketchPrompt || '';
    const sketchDenoise = !isNaN(parseFloat(req.body.sketchDenoise)) ? parseFloat(req.body.sketchDenoise) : 1.0;
    const renderDenoise = !isNaN(parseFloat(req.body.renderDenoise)) ? parseFloat(req.body.renderDenoise) : 1.0;
    const sketchCfg = !isNaN(parseFloat(req.body.sketchCfg)) ? parseFloat(req.body.sketchCfg) : 1.0;
    const renderCfg = !isNaN(parseFloat(req.body.renderCfg)) ? parseFloat(req.body.renderCfg) : 1.0;

    const lightingPreset = req.body.lightingPreset || 'default';
    const stylePreset = req.body.stylePreset || 'default';
    const colorPreset = req.body.colorPreset || 'default';

    const ref1Materials = req.body.ref1Materials === 'true' || req.body.ref1Materials === true;
    const ref1Illumination = req.body.ref1Illumination === 'true' || req.body.ref1Illumination === true;
    const ref1CustomPrompt = req.body.ref1CustomPrompt || '';
    const ref2Materials = req.body.ref2Materials === 'true' || req.body.ref2Materials === true;
    const ref2Illumination = req.body.ref2Illumination === 'true' || req.body.ref2Illumination === true;
    const ref2CustomPrompt = req.body.ref2CustomPrompt || '';

    console.log(`Params: sceneType=${sceneType}, spaceType=${spaceType}, ref1Materials=${ref1Materials}, ref1Illumination=${ref1Illumination}, ref2Materials=${ref2Materials}, ref2Illumination=${ref2Illumination}`);

    const timestamp = Date.now();

    // (Optional) Upload style reference images to ComfyUI if provided
    const ref1File = req.files ? req.files.find(file => file.fieldname === 'refImage1') : null;
    const ref2File = req.files ? req.files.find(file => file.fieldname === 'refImage2') : null;

    let uniqueRef1Name = null;
    if (ref1File) {
      try {
        console.log('Uploading style ref 1 image to ComfyUI with unique name...');
        const ref1Form = new FormData();
        const ref1Blob = new Blob([ref1File.buffer], { type: ref1File.mimetype || 'image/jpeg' });
        uniqueRef1Name = `${timestamp}-ref1-${ref1File.originalname || 'style_ref_1.jpg'}`;
        ref1Form.append('image', ref1Blob, uniqueRef1Name);
        ref1Form.append('overwrite', 'true');
        await fetch(`${currentComfyUrl}/upload/image`, { method: 'POST', body: ref1Form });
      } catch (err) {
        console.warn('Failed to upload style ref 1 (non-blocking):', err.message);
      }
    }

    let uniqueRef2Name = null;
    if (ref2File) {
      try {
        console.log('Uploading style ref 2 image to ComfyUI with unique name...');
        const ref2Form = new FormData();
        const ref2Blob = new Blob([ref2File.buffer], { type: ref2File.mimetype || 'image/jpeg' });
        uniqueRef2Name = `${timestamp}-ref2-${ref2File.originalname || 'style_ref_2.jpg'}`;
        ref2Form.append('image', ref2Blob, uniqueRef2Name);
        ref2Form.append('overwrite', 'true');
        await fetch(`${currentComfyUrl}/upload/image`, { method: 'POST', body: ref2Form });
      } catch (err) {
        console.warn('Failed to upload style ref 2 (non-blocking):', err.message);
      }
    }

    // 1. Upload the main render image to ComfyUI (POST /upload/image)
    console.log('Uploading main image to ComfyUI with unique name...');
    const form = new FormData();
    const imageBlob = new Blob([mainFile.buffer], { type: mainFile.mimetype || 'image/jpeg' });
    const uniqueMainName = `${timestamp}-${mainFile.originalname || 'sketchup_render.jpg'}`;
    form.append('image', imageBlob, uniqueMainName);
    form.append('overwrite', 'true');

    const uploadResponse = await fetch(`${currentComfyUrl}/upload/image`, {
      method: 'POST',
      body: form,
    });

    if (!uploadResponse.ok) {
      const errText = await uploadResponse.text();
      throw new Error(`ComfyUI Image Upload failed: ${errText}`);
    }

    const uploadData = await uploadResponse.json();
    const comfyFilename = uploadData.name;
    console.log(`Uploaded to ComfyUI successfully. Filename returned: ${comfyFilename}`);

    // 2. Load the appropriate workflow JSON file
    let workflowFilename;
    if (sceneType === 'exterior') {
      workflowFilename = useTwoPass ? 'comfy_workflow - exteriores.json' : 'comfy_workflow_1pass - exteriores.json';
    } else {
      workflowFilename = useTwoPass ? 'comfy_workflow.json' : 'comfy_workflow_1pass.json';
    }
    const workflowPath = path.join(__dirname, '..', workflowFilename);
    console.log(`Loading workflow file: ${workflowFilename}`);
    let workflow;
    try {
      const workflowRaw = await fs.readFile(workflowPath, 'utf8');
      workflow = JSON.parse(workflowRaw);
    } catch (err) {
      throw new Error(`Failed to read workflow file at ${workflowPath}: ${err.message}`);
    }

    // 3. Modify workflow properties
    // - Locate node "78" ("class_type": "LoadImage") and update its "inputs" -> "image"
    if (workflow['78'] && workflow['78'].inputs) {
      workflow['78'].inputs.image = comfyFilename;
    } else {
      throw new Error("Node '78' (LoadImage) not found in workflow structure.");
    }

    // - Update node "120" (LoadImage) for style reference 1 if uploaded (create dynamically if not exists)
    if (ref1File && uniqueRef1Name) {
      if (!workflow['120']) {
        workflow['120'] = {
          "inputs": {
            "image": uniqueRef1Name
          },
          "class_type": "LoadImage",
          "_meta": {
            "title": "Load Image"
          }
        };
      } else if (workflow['120'].inputs) {
        workflow['120'].inputs.image = uniqueRef1Name;
      }
      // Link it to the prompt nodes
      if (workflow['115:111'] && workflow['115:111'].inputs) {
        workflow['115:111'].inputs.image2 = ["120", 0];
      }
      if (workflow['115:110'] && workflow['115:110'].inputs) {
        workflow['115:110'].inputs.image2 = ["120", 0];
      }
    } else {
      // If no style reference 1 is uploaded, remove the image2 connection in prompt nodes
      if (workflow['115:111'] && workflow['115:111'].inputs) {
        delete workflow['115:111'].inputs.image2;
      }
      if (workflow['115:110'] && workflow['115:110'].inputs) {
        delete workflow['115:110'].inputs.image2;
      }
      delete workflow['120'];
    }

    // - Update node "121" (LoadImage) for style reference 2 if uploaded (create dynamically if not exists)
    if (ref2File && uniqueRef2Name) {
      if (!workflow['121']) {
        workflow['121'] = {
          "inputs": {
            "image": uniqueRef2Name
          },
          "class_type": "LoadImage",
          "_meta": {
            "title": "Load Image"
          }
        };
      } else if (workflow['121'].inputs) {
        workflow['121'].inputs.image = uniqueRef2Name;
      }
      // Link it to the prompt nodes
      if (workflow['115:111'] && workflow['115:111'].inputs) {
        workflow['115:111'].inputs.image3 = ["121", 0];
      }
      if (workflow['115:110'] && workflow['115:110'].inputs) {
        workflow['115:110'].inputs.image3 = ["121", 0];
      }
    } else {
      // If no style reference 2 is uploaded, remove the image3 connection in prompt nodes
      if (workflow['115:111'] && workflow['115:111'].inputs) {
        delete workflow['115:111'].inputs.image3;
      }
      if (workflow['115:110'] && workflow['115:110'].inputs) {
        delete workflow['115:110'].inputs.image3;
      }
      delete workflow['121'];
    }

    // Check if we uploaded style reference files
    const hasRef1 = !!ref1File;
    const hasRef2 = !!ref2File;

    // Generate or override prompt
    let finalPrompt = fullPrompt;
    if (!finalPrompt.trim()) {
      finalPrompt = generateMasterPrompt({
        sceneType,
        spaceType,
        prompt: userPrompt,
        refImage1: hasRef1,
        refImage2: hasRef2,
        ref1Materials,
        ref1Illumination,
        ref1CustomPrompt,
        ref2Materials,
        ref2Illumination,
        ref2CustomPrompt,
        lightingPreset,
        stylePreset,
        colorPreset
      });
    }

    // - Locate Sketch KSampler node ("141:137") if it exists and randomize its seed
    if (workflow['141:137'] && workflow['141:137'].inputs) {
      const sketchSeed = Math.floor(Math.random() * 1000000000000000); // 15-digit integer
      workflow['141:137'].inputs.seed = sketchSeed;
      workflow['141:137'].inputs.denoise = sketchDenoise;
      workflow['141:137'].inputs.cfg = sketchCfg;
      console.log(`Configured Sketch KSampler node: seed=${sketchSeed}, denoise=${sketchDenoise}, cfg=${sketchCfg}`);
    }

    // - Locate Sketch positive prompt node ("141:132") and set its prompt
    if (workflow['141:132'] && workflow['141:132'].inputs) {
      if (sketchPrompt && sketchPrompt.trim()) {
        workflow['141:132'].inputs.prompt = sketchPrompt;
        console.log('Configured sketch positive prompt node with custom value.');
      } else {
        console.log('Using default sketch positive prompt from workflow.');
      }
    }

    // - Locate KSampler node ("115:3") and set its seed/denoise
    if (workflow['115:3'] && workflow['115:3'].inputs) {
      const randomSeed = Math.floor(Math.random() * 1000000000000000); // 15-digit integer
      workflow['115:3'].inputs.seed = randomSeed;
      workflow['115:3'].inputs.denoise = renderDenoise;
      workflow['115:3'].inputs.cfg = renderCfg;
      console.log(`Configured KSampler node: seed=${randomSeed}, denoise=${renderDenoise}, cfg=${renderCfg}`);
    } else {
      console.warn("KSampler node '115:3' not found in workflow structure.");
    }

    // - Locate node "115:111" ("class_type": "TextEncodeQwenImageEditPlus") and set the compiled Master Prompt
    if (workflow['115:111'] && workflow['115:111'].inputs) {
      workflow['115:111'].inputs.prompt = finalPrompt;
      console.log('Configured positive prompt node successfully.');
    } else {
      throw new Error("Node '115:111' (TextEncodeQwenImageEditPlus) not found in workflow structure.");
    }

    // 4. Send modified workflow to ComfyUI prompt queue (POST /prompt)
    console.log('Queueing prompt in ComfyUI...');
    const promptResponse = await fetch(`${currentComfyUrl}/prompt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt: workflow, client_id: clientId }),
    });

    if (!promptResponse.ok) {
      const errText = await promptResponse.text();
      throw new Error(`ComfyUI /prompt request failed: ${errText}`);
    }

    const promptData = await promptResponse.json();
    const promptId = promptData.prompt_id;
    console.log(`Prompt queued. Prompt ID: ${promptId}`);

    // 5. Poll for completion (GET /history/{prompt_id})
    console.log('Waiting for generation to finish...');
    let completed = false;
    let outputFilename = null;
    let sketchFilename = null;
    let retries = 0;
    const maxRetries = 600; // 5 minutes total at 500ms intervals

    while (!completed && retries < maxRetries) {
      const historyResponse = await fetch(`${currentComfyUrl}/history/${promptId}`);
      if (historyResponse.ok) {
        const historyData = await historyResponse.json();
        if (historyData[promptId]) {
          completed = true;
          const outputs = historyData[promptId].outputs;
          console.log('Generation completed. Parsing outputs...');

          // Extract final output image from node 60 (SaveImage)
          if (outputs['60'] && outputs['60'].images && outputs['60'].images.length > 0) {
            outputFilename = outputs['60'].images[0].filename;
            console.log(`Found final output image (node 60): ${outputFilename}`);
          }
          
          // Extract intermediate sketch image from node 142 (SaveImage)
          if (outputs['142'] && outputs['142'].images && outputs['142'].images.length > 0) {
            sketchFilename = outputs['142'].images[0].filename;
            console.log(`Found intermediate sketch image (node 142): ${sketchFilename}`);
          }

          // Fallback if node 60 not found
          if (!outputFilename) {
            if (useTwoPass) {
              throw new Error('ComfyUI no generó la imagen final del render (Nodo 60). Fase 2 (Fotorrealismo) falló o fue omitida. Revisa la consola de ComfyUI.');
            }
            const saveNode = Object.values(outputs).find(nodeOut => nodeOut.images && nodeOut.images.length > 0);
            if (saveNode && saveNode.images && saveNode.images.length > 0) {
              outputFilename = saveNode.images[0].filename;
              console.log(`Fallback: Found output image: ${outputFilename}`);
            }
          }
          break;
        }
      }
      // Wait 500ms before checking again
      await new Promise(resolve => setTimeout(resolve, 500));
      retries++;
    }

    if (!completed) {
      throw new Error('La generación en ComfyUI superó el tiempo límite de espera.');
    }

    if (!outputFilename) {
      throw new Error('ComfyUI terminó la ejecución pero no generó la imagen final (Nodo 60). Por favor, revisa la consola de comandos de ComfyUI para ver el log de error en rojo.');
    }

    // Send the generated image URL (proxied endpoint) back to the client
    res.json({
      success: true,
      image: `/api/image/${outputFilename}`,
      filename: outputFilename,
      sketchImage: sketchFilename ? `/api/image/${sketchFilename}` : null,
      sketchFilename: sketchFilename || null
    });

  } catch (err) {
    console.error('Error during generation workflow:', err.message);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    // Call ComfyUI's /free endpoint to clear memory cache
    try {
      const currentComfyUrl = await getComfyUrl();
      console.log('Cleaning up ComfyUI execution cache...');
      await fetch(`${currentComfyUrl}/free`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unload_models: false, free_memory: true })
      });
    } catch (e) {
      console.warn('Failed to clear ComfyUI cache (non-blocking):', e.message);
    }
  }
});

// Endpoint to upscale an existing ComfyUI output image to 4K using to4K.json workflow
app.post('/api/upscale', async (req, res) => {
  try {
    const currentComfyUrl = await getComfyUrl();
    const filename = req.body.filename;
    const clientId = req.body.clientId || '';
    const upscaleMethod = req.body.upscaleMethod || 'creative_photo';

    if (!filename) {
      return res.status(400).json({ success: false, error: 'El nombre de archivo de la imagen es requerido.' });
    }

    console.log(`Upscaling image: ${filename} to 4K using method: ${upscaleMethod}...`);
    const timestamp = Date.now();

    // 1. Fetch the image buffer from ComfyUI output view
    const viewUrl = `${currentComfyUrl}/view?filename=${encodeURIComponent(filename)}&subfolder=&type=output`;
    const imgResponse = await fetch(viewUrl);
    if (!imgResponse.ok) {
      throw new Error(`No se pudo obtener la imagen ${filename} desde la vista de ComfyUI: ${imgResponse.statusText}`);
    }
    const buffer = await imgResponse.arrayBuffer();

    // 2. Upload it back to ComfyUI as input image
    console.log('Uploading image back to ComfyUI for upscaling...');
    const uniqueInputName = `${timestamp}-upscale-${filename}`;
    const uploadForm = new FormData();
    const imageBlob = new Blob([buffer], { type: 'image/png' });
    uploadForm.append('image', imageBlob, uniqueInputName);
    uploadForm.append('overwrite', 'true');

    const uploadResponse = await fetch(`${currentComfyUrl}/upload/image`, {
      method: 'POST',
      body: uploadForm
    });

    if (!uploadResponse.ok) {
      const errText = await uploadResponse.text();
      throw new Error(`La carga de imagen a ComfyUI para escalado falló: ${errText}`);
    }

    // 3. Load workflow file based on upscaleMethod
    let workflowFilename = 'to4K_fotos.json';
    let saveImageNodeId = '10';
    if (upscaleMethod === 'creative_arch') {
      workflowFilename = 'to4K.json';
      saveImageNodeId = '10';
    } else if (upscaleMethod === 'creative_photo') {
      workflowFilename = 'to4K_fotos.json';
      saveImageNodeId = '10';
    } else if (upscaleMethod === 'creative_analog') {
      workflowFilename = 'to4K_analog.json';
      saveImageNodeId = '10';
    } else if (upscaleMethod === 'ultrasharp' || upscaleMethod === 'ultrasharp_analog') {
      workflowFilename = 'to4K_ultrasharp.json';
      saveImageNodeId = '4';
    }

    const workflowPath = path.join(__dirname, '..', workflowFilename);
    console.log(`Loading 4K upscale workflow file: ${workflowFilename}`);
    let workflow;
    try {
      const workflowRaw = await fs.readFile(workflowPath, 'utf8');
      workflow = JSON.parse(workflowRaw);
    } catch (err) {
      throw new Error(`Error al leer el archivo ${workflowFilename} en ${workflowPath}: ${err.message}`);
    }

    // 4. Modify node "1" (LoadImage) image property
    if (workflow['1'] && workflow['1'].inputs) {
      workflow['1'].inputs.image = uniqueInputName;
    } else {
      throw new Error("El nodo '1' (LoadImage) no fue encontrado en la estructura del flujo.");
    }

    // 5. Send workflow to prompt queue
    console.log('Queueing upscale prompt in ComfyUI...');
    const promptResponse = await fetch(`${currentComfyUrl}/prompt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt: workflow, client_id: clientId }),
    });

    if (!promptResponse.ok) {
      const errText = await promptResponse.text();
      throw new Error(`La solicitud de prompt de escalado falló: ${errText}`);
    }

    const promptData = await promptResponse.json();
    const promptId = promptData.prompt_id;
    console.log(`Upscale Prompt encolado. Prompt ID: ${promptId}`);

    // 6. Poll for completion
    console.log('Waiting for upscale to finish...');
    let completed = false;
    let outputFilename = null;
    let retries = 0;
    const maxRetries = 600; // 5 minutes

    while (!completed && retries < maxRetries) {
      const historyResponse = await fetch(`${currentComfyUrl}/history/${promptId}`);
      if (historyResponse.ok) {
        const historyData = await historyResponse.json();
        if (historyData[promptId]) {
          completed = true;
          const outputs = historyData[promptId].outputs;
          console.log('Upscale completed. Parsing outputs...');

          // Extract final output image from save node
          if (outputs[saveImageNodeId] && outputs[saveImageNodeId].images && outputs[saveImageNodeId].images.length > 0) {
            outputFilename = outputs[saveImageNodeId].images[0].filename;
            console.log(`Found upscaled output image (node ${saveImageNodeId}): ${outputFilename}`);
          }
          
          if (!outputFilename) {
            // Fallback
            const saveNode = Object.values(outputs).find(nodeOut => nodeOut.images && nodeOut.images.length > 0);
            if (saveNode && saveNode.images && saveNode.images.length > 0) {
              outputFilename = saveNode.images[0].filename;
              console.log(`Upscale Fallback: Found output image: ${outputFilename}`);
            }
          }
          break;
        }
      }
      await new Promise(resolve => setTimeout(resolve, 500));
      retries++;
    }

    if (!completed) {
      throw new Error('La conversión a 4K en ComfyUI superó el tiempo límite de espera.');
    }

    if (!outputFilename) {
      throw new Error(`ComfyUI terminó el escalado pero no generó la imagen 4K final (Nodo ${saveImageNodeId}). Por favor, revisa la consola de ComfyUI.`);
    }

    if (upscaleMethod === 'ultrasharp_analog') {
      try {
        console.log('Downloading image for fast analog filter...');
        const viewUrl = `${currentComfyUrl}/view?filename=${encodeURIComponent(outputFilename)}&subfolder=&type=output`;
        const imgResponse = await fetch(viewUrl);
        if (imgResponse.ok) {
          const imgBuffer = Buffer.from(await imgResponse.arrayBuffer());
          const localPath = path.join(TEMP_FILTERED_DIR, outputFilename);
          await fs.writeFile(localPath, imgBuffer);
          
          console.log('Applying fast PowerShell analog filter...');
          const psScript = path.join(__dirname, '..', 'apply_film_filter.ps1');
          execSync(`powershell -ExecutionPolicy Bypass -File "${psScript}" -InputPath "${localPath}" -OutputPath "${localPath}"`);
          console.log('Fast analog filter applied successfully!');
        }
      } catch (err) {
        console.error('Failed to apply fast analog filter:', err.message);
      }
    }

    res.json({
      success: true,
      image: `/api/image/${outputFilename}`,
      filename: outputFilename
    });

  } catch (err) {
    console.error('Error durante el flujo de escalado a 4K:', err.message);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    // Call ComfyUI's /free endpoint to clear memory cache
    try {
      const currentComfyUrl = await getComfyUrl();
      console.log('Cleaning up ComfyUI execution cache...');
      await fetch(`${currentComfyUrl}/free`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unload_models: false, free_memory: true })
      });
    } catch (e) {
      console.warn('Failed to clear ComfyUI cache (non-blocking):', e.message);
    }
  }
});

// Endpoint to upscale an uploaded image to 4K directly using to4K.json
app.post('/api/upscale-image', upload.any(), async (req, res) => {
  try {
    const currentComfyUrl = await getComfyUrl();
    console.log(`Using ComfyUI active URL for direct upscale: ${currentComfyUrl}`);

    const mainFile = req.files ? req.files.find(file => file.fieldname === 'image') : null;
    if (!mainFile) {
      return res.status(400).json({ success: false, error: 'La imagen para escalar es requerida.' });
    }

    const clientId = req.body.clientId || '';
    const upscaleMethod = req.body.upscaleMethod || 'creative_photo';
    const timestamp = Date.now();

    // 1. Upload the uploaded image to ComfyUI (POST /upload/image)
    console.log(`Uploading target image to ComfyUI for direct upscale using method: ${upscaleMethod}...`);
    const form = new FormData();
    const imageBlob = new Blob([mainFile.buffer], { type: mainFile.mimetype || 'image/jpeg' });
    const uniqueMainName = `${timestamp}-upscale-direct-${mainFile.originalname || 'image_to_upscale.jpg'}`;
    form.append('image', imageBlob, uniqueMainName);
    form.append('overwrite', 'true');

    const uploadResponse = await fetch(`${currentComfyUrl}/upload/image`, {
      method: 'POST',
      body: form,
    });

    if (!uploadResponse.ok) {
      const errText = await uploadResponse.text();
      throw new Error(`ComfyUI Image Upload failed: ${errText}`);
    }

    const uploadData = await uploadResponse.json();
    const comfyFilename = uploadData.name;
    console.log(`Uploaded directly to ComfyUI successfully: ${comfyFilename}`);

    // 2. Load workflow file based on upscaleMethod
    let workflowFilename = 'to4K_fotos.json';
    let saveImageNodeId = '10';
    if (upscaleMethod === 'creative_arch') {
      workflowFilename = 'to4K.json';
      saveImageNodeId = '10';
    } else if (upscaleMethod === 'creative_photo') {
      workflowFilename = 'to4K_fotos.json';
      saveImageNodeId = '10';
    } else if (upscaleMethod === 'creative_analog') {
      workflowFilename = 'to4K_analog.json';
      saveImageNodeId = '10';
    } else if (upscaleMethod === 'ultrasharp' || upscaleMethod === 'ultrasharp_analog') {
      workflowFilename = 'to4K_ultrasharp.json';
      saveImageNodeId = '4';
    }

    const workflowPath = path.join(__dirname, '..', workflowFilename);
    console.log(`Loading 4K upscale workflow file: ${workflowFilename}`);
    let workflow;
    try {
      const workflowRaw = await fs.readFile(workflowPath, 'utf8');
      workflow = JSON.parse(workflowRaw);
    } catch (err) {
      throw new Error(`Error al leer el archivo ${workflowFilename} en ${workflowPath}: ${err.message}`);
    }

    // 3. Modify node "1" (LoadImage) image property
    if (workflow['1'] && workflow['1'].inputs) {
      workflow['1'].inputs.image = comfyFilename;
    } else {
      throw new Error("El nodo '1' (LoadImage) no fue encontrado en la estructura del flujo.");
    }

    // 4. Send workflow to prompt queue
    console.log('Queueing direct upscale prompt in ComfyUI...');
    const promptResponse = await fetch(`${currentComfyUrl}/prompt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt: workflow, client_id: clientId }),
    });

    if (!promptResponse.ok) {
      const errText = await promptResponse.text();
      throw new Error(`La solicitud de prompt de escalado falló: ${errText}`);
    }

    const promptData = await promptResponse.json();
    const promptId = promptData.prompt_id;
    console.log(`Direct Upscale Prompt encolado. Prompt ID: ${promptId}`);

    // 5. Poll for completion
    console.log('Waiting for direct upscale to finish...');
    let completed = false;
    let outputFilename = null;
    let retries = 0;
    const maxRetries = 600; // 5 minutes

    while (!completed && retries < maxRetries) {
      const historyResponse = await fetch(`${currentComfyUrl}/history/${promptId}`);
      if (historyResponse.ok) {
        const historyData = await historyResponse.json();
        if (historyData[promptId]) {
          completed = true;
          const outputs = historyData[promptId].outputs;
          console.log('Direct upscale completed. Parsing outputs...');

          // Extract final output image from save node
          if (outputs[saveImageNodeId] && outputs[saveImageNodeId].images && outputs[saveImageNodeId].images.length > 0) {
            outputFilename = outputs[saveImageNodeId].images[0].filename;
            console.log(`Found upscaled output image (node ${saveImageNodeId}): ${outputFilename}`);
          }
          
          if (!outputFilename) {
            // Fallback
            const saveNode = Object.values(outputs).find(nodeOut => nodeOut.images && nodeOut.images.length > 0);
            if (saveNode && saveNode.images && saveNode.images.length > 0) {
              outputFilename = saveNode.images[0].filename;
              console.log(`Direct Upscale Fallback: Found output image: ${outputFilename}`);
            }
          }
          break;
        }
      }
      await new Promise(resolve => setTimeout(resolve, 500));
      retries++;
    }

    if (!completed) {
      throw new Error('La conversión a 4K en ComfyUI superó el tiempo límite de espera.');
    }

    if (!outputFilename) {
      throw new Error(`ComfyUI terminó el escalado pero no generó la imagen 4K final (Nodo ${saveImageNodeId}). Por favor, revisa la consola de ComfyUI.`);
    }

    if (upscaleMethod === 'ultrasharp_analog') {
      try {
        console.log('Downloading image for fast analog filter...');
        const viewUrl = `${currentComfyUrl}/view?filename=${encodeURIComponent(outputFilename)}&subfolder=&type=output`;
        const imgResponse = await fetch(viewUrl);
        if (imgResponse.ok) {
          const imgBuffer = Buffer.from(await imgResponse.arrayBuffer());
          const localPath = path.join(TEMP_FILTERED_DIR, outputFilename);
          await fs.writeFile(localPath, imgBuffer);
          
          console.log('Applying fast PowerShell analog filter...');
          const psScript = path.join(__dirname, '..', 'apply_film_filter.ps1');
          execSync(`powershell -ExecutionPolicy Bypass -File "${psScript}" -InputPath "${localPath}" -OutputPath "${localPath}"`);
          console.log('Fast analog filter applied successfully!');
        }
      } catch (err) {
        console.error('Failed to apply fast analog filter:', err.message);
      }
    }

    res.json({
      success: true,
      image: `/api/image/${outputFilename}`,
      filename: outputFilename
    });

  } catch (err) {
    console.error('Error durante el flujo de escalado a 4K directo:', err.message);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    // Call ComfyUI's /free endpoint to clear memory cache
    try {
      const currentComfyUrl = await getComfyUrl();
      console.log('Cleaning up ComfyUI execution cache...');
      await fetch(`${currentComfyUrl}/free`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unload_models: false, free_memory: true })
      });
    } catch (e) {
      console.warn('Failed to clear ComfyUI cache (non-blocking):', e.message);
    }
  }
});

// Proxy endpoint to download/view images from ComfyUI to bypass CORS issues
app.get('/api/image/:filename', async (req, res) => {
  try {
    const filename = req.params.filename;
    
    // Check if we have a filtered version locally first
    const cachedPath = path.join(TEMP_FILTERED_DIR, filename);
    try {
      await fs.access(cachedPath);
      res.setHeader('Content-Type', 'image/png');
      return res.sendFile(cachedPath);
    } catch (e) {
      // File not cached, continue to fetch from ComfyUI
    }

    const currentComfyUrl = await getComfyUrl();
    const viewUrl = `${currentComfyUrl}/view?filename=${encodeURIComponent(filename)}&subfolder=&type=output`;

    const imgResponse = await fetch(viewUrl);
    if (!imgResponse.ok) {
      return res.status(404).send('Image not found in ComfyUI output.');
    }

    const contentType = imgResponse.headers.get('content-type') || 'image/png';
    res.setHeader('Content-Type', contentType);

    const buffer = Buffer.from(await imgResponse.arrayBuffer());
    res.send(buffer);
  } catch (err) {
    console.error('Error proxying image from ComfyUI:', err.message);
    res.status(500).send('Error retrieving image from ComfyUI.');
  }
});

// Serve frontend static files in production
const clientDistPath = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDistPath));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next();
  }
  res.sendFile(path.join(clientDistPath, 'index.html'));
});

// Start the server listening on all network interfaces to support local network device access
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT} (Accessible across local network)`);
});
