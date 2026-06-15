const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3002;

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

// Enable CORS for frontend development server
app.use(cors());
app.use(express.json());

// Set up Multer for memory storage of file uploads
const upload = multer({ storage: multer.memoryStorage() });

// Endpoint to generate photorealistic render
app.post('/api/generate', upload.any(), async (req, res) => {
  try {
    const currentComfyUrl = await getComfyUrl();
    console.log(`Using ComfyUI active URL: ${currentComfyUrl}`);

    const mainFile = req.files ? req.files.find(file => file.fieldname === 'image') : null;
    if (!mainFile) {
      return res.status(400).json({ success: false, error: 'SketchUp render image is required.' });
    }

    const userPrompt = req.body.prompt || '';
    console.log(`Received request. Prompt length: ${userPrompt.length}`);

    // (Optional) Upload style reference images to ComfyUI if provided
    const ref1File = req.files ? req.files.find(file => file.fieldname === 'refImage1') : null;
    const ref2File = req.files ? req.files.find(file => file.fieldname === 'refImage2') : null;

    if (ref1File) {
      try {
        console.log('Uploading style ref 1 image to ComfyUI...');
        const ref1Form = new FormData();
        const ref1Blob = new Blob([ref1File.buffer], { type: ref1File.mimetype || 'image/jpeg' });
        ref1Form.append('image', ref1Blob, ref1File.originalname || 'style_ref_1.jpg');
        ref1Form.append('overwrite', 'true');
        await fetch(`${currentComfyUrl}/upload/image`, { method: 'POST', body: ref1Form });
      } catch (err) {
        console.warn('Failed to upload style ref 1 (non-blocking):', err.message);
      }
    }

    if (ref2File) {
      try {
        console.log('Uploading style ref 2 image to ComfyUI...');
        const ref2Form = new FormData();
        const ref2Blob = new Blob([ref2File.buffer], { type: ref2File.mimetype || 'image/jpeg' });
        ref2Form.append('image', ref2Blob, ref2File.originalname || 'style_ref_2.jpg');
        ref2Form.append('overwrite', 'true');
        await fetch(`${currentComfyUrl}/upload/image`, { method: 'POST', body: ref2Form });
      } catch (err) {
        console.warn('Failed to upload style ref 2 (non-blocking):', err.message);
      }
    }

    // 1. Upload the main render image to ComfyUI (POST /upload/image)
    console.log('Uploading image to ComfyUI...');
    const form = new FormData();
    const imageBlob = new Blob([mainFile.buffer], { type: mainFile.mimetype || 'image/jpeg' });
    form.append('image', imageBlob, mainFile.originalname || 'sketchup_render.jpg');
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

    // 2. Load the comfy_workflow.json file
    const workflowPath = path.join(__dirname, '..', 'comfy_workflow.json');
    let workflow;
    try {
      const workflowRaw = await fs.readFile(workflowPath, 'utf8');
      workflow = JSON.parse(workflowRaw);
    } catch (err) {
      throw new Error(`Failed to read comfy_workflow.json at ${workflowPath}: ${err.message}`);
    }

    // 3. Modify workflow properties
    // - Locate node "78" ("class_type": "LoadImage") and update its "inputs" -> "image"
    if (workflow['78'] && workflow['78'].inputs) {
      workflow['78'].inputs.image = comfyFilename;
    } else {
      throw new Error("Node '78' (LoadImage) not found in workflow structure.");
    }

    // - Locate KSampler node ("115:3") and randomize its seed to force a fresh generation and prevent caching issues
    if (workflow['115:3'] && workflow['115:3'].inputs) {
      const randomSeed = Math.floor(Math.random() * 1000000000000000); // 15-digit integer
      workflow['115:3'].inputs.seed = randomSeed;
      console.log(`Randomized KSampler seed to: ${randomSeed}`);
    } else {
      console.warn("KSampler node '115:3' not found in workflow structure. Seed not randomized.");
    }

    // - Locate node "115:111" ("class_type": "TextEncodeQwenImageEditPlus")
    //   and append user's custom prompt text to the very end of "inputs" -> "prompt"
    if (workflow['115:111'] && workflow['115:111'].inputs) {
      const originalPrompt = workflow['115:111'].inputs.prompt || '';
      if (userPrompt.trim()) {
        workflow['115:111'].inputs.prompt = `${originalPrompt}, ${userPrompt.trim()}`;
      }
      console.log('Modified prompt node successfully.');
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
      body: JSON.stringify({ prompt: workflow }),
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

          // Extract output image from node 60 (SaveImage) or any node that saved images
          const saveNode = outputs['60'] || Object.values(outputs).find(nodeOut => nodeOut.images && nodeOut.images.length > 0);
          if (saveNode && saveNode.images && saveNode.images.length > 0) {
            outputFilename = saveNode.images[0].filename;
            console.log(`Found output image: ${outputFilename}`);
          }
          break;
        }
      }
      // Wait 500ms before checking again
      await new Promise(resolve => setTimeout(resolve, 500));
      retries++;
    }

    if (!completed || !outputFilename) {
      throw new Error('ComfyUI execution timed out or failed to return output image.');
    }

    // Send the generated image URL (proxied endpoint) back to the client
    res.json({
      success: true,
      image: `/api/image/${outputFilename}`,
      filename: outputFilename
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

// Proxy endpoint to download/view images from ComfyUI to bypass CORS issues
app.get('/api/image/:filename', async (req, res) => {
  try {
    const currentComfyUrl = await getComfyUrl();
    const filename = req.params.filename;
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
