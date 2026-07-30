const fs = require('fs');
let js = fs.readFileSync('js/main.js', 'utf8');

const oldAccCard = \                let accCardHtml = \\\
                    <div class="bg-[#0d0d0d] p-1.5 border border-purple-500/40 grid grid-cols-3 gap-1 rounded-none-forced">
                        <div class="bg-black/70 p-1 border border-purple-900/60 flex flex-col justify-center min-w-0">
                            <div class="flex items-center justify-center gap-1 mb-1">
                                <img src="media/accessories/necklace.png" class="w-6 h-6 object-contain shrink-0" onerror="this.style.display='none'">
                                <span class="text-[9px] text-purple-300 font-bold">목걸이 \\\강</span>
                            </div>
                            <div class="text-center">
                                <span class="text-[9px] text-purple-200  font-extrabold leading-tight break-words">\\\</span>
                            </div>
                        </div>
                        <div class="bg-black/70 p-1 border border-sky-900/60 flex flex-col justify-center min-w-0">
                            <div class="flex items-center justify-center gap-1 mb-1">
                                <img src="media/accessories/bracelet.png" class="w-6 h-6 object-contain shrink-0" onerror="this.style.display='none'">
                                <span class="text-[9px] text-sky-300 font-bold">팔찌 \\\강</span>
                            </div>
                            <div class="text-center">
                                <span class="text-[9px] text-sky-200  font-extrabold leading-tight break-words">\\\</span>
                            </div>
                        </div>
                        <div class="bg-black/70 p-1 border border-amber-900/60 flex flex-col justify-center min-w-0">
                            <div class="flex items-center justify-center gap-1 mb-1">
                                <img src="media/accessories/ring.png" class="w-6 h-6 object-contain shrink-0" onerror="this.style.display='none'">
                                <span class="text-[9px] text-amber-300 font-bold">반지 \\\강</span>
                            </div>
                            <div class="text-center">
                                <span class="text-[9px] text-amber-200  font-extrabold leading-tight break-words">\\\</span>
                            </div>
                        </div>
                    </div>
                \\\;\;

const newAccCard = \            const getAccHtml = (key, name, lvl, img, effectClass, unlockStage) => {
                const isUnlocked = (gameState.stage || 1) >= unlockStage;
                if (!isUnlocked) {
                    return \\\
                        <div class="bg-black/50 p-1 border border-gray-800 flex flex-col justify-center min-w-0 opacity-50 grayscale">
                            <div class="flex items-center justify-center gap-1 mb-1">
                                <span class="text-[9px] text-gray-500 font-bold">🔒 미해금 (\\\스테이지)</span>
                            </div>
                        </div>
                    \\\;
                }
                return \\\
                    <div class="bg-black/70 p-1 border border-\\\-900/60 flex flex-col justify-center min-w-0">
                        <div class="flex items-center justify-center gap-1 mb-1">
                            <img src="\\\" class="w-6 h-6 object-contain shrink-0" onerror="this.style.display='none'">
                            <span class="text-[9px] text-\\\-300 font-bold">\\\ \\\강</span>
                        </div>
                        <div class="text-center">
                            <span class="text-[9px] text-\\\-200 font-extrabold leading-tight break-words">\\\</span>
                        </div>
                    </div>
                \\\;
            };

            let accCardHtml = \\\
                <div class="bg-[#0d0d0d] p-1.5 border border-purple-500/40 grid grid-cols-3 gap-1 rounded-none-forced">
                    \\\
                    \\\
                    \\\
                </div>
            \\\;\;

js = js.replace(oldAccCard, newAccCard);
fs.writeFileSync('js/main.js', js, 'utf8');
