const fs = require("fs");
let content = fs.readFileSync("index.html", "utf8");

// World boss skill card replace
content = content.replace(/<span class="text-\[10px\] font-bold font-mono text-white truncate">\$\{capitalizeFirstLetter\(s\.word\)\}<\/span>/g, `<span class="text-[10px] font-bold font-mono text-white truncate">\${capitalizeFirstLetter(s.word)}</span><span class="text-[8px] font-bold text-gray-400 shrink-0 ml-1">x\${getSkillMultiplier(s)}%</span>`);
content = content.replace(/justify-between h-12 min-w-0/g, "justify-between min-h-[52px] min-w-0");

// Smithy box overflow
content = content.replace(/p-3 rounded-none-forced flex flex-col justify-between min-h-\[135px\]/g, "p-3 rounded-none-forced flex flex-col justify-between min-h-[135px] overflow-hidden");

fs.writeFileSync("index.html", content, "utf8");

