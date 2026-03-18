const fs = require('fs');

// Read trackEditor.js completely to see if it modifies interactiveElements somewhere weird
let code = fs.readFileSync('js/trackEditor.js', 'utf8');

let saveMatch = code.match(/function saveTrackDesign\(\) \{[\s\S]*?const jsonData = JSON\.stringify\(designData, null, 2\);/);
console.log(saveMatch ? "SAVE FOUND" : "SAVE NOT FOUND");
