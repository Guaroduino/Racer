// js/codeEditor.js


let userSetupFunction = () => { };
let userLoopFunction = async () => { };
let currentCodeType = 'onoff'; // Track the current code type

let sharedSimulationState = null; // To access robot sensors and track

// We will determine pins on the fly from sharedSimulationState.robot.geometry.connections
// but we need a way to track PWM states on any pin the user targets.
let _pinModes = {};
let _motorPWMValues = {}; // Will store whatever pins the user writes to
let _warnedPins = new Set(); // Track pins used without pinMode to warn once
let _simStartTime = 0; // Track simulation start time so millis() starts at 0

// NUEVO: Token para cancelar ejecuciones asíncronas flotantes al reiniciar
let currentSimToken = 0;

// Serial object for user code
const ArduinoSerial = {
    _buffer: "",
    _outputElements: [], // Will be set to the serialMonitorOutput pre elements
    _maxLines: 10, // Maximum number of lines to keep

    begin: function (baudRate) {
        this.println(`Serial communication started at ${baudRate} baud (simulated).`);
    },
    print: function (msg) {
        this._buffer += String(msg);
        this._trimBuffer();
        this._outputElements.forEach(el => {
            if (el) {
                el.textContent = this._buffer;
                el.scrollTop = el.scrollHeight; // Auto-scroll
            }
        });
    },
    println: function (msg = "") {
        this.print(String(msg) + '\n');
    },
    clear: function () {
        this._buffer = "";
        this._outputElements.forEach(el => {
            if (el) {
                el.textContent = "";
            }
        });
    },
    getOutput: function () { // For external UI update if needed
        return this._buffer;
    },
    _trimBuffer: function () {
        // Split into lines and keep only the last _maxLines
        const lines = this._buffer.split('\n');
        if (lines.length > this._maxLines) {
            this._buffer = lines.slice(-this._maxLines).join('\n');
        }
    }
};

// Helper: maps UI strings like "A0" to API integers etc.
const resolveUIPin = (uiVal) => {
    if (typeof uiVal === 'string' && uiVal.startsWith('A')) {
        const num = parseInt(uiVal.substring(1));
        return 14 + num; // Map A0-A5 to 14-19
    }
    return parseInt(uiVal);
};

// Arduino API shim for user code
const arduinoAPI = {
    pinMode: (pin, mode) => {
        _pinModes[pin] = mode;
        _warnedPins.delete(pin); // Reset warning if pin is now configured

        // Validate against Robot Editor connections if available
        if (sharedSimulationState && sharedSimulationState.robot && sharedSimulationState.robot.connections) {
            const conns = sharedSimulationState.robot.connections;
            const sensorPins = [];
            const ledPins = [];
            for (const [key, p] of Object.entries(conns.sensorPins)) {
                let pNum = resolveUIPin(p);
                if (!isNaN(pNum)) {
                    // Check if it's an LED
                    let isLED = false;
                    // ArduinoSerial.println(JSON.stringify(sharedSimulationState.robot.customSensors));
                    if (key.startsWith('custom_')) {
                        const idx = parseInt(key.replace('custom_', ''));
                        if (sharedSimulationState.robot.customSensors && sharedSimulationState.robot.customSensors[idx]) {
                            const csType = sharedSimulationState.robot.customSensors[idx].type;
                            if (csType && csType.toLowerCase() === 'led' || csType === 'screen') {
                                isLED = true;
                            }
                        }
                    }
                    if (isLED) {
                        ledPins.push(pNum);
                    } else {
                        sensorPins.push(pNum);
                    }
                }
            }
            const motorPins = Object.values(conns.motorPins).map(p => parseInt(p));

            if (sensorPins.includes(pin) && mode === arduinoAPI.OUTPUT) {
                ArduinoSerial.println(`Advertencia: Pin ${pin} es un SENSOR en el editor, pero lo declaraste como OUTPUT. (Debug: pNum=${pin} sensorPins=${JSON.stringify(sensorPins)} ledPins=${JSON.stringify(ledPins)} custSensors=${JSON.stringify(sharedSimulationState.robot.customSensors)} conns=${JSON.stringify(conns.sensorPins)})`);
            }
            if (ledPins.includes(pin) && mode === arduinoAPI.INPUT) {
                ArduinoSerial.println(`Advertencia: Pin ${pin} es un LED en el editor, pero lo declaraste como INPUT.`);
            }
            if (motorPins.includes(pin) && mode === arduinoAPI.INPUT) {
                ArduinoSerial.println(`Advertencia: Pin ${pin} es un MOTOR en el editor, pero lo declaraste como INPUT.`);
            }
        }
    },
    digitalRead: (pin) => {
        if (!sharedSimulationState || !sharedSimulationState.robot || !sharedSimulationState.robot.connections) return 1;

        const conns = sharedSimulationState.robot.connections.sensorPins;
        // The user code pin might be A2 (which equates to 2 due to injected constants)
        // We match `pin` to the mapped value of whatever the user typed in the UI

        if (_pinModes[pin] !== arduinoAPI.INPUT) {
            if (!_warnedPins.has(pin)) {
                ArduinoSerial.println(`Error: Pin ${pin} no configurado como INPUT. Usa pinMode(${pin}, INPUT) en setup().`);
                _warnedPins.add(pin);
            }
            return 0; // Default to 0 (off line) if not configured
        }

        // Validate if this pin is actually connected to a sensor in Robot Editor
        if (sharedSimulationState && sharedSimulationState.robot && sharedSimulationState.robot.connections) {
            const conns = sharedSimulationState.robot.connections.sensorPins;
            const sensorPins = Object.values(conns).map(p => {
                if (typeof p === 'string' && p.startsWith('A')) return 14 + parseInt(p.substring(1));
                return parseInt(p);
            });
            if (!sensorPins.includes(pin)) {
                if (!_warnedPins.has(pin + "_not_sensor")) {
                    ArduinoSerial.println(`Advertencia: digitalRead(${pin}) - El pin ${pin} no está conectado a ningún sensor en el Editor de Robot.`);
                    _warnedPins.add(pin + "_not_sensor");
                }
            }
        }

        let val = 0; // Default to 0 (off line)
        if (pin === resolveUIPin(conns.left)) val = sharedSimulationState.robot.sensors.left;
        else if (pin === resolveUIPin(conns.center)) val = sharedSimulationState.robot.sensors.center;
        else if (pin === resolveUIPin(conns.right)) val = sharedSimulationState.robot.sensors.right;
        else if (pin === resolveUIPin(conns.farLeft)) val = sharedSimulationState.robot.sensors.farLeft;
        else if (pin === resolveUIPin(conns.farRight)) val = sharedSimulationState.robot.sensors.farRight;
        else if (pin === resolveUIPin(conns.fullFarLeft)) val = sharedSimulationState.robot.sensors.fullFarLeft;
        else if (pin === resolveUIPin(conns.fullFarRight)) val = sharedSimulationState.robot.sensors.fullFarRight;
        else if (pin === resolveUIPin(conns.centerLeft)) val = sharedSimulationState.robot.sensors.centerLeft;
        else if (pin === resolveUIPin(conns.centerRight)) val = sharedSimulationState.robot.sensors.centerRight;

        // Dynamic mapped generic sensors and buttons
        for (const [connKey, connVal] of Object.entries(conns)) {
            if (connKey.startsWith('pinPanelBtn_')) {
                const btnIdx = connKey.replace('pinPanelBtn_', '');
                if (pin === resolveUIPin(connVal)) {
                    val = sharedSimulationState.robot.sensors[`btn_${btnIdx}`] || 0;
                }
            } else if (connKey.startsWith('custom_')) {
                if (pin === resolveUIPin(connVal)) {
                    val = sharedSimulationState.robot.sensors[connKey] || 0;
                }
            }
        }

        // Debug
        // ArduinoSerial.println(`digitalRead(${pin}) -> ${val} (left: ${resolveUIPin(conns.left)}, center: ${resolveUIPin(conns.center)}, right: ${resolveUIPin(conns.right)})`);

        return val;
    },
    // Add digitalWrite for completeness, as some use it for full forward/reverse on L298N
    digitalWrite: (pin, value) => {
        arduinoAPI.analogWrite(pin, value === arduinoAPI.HIGH ? 255 : 0);
    },
    analogWrite: (pin, value) => {
        if (_pinModes[pin] !== arduinoAPI.OUTPUT) {
            if (!_warnedPins.has(pin)) {
                ArduinoSerial.println(`Error: Pin ${pin} no configurado como OUTPUT. Usa pinMode(${pin}, OUTPUT) en setup().`);
                _warnedPins.add(pin);
            }
            return;
        }

        // Validate if this pin is actually connected to a motor or LED in Robot Editor
        let isLED = false;
        let ledKey = null;
        if (sharedSimulationState && sharedSimulationState.robot && sharedSimulationState.robot.connections) {
            const motorPins = Object.values(sharedSimulationState.robot.connections.motorPins)
                .filter(p => p !== 'VCC' && p !== 'GND')
                .map(p => parseInt(p));
            
            for (const [key, p] of Object.entries(sharedSimulationState.robot.connections.sensorPins)) {
                if (resolveUIPin(p) === pin && key.startsWith('custom_')) {
                    const idx = parseInt(key.replace('custom_', ''));
                    if (sharedSimulationState.robot.customSensors && sharedSimulationState.robot.customSensors[idx]) {
                        const csType = sharedSimulationState.robot.customSensors[idx].type;
                        if (csType && csType.toLowerCase() === 'led' || csType === 'screen') {
                            isLED = true;
                            ledKey = key;
                            break;
                        }
                    }
                }
            }

            if (!motorPins.includes(pin) && !isLED) {
                if (!_warnedPins.has(pin + "_not_motor")) {
                    ArduinoSerial.println(`Advertencia: analogWrite(${pin}) - El pin ${pin} no está conectado a ningún motor ni LED en el Editor de Robot. (Debug: pNum=${pin} custSensors=${JSON.stringify(sharedSimulationState.robot.customSensors)} isLED=${isLED})`);
                    _warnedPins.add(pin + "_not_motor");
                }
            }
        }

        const pwmValue = Math.max(-255, Math.min(255, Math.round(value)));

        // Update the tracked PWM for the specific pin dynamically
        _motorPWMValues[pin] = pwmValue;
        
        // If it's an LED, update its state immediately
        if (isLED && ledKey && sharedSimulationState.robot.sensors) {
            sharedSimulationState.robot.sensors[ledKey] = pwmValue > 0 ? 1 : 0;
        }

        if (sharedSimulationState && sharedSimulationState.robot && sharedSimulationState.robot.connections) {
            const conns = sharedSimulationState.robot.connections;

            let finalLeftPWM = 0;
            let finalRightPWM = 0;

            // Helper: resolves a raw pin value (number string, 'VCC', or 'GND') to its effective PWM value.
            // 'VCC' -> 255 (permanently HIGH), 'GND' -> 0 (permanently LOW), number -> stored _motorPWMValues.
            const getPinEffectiveValue = (rawPin) => {
                if (rawPin === 'VCC') return 255;
                if (rawPin === 'GND') return 0;
                const n = parseInt(rawPin);
                if (isNaN(n)) return 0;
                return _motorPWMValues[n] || 0;
            };

            if (conns.driverType === 'l298n') {
                const vIn1 = getPinEffectiveValue(conns.motorPins.leftIn1);
                const vIn2 = getPinEffectiveValue(conns.motorPins.leftIn2);
                const vEn = getPinEffectiveValue(conns.motorPins.leftEn);
                const vIn3 = getPinEffectiveValue(conns.motorPins.rightIn3);
                const vIn4 = getPinEffectiveValue(conns.motorPins.rightIn4);
                const vEnB = getPinEffectiveValue(conns.motorPins.rightEn);

                const diffL = vIn1 - vIn2;
                const diffR = vIn3 - vIn4;

                // Soporte para PWM tradicional en EN, o PWM inyectado en pines IN (ej. cuando EN está en VCC)
                finalLeftPWM = Math.round((vEn / 255) * diffL);
                finalRightPWM = Math.round((vEnB / 255) * diffR);

                // Debug logging to serial monitor
                // ArduinoSerial.println(`L298N Update | pin: ${pin} | vEn: ${vEn}, vIn1: ${vIn1}, vIn2: ${vIn2} | dirL: ${dirL} | finalLeft: ${finalLeftPWM}`);

            } else if (conns.driverType === 'mx1616') {
                finalLeftPWM = getPinEffectiveValue(conns.motorPins.leftIn1) - getPinEffectiveValue(conns.motorPins.leftIn2);
                finalRightPWM = getPinEffectiveValue(conns.motorPins.rightIn3) - getPinEffectiveValue(conns.motorPins.rightIn4);

            } else { // single, legacy, ESCs
                finalLeftPWM = getPinEffectiveValue(conns.motorPins.leftPWM);
                finalRightPWM = getPinEffectiveValue(conns.motorPins.rightPWM);
            }

            sharedSimulationState.robot.motorPWMSpeeds.left = finalLeftPWM;
            sharedSimulationState.robot.motorPWMSpeeds.right = finalRightPWM;
        }
    },
    delay: async (ms) => {
        const myToken = currentSimToken;
        return new Promise((resolve, reject) => {
            setTimeout(() => {
                // Si el token cambió, significa que el usuario clickó "Reiniciar"
                if (myToken === currentSimToken) {
                    resolve();
                } else {
                    reject(new Error("Abortado por reinicio"));
                }
            }, ms);
        });
    },
    Serial: ArduinoSerial,
    // Constants for user code (these are usually #defined in Arduino C++)
    HIGH: 1,
    LOW: 0,
    INPUT: "INPUT",
    OUTPUT: "OUTPUT",
    A0: 14, A1: 15, A2: 16, A3: 17, A4: 18, A5: 19, // Standard Arduino Uno mapping
    // Arduino math functions (global in C++, but need Math.* in JS)
    abs: (x) => Math.abs(x),
    min: (a, b) => Math.min(a, b),
    max: (a, b) => Math.max(a, b),
    sq: (x) => x * x,
    sqrt: (x) => Math.sqrt(x),
    pow: (base, exp) => Math.pow(base, exp),
    sin: (x) => Math.sin(x),
    cos: (x) => Math.cos(x),
    tan: (x) => Math.tan(x),
    floor: (x) => Math.floor(x),
    ceil: (x) => Math.ceil(x),
    round: (x) => Math.round(x),
    log: (x) => Math.log(x),
    constrain: (val, a, b) => Math.min(Math.max(val, a), b),
    map: (val, inMin, inMax, outMin, outMax) => (val - inMin) * (outMax - outMin) / (inMax - inMin) + outMin,
    millis: () => Math.floor(performance.now() - _simStartTime),
    micros: () => Math.floor((performance.now() - _simStartTime) * 1000),
    random: (minOrMax, max) => {
        if (max === undefined) return Math.floor(Math.random() * minOrMax);
        return Math.floor(Math.random() * (max - minOrMax)) + minOrMax;
    },
    // User code might also define their own constants like LEFT_SENSOR_PIN etc.
};

// Define the custom code template
const customCodeTemplate = `// Pines de Sensores (0 = LOW = Negro, 1 = HIGH = Blanco)
const SENSOR_IZQ = A2;
const SENSOR_CEN = A4;
const SENSOR_DER = A3;

// Pines L298N Motor Izquierdo
const IN1 = 11;
const IN2 = 9;
const ENA = 3;

// Pines L298N Motor Derecho
const IN3 = 10;
const IN4 = 6;
const ENB = 5;

// Velocidad base
const SPEED = 120;

void setup() {
    Serial.begin(9600);
    
    // Configurar Sensores
    pinMode(SENSOR_IZQ, INPUT);
    pinMode(SENSOR_CEN, INPUT);
    pinMode(SENSOR_DER, INPUT);

    // Configurar Motores
    pinMode(IN1, OUTPUT);
    pinMode(IN2, OUTPUT);
    pinMode(ENA, OUTPUT);
    pinMode(IN3, OUTPUT);
    pinMode(IN4, OUTPUT);
    pinMode(ENB, OUTPUT);
    
    Serial.println("Robot Line Follower Listo.");
}

void loop() {
    int izq = digitalRead(SENSOR_IZQ);
    int cen = digitalRead(SENSOR_CEN);
    int der = digitalRead(SENSOR_DER);
    
    // Activar potencia en ambos motores
    analogWrite(ENA, SPEED);
    analogWrite(ENB, SPEED);
    
    // LOGICA DE SEGUIDOR DE LINEA (0 = LOW = Negra)
    if (cen == LOW) {
        // El centro está en la línea: Avanzar
        digitalWrite(IN1, HIGH); digitalWrite(IN2, LOW);
        digitalWrite(IN3, HIGH); digitalWrite(IN4, LOW);
    }
    else if (izq == LOW) {
        // La línea está a la izquierda: Girar a la izquierda
        digitalWrite(IN1, LOW);  digitalWrite(IN2, HIGH); // Invierte rueda izquierda
        digitalWrite(IN3, HIGH); digitalWrite(IN4, LOW);  // Rueda derecha avanza
    }
    else if (der == LOW) {
        // La línea está a la derecha: Girar a la derecha
        digitalWrite(IN1, HIGH); digitalWrite(IN2, LOW);  // Rueda izquierda avanza
        digitalWrite(IN3, LOW);  digitalWrite(IN4, HIGH); // Invierte rueda derecha
    }
    else {
        // Si pierde la línea (todos en HIGH = Blanco), detenerse
        digitalWrite(IN1, LOW); digitalWrite(IN2, LOW);
        digitalWrite(IN3, LOW); digitalWrite(IN4, LOW);
    }
}`;
/**
 * Transpila código básico de Arduino (C++) a JavaScript asíncrono
 */
function traducirArduinoAJS(codigoArduino) {
    let jsCode = codigoArduino.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    const TYPES = [
        'unsigned\\s+long\\s+long', 'unsigned\\s+long', 'unsigned\\s+int',
        'unsigned\\s+short', 'unsigned\\s+char',
        'long\\s+long', 'long',
        'boolean', 'bool',
        'byte', 'word',
        'unsigned',
        'double', 'float',
        'short', 'int',
        'String', 'char',
    ].join('|');

    // Usamos \b en lugar de (?<!...) para máxima compatibilidad con iPads y navegadores
    const TYPE_RE = new RegExp(`\\b(?:${TYPES})\\b`, 'g');
    const CONST_RE = new RegExp(`\\bconst\\s+(?:${TYPES})\\b`, 'g');
    const FN_RE = new RegExp(`\\b(?:void|${TYPES})\\s+(\\w+)\\s*\\(([^)]*)\\)`, 'g');
    const FN_ARG_RE = new RegExp(`\\b(?:const\\s+)?(?:${TYPES})\\s+[*&]*\\s*(\\w+)`, 'g');

    // 1. Extraer nombres de todas las funciones definidas por el usuario
    const userFunctions = [];
    let match;
    // Reset lastIndex for safety
    FN_RE.lastIndex = 0;
    while ((match = FN_RE.exec(jsCode)) !== null) {
        userFunctions.push(match[1]);
    }

    // 2. Transpilación básica
    let transpiled = jsCode
        // #define MACRO valor  →  const MACRO = valor;
        .replace(/^#define\s+(\w+)\s+(.+)$/gm, (_, name, val) => `const ${name} = ${val.trim()};`)
        // Elimina directivas #include
        .replace(/#include\s*[<"].*?[>"]/g, '')
        // Elimina Serial.begin(...)
        .replace(/\bSerial\s*\.\s*begin\s*\([^)]*\)\s*;/g, '')
        // Transforma TODAS las definiciones de funciones a async
        .replace(FN_RE, (match, nombre, args) => {
            const argsLimpios = args.replace(FN_ARG_RE, '$1');
            return `async function ${nombre}(${argsLimpios})`;
        })
        // Convertir arrays C++ a JS: int arr[3] = {1, 2, 3}; -> let arr = [1, 2, 3];
        .replace(new RegExp(`(?:\\bconst\\s+)?\\b(?:${TYPES})\\s+(\\w+)\\s*\\[([^\\]]*)\\]\\s*=\\s*\\{([\\s\\S]*?)\\}\\s*;`, 'g'), "let $1 = [$3];")
        // Array sin inicializar: int arr[10]; -> let arr = new Array($2);
        .replace(new RegExp(`(?:\\bconst\\s+)?\\b(?:${TYPES})\\s+(\\w+)\\s*\\[([^\\]]*)\\]\\s*;`, 'g'), "let $1 = new Array($2);")
        // "const int" -> "const"
        .replace(CONST_RE, 'const')
        // "int" -> "let"
        .replace(TYPE_RE, 'let')
        // delay(X) -> await delay(X)
        .replace(/\bdelay\s*\(/g, 'await delay(')
        // MÁS SEGURO: Soporte para while(condicion); vacío
        .replace(/\b(while|for)\s*\(([\s\S]+?)\)\s*;/g, '$1 ($2) { await delay(1); }')
        // MÁS SEGURO: Inyectar await delay(1) en bucles while/for con llaves
        .replace(/\b(while|for)\s*\(([\s\S]+?)\)\s*\{/g, '$1 ($2) { await delay(1); ')
        // MÁS SEGURO: Inyectar un micro-delay al inicio del loop
        .replace(/\b(async\s+function\s+loop\s*\([^)]*\)\s*\{)/g, '$1\n    await delay(1);\n');

    // 3. Prefixing calls to user functions with await
    const allAsyncFns = [...new Set([...userFunctions, 'setup', 'loop'])];
    allAsyncFns.forEach(fnName => {
        // Buscamos el nombre de la función seguido de '('
        // Evitamos que esté precedido por 'async function ' o 'function '
        const callRE = new RegExp(`(?<!async\\s+function\\s+|function\\s+)\\b${fnName}\\s*\\(`, 'g');
        transpiled = transpiled.replace(callRE, (match) => {
            return `await ${fnName}(`;
        });
    });

    return transpiled;
}

function initCodeEditor(simulationState) {
    sharedSimulationState = simulationState; // Give API access to robot state
    const elems = getDOMElements();
    ArduinoSerial._outputElements = [elems.serialMonitorOutput, elems.serialMonitorOutputCodeEditor];

    elems.clearSerialButton.addEventListener('click', () => {
        ArduinoSerial.clear();
    });
    
    if (elems.clearSerialButtonCodeEditor) {
        elems.clearSerialButtonCodeEditor.addEventListener('click', () => {
            ArduinoSerial.clear();
        });
    }

    // Load initial code
    if (!window.monacoEditor) {
        console.error("Monaco Editor no está disponible");
        return false;
    }

    return loadUserCode(window.monacoEditor.getValue());
}

function loadUserCode(code) {
    currentSimToken++; // CLAVE: cancela cualquier delay() flotante de la ejecución anterior

    _simStartTime = performance.now(); // Reset millis() start time
    
    ArduinoSerial.clear(); // Clear serial on new code load
    _pinModes = {};
    _motorPWMValues = {}; // Reset fully
    _warnedPins = new Set(); // Reset warnings

    // --- Nivel 1: Verificador de Código Básico ---
    let basicErrors = false;

    // Verificar errores de sintaxis usando Web Worker de Monaco (si está disponible)
    if (typeof window !== 'undefined' && window.monacoEditor && window.monaco) {
        const model = window.monacoEditor.getModel();
        const markers = window.monaco.editor.getModelMarkers({ resource: model.uri });
        const hasSyntaxErrors = markers.some(marker => marker.severity === window.monaco.MarkerSeverity.Error);
        
        if (hasSyntaxErrors) {
            ArduinoSerial.println("❌ ERROR: El código contiene errores de sintaxis.");
            basicErrors = true;
        }
    }

    // Verificar si olvidaron void setup() o void loop()
    if (!/\bvoid\s+setup\s*\(\s*\)/.test(code)) {
        ArduinoSerial.println("❌ ERROR: Falta definir la función 'void setup()'.");
        basicErrors = true;
    }
    if (!/\bvoid\s+loop\s*\(\s*\)/.test(code)) {
        ArduinoSerial.println("❌ ERROR: Falta definir la función 'void loop()'.");
        basicErrors = true;
    }

    // Chequear errores comunes de mayúsculas/minúsculas (C++ es case-sensitive)
    const typos = [
        { regex: /\bPinMode\b/g, correct: "pinMode" },
        { regex: /\bdigitalwrite\b/g, correct: "digitalWrite" },
        { regex: /\banalogwrite\b/g, correct: "analogWrite" },
        { regex: /\bdigitalread\b/g, correct: "digitalRead" },
        { regex: /\banalogread\b/g, correct: "analogRead" },
        { regex: /\bserial\./g, correct: "Serial." }
    ];

    typos.forEach(typo => {
        if (typo.regex.test(code)) {
            ArduinoSerial.println(`❌ ERROR SINTAXIS: Se detectó una función mal escrita. Tal vez quisiste decir '${typo.correct}' (revisa mayúsculas/minúsculas).`);
            basicErrors = true;
        }
    });

    // Validar de forma sencilla que falten los punto y comas
    const lineasSueltas = code.split('\n');
    for (let i = 0; i < lineasSueltas.length; i++) {
        // Remover \r y espacios, luego quitar comentarios y limpiar de nuevo
        let originalLine = lineasSueltas[i].trim();
        let l = originalLine.replace(/\/\/.*$/, '').trim();
        
        // Ignorar líneas vacías, comentarios de bloque, macros y pragmas
        if (!l || l.startsWith('#') || l.startsWith('/*') || l.startsWith('*')) continue;
        
        // Si no termina en llaves, dos puntos (ej labels/switch), coma (argumentos multilínea), ni punto y coma
        if (!l.endsWith(';') && !l.endsWith('{') && !l.endsWith('}') && !l.endsWith(':') && !l.endsWith(',')) {
            // Ignorar directivas de control que pueden o no llevar llave en la misma línea
            if (l.match(/^(?:}?\s*(?:else\s+)?if|while|for|else)\b/)) continue;
            // Ignorar declaraciones de funciones (ej. void setup())
            if (l.match(/^(?:void|int|float|bool|String|long|unsigned)\s+\w+\s*\(.*?\)/)) continue;
            
            // Si la línea pasa los filtros anteriores y contiene caracteres típicos de comandos, asumimos que falta un ';'
            if (l.match(/[a-zA-Z0-9+\-*\/=]/)) {
                ArduinoSerial.println(`❌ ERROR SINTAXIS: Falta ';' al final de la línea ${i+1}: "${originalLine}"`);
                basicErrors = true;
            }
        }
    }

    if (basicErrors) {
        ArduinoSerial.println("⛔ Por favor, corrige los errores del código en el editor antes de continuar.");
        if (typeof alert !== 'undefined') {
            alert("Se encontraron errores básicos en tu código. Revisa el Monitor Serial para más detalles.");
        }
        userSetupFunction = () => { };
        userLoopFunction = async () => { await arduinoAPI.delay(100); };
        return false;
    }
    // ----------------------------------------------

    // Detectar el tipo de código (opcional, solo mantendremos 'onoff')
    currentCodeType = 'onoff';

    try {
        // C++ to JS Parser overrides (Transpilación de Arduino a JS asíncrono)
        let jsCode = traducirArduinoAJS(code);

        // Create a function scope for the user's code, injecting the Arduino API
        // The user code should define setup() and loop()
        // Agregamos "use strict" para evitar declaración implícita de variables y otros errores tolerados por JS
        const userScript = new Function(
            ...Object.keys(arduinoAPI), // Argument names for the API objects/functions
            `"use strict";\n` + jsCode + `\nreturn { setup: typeof setup !== 'undefined' ? setup : undefined, loop: typeof loop !== 'undefined' ? loop : undefined, constrain: typeof constrain !== 'undefined' ? constrain : undefined };`
        );

        // Call the created function, passing the actual API implementations
        const scriptExports = userScript(...Object.values(arduinoAPI));

        if (typeof scriptExports.setup !== 'function') {
            throw new Error("La función setup() no fue encontrada o no es una función.");
        }
        if (typeof scriptExports.loop !== 'function') {
            throw new Error("La función loop() no fue encontrada o no es una función.");
        }
        userSetupFunction = scriptExports.setup;
        userLoopFunction = scriptExports.loop;

        // If user defines constrain, use it. Otherwise, provide a default one.
        if (typeof scriptExports.constrain === 'function') {
            arduinoAPI.constrain = scriptExports.constrain;
        } else {
            arduinoAPI.constrain = (value, minVal, maxVal) => Math.min(Math.max(value, minVal), maxVal);
        }

        // Ya no mostramos el mensaje de éxito genérico por defecto para limpiar el inicio.

        return true;
    } catch (e) {
        console.error("Error procesando código de usuario:", e);
        ArduinoSerial.println("Error en el código de usuario: " + e.message + "\n" + (e.stack || ''));
        userSetupFunction = () => { ArduinoSerial.println("Error: setup() no pudo cargarse."); };
        userLoopFunction = async () => { ArduinoSerial.println("Error: loop() no pudo cargarse."); await arduinoAPI.delay(100); }; // Prevent fast error loop
        return false;
    }
}

async function executeUserSetup() {
    if (typeof userSetupFunction === 'function') {
        try {
            await userSetupFunction();
            ArduinoSerial.println("setup() ejecutado.");
        } catch (e) {
            // Ignorar el error si fue causado por darle al botón de reiniciar
            if (e.message !== "Abortado por reinicio") {
                console.error("Error ejecutando setup() del usuario:", e);
                ArduinoSerial.println("Error en setup(): " + e.message);
                throw e;
            }
        }
    }
}

async function executeUserLoop() {
    if (typeof userLoopFunction === 'function') {
        try {
            await userLoopFunction();
        } catch (e) {
            if (e.message !== "Abortado por reinicio") {
                console.error("Error ejecutando loop() del usuario:", e);
                ArduinoSerial.println("Error en loop(): " + e.message);
                throw e;
            }
        }
    }
}

// Allows main simulation to get the motor PWMs set by user's analogWrite
function getMotorPWMOutputs() {
    return {
        leftPWM: _motorPWMValues[SIM_MOTOR_LEFT_PWM_PIN],
        rightPWM: _motorPWMValues[SIM_MOTOR_RIGHT_PWM_PIN]
    };
}

function getSerialOutput() {
    return ArduinoSerial.getOutput();
}

function clearSerial() {
    ArduinoSerial.clear();
}

function getCurrentCodeType() {
    return currentCodeType;
}

// Cleanup unused event listener related to code template dropdown
if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        // Dropdown codeTemplate has been removed from index.html
    });
}