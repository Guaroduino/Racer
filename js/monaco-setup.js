// Esquemas de código
const codeTemplates = {
        simpleOnOff: `#include <SPI.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <Adafruit_VL53L0X.h>

// ====================================================================
// 1. CONFIGURACION Y PINES (MOTORES)
// ====================================================================
const int IN1 = 5;
const int IN2 = 6;
const int IN3 = 7;
const int IN4 = 8;

Adafruit_SSD1306 pantalla(128, 64, &Wire, -1);

// ====================================================================
// 2. OBJETOS Y DIRECCIONES TOF
// ====================================================================
Adafruit_VL53L0X tof_Frente   = Adafruit_VL53L0X(); // Adelante (0x29)
Adafruit_VL53L0X tof_DelDer   = Adafruit_VL53L0X(); // Delantero Derecho (0x2B)
Adafruit_VL53L0X tof_DelIzq   = Adafruit_VL53L0X(); // Delantero Izq (0x2D)

// ====================================================================
// 3. PARAMETROS DEL NAVEGADOR MATEMATICO (PISTA 200mm)
// ====================================================================
int velocidadMaxima = 170;
float Kp = 0.8;
float Kd = 1.2;
int maxGiro = 65;

int ultimoError = 0;
unsigned long timerPantalla = 0;

// ====================================================================
// 4. FUNCIONES DE TRACCION
// ====================================================================
void aplicarMotores(int vL, int vR) {
    if (vL >= 0) { analogWrite(IN1, vL); analogWrite(IN2, 0); }
    else { analogWrite(IN1, 0); analogWrite(IN2, -vL); }

    if (vR >= 0) { analogWrite(IN3, vR); analogWrite(IN4, 0); }
    else { analogWrite(IN3, 0); analogWrite(IN4, -vR); }
}

// ====================================================================
// 5. INICIALIZACION
// ====================================================================
void setup() {
    pinMode(IN1, OUTPUT); pinMode(IN2, OUTPUT);
    pinMode(IN3, OUTPUT); pinMode(IN4, OUTPUT);

    Serial.begin(9600);
    Wire.begin();
    pantalla.begin(SSD1306_SWITCHCAPVCC, 0x3C);

    pantalla.clearDisplay();
    pantalla.setCursor(0, 0);
    pantalla.println("PISTA 200 mm");
    pantalla.println("MIN TOF: 50 mm");
    pantalla.display();

    if(!tof_Frente.begin(0x29)) Serial.println("Error ToF Frente");
    if(!tof_DelDer.begin(0x2B)) Serial.println("Error ToF DelDer");
    if(!tof_DelIzq.begin(0x2D)) Serial.println("Error ToF DelIzq");

    delay(1000);
}

// ====================================================================
// 6. BUCLE PRINCIPAL (CINEMATICA DIFERENCIAL)
// ====================================================================
void loop() {
    delay(30);
    // 1. Leer el entorno
    int distFrente = tof_Frente.readRange();
    int distDer = tof_DelDer.readRange();
    int distIzq = tof_DelIzq.readRange();

    // ------------------------------------------------------------------
    // FILTRADO DE RUIDO Y ZONA CIEGA (50 mm)
    // ------------------------------------------------------------------
    // Si da error (0) o entra en la zona ciega (< 50), lo "chocamos" virtualmente a 50mm
    if (distFrente < 30) distFrente = 30;
    if (distFrente > 800) distFrente = 800;

    if (distDer < 30) distDer = 30;
    if (distDer > 200) distDer = 200;

    if (distIzq < 30) distIzq = 30;
    if (distIzq > 200) distIzq = 200;

    // ------------------------------------------------------------------
    // A. CALCULAR VELOCIDAD LINEAL (AVANCE)
    // ------------------------------------------------------------------
    int vAvance = velocidadMaxima;
    // Frena cuando la pared esta a menos de 180mm
    if (distFrente < 180) {
        // Ahora el mapa termina en 50mm. Si esta a 50mm o menos, vAvance sera 0.
        vAvance = map(distFrente, 50, 180, 0, velocidadMaxima);
        vAvance = constrain(vAvance, 0, velocidadMaxima);
    }

    // ------------------------------------------------------------------
    // B. CALCULAR VELOCIDAD ANGULAR (GIRO CON PD)
    // ------------------------------------------------------------------
    int error = distDer - distIzq;
    float proporcion = error * Kp;
    float derivada = (error - ultimoError) * Kd;
    int correccionGiro = (int)(proporcion + derivada);
    ultimoError = error;

    correccionGiro = constrain(correccionGiro, -maxGiro, maxGiro);

    // ------------------------------------------------------------------
    // C. MEZCLA CINEMATICA (BLENDING)
    // ------------------------------------------------------------------
    int vIzq = vAvance + correccionGiro;
    int vDer = vAvance - correccionGiro;

    vIzq = constrain(vIzq, -30, 150);
    vDer = constrain(vDer, -30, 150);

    aplicarMotores(vIzq, vDer);

    actualizarPantallaDinamica(distFrente, error, vAvance, vIzq, vDer);
}

// ====================================================================
// 7. FUNCIONES DE PANTALLA
// ====================================================================
void actualizarPantallaDinamica(int f, int err, int vAv, int vI, int vD) {
    if (millis() - timerPantalla > 150) {
        timerPantalla = millis();
        pantalla.clearDisplay();
        pantalla.setCursor(0, 0);
        pantalla.println("= 200mm TRACK =");
        pantalla.print("Frente: "); pantalla.print(f); pantalla.println(" mm");
        pantalla.print("V.Avance: "); pantalla.println(vAv);

        pantalla.println("-------------");
        pantalla.print("M.Izq: "); pantalla.print(vI);
        pantalla.print(" | M.Der: "); pantalla.println(vD);
        pantalla.display();
    }
}`
};

// Textos explicativos para cada plantilla
const codeExplanations = {
    simpleOnOff: `🌟 <b>Nuevo Proyecto</b>\n\nEste es un lienzo en blanco para tu código de Arduino. \n\n<b>Pasos recomendados:</b>\n1. Configura tus pines en <code>setup()</code> usando <code>pinMode()</code>.\n2. Escribe tu lógica de control en <code>loop()</code>.\n3. Consulta la <b>Guía del Editor</b> de abajo para ver los pines según tu robot.`
};

// Initialize Monaco Editor
require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.47.0/min/vs' } });

let editor = null;

require(['vs/editor/editor.main'], function () {
    editor = monaco.editor.create(document.getElementById('monacoContainer'), {
        value: codeTemplates.simpleOnOff, // Start with the single default template
        language: 'cpp', // Use C++ for basic syntax highlighting and native brace matching
        theme: 'vs',
        minimap: {
            enabled: false
        },
        automaticLayout: true,
        fontSize: 14,
        lineNumbers: 'on',
        scrollBeyondLastLine: false,
        roundedSelection: false,
        readOnly: false,
        cursorStyle: 'line',
        selectOnLineNumbers: true,
        contextmenu: true,
        quickSuggestions: true,
        wordWrap: 'on'
    });

    // Make the editor instance available globally
    window.monacoEditor = editor;

    window.monacoEditor = editor;
});

// --- Descargar y cargar código desde archivo ---
document.getElementById('downloadCodeButton').addEventListener('click', function () {
    let code = '';
    if (window.monacoEditor && typeof window.monacoEditor.getValue === 'function') {
        code = window.monacoEditor.getValue();
    } else if (window.editor && typeof window.editor.getValue === 'function') {
        code = window.editor.getValue();
    }
    if (!code) return;
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'codigo_robot.txt';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 100);
});

document.getElementById('uploadCodeInput').addEventListener('change', function (e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (evt) {
        // Cambia el dropdown a 'custom' antes de cargar el código
        const templateSelect = document.getElementById('codeTemplate');
        if (templateSelect) templateSelect.value = 'custom';
        // Si hay un evento de cambio, disparemoslo para que el editor se actualice si es necesario
        if (templateSelect) {
            const event = new Event('change', { bubbles: true });
            templateSelect.dispatchEvent(event);
        }
        // Espera un pequeño tiempo para asegurar que el editor esté en modo custom
        setTimeout(function () {
            if (window.editor && typeof window.editor.setValue === 'function') {
                window.editor.setValue(evt.target.result);
            } else if (typeof editor !== 'undefined' && typeof editor.setValue === 'function') {
                editor.setValue(evt.target.result);
            }
        }, 100);
    };
    reader.readAsText(file);
});

async function loadExampleCode(options = {}) {
    const { silent = false } = options;
    try {
        const response = await fetch('assets/robots/Codigo_Ejemplo.txt');
        if (!response.ok) throw new Error('No se pudo cargar Codigo_Ejemplo.txt');
        const text = await response.text();

        const targetEditor = window.monacoEditor || editor || window.editor;
        if (targetEditor && typeof targetEditor.setValue === 'function') {
            targetEditor.setValue(text);
            return true;
        }

        throw new Error('Editor Monaco no disponible para cargar ejemplo.');
    } catch (err) {
        console.error(err);
        if (!silent) {
            alert('Error al cargar el código de ejemplo.');
        }
        return false;
    }
}

window.loadExampleCode = loadExampleCode;

// --- Cargar código de ejemplo ---
document.getElementById('loadExampleCodeButton').addEventListener('click', async function () {
    await loadExampleCode({ silent: false });
});

// Handle window resize
window.addEventListener('resize', function () {
    if (editor) {
        editor.layout();
    }
});