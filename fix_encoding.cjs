const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src/components/games/escape/MapElements.tsx');
const buffer = fs.readFileSync(file);
let text = buffer.toString('utf16le');
if (text.indexOf('import React') === -1) {
  text = buffer.toString('utf8');
}
// Strip BOM if present
if (text.charCodeAt(0) === 0xFEFF) {
  text = text.slice(1);
}
fs.writeFileSync(file, text, 'utf8');
console.log('Fixed MapElements.tsx encoding.');
