const fs = require('fs');
let r = fs.readFileSync('js/robot.js', 'utf8');
r = r.replace(
    /ctx\.fill\(\);\s*ctx\.shadowBlur = 0; \/\/ reset\s*ctx\.strokeStyle = 'black';\s*ctx\.lineWidth = 1;\s*ctx\.stroke\(\);/,
    "ctx.fill(); ctx.shadowBlur = 0; ctx.strokeStyle = 'white'; ctx.lineWidth = 1; ctx.stroke();"
);
fs.writeFileSync('js/robot.js', r);
