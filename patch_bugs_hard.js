const fs = require('fs');
const path = require('path');
const indexPath = path.join(__dirname, 'index.html');
const lines = fs.readFileSync(indexPath, 'utf8').split('\n');

for (let i = 0; i < lines.length; i++) {
    // 1. WB Modal DOM Bug
    if (lines[i].includes('document.getElementById("wbVictoryNoticeRank")')) {
        lines[i] = '                                document.getElementById("wbModalMyDamage").innerText = myDamage.toLocaleString() + " HP";';
        lines[i+1] = '                                document.getElementById("wbModalMyShare").innerText = (sharePct * 100).toFixed(1) + "%";';
        lines[i+2] = '                                let titleBadge = getsTitle ? " / [수호신]" : "";';
        lines[i+3] = '                                document.getElementById("wbModalRewardSummary").innerText = `+${totalFp.toLocaleString()} FP${titleBadge}`;';
        lines[i+4] = '';
        lines[i+5] = '';
    }

    // 2. changeHeroName Bug
    if (lines[i].includes('title: "닉네임 변경 확인",') && lines[i-1].includes('icon: "⚠️"')) {
        lines[i-2] = '                    showConfirm(';
        lines[i-1] = '                        "[" + newName.trim() + "] 으로 변경하시겠습니까?<br><span class=\\'text-red-400\\'>500 FP 소모 후 게임이 재시작됩니다.</span>",';
        lines[i] = '                        async () => {';
        lines[i+1] = '';
        lines[i+2] = '';
        lines[i+3] = '';
        // Need to find where the `onYes: async () => {` block ends to add the opts parameter
        let j = i + 4;
        let braceCount = 1;
        while (j < lines.length && braceCount > 0) {
            if (lines[j].includes('{')) braceCount++;
            if (lines[j].includes('}')) braceCount--;
            j++;
        }
        // At j-1, we have the closing brace for onYes
        lines[j-1] = lines[j-1].replace('}', '},');
        lines.splice(j, 0, '                        null,');
        lines.splice(j+1, 0, '                        { icon: "⚠️", title: "닉네임 변경 확인", yesLabel: "✅ 변경", noLabel: "🔙 취소" }');
    }

    // 3. changePinCode Bug
    if (lines[i].includes('tempCredentials.password = newPin;')) {
        if (!lines[i+1].includes('gameState.password = newPin;')) {
            lines.splice(i+1, 0, '                        gameState.password = newPin;');
        }
    }
}

fs.writeFileSync(indexPath, lines.join('\n'), 'utf8');
console.log('✅ Hard patch done');
