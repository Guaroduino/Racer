import { useState, useEffect, useRef } from 'react';
import { auth, db, storage } from './firebase';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { doc, addDoc, onSnapshot, serverTimestamp, collection } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';


const DEFAULT_BASE_PROMPT = `convert this image into a photorealistic architectural exterior photograph of a modern residential house, completely blending and removing all technical lines and outlines. Use the attached image solely as a reference for layout, material style, and soft natural illumination.

masterpiece, professional architectural photography, award-winning interior design, hyper-realistic, high-end real estate photo, shot on Sony A7R V, 35mm lens, f/2.8, seamless wall junctions, borderless geometry, smooth transitions between surfaces, realistic ambient occlusion, volumetric natural sunlight, subtle organic imperfections, rich textures on concrete and wood, lived-in luxury atmosphere, 8k resolution, cinematic color grading.

Avoid: 3d render, sketchup lines, black outlines, cartoon edges, drawing contours, wireframe, visible geometric borders, sharp artificial ink lines, architectural draft style, CGI, plastic textures, perfect CAD lines, rendering white dots, solid black creases`;

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

const generateMasterPrompt = ({
  sceneType,
  spaceType,
  prompt,
  refImage1,
  refImage2,
  ref1Materials,
  ref1Illumination,
  ref1CustomPrompt,
  ref2Materials,
  ref2Illumination,
  ref2CustomPrompt,
  lightingPreset = 'default',
  stylePreset = 'default',
  colorPreset = 'default'
}) => {
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
  if (prompt && prompt.trim()) {
    detailsPart = `Additional details to incorporate: ${prompt.trim()}.`;
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
};

const connectComfyWebSocket = (port, clientId, onMessageReceived) => {
  return new Promise((resolve) => {
    // Determine host - if localhost or empty, use window.location.hostname
    const hostname = window.location.hostname || '127.0.0.1';
    const wsUrl = `ws://${hostname}:${port}/ws?clientId=${clientId}`;
    console.log(`Connecting to ComfyUI WebSocket: ${wsUrl}`);
    
    const socket = new WebSocket(wsUrl);
    
    // Set a timeout to proceed even if WebSocket fails (fallback to polling history)
    const timeoutId = setTimeout(() => {
      console.warn('WebSocket connection timeout, resolving with null');
      resolve(null);
    }, 2000);

    socket.onopen = () => {
      clearTimeout(timeoutId);
      console.log('WebSocket connected successfully');
      resolve(socket);
    };

    socket.onmessage = (event) => {
      onMessageReceived(event);
    };

    socket.onerror = (err) => {
      clearTimeout(timeoutId);
      console.warn('WebSocket error:', err);
      resolve(null);
    };

    socket.onclose = () => {
      console.log('WebSocket closed');
    };
  });
};

const handleDownloadImage = async (imgUrl, defaultName) => {
  if (!imgUrl) return;
  try {
    const response = await fetch(imgUrl);
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `${defaultName}_${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error('Error al descargar la imagen:', err);
    window.open(imgUrl, '_blank');
  }
};

function App() {
  const [mainImage, setMainImage] = useState(null);
  const [mainPreview, setMainPreview] = useState(null);

  // Firebase integration states
  const [workMode, setWorkMode] = useState('local');
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Monitor user login state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setAuthError('');
    setIsLoggingIn(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      setEmail('');
      setPassword('');
    } catch (err) {
      console.error(err);
      let errMsg = 'Error al iniciar sesión. Comprueba tus credenciales.';
      if (err.code === 'auth/user-not-found') errMsg = 'El usuario no está registrado.';
      if (err.code === 'auth/wrong-password') errMsg = 'Contraseña incorrecta.';
      if (err.code === 'auth/invalid-credential') errMsg = 'Credenciales inválidas.';
      setAuthError(errMsg);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleGoogleLogin = async () => {
    setAuthError('');
    setIsLoggingIn(true);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err) {
      console.error(err);
      let errMsg = 'Error al iniciar sesión con Google.';
      if (err.code === 'auth/popup-closed-by-user') errMsg = 'El popup fue cerrado por el usuario.';
      if (err.code === 'auth/operation-not-allowed') errMsg = 'El proveedor de Google no está habilitado en Firebase.';
      setAuthError(errMsg);
    } finally {
      setIsLoggingIn(false);
    }
  };


  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  // Helper to upload images to Firebase Storage
  const uploadToFirebaseStorage = (file, pathStr) => {
    return new Promise((resolve, reject) => {
      if (!file) {
        resolve(null);
        return;
      }
      const storageRef = ref(storage, pathStr);
      const uploadTask = uploadBytesResumable(storageRef, file);
      
      uploadTask.on('state_changed', 
        (snapshot) => {
          const progressVal = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
          setProgress(Math.round(progressVal * 0.9)); // 90% is upload, 10% is queue
          setProgressMessage(`Subiendo archivo a la nube (${progressVal}%)...`);
        }, 
        (err) => {
          reject(err);
        }, 
        async () => {
          const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
          resolve(downloadUrl);
        }
      );
    });
  };

  const [prompt, setPrompt] = useState('');
  
  // Optional style references
  const [refImage1, setRefImage1] = useState(null);
  const [refImage1Preview, setRefImage1Preview] = useState(null);
  const [refImage2, setRefImage2] = useState(null);
  const [refImage2Preview, setRefImage2Preview] = useState(null);

  // Simplified design template control states
  const [sceneType, setSceneType] = useState('exterior');
  const [spaceType, setSpaceType] = useState('house');

  // Specific style reference options
  const [ref1Materials, setRef1Materials] = useState(true);
  const [ref1Illumination, setRef1Illumination] = useState(true);
  const [ref1CustomPrompt, setRef1CustomPrompt] = useState('');

  const [ref2Materials, setRef2Materials] = useState(true);
  const [ref2Illumination, setRef2Illumination] = useState(true);
  const [ref2CustomPrompt, setRef2CustomPrompt] = useState('');

  // Sketch prompt state for two-pass workflow
  const [sketchPrompt, setSketchPrompt] = useState('convert this image into a marker and ink drawing. Keep material details, colors, surfaces texturing,add light hatch to flat surface to cleary show them');
  const [showSketchAdvanced, setShowSketchAdvanced] = useState(false);

  // Advanced collapsible prompt editing
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [fullPrompt, setFullPrompt] = useState(DEFAULT_BASE_PROMPT);
  const [isFullPromptEdited, setIsFullPromptEdited] = useState(false);

  // Generation states
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStage, setGenerationStage] = useState('idle'); // idle, uploading, queueing, generating, finalizing
  const [resultImage, setResultImage] = useState(null);
  const [sketchImage, setSketchImage] = useState(null);
  const [activeTab, setActiveTab] = useState('final');
  const [genMode, setGenMode] = useState('one_pass'); // 'one_pass', 'two_pass', 'only_4k'
  const useTwoPass = genMode === 'two_pass';
  const [error, setError] = useState(null);

  // Denoise and CFG sliders states
  const [sketchDenoise, setSketchDenoise] = useState(1.0);
  const [renderDenoise, setRenderDenoise] = useState(0.94);
  const [sketchCfg, setSketchCfg] = useState(1.0);
  const [renderCfg, setRenderCfg] = useState(1.3);
  const [showDenoiseAdvanced, setShowDenoiseAdvanced] = useState(false);

  const resetDiffusionDefaults = () => {
    setSketchDenoise(1.0);
    setSketchCfg(1.0);
    if (useTwoPass || sceneType === 'exterior') {
      setRenderDenoise(0.94);
      setRenderCfg(1.3);
    } else {
      setRenderDenoise(1.0);
      setRenderCfg(1.0);
    }
  };

  useEffect(() => {
    if (useTwoPass || sceneType === 'exterior') {
      if (renderDenoise === 1.0 && renderCfg === 1.0) {
        setRenderDenoise(0.94);
        setRenderCfg(1.3);
      }
    } else {
      if (renderDenoise === 0.94 && renderCfg === 1.3) {
        setRenderDenoise(1.0);
        setRenderCfg(1.0);
      }
    }
  }, [sceneType, useTwoPass]);

  // Preset states
  const [lightingPreset, setLightingPreset] = useState('default');
  const [stylePreset, setStylePreset] = useState('default');
  const [colorPreset, setColorPreset] = useState('default');
  const [showPresetsAdvanced, setShowPresetsAdvanced] = useState(false);

  // 4K Upscale states
  const [isUpscaling, setIsUpscaling] = useState(false);
  const [upscaledImage, setUpscaledImage] = useState(null);
  const [upscaledFilename, setUpscaledFilename] = useState(null);
  const [resultFilename, setResultFilename] = useState(null);
  const [upscaleMethod, setUpscaleMethod] = useState('ultrasharp'); // 'creative_arch', 'creative_photo', 'ultrasharp'

  // Real-time progress and queue states
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [queueRemaining, setQueueRemaining] = useState(0);
  const wsRef = useRef(null);

  // PWA installation state
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showInstallBtn, setShowInstallBtn] = useState(false);

  // Refs for file inputs
  const mainInputRef = useRef(null);
  const ref1InputRef = useRef(null);
  const ref2InputRef = useRef(null);

  const hasRefImages = !!(refImage1 || refImage2);

  // Sync basic prompt and options with full prompt if not manually edited
  useEffect(() => {
    if (!isFullPromptEdited) {
      const generated = generateMasterPrompt({
        sceneType,
        spaceType,
        prompt,
        refImage1: !!refImage1,
        refImage2: !!refImage2,
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
      setFullPrompt(generated);
    }
  }, [
    sceneType,
    spaceType,
    prompt,
    refImage1,
    refImage2,
    ref1Materials,
    ref1Illumination,
    ref1CustomPrompt,
    ref2Materials,
    ref2Illumination,
    ref2CustomPrompt,
    isFullPromptEdited,
    lightingPreset,
    stylePreset,
    colorPreset
  ]);

  const handleFullPromptChange = (e) => {
    setFullPrompt(e.target.value);
    setIsFullPromptEdited(true);
  };

  const handleResetFullPrompt = () => {
    setIsFullPromptEdited(false);
    const generated = generateMasterPrompt({
      sceneType,
      spaceType,
      prompt,
      refImage1: !!refImage1,
      refImage2: !!refImage2,
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
    setFullPrompt(generated);
  };

  useEffect(() => {
    // Listen for PWA installation prompt
    const handleBeforeInstall = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallBtn(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`[PWA] Install prompt outcome: ${outcome}`);
    setDeferredPrompt(null);
    setShowInstallBtn(false);
  };

  // Main SketchUp Render Handlers
  const handleMainImageChange = (file) => {
    if (file) {
      setMainImage(file);
      setMainPreview(URL.createObjectURL(file));
      setError(null);
    }
  };

  const clearMainImage = (e) => {
    e.stopPropagation();
    setMainImage(null);
    setMainPreview(null);
    if (mainInputRef.current) mainInputRef.current.value = '';
  };

  // Ref Image 1 Handlers
  const handleRef1Change = (file) => {
    if (file) {
      setRefImage1(file);
      setRefImage1Preview(URL.createObjectURL(file));
    }
  };

  const clearRef1 = (e) => {
    e.stopPropagation();
    setRefImage1(null);
    setRefImage1Preview(null);
    if (ref1InputRef.current) ref1InputRef.current.value = '';
  };

  // Ref Image 2 Handlers
  const handleRef2Change = (file) => {
    if (file) {
      setRefImage2(file);
      setRefImage2Preview(URL.createObjectURL(file));
    }
  };

  const clearRef2 = (e) => {
    e.stopPropagation();
    setRefImage2(null);
    setRefImage2Preview(null);
    if (ref2InputRef.current) ref2InputRef.current.value = '';
  };

  // Drag and Drop handlers
  const [isDragActive, setIsDragActive] = useState(false);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragActive(true);
    } else if (e.type === "dragleave") {
      setIsDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type.startsWith('image/')) {
        handleMainImageChange(file);
      } else {
        setError('Por favor, arrastra un archivo de imagen válido.');
      }
    }
  };

  // Submission handler
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!mainImage) {
      setError('Por favor, sube una imagen de renderizado de SketchUp primero.');
      return;
    }

    setIsGenerating(true);
    setError(null);
    setResultImage(null);
    setSketchImage(null);
    setResultFilename(null);
    setUpscaledImage(null);
    setUpscaledFilename(null);
    setActiveTab('final');
    setQueueRemaining(0);
    setProgress(0);
    setProgressMessage('Subiendo render original de SketchUp...');
    setGenerationStage('uploading');

    if (workMode === 'internet') {
      if (!user) {
        setError('Debes iniciar sesión para usar el Modo Internet.');
        setIsGenerating(false);
        setGenerationStage('idle');
        return;
      }
      
      try {
        const timestamp = Date.now();
        // 1. Upload images to Firebase Storage
        const mainImageUrl = await uploadToFirebaseStorage(mainImage, `usuarios/${user.uid}/inputs/${timestamp}_main.jpg`);
        
        let ref1Url = null;
        if (refImage1) {
          ref1Url = await uploadToFirebaseStorage(refImage1, `usuarios/${user.uid}/inputs/${timestamp}_ref1.jpg`);
        }
        
        let ref2Url = null;
        if (refImage2) {
          ref2Url = await uploadToFirebaseStorage(refImage2, `usuarios/${user.uid}/inputs/${timestamp}_ref2.jpg`);
        }
        
        // 2. Create firestore document
        setProgressMessage('Encolando trabajo en la nube...');
        setProgress(92);
        
        const docRef = await addDoc(collection(db, 'cola_trabajos'), {
          userId: user.uid,
          estado: 'pendiente',
          tipo: genMode === 'only_4k' ? 'upscale' : 'generate',
          parametros: {
            sceneType,
            spaceType,
            prompt,
            fullPrompt,
            useTwoPass,
            sketchPrompt,
            sketchDenoise,
            renderDenoise,
            sketchCfg,
            renderCfg,
            lightingPreset,
            stylePreset,
            colorPreset,
            ref1Materials,
            ref1Illumination,
            ref1CustomPrompt,
            ref2Materials,
            ref2Illumination,
            ref2CustomPrompt,
            upscaleMethod
          },
          imagenesEntrada: {
            image: mainImageUrl,
            refImage1: ref1Url,
            refImage2: ref2Url
          },
          imagenesSalida: {
            image: null,
            sketchImage: null
          },
          progreso: 0,
          progresoMsg: 'En cola en la nube',
          error: null,
          creadoEn: serverTimestamp(),
          actualizadoEn: serverTimestamp()
        });
        
        setProgressMessage('Trabajo registrado. Esperando al agente local...');
        setProgress(95);
        
        // 3. Listen to document changes in real time
        const unsub = onSnapshot(docRef, (snap) => {
          if (!snap.exists()) return;
          const data = snap.data();
          
          if (data.progreso !== undefined) {
            setProgress(data.progreso);
          }
          if (data.progresoMsg) {
            setProgressMessage(data.progresoMsg);
          }
          
          if (data.estado === 'procesando') {
            setGenerationStage('generating');
          } else if (data.estado === 'completado') {
            unsub();
            setIsGenerating(false);
            setGenerationStage('idle');
            setProgress(100);
            setProgressMessage('Render completado con éxito!');
            
            if (data.imagenesSalida.image) {
              setResultImage(data.imagenesSalida.image);
              setResultFilename(data.imagenesSalida.image.split('%2F').pop().split('?')[0]);
            }
            if (data.imagenesSalida.sketchImage) {
              setSketchImage(data.imagenesSalida.sketchImage);
            }
            if (genMode === 'only_4k') {
              setUpscaledImage(data.imagenesSalida.image);
              setUpscaledFilename(data.imagenesSalida.image.split('%2F').pop().split('?')[0]);
              setActiveTab('upscaled');
            }
          } else if (data.estado === 'error') {
            unsub();
            setIsGenerating(false);
            setGenerationStage('idle');
            setError(data.error || 'Ocurrió un error en el servidor de ComfyUI local.');
          }
        });
        
        return; // Detener flujo local
      } catch (err) {
        console.error(err);
        setError(err.message || 'Error al enviar el trabajo en modo Internet.');
        setIsGenerating(false);
        setGenerationStage('idle');
        return;
      }
    }


    // Generate a unique client ID for ComfyUI WS tracking
    const clientId = Math.random().toString(36).substring(2, 15);

    try {
      // 1. Resolve active ComfyUI port from backend
      setProgressMessage('Obteniendo configuración del servidor...');
      let port = '8188';
      try {
        const portRes = await fetch('/api/comfy-port');
        if (portRes.ok) {
          const portData = await portRes.json();
          port = portData.port || '8188';
        }
      } catch (err) {
        console.warn('Could not retrieve active ComfyUI port from server, using default 8188:', err);
      }

      // 2. Connect to ComfyUI WebSocket
      setProgressMessage('Conectando con motor de render...');
      const socket = await connectComfyWebSocket(port, clientId, (event) => {
        if (typeof event.data !== 'string') return;
        try {
          const msg = JSON.parse(event.data);
          
          if (msg.type === 'status') {
            const remaining = msg.data.status.exec_info.queue_remaining;
            setQueueRemaining(remaining);
            if (remaining > 0) {
              setProgressMessage(`En cola de espera (${remaining} render${remaining > 1 ? 's' : ''} antes)`);
            }
          } else if (msg.type === 'execution_start') {
            setQueueRemaining(0);
            setProgressMessage('Iniciando renderizado...');
            setProgress(5);
          } else if (msg.type === 'executing') {
            const nodeId = msg.data.node;
            if (nodeId === null) {
              setProgressMessage('Finalizando render...');
              setProgress(100);
            } else {
              const nodeMap = {
                // First pass (sketch)
                '141:124': 'Preparando modelo de boceto...',
                '141:136': 'Escalando render original...',
                '141:135': 'Codificando render original...',
                '141:132': 'Preparando indicaciones del boceto...',
                '141:137': 'Generando boceto intermedio (sketchAi)...',
                '141:138': 'Decodificando boceto intermedio...',
                '142': 'Guardando boceto intermedio...',
                // Second pass (photorealistic)
                '78': 'Cargando imagen principal...',
                '120': 'Cargando imagen de referencia 1...',
                '121': 'Cargando imagen de referencia 2...',
                '115:93': 'Escalando boceto/imagen a resolución óptima...',
                '115:88': 'Codificando imagen de entrada...',
                '115:110': 'Procesando indicaciones de entrada...',
                '115:111': 'Preparando prompt fotorrealista...',
                '115:3': 'Generando fotorrealismo (ejecutando KSampler)...',
                '115:8': 'Decodificando imagen final...',
                '60': 'Guardando resultado final...',
                // Direct Upscale (to4K.json)
                '1': 'Cargando imagen principal...',
                '2': 'Cargando motor 4x-UltraSharp...',
                '3': (upscaleMethod === 'ultrasharp' || upscaleMethod === 'ultrasharp_analog') ? 'Escalando con motor 4x-UltraSharp...' : 'Cargando VAE...',
                '4': (upscaleMethod === 'ultrasharp' || upscaleMethod === 'ultrasharp_analog') ? 'Guardando imagen 4K final...' : 'Cargando modelo de difusión...',
                '5': 'Activando LoRA Lightning...',
                '6': 'Cargando CLIP de Qwen...',
                '7': 'Inyectando texturas...',
                '9': 'Ejecutando Ultimate SD Upscale (Redibujando texturas)...',
                '10': 'Guardando imagen 4K final...'
              };
              const desc = nodeMap[nodeId] || `Procesando paso ${nodeId}...`;
              setProgressMessage(desc);
              
              if (nodeId === '141:136') setProgress(10);
              if (nodeId === '141:135') setProgress(15);
              if (nodeId === '142') setProgress(45);
              if (nodeId === '78') setProgress(48);
              if (nodeId === '115:93') setProgress(52);
              if (nodeId === '115:88') setProgress(55);
              if (nodeId === '115:111') setProgress(58);
              if (nodeId === '115:8') setProgress(92);
              if (nodeId === '60') setProgress(96);
              // Direct Upscale progress points
              if (nodeId === '1') setProgress(5);
              if (nodeId === '3') {
                if (upscaleMethod === 'ultrasharp' || upscaleMethod === 'ultrasharp_analog') {
                  setProgress(50);
                } else {
                  setProgress(8);
                }
              }
              if (nodeId === '4') {
                if (upscaleMethod === 'ultrasharp' || upscaleMethod === 'ultrasharp_analog') {
                  setProgress(98);
                }
              }
              if (nodeId === '9') setProgress(15);
              if (nodeId === '10') setProgress(98);
            }
          } else if (msg.type === 'progress') {
            const { value, max, node } = msg.data;
            if (node === '141:137') {
              const percent = Math.round((value / max) * 100);
              const mappedProgress = 15 + Math.round((percent / 100) * 28);
              setProgress(mappedProgress);
              setProgressMessage(`Paso 1/2: Generando boceto intermedio - Paso ${value} de ${max} (${percent}%)`);
            } else if (node === '115:3') {
              const percent = Math.round((value / max) * 100);
              if (useTwoPass) {
                const mappedProgress = 60 + Math.round((percent / 100) * 30);
                setProgress(mappedProgress);
                setProgressMessage(`Paso 2/2: Refinando a fotorrealismo - Paso ${value} de ${max} (${percent}%)`);
              } else {
                const mappedProgress = 32 + Math.round((percent / 100) * 56);
                setProgress(mappedProgress);
                setProgressMessage(`Sintetizando fotorrealismo: Paso ${value} de ${max} (${percent}%)`);
              }
            } else if (node === '9') {
              const percent = Math.round((value / max) * 100);
              const mappedProgress = 15 + Math.round((percent / 100) * 80);
              setProgress(mappedProgress);
              setProgressMessage(`Mejorando a 4K: Paso ${value} de ${max} (${percent}%)`);
            }
          }
        } catch (err) {
          console.error('Error parsing WS message:', err);
        }
      });

      if (socket) {
        wsRef.current = socket;
      }

      // 3. Prepare Form Data
      const formData = new FormData();
      formData.append('image', mainImage);
      formData.append('prompt', prompt);
      formData.append('fullPrompt', fullPrompt);
      formData.append('sceneType', sceneType);
      formData.append('spaceType', spaceType);
      formData.append('clientId', clientId);
      formData.append('useTwoPass', useTwoPass);
      formData.append('sketchPrompt', sketchPrompt);
      formData.append('sketchDenoise', sketchDenoise);
      formData.append('renderDenoise', renderDenoise);
      formData.append('sketchCfg', sketchCfg);
      formData.append('renderCfg', renderCfg);

      formData.append('lightingPreset', lightingPreset);
      formData.append('stylePreset', stylePreset);
      formData.append('colorPreset', colorPreset);
      
      formData.append('ref1Materials', ref1Materials);
      formData.append('ref1Illumination', ref1Illumination);
      formData.append('ref1CustomPrompt', ref1CustomPrompt);
      formData.append('ref2Materials', ref2Materials);
      formData.append('ref2Illumination', ref2Illumination);
      formData.append('ref2CustomPrompt', ref2CustomPrompt);
      formData.append('upscaleMethod', upscaleMethod);

      if (refImage1) formData.append('refImage1', refImage1);
      if (refImage2) formData.append('refImage2', refImage2);

      let data;
      if (genMode === 'only_4k') {
        setProgressMessage('Encolando escalado a 4K...');
        setGenerationStage('queueing');

        const response = await fetch('/api/upscale-image', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'El escalado a 4K falló.');
        }

        setProgressMessage('Procesando imagen UHD...');
        setGenerationStage('generating');

        data = await response.json();

        if (data.success) {
          setProgressMessage('¡Imagen escalada a 4K con éxito!');
          setProgress(100);
          setGenerationStage('finalizing');
          setUpscaledImage(`${data.image}?t=${Date.now()}`);
          setUpscaledFilename(data.filename);
          setResultImage(`${data.image}?t=${Date.now()}`);
          setResultFilename(data.filename);
          setActiveTab('upscaled');
        } else {
          throw new Error(data.error || 'El servidor devolvió una respuesta no exitosa.');
        }
      } else {
        setProgressMessage('Encolando tarea en el servidor...');
        setGenerationStage('queueing');

        const response = await fetch('/api/generate', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'La generación falló.');
        }

        setProgressMessage('Generando imagen...');
        setGenerationStage('generating');

        data = await response.json();

        if (data.success) {
          setProgressMessage('Render completado con éxito!');
          setProgress(100);
          setGenerationStage('finalizing');
          setResultImage(`${data.image}?t=${Date.now()}`);
          setResultFilename(data.filename);
          if (data.sketchImage) {
            setSketchImage(`${data.sketchImage}?t=${Date.now()}`);
          }
        } else {
          throw new Error(data.error || 'El servidor devolvió una respuesta no exitosa.');
        }
      }
    } catch (err) {
      console.error(err);
      setError(err.message || 'Ocurrió un error durante la generación del render.');
    } finally {
      setIsGenerating(false);
      setGenerationStage('idle');
      // Clean up WebSocket
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    }
  };

  // Upscale to 4K handler
  const handleUpscale = async () => {
    if (!resultFilename) return;

    setIsUpscaling(true);
    setError(null);
    setProgress(0);
    setProgressMessage('Iniciando conversión a 4K...');
    setIsGenerating(true); // Show loading overlay and disable inputs
    setGenerationStage('generating');

    if (workMode === 'internet') {
      if (!user) {
        setError('Debes iniciar sesión para usar el Modo Internet.');
        setIsGenerating(false);
        setIsUpscaling(false);
        setGenerationStage('idle');
        return;
      }
      
      try {
        setProgressMessage('Creando trabajo de escalado a 4K en la nube...');
        setProgress(30);
        
        const docRef = await addDoc(collection(db, 'cola_trabajos'), {
          userId: user.uid,
          estado: 'pendiente',
          tipo: 'upscale',
          parametros: {
            filename: resultFilename,
            upscaleMethod: upscaleMethod
          },
          imagenesEntrada: {
            image: resultImage // URL de Firebase Storage de la imagen fotorrealista a escalar
          },
          imagenesSalida: {
            image: null
          },
          progreso: 0,
          progresoMsg: 'En cola para 4K',
          error: null,
          creadoEn: serverTimestamp(),
          actualizadoEn: serverTimestamp()
        });
        
        const unsub = onSnapshot(docRef, (snap) => {
          if (!snap.exists()) return;
          const data = snap.data();
          
          if (data.progreso !== undefined) {
            setProgress(data.progreso);
          }
          if (data.progresoMsg) {
            setProgressMessage(data.progresoMsg);
          }
          
          if (data.estado === 'completado') {
            unsub();
            setIsGenerating(false);
            setIsUpscaling(false);
            setProgress(100);
            setProgressMessage('Conversión a 4K completada con éxito!');
            setUpscaledImage(data.imagenesSalida.image);
            setUpscaledFilename(data.imagenesSalida.image.split('%2F').pop().split('?')[0]);
            setActiveTab('upscaled');
          } else if (data.estado === 'error') {
            unsub();
            setIsGenerating(false);
            setIsUpscaling(false);
            setError(data.error || 'Ocurrió un error durante la conversión a 4K.');
          }
        });
        
        return;
      } catch (err) {
        console.error(err);
        setError(err.message || 'Error al iniciar la conversión a 4K en modo Internet.');
        setIsGenerating(false);
        setIsUpscaling(false);
        setGenerationStage('idle');
        return;
      }
    }

    const clientId = Math.random().toString(36).substring(2, 15);

    try {
      let port = '8188';
      try {
        const portRes = await fetch('/api/comfy-port');
        if (portRes.ok) {
          const portData = await portRes.json();
          port = portData.port || '8188';
        }
      } catch (err) {
        console.warn('Could not retrieve active ComfyUI port:', err);
      }

      // WebSocket listener to track UltimateSDUpscale node progress
      const socket = await connectComfyWebSocket(port, clientId, (event) => {
        if (typeof event.data !== 'string') return;
        try {
          const msg = JSON.parse(event.data);
          
          if (msg.type === 'execution_start') {
            setProgressMessage('Ejecutando escalador a 4K...');
            setProgress(10);
          } else if (msg.type === 'executing') {
            const nodeId = msg.data.node;
            if (nodeId === null) {
              setProgressMessage('Guardando imagen 4K...');
              setProgress(95);
            } else {
              const nodeMap = {
                '1': 'Cargando imagen fotorrealista...',
                '2': 'Cargando motor 4x-UltraSharp...',
                '3': (upscaleMethod === 'ultrasharp' || upscaleMethod === 'ultrasharp_analog') ? 'Escalando con motor 4x-UltraSharp...' : 'Cargando VAE de imagen...',
                '4': (upscaleMethod === 'ultrasharp' || upscaleMethod === 'ultrasharp_analog') ? 'Guardando imagen 4K final...' : 'Cargando modelo de difusión Qwen...',
                '5': 'Cargando LoRA Lightning...',
                '6': 'Cargando CLIP de Qwen...',
                '7': 'Procesando texturas de alta resolución...',
                '9': 'Ejecutando Ultimate SD Upscale (Redibujando texturas)...',
                '10': 'Guardando resultado final 4K...'
              };
              const desc = nodeMap[nodeId] || `Procesando paso ${nodeId}...`;
              setProgressMessage(desc);
              
              if (nodeId === '1') setProgress(15);
              if (nodeId === '2') setProgress(20);
              if (nodeId === '3') {
                if (upscaleMethod === 'ultrasharp' || upscaleMethod === 'ultrasharp_analog') {
                  setProgress(60);
                } else {
                  setProgress(25);
                }
              }
              if (nodeId === '4') {
                if (upscaleMethod === 'ultrasharp' || upscaleMethod === 'ultrasharp_analog') {
                  setProgress(98);
                } else {
                  setProgress(30);
                }
              }
              if (nodeId === '7') setProgress(45);
              if (nodeId === '9') setProgress(50);
              if (nodeId === '10') setProgress(98);
            }
          } else if (msg.type === 'progress') {
            const { value, max, node } = msg.data;
            if (node === '9') {
              const percent = Math.round((value / max) * 100);
              const mappedProgress = 50 + Math.round((percent / 100) * 45);
              setProgress(mappedProgress);
              setProgressMessage(`Escalando texturas: Paso ${value} de ${max} (${percent}%)`);
            }
          }
        } catch (err) {
          console.error('Error parsing WS message:', err);
        }
      });

      if (socket) {
        wsRef.current = socket;
      }

      // Launch upscale request to backend
      const response = await fetch('/api/upscale', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          filename: resultFilename,
          clientId: clientId,
          upscaleMethod: upscaleMethod
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'La conversión a 4K falló.');
      }

      const data = await response.json();
      
      if (data.success) {
        setProgressMessage('Conversión a 4K completada con éxito!');
        setProgress(100);
        setUpscaledImage(`${data.image}?t=${Date.now()}`);
        setUpscaledFilename(data.filename);
        setActiveTab('upscaled');
      } else {
        throw new Error(data.error || 'El servidor devolvió una respuesta no exitosa.');
      }
    } catch (err) {
      console.error(err);
      setError(err.message || 'Ocurrió un error durante la conversión a 4K.');
    } finally {
      setIsUpscaling(false);
      setIsGenerating(false);
      setGenerationStage('idle');
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    }
  };

  // Download Handler
  const handleDownload = () => {
    if (activeTab === 'sketch' && sketchImage) {
      handleDownloadImage(sketchImage, 'boceto_intermedio');
    } else if (activeTab === 'upscaled' && upscaledImage) {
      handleDownloadImage(upscaledImage, 'render_4k');
    } else {
      handleDownloadImage(resultImage, 'render_fotorrealista');
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-[#fafafa] text-zinc-800">
      
      {/* Premium Studio Navigation Header */}
      <header className="sticky top-0 z-40 border-b border-zinc-100 bg-white/80 backdrop-blur-md px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-zinc-900 flex items-center justify-center shadow-sm">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-zinc-900 flex items-center gap-2">
              ESTUDIO RENDER <span className="text-zinc-400 font-light font-mono text-xs tracking-wider border-l border-zinc-200 pl-2">IA</span>
            </h1>
            <p className="text-[9px] text-zinc-500 uppercase tracking-widest">Conversión de SketchUp a Fotorrealismo</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center bg-zinc-100 p-0.5 rounded-lg border border-zinc-200">
            <button
              type="button"
              onClick={() => setWorkMode('local')}
              className={`px-3 py-1 rounded text-xs font-semibold transition duration-150 ${workMode === 'local' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}
            >
              LAN
            </button>
            <button
              type="button"
              onClick={() => setWorkMode('internet')}
              className={`px-3 py-1 rounded text-xs font-semibold transition duration-150 ${workMode === 'internet' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}
            >
              Internet
            </button>
          </div>

          {workMode === 'local' ? (
            <div className="hidden md:flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-100 text-[11px] font-medium text-emerald-800">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              ComfyUI Local
            </div>
          ) : (
            <div className={`hidden md:flex items-center gap-1.5 px-3 py-1 rounded-full ${user ? 'bg-sky-50 border-sky-100 text-sky-800' : 'bg-amber-50 border-amber-100 text-amber-800'} text-[11px] font-medium`}>
              <span className={`w-1.5 h-1.5 rounded-full ${user ? 'bg-sky-500 animate-pulse' : 'bg-amber-500'}`}></span>
              {user ? user.email.split('@')[0] : 'Firebase Desconectado'}
            </div>
          )}

          {workMode === 'internet' && user && (
            <button
              type="button"
              onClick={handleLogout}
              className="text-[10px] text-zinc-500 hover:text-red-500 font-semibold underline transition duration-150 border-none bg-transparent cursor-pointer"
            >
              Salir
            </button>
          )}

          {showInstallBtn && (
            <button
              onClick={handleInstallClick}
              className="flex items-center gap-1.5 bg-zinc-900 hover:bg-zinc-800 text-xs text-white font-medium py-1.5 px-3 rounded shadow-sm transition duration-150"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Instalar App
            </button>
          )}
        </div>
      </header>

      {/* Main Workspace Layout */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 lg:overflow-hidden">
        
        {/* Left Panel - Control Board */}
        <section className="lg:col-span-5 border-b lg:border-b-0 lg:border-r border-zinc-100 bg-white p-6 flex flex-col gap-6 lg:overflow-y-auto lg:max-h-[calc(100vh-69px)]">
          {workMode === 'internet' && !user ? (
            <div className="flex flex-col gap-5 my-auto justify-center py-8">
              <div className="flex flex-col text-center gap-1">
                <h2 className="text-xl font-bold tracking-tight text-zinc-900">Modo Internet</h2>
                <p className="text-xs text-zinc-500">Inicia sesión con Firebase para conectarte de forma remota a tu servidor local.</p>
              </div>
              
              {authError && (
                <div className="bg-red-50 border border-red-100 text-red-700 text-xs p-3 rounded-lg">
                  {authError}
                </div>
              )}

              <div className="flex flex-col gap-4">
                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  disabled={isLoggingIn}
                  className="w-full flex items-center justify-center gap-2 bg-white hover:bg-zinc-50 text-zinc-700 font-medium py-2.5 px-4 border border-zinc-200 rounded-lg text-sm shadow-sm transition duration-150 disabled:opacity-50 cursor-pointer"
                >
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v3.9h6.6c-.28 1.5-.7 2.76-1.81 3.51l2.85 2.22c1.66-1.53 2.61-3.8 2.61-6.55z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-2.85-2.22c-.79.53-1.8.85-3.08.85-2.38 0-4.4-1.6-5.12-3.78L1.04 18.15c2.08 4.14 6.38 6.9 11.31 6.9z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M6.88 15.94c-.18-.53-.28-1.1-.28-1.69s.1-1.15.28-1.69L1.04 7.98C.37 9.3 0 10.78 0 12.35s.37 3.05 1.04 4.37l5.84-4.57z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.07 0 2.77 2.76.69 6.9l5.84 4.57c.72-2.19 2.74-3.78 5.12-3.78z"
                    />
                  </svg>
                  {isLoggingIn ? 'Conectando...' : 'Iniciar Sesión con Google'}
                </button>

                <div className="flex items-center my-1">
                  <div className="flex-1 border-t border-zinc-100"></div>
                  <span className="px-3 text-[9px] text-zinc-400 font-mono uppercase tracking-wider">o usar correo</span>
                  <div className="flex-1 border-t border-zinc-100"></div>
                </div>

                <form onSubmit={handleLogin} className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Correo Electrónico</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="w-full px-3 py-1.5 text-xs border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900 transition"
                      placeholder="tu@correo.com"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Contraseña</label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="w-full px-3 py-1.5 text-xs border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900 transition"
                      placeholder="••••••••"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isLoggingIn}
                    className="w-full bg-zinc-900 hover:bg-zinc-800 text-white font-medium py-1.5 rounded-lg text-xs shadow-sm transition disabled:opacity-50 cursor-pointer"
                  >
                    {isLoggingIn ? 'Iniciando sesión...' : 'Iniciar Sesión'}
                  </button>
                </form>
              </div>
              
              <p className="text-[10px] text-center text-zinc-400">
                La cuenta debe estar previamente registrada en tu consola de Firebase Auth.
              </p>
            </div>
          ) : (
            <>
              <div className="flex flex-col">
                <h2 className="text-[10px] font-mono uppercase tracking-widest text-zinc-400 font-semibold">Panel de Control</h2>
                <p className="text-xs text-zinc-500 mt-0.5">Configura tus opciones de renderizado e indicaciones de estilo.</p>
              </div>

              <form onSubmit={handleSubmit} className="flex flex-col gap-6">
            
            {/* Main Render Slot */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-zinc-700">
                {genMode === 'only_4k' ? 'Imagen a Escalar a 4K (Requerido)' : 'Render SketchUp 3D (Requerido)'}
              </label>
              
              <div
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                onClick={() => mainInputRef.current?.click()}
                className={`relative h-60 border-2 border-dashed rounded-xl flex flex-col items-center justify-center p-3 cursor-pointer transition duration-200 ${
                  isDragActive
                    ? 'border-zinc-500 bg-zinc-50'
                    : mainPreview
                    ? 'border-zinc-200 bg-zinc-50/20 hover:border-zinc-300'
                    : 'border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50/50'
                }`}
              >
                <input
                  type="file"
                  ref={mainInputRef}
                  onChange={(e) => handleMainImageChange(e.target.files[0])}
                  className="hidden"
                  accept="image/*"
                  disabled={isGenerating}
                />

                {mainPreview ? (
                  <div className="relative w-full h-full group">
                    <img
                      src={mainPreview}
                      alt="SketchUp origen"
                      className="w-full h-full object-contain rounded-lg"
                    />
                    <div className="absolute inset-0 bg-white/40 opacity-0 group-hover:opacity-100 transition duration-150 rounded-lg flex items-center justify-center">
                      <span className="text-xs bg-zinc-900 text-white font-medium px-3 py-1.5 rounded shadow-sm">
                        Reemplazar Imagen
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={clearMainImage}
                      disabled={isGenerating}
                      className="absolute top-2 right-2 bg-white/95 hover:bg-red-50 text-zinc-400 hover:text-red-500 p-1.5 rounded shadow-sm border border-zinc-100 transition duration-150 disabled:opacity-40"
                      title="Eliminar imagen"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ) : (
                  <div className="text-center flex flex-col items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-zinc-50 border border-zinc-100 flex items-center justify-center text-zinc-400 shadow-sm">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-zinc-700">
                        {genMode === 'only_4k' ? 'Arrastra tu imagen a escalar aquí' : 'Arrastra tu render de SketchUp aquí'}
                      </p>
                      <p className="text-[11px] text-zinc-400 mt-0.5">o haz clic para explorar tus archivos</p>
                    </div>
                    <span className="text-[9px] bg-zinc-50 px-2 py-0.5 rounded text-zinc-400 border border-zinc-100">
                      PNG, JPG, WEBP (MÁX 10MB)
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Modo de Generación Toggle */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-zinc-700 flex items-center justify-between">
                <span>Modo de Generación</span>
                <span className="text-[9px] font-mono text-zinc-400 bg-zinc-50 border border-zinc-200/60 px-1.5 py-0.5 rounded">Pasadas</span>
              </label>
              <div className="grid grid-cols-3 p-1 bg-zinc-100 rounded-lg">
                <button
                  type="button"
                  onClick={() => setGenMode('one_pass')}
                  disabled={isGenerating}
                  className={`py-1.5 text-xs font-medium rounded-md transition ${
                    genMode === 'one_pass'
                      ? 'bg-white text-zinc-900 shadow-sm'
                      : 'text-zinc-500 hover:text-zinc-800'
                  }`}
                >
                  Paso Único
                </button>
                <button
                  type="button"
                  onClick={() => setGenMode('two_pass')}
                  disabled={isGenerating}
                  className={`py-1.5 text-xs font-medium rounded-md transition ${
                    genMode === 'two_pass'
                      ? 'bg-white text-zinc-900 shadow-sm'
                      : 'text-zinc-500 hover:text-zinc-800'
                  }`}
                >
                  Dos Pasos
                </button>
                <button
                  type="button"
                  onClick={() => setGenMode('only_4k')}
                  disabled={isGenerating}
                  className={`py-1.5 text-xs font-medium rounded-md transition ${
                    genMode === 'only_4k'
                      ? 'bg-white text-zinc-900 shadow-sm'
                      : 'text-zinc-500 hover:text-zinc-800'
                  }`}
                >
                  Solo 4K
                </button>
              </div>
              <p className="text-[10px] text-zinc-500 leading-relaxed">
                {genMode === 'two_pass' && "Genera primero un boceto intermedio (sketchAi) para perfeccionar volúmenes y luego lo convierte a foto. Retorna ambos."}
                {genMode === 'one_pass' && "Convierte el render de SketchUp directamente a fotografía en una única fase rápida."}
                {genMode === 'only_4k' && "Toma la imagen subida y la escala a resolución 4K real usando Ultimate SD Upscale (redibujando detalles)."}
              </p>
            </div>

            {/* Método de Escalado 4K (solo visible en el sidebar en modo Solo 4K) */}
            {genMode === 'only_4k' && (
              <div className="flex flex-col gap-1.5 border-t border-zinc-100 pt-3.5 mt-2">
                <label className="text-xs font-semibold text-zinc-700 flex items-center gap-1">
                  <svg className="w-3.5 h-3.5 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  Método de Escalado 4K
                </label>
                <select
                  value={upscaleMethod}
                  onChange={(e) => setUpscaleMethod(e.target.value)}
                  disabled={isGenerating || isUpscaling}
                  className="w-full bg-white border border-zinc-200 focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 rounded-lg p-2 text-xs text-zinc-800 focus:outline-none transition duration-150 shadow-sm"
                >
                  <option value="ultrasharp">Escalado Ultra-Fiel (4x-UltraSharp) - Recomendado</option>
                  <option value="ultrasharp_analog">Escalado Ultra-Fiel + Filtro de Rollo (Rápido)</option>
                  <option value="creative_photo">IA Creativa (Fotografías)</option>
                  <option value="creative_analog">IA Creativa (Filtro de Rollo / Ruido)</option>
                  <option value="creative_arch">IA Creativa (Arquitectura / Renders)</option>
                </select>
                <p className="text-[10px] text-zinc-500 leading-relaxed">
                  {upscaleMethod === 'creative_photo' && "Optimizado para coches y fotos reales. Añade nitidez sutil y elimina el efecto rejilla."}
                  {upscaleMethod === 'creative_analog' && "Inyecta grano de película de 35mm y una corrección cálida estilo Kodak Portra 400."}
                  {upscaleMethod === 'creative_arch' && "Método original para renders de SketchUp. Inyecta grano de madera, mármol y concreto."}
                  {upscaleMethod === 'ultrasharp' && "Escalado físico sin difusión de IA. Instantáneo (1s), fiel a la foto original y libre de costuras."}
                  {upscaleMethod === 'ultrasharp_analog' && "Escalado físico instantáneo (1s) + Filtro de grano de 35mm y tono cálido en memoria (sin retraso de IA)."}
                </p>
              </div>
            )}

            {genMode !== 'only_4k' && (
              <>
                {/* Tipo de Escena y Espacio */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-zinc-700">Tipo de Escena</label>
                    <select
                      value={sceneType}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSceneType(val);
                        setSpaceType(val === 'exterior' ? 'house' : 'living_room');
                        setLightingPreset('default');
                      }}
                      disabled={isGenerating}
                      className="w-full bg-white border border-zinc-200 focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 rounded-lg p-2 text-xs text-zinc-800 focus:outline-none transition duration-150 shadow-sm"
                    >
                      <option value="exterior">Exterior</option>
                      <option value="interior">Interior</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-zinc-700">Tipo de Espacio</label>
                    <select
                      value={spaceType}
                      onChange={(e) => setSpaceType(e.target.value)}
                      disabled={isGenerating}
                      className="w-full bg-white border border-zinc-200 focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 rounded-lg p-2 text-xs text-zinc-800 focus:outline-none transition duration-150 shadow-sm"
                    >
                      {sceneType === 'exterior' ? (
                        <>
                          <option value="house">Casa Residencial</option>
                          <option value="building">Edificio de Departamentos</option>
                          <option value="commercial">Edificio Comercial</option>
                          <option value="villa">Villa de Lujo</option>
                          <option value="pavilion">Pabellón Arquitectónico</option>
                        </>
                      ) : (
                        <>
                          <option value="living_room">Sala / Estancia</option>
                          <option value="kitchen">Cocina</option>
                          <option value="bedroom">Dormitorio</option>
                          <option value="bathroom">Baño</option>
                          <option value="office">Oficina / Espacio de Trabajo</option>
                          <option value="restaurant">Restaurante</option>
                          <option value="lobby">Lobby / Recepción</option>
                        </>
                      )}
                    </select>
                  </div>
                </div>

                {/* Presets Estéticos Collapsible */}
                <div className="border border-zinc-200/60 rounded-lg overflow-hidden bg-zinc-50/20">
                  <button
                    type="button"
                    onClick={() => setShowPresetsAdvanced(!showPresetsAdvanced)}
                    className="w-full px-3.5 py-2.5 flex items-center justify-between text-xs font-semibold text-zinc-700 hover:bg-zinc-50 transition duration-150"
                  >
                    <span className="flex items-center gap-1.5">
                      <svg className="w-4 h-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                      </svg>
                      {showPresetsAdvanced ? "Ocultar Estilos e Iluminación" : "Ajustes Estéticos (Presets)"}
                    </span>
                    <svg
                      className={`w-3.5 h-3.5 text-zinc-400 transition-transform duration-200 ${showPresetsAdvanced ? 'rotate-180' : ''}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {showPresetsAdvanced && (
                    <div className="p-3.5 border-t border-zinc-100 flex flex-col gap-4 bg-white">
                      {/* Iluminación */}
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-semibold text-zinc-700">Iluminación de la Escena</label>
                        <select
                          value={lightingPreset}
                          onChange={(e) => setLightingPreset(e.target.value)}
                          disabled={isGenerating}
                          className="w-full bg-white border border-zinc-200 focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 rounded-lg p-2 text-xs text-zinc-800 focus:outline-none transition duration-150 shadow-sm"
                        >
                          {sceneType === 'exterior' ? (
                            <>
                              <option value="default">Por Defecto (Luz Solar Natural)</option>
                              <option value="sunlight">Luz Solar Brillante (Tarde)</option>
                              <option value="golden_hour">Hora Dorada (Atardecer)</option>
                              <option value="overcast">Día Nublado (Luz Difusa)</option>
                              <option value="twilight">Crepúsculo (Hora Azul)</option>
                              <option value="morning">Luz de Mañana (Fresca)</option>
                              <option value="none">Sin Ajuste Preestablecido</option>
                            </>
                          ) : (
                            <>
                              <option value="default">Por Defecto (Luz de Ventana)</option>
                              <option value="sunlight">Rayos de Sol Directos</option>
                              <option value="cozy_warm">Acogedor / Cálido (Lámparas)</option>
                              <option value="studio_soft">Estudio Suave / Difuso</option>
                              <option value="morning">Mañana Fresca</option>
                              <option value="twilight_night">Crepúsculo / Noche (Luz Cálida)</option>
                              <option value="none">Sin Ajuste Preestablecido</option>
                            </>
                          )}
                        </select>
                      </div>

                      {/* Estilo Arquitectónico */}
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-semibold text-zinc-700">Estilo Arquitectónico / Materiales</label>
                        <select
                          value={stylePreset}
                          onChange={(e) => setStylePreset(e.target.value)}
                          disabled={isGenerating}
                          className="w-full bg-white border border-zinc-200 focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 rounded-lg p-2 text-xs text-zinc-800 focus:outline-none transition duration-150 shadow-sm"
                        >
                          <option value="default">Por Defecto (Materiales Realistas)</option>
                          <option value="minimalist">Moderno / Minimalista</option>
                          <option value="industrial">Industrial / Loft</option>
                          <option value="scandinavian">Nórdico / Escandinavo</option>
                          <option value="classic">Clásico / Tradicional</option>
                          <option value="rustic">Mediterráneo / Rústico</option>
                          <option value="brutalist">Brutalista (Hormigón Visto)</option>
                          <option value="none">Sin Estilo Preestablecido</option>
                        </select>
                      </div>

                      {/* Atmósfera y Corrección de Color */}
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-semibold text-zinc-700">Atmósfera / Estética Fotográfica</label>
                        <select
                          value={colorPreset}
                          onChange={(e) => setColorPreset(e.target.value)}
                          disabled={isGenerating}
                          className="w-full bg-white border border-zinc-200 focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 rounded-lg p-2 text-xs text-zinc-800 focus:outline-none transition duration-150 shadow-sm"
                        >
                          <option value="default">Por Defecto (Realista Real Estate)</option>
                          <option value="editorial">Editorial (Estilo ArchDaily)</option>
                          <option value="cinematic">Cinematográfico (Gran Dinamismo)</option>
                          <option value="cozy">Cálido y Confortable</option>
                          <option value="cool">Frío y Corporativo</option>
                          <option value="vintage">Vintage (Nostálgico Analógico)</option>
                          <option value="moody">Sombrío / Contrastado</option>
                          <option value="none">Sin Ajuste Preestablecido</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>

                {/* Ajustes de Difusión (Denoise / CFG) */}
                <div className="border border-zinc-200/60 rounded-lg overflow-hidden bg-zinc-50/20">
              <button
                type="button"
                onClick={() => setShowDenoiseAdvanced(!showDenoiseAdvanced)}
                className="w-full px-3.5 py-2.5 flex items-center justify-between text-xs font-semibold text-zinc-700 hover:bg-zinc-50 transition duration-150"
              >
                <span className="flex items-center gap-1.5">
                  <svg className="w-4 h-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                  </svg>
                  {showDenoiseAdvanced ? "Ocultar Ajustes de Difusión" : "Ajustes de Difusión (Denoise / CFG)"}
                </span>
                <svg
                  className={`w-3.5 h-3.5 text-zinc-400 transition-transform duration-200 ${showDenoiseAdvanced ? 'rotate-180' : ''}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {showDenoiseAdvanced && (
                <div className="p-3.5 border-t border-zinc-100 flex flex-col gap-4 bg-white">
                  {useTwoPass ? (
                    <>
                      {/* Denoise del Boceto */}
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between text-xs text-zinc-700 font-semibold">
                          <span>Denoise del Boceto</span>
                          <span className="font-mono text-zinc-500 bg-zinc-50 px-1.5 py-0.5 rounded border border-zinc-200/50 text-[10px]">
                            {sketchDenoise.toFixed(2)}
                          </span>
                        </div>
                        <input
                          type="range"
                          min="0.1"
                          max="1.0"
                          step="0.1"
                          value={sketchDenoise}
                          onChange={(e) => setSketchDenoise(parseFloat(e.target.value))}
                          disabled={isGenerating}
                          className="w-full h-1 bg-zinc-200 rounded-lg appearance-none cursor-pointer accent-zinc-900"
                        />
                        <p className="text-[10px] text-zinc-400 leading-normal">
                          Controla cuánto cambia el render original al crear el boceto. 1.0 es rediseño total.
                        </p>
                      </div>

                      {/* CFG del Boceto */}
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between text-xs text-zinc-700 font-semibold">
                          <span>CFG del Boceto</span>
                          <span className="font-mono text-zinc-500 bg-zinc-50 px-1.5 py-0.5 rounded border border-zinc-200/50 text-[10px]">
                            {sketchCfg.toFixed(1)}
                          </span>
                        </div>
                        <input
                          type="range"
                          min="1.0"
                          max="10.0"
                          step="0.5"
                          value={sketchCfg}
                          onChange={(e) => setSketchCfg(parseFloat(e.target.value))}
                          disabled={isGenerating}
                          className="w-full h-1 bg-zinc-200 rounded-lg appearance-none cursor-pointer accent-zinc-900"
                        />
                        <p className="text-[10px] text-zinc-400 leading-normal">
                          Fuerza del prompt sobre el boceto. Valores más altos obligan a cumplir la instrucción de texto.
                        </p>
                      </div>

                      <hr className="border-t border-zinc-100 my-1" />

                      {/* Denoise de la Foto */}
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between text-xs text-zinc-700 font-semibold">
                          <span>Denoise de la Foto</span>
                          <span className="font-mono text-zinc-500 bg-zinc-50 px-1.5 py-0.5 rounded border border-zinc-200/50 text-[10px]">
                            {renderDenoise.toFixed(2)}
                          </span>
                        </div>
                        <input
                          type="range"
                          min="0.1"
                          max="1.0"
                          step="0.1"
                          value={renderDenoise}
                          onChange={(e) => setRenderDenoise(parseFloat(e.target.value))}
                          disabled={isGenerating}
                          className="w-full h-1 bg-zinc-200 rounded-lg appearance-none cursor-pointer accent-zinc-900"
                        />
                        <p className="text-[10px] text-zinc-400 leading-normal">
                          Controla cuánto se apega la foto final al boceto intermedio.
                        </p>
                      </div>

                      {/* CFG de la Foto */}
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between text-xs text-zinc-700 font-semibold">
                          <span>CFG de la Foto</span>
                          <span className="font-mono text-zinc-500 bg-zinc-50 px-1.5 py-0.5 rounded border border-zinc-200/50 text-[10px]">
                            {renderCfg.toFixed(1)}
                          </span>
                        </div>
                        <input
                          type="range"
                          min="1.0"
                          max="10.0"
                          step="0.5"
                          value={renderCfg}
                          onChange={(e) => setRenderCfg(parseFloat(e.target.value))}
                          disabled={isGenerating}
                          className="w-full h-1 bg-zinc-200 rounded-lg appearance-none cursor-pointer accent-zinc-900"
                        />
                        <p className="text-[10px] text-zinc-400 leading-normal">
                          Fuerza del prompt sobre la foto final.
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      {/* Fuerza de Cambio (Denoise) */}
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between text-xs text-zinc-700 font-semibold">
                          <span>Fuerza de Cambio (Denoise)</span>
                          <span className="font-mono text-zinc-500 bg-zinc-50 px-1.5 py-0.5 rounded border border-zinc-200/50 text-[10px]">
                            {renderDenoise.toFixed(2)}
                          </span>
                        </div>
                        <input
                          type="range"
                          min="0.1"
                          max="1.0"
                          step="0.1"
                          value={renderDenoise}
                          onChange={(e) => setRenderDenoise(parseFloat(e.target.value))}
                          disabled={isGenerating}
                          className="w-full h-1 bg-zinc-200 rounded-lg appearance-none cursor-pointer accent-zinc-900"
                        />
                        <p className="text-[10px] text-zinc-400 leading-normal">
                          Controla cuánto cambia el render original de SketchUp. Valores más bajos conservan más las líneas y geometría originales.
                        </p>
                      </div>

                      {/* Escala de Guía (CFG) */}
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between text-xs text-zinc-700 font-semibold">
                          <span>Fuerza del Prompt (CFG)</span>
                          <span className="font-mono text-zinc-500 bg-zinc-50 px-1.5 py-0.5 rounded border border-zinc-200/50 text-[10px]">
                            {renderCfg.toFixed(1)}
                          </span>
                        </div>
                        <input
                          type="range"
                          min="1.0"
                          max="10.0"
                          step="0.5"
                          value={renderCfg}
                          onChange={(e) => setRenderCfg(parseFloat(e.target.value))}
                          disabled={isGenerating}
                          className="w-full h-1 bg-zinc-200 rounded-lg appearance-none cursor-pointer accent-zinc-900"
                        />
                        <p className="text-[10px] text-zinc-400 leading-normal">
                          Fuerza de las indicaciones de texto sobre la foto final.
                        </p>
                      </div>
                    </>
                  )}

                  {/* Restaurar Valores por Defecto Button */}
                  <button
                    type="button"
                    onClick={resetDiffusionDefaults}
                    disabled={isGenerating}
                    className="mt-1 flex items-center justify-center gap-1.5 w-full py-1.5 px-3 rounded-lg border border-zinc-200 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50 disabled:opacity-50 disabled:pointer-events-none font-semibold text-[10px] uppercase tracking-wider font-mono transition-all duration-150 active:scale-[0.98]"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
                    </svg>
                    Restaurar Valores por Defecto
                  </button>
                </div>
              )}
            </div>

            {/* Style Reference Slots */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-zinc-700 flex items-center justify-between">
                <span>Imágenes de Referencia (Opcional)</span>
                <span className="text-[9px] font-mono text-zinc-400 bg-zinc-50 border border-zinc-200/60 px-1.5 py-0.5 rounded">Precisión de Estilo</span>
              </label>
              
              <div className="grid grid-cols-2 gap-3">
                {/* Ref slot 1 Column */}
                <div className="flex flex-col gap-2">
                  <div
                    onClick={() => !isGenerating && ref1InputRef.current?.click()}
                    className={`h-24 border border-dashed rounded-lg flex flex-col items-center justify-center p-2 cursor-pointer transition duration-150 ${
                      refImage1Preview
                        ? 'border-zinc-200 bg-zinc-50/10'
                        : 'border-zinc-200 hover:border-zinc-300 bg-zinc-50/20 hover:bg-zinc-50/50'
                    }`}
                  >
                    <input
                      type="file"
                      ref={ref1InputRef}
                      onChange={(e) => handleRef1Change(e.target.files[0])}
                      className="hidden"
                      accept="image/*"
                      disabled={isGenerating}
                    />

                    {refImage1Preview ? (
                      <div className="relative w-full h-full">
                        <img src={refImage1Preview} alt="Ref 1" className="w-full h-full object-contain rounded-md" />
                        <button
                          type="button"
                          onClick={clearRef1}
                          disabled={isGenerating}
                          className="absolute top-1 right-1 bg-white/95 text-zinc-400 hover:text-red-500 p-1 rounded border border-zinc-100 transition duration-150"
                        >
                          <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ) : (
                      <div className="text-center flex flex-col items-center gap-1 text-zinc-400">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className="text-[10px] font-medium">Referencia 1 (img2)</span>
                      </div>
                    )}
                  </div>
                  
                  {refImage1Preview && (
                    <div className="p-2 border border-zinc-200/60 bg-zinc-50/55 rounded-lg flex flex-col gap-1.5 text-[10px] transition duration-200">
                      <div className="flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          id="ref1Materials"
                          checked={ref1Materials}
                          onChange={(e) => setRef1Materials(e.target.checked)}
                          disabled={isGenerating}
                          className="rounded text-zinc-900 focus:ring-zinc-900 border-zinc-300 w-3 h-3 cursor-pointer"
                        />
                        <label htmlFor="ref1Materials" className="font-semibold text-zinc-600 cursor-pointer select-none text-[10px]">
                          Materiales
                        </label>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          id="ref1Illumination"
                          checked={ref1Illumination}
                          onChange={(e) => setRef1Illumination(e.target.checked)}
                          disabled={isGenerating}
                          className="rounded text-zinc-900 focus:ring-zinc-900 border-zinc-300 w-3 h-3 cursor-pointer"
                        />
                        <label htmlFor="ref1Illumination" className="font-semibold text-zinc-600 cursor-pointer select-none text-[10px]">
                          Iluminación
                        </label>
                      </div>
                      <input
                        type="text"
                        placeholder="ej. Solo pisos..."
                        value={ref1CustomPrompt}
                        onChange={(e) => setRef1CustomPrompt(e.target.value)}
                        disabled={isGenerating}
                        className="w-full bg-white border border-zinc-200 rounded px-1.5 py-1 text-[9px] text-zinc-800 placeholder-zinc-400 focus:outline-none focus:border-zinc-500 shadow-sm"
                      />
                    </div>
                  )}
                </div>

                {/* Ref slot 2 Column */}
                <div className="flex flex-col gap-2">
                  <div
                    onClick={() => !isGenerating && ref2InputRef.current?.click()}
                    className={`h-24 border border-dashed rounded-lg flex flex-col items-center justify-center p-2 cursor-pointer transition duration-150 ${
                      refImage2Preview
                        ? 'border-zinc-200 bg-zinc-50/10'
                        : 'border-zinc-200 hover:border-zinc-300 bg-zinc-50/20 hover:bg-zinc-50/50'
                    }`}
                  >
                    <input
                      type="file"
                      ref={ref2InputRef}
                      onChange={(e) => handleRef2Change(e.target.files[0])}
                      className="hidden"
                      accept="image/*"
                      disabled={isGenerating}
                    />

                    {refImage2Preview ? (
                      <div className="relative w-full h-full">
                        <img src={refImage2Preview} alt="Ref 2" className="w-full h-full object-contain rounded-md" />
                        <button
                          type="button"
                          onClick={clearRef2}
                          disabled={isGenerating}
                          className="absolute top-1 right-1 bg-white/95 text-zinc-400 hover:text-red-500 p-1 rounded border border-zinc-100 transition duration-150"
                        >
                          <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ) : (
                      <div className="text-center flex flex-col items-center gap-1 text-zinc-400">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className="text-[10px] font-medium">Referencia 2 (img3)</span>
                      </div>
                    )}
                  </div>
                  
                  {refImage2Preview && (
                    <div className="p-2 border border-zinc-200/60 bg-zinc-50/55 rounded-lg flex flex-col gap-1.5 text-[10px] transition duration-200">
                      <div className="flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          id="ref2Materials"
                          checked={ref2Materials}
                          onChange={(e) => setRef2Materials(e.target.checked)}
                          disabled={isGenerating}
                          className="rounded text-zinc-900 focus:ring-zinc-900 border-zinc-300 w-3 h-3 cursor-pointer"
                        />
                        <label htmlFor="ref2Materials" className="font-semibold text-zinc-600 cursor-pointer select-none text-[10px]">
                          Materiales
                        </label>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          id="ref2Illumination"
                          checked={ref2Illumination}
                          onChange={(e) => setRef2Illumination(e.target.checked)}
                          disabled={isGenerating}
                          className="rounded text-zinc-900 focus:ring-zinc-900 border-zinc-300 w-3 h-3 cursor-pointer"
                        />
                        <label htmlFor="ref2Illumination" className="font-semibold text-zinc-600 cursor-pointer select-none text-[10px]">
                          Iluminación
                        </label>
                      </div>
                      <input
                        type="text"
                        placeholder="ej. Paleta madera..."
                        value={ref2CustomPrompt}
                        onChange={(e) => setRef2CustomPrompt(e.target.value)}
                        disabled={isGenerating}
                        className="w-full bg-white border border-zinc-200 rounded px-1.5 py-1 text-[9px] text-zinc-800 placeholder-zinc-400 focus:outline-none focus:border-zinc-500 shadow-sm"
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-zinc-700">
                {useTwoPass ? "Detalles del Fotorrealismo" : "Detalles Adicionales del Render"}
              </label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                disabled={isGenerating}
                placeholder="Añade detalles adicionales para la conversión (ej. 'techo de madera, interior cálido y acogedor, grandes ventanales con reflejo del atardecer, piso de concreto pulido')..."
                className="w-full h-24 bg-white border border-zinc-200 focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 rounded-lg p-2.5 text-xs text-zinc-800 placeholder-zinc-400 focus:outline-none transition duration-150 resize-none shadow-inner"
              />
            </div>

            {/* Custom Prompt Input */}
            {useTwoPass && (
              <div className="border border-zinc-200/60 rounded-lg overflow-hidden bg-zinc-50/20 animate-fadeIn">
                <button
                  type="button"
                  onClick={() => setShowSketchAdvanced(!showSketchAdvanced)}
                  className="w-full px-3.5 py-2.5 flex items-center justify-between text-xs font-semibold text-zinc-700 hover:bg-zinc-50 transition duration-150"
                >
                  <span className="flex items-center gap-1.5">
                    <svg className="w-4 h-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                    {showSketchAdvanced ? "Ocultar Instrucción del Boceto" : "Editar Instrucción del Boceto"}
                  </span>
                  <svg
                    className={`w-3.5 h-3.5 text-zinc-400 transition-transform duration-200 ${showSketchAdvanced ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                
                {showSketchAdvanced && (
                  <div className="p-3 border-t border-zinc-100 flex flex-col gap-2 bg-white">
                    <textarea
                      value={sketchPrompt}
                      onChange={(e) => setSketchPrompt(e.target.value)}
                      disabled={isGenerating}
                      placeholder="Instrucción para la generación del boceto intermedio..."
                      className="w-full h-20 bg-zinc-50 border border-zinc-200 focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 rounded p-2.5 text-xs text-zinc-700 placeholder-zinc-400 focus:outline-none transition duration-150 resize-none shadow-sm"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Collapsible Advanced Prompt Section */}
            <div className="border border-zinc-200/60 rounded-lg overflow-hidden bg-zinc-50/20">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="w-full px-3.5 py-2.5 flex items-center justify-between text-xs font-semibold text-zinc-700 hover:bg-zinc-50 transition duration-150"
              >
                <span className="flex items-center gap-1.5">
                  <svg className="w-4 h-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                  </svg>
                  {showAdvanced ? "Ocultar Prompt Completo (Avanzado)" : "Ver / Editar Prompt Completo (Avanzado)"}
                </span>
                <svg
                  className={`w-3.5 h-3.5 text-zinc-400 transition-transform duration-200 ${showAdvanced ? 'rotate-180' : ''}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              
              {showAdvanced && (
                <div className="p-3 border-t border-zinc-100 flex flex-col gap-2 bg-white">
                  <div className="flex items-center justify-between text-[10px] text-zinc-400">
                    <span>Edita el prompt completo que se enviará a ComfyUI:</span>
                    {isFullPromptEdited && (
                      <button
                        type="button"
                        onClick={handleResetFullPrompt}
                        className="text-zinc-600 hover:text-zinc-900 underline font-medium"
                      >
                        Restaurar base
                      </button>
                    )}
                  </div>
                  <textarea
                    value={fullPrompt}
                    onChange={handleFullPromptChange}
                    disabled={isGenerating}
                    className="w-full h-40 bg-zinc-50 border border-zinc-200 focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 rounded p-2 text-[10px] text-zinc-700 font-mono leading-relaxed focus:outline-none transition resize-none"
                  />
                </div>
              )}
            </div>
          </>
        )}

            {error && (
              <div className="bg-red-50/50 border border-red-200 rounded-lg p-3 flex items-start gap-2.5">
                <svg className="w-4 h-4 text-red-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div className="text-xs text-red-700">
                  <p className="font-semibold">Error de Generación</p>
                  <p className="mt-0.5 leading-normal opacity-90">{error}</p>
                </div>
              </div>
            )}

            {/* Action Trigger Button */}
            <button
              type="submit"
              disabled={isGenerating || !mainImage}
              className={`w-full py-3.5 px-6 rounded-lg text-xs font-medium tracking-wide transition duration-150 shadow-sm ${
                !mainImage
                  ? 'bg-zinc-100 text-zinc-400 cursor-not-allowed border border-zinc-200/60'
                  : isGenerating
                  ? 'bg-zinc-100 text-zinc-400 cursor-not-allowed border border-zinc-200/60'
                  : 'bg-zinc-900 hover:bg-zinc-800 text-white shadow active:translate-y-0.5'
              }`}
            >
              {isGenerating ? (
                <span className="flex items-center justify-center gap-1.5">
                  <svg className="animate-spin h-3.5 w-3.5 text-zinc-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4}></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  {genMode === 'only_4k' ? 'Escalando a 4K...' : 'Procesando Render...'}
                </span>
              ) : (
                genMode === 'only_4k' ? 'Escalar Imagen a 4K' : 'Generar Render Fotorrealista'
              )}
            </button>
          </form>
        </>
      )}
    </section>

        {/* Right Panel - Output Canvas */}
        <section className="lg:col-span-7 bg-[#fafafa] p-6 flex flex-col gap-4 max-h-[calc(100vh-69px)]">
          <div className="flex items-center justify-start gap-3 w-full border-b border-zinc-200/50 pb-3 mb-1 shrink-0">

            {/* Tab Switcher if sketch or 4k exists */}
            {genMode !== 'only_4k' && resultImage && (sketchImage || upscaledImage) && (
              <div className="flex items-center gap-1 bg-zinc-100 p-0.5 rounded-lg border border-zinc-200/40">
                <button
                  type="button"
                  onClick={() => setActiveTab('final')}
                  className={`px-3 py-1.5 text-[10px] font-semibold rounded-md transition duration-150 ${
                    activeTab === 'final'
                      ? 'bg-white text-zinc-900 shadow-sm'
                      : 'text-zinc-500 hover:text-zinc-800'
                  }`}
                >
                  Foto Fotorrealista
                </button>
                
                {sketchImage && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('sketch')}
                    className={`px-3 py-1.5 text-[10px] font-semibold rounded-md transition duration-150 ${
                      activeTab === 'sketch'
                        ? 'bg-white text-zinc-900 shadow-sm'
                        : 'text-zinc-500 hover:text-zinc-800'
                    }`}
                  >
                    Ver Boceto
                  </button>
                )}

                {upscaledImage && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('upscaled')}
                    className={`px-3 py-1.5 text-[10px] font-semibold rounded-md transition duration-150 ${
                      activeTab === 'upscaled'
                        ? 'bg-white text-zinc-900 shadow-sm'
                        : 'text-zinc-500 hover:text-zinc-800'
                    }`}
                  >
                    Foto 4K
                  </button>
                )}
              </div>
            )}

            {resultImage && (
              <div className="flex items-center gap-2">
                {/* Convert to 4K Button and Selector Dropdown */}
                {genMode !== 'only_4k' && (
                  <div className="flex items-center gap-1 bg-zinc-100 p-0.5 rounded-lg border border-zinc-200/40">
                    <select
                      value={upscaleMethod}
                      onChange={(e) => setUpscaleMethod(e.target.value)}
                      disabled={isUpscaling || isGenerating}
                      className="bg-white border border-zinc-250 focus:border-zinc-500 rounded px-1.5 py-1 text-[10px] font-semibold text-zinc-700 focus:outline-none transition shadow-sm"
                    >
                      <option value="ultrasharp">4x-UltraSharp (Fiel)</option>
                      <option value="ultrasharp_analog">4x-UltraSharp + Rollo (Rápido)</option>
                      <option value="creative_photo">IA Creativa (Fotos)</option>
                      <option value="creative_analog">IA Creativa (Rollo / Ruido)</option>
                      <option value="creative_arch">IA Creativa (Arquitectura)</option>
                    </select>

                    <button
                      type="button"
                      onClick={handleUpscale}
                      disabled={isUpscaling || isGenerating}
                      className="flex items-center gap-1 bg-zinc-900 hover:bg-zinc-800 text-white font-semibold text-[10px] py-1 px-2.5 rounded-md shadow-sm transition duration-150 disabled:opacity-50"
                    >
                      {isUpscaling ? (
                        <>
                          <svg className="animate-spin h-3 w-3 text-white" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4}></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Escalando...
                        </>
                      ) : (
                        <>
                          <svg className="w-3 h-3 text-zinc-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12a7.5 7.5 0 0015 0m-15 0a7.5 7.5 0 1115 0m-15 0H3m16.5 0H21m-1.5 0H12m-9 0h9m0 0V3m0 9v9" />
                          </svg>
                          {upscaledImage ? 'Volver a Escalar' : 'Convertir a 4K'}
                        </>
                      )}
                    </button>
                  </div>
                )}

                {/* Download Button */}
                <button
                  onClick={handleDownload}
                  className="flex items-center gap-1.5 bg-zinc-950 hover:bg-zinc-800 text-white font-medium text-xs py-1.5 px-3 rounded shadow-sm transition duration-150"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  {activeTab === 'sketch' ? 'Descargar Boceto' : activeTab === 'upscaled' ? 'Descargar 4K' : 'Descargar Imagen'}
                </button>
              </div>
            )}
          </div>

          {/* Large Canvas Viewport */}
          <div className="flex-1 min-h-[400px] border border-zinc-200/50 bg-white rounded-xl relative overflow-hidden flex items-center justify-center p-4 shadow-sm">
            
            {/* Grid Pattern Background */}
            <div className="absolute inset-0 opacity-[0.02] pointer-events-none bg-[radial-gradient(#000_1px,transparent_1px)] [background-size:16px_16px]"></div>

            {/* State: Loading Overlay */}
            {isGenerating && (
              <div className="absolute inset-0 bg-white/95 backdrop-blur-md z-30 flex flex-col items-center justify-center gap-6 p-6">
                
                {/* Modern circular loader / pulse */}
                <div className="relative w-16 h-16 flex items-center justify-center">
                  <div className="absolute inset-0 rounded-full border-4 border-zinc-100"></div>
                  <div 
                    className="absolute inset-0 rounded-full border-4 border-zinc-900 border-t-transparent animate-spin"
                    style={{ animationDuration: '0.8s' }}
                  ></div>
                  <span className="text-zinc-900 font-mono text-[10px] font-bold">
                    {progress > 0 ? `${progress}%` : '...'}
                  </span>
                </div>

                <div className="flex flex-col items-center gap-4 text-center max-w-sm w-full">
                  <div>
                    <h3 className="font-bold text-zinc-900 text-[11px] uppercase tracking-wider font-mono">
                      {queueRemaining > 0 ? 'En Cola de Espera' : 'Procesando Render'}
                    </h3>
                    <p className="text-xs text-zinc-500 mt-1.5 font-medium min-h-[16px]">
                      {progressMessage || 'Preparando motor de render...'}
                    </p>
                  </div>

                  {/* Sleek Progress Bar Container */}
                  <div className="w-full bg-zinc-100 rounded-full h-1.5 overflow-hidden shadow-inner relative">
                    <div 
                      className="h-full bg-zinc-900 transition-all duration-300 rounded-full"
                      style={{ width: `${progress || 5}%` }}
                    ></div>
                  </div>
                  
                  {queueRemaining > 0 && (
                    <div className="text-[10px] bg-amber-50 border border-amber-100 text-amber-800 px-2.5 py-1 rounded font-semibold animate-pulse mt-1">
                      Hay otros renders procesándose. Tu posición en cola: #{queueRemaining}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* State: Output Image */}
            {resultImage ? (
              <div className="w-full h-full flex flex-col items-center justify-center p-2 relative">
                <div className="flex-1 w-full max-h-[380px] md:max-h-[420px] flex items-center justify-center overflow-hidden">
                  <img
                    src={activeTab === 'sketch' ? sketchImage : (activeTab === 'upscaled' ? upscaledImage : resultImage)}
                    alt={activeTab === 'sketch' ? "Boceto Intermedio" : (activeTab === 'upscaled' ? "Resultado Ultra HD 4K" : "Resultado Fotorrealista IA")}
                    className="max-w-full max-h-full object-contain rounded-lg shadow-md border border-zinc-100 transition-transform duration-200 hover:scale-[1.01]"
                  />
                </div>
                {activeTab === 'sketch' && (
                  <span className="absolute top-4 left-4 text-[10px] font-mono font-bold uppercase tracking-widest text-zinc-500 bg-white/90 border border-zinc-200/50 px-2 py-1 rounded shadow-sm backdrop-blur-sm">
                    Boceto (sketchAi)
                  </span>
                )}
                {activeTab === 'upscaled' && (
                  <span className="absolute top-4 left-4 text-[10px] font-mono font-bold uppercase tracking-widest text-emerald-600 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded shadow-sm backdrop-blur-sm">
                    Ultra HD 4K (Modelo 4x-UltraSharp)
                  </span>
                )}
              </div>
            ) : !isGenerating ? (
              /* State: Awaiting Input */
              <div className="text-center flex flex-col items-center gap-3.5 text-zinc-400 max-w-sm px-4">
                <div className="w-14 h-14 rounded-xl bg-zinc-50 border border-zinc-100 flex items-center justify-center text-zinc-400 relative shadow-sm">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 21m0 0l-.813-5.096L9 21zm0 0h1m-1 0H8m6.813-5.096L15 21m0 0l-.813-5.096L15 21zm0 0h1m-1 0h-1m-4.707-8.707L8 8m0 0l-.707.707M8 8V7m0 1h1m5.707-1.707L16 6m0 0l-.707.707M16 6V5m0 1h-1M4 4h16v16H4V4z" />
                  </svg>
                  {mainPreview && (
                    <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-zinc-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-zinc-500"></span>
                    </span>
                  )}
                </div>
                <div>
                  <h3 className="text-zinc-700 font-semibold text-xs uppercase tracking-widest font-mono">Esperando Generación</h3>
                  <p className="text-xs text-zinc-400 mt-2 leading-relaxed">
                    {mainPreview 
                      ? "Tu render de SketchUp está cargado correctamente. Haz clic en el botón 'Generar Render Fotorrealista' para iniciar la conversión."
                      : "Arrastra un render de SketchUp al cuadro de la izquierda, describe detalles opcionales, y observa cómo la IA lo convierte en una fotografía arquitectónica de alta fidelidad."
                    }
                  </p>
                </div>
              </div>
            ) : null}

          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
