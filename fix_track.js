const fs = require('fs');
let b = fs.readFileSync('js/trackEditor.js', 'utf8');
let target = b.substring(
    b.indexOf('let hs = 15 * (TRACK_PART_SIZE_PX / maxCell) / trackZoom;'),
    b.indexOf('let found = null;')
);

let repl = let hs = 15 * (TRACK_PART_SIZE_PX / maxCell) / trackZoom;

                // Rotation handle (Top center + offset)
                if (Math.hypot(lx, ly - (-el.height/2 - 25)) <= hs * 1.5) {
                    isDraggingInteractive = true;
                    draggedElement = el;
                    dragTransformMode = 'rotate';
                    startElemX = el.x; startElemY = el.y;
                    startElemW = el.width; startElemH = el.height;
                    startRotAngle = el.rotation || 0;
                    dragStartAngle = Math.atan2(p_y - cy, p_x - cx) * 180 / Math.PI;
                    return;
                }

                // Determine distance to each handle
                const handles = [
                    { mode: 'scale_tl', x: -el.width/2, y: -el.height/2 },
                    { mode: 'scale_tr', x:  el.width/2, y: -el.height/2 },
                    { mode: 'scale_bl', x: -el.width/2, y:  el.height/2 },
                    { mode: 'scale_br', x:  el.width/2, y:  el.height/2 },
                    { mode: 'scale_t',  x:  0,          y: -el.height/2 },
                    { mode: 'scale_b',  x:  0,          y:  el.height/2 },
                    { mode: 'scale_l',  x: -el.width/2, y:  0 },
                    { mode: 'scale_r',  x:  el.width/2, y:  0 }
                ];

                for (let handle of handles) {
                    if (Math.hypot(lx - handle.x, ly - handle.y) <= hs) {
                        isDraggingInteractive = true;
                        draggedElement = el;
                        dragTransformMode = handle.mode;
                        dragStartX = p_x; dragStartY = p_y;
                        startElemX = el.x; startElemY = el.y;
                        startElemW = el.width; startElemH = el.height;
                        return;
                    }
                }
            }

            ;

fs.writeFileSync('js/trackEditor.js', b.replace(target, repl));
