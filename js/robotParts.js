import { getDOMElements } from './ui.js';
import { loadAndScaleImage, getAssetPath } from './utils.js';
import { PIXELS_PER_METER } from './config.js';
import { renderRobotPreview } from './robotEditor.js';

const PARTS = [
    { id: 'chassis3', name: 'Chassis 3', src: 'parts/Chassis3.png' },
    { id: '18650', name: 'Batería 18650', src: 'parts/18650.png' },
    { id: 'motor', name: 'Motor DC con Reductor', src: 'parts/MotorDCwithGearBox.png' },
    { id: 'chassis2', name: 'Chassis 2', src: 'parts/Chassis2.png' },
    { id: 'sensor', name: 'Sensor', src: 'parts/sensor.png' },
    { id: 'robot_body', name: 'Cuerpo Robot', src: 'parts/robot_body.png' },
    { id: 'arduino_uno', name: 'Arduino Uno', src: 'parts/arduino_uno.png' },
    { id: 'l298n', name: 'L298N Driver', src: 'parts/l298n.png' }
];

let partsPalette;
let previewCanvas;
let previewCtx;
let draggedPart = null;
let placedParts = [];
window.placedParts = placedParts;
let selectedPart = null;
let isDragging = false;
let isPanning = false;
let panModeEnabled = false;
let panStartMouse = { x: 0, y: 0 };
let panStartOffset = { x: 0, y: 0 };
let wasDragging = false;
let dragOffset = { x: 0, y: 0 };
let eraseMode = false;
let suppressNextClick = false;

// --- TOUCH SUPPORT FOR MOBILE ---
let touchDragPart = null;
let touchDragImg = null;
let touchDragOffset = { x: 0, y: 0 };
let lastTapTime = 0;
let tapTimeout = null;

// Helper: get touch position relative to an element
function getTouchPos(e, el) {
    const rect = el.getBoundingClientRect();
    const t = e.touches[0] || e.changedTouches[0];
    return {
        x: t.clientX - rect.left,
        y: t.clientY - rect.top
    };
}

// Helper: convert screen-space pixels (relative to canvas top-left) 
// to unscaled "world" pixels relative to canvas top-left.
// (Inverse of the translation and scale applied in render)
function screenToWorld(x, y) {
    const zoom = window.getPreviewZoom ? window.getPreviewZoom() : 1.0;
    const centerX = previewCanvas.width / 2;
    const centerY = previewCanvas.height / 2;

    // Calcular el desplazamiento de centrado (en píxeles)
    const offsetX = (window.previewCenterOffset ? window.previewCenterOffset.x * PIXELS_PER_METER : 0) * zoom;
    const offsetY = (window.previewCenterOffset ? window.previewCenterOffset.y * PIXELS_PER_METER : 0) * zoom;

    // 1. Deshacer el centrado del canvas
    // 2. Deshacer el desplazamiento de centrado del robot
    // 3. Deshacer el escalado (zoom)
    return {
        x: centerX + (x - (centerX - offsetX)) / zoom,
        y: centerY + (y - (centerY - offsetY)) / zoom
    };
}

export function initRobotParts() {
    console.log("Initializing robot parts...");
    const elems = getDOMElements();
    previewCanvas = elems.robotPreviewCanvas;
    previewCtx = previewCanvas.getContext('2d');
    partsPalette = elems.robotPartsPalette;

    if (!partsPalette || !previewCanvas) {
        console.error("Robot parts palette or preview canvas not found!");
        return;
    }

    // --- BLOQUEAR SCROLL Y GESTOS EN MOBILE DURANTE TOUCH ---
    // Esto previene el scroll y zoom nativo durante interacción touch
    partsPalette.style.touchAction = 'none';
    previewCanvas.style.touchAction = 'none';

    // Add erase mode button under the palette
    let eraseBtn = document.createElement('button');
    eraseBtn.textContent = 'Modo Borrar';
    eraseBtn.style.marginTop = '8px';
    eraseBtn.style.display = 'block';
    eraseBtn.style.width = '100%';
    eraseBtn.onclick = () => {
        eraseMode = !eraseMode;
        eraseBtn.classList.toggle('active', eraseMode);
        eraseBtn.style.background = eraseMode ? '#e66' : '';
    };
    // Insertar después del texto de ayuda si existe
    const helpDiv = partsPalette.parentNode.querySelector('.robot-editor-help');

    // Create container for buttons
    const buttonsContainer = document.createElement('div');
    buttonsContainer.id = 'editor-controls-extra';
    buttonsContainer.style.marginTop = '1em';
    buttonsContainer.style.display = 'flex';
    buttonsContainer.style.flexDirection = 'column';
    buttonsContainer.style.gap = '0.5em';

    // Add erase btn to container
    buttonsContainer.appendChild(eraseBtn);

    // Create inner row for the 3 main buttons
    const mainBtnsRow = document.createElement('div');
    mainBtnsRow.style.display = 'flex';
    mainBtnsRow.style.gap = '0.5em';
    mainBtnsRow.style.width = '100%';

    const saveBtn = document.createElement('button');
    saveBtn.id = 'saveRobotButton';
    saveBtn.textContent = 'Guardar Robot';
    saveBtn.style.flex = '1';
    saveBtn.style.padding = '0.8em';

    const loadLabel = document.createElement('label');
    loadLabel.setAttribute('for', 'loadRobotInput');
    loadLabel.className = 'file-input-label';
    loadLabel.textContent = 'Cargar Robot';
    loadLabel.style.cssText = 'flex:1; margin:0; padding:0.8em; display:flex; align-items:center; justify-content:center; box-sizing:border-box; height:auto; min-height:2.8em; text-align:center; cursor:pointer; background:var(--primary-color); color:white; border-radius:4px; font-size: 0.9em;';

    const loadInput = document.createElement('input');
    loadInput.type = 'file';
    loadInput.id = 'loadRobotInput';
    loadInput.accept = '.json';
    loadInput.style.display = 'none';

    const exampleBtn = document.createElement('button');
    exampleBtn.id = 'loadExampleRobotButton';
    exampleBtn.textContent = 'Cargar Ejemplo';
    exampleBtn.style.flex = '1';
    exampleBtn.style.padding = '0.8em';

    mainBtnsRow.appendChild(saveBtn);
    mainBtnsRow.appendChild(loadLabel);
    mainBtnsRow.appendChild(loadInput);
    mainBtnsRow.appendChild(exampleBtn);

    buttonsContainer.appendChild(mainBtnsRow);

    // Predefined robots
    const predefDiv = document.createElement('div');
    predefDiv.style.marginTop = '0.5em';
    predefDiv.innerHTML = `
        <label for="robotSelectionDropdown" style="font-size:0.9em; display:block; margin-bottom:0.3em;">Seleccionar Robot Predefinido:</label>
        <select id="robotSelectionDropdown" style="width:100%; padding:0.4em; border-radius:4px; border:1px solid var(--border-color);"></select>
    `;
    buttonsContainer.appendChild(predefDiv);

    if (helpDiv) {
        helpDiv.parentNode.insertBefore(buttonsContainer, helpDiv.nextSibling);
    } else {
        partsPalette.parentNode.appendChild(buttonsContainer);
    }

    // Iniciar el botón Pan
    const panBtn = elems.editorPanBtn;
    if (panBtn) {
        panBtn.addEventListener('click', () => {
            panModeEnabled = !panModeEnabled;
            panBtn.classList.toggle('active', panModeEnabled);
            panBtn.style.background = panModeEnabled ? '#ffca28' : ''; // Color distintivo para Pan
        });
    }

    console.log("Loading parts into palette...");
    // Load parts into palette
    PARTS.forEach(part => {
        const img = new Image();
        img.src = getAssetPath(part.src);
        img.onload = () => {
            console.log(`Loaded part image: ${part.name}`);
            const partElement = document.createElement('img');
            partElement.src = img.src;
            partElement.draggable = true;
            partElement.dataset.partId = part.id;
            partElement.title = part.name;

            // Add drag event listeners
            partElement.addEventListener('dragstart', (e) => {
                console.log(`Starting drag of part: ${part.name}`);
                draggedPart = {
                    id: part.id,
                    name: part.name,
                    img: img
                };
                e.dataTransfer.setData('text/plain', part.id);
                e.dataTransfer.effectAllowed = 'copy';
            });

            partElement.addEventListener('dragend', () => {
                console.log(`Ended drag of part: ${part.name}`);
                draggedPart = null;
            });

            partsPalette.appendChild(partElement);
        };
    });

    // Drag and drop event listeners
    previewCanvas.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
    });

    previewCanvas.addEventListener('drop', (e) => {
        e.preventDefault();
        if (draggedPart) {
            console.log(`Dropping part: ${draggedPart.name}`);
            const rect = previewCanvas.getBoundingClientRect();
            // Get exact pixel coordinates (1:1 mapping)
            const screenX = e.clientX - rect.left;
            const screenY = e.clientY - rect.top;

            const world = screenToWorld(screenX, screenY);

            let np = new BasePart({
                id: draggedPart.id,
                name: draggedPart.name,
                img: draggedPart.img,
                x: world.x,
                 y: world.y}); placedParts.push(np); syncTwin(np, previewCanvas);

            draggedPart = null;
            if (window.renderRobotPreview) window.renderRobotPreview();
            else drawRobotPreview(window.getPreviewZoom ? window.getPreviewZoom() : 1.0);
        }
    });

    // Mouse interaction for moving parts
    previewCanvas.addEventListener('mousedown', (e) => {
        // If pan mode is enabled, immediately start panning
        if (panModeEnabled) {
            isPanning = true;
            panStartMouse = { x: e.clientX, y: e.clientY };
            panStartOffset = { ...(window.previewCenterOffset || { x: 0, y: 0 }) };
            return;
        }

        const rect = previewCanvas.getBoundingClientRect();
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;

        const world = screenToWorld(screenX, screenY);
        const x = world.x;
        const y = world.y;

        // Check if clicked on a part
        for (let i = placedParts.length - 1; i >= 0; i--) {
            const part = placedParts[i];
            const partSize = 40; // Size of the part in pixels (40mm)
            if (Math.abs(x - part.x) < partSize / 2 && Math.abs(y - part.y) < partSize / 2) {
                console.log(`Selected part for moving: ${part.name}`);
                selectedPart = part;
                isDragging = true;
                wasDragging = false;
                dragOffset = {
                    x: x - part.x,
                    y: y - part.y
                };
                return;
            }
        }
    });

    previewCanvas.addEventListener('mousemove', (e) => {
        if (isDragging && selectedPart) {
            wasDragging = true;
            const rect = previewCanvas.getBoundingClientRect();
            const screenX = e.clientX - rect.left;
            const screenY = e.clientY - rect.top;

            const world = screenToWorld(screenX, screenY);
            const x = world.x;
            const y = world.y;

            selectedPart.x = x - dragOffset.x;
            selectedPart.y = y - dragOffset.y; syncTwin(selectedPart, previewCanvas);
            renderRobotPreview();
        } else if (isPanning) {
            wasDragging = true;
            const deltaX = e.clientX - panStartMouse.x;
            const deltaY = e.clientY - panStartMouse.y;
            const zoom = window.getPreviewZoom ? window.getPreviewZoom() : 1.0;
            window.previewCenterOffset = {
                x: panStartOffset.x - (deltaX / PIXELS_PER_METER) / zoom,
                y: panStartOffset.y - (deltaY / PIXELS_PER_METER) / zoom
            };
            if (window.renderRobotPreview) {
                window.renderRobotPreview();
            }
        }
    });

    previewCanvas.addEventListener('mouseup', () => {
        if (isDragging) {
            console.log(`Finished moving part: ${selectedPart?.name}`);
            isDragging = false;
            selectedPart = null;
        }
        if (isPanning) {
            isPanning = false;
        }
    });

    previewCanvas.addEventListener('mouseleave', () => {
        if (isDragging) {
            isDragging = false;
            selectedPart = null;
        }
        if (isPanning) {
            isPanning = false;
        }
    });

    // Click to remove parts
    previewCanvas.addEventListener('click', (e) => {
        if (suppressNextClick) {
            suppressNextClick = false;
            return;
        }
        // No erase logic here; single-click does not erase parts anymore
        wasDragging = false;
    });

    // Double-click to rotate or erase parts
    previewCanvas.addEventListener('dblclick', (e) => {
        const rect = previewCanvas.getBoundingClientRect();
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;

        const world = screenToWorld(screenX, screenY);
        const x = world.x;
        const y = world.y;

        let partHit = false;

        for (let i = placedParts.length - 1; i >= 0; i--) {
            const part = placedParts[i];
            const partSize = part.img.width; // Use width for hit area
            if (Math.abs(x - part.x) < partSize / 2 && Math.abs(y - part.y) < partSize / 2) {
                partHit = true;
                if (eraseMode) {
                    console.log(`Erasing part: ${part.name}`);
                    const todel = placedParts[i]; if(todel && todel.twinId) { let tid = todel.twinId; placedParts = placedParts.filter(p => p.id !== tid); window.placedParts = placedParts; } placedParts.splice(i, 1); window.placedParts = placedParts;
                } else {
                    part.rotation = ((part.rotation || 0) + Math.PI / 2) % (2 * Math.PI); syncTwin(part, previewCanvas); console.log(`Rotated part: ${part.name} to ${part.rotation} radians`);
                }
                renderRobotPreview();
                suppressNextClick = true;
                break;
            }
        }

        // Check for Custom Wheels deletion if nothing else was hit and we are in erase mode
        if (!partHit && eraseMode && window.currentGeometry && window.currentGeometry.customWheels) {
            // Wheels bounding box logic 
            // In the preview, robot is at canvas center rotated -90deg (-Math.PI/2)
            // Left wheel is "above" the center visually, Right wheel is "below"
            const cw = window.currentGeometry.customWheels;
            const wLengthPx = cw.length_m * PIXELS_PER_METER;
            const wWidthPx = cw.width_m * PIXELS_PER_METER;
            const wOffsetPx = (window.currentGeometry.width_m || 0.15) / 2 * PIXELS_PER_METER;
            const cx = previewCanvas.width / 2;
            const cy = previewCanvas.height / 2;

            // Transform click coordinates to robot local space (rotated -90deg)
            // Due to -90 deg rotation: localY = (x - cx), localX = -(y - cy)
            const localX = -(y - cy);
            const localY = (x - cx);

            // Left wheel box: X [-wLengthPx/2, wLengthPx/2], Y [wOffsetPx - wWidthPx/2, wOffsetPx + wWidthPx/2]
            const inLeftWheel = Math.abs(localX) <= wLengthPx / 2 && Math.abs(localY - wOffsetPx) <= wWidthPx / 2;
            // Right wheel box: X [-wLengthPx/2, wLengthPx/2], Y [-wOffsetPx - wWidthPx/2, -wOffsetPx + wWidthPx/2]
            const inRightWheel = Math.abs(localX) <= wLengthPx / 2 && Math.abs(localY - (-wOffsetPx)) <= wWidthPx / 2;

            if (inLeftWheel || inRightWheel) {
                console.log(`Erasing custom wheels`);
                window.currentGeometry.customWheels = null;
                // Need to notify robot editor to re-sync UI inputs and geometry
                if (window.forceGeometrySync) {
                    window.forceGeometrySync();
                } else if (window.renderRobotPreview) {
                    window.renderRobotPreview();
                }
                suppressNextClick = true;
            }
        }
    });

    // Touch drag from palette
    partsPalette.addEventListener('touchstart', function (e) {
        const target = e.target.closest('img[data-part-id]');
        if (!target) return;
        e.preventDefault();
        const partId = target.dataset.partId;
        const partInfo = PARTS.find(pt => pt.id === partId);
        if (!partInfo) return;
        touchDragPart = partInfo;
        // Create drag image for feedback
        touchDragImg = document.createElement('img');
        touchDragImg.src = getAssetPath(partInfo.src);
        touchDragImg.style.position = 'fixed';
        touchDragImg.style.pointerEvents = 'none';
        touchDragImg.style.opacity = '0.7';
        touchDragImg.style.zIndex = '9999';
        touchDragImg.style.width = '40px';
        touchDragImg.style.height = '40px';
        document.body.appendChild(touchDragImg);
        const pos = getTouchPos(e, document.body);
        touchDragImg.style.left = (pos.x - 20) + 'px';
        touchDragImg.style.top = (pos.y - 20) + 'px';
        touchDragOffset = { x: 20, y: 20 };
    }, { passive: false });

    partsPalette.addEventListener('touchmove', function (e) {
        if (!touchDragImg) return;
        e.preventDefault();
        const pos = getTouchPos(e, document.body);
        touchDragImg.style.left = (pos.x - touchDragOffset.x) + 'px';
        touchDragImg.style.top = (pos.y - touchDragOffset.y) + 'px';
    }, { passive: false });

    partsPalette.addEventListener('touchend', function (e) {
        if (!touchDragPart || !touchDragImg) return;
        const touchPos = getTouchPos(e, previewCanvas);

        // Translate touch focus to unscaled world coordinates
        const world = screenToWorld(touchPos.x, touchPos.y);

        // Check if touch ended over the canvas
        const rect = previewCanvas.getBoundingClientRect();
        const t = e.changedTouches[0];
        if (t.clientX >= rect.left && t.clientX <= rect.right && t.clientY >= rect.top && t.clientY <= rect.bottom) {
            // Drop part on canvas
            let np = new BasePart({
                id: touchDragPart.id,
                name: touchDragPart.name,
                img: new window.Image(),
                x: world.x,
                 y: world.y}); placedParts.push(np); syncTwin(np, previewCanvas);
            placedParts[placedParts.length - 1].img.src = getAssetPath(touchDragPart.src);
            drawRobotPreview(window.getPreviewZoom ? window.getPreviewZoom() : 1.0);
        }
        document.body.removeChild(touchDragImg);
        touchDragImg = null;
        touchDragPart = null;
    }, { passive: false });

    partsPalette.addEventListener('touchcancel', function () {
        if (touchDragImg) document.body.removeChild(touchDragImg);
        touchDragImg = null;
        touchDragPart = null;
    });

    // Touch move/drag for parts already on canvas
    let touchMovePart = null;
    let touchMoveOffset = { x: 0, y: 0 };
    previewCanvas.addEventListener('touchstart', function (e) {
        if (e.touches.length > 1) return; // Ignore multi-touch

        // If pan mode is enabled, immediately start panning
        if (panModeEnabled) {
            isPanning = true;
            const targetTouch = e.touches[0] || e.changedTouches[0];
            panStartMouse = { x: targetTouch.clientX, y: targetTouch.clientY };
            panStartOffset = { ...(window.previewCenterOffset || { x: 0, y: 0 }) };
            e.preventDefault();
            return;
        }

        const touchPos = getTouchPos(e, previewCanvas);
        const world = screenToWorld(touchPos.x, touchPos.y);
        const x = world.x;
        const y = world.y;

        // Check if touching a part
        for (let i = placedParts.length - 1; i >= 0; i--) {
            const part = placedParts[i];
            const partSize = 40;
            if (Math.abs(x - part.x) < partSize / 2 && Math.abs(y - part.y) < partSize / 2) {
                touchMovePart = part;
                touchMoveOffset = { x: x - part.x, y: y - part.y };
                // Double tap detection for rotate/erase
                const now = Date.now();
                if (now - lastTapTime < 350) {
                    clearTimeout(tapTimeout);
                    lastTapTime = 0;
                    if (eraseMode) {
                        const todel = placedParts[i]; if(todel && todel.twinId) { let tid = todel.twinId; placedParts = placedParts.filter(p => p.id !== tid); window.placedParts = placedParts; } placedParts.splice(i, 1); window.placedParts = placedParts;
                    } else {
                        part.rotation = ((part.rotation || 0) + Math.PI / 2) % (2 * Math.PI);
                    }
                    if (window.renderRobotPreview) window.renderRobotPreview();
                    else drawRobotPreview(window.getPreviewZoom ? window.getPreviewZoom() : 1.0);
                    e.preventDefault();
                    return;
                } else {
                    lastTapTime = now;
                    tapTimeout = setTimeout(() => { lastTapTime = 0; }, 400);
                }
                e.preventDefault();
                return;
            }
        }
    }, { passive: false });

    previewCanvas.addEventListener('touchmove', function (e) {
        if (touchMovePart) {
            e.preventDefault();
            const touchPos = getTouchPos(e, previewCanvas);
            const world = screenToWorld(touchPos.x, touchPos.y);

            touchMovePart.x = world.x - touchMoveOffset.x;
            touchMovePart.y = world.y - touchMoveOffset.y; syncTwin(touchMovePart, previewCanvas);

            // Limpiar el canvas y forzar redibujo completo para evitar trails/glitches en mobile
            if (window.renderRobotPreview) {
                window.renderRobotPreview();
            } else if (previewCtx && previewCanvas) {
                previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
                // Redibuja manualmente si no existe renderRobotPreview
                if (typeof drawRobotPreview === 'function') drawRobotPreview(window.getPreviewZoom ? window.getPreviewZoom() : 1.0);
            }
        } else if (isPanning) {
            e.preventDefault();
            const targetTouch = e.touches[0] || e.changedTouches[0];
            const deltaX = targetTouch.clientX - panStartMouse.x;
            const deltaY = targetTouch.clientY - panStartMouse.y;

            const zoom = window.getPreviewZoom ? window.getPreviewZoom() : 1.0;
            window.previewCenterOffset = {
                x: panStartOffset.x - (deltaX / PIXELS_PER_METER) / zoom,
                y: panStartOffset.y - (deltaY / PIXELS_PER_METER) / zoom
            };

            if (window.renderRobotPreview) {
                window.renderRobotPreview();
            } else if (previewCtx && previewCanvas) {
                previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
                if (typeof drawRobotPreview === 'function') drawRobotPreview(zoom);
            }
        }
    }, { passive: false });

    previewCanvas.addEventListener('touchend', function (e) {
        if (touchMovePart) {
            touchMovePart = null;
        }
        if (isPanning) {
            isPanning = false;
        }
    });
    previewCanvas.addEventListener('touchcancel', function () {
        if (touchMovePart) {
            touchMovePart = null;
        }
        if (isPanning) {
            isPanning = false;
        }
    });
}

export function drawRobotPreview(zoom = 1.0) {
    if (!previewCtx || !previewCanvas) {
        console.error("Missing previewCtx or previewCanvas in drawRobotPreview");
        return;
    }
    // Do NOT clear the canvas here; it is cleared in renderRobotPreview
    console.log("Drawing robot preview with parts:", placedParts.length);

    // El renderizado principal en robotEditor.js ya aplica el translate y scale general.
    // Aquí solo dibujamos cada pieza en su posición relativa al origen (0,0) del robot.
    // PERO las piezas en placedParts se guardan en coordenadas de CANVAS (píxeles)
    // por lo que debemos convertirlas a relativas al centro original.

    placedParts.forEach(part => {
        previewCtx.save();

        // Convertir coordenadas de canvas a relativas al centro del robot (en metros)
        const centerX = previewCanvas.width / 2;
        const centerY = previewCanvas.height / 2;
        const relX_m = (part.x - centerX) / PIXELS_PER_METER;
        const relY_m = (part.y - centerY) / PIXELS_PER_METER;

        previewCtx.translate(relX_m * PIXELS_PER_METER, relY_m * PIXELS_PER_METER);
        if (part.rotation) previewCtx.rotate(part.rotation);

        if (part.img && part.img.complete) {
            const w = part.img.width;
            const h = part.img.height;
            previewCtx.drawImage(part.img, -w / 2, -h / 2);
        } else {
            // Fallback square
            previewCtx.fillStyle = part.color || 'rgba(0,0,0,0.5)';
            previewCtx.fillRect(-15, -15, 30, 30);
        }

        if (part === selectedPart) {
            previewCtx.strokeStyle = '#007bff';
            previewCtx.lineWidth = 2 / zoom; // Ajustar grosor por zoom
            previewCtx.strokeRect(-18, -18, 36, 36);
        }

        previewCtx.restore();
    });
}

function rotate90(x, y) {
    // Rotate (x, y) by +90 degrees (counterclockwise)
    return { x: -y, y: x };
}

export function getPlacedParts() {
    console.log("Getting placed parts for simulation:", placedParts.length);
    return placedParts.map(part => {
        // Convert pixel coordinates to meters for simulation
        let x_m = (part.x - previewCanvas.width / 2) / PIXELS_PER_METER;
        let y_m = (part.y - previewCanvas.height / 2) / PIXELS_PER_METER;
        // Rotate by +90deg to match simulation orientation
        const rotated = rotate90(x_m, y_m);
        return {
            id: part.id,
            name: part.name,
            img: part.img, // Keep the image reference
            x: rotated.x,
            y: rotated.y,
            rotation: (part.rotation || 0) + Math.PI / 2 // Add 90 degrees to the rotation
        };
    });
}

export function clearPlacedParts() {
    placedParts = [];
    drawRobotPreview();
}

export function restorePlacedPartsRaw(partsArr) {
    placedParts.length = 0; // Vacía el array manteniendo la referencia
    const previewCanvas = getDOMElements().robotPreviewCanvas;
    partsArr.forEach(p => {
        // Solo convierte de metros a pixeles, sin rotar ejes
        const px = p.x * PIXELS_PER_METER + previewCanvas.width / 2;
        const py = p.y * PIXELS_PER_METER + previewCanvas.height / 2;
        let img = null;

        if (p.isParametric) {
            img = new window.Image();
            img.src = generateParametricImageBase64(p.width_mm, p.length_mm, p.color);
        } else {
            const partInfo = PARTS.find(pt => pt.id === p.id);
            if (partInfo) {
                img = new window.Image();
                img.onload = () => { if (window.renderRobotPreview) window.renderRobotPreview(); };
                img.src = getAssetPath(partInfo.src);
            }
        }
        let np = p.isParametric ? new BasePart({id: p.id, name: p.name, img, x: px, y: py, rotation: p.rotation || 0, isParametric: true, width_mm: p.width_mm, length_mm: p.length_mm, color: p.color}) : new BasePart({id: p.id, name: p.name, img, x: px, y: py, rotation: p.rotation || 0}); placedParts.push(np);
    });
    renderRobotPreview();
}

// Devuelve las partes decorativas en coordenadas del editor (sin rotar)
export function getPlacedPartsRaw() {
    const previewCanvas = getDOMElements().robotPreviewCanvas;
    return placedParts.map(part => {
        // Convierte de pixeles a metros, sin rotar
        let x_m = (part.x - previewCanvas.width / 2) / PIXELS_PER_METER;
        let y_m = (part.y - previewCanvas.height / 2) / PIXELS_PER_METER;
        let data = {
            id: part.id,
            name: part.name,
            x: x_m,
            y: y_m,
            rotation: part.rotation || 0
        };
        if (part.isParametric) {
            data.isParametric = true;
            data.width_mm = part.width_mm;
            data.length_mm = part.length_mm;
            data.color = part.color;
        }
        return data;
    });
}

function generateParametricImageBase64(width_mm, length_mm, color) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, width_mm);
    canvas.height = Math.max(1, length_mm);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // Add slightly darker border
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, canvas.width - 2, canvas.height - 2);
    // Draw cross lines for aesthetics
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(canvas.width, canvas.height);
    ctx.moveTo(canvas.width, 0);
    ctx.lineTo(0, canvas.height);
    ctx.stroke();
    return canvas.toDataURL('image/png');
}

export function addParametricBodyPart(width_mm, length_mm, offset_mm, color) {
    if (!previewCanvas) return;

    const imgData = generateParametricImageBase64(width_mm, length_mm, color);
    const img = new window.Image();
    img.src = imgData;

    // Position exactly at the center - offset_mm (invertido para que positivo sea arriba)
    const centerX = previewCanvas.width / 2;
    const centerY = (previewCanvas.height / 2) - (offset_mm * (PIXELS_PER_METER / 1000));

    img.onload = () => {
        let np = new BasePart({ id: 'custom_body_' + Date.now(), 
            name: 'Cuerpo Custom',
            img: img,
            x: centerX,
            y: centerY,
            rotation: 0,
            isParametric: true,
            width_mm: width_mm,
            length_mm: length_mm,
            color: color
        }); 
        placedParts.push(np); 
        syncTwin(np, previewCanvas);
        if (window.renderRobotPreview) {
            window.renderRobotPreview();
        } else {
            drawRobotPreview(window.getPreviewZoom ? window.getPreviewZoom() : 1.0);
        }
    };
}


export class BasePart {
    constructor({ id, name, x, y, rotation = 0, isParametric = false, width_mm, length_mm, color, img }) {
        this.id = id;
        this.name = name;
        this.x = x;
        this.y = y;
        this.rotation = rotation;
        this.isParametric = isParametric;
        this.width_mm = width_mm;
        this.length_mm = length_mm;
        this.color = color;
        this.img = img;
        this.twinId = null; // Para la simetría
        this.isTwin = false;
    }
    
    draw(ctx) {
        if (this.img && this.img.complete) {
            const w = this.img.width;
            const h = this.img.height;
            ctx.drawImage(this.img, -w / 2, -h / 2);
        } else {
            ctx.fillStyle = this.color || 'rgba(0,0,0,0.5)';
            ctx.fillRect(-15, -15, 30, 30);
        }
    }
}

export class RFIDReader extends BasePart {
    constructor(opts) {
        super(opts);
        this.uid = opts.uid || '04:7B:3A:42';
        this.type = 'RFIDReader';
    }
    draw(ctx) {
        ctx.fillStyle = '#0055ff';
        ctx.fillRect(-20, -10, 40, 20);
        ctx.strokeStyle = '#fff';
        ctx.strokeRect(-20, -10, 40, 20);
        ctx.fillStyle = '#fff';
        ctx.font = '8px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('RFID', 0, 0);
    }
}

export class ColorSensor extends BasePart {
    constructor(opts) {
        super(opts);
        this.rgb = opts.rgb || {r:255, g:255, b:255};
        this.type = 'ColorSensor';
    }
    draw(ctx) {
        ctx.beginPath();
        ctx.arc(0, 0, 8, 0, Math.PI * 2);
        ctx.fillStyle = `rgb(${this.rgb.r}, ${this.rgb.g}, ${this.rgb.b})`;
        ctx.fill();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.stroke();
    }
}

export class DistanceSensor extends BasePart {
    constructor(opts) {
        super(opts);
        this.type = 'DistanceSensor';
    }
    draw(ctx) {
        ctx.beginPath();
        ctx.moveTo(0, -10);
        ctx.lineTo(20, 15);
        ctx.lineTo(-20, 15);
        ctx.closePath();
        ctx.fillStyle = 'rgba(255, 100, 0, 0.7)';
        ctx.fill();
        ctx.strokeStyle = '#000';
        ctx.stroke();
        ctx.fillStyle = '#000';
        ctx.fillRect(-5, -15, 10, 5);
    }
}

export let symmetryModeEnabled = false;
export function setSymmetryMode(enabled) {
    symmetryModeEnabled = enabled;
    if (window.placedParts) {
        if (enabled) {
            // Generate twins for existing parts if they don't have one and shouldn't be twins themselves
            const partsToSync = [...window.placedParts];
            partsToSync.forEach(p => {
                if (!p.isTwin) {
                    window.syncTwin(p, window.previewCanvas || document.getElementById('robotPreviewCanvas'));
                }
            });
        } else {
            // Remove all twins
            window.placedParts = window.placedParts.filter(p => !p.isTwin);
            // reset twinId on original parts
            window.placedParts.forEach(p => p.twinId = null);
        }
        if (window.renderRobotPreview) {
            window.renderRobotPreview();
        }
    }
}

export function syncTwin(part, previewCanvas) {
    if (!symmetryModeEnabled || !part) return;
    if (!previewCanvas) previewCanvas = {width: 500, height: 450}; // fallback
    const cx = previewCanvas.width / 2;
    const cy = previewCanvas.height / 2;
    
    // Si la pieza no es un gemelo que se mueve
    if (!part.isTwin) {
        let twin = window.placedParts.find(p => p.id === part.twinId);
        if (!twin) {
            // Clonar
            const opts = {...part, id: part.id + '_twin', twinId: part.id, isTwin: true};
            if (part instanceof RFIDReader) twin = new RFIDReader({...opts, type: 'RFIDReader'});
            else if (part instanceof ColorSensor) twin = new ColorSensor({...opts, type: 'ColorSensor'});
            else if (part instanceof DistanceSensor) twin = new DistanceSensor({...opts, type: 'DistanceSensor'});
            else twin = new BasePart(opts);
            
            part.twinId = twin.id;
            window.placedParts.push(twin);
        }
        
        // Espejar a lo largo del eje central X (cx)
        const dx = part.x - cx;
        twin.x = cx - dx;
        twin.y = part.y; // Mantiene la misma posición vertical (profundidad)
        twin.rotation = part.rotation;
        if (twin.rotation !== undefined && twin.rotation !== null) {
             // Reflejar rotación: si apunta a la derecha, el gemelo apunta a la izquierda
             twin.rotation = -part.rotation;
             // Ajustar ángulo según el sentido de dibujo, normalmente -rotation funciona para mirror en X.
        }
    }
}

export function removeTwin(partId) {
    let part = window.placedParts.find(p => p.id === partId);
    if(part && part.twinId) {
        window.placedParts = window.placedParts.filter(p => p.id !== part.twinId && p.id !== part.twinId);
        const idx = window.placedParts.findIndex(p => p.id === part.twinId);
        if (idx !== -1) window.placedParts.splice(idx, 1);
    }
}

export function addRFIDReader() {
    const pc = document.getElementById('robotPreviewCanvas');
    if(!pc) return;
    const part = new RFIDReader({
        id: 'rfid_' + Date.now(),
        name: 'Lector RFID',
        x: pc.width/2,
        y: pc.height/2 - 50
    });
    window.placedParts.push(part);
    syncTwin(part, pc);
    if (window.renderRobotPreview) window.renderRobotPreview();
}

export function addColorSensor() {
    const pc = document.getElementById('robotPreviewCanvas');
    if(!pc) return;
    const part = new ColorSensor({
        id: 'color_' + Date.now(),
        name: 'Sensor Color',
        x: pc.width/2,
        y: pc.height/2 - 50
    });
    window.placedParts.push(part);
    syncTwin(part, pc);
    if (window.renderRobotPreview) window.renderRobotPreview();
}

export function addDistanceSensor() {
    const pc = document.getElementById('robotPreviewCanvas');
    if(!pc) return;
    const part = new DistanceSensor({
        id: 'dist_' + Date.now(),
        name: 'Sensor ToF',
        x: pc.width/2,
        y: pc.height/2 - 50
    });
    window.placedParts.push(part);
    syncTwin(part, pc);
    if (window.renderRobotPreview) window.renderRobotPreview();
}

window.setSymmetryMode = setSymmetryMode;
window.addRFIDReader = addRFIDReader;
window.addColorSensor = addColorSensor;
window.addDistanceSensor = addDistanceSensor;

window.PARTS = PARTS;
window.clearPlacedParts = clearPlacedParts;
window.getAssetPath = getAssetPath;
window.getPlacedParts = getPlacedParts;
window.restorePlacedPartsRaw = restorePlacedPartsRaw;
window.getPlacedPartsRaw = getPlacedPartsRaw;
window.addParametricBodyPart = addParametricBodyPart;
window.RFIDReader = RFIDReader;
window.ColorSensor = ColorSensor;
window.DistanceSensor = DistanceSensor;
window.syncTwin = syncTwin;
