const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');
const scripts = [...html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/gi)];
const main = scripts.find(s => s[1].includes('let gameState ='));
if (main) {
    fs.writeFileSync('js/main.js', main[1]);
    html = html.replace(main[0], '<script src="js/main.js"></script>');
    fs.writeFileSync('index.html', html);
    console.log('Successfully extracted js/main.js');
}
