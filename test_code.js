const fs = require('fs');

let jsCode = `
int vel = 100;
int velinv = 20;

void setup() {
  pinMode(5, OUTPUT);
  pinMode(6, OUTPUT);
  pinMode(9, OUTPUT);
  pinMode(10, OUTPUT);
  pinMode(2, INPUT);
  pinMode(3, INPUT);
  pinMode(4, INPUT);
  Serial.begin(9600);
}

void loop() {
if (digitalRead(3)) {
analogWrite(5, vel); analogWrite(6, 0);
analogWrite(9, vel); analogWrite(10, 0);
}
}
`;

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

    // Usamos \\b en lugar de (?<!...) para máxima compatibilidad con iPads y navegadores
    const TYPE_RE = new RegExp(\`\\\\b(?:$\{TYPES})\\\\b\`, 'g');
    const CONST_RE = new RegExp(\`\\\\bconst\\\\s+(?:$\{TYPES})\\\\b\`, 'g');
    const FN_RE = new RegExp(\`\\\\b(?:void|$\{TYPES})\\\\s+(\\\\w+)\\\\s*\\\\(([^)]*)\\\\)\`, 'g');
    const FN_ARG_RE = new RegExp(\`\\\\b(?:const\\\\s+)?(?:$\{TYPES})\\\\s+[*&]*\\\\s*(\\\\w+)\`, 'g');

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
        .replace(/^#define\\s+(\\w+)\\s+(.+)$/gm, (_, name, val) => \`const $\{name} = $\{val.trim()};\`)
        // Elimina directivas #include
        .replace(/#include\\s*[<"].*?[>"]/g, '')
        // Elimina Serial.begin(...)
        .replace(/\\bSerial\\s*\\.\\s*begin\\s*\\([^)]*\\)\\s*;/g, '')
        // Transforma TODAS las definiciones de funciones a async
        .replace(FN_RE, (match, nombre, args) => {
            const argsLimpios = args.replace(FN_ARG_RE, '$1');
            return \`async function $\{nombre}($\{argsLimpios})\`;
        })
        // "const int" -> "const"
        .replace(CONST_RE, 'const')
        // "int" -> "let"
        .replace(TYPE_RE, 'let')
        // delay(X) -> await delay(X)
        .replace(/\\bdelay\\s*\\(/g, 'await delay(')
        // MÁS SEGURO: Soporte para while(condicion); vacío
        .replace(/\b(while|for)\s*\(([\s\S]+?)\)\s*;/g, '$1 ($2) { await delay(1); }')
        // MÁS SEGURO: Inyectar await delay(1) en bucles while/for con llaves
        .replace(/\b(while|for)\s*\(([\s\S]+?)\)\s*\{/g, '$1 ($2) { await delay(1); ')
        // MÁS SEGURO: Inyectar un micro-delay al inicio del loop
        .replace(/\\b(async\\s+function\\s+loop\\s*\\([^)]*\\)\\s*\\{)/g, '$1\\n    await delay(1);\\n');

    // 3. Prefixing calls to user functions with await
    const allAsyncFns = [...new Set([...userFunctions, 'setup', 'loop'])];
    allAsyncFns.forEach(fnName => {
        // Buscamos el nombre de la función seguido de '('
        // Evitamos que esté precedido por 'async function ' o 'function '
        const callRE = new RegExp(\`(?<!async\\\\s+function\\\\s+|function\\\\s+)\\\\b$\{fnName}\\\\s*\\\\(\`, 'g');
        transpiled = transpiled.replace(callRE, (match) => {
            return \`await $\{fnName}(\`;
        });
    });

    return transpiled;
}

console.log(traducirArduinoAJS(jsCode));
