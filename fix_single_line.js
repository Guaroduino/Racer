const fs = require('fs');
let code = fs.readFileSync('js/trackEditor.js', 'utf8');
code = code.replace("if(ob) ob.style.boxShadow = ''; ob.style.backgroundColor = ''; ob.style.color = '';", "if (ob) { ob.style.boxShadow = ''; ob.style.backgroundColor = ''; ob.style.color = ''; }");
fs.writeFileSync('js/trackEditor.js', code);
