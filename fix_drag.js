const fs = require('fs');
let code = fs.readFileSync('js/trackEditor.js', 'utf8');

const stateVars = \let interactiveElements = []; // { id, type, x, y, width, height, value, color }
let selectedInteractiveElement = null;
let currentToolMode = null; // 'rfid' | 'color' | 'hopper' | 'erase' | null
// Drag state
let isDraggingInteractive = false;
let draggedElement = null;
let dragOffsetX = 0;
let dragOffsetY = 0;
let dragMoved = false;\;

code = code.replace(/let interactiveElements = \[\];[\\s\\S]*?let currentToolMode = null;.*\n/, stateVars + '\n');

const getCoordsFunc = \
function getCanvasCoords(event) {
    if (!editorCanvas) return null;
    const rect = editorCanvas.getBoundingClientRect();
    const renderWidth = rect.width;
    const renderHeight = rect.height;
    const canvasAspect = editorCanvas.width / editorCanvas.height;
    const containerAspect = renderWidth / renderHeight;

    let actualWidth, actualHeight, offsetX, offsetY;
    if (containerAspect > canvasAspect) {
        actualHeight = renderHeight;
        actualWidth = renderHeight * canvasAspect;
        offsetX = (renderWidth - actualWidth) / 2;
        offsetY = 0;
    } else {
        actualWidth = renderWidth;
        actualHeight = renderWidth / canvasAspect;
        offsetX = 0;
        offsetY = (renderHeight - actualHeight) / 2;
    }

    const x_relative = event.clientX - rect.left - offsetX;
    const y_relative = event.clientY - rect.top - offsetY;

    const scale = editorCanvas.width / actualWidth;
    const x_canvas = x_relative * scale;
    const y_canvas = y_relative * scale;

    const exportScale = (currentGridSize.cols * TRACK_PART_SIZE_PX) / editorCanvas.width;
    const p_x = x_canvas * exportScale;
    const p_y = y_canvas * exportScale;

    return { x_canvas, y_canvas, p_x, p_y };
}
\;

code = code.replace("function onGridSingleClick(event) {", getCoordsFunc + "\nfunction onGridSingleClick(event) {");

// Now update the event listeners in initTrackEditor
const oldListeners = \    editorCanvas.addEventListener('click', (event) => {
        onGridSingleClick(event);
    });

    editorCanvas.addEventListener('dblclick', (event) => {
        onGridDoubleClick(event);
    });\;

const newListeners = \    editorCanvas.addEventListener('mousedown', (event) => {
        const coords = getCanvasCoords(event);
        if (!coords) return;
        const { p_x, p_y } = coords;
        
        dragMoved = false;
        
        let found = null;
        for(let i = interactiveElements.length-1; i>=0; i--) {
            let e = interactiveElements[i];
            if (p_x >= e.x && p_x <= e.x + e.width && p_y >= e.y && p_y <= e.y + e.height) {
                found = e; break;
            }
        }
        
        if (found && !currentToolMode) { // Solo arrastrar si no hay herramienta seleccionada
            isDraggingInteractive = true;
            draggedElement = found;
            selectedInteractiveElement = found;
            dragOffsetX = p_x - found.x;
            dragOffsetY = p_y - found.y;
            
            const elems = getDOMElements();
            if (elems) {
                 if (elems.intSettWidth) elems.intSettWidth.value = found.width;
                 if (elems.intSettLength) elems.intSettLength.value = found.height;
                 if (elems.intSettValue) elems.intSettValue.value = found.value || 0;
                 if (elems.intSettColor) elems.intSettColor.value = found.color || '#0000ff';
                 // Solo updateamos UI manual aquí, updateInteractiveUI no es estrictamente necesario o usar su tipo
                 updateInteractiveUI(null, elems);
            }
        }
    });

    editorCanvas.addEventListener('mousemove', (event) => {
        if (!isDraggingInteractive || !draggedElement) return;
        const coords = getCanvasCoords(event);
        if (!coords) return;
        
        draggedElement.x = coords.p_x - dragOffsetX;
        draggedElement.y = coords.p_y - dragOffsetY;
        dragMoved = true;
        
        renderEditor();
    });

    editorCanvas.addEventListener('mouseup', (event) => {
        isDraggingInteractive = false;
        draggedElement = null;
    });

    editorCanvas.addEventListener('mouseleave', (event) => {
        isDraggingInteractive = false;
        draggedElement = null;
    });

    editorCanvas.addEventListener('click', (event) => {
        if (dragMoved) {
            dragMoved = false;
            return; // Skip click logic if we just finished a drag
        }
        onGridSingleClick(event);
    });

    editorCanvas.addEventListener('dblclick', (event) => {
        onGridDoubleClick(event);
    });\;

code = code.replace(oldListeners, newListeners);

fs.writeFileSync('js/trackEditor.js', code);
console.log("Done");
