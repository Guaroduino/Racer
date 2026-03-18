let code = "while(digitalRead(S_CEN) == LOW);";
let code2 = "while(digitalRead(S_CEN) == LOW) {";

let transpiled1 = code.replace(/\b(while|for)\s*\(([\s\S]+?)\)\s*;/g, '$1 ($2) { await delay(1); }');
let transpiled2 = code2.replace(/\b(while|for)\s*\(([\s\S]+?)\)\s*\{/g, '$1 ($2) { await delay(1); ');

console.log(transpiled1);
console.log(transpiled2);