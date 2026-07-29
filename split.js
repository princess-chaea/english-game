const fs = require('fs');
const code = fs.readFileSync('js/main.js', 'utf8');

function extractBlock(keyword) {
    const idx = code.indexOf(keyword);
    if (idx === -1) return '';
    let openCount = 0;
    let endIdx = -1;
    let started = false;
    for (let i = idx; i < code.length; i++) {
        if (code[i] === '{') {
            openCount++;
            started = true;
        } else if (code[i] === '}') {
            openCount--;
        }
        if (started && openCount === 0) {
            endIdx = i + 1;
            break;
        }
    }
    if (endIdx !== -1) {
        return code.substring(idx, endIdx);
    }
    return '';
}

// Just checking if this works
console.log(extractBlock('function calculatePlayerCP(').length);
