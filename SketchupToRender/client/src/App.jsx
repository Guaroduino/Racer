import { useState, useEffect, useRef } from 'react';

const DEFAULT_BASE_PROMPT = `convert this iamge to a realistic stock architectural photograph. Use the attached iamge as a style, ilumination and details guide

masterpiece, professional architectural photography, award-winning interior and exterior design, hyper-realistic, photorealistic, captured on 35mm lens, f/2.8 aperture, shot on Sony A7R V, highly detailed textures, volumetric natural lighting, realistic soft shadows and ambient occlusion, subtle dust motes in the air, natural imperfections, slight surface smudges, crisp focus with elegant depth of field, accurate material reflections, realistic glass refraction, micro-textures on concrete and wood, weathered edges, lived-in atmosphere, cinematic composition, 8k resolution, rich color grading.

Avoid: 3d render, blender, sketchup, CGI, plastic textures, perfect geometry, sharp artificial edges, oversaturated colors, fake reflections, rendering white dots.`;

function App() {
  const [mainImage, setMainImage] = useState(null);
  const [mainPreview, setMainPreview] = useState(null);
  const [prompt, setPrompt] = useState('');
  
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [fullPrompt, setFullPrompt] = useState(DEFAULT_BASE_PROMPT);
  const [isFullPromptEdited, setIsFullPromptEdited] = useState(false);

  // Sync basic prompt with full prompt if not manually edited
  useEffect(() => {
    if (!isFullPromptEdited) {
      if (prompt.trim()) {
        setFullPrompt(`${DEFAULT_BASE_PROMPT}\n\nAdditional details: ${prompt.trim()}`);
      } else {
        setFullPrompt(DEFAULT_BASE_PROMPT);
      }
    }
  }, [prompt, isFullPromptEdited]);

  const handleFullPromptChange = (e) => {
    setFullPrompt(e.target.value);
    setIsFullPromptEdited(true);
  };

  const handleResetFullPrompt = () => {
    setIsFullPromptEdited(false);
    if (prompt.trim()) {
      setFullPrompt(`${DEFAULT_BASE_PROMPT}\n\nAdditional details: ${prompt.trim()}`);
    } else {
      setFullPrompt(DEFAULT_BASE_PROMPT);
    }
  };
  
  // Optional style references
  const [refImage1, setRefImage1] = useState(null);
  const [refImage1Preview, setRefImage1Preview] = useState(null);
  const [refImage2, setRefImage2] = useState(null);
  const [refImage2Preview, setRefImage2Preview] = useState(null);

  // Generation states
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStage, setGenerationStage] = useState('idle'); // idle, uploading, queueing, generating, finalizing
  const [resultImage, setResultImage] = useState(null);
  const [error, setError] = useState(null);

  // PWA installation state
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showInstallBtn, setShowInstallBtn] = useState(false);

  // Refs for file inputs
  const mainInputRef = useRef(null);
  const ref1InputRef = useRef(null);
  const ref2InputRef = useRef(null);

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
    setGenerationStage('uploading');

    try {
      const formData = new FormData();
      formData.append('image', mainImage);
      formData.append('prompt', prompt);
      formData.append('fullPrompt', fullPrompt);

      if (refImage1) formData.append('refImage1', refImage1);
      if (refImage2) formData.append('refImage2', refImage2);

      setGenerationStage('queueing');
      
      const response = await fetch('/api/generate', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'La generación falló.');
      }

      setGenerationStage('generating');
      
      const data = await response.json();
      
      if (data.success) {
        setGenerationStage('finalizing');
        setResultImage(data.image);
      } else {
        throw new Error(data.error || 'El servidor devolvió una respuesta no exitosa.');
      }
    } catch (err) {
      console.error(err);
      setError(err.message || 'Ocurrió un error durante la generación del render.');
    } finally {
      setIsGenerating(false);
      setGenerationStage('idle');
    }
  };

  // Download Handler
  const handleDownload = async () => {
    if (!resultImage) return;
    try {
      const response = await fetch(resultImage);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = `render_fotorrealista_${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error al descargar la imagen:', err);
      window.open(resultImage, '_blank');
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
          <div className="hidden md:flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-100 text-[11px] font-medium text-emerald-800">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            ComfyUI Conectado
          </div>

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
          <div className="flex flex-col">
            <h2 className="text-[10px] font-mono uppercase tracking-widest text-zinc-400 font-semibold">Panel de Control</h2>
            <p className="text-xs text-zinc-500 mt-0.5">Configura tus opciones de renderizado e indicaciones de estilo.</p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-6">
            
            {/* Main Render Slot */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-zinc-700">Render SketchUp 3D (Requerido)</label>
              
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
                      className="w-full h-full object-cover rounded-lg"
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
                      <p className="text-xs font-semibold text-zinc-700">Arrastra tu render de SketchUp aquí</p>
                      <p className="text-[11px] text-zinc-400 mt-0.5">o haz clic para explorar tus archivos</p>
                    </div>
                    <span className="text-[9px] bg-zinc-50 px-2 py-0.5 rounded text-zinc-400 border border-zinc-100">
                      PNG, JPG, WEBP (MÁX 10MB)
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Style Reference Slots */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-zinc-700 flex items-center justify-between">
                <span>Imágenes de Referencia (Opcional)</span>
                <span className="text-[9px] font-mono text-zinc-400 bg-zinc-50 border border-zinc-200/60 px-1.5 py-0.5 rounded">Escalabilidad</span>
              </label>
              
              <div className="grid grid-cols-2 gap-3">
                {/* Ref slot 1 */}
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
                      <img src={refImage1Preview} alt="Ref 1" className="w-full h-full object-cover rounded-md" />
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
                      <span className="text-[10px] font-medium">Estilo Referencia 1</span>
                    </div>
                  )}
                </div>

                {/* Ref slot 2 */}
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
                      <img src={refImage2Preview} alt="Ref 2" className="w-full h-full object-cover rounded-md" />
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
                      <span className="text-[10px] font-medium">Estilo Referencia 2</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Custom Prompt Input */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-zinc-700">Detalles Adicionales del Render</label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                disabled={isGenerating}
                placeholder="Añade detalles adicionales para la conversión (ej. 'techo de madera, interior cálido y acogedor, grandes ventanales con reflejo del atardecer, piso de concreto pulido')..."
                className="w-full h-24 bg-white border border-zinc-200 focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 rounded-lg p-2.5 text-xs text-zinc-800 placeholder-zinc-400 focus:outline-none transition duration-150 resize-none shadow-inner"
              />
            </div>

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
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Procesando Render...
                </span>
              ) : (
                'Generar Render Fotorrealista'
              )}
            </button>
          </form>
        </section>

        {/* Right Panel - Output Canvas */}
        <section className="lg:col-span-7 bg-[#fafafa] p-6 flex flex-col gap-4 lg:overflow-y-auto lg:max-h-[calc(100vh-69px)]">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-[10px] font-mono uppercase tracking-widest text-zinc-400 font-semibold">Visualizador de Salida</h2>
              <p className="text-xs text-zinc-500 mt-0.5">Resultado fotorrealista de alta fidelidad desde tu ComfyUI local.</p>
            </div>
            {resultImage && (
              <button
                onClick={handleDownload}
                className="flex items-center gap-1.5 bg-zinc-950 hover:bg-zinc-800 text-white font-medium text-xs py-1.5 px-3 rounded shadow-sm transition duration-150"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Descargar Imagen
              </button>
            )}
          </div>

          {/* Large Canvas Viewport */}
          <div className="flex-1 min-h-[400px] border border-zinc-200/50 bg-white rounded-xl relative overflow-hidden flex items-center justify-center p-4 shadow-sm">
            
            {/* Grid Pattern Background */}
            <div className="absolute inset-0 opacity-[0.02] pointer-events-none bg-[radial-gradient(#000_1px,transparent_1px)] [background-size:16px_16px]"></div>

            {/* State: Loading Overlay */}
            {isGenerating && (
              <div className="absolute inset-0 bg-white/95 backdrop-blur-xs z-30 flex flex-col items-center justify-center gap-5">
                
                {/* Thin top loading line */}
                <div className="absolute top-0 left-0 right-0 h-1 bg-zinc-100 overflow-hidden">
                  <div className="h-full bg-zinc-800 animate-progress" style={{ width: '100%' }}></div>
                </div>

                <div className="flex flex-col items-center gap-3 text-center max-w-xs px-4">
                  <div className="w-9 h-9 rounded-full bg-zinc-50 border border-zinc-100 flex items-center justify-center">
                    <span className="w-1.5 h-1.5 rounded-full bg-zinc-800 animate-ping"></span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-zinc-900 text-xs uppercase tracking-widest font-mono">Procesando</h3>
                    <p className="text-[13px] text-zinc-600 mt-2 font-medium">
                      {generationStage === 'uploading' && 'Subiendo render original de SketchUp...'}
                      {generationStage === 'queueing' && 'Modificando workflow y encolando prompt...'}
                      {generationStage === 'generating' && 'Sintetizando imagen fotorrealista (KSampler)...'}
                      {generationStage === 'finalizing' && 'Cargando render final de alta resolución...'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* State: Output Image */}
            {resultImage ? (
              <div className="w-full h-full flex items-center justify-center relative group">
                <img
                  src={resultImage}
                  alt="Resultado Fotorrealista IA"
                  className="max-w-full max-h-full object-contain rounded-lg shadow-md border border-zinc-100"
                />
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
