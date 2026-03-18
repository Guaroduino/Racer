import fs from 'fs';
import { loadUserCode } from './js/codeEditor.js';

let DEMO_CODE = `
int vel = 100;
int velinv = 20;

const int NUM_PARADAS = 3;
unsigned long tiemposParada[NUM_PARADAS] = {5000, 15000, 25000};
int dirGiros[NUM_GIROS] = {3, 1, 3};
int emptyArr[10];

void setup() {
  pinMode(5, 1); // OUTPUT is 1 usually or whatever, let's just make sure it parses
}

void loop() {
  analogWrite(5, vel);
}
`;

function test() {
    let jsCode = DEMO_CODE.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

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

    const TYPE_RE = new RegExp(`\\b(?:${TYPES})\\b`, 'g');
    const CONST_RE = new RegExp(`\\bconst\\s+(?:${TYPES})\\b`, 'g');
    const FN_RE = new RegExp(`\\b(?:void|${TYPES})\\s+(\\w+)\\s*\\(([^)]*)\\)`, 'g');
    const FN_ARG_RE = new RegExp(`\\b(?:const\\s+)?(?:${TYPES})\\s+[*&]*\\s*(\\w+)`, 'g');

    // 1. Extraer nombres
    const userFunctions = [];
    let match;
    FN_RE.lastIndex = 0;
    while ((match = FN_RE.exec(jsCode)) !== null) {
        userFunctions.push(match[1]);
    }

    let transpiled = jsCode
        .replace(/^#define\s+(\w+)\s+(.+)$/gm, (_, name, val) => `const ${name} = ${val.trim()};`)
        .replace(/#include\s*[<"].*?[>"]/g, '')
        .replace(/\bSerial\s*\.\s*begin\s*\([^)]*\)\s*;/g, '')
        .replace(FN_RE, (match, nombre, args) => {
            const argsLimpios = args.replace(FN_ARG_RE, '$1');
            return `async function ${nombre}(${argsLimpios})`;
        })
        .replace(new RegExp(`(?:\\bconst\\s+)?\\b(?:${TYPES})\\s+(\\w+)\\s*\\[([^\\]]*)\\]\\s*=\\s*\\{([^}]*)\\}\\s*;`, 'g'), "let $1 = [$3];")
        .replace(new RegExp(`(?:\\bconst\\s+)?\\b(?:${TYPES})\\s+(\\w+)\\s*\\[([^\\]]*)\\]\\s*;`, 'g'), "let $1 = new Array($2);")
        .replace(CONST_RE, 'const')
        .replace(TYPE_RE, 'let')
        .replace(/\bdelay\s*\(/g, 'await delay(')
        .replace(/\b(while|for)\s*\(([\s\S]+?)\)\s*;/g, '$1 ($2) { await delay(1); }')
        .replace(/\b(while|for)\s*\(([\s\S]+?)\)\s*\{/g, '$1 ($2) { await delay(1); ')
        .replace(/\b(async\s+function\s+loop\s*\([^)]*\)\s*\{)/g, '$1\n    await delay(1);\n');

    const allAsyncFns = [...new Set([...userFunctions, 'setup', 'loop'])];
    allAsyncFns.forEach(fnName => {
        const callRE = new RegExp(`(?<!async\\s+function\\s+|function\\s+)\\b${fnName}\\s*\\(`, 'g');
        transpiled = transpiled.replace(callRE, (match) => {
            return `await ${fnName}(`;
        });
    });

    console.log("Transpiled Code:\n", transpiled);
}

test();
