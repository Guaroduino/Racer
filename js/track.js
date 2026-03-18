// js/track.js
import { PIXELS_PER_METER } from './config.js';

export class Track {
    constructor() {
        this.image = new Image();
        this.imageData = null;
        this.offscreenCanvas = document.createElement('canvas');
        this.offscreenCtx = this.offscreenCanvas.getContext('2d', { willReadFrequently: true });

        this.width_px = 0;  // Width of the track image in pixels
        this.height_px = 0; // Height of the track image in pixels
        this.lineThreshold = 100; // Default, updated by sim params. Pixels darker than this are "line".

        this.isCustom = false; // True if loaded from track editor or file
        this.fileName = "";    // Name of the track file if loaded

        this.watermarkImage = null; // Optional watermark image
        this.interactiveElements = []; // Stores obstacles, tags, etc.
    }

    setWatermark(img) {
        this.watermarkImage = img;
    }

    // Load track from an image source (URL or File object)
    load(source, desiredCanvasWidth_px, desiredCanvasHeight_px, lineThreshold, callback, isCustomFile = false, fileName = "") {
        this.isCustom = isCustomFile;
        this.fileName = fileName;
        this.lineThreshold = lineThreshold;

        const img = new Image();
        img.crossOrigin = "Anonymous"; // Important for getImageData if source is URL

        img.onload = () => {
            this.width_px = img.width;
            this.height_px = img.height;

            // Prepare offscreen canvas with the track image for efficient pixel reading
            this.offscreenCanvas.width = this.width_px;
            this.offscreenCanvas.height = this.height_px;
            this.offscreenCtx.drawImage(img, 0, 0, this.width_px, this.height_px);

            try {
                this.imageData = this.offscreenCtx.getImageData(0, 0, this.width_px, this.height_px);
                if (callback) callback(true, this.width_px, this.height_px);
            } catch (error) {
                this.imageData = null;
                if (callback) callback(false, 0, 0);
            }
        };

        img.onerror = (error) => {
            this.imageData = null;
            if (callback) callback(false, 0, 0);
        };

        if (typeof source === 'string') {
            img.src = source;
        } else if (source instanceof File) {
            const reader = new FileReader();
            reader.onload = (e) => { img.src = e.target.result; };
            reader.readAsDataURL(source);
        } else if (source instanceof HTMLCanvasElement) { // For tracks from editor
            this.setFromCanvas(source, lineThreshold)
                .then(success => {
                    if (callback) callback(success, this.width_px, this.height_px);
                })
                .catch(err => {
                    if (callback) callback(false, 0, 0);
                });
        } else {
            if (callback) callback(false, 0, 0);
        }
    }

    // Used by track editor to set the track from a generated canvas
    setFromCanvas(sourceCanvas, lineThreshold) {
        return new Promise((resolve, reject) => {
            this.lineThreshold = lineThreshold;
            this.isCustom = true;
            this.fileName = "PistaDelEditor.png"; // Default name for editor tracks

            this.width_px = sourceCanvas.width;
            this.height_px = sourceCanvas.height;

            this.offscreenCanvas.width = this.width_px;
            this.offscreenCanvas.height = this.height_px;
            this.offscreenCtx.drawImage(sourceCanvas, 0, 0, this.width_px, this.height_px);

            try {
                // If provided by the editor export, use a line-only mask for sensor sampling.
                // This prevents IR sensors from reacting to interactive overlays.
                const lineMaskCanvas = sourceCanvas.__lineMaskCanvas;
                if (lineMaskCanvas instanceof HTMLCanvasElement &&
                    lineMaskCanvas.width === this.width_px &&
                    lineMaskCanvas.height === this.height_px) {
                    const maskCtx = lineMaskCanvas.getContext('2d', { willReadFrequently: true });
                    this.imageData = maskCtx.getImageData(0, 0, this.width_px, this.height_px);
                } else {
                    this.imageData = this.offscreenCtx.getImageData(0, 0, this.width_px, this.height_px);
                }
                if (sourceCanvas.__interactiveElements) {
                    this.interactiveElements = sourceCanvas.__interactiveElements;
                } else {
                    this.interactiveElements = [];
                }
                this.image.src = sourceCanvas.toDataURL(); // Keep an Image object too for consistency
                resolve(true);
            } catch (e) {
                this.imageData = null;
                reject(e);
            }
        });
    }

    // Check if any pixel within a circular area around world coordinates is on the line
    isAreaOnLine(x_track_px, y_track_px, radius_px) {
        if (!this.imageData) return false;

        const x_center = Math.round(x_track_px);
        const y_center = Math.round(y_track_px);
        const r_sq = radius_px * radius_px;
        
        // Define bounding box for the circle
        const minX = Math.max(0, Math.floor(x_center - radius_px));
        const maxX = Math.min(this.width_px - 1, Math.ceil(x_center + radius_px));
        const minY = Math.max(0, Math.floor(y_center - radius_px));
        const maxY = Math.min(this.height_px - 1, Math.ceil(y_center + radius_px));

        for (let y = minY; y <= maxY; y++) {
            const dy = y - y_center;
            for (let x = minX; x <= maxX; x++) {
                const dx = x - x_center;
                if (dx * dx + dy * dy <= r_sq) {
                    const idx = (y * this.width_px + x) * 4;
                    const r = this.imageData.data[idx];
                    const g = this.imageData.data[idx + 1];
                    const b = this.imageData.data[idx + 2];
                    const alpha = this.imageData.data[idx + 3];

                    // Si es transparente, no es línea
                    if (alpha < 128) continue;

                    // Si la intensidad es menor al umbral de línea
                    const brightness = (r + g + b) / 3;
                    if (brightness < this.lineThreshold) {
                        return true; // Se detectó un píxel de línea dentro del círculo
                    }
                }
            }
        }
        return false;
    }

    // Check if a pixel at world coordinates (in pixels of the track image) is on the line
    isPixelOnLine(x_track_px, y_track_px) {
        if (!this.imageData || x_track_px < 0 || x_track_px >= this.width_px || y_track_px < 0 || y_track_px >= this.height_px) {
            return false; // Out of bounds or no image data implies "not on line" (e.g., on white background)
        }
        // Round coordinates to nearest pixel
        const x = Math.round(x_track_px);
        const y = Math.round(y_track_px);

        const R_INDEX = (y * this.width_px + x) * 4; // Each pixel has 4 values (R, G, B, A)
        const r = this.imageData.data[R_INDEX];
        const g = this.imageData.data[R_INDEX + 1];
        const b = this.imageData.data[R_INDEX + 2];
        // const a = this.imageData.data[R_INDEX + 3]; // Alpha, useful if track has transparency

        // A_INDEX should be R_INDEX + 3. If alpha is low, consider it background.
        const alpha = this.imageData.data[R_INDEX + 3];
        if (alpha < 128) return false; // Largely transparent pixels are not line

        // Calculate brightness (average of R, G, B). Lower brightness = darker color.
        const brightness = (r + g + b) / 3;
        return brightness < this.lineThreshold; // If brightness is below threshold, it's on the line
    }

    // Draw the track onto a given display context (e.g., the main simulation canvas)
    draw(displayCtx, displayCanvasWidth, displayCanvasHeight) {
        if (!this.imageData) {
            displayCtx.fillStyle = 'lightgray'; // Fallback if no track
            displayCtx.fillRect(0, 0, displayCanvasWidth, displayCanvasHeight);
            displayCtx.fillStyle = 'black';
            displayCtx.textAlign = 'center';
            displayCtx.fillText("No hay pista cargada", displayCanvasWidth / 2, displayCanvasHeight / 2);
            return;
        }

        // Clear the display canvas
        displayCtx.fillStyle = '#ebf2fb'; // un fondo sutil para cuando alejas el zoom
        displayCtx.fillRect(-displayCanvasWidth * 10, -displayCanvasHeight * 10, displayCanvasWidth * 20, displayCanvasHeight * 20);

        // Draw the track from the offscreen canvas
        // Se debe dibujar usando el ancho de la PISTA, no de la pantalla, porque la simulación 
        // ya se encarga de aplicar los factores de `cameraZoom` al entorno entero
        displayCtx.drawImage(this.offscreenCanvas, 0, 0, this.width_px, this.height_px);

        // Draw watermark if available
        if (this.watermarkImage && this.watermarkImage.complete && this.watermarkImage.naturalWidth > 0) {
            // El watermark se dibuja sobre la pista, así que centramos y dimensionamos respecto a track size
            const maxSize = Math.min(this.width_px, this.height_px) * 0.4;
            const aspectRatio = this.watermarkImage.naturalWidth / this.watermarkImage.naturalHeight;
            let watermarkWidth, watermarkHeight;

            if (aspectRatio > 1) { // Wider than tall
                watermarkWidth = maxSize;
                watermarkHeight = maxSize / aspectRatio;
            } else { // Taller than wide or square
                watermarkHeight = maxSize;
                watermarkWidth = maxSize * aspectRatio;
            }

            const x = (this.width_px - watermarkWidth) / 2;
            const y = (this.height_px - watermarkHeight) / 2;

            displayCtx.save();
            displayCtx.globalAlpha = 0.10; // Watermark opacity
            displayCtx.drawImage(this.watermarkImage, x, y, watermarkWidth, watermarkHeight);
            displayCtx.restore();
        }
    }

    clear() {
        this.image = new Image();
        this.imageData = null;
        this.width_px = 0;
        this.height_px = 0;
        this.isCustom = false;
        this.fileName = "";
        this.interactiveElements = [];
        if (this.offscreenCtx) {
            this.offscreenCtx.clearRect(0, 0, this.offscreenCanvas.width, this.offscreenCanvas.height);
        }
    }
}