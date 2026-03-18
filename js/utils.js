// js/utils.js

export function clamp(value, min, max) {
    return Math.max(min, Math.min(value, max));
}

export function loadAndScaleImage(src, targetWidth, targetHeight, callback) {
    const img = new Image();
    img.crossOrigin = "Anonymous"; // Para evitar problemas de CORS si las imágenes están en otro dominio o para toDataURL
    img.onload = () => {
        if (targetWidth && targetHeight && (img.width !== targetWidth || img.height !== targetHeight)) {
            const canvas = document.createElement('canvas');
            canvas.width = targetWidth;
            canvas.height = targetHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
            // Crear una nueva imagen desde el canvas reescalado
            const scaledImg = new Image();
            scaledImg.onload = () => callback(scaledImg);
            scaledImg.onerror = (e) => {
                console.error(`Error al cargar imagen reescalada desde canvas para ${src}:`, e);
                callback(null); // Error
            };
            scaledImg.src = canvas.toDataURL();
        } else {
            callback(img); // Usar la imagen original si las dimensiones coinciden o no se especifica reescalado
        }
    };
    img.onerror = (e) => {
        console.error(`Error al cargar imagen ${src}:`, e);
        callback(null); // Error
    };
    img.src = src;
}

export function getAssetPath(assetName) {
    // Asume que los assets están en una carpeta 'assets' relativa a index.html
    // Ajusta esta ruta si tu estructura de carpetas es diferente.
    // Por ejemplo, si las imágenes de piezas de pista están en 'assets/track_parts/'
    if (assetName.startsWith('track_parts/')) {
        return `assets/${assetName}`;
    }
    return `assets/${assetName}`;
}