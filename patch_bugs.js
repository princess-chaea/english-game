const fs = require('fs');
const path = require('path');

// 1. PATCH vercel.json
const vercelPath = path.join(__dirname, 'vercel.json');
let vercelStr = fs.readFileSync(vercelPath, 'utf8');
const vercelJson = JSON.parse(vercelStr);
const rootRoute = vercelJson.headers.find(h => h.source === "/(.*)");
if (rootRoute) {
    if (!rootRoute.headers.find(h => h.key === "Cross-Origin-Opener-Policy")) {
        rootRoute.headers.push({
            "key": "Cross-Origin-Opener-Policy",
            "value": "same-origin-allow-popups"
        });
    }
}
fs.writeFileSync(vercelPath, JSON.stringify(vercelJson, null, 2), 'utf8');
console.log('✅ vercel.json patched for COOP');

// 2. PATCH index.html
const indexPath = path.join(__dirname, 'index.html');
let indexStr = fs.readFileSync(indexPath, 'utf8');

const wbOld = `document.getElementById("wbVictoryNoticeRank").innerText = myRank + "위";
                                document.getElementById("wbVictoryNoticeDmg").innerText = myDamage.toLocaleString() + " 피해";
                                document.getElementById("wbVictoryNoticePct").innerText = (sharePct * 100).toFixed(1) + "% 기여";
                                
                                let titleBadge = getsTitle ? "\\n🏆 [수호신] 칭호 획득!" : "";
                                let resultMsg = isVictory ? "🎉 월드보스 토벌 성공!" : "☠️ 월드보스 토벌 실패...";
                                document.getElementById("wbVictoryNoticeReward").innerText = \`\${resultMsg}\\n\\n🎁 보상: \${totalFp.toLocaleString()} FP\${titleBadge}\`;`;

const wbNew = `// Fix: IDs updated to match actual HTML template
                                document.getElementById("wbModalMyDamage").innerText = myDamage.toLocaleString() + " HP";
                                document.getElementById("wbModalMyShare").innerText = (sharePct * 100).toFixed(1) + "%";
                                let titleBadge = getsTitle ? " / [수호신]" : "";
                                document.getElementById("wbModalRewardSummary").innerText = \`+\${totalFp.toLocaleString()} FP\${titleBadge}\`;`;
if (indexStr.includes(wbOld)) {
    indexStr = indexStr.replace(wbOld, wbNew);
    console.log('✅ wbVictoryNotice IDs patched');
}

const nameOld = `showConfirm({
                        icon: "⚠️",
                        title: "닉네임 변경 확인",
                        message: "[" + newName.trim() + "] 으로 변경하시겠습니까?<br><span class='text-red-400'>500 FP 소모 후 게임이 재시작됩니다.</span>",
                        yesLabel: "✅ 변경",
                        noLabel: "🔙 취소",
                        onYes: async () => {`;

if (indexStr.includes(nameOld)) {
    indexStr = indexStr.replace(
        /showConfirm\(\{\s*icon:\s*"⚠️",\s*title:\s*"닉네임 변경 확인",\s*message:\s*"\[" \+ newName\.trim\(\) \+ "\] 으로 변경하시겠습니까\?<br><span class='text-red-400'>500 FP 소모 후 게임이 재시작됩니다\.<\/span>",\s*yesLabel:\s*"✅ 변경",\s*noLabel:\s*"🔙 취소",\s*onYes:\s*async \(\) => \{([\s\S]*?)showAlert\("닉네임 변경 중 오류가 발생했습니다\.", "❌", "변경 실패"\);\s*\}\s*\}\s*\}\);/,
        `showConfirm(
                        "[" + newName.trim() + "] 으로 변경하시겠습니까?<br><span class='text-red-400'>500 FP 소모 후 게임이 재시작됩니다.</span>",
                        async () => {$1showAlert("닉네임 변경 중 오류가 발생했습니다.", "❌", "변경 실패");
                            }
                        },
                        null,
                        { icon: "⚠️", title: "닉네임 변경 확인", yesLabel: "✅ 변경", noLabel: "🔙 취소" }
                    );`
    );
    console.log('✅ changeHeroName showConfirm patched');
}

const pinOld = `await window._fbUpdateDoc(window._fbDoc(window._fbDb, "users", currentUid), { password: newPin });
                        tempCredentials.password = newPin;`;
const pinNew = `await window._fbUpdateDoc(window._fbDoc(window._fbDb, "users", currentUid), { password: newPin });
                        tempCredentials.password = newPin;
                        gameState.password = newPin; // FIX: Sync to gameState so saveSessionToCloud doesn't overwrite it`;

if (indexStr.includes(pinOld)) {
    indexStr = indexStr.replace(pinOld, pinNew);
    console.log('✅ changePinCode gameState patched');
}

fs.writeFileSync(indexPath, indexStr, 'utf8');
console.log('✅ All patches completed');
