const fs = require('fs');
let code = fs.readFileSync('js/trackEditor.js', 'utf8');

if(!code.includes('let trackZoom = 1.0;')) {
    code = code.replace(
"let dragMoved = false;",
"let dragMoved = false;\nlet trackZoom = 1.0;\nlet trackPanX = 0;\nlet trackPanY = 0;\nlet isPanningTrack = false;\nlet trackPanStartX = 0;\nlet trackPanStartY = 0;"
    );
}

const renderEditorOld = 
    // Clear the canvas with white background
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, editorCanvas.width, editorCanvas.height);

    // Draw grid and track parts;

const renderEditorNew = 
    // Clear the canvas with white background
    ctx.save();
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, editorCanvas.width, editorCanvas.height);
    
    ctx.translate(trackPanX, trackPanY);
    ctx.scale(trackZoom, trackZoom);

    // Draw grid and track parts;

code = code.replace(renderEditorOld, renderEditorNew);

const renderEditorEndOld =
        ctx.fillText("No hay partes de pista en config.js", editorCanvas.width / 2, editorCanvas.height / 2);
    }
}

function getCanvasCoords(event) {;

const renderEditorEndNew =
        ctx.fillText("No hay partes de pista en config.js", editorCanvas.width / 2, editorCanvas.height / 2);
    }
    
    ctx.restore();
}

function getCanvasCoords(event) {;

code = code.replace(renderEditorEndOld, renderEditorEndNew);

const getCanvasCoordsOld = 
    const scale = editorCanvas.width / actualWidth;
    const x_canvas = x_relative * scale;
    const y_canvas = y_relative * scale;

    const exportScale = (currentGridSize.cols * TRACK_PART_SIZE_PX) / editorCanvas.width;
    const p_x = x_canvas * exportScale;
    const p_y = y_canvas * exportScale;

    return { x_canvas, y_canvas, p_x, p_y };
};

const getCanvasCoordsNew = 
    const scale = editorCanvas.width / actualWidth;
    let x_canvas = x_relative * scale;
    let y_canvas = y_relative * scale;
    
    x_canvas = (x_canvas - trackPanX) / trackZoom;
    y_canvas = (y_canvas - trackPanY) / trackZoom;

    const exportScale = (currentGridSize.cols * TRACK_PART_SIZE_PX) / editorCanvas.width;
    const p_x = x_canvas * exportScale;
    const p_y = y_canvas * exportScale;

    return { x_canvas, y_canvas, p_x, p_y };
};

code = code.replace(getCanvasCoordsOld, getCanvasCoordsNew);

fs.writeFileSync('js/trackEditor.js', code);
console.log('Done replacement');
