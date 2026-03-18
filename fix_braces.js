const fs = require('fs');
let code = fs.readFileSync('js/codeEditor.js', 'utf8');

// The file currently has:
//                          if (csType && csType.toLowerCase() === 'led' || csType === 'screen') {
//              }
//          }
//
//          const pwmValue = Math.max(-255, Math.min(255, Math.round(value)));

code = code.replace(
    /if \(csType && csType\.toLowerCase\(\) === 'led' \|\| csType === 'screen'\) \{\s*\}\s*\}/s,
    `if (csType && csType.toLowerCase() === 'led' || csType === 'screen') {
                            isLED = true;
                            ledKey = key;
                            break;
                        }
                    }
                }
            }

            if (!motorPins.includes(pin) && !isLED) {
                if (!_warnedPins.has(pin + "_not_motor")) {
                    ArduinoSerial.println(\`Advertencia: analogWrite(\${pin}) - El pin \${pin} no está conectado a ningún motor ni LED en el Editor de Robot. (Debug: pNum=\${pin} custSensors=\${JSON.stringify(sharedSimulationState.robot.customSensors)} isLED=\${isLED})\`);
                    _warnedPins.add(pin + "_not_motor");
                }
            }
        }`
);

fs.writeFileSync('js/codeEditor.js', code);
