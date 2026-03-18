const fs = require('fs');
let code = fs.readFileSync('index.html', 'utf8');

const badBlock = 
                        <div style="display: flex; margin-top: 0.3em;">
                            <button id="btnAddBorder" style="flex:1; padding: 0.4em; font-size: 0.8em; border-radius: 4px; background-color: var(--primary-color); color: white; border: none; cursor:pointer;">Agregar Borde Exterior</button>
                        </div>
                        <div style="display: flex; margin-top: 0.3em;">
                            <button id="btnAddBorder" style="flex:1; padding: 0.4em; font-size: 0.8em; border-radius: 4px; background-color: var(--primary-color); color: white; border: none; cursor:pointer;">Agregar Borde Exterior</button>
                        </div>
;

const goodBlock = 
                        <div style="display: flex; margin-top: 0.3em;">
                            <button id="btnAddBorder" style="flex:1; padding: 0.4em; font-size: 0.8em; border-radius: 4px; background-color: var(--primary-color); color: white; border: none; cursor:pointer;">Agregar Borde Exterior</button>
                        </div>
;

code = code.replace(badBlock.trim(), goodBlock.trim());
fs.writeFileSync('index.html', code);
