
        async function logoutSession() {
            showGameLoadingOverlay("다른 영웅의 영혼에 들어가는 중... (로그아웃 처리 및 저장 중)");
            saveLocalCache();
            const doLogout = () => {
                localStorage.removeItem("vocahero_active_session");
                sessionStorage.removeItem("vocahero_active_session");
                showToast("로그아웃 되었습니다. 잠시 후 초기 화면으로 이동합니다.");
                setTimeout(() => { location.reload(); }, 1500);
            };
            
            if (window._fbDb && window._fbDoc && window._fbSetDoc && gameState.name !== "방문자") {
                try {
                    const uid = getUid(gameState.schoolName, gameState.grade, gameState.classNum, gameState.studentNum, gameState.name);
                    if (!gameState.schoolName || gameState.schoolName === "Unknown") throw new Error("Unknown school");
                    const logoutSaveData = Object.assign({}, gameState);
                    if (!logoutSaveData.linkedGoogleUid) { delete logoutSaveData.linkedGoogleUid; }
                    await window._fbSetDoc(window._fbDoc(window._fbDb, "users", uid), logoutSaveData, { merge: true });
                } catch(e) { console.error(e); }
            }
            doLogout();
        }

                        async function checkWorldBossVictoryOnStartup() {
            if (!gameState.grade || !gameState.name || gameState.name === "방문자" || !window._fbReady) return;
            const studentKey = `${gameState.grade}_${gameState.classNum}_${gameState.studentNum}_${gameState.name}`;
            
            const currentWeek = getCurrentWeekNum();
            const prevWeek = currentWeek - 1;
            const victoryRewardKey = `vocahero_wb_reward_claimed_${studentKey}_week_${prevWeek}`;
            
            if (localStorage.getItem(victoryRewardKey)) return;

            if (window._fbDb && window._fbGetDoc && window._fbDoc) {
                try {
                    // 이전 주차 문서 조회
                    let bossDocRef = window._fbDoc(window._fbDb, "world_bosses", `grade_${gameState.grade}_week_${prevWeek}`);
                    let docSnap = await window._fbGetDoc(bossDocRef);
                    
                    // 없으면 레거시 문서 조회 (하위 호환성)
                    if (!docSnap.exists()) {
                        bossDocRef = window._fbDoc(window._fbDb, "world_bosses", `grade_${gameState.grade}`);
                        docSnap = await window._fbGetDoc(bossDocRef);
                    }

                    if (docSnap.exists()) {
                        const data = docSnap.data();
                        const damages = data.damages || {};
                        const myDamage = damages[studentKey] || 0;
                    const curWeek = getCurrentWeekNum();
                    if (gameState.wbBestDamage !== myDamage || gameState.wbBestDamageWeek !== curWeek) {
                        gameState.wbBestDamage = myDamage;
                        gameState.wbBestDamageWeek = curWeek;
                        saveSessionToCloud(true);
                    }
                        
                        if (myDamage > 0) {
                            const curHp = typeof data.curHp !== 'undefined' ? data.curHp : 0;
                            const isVictory = curHp <= 0;
                            
                            const sharePct = (data.maxHp && data.maxHp > 0) ? (myDamage / data.maxHp) : 0;
                            
                            let myRank = 1;
                            let sortedDmg = Object.values(damages).sort((a,b)=>b-a);
                            if(sortedDmg.length > 0) myRank = sortedDmg.indexOf(myDamage) + 1;
                            
                            const baseFp = Math.floor(myDamage / 1000);
                            const shareFp = Math.round(100000 * sharePct);
                            const totalFp = baseFp + shareFp;
                            const getsTitle = isVictory && myRank === 1;

                            // UI 업데이트
                            const modal = document.getElementById("wbVictoryNoticeModal");
                            if (modal) {
                                document.getElementById("wbVictoryNoticeModal").querySelector('h2').innerHTML = "🏆 월드보스 주간 결산 🏆";
                                document.getElementById("wbVictoryNoticeModal").querySelector('p').innerText = "지난 주 월드보스 전투 결과가 집계되었습니다!";
                                document.getElementById("wbModalMyDamage").innerText = myDamage.toLocaleString() + " HP";
                                document.getElementById("wbModalMyShare").innerText = (sharePct * 100).toFixed(1) + "%";
                                
                                let titleBadge = getsTitle ? " / [수호신]" : "";
                                document.getElementById("wbModalRewardSummary").innerText = `+${totalFp.toLocaleString()} FP${titleBadge}`;
                                
                                document.getElementById("wbVictoryNoticeClaimBtn").onclick = () => {
                                    gameState.fp = (gameState.fp || 0) + totalFp;
                                    if (getsTitle) {
                                        if (!gameState.unlockedTitles) gameState.unlockedTitles = [];
                                        if (!gameState.unlockedTitles.includes("수호신")) gameState.unlockedTitles.push("수호신");
                                    }
                                    localStorage.setItem(victoryRewardKey, "true");
                                    saveLocalCache();
                                    refreshStateVisuals();
                                    closeModal("wbVictoryNoticeModal");
                                    showToast("월드보스 주간 보상을 수령했습니다!");
                                };
                                openModal("wbVictoryNoticeModal");
                                playSoundEffect('levelup');
                            } else {
                                // 모달이 없는 경우 자동 수령
                                gameState.fp = (gameState.fp || 0) + totalFp;
                                if (getsTitle) {
                                    if (!gameState.unlockedTitles) gameState.unlockedTitles = [];
                                    if (!gameState.unlockedTitles.includes("수호신")) gameState.unlockedTitles.push("수호신");
                                }
                                localStorage.setItem(victoryRewardKey, "true");
                                saveLocalCache();
                            }
                        } else {
                            // 참여하지 않은 경우에도 플래그 저장
                            localStorage.setItem(victoryRewardKey, "true");
                        }
                    }
                } catch(e) { console.error(e); }
            }
        }

        async function refreshHallOfFame() {
            if (!gameState.grade || !gameState.name || gameState.name === "방문자") return;
            const hofContent = document.getElementById("hofContent");
            if (!hofContent) return;
            
            hofContent.innerHTML = "<div class='text-center py-4 text-gray-400 text-xs'>🏆 명예의 전당 기록을 불러오는 중...</div>";
            
            try {
                if (window._fbDb && window._fbGetDocs && window._fbCollection && window._fbQuery && window._fbWhere) {
                    const q = window._fbQuery(window._fbCollection(window._fbDb, "users"), window._fbWhere("grade", "==", gameState.grade));
                    const querySnapshot = await window._fbGetDocs(q);
                    let allUsers = [];
                    querySnapshot.forEach((doc) => allUsers.push(doc.data()));
                    
                    allUsers.sort((a,b) => {
                        if (a.stage !== b.stage) return b.stage - a.stage;
                        if (a.progress !== b.progress) return b.progress - a.progress;
                        return (b.gold || 0) - (a.gold || 0);
                    });
                    
                    const myRank = allUsers.findIndex(u => u.name === gameState.name && u.studentNum === gameState.studentNum) + 1;
                    const list = allUsers.slice(0, 10);
                    
                    if (list.length === 0) {
                        hofContent.innerHTML = "<div class='text-center py-4 text-gray-500 text-xs'>아직 등록된 영웅이 없습니다.</div>";
                        return;
                    }
                    
                    let html = `<div class="mb-4 bg-[#1a1a1a] p-3 rounded-none-forced border border-yellow-600/30 text-center">
                        <span class="text-xs text-gray-400">나의 현재 순위: </span>
                        <span class="text-sm font-bold text-yellow-400">${myRank > 0 ? myRank + "위" : "순위 없음"}</span>
                    </div>`;
                    
                    list.forEach((user, idx) => {
                        let rankIcon = `<span class="w-6 h-6 flex items-center justify-center bg-gray-800 text-gray-400 font-bold text-xs rounded-full border border-gray-600">${idx+1}</span>`;
                        if (idx === 0) rankIcon = `<span class="w-6 h-6 flex items-center justify-center bg-yellow-500 text-black font-extrabold text-xs rounded-full shadow-[0_0_10px_rgba(234,179,8,0.5)]">1</span>`;
                        else if (idx === 1) rankIcon = `<span class="w-6 h-6 flex items-center justify-center bg-gray-300 text-black font-bold text-xs rounded-full">2</span>`;
                        else if (idx === 2) rankIcon = `<span class="w-6 h-6 flex items-center justify-center bg-amber-700 text-white font-bold text-xs rounded-full">3</span>`;
                        
                        let isMe = (user.name === gameState.name && user.studentNum === gameState.studentNum);
                        let rowClass = isMe ? "bg-[#262626] border-yellow-600/50" : "bg-[#111] border-[#3c3c3c]";
                        let avatarIcon = user.avatarType === 'warrior' ? 'sword' : (user.avatarType === 'mage' ? 'wand2' : 'crosshair');
                        
                        html += `<div class="flex items-center justify-between p-2.5 mb-2 border ${rowClass} rounded-none-forced">
                            <div class="flex items-center gap-3">
                                ${rankIcon}
                                <div class="flex flex-col">
                                    <div class="flex items-center gap-1.5">
                                        <i data-lucide="${avatarIcon}" class="w-3.5 h-3.5 ${isMe ? 'text-yellow-400' : 'text-gray-400'}"></i>
                                        <span class="text-sm font-bold ${isMe ? 'text-white' : 'text-gray-300'}">${user.name}</span>
                                        <span class="text-[10px] text-gray-500">(${user.classNum}반 ${user.studentNum}번)</span>
                                    </div>
                                    <div class="text-[10px] text-gray-400 mt-0.5">스테이지 ${user.stage} - ${user.progress}%</div>
                                </div>
                            </div>
                            <div class="text-right">
                                <div class="text-xs font-bold text-yellow-500 flex items-center gap-1 justify-end">
                                    ${user.gold ? user.gold.toLocaleString() : 0} <i data-lucide="coins" class="w-3 h-3"></i>
                                </div>
                            </div>
                        </div>`;
                    });
                    hofContent.innerHTML = html;
                    if(window.lucide) lucide.createIcons();
                }
            } catch(e) {
                console.error(e);
                hofContent.innerHTML = "<div class='text-center py-4 text-red-400 text-xs'>오류가 발생했습니다.</div>";
            }
        }

        async function deleteAccount() {
            if (gameState.name === "방문자") return;
            if (!confirm("정말 영웅 데이터를 삭제하시겠습니까? 복구할 수 없습니다.")) return;

            showGameLoadingOverlay("영웅의 영혼이 안식처로 떠납니다...");
            try {
                if (window._fbDb && window._fbDoc && window._fbDeleteDoc) {
                    const sn = gameState.schoolName || "Unknown";
                    const uid = `${sn}_${gameState.grade}_${gameState.classNum}_${gameState.studentNum}_${gameState.name}`;
                    await window._fbDeleteDoc(window._fbDoc(window._fbDb, "users", uid));
                    showToast("영웅의 데이터가 완전히 삭제되었습니다.");
                    localStorage.removeItem("vocahero_active_session");
                    setTimeout(() => { location.reload(); }, 1500);
                }
            } catch(e) {
                console.error(e);
                alert("삭제 중 오류가 발생했습니다.");
                hideGameLoadingOverlay();
            }
        }

        function checkConnectionState() {
            const statusDot = document.getElementById("statusDot");
            const statusText = document.getElementById("statusText");
            if (window._fbDb) {
                if(statusDot) { statusDot.classList.remove("bg-red-500", "bg-yellow-500", "animate-pulse"); statusDot.classList.add("bg-green-500"); }
                if(statusText) statusText.innerText = "Firebase On";
            } else {
                if(statusDot) { statusDot.classList.remove("bg-green-500", "animate-pulse"); statusDot.classList.add("bg-red-500"); }
                if(statusText) statusText.innerText = "Offline";
            }
        }

        (function() {
            const originalWarn = console.warn;
            console.warn = function(...args) {
                if (args[0] && typeof args[0] === 'string' && args[0].includes('cdn.tailwindcss.com')) {
                    return;
                }
                originalWarn.apply(console, args);
            };
        })();
    