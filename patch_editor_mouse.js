const fs = require('fs');
const path = 'js/trackEditor.js';
let content = fs.readFileSync(path, 'utf8');

const regexMouse = /interactiveLayer\.addEventListener\('mousedown', \(e\) => \{[\s\S]*?\}\);\s*interactiveLayer\.addEventListener\('mousemove', \(e\) => \{[\s\S]*?\}\);\s*interactiveLayer\.addEventListener\('mouseup', \(\) => \{[\s\S]*?\}\);/;

const newMouse = `interactiveLayer.addEventListener('mousedown', (e) => {
        const rect = interactiveLayer.getBoundingClientRect();
        const p_x = (e.clientX - rect.left) / scaleRatio;
        const p_y = (e.clientY - rect.top) / scaleRatio;
        
        if (currentToolMode === 'delete') {
            for (let i = interactiveElements.length - 1; i >= 0; i--) {
                let el = interactiveElements[i];
                let cx = el.x + el.width / 2;
                let cy = el.y + el.height / 2;
                let dx = p_x - cx;
                let dy = p_y - cy;
                
                let angle = el.rotation ? -el.rotation * Math.PI / 180 : 0;
                let lx = dx * Math.cos(angle) - dy * Math.sin(angle);
                let ly = dx * Math.sin(angle) + dy * Math.cos(angle);
                
                if (lx >= -el.width / 2 && lx <= el.width / 2 && ly >= -el.height / 2 && ly <= el.height / 2) {
                    interactiveElements.splice(i, 1);
                    selectedInteractiveElement = null;
                    if (window.needsTrackExport) window.needsTrackExport();
                    drawAll();
                    break;
                }
            }
        } else if (currentToolMode === 'move') {
            if (selectedInteractiveElement) {
                let el = selectedInteractiveElement;
                let cx = el.x + el.width / 2;
                let cy = el.y + el.height / 2;
                let dx = p_x - cx;
                let dy = p_y - cy;
                
                let angle = el.rotation ? -el.rotation * Math.PI / 180 : 0;
                let lx = dx * Math.cos(angle) - dy * Math.sin(angle);
                let ly = dx * Math.sin(angle) + dy * Math.cos(angle);
                
                const hs = 8 / scaleRatio; 
                
                if (Math.abs(lx) <= hs && Math.abs(ly - (-el.height/2 - 25)) <= hs) {
                    isDraggingInteractive = true;
                    dragTransformMode = 'rotate';
                    startElemX = el.x; startElemY = el.y;
                    startElemW = el.width; startElemH = el.height;
                    startRotAngle = el.rotation || 0;
                    dragStartAngle = Math.atan2(p_y - cy, p_x - cx) * 180 / Math.PI;
                    return;
                }
                
                if (Math.abs(lx - (-el.width/2)) <= hs && Math.abs(ly - (-el.height/2)) <= hs) { isDraggingInteractive = true; dragTransformMode = 'scale_tl'; dragStartX = p_x; dragStartY = p_y; startElemX = el.x; startElemY = el.y; startElemW = el.width; startElemH = el.height; return; }
                if (Math.abs(lx - (el.width/2)) <= hs && Math.abs(ly - (-el.height/2)) <= hs) { isDraggingInteractive = true; dragTransformMode = 'scale_tr'; dragStartX = p_x; dragStartY = p_y; startElemX = el.x; startElemY = el.y; startElemW = el.width; startElemH = el.height; return; }
                if (Math.abs(lx - (-el.width/2)) <= hs && Math.abs(ly - (el.height/2)) <= hs) { isDraggingInteractive = true; dragTransformMode = 'scale_bl'; dragStartX = p_x; dragStartY = p_y; startElemX = el.x; startElemY = el.y; startElemW = el.width; startElemH = el.height; return; }
                if (Math.abs(lx - (el.width/2)) <= hs && Math.abs(ly - (el.height/2)) <= hs) { isDraggingInteractive = true; dragTransformMode = 'scale_br'; dragStartX = p_x; dragStartY = p_y; startElemX = el.x; startElemY = el.y; startElemW = el.width; startElemH = el.height; return; }
            }
            
            let found = null;
            for (let i = interactiveElements.length - 1; i >= 0; i--) {
                let el = interactiveElements[i];
                let cx = el.x + el.width / 2;
                let cy = el.y + el.height / 2;
                let dx = p_x - cx;
                let dy = p_y - cy;
                
                let angle = el.rotation ? -el.rotation * Math.PI / 180 : 0;
                let lx = dx * Math.cos(angle) - dy * Math.sin(angle);
                let ly = dx * Math.sin(angle) + dy * Math.cos(angle);
                
                if (lx >= -el.width / 2 && lx <= el.width / 2 && ly >= -el.height / 2 && ly <= el.height / 2) {
                    found = el;
                    break;
                }
            }
            
            if (found) {
                selectedInteractiveElement = found;
                isDraggingInteractive = true;
                dragTransformMode = 'move';
                dragOffsetX = p_x - found.x;
                dragOffsetY = p_y - found.y;
                startElemX = found.x; startElemY = found.y;
                startElemW = found.width; startElemH = found.height;
                updateInteractivePropertiesPanel();
            } else {
                selectedInteractiveElement = null;
                document.getElementById('interactiveProperties').classList.add('hidden');
            }
            drawAll();
            
        } else {
            const gridSize = 10;
            const cx = Math.floor(p_x / gridSize) * gridSize;
            const cy = Math.floor(p_y / gridSize) * gridSize;
            
            let w = 20, h = 20;
            if (currentToolMode === 'color') { w = 20; h = 20; }
            else if (currentToolMode === 'rfid') { w = 20; h = 20; }
            else if (currentToolMode === 'hopper') { w = 40; h = 40; }
            else if (currentToolMode === 'obstacle') { w = 60; h = 60; }
            
            const newEl = {
                id: Date.now(),
                type: currentToolMode,
                x: cx - w/2,
                y: cy - h/2,
                width: w,
                height: h,
                rotation: 0,
                color: currentToolMode === 'color' ? '#0000ff' : undefined,
                value: currentToolMode === 'rfid' ? 1 : undefined
            };
            interactiveElements.push(newEl);
            selectedInteractiveElement = newEl;
            currentToolMode = 'move';
            document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
            document.getElementById('toolModeMoveInt').classList.add('active');
            updateInteractivePropertiesPanel();
            if (window.needsTrackExport) window.needsTrackExport();
            drawAll();
        }
    });

    interactiveLayer.addEventListener('mousemove', (e) => {
        if (!isDraggingInteractive || !selectedInteractiveElement) return;
        const rect = interactiveLayer.getBoundingClientRect();
        let p_x = (e.clientX - rect.left) / scaleRatio;
        let p_y = (e.clientY - rect.top) / scaleRatio;
        
        let el = selectedInteractiveElement;
        
        if (dragTransformMode === 'move') {
            el.x = p_x - dragOffsetX;
            el.y = p_y - dragOffsetY;
        } else if (dragTransformMode === 'rotate') {
            let cx = el.x + el.width / 2;
            let cy = el.y + el.height / 2;
            let curAngle = Math.atan2(p_y - cy, p_x - cx) * 180 / Math.PI;
            let diff = curAngle - dragStartAngle;
            el.rotation = Math.round((startRotAngle + diff) / 1) * 1;
            if(document.getElementById('intPropRotation')) document.getElementById('intPropRotation').value = el.rotation;
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

            if (document.getElementById('intPropWidth')) document.getElementById('intPropWidth').value = Math.round(el.width);
            if (document.getElementById('intPropHeight')) document.getElementById('intPropHeight').value = Math.round(el.height);
        }

        drawAll();
        if (window.needsTrackExport) window.needsTrackExport();
    });

    interactiveLayer.addEventListener('mouseup', () => {
        isDraggingInteractive = false;
        dragTransformMode = '';
    });`;

if (content.match(regexMouse)) {
    content = content.replace(regexMouse, newMouse);
    fs.writeFileSync(path, content);
    console.log('Successfully updated mouse events');
} else {
    console.log('Could not find mouse regex to replace');
}
