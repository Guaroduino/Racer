const TYPES = ['int', 'unsigned long', 'float', 'double', 'char', 'String'].join('|');
let jsCode = \
const int NUM_PARADAS = 3;
unsigned long tiemposParada[NUM_PARADAS] = {5000, 15000, 25000};
int dirGiros[NUM_GIROS] = {3, 1, 3};
int emptyArr[10];
\;

let transpiled = jsCode
    .replace(new RegExp(\(?:\\\\bconst\\\\s+)?\\\\b(?:\)\\\\s+(\\\\w+)\\\\s*\\\\[([^\\]]*)\\\\]\\\\s*=\\\\s*\\\\{([^}]*)\\\\}\\\\s*;\, 'g'), "let \ = [\];")
    .replace(new RegExp(\(?:\\\\bconst\\\\s+)?\\\\b(?:\)\\\\s+(\\\\w+)\\\\s*\\\\[([^\\]]*)\\\\]\\\\s*;\, 'g'), "let \ = new Array(\);")
    
console.log(transpiled);
