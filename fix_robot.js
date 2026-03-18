const fs = require('fs');
let file = fs.readFileSync('js/robot.js', 'utf8');

file = file.replace(/ctx\.rect\(-rectHeight \/ 2, startY \+ i \* rectWidth - rectWidth \/ 2, rectHeight, rectWidth\);/g, 'ctx.arc(0, startY + i * rectWidth, sensorRadiusPx, 0, 2 * Math.PI);');
file = file.replace(/ctx\.lineTo\(sensorRadiusPx \* 3, 0\); \/\/ Give it a visible length/g, 'ctx.lineTo(sensorRadiusPx * 9, 0); // Give it a visible length');
file = file.replace(/let tofAngle = 0;/g, 'let tofAngle = 0;\n              let isLED = false;\n              let ledColor = \'#ff0000\';');

let ledIfStr = \if (cSens.type === 'tof') {
                          isToF = true;
                          tofIdx = idx;
                          tofAngle = cSens.angle || 0;

                          // Invert the angle display if this is the symmetric twin, mirroring the math in robotEditor.js
                          if (key.endsWith('_sym')) {
                              tofAngle = -tofAngle;
                          }
                      }
                      if (cSens.type === 'led') {
                          isLED = true;
                          ledColor = cSens.color || '#ff0000';
                      }\;

file = file.replace(/if \\(cSens\\.type === 'tof'\\) \\{[\\s\\S]*?if \\(key\\.endsWith\\('_sym'\\)\\) \\{\\s*tofAngle = -tofAngle;\\s*\\}\\s*\\}/g, ledIfStr);

let ledElseIfStr = \} else if (isLED) {
                  ctx.beginPath();
                  ctx.arc(0, 0, sensorRadiusPx, 0, 2 * Math.PI);
                  if (isOnLine) {
                      ctx.fillStyle = ledColor;
                      ctx.shadowBlur = 10;
                      ctx.shadowColor = ledColor;
                  } else {
                      let r = parseInt(ledColor.slice(1,3), 16) || 0;
                      let g = parseInt(ledColor.slice(3,5), 16) || 0;
                      let b = parseInt(ledColor.slice(5,7), 16) || 0;
                      let avg = (r + g + b) / 3;
                      r = Math.floor(r * 0.3 + avg * 0.2);
                      g = Math.floor(g * 0.3 + avg * 0.2);
                      b = Math.floor(b * 0.3 + avg * 0.2);
                      ctx.fillStyle = \\\gb(\\\,\\\,\\\)\\\;
                  }
                  ctx.fill();
                  ctx.shadowBlur = 0; // reset
                  ctx.strokeStyle = 'black';
                  ctx.lineWidth = 1;
                  ctx.stroke();
              } else {\;

// Fix missing braces or regex escapes
file = file.replace(/\} else \{\s*ctx\.beginPath\(\);\s*ctx\.arc\(0, 0, sensorRadiusPx, 0, 2 \* Math\.PI\);\s*ctx\.fillStyle = isOnLine \? 'lime' : 'gray';/g, ledElseIfStr + '\n                  ctx.beginPath();\n                  ctx.arc(0, 0, sensorRadiusPx, 0, 2 * Math.PI);\n                  ctx.fillStyle = isOnLine ? \\\'lime\\\' : \\\'gray\\\';');

fs.writeFileSync('js/robot.js', file);
console.log('Done!');
