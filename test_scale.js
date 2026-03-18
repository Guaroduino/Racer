const fs = require('fs');
let b = fs.readFileSync('js/trackEditor.js', 'utf8');
let start = b.indexOf(else if (dragTransformMode.startsWith('scale')) {);
let end = b.indexOf('if (dragMoved) {', start);
console.log(b.substring(start, end));
