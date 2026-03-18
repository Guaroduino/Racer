const fs = require('fs');

const content = fs.readFileSync('index.html', 'utf8');
const tags = [];
const regex = /<\/?([a-zA-Z0-9]+)[^>]*>/g;
let match;
while ((match = regex.exec(content)) !== null) {
  const isVoid = /<[a-zA-Z0-9]+\s*[^>]*\/>/.test(match[0]) || ['img', 'input', 'br', 'hr', 'meta', 'link'].includes(match[1].toLowerCase());
  
  if (isVoid) continue;
  
  if (match[0].startsWith('</')) {
    if (tags.length > 0 && tags[tags.length - 1] === match[1].toLowerCase()) {
      tags.pop();
    } else {
        console.log("Unmatched closing tag:", match[0], "at index", match.index, "Expected:", tags[tags.length-1]);
    }
  } else {
    tags.push(match[1].toLowerCase());
  }
}
console.log("Remaining open tags:", tags);
