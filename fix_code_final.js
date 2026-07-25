const fs = require("fs");
let content = fs.readFileSync("index.html", "utf8");

// 1. Manual Text Fix
const oldManualStart = "<span>스테이지를 등반할수록 <b>장신구(목걸이/팔찌/반지)</b>가 점차 해금되며, 모은 보스 증표로 <b>고대 유물</b>을 소환할 수 있습니다! (40 Stage <b>잠재력 연구소</b> 해금)</span>";
const newManual = `<div class="flex flex-col gap-0.5">
                                            <span>스테이지를 등반할수록 다음과 같이 콘텐츠가 점차 해금됩니다.</span>
                                            <span class="text-[10px] text-gray-400">? 30스테이지: <b>고대 유물 소환 제단</b> 해금 (보스 증표 사용)</span>
                                            <span class="text-[10px] text-gray-400">? 40스테이지: <b>무구 잠재력 연구소</b> 해금</span>
                                            <span class="text-[10px] text-gray-400">? 50스테이지: <b>지혜의 목걸이</b> 연마 해금</span>
                                            <span class="text-[10px] text-gray-400">? 60스테이지: <b>투지의 팔찌</b> 연마 해금</span>
                                            <span class="text-[10px] text-gray-400">? 70스테이지: <b>영웅의 반지</b> 연마 해금</span>
                                        </div>`;
content = content.replace(oldManualStart, newManual);

// 2. World Boss Skill Multiplier Fix
const oldSkillPreview = `<div class="p-1.5 border-2 \${gradeInfo.colorClass} flex flex-col justify-between h-12 min-w-0">
                                    <div class="flex justify-between items-center text-[8px]">
                                        <span class="font-bold uppercase tracking-wider">\${gradeInfo.name} T\${s.tier || 1}</span>
                                        <span class="text-yellow-300 font-bold">\${starsHtml}</span>
                                    </div>
                                    <span class="text-[10px] font-bold font-mono text-white truncate">\${capitalizeFirstLetter(s.word)}</span>
                                </div>`;
const newSkillPreview = `<div class="p-1.5 border-2 \${gradeInfo.colorClass} flex flex-col justify-between min-h-[52px] min-w-0">
                                    <div class="flex justify-between items-center text-[8px]">
                                        <span class="font-bold uppercase tracking-wider">\${gradeInfo.name} T\${s.tier || 1}</span>
                                        <span class="text-yellow-300 font-bold">\${starsHtml}</span>
                                    </div>
                                    <div class="flex justify-between items-end">
                                        <span class="text-[10px] font-bold font-mono text-white truncate">\${capitalizeFirstLetter(s.word)}</span>
                                        <span class="text-[8px] font-bold text-gray-400 shrink-0 ml-1">x\${getSkillMultiplier(s)}%</span>
                                    </div>
                                </div>`;
content = content.replace(oldSkillPreview, newSkillPreview);

// 3. Smithy Box Overflow Fix
const oldSmithyBox = `class="bg-[#0d0d0d] border \${isUnlocked ? 'border-purple-900/80 shadow-[0_0_10px_rgba(147,51,234,0.15)]' : 'border-gray-900 opacity-50'} p-3 rounded-none-forced flex flex-col justify-between min-h-[135px]"`;
const newSmithyBox = `class="bg-[#0d0d0d] border \${isUnlocked ? 'border-purple-900/80 shadow-[0_0_10px_rgba(147,51,234,0.15)]' : 'border-gray-900 opacity-50'} p-3 rounded-none-forced flex flex-col justify-between min-h-[135px] overflow-hidden"`;
content = content.replace(oldSmithyBox, newSmithyBox);

// 4. Auto Login Fix
content = content.replace(/localStorage\.removeItem\("vocahero_active_session"\);\s*\/\/\s*기존 localStorage 잔여 세션 삭제/g, "");

// 5. initial load visuals
const initGameEnd = `            drawHeroAvatar();
            drawPetCompanion();
            respawnActiveMonster();`;
const initGameEndNew = `            drawHeroAvatar();
            drawPetCompanion();
            respawnActiveMonster();
            renderAccessoriesAndRelicsUI();`;
content = content.replace(initGameEnd, initGameEndNew);

// 6. 100-pull and 10-pull display issue
const oldPullAcquire = `const resultSkill = addOrLevelUpSkill(picked.word, picked.meaning, rolledGrade, true);
                            acquiredList.push(resultSkill);`;
const newPullAcquire = `const resultSkill = addOrLevelUpSkill(picked.word, picked.meaning, rolledGrade, true);
                            const displaySkill = { ...resultSkill, grade: rolledGrade };
                            acquiredList.push(displaySkill);`;
content = content.replace(oldPullAcquire, newPullAcquire);

// 7. Relic Duplicate Refund and Craft Cost
const oldRefund = `// 6성 Max 유물 중복 소환 시 버려지지 않고 고대 신화 정수 +15개 분해 환급!
                        gameState.relicEssence = (gameState.relicEssence || 0) + 15;
                        refundCount++;
                        drawnResults.push({ def: pickedRelicDef, grade: rolledGrade, stars: 6, isEssenceRefund: true });`;
const newRefund = `// 6성 Max 유물 중복 소환 시 등급에 따라 정수 지급
                        const essenceRewardMap = { "normal": 1, "rare": 2, "hero": 3, "legendary": 4, "mythic": 5 };
                        const reward = essenceRewardMap[rolledGrade] || 1;
                        gameState.relicEssence = (gameState.relicEssence || 0) + reward;
                        refundCount += reward;
                        drawnResults.push({ def: pickedRelicDef, grade: rolledGrade, stars: 6, isEssenceRefund: true, refundAmount: reward });`;
content = content.replace(oldRefund, newRefund);

const oldRefundToast = `showToast(\`?? 6성 Max 유물 중복 획득으로 [고대 신화 정수] +\${refundCount * 15}개가 환급 적립되었습니다!\`);`;
const newRefundToast = `showToast(\`?? 6성 Max 유물 중복 획득으로 [고대 신화 정수] +\${refundCount}개가 환급 적립되었습니다!\`);`;
content = content.replace(oldRefundToast, newRefundToast);

const oldCraftCost = `const cost = 100;
            if (gameState.relicEssence < cost) {
                showToast(\`?? 신화 유물 연성을 위해 [고대 신화 정수] \${cost}개가 필요합니다!`;
const newCraftCost = `const cost = 500;
            if (gameState.relicEssence < cost) {
                showToast(\`?? 신화 유물 연성을 위해 [고대 신화 정수] \${cost}개가 필요합니다!`;
content = content.replace(oldCraftCost, newCraftCost);

fs.writeFileSync("index.html", content, "utf8");
