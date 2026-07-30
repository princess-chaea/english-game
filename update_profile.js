const fs = require('fs');
let js = fs.readFileSync('js/main.js', 'utf8');

const targetStr = \            const nLvl = document.getElementById("profileNecklaceLvl");
            const bLvl = document.getElementById("profileBraceletLvl");
            const rLvl = document.getElementById("profileRingLvl");
            const nVal = document.getElementById("profileNecklaceVal");
            const bVal = document.getElementById("profileBraceletVal");
            const rVal = document.getElementById("profileRingVal");

            if (nLvl) nLvl.innerText = \\\\\\강\\\;
            if (bLvl) bLvl.innerText = \\\\\\강\\\;
            if (rLvl) rLvl.innerText = \\\\\\강\\\;

            if (nVal) nVal.innerHTML = getAccessoryEffectSummary('necklace', gameState.necklaceLvl);
            if (bVal) bVal.innerHTML = getAccessoryEffectSummary('bracelet', gameState.braceletLvl);
            if (rVal) rVal.innerHTML = getAccessoryEffectSummary('ring', gameState.ringLvl);\;

const replacement = \            const applyAccProfileUI = (containerId, key, name, lvl, img, effectClass, unlockStage) => {
                const container = document.getElementById(containerId);
                if (!container) return;
                const isUnlocked = (gameState.stage || 1) >= unlockStage;
                if (!isUnlocked) {
                    container.className = "bg-black/50 border border-gray-800/40 p-1.5 rounded flex flex-col items-center justify-center min-w-0 opacity-50 grayscale";
                    container.innerHTML = \\\
                        <div class="flex items-center justify-center gap-1 mb-1">
                            <span class="text-gray-500 font-extrabold text-[9px] whitespace-nowrap">🔒 미해금 (\\\스테이지)</span>
                        </div>
                    \\\;
                } else {
                    container.className = \\\g-\\\-950/40 border border-\\\-800/40 p-1.5 rounded flex flex-col items-center justify-center min-w-0\\\;
                    container.innerHTML = \\\
                        <div class="flex items-center justify-center gap-1 mb-1">
                            <img src="\\\" class="w-5 h-5 object-contain shrink-0" onerror="this.style.display='none'">
                            <span class="text-\\\-300 font-extrabold text-[9px] whitespace-nowrap">\\\ <b class="text-white">\\\강</b></span>
                        </div>
                        <span class="text-[8.5px] text-\\\-200 font-bold block leading-tight break-words">\\\</span>
                    \\\;
                }
            };
            
            applyAccProfileUI('profileNecklaceContainer', 'necklace', '목걸이', gameState.necklaceLvl, 'media/accessories/necklace.png', 'purple', 31);
            applyAccProfileUI('profileBraceletContainer', 'bracelet', '팔찌', gameState.braceletLvl, 'media/accessories/bracelet.png', 'sky', 61);
            applyAccProfileUI('profileRingContainer', 'ring', '반지', gameState.ringLvl, 'media/accessories/ring.png', 'amber', 101);\;

js = js.replace(targetStr, replacement);
fs.writeFileSync('js/main.js', js, 'utf8');
