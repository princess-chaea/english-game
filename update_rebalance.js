const fs = require('fs');

// 1. Update index.html
let html = fs.readFileSync('index.html', 'utf8');

// Add id="rerollPotentialBtn"
html = html.replace(
    '<button onclick="rerollGearPotentials()" class="px-4 py-1.5 bg-yellow-500 hover:bg-yellow-400 text-black font-extrabold text-xs transition rounded-none-forced shadow-md">',
    '<button id="rerollPotentialBtn" onclick="rerollGearPotentials()" class="px-4 py-1.5 bg-yellow-500 hover:bg-yellow-400 text-black font-extrabold text-xs transition rounded-none-forced shadow-md">'
);

// Update comment
html = html.replace('<!-- 💍 [50스테이지 해금] 전설 장신구 3종 -->', '<!-- 💍 [45/55/65스테이지 해금] 전설 장신구 3종 -->');

// Update Manual stage unlock text in index.html
const oldManual = \✅ <b>30스테이지: 고대 유물 소환 제단</b> (보스 증표)<br>
✅ <b>40스테이지: 무구 잠재력 연구소</b><br>
✅ <b>50스테이지: 지혜의 목걸이</b><br>
✅ <b>60스테이지: 투지의 팔찌</b><br>
✅ <b>70스테이지: 영웅의 반지</b>\;

const newManual = \✅ <b>20스테이지: 무구 잠재력 연구소</b><br>
✅ <b>30스테이지: 고대 유물 소환 제단</b> (보스 증표)<br>
✅ <b>45스테이지: 지혜의 목걸이</b><br>
✅ <b>55스테이지: 투지의 팔찌</b><br>
✅ <b>65스테이지: 영웅의 반지</b>\;

html = html.replace(oldManual, newManual);
fs.writeFileSync('index.html', html, 'utf8');
console.log("index.html updated");

// 2. Update js/main.js
let js = fs.readFileSync('js/main.js', 'utf8');

// Update ACCESSORY_PARAMS unlock stages
js = js.replace(
    \
ecklace: { name: "지혜의 목걸이", unlockStage: 50,\,
    \
ecklace: { name: "지혜의 목걸이", unlockStage: 45,\
);
js = js.replace(
    \racelet: { name: "투지의 팔찌", unlockStage: 60,\,
    \racelet: { name: "투지의 팔찌", unlockStage: 55,\
);
js = js.replace(
    \ing: { name: "영웅의 반지", unlockStage: 70,\,
    \ing: { name: "영웅의 반지", unlockStage: 65,\
);

// Update PET_PARAMS slime description
js = js.replace(
    \desc: "🪙 골드 획득 특화 — 레벨당 퀴즈 골드 수당 +10%"\,
    \desc: "🪙 골드 생산 특화 — 레벨당 퀴즈 수당 +10% & 초당 자동 골드 생산(+stage×5G/lv)"\
);

// Update calculateAutoGoldPerSec
const oldAutoGold = \        function calculateAutoGoldPerSec() {
            const relicGoldBonus = 1.0 + getEquippedRelicBonus("relic_compass") / 100;
            const potentialGold = 1.0 + (getPotentialStatBonus('goldBonus') / 100);
            const stage = gameState.stage || 1;
            const stageBase = stage * 25; // 1스테이지 25G 시작 (선형 증가)
            return Math.floor(stageBase * relicGoldBonus * potentialGold);
        }\;

const newAutoGold = \        function calculateAutoGoldPerSec() {
            const relicGoldBonus = 1.0 + getEquippedRelicBonus("relic_compass") / 100;
            const potentialGold = 1.0 + (getPotentialStatBonus('goldBonus') / 100);
            const stage = gameState.stage || 1;
            const stageBase = stage * 25; // 1스테이지 25G 시작 (선형 증가)
            let slimeAutoGold = 0;
            if (gameState.petLevels && gameState.petLevels['slime']) {
                const slimeLvl = gameState.petLevels['slime'];
                slimeAutoGold = slimeLvl * (stage * 5); // 슬라임 펫 레벨당 초당 자동 골드 생산
            }
            return Math.floor((stageBase + slimeAutoGold) * relicGoldBonus * potentialGold);
        }\;

js = js.replace(oldAutoGold, newAutoGold);

// Update Pet cost exponent multiplier 1.12 -> 1.08
js = js.replace(
    \const cost = isMax ? 0 : Math.floor(info.cost * Math.pow(1.12, petLevel));\,
    \const cost = isMax ? 0 : Math.floor(info.cost * Math.pow(1.08, petLevel));\
);
js = js.replace(
    \const cost = isTutorialPet ? 0 : Math.floor(info.cost * Math.pow(1.12, currentLvl));\,
    \const cost = isTutorialPet ? 0 : Math.floor(info.cost * Math.pow(1.08, currentLvl));\
);

// Update Potential Lab stage requirement 40 -> 20
js = js.replace(
    \if (stage < 40) {\\n                showToast("⚠️ 무구 잠재력 연구소 개설은 40스테이지 달성 시 해금됩니다!");\,
    \if (stage < 20) {\\n                showToast("⚠️ 무구 잠재력 연구소 개설은 20스테이지 달성 시 해금됩니다!");\
);

js = js.replace(
    \if (stage < 40) {\\n                showToast("⚠️ 무구 잠재력 연구소는 40스테이지 정복 시 해금됩니다!");\,
    \if (stage < 20) {\\n                showToast("⚠️ 무구 잠재력 연구소는 20스테이지 정복 시 해금됩니다!");\
);

// Update renderGearPotentialLabUI
const oldPotentialUI = \            // 미해금 시 개설 버튼 표시
            if (!gameState.isPotentialUnlocked) {
                grid.innerHTML = \\\
                    <div class="col-span-2 sm:col-span-3 border border-yellow-700/60 bg-black/90 p-4 text-center flex flex-col items-center justify-center rounded-none-forced py-6">
                        <span class="text-2xl mb-1">⚡</span>
                        <h4 class="font-extrabold text-xs text-yellow-300">무구 잠재력 연구소 미개설</h4>
                        <p class="text-[10px] text-gray-400 mt-1 mb-3">\\\</p>
                        <button onclick="unlockPotentialLab()" \\\ class="px-5 py-2 \\\ font-extrabold text-xs rounded-none-forced transition">
                            \\\
                        </button>
                    </div>
                \\\;
                return;
            }\;

const newPotentialUI = \            // 미해금 시 개설 버튼 표시
            if (!gameState.isPotentialUnlocked) {
                grid.innerHTML = \\\
                    <div class="col-span-2 sm:col-span-3 border border-yellow-700/60 bg-black/90 p-4 text-center flex flex-col items-center justify-center rounded-none-forced py-6">
                        <span class="text-2xl mb-1">⚡</span>
                        <h4 class="font-extrabold text-xs text-yellow-300">무구 잠재력 연구소 미개설</h4>
                        <p class="text-[10px] text-gray-400 mt-1 mb-3">\\\</p>
                        <button onclick="unlockPotentialLab()" \\\ class="px-5 py-2 \\\ font-extrabold text-xs rounded-none-forced transition">
                            \\\
                        </button>
                    </div>
                \\\;
                const rerollBtn = document.getElementById("rerollPotentialBtn");
                if (rerollBtn) {
                    rerollBtn.disabled = true;
                    rerollBtn.className = "px-4 py-1.5 bg-gray-800 text-gray-500 font-extrabold text-xs transition rounded-none-forced shadow-none cursor-not-allowed border border-gray-700 opacity-60";
                    rerollBtn.innerText = "🔒 미해금";
                }
                return;
            } else {
                const rerollBtn = document.getElementById("rerollPotentialBtn");
                if (rerollBtn) {
                    rerollBtn.disabled = false;
                    rerollBtn.className = "px-4 py-1.5 bg-yellow-500 hover:bg-yellow-400 text-black font-extrabold text-xs transition rounded-none-forced shadow-md cursor-pointer";
                    rerollBtn.innerText = "🎲 잠재력 재설정";
                }
            }\;

js = js.replace(oldPotentialUI, newPotentialUI);

// Update profile accessories unlock stage calls in refreshStateVisuals
js = js.replace(
    \pplyAccProfileUI('profileNecklaceContainer', 'necklace', '목걸이', gameState.necklaceLvl, 'media/accessories/necklace.png', 'purple', 31);\,
    \pplyAccProfileUI('profileNecklaceContainer', 'necklace', '목걸이', gameState.necklaceLvl, 'media/accessories/necklace.png', 'purple', 45);\
);
js = js.replace(
    \pplyAccProfileUI('profileBraceletContainer', 'bracelet', '팔찌', gameState.braceletLvl, 'media/accessories/bracelet.png', 'sky', 61);\,
    \pplyAccProfileUI('profileBraceletContainer', 'bracelet', '팔찌', gameState.braceletLvl, 'media/accessories/bracelet.png', 'sky', 55);\
);
js = js.replace(
    \pplyAccProfileUI('profileRingContainer', 'ring', '반지', gameState.ringLvl, 'media/accessories/ring.png', 'amber', 101);\,
    \pplyAccProfileUI('profileRingContainer', 'ring', '반지', gameState.ringLvl, 'media/accessories/ring.png', 'amber', 65);\
);

// Update WB accessories unlock stage calls in updateWorldBossUI
js = js.replace(
    \\\,
    \\\
);
js = js.replace(
    \\\,
    \\\
);
js = js.replace(
    \\\,
    \\\
);

fs.writeFileSync('js/main.js', js, 'utf8');
console.log("js/main.js updated");
