const fs = require('fs');
let content = fs.readFileSync('index.html', 'utf8');

// Update placeholder
content = content.replace('placeholder="예: 하주초"', 'placeholder="학교 이름을 입력해주세요."');

// Update school name rendering logic
const newPrefixLogic = `let shortSchoolName = gameState.schoolName || "";
                if (shortSchoolName.endsWith("등학교")) {
                    shortSchoolName = shortSchoolName.replace("등학교", "");
                } else if (shortSchoolName.endsWith("학교")) {
                    shortSchoolName = shortSchoolName.replace("학교", "");
                }
                const schoolPrefix = shortSchoolName ? \`\${shortSchoolName} \` : "";`;

content = content.replace(/const schoolPrefix = gameState\.schoolName \? `\$\{gameState\.schoolName\} ` : "";/g, newPrefixLogic);

fs.writeFileSync('index.html', content);
