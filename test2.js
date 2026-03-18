const code = `
let a = 1;
function setup() { console.log(a); }
async function loop() { console.log(a+1); }
return { setup: typeof setup !== 'undefined' ? setup : undefined, loop: typeof loop !== 'undefined' ? loop : undefined };
`;
try {
    let fn = new Function(code);
    let exports = fn();
    console.log(exports);
    exports.setup();
    exports.loop();
} catch (e) {
    console.log("Error:", e);
}
