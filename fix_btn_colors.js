const fs = require('fs');
const path = 'js/trackEditor.js';
let c = fs.readFileSync(path, 'utf8');

c = c.replace(
    "ob.style.boxShadow = '';",
    "ob.style.boxShadow = ''; ob.style.backgroundColor = ''; ob.style.color = '';"
);

c = c.replace(
    "btn.style.boxShadow = '0 0 0 2px var(--primary-color) inset';",
    "btn.style.boxShadow = '0 0 0 2px var(--primary-color) inset'; btn.style.backgroundColor = 'var(--primary-color)'; btn.style.color = 'white';"
);

fs.writeFileSync(path, c);
console.log('Button colors updated!');
