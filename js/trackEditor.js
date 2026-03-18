// js/trackEditor.js
import { getDOMElements } from './ui.js'; // ui.js for DOM elements
import { TRACK_PART_SIZE_PX, AVAILABLE_TRACK_PARTS, PIXELS_PER_METER } from './config.js';
import { loadAndScaleImage } from './utils.js'; // utils.js for image loading

let editorCanvas, ctx;
let grid = []; // Stores { partInfo, rotation_deg, image }
let currentGridSize = { rows: 3, cols: 6 };
let trackPartsImages = {}; // Cache for loaded track part images { 'fileName.png': ImageElement }
let selectedTrackPart = null; // { ...partInfo, image: ImageElement }
let savedState = null;

// New State for Interactives
let interactiveElements = []; // { id, type, x, y, width, height, value, color }
let selectedInteractiveElement = null;
let currentToolMode = null; // 'rfid' | 'color' | 'hopper' | 'erase' | null

// Drag state
let isDraggingInteractive = false;
let dragTransformMode = '';
let startRotAngle = 0;
let dragStartAngle = 0;
let dragStartX = 0, dragStartY = 0;
let startElemX = 0, startElemY = 0, startElemW = 0, startElemH = 0;
let draggedElement = null;
let dragOffsetX = 0;
let dragOffsetY = 0;
let dragMoved = false;
let suppressNextClick = false;
let draggedGroupSnapshot = null;
let trackZoom = 1.0;
let trackPanX = 0;
let trackPanY = 0;
let isPanningTrack = false;
let trackPanStartX = 0;
let trackPanStartY = 0;

const TRANSFORM_HANDLE_HITBOX = 28;
const TRANSFORM_HANDLE_RADIUS = 7;
const TRANSFORM_ROTATE_HANDLE_OFFSET = 28;
const TRANSFORM_ROTATE_HANDLE_RADIUS = 8;

function toHexByte(value) {
    return (Number(value) & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function normalizeRfidUid(value) {
    const pairs = String(value ?? '').match(/[0-9a-fA-F]{2}/g);
    if (!pairs || pairs.length === 0) return '';
    return pairs.map(p => p.toUpperCase()).join(':');
}

function randomByte() {
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
        const arr = new Uint8Array(1);
        crypto.getRandomValues(arr);
        return arr[0];
    }
    return Math.floor(Math.random() * 256);
}

function generateAutoRfidUid(existingElements = interactiveElements) {
    const existing = new Set(
        (existingElements || [])
            .filter(el => el && el.type === 'rfid')
            .map(el => normalizeRfidUid(el.value))
            .filter(Boolean)
    );

    // Typical educational RFID tags are usually represented as 4-byte HEX UIDs.
    for (let i = 0; i < 256; i++) {
        const uid = `04:${toHexByte(randomByte())}:${toHexByte(randomByte())}:${toHexByte(randomByte())}`;
        if (!existing.has(uid)) return uid;
    }

    const t = Date.now();
    return `04:${toHexByte(t)}:${toHexByte(t >> 8)}:${toHexByte(t >> 16)}`;
}

function hydrateInteractiveElements(rawElements) {
    if (!Array.isArray(rawElements)) return [];

    const loaded = [];
    rawElements.forEach(raw => {
        if (!raw || typeof raw.type !== 'string') return;

        const type = String(raw.type).toLowerCase();
        const entry = {
            id: raw.id || (Date.now() + Math.floor(Math.random() * 100000)),
            type,
            x: Number(raw.x) || 0,
            y: Number(raw.y) || 0,
            width: Math.max(1, Number(raw.width) || 50),
            height: Math.max(1, Number(raw.height) || 50),
            value: raw.value ?? '',
            color: raw.color || '#0000ff',
            shape: raw.shape || 'rect',
            rotation: Number(raw.rotation) || 0,
            importGroupId: raw.importGroupId || null
        };

        if (type === 'rfid') {
            const normalized = normalizeRfidUid(entry.value);
            entry.value = normalized || generateAutoRfidUid(loaded);
        }

        loaded.push(entry);
    });

    return loaded;
}

function isGroupSelection(el) {
    return !!(el && el.isGroupSelection && el.importGroupId);
}

function getElementsByImportGroupId(groupId) {
    return interactiveElements.filter(el => el && el.importGroupId === groupId);
}

function getGroupBounds(groupId) {
    const members = getElementsByImportGroupId(groupId);
    if (!members.length) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    members.forEach(el => {
        minX = Math.min(minX, el.x);
        minY = Math.min(minY, el.y);
        maxX = Math.max(maxX, el.x + el.width);
        maxY = Math.max(maxY, el.y + el.height);
    });
    return {
        x: minX,
        y: minY,
        width: Math.max(1, maxX - minX),
        height: Math.max(1, maxY - minY)
    };
}

function createGroupSelectionProxy(groupId) {
    const b = getGroupBounds(groupId);
    if (!b) return null;
    return {
        id: `group_${groupId}`,
        type: 'obstacle',
        x: b.x,
        y: b.y,
        width: b.width,
        height: b.height,
        rotation: 0,
        isGroupSelection: true,
        importGroupId: groupId
    };
}

function refreshGroupSelectionProxy() {
    if (!isGroupSelection(selectedInteractiveElement)) return;
    const proxy = createGroupSelectionProxy(selectedInteractiveElement.importGroupId);
    if (proxy) selectedInteractiveElement = proxy;
}

function buildGroupDragSnapshot(groupId) {
    return getElementsByImportGroupId(groupId).map(el => ({
        ref: el,
        x: el.x,
        y: el.y,
        width: el.width,
        height: el.height,
        rotation: el.rotation || 0
    }));
}

// Directions for connection logic
const OPPOSITE_DIRECTIONS = { N: 'S', S: 'N', E: 'W', W: 'E' };
const DIRECTIONS = [
    { name: 'N', dr: -1, dc: 0 }, // North (Up)
    { name: 'E', dr: 0, dc: 1 },  // East (Right)
    { name: 'S', dr: 1, dc: 0 },  // South (Down)
    { name: 'W', dr: 0, dc: -1 }  // West (Left)
];

// Main application interface for communication (e.g., loading track to simulator)
let mainAppInterface;

// Ajuste inicial del canvas al cargar la pestaña del editor de pista
function resizeTrackEditorCanvas() {
    if (!editorCanvas) return;
    const container = editorCanvas.parentElement;
    if (!container) return;
    const containerRect = container.getBoundingClientRect();
    
    // Usar todo el ancho y alto del contenedor, sea rectangular o cuadrado
    editorCanvas.width = Math.max(1, Math.round(containerRect.width));
    editorCanvas.height = Math.max(1, Math.round(containerRect.height));
    
    // Eliminamos la asignación de px rígida al style
    editorCanvas.style.width = '100%';
    editorCanvas.style.height = '100%';

    // Ajustar zoom a extents al redimensionar
    zoomToExtents();
}

export function initTrackEditor(appInterface) {
    console.log("[TrackEditor] Starting initialization...");
    mainAppInterface = appInterface;
    const elems = getDOMElements();
    editorCanvas = elems.trackEditorCanvas;
    ctx = editorCanvas.getContext('2d');

    // Set initial grid size to 3x6
    currentGridSize = { rows: 3, cols: 6 };
    elems.trackGridSizeSelect.value = '3x6';

    // Setup state management
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            saveEditorState();
        } else {
            restoreEditorState();
        }
    });

    // Llamar al ajuste inicial cuando se activa la pestaña del editor de pista
    const trackEditorTab = document.getElementById('track-editor');
    if (trackEditorTab) {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.attributeName === 'class') {
                    if (trackEditorTab.classList.contains('active')) {
                        resizeTrackEditorCanvas();
                    }
                }
            });
        });
        observer.observe(trackEditorTab, { attributes: true });
    }

    // También llamar al ajuste inicial al terminar la carga de assets
    window.addEventListener('load', resizeTrackEditorCanvas);

    // Setup tab change observer
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.attributeName === 'class') {
                if (!trackEditorTab.classList.contains('active')) {
                    saveEditorState();
                } else {
                    restoreEditorState();
                }
            }
        });
    });
    observer.observe(trackEditorTab, { attributes: true });

    // Store instance globally for simulation to access
    window.trackEditorInstance = {
        loadTrackFromSimulation: (trackCanvas) => {
            if (!trackCanvas.dataset.fromEditor) {
                saveEditorState();
                setupGrid();
                const ctx = editorCanvas.getContext('2d');
                editorCanvas.width = trackCanvas.width;
                editorCanvas.height = trackCanvas.height;
                ctx.drawImage(trackCanvas, 0, 0);
                renderEditor();
            }
        },
        getInteractiveElements: () => interactiveElements.map(el => ({ ...el }))
    };

    console.log("[TrackEditor] Starting track part assets loading...");
    loadTrackPartAssets(() => {
        console.log("[TrackEditor] Track part assets loaded, populating palette...");
        populateTrackPartsPalette(elems.trackPartsPalette);

        // Ensure the container is ready and visible
        const container = editorCanvas.parentElement;
        if (!container) {
            console.error("[DEBUG] No container found for editor canvas during initialization");
            return;
        }

        // Force a layout reflow to get accurate dimensions
        container.style.display = 'none';
        container.offsetHeight; // Force reflow
        container.style.display = '';

        // Setup initial grid with proper sizing
        console.log("[TrackEditor] Setting up initial grid...");
        setupGrid();
        // Cargar la pista por defecto definida en assets/tracks/PistaPorDefecto.json
        setTimeout(() => {
            loadDefaultTrackDesign(elems.trackGridSizeSelect, elems.trackEditorTrackNameInput);
        }, 100);
    });

    // --- NUEVO: Lógica para limitar piezas según modo de pista ---
    let trackMode = 'aventura'; // valor por defecto
    if (elems.trackModeDropdown) {
        elems.trackModeDropdown.value = 'aventura';
        elems.trackModeDropdown.addEventListener('change', (e) => {
            trackMode = e.target.value;
        });
    }

    // --- Limitar piezas realmente usadas en la generación aleatoria ---
    function getLimitedTrackPartsByMode() {
        if (trackMode === 'aventura') return AVAILABLE_TRACK_PARTS.slice(0, 9);
        if (trackMode === 'desafio') return AVAILABLE_TRACK_PARTS.slice(0, 13);
        return AVAILABLE_TRACK_PARTS;
    }

    // Redefinir generateRandomTrackWithRetry para usar el modo de pista
    function generateRandomTrackWithRetry_Modo(maxRetries = (currentGridSize.rows * currentGridSize.cols <= 9 ? 50 : 20)) {
        // Limitar piezas según modo
        const limitedParts = getLimitedTrackPartsByMode();
        // Parche: pasar como argumento a la lógica de generación
        for (let i = 0; i < maxRetries; i++) {
            const generationResult = generateRandomLoopTrackLogic(limitedParts);
            if (generationResult.success) {
                resizeTrackEditorCanvas();
                return;
            }
        }
        alert("No se pudo generar una pista válida tras varios intentos. Prueba otro tamaño o modo.");
        setupGrid();
    }

    // Reemplazar handler del botón por la nueva función
    if (elems.generateRandomTrackButton) {
        elems.generateRandomTrackButton.replaceWith(elems.generateRandomTrackButton.cloneNode(true)); // Remove all listeners
        const newBtn = document.getElementById('generateRandomTrack');
        if (newBtn) {
            newBtn.disabled = true;
            newBtn.title = 'Generacion aleatoria deshabilitada para mantener la pista por defecto';
        }
    }

    // Setup event listeners
    setupInteractiveTools(elems);
    setupTrackZoomPan();
    elems.trackGridSizeSelect.addEventListener('change', (e) => {
        const size = e.target.value.split('x');
        currentGridSize = { rows: parseInt(size[0]), cols: parseInt(size[1]) };
        setupGrid();
    });

    

    elems.exportTrackToSimulatorButton.addEventListener('click', () => {
        const trackValidation = validateTrack();
        if (!trackValidation.isValid) {
            let errorMsg = "La pista puede tener problemas:\n";
            if (trackValidation.connectionMismatches > 0) errorMsg += `- ${trackValidation.connectionMismatches / 2} conexiones incompatibles.\n`;
            if (trackValidation.danglingConnections > 0) errorMsg += `- ${trackValidation.danglingConnections} conexiones abiertas.\n`;
            if (!confirm(errorMsg + "¿Exportar de todos modos al simulador?")) {
                return;
            }
        }
        const exportedCanvas = exportTrackAsCanvas();
        if (exportedCanvas) {
            mainAppInterface.loadTrackFromEditor(exportedCanvas, 0, 0, 0);
            alert("Pista del editor cargada en el simulador. Ve a la pestaña 'Simulación'.");
        }
    });

    // Crear botón de limpiar junto al botón de exportar
    const btnAddBorder = document.getElementById('btnAddBorder');
    if (btnAddBorder) {
        btnAddBorder.addEventListener('click', () => {
            const w = currentGridSize.cols * TRACK_PART_SIZE_PX;
            const h = currentGridSize.rows * TRACK_PART_SIZE_PX;
            const t = 20; // 20 thickness for border
            interactiveElements.push({ id: Date.now()+1, type: 'obstacle', x: 0, y: -t/2, width: w, height: t, color: '#444', value: 0, rotation: 0 });
            interactiveElements.push({ id: Date.now()+2, type: 'obstacle', x: 0, y: h - t/2, width: w, height: t, color: '#444', value: 0, rotation: 0 });
            interactiveElements.push({ id: Date.now()+3, type: 'obstacle', x: -t/2, y: 0, width: t, height: h, color: '#444', value: 0, rotation: 0 });
            interactiveElements.push({ id: Date.now()+4, type: 'obstacle', x: w - t/2, y: 0, width: t, height: h, color: '#444', value: 0, rotation: 0 });
            renderEditor();
        });
    }

    const clearTrackButton = document.getElementById('clearTrackButton');
    if (clearTrackButton) {
        clearTrackButton.addEventListener('click', () => {
            if (confirm('�Est�s seguro de que quieres limpiar toda la pista?')) {
                interactiveElements = [];
                selectedInteractiveElement = null;
                setupGrid();
                renderEditor();
            }
        });
    }

    elems.saveTrackDesignButton.addEventListener('click', saveTrackDesign);
    elems.loadTrackDesignInput.addEventListener('change', (event) => {
        loadTrackDesign(event, elems.trackGridSizeSelect, elems.trackEditorTrackNameInput);
    });
    if (elems.loadTrackObstaclesSvgInput) {
        elems.loadTrackObstaclesSvgInput.addEventListener('change', (event) => {
            importObstaclesFromSVG(event, false);
        });
    }
    if (elems.loadTrackObstaclesSvgFitInput) {
        elems.loadTrackObstaclesSvgFitInput.addEventListener('change', (event) => {
            importObstaclesFromSVG(event, true);
        });
    }

    editorCanvas.addEventListener('mousedown', (event) => {
        if (isPanningTrack || event.button === 1) return;
        const coords = getCanvasCoords(event);
        if (!coords) return;
        const { p_x, p_y } = coords;
        
        dragMoved = false;
        suppressNextClick = false;

        if (currentToolMode === 'move') { 
            if (selectedInteractiveElement) {
                let el = selectedInteractiveElement;
                let cx = el.x + el.width / 2;
                let cy = el.y + el.height / 2;
                let dx = p_x - cx;
                let dy = p_y - cy;
                
                let angle = el.rotation ? -el.rotation * Math.PI / 180 : 0;
                let lx = dx * Math.cos(angle) - dy * Math.sin(angle);
                let ly = dx * Math.sin(angle) + dy * Math.cos(angle);
                
                const hs = TRANSFORM_HANDLE_HITBOX; // Hitbox in local track coordinate space
                const hs2 = hs * hs;
                
                // Rotation handle (Top center + offset)
                const rdx = lx;
                const rdy = ly - (-el.height / 2 - TRANSFORM_ROTATE_HANDLE_OFFSET);
                if ((rdx * rdx + rdy * rdy) <= hs2) {
                    isDraggingInteractive = true;
                    draggedElement = el;
                    draggedGroupSnapshot = isGroupSelection(el) ? buildGroupDragSnapshot(el.importGroupId) : null;
                    dragTransformMode = 'rotate';
                    startElemX = el.x; startElemY = el.y;
                    startElemW = el.width; startElemH = el.height;
                    startRotAngle = el.rotation || 0;
                    dragStartAngle = Math.atan2(p_y - cy, p_x - cx) * 180 / Math.PI;
                    suppressNextClick = true;
                    return;
                }
                
                // Scale handles (corners and edges): pick closest to avoid overlaps.
                const handleCandidates = [
                    { mode: 'scale_tl', hx: -el.width / 2, hy: -el.height / 2 },
                    { mode: 'scale_tr', hx: el.width / 2, hy: -el.height / 2 },
                    { mode: 'scale_bl', hx: -el.width / 2, hy: el.height / 2 },
                    { mode: 'scale_br', hx: el.width / 2, hy: el.height / 2 },
                    { mode: 'scale_t', hx: 0, hy: -el.height / 2 },
                    { mode: 'scale_b', hx: 0, hy: el.height / 2 },
                    { mode: 'scale_l', hx: -el.width / 2, hy: 0 },
                    { mode: 'scale_r', hx: el.width / 2, hy: 0 }
                ];
                let closestHandle = null;
                let closestD2 = Infinity;
                for (const h of handleCandidates) {
                    const ddx = lx - h.hx;
                    const ddy = ly - h.hy;
                    const d2 = ddx * ddx + ddy * ddy;
                    if (d2 <= hs2 && d2 < closestD2) {
                        closestD2 = d2;
                        closestHandle = h;
                    }
                }
                if (closestHandle) {
                    isDraggingInteractive = true;
                    draggedElement = el;
                    draggedGroupSnapshot = isGroupSelection(el) ? buildGroupDragSnapshot(el.importGroupId) : null;
                    dragTransformMode = closestHandle.mode;
                    dragStartX = p_x;
                    dragStartY = p_y;
                    startElemX = el.x;
                    startElemY = el.y;
                    startElemW = el.width;
                    startElemH = el.height;
                    suppressNextClick = true;
                    return;
                }
            }

            let found = null;
            // Iterate down so top visually clicked first
            for(let i = interactiveElements.length-1; i>=0; i--) {
                let el = interactiveElements[i];
                let cx = el.x + el.width / 2;
                let cy = el.y + el.height / 2;
                let dx = p_x - cx;
                let dy = p_y - cy;
                
                let angle = el.rotation ? -el.rotation * Math.PI / 180 : 0;
                let lx = dx * Math.cos(angle) - dy * Math.sin(angle);
                let ly = dx * Math.sin(angle) + dy * Math.cos(angle);
                
                if (lx >= -el.width/2 && lx <= el.width/2 && ly >= -el.height/2 && ly <= el.height/2) {
                    found = el; break;
                }
            }

            if (found) { 
                isDraggingInteractive = true;
                dragTransformMode = 'move';
                if (found.importGroupId) {
                    selectedInteractiveElement = createGroupSelectionProxy(found.importGroupId) || found;
                    draggedElement = selectedInteractiveElement;
                    draggedGroupSnapshot = buildGroupDragSnapshot(found.importGroupId);
                } else {
                    draggedElement = found;
                    selectedInteractiveElement = found;
                    draggedGroupSnapshot = null;
                }
                dragOffsetX = p_x - selectedInteractiveElement.x;
                dragOffsetY = p_y - selectedInteractiveElement.y;
                startElemX = selectedInteractiveElement.x; startElemY = selectedInteractiveElement.y;
                startElemW = selectedInteractiveElement.width; startElemH = selectedInteractiveElement.height;
                
                const elems = getDOMElements();
                if (elems && !found.importGroupId) {
                     if (elems.intSettWidth) elems.intSettWidth.value = Math.round(found.width);
                     if (elems.intSettLength) elems.intSettLength.value = Math.round(found.height);
                     if (elems.intSettValue) elems.intSettValue.value = found.value || 0;
                     if (elems.intSettColor) elems.intSettColor.value = found.color || '#0000ff';
                     if (elems.intSettRotation) elems.intSettRotation.value = found.rotation || 0;
                     if (elems.obstacleShape) elems.obstacleShape.value = found.shape || 'rect';
                     updateInteractiveUI(found.type, elems);
                }
            } else {
                selectedInteractiveElement = null;
                draggedGroupSnapshot = null;
            }
        }
        renderEditor();
    });

    editorCanvas.addEventListener('mousemove', (event) => {
        if (!isDraggingInteractive || !draggedElement) return;
        const coords = getCanvasCoords(event);
        if (!coords) return;
        
        let el = draggedElement;
        const { p_x, p_y } = coords;
        dragMoved = true;

        if (isGroupSelection(el) && draggedGroupSnapshot && draggedGroupSnapshot.length > 0) {
            const startCx = startElemX + startElemW / 2;
            const startCy = startElemY + startElemH / 2;

            if (dragTransformMode === 'move') {
                const newX = p_x - dragOffsetX;
                const newY = p_y - dragOffsetY;
                const ddx = newX - startElemX;
                const ddy = newY - startElemY;
                draggedGroupSnapshot.forEach(s => {
                    s.ref.x = s.x + ddx;
                    s.ref.y = s.y + ddy;
                });
            } else if (dragTransformMode === 'rotate') {
                const curAngle = Math.atan2(p_y - startCy, p_x - startCx) * 180 / Math.PI;
                const diffDeg = curAngle - dragStartAngle;
                const rad = diffDeg * Math.PI / 180;
                const cosR = Math.cos(rad);
                const sinR = Math.sin(rad);

                draggedGroupSnapshot.forEach(s => {
                    const scx = s.x + s.width / 2;
                    const scy = s.y + s.height / 2;
                    const rx = scx - startCx;
                    const ry = scy - startCy;
                    const ncx = startCx + rx * cosR - ry * sinR;
                    const ncy = startCy + rx * sinR + ry * cosR;
                    s.ref.x = ncx - s.width / 2;
                    s.ref.y = ncy - s.height / 2;
                    s.ref.rotation = Math.round((s.rotation + diffDeg) / 1) * 1;
                });
            } else if (dragTransformMode.startsWith('scale')) {
                const dx = p_x - dragStartX;
                const dy = p_y - dragStartY;
                const ldx = dx;
                const ldy = dy;

                let sW = startElemW;
                let sH = startElemH;

                if (['scale_t', 'scale_b', 'scale_l', 'scale_r'].includes(dragTransformMode)) {
                    if (dragTransformMode === 'scale_l') sW = startElemW - ldx * 2;
                    if (dragTransformMode === 'scale_r') sW = startElemW + ldx * 2;
                    if (dragTransformMode === 'scale_t') sH = startElemH - ldy * 2;
                    if (dragTransformMode === 'scale_b') sH = startElemH + ldy * 2;
                } else {
                    const halfW0 = Math.max(1, startElemW / 2);
                    const halfH0 = Math.max(1, startElemH / 2);
                    const nx = (p_x - startCx) / halfW0;
                    const ny = (p_y - startCy) / halfH0;
                    let dirX = 1;
                    let dirY = 1;
                    if (dragTransformMode === 'scale_tl') { dirX = -1; dirY = -1; }
                    if (dragTransformMode === 'scale_tr') { dirX = 1; dirY = -1; }
                    if (dragTransformMode === 'scale_bl') { dirX = -1; dirY = 1; }
                    if (dragTransformMode === 'scale_br') { dirX = 1; dirY = 1; }
                    const diagonalProjection = (nx * dirX + ny * dirY) / Math.SQRT2;
                    const factor = Math.max(0.05, diagonalProjection / Math.SQRT2);
                    sW = startElemW * factor;
                    sH = startElemH * factor;
                }

                if (sH < 10) sH = 10;
                if (sW < 10) sW = 10;

                const scaleX = sW / Math.max(1, startElemW);
                const scaleY = sH / Math.max(1, startElemH);

                draggedGroupSnapshot.forEach(s => {
                    const scx = s.x + s.width / 2;
                    const scy = s.y + s.height / 2;
                    const rx = scx - startCx;
                    const ry = scy - startCy;
                    const ncx = startCx + rx * scaleX;
                    const ncy = startCy + ry * scaleY;
                    const nw = Math.max(1, s.width * scaleX);
                    const nh = Math.max(1, s.height * scaleY);
                    s.ref.width = nw;
                    s.ref.height = nh;
                    s.ref.x = ncx - nw / 2;
                    s.ref.y = ncy - nh / 2;
                });
            }

            refreshGroupSelectionProxy();
            renderEditor();
            return;
        }

        if (dragTransformMode === 'move') {
            el.x = p_x - dragOffsetX;
            el.y = p_y - dragOffsetY;
        } else if (dragTransformMode === 'rotate') {
            let cx = el.x + el.width / 2;
            let cy = el.y + el.height / 2;
            let curAngle = Math.atan2(p_y - cy, p_x - cx) * 180 / Math.PI;
            let diff = curAngle - dragStartAngle;
            el.rotation = Math.round((startRotAngle + diff) / 1) * 1;
            const elems = getDOMElements();
            if (elems && elems.intSettRotation) elems.intSettRotation.value = el.rotation;
        } else if (dragTransformMode.startsWith('scale')) {
            let dx = p_x - dragStartX;
            let dy = p_y - dragStartY;
            
            let angle = el.rotation ? -el.rotation * Math.PI / 180 : 0;
            let ldx = dx * Math.cos(angle) + dy * Math.sin(angle);
            let ldy = -dx * Math.sin(angle) + dy * Math.cos(angle);

            let sW = startElemW;
            let sH = startElemH;

            if (['scale_t', 'scale_b', 'scale_l', 'scale_r'].includes(dragTransformMode)) {
                if (dragTransformMode === 'scale_l') sW = startElemW - ldx * 2;
                if (dragTransformMode === 'scale_r') sW = startElemW + ldx * 2;
                if (dragTransformMode === 'scale_t') sH = startElemH - ldy * 2;
                if (dragTransformMode === 'scale_b') sH = startElemH + ldy * 2;
            } else {
                // Uniform scale from corners using pointer projection on the
                // active corner diagonal to better follow cursor drag intent.
                const startCx = startElemX + startElemW / 2;
                const startCy = startElemY + startElemH / 2;
                const pdx = p_x - startCx;
                const pdy = p_y - startCy;
                const plx = pdx * Math.cos(angle) - pdy * Math.sin(angle);
                const ply = pdx * Math.sin(angle) + pdy * Math.cos(angle);

                const halfW0 = Math.max(1, startElemW / 2);
                const halfH0 = Math.max(1, startElemH / 2);
                const nx = plx / halfW0;
                const ny = ply / halfH0;

                let dirX = 1;
                let dirY = 1;
                if (dragTransformMode === 'scale_tl') { dirX = -1; dirY = -1; }
                if (dragTransformMode === 'scale_tr') { dirX = 1; dirY = -1; }
                if (dragTransformMode === 'scale_bl') { dirX = -1; dirY = 1; }
                if (dragTransformMode === 'scale_br') { dirX = 1; dirY = 1; }

                const diagonalProjection = (nx * dirX + ny * dirY) / Math.SQRT2;
                const factor = Math.max(0.05, diagonalProjection / Math.SQRT2);

                sW = startElemW * factor;
                sH = startElemH * factor;
            }

            if (sH < 10) sH = 10;
            if (sW < 10) sW = 10;
            
            // To simplify scaling with rotation, we scale symmetrically from the center
            el.width = sW;
            el.height = sH;
            el.x = startElemX + startElemW/2 - el.width/2;
            el.y = startElemY + startElemH/2 - el.height/2;

            const elems = getDOMElements();
            if (elems) {
                if (elems.intSettWidth) elems.intSettWidth.value = Math.round(el.width);
                if (elems.intSettLength) elems.intSettLength.value = Math.round(el.height);
            }
        }
        
        renderEditor();
    });

    editorCanvas.addEventListener('mouseup', (event) => {
        isDraggingInteractive = false;
        draggedElement = null;
        draggedGroupSnapshot = null;
        dragTransformMode = '';
    });

    editorCanvas.addEventListener('mouseleave', (event) => {
        isDraggingInteractive = false;
        draggedElement = null;
        draggedGroupSnapshot = null;
    });

    editorCanvas.addEventListener('click', (event) => {
        if (isPanningTrack || event.button === 1) return;
        if (suppressNextClick) {
            suppressNextClick = false;
            return;
        }
        if (dragMoved) {
            dragMoved = false;
            return; // Skip click logic if we just finished a drag
        }
        onGridSingleClick(event);
    });

    editorCanvas.addEventListener('dblclick', (event) => {
        if (isPanningTrack || event.button === 1) return;
        onGridDoubleClick(event);
    });

    // Responsive resize for track editor canvas
    window.addEventListener('resize', resizeTrackEditorCanvas);
}

function loadTrackPartAssets(callback) {
    let loadedCount = 0;
    const totalParts = AVAILABLE_TRACK_PARTS.length;
    console.log("[TrackEditor] Starting track part assets loading. Total parts:", totalParts);
    console.log("[TrackEditor] Available track parts:", AVAILABLE_TRACK_PARTS);

    if (totalParts === 0) {
        console.warn("[TrackEditor] No track parts defined in config.js (AVAILABLE_TRACK_PARTS).");
        if (typeof callback === 'function') callback();
        return;
    }

    AVAILABLE_TRACK_PARTS.forEach(partInfo => {
        const imagePath = `assets/track_parts/${partInfo.file}`;
        console.log(`[TrackEditor] Loading image: ${imagePath}`);
        loadAndScaleImage(imagePath, TRACK_PART_SIZE_PX, TRACK_PART_SIZE_PX, (img) => {
            if (img) {
                console.log(`[TrackEditor] Successfully loaded image: ${partInfo.file}`);
                trackPartsImages[partInfo.file] = img;
            } else {
                console.error(`[TrackEditor] Failed to load image for part: ${partInfo.file}`);
            }
            loadedCount++;
            console.log(`[TrackEditor] Loading progress: ${loadedCount}/${totalParts}`);
            if (loadedCount === totalParts) {
                console.log("[TrackEditor] All images loaded successfully");
                console.log("[TrackEditor] Loaded track parts:", Object.keys(trackPartsImages));
                if (typeof callback === 'function') callback();
            }
        });
    });
}

function populateTrackPartsPalette(paletteElement) {
    if (!paletteElement) return;
    paletteElement.innerHTML = ''; // Clear existing parts

    AVAILABLE_TRACK_PARTS.forEach(partInfo => {
        const imgContainer = document.createElement('div');
        imgContainer.style.flexShrink = '0';
        const imgElement = trackPartsImages[partInfo.file]?.cloneNode() || new Image(70, 70); // Use cached image

        if (!trackPartsImages[partInfo.file]) {
            imgElement.alt = `${partInfo.name} (imagen no cargada)`;
            imgElement.style.border = "1px dashed red";
        } else {
            imgElement.alt = partInfo.name;
        }
        imgElement.title = partInfo.name;
        imgElement.dataset.partFile = partInfo.file; // Store file name for identification

        imgElement.addEventListener('click', () => {
            const elems = getDOMElements();
            
            // Check if already selected to allow toggling off
            if (imgElement.classList.contains('selected')) {
                imgElement.classList.remove('selected');
                selectedTrackPart = null;
                return;
            }

            document.querySelectorAll('#trackPartsPalette img').forEach(p => p.classList.remove('selected'));
            imgElement.classList.add('selected');

            if (trackPartsImages[partInfo.file]) {
                selectedTrackPart = { ...partInfo, image: trackPartsImages[partInfo.file] };
            } else {
                selectedTrackPart = null;
                alert(`Imagen para '${partInfo.name}' no disponible.`);
            }

            // Deselect any interactive tools when selecting a track part
            const tools = [
                { id: 'toolModeRFID', mode: 'rfid' },
                { id: 'toolModeColor', mode: 'color' },
                { id: 'toolModeHopper', mode: 'hopper' },
                { id: 'toolModeObstacle', mode: 'obstacle' },
                { id: 'toolModeMoveInt', mode: 'move' },
                { id: 'toolModeEraseInt', mode: 'erase' }
            ];
            currentToolMode = null;
            tools.forEach(other => {
                const ob = document.getElementById(other.id);
                if (ob) { ob.style.boxShadow = ''; ob.style.backgroundColor = ''; ob.style.color = ''; }
            });
            updateInteractiveUI(null, elems);
            selectedInteractiveElement = null;
            renderEditor();
        });
        imgContainer.appendChild(imgElement);
        paletteElement.appendChild(imgContainer);
    });
}

function setupGrid() {
    grid = Array(currentGridSize.rows).fill(null).map(() => Array(currentGridSize.cols).fill(null));
    if (editorCanvas) {
        resizeTrackEditorCanvas();
    }
}

function renderEditor(cellSize) {
    if (!ctx || !editorCanvas || editorCanvas.width === 0 || editorCanvas.height === 0) {
        console.error("[DEBUG] Cannot render editor:", {
            hasCtx: !!ctx,
            hasCanvas: !!editorCanvas,
            canvasWidth: editorCanvas?.width,
            canvasHeight: editorCanvas?.height
        });
        return;
    }

    // Calculate cellSize if not provided or ensure it's appropriate for the canvas size
    if (!cellSize) {
        cellSize = Math.min(
            editorCanvas.width / currentGridSize.cols,
            editorCanvas.height / currentGridSize.rows
        );
    }

    // Clear the canvas with white background
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, editorCanvas.width, editorCanvas.height);

    ctx.save();
    ctx.translate(trackPanX, trackPanY);
    ctx.scale(trackZoom, trackZoom);

    // Draw grid and track parts
    for (let r = 0; r < currentGridSize.rows; r++) {
        for (let c = 0; c < currentGridSize.cols; c++) {
            const x_topLeft = c * cellSize;
            const y_topLeft = r * cellSize;

            const currentGridPart = grid[r][c];
            const hasTrackPart = !!(currentGridPart && currentGridPart.image);

            // Keep empty cells visible with a subtle checker background.
            if (!hasTrackPart) {
                ctx.fillStyle = ((r + c) % 2 === 0) ? '#f8fbff' : '#eef4fa';
                ctx.fillRect(x_topLeft, y_topLeft, cellSize, cellSize);
            }

            // Draw grid lines with stronger contrast for empty layouts.
            ctx.strokeStyle = '#c1ccd8';
            ctx.lineWidth = 1;
            ctx.strokeRect(x_topLeft, y_topLeft, cellSize, cellSize);

            if (currentGridPart && currentGridPart.image) {
                const x_center = x_topLeft + cellSize / 2;
                const y_center = y_topLeft + cellSize / 2;

                ctx.save();
                ctx.translate(x_center, y_center);
                ctx.rotate(currentGridPart.rotation_deg * Math.PI / 180);
                ctx.drawImage(currentGridPart.image, -cellSize / 2, -cellSize / 2, cellSize, cellSize);
                ctx.restore();
            }
        }
    }

    // Frame the full editable grid area so it remains visible when empty.
    ctx.strokeStyle = '#8ea0b3';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(0, 0, currentGridSize.cols * cellSize, currentGridSize.rows * cellSize);

    drawInteractiveElements(ctx, cellSize / TRACK_PART_SIZE_PX);
    
    ctx.restore();

    if (AVAILABLE_TRACK_PARTS.length === 0 && editorCanvas.width > 0) {
        ctx.fillStyle = "rgba(0,0,0,0.7)";
        ctx.font = `bold ${Math.min(20, editorCanvas.width * 0.05)}px Arial`;
        ctx.textAlign = "center";
        ctx.fillText("No hay partes de pista en config.js", editorCanvas.width / 2, editorCanvas.height / 2);
    }
}

function getCanvasCoords(event) {
    if (!editorCanvas) return null;
    const rect = editorCanvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    
    // Obtenemos coordenadas relativas al canvas (que ocupa el 100% del contenedor)
    const x_relative = (event.clientX - rect.left) * (editorCanvas.width / rect.width);
    const y_relative = (event.clientY - rect.top) * (editorCanvas.height / rect.height);

    let x_canvas = x_relative;
    let y_canvas = y_relative;

    // Aplicar inverso del Paneo y Zoom
    x_canvas = (x_canvas - trackPanX) / trackZoom;
    y_canvas = (y_canvas - trackPanY) / trackZoom;

    // Calcular el tamaño local de la grilla usado al renderizar
    const cellSize = Math.min(
        editorCanvas.width / currentGridSize.cols,
        editorCanvas.height / currentGridSize.rows
    );

    // Mapear de coordenadas visuales (cellSize) a físicas (TRACK_PART_SIZE_PX)
    const exportScale = TRACK_PART_SIZE_PX / cellSize;
    const p_x = x_canvas * exportScale;
    const p_y = y_canvas * exportScale;

    return { x_canvas, y_canvas, p_x, p_y };
}

function onGridSingleClick(event) {
    if (!editorCanvas) return;

    const coords = getCanvasCoords(event);
    if (!coords) return;
    const { x_canvas, y_canvas, p_x, p_y } = coords;

    // --- INTERACTIVE ELEMENTS LOGIC ---
    if (currentToolMode && currentToolMode !== 'erase' && currentToolMode !== 'move' && (!event.detail || event.detail === 1)) {
        const elems = getDOMElements();
        let w = parseFloat(elems?.intSettWidth?.value) || 100;
        let h = parseFloat(elems?.intSettLength?.value) || 100;
        const rawValue = String(elems?.intSettValue?.value ?? '').trim();
        let val = Number.isFinite(parseInt(rawValue, 10)) ? parseInt(rawValue, 10) : 0;
        let col = elems?.intSettColor?.value || '#0000ff';
        let shape = elems?.obstacleShape?.value || 'rect';

        if (currentToolMode === 'rfid') {
            val = normalizeRfidUid(rawValue) || generateAutoRfidUid();
        } else if (currentToolMode === 'hopper') {
            val = rawValue;
        }

        interactiveElements.push({
            id: Date.now() + Math.floor(Math.random()*1000),
            type: currentToolMode,
            x: p_x - w/2, 
            y: p_y - h/2,
            width: w,
            height: h,
            value: val,
            color: col,
            shape: shape,
            rotation: 0
        });
        // Keep creation settings independent from already placed objects.
        selectedInteractiveElement = null;
        
        renderEditor();
        return; 
    }

    if (currentToolMode === 'move' && (!event.detail || event.detail === 1)) {
        let found = null;
        for(let i = interactiveElements.length-1; i>=0; i--) {
            let e = interactiveElements[i];
            const cx = e.x + e.width / 2;
            const cy = e.y + e.height / 2;
            const dx = p_x - cx;
            const dy = p_y - cy;
            const angle = e.rotation ? -e.rotation * Math.PI / 180 : 0;
            const lx = dx * Math.cos(angle) - dy * Math.sin(angle);
            const ly = dx * Math.sin(angle) + dy * Math.cos(angle);
            if (lx >= -e.width / 2 && lx <= e.width / 2 && ly >= -e.height / 2 && ly <= e.height / 2) {
                found = e; break;
            }
        }
        if (found) {
            selectedInteractiveElement = found.importGroupId ? (createGroupSelectionProxy(found.importGroupId) || found) : found;
            const elems = getDOMElements();
            if (elems && !found.importGroupId) {
                 if (elems.intSettWidth) elems.intSettWidth.value = found.width;
                 if (elems.intSettLength) elems.intSettLength.value = found.height;
                 if (elems.intSettValue) elems.intSettValue.value = found.value || 0;
                 if (elems.intSettColor) elems.intSettColor.value = found.color || '#0000ff';
                 if (elems.obstacleShape) elems.obstacleShape.value = found.shape || 'rect';
                 updateInteractiveUI(found.type, elems);
            }
            renderEditor();
            return;
        } else {
            selectedInteractiveElement = null;
        }
    }
    // --- FIN LOGICA INTERACTIVA ---

    // Calculate cell size dynamically
    const cellSize = Math.min(
        editorCanvas.width / currentGridSize.cols,
        editorCanvas.height / currentGridSize.rows
    );

    const c = Math.floor(x_canvas / cellSize);
    const r = Math.floor(y_canvas / cellSize);

    if (r >= 0 && r < currentGridSize.rows && c >= 0 && c < currentGridSize.cols) {
        if (selectedTrackPart && selectedTrackPart.image) {
            // Only place new part on single click, not double click
            if (!event.detail || event.detail === 1) {
                grid[r][c] = {
                    ...selectedTrackPart,
                    rotation_deg: 0 // Initial rotation
                };
                // Do NOT unselect the part after placing it so user can place multiple
                renderEditor();
            }
        }
    }
}

function onGridDoubleClick(event) {
    if (!editorCanvas) return;

    const coords = getCanvasCoords(event);
    if (!coords) return;
    const { x_canvas, y_canvas, p_x, p_y } = coords;

    // Double click logic for interactive elements
    let clickedElementIndex = -1;
    for(let i = interactiveElements.length-1; i>=0; i--) {
        let e = interactiveElements[i];
        if (p_x >= e.x && p_x <= e.x + e.width && p_y >= e.y && p_y <= e.y + e.height) {
            clickedElementIndex = i; break;
        }
    }

    if (clickedElementIndex >= 0) {
        if (currentToolMode === 'erase') {
            if (selectedInteractiveElement && selectedInteractiveElement.id === interactiveElements[clickedElementIndex].id) {
                selectedInteractiveElement = null;
            }
            interactiveElements.splice(clickedElementIndex, 1);
        } else {
            let el = interactiveElements[clickedElementIndex];
            let rotationStep = (el.type === 'obstacle') ? 15 : 90;
            el.rotation = ((el.rotation || 0) + rotationStep) % 360;
        }
        renderEditor();
        return;
    }

    // Default double click rotation for tracks
    const cellSize = Math.min(
        editorCanvas.width / currentGridSize.cols,
        editorCanvas.height / currentGridSize.rows
    );

    const c = Math.floor(x_canvas / cellSize);
    const r = Math.floor(y_canvas / cellSize);

    if (r >= 0 && r < currentGridSize.rows && c >= 0 && c < currentGridSize.cols && grid[r][c]) {
        // Simply add 90 degrees to current rotation
        const currentRotation = grid[r][c].rotation_deg || 0;
        const nextRotation = (currentRotation + 90) % 360;

        grid[r][c].rotation_deg = nextRotation;
        console.log(`Rotating piece at [${r},${c}] from ${currentRotation}° to ${nextRotation}°`);
        renderEditor();
    }
    event.preventDefault(); // Prevent text selection on double click
}

function getRotatedConnections(part, rotation_deg) {
    if (!part || !part.connections) return { N: false, S: false, E: false, W: false };

    // Normalize rotation to 0, 90, 180, or 270
    rotation_deg = ((rotation_deg % 360) + 360) % 360;

    const original = { ...part.connections };
    const rotated = { N: false, S: false, E: false, W: false };

    switch (rotation_deg) {
        case 0: // No rotation
            return { ...original };
        case 90: // 90 degrees clockwise
            rotated.N = original.W;
            rotated.E = original.N;
            rotated.S = original.E;
            rotated.W = original.S;
            break;
        case 180: // 180 degrees
            rotated.N = original.S;
            rotated.E = original.W;
            rotated.S = original.N;
            rotated.W = original.E;
            break;
        case 270: // 270 degrees clockwise
            rotated.N = original.E;
            rotated.E = original.S;
            rotated.S = original.W;
            rotated.W = original.N;
            break;
    }

    return rotated;
}

function getDirectionFromTo(r1, c1, r2, c2) {
    const dr = r2 - r1; const dc = c2 - c1;
    for (const dir of DIRECTIONS) { if (dir.dr === dr && dir.dc === dc) return dir.name; }
    return null;
}

function generateRandomTrackWithRetry(maxRetries = (currentGridSize.rows * currentGridSize.cols <= 9 ? 50 : 20)) {
    console.log(`Intentando generar pista aleatoria para grid ${currentGridSize.rows}x${currentGridSize.cols} con hasta ${maxRetries} intentos...`);
    for (let i = 0; i < maxRetries; i++) {
        const generationResult = generateRandomLoopTrackLogic();
        if (generationResult.success) {
            resizeTrackEditorCanvas(); // <-- Ajustar canvas tras generar pista
            return;
        }
    }
    console.warn(`No se pudo generar una pista en bucle válida después de ${maxRetries} intentos para grid ${currentGridSize.rows}x${currentGridSize.cols}.`);
    alert("No se pudo generar una pista en bucle válida después de varios intentos. Prueba un grid más grande o revisa las piezas.");
    setupGrid(); // Clear grid on failure
}

function generateCellPathAndConnections() {
    let path = [];
    let visitedOnPath = new Set();
    // Ajustar la longitud mínima y máxima del camino según el tamaño del grid
    const minPathLength = (currentGridSize.rows * currentGridSize.cols <= 9) ? 4 : Math.max(3, Math.floor((currentGridSize.rows * currentGridSize.cols) * 0.30));
    const maxPathLength = (currentGridSize.rows * currentGridSize.cols <= 9) ? 8 : Math.floor((currentGridSize.rows * currentGridSize.cols) * 0.80);

    let startR = Math.floor(Math.random() * currentGridSize.rows);
    let startC = Math.floor(Math.random() * currentGridSize.cols);
    let currentR = startR; let currentC = startC;

    path.push({ r: currentR, c: currentC });
    visitedOnPath.add(`${currentR},${currentC}`);

    let stuckCounter = 0;
    const maxStuck = 8;

    for (let k = 0; k < maxPathLength * 2 && path.length < maxPathLength; k++) {
        const shuffledDirections = [...DIRECTIONS].sort(() => 0.5 - Math.random());
        let moved = false;
        for (const dir of shuffledDirections) {
            const nextR = currentR + dir.dr;
            const nextC = currentC + dir.dc;
            if (nextR >= 0 && nextR < currentGridSize.rows &&
                nextC >= 0 && nextC < currentGridSize.cols &&
                !visitedOnPath.has(`${nextR},${nextC}`)) {

                currentR = nextR; currentC = nextC;
                path.push({ r: currentR, c: currentC });
                visitedOnPath.add(`${currentR},${currentC}`);
                moved = true; stuckCounter = 0;
                break;
            }
        }
        if (!moved) {
            stuckCounter++;
            if (stuckCounter > maxStuck && path.length >= minPathLength) break;
            if (stuckCounter > maxStuck * 2) break; // Hard break if too stuck

            if (path.length > 1) { // Backtrack
                visitedOnPath.delete(`${currentR},${currentC}`);
                path.pop();
                currentR = path[path.length - 1].r;
                currentC = path[path.length - 1].c;
            } else { break; } // Cannot backtrack from a single cell
        }
        if (path.length >= maxPathLength) break;
    }

    let loopClosed = false;
    if (path.length >= minPathLength - 1) {
        for (const dir of DIRECTIONS) {
            if (currentR + dir.dr === startR && currentC + dir.dc === startC) {
                path.push({ r: startR, c: startC }); // Close the loop by adding start cell again
                loopClosed = true;
                break;
            }
        }
    }

    if (!loopClosed || path.length < minPathLength) {
        return null;
    }

    const pathWithConnections = [];
    for (let i = 0; i < path.length - 1; i++) { // Iterate up to the second to last cell (connection to the last that is start)
        const cell = path[i];
        // For cell path[i], previous is path[i-1] (or path[path.length-2] if i=0 for loop)
        // and next is path[i+1]
        const prevCellInLogic = (i === 0) ? path[path.length - 2] : path[i - 1];
        const nextCellInLogic = path[i + 1];

        const dirFromPrevToCell = getDirectionFromTo(prevCellInLogic.r, prevCellInLogic.c, cell.r, cell.c);
        const dirFromCellToNext = getDirectionFromTo(cell.r, cell.c, nextCellInLogic.r, nextCellInLogic.c);

        if (!dirFromPrevToCell || !dirFromCellToNext) {
            console.error("Error determining directions for path connections during generation.");
            return null;
        }
        pathWithConnections.push({
            r: cell.r, c: cell.c,
            connections: {
                [OPPOSITE_DIRECTIONS[dirFromPrevToCell]]: true,
                [dirFromCellToNext]: true
            }
        });
    }
    return pathWithConnections;
}

function generateRandomLoopTrackLogic(limitedParts = AVAILABLE_TRACK_PARTS) {
    setupGrid(); // Clear existing grid content but keep canvas size

    // Usar la lista limitada de piezas
    const loopParts = limitedParts.filter(p => {
        if (!p.connections) return false;
        const connCount = Object.values(p.connections).filter(conn => conn === true).length;
        return connCount === 2;
    });

    if (loopParts.length === 0) {
        console.error("No track parts with exactamente 2 conexiones para generación de loop.");
        return { success: false };
    }

    const cellPathWithConnections = generateCellPathAndConnections();
    if (!cellPathWithConnections || cellPathWithConnections.length === 0) {
        return { success: false };
    }

    let allPartsPlaced = true;
    let placedCount = 0;

    for (const cellInfo of cellPathWithConnections) {
        const r = cellInfo.r; const c = cellInfo.c; const requiredConns = cellInfo.connections;
        let placedPiece = false;
        const shuffledLoopParts = [...loopParts].sort(() => 0.5 - Math.random());

        for (const partDef of shuffledLoopParts) {
            if (!trackPartsImages[partDef.file]) continue;

            const shuffledRotations = [0, 90, 180, 270].sort(() => 0.5 - Math.random());
            for (const rot of shuffledRotations) {
                const actualConns = getRotatedConnections(partDef, rot);
                let match = true;
                for (const reqDir in requiredConns) {
                    if (requiredConns[reqDir] && !actualConns[reqDir]) { match = false; break; }
                }
                if (!match) continue;
                for (const actDir in actualConns) {
                    if (actualConns[actDir] && !requiredConns[actDir]) { match = false; break; }
                }

                if (match) {
                    grid[r][c] = { ...partDef, image: trackPartsImages[partDef.file], rotation_deg: rot };
                    placedPiece = true;
                    placedCount++;
                    break;
                }
            }
            if (placedPiece) break;
        }
        if (!placedPiece) {
            allPartsPlaced = false;
            break;
        }
    }

    if (!allPartsPlaced || placedCount !== cellPathWithConnections.length) {
        return { success: false };
    }

    return { success: true };
}

function validateTrack() {
    let partCount = 0;
    let danglingConnections = 0;
    let connectionMismatches = 0;

    for (let r = 0; r < currentGridSize.rows; r++) {
        for (let c = 0; c < currentGridSize.cols; c++) {
            const currentPart = grid[r][c];
            if (currentPart) {
                partCount++;
                const currentConnections = getRotatedConnections(currentPart, currentPart.rotation_deg);

                for (const dir of DIRECTIONS) { // N, E, S, W
                    if (currentConnections[dir.name]) { // If current part has an opening in this direction
                        const nextR = r + dir.dr;
                        const nextC = c + dir.dc;

                        if (nextR < 0 || nextR >= currentGridSize.rows || nextC < 0 || nextC >= currentGridSize.cols) {
                            // Connection leads off the grid
                            danglingConnections++;
                        } else {
                            const neighborPart = grid[nextR][nextC];
                            if (!neighborPart) { // Neighbor cell is empty
                                danglingConnections++;
                            } else {
                                const neighborConnections = getRotatedConnections(neighborPart, neighborPart.rotation_deg);
                                const requiredFromNeighbor = OPPOSITE_DIRECTIONS[dir.name];
                                if (!neighborConnections[requiredFromNeighbor]) {
                                    // Neighbor has a part, but no matching opening
                                    connectionMismatches++;
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    const isValid = partCount > 0 && connectionMismatches === 0 && (danglingConnections === 0 || partCount === 1); // Allow dangling for single piece track
    if (partCount === 0) alert("Validación: La pista está vacía.");

    return {
        isValid: isValid,
        partCount: partCount,
        danglingConnections: danglingConnections,
        connectionMismatches: connectionMismatches // Each mismatch is counted by both parts, so actual issues are /2
    };
}

function saveTrackDesign() {
    // Si el input no existe, usar nombre por defecto
    let trackName = "MiPistaEditada";
    const elems = getDOMElements();
    if (elems.trackEditorTrackNameInput) {
        trackName = elems.trackEditorTrackNameInput.value.trim() || "MiPistaEditada";
    }
    const designData = {
        gridSize: { ...currentGridSize },
        gridParts: [],
        interactiveElements: interactiveElements.map(el => ({
            id: el.id,
            type: el.type,
            x: el.x,
            y: el.y,
            width: el.width,
            height: el.height,
            value: el.value,
            color: el.color,
            shape: el.shape || 'rect',
            rotation: el.rotation || 0,
            importGroupId: el.importGroupId || null
        })),
        trackName: trackName
    };
    for (let r = 0; r < currentGridSize.rows; r++) {
        for (let c = 0; c < currentGridSize.cols; c++) {
            if (grid[r][c] && grid[r][c].file) {
                designData.gridParts.push({
                    r: r,
                    c: c,
                    partFile: grid[r][c].file,
                    rotation: grid[r][c].rotation_deg
                });
            }
        }
    }
    if (designData.gridParts.length === 0 && designData.interactiveElements.length === 0) {
        alert("La pista está vacía. Nada que guardar.");
        return;
    }
    const jsonData = JSON.stringify(designData, null, 2);
    const blob = new Blob([jsonData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${trackName}.trackdesign.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    alert(`Diseño "${trackName}" guardado.`);
}

function loadTrackDesign(event, gridSizeSelect, trackNameInput) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const designData = JSON.parse(e.target.result);
            if (!designData.gridSize || !designData.gridParts) {
                throw new Error("Formato de archivo de diseño de pista inválido.");
            }

            currentGridSize.rows = designData.gridSize.rows || 3;
            currentGridSize.cols = designData.gridSize.cols || 6;

            if (gridSizeSelect) { // Update UI if element provided
                gridSizeSelect.value = `${currentGridSize.rows}x${currentGridSize.cols}`;
            }
            if (trackNameInput && designData.trackName) {
                trackNameInput.value = designData.trackName;
            } else if (trackNameInput) {
                let fName = file.name.replace(/\.trackdesign\.json$|\.json$/i, '');
                trackNameInput.value = fName || "PistaCargada";
            }


            setupGrid(); // Re-initializes grid array and canvas size
            interactiveElements = [];
            selectedInteractiveElement = null;

            designData.gridParts.forEach(partData => {
                if (partData.r < currentGridSize.rows && partData.c < currentGridSize.cols) {
                    const originalPartInfo = AVAILABLE_TRACK_PARTS.find(p => p.file === partData.partFile);
                    const partImage = trackPartsImages[partData.partFile]; // Get from cache

                    if (originalPartInfo && partImage) {
                        grid[partData.r][partData.c] = {
                            ...originalPartInfo, // Includes name, connections, file
                            image: partImage,
                            rotation_deg: partData.rotation || 0
                        };
                    } else {
                        console.warn(`Pieza de pista no encontrada o imagen no cargada: ${partData.partFile} en [${partData.r},${partData.c}]`);
                    }
                }
            });

            interactiveElements = hydrateInteractiveElements(designData.interactiveElements);
            renderEditor();
            alert(`Diseño "${file.name}" cargado.`);

        } catch (error) {
            console.error("Error al cargar diseño de pista:", error);
            alert(`Error al cargar el diseño: ${error.message}`);
        }
    };
    reader.onerror = () => {
        alert("Error al leer el archivo de diseño de pista.");
    };
    reader.readAsText(file);
    event.target.value = null; // Reset file input
}

function parseSvgLength(value) {
    if (value == null) return NaN;
    const n = parseFloat(String(value).replace(',', '.'));
    return Number.isFinite(n) ? n : NaN;
}

function parseSvgColor(node) {
    if (!node) return '#444444';
    const fillAttr = (node.getAttribute('fill') || '').trim();
    let fill = fillAttr;
    if (!fill && node.getAttribute('style')) {
        const style = node.getAttribute('style');
        const m = style.match(/(?:^|;)\s*fill\s*:\s*([^;]+)/i);
        if (m) fill = m[1].trim();
    }
    if (!fill || fill.toLowerCase() === 'none') return '#444444';
    return fill;
}

function parseSvgPolygonPoints(pointsAttr) {
    const raw = String(pointsAttr || '').trim();
    if (!raw) return [];
    const nums = raw.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) || [];
    const pts = [];
    for (let i = 0; i + 1 < nums.length; i += 2) {
        const x = parseFloat(nums[i]);
        const y = parseFloat(nums[i + 1]);
        if (Number.isFinite(x) && Number.isFinite(y)) pts.push({ x, y });
    }
    return pts;
}

function importObstaclesFromSVG(event, fitToTrack) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const svgText = String(e.target.result || '');
            const parser = new DOMParser();
            const svgDoc = parser.parseFromString(svgText, 'image/svg+xml');
            const root = svgDoc.documentElement;

            if (!root || root.nodeName.toLowerCase() !== 'svg') {
                throw new Error('El archivo no contiene un SVG válido.');
            }

            const vb = (root.getAttribute('viewBox') || '').trim().split(/\s+/).map(Number);
            let svgW = NaN;
            let svgH = NaN;
            let vbMinX = 0;
            let vbMinY = 0;
            if (vb.length === 4 && vb.every(Number.isFinite)) {
                vbMinX = vb[0];
                vbMinY = vb[1];
                svgW = vb[2];
                svgH = vb[3];
            } else {
                svgW = parseSvgLength(root.getAttribute('width'));
                svgH = parseSvgLength(root.getAttribute('height'));
            }

            if (!Number.isFinite(svgW) || !Number.isFinite(svgH) || svgW <= 0 || svgH <= 0) {
                throw new Error('No se pudo determinar tamaño del SVG (width/height o viewBox).');
            }

            const trackW = currentGridSize.cols * TRACK_PART_SIZE_PX;
            const trackH = currentGridSize.rows * TRACK_PART_SIZE_PX;

            const svgShapes = Array.from(root.querySelectorAll('rect,circle,ellipse,polygon'));
            const parsedObstacles = [];
            let importedCount = 0;
            let skippedCount = 0;

            for (const node of svgShapes) {
                const tag = node.tagName.toLowerCase();
                const color = parseSvgColor(node);

                if (tag === 'rect') {
                    const x = parseSvgLength(node.getAttribute('x')) || 0;
                    const y = parseSvgLength(node.getAttribute('y')) || 0;
                    const w = parseSvgLength(node.getAttribute('width'));
                    const h = parseSvgLength(node.getAttribute('height'));
                    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) { skippedCount++; continue; }
                    parsedObstacles.push({
                        x: x - vbMinX,
                        y: y - vbMinY,
                        width: w,
                        height: h,
                        color,
                        shape: 'rect'
                    });
                    continue;
                }

                if (tag === 'circle') {
                    const cx = parseSvgLength(node.getAttribute('cx')) || 0;
                    const cy = parseSvgLength(node.getAttribute('cy')) || 0;
                    const r = parseSvgLength(node.getAttribute('r'));
                    if (!Number.isFinite(r) || r <= 0) { skippedCount++; continue; }
                    const w = 2 * r;
                    const h = 2 * r;
                    parsedObstacles.push({
                        x: cx - r - vbMinX,
                        y: cy - r - vbMinY,
                        width: w,
                        height: h,
                        color,
                        shape: 'circle'
                    });
                    continue;
                }

                if (tag === 'ellipse') {
                    const cx = parseSvgLength(node.getAttribute('cx')) || 0;
                    const cy = parseSvgLength(node.getAttribute('cy')) || 0;
                    const rx = parseSvgLength(node.getAttribute('rx'));
                    const ry = parseSvgLength(node.getAttribute('ry'));
                    if (!Number.isFinite(rx) || !Number.isFinite(ry) || rx <= 0 || ry <= 0) { skippedCount++; continue; }
                    const w = 2 * rx;
                    const h = 2 * ry;
                    parsedObstacles.push({
                        x: cx - rx - vbMinX,
                        y: cy - ry - vbMinY,
                        width: w,
                        height: h,
                        color,
                        shape: 'circle'
                    });
                    continue;
                }

                if (tag === 'polygon') {
                    const pts = parseSvgPolygonPoints(node.getAttribute('points'));
                    if (pts.length < 3) { skippedCount++; continue; }

                    const xs = pts.map(p => p.x);
                    const ys = pts.map(p => p.y);
                    const minX = Math.min(...xs);
                    const maxX = Math.max(...xs);
                    const minY = Math.min(...ys);
                    const maxY = Math.max(...ys);
                    const w = maxX - minX;
                    const h = maxY - minY;
                    if (w <= 0 || h <= 0) { skippedCount++; continue; }

                    const shape = pts.length === 3 ? 'triangle' : 'rect';
                    parsedObstacles.push({
                        x: minX - vbMinX,
                        y: minY - vbMinY,
                        width: w,
                        height: h,
                        color,
                        shape
                    });
                }
            }

            if (parsedObstacles.length === 0) {
                throw new Error('No se encontraron obstáculos SVG importables (rect/circle/ellipse/polygon).');
            }

            let sourceMinX = 0;
            let sourceMinY = 0;
            let sourceW = svgW;
            let sourceH = svgH;

            if (fitToTrack) {
                sourceMinX = Math.min(...parsedObstacles.map(o => o.x));
                sourceMinY = Math.min(...parsedObstacles.map(o => o.y));
                const sourceMaxX = Math.max(...parsedObstacles.map(o => o.x + o.width));
                const sourceMaxY = Math.max(...parsedObstacles.map(o => o.y + o.height));
                sourceW = sourceMaxX - sourceMinX;
                sourceH = sourceMaxY - sourceMinY;
                if (sourceW <= 0 || sourceH <= 0) {
                    throw new Error('El bounding box del SVG es inválido para escalar a pista completa.');
                }
            }

            const sx = fitToTrack ? (trackW / sourceW) : 1;
            const sy = fitToTrack ? (trackH / sourceH) : 1;

            const importGroupId = `svg_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
            for (const o of parsedObstacles) {
                interactiveElements.push({
                    id: Date.now() + Math.floor(Math.random() * 100000),
                    type: 'obstacle',
                    x: (o.x - sourceMinX) * sx,
                    y: (o.y - sourceMinY) * sy,
                    width: Math.max(1, o.width * sx),
                    height: Math.max(1, o.height * sy),
                    value: '',
                    color: o.color,
                    shape: o.shape,
                    rotation: 0,
                    importGroupId
                });
                importedCount++;
            }

            selectedInteractiveElement = null;
            renderEditor();

            const modeText = fitToTrack ? 'escalado a pista completa' : 'sin escalar';
            alert(`SVG importado (${modeText}). Obstáculos agregados: ${importedCount}. Omitidos: ${skippedCount}.`);
        } catch (error) {
            console.error('Error al importar SVG:', error);
            alert(`Error al importar SVG: ${error.message}`);
        } finally {
            event.target.value = null;
        }
    };

    reader.onerror = () => {
        alert('Error al leer el archivo SVG.');
        event.target.value = null;
    };

    reader.readAsText(file);
}

function drawInteractiveElements(targetCtx, scaleRatio) {
    interactiveElements.forEach(el => {
        targetCtx.save();
        const x = el.x * scaleRatio;
        const y = el.y * scaleRatio;
        const w = el.width * scaleRatio;
        const h = el.height * scaleRatio;
        const cx = x + w / 2;
        const cy = y + h / 2;
        
        targetCtx.translate(cx, cy);
        if (el.rotation) targetCtx.rotate(el.rotation * Math.PI / 180);
        
        if (el.type === 'color') {
            targetCtx.fillStyle = el.color || '#0000ff';
            targetCtx.fillRect(-w/2, -h/2, w, h);
            targetCtx.strokeStyle = 'white';
            targetCtx.lineWidth = 2 * scaleRatio;
            targetCtx.strokeRect(-w/2, -h/2, w, h);
        } else if (el.type === 'rfid') {
            targetCtx.fillStyle = 'rgba(200, 200, 200, 0.8)';
            targetCtx.fillRect(-w/2, -h/2, w, h);
            targetCtx.strokeStyle = '#333';
            targetCtx.lineWidth = 2 * scaleRatio;
            targetCtx.strokeRect(-w/2, -h/2, w, h);
            targetCtx.fillStyle = 'black';
            targetCtx.font = `${12 * scaleRatio}px Arial`;
            targetCtx.textAlign = 'center';
            targetCtx.textBaseline = 'middle';
            targetCtx.fillText(`RFID:${el.value || 0}`, 0, 0);
        } else if (el.type === 'hopper') {
            targetCtx.fillStyle = 'rgba(139, 69, 19, 0.8)';
            targetCtx.fillRect(-w/2, -h/2, w, h);
            targetCtx.strokeStyle = '#fff';
            targetCtx.lineWidth = 2 * scaleRatio;
            targetCtx.beginPath();
            targetCtx.moveTo(-w/2, -h/2);
            targetCtx.lineTo(w/2, h/2);
            targetCtx.moveTo(w/2, -h/2);
            targetCtx.lineTo(-w/2, h/2);
            targetCtx.stroke();
        } else if (el.type === 'obstacle') {
            targetCtx.fillStyle = el.color || '#444';
            
            targetCtx.beginPath();
            
            const shape = el.shape || 'rect';
            if (shape === 'rect') {
                targetCtx.rect(-w/2, -h/2, w, h);
            } else if (shape === 'circle') {
                targetCtx.ellipse(0, 0, w/2, h/2, 0, 0, Math.PI * 2);
            } else if (shape === 'triangle') {
                targetCtx.moveTo(0, -h/2);
                targetCtx.lineTo(w/2, h/2);
                targetCtx.lineTo(-w/2, h/2);
                targetCtx.closePath();
            } else if (shape === 'outer_curve') {
                targetCtx.moveTo(-w/2, h/2);
                targetCtx.ellipse(-w/2, h/2, w, h, 0, 0, -Math.PI/2, true);
                targetCtx.lineTo(-w/2, h/2);
                targetCtx.closePath();
            } else if (shape === 'inner_curve') {
                targetCtx.moveTo(-w/2, -h/2);
                targetCtx.lineTo(w/2, -h/2);
                targetCtx.lineTo(w/2, h/2);
                targetCtx.ellipse(-w/2, h/2, w, h, 0, 0, -Math.PI/2, true);
                targetCtx.closePath();
            }
            
            targetCtx.fill();
        }

        if (selectedInteractiveElement && selectedInteractiveElement.id === el.id) {
            targetCtx.strokeStyle = 'cyan';
            targetCtx.lineWidth = 3 * scaleRatio;
            targetCtx.setLineDash([5 * scaleRatio, 5 * scaleRatio]);
            targetCtx.strokeRect(-w/2 - 2*scaleRatio, -h/2 - 2*scaleRatio, w + 4*scaleRatio, h + 4*scaleRatio);
            targetCtx.setLineDash([]);
            
            if (currentToolMode === 'move') {
                const rad = TRANSFORM_HANDLE_RADIUS * scaleRatio;
                targetCtx.fillStyle = 'cyan';
                targetCtx.strokeStyle = 'blue';
                targetCtx.lineWidth = 1 * scaleRatio;

                const drawHandle = (hx, hy) => {
                    targetCtx.beginPath();
                    targetCtx.arc(hx, hy, rad, 0, Math.PI * 2);
                    targetCtx.fill();
                    targetCtx.stroke();
                };

                drawHandle(-w/2, -h/2); // TL
                drawHandle(0, -h/2);    // T
                drawHandle(w/2, -h/2);  // TR
                drawHandle(-w/2, 0);    // L
                drawHandle(w/2, 0);     // R
                drawHandle(-w/2, h/2);  // BL
                drawHandle(0, h/2);     // B
                drawHandle(w/2, h/2);   // BR
                
                targetCtx.beginPath();
                targetCtx.moveTo(0, -h/2);
                targetCtx.lineTo(0, -h/2 - (TRANSFORM_ROTATE_HANDLE_OFFSET - 3) * scaleRatio);
                targetCtx.stroke();
                
                targetCtx.beginPath();
                targetCtx.arc(0, -h/2 - TRANSFORM_ROTATE_HANDLE_OFFSET * scaleRatio, TRANSFORM_ROTATE_HANDLE_RADIUS * scaleRatio, 0, Math.PI * 2);
                targetCtx.fill();
            }
        }
        targetCtx.restore();
    });

    if (isGroupSelection(selectedInteractiveElement)) {
        const gx = selectedInteractiveElement.x * scaleRatio;
        const gy = selectedInteractiveElement.y * scaleRatio;
        const gw = selectedInteractiveElement.width * scaleRatio;
        const gh = selectedInteractiveElement.height * scaleRatio;
        const gcx = gx + gw / 2;
        const gcy = gy + gh / 2;

        targetCtx.save();
        targetCtx.translate(gcx, gcy);
        targetCtx.strokeStyle = 'cyan';
        targetCtx.lineWidth = 3 * scaleRatio;
        targetCtx.setLineDash([5 * scaleRatio, 5 * scaleRatio]);
        targetCtx.strokeRect(-gw/2 - 2*scaleRatio, -gh/2 - 2*scaleRatio, gw + 4*scaleRatio, gh + 4*scaleRatio);
        targetCtx.setLineDash([]);

        if (currentToolMode === 'move') {
            const rad = TRANSFORM_HANDLE_RADIUS * scaleRatio;
            targetCtx.fillStyle = 'cyan';
            targetCtx.strokeStyle = 'blue';
            targetCtx.lineWidth = 1 * scaleRatio;

            const drawHandle = (hx, hy) => {
                targetCtx.beginPath();
                targetCtx.arc(hx, hy, rad, 0, Math.PI * 2);
                targetCtx.fill();
                targetCtx.stroke();
            };

            drawHandle(-gw/2, -gh/2);
            drawHandle(0, -gh/2);
            drawHandle(gw/2, -gh/2);
            drawHandle(-gw/2, 0);
            drawHandle(gw/2, 0);
            drawHandle(-gw/2, gh/2);
            drawHandle(0, gh/2);
            drawHandle(gw/2, gh/2);

            targetCtx.beginPath();
            targetCtx.moveTo(0, -gh/2);
            targetCtx.lineTo(0, -gh/2 - (TRANSFORM_ROTATE_HANDLE_OFFSET - 3) * scaleRatio);
            targetCtx.stroke();

            targetCtx.beginPath();
            targetCtx.arc(0, -gh/2 - TRANSFORM_ROTATE_HANDLE_OFFSET * scaleRatio, TRANSFORM_ROTATE_HANDLE_RADIUS * scaleRatio, 0, Math.PI * 2);
            targetCtx.fill();
        }
        targetCtx.restore();
    }
}

function exportTrackAsCanvas() {
    if (currentGridSize.rows === 0 || currentGridSize.cols === 0) {
        alert("Tamaño de grid inválido para exportar.");
        return null;
    }
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = currentGridSize.cols * TRACK_PART_SIZE_PX;
    exportCanvas.height = currentGridSize.rows * TRACK_PART_SIZE_PX;

    if (exportCanvas.width === 0 || exportCanvas.height === 0) {
        alert("No se puede exportar una pista vacía o de tamaño cero.");
        return null;
    }
    const exportCtx = exportCanvas.getContext('2d');
    exportCtx.fillStyle = 'white'; // Background color of the track image
    exportCtx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);

    // Build a second canvas used only for IR line detection (track pieces only).
    // Interactive elements are rendered on exportCanvas for visuals, but must not
    // pollute the pixel map used by line sensors.
    const lineMaskCanvas = document.createElement('canvas');
    lineMaskCanvas.width = exportCanvas.width;
    lineMaskCanvas.height = exportCanvas.height;
    const lineMaskCtx = lineMaskCanvas.getContext('2d');
    lineMaskCtx.fillStyle = 'white';
    lineMaskCtx.fillRect(0, 0, lineMaskCanvas.width, lineMaskCanvas.height);

    let hasContent = false;
    for (let r = 0; r < currentGridSize.rows; r++) {
        for (let c = 0; c < currentGridSize.cols; c++) {
            const part = grid[r][c];
            if (part && part.image) {
                hasContent = true;
                const x_center = c * TRACK_PART_SIZE_PX + TRACK_PART_SIZE_PX / 2;
                const y_center = r * TRACK_PART_SIZE_PX + TRACK_PART_SIZE_PX / 2;

                exportCtx.save();
                exportCtx.translate(x_center, y_center);
                exportCtx.rotate(part.rotation_deg * Math.PI / 180);
                exportCtx.drawImage(part.image, -TRACK_PART_SIZE_PX / 2, -TRACK_PART_SIZE_PX / 2, TRACK_PART_SIZE_PX, TRACK_PART_SIZE_PX);
                exportCtx.restore();

                lineMaskCtx.save();
                lineMaskCtx.translate(x_center, y_center);
                lineMaskCtx.rotate(part.rotation_deg * Math.PI / 180);
                lineMaskCtx.drawImage(part.image, -TRACK_PART_SIZE_PX / 2, -TRACK_PART_SIZE_PX / 2, TRACK_PART_SIZE_PX, TRACK_PART_SIZE_PX);
                lineMaskCtx.restore();
            }
        }
    }

    drawInteractiveElements(exportCtx, 1);

    if (!hasContent && interactiveElements.length === 0) {
        alert("El editor de pistas está vacío. No hay nada para exportar.");
        return null;
    }

    // Attach line-only mask so Track can use it for IR sampling.
    exportCanvas.__lineMaskCanvas = lineMaskCanvas;
    exportCanvas.__interactiveElements = JSON.parse(JSON.stringify(interactiveElements));
    exportCanvas.dataset.fromEditor = 'true';
    return exportCanvas;
}

function saveEditorState() {
    // Create a deep copy of the grid, but only save necessary data
    const gridCopy = grid.map(row =>
        row.map(cell => {
            if (cell) {
                return {
                    file: cell.file,
                    name: cell.name,
                    connections: cell.connections,
                    rotation_deg: cell.rotation_deg
                };
            }
            return null;
        })
    );

    savedState = {
        grid: gridCopy,
        currentGridSize: { ...currentGridSize },
        interactiveElements: interactiveElements.map(el => ({...el})) // Ensure we don't lose them on tab switching
    };
}

function restoreEditorState() {
    if (savedState) {
        currentGridSize = { ...savedState.currentGridSize };
        
        if (savedState.interactiveElements) {
            interactiveElements = hydrateInteractiveElements(savedState.interactiveElements);
        }

        // Restore grid with proper image references
        grid = savedState.grid.map(row =>
            row.map(cell => {
                if (cell && cell.file) {
                    return {
                        ...cell,
                        image: trackPartsImages[cell.file]
                    };
                }
                return null;
            })
        );

        // Only render if we have a canvas context
        if (ctx && editorCanvas) {
            renderEditor();
        }
    }
}

function loadDefaultTrackDesign(gridSizeSelect, trackNameInput) {
    fetch('assets/tracks/PistaPorDefecto.json')
        .then(response => response.json())
        .then(designData => {
            if (!designData.gridSize || !designData.gridParts) {
                throw new Error("Formato de archivo de diseño de pista inválido.");
            }
            currentGridSize.rows = designData.gridSize.rows || 3;
            currentGridSize.cols = designData.gridSize.cols || 6;
            if (gridSizeSelect) {
                gridSizeSelect.value = `${currentGridSize.rows}x${currentGridSize.cols}`;
            }
            if (trackNameInput && designData.trackName) {
                trackNameInput.value = designData.trackName;
            }
            setupGrid();
            interactiveElements = [];
            selectedInteractiveElement = null;
            designData.gridParts.forEach(partData => {
                if (partData.r < currentGridSize.rows && partData.c < currentGridSize.cols) {
                    const originalPartInfo = AVAILABLE_TRACK_PARTS.find(p => p.file === partData.partFile);
                    const partImage = trackPartsImages[partData.partFile];
                    if (originalPartInfo && partImage) {
                        grid[partData.r][partData.c] = {
                            ...originalPartInfo,
                            image: partImage,
                            rotation_deg: partData.rotation || 0
                        };
                    }
                }
            });
            interactiveElements = hydrateInteractiveElements(designData.interactiveElements);
            renderEditor();
            // Exportar automáticamente al simulador si la interfaz está disponible
            if (mainAppInterface && typeof exportTrackAsCanvas === 'function') {
                const exportedCanvas = exportTrackAsCanvas();
                if (exportedCanvas) {
                    mainAppInterface.loadTrackFromEditor(exportedCanvas, 0, 0, 0);
                }
            }
        })
        .catch(error => {
            console.error("Error al cargar la pista por defecto:", error);
            alert("No se pudo cargar la pista por defecto. Revisa la consola.");
        });
}

function setupInteractiveTools(elems) {
    const tools = [
        { id: 'toolModeRFID', mode: 'rfid' },
        { id: 'toolModeColor', mode: 'color' },
        { id: 'toolModeHopper', mode: 'hopper' },
        { id: 'toolModeObstacle', mode: 'obstacle' },
        { id: 'toolModeMoveInt', mode: 'move' },
        { id: 'toolModeEraseInt', mode: 'erase' }
    ];
    tools.forEach(t => {
        const btn = document.getElementById(t.id);
        if (btn) {
            btn.addEventListener('click', () => {
                const isActive = currentToolMode === t.mode;
                currentToolMode = isActive ? null : t.mode;
                
                tools.forEach(other => {
                    const ob = document.getElementById(other.id);
                    if (ob) { ob.style.boxShadow = ''; ob.style.backgroundColor = ''; ob.style.color = ''; }
                });
                
                if (!isActive) {
                    btn.style.boxShadow = '0 0 0 2px var(--primary-color) inset'; btn.style.backgroundColor = 'var(--primary-color)'; btn.style.color = 'white';
                }
                
                updateInteractiveUI(currentToolMode, elems);
                
                // Clear track part selection
                document.querySelectorAll('#trackPartsPalette img').forEach(p => p.classList.remove('selected'));
                selectedTrackPart = null;
            });
        }
    });

    if(elems.intSettWidth) elems.intSettWidth.addEventListener('input', updateSelectedInteractiveElement);
    if(elems.intSettLength) elems.intSettLength.addEventListener('input', updateSelectedInteractiveElement);
    if(elems.intSettValue) elems.intSettValue.addEventListener('input', updateSelectedInteractiveElement);
    if(elems.intSettColor) elems.intSettColor.addEventListener('input', updateSelectedInteractiveElement);
    if(elems.obstacleShape) elems.obstacleShape.addEventListener('change', updateSelectedInteractiveElement);
}

function updateInteractiveUI(mode, elems) {
    if (!elems) elems = getDOMElements();
    if (!elems) return;
    
    if (mode === 'rfid') {
        elems.lblIntVal.style.display = 'flex';
        elems.lblIntColor.style.display = 'none';
        if (elems.lblIntShape) elems.lblIntShape.style.display = 'none';
        elems.intSettValue.placeholder = 'UID...';
    } else if (mode === 'color') {
        elems.lblIntVal.style.display = 'none';
        elems.lblIntColor.style.display = 'flex';
        if (elems.lblIntShape) elems.lblIntShape.style.display = 'none';
    } else if (mode === 'hopper') {
        elems.lblIntVal.style.display = 'flex';
        elems.lblIntColor.style.display = 'flex';
        if (elems.lblIntShape) elems.lblIntShape.style.display = 'none';
        elems.intSettValue.placeholder = 'Texto...';
    } else if (mode === 'obstacle') {
        elems.lblIntVal.style.display = 'none';
        elems.lblIntColor.style.display = 'flex';
        if (elems.lblIntShape) elems.lblIntShape.style.display = 'flex';
    } else {
        elems.lblIntVal.style.display = 'none';
        elems.lblIntColor.style.display = 'none';
        if (elems.lblIntShape) elems.lblIntShape.style.display = 'none';
    }
}

function updateSelectedInteractiveElement() {
    // Only allow live editing of a placed interactive while in move mode.
    if (currentToolMode !== 'move') return;
    if (isGroupSelection(selectedInteractiveElement)) return;
    if(selectedInteractiveElement) {
        const elems = getDOMElements();
        if(!elems) return;
        selectedInteractiveElement.width = parseFloat(elems.intSettWidth.value) || 50;
        selectedInteractiveElement.height = parseFloat(elems.intSettLength.value) || 50;
        selectedInteractiveElement.value = elems.intSettValue.value || '';
        selectedInteractiveElement.color = elems.intSettColor.value || '#0000ff';
        selectedInteractiveElement.shape = elems.obstacleShape.value || 'rect';
        renderEditor();
    }
}

function setupTrackZoomPan() {
    const trackPanBtn = document.getElementById('trackPanBtn');
    const trackZoomInBtn = document.getElementById('trackZoomInBtn');
    const trackZoomOutBtn = document.getElementById('trackZoomOutBtn');
    const trackZoomResetBtn = document.getElementById('trackZoomResetBtn');
    const trackZoomExtentsBtn = document.getElementById('trackZoomExtentsBtn');

    if (trackZoomInBtn) trackZoomInBtn.addEventListener('click', () => { trackZoom = Math.min(5.0, trackZoom + 0.2); renderEditor(); });
    if (trackZoomOutBtn) trackZoomOutBtn.addEventListener('click', () => { trackZoom = Math.max(0.1, trackZoom - 0.2); renderEditor(); });
    if (trackZoomResetBtn) trackZoomResetBtn.addEventListener('click', () => { trackZoom = 1.0; trackPanX = 0; trackPanY = 0; renderEditor(); });

    if (trackPanBtn) {
        trackPanBtn.addEventListener('click', () => {
            isPanningTrack = !isPanningTrack;
            if (isPanningTrack) {
                trackPanBtn.style.backgroundColor = 'var(--primary-color)'; trackPanBtn.style.color = 'white'; editorCanvas.style.cursor = 'grab';
            } else {
                trackPanBtn.style.backgroundColor = ''; trackPanBtn.style.color = ''; editorCanvas.style.cursor = 'default';
            }
        });
    }

    if (trackZoomExtentsBtn) trackZoomExtentsBtn.addEventListener('click', zoomToExtents);

    if (editorCanvas) {
        editorCanvas.addEventListener('wheel', (event) => {
            const rect = editorCanvas.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) return;
            const scaleX = editorCanvas.width / rect.width;
            const scaleY = editorCanvas.height / rect.height;

            if (!event.ctrlKey) {
                // Inverse pan mapping for non-ctrl wheel events
                trackPanX -= event.deltaX * scaleX;
                trackPanY -= event.deltaY * scaleY;
                renderEditor();
                event.preventDefault();
                return;
            }
            event.preventDefault();
            const zoomStep = Math.max(0.05, trackZoom * 0.1);
            const previousZoom = trackZoom;
            if (event.deltaY < 0) trackZoom = Math.min(5.0, trackZoom + zoomStep);
            else trackZoom = Math.max(0.1, trackZoom - zoomStep);

            const mouseX = (event.clientX - rect.left) * scaleX;
            const mouseY = (event.clientY - rect.top) * scaleY;

            trackPanX = mouseX - (mouseX - trackPanX) * (trackZoom / previousZoom);
            trackPanY = mouseY - (mouseY - trackPanY) * (trackZoom / previousZoom);
            renderEditor();
        }, { passive: false });

        editorCanvas.addEventListener('mousedown', (event) => {
            if (event.button === 1 || isPanningTrack) {
                isPanningTrack = true;
                if(trackPanBtn) { trackPanBtn.style.backgroundColor = 'var(--primary-color)'; trackPanBtn.style.color = 'white'; }
                editorCanvas.style.cursor = 'grabbing';
                trackPanStartX = event.clientX;
                trackPanStartY = event.clientY;
            }
        });

        window.addEventListener('mousemove', (event) => {
            if (isPanningTrack && editorCanvas && event.buttons !== 0) {
                const rect = editorCanvas.getBoundingClientRect();
                const scaleX = rect.width > 0 ? (editorCanvas.width / rect.width) : 1;
                const scaleY = rect.height > 0 ? (editorCanvas.height / rect.height) : 1;
                trackPanX += (event.clientX - trackPanStartX) * scaleX;
                trackPanY += (event.clientY - trackPanStartY) * scaleY;
                trackPanStartX = event.clientX;
                trackPanStartY = event.clientY;
                renderEditor();
            }
        });

        window.addEventListener('mouseup', (event) => {
            if (isPanningTrack && event.button === 1) { // Middle click release
                isPanningTrack = false;
                if(trackPanBtn) { trackPanBtn.style.backgroundColor = ''; trackPanBtn.style.color = ''; }
                editorCanvas.style.cursor = 'default';
            } else if (isPanningTrack && event.buttons === 0 && event.button === 0) { // Left click released but still in pan mode
                 editorCanvas.style.cursor = 'grab';
            }
        });
    }
}

function zoomToExtents() {
    if(!editorCanvas) return;
    const padding = 20;
    
    // Calculamos el tamaño de celda que mejor cabe
    const cellSize = Math.min(
        editorCanvas.width / currentGridSize.cols,
        editorCanvas.height / currentGridSize.rows
    );
    
    const contentW = currentGridSize.cols * cellSize;
    const contentH = currentGridSize.rows * cellSize;

    if (contentW === 0 || contentH === 0) { trackZoom = 1; trackPanX = 0; trackPanY = 0; renderEditor(); return; }

    trackZoom = 0.95; // Un pequeño margen visual

    trackPanX = (editorCanvas.width - contentW * trackZoom) / 2;
    trackPanY = (editorCanvas.height - contentH * trackZoom) / 2;
    renderEditor();
}