const fs = require('fs');
let content = fs.readFileSync('index.html', 'utf8');

// 1. Add tutorial Overlay HTML before </body>
const tutorialHtml = `
    <!-- TUTORIAL OVERLAY -->
    <div id="tutorialOverlay" class="fixed inset-0 z-[9999] bg-black/85 hidden flex-col items-center justify-center p-4 transition-opacity duration-300">
        <div class="max-w-sm w-full bg-[#0d0d0d] border border-yellow-500 p-5 rounded-none-forced shadow-[0_0_20px_rgba(234,179,8,0.3)] relative animate-bounce flex flex-col gap-3">
            <h3 class="text-yellow-400 font-bold text-base flex items-center gap-2">
                <i data-lucide="sparkles" class="w-4 h-4"></i> 🎓 여신의 안내
            </h3>
            <p id="tutorialMessage" class="text-gray-200 text-sm leading-relaxed min-h-[60px]">튜토리얼 메시지</p>
            <div class="flex justify-between items-center mt-2 border-t border-[#3c3c3c] pt-3">
                <button onclick="skipTutorial()" class="text-gray-500 text-[10px] hover:text-white underline uppercase tracking-widest font-bold">건너뛰기</button>
                <button id="tutorialNextBtn" onclick="nextTutorialStep()" class="bg-gradient-to-r from-yellow-600 to-amber-500 hover:from-yellow-500 hover:to-amber-400 text-black font-extrabold px-3 py-1.5 text-[10px] uppercase tracking-widest rounded-none-forced transition hidden shadow-md flex items-center gap-1">
                    다음 <i data-lucide="arrow-right" class="w-3 h-3"></i>
                </button>
            </div>
        </div>
    </div>
</body>`;

if (!content.includes('id="tutorialOverlay"')) {
    content = content.replace('</body>', tutorialHtml);
}

// 2. Add tutorial JS before </script> in main body
const tutorialJs = `
        // --- 튜토리얼 시스템 ---
        let tutorialStep = 0;
        
        function checkTutorialStatus() {
            if (!gameState.tutorialCompleted) {
                setTimeout(() => {
                    tutorialStep = 1;
                    showTutorialOverlay();
                }, 1000);
            }
        }

        function showTutorialOverlay() {
            if (gameState.tutorialCompleted) return;
            const overlay = document.getElementById("tutorialOverlay");
            overlay.classList.remove("hidden");
            overlay.classList.add("flex");
            const msg = document.getElementById("tutorialMessage");
            const nextBtn = document.getElementById("tutorialNextBtn");
            
            // 기존 강조 해제
            document.querySelectorAll('.tutorial-highlight').forEach(el => {
                el.classList.remove('tutorial-highlight', 'relative', 'z-[10000]', 'ring-2', 'ring-yellow-400', 'animate-pulse');
            });
            nextBtn.classList.add("hidden");

            if (tutorialStep === 1) {
                switchTab('quizTab');
                msg.innerHTML = "환영합니다 용사여!<br>먼저 몬스터를 공격하려면 <b>올바른 뜻을 가진 단어</b>를 선택해야 합니다. <span class='text-yellow-300'>정답을 클릭해보세요!</span>";
                const choices = document.querySelector('.grid.grid-cols-2.gap-2.mb-4');
                if(choices) {
                    choices.classList.add('tutorial-highlight', 'relative', 'z-[10000]', 'ring-2', 'ring-yellow-400', 'animate-pulse');
                }
            } else if (tutorialStep === 2) {
                msg.innerHTML = "훌륭합니다!<br>몬스터를 처치해 얻은 골드로 <b>[대장간]</b> 탭으로 이동하여 장비를 강화해보세요.";
                const gearTabBtn = document.getElementById("gearTabBtn");
                if(gearTabBtn) {
                    gearTabBtn.classList.add('tutorial-highlight', 'relative', 'z-[10000]', 'ring-2', 'ring-yellow-400', 'animate-pulse');
                }
            } else if (tutorialStep === 3) {
                msg.innerHTML = "이제 <b>무기 강화</b> 버튼을 눌러 전투력을 올리세요! (무기는 클릭 데미지와 초당 피해량을 대폭 올려줍니다)";
                const weaponBtnContainer = document.getElementById("gearInfo_weapon");
                if(weaponBtnContainer) {
                    weaponBtnContainer.classList.add('tutorial-highlight', 'relative', 'z-[10000]', 'ring-2', 'ring-yellow-400', 'animate-pulse');
                }
            } else if (tutorialStep === 4) {
                msg.innerHTML = "잘하셨습니다!<br>전투력이 올라가면 더 강한 몬스터를 처치할 수 있습니다.<br><br><span class='text-yellow-300'>튜토리얼 완료 보상으로 10,000 골드와 보스 증표를 드립니다!</span> 건투를 빕니다!";
                nextBtn.classList.remove("hidden");
                nextBtn.innerHTML = '튜토리얼 완료 (보상 받기) <i data-lucide="gift" class="w-3 h-3"></i>';
                const petTabBtn = document.getElementById("petTabBtn");
                if(petTabBtn) {
                    petTabBtn.classList.add('tutorial-highlight', 'relative', 'z-[10000]', 'ring-2', 'ring-yellow-400', 'animate-pulse');
                }
            }
        }

        function nextTutorialStep() {
            if(tutorialStep === 4) {
                completeTutorial();
            } else {
                tutorialStep++;
                showTutorialOverlay();
            }
        }

        function skipTutorial() {
            completeTutorial();
        }

        function completeTutorial() {
            if (gameState.tutorialCompleted) return;
            gameState.tutorialCompleted = true;
            const overlay = document.getElementById("tutorialOverlay");
            overlay.classList.add("hidden");
            overlay.classList.remove("flex");
            
            document.querySelectorAll('.tutorial-highlight').forEach(el => {
                el.classList.remove('tutorial-highlight', 'relative', 'z-[10000]', 'ring-2', 'ring-yellow-400', 'animate-pulse');
            });

            // Reward
            gameState.gold = (gameState.gold || 0) + 10000;
            gameState.bossTokens = (gameState.bossTokens || 0) + 50;
            showToast("🎉 튜토리얼 완료! 정착 지원금 10,000 골드와 보스 증표 50개를 받았습니다.");
            refreshStateVisuals();
            saveLocalCache();
            if (window.lucide) {
                lucide.createIcons();
            }
        }

        // --- 튜토리얼 트리거 후킹 ---
        // 1. evaluateAnswer
        const originalEvaluateAnswer = evaluateAnswer;
        evaluateAnswer = function(idx) {
            const result = originalEvaluateAnswer(idx);
            // Wait, evaluateAnswer doesn't return anything. It sets things up. 
            // We can check if answer is correct by looking at currentQuizIndex etc.
            // But we don't know if it was correct synchronously because evaluateAnswer updates UI.
            // Let's just hook checkAnswer(true) part inside evaluateAnswer... wait, evaluateAnswer is the function.
        }
    </script>
</body>`;

// Actually we need to hook into functions. Let's do it via string replace in the function bodies instead of reassigning if they are global functions, but reassigning is safer.
// Let's look at evaluateAnswer. Wait, let's just use string replace for evaluateAnswer and switchTab.

// 1. evaluateAnswer hook
if (!content.includes('if (!gameState.tutorialCompleted && tutorialStep === 1)')) {
    // Find where combo increases (correct answer)
    content = content.replace('comboCount++;', 'comboCount++;\n            if (!gameState.tutorialCompleted && tutorialStep === 1) {\n                tutorialStep = 2;\n                setTimeout(showTutorialOverlay, 500);\n            }');
}

// 2. switchTab hook
if (!content.includes('if (!gameState.tutorialCompleted && tutorialStep === 2 && tabId === \\\'gearTab\\\')')) {
    content = content.replace('function switchTab(tabId) {', 'function switchTab(tabId) {\n            if (!gameState.tutorialCompleted && tutorialStep === 2 && tabId === \\\'gearTab\\\') {\n                tutorialStep = 3;\n                setTimeout(showTutorialOverlay, 300);\n            }');
}

// 3. upgradeGearItem hook
if (!content.includes('if (!gameState.tutorialCompleted && tutorialStep === 3 && gearKey === \\\'weapon\\\')')) {
    content = content.replace('function upgradeGearItem(gearKey) {', 'function upgradeGearItem(gearKey) {\n            if (!gameState.tutorialCompleted && tutorialStep === 3 && gearKey === \\\'weapon\\\') {\n                tutorialStep = 4;\n                setTimeout(showTutorialOverlay, 300);\n            }');
}

// 4. Login complete hook to start tutorial
// Find where checkStudentAccount() succeeds and calls loginSuccess(). We can add checkTutorialStatus() inside hideGameLoadingOverlay() or loginSuccess().
// Let's put it in refreshStateVisuals or hideGameLoadingOverlay.
if (!content.includes('checkTutorialStatus();')) {
    content = content.replace('hideGameLoadingOverlay();', 'hideGameLoadingOverlay();\n            checkTutorialStatus();');
}

if (!content.includes('function checkTutorialStatus')) {
    content = content.replace('</script>\n</body>', tutorialJs);
}

fs.writeFileSync('index.html', content);
