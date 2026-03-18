const fs = require('fs');
let c = fs.readFileSync('js/trackEditor.js', 'utf8');
c = c.replace(/const btnAddBorder = document\.getElementById\('btnAddBorder'\);[\s\S]*?const btnAddBorder = document\.getElementById\('btnAddBorder'\);/m, "const btnAddBorder = document.getElementById('btnAddBorder');");
fs.writeFileSync('js/trackEditor.js', c);
console.log('Fixed duplications.');
