const fs = require('fs');
let code = fs.readFileSync('js/main.js', 'utf8');

const regexState = /let gameState = \{[\s\S]*?function initGameState\(\) \{[\s\S]*?\}/;
const match = code.match(regexState);
if (match) {
    fs.writeFileSync('js/gameState.js', match[0]);
    code = code.replace(match[0], '');
    fs.writeFileSync('js/main.js', code);
    console.log('gameState extracted');
}
