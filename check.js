const fs = require('fs');
let code = fs.readFileSync('js/codeEditor.js', 'utf8');
code = code.replace(/import.*?['"].*?['"];?/g, '');
code = code.replace(/export\s+/g, '');
fs.writeFileSync('temp.js', code);
