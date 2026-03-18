const fs = require('fs');
const path = 'js/trackEditor.js';
let c = fs.readFileSync(path, 'utf8');

const s1 = c.indexOf("editorCanvas.addEventListener('mousedown', (event) => {");
const e1 = "editorCanvas.addEventListener('mouseleave', (event) => {";
const endBlock = c.indexOf(e1);

if (s1 !== -1 && endBlock > s1) {
    const newMouse = `editorCanvas.addEventListener('mousedown', (event) => {
        const coords = getCanvasCoords(event);
        if (!coords) return;
        const { p_x, p_y } = coords;
        
        dragMoved = false;

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
                
                // We use TRACK_PART_SIZE_PX scale space, so handles are scaled there.
                // But the drawing size is scaled visually. The hitbox should be absolute in track space.
                const hs = 25; // 25 px radius for hitbox in track coordinate space
                
                // Rotation handle (Top center + offset)
                if (Math.abs(lx) <= hs && Math.abs(ly - (-el.height/2 - 50)) <= hs) {
                    isDraggingInteractive = true;
                    draggedElement = el;
                    dragTransformMode = 'rotate';
                    startElemX = el.x; startElemY = el.y;
                    startElemW = el.width; startElemH = el.height;
                    startRotAngle = el.rotation || 0;
                    dragStartAngle = Math.atan2(p_y - cy, p_x - cx) * 180 / Math.PI;
                    return;
                }
                
                // Scale handles (corners)
                if (Math.abs(lx - (-el.width/2)) <= hs && Math.abs(ly - (-el.height/2)) <= hs) { isDraggingInteractive = true; draggedElement = el; dragTransformMode = 'scale_tl'; dragStartX = p_x; dragStartY = p_y; startElemX = el.x; startElemY = el.y; startElemW = el.width; startElemH = el.height; return; }
                if (Math.abs(lx - (el.width/2)) <= hs && Math.abs(ly - (-el.height/2)) <= hs) { isDraggingInteractive = true; draggedElement = el; dragTransformMode = 'scale_tr'; dragStartX = p_x; dragStartY = p_y; startElemX = el.x; startElemY = el.y; startElemW = el.width; startElemH = el.height; return; }
                if (Math.abs(lx - (-el.width/2)) <= hs && Math.abs(ly - (el.height/2)) <= hs) { isDraggingInteractive = true; draggedElement = el; dragTransformMode = 'scale_bl'; dragStartX = p_x; dragStartY = p_y; startElemX = el.x; startElemY = el.y; startElemW = el.width; startElemH = el.height; return; }
                if (Math.abs(lx - (el.width/2)) <= hs && Math.abs(ly - (el.height/2)) <= hs) { isDraggingInteractive = true; draggedElement = el; dragTransformMode = 'scale_br'; dragStartX = p_x; dragStartY = p_y; startElemX = el.x; startElemY = el.y; startElemW = el.width; startElemH = el.height; return; }
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
                draggedElement = found;
                selectedInteractiveElement = found;
                dragOffsetX = p_x - found.x;
                dragOffsetY = p_y - found.y;
                startElemX = found.x; startElemY = found.y;
                startElemW = found.width; startElemH = found.height;
                
                const elems = getDOMElements();
                if (elems) {
                     if (elems.intSettWidth) elems.intSettWidth.value = Math.round(found.width);
                     if (elems.intSettLength) elems.intSettLength.value = Math.round(found.height);
                     if (elems.intSettValue) elems.intSettValue.value = found.value || 0;
                     if (elems.intSettColor) elems.intSettColor.value = found.color || '#0000ff';
                     if (elems.intSettRotation) elems.intSettRotation.value = found.rotation || 0;
                     updateInteractiveUI(found.type, elems);
                }
            } else {
                selectedInteractiveElement = null;
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
            let ldx = dx * Math.cos(angle) - dy * Math.sin(angle);
            let ldy = dx * Math.sin(angle) + dy * Math.cos(angle);
            
            let sW = startElemW;
            let sH = startElemH;
            
            if (dragTransformMode.includes('l')) { sW = startElemW - ldx * 2; } else { sW = startElemW + ldx * 2; }
            if (dragTransformMode.includes('t')) { sH = startElemH - ldy * 2; } else { sH = startElemH + ldy * 2; }
            
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
        dragTransformMode = '';
    });

    `;

    c = c.substring(0, s1) + newMouse + c.substring(endBlock);
    fs.writeFileSync(path, c);
    console.log('Update mouse 3 success');
} else {
    console.log('Not found');
}
