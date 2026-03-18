const fs = require('fs');
let text = fs.readFileSync('index.html', 'utf8');
text = text.replace(
    /<button id="toolModeMoveInt" style="flex:1; padding: 0.3em; font-size: 0.8em; border-radius: 4px;">Mover<\/button>/g,
    '<button id="toolModeMoveInt" style="flex:1; padding: 0.3em; font-size: 0.8em; border-radius: 4px;">Transformación</button>'
);
text = text.replace(
    /<button id="toolModeEraseInt" class="danger" style="flex:1; padding: 0.3em; font-size: 0.8em; border-radius: 4px;">Borrar<\/button>\s*<\/div>/g,
    '<button id="toolModeEraseInt" class="danger" style="flex:1; padding: 0.3em; font-size: 0.8em; border-radius: 4px;">Borrar</button>\n                        </div>\n                        <div style="display: flex; margin-top: 0.3em;">\n                            <button id="btnAddBorder" style="flex:1; padding: 0.4em; font-size: 0.8em; border-radius: 4px; background-color: var(--primary-color); color: white; border: none; cursor:pointer;">Agregar Borde Exterior</button>\n                        </div>'
);
fs.writeFileSync('index.html', text);
console.log('Fixed index.html');
