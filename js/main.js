
        // Secret trigger for Teacher Settings
        let teacherClickCount = 0;
        function handleTeacherSecretClick() {
            teacherClickCount++;
            if (teacherClickCount >= 5) {
                teacherClickCount = 0;
                openModal('teacherModal');
                showToast("🔓 교사용 설정 모드가 활성화되었습니다.");
            }
        }

        // ==========================================
        // 0. GOOGLE APPS SCRIPT WEB APP API ENDPOINT (HARDCODED CONFIG)
        // ==========================================
        // Vercel 등 외부 호스팅 서버에 독립 배포를 진행할 시, 
        // 아래의 빈 따옴표("") 안에 본인의 구글 웹 앱 URL 주소를 그대로 넣고 저장하세요!
        // 예: const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycb.../exec";
        const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzOA1zWlZDE95dhbiVbnQfN8K9yH8xz4zUF4RXwpcsXwYYJfmhvIdrgCtCkgA0HJHpkGg/exec";

        // ==========================================
        // 1. ADVANCED GAME STATE DECLARATION
        // ==========================================
        let tempCredentials = {
            grade: 4,
            classNum: 1,
            studentNum: 1,
            name: ""
        };
        let gameState = {
            grade: 4,
            learningGrade: null,
            classNum: 1,
            studentNum: 1,
            name: "방문자",
            avatarType: "male",
            gold: 0,

            // Equipment Levels
            helmetLvl: 1,
            armorLvl: 1,
            weaponLvl: 1,
            shieldLvl: 1,
            shoesLvl: 1,

            // Pet System
            petType: "none",
            petLvl: 0,

            stage: 1,
            progress: 0, // Word clear points (maxes out at 10 for stage BOSS trigger)
            lastSaved: Date.now(),

            // Internal Combat stats
            totalQuizTries: 0,
            totalQuizCorrect: 0,
            wordsPool: [],
            currentQuizIndex: 0,
            currentQuizCorrectAnswer: 0,

            // Upgraded Advanced Skill Customization System
            skillsInventory: [], // Unlocked skills: { id, word, meaning, grade, cooldownRemaining, maxCooldown }
            activeSkillDeck: [], // Small repeatable deck; the complete word bank stays in learning quizzes
            skillEssence: 0, // Universal awakening material from a new skill card
            equippedSkills: [], // Array storing up to 4 skill ids currently placed in combat slots

            // ⚡ 무구 잠재력 잠금 슬롯 상태 (새로고침 후에도 유지)
            lockedPotentialSlots: {}, // { helmet: [0,1], armor: [], ... }
            wrongWordCounts: {}, // { "apple": 2, "banana": 1 }
            wordLearningStats: {}, // 단어별 정답·오답·연속 정답·문제 유형 통계
            questionTypeStats: {},
            assignedWordPackIds: [],
            assignedQuestionTypes: ["meaning-choice"]
        };

        const BOSS_UNLOCK_LIMIT = 10; // Capped at 10 monster defeats as requested

        // Upgrade parameters mapping for Shop
        const GEAR_PARAMS = {
            helmet: { name: "전사의 투구", base: 300, key: "helmetLvl" },
            armor: { name: "강철의 갑옷", base: 500, key: "armorLvl" },
            weapon: { name: "수호자의 검", base: 700, key: "weaponLvl" },
            shield: { name: "기사의 방패", base: 600, key: "shieldLvl" },
            shoes: { name: "신속의 장화", base: 400, key: "shoesLvl" }
        };

        const GROWTH_RATE = 1.15;
        const MAX_GEAR_LEVEL = 50; // 40스테이지 한계돌파 50강 확장
        const MAX_PET_LEVEL = 100;

        // 💍 장신구 3종 설정 (45/55/65스테이지 해금 & 50강)
        const ACCESSORY_PARAMS = {
            necklace: { name: "지혜의 목걸이", unlockStage: 45, baseCost: 1000, key: "necklaceLvl", img: "media/accessories/necklace.webp", desc: "🪄 스킬 마법 피해 & 쿨타임 감소 특화" },
            bracelet: { name: "투지의 팔찌", unlockStage: 55, baseCost: 5000, key: "braceletLvl", img: "media/accessories/bracelet.webp", desc: "⚔️ 클릭 타격력 & 크리티컬 확률 특화" },
            ring: { name: "영웅의 반지", unlockStage: 65, baseCost: 20000, key: "ringLvl", img: "media/accessories/ring.webp", desc: "👑 전체 자동 DPS & 보스 타격 피해 특화" }
        };

        // 🏺 10종 고대 유물 세부 정의 (1개 전용 장착 시스템)
        const RELIC_DEFINITIONS = [
            { id: "relic_chalice", name: "고대 지혜의 성배", img: "media/relics/relic_1.webp", effectDescTemplate: "단어 정답 피해<br>+{val}%", baseBonus: 0.1 },
            { id: "relic_orb", name: "지옥룡의 붉은 여의주", img: "media/relics/relic_2.webp", effectDescTemplate: "전체 자동 DPS<br>+{val}%", baseBonus: 0.1 },
            { id: "relic_sword", name: "전설 용사의 성검 조각", img: "media/relics/relic_3.webp", effectDescTemplate: "클릭 타격력<br>+{val}%", baseBonus: 0.1 },
            { id: "relic_clock", name: "천공의 수호 시계", img: "media/relics/relic_4.webp", effectDescTemplate: "스킬 쿨타임<br>-{val}%", baseBonus: 0.05 },
            { id: "relic_compass", name: "황금 풍요의 번개 나침반", img: "media/relics/relic_5.webp", effectDescTemplate: "획득 골드량<br>+{val}%", baseBonus: 1.0 },
            { id: "relic_dice", name: "파괴의 거인 마법 주사위", img: "media/relics/relic_6.webp", effectDescTemplate: "크리티컬 확률<br>+{val}%", baseBonus: 0.05 },
            { id: "relic_feather", name: "불사조의 깃털 부적", img: "media/relics/relic_7.webp", effectDescTemplate: "보스 타격 피해<br>+{val}%", baseBonus: 0.2 },
            { id: "relic_scroll", name: "심해의 비밀 주문서", img: "media/relics/relic_8.webp", effectDescTemplate: "스킬 추가 피해<br>+{val}%", baseBonus: 0.1 },
            { id: "relic_crown", name: "태양의 왕관 훈장", img: "media/relics/relic_9.webp", effectDescTemplate: "퀴즈 FP 적립<br>+{val}%", baseBonus: 0.5 },
            { id: "relic_shield", name: "대지의 수호 방패", img: "media/relics/relic_10.webp", effectDescTemplate: "오답 방어·강화 보호<br>+{val}%", baseBonus: 0.1 }
        ];

        // Skill Grade Configs (색상 코드 및 배율 계수)
        const SKILL_GRADES = {
            normal:    { name: "일반",   multiplier: 5,  prob: 0.75,   colorClass: "border-[#4b5563] bg-gradient-to-b from-[#1f2937] to-[#111827] text-gray-200 rounded-none-forced", rank: 1 },
            rare:      { name: "희귀",   multiplier: 10, prob: 0.18,   colorClass: "border-[#0284c7] bg-gradient-to-b from-[#0369a1] to-[#0c4a6e] text-[#7dd3fc] rounded-none-forced shadow-[0_0_10px_rgba(2,132,199,0.5)]", rank: 2 },
            hero:      { name: "영웅",   multiplier: 20, prob: 0.05,   colorClass: "border-[#9333ea] bg-gradient-to-b from-[#7e22ce] to-[#581c87] text-[#e9d5ff] rounded-none-forced shadow-[0_0_14px_rgba(147,51,234,0.7)]", rank: 3 },
            legendary: { name: "전설",   multiplier: 40, prob: 0.0195, colorClass: "border-[#dc2626] bg-gradient-to-b from-[#b91c1c] to-[#7f1d1d] text-[#fca5a5] rounded-none-forced shadow-[0_0_18px_rgba(220,38,38,0.9)]", rank: 4 },
            mythic:    { name: "신화",   multiplier: 70, prob: 0.0005, colorClass: "mythic-aurora-card rounded-none-forced border-[#f59e0b] shadow-[0_0_25px_rgba(245,158,11,1)] animate-pulse", rank: 5 }
        };

        // Companion pet details
        const PET_PARAMS = {
            slime: {
                name: "슬라임",
                cost: 100,
                goldBonus: 0.10,   // 레벨당 퀴즈 골드 획득 +10%
                desc: "🪙 퀴즈 정답 시 획득하는 골드를 늘려줍니다! (레벨당 +10%)"
            },
            dragon: {
                name: "드래곤",
                cost: 100,
                dps: 10,           // 레벨당 자동 공격 DPS +10 (100렙시 +1,000 DPS)
                desc: "⚔️ 매초 자동으로 몬스터를 공격하는 DPS가 증가합니다!"
            },
            fairy: {
                name: "요정",
                cost: 100,
                forgeBonus: 0.3,   // 레벨당 대장간 강화 성공률 +0.3% (100렙시 +30% 합연산)
                desc: "🔨 대장간 장비 강화 성공 확률을 올려줍니다!"
            }
        };

        // Helper: get specific relic efficiency
        function getEquippedRelicBonus(relicId) {
            if (gameState.equippedRelicId !== relicId) return 0;
            return getRelicTotalValue(relicId);
        }
        
        function getRelicTotalValue(relicId, relicState = null) {
            const r = relicState || (gameState.acquiredRelics || []).find(item => item.id === relicId);
            if (!r) return 0;
            const def = RELIC_DEFINITIONS.find(d => d.id === relicId);
            if (!def) return 0;

            const baseValue = def.baseBonus * 100;
            const rankMults = { normal: 1.0, rare: 1.2, hero: 1.5, legendary: 2.0, mythic: 3.0 };
            const rMult = rankMults[r.grade] || 1.0;
            const starMult = 1.0 + ((r.stars || 0) * 0.1); // +10% per star
            const rawTranscendLvl = Number(gameState.relicTranscendLvl);
            const transcendLvl = Number.isFinite(rawTranscendLvl) ? Math.max(0, Math.floor(rawTranscendLvl)) : 0;
            const transcendMult = 1.0 + (transcendLvl * 0.1); // 한계 초월 레벨당 모든 유물 +10%

            return Math.floor(baseValue * rMult * starMult * transcendMult);
        }

        function getRelicEffectString(relicDef, r) {
            if (!relicDef) return "";
            if (!r) return relicDef.effectDescTemplate.replace("{val}", Math.floor(relicDef.baseBonus * 100));
            const val = getRelicTotalValue(relicDef.id, r);
            return relicDef.effectDescTemplate.replace("{val}", val);
        }

        // ==========================================
        // ⏳ FULLSCREEN GAME LOADING OVERLAY CONTROLLER
        // ==========================================
        let loadingProgressInterval = null;

        function showGameLoadingOverlay(msg = "✨ 여정을 떠나는 중...") {
            const overlay = document.getElementById("gameLoadingOverlay");
            const text = document.getElementById("loadingStatusText");
            const bar = document.getElementById("loadingProgressBar");
            if (text) text.innerText = msg;
            if (bar) bar.style.width = "15%";

            if (overlay) {
                overlay.style.display = "flex";
                overlay.classList.remove("hidden", "opacity-0", "pointer-events-none");
                overlay.classList.add("opacity-100");
            }

            if (loadingProgressInterval) clearInterval(loadingProgressInterval);
            let currentPct = 15;
            loadingProgressInterval = setInterval(() => {
                if (currentPct < 90) {
                    currentPct += Math.floor(Math.random() * 15) + 8;
                    if (bar) bar.style.width = `${Math.min(90, currentPct)}%`;
                }
            }, 120);

            // 🛡️ Safety net: 10초 이내에 로딩이 끝나지 않으면 강제로 로그인 화면으로 전환
            if (_loadingSafetyTimer) clearTimeout(_loadingSafetyTimer);
            _loadingSafetyTimer = setTimeout(function() {
                const overlay = document.getElementById("gameLoadingOverlay");
                if (overlay && overlay.style.display !== "none" && !overlay.classList.contains("hidden")) {
                    console.warn("[VocaHero] 로딩 타임아웃 - 강제로 로그인 화면 전환");
                    _doHideGameLoadingOverlay();
                    if (!gameState.name || gameState.name === "방문자") {
                        setTimeout(() => openModal("loginModal"), 350);
                    }
                }
            }, 10000);
        }

        // Safety timer is now managed inside showGameLoadingOverlay
        let _loadingSafetyTimer = null;

        function _doHideGameLoadingOverlay() {
            clearTimeout(_loadingSafetyTimer);
            if (loadingProgressInterval) {
                clearInterval(loadingProgressInterval);
                loadingProgressInterval = null;
            }
            const overlay = document.getElementById("gameLoadingOverlay");
            const bar = document.getElementById("loadingProgressBar");
            if (bar) bar.style.width = "100%";
            setTimeout(() => {
                if (overlay) {
                    overlay.classList.remove("opacity-100");
                    overlay.classList.add("opacity-0", "pointer-events-none");
                    setTimeout(() => {
                        overlay.style.display = "none";
                        overlay.classList.add("hidden");
                    }, 300);
                }
            }, 250);
        }

        function hideGameLoadingOverlay() {
            _doHideGameLoadingOverlay();
        }

        function openModal(modalId) {
            const el = document.getElementById(modalId);
            if (el) {
                el.classList.remove("hidden");
                el.classList.add("flex");
            }
            if (modalId === "wbVictoryNoticeModal" && typeof syncWorldBossSettlementSupplementalFields === "function") syncWorldBossSettlementSupplementalFields();
            if (modalId === "loginModal" || modalId === "pinVerifyModal" || modalId === "newUserRegisterModal") {
                hideGameLoadingOverlay();
            }
            if (modalId === 'teacherModal') {

                if (savedUrl) {
                    const endpointInput = document.getElementById("apiEndpointInput");
                    if (endpointInput) endpointInput.value = savedUrl;
                }
            }
        }

        function closeModal(modalId) {
            const el = document.getElementById(modalId);
            if (el) {
                el.classList.remove("flex");
                el.classList.add("hidden");
            }
        }


        // Simulated Stage Monsters list (cycled by stage ID)
        const MONSTER_PROFILES = [
            { name: "진흙 구덩이 슬라임", color: "#10b981", hp: 15, isBoss: false },
            { name: "길 잃은 아기 고블린", color: "#a855f7", hp: 35, isBoss: false },
            { name: "심술궂은 협곡 트롤", color: "#b45309", hp: 65, isBoss: false },
            { name: "강철 껍질 스톤골렘", color: "#64748b", hp: 110, isBoss: false },
            { name: "유적의 낡은 해골전사", color: "#94a3b8", hp: 180, isBoss: false },
            { name: "동굴 속 독니 거미", color: "#0653b6", hp: 280, isBoss: false },
            { name: "외딴 성의 떠돌이 유령", color: "#38bdf8", hp: 420, isBoss: false }
        ];

        const BOSS_PROFILES = [
            { name: "지하 영지의 가르고일 로드", color: "#475569", hp: 300, image: "boss_gargoyle.webp" },
            { name: "분노한 용암 벌레", color: "#ef4444", hp: 700, image: "boss_lavaworm.webp" },
            { name: "심해의 악몽 크라켄", color: "#0ea5e9", hp: 1200, image: "boss_kraken.webp" },
            { name: "불사 군주 리치 킹", color: "#a855f7", hp: 2000, image: "boss_lich.webp" },
            { name: "대지의 거수 베히모스", color: "#84cc16", hp: 3500, image: "boss_behemoth.webp" },
            { name: "불멸의 화염 불사조", color: "#f97316", hp: 6000, image: "boss_phoenix.webp" },
            { name: "맹독의 거대 히드라", color: "#22c55e", hp: 10000, image: "boss_hydra.webp" },
            { name: "고대 병기 콜로서스 타이탄", color: "#cbd5e1", hp: 16000, image: "boss_titan.webp" },
            { name: "차원의 종말 고대 드래곤", color: "#fbbf24", hp: 25000, image: "boss_dragon.webp" },
            { name: "파멸의 군주 마왕 데몬 로드", color: "#dc2626", hp: 40000, image: "boss_demon_lord.webp" }
        ];

        let isGoogleScriptActive = false;
        let isBossBattleActive = false;
        let ENABLE_PET_STAGES = true; // 펫 레벨별 10개 성장 이미지 준비 완료 시 true로 설정
        let bossTimeRemaining = GAME_CONFIG.BOSS_TIME_LIMIT;
        let bossTimerInterval = null;
        let bossCriticalsQueue = 0;
        let hasTriggeredCrit30s = false;
        let hasTriggeredCrit3s = false;
        let gameLoopInterval = null;
        let monsterCurrentHp = 10;
        let monsterMaxHp = 10;
        let currentQuizChoices = [];
        let currentQuizCorrectValue = "";
        let currentQuizType = "meaning-choice";

        // Custom Synthesizer using Web Audio API
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

        function playSoundEffect(type) {
            try {
                if (!gameState.soundSettings) {
                    gameState.soundSettings = { masterSoundOn: true, sfxAttack: true, sfxQuiz: true, sfxLevelup: true, sfxSkill: true, masterVolume: 10, volAttack: 10, volQuiz: 10, volLevelup: 10, volSkill: 10 };
                }
                const ss = gameState.soundSettings;
                if (typeof ss.masterSoundOn !== 'undefined' && !ss.masterSoundOn) return;
                if (typeof ss.masterSoundOn === 'undefined' && ss.masterMute) return;

                if ((type === 'click' || type === 'hit' || type === 'crit') && !ss.sfxAttack) return;
                if ((type === 'correct' || type === 'incorrect') && !ss.sfxQuiz) return;
                if ((type === 'levelup' || type === 'reroll') && !ss.sfxLevelup) return;
                if (type === 'skill') {
                    if (typeof ss.sfxSkill !== 'undefined' && !ss.sfxSkill) return;
                }

                const masterScale = (typeof ss.masterVolume !== 'undefined' ? ss.masterVolume : 10) / 10;
                let detailScale = 1;
                if (type === 'click' || type === 'hit' || type === 'crit') {
                    detailScale = (typeof ss.volAttack !== 'undefined' ? ss.volAttack : 10) / 10;
                } else if (type === 'correct' || type === 'incorrect') {
                    detailScale = (typeof ss.volQuiz !== 'undefined' ? ss.volQuiz : 10) / 10;
                } else if (type === 'levelup' || type === 'reroll') {
                    detailScale = (typeof ss.volLevelup !== 'undefined' ? ss.volLevelup : 10) / 10;
                } else if (type === 'skill') {
                    detailScale = (typeof ss.volSkill !== 'undefined' ? ss.volSkill : 10) / 10;
                }
                const volScale = masterScale * detailScale;
                if (volScale <= 0) return;

                // 브라우저 자동재생 정책으로 suspended 상태일 경우 재개
                if (audioCtx.state === 'suspended') {
                    audioCtx.resume();
                }

                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.connect(gain);
                gain.connect(audioCtx.destination);
                const now = audioCtx.currentTime;

                if (type === 'click') {
                    osc.frequency.setValueAtTime(320, now);
                    osc.frequency.exponentialRampToValueAtTime(80, now + 0.12);
                    gain.gain.setValueAtTime(0.2 * volScale, now);
                    gain.gain.exponentialRampToValueAtTime(0.01 * volScale, now + 0.12);
                    osc.start(now);
                    osc.stop(now + 0.12);
                } else if (type === 'hit') {
                    osc.type = 'sawtooth';
                    osc.frequency.setValueAtTime(150, now);
                    osc.frequency.setValueAtTime(50, now + 0.15);
                    gain.gain.setValueAtTime(0.25 * volScale, now);
                    gain.gain.exponentialRampToValueAtTime(0.01 * volScale, now + 0.15);
                    osc.start(now);
                    osc.stop(now + 0.15);
                } else if (type === 'reroll') {
                    // 띠링 스핀 소리
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(600, now);
                    osc.frequency.exponentialRampToValueAtTime(1400, now + 0.08);
                    osc.frequency.exponentialRampToValueAtTime(1000, now + 0.18);
                    osc.frequency.exponentialRampToValueAtTime(1800, now + 0.26);
                    gain.gain.setValueAtTime(0.25 * volScale, now);
                    gain.gain.exponentialRampToValueAtTime(0.01 * volScale, now + 0.28);
                    osc.start(now);
                    osc.stop(now + 0.28);
                } else if (type === 'crit') {
                    // 크리티컬 챙챙 금속음
                    osc.type = 'square';
                    osc.frequency.setValueAtTime(2800, now);
                    osc.frequency.exponentialRampToValueAtTime(1400, now + 0.04);
                    gain.gain.setValueAtTime(0.35 * volScale, now);
                    gain.gain.exponentialRampToValueAtTime(0.01 * volScale, now + 0.18);
                    osc.start(now);
                    osc.stop(now + 0.18);
                    // 두 번째 챙 소리 (잔향)
                    const osc2 = audioCtx.createOscillator();
                    const gain2 = audioCtx.createGain();
                    osc2.connect(gain2);
                    gain2.connect(audioCtx.destination);
                    osc2.type = 'square';
                    osc2.frequency.setValueAtTime(2200, now + 0.06);
                    osc2.frequency.exponentialRampToValueAtTime(900, now + 0.12);
                    gain2.gain.setValueAtTime(0.2 * volScale, now + 0.06);
                    gain2.gain.exponentialRampToValueAtTime(0.01 * volScale, now + 0.22);
                    osc2.start(now + 0.06);
                    osc2.stop(now + 0.22);
                } else if (type === 'correct') {
                    osc.type = 'triangle';
                    osc.frequency.setValueAtTime(440, now);
                    osc.frequency.setValueAtTime(554.37, now + 0.08);
                    osc.frequency.setValueAtTime(659.25, now + 0.16);
                    osc.frequency.setValueAtTime(880, now + 0.24);
                    gain.gain.setValueAtTime(0.18 * volScale, now);
                    gain.gain.exponentialRampToValueAtTime(0.02 * volScale, now + 0.4);
                    osc.start(now);
                    osc.stop(now + 0.4);
                } else if (type === 'incorrect') {
                    osc.type = 'sawtooth';
                    osc.frequency.setValueAtTime(180, now);
                    osc.frequency.setValueAtTime(120, now + 0.25);
                    gain.gain.setValueAtTime(0.3 * volScale, now);
                    gain.gain.exponentialRampToValueAtTime(0.01 * volScale, now + 0.3);
                    osc.start(now);
                    osc.stop(now + 0.3);
                } else if (type === 'levelup') {
                    osc.frequency.setValueAtTime(261.63, now);
                    osc.frequency.setValueAtTime(392, now + 0.06);
                    osc.frequency.setValueAtTime(523.25, now + 0.12);
                    osc.frequency.setValueAtTime(783.99, now + 0.18);
                    osc.frequency.setValueAtTime(1046.50, now + 0.24);
                    gain.gain.setValueAtTime(0.2 * volScale, now);
                    gain.gain.exponentialRampToValueAtTime(0.01 * volScale, now + 0.5);
                    osc.start(now);
                    osc.stop(now + 0.5);
                } else if (type === 'skill') {
                    // 스킬 발동음: 마법 차징 후 폭발하는 화려한 사운드
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(300, now);
                    osc.frequency.exponentialRampToValueAtTime(900, now + 0.08);
                    osc.frequency.exponentialRampToValueAtTime(600, now + 0.15);
                    osc.frequency.exponentialRampToValueAtTime(1200, now + 0.22);
                    osc.frequency.exponentialRampToValueAtTime(800, now + 0.32);
                    gain.gain.setValueAtTime(0.28 * volScale, now);
                    gain.gain.exponentialRampToValueAtTime(0.01 * volScale, now + 0.38);
                    osc.start(now);
                    osc.stop(now + 0.38);
                    // 잔향 고음 추가
                    const oscSkill2 = audioCtx.createOscillator();
                    const gainSkill2 = audioCtx.createGain();
                    oscSkill2.connect(gainSkill2);
                    gainSkill2.connect(audioCtx.destination);
                    oscSkill2.type = 'triangle';
                    oscSkill2.frequency.setValueAtTime(1800, now + 0.1);
                    oscSkill2.frequency.exponentialRampToValueAtTime(2400, now + 0.2);
                    oscSkill2.frequency.exponentialRampToValueAtTime(1200, now + 0.35);
                    gainSkill2.gain.setValueAtTime(0.15 * volScale, now + 0.1);
                    gainSkill2.gain.exponentialRampToValueAtTime(0.01 * volScale, now + 0.4);
                    oscSkill2.start(now + 0.1);
                    oscSkill2.stop(now + 0.4);
                }
            } catch (err) { }
        }

        // ==========================================
        // FIREBASE API CONNECTION DETERMINATOR
        // ==========================================
        

        function getUid(school, grade, classNum, studentNum, name) {
            return `${school}_${grade}_${classNum}_${studentNum}_${name}`;
        }

        function saveApiEndpoint() {
            const endpoint = document.getElementById("apiEndpointInput").value.trim();
            if (endpoint === "") {
                localStorage.removeItem("vocahero_gas_url");
                showToast("🗑️ 연동 주소가 초기화되었습니다. 로컬 모드로 동작합니다.");
            } else {
                if (!endpoint.startsWith("https://script.google.com/")) {
                    showToast("⚠️ 올바른 구글 앱스스크립트 주소 형식이 아닙니다.");
                    return;
                }
                localStorage.setItem("vocahero_gas_url", endpoint);
                showToast("💾 API 연동 주소가 성공적으로 보존되었습니다!");
            }
            checkConnectionState();
        }

        const MOCK_WORDS = {
            "3": [
                { word: "apple", meaning: "사과" }, { word: "banana", meaning: "바나나" }, { word: "pencil", meaning: "연필" },
                { word: "desk", meaning: "책상" }, { word: "cat", meaning: "고양이" }, { word: "dog", meaning: "개" },
                { word: "school", meaning: "학교" }, { word: "friend", meaning: "친구" }, { word: "mother", meaning: "어머니" },
                { word: "happy", meaning: "행복한" }
            ],
            "4": [
                { word: "doctor", meaning: "의사" }, { word: "english", meaning: "영어" }, { word: "orange", meaning: "오렌지" },
                { word: "window", meaning: "창문" }, { word: "family", meaning: "가족" }, { word: "summer", meaning: "여름" },
                { word: "winter", meaning: "겨울" }, { word: "teacher", meaning: "선생님" }, { word: "morning", meaning: "아침" },
                { word: "yellow", meaning: "노란색" }
            ],
            "5": [
                { word: "beautiful", meaning: "아름다운" }, { word: "different", meaning: "다른" }, { word: "important", meaning: "중요한" },
                { word: "remember", meaning: "기억하다" }, { word: "tomorrow", meaning: "내일" }, { word: "station", meaning: "역" },
                { word: "weather", meaning: "날씨" }, { word: "subject", meaning: "과목" }, { word: "country", meaning: "나라" },
                { word: "picture", meaning: "사진" }
            ],
            "6": [
                { word: "experience", meaning: "경험" }, { word: "challenge", meaning: "도전" }, { word: "environment", meaning: "환경" },
                { word: "volunteer", meaning: "자원봉사자" }, { word: "information", meaning: "정보" }, { word: "traditional", meaning: "전통적인" },
                { word: "international", meaning: "국제의" }, { word: "language", meaning: "언어" }, { word: "understand", meaning: "이해하다" },
                { word: "protect", meaning: "보호하다" }
            ]
        };

        function selectStartingAvatar(gender) {
            gameState.avatarType = gender;
            const maleBtn = document.getElementById("genderMaleBtn");
            const femaleBtn = document.getElementById("genderFemaleBtn");

            if (gender === 'male') {
                maleBtn.className = "py-3 bg-indigo-950 border-2 border-indigo-500 text-white font-extrabold rounded-xl text-xs flex flex-col items-center gap-1 transition shadow-lg shadow-indigo-950";
                femaleBtn.className = "py-3 bg-slate-950 border border-slate-800 text-slate-400 font-extrabold rounded-xl text-xs flex flex-col items-center gap-1 hover:bg-indigo-950 transition";
            } else {
                femaleBtn.className = "py-3 bg-indigo-950 border-2 border-indigo-500 text-white font-extrabold rounded-xl text-xs flex flex-col items-center gap-1 transition shadow-lg shadow-indigo-950";
                maleBtn.className = "py-3 bg-slate-950 border border-slate-800 text-slate-400 font-extrabold rounded-xl text-xs flex flex-col items-center gap-1 hover:bg-indigo-950 transition";
            }
        }

        // --- NEIS School Search Logic ---
        let selectedSchoolName = "";
        let neisDebounceTimer = null;

        document.addEventListener('DOMContentLoaded', () => {
            const inputSchool = document.getElementById('inputSchool');
            const resultsUl = document.getElementById('schoolSearchResults');
            if (inputSchool) {
                inputSchool.addEventListener('input', function(e) {
                    const query = e.target.value.trim();
                    
                    // 만약 유저가 직접 입력창을 수정하면 선택된 학교 초기화
                    selectedSchoolName = "";
                    
                    if (query.length < 2) {
                        resultsUl.classList.add('hidden');
                        return;
                    }

                    clearTimeout(neisDebounceTimer);
                    neisDebounceTimer = setTimeout(() => {
                        fetch(`https://open.neis.go.kr/hub/schoolInfo?KEY=04f275416e194b508bbd3ad51e42d887&Type=json&pIndex=1&pSize=20&SCHUL_KND_SC_NM=${encodeURIComponent('초등학교')}&SCHUL_NM=${encodeURIComponent(query)}`)
                        .then(res => res.json())
                        .then(data => {
                            resultsUl.innerHTML = '';
                            if (data.schoolInfo && data.schoolInfo[1] && data.schoolInfo[1].row) {
                                const schools = data.schoolInfo[1].row.filter(s => s.SCHUL_KND_SC_NM === '초등학교');
                                schools.forEach(school => {
                                    const li = document.createElement('li');
                                    li.className = "px-3 py-2 cursor-pointer hover:bg-[#3c3c3c] text-xs font-bold text-white border-b border-[#3c3c3c] last:border-0";
                                    li.innerHTML = `${school.SCHUL_NM} <span class="text-[10px] text-gray-400 ml-1">(${school.LCTN_SC_NM})</span>`;
                                    li.onclick = () => {
                                        inputSchool.value = school.SCHUL_NM;
                                        selectedSchoolName = school.SCHUL_NM;
                                        resultsUl.classList.add('hidden');
                                    };
                                    resultsUl.appendChild(li);
                                });
                                resultsUl.classList.remove('hidden');
                            } else {
                                const li = document.createElement('li');
                                li.className = "px-3 py-2 text-xs font-bold text-gray-500";
                                li.innerText = "검색 결과가 없습니다.";
                                resultsUl.appendChild(li);
                                resultsUl.classList.remove('hidden');
                            }
                        })
                        .catch(err => {
                            console.error("NEIS API Error:", err);
                        });
                    }, 300); // 300ms debounce
                });

                // 사용자가 검색결과 바깥을 클릭하면 닫기
                document.addEventListener('click', function(e) {
                    if (e.target !== inputSchool && e.target !== resultsUl) {
                        resultsUl.classList.add('hidden');
                    }
                });
            }
        });
        // -------------------------------

        function checkStudentAccount() {
            if (!selectedSchoolName) {
                showToast("⚠️ 학교를 검색하여 올바른 학교를 선택해 주세요!");
                return;
            }

            const grade = parseInt(document.getElementById("inputGrade").value);
            const classNum = parseInt(document.getElementById("inputClass").value);
            const studentNum = parseInt(document.getElementById("inputNumber").value);
            // 제출 시점에 특수문자만 제거 (한글 IME 조합은 방해하지 않음)
            const rawName = document.getElementById("inputName").value.trim();
            const name = rawName.replace(/[^가-힣ㄱ-ㅎㅏ-ㅣa-zA-Z0-9\s]/g, '');
            document.getElementById("inputName").value = name;

            if (!classNum || classNum < 1 || !studentNum || studentNum < 1 || !name) {
                showToast("⚠️ 반, 번호는 1 이상의 양수 숫자이어야 하며, 이름도 입력해야 합니다!");
                return;
            }

            // Save recently entered student info to localStorage cache
            localStorage.setItem("vocahero_last_student", JSON.stringify({ schoolName: selectedSchoolName, grade, classNum, studentNum, name }));

            tempCredentials = { schoolName: selectedSchoolName, grade, classNum, studentNum, name };
            showToast("⏳ 계정 정보 확인 중...");

            if (window._fbReady) {
                const uid = getUid(selectedSchoolName, grade, classNum, studentNum, name);
                window._fbGetDoc(window._fbDoc(window._fbDb, "users", uid)).then(async docSnap => {
                    closeModal("loginModal");
                    
                    if (!docSnap.exists()) {
                        // 레거시 계정(학교명 Unknown) 하위 호환성 체크
                        const legacyUid = getUid("Unknown", grade, classNum, studentNum, name);
                        try {
                            const legacyDocSnap = await window._fbGetDoc(window._fbDoc(window._fbDb, "users", legacyUid));
                            if (legacyDocSnap.exists()) {
                                docSnap = legacyDocSnap;
                            }
                        } catch(e) {}
                    }
                    
                    if (docSnap.exists()) {
                        const data = docSnap.data();
                        if (data.password) {
                            openModal("pinVerifyModal");
                            document.getElementById("verifyPinInput").value = "";
                            document.getElementById("verifyPinInput").focus();
                        } else {
                            openModal("newUserRegisterModal");
                            document.getElementById("newPinInput").value = "";
                            if (typeof data.gold !== 'undefined' || typeof data.stage !== 'undefined') {
                                showToast("🔓 기존 계정이 확인되었습니다. 계정을 보호할 PIN 4자리를 새로 설정하세요!");
                            } else {
                                showToast("🔑 첫 접속입니다. 사용할 PIN 4자리를 설정하세요!");
                            }
                        }
                    } else {
                        openModal("newUserRegisterModal");
                        document.getElementById("newPinInput").value = "";
                    }
                }).catch(err => {
                    console.error("Firebase fetch error:", err);
                    proceedWithLocalCheck(grade, classNum, studentNum, name);
                });
            } else {
                proceedWithLocalCheck(grade, classNum, studentNum, name);
            }
        }

        function proceedWithLocalCheck(grade, classNum, studentNum, name) {
            const cacheKey = `vocahero_${grade}_${classNum}_${studentNum}_${name}`;
            const rawCached = localStorage.getItem(cacheKey); const cached = rawCached ? decodeSaveData(rawCached) : null;
            closeModal("loginModal");
            if (cached) {
                openModal("pinVerifyModal");
                document.getElementById("verifyPinInput").value = "";
                document.getElementById("verifyPinInput").focus();
            } else {
                openModal("newUserRegisterModal");
                document.getElementById("newPinInput").value = "";
            }
        }

        function submitVerifyPin() {
            const password = document.getElementById("verifyPinInput").value.trim();
            if (password.length !== 4 || isNaN(password)) {
                showToast("⚠️ PIN 암호는 4자리 숫자로 입력해야 합니다!");
                return;
            }

            const { schoolName, grade, classNum, studentNum, name } = tempCredentials;
            showGameLoadingOverlay();
            closeModal("pinVerifyModal");

            if (window._fbReady) {
                const uid = getUid(schoolName, grade, classNum, studentNum, name);
                  window._fbGetDoc(window._fbDoc(window._fbDb, "users", uid)).then(async docSnap => {
                      if (!docSnap.exists()) {
                          const legacyUid = getUid("Unknown", grade, classNum, studentNum, name);
                          try {
                              const legacyDocSnap = await window._fbGetDoc(window._fbDoc(window._fbDb, "users", legacyUid));
                              if (legacyDocSnap.exists()) docSnap = legacyDocSnap;
                          } catch(e) {}
                      }
                      
                      if (docSnap.exists()) {
                        const data = docSnap.data();
                        if (String(data.password) !== String(password)) {
                            hideGameLoadingOverlay();
                            openModal("pinVerifyModal");
                            showToast("❌ 비밀번호가 틀렸습니다! 암호를 다시 확인해 주세요.");
                            return;
                        }
                        gameState.schoolName = schoolName;
                        gameState.grade = grade;
                        gameState.classNum = classNum;
                        gameState.studentNum = studentNum;
                        gameState.name = name; // 통신 에러나 누락 시 방문자로 덮어씌워지는 현상 방지
                        syncStateFromServer(data);
                        closeModal("loginModal");
                        closeModal("pinVerifyModal");
                        const sessData = { schoolName, grade, classNum, studentNum, name, password };
                        sessionStorage.setItem("vocahero_active_session", JSON.stringify(sessData));
                        localStorage.setItem("vocahero_active_session", JSON.stringify(sessData));
                        localStorage.setItem("vocahero_last_student", JSON.stringify(sessData));
                        showToast("🏰 원정대 클라우드 계정 로드 성공!");
                    } else {
                        handleLocalVerify(schoolName, grade, classNum, studentNum, name, password);
                    }
                }).catch(err => {
                    console.error("Firebase getDoc error:", err);
                    handleLocalVerify(schoolName, grade, classNum, studentNum, name, password);
                });
            } else {
                handleLocalVerify(schoolName, grade, classNum, studentNum, name, password);
            }
        }

        function handleLocalVerify(schoolName, grade, classNum, studentNum, name, password) {
            showGameLoadingOverlay();
            if (loadLocalSimulation(schoolName, grade, classNum, studentNum, name, password)) {
                closeModal("loginModal");
                closeModal("pinVerifyModal");
                closeModal("newUserRegisterModal");
                sessionStorage.setItem("vocahero_active_session", JSON.stringify({ schoolName, grade, classNum, studentNum, name, password }));
                            localStorage.setItem("vocahero_active_session", JSON.stringify({ schoolName, grade, classNum, studentNum, name, password }));
                showToast("🏰 로컬 원정대 계정 로드 성공!");
                // initGameEngine() 내에서 hideGameLoadingOverlay()가 이미 호출되지만, 안전망으로도 보장
                hideGameLoadingOverlay();
            } else {
                hideGameLoadingOverlay();
                showToast("⚠️ 계정 정보를 불러올 수 없습니다. 다시 로그인해주세요.");
                // 로컬 인증 실패 시 로그인 모달 복원
                openModal("loginModal");
            }
        }

        function submitNewUserRegister() {
            const password = document.getElementById("newPinInput").value.trim();
            if (password.length !== 4 || isNaN(password)) {
                showToast("⚠️ 설정할 암호는 4자리 숫자로 입력해야 합니다!");
                return;
            }

            const { schoolName, grade, classNum, studentNum, name } = tempCredentials;
            showGameLoadingOverlay();
            closeModal("newUserRegisterModal");

            if (window._fbReady) {
                const uid = getUid(schoolName, grade, classNum, studentNum, name);
                  
                  window._fbGetDoc(window._fbDoc(window._fbDb, "users", uid)).then(async docSnap => {
                      if (!docSnap.exists()) {
                          const legacyUid = getUid("Unknown", grade, classNum, studentNum, name);
                          try {
                              const legacyDocSnap = await window._fbGetDoc(window._fbDoc(window._fbDb, "users", legacyUid));
                              if (legacyDocSnap.exists()) docSnap = legacyDocSnap;
                          } catch(e) {}
                      }
                      
                      if (docSnap.exists() && (typeof docSnap.data().gold !== 'undefined' || typeof docSnap.data().stage !== 'undefined')) {
                        // 기존 유저인데 PIN이 없는 경우 (또는 유실된 경우) -> 기존 데이터 복원 후 PIN만 업데이트
                        const data = docSnap.data();
                        syncStateFromServer(data);
                        gameState.password = password;
                        gameState.schoolName = schoolName;
                        window._fbSetDoc(window._fbDoc(window._fbDb, "users", uid), gameState, { merge: true }).then(() => {
                            closeModal("loginModal");
                            const sessData = { schoolName, grade, classNum, studentNum, name, password };
                            sessionStorage.setItem("vocahero_active_session", JSON.stringify(sessData));
                            localStorage.setItem("vocahero_active_session", JSON.stringify(sessData));
                            localStorage.setItem("vocahero_last_student", JSON.stringify(sessData));
                            hideGameLoadingOverlay();
                            showToast("✨ 기존 데이터에 새로운 PIN이 성공적으로 등록되었습니다!");
                            initGameEngine();
                        }).catch(err => {
                            console.error(err);
                            handleLocalRegister(schoolName, grade, classNum, studentNum, name, password);
                        });
                    } else {
                        // 완전 신규 유저
                        loadLocalSimulation(schoolName, grade, classNum, studentNum, name, password);
                        window._fbSetDoc(window._fbDoc(window._fbDb, "users", uid), gameState, { merge: true }).then(() => {
                            closeModal("loginModal");
                            const sessData = { schoolName, grade, classNum, studentNum, name, password };
                            sessionStorage.setItem("vocahero_active_session", JSON.stringify(sessData));
                            localStorage.setItem("vocahero_active_session", JSON.stringify(sessData));
                            localStorage.setItem("vocahero_last_student", JSON.stringify(sessData));
                            hideGameLoadingOverlay();
                            showToast("✨ 새로운 원정대 대원이 등록되었습니다! 환영합니다!");
                        }).catch(err => {
                            console.error(err);
                            handleLocalRegister(schoolName, grade, classNum, studentNum, name, password);
                        });
                    }
                }).catch(err => {
                    console.error("Firebase getDoc error:", err);
                    handleLocalRegister(schoolName, grade, classNum, studentNum, name, password);
                });
            } else {
                handleLocalRegister(schoolName, grade, classNum, studentNum, name, password);
            }
        }

        function handleLocalRegister(schoolName, grade, classNum, studentNum, name, password) {
            if (loadLocalSimulation(schoolName, grade, classNum, studentNum, name, password)) {
                closeModal("newUserRegisterModal");
                sessionStorage.setItem("vocahero_active_session", JSON.stringify({ schoolName, grade, classNum, studentNum, name, password }));
                            localStorage.setItem("vocahero_active_session", JSON.stringify({ schoolName, grade, classNum, studentNum, name, password }));
                            localStorage.setItem("vocahero_last_student", JSON.stringify({ schoolName, grade, classNum, studentNum, name, password }));
                showToast("✨ 로컬 원정대에 새로운 대원이 등록되었습니다!");
            }
        }

        function loadLocalSimulation(schoolName, grade, classNum, studentNum, name, password) {
            const cacheKey = `vocahero_${grade}_${classNum}_${studentNum}_${name}`;
            const rawCached = localStorage.getItem(cacheKey); const cached = rawCached ? decodeSaveData(rawCached) : null;

            if (cached) {
                const parsed = JSON.parse(cached);
                if (parsed.password && String(parsed.password) !== String(password)) {
                    showToast("❌ 비밀번호가 틀렸습니다! 학번이나 암호를 다시 확인하세요.");
                    return false;
                }
                gameState = parsed;
                gameState.schoolName = schoolName;
                gameState.password = password;
                if (!gameState.skillsInventory) gameState.skillsInventory = [];
                if (!gameState.equippedSkills) gameState.equippedSkills = [];
                if (typeof gameState.totalQuizTries === 'undefined') gameState.totalQuizTries = 0;
                if (typeof gameState.totalQuizCorrect === 'undefined') gameState.totalQuizCorrect = 0;
                if (!gameState.masteredWords) gameState.masteredWords = [];
                if (!gameState.wrongWordCounts) gameState.wrongWordCounts = {};
                if (!gameState.wordLearningStats || typeof gameState.wordLearningStats !== "object") gameState.wordLearningStats = {};
                if (!gameState.lockedPotentialSlots) gameState.lockedPotentialSlots = {};
            } else {
                gameState.schoolName = schoolName;
                gameState.grade = grade;
                gameState.classNum = classNum;
                gameState.studentNum = studentNum;
                gameState.name = name;
                gameState.password = password;
                gameState.gold = 0;
                gameState.helmetLvl = 1;
                gameState.armorLvl = 1;
                gameState.weaponLvl = 1;
                gameState.shieldLvl = 1;
                gameState.shoesLvl = 1;
                gameState.petLevels = {};
                gameState.stage = 1;
                gameState.progress = 0;
                gameState.totalQuizTries = 0;
                gameState.totalQuizCorrect = 0;
                gameState.masteredWords = [];
                gameState.currentQuizIndex = 0;
                gameState.skillsInventory = [];
                gameState.equippedSkills = [];
                gameState.wrongWordCounts = {};
                gameState.wordLearningStats = {};
                gameState.lockedPotentialSlots = {};
                gameState.lastSaved = Date.now();
                gameState.tutorialCompleted = false;
                gameState.necklaceLvl = 0;
                gameState.braceletLvl = 0;
                gameState.ringLvl = 0;
                gameState.masteryPoints = 0;
                gameState.gearPotentials = {};
                gameState.acquiredRelics = [];
                gameState.relicTranscendLvl = 0;
            }

            gameState.wordsPool = MOCK_WORDS[String(gameState.grade)] || MOCK_WORDS["3"];
            initGameEngine();
            return true;
        }

        function syncStateFromServer(data) {
            if (!data) return;
            let extra = {};
            if (data.extraData) {
                try {
                    extra = typeof data.extraData === 'string' ? JSON.parse(data.extraData) : data.extraData;
                } catch(e) {
                    console.error("Failed to parse extraData:", e);
                }
            }

            if (data.linkedGoogleUid) {
                gameState.linkedGoogleUid = data.linkedGoogleUid;
                const btn = document.getElementById("btnLinkGoogle");
                if (btn) {
                    btn.innerHTML = '✅ 연동 완료';
                    btn.classList.add("opacity-50", "cursor-not-allowed");
                    btn.onclick = null;
                }
            } else {
                gameState.linkedGoogleUid = null;
                const btn = document.getElementById("btnLinkGoogle");
                if (btn) {
                    btn.innerHTML = '구글 계정 연동';
                    btn.classList.remove("opacity-50", "cursor-not-allowed");
                    btn.onclick = window.linkGoogleAccount;
                }
            }
            
            gameState.password = data.password || gameState.password;
            gameState.schoolName = data.schoolName || gameState.schoolName;
            gameState.grade = data.grade || gameState.grade;
            gameState.rowIndex = data.rowIndex || 0; // 캐싱된 행 번호 저장
            gameState.classNum = data.classNum || gameState.classNum;
            gameState.studentNum = data.studentNum || gameState.studentNum;
            gameState.name = data.name || gameState.name;
            gameState.gold = typeof data.gold !== 'undefined' ? data.gold : gameState.gold;
            gameState.accGold = typeof data.accGold !== 'undefined' ? data.accGold : (data.gold || 0);
            gameState.avatarType = data.avatarType || "male";
            gameState.helmetLvl = data.helmetLvl || 1;
            gameState.armorLvl = data.armorLvl || 1;
            gameState.weaponLvl = data.weaponLvl || 1;
            gameState.shieldLvl = data.shieldLvl || 1;
            gameState.shoesLvl = data.shoesLvl || 1;
            gameState.petLevels = data.petLevels || {};
            gameState.stage = data.stage || 1;
            gameState.progress = data.progress || 0;
            gameState.totalQuizTries = data.totalQuizTries || 0;
            gameState.totalQuizCorrect = data.totalQuizCorrect || 0;
            gameState.masteredWords = extra.masteredWords || data.masteredWords || [];
            
            // Firebase Server Timestamp를 이용해 lastSaved 보정
            if (data.lastSavedServerTime) {
                if (typeof data.lastSavedServerTime.toMillis === 'function') {
                    gameState.lastSaved = data.lastSavedServerTime.toMillis();
                } else if (data.lastSavedServerTime.seconds) {
                    gameState.lastSaved = data.lastSavedServerTime.seconds * 1000;
                } else {
                    gameState.lastSaved = data.lastSavedServerTime;
                }
            } else {
                gameState.lastSaved = data.lastSaved;
            }
            _offlineBaselineSavedAt = Number(gameState.lastSaved || 0);

            gameState.skillsInventory = data.skillsInventory || [];
            gameState.equippedSkills = data.equippedSkills || [];
            gameState.masteryPoints = data.masteryPoints || 0;

            // 💍 50+ 콘텐츠 확장 필드 클라우드 동기화 셋업 (extraData 파싱 지원)
            gameState.necklaceLvl = extra.necklaceLvl || data.necklaceLvl || 0;
            gameState.braceletLvl = extra.braceletLvl || data.braceletLvl || 0;
            gameState.ringLvl = extra.ringLvl || data.ringLvl || 0;
            gameState.acquiredRelics = extra.acquiredRelics || data.acquiredRelics || [];
            gameState.equippedRelicId = extra.equippedRelicId || data.equippedRelicId || null;
            gameState.gearPotentials = extra.gearPotentials || data.gearPotentials || {};
            gameState.isPotentialUnlocked = typeof extra.isPotentialUnlocked !== 'undefined' ? extra.isPotentialUnlocked : (data.isPotentialUnlocked || false);
            gameState.lockedPotentialSlots = extra.lockedPotentialSlots || data.lockedPotentialSlots || {};

            // 📚 정복 단어, 칭호, 퀴즈 통계 복원
            gameState.wrongWordCounts = extra.wrongWordCounts || data.wrongWordCounts || {};
            gameState.wordLearningStats = extra.wordLearningStats || data.wordLearningStats || {};
            gameState.equippedTitle = extra.equippedTitle || data.equippedTitle || "";
            gameState.wbTitle = extra.wbTitle || data.wbTitle || "";
            gameState.unlockedTitles = extra.unlockedTitles || data.unlockedTitles || [];
            gameState.bossTokens = extra.bossTokens || data.bossTokens || 0;
            gameState.relicEssence = extra.relicEssence || data.relicEssence || 0;
            const savedRelicTranscendLvl = Number(extra.relicTranscendLvl ?? data.relicTranscendLvl ?? 0);
            gameState.relicTranscendLvl = Number.isFinite(savedRelicTranscendLvl)
                ? Math.max(0, Math.floor(savedRelicTranscendLvl))
                : 0;
            gameState.totalQuizTries = extra.totalQuizTries || data.totalQuizTries || 0;
            gameState.totalQuizCorrect = extra.totalQuizCorrect || data.totalQuizCorrect || 0;
            // 화운드 설정: 저장된 값을 불러오되, 없는 필드는 안전하게 디폴트로 시독
            const savedSS = extra.soundSettings || data.soundSettings || {};
            gameState.soundSettings = {
                masterSoundOn: typeof savedSS.masterSoundOn !== 'undefined' ? savedSS.masterSoundOn : (typeof savedSS.masterMute !== 'undefined' ? !savedSS.masterMute : true),
                masterMute: typeof savedSS.masterMute !== 'undefined' ? savedSS.masterMute : false,
                sfxAttack: typeof savedSS.sfxAttack !== 'undefined' ? savedSS.sfxAttack : true,
                sfxQuiz: typeof savedSS.sfxQuiz !== 'undefined' ? savedSS.sfxQuiz : true,
                sfxLevelup: typeof savedSS.sfxLevelup !== 'undefined' ? savedSS.sfxLevelup : true,
                masterVolume: typeof savedSS.masterVolume !== 'undefined' ? savedSS.masterVolume : 10,
                volAttack: typeof savedSS.volAttack !== 'undefined' ? savedSS.volAttack : 10,
                volQuiz: typeof savedSS.volQuiz !== 'undefined' ? savedSS.volQuiz : 10,
                volLevelup: typeof savedSS.volLevelup !== 'undefined' ? savedSS.volLevelup : 10
            };
            gameState.tutorialCompleted = typeof extra.tutorialCompleted !== 'undefined' ? extra.tutorialCompleted : (data.tutorialCompleted || false);

            window._syncedFromServerThisSession = true;

            fetchWordsFromSpreadsheet();
            
            // 데이터 동기화 완료 후 오프라인 보상 계산 1회 실행
            if (typeof calculateOfflineGains === 'function') {
                setTimeout(calculateOfflineGains, 500); // 렌더링 및 UI 안정화 후 계산
            }
        }



        function compactGearPotentials(potentialsObj) {
            if (!potentialsObj || typeof potentialsObj !== "object") return {};
            const keys = ["helmet", "armor", "weapon", "shield", "shoes"];
            const compactObj = {};
            keys.forEach(k => {
                if (Array.isArray(potentialsObj[k])) {
                    compactObj[k] = potentialsObj[k].map(opt => {
                        if (!opt) return null;
                        return {
                            grade: opt.grade || "normal",
                            type: opt.type,
                            value: opt.value || 0
                        };
                    });
                }
            });
            return compactObj;
        }

        function buildExtraDataString() {
            return JSON.stringify({
                necklaceLvl: gameState.necklaceLvl || 0,
                braceletLvl: gameState.braceletLvl || 0,
                ringLvl: gameState.ringLvl || 0,
                acquiredRelics: gameState.acquiredRelics || [],
                equippedRelicId: gameState.equippedRelicId || null,
                gearPotentials: compactGearPotentials(gameState.gearPotentials),
                isPotentialUnlocked: gameState.isPotentialUnlocked || false,
                lockedPotentialSlots: gameState.lockedPotentialSlots || {},
                equippedTitle: gameState.equippedTitle || "",
                wbTitle: gameState.wbTitle || "",
                unlockedTitles: gameState.unlockedTitles || [],
                bossTokens: gameState.bossTokens || 0,
                relicTranscendLvl: Math.max(0, Math.floor(Number(gameState.relicTranscendLvl) || 0)),
                totalQuizTries: gameState.totalQuizTries || 0,
                totalQuizCorrect: gameState.totalQuizCorrect || 0,
                masteredWords: gameState.masteredWords || [],
                wrongWordCounts: gameState.wrongWordCounts || {},
                wordLearningStats: gameState.wordLearningStats || {},
                soundSettings: gameState.soundSettings || { masterMute: false, sfxAttack: true, sfxQuiz: true, sfxLevelup: true }
            });
        }

        function getReadableSaveMetadata() {
            let mStr = "";
            if (gameState.masteredWords) {
                mStr = gameState.masteredWords.map(w => w.word).join(', ');
            }
            let wStr = "";
            if (gameState.wrongWordCounts) {
                const wObj = gameState.wrongWordCounts;
                wStr = Object.keys(wObj)
                    .map(k => ({ w: k, c: wObj[k] }))
                    .sort((a, b) => b.c - a.c)
                    .map(item => `${item.w}(${item.c}회)`)
                    .join(', ');
            }
            return { mastered: mStr, wrong: wStr };
        }

        function saveSessionToCloud(quiet = false) {
            saveLocalCache();
            // 새 보안 계정은 개인정보 기반 users 문서가 아니라 인증 UID 기반 저장 API를 사용한다.
            if (gameState.isAnonymousStudent && typeof window._secureStudentSave === "function") {
                return window._secureStudentSave(Boolean(quiet));
            }
            if (!window._fbReady) {
                showToast("💾 진행 상황이 로컬에 보존되었습니다.");
                return;
            }

            // schoolName이 없거나 Unknown이면 저장 방지
            if (!gameState.schoolName || gameState.schoolName === "Unknown"
                || !gameState.name || gameState.name === "방문자" || !gameState.grade) {
                showToast("💾 진행 상황이 로컬에 보존되었습니다.");
                return;
            }
            
            const uid = getUid(gameState.schoolName, gameState.grade, gameState.classNum, gameState.studentNum, gameState.name);
            gameState.lastSaved = Date.now();

            // linkedGoogleUid가 null/undefined면 저장 객체에서 제외해 Firestore 기존 값 보존
            const saveData = Object.assign({}, gameState);
            if (!saveData.linkedGoogleUid) {
                delete saveData.linkedGoogleUid;
            }
            // 오프라인 보상 계산을 위한 서버 타임스탬프 기록
            saveData.lastSavedServerTime = window._fbServerTimestamp();

            window._fbSetDoc(window._fbDoc(window._fbDb, "users", uid), saveData, { merge: true }).then(() => {
                showToast("⚔️ 진행 상황이 영웅의 영혼에 각인되었습니다.");
            }).catch(err => {
                console.error("Firebase saveSession error:", err);
                showToast("⚠️ 클라우드 저장 실패! 로컬 저장은 유지됩니다.");
            });
        }

        let wordPoolLoadVersion = 0;

        async function loadAssignedWordPacks() {
            const ids = Array.isArray(gameState.assignedWordPackIds) && gameState.assignedWordPackIds.length
                ? gameState.assignedWordPackIds
                : (gameState.assignedWordPackId ? [gameState.assignedWordPackId] : []);
            if (!ids.length) return null;
            const response = await fetch('data/word-packs.json?v=20260809-21', { cache: 'force-cache' });
            if (!response.ok) throw new Error('단어팩 파일을 불러오지 못했어요. (' + response.status + ')');
            const catalog = await response.json();
            const byId = new Map((Array.isArray(catalog.packs) ? catalog.packs : []).map((pack) => [pack.id, pack]));
            const merged = new Map();
            ids.forEach((id) => {
                const pack = byId.get(id);
                if (!pack || !Array.isArray(pack.words)) return;
                pack.words.forEach((entry) => {
                    const key = String(entry?.word || '').trim().toLowerCase();
                    if (key && entry?.meaning && !merged.has(key)) merged.set(key, { word: String(entry.word).trim(), meaning: String(entry.meaning).trim() });
                });
            });
            if (!merged.size) throw new Error('배정된 단어팩을 찾지 못했어요.');
            return { words: [...merged.values()], source: ids.join('+') };
        }
        async function fetchWordsFromSpreadsheet() {
            const loadVersion = ++wordPoolLoadVersion;
            const gradeStr = String(gameState.grade);
            const finish = (words, source) => {
                if (loadVersion !== wordPoolLoadVersion) return false;
                gameState.wordsPool = words;
                gameState.currentQuizIndex = gameState.progress % (gameState.wordsPool.length || 1);
                console.log(`[WordsPool] source: ${source}, grade: ${gameState.grade}, words: ${gameState.wordsPool.length}`);
                initGameEngine();
                return true;
            };

            if ((Array.isArray(gameState.assignedWordPackIds) && gameState.assignedWordPackIds.length) || gameState.assignedWordPackId) {
                try {
                    const assignment = await loadAssignedWordPacks();
                    if (assignment && finish(assignment.words, assignment.source)) return;
                } catch (err) {
                    console.warn('배정 단어팩 로드 실패로 학년 기본 목록을 사용합니다.', err);
                }
            }
            try {
                if (!window._fbReady) {
                    finish(MOCK_WORDS[gradeStr] || MOCK_WORDS['4'], 'local fallback');
                    return;
                }
                const wordsDoc = await window._fbGetDoc(window._fbDoc(window._fbDb, 'game_data', 'words'));
                if (wordsDoc.exists()) {
                    const data = wordsDoc.data();
                    if (Array.isArray(data['grade_' + gradeStr]) && data['grade_' + gradeStr].length > 0) {
                        finish(data['grade_' + gradeStr], `grade-${gradeStr}-current`);
                    } else {
                        finish(MOCK_WORDS[gradeStr] || MOCK_WORDS['4'], 'local fallback');
                        setTimeout(() => showToast(`${gradeStr}학년 단어 목록을 찾지 못해 임시 목록을 사용합니다.`), 2000);
                    }
                } else {
                    finish(MOCK_WORDS[gradeStr] || MOCK_WORDS['4'], 'local fallback');
                    setTimeout(() => showToast('공유 단어 목록을 찾지 못해 임시 목록을 사용합니다.'), 2000);
                }
            } catch (err) {
                console.error('Firebase words fetch error:', err);
                finish(MOCK_WORDS[gradeStr] || MOCK_WORDS['4'], 'local fallback');
                setTimeout(() => showToast('단어 목록을 불러오지 못해 임시 목록을 사용합니다.'), 2000);
            }
        }

        function drawHeroAvatar() {
            const h = gameState;
            const isMale = h.avatarType === "male";
            const svg = document.getElementById("heroSvg");

            // AI 생성 픽셀 아트 이미지 베이스
            const imageUrl = isMale ? "media/player/male_warrior.webp" : "media/player/female_warrior.webp";

            let overlays = "";

            // 대장간 30강 확장 색상 및 오라 등급:
            // 1-4: 무광 철 (Gray)
            // 5-9: 청동 (Bronze)
            // 10-14: 실버 (Silver)
            // 15-19: 골드 (Gold)
            // 20-23: 사파이어 (Sapphire Blue)
            // 24-26: 루비 크림슨 (Ruby Red)
            // 27-29: 암흑 자수정 (Mythic Purple)
            // 30강: 오로라 코스믹 신화 (Aurora Cyan/Gold)
            const getRankColor = (lvl) => {
                if (lvl >= 30) return { main: "#00f0ff", glow: "#ffd700", stroke: "#ffffff", aura: "shadow-[0_0_20px_#00f0ff]" };
                if (lvl >= 27) return { main: "#a855f7", glow: "#d8b4fe", stroke: "#f3e8ff", aura: "shadow-[0_0_15px_#a855f7]" };
                if (lvl >= 24) return { main: "#ef4444", glow: "#fca5a5", stroke: "#ffe4e4", aura: "shadow-[0_0_12px_#ef4444]" };
                if (lvl >= 20) return { main: "#0284c7", glow: "#38bdf8", stroke: "#bae6fd", aura: "shadow-[0_0_10px_#0284c7]" };
                if (lvl >= 15) return { main: "#eab308", glow: "#fde047", stroke: "#fef08a", aura: "shadow-[0_0_8px_#eab308]" };
                if (lvl >= 10) return { main: "#94a3b8", glow: "#cbd5e1", stroke: "#f8fafc", aura: "" };
                if (lvl >= 5)  return { main: "#d97706", glow: "#fbbf24", stroke: "#fef3c7", aura: "" };
                return { main: "#64748b", glow: "#94a3b8", stroke: "#cbd5e1", aura: "" };
            };

            // 1. Helmet Overlay (Level >= 1)
            if (h.helmetLvl >= 1) {
                const colors = getRankColor(h.helmetLvl);
                let extra = "";
                if (h.helmetLvl >= 7) extra += `<path d="M50 8 L50 20" stroke="${colors.stroke}" stroke-width="2" class="animate-pulse" />`;
                if (h.helmetLvl >= 10) extra += `<path d="M45 5 C45 0, 55 0, 55 5 C55 12, 50 18, 50 18 C50 18, 45 12, 45 5 Z" fill="#ff4d4d" class="animate-pulse" opacity="0.9" />`;
                
                overlays += `
                    <!-- High-quality Helmet Base -->
                    <path d="M40 33 C40 12, 60 12, 60 33 L62 38 L38 38 Z" fill="${colors.main}" stroke="#111" stroke-width="1.5" stroke-linejoin="round"/>
                    <path d="M43 22 L57 22 L54 35 L46 35 Z" fill="#111" />
                    <!-- Visor Slits -->
                    <rect x="46" y="24" width="8" height="2" fill="${colors.glow}" class="${h.helmetLvl >= 8 ? 'animate-pulse' : ''}" />
                    <rect x="46" y="28" width="8" height="2" fill="${colors.glow}" class="${h.helmetLvl >= 8 ? 'animate-pulse' : ''}" />
                    ${extra}
                `;
            }

            // 2. Armor Overlay (Level >= 1)
            if (h.armorLvl >= 1) {
                const colors = getRankColor(h.armorLvl);
                let extra = "";
                if (h.armorLvl >= 7) extra += `<path d="M50 48 L50 64" stroke="${colors.stroke}" stroke-width="2" class="animate-pulse" />`;
                if (h.armorLvl >= 10) extra += `<circle cx="50" cy="55" r="5" fill="#ff4d4d" class="animate-pulse" /><circle cx="50" cy="55" r="2" fill="#fff" />`;

                overlays += `
                    <!-- Pauldrons -->
                    <path d="M32 42 C32 38, 40 38, 40 46 Z" fill="${colors.glow}" stroke="#111" stroke-width="1.5" />
                    <path d="M68 42 C68 38, 60 38, 60 46 Z" fill="${colors.glow}" stroke="#111" stroke-width="1.5" />
                    <!-- Chestplate -->
                    <path d="M38 44 C38 38, 62 38, 62 44 L64 56 C64 70, 50 78, 50 78 C50 78, 36 70, 36 56 Z" fill="${colors.main}" stroke="#111" stroke-width="1.5" stroke-linejoin="round"/>
                    <!-- Belt -->
                    <rect x="40" y="66" width="20" height="4" fill="#333" stroke="#111" stroke-width="1.5" />
                    <rect x="47" y="64" width="6" height="8" fill="${colors.stroke}" stroke="#111" stroke-width="1.5" />
                    ${extra}
                `;
            }

            // 3. Weapon Overlay (Level >= 1)
            if (h.weaponLvl >= 1) {
                const colors = getRankColor(h.weaponLvl);
                let extra = "";
                let tipY = 30; // base length
                if (h.weaponLvl >= 4) tipY = 20;
                if (h.weaponLvl >= 7) tipY = 10;
                if (h.weaponLvl >= 10) tipY = 0;

                if (h.weaponLvl >= 10) {
                    extra += `<circle cx="20" cy="72" r="3" fill="#ff4d4d" class="animate-pulse" />`;
                }

                overlays += `
                    <!-- High-quality Sword -->
                    <!-- Blade -->
                    <path d="M17 70 L23 70 L22 ${tipY+10} L20 ${tipY} L18 ${tipY+10} Z" fill="${colors.main}" stroke="#111" stroke-width="1.5" stroke-linejoin="round" />
                    <!-- Crossguard -->
                    <rect x="10" y="70" width="20" height="4" fill="${colors.glow}" stroke="#111" stroke-width="1.5" rx="2" />
                    <!-- Hilt -->
                    <rect x="18" y="74" width="4" height="12" fill="#5c4033" stroke="#111" stroke-width="1.5" />
                    <!-- Pommel -->
                    <circle cx="20" cy="88" r="4" fill="${colors.stroke}" stroke="#111" stroke-width="1.5" />
                    <!-- Edge highlight -->
                    <line x1="20" y1="70" x2="20" y2="${tipY+10}" stroke="#fff" stroke-width="1" opacity="0.6" />
                    ${extra}
                `;
            }

            // 4. Shield Overlay (Level >= 1)
            if (h.shieldLvl >= 1) {
                const colors = getRankColor(h.shieldLvl);
                let extra = "";
                if (h.shieldLvl >= 5) extra += `<circle cx="80" cy="65" r="5" fill="${colors.glow}" class="animate-pulse" stroke="#111" stroke-width="1" />`;
                if (h.shieldLvl >= 10) extra += `<path d="M80 50 L80 80 M70 65 L90 65" stroke="#ff4d4d" stroke-width="2" class="animate-pulse" />`;

                overlays += `
                    <!-- High-quality Kite Shield -->
                    <path d="M68 55 C68 50, 92 50, 92 55 C92 70, 80 85, 80 85 C80 85, 68 70, 68 55 Z" fill="${colors.main}" stroke="#111" stroke-width="1.5" stroke-linejoin="round" />
                    <path d="M72 57 C72 54, 88 54, 88 57 C88 68, 80 79, 80 79 C80 79, 72 68, 72 57 Z" fill="none" stroke="${colors.stroke}" stroke-width="1.5" opacity="0.9" />
                    ${extra}
                `;
            }

            // 5. Shoes/Boots Overlay (Level >= 1)
            let shoesLvl = h.shoesLvl || h.armorLvl; // Fallback to armorLvl if shoesLvl doesn't exist separately
            if (shoesLvl >= 1) {
                const colors = getRankColor(shoesLvl);
                let extra = "";
                if (shoesLvl >= 10) extra += `<polygon points="35,112 40,118 45,112" fill="#ff4d4d" class="animate-pulse" /><polygon points="55,112 60,118 65,112" fill="#ff4d4d" class="animate-pulse" />`;

                overlays += `
                    <!-- High-quality Boots -->
                    <!-- Left Boot -->
                    <path d="M33 100 L44 100 L45 110 L47 114 L33 114 Z" fill="${colors.main}" stroke="#111" stroke-width="1.5" stroke-linejoin="round" />
                    <!-- Right Boot -->
                    <path d="M56 100 L67 100 L67 114 L53 114 L55 110 Z" fill="${colors.main}" stroke="#111" stroke-width="1.5" stroke-linejoin="round" />
                    <!-- Knee guards -->
                    <circle cx="39" cy="100" r="3" fill="${colors.glow}" stroke="#111" stroke-width="1" />
                    <circle cx="61" cy="100" r="3" fill="${colors.glow}" stroke="#111" stroke-width="1" />
                    ${extra}
                `;
            }

            const innerHtml = `
                <image href="${imageUrl}" x="0" y="0" width="100" height="120" preserveAspectRatio="xMidYMid meet" />
                ${overlays}
            `;

            svg.innerHTML = innerHtml;

            const wbSvg = document.getElementById("wbHeroSvg");
            if (wbSvg) {
                wbSvg.innerHTML = innerHtml;
            }
        }

        function drawPetCompanion() {
            if (!gameState.petLevels) {
                gameState.petLevels = {};
            }

            const petKeys = ['slime', 'dragon', 'fairy'];
            petKeys.forEach(type => {
                const svg = document.getElementById(`petSvg_${type}`);
                const container = document.getElementById(`petContainer_${type}`);
                if (!svg || !container) return;

                const level = gameState.petLevels[type] || 0;
                let imageUrl = "";

                if (level > 0) {
                    if (ENABLE_PET_STAGES) {
                        const stage = Math.min(10, Math.ceil(level / 10)); // 1 to 10 stages
                        imageUrl = type === 'dragon' ? `media/pet_dragon/pet_dragon_${stage}.webp` : `media/pet_${type}/pet_${type}_${stage}.webp`;
                    } else {
                        imageUrl = type === 'dragon' ? `media/pet_dragon/pet_dragon_1.webp` : `media/pet_${type}/pet_${type}_1.webp`;
                    }
                }

                if (imageUrl) {
                    const level = gameState.petLevels[type] || 0;

                    // 1. Level-based physical size scaling
                    let width = 50;
                    let height = 60;
                    let x = 25;
                    let y = 30;

                    if (level >= 70) {
                        width = 100;
                        height = 120;
                        x = 0;
                        y = 0;
                    } else if (level >= 40) {
                        width = 85;
                        height = 102;
                        x = 7;
                        y = 9;
                    } else if (level >= 20) {
                        width = 68;
                        height = 82;
                        x = 16;
                        y = 19;
                    }

                    const fallbackUrl = type === 'dragon' ? `media/pet_dragon/pet_dragon_1.webp` : `media/pet_${type}/pet_${type}_1.webp`;
                    
                    // 슬라임(좌측 펫)은 오른쪽(중앙)을 바라보고, 드래곤(우측 펫)은 왼쪽(중앙)을 바라보도록 180도 좌우 반전
                    let imgTransform = "";
                    if (type === 'slime' || type === 'dragon') {
                        imgTransform = `transform="scale(-1, 1)" transform-origin="${x + width/2}px ${y + height/2}px"`;
                    }

                    // 100레벨 맥스 펫: 펫 본체 이미지는 100% 선명하게 유지하고, 뒷배경 오로라 후광(Aura Glow Halo) 원에만 살아숨쉬는 몽환적 pulsate 오로라 애니메이션 적용!
                    let auraOverlay = "";
                    if (level >= 100) {
                        auraOverlay = `
                            <defs>
                                <radialGradient id="petAurora_${type}" cx="50%" cy="50%" r="50%">
                                    <stop offset="0%" stop-color="#ffd700" stop-opacity="0.85" />
                                    <stop offset="40%" stop-color="#ec4899" stop-opacity="0.5" />
                                    <stop offset="80%" stop-color="#3b82f6" stop-opacity="0.15" />
                                    <stop offset="100%" stop-color="#000000" stop-opacity="0" />
                                </radialGradient>
                            </defs>
                            <circle cx="${x + width/2}" cy="${y + height/2}" r="${Math.max(width, height)/1.7}" fill="url(#petAurora_${type})" class="animate-pulse" />
                        `;
                    }

                    svg.setAttribute("viewBox", `0 0 100 120`);
                    svg.style.overflow = "visible";
                    svg.innerHTML = `
                        ${auraOverlay}
                        <image href="${imageUrl}" onerror="this.setAttribute('href', '${fallbackUrl}')" x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet" ${imgTransform} />
                    `;
                    container.classList.remove("hidden");
                } else {
                    svg.innerHTML = "";
                    container.classList.add("hidden");
                }
            });
        }

        function drawTargetMonster() {
            const svg = document.getElementById("monsterSvg");
            const index = (gameState.stage - 1) % MONSTER_PROFILES.length;
            const baseMonster = isBossBattleActive
                ? BOSS_PROFILES[(gameState.stage - 1) % BOSS_PROFILES.length]
                : MONSTER_PROFILES[index];

            let imageUrl = "";

            if (isBossBattleActive) {
                const bossIndex = (gameState.stage - 1) % BOSS_PROFILES.length;
                imageUrl = `media/bose/${BOSS_PROFILES[bossIndex].image}`;
            } else {
                const monsterIndex = (gameState.stage - 1) % MONSTER_PROFILES.length;
                if (monsterIndex === 0) {
                    imageUrl = "media/monster/monster_slime.webp";
                } else if (monsterIndex === 1) {
                    imageUrl = "media/monster/monster_goblin.webp";
                } else if (monsterIndex === 2) {
                    imageUrl = "media/monster/monster_troll.webp";
                } else if (monsterIndex === 3) {
                    imageUrl = "media/monster/monster_golem.webp";
                } else if (monsterIndex === 4) {
                    imageUrl = "media/monster/monster_skeleton.webp";
                } else if (monsterIndex === 5) {
                    imageUrl = "media/monster/monster_spider.webp";
                } else {
                    imageUrl = "media/monster/monster_ghost.webp";
                }
            }

            const innerHtml = `<image href="${imageUrl}" x="0" y="0" width="100" height="120" preserveAspectRatio="xMidYMid meet" style="mix-blend-mode: screen;" />`;

            svg.innerHTML = innerHtml;
            document.getElementById("monsterNameTag").innerText = isBossBattleActive
                ? `⚠️ [스테이지 보스] ${baseMonster.name}`
                : baseMonster.name;

            const mContainer = document.getElementById("monsterContainer");
            if (isBossBattleActive) {
                mContainer.classList.remove("w-32", "h-32");
                mContainer.classList.add("w-56", "h-56");
            } else {
                mContainer.classList.remove("w-56", "h-56");
                mContainer.classList.add("w-32", "h-32");
            }
        }

        function renderHeroIdentity(root) {
            if (!root) return;
            root.replaceChildren();
            const isBattleTag = root.id === "heroNameTag";
            root.className = isBattleTag
                ? "inline-flex min-w-0 max-w-[220px] items-center justify-center gap-1 align-middle text-[9px] font-bold tracking-wider"
                : "inline-flex min-w-0 max-w-full items-center gap-1 align-middle";
            const guildName = typeof gameState.activeGuildName === "string" ? gameState.activeGuildName.trim() : "";
            const activeTitle = gameState.equippedTitle || gameState.wbTitle || "";
            const titlePresentation = getTitlePresentation(activeTitle);
            const guildRow = isBattleTag ? null : root;
            const heroRow = isBattleTag ? document.createElement("span") : root;
            if (isBattleTag) {
                heroRow.className = "inline-flex min-w-0 max-w-full items-center justify-center gap-1";
            }
            if (guildName && !isBattleTag) {
                const guildLogoUrl = typeof gameState.activeGuildLogoUrl === "string" ? gameState.activeGuildLogoUrl.trim() : "";
                if (guildLogoUrl) {
                    const logo = document.createElement("img");
                    logo.src = guildLogoUrl;
                    logo.alt = "";
                    logo.loading = "lazy";
                    logo.referrerPolicy = "no-referrer";
                    logo.className = "h-6 w-6 shrink-0 rounded-sm border border-sky-400 bg-sky-950/60 object-cover shadow-[0_0_7px_rgba(56,189,248,.55)]";
                    guildRow.append(logo);
                }
                const guild = document.createElement("span");
                guild.className = "inline-block max-w-[100px] shrink-0 truncate border border-sky-400 bg-sky-950/60 px-1.5 py-0.5 text-[10px] text-sky-200 shadow-[0_0_7px_rgba(56,189,248,.65)]";
                guild.textContent = guildName;
                guildRow.append(guild);
            }
            if (activeTitle) {
                const title = document.createElement("span");
                title.className = `inline-block shrink-0 border px-1.5 py-0.5 text-[10px] ${titlePresentation.style}`;
                title.textContent = `[${titlePresentation.name}]`;
                heroRow.append(title);
            }
            const nickname = document.createElement("span");
            nickname.className = "min-w-0 truncate text-white";
            nickname.textContent = gameState.name || "새 용사";
            heroRow.append(nickname);
            if (isBattleTag) {
                root.append(heroRow);
            }
        }
        function refreshHeroIdentity() {
            renderHeroIdentity(document.getElementById("displayStudentName"));
            renderHeroIdentity(document.getElementById("heroNameTag"));
        }
        window.refreshHeroIdentity = refreshHeroIdentity;
        function initGameEngine() {
            // 로그인 완료 후 숨겨두었던 게임 UI 노출
            const antiFlash = document.getElementById("antiFlashStyle");
            if (antiFlash) antiFlash.remove();

            const _userInfoDisplay = document.getElementById("userInfoDisplay");
            if (_userInfoDisplay) _userInfoDisplay.classList.remove("hidden");
            const _nameEl = document.getElementById("displayStudentName");
            if (_nameEl) refreshHeroIdentity();            const _badgeEl = document.getElementById("gradeLevelBadge");
            const displayedLearningGrade = Number(gameState.learningGrade || gameState.grade || 4);
            if (_badgeEl) _badgeEl.innerText = `교과 영단어 ${displayedLearningGrade}학년`;

            if (typeof gameState.skillsInventory === 'string') {
                try { gameState.skillsInventory = JSON.parse(gameState.skillsInventory); } catch(e) { gameState.skillsInventory = []; }
            }
            if (!Array.isArray(gameState.skillsInventory)) gameState.skillsInventory = [];

            if (typeof gameState.equippedSkills === 'string') {
                try { gameState.equippedSkills = JSON.parse(gameState.equippedSkills); } catch(e) { gameState.equippedSkills = []; }
            }
            if (!Array.isArray(gameState.equippedSkills)) gameState.equippedSkills = [];
            if (!gameState.petLevels) {
                gameState.petLevels = {
                    slime: gameState.petType === 'slime' ? (gameState.petLvl || 0) : 0,
                    dragon: gameState.petType === 'dragon' ? (gameState.petLvl || 0) : 0,
                    fairy: gameState.petType === 'fairy' ? (gameState.petLvl || 0) : 0
                };
            }

            drawHeroAvatar();
            drawPetCompanion();
            respawnActiveMonster();
            renderAccessoriesAndRelicsUI();

            // calculateOfflineGains() 호출 보류: 
            // 서버 스펙 동기화 전이라 보상액이 크게 누락되는 현상 방지
            // 대신 로그인 유저는 syncStateFromServer가 끝나고 실행되고, 방문자만 여기서 실행
            if (!gameState.name || gameState.name === "방문자") {
                calculateOfflineGains();
            }

            // Core tick loop 100ms
            if (gameLoopInterval) clearInterval(gameLoopInterval);
            let lastTick = Date.now();
            let goldAccumulator = 0;
            gameLoopInterval = setInterval(() => {
                const now = Date.now();
                const actualDelta = (now - lastTick) / 1000;
                lastTick = now;

                if (actualDelta > 60) {
                    // 앱이 백그라운드에 오래 있다가 활성화됨 -> 오프라인 보상으로 전환
                    calculateOfflineGains(true);
                    return;
                }
                const delta = actualDelta;

                const dps = calculateDPSPower();
                const isCritModalOpen = document.getElementById("criticalDefenseModal") && document.getElementById("criticalDefenseModal").classList.contains("flex");
                if (dps > 0 && !isCritModalOpen) {
                    processCombatDamage(dps * delta);
                }

                // 💡 초당 자동 골드 수당 실시간 통장 가산
                const autoGoldPerSec = calculateAutoGoldPerSec();
                goldAccumulator += autoGoldPerSec * delta;
                if (goldAccumulator >= 1) {
                    const addG = Math.floor(goldAccumulator);
                    goldAccumulator -= addG;
                    const prevGold = gameState.gold || 0;
                    gameState.gold = prevGold + addG;
                    gameState.accGold = (gameState.accGold || prevGold) + addG;
                    const gEl = document.getElementById("goldCount");
                    if (gEl) gEl.innerText = gameState.gold.toLocaleString();
                }

                // 스킬의 재사용 대기시간(쿨타임) 감소
                let skillsChanged = false;
                if (gameState.skillsInventory) {
                    if (typeof gameState.skillsInventory === 'string') {
                        try { gameState.skillsInventory = JSON.parse(gameState.skillsInventory); } catch(e) { gameState.skillsInventory = []; }
                    }
                    if (!Array.isArray(gameState.skillsInventory)) gameState.skillsInventory = [];
                    
                    gameState.skillsInventory.forEach(skill => {
                        if (skill && skill.cooldownRemaining > 0) {
                            skill.cooldownRemaining = Math.max(0, skill.cooldownRemaining - delta);
                            skillsChanged = true;
                        }
                    });
                }
                if (skillsChanged) {
                    updateSkillsCooldownVisuals();
                }
            }, 100);

            buildUpgradeblacksmith();
            buildCompanionPetLab();
            buildSkillTabUI();
            generateQuizCard();
            renderSkillsUI();
            populateMasteredVocabulary();
            refreshStateVisuals();
            checkWorldBossVictoryOnStartup();
            hideGameLoadingOverlay();
            checkTutorialStatus();
        }

        

        function getPotentialStatBonus(type) {
            if (!gameState.gearPotentials || !gameState.isPotentialUnlocked) return 0;
            ensureGearPotentialsStructure();
            let total = 0;
            const keys = ["helmet", "armor", "weapon", "shield", "shoes"];
            keys.forEach(key => {
                const unlocked = getGearUnlockedSlotsCount(key);
                const opts = gameState.gearPotentials[key];
                if (Array.isArray(opts)) {
                    for (let i = 0; i < unlocked; i++) {
                        if (opts[i] && opts[i].type === type) {
                            total += Number(opts[i].value) || 0;
                        }
                    }
                }
            });
            return total;
        }

        function calculateAutoGoldPerSec() {
            const relicGoldBonus = 1.0 + getEquippedRelicBonus("relic_compass") / 100;
            const potentialGold = 1.0 + (getPotentialStatBonus('goldBonus') / 100);
            const stage = gameState.stage || 1;
            const stageBase = stage * 25; // 1스테이지 25G 시작 (선형 증가)
            let slimeAutoGold = 0;
            if (gameState.petLevels && gameState.petLevels['slime']) {
                const slimeLvl = gameState.petLevels['slime'];
                slimeAutoGold = Math.floor(slimeLvl * (stage * 0.5)); // 슬라임 펫 레벨당 초당 자동 골드 획득 보너스 (1/10 튜닝)
            }
            return Math.floor((stageBase + slimeAutoGold) * relicGoldBonus * potentialGold);
        }

        function calculateDPSPower() {
            // 자동 DPS = 대장간 장비 DPS + 드래곤 펫 DPS + 영웅의 반지 DPS (+150/lv) + 유물
            let totalDps = calculateGearDPS();
            if (gameState.petLevels) {
                const dragonLvl = gameState.petLevels['dragon'] || 0;
                if (dragonLvl > 0) {
                    totalDps += PET_PARAMS['dragon'].dps * dragonLvl;
                }
            }
            // 💍 영웅의 반지 (ringLvl) 자동 DPS 보정 (+1500 per level)
            const ringLvl = gameState.ringLvl || 0;
            if (ringLvl > 0) {
                totalDps += ringLvl * 1500;
            }
            // 🏺 고대 지옥룡의 여의주 (relic_orb): 장착 시 초당 자동 DPS 증가
            if (gameState.equippedRelicId === "relic_orb") {
                totalDps = Math.floor(totalDps * (1.0 + getEquippedRelicBonus("relic_orb") / 100));
            }
            return totalDps;
        }

        function calculateGearDPS() {
            let totalDps = 25 * Math.pow(gameState.helmetLvl, 1.45) +
                           60 * Math.pow(gameState.armorLvl, 1.45) +
                           50 * Math.pow(gameState.weaponLvl, 1.45) +
                           40 * Math.pow(gameState.shieldLvl, 1.45) +
                           30 * Math.pow(gameState.shoesLvl, 1.45);
            let base = Math.floor(totalDps) - 205; // 1강일 때 DPS 0부터 시작
            const potentialAtkPct = getPotentialStatBonus('atk');
            return Math.floor(base * (1 + potentialAtkPct / 100));
        }

        function calculateClickAttackPower() {
            let gearClick = GAME_CONFIG.WEAPON_CLICK_MULT * Math.pow(gameState.weaponLvl, GAME_CONFIG.WEAPON_EXPONENT) +
                            GAME_CONFIG.ARMOR_CLICK_MULT * Math.pow(gameState.armorLvl, GAME_CONFIG.ARMOR_EXPONENT) +
                            GAME_CONFIG.SHIELD_CLICK_MULT * Math.pow(gameState.shieldLvl, GAME_CONFIG.SHIELD_EXPONENT) +
                            GAME_CONFIG.SHOES_CLICK_MULT * Math.pow(gameState.shoesLvl, GAME_CONFIG.SHOES_EXPONENT);
            const baseGearPower = Math.floor(gearClick) - 13; // 1강일 때 0
            
            // 스테이지 파워: 후반 갈수록 스무스하게 강력해짐 (다항식)
            const stagePower = Math.floor(20 * Math.pow(gameState.stage || 1, 1.3));
            
            // ⚡ 잠재력 클릭 타격 보정
            const potentialClick = getPotentialStatBonus('clickDmg');
            // 💍 투지의 팔찌 (braceletLvl) 클릭 타격력 보정 (+800 per level)
            const braceletClick = (gameState.braceletLvl || 0) * 800;
            // 🏺 고대 용사의 성검 조각 (relic_sword): 장착 시 클릭 타격력 증가
            const relicMult = 1.0 + (getEquippedRelicBonus("relic_sword") / 100);

            const totalBase = baseGearPower + stagePower + potentialClick + braceletClick;
            return Math.max(1, Math.floor(totalBase * relicMult));
        }

        // ========================================
        // 💤 오프라인 보상 퀴즈 시스템
        // ========================================
        let _offlineGoldPending = 0;
        let _offlineBaselineSavedAt = 0;
        let _offlineQuizState = { questions: [], current: 0, allCorrect: true };

        let _offlineCalculatedOnce = false;

        function calculateOfflineGains(forceRecheck = false) {
            if (_offlineGoldPending > 0) return;
            if (_offlineCalculatedOnce && !forceRecheck) return;
            // 서버 연동 유저인데 아직 동기화가 안 끝났다면 계산 보류
            if (gameState.name && gameState.name !== "방문자" && window._fbReady && !window._syncedFromServerThisSession) {
                return;
            }
            _offlineCalculatedOnce = true;

            if (!gameState.lastSaved) {
                gameState.lastSaved = Date.now();
                saveLocalCache();
                return;
            }
            const now = Date.now();
            const offlineSavedAt = _offlineBaselineSavedAt || Number(gameState.lastSaved || 0);
            const deltaSeconds = Math.floor((now - offlineSavedAt) / 1000);
            _offlineBaselineSavedAt = 0;
            const autoGps = calculateAutoGoldPerSec();

            if (deltaSeconds > 15 && autoGps > 0) {
                const maxSeconds = 3600 * 4;
                const eligible = Math.min(deltaSeconds, maxSeconds);
                const goldGained = Math.floor(autoGps * eligible);

                if (goldGained > 0) {
                    _offlineGoldPending = goldGained;
                    // 단어장이 준비된 경우 퀴즈 모달, 아닌 경우 즉시 지급
                    if (gameState.wordsPool && gameState.wordsPool.length >= 4) {
                        _showOfflineRewardModal(goldGained);
                        return; // 모달이 보상을 처리함
                    } else {
                        // 단어 없으면 그냥 지급
                        const prevGold = gameState.gold || 0;
                        gameState.gold = prevGold + goldGained;
                        gameState.accGold = (gameState.accGold || prevGold) + goldGained;
                        showToast(`💤 오프라인 보상 획득! ${goldGained.toLocaleString()}G 축적!`);
                        _offlineGoldPending = 0;
                        Promise.resolve(saveSessionToCloud(true)).catch(() => {});
                    }
                }
            }
            saveLocalCache();
        }

        function _showOfflineRewardModal(goldGained) {
            const modal = document.getElementById('offlineRewardModal');
            if (!modal) { _grantOfflineGold(1.0); return; }
            // 초기 화면으로 리셋
            document.getElementById('offlineRewardIntro').classList.remove('hidden');
            document.getElementById('offlineQuizArea').classList.add('hidden');
            document.getElementById('offlineResultArea').classList.add('hidden');
            document.getElementById('offlineBaseGoldText').innerText = `+${goldGained.toLocaleString()}G 준비 완료 → 도전 성공 시 +${Math.floor(goldGained * 1.5).toLocaleString()}G!`;
            modal.classList.remove('hidden');
            modal.classList.add('flex');
        }

        function offlineSkipChallenge() {
            // 퀴즈 없이 기본 1배 지급
            const gold = _offlineGoldPending;
            _grantOfflineGold(1.0);
            _showOfflineResult(false, gold);
        }

        function offlineStartChallenge() {
            const pool = gameState.wordsPool || [];
            if (pool.length < 4) { offlineSkipChallenge(); return; }

            // 3문제 무작위 선정
            const shuffled = [...pool].sort(() => Math.random() - 0.5);
            const q1word = shuffled[0], q2word = shuffled[1], q3word = shuffled[2];

            // 오답 보기 재료 (정답 제외 나머지 단어들)
            const rest = shuffled.slice(3);
            function makeMCQChoices(correctWord) {
                const wrongs = rest.filter(w => w.word !== correctWord.word && w.meaning !== correctWord.meaning)
                    .sort(() => Math.random() - 0.5).slice(0, 3).map(w => w.meaning);
                const choices = [correctWord.meaning, ...wrongs].sort(() => Math.random() - 0.5);
                return { choices, correctIdx: choices.indexOf(correctWord.meaning) };
            }

            const mcq1 = makeMCQChoices(q1word);
            const mcq2 = makeMCQChoices(q2word);

            _offlineQuizState = {
                questions: [
                    { type: 'mcq', prompt: `"${q1word.word}"의 뜻은?`, answer: q1word.meaning, choices: mcq1.choices, correctIdx: mcq1.correctIdx },
                    { type: 'mcq', prompt: `"${q2word.word}"의 뜻은?`, answer: q2word.meaning, choices: mcq2.choices, correctIdx: mcq2.correctIdx },
                    { type: 'fib', prompt: `"${q3word.meaning}"을(를) 영어로?`, answer: q3word.word }
                ],
                current: 0,
                allCorrect: true
            };

            document.getElementById('offlineRewardIntro').classList.add('hidden');
            document.getElementById('offlineQuizArea').classList.remove('hidden');
            _renderOfflineQuestion();
        }

        function _renderOfflineQuestion() {
            const { questions, current } = _offlineQuizState;
            const q = questions[current];
            document.getElementById('offlineQuizCounter').innerText = `문제 ${current + 1} / 3`;

            // 문제로 진행할수록 보물상자 열림 (0개=다 닫힘, 3개=다 열림)
            const solved = current;
            const shieldStr = '🎁'.repeat(solved) + '📦'.repeat(3 - solved);
            document.getElementById('offlineQuizHearts').innerText = shieldStr;

            document.getElementById('offlineQuizQuestion').innerText = q.prompt;

            const mcqArea = document.getElementById('offlineMCQArea');
            const fibArea = document.getElementById('offlineFIBArea');

            if (q.type === 'mcq') {
                mcqArea.style.display = 'grid';
                fibArea.classList.add('hidden');
                for (let i = 0; i < 4; i++) {
                    const btn = document.getElementById(`offlineOpt${i}`);
                    btn.innerText = q.choices[i];
                    btn.style.background = 'rgba(30,30,60,0.8)';
                    btn.style.color = '#d1d5db';
                    btn.style.border = '1px solid rgba(99,102,241,0.5)';
                    btn.disabled = false;
                }
            } else {
                mcqArea.style.display = 'none';
                fibArea.classList.remove('hidden');
                const inp = document.getElementById('offlineFIBInput');
                inp.value = '';
                setTimeout(() => inp.focus(), 100);
            }
        }

        function offlineAnswerMCQ(idx) {
            const q = _offlineQuizState.questions[_offlineQuizState.current];
            const correct = idx === q.correctIdx;
            const btns = ['offlineOpt0','offlineOpt1','offlineOpt2','offlineOpt3'];

            // 정답/오답 색상 표시
            document.getElementById(`offlineOpt${q.correctIdx}`).style.background = 'rgba(22,163,74,0.4)';
            document.getElementById(`offlineOpt${q.correctIdx}`).style.border = '1px solid #4ade80';
            if (!correct) {
                document.getElementById(`offlineOpt${idx}`).style.background = 'rgba(220,38,38,0.4)';
                document.getElementById(`offlineOpt${idx}`).style.border = '1px solid #ef4444';
                _offlineQuizState.allCorrect = false;
                // 오답 시 ❌ 표시
                document.getElementById('offlineQuizHearts').innerText = '❌❌❌';
            }
            btns.forEach(id => document.getElementById(id).disabled = true);

            setTimeout(() => _offlineNextQuestion(correct), 900);
        }

        function offlineAnswerFIB() {
            const q = _offlineQuizState.questions[_offlineQuizState.current];
            const inp = document.getElementById('offlineFIBInput');
            if (!formatEnglishWordInput(inp)) return;
            const userAnswer = normalizeEnglishAnswer(inp.value);
            if (!userAnswer) {
                showToast("⚠️ 영단어를 입력해 주세요.");
                return;
            }
            const correct = userAnswer === normalizeEnglishAnswer(q.answer);
            if (!correct) _offlineQuizState.allCorrect = false;
            _offlineNextQuestion(correct);
        }

        function _offlineNextQuestion(wasCorrect) {
            if (!wasCorrect) {
                // 틀리면 즉시 기본 보상 지급 후 결과
                const gold = _offlineGoldPending;
                _grantOfflineGold(1.0);
                _showOfflineResult(false, gold);
                return;
            }
            _offlineQuizState.current++;
            if (_offlineQuizState.current >= 3) {
                // 3문제 모두 정답!
                const gold = _offlineGoldPending;
                _grantOfflineGold(1.5);
                _showOfflineResult(true, gold);
            } else {
                _renderOfflineQuestion();
            }
        }

        function _grantOfflineGold(multiplier) {
            if (_offlineGoldPending <= 0) return;
            const goldGained = Math.floor(_offlineGoldPending * multiplier);
            _offlineGoldPending = 0;
            const prevGold = gameState.gold || 0;
            gameState.gold = prevGold + goldGained;
            gameState.accGold = (gameState.accGold || prevGold) + goldGained;
            saveLocalCache();
            Promise.resolve(saveSessionToCloud(true)).catch(() => {});
            const gEl = document.getElementById('goldCount');
            if (gEl) gEl.innerText = gameState.gold.toLocaleString();
        }

        function _showOfflineResult(allCorrect, baseGold) {
            document.getElementById('offlineRewardIntro').classList.add('hidden');
            document.getElementById('offlineQuizArea').classList.add('hidden');
            const resultArea = document.getElementById('offlineResultArea');
            resultArea.classList.remove('hidden');

            if (allCorrect) {
                document.getElementById('offlineResultIcon').innerText = '🏆';
                document.getElementById('offlineResultTitle').style.color = '#fbbf24';
                document.getElementById('offlineResultTitle').innerText = '완벽 정복!';
                document.getElementById('offlineResultDesc').innerText = '3문제 모두 정답! 1.5배 보상을 획득했습니다!';
                document.getElementById('offlineResultReward').innerText = `+${Math.floor(baseGold * 1.5).toLocaleString()}G (×1.5)`;
            } else {
                document.getElementById('offlineResultIcon').innerText = '😓';
                document.getElementById('offlineResultTitle').style.color = '#9ca3af';
                document.getElementById('offlineResultTitle').innerText = '아쉽네요...';
                document.getElementById('offlineResultDesc').innerText = '기본 보상을 지급합니다! 다음엔 꼭!';
                document.getElementById('offlineResultReward').innerText = `+${baseGold.toLocaleString()}G (×1.0)`;
            }
        }

        function closeOfflineModal() {
            const modal = document.getElementById('offlineRewardModal');
            if (modal) {
                modal.classList.add('hidden');
                modal.classList.remove('flex');
            }
            refreshStateVisuals();
            setTimeout(() => window.openPendingGuildTrial?.(), 0);
        }

        function calculatePlayerCP() {
            const clickAtk = calculateClickAttackPower();
            const dpsAtk = calculateDPSPower();
            const necklaceSkillBonus = (gameState.necklaceLvl || 0) * 1.5;
            const potentialSkillBonus = getPotentialStatBonus('skillDmg');
            const relicSkillBonus = getEquippedRelicBonus("relic_scroll");
            const totalSkillBonusPct = necklaceSkillBonus + potentialSkillBonus + relicSkillBonus;

            const critBonus = getEquippedRelicBonus("relic_dice");
            const braceletCrit = Math.min(25, (gameState.braceletLvl || 0) * 0.25);
            const critRate = 5.0 + critBonus + getPotentialStatBonus('critRate') + braceletCrit;

            const ringBossPct = (gameState.ringLvl || 0) * 1.0;
            const bossDmgBonus = ringBossPct + getEquippedRelicBonus("relic_feather") + getPotentialStatBonus('bossDmg');

            const slimeLvl = (gameState.petLevels && gameState.petLevels['slime']) || 0;
            const slimeBonus = slimeLvl * PET_PARAMS['slime'].goldBonus;
            const relicGoldBonus = getEquippedRelicBonus("relic_compass") / 100;
            const goldMultiplier = 1.0 + slimeBonus + relicGoldBonus + (getPotentialStatBonus('goldBonus') / 100);
            // 장착한 영단어 비기의 실제 배수도 종합 전투력에 반영합니다.
            // 등급·티어·별 강화가 모두 반영된 getSkillMultiplier 값을 사용합니다.
            const equippedSkillPower = (gameState.equippedSkills || []).reduce((sum, skillId) => {
                const skill = (gameState.skillsInventory || []).find((entry) => entry.id === skillId);
                return sum + (skill ? Number(getSkillMultiplier(skill) || 0) : 0);
            }, 0);

            return Math.floor(
                clickAtk + 
                dpsAtk + 
                (totalSkillBonusPct * 50) + 
                (critRate * 100) + 
                (bossDmgBonus * 80) + 
                (goldMultiplier * 200) +
                (equippedSkillPower * 50)
            );
        }
        window.getPlayerCombatPower = calculatePlayerCP;

        function calculateRequiredCP(stage, isBoss) {
            const st = Math.max(1, stage || 1);
            let req = 800;

            if (st < 20) {
                // [구간 1: Stage 1 ~ 19] 대장간 무구 & 기본 펫 전용 구간 (800 -> 12,000)
                const progress = (st - 1) / 18;
                req = 800 + Math.floor(11200 * Math.pow(progress, 1.3));
            } else if (st < 30) {
                // [구간 2: Stage 20 ~ 29] 잠재력 연구소 해금 구간 (난이도 완화: 12,000 -> 25,000)
                const progress = (st - 20) / 9;
                req = 12000 + Math.floor(13000 * Math.pow(progress, 1.2));
            } else if (st < 45) {
                // [구간 3: Stage 30 ~ 44] 고대 유물 제단 해금 구간 (26,000 -> 65,000)
                const progress = (st - 30) / 14;
                req = 26000 + Math.floor(39000 * Math.pow(progress, 1.3));
            } else if (st < 55) {
                // [구간 4: Stage 45 ~ 54] 지혜의 목걸이 해금 구간 (68,000 -> 120,000)
                const progress = (st - 45) / 9;
                req = 68000 + Math.floor(52000 * Math.pow(progress, 1.3));
            } else if (st < 65) {
                // [구간 5: Stage 55 ~ 64] 투지의 팔찌 해금 구간 (125,000 -> 200,000)
                const progress = (st - 55) / 9;
                req = 125000 + Math.floor(75000 * Math.pow(progress, 1.3));
            } else {
                // [구간 6: Stage 65 ~ 100] 영웅의 반지 해금 구간 (210,000 -> 350,000)
                const progress = Math.min(1.0, (st - 65) / 35);
                req = 210000 + Math.floor(140000 * Math.pow(progress, 1.4));
            }

            const bossFactor = isBoss ? 1.25 : 1.0;
            return Math.max(800, Math.floor(req * bossFactor));
        }

        function getCPDamageMultiplier() {
            const stage = gameState.stage || 1;
            const reqCp = calculateRequiredCP(stage, isBossBattleActive);
            const myCp = calculatePlayerCP();
            if (reqCp <= 0) return 1.0;
            const ratio = myCp / reqCp;
            if (ratio >= 1.0) return 1.0; // 전투력 충족 시 100% 온전한 피해
            
            // 미달 시 감쇄 패널티 적용 (미달 비례, 최소 15% 하한)
            return Math.max(0.15, Math.pow(ratio, 1.25));
        }

        function processCombatDamage(dmg) {
            const cpPenaltyMult = getCPDamageMultiplier();
            const finalDmg = Math.floor(dmg * cpPenaltyMult);
            monsterCurrentHp -= finalDmg;
            if (monsterCurrentHp <= 0) {
                defeatActiveMonster();
            } else {
                updateArenaHpBars();
            }
        }

        function updateArenaHpBars() {
            const pct = Math.max(0, (monsterCurrentHp / monsterMaxHp) * 100);
            document.getElementById("monsterHpBar").style.width = `${pct}%`;
        }

        function defeatActiveMonster() {
            let reward = 0;
            if (typeof gameState.bossTokens === 'undefined') gameState.bossTokens = 0;

            if (isBossBattleActive) {
                reward = Math.floor(gameState.stage * 1500);
                gameState.gold += reward; gameState.accGold = (gameState.accGold || gameState.gold || 0) + reward;
                const tokenGain = Math.floor(gameState.stage * 3);
                gameState.bossTokens += tokenGain;
                showBattleToast(`🐉 보스 퇴치! +${reward.toLocaleString()}G / 🪙 [고대 보스 증표] +${tokenGain}개 획득!`);
                playSoundEffect('levelup');
                concludeBossSuccess();
            } else {
                reward = Math.floor(gameState.stage * 100 + Math.random() * 50);
                gameState.gold += reward; gameState.accGold = (gameState.accGold || gameState.gold || 0) + reward;
                if (Math.random() < 0.5) {
                    gameState.bossTokens += 1;
                }
                playSoundEffect('hit');

                // 보스 해금 처치 진도를 10단계로 증가
                if (gameState.progress < BOSS_UNLOCK_LIMIT) {
                    gameState.progress++;
                    showBattleToast(`⚔️ 처치! 보스 진행 (${gameState.progress}/${BOSS_UNLOCK_LIMIT})`);
                } else {
                    showBattleToast(`⚔️ 몬스터 처치! 보스전 도전 가능!`);
                }

                respawnActiveMonster();
            }

            refreshStateVisuals();
            saveLocalCache();
        }

        function calculateSteppedHp(stage, isBoss) {
            const reqCp = calculateRequiredCP(stage, isBoss);
            // 권장 전투력 기준 자동 사냥으로 약 20초 소요, 퀴즈 5개 정답 시 처치 가능하도록 밸런스 조정
            return isBoss ? Math.floor(reqCp * 120) : Math.floor(reqCp * 20);
        }

        function respawnActiveMonster() {
            const index = (gameState.stage - 1) % MONSTER_PROFILES.length;
            const profile = isBossBattleActive
                ? BOSS_PROFILES[(gameState.stage - 1) % BOSS_PROFILES.length]
                : MONSTER_PROFILES[index];

            monsterMaxHp = calculateSteppedHp(gameState.stage, isBossBattleActive);
            monsterCurrentHp = monsterMaxHp;

            drawTargetMonster();
            updateArenaHpBars();
        }

        function handleArenaClick(event) {
            const hAvatar = document.getElementById("heroCharacter");
            if (hAvatar) {
                hAvatar.classList.add("animate-slash");
                setTimeout(() => { hAvatar.classList.remove("animate-slash"); }, 200);
            }

            const mContainer = document.getElementById("monsterContainer");
            if (mContainer) {
                mContainer.classList.add("animate-shake");
                setTimeout(() => { mContainer.classList.remove("animate-shake"); }, 600);
            }

            const baseClickDmg = calculateClickAttackPower();

            // 🎯 크리티컬 확률 & 배율 시스템 (기본 5% + 잠재력 + 팔찌 + 유물)
            const potentialCrit = getPotentialStatBonus('critRate');
            const braceletCrit = Math.min(50, (gameState.braceletLvl || 0) * 0.5);
            const relicCrit = getEquippedRelicBonus("relic_dice");
            const totalCritChance = 5 + potentialCrit + braceletCrit + relicCrit;

            const roll = Math.random() * 100;
            const isCrit = roll < totalCritChance;
            const critMult = 2.0;
            const finalDmg = isCrit ? Math.floor(baseClickDmg * critMult) : baseClickDmg;

            // 🐉 보스 타격 시 보스 피해 보정 (영웅의 반지 + 보스 잠재력 + 유물)
            let bossMult = 1.0;
            if (isBossBattleActive) {
                const ringBossPct = (gameState.ringLvl || 0) * 1.0;
                const potentialBossPct = getPotentialStatBonus('bossDmg');
                const relicBossPct = getEquippedRelicBonus("relic_feather");
                bossMult += (ringBossPct + potentialBossPct + relicBossPct) / 100;
            }
            const dealtDmg = Math.floor(finalDmg * bossMult);

            processCombatDamage(dealtDmg);
            playSoundEffect(isCrit ? 'crit' : 'click');

            const rect = event.currentTarget.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;
            
            if (isCrit) {
                spawnDamageFloatingText(x, y, `💥 CRITICAL! -${dealtDmg.toLocaleString()}`, true);
            } else {
                spawnDamageFloatingText(x, y, `-${dealtDmg.toLocaleString()}`);
            }
        }

        function spawnDamageFloatingText(x, y, text, isCrit = false) {
            const arena = document.getElementById("battleArena");
            if (!arena) return;
            const particle = document.createElement("span");
            if (isCrit) {
                particle.className = "damage-particle text-yellow-300 drop-shadow-[0_0_10px_rgba(245,158,11,1)] font-black text-base fancy-title select-none z-40 animate-bounce";
            } else {
                particle.className = "damage-particle text-red-500 font-extrabold text-sm fancy-title select-none z-30";
            }
            particle.style.left = `${x}px`;
            particle.style.top = `${y}px`;
            particle.innerText = text;
            arena.appendChild(particle);
            setTimeout(() => { particle.remove(); }, 700);
        }

        // ==========================================
        // SHOP & ACQUISITIONS
        // ==========================================
        function getGearUpgradeInfo(currentLvl) {
            let success = 100;
            let dropChance = 0;

            if (currentLvl >= 5 && currentLvl < 15) {
                success = Math.max(50, 100 - (currentLvl - 4) * 5);
                dropChance = Math.min(15, (currentLvl - 4) * 2);
            } else if (currentLvl >= 15 && currentLvl < 25) {
                success = Math.max(20, 50 - (currentLvl - 14) * 3);
                dropChance = Math.min(30, Math.floor(15 + (currentLvl - 14) * 1.5));
            } else if (currentLvl >= 25) {
                success = Math.max(5, 20 - (currentLvl - 24) * 3);
                dropChance = 40;
            }

            // 요정 펫 레벨당 강화 성공률 +1% 보정 (최대 95%까지)
            const fairyLvl = (gameState.petLevels && gameState.petLevels['fairy']) || 0;
            const fairyBonus = fairyLvl * PET_PARAMS['fairy'].forgeBonus;
            return {
                success: Number((Math.max(5, Math.min(95, success + fairyBonus))).toFixed(1)),
                dropChance: dropChance
            };
        }

        let selectedGearKey = "helmet"; // default: 'helmet', 'armor', 'weapon', 'shield', 'shoes'
        // ⚠️ 잠재력 잠금은 이제 gameState.lockedPotentialSlots에 저장 (새로고침 유지)

        function selectGearForPotential(key) {
            selectedGearKey = key;
            buildUpgradeblacksmith();
            renderGearPotentialLabUI();
        }

        function buildUpgradeblacksmith() {
            const container = document.getElementById("gearShopContainer");
            let html = "";

            for (let gearKey in GEAR_PARAMS) {
                const info = GEAR_PARAMS[gearKey];
                const currentLvl = gameState[info.key];
                const isMax = currentLvl >= MAX_GEAR_LEVEL;
                const cost = isMax ? 0 : Math.floor(info.base * 3.0 * Math.pow(GROWTH_RATE, currentLvl));
                const chanceInfo = isMax ? null : getGearUpgradeInfo(currentLvl);

                const baseDpsMap = { helmet: 25, armor: 60, weapon: 50, shield: 40, shoes: 30 };
                const orbMult = (gameState.equippedRelicId === "relic_orb") ? (1.0 + getEquippedRelicBonus("relic_orb") / 100) : 1.0;
                const dpsBonus = Math.floor((baseDpsMap[gearKey] || 0) * orbMult);

                const clickBonusMap = { weapon: 3, armor: 1, shield: 1 };
                const clickBonus = clickBonusMap[gearKey] || 0;

                const isSelectedForPotential = selectedGearKey === gearKey;

                let rateHtml = "";
                if (isMax) {
                    rateHtml = `<span class="text-[#0066b1] font-bold">최대 강화 완료 (${MAX_GEAR_LEVEL}강)</span>`;
                } else {
                    const bonusLine = clickBonus > 0
                        ? `자동 DPS +${dpsBonus} &nbsp;|&nbsp; 클릭 타격 +${clickBonus}`
                        : `자동 DPS +${dpsBonus}`;

                    const shieldRate = getEquippedRelicBonus("relic_shield");
                    const effectiveDropChance = Math.max(0, chanceInfo.dropChance - shieldRate);

                    rateHtml = `
                        <div class="text-[10px] text-[#7e7e7e] mb-0.5">
                            <span class="font-bold text-white">Lv.${currentLvl}</span>
                            <span class="mx-1">→</span>
                            <span class="font-bold text-[#0066b1]">Lv.${currentLvl + 1}</span>
                        </div>
                        <div class="text-[9px] text-[#bbbbbb] ">${bonusLine}</div>
                        <div class="text-[9px] mt-0.5 flex flex-col gap-0.5">
                            <span>성공: <span class="text-green-500 font-bold">${chanceInfo.success}%</span></span>
                            ${chanceInfo.dropChance > 0
                                ? (shieldRate > 0
                                    ? `<span class="text-[#e22718] font-bold">실패 시 ${effectiveDropChance}% 확률 하락 <span class="text-emerald-400 text-[8px]">(방패 -${shieldRate}%)</span></span>`
                                    : `<span class="text-[#e22718] font-bold">실패 시 ${chanceInfo.dropChance}% 확률 하락</span>`)
                                : '<span class="text-green-500">실패해도 강화 유지</span>'}
                        </div>
                    `;
                }

                html += `
                    <div id="gearInfo_${gearKey}" onclick="selectGearForPotential('${gearKey}')" class="cursor-pointer flex items-stretch gap-0 bg-[#0d0d0d] border ${isSelectedForPotential ? 'border-2 border-yellow-400 shadow-[0_0_12px_rgba(234,179,8,0.6)]' : 'border-[#262626]'} hover:border-yellow-500/70 transition rounded-none-forced overflow-hidden relative group">
                        <div class="flex items-center justify-center w-11 bg-[#111] border-r border-[#262626] flex-shrink-0">
                            <i data-lucide="${getGearIcon(gearKey)}" class="w-5 h-5 ${isSelectedForPotential ? 'text-yellow-400' : 'text-[#0066b1]'}"></i>
                        </div>
                        <div class="flex flex-col justify-center px-3 py-2.5 flex-1 min-w-0">
                            <h4 class="font-bold text-white text-[11px] uppercase tracking-wider leading-tight">${info.name}</h4>
                            <div class="mt-1">${rateHtml}</div>
                        </div>
                        <button onclick="event.stopPropagation(); ${isMax ? '' : `upgradeGearItem('${gearKey}')`}" ${isMax ? 'disabled' : ''}
                            class="flex-shrink-0 flex flex-col items-center justify-center w-20 ${isMax ? 'bg-[#1a1a1a] opacity-50 cursor-not-allowed' : 'bg-[#0066b1] hover:bg-[#0088ee] cursor-pointer'} transition px-2 py-3 border-l border-[#262626]">
                            ${isMax
                                ? '<span class="text-white text-[10px] font-bold">MAX</span>'
                                : `<span class="text-yellow-300 text-[11px] font-bold">🪙 ${cost.toLocaleString()}G</span>
                                   <span class="text-white text-[9px] mt-0.5 opacity-80">강화 시도</span>`}
                        </button>
                    </div>
                `;
            }
            container.innerHTML = html;
            lucide.createIcons();
        }

        function getGearIcon(key) {
            if (key === 'helmet') return 'hard-hat';
            if (key === 'armor') return 'shirt';
            if (key === 'weapon') return 'sword';
            if (key === 'shield') return 'shield';
            return 'footprints';
        }

        function upgradeGearItem(gearKey) {
            if (!gameState.tutorialCompleted && tutorialStep === 3 && gearKey === 'weapon') {
                tutorialStep = 4;
                setTimeout(showTutorialOverlay, 300);
            }
            const info = GEAR_PARAMS[gearKey];
            const currentLvl = gameState[info.key];

            if (currentLvl >= MAX_GEAR_LEVEL) {
                showToast(`⭐ 이미 최대 강화 단계(${MAX_GEAR_LEVEL}강)에 도달한 장비입니다!`);
                return;
            }

            let cost = Math.floor(info.base * 3.0 * Math.pow(GROWTH_RATE, currentLvl));

            // 튜토리얼 중 무기 강화는 무료(0골드)로 강제 진행 (step 3~4 모두 적용)
            if (!gameState.tutorialCompleted && tutorialStep >= 3 && tutorialStep <= 4 && gearKey === 'weapon') {
                cost = 0;
            }

            if (gameState.gold >= cost) {
                gameState.gold -= cost;

                const chanceInfo = getGearUpgradeInfo(currentLvl);
                const roll = Math.random() * 100;

                if (roll <= chanceInfo.success) {
                    gameState[info.key]++;
                    playSoundEffect('levelup');
                    showForgeResult(true,
                        '⚔️ 강화 성공!',
                        `${info.name}이(가) <strong class="text-[#0066b1]">Lv.${gameState[info.key]}</strong>로 강화되었습니다!`,
                        '#22c55e');
                } else {
                    playSoundEffect('hit');
                    const dropRoll = Math.random() * 100;
                    const shieldRate = getEquippedRelicBonus("relic_shield");
                    const effectiveDropChance = Math.max(0, chanceInfo.dropChance - shieldRate);

                    if (effectiveDropChance > 0 && dropRoll <= effectiveDropChance) {
                        const dropAmt = Math.floor(Math.random() * 3) + 1;
                        const newLvl = Math.max(1, currentLvl - dropAmt);
                        const loss = currentLvl - newLvl;
                        gameState[info.key] = newLvl;
                        showForgeResult(false,
                            '💥 강화 실패!',
                            `장비 기운이 흔들려 <strong class="text-[#e22718]">Lv.${newLvl}</strong>로 <strong class="text-[#e22718]">-${loss}강</strong> 하락했습니다.`,
                            '#e22718');
                    } else if (shieldRate > 0 && chanceInfo.dropChance > 0) {
                        showForgeResult(false,
                            '🛡️ 대지의 수호 방패 방어!',
                            `강화 실패했지만 <strong class="text-emerald-400">대지의 수호 방패 (${shieldRate}% 감쇄)</strong> 효과로 하락 확률이 ${effectiveDropChance}%로 축소되어 단계 하락을 방지했습니다!`,
                            '#10b981');
                    } else {
                        showForgeResult(false,
                            '⚠️ 강화 실패',
                            `다행히 기운이 온전하여 <strong class="text-yellow-400">등급이 유지</strong>되었습니다.`,
                            '#f59e0b');
                    }
                }

                drawHeroAvatar();
                buildUpgradeblacksmith();
                refreshStateVisuals();
                saveLocalCache();
            } else {
                showToast("🪙 금화가 부족합니다. 영단어 약점 타격으로 자금을 입수하세요!");
            }
        }

        function getPetEvolutionName(petKey, level) {
            const baseName = PET_PARAMS[petKey].name;
            const stage = Math.floor(level / 10);
            const prefixes = [
                "아기",     // 0-9
                "성장기",   // 10-19
                "훈련된",   // 20-29
                "성체",     // 30-39
                "용맹한",   // 40-49
                "정예",     // 50-59
                "챔피언",   // 60-69
                "영웅",     // 70-79
                "전설의",   // 80-89
                "초월신"    // 90-100
            ];
            const prefix = prefixes[Math.min(stage, 9)];

            if (petKey === "slime") {
                return `${prefix} 젤리 슬라임`;
            } else if (petKey === "dragon") {
                return `${prefix} 화염 드래곤`;
            } else {
                return `${prefix} 황금 축복 요정`;
            }
        }

        function buildCompanionPetLab() {
            const container = document.getElementById("petListContainer");
            let html = "";

            for (let petKey in PET_PARAMS) {
                const info = PET_PARAMS[petKey];
                if (!gameState.petLevels) {
                    gameState.petLevels = { slime: 0, dragon: 0, fairy: 0 };
                }
                const petLevel = gameState.petLevels[petKey] || 0;
                const isActive = petLevel > 0;
                const isMax = petLevel >= MAX_PET_LEVEL;
                const cost = isMax ? 0 : Math.floor(info.cost * Math.pow(1.10, petLevel));
                const evolvedName = getPetEvolutionName(petKey, petLevel);

                html += `
                    <div class="bg-[#0d0d0d] border ${isActive ? 'border-white' : 'border-[#262626]'} p-4 rounded-none-forced flex flex-col justify-between items-stretch">
                        <div class="text-center">
                            <span class="text-3xl block mb-2">${getPetEmoji(petKey)}</span>
                            <h4 class="font-bold text-white text-xs uppercase tracking-wider">${evolvedName}</h4>
                            <p class="text-[9px] text-[#7e7e7e] my-1.5 min-h-[28px]">${info.desc}</p>
                            <p class="text-[9px] text-[#0066b1] font-bold bg-black py-1 border border-[#3c3c3c] rounded-none-forced uppercase tracking-widest">
                                친밀 레벨: ${isMax ? 'MAX' : (petLevel === 0 ? '미소환' : `Lv.${petLevel}`)}
                            </p>
                        </div>
                        
                        <div class="mt-4 flex flex-col gap-1">
                            <div class="flex justify-between text-[9px] text-[#bbbbbb]">
                                ${petKey === 'slime'
                                    ? `<span>🪙 골드: +${Math.round((info.goldBonus || 0) * Math.max(1, petLevel) * 100)}% (자동 +${Math.floor(petLevel * (gameState.stage||1) * 0.5).toLocaleString()}G/초)</span>`
                                    : petKey === 'dragon'
                                    ? `<span>⚔️ 자동 DPS: +${(info.dps || 0) * Math.max(1, petLevel)}</span>`
                                    : `<span>🔨 강화 성공률: +${((info.forgeBonus || 0) * Math.max(1, petLevel)).toFixed(1)}%</span>`
                                }
                            </div>
                            <button onclick="${isMax ? '' : `interactUpgradePet('${petKey}')`}" ${isMax ? 'disabled' : ''} class="w-full mt-2 bmw-btn-primary py-2.5 flex flex-col items-center justify-center ${isMax ? 'opacity-50 cursor-not-allowed' : ''}">
                                ${isMax ? '<span class="text-white font-bold text-[9px]">진화 최종 도달 (Lv.100)</span>' : `
                                    <span class="text-[#e22718] font-bold text-[9px]">🪙 ${cost.toLocaleString()}G</span>
                                    <span class="text-[8px] opacity-70">${petLevel === 0 ? '연구 및 소환' : '연구 및 진화'}</span>
                                `}
                            </button>
                        </div>
                    </div>
                `;
            }
            container.innerHTML = html;
        }

        function getPetEmoji(key) {
            if (key === 'slime') return "👾";
            if (key === 'dragon') return "🐲";
            return "🧚";
        }

        function interactUpgradePet(petKey) {
            const info = PET_PARAMS[petKey];
            if (!info) return;

            if (!gameState.petLevels) {
                gameState.petLevels = { slime: 0, dragon: 0, fairy: 0 };
            }
            const currentLvl = gameState.petLevels[petKey] || 0;

            if (currentLvl >= MAX_PET_LEVEL) {
                showToast(`⭐ 이미 최대 레벨(Lv.${MAX_PET_LEVEL})에 도달한 소환수입니다!`);
                return;
            }

            const isTutorialPet = (!gameState.tutorialCompleted && tutorialStep === 5 && petKey === 'dragon');
            const cost = isTutorialPet ? 0 : Math.floor(info.cost * Math.pow(1.10, currentLvl));

            if (!isTutorialPet && gameState.gold < cost) {
                showToast(`🪙 골드가 부족합니다! ${info.name} 소환/진화에는 ${cost.toLocaleString()} Gold가 필요합니다.`);
                return;
            }

            gameState.gold -= cost;
            gameState.petLevels[petKey] = currentLvl + 1;
            playSoundEffect('levelup');

            const nextLvl = gameState.petLevels[petKey];
            const evolvedName = getPetEvolutionName(petKey, nextLvl);

            if (currentLvl === 0) {
                showToast(`✨ 축하합니다! 새로운 소환수 [${evolvedName}]를 성공적으로 연구 및 소환했습니다!`);
            } else {
                showToast(`🐉 [${evolvedName}] 친밀도가 Lv.${nextLvl}로 상승하였습니다!`);
            }

            buildCompanionPetLab();
            if (isTutorialPet) {
                tutorialStep = 6;
                setTimeout(showTutorialOverlay, 500);
            }
            drawPetCompanion();
            drawHeroAvatar();
            refreshStateVisuals();
            saveLocalCache();
        }

        // ==========================================
        // ⚡ GEAR POTENTIAL SYSTEM (5종 무구별 3~6줄 잠재력 리롤 & 잠금)
        // ==========================================
        const POTENTIAL_TYPE_INFO = {
            atk: { name: "공격력", icon: "⚔️", unit: "%" },
            skillDmg: { name: "스킬 피해", icon: "✨", unit: "%" },
            bossDmg: { name: "보스 피해", icon: "🐉", unit: "%" },
            clickDmg: { name: "클릭 타격", icon: "💥", unit: "" },
            goldBonus: { name: "골드 수당", icon: "🪙", unit: "%" },
            critRate: { name: "크리티컬", icon: "🎯", unit: "%" }
        };
        const POTENTIAL_GRADE_NAMES = {
            normal: "일반", rare: "희귀", hero: "영웅", legendary: "전설", mythic: "신화"
        };

        function hydratePotentialOption(opt) {
            if (!opt) return opt;
            const gName = POTENTIAL_GRADE_NAMES[opt.grade] || "일반";
            const typeInfo = POTENTIAL_TYPE_INFO[opt.type] || { name: opt.type || "능력치", icon: "✨", unit: "" };
            const val = opt.value || 0;
            return {
                grade: opt.grade || "normal",
                gradeName: opt.gradeName || gName,
                type: opt.type,
                name: opt.name || typeInfo.name,
                icon: opt.icon || typeInfo.icon,
                value: val,
                formatValue: opt.formatValue || (typeInfo.unit === "%" ? `+${val}%` : `+${val}`)
            };
        }

        function ensureGearPotentialsStructure() {
            const keys = ["helmet", "armor", "weapon", "shield", "shoes"];
            if (!gameState.gearPotentials || typeof gameState.gearPotentials !== "object") {
                gameState.gearPotentials = {};
            }
            if (Array.isArray(gameState.gearPotentials)) {
                const oldArr = gameState.gearPotentials;
                gameState.gearPotentials = {};
                keys.forEach((k, idx) => {
                    gameState.gearPotentials[k] = [];
                    if (oldArr[idx]) gameState.gearPotentials[k][0] = hydratePotentialOption(oldArr[idx]);
                    const unlockedCount = getGearUnlockedSlotsCount(k);
                    for (let i = 0; i < 6; i++) {
                        if (gameState.gearPotentials[k][i]) {
                            gameState.gearPotentials[k][i] = hydratePotentialOption(gameState.gearPotentials[k][i]);
                        } else if (i < unlockedCount) {
                            gameState.gearPotentials[k][i] = generateRandomPotentialOption();
                        } else {
                            gameState.gearPotentials[k][i] = null;
                        }
                    }
                });
            } else {
                keys.forEach(k => {
                    let opts = gameState.gearPotentials[k];
                    if (!opts || typeof opts !== 'object') {
                        opts = [];
                    }
                    if (!Array.isArray(opts)) {
                        const arr = [];
                        Object.keys(opts).forEach(idxKey => {
                            arr[Number(idxKey)] = opts[idxKey];
                        });
                        opts = arr;
                    }
                    gameState.gearPotentials[k] = opts;
                    const unlockedCount = getGearUnlockedSlotsCount(k);
                    for (let i = 0; i < 6; i++) {
                        if (gameState.gearPotentials[k][i]) {
                            gameState.gearPotentials[k][i] = hydratePotentialOption(gameState.gearPotentials[k][i]);
                        } else if (i < unlockedCount) {
                            gameState.gearPotentials[k][i] = generateRandomPotentialOption();
                        } else {
                            gameState.gearPotentials[k][i] = null;
                        }
                    }
                });
            }
        }

        function getGearUnlockedSlotsCount(gearKey) {
            const gearLvl = gameState[GEAR_PARAMS[gearKey] ? GEAR_PARAMS[gearKey].key : 'weaponLvl'] || 1;
            if (gearLvl >= 50) return 6;
            if (gearLvl >= 40) return 5;
            if (gearLvl >= 30) return 4;
            return 3;
        }

        function unlockPotentialLab() {
            const stage = gameState.stage || 1;
            if (stage < 20) {
                showToast("⚠️ 무구 잠재력 연구소 개설은 20스테이지 달성 시 해금됩니다!");
                return;
            }

            const cost = 100000; // 10만 골드 개설 비용
            if (gameState.gold < cost) {
                showToast(`🪙 골드가 부족합니다! 잠재력 연구소를 개설하려면 ${cost.toLocaleString()} Gold가 필요합니다.`);
                return;
            }

            gameState.gold -= cost;
            gameState.isPotentialUnlocked = true;
            ensureGearPotentialsStructure();
            playSoundEffect('levelup');
            showToast("⚡ 축하합니다! [무구 잠재력 연구소]가 정식 개설되었습니다!");
            renderGearPotentialLabUI();
            refreshStateVisuals();
            saveLocalCache();
        }

        function getSafeLockedArr(gearKey) {
            if (!gameState.lockedPotentialSlots || typeof gameState.lockedPotentialSlots !== 'object') {
                gameState.lockedPotentialSlots = {};
            }
            if (typeof gameState.lockedPotentialSlots === 'string') {
                try { gameState.lockedPotentialSlots = JSON.parse(gameState.lockedPotentialSlots); } catch(e) { gameState.lockedPotentialSlots = {}; }
            }
            let val = gameState.lockedPotentialSlots[gearKey];
            if (!val) {
                gameState.lockedPotentialSlots[gearKey] = [];
                return [];
            }
            if (typeof val === 'string') {
                try { val = JSON.parse(val); } catch(e) { val = []; }
            }
            if (Array.isArray(val)) {
                const cleanArr = val.map(v => Number(v));
                gameState.lockedPotentialSlots[gearKey] = cleanArr;
                return cleanArr;
            }
            if (typeof val === 'object') {
                const arr = Object.values(val).map(v => Number(v));
                gameState.lockedPotentialSlots[gearKey] = arr;
                return arr;
            }
            gameState.lockedPotentialSlots[gearKey] = [];
            return [];
        }

        function renderGearPotentialLabUI() {
            ensureGearPotentialsStructure();

            const grid = document.getElementById("potentialSlotsGrid");
            if (!grid) return;

            const stage = gameState.stage || 1;

            // 미해금 시 개설 버튼 표시
            if (!gameState.isPotentialUnlocked) {
                grid.innerHTML = `
                    <div class="col-span-2 sm:col-span-3 border border-yellow-700/60 bg-black/90 p-4 text-center flex flex-col items-center justify-center rounded-none-forced py-6">
                        <span class="text-2xl mb-1">⚡</span>
                        <h4 class="font-extrabold text-xs text-yellow-300">무구 잠재력 연구소 미개설</h4>
                        <p class="text-[10px] text-gray-400 mt-1 mb-3">${stage >= 20 ? '20스테이지에 도달했습니다! 골드를 지불하여 잠재력 연구소를 개설하세요.' : '🔒 20스테이지 달성 시 연구소 개설이 해금됩니다.'}</p>
                        <button onclick="unlockPotentialLab()" ${stage < 20 ? 'disabled' : ''} class="px-5 py-2 ${stage >= 20 ? 'bg-yellow-500 hover:bg-yellow-400 text-black shadow-lg cursor-pointer' : 'bg-gray-800 text-gray-500 cursor-not-allowed'} font-extrabold text-xs rounded-none-forced transition">
                            ${stage >= 20 ? '🔓 100,000 Gold 지불하고 연구소 개설' : '🔒 20스테이지 달성 필요'}
                        </button>
                    </div>
                `;
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
            }

            const gearKeys = ["helmet", "armor", "weapon", "shield", "shoes"];
            const gearShortNames = { helmet: "🪖 투구", armor: "🛡️ 갑옷", weapon: "⚔️ 수호검", shield: "🛡️ 방패", shoes: "👟 신발" };

            let tabsHtml = `<div class="col-span-2 sm:col-span-3 flex flex-wrap gap-1.5 mb-2 pb-2 border-b border-[#222]">`;
            gearKeys.forEach(k => {
                const info = GEAR_PARAMS[k];
                const lvl = gameState[info.key] || 1;
                const isSelected = selectedGearKey === k;
                tabsHtml += `
                    <button onclick="selectGearForPotential('${k}')" class="px-2.5 py-1 text-[10px] font-bold rounded-none-forced transition flex items-center gap-1 cursor-pointer ${isSelected ? 'bg-yellow-500 text-black border border-yellow-400 shadow-md font-black' : 'bg-[#1a1a1a] text-gray-400 hover:text-white border border-[#333]'}">
                        <span>${gearShortNames[k]}</span>
                        <span class="${isSelected ? 'text-black/80' : 'text-yellow-400'}  text-[9px]">(Lv.${lvl})</span>
                    </button>
                `;
            });
            tabsHtml += `</div>`;

            const currentLvl = gameState[GEAR_PARAMS[selectedGearKey].key] || 1;
            const unlockedSlots = getGearUnlockedSlotsCount(selectedGearKey);
            const currentGearOpts = gameState.gearPotentials[selectedGearKey] || [];
            if (!gameState.lockedPotentialSlots) gameState.lockedPotentialSlots = {};
            if (!gameState.lockedPotentialSlots[selectedGearKey]) {
                gameState.lockedPotentialSlots[selectedGearKey] = [];
            }
            const lockedArr = gameState.lockedPotentialSlots[selectedGearKey];

            let html = tabsHtml;
            const gradeColorMap = {
                normal: "border-gray-700 bg-gray-950 text-gray-300",
                rare: "border-sky-600 bg-sky-950 text-sky-300",
                hero: "border-purple-600 bg-purple-950 text-purple-300",
                legendary: "border-red-600 bg-red-950 text-red-300 shadow-[0_0_10px_rgba(220,38,38,0.5)]",
                mythic: "border-amber-500 bg-amber-950 text-yellow-300 shadow-[0_0_15px_rgba(245,158,11,0.8)] animate-pulse"
            };

            const lockUnlockTextMap = { 3: "30강 달성 시 해금", 4: "40강 달성 시 해금", 5: "50강 달성 시 해금" };

            for (let i = 0; i < 6; i++) {
                const isUnlocked = i < unlockedSlots;
                if (!isUnlocked) {
                    if (currentGearOpts[i]) {
                        let lockedOpt = currentGearOpts[i];
                        const style = gradeColorMap[lockedOpt.grade] || gradeColorMap.normal;
                        html += `
                            <div class="border border-gray-700 bg-gray-900 p-2 text-center flex flex-col justify-between min-h-[80px] relative opacity-50 grayscale rounded-none-forced" title="레벨 하락으로 비활성화되었습니다. 다시 강화하면 활성화됩니다.">
                                <div>
                                    <span class="text-[8px] font-bold text-gray-400 block">${i + 1}번 옵션 [비활성화]</span>
                                    <span class="text-xs font-extrabold text-gray-400 block mt-0.5">${lockedOpt.icon} ${lockedOpt.name}</span>
                                </div>
                                <span class="text-[10px] font-bold  text-gray-500 block">${lockedOpt.formatValue}</span>
                                <span class="text-[8px] font-bold text-red-400 mt-1 block">🔒 ${lockUnlockTextMap[i] || '고강화 달성 필요'}</span>
                            </div>
                        `;
                    } else {
                        html += `
                            <div class="border border-gray-900 bg-black/60 p-2.5 text-center flex flex-col items-center justify-center min-h-[75px] opacity-40 rounded-none-forced">
                                <span class="text-[9px] font-bold text-gray-400 mb-0.5">${i + 1}번 잠재력 옵션</span>
                                <span class="text-xs text-gray-500 font-bold">🔒 슬롯 잠김</span>
                                <span class="text-[8px] text-gray-600 mt-1">${lockUnlockTextMap[i] || '고강화 달성 필요'}</span>
                            </div>
                        `;
                    }
                    continue;
                }

                let opt = currentGearOpts[i];
                if (!opt) {
                    opt = generateRandomPotentialOption();
                    currentGearOpts[i] = opt;
                } else if (!opt.tier) {
                    // 구버전(티어 정보 없음) 호환용 로직
                    const poolOpt = [{ type: "atk", ranges: { mythic: [9, 12], legendary: [6, 8], hero: [4, 5], rare: [3, 3.5], normal: [2, 2.5] } },
                                     { type: "skillDmg", ranges: { mythic: [13, 18], legendary: [9, 12], hero: [6, 8], rare: [4, 5.5], normal: [3, 3.5] } },
                                     { type: "bossDmg", ranges: { mythic: [18, 24], legendary: [12, 16], hero: [8, 10], rare: [5, 7], normal: [4, 4.5] } },
                                     { type: "clickDmg", ranges: { mythic: [90, 120], legendary: [60, 80], hero: [40, 50], rare: [28, 35], normal: [18, 22] } },
                                     { type: "goldBonus", ranges: { mythic: [13, 18], legendary: [9, 12], hero: [6, 8], rare: [4, 5.5], normal: [3, 3.5] } },
                                     { type: "critRate", ranges: { mythic: [4.5, 6], legendary: [3, 4], hero: [2, 2.5], rare: [1.3, 1.6], normal: [1, 1.1] } }
                    ].find(p => p.type === opt.type);
                    
                    if (poolOpt && poolOpt.ranges[opt.grade]) {
                        const range = poolOpt.ranges[opt.grade];
                        const val = opt.value;
                        const tierStep = (range[1] - range[0]) / 3;
                        let tierNum = 4;
                        if (val >= range[0] + tierStep * 2.5) tierNum = 1;
                        else if (val >= range[0] + tierStep * 1.5) tierNum = 2;
                        else if (val >= range[0] + tierStep * 0.5) tierNum = 3;
                        opt.tier = `T${tierNum}`;
                    } else {
                        opt.tier = 'T1';
                    }
                }

                const isLocked = lockedArr.includes(i);
                const style = gradeColorMap[opt.grade] || gradeColorMap.normal;

                html += `
                    <div class="border ${style} p-2 text-center flex flex-col justify-between min-h-[80px] relative rounded-none-forced">
                        <button onclick="toggleLockPotentialSlot('${selectedGearKey}', ${i})" class="absolute -top-2 -right-2 px-1.5 py-0.5 text-[9px] font-black rounded-none-forced transition border shadow-md cursor-pointer ${isLocked ? 'bg-yellow-400 text-black border-yellow-600' : 'bg-gray-800 text-gray-300 border-gray-600 hover:text-white'}">
                            ${isLocked ? '🔒 잠금' : '🔓 해제'}
                        </button>
                        <div>
                            <span class="text-[8px] font-bold text-gray-400 block">${i + 1}번 옵션 [${opt.gradeName} ${opt.tier || 'T1'}]</span>
                            <span class="text-xs font-extrabold block mt-0.5">${opt.icon} ${opt.name}</span>
                        </div>
                        <span class="text-[10px] font-bold  text-yellow-300 block">${opt.formatValue}</span>
                    </div>
                `;
            }

            grid.innerHTML = html;

            const lockedCount = lockedArr.length;
            const costMap = [50000, 150000, 400000, 1000000, 2500000, 6000000];
            const currentCost = costMap[Math.min(lockedCount, 5)];
            const costText = document.getElementById("potentialRerollCostText");
            if (costText) costText.innerText = `${currentCost.toLocaleString()} Gold`;
        }

        function generateRandomPotentialOption() {
            const roll = Math.random();
            let grade = "normal";
            let gradeName = "일반";

            if (roll < 0.0005) { grade = "mythic"; gradeName = "신화"; }
            else if (roll < 0.02) { grade = "legendary"; gradeName = "전설"; }
            else if (roll < 0.07) { grade = "hero"; gradeName = "영웅"; }
            else if (roll < 0.25) { grade = "rare"; gradeName = "희귀"; }

            const pool = [
                { type: "atk", name: "공격력", icon: "⚔️", unit: "%", ranges: { mythic: [9, 12], legendary: [6, 8], hero: [4, 5], rare: [3, 3.5], normal: [2, 2.5] } },
                { type: "skillDmg", name: "스킬 피해", icon: "✨", unit: "%", ranges: { mythic: [13, 18], legendary: [9, 12], hero: [6, 8], rare: [4, 5.5], normal: [3, 3.5] } },
                { type: "bossDmg", name: "보스 피해", icon: "🐉", unit: "%", ranges: { mythic: [18, 24], legendary: [12, 16], hero: [8, 10], rare: [5, 7], normal: [4, 4.5] } },
                { type: "clickDmg", name: "클릭 타격", icon: "💥", unit: "", ranges: { mythic: [90, 120], legendary: [60, 80], hero: [40, 50], rare: [28, 35], normal: [18, 22] } },
                { type: "goldBonus", name: "골드 수당", icon: "🪙", unit: "%", ranges: { mythic: [13, 18], legendary: [9, 12], hero: [6, 8], rare: [4, 5.5], normal: [3, 3.5] } },
                { type: "critRate", name: "크리티컬", icon: "🎯", unit: "%", ranges: { mythic: [4.5, 6], legendary: [3, 4], hero: [2, 2.5], rare: [1.3, 1.6], normal: [1, 1.1] } }
            ];

            const picked = pool[Math.floor(Math.random() * pool.length)];
            const range = picked.ranges[grade] || [1, 1];

            // 동일 등급 내 4개 세부 티어 (Tier 1 최상 ~ Tier 4)
            const tierRoll = Math.floor(Math.random() * 4); // 0 (Tier 1), 1 (Tier 2), 2 (Tier 3), 3 (Tier 4)
            const tierStep = (range[1] - range[0]) / 3;
            const rawVal = range[0] + (3 - tierRoll) * tierStep; // Tier 1이 최댓값
            const tierName = `T${tierRoll + 1}`;

            let val;
            if (picked.type === 'clickDmg') {
                val = Math.round(rawVal);
            } else {
                val = Math.round(rawVal * 10) / 10;
            }

            return {
                grade: grade,
                gradeName: gradeName,
                tier: tierName,
                type: picked.type,
                name: picked.name,
                icon: picked.icon,
                value: val,
                formatValue: picked.unit === "%" ? `+${val}%` : `+${val}`
            };
        }

        function toggleLockPotentialSlot(gearKey, idx) {
            const arr = getSafeLockedArr(gearKey);
            const numIdx = Number(idx);
            const pos = arr.indexOf(numIdx);
            if (pos >= 0) {
                arr.splice(pos, 1);
            } else {
                arr.push(numIdx);
            }
            gameState.lockedPotentialSlots[gearKey] = arr;
            saveLocalCache();
            renderGearPotentialLabUI();
        }

        function rerollGearPotentials() {
            const stage = gameState.stage || 1;
            if (stage < 20) {
                showToast("⚠️ 무구 잠재력 연구소는 20스테이지 정복 시 해금됩니다!");
                return;
            }

            if (!gameState.isPotentialUnlocked) {
                showToast("⚠️ 무구 잠재력 연구소를 먼저 100,000 Gold로 개설하셔야 잠재력 재설정이 가능합니다!");
                return;
            }

            ensureGearPotentialsStructure();
            const gearKey = selectedGearKey;
            const unlockedSlots = getGearUnlockedSlotsCount(gearKey);
            const lockedArr = getSafeLockedArr(gearKey);
            const isSlotLocked = (slotIdx) => lockedArr.includes(Number(slotIdx));
            const currentOpts = gameState.gearPotentials[gearKey] || [];

            // ⚠️ 신화 등급이 해제 상태인 슬롯이 1개라도 있는지 정밀 검사
            let hasMythicUnlocked = false;
            for (let idx = 0; idx < unlockedSlots; idx++) {
                const opt = currentOpts[idx];
                if (opt && !isSlotLocked(idx)) {
                    const str = (JSON.stringify(opt) || "").toLowerCase();
                    if (str.includes("mythic") || str.includes("신화")) {
                        hasMythicUnlocked = true;
                        break;
                    }
                }
            }

            // 신화 해제 상태 → 인게임 커스텀 모달(showConfirm)로 경고 팝업 출력
            if (hasMythicUnlocked) {
                const msg = "⚠️ [신화 등급] 잠재력 옵션이 잠금 해제 상태입니다!\n재설정하면 신화 옵션이 영구 소멸됩니다. 정말 재설정하시겠습니까?";
                showConfirm(
                    msg,
                    function() {
                        _doRerollPotential(gearKey);
                    },
                    null,
                    { icon: "💀", title: "신화 잠재력 소멸 경고", yesLabel: "🔥 재설정", noLabel: "🔒 취소", danger: true }
                );
                return; // 팝업 열린 상태에서 리롤 즉시 실행 차단
            }

            _doRerollPotential(gearKey);
        }

        function _doRerollPotential(gearKey) {
            ensureGearPotentialsStructure();
            const unlockedSlots = getGearUnlockedSlotsCount(gearKey);
            const currentOpts = gameState.gearPotentials[gearKey] || [];
            const lockedArr = getSafeLockedArr(gearKey);
            const lockedCount = lockedArr.length;
            const costMap = [50000, 150000, 400000, 1000000, 2500000, 6000000];
            const cost = costMap[Math.min(lockedCount, 5)];

            if (gameState.gold < cost) {
                showToast(`🪙 골드가 부족합니다! 리롤을 진행하려면 ${cost.toLocaleString()} Gold가 필요합니다.`);
                return;
            }

            gameState.gold -= cost;
            playSoundEffect('reroll');

            for (let i = 0; i < unlockedSlots; i++) {
                if (!lockedArr.includes(i)) {
                    currentOpts[i] = generateRandomPotentialOption();
                }
            }

            renderGearPotentialLabUI();
            refreshStateVisuals();
            saveLocalCache();
            showToast("🎲 선택한 무구의 잠재력 옵션이 새로 재설정되었습니다!");
        }

        // ==========================================
        // 💍 ACCESSORIES & 🏺 RELICS SYSTEM (50+ 콘텐츠)
        // ==========================================
        function getAccessoryEffectSummary(accKey, lvl) {
            lvl = lvl || 0;
            if (lvl <= 0) return "미연마";
            if (accKey === 'necklace') {
                const dmg = (lvl * 1.5).toFixed(1);
                const cd = Math.min(30, lvl * 0.3).toFixed(1);
                return `스킬 마법 피해 +${dmg}%<br>스킬 쿨타임 감소 -${cd}%`;
            } else if (accKey === 'bracelet') {
                const click = lvl * 800;
                const crit = Math.min(25, lvl * 0.25).toFixed(1);
                return `클릭 타격력 +${click >= 10000 ? (click/10000).toFixed(1)+'만' : click}<br>크리티컬 확률 +${crit}%`;
            } else if (accKey === 'ring') {
                const dps = lvl * 1500;
                const boss = lvl * 1;
                return `초당 자동 DPS +${dps >= 10000 ? (dps/10000).toFixed(1)+'만' : dps}<br>보스 타격 피해 +${boss}%`;
            }
            return "";
        }

        function renderAccessoriesAndRelicsUI() {
            renderAccessoriesUI();
            renderRelicsUI();
        }

        function renderAccessoriesUI() {
            const container = document.getElementById("accessoriesShopGrid");
            if (!container) return;

            const stage = gameState.stage || 1;
            let html = "";

            for (let accKey in ACCESSORY_PARAMS) {
                const info = ACCESSORY_PARAMS[accKey];
                const currentLvl = (gameState[info.key]) || 0;
                const isUnlocked = stage >= info.unlockStage;
                const isMax = currentLvl >= 100;
                const cost = isMax ? 0 : Math.floor(info.baseCost * Math.pow(1.15, currentLvl));

                const slotEl = document.getElementById(`accSlot_${accKey}`);
                if (slotEl) {
                    if (currentLvl > 0 && isUnlocked) {
                        slotEl.classList.remove("hidden");
                        slotEl.classList.add("flex");
                        const auraColor = currentLvl >= 60 ? "border-amber-400 shadow-[0_0_15px_#f59e0b]" : (currentLvl >= 30 ? "border-purple-400 shadow-[0_0_10px_#a855f7]" : "border-sky-400");
                        slotEl.className = `w-6 h-6 bg-black/80 ${auraColor} flex items-center justify-center p-0.5 transition duration-300`;
                    } else {
                        slotEl.classList.add("hidden");
                        slotEl.classList.remove("flex");
                    }
                }

                // 구체적 레벨별 연마 수치 수식 (100강 연마 시스템)
                let currentBonusText = "";
                let nextBonusText = "";

                if (accKey === 'necklace') {
                    const dmg = (currentLvl * 1.5).toFixed(1);
                    const cd = Math.min(30, currentLvl * 0.3).toFixed(1);
                    const nextDmg = ((currentLvl + 1) * 1.5).toFixed(1);
                    const nextCd = Math.min(30, (currentLvl + 1) * 0.3).toFixed(1);
                    currentBonusText = `스킬피해 +${dmg}% | 쿨감 -${cd}%`;
                    nextBonusText = `스킬피해 +${nextDmg}% | 쿨감 -${nextCd}%`;
                } else if (accKey === 'bracelet') {
                    const click = currentLvl * 800;
                    const crit = Math.min(25, currentLvl * 0.25).toFixed(1);
                    const nextClick = (currentLvl + 1) * 800;
                    const nextCrit = Math.min(25, (currentLvl + 1) * 0.25).toFixed(1);
                    currentBonusText = `클릭타격 +${click.toLocaleString()} | 크리티컬 +${crit}%`;
                    nextBonusText = `클릭타격 +${nextClick.toLocaleString()} | 크리티컬 +${nextCrit}%`;
                } else if (accKey === 'ring') {
                    const dps = currentLvl * 1500;
                    const boss = currentLvl * 1;
                    const nextDps = (currentLvl + 1) * 1500;
                    const nextBoss = (currentLvl + 1) * 1;
                    currentBonusText = `자동DPS +${dps.toLocaleString()} | 보스피해 +${boss}%`;
                    nextBonusText = `자동DPS +${nextDps.toLocaleString()} | 보스피해 +${nextBoss}%`;
                }

                const currentMastered = Math.max(gameState.masteredWords ? gameState.masteredWords.length : 0, gameState.totalQuizCorrect || 0);
                const reqWords = (currentLvl + 1) * 3;
                const hasWords = currentMastered >= reqWords;
                const hasGold = gameState.gold >= cost;

                const btnColorClass = !isUnlocked || isMax
                    ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                    : (hasGold && hasWords
                        ? 'bg-purple-700 hover:bg-purple-600 text-white shadow-md cursor-pointer'
                        : 'bg-purple-950/80 text-purple-300 border border-purple-800 hover:bg-purple-900 cursor-pointer');

                const btnText = !isUnlocked
                    ? `<span>🔒 ${info.unlockStage}스테이지 필요</span>`
                    : isMax
                        ? '<span>MAX (100강 연마 달성)</span>'
                        : `<div class="flex flex-col items-center justify-center leading-tight">
                               <span class="font-extrabold">🪙 ${cost.toLocaleString()}G 연마</span>
                               <span class="text-[10px] mt-0.5 font-bold opacity-90">📖 정복단어 (${currentMastered}/${reqWords})</span>
                           </div>`;

                html += `
                    <div class="bg-[#0d0d0d] border ${isUnlocked ? 'border-purple-900/80 shadow-[0_0_10px_rgba(147,51,234,0.15)]' : 'border-gray-900 opacity-50'} p-3 rounded-none-forced flex flex-col justify-between min-h-[135px] min-w-0">
                        <div>
                            <div class="flex justify-between items-center mb-1">
                                <h4 class="font-extrabold text-xs text-purple-300 flex items-center gap-1 truncate">
                                    <img src="${info.img}" class="w-4 h-4 object-contain inline">
                                    <span>${info.name}</span>
                                </h4>
                                ${currentLvl > 0 ? `<span class="text-[10px] font-bold text-yellow-300 bg-purple-950/80 border border-purple-700 px-1.5 py-0.5 ">Lv.${currentLvl}</span>` : ''}
                            </div>
                            <p class="text-[11px] text-gray-400 mb-1.5">${isUnlocked ? info.desc : `🔒 ${info.unlockStage}스테이지 달성 시 해금`}</p>
                            ${isUnlocked ? `
                                <div class="text-[10px] bg-black p-1.5 border border-purple-900/50 rounded-none-forced  mb-2">
                                    <div class="text-purple-300 font-bold">현재: ${currentLvl > 0 ? currentBonusText : '연마 전 (0강)'}</div>
                                    ${!isMax ? `<div class="text-yellow-400 mt-0.5">다음: ${nextBonusText}</div>` : ''}
                                </div>
                            ` : ''}
                        </div>
                        <div>
                            <button onclick="${isUnlocked && !isMax ? `upgradeAccessory('${accKey}')` : ''}" ${!isUnlocked || isMax ? 'disabled' : ''} class="w-full py-1.5 text-[9px] font-extrabold rounded-none-forced transition ${btnColorClass}">
                                ${btnText}
                            </button>
                        </div>
                    </div>
                `;
            }
            container.innerHTML = html;
        }

        function upgradeAccessory(accKey) {
            const info = ACCESSORY_PARAMS[accKey];
            const currentLvl = (gameState[info.key]) || 0;
            const cost = Math.floor(info.baseCost * Math.pow(1.15, currentLvl));
            const currentMastered = Math.max(gameState.masteredWords ? gameState.masteredWords.length : 0, gameState.totalQuizCorrect || 0);
            const reqWords = (currentLvl + 1) * 3;

            if (gameState.gold < cost) {
                showToast(`🪙 골드가 부족합니다! 연마하려면 ${cost.toLocaleString()} Gold가 필요합니다.`);
                return;
            }

            if (currentMastered < reqWords) {
                showToast(`📖 정복한 단어가 부족합니다! (현재: ${currentMastered}개 / 필요: ${reqWords}개) 영단어 퀴즈를 풀어 단어를 정복해보세요!`);
                return;
            }

            gameState.gold -= cost;
            gameState[info.key] = currentLvl + 1;
            playSoundEffect('levelup');
            showToast(`💍 [${info.name}] 연마 성공! Lv.${currentLvl + 1}강 도달! (정복 단어 ${reqWords}개 조건 달성)`);

            renderAccessoriesUI();
            refreshStateVisuals();
            saveLocalCache();
        }

        function renderRelicsUI() {
            const grid = document.getElementById("relicsInventoryGrid");
            if (!grid) return;

            if (!gameState.acquiredRelics) gameState.acquiredRelics = [];
            if (typeof gameState.equippedRelicId === 'undefined') gameState.equippedRelicId = null;

            const essenceEl = document.getElementById("relicEssenceCountText");
            if (essenceEl) essenceEl.innerText = (gameState.relicEssence || 0).toLocaleString();

            let html = "";
            RELIC_DEFINITIONS.forEach(r => {
                const acquired = gameState.acquiredRelics.find(item => item.id === r.id);
                const isAcquired = !!acquired;
                const isEquipped = gameState.equippedRelicId === r.id;
                const gradeInfo = acquired ? (SKILL_GRADES[acquired.grade] || SKILL_GRADES.normal) : SKILL_GRADES.normal;
                const starsCount = acquired ? (acquired.stars || 0) : 0;
                const starsHtml = starsCount > 0 ? "⭐".repeat(starsCount) : "0성";

                // 장착 중인 유물 1개를 전장 화면에 시각화 업데이트
                if (isEquipped) {
                    const heroRelicSlot = document.getElementById("heroRelicSlot");
                    const heroRelicImg = document.getElementById("heroRelicImg");
                    if (heroRelicSlot) {
                        heroRelicSlot.classList.remove("hidden");
                        heroRelicSlot.classList.add("flex");
                        if (heroRelicImg) heroRelicImg.src = r.img;
                    }
                }

                const cardBorder = isEquipped 
                    ? "border-2 border-yellow-400 bg-yellow-950/60 shadow-[0_0_15px_rgba(250,204,21,0.7)]" 
                    : (isAcquired ? gradeInfo.colorClass : 'border-gray-900 bg-black/60 opacity-40');

                const expMap = { normal: 1, rare: 3, hero: 9, legendary: 27, mythic: 81 };
                const reqExp = isAcquired ? expMap[acquired.grade] || 1 : 1;
                const expHtml = (isAcquired && starsCount < 6) ? `<span class="text-[7px] text-gray-400 font-normal mr-1">(${acquired.exp || 0}/${reqExp})</span>` : "";

                html += `
                    <div class="border ${cardBorder} p-2 text-center flex flex-col justify-between min-h-[145px] rounded-none-forced relative group transition">
                        <div>
                            <div class="flex justify-between items-center text-[8px] text-gray-300 font-bold mb-1">
                                <span class="${isAcquired ? 'text-yellow-300 font-black' : 'text-gray-500'}">${isAcquired ? gradeInfo.name : '미해금'}</span>
                                <div class="flex items-center">
                                    ${expHtml}
                                    <span class="text-yellow-400 ">${starsHtml}</span>
                                </div>
                            </div>
                            
                            <!-- 🏺 유물 고유 이미지 포함 -->
                            <div class="w-12 h-12 mx-auto my-1 flex items-center justify-center bg-black/50 border border-gray-800 rounded-none-forced p-1">
                                <img src="${r.img}" onerror="this.onerror=null;" class="w-full h-full object-contain filter drop-shadow-[0_0_6px_rgba(251,191,36,0.6)]">
                            </div>

                            <h5 class="text-[9px] font-black text-white leading-tight whitespace-nowrap overflow-hidden text-ellipsis px-1 tracking-tighter">${r.name}</h5>
                            <p class="text-[8px] font-bold text-yellow-300/90 leading-[1.2] mt-1 tracking-tighter">${getRelicEffectString(r, acquired)}</p>
                        </div>

                        <div class="mt-2">
                            ${isAcquired ? `
                                <button onclick="equipRelic('${r.id}')" class="w-full py-1 text-[9px] font-black rounded-none-forced transition ${isEquipped ? 'bg-yellow-400 text-black border border-yellow-500 shadow-md' : 'bg-gray-800 hover:bg-gray-700 text-gray-200'}">
                                    ${isEquipped ? '✨ 장착중' : '⚔️ 장착하기'}
                                </button>
                            ` : `
                                <span class="block py-1 text-[8px] font-bold text-gray-500 bg-gray-950 border border-gray-900">🔒 소환 필요</span>
                            `}
                        </div>
                    </div>
                `;
            });

            grid.innerHTML = html;

            // 만약 아무 유물도 장착되지 않았거나 장착 유물이 해제된 경우 전장 슬롯 숨김
            if (!gameState.equippedRelicId) {
                const heroRelicSlot = document.getElementById("heroRelicSlot");
                if (heroRelicSlot) {
                    heroRelicSlot.classList.add("hidden");
                    heroRelicSlot.classList.remove("flex");
                }
            }
        }

        function equipRelic(relicId) {
            if (!gameState.acquiredRelics) return;
            const acquired = gameState.acquiredRelics.find(item => item.id === relicId);
            if (!acquired) {
                showToast("⚠️ 아직 소환하여 획득하지 못한 유물입니다!");
                return;
            }

            if (gameState.equippedRelicId === relicId) {
                // 이미 장착된 유물 클릭 시 해제
                gameState.equippedRelicId = null;
                showToast("🛡️ 유물 장착을 해제했습니다.");
            } else {
                // 새 유물 1개 전용 장착
                gameState.equippedRelicId = relicId;
                const rDef = RELIC_DEFINITIONS.find(item => item.id === relicId);
                const rName = rDef ? rDef.name : "고대 유물";
                playSoundEffect('levelup');
                showToast(`🏺 [${rName}] 유물을 전용 장착했습니다! 유물 능력이 개발됩니다.`);
            }

            renderRelicsUI();
            refreshStateVisuals();
            saveLocalCache();
        }

        function drawRelicCapsule(drawCount = 1) {
            if (typeof gameState.bossTokens === 'undefined') gameState.bossTokens = 0;
            const cost = drawCount === 10 ? 450 : 50 * drawCount;

            if (gameState.bossTokens < cost) {
                showToast(`⚠️ 고대 유물 소환을 위해 [고대 보스 증표] ${cost}개가 필요합니다! 보스전을 통해 증표를 모으세요.`);
                return;
            }

            gameState.bossTokens -= cost;
            refreshStateVisuals();

            if (!gameState.acquiredRelics) gameState.acquiredRelics = [];
            if (typeof gameState.relicEssence === 'undefined') gameState.relicEssence = 0;

            let drawnResults = [];
            let refundCount = 0;

            for (let i = 0; i < drawCount; i++) {
                const pickedRelicDef = RELIC_DEFINITIONS[Math.floor(Math.random() * RELIC_DEFINITIONS.length)];
                const roll = Math.random();
                let rolledGrade = "normal";
                if (roll < 0.0005) rolledGrade = "mythic";        // 0.05%
                else if (roll < 0.02) rolledGrade = "legendary";   // 1.95% (0.05%~2.00%)
                else if (roll < 0.07) rolledGrade = "hero";
                            
                                    // 5.00% (2.00%~7.00%)
                else if (roll < 0.25) rolledGrade = "rare";        // 18.00% (7.00%~25.00%)

                let existing = gameState.acquiredRelics.find(item => item.id === pickedRelicDef.id);
                
                const expMap = { normal: 1, rare: 3, hero: 9, legendary: 27, mythic: 81 };
                const rolledExp = expMap[rolledGrade] || 1;

                if (existing) {
                    const normalizedGrade = Object.prototype.hasOwnProperty.call(SKILL_GRADES, existing.grade) ? existing.grade : "normal";
                    const normalizedStars = Number(existing.stars);
                    const normalizedExp = Number(existing.exp);
                    existing.grade = normalizedGrade;
                    existing.stars = Number.isFinite(normalizedStars) ? Math.min(6, Math.max(0, Math.floor(normalizedStars))) : 0;
                    existing.exp = Number.isFinite(normalizedExp) ? Math.max(0, Math.floor(normalizedExp)) : 0;

                    const previousGrade = existing.grade;
                    const previousStars = existing.stars;
                    const previousExp = existing.exp;
                    const oldRank = (SKILL_GRADES[existing.grade] || SKILL_GRADES.normal).rank;
                    const newRank = (SKILL_GRADES[rolledGrade] || SKILL_GRADES.normal).rank;

                    if (newRank > oldRank) {
                        // 상위 등급 획득: 기존 경험치와 이번 획득 경험치를 모두 보존한 뒤
                        // 새 등급의 요구 경험치로 별과 잔여 경험치를 다시 계산합니다.
                        if (typeof existing.exp === 'undefined') existing.exp = 0;
                        const oldReqExp = expMap[existing.grade] || 1;
                        const totalExp = (existing.stars || 0) * oldReqExp + (existing.exp || 0) + rolledExp;
                        existing.grade = rolledGrade;
                        const currentReqExp = expMap[existing.grade] || 1;
                        existing.stars = Math.floor(totalExp / currentReqExp);
                        existing.exp = totalExp % currentReqExp;
                        if (existing.stars >= 6) {
                            existing.stars = 6;
                            existing.exp = 0;
                        }
                        drawnResults.push({ def: pickedRelicDef, grade: rolledGrade, rolledGrade, currentGrade: existing.grade, stars: existing.stars, currentExp: existing.exp, reqExp: currentReqExp, gainedExp: rolledExp, previousGrade, previousStars, previousExp, isDuplicate: true, isGradePromotion: true });
                    } else if ((existing.stars || 0) >= 6) {
                        const rewardMap = { "normal": 1, "rare": 2, "hero": 3, "legendary": 4, "mythic": 5 };
                        const reward = rewardMap[rolledGrade] || 1;
                        gameState.relicEssence = (gameState.relicEssence || 0) + reward;
                        refundCount += reward;
                        drawnResults.push({ def: pickedRelicDef, grade: rolledGrade, rolledGrade, currentGrade: existing.grade, stars: 6, currentExp: 0, reqExp: expMap[existing.grade] || 1, gainedExp: 0, previousGrade, previousStars, previousExp, isDuplicate: true, isEssenceRefund: true, refundAmount: reward });
                    } else {
                        if (typeof existing.exp === 'undefined') existing.exp = 0;
                        const oldReqExp = expMap[existing.grade] || 1;
                        const totalExp = (existing.stars || 0) * oldReqExp + (existing.exp || 0) + rolledExp;
                        const currentReqExp = expMap[existing.grade] || 1;
                        existing.stars = Math.floor(totalExp / currentReqExp);
                        existing.exp = totalExp % currentReqExp;
                        if (existing.stars >= 6) {
                            existing.stars = 6;
                            existing.exp = 0;
                        }
                        drawnResults.push({ def: pickedRelicDef, grade: rolledGrade, rolledGrade, currentGrade: existing.grade, stars: existing.stars, currentExp: existing.exp, reqExp: currentReqExp, gainedExp: rolledExp, previousGrade, previousStars, previousExp, isDuplicate: true });
                    }
                } else {
                    existing = {
                        id: pickedRelicDef.id,
                        grade: rolledGrade,
                        stars: 0,
                        exp: 0
                    };
                    gameState.acquiredRelics.push(existing);
                    drawnResults.push({ def: pickedRelicDef, grade: rolledGrade, rolledGrade, currentGrade: rolledGrade, stars: existing.stars, currentExp: existing.exp, reqExp: expMap[rolledGrade], gainedExp: 0, previousGrade: null, previousStars: 0, previousExp: 0, isNew: true });
                }
            }

            playSoundEffect('levelup');
            if (refundCount > 0) {
                showToast(`🏺 6성 Max 유물 중복 획득으로 [고대 신화 정수] +${refundCount}개가 환급 적립되었습니다!`);
            }
            
            showRelicDrawResultModal(drawnResults);
            renderRelicsUI();
            saveRelicStateImmediately();
        }

        function selectMythicCraftTarget(acquiredRelics = []) {
            const gradeRanks = { normal: 1, rare: 2, hero: 3, legendary: 4, mythic: 5 };
            let best = null;

            (Array.isArray(acquiredRelics) ? acquiredRelics : []).forEach((item, index) => {
                if (!item || typeof item !== 'object') return;
                const grade = Object.prototype.hasOwnProperty.call(gradeRanks, item.grade) ? item.grade : 'normal';
                const starsValue = Number(item.stars);
                const expValue = Number(item.exp);
                const stars = Number.isFinite(starsValue) ? Math.min(6, Math.max(0, Math.floor(starsValue))) : 0;
                const exp = Number.isFinite(expValue) ? Math.max(0, Math.floor(expValue)) : 0;
                if (grade === 'mythic' && stars >= 6) return;

                const candidate = {
                    item,
                    index,
                    gradeRank: gradeRanks[grade],
                    stars,
                    exp,
                    id: String(item.id || '')
                };
                if (!best
                    || candidate.gradeRank > best.gradeRank
                    || (candidate.gradeRank === best.gradeRank && candidate.stars > best.stars)
                    || (candidate.gradeRank === best.gradeRank && candidate.stars === best.stars && candidate.exp > best.exp)
                    || (candidate.gradeRank === best.gradeRank && candidate.stars === best.stars && candidate.exp === best.exp && candidate.id < best.id)
                    || (candidate.gradeRank === best.gradeRank && candidate.stars === best.stars && candidate.exp === best.exp && candidate.id === best.id && candidate.index < best.index)) {
                    best = candidate;
                }
            });

            return best ? best.item : null;
        }
        window.__vocaHeroTestHooks = { ...(window.__vocaHeroTestHooks || {}), selectMythicCraftTarget };

        function craftMythicRelicFromEssence() {
            if (typeof gameState.relicEssence === 'undefined') gameState.relicEssence = 0;
            const cost = 500;
            if (gameState.relicEssence < cost) {
                showToast(`⚠️ 신화 유물 연성을 위해 [고대 신화 정수] ${cost}개가 필요합니다! (현재: ${gameState.relicEssence}개) 6성 Max 유물 중복 소환 시 정수가 환급됩니다.`);
                return;
            }

            gameState.relicEssence -= cost;
            if (!gameState.acquiredRelics) gameState.acquiredRelics = [];

            // 아직 6성 신화가 아닌 유물 중 가장 상위 등급 유물을 100% 확정 6성 신화로 승급!
            let targetRelic = selectMythicCraftTarget(gameState.acquiredRelics);
            if (!targetRelic) {
                const unacquiredDef = RELIC_DEFINITIONS.find(def => !gameState.acquiredRelics.some(r => r.id === def.id));
                if (unacquiredDef) {
                    targetRelic = { id: unacquiredDef.id, grade: 'mythic', stars: 6, exp: 0 };
                    gameState.acquiredRelics.push(targetRelic);
                }
            }

            if (targetRelic) {
                targetRelic.grade = 'mythic';
                targetRelic.stars = 6;
                targetRelic.exp = 0;
                const rDef = RELIC_DEFINITIONS.find(d => d.id === targetRelic.id);
                const rName = rDef ? rDef.name : "고대 유물";
                playSoundEffect('levelup');
                showToast(`✨ [고대 신화 연성 성공] [${rName}] 유물이 100% 확정 6성 신화 등급으로 완벽 승급되었습니다!`);
            } else {
                gameState.relicTranscendLvl = (gameState.relicTranscendLvl || 0) + 1;
                playSoundEffect('levelup');
                showToast(`🌟 [유물 한계 초월 연마] 모든 유물이 이미 6성 신화입니다! 유물 초월 Lv.${gameState.relicTranscendLvl} 달성! (전체 유물 스탯 +10% 중첩 적용)`);
            }

            renderRelicsUI();
            refreshStateVisuals();
            saveRelicStateImmediately();
        }

        function saveRelicStateImmediately() {
            saveLocalCache();
            try {
                const cloudSaveResult = typeof saveSessionToCloud === 'function' ? saveSessionToCloud(true) : null;
                if (cloudSaveResult && typeof cloudSaveResult.catch === 'function') {
                    cloudSaveResult.catch(error => console.warn('Immediate relic cloud save failed:', error));
                }
            } catch (error) {
                console.warn('Immediate relic cloud save failed:', error);
            }
        }

        window.revealHiddenRelic = function(el, colorClass) {
            const overlay = el.querySelector('.hidden-overlay');
            const content = el.querySelector('.relic-actual-content');
            if (overlay && !overlay.classList.contains('pointer-events-none')) {
                overlay.classList.add('opacity-0', 'pointer-events-none');
                content.classList.remove('opacity-0');
                el.className = `border ${colorClass} p-2 text-center flex flex-col justify-between min-h-[120px] rounded-none-forced transition-all duration-700`;
                
                playSoundEffect('success');
                
                window.wbRelicsToReveal--;
                const btn = document.getElementById("relicDrawResultConfirmBtn");
                if (btn && window.wbRelicsToReveal <= 0) {
                    btn.disabled = false;
                    btn.classList.remove("opacity-50", "cursor-not-allowed");
                    btn.innerText = "✨ 확인 및 유물함 보관";
                } else if (btn) {
                    btn.innerText = `✨ 모든 유물 확인 대기중 (${window.wbRelicsToReveal}개 남음)`;
                }
            }
        };

        function getRelicDrawResultPresentation(res) {
            const rolledGrade = res?.rolledGrade || res?.grade || "normal";
            const currentGrade = res?.currentGrade || rolledGrade;
            const rolledGradeInfo = SKILL_GRADES[rolledGrade] || SKILL_GRADES.normal;
            const currentGradeInfo = SKILL_GRADES[currentGrade] || SKILL_GRADES.normal;
            const gainedExp = Math.max(0, Number(res?.gainedExp || 0));
            const currentStars = Math.max(0, Math.floor(Number(res?.stars) || 0));
            const previousStars = Math.max(0, Math.floor(Number(res?.previousStars) || 0));
            const starGain = Math.max(0, currentStars - previousStars);
            const starGainText = starGain > 0 ? ` · ${starGain}성 강화` : "";
            let outcomeText = `${rolledGradeInfo.name} 획득`;
            if (res?.isEssenceRefund) outcomeText = `${rolledGradeInfo.name} 획득 → 6성 ${currentGradeInfo.name} · 신화 정수 +${Math.max(0, Number(res.refundAmount || 0))}`;
            else if (res?.isNew) outcomeText = `신규 ${rolledGradeInfo.name} 유물 획득`;
            else if (res?.isGradePromotion) outcomeText = `${rolledGradeInfo.name} 획득 → 보유 등급 ${currentGradeInfo.name} 승급 · EXP +${gainedExp}${starGainText}`;
            else if (rolledGrade === currentGrade) outcomeText = `동일 등급 ${rolledGradeInfo.name} 획득 · EXP +${gainedExp}${starGainText}`;
            else outcomeText = `${rolledGradeInfo.name} 획득 → 보유 ${currentGradeInfo.name} EXP +${gainedExp}${starGainText}`;
            return { rolledGrade, currentGrade, rolledGradeInfo, currentGradeInfo, gainedExp, starGain, outcomeText };
        }
        window.__vocaHeroTestHooks = { ...(window.__vocaHeroTestHooks || {}), getRelicDrawResultPresentation };
        function showRelicDrawResultModal(results) {
            const grid = document.getElementById("relicDrawResultGrid");
            if (!grid) return;

            let html = "";
            let hiddenCount = 0;
            results.forEach(res => {
                const presentation = getRelicDrawResultPresentation(res);
                const { rolledGrade, currentGrade, rolledGradeInfo, outcomeText } = presentation;
                const isHighGrade = (rolledGrade === 'legendary' || rolledGrade === 'mythic');
                const starsHtml = res.stars > 0 ? "⭐".repeat(res.stars) : "0성";
                const innerHtml = `
                        <div class="flex justify-between items-center text-[7px] text-gray-300 font-bold mb-1 w-full">
                            <span class="text-gray-200">추첨 ${rolledGradeInfo.name}</span>
                            <div class="flex items-center">
                                ${res.stars < 6 && res.currentExp !== undefined ? `<span class="text-[6px] text-gray-400 font-normal mr-1">(${res.currentExp}/${res.reqExp})</span>` : ""}
                                <span class="text-yellow-400">${starsHtml}</span>
                            </div>
                        </div>
                        <div class="w-10 h-10 mx-auto my-1 flex items-center justify-center bg-black/50 border border-gray-800 p-1">
                            <img src="${res.def.img}" class="w-full h-full object-contain filter drop-shadow-[0_0_8px_#fbbf24]">
                        </div>
                        <h5 class="text-[9px] font-black text-white whitespace-nowrap overflow-hidden text-ellipsis px-1 tracking-tighter w-full">${res.def.name}</h5>
                        <p class="mt-1 w-full text-[7px] font-black leading-[1.25] text-sky-200">${outcomeText}</p>
                        <p class="text-[7px] font-bold text-yellow-300 mt-0.5 leading-[1.2] tracking-tighter w-full">${getRelicEffectString(res.def, {grade: currentGrade, stars: res.stars})}</p>
                `;

                if (isHighGrade) {
                    hiddenCount++;
                    html += `
                    <div class="border border-yellow-500/50 p-2 text-center flex flex-col justify-between min-h-[140px] rounded-none-forced relative cursor-pointer group" onclick="revealHiddenRelic(this, '${rolledGradeInfo.colorClass}')">
                        <div class="hidden-overlay absolute inset-0 bg-gradient-to-br from-gray-800 to-gray-900 flex flex-col items-center justify-center z-10 transition-opacity duration-500 group-hover:brightness-125">
                            <span class="text-2xl animate-bounce">✨</span>
                            <span class="text-[8px] text-yellow-400 font-bold mt-1">클릭하여 확인!</span>
                        </div>
                        <div class="relic-actual-content opacity-0 transition-opacity duration-1000 w-full h-full flex flex-col justify-between items-center">
                            ${innerHtml}
                        </div>
                    </div>
                    `;
                } else {
                    html += `
                        <div class="border ${rolledGradeInfo.colorClass} p-2 text-center flex flex-col justify-between min-h-[140px] rounded-none-forced items-center">
                            ${innerHtml}
                        </div>
                    `;
                }
            });

            grid.innerHTML = html;
            window.wbRelicsToReveal = hiddenCount;
            const btn = document.getElementById("relicDrawResultConfirmBtn");
            if (btn) {
                if (hiddenCount > 0) {
                    btn.disabled = true;
                    btn.classList.add("opacity-50", "cursor-not-allowed");
                    btn.innerText = `✨ 모든 유물 확인 대기중 (${hiddenCount}개 남음)`;
                } else {
                    btn.disabled = false;
                    btn.classList.remove("opacity-50", "cursor-not-allowed");
                    btn.innerText = "✨ 확인 및 유물함 보관";
                }
            }

            const modal = document.getElementById("relicDrawResultModal");
            if (modal) {
                modal.classList.remove("hidden");
                modal.classList.add("flex");
            }
        }
  
          function closeSkillAcquireModal() {
              document.getElementById('skillAcquireModal').classList.remove('flex');
              document.getElementById('skillAcquireModal').classList.add('hidden');
              if (typeof tutorialStep !== 'undefined' && !gameState.tutorialCompleted && tutorialStep === 7) {
                  tutorialStep = 8;
                  setTimeout(showTutorialOverlay, 500);
              }
          }

        // ==========================================
        // QUIZ, SKILLS & SPELLS
        // ==========================================
        function speakTargetWord() {
            if (!gameState.wordsPool || gameState.wordsPool.length === 0) return;
            const word = gameState.wordsPool[gameState.currentQuizIndex].word;
            if ('speechSynthesis' in window) {
                const utterance = new SpeechSynthesisUtterance(word);
                utterance.lang = 'en-US';
                utterance.rate = 0.85;
                if (gameState.soundSettings) {
                    const masterScale = (typeof gameState.soundSettings.masterVolume !== 'undefined' ? gameState.soundSettings.masterVolume : 10) / 10;
                    utterance.volume = masterScale;
                }
                window.speechSynthesis.speak(utterance);
            } else {
                showToast("🔊 단어 발음 합성 기능이 이 장치에서 거부되었습니다.");
            }
        }

        function normalizeEnglishAnswer(value) {
            return String(value || "").normalize("NFKC").trim().toLowerCase().replace(/[^a-z]/g, "");
        }

        function formatEnglishWordInput(inputEl) {
            if (!inputEl) return false;
            const raw = String(inputEl.value || "").normalize("NFKC");
            if (!/^[A-Za-z]*$/.test(raw)) {
                inputEl.value = "";
                showToast("⚠️ 영어 알파벳만 입력할 수 있어요. 띄어쓰기는 입력하지 않아도 정답으로 인정돼요.");
                return false;
            }
            const lower = raw.toLowerCase();
            inputEl.value = lower ? lower.charAt(0).toUpperCase() + lower.slice(1) : "";
            return true;
        }
        function formatEnglishWordDisplay(value) {
            const lower = String(value || "").normalize("NFKC").trim().toLowerCase();
            return lower ? lower.charAt(0).toUpperCase() + lower.slice(1) : "";
        }
        window.normalizeVocaEnglishAnswer = normalizeEnglishAnswer;
        window.formatVocaEnglishInput = formatEnglishWordInput;
        window.formatVocaEnglishDisplay = formatEnglishWordDisplay;

        function ensureQuizConstructedArea() {
            const grid = document.getElementById("quizChoiceGrid") || document.querySelector(".choice-btn")?.parentElement;
            if (grid && !grid.id) grid.id = "quizChoiceGrid";
            let area = document.getElementById("quizConstructedAnswer");
            if (!area && grid) {
                area = document.createElement("div");
                area.id = "quizConstructedAnswer";
                area.className = "mb-4 hidden border border-sky-900/70 bg-sky-950/10 p-3";
                grid.after(area);
            }
            return area;
        }

        function showQuizChoiceMode() {
            const grid = document.getElementById("quizChoiceGrid");
            const area = ensureQuizConstructedArea();
            if (grid) grid.classList.remove("hidden");
            if (area) {
                area.classList.add("hidden");
                area.replaceChildren();
            }
        }

        function submitConstructedQuizAnswer(value, current) {
            if (isEvaluatingQuiz) return;
            const answer = String(value || "");
            if (!/^[A-Za-z]+$/.test(answer.trim())) {
                showToast("⚠️ 영어 알파벳만 입력할 수 있어요. 띄어쓰기는 입력하지 않아도 정답으로 인정돼요.");
                return;
            }
            gameState.currentQuizCorrectAnswer = 0;
            evaluateAnswer(normalizeEnglishAnswer(answer) === normalizeEnglishAnswer(current?.word) ? 0 : 1);
        }

        function renderQuizConstructedInput(current, type) {
            const grid = document.getElementById("quizChoiceGrid");
            const area = ensureQuizConstructedArea();
            if (!area) return;
            if (grid) grid.classList.add("hidden");
            area.classList.remove("hidden");
            area.replaceChildren();
            const meaning = document.createElement("p");
            meaning.className = "mb-3 text-center text-sm font-black text-sky-200";
            meaning.textContent = `뜻: ${current.meaning}`;
            area.append(meaning);
            if (type === "short-answer") {
                const form = document.createElement("div"),input = document.createElement("input"),submit = document.createElement("button");
                form.className = "flex gap-2";
                input.type = "text";
                input.autocomplete = "off";
                input.spellcheck = false;
                input.maxLength = 80;
                input.placeholder = "알맞은 영어 단어를 입력하세요";
                input.className = "min-w-0 flex-1 border border-[#3c3c3c] bg-[#111] p-3 text-center font-black text-white outline-none focus:border-sky-400";
                submit.type = "button";
                submit.className = "shrink-0 border border-sky-500 bg-sky-950/40 px-4 text-xs font-black text-sky-100";
                submit.textContent = "정답 확인";
                submit.onclick = () => submitConstructedQuizAnswer(input.value, current);
                input.oninput = () => formatEnglishWordInput(input);
                input.onkeydown = (event) => { if (event.key === "Enter" && !event.isComposing) submitConstructedQuizAnswer(input.value, current); };
                form.append(input,submit);
                area.append(form);
                setTimeout(() => input.focus(), 50);
                return;
            }
            const normalized = normalizeEnglishAnswer(current.word);
            const selected = [];
            const answer = document.createElement("div"),tiles = document.createElement("div"),controls = document.createElement("div"),reset = document.createElement("button"),submit = document.createElement("button");
            answer.className = "mb-3 min-h-12 border border-yellow-600 bg-black p-3 text-center text-xl font-black tracking-[.25em] text-yellow-300";
            tiles.className = "flex flex-wrap justify-center gap-2";
            controls.className = "mt-3 flex justify-center gap-2";
            reset.type = "button";
            reset.className = "border border-[#444] bg-[#151515] px-3 py-2 text-[10px] font-bold text-gray-300";
            reset.textContent = "다시 배열";
            submit.type = "button";
            submit.className = "border border-yellow-500 bg-yellow-950/30 px-4 py-2 text-[10px] font-black text-yellow-200";
            submit.textContent = "정답 확인";
            const source = [...normalized].map((char,index) => ({char,index})).sort(() => Math.random() - .5);
            if (source.map((entry) => entry.char).join("") === normalized) source.reverse();
            const refresh = () => { answer.textContent = selected.length ? selected.map((entry) => entry.char).join(" ") : "철자를 차례대로 선택하세요"; };
            source.forEach((entry) => {
                const button = document.createElement("button");
                button.type = "button";
                button.className = "min-w-10 border border-sky-700 bg-[#111] px-3 py-2 text-sm font-black text-white hover:border-sky-300";
                button.textContent = entry.char.toUpperCase();
                button.onclick = () => { if (button.disabled) return; button.disabled = true; button.classList.add("opacity-30"); selected.push({...entry,button}); refresh(); };
                tiles.append(button);
            });
            reset.onclick = () => { selected.splice(0); tiles.querySelectorAll("button").forEach((button) => { button.disabled = false; button.classList.remove("opacity-30"); }); refresh(); };
            submit.onclick = () => submitConstructedQuizAnswer(selected.map((entry) => entry.char).join(""), current);
            controls.append(reset,submit);
            area.append(answer,tiles,controls);
            refresh();
        }

        function renderChoices(choices, correctChoice, formatAsWord = true) {
            showQuizChoiceMode();
            currentQuizChoices = [...choices].slice(0, 4);
            currentQuizChoices.sort(() => 0.5 - Math.random());
            currentQuizCorrectValue = correctChoice;
            gameState.currentQuizCorrectAnswer = currentQuizChoices.indexOf(correctChoice);

            const buttons = document.getElementsByClassName("choice-btn");
            for (let i = 0; i < buttons.length; i++) {
                const value = currentQuizChoices[i] ?? "";
                buttons[i].querySelector(".choice-text").innerText = formatAsWord && /^[A-Za-z]+(?:\s+[A-Za-z]+)*$/.test(String(value || ""))
                    ? formatEnglishWordDisplay(value)
                    : String(value || "").toLowerCase();
                buttons[i].className = "choice-btn p-3.5 bg-[#0d0d0d] hover:bg-[#1a1a1a] border border-[#3c3c3c] hover:border-white text-[#bbbbbb] hover:text-white font-bold rounded-none-forced text-center transition duration-150 flex items-center justify-center group";
            }
        }
        function capitalizeFirstLetter(str) {
            if (!str) return "";
            return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
        }

        function quizDistractors(field, correct) {
            const values = [];
            const add = (entry) => {
                const value = String(entry?.[field] || "").trim();
                if (value && value !== correct && !values.includes(value)) values.push(value);
            };
            (gameState.wordsPool || []).forEach(add);
            Object.values(MOCK_WORDS).flat().forEach(add);
            values.sort(() => 0.5 - Math.random());
            return values;
        }

        function ensureQuizTypeLabel() {
            let label = document.getElementById("quizTypeLabel");
            const word = document.getElementById("quizWordEng");
            if (!label && word?.parentElement) {
                label = document.createElement("p");
                label.id = "quizTypeLabel";
                label.className = "mb-2 text-[10px] font-bold text-sky-400";
                word.parentElement.insertBefore(label, word);
            }
            return label;
        }

        function generateQuizCard() {
            if (!gameState.wordsPool || gameState.wordsPool.length === 0) {
                document.getElementById("quizWordEng").innerText = "마법 성역의 단어가 고갈되었습니다";
                return;
            }

            gameState.currentQuizIndex = Math.floor(Math.random() * gameState.wordsPool.length);
            const current = gameState.wordsPool[gameState.currentQuizIndex];
            const allowed = new Set(["meaning-choice", "fill-blank", "word-choice", "listen-meaning", "word-order", "short-answer"]);
            const selected = [...new Set((Array.isArray(gameState.assignedQuestionTypes) ? gameState.assignedQuestionTypes : ["meaning-choice"]).filter((type) => allowed.has(type)))];
            currentQuizType = selected[(gameState.totalQuizTries || 0) % Math.max(1, selected.length)] || "meaning-choice";
            gameState.currentQuizType = currentQuizType;
            const prompt = document.getElementById("quizWordEng");
            prompt.style.whiteSpace = "normal";
            const typeLabel = ensureQuizTypeLabel();
            const labels = {
                "meaning-choice": "영어 단어의 뜻을 찾으세요",
                "fill-blank": "뜻을 보고 빈칸에 들어갈 철자를 찾으세요",
                "word-choice": "뜻에 알맞은 영어 단어를 찾으세요",
                "listen-meaning": "발음을 듣고 뜻을 찾으세요",
                "word-order": "뜻을 보고 철자를 순서대로 맞추세요",
                "short-answer": "뜻을 보고 영어 단어를 직접 쓰세요"
            };
            if (typeLabel) typeLabel.textContent = labels[currentQuizType] || labels["meaning-choice"];

            if (currentQuizType === "word-choice") {
                prompt.innerText = current.meaning;
                renderChoices([current.word, ...quizDistractors("word", current.word).slice(0, 3)], current.word);
                return;
            }
            if (currentQuizType === "listen-meaning") {
                prompt.innerText = "🔊 발음 듣기";
                renderChoices([current.meaning, ...quizDistractors("meaning", current.meaning).slice(0, 3)], current.meaning);
                if (gameState.soundSettings?.masterSoundOn !== false) setTimeout(speakTargetWord, 120);
                return;
            }
            if (currentQuizType === "fill-blank") {
                const word = String(current.word || "").toLowerCase();
                const positions = [...word].map((char, index) => /[a-z]/.test(char) ? index : -1).filter((index) => index >= 0);
                if (positions.length) {
                    const blankIndex = positions[Math.floor(Math.random() * positions.length)];
                    const correctLetter = word[blankIndex];
                    const alphabet = "abcdefghijklmnopqrstuvwxyz".split("").filter((letter) => letter !== correctLetter).sort(() => 0.5 - Math.random());
                    prompt.style.whiteSpace = "pre-line";
                    prompt.innerText = `뜻: ${current.meaning}\n${capitalizeFirstLetter(word.slice(0, blankIndex) + "_" + word.slice(blankIndex + 1))}`;
                    renderChoices([correctLetter, ...alphabet.slice(0, 3)], correctLetter, false);
                    return;
                }
            }
            if (currentQuizType === "word-order" || currentQuizType === "short-answer") {
                prompt.innerText = currentQuizType === "word-order" ? "철자 배열" : "영어 단답식";
                renderQuizConstructedInput(current, currentQuizType);
                return;
            }
            currentQuizType = "meaning-choice";
            gameState.currentQuizType = currentQuizType;
            if (typeLabel) typeLabel.textContent = labels["meaning-choice"];
            prompt.innerText = capitalizeFirstLetter(current.word);
            renderChoices([current.meaning, ...quizDistractors("meaning", current.meaning).slice(0, 3)], current.meaning);
        }

        function getSkillMultiplier(skill) {
            const baseGrade = SKILL_GRADES[skill.grade] || SKILL_GRADES.normal;
            const tier = skill.tier || 1;
            const stars = skill.stars || 0;

            // 세부 급간(Tier 1~3) 보정: Tier 1 (+0%), Tier 2 (+10%), Tier 3 (+20%)
            const tierFactor = 1 + (tier - 1) * 0.10;

            // 한계돌파 별(⭐ 1~6개) 완성당 +15% 수치 상승
            const starFactor = 1 + stars * 0.15;

            return Math.round(baseGrade.multiplier * tierFactor * starFactor);
        }

        function getRequiredExpForStar(grade) {
            // 등급별 1별 달성에 필요한 경험치 가치 (1장 = 1EXP, 희귀 3, 영웅 9, 전설 27, 신화 81)
            const expMap = { normal: 1, rare: 3, hero: 9, legendary: 27, mythic: 81 };
            return expMap[grade] || 1;
        }

        function getSkillSourcePool(preferredPool = null) {
            const source = [];
            const add = (item) => {
                if (!item || typeof item.word !== "string" || !item.word.trim()) return;
                const key = item.word.trim().toLowerCase();
                if (!source.some(entry => entry.word.toLowerCase() === key)) source.push({ word: item.word.trim(), meaning: item.meaning || "" });
            };
            const currentPool = Array.isArray(preferredPool) && preferredPool.length
                ? preferredPool
                : (Array.isArray(gameState.wordsPool) && gameState.wordsPool.length ? gameState.wordsPool : (MOCK_WORDS[String(gameState.grade)] || MOCK_WORDS["3"]));
            currentPool.forEach(add);
            return source;
        }

        function ensureActiveSkillDeck(preferredPool = null) {
            const source = getSkillSourcePool(preferredPool);
            if (!Array.isArray(gameState.activeSkillDeck)) gameState.activeSkillDeck = [];
            const sourceKeys = new Set(source.map(item => item.word.toLowerCase()));
            gameState.activeSkillDeck = gameState.activeSkillDeck.filter(item => item && sourceKeys.has(String(item.word || "").toLowerCase()));
            const deckSize = Math.min(24, source.length);
            const inDeck = new Set(gameState.activeSkillDeck.map(item => item.word.toLowerCase()));
            const candidates = source.filter(item => !inDeck.has(item.word.toLowerCase()));
            while (gameState.activeSkillDeck.length < deckSize && candidates.length) {
                const index = Math.floor(Math.random() * candidates.length);
                gameState.activeSkillDeck.push(candidates.splice(index, 1)[0]);
            }
            return gameState.activeSkillDeck;
        }

        function pickSkillReward(preferredPool = null) {
            const source = getSkillSourcePool(preferredPool);
            if (!source.length) return { word: "magic", meaning: "magic" };
            // 학년(또는 교사가 배정한) 단어장 전체에서 매번 같은 확률로 무작위 추첨합니다.
            return source[Math.floor(Math.random() * source.length)];
        }

        function grantUniversalAwakeningEssence(amount = 1) {
            gameState.skillEssence = Math.max(0, (gameState.skillEssence || 0) + amount);
            const targetId = (gameState.equippedSkills || [])[0];
            const target = targetId && (gameState.skillsInventory || []).find(skill => skill.id === targetId);
            if (!target || (target.stars || 0) >= 6 || gameState.skillEssence <= 0) return;
            target.maxExp = getRequiredExpForStar(target.grade);
            target.exp = (target.exp || 0) + 1;
            gameState.skillEssence -= 1;
            if (target.exp >= target.maxExp) {
                target.stars = Math.min(6, (target.stars || 0) + 1);
                target.exp = target.stars >= 6 ? 0 : target.exp - target.maxExp;
            }
        }

        function addOrLevelUpSkill(word, meaning, rolledGrade, suppressModal = false, rolledTier = null) {
            if (!gameState.skillsInventory) gameState.skillsInventory = [];

            // 🎲 티어(Tier 1~3) 랜덤 롤링 (Tier 1: 70%, Tier 2: 25%, Tier 3: 5%)
            if (!rolledTier) {
                const tierRoll = Math.random();
                if (tierRoll < 0.05) rolledTier = 3;
                else if (tierRoll < 0.30) rolledTier = 2;
                else rolledTier = 1;
            }

            const existingSkill = gameState.skillsInventory.find(s => s.word === word);
            const gradeInfo = SKILL_GRADES[rolledGrade];

            if (existingSkill) {
                const existingGradeRank = (SKILL_GRADES[existingSkill.grade] || SKILL_GRADES.normal).rank;
                const rolledGradeRank = (SKILL_GRADES[rolledGrade] || SKILL_GRADES.normal).rank;
                const oldTier = existingSkill.tier || 1;

                const rolledReqExp = getRequiredExpForStar(rolledGrade);
                const oldGradeReqExp = getRequiredExpForStar(existingSkill.grade);
                let totalOldCardExp = ((existingSkill.stars || 0) * oldGradeReqExp) + (existingSkill.exp || 0);

                if (rolledGradeRank > existingGradeRank) {
                    // 🎉 상위 등급 카드가 뽑힌 경우: 
                    existingSkill.grade = rolledGrade;
                    existingSkill.maxExp = getRequiredExpForStar(rolledGrade);

                    if (rolledTier > oldTier) existingSkill.tier = rolledTier;

                    const newTotalExp = totalOldCardExp + rolledReqExp;
                    existingSkill.stars = Math.floor(newTotalExp / existingSkill.maxExp);
                    existingSkill.exp = newTotalExp % existingSkill.maxExp;

                    if (existingSkill.stars >= 6) {
                        existingSkill.stars = 6;
                        existingSkill.exp = 0;
                    }

                    if (!suppressModal) showToast(`🔥 [${capitalizeFirstLetter(word)}] 대각성! [${gradeInfo.name}] (Tier ${existingSkill.tier}) 등급으로 상위 승급!`);
                } else {
                    // 👑 동일/이하 등급 카드 획득
                    let tierUpMsg = "";
                    if (rolledGradeRank === existingGradeRank && rolledTier > oldTier) {
                        existingSkill.tier = rolledTier;
                        tierUpMsg = ` 👑 (Tier ${oldTier} ➔ Tier ${rolledTier} 덮어씌우기!)`;
                    }

                    existingSkill.maxExp = getRequiredExpForStar(existingSkill.grade);

                    if ((existingSkill.stars || 0) < 6) {
                        const newTotalExp = totalOldCardExp + rolledReqExp;
                        existingSkill.stars = Math.floor(newTotalExp / existingSkill.maxExp);
                        existingSkill.exp = newTotalExp % existingSkill.maxExp;
                        
                        if (existingSkill.stars >= 6) {
                            existingSkill.stars = 6;
                            existingSkill.exp = 0;
                            if (!suppressModal) showToast(`⭐ [${capitalizeFirstLetter(word)}] 경험치 초과 충전! 최고 6성 도달!${tierUpMsg}`);
                        } else {
                            if (!suppressModal) showToast(`✨ [${capitalizeFirstLetter(word)}] 카드 경험치 흡수! (${existingSkill.exp}/${existingSkill.maxExp})${tierUpMsg}`);
                        }
                    } else {
                        if (!suppressModal) showToast(`⭐ [${capitalizeFirstLetter(word)}] 최고 6성 한계돌파 카드 (Tier ${existingSkill.tier})${tierUpMsg}`);
                    }
                }

                if (!suppressModal) {
                    showSkillModal(existingSkill, SKILL_GRADES[existingSkill.grade]);
                    buildSkillTabUI();
                    renderSkillsUI();
                    saveLocalCache();
                }
                return existingSkill;
            } else {
                // 신규 스킬 카드 획득 (추출된 랜덤 Tier 1~3 부여)
                const newSkill = {
                    id: 'skill_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
                    word: word,
                    meaning: meaning,
                    grade: rolledGrade,
                    tier: rolledTier,
                    stars: 0,
                    exp: 0,
                    maxExp: getRequiredExpForStar(rolledGrade),
                    cooldownRemaining: 0,
                    maxCooldown: 30
                };

                gameState.skillsInventory.push(newSkill);

                if (!suppressModal) {
                    showSkillModal(newSkill, gradeInfo);
                    buildSkillTabUI();
                    renderSkillsUI();
                    saveLocalCache();
                }
                return newSkill;
            }
        }

        function rollAndAcquireSkill(word, meaning) {
            const roll = Math.random();
            let rolledGrade = "normal";

            if (roll < 0.0005) { // 0.05%
                rolledGrade = "mythic";
            } else if (roll < 0.02) { // 1.95%
                rolledGrade = "legendary";
            } else if (roll < 0.07) { // 5%
                rolledGrade = "hero";
            } else if (roll < 0.25) { // 18%
                rolledGrade = "rare";
            }

            return addOrLevelUpSkill(word, meaning, rolledGrade);
        }

        function drawSkillCapsule(drawCount = 1) {
            if (typeof gameState.masteryPoints === 'undefined') gameState.masteryPoints = 0;
            let isTutorialSkill = false;
            if (!gameState.tutorialCompleted && tutorialStep === 7 && drawCount === 1) {
                isTutorialSkill = true;
            }
            const cost = isTutorialSkill ? 0 : (drawCount === 100 ? 4500 : (drawCount === 10 ? 450 : 50 * drawCount));

            if (!isTutorialSkill && gameState.masteryPoints < cost) {
                showToast(`⚠️ 단어 캡슐 연성을 위해 정복 포인트 ${cost} FP가 필요합니다! 퀴즈를 풀어 포인트를 모으세요.`);
                return;
            }

            gameState.masteryPoints -= cost;
            refreshStateVisuals();

            // 캡슐 오버레이 팝업 렌더링
            const modal = document.getElementById("gachaOverlayModal");
            const progressBar = document.getElementById("gachaProgressBar");
            const statusTitle = document.getElementById("gachaStatusTitle");
            const statusSub = document.getElementById("gachaStatusSub");

            modal.classList.remove("hidden");
            modal.classList.add("flex");
            progressBar.style.transition = "width 250ms linear";
            progressBar.style.width = "0%";
            statusTitle.innerText = drawCount === 100 ? "⚡ 마법 캡슐 100연속 소환 대량 연성 중..." : (drawCount === 10 ? "✨ 마법 캡슐 10연속 소환 연성 중..." : "마법 캡슐을 연성하는 중...");
            statusSub.innerText = "정복한 영단어의 마법 기운이 캡슐에 응축됩니다!";
            playSoundEffect('click');

            let progress = 0;
            const interval = setInterval(() => {
                progress += 10;
                if (progress > 100) progress = 100;
                progressBar.style.width = `${progress}%`;
                playSoundEffect('hit');

                if (progress >= 100) {
                    clearInterval(interval);

                    setTimeout(() => {
                        const fullPool = getSkillSourcePool();
                        modal.classList.remove("flex");
                        modal.classList.add("hidden");

                    if (drawCount === 100 || drawCount === 10) {
                        let acquiredList = [];
                        let modalGridHtml = "";
                        let newCards = 0, duplicates = 0;
                        for (let i = 0; i < drawCount; i++) {
                            const picked = pickSkillReward(fullPool);
                            const roll = Math.random();
                            let rolledGrade = "normal";
                            if (roll < 0.0005) rolledGrade = "mythic";        // 0.05%
                            else if (roll < 0.02) rolledGrade = "legendary";   // 1.95%
                            else if (roll < 0.07) rolledGrade = "hero";        // 5.00%
                            else if (roll < 0.25) rolledGrade = "rare";        // 18.00%

                            if (i === (drawCount - 1) && !acquiredList.some(item => item.grade !== "normal")) {
                                rolledGrade = "rare";
                            }

                            const alreadyOwned = (gameState.skillsInventory || []).some(skill => String(skill.word || "").toLowerCase() === String(picked.word || "").toLowerCase());
                            const resultSkill = addOrLevelUpSkill(picked.word, picked.meaning, rolledGrade, true);
                            if (alreadyOwned) duplicates++; else newCards++;
                            const displaySkill = { ...resultSkill, grade: rolledGrade };
                            acquiredList.push(displaySkill);

                            if (drawCount === 10) {
                                const gradeInfo = SKILL_GRADES[resultSkill.grade] || SKILL_GRADES.normal;
                                const rolledGradeInfo = SKILL_GRADES[rolledGrade] || SKILL_GRADES.normal;
                                const mult = getSkillMultiplier(resultSkill);
                                const starsCount = resultSkill.stars || 0;
                                const starsHtml = starsCount > 0 ? "⭐".repeat(starsCount) : "0성";

                                modalGridHtml += `
                                    <div class="border-2 ${gradeInfo.colorClass} bg-[#0d0d0d] p-2 text-center flex flex-col justify-between min-h-[90px] rounded-none-forced">
                                        <div>
                                            <div class="flex justify-[#7e7e7e] flex items-center justify-between text-[8px] font-bold">
                                                <span class="text-gray-200">추첨 ${rolledGradeInfo.name}</span>
                                                <span class="text-yellow-400 font-bold">${starsHtml}</span>
                                            </div>
                                            <p class="text-[11px] font-bold  text-white truncate mt-0.5">${capitalizeFirstLetter(resultSkill.word)}</p>
                                        </div>
                                        <div>
                                            <span class="text-[9px] truncate block text-[#bbbbbb]">${resultSkill.meaning}</span>
                                            <span class="text-[9px] font-bold text-pink-400 block">×${mult}배</span>
                                        </div>
                                    </div>
                                `;
                            }
                        }

                        if (drawCount === 100) {
                            showSkillDraw100ResultModal(acquiredList,{newCards,duplicates,inventoryCount:(gameState.skillsInventory||[]).length,packSize:fullPool.length});
                        } else {
                            document.getElementById("gacha10xGrid").innerHTML = modalGridHtml;
                            document.getElementById("gacha10xResultModal").classList.remove("hidden");
                            document.getElementById("gacha10xResultModal").classList.add("flex");
                        }
                        playSoundEffect('levelup');
                    } else {
                        const picked = pickSkillReward(fullPool);
                        if (typeof isTutorialSkill !== 'undefined' && isTutorialSkill) {
                            addOrLevelUpSkill(picked.word, picked.meaning, "hero", false);
                        } else {
                            rollAndAcquireSkill(picked.word, picked.meaning);
                        }
                        playSoundEffect('levelup');
                    }

                    buildSkillTabUI();
                    renderSkillsUI();
                    saveLocalCache();

                    // Tutorial advancement moved to modal close button
                    }, 600);
                }
            }, 250);
        }

        function showSkillDraw100ResultModal(acquiredList, drawSummary = {}) {
            const counts = { mythic: 0, legendary: 0, hero: 0, rare: 0, normal: 0 };
            acquiredList.forEach(s => {
                if (counts[s.grade] !== undefined) counts[s.grade]++;
            });

            // 상위 획득 스킬 카드를 배율순 정렬
            const topList = [...acquiredList].sort((a, b) => getSkillMultiplier(b) - getSkillMultiplier(a)).slice(0, 8);

            let topHtml = "";
            topList.forEach(s => {
                const gradeInfo = SKILL_GRADES[s.grade] || SKILL_GRADES.normal;
                const mult = getSkillMultiplier(s);
                topHtml += `
                    <div class="border ${gradeInfo.colorClass} bg-black/80 p-2 text-center flex flex-col justify-between rounded-none-forced min-h-[75px]">
                        <div class="flex justify-between items-center text-[8px] font-bold">
                            <span class="text-yellow-300">${gradeInfo.name}</span>
                            <span class="text-yellow-400">${s.stars > 0 ? '⭐'.repeat(s.stars) : ''}</span>
                        </div>
                        <div class="text-[10px] sm:text-[11px] font-black text-white  tracking-tighter truncate my-0.5">${capitalizeFirstLetter(s.word)}</div>
                        <div class="text-[9px] text-pink-400 font-bold">×${mult}배</div>
                    </div>
                `;
            });

            const summaryEl = document.getElementById("gacha100SummaryText");
            if (summaryEl) {
                summaryEl.innerHTML = `
                    <span class="text-emerald-300 font-black">새 스킬 ${drawSummary.newCards || 0}장</span> |
                    <span class="text-yellow-300 font-bold">중복 강화 ${drawSummary.duplicates || 0}회</span><br>
                    <span class="text-rose-400 font-black">신화 ${counts.mythic}개</span> | 
                    <span class="text-amber-300 font-bold">전설 ${counts.legendary}개</span> | 
                    <span class="text-purple-300 font-bold">영웅 ${counts.hero}개</span> | 
                    <span class="text-sky-300 font-bold">희귀 ${counts.rare}개</span> | 
                    <span class="text-gray-400">일반 ${counts.normal}개</span><br>
                    <span class="text-[10px] text-gray-500">모든 결과는 비기 연구소에 보관됩니다. 이 창은 상위 8장만 미리 보여 줍니다. (${drawSummary.inventoryCount || 0}/${drawSummary.packSize || 0}종 수집)</span>
                `;
            }
            const gridEl = document.getElementById("gacha100TopGrid");
            if (gridEl) gridEl.innerHTML = topHtml;

            const modal = document.getElementById("gacha100xResultModal");
            if (modal) {
                modal.classList.remove("hidden");
                modal.classList.add("flex");
            }
        }

        function drawSkillCapsuleInstantSkip(drawCount = 10) {
            if (typeof gameState.masteryPoints === 'undefined') gameState.masteryPoints = 0;
            const cost = 450;

            if (gameState.masteryPoints < cost) {
                showToast(`⚠️ 단어 캡슐 연성을 위해 정복 포인트 ${cost} FP가 필요합니다!`);
                return;
            }

            gameState.masteryPoints -= cost;
            refreshStateVisuals();

            const fullPool = getSkillSourcePool();
            let acquiredList = [];
            let modalGridHtml = "";

            for (let i = 0; i < 10; i++) {
                const picked = pickSkillReward(fullPool);
                const roll = Math.random();
                let rolledGrade = "normal";
                if (roll < 0.0005) rolledGrade = "mythic";        // 0.05%
                else if (roll < 0.02) rolledGrade = "legendary";   // 1.95%
                else if (roll < 0.07) rolledGrade = "hero";        // 5.00%
                else if (roll < 0.25) rolledGrade = "rare";        // 18.00%

                if (i === 9 && !acquiredList.some(item => item.grade !== "normal")) {
                    rolledGrade = "rare";
                }

                const resultSkill = addOrLevelUpSkill(picked.word, picked.meaning, rolledGrade, true);
                acquiredList.push(resultSkill);

                const gradeInfo = SKILL_GRADES[resultSkill.grade] || SKILL_GRADES.normal;
                const rolledGradeInfo = SKILL_GRADES[rolledGrade] || SKILL_GRADES.normal;
                const mult = getSkillMultiplier(resultSkill);
                const starsCount = resultSkill.stars || 0;
                const starsHtml = starsCount > 0 ? "⭐".repeat(starsCount) : "0성";

                modalGridHtml += `
                    <div class="border-2 ${gradeInfo.colorClass} bg-[#0d0d0d] p-2 text-center flex flex-col justify-between min-h-[90px] rounded-none-forced">
                        <div>
                            <div class="flex items-center justify-between text-[8px] font-bold text-[#7e7e7e]">
                                <span class="text-gray-200">추첨 ${rolledGradeInfo.name}</span>
                                <span class="text-yellow-400 font-bold">${starsHtml}</span>
                            </div>
                            <p class="text-[11px] font-bold  text-white truncate mt-0.5">${capitalizeFirstLetter(resultSkill.word)}</p>
                        </div>
                        <div>
                            <span class="text-[9px] truncate block text-[#bbbbbb]">${resultSkill.meaning}</span>
                            <span class="text-[9px] font-bold text-pink-400 block">×${mult}배</span>
                        </div>
                    </div>
                `;
            }

            document.getElementById("gacha10xGrid").innerHTML = modalGridHtml;
            document.getElementById("gacha10xResultModal").classList.remove("hidden");
            document.getElementById("gacha10xResultModal").classList.add("flex");
            playSoundEffect('levelup');
            buildSkillTabUI();
            renderSkillsUI();
            saveLocalCache();
        }

        // ==========================================
        // COMBINE SKILL SELECTION SYSTEM (수동 카드 선택 연성)
        // ==========================================
        let selectedCombineSkillIds = [];

        function toggleSelectCombineSkill(skillId) {
            if (!selectedCombineSkillIds) selectedCombineSkillIds = [];
            
            const skill = gameState.skillsInventory ? gameState.skillsInventory.find(s => s.id === skillId) : null;
            if (!skill) return;

            if (gameState.equippedSkills && gameState.equippedSkills.includes(skillId)) {
                showToast("⚠️ 장착 중인 스킬은 합성 재료로 선택할 수 없습니다. 먼저 해제하세요.");
                return;
            }

            if (skill.grade === "mythic") {
                showToast("⚠️ 최고 등급인 신화 스킬은 합성 재료로 선택할 수 없습니다.");
                return;
            }

            const idx = selectedCombineSkillIds.indexOf(skillId);
            if (idx >= 0) {
                selectedCombineSkillIds.splice(idx, 1);
            } else {
                if (selectedCombineSkillIds.length >= 3) {
                    showToast("⚠️ 합성 재료는 최대 3개까지만 선택할 수 있습니다!");
                    return;
                }
                selectedCombineSkillIds.push(skillId);
            }
            updateCombineSelectionUI();
        }

        function clearSelectedCombineSkills() {
            selectedCombineSkillIds = [];
            updateCombineSelectionUI();
            showToast("🧹 합성 선택이 초기화되었습니다.");
        }

        function batchCombineSkills() {
            if (!gameState.skillsInventory || gameState.skillsInventory.length < 3) {
                showToast("⚠️ 일괄 합성을 진행하려면 최소 3개 이상의 스킬 카드가 필요합니다!");
                return;
            }

            const chkNormal = document.getElementById("chkGradeNormal") ? document.getElementById("chkGradeNormal").checked : true;
            const chkRare = document.getElementById("chkGradeRare") ? document.getElementById("chkGradeRare").checked : true;
            const chkHero = document.getElementById("chkGradeHero") ? document.getElementById("chkGradeHero").checked : true;
            const chkLegendary = document.getElementById("chkGradeLegendary") ? document.getElementById("chkGradeLegendary").checked : false;

            let allowedGrades = [];
            if (chkNormal) allowedGrades.push("normal");
            if (chkRare) allowedGrades.push("rare");
            if (chkHero) allowedGrades.push("hero");
            if (chkLegendary) allowedGrades.push("legendary");

            if (allowedGrades.length === 0) {
                showToast("⚠️ 일괄 합성할 카드의 등급을 최소 1개 이상 선택해 주세요!");
                return;
            }

            const initialTotalCards = gameState.skillsInventory.length;
            let combinedDuplicates = 0;
            let upgradedCount = 0;
            let gradeResults = { rare: 0, hero: 0, legendary: 0, mythic: 0 };

            // 💡 1단계: 동일 단어 중복 카드를 찾아 경험치(exp) & 별(⭐) 자동 합산 승급 (6성 달성 시 Tier 1 -> Tier 2 -> Tier 3 승급)
            let uniqueMap = {};
            gameState.skillsInventory.forEach(s => {
                const key = s.word.toLowerCase();
                if (!uniqueMap[key]) {
                    uniqueMap[key] = { ...s };
                } else {
                    const target = uniqueMap[key];
                    const addedExp = (s.exp || 0) + (s.stars || 0) + 1;
                    target.exp = (target.exp || 0) + addedExp;

                    const oldRank = (SKILL_GRADES[target.grade] || SKILL_GRADES.normal).rank;
                    const newRank = (SKILL_GRADES[s.grade] || SKILL_GRADES.normal).rank;
                    if (newRank > oldRank) target.grade = s.grade;

                    const reqExp = getRequiredExpForStar(target.grade);
                    while (target.exp >= reqExp && (target.stars || 0) < 6) {
                        target.exp -= reqExp;
                        target.stars = (target.stars || 0) + 1;
                    }

                    // 6성 도달 시 중복 카드를 추가 연성/합성하면 Tier 1 -> Tier 2 -> Tier 3 승급!
                    if ((target.stars || 0) >= 6 && target.exp >= reqExp && (target.tier || 1) < 3) {
                        target.tier = (target.tier || 1) + 1;
                        target.stars = 0;
                        target.exp = 0;
                    }
                    combinedDuplicates++;
                }
            });

            gameState.skillsInventory = Object.values(uniqueMap);

            // 💡 2단계: 선택된 등급 순서대로 (일반 -> 희귀 -> 영웅 -> 전설) 3장씩 일괄 합성!
            const nextGradeMap = { normal: "rare", rare: "hero", hero: "legendary", legendary: "mythic" };

            allowedGrades.forEach(g => {
                let available = gameState.skillsInventory.filter(s => 
                    !gameState.equippedSkills.includes(s.id) && 
                    s.grade === g
                );

                while (available.length >= 3) {
                    const trio = available.splice(0, 3);
                    gameState.skillsInventory = gameState.skillsInventory.filter(s => !trio.some(t => t.id === s.id));

                    const totalStars = trio.reduce((sum, s) => sum + (s.stars || 0), 0);
                    const totalExp = trio.reduce((sum, s) => sum + (s.exp || 0), 0);
                    
                    const baseSuccessRate = 0.20;
                    const starBonus = totalStars * 0.10;
                    const expBonus = totalExp * 0.02;
                    const finalUpgradeProb = Math.min(0.95, baseSuccessRate + starBonus + expBonus);

                    const nextGrade = nextGradeMap[g] || "rare";
                    const roll = Math.random();
                    const resultGrade = (roll < finalUpgradeProb) ? nextGrade : g;
                    const picked = trio[0];

                    addOrLevelUpSkill(picked.word, picked.meaning, resultGrade, true);
                    
                    upgradedCount += 3;
                    if (resultGrade !== g) {
                        gradeResults[resultGrade] = (gradeResults[resultGrade] || 0) + 1;
                    } else {
                        gradeResults[g] = (gradeResults[g] || 0) + 1;
                    }
                }
            });

            selectedCombineSkillIds = [];
            playSoundEffect('levelup');
            
            const finalTotalCards = gameState.skillsInventory.length;
            const cleanedCount = initialTotalCards - finalTotalCards;

            showToast(`✨ [일괄 합성 완료] 총 ${cleanedCount}장의 카드가 정리되었습니다! (승급: 희귀 ${gradeResults.rare}장, 영웅 ${gradeResults.hero}장, 전설 ${gradeResults.legendary}장, 신화 ${gradeResults.mythic}장)`);

            buildSkillTabUI();
            renderSkillsUI();
            refreshStateVisuals();
            saveLocalCache();
        }

        function updateCombineSelectionUI() {
            const countText = document.getElementById("selectedCombineCountText");
            if (countText) {
                countText.innerText = selectedCombineSkillIds ? selectedCombineSkillIds.length : 0;
            }
            const manualGroup = document.getElementById("selectedManualCombineGroup");
            if (manualGroup) {
                if (selectedCombineSkillIds && selectedCombineSkillIds.length > 0) {
                    manualGroup.classList.remove("hidden");
                    manualGroup.classList.add("flex");
                } else {
                    manualGroup.classList.remove("flex");
                    manualGroup.classList.add("hidden");
                }
            }
            buildSkillTabUI();
        }

        function combineSkills() {
            if (!gameState.skillsInventory || gameState.skillsInventory.length < 3) {
                showToast("⚠️ 연성(조합)하려면 최소 3개 이상의 스킬 카드가 필요합니다!");
                return;
            }

            // 장착되지 않은 스킬 카드 중 연성 가능 대상 선택 (신화 등급 제외)
            const availableSkills = gameState.skillsInventory.filter(s => 
                !gameState.equippedSkills.includes(s.id) && 
                s.grade !== "mythic"
            );

            if (availableSkills.length < 3) {
                showToast("⚠️ 연성 가능한 스킬(장착 안 된 스킬, 신화 제외)이 3개 이상 필요합니다!");
                return;
            }

            const gradeRankMap = { normal: 1, rare: 2, hero: 3, legendary: 4 };
            const nextGradeMap = { normal: "rare", rare: "hero", hero: "legendary", legendary: "mythic" };

            let targetThree = [];
            let targetGrade = null;

            // 💡 1. 유저가 직접 3개를 선택한 경우
            if (selectedCombineSkillIds && selectedCombineSkillIds.length === 3) {
                targetThree = availableSkills.filter(s => selectedCombineSkillIds.includes(s.id));
                if (targetThree.length !== 3) {
                    showToast("⚠️ 선택한 카드가 올바르지 않습니다. 다시 선택해주세요.");
                    return;
                }
                targetThree.sort((a, b) => (gradeRankMap[b.grade] || 1) - (gradeRankMap[a.grade] || 1));
                targetGrade = targetThree[0].grade;
            } else if (selectedCombineSkillIds && selectedCombineSkillIds.length > 0 && selectedCombineSkillIds.length < 3) {
                showToast(`⚠️ 연성하려면 카드를 3개 선택해야 합니다! (현재 ${selectedCombineSkillIds.length}개 선택됨)`);
                return;
            } else {
                // 💡 2. 선택된 것이 없는 경우: 낮은 등급(normal부터)부터 3장 자동 선택!
                const lowestToHighestGrades = ["normal", "rare", "hero", "legendary"];
                for (let g of lowestToHighestGrades) {
                    const group = availableSkills.filter(s => s.grade === g);
                    if (group.length >= 3) {
                        targetThree = group.slice(0, 3);
                        targetGrade = g;
                        break;
                    }
                }

                // 동일 등급 3장이 없으면 전체 중 가장 낮은 등급 3장 자동 선택
                if (!targetThree || targetThree.length < 3) {
                    availableSkills.sort((a, b) => (gradeRankMap[a.grade] || 1) - (gradeRankMap[b.grade] || 1));
                    targetThree = availableSkills.slice(0, 3);
                    targetThree.sort((a, b) => (gradeRankMap[b.grade] || 1) - (gradeRankMap[a.grade] || 1));
                    targetGrade = targetThree[0].grade;
                }
            }

            // 💡 [확률 예측 모달에 표시할 데이터 계산]
            const totalStars = targetThree.reduce((sum, s) => sum + (s.stars || 0), 0);
            const totalExp = targetThree.reduce((sum, s) => sum + (s.exp || 0), 0);
            
            const baseSuccessRate = 0.20;
            const starBonus = totalStars * 0.10;
            const expBonus = totalExp * 0.02;
            const finalUpgradeProb = Math.min(0.95, baseSuccessRate + starBonus + expBonus);
            const successPctDisplay = Math.round(finalUpgradeProb * 100);
            const failPctDisplay = 100 - successPctDisplay;

            const nextGrade = nextGradeMap[targetGrade] || "mythic";
            const targetGradeInfo = SKILL_GRADES[targetGrade];
            const nextGradeInfo = SKILL_GRADES[nextGrade];

            // 실행 확인 모달 팝업 안내 (바로 카드가 만들어지는 것 방지)
            const confirmMsg = `
                🔮 <b>마법 카드 3장 연성 조합 미리보기</b><br><br>
                🔸 <b>재료 카드 (3장)</b>: ${targetThree.map(s => `[${SKILL_GRADES[s.grade].name}] ${s.word}`).join(', ')}<br>
                ✨ <b>상위 등급 승급 확률</b>: <strong class="text-yellow-300 text-sm">${successPctDisplay}%</strong> (기본 20% + ⭐${totalStars*10}% + EXP${Math.round(expBonus*100)}%)<br>
                🏆 <b>성공 시 결과</b>: <span class="text-pink-400 font-bold">[${nextGradeInfo.name}]</span> 무작위 신규 스킬 획득<br>
                🔮 <b>유지 시 결과 (${failPctDisplay}%)</b>: <span class="text-gray-300 font-bold">[${targetGradeInfo.name}]</span> 무작위 스킬 연성<br><br>
                연성을 진행하시겠습니까?
            `;

            showCombinePreviewModal(confirmMsg, () => {
                // 주사위 굴리기
                const roll = Math.random();
                let resultGrade = targetGrade;

                if (roll < finalUpgradeProb) {
                    resultGrade = nextGrade;
                } else {
                    resultGrade = targetGrade;
                }

                const targetIds = targetThree.map(s => s.id);
                gameState.skillsInventory = gameState.skillsInventory.filter(s => !targetIds.includes(s.id));
                selectedCombineSkillIds = [];

                let pool = gameState.wordsPool && gameState.wordsPool.length > 0 ? gameState.wordsPool : MOCK_WORDS["4"];
                const randomWordObj = pickSkillReward(pool);

                addOrLevelUpSkill(randomWordObj.word, randomWordObj.meaning, resultGrade);
                const resGradeInfo = SKILL_GRADES[resultGrade];

                if (resultGrade !== targetGrade) {
                    playSoundEffect('levelup');
                    showToast(`✨ 대성공! (${successPctDisplay}% 확률 달성!) [${resGradeInfo.name}] 등급 스킬 연성 성공!`);
                } else {
                    playSoundEffect('hit');
                    showToast(`🔮 연성 완료 (${successPctDisplay}% 확률)! [${targetGradeInfo.name}] 등급 스킬 연성!`);
                }
                
                buildSkillTabUI();
                renderSkillsUI();
                saveLocalCache();
            });
        }

        function equipSkill(skillId) {
            if (!gameState.equippedSkills) gameState.equippedSkills = [];

            if (gameState.equippedSkills.includes(skillId)) {
                showToast("⚠️ 이미 장착된 고대 마법 스킬입니다.");
                return;
            }

            if (gameState.equippedSkills.length >= 4) {
                showToast("⚠️ 장착 슬롯(최대 4개)이 가득 찼습니다! 기존 스킬을 해제하고 시도하세요.");
                return;
            }

            gameState.equippedSkills.push(skillId);
            showToast("🔮 스킬 장착 슬롯 배치가 완료되었습니다!");
            buildSkillTabUI();
            renderSkillsUI();
            refreshStateVisuals();
            saveLocalCache();
        }

        function unequipSkill(skillId) {
            if (!gameState.equippedSkills) return;
            gameState.equippedSkills = gameState.equippedSkills.filter(id => id !== skillId);
            showToast("🔮 스킬 장착이 해제되었습니다.");
            buildSkillTabUI();
            renderSkillsUI();
            refreshStateVisuals();
            saveLocalCache();
        }

        function autoEquipBestSkills() {
            if (!gameState.skillsInventory || gameState.skillsInventory.length === 0) {
                showToast("보유한 마법 비기가 없습니다.");
                return;
            }
            const sorted = [...gameState.skillsInventory].sort((a, b) => {
                const multA = getSkillMultiplier(a);
                const multB = getSkillMultiplier(b);
                if (multB !== multA) return multB - multA;
                return (b.exp || 0) - (a.exp || 0);
            });
            const top4 = sorted.slice(0, 4).map(s => s.id);
            gameState.equippedSkills = top4;
            renderSkillsUI();
            buildSkillTabUI();
            refreshStateVisuals();
            saveLocalCache();
            showToast("✨ 가장 강력한 마법 비기 4개가 자동 장착되었습니다!");
            playSoundEffect('levelup');
        }

        function buildSkillTabUI() {
            const deckInfo = document.getElementById("skillDeckInfo");
            if (deckInfo) {

                deckInfo.textContent = `현재 학년 또는 길드 단어팩 전체에서 영단어와 등급이 매번 무작위로 결정됩니다. (추첨 대상 ${getSkillSourcePool().length}개)`;
            }
            const eqGrid = document.getElementById("equippedSkillsGrid");
            let eqHtml = "";

            for (let i = 0; i < 4; i++) {
                const id = gameState.equippedSkills[i];
                if (id && gameState.skillsInventory) {
                    const skill = gameState.skillsInventory.find(s => s.id === id);
                    if (skill) {
                        const gradeInfo = SKILL_GRADES[skill.grade] || SKILL_GRADES.normal;
                        const mult = getSkillMultiplier(skill);
                        const starsCount = skill.stars || 0;
                        const starsHtml = "⭐".repeat(starsCount);

                        eqHtml += `
                            <div class="border-2 ${gradeInfo.colorClass} rounded-none-forced p-2 text-center relative flex flex-col justify-between min-h-[85px] group">
                                <button onclick="unequipSkill('${skill.id}')" class="absolute -top-1.5 -right-1.5 bg-[#e22718] hover:bg-[#b91c1c] text-white w-4.5 h-4.5 rounded-full flex items-center justify-center text-4xs transition opacity-0 group-hover:opacity-100 font-bold shadow-sm z-20">
                                    ×
                                </button>
                                <div class="z-10">
                                    <div class="flex justify-between items-center text-[7px] font-bold text-[#7e7e7e]">
                                        <span>${gradeInfo.name} T${skill.tier || 1}</span>
                                        <span class="text-yellow-400">${starsHtml}</span>
                                    </div>
                                    <p class="text-[10px] font-bold  truncate text-white mt-0.5 ${gradeInfo.colorClass.includes('animate-pulse') ? 'text-[#ff8080]' : ''}">${capitalizeFirstLetter(skill.word)}</p>
                                </div>
                                <div class="z-10">
                                    <span class="text-[8px] truncate block text-[#bbbbbb]">${skill.meaning}</span>
                                    <span class="text-[8px] font-bold text-pink-400 block">×${mult}배</span>
                                </div>
                            </div>
                        `;
                    } else {
                        eqHtml += `<div class="border border-dashed border-[#3c3c3c] rounded-none-forced p-2 text-center flex items-center justify-center min-h-[85px] text-[8px] text-[#7e7e7e] font-bold uppercase tracking-wider">슬롯 비어있음</div>`;
                    }
                } else {
                    eqHtml += `<div class="border border-dashed border-[#3c3c3c] rounded-none-forced p-2 text-center flex items-center justify-center min-h-[85px] text-[8px] text-[#7e7e7e] font-bold uppercase tracking-wider">슬롯 비어있음</div>`;
                }
            }
            eqGrid.innerHTML = eqHtml;

            const invGrid = document.getElementById("skillsInventoryGrid");
            if (!gameState.skillsInventory || gameState.skillsInventory.length === 0) {
                invGrid.innerHTML = `<p class="text-xs text-[#7e7e7e] text-center py-8 col-span-2 uppercase tracking-wider">아직 획득한 영단어 비기 스킬이 없습니다. 단어 캡슐을 뽑아보세요!</p>`;
                return;
            }

            // 마법 피해 배율(×배) 기준 내림차순 정렬
            const sortedInventory = [...gameState.skillsInventory].sort((a, b) => {
                const multA = getSkillMultiplier(a);
                const multB = getSkillMultiplier(b);
                if (multB !== multA) return multB - multA;
                return (b.exp || 0) - (a.exp || 0);
            });

            let invHtml = "";
            sortedInventory.forEach(skill => {
                const isEquipped = gameState.equippedSkills.includes(skill.id);
                const isSelectedForCombine = selectedCombineSkillIds && selectedCombineSkillIds.includes(skill.id);
                const gradeInfo = SKILL_GRADES[skill.grade] || SKILL_GRADES.normal;
                const mult = getSkillMultiplier(skill);
                const starsCount = skill.stars || 0;
                const starsHtml = starsCount > 0 ? "⭐".repeat(starsCount) : "<span class='text-[#7e7e7e] text-[8px]'>0성</span>";
                const exp = skill.exp || 0;
                const maxExp = skill.maxExp || getRequiredExpForStar(skill.grade);
                const pct = Math.min(100, Math.round((exp / maxExp) * 100));

                const borderStyle = isSelectedForCombine ? 'border-yellow-400 ring-4 ring-yellow-500/80 scale-95 shadow-[0_0_15px_rgba(234,179,8,0.9)]' : (isEquipped ? 'border-white ring-2 ring-white/50' : 'border-[#262626]');

                invHtml += `
                    <div onclick="toggleSelectCombineSkill('${skill.id}')" class="border-2 ${borderStyle} ${gradeInfo.colorClass} bg-[#0d0d0d] rounded-none-forced p-2 text-center flex flex-col justify-between min-h-[125px] relative group hover:border-yellow-400 cursor-pointer transition">
                        ${isSelectedForCombine ? '<span class="absolute -top-2 -left-2 bg-yellow-400 text-black text-[8px] font-black px-1.5 py-0.5 z-20 shadow-md animate-bounce">[조합 3개 중 선택됨]</span>' : ''}
                        <div>
                            <div class="flex justify-between items-center text-[8px] font-bold text-[#7e7e7e] mb-0.5">
                                <span class="truncate">${gradeInfo.name} T${skill.tier || 1}</span>
                                <span class="text-yellow-400 font-bold flex-shrink-0">${starsHtml}</span>
                            </div>
                            <p class="text-xs font-extrabold  text-white truncate ${gradeInfo.colorClass.includes('animate-pulse') ? 'text-[#ff8080]' : ''}">${capitalizeFirstLetter(skill.word)}</p>
                            <span class="text-[9px] truncate block text-[#bbbbbb] mt-0.5 font-medium">${skill.meaning}</span>
                        </div>

                        <div class="mt-1.5" onclick="event.stopPropagation()">
                            <span class="text-[9px] font-extrabold text-pink-400 block mb-1">×${mult}배</span>
                            
                            <!-- 경험치 바 -->
                            <div class="w-full bg-[#111] h-1.5 border border-[#3c3c3c] rounded-none-forced overflow-hidden mb-1">
                                <div class="bg-yellow-500 h-full transition-all duration-300" style="width: ${pct}%"></div>
                            </div>
                            <div class="text-[7px] text-gray-400 flex justify-between font-bold mb-1.5">
                                <span>EXP</span>
                                <span>${exp}/${maxExp}</span>
                            </div>

                            <button onclick="event.stopPropagation(); ${isEquipped ? `unequipSkill('${skill.id}')` : `equipSkill('${skill.id}')`}" class="w-full text-[9px] font-extrabold py-1 rounded-none-forced transition shadow-sm ${isEquipped ? 'bg-[#e22718] text-white hover:bg-red-700' : 'bg-white text-black hover:bg-gray-200'}">
                                ${isEquipped ? '장착 해제' : '장착하기'}
                            </button>
                        </div>
                    </div>
                `;
            });
            invGrid.innerHTML = invHtml;
        }


        function renderSkillsUI() {
            const container = document.getElementById("quizEquippedSkillsContainer");
            if (!container) return;

            if (!gameState.equippedSkills || gameState.equippedSkills.length === 0) {
                container.innerHTML = `<p class="text-[10px] text-[#7e7e7e] text-center py-4 col-span-4 uppercase tracking-wider">장착된 마법 비기가 없습니다. [스킬] 연구소에서 마법을 선택해 장착하세요!</p>`;
                return;
            }

            let html = "";
            gameState.equippedSkills.forEach((id) => {
                if (!gameState.skillsInventory) return;
                const skill = gameState.skillsInventory.find(s => s.id === id);
                if (skill) {
                    const gradeInfo = SKILL_GRADES[skill.grade] || SKILL_GRADES.normal;
                    const mult = getSkillMultiplier(skill);
                    const starsCount = skill.stars || 0;
                    const starsHtml = starsCount > 0 ? `<span class="text-[9px]">⭐${starsCount}</span>` : "";
                    const isOnCooldown = skill.cooldownRemaining > 0;
                    const pct = isOnCooldown ? Math.round((skill.cooldownRemaining / skill.maxCooldown) * 100) : 0;

                    html += `
                        <button id="btn-skill-${skill.id}" onclick="castWordSkill('${skill.id}')" ${isOnCooldown ? 'disabled' : ''} class="relative overflow-hidden p-2.5 ${gradeInfo.colorClass} border-2 text-left rounded-none-forced transition duration-150 flex flex-col justify-between h-16 group">
                            ${isOnCooldown ? `<div class="cooldown-bar absolute bottom-0 left-0 h-1.5 bg-[#e22718] transition-all" style="width: ${100 - pct}%"></div>` : ''}
                            
                            <div class="flex justify-between items-center w-full z-10">
                                <div class="flex items-center gap-1 min-w-0 pr-1">
                                    <span class="text-[10px] sm:text-[11px] font-extrabold  tracking-tighter truncate ${gradeInfo.colorClass.includes('animate-pulse') ? 'text-[#ff8080]' : ''}">${capitalizeFirstLetter(skill.word)}</span>
                                    <span class="text-[10px] text-yellow-400 font-bold flex-shrink-0">${starsHtml}</span>
                                </div>
                                <span class="cooldown-timer text-[9px] ${isOnCooldown ? 'text-[#e22718] font-extrabold' : 'font-extrabold text-pink-400'}">
                                    ${isOnCooldown ? `${Math.ceil(skill.cooldownRemaining)}s` : `×${mult}배`}
                                </span>
                            </div>
                            <div class="flex justify-between items-center w-full z-10 text-[9px] font-medium opacity-90 ${gradeInfo.colorClass.includes('animate-pulse') ? 'text-white' : ''}">
                                <span class="truncate pr-1">${skill.meaning}</span>
                                <span class="text-[8px] font-bold text-gray-400 flex-shrink-0">${gradeInfo.name}</span>
                            </div>
                        </button>
                    `;
                }
            });

            const emptySlots = 4 - gameState.equippedSkills.length;
            for (let i = 0; i < emptySlots; i++) {
                html += `
                    <div class="border border-dashed border-[#3c3c3c] rounded-none-forced flex items-center justify-center h-16 text-[9px] text-[#7e7e7e] font-bold uppercase tracking-wider bg-[#0d0d0d]">
                        비어있음
                    </div>
                `;
            }

            container.innerHTML = html;
        }

        function updateSkillsCooldownVisuals() {
            if (!gameState.equippedSkills) return;
            gameState.equippedSkills.forEach(id => {
                if (!gameState.skillsInventory) return;
                const skill = gameState.skillsInventory.find(s => s.id === id);
                if (skill) {
                    const btn = document.getElementById(`btn-skill-${id}`);
                    if (btn) {
                        const isOnCooldown = skill.cooldownRemaining > 0;
                        const mult = getSkillMultiplier(skill);
                        
                        if (isOnCooldown) {
                            btn.setAttribute('disabled', 'true');
                        } else {
                            btn.removeAttribute('disabled');
                        }
                        
                        const timerSpan = btn.querySelector('.cooldown-timer');
                        if (timerSpan) {
                            timerSpan.innerText = isOnCooldown ? `${Math.ceil(skill.cooldownRemaining)}s` : `×${mult}배`;
                            if (isOnCooldown) {
                                timerSpan.className = 'cooldown-timer text-[9px] text-[#e22718] font-extrabold';
                            } else {
                                timerSpan.className = 'cooldown-timer text-[9px] text-pink-400 font-extrabold';
                            }
                        }
                        
                        let bar = btn.querySelector('.cooldown-bar');
                        const pct = isOnCooldown ? Math.round((skill.cooldownRemaining / skill.maxCooldown) * 100) : 0;
                        if (isOnCooldown) {
                            if (!bar) {
                                bar = document.createElement('div');
                                bar.className = 'cooldown-bar absolute bottom-0 left-0 h-1 bg-[#e22718] transition-all';
                                btn.appendChild(bar);
                            }
                            bar.style.width = `${100 - pct}%`;
                        } else if (bar) {
                            bar.remove();
                        }
                    }
                }
            });
        }

        function spawnSkillDamageFloatingText(x, y, text, isSkill = false) {
            const arena = document.getElementById("battleArena");
            if (!arena) return;

            const particle = document.createElement("div");
            particle.className = "damage-particle font-black  text-sm z-50 drop-shadow-[0_2px_4px_rgba(0,0,0,1)]";
            particle.style.left = `${Math.max(20, Math.min(arena.clientWidth - 100, x))}px`;
            particle.style.top = `${Math.max(30, Math.min(arena.clientHeight - 80, y))}px`;
            particle.style.color = isSkill ? "#ec4899" : "#f59e0b";
            particle.innerText = text;

            arena.appendChild(particle);
            setTimeout(() => particle.remove(), 700);
        }

        function castWordSkill(skillId) {
            if (!gameState.skillsInventory) return;
            const skill = gameState.skillsInventory.find(s => s.id === skillId);
            if (!skill || skill.cooldownRemaining > 0) return;

            const gradeInfo = SKILL_GRADES[skill.grade] || SKILL_GRADES.normal;
            const mult = getSkillMultiplier(skill);

            // 1. 영어 스펠링 단어 TTS 음성 발음 재생
            if ('speechSynthesis' in window) {
                const ss = gameState.soundSettings || {};
                const isSkillSfxOn = (typeof ss.masterSoundOn !== 'undefined' && !ss.masterSoundOn) ? false : (typeof ss.sfxSkill !== 'undefined' ? ss.sfxSkill : true);
                if (isSkillSfxOn) {
                    window.speechSynthesis.cancel();
                    const utterance = new SpeechSynthesisUtterance(skill.word);
                    utterance.lang = 'en-US';
                    utterance.rate = 0.9;
                    const masterScale = (typeof ss.masterVolume !== 'undefined' ? ss.masterVolume : 10) / 10;
                    const skillScale = (typeof ss.volSkill !== 'undefined' ? ss.volSkill : 10) / 10;
                    utterance.volume = masterScale * skillScale;
                    window.speechSynthesis.speak(utterance);
                }
            }

            // 💍 지혜의 목걸이 (necklaceLvl) 스킬 마법 피해 +1.5%/lv & 잠재력 & 유물
            const necklaceSkillBonus = (gameState.necklaceLvl || 0) * 1.5;
            const potentialSkillBonus = getPotentialStatBonus('skillDmg');
            const relicSkillBonus = getEquippedRelicBonus("relic_scroll");
            const totalSkillMult = 1 + (necklaceSkillBonus + potentialSkillBonus + relicSkillBonus) / 100;

            const baseSkillDmg = (calculateClickAttackPower() * mult * 3) + (calculateDPSPower() * 2);
            const statSkillDmg = Math.floor(baseSkillDmg * totalSkillMult);

            // 🎯 후반 스테이지/보스 HP 폭발 시 퀴즈 정답 딜과의 역전 방지 & mult(등급/티어/별) 보장 보정
            const chaliceMult = 1.0 + (getEquippedRelicBonus("relic_chalice") / 100);
            const bossBonus = isBossBattleActive 
                ? (1.0 + (getEquippedRelicBonus("relic_feather") + getPotentialStatBonus('bossDmg')) / 100)
                : 1.0;
            const statDmg = (calculateClickAttackPower() * 8) + Math.floor(calculateDPSPower() * 1.5);
            const rawQuizDmg = isBossBattleActive 
                ? Math.max(statDmg, Math.floor(monsterMaxHp * 0.035)) 
                : statDmg;
            const baseQuizDmg = Math.max(10, Math.floor(rawQuizDmg * chaliceMult * bossBonus));
            // 스킬 등급 배율(mult: 5~120)에 따른 스킬 딜 보정 계수 (일반 ~0.6x -> 신화 6성 ~2.5x of quiz base)
            const skillGradeFactor = 0.6 + Math.min(1.9, (mult - 5) / 60);
            const quizDmgFloor = Math.floor(baseQuizDmg * skillGradeFactor);

            let skillDmg = Math.max(statSkillDmg, quizDmgFloor);

            // 보스전의 경우 4개 스킬 몰아치기로 퀴즈 무시 컷 방지: 단일 스킬 최대 보스 체력의 10% 상한선 적용 (유저 피드백 반영)
            if (isBossBattleActive) {
                skillDmg = Math.min(skillDmg, Math.floor(monsterMaxHp * 0.10));
            }

            processCombatDamage(skillDmg);
            playSoundEffect('skill');

            const hero = document.getElementById("heroCharacter");
            if (hero) {
                hero.classList.add("animate-slash");
                setTimeout(() => hero.classList.remove("animate-slash"), 200);
            }

            const mContainer = document.getElementById("monsterContainer");
            if (mContainer) {
                mContainer.classList.add("animate-shake");
                setTimeout(() => mContainer.classList.remove("animate-shake"), 250);
            }

            // 2. 전장 화려한 검기/마법 비기 베기 이펙트(Magic Blast) 생성
            const arena = document.getElementById("battleArena");
            if (arena) {
                const blastEffect = document.createElement("div");
                blastEffect.className = "animate-skill-blast flex flex-col items-center justify-center pointer-events-none";
                
                let blastIcon = "💥";
                if (skill.grade === "mythic") blastIcon = "🌌";
                else if (skill.grade === "legendary") blastIcon = "🔥";
                else if (skill.grade === "hero") blastIcon = "⚡";
                else if (skill.grade === "rare") blastIcon = "✨";

                blastEffect.innerHTML = `
                    <span class="text-7xl filter drop-shadow-[0_0_20px_#ec4899]">${blastIcon}</span>
                    <span class="text-xs font-black  bg-black/80 text-pink-400 border border-pink-500 px-3 py-1 mt-1 uppercase tracking-widest shadow-xl">${capitalizeFirstLetter(skill.word)}!</span>
                `;
                arena.appendChild(blastEffect);
                setTimeout(() => blastEffect.remove(), 600);

                const rect = arena.getBoundingClientRect();
                spawnDamageFloatingText(rect.width / 2 - 40 + (Math.random() * 40 - 20), rect.height / 3, `⚡ [비기] ${capitalizeFirstLetter(skill.word)}: -${skillDmg.toLocaleString()}!`, true);
            }

            showBattleToast(`💥 필살 시전! [${gradeInfo.name}] ${capitalizeFirstLetter(skill.word)}: -${skillDmg.toLocaleString()} 피해!`);

            // 💍 지혜의 목걸이 (necklaceLvl) 쿨타임 감소 적용 (-0.3%/lv, 최대 -30%) + 유물
            const necklaceCdRed = Math.min(30, (gameState.necklaceLvl || 0) * 0.3);
            const relicCdRed = getEquippedRelicBonus("relic_clock");
            const totalCdRed = Math.min(60, necklaceCdRed + relicCdRed);
            const baseCd = skill.maxCooldown || 15;

            skill.cooldownRemaining = baseCd * (1 - totalCdRed / 100);
            renderSkillsUI();
            buildSkillTabUI();
            saveLocalCache();
        }

        const WORD_MASTERY_CORRECT_THRESHOLD = 10;
        const WORD_MASTERY_ACCURACY_THRESHOLD = 0.8;
        function recordWordLearningResult(entry, questionType, correct) {
            if (!entry || !entry.word) return;
            if (!gameState.wordLearningStats || typeof gameState.wordLearningStats !== "object" || Array.isArray(gameState.wordLearningStats)) gameState.wordLearningStats = {};
            const key = String(entry.word).trim().toLowerCase();
            if (!key) return;
            const previous = gameState.wordLearningStats[key] && typeof gameState.wordLearningStats[key] === "object" ? gameState.wordLearningStats[key] : {};
            const byType = previous.t && typeof previous.t === "object" && !Array.isArray(previous.t) ? { ...previous.t } : {};
            const typeKey = ["meaning-choice","fill-blank","word-choice","listen-meaning","word-order","short-answer"].includes(questionType) ? questionType : "meaning-choice";
            const typeValue = Array.isArray(byType[typeKey]) ? byType[typeKey] : [0, 0];
            typeValue[0] = Math.max(0, Number(typeValue[0] || 0)) + 1;
            if (correct) typeValue[1] = Math.max(0, Number(typeValue[1] || 0)) + 1;
            byType[typeKey] = typeValue;
            const correctCount = Math.max(0, Number(previous.c || 0)) + (correct ? 1 : 0);
            const wrongCount = Math.max(0, Number(previous.x || 0)) + (correct ? 0 : 1);
            const streak = correct ? Math.max(0, Number(previous.s || 0)) + 1 : 0;
            gameState.wordLearningStats[key] = {
                w: String(entry.word).slice(0, 80),
                m: String(entry.meaning || "").slice(0, 160),
                c: correctCount,
                x: wrongCount,
                s: streak,
                b: Math.max(Math.max(0, Number(previous.b || 0)), streak),
                t: byType,
                u: Date.now()
            };
        }
        function getWordMasterySummary() {
            const rows = Object.values(gameState.wordLearningStats || {}).filter((entry) => entry && typeof entry === "object");
            const mastered = rows.filter((entry) => {
                const correct = Math.max(0, Number(entry.c || 0));
                const wrong = Math.max(0, Number(entry.x || 0));
                return correct >= WORD_MASTERY_CORRECT_THRESHOLD && correct / Math.max(1, correct + wrong) >= WORD_MASTERY_ACCURACY_THRESHOLD;
            });
            return { conquered: Array.isArray(gameState.masteredWords) ? gameState.masteredWords.length : 0, mastered: mastered.length, thresholdCorrect: WORD_MASTERY_CORRECT_THRESHOLD, thresholdAccuracy: WORD_MASTERY_ACCURACY_THRESHOLD * 100 };
        }
        window.getWordMasterySummary = getWordMasterySummary;

        let isEvaluatingQuiz = false;

        function evaluateAnswer(index) {
            if (isEvaluatingQuiz) return;
            isEvaluatingQuiz = true;

            gameState.totalQuizTries++;
            const buttons = document.getElementsByClassName("choice-btn");
            for (let i = 0; i < buttons.length; i++) {
                buttons[i].style.pointerEvents = "none";
            }
            const current = gameState.wordsPool[gameState.currentQuizIndex];
            if (!gameState.questionTypeStats || typeof gameState.questionTypeStats !== "object") gameState.questionTypeStats = {};
            const typeStats = gameState.questionTypeStats[currentQuizType] || { tries: 0, correct: 0 };
            typeStats.tries = Number(typeStats.tries || 0) + 1;
            gameState.questionTypeStats[currentQuizType] = typeStats;
            recordWordLearningResult(current, currentQuizType, index === gameState.currentQuizCorrectAnswer);

            if (index === gameState.currentQuizCorrectAnswer) {
                if (!gameState.tutorialCompleted && tutorialStep === 1) {
                    tutorialStep = 2;
                    setTimeout(showTutorialOverlay, 500);
                }
                playSoundEffect('correct');
                buttons[index].className = "choice-btn p-3.5 bg-green-950/80 border-2 border-green-500 text-white font-bold rounded-none-forced text-center transition flex items-center justify-center";
                gameState.totalQuizCorrect++;
                typeStats.correct = Number(typeStats.correct || 0) + 1;

                // 정복한 영단어 리스트에 추가 (중복 방지)
                if (!gameState.masteredWords) gameState.masteredWords = [];
                if (current && !gameState.masteredWords.some(w => w.word.toLowerCase() === current.word.toLowerCase())) {
                    gameState.masteredWords.push({ word: current.word, meaning: current.meaning });
                }

                // 골드 수당 계산 (70스테이지 기준 정답당 10만원 상당 수당 획득)
                const baseReward = Math.floor((25 * gameState.grade) * Math.pow(1.10, Math.max(0, gameState.stage - 1)));
                const slimeLvl = (gameState.petLevels && gameState.petLevels['slime']) || 0;
                const slimeBonus = slimeLvl * PET_PARAMS['slime'].goldBonus;
                const relicGoldBonus = getEquippedRelicBonus("relic_compass") / 100;
                const goldMultiplier = 1.0 + slimeBonus + relicGoldBonus;
                const reward = Math.floor(baseReward * goldMultiplier);

                gameState.gold += reward; gameState.accGold = (gameState.accGold || gameState.gold || 0) + reward;
                if (typeof gameState.masteryPoints === 'undefined') gameState.masteryPoints = 0;
                
                // 퀴즈 정답 시 FP 적립 (태양의 왕관 유물 장착 시 증가)
                const fpGained = Math.floor(10 * (1.0 + getEquippedRelicBonus("relic_crown") / 100));
                gameState.masteryPoints += fpGained;

                const arena = document.getElementById("battleArena");
                
                // 단어 정답 시 약점 타격 (스탯 기반 데미지가 최소 안전선 3.5%를 넘어서면 강화/펫/유물 효과로 상한선 자유롭게 돌파!)
                const chaliceMult = 1.0 + (getEquippedRelicBonus("relic_chalice") / 100);
                const bossBonus = isBossBattleActive 
                    ? (1.0 + (getEquippedRelicBonus("relic_feather") + getPotentialStatBonus('bossDmg')) / 100)
                    : 1.0;
                const statDmg = (calculateClickAttackPower() * 10) + Math.floor(calculateDPSPower() * 3.5);
                const rawQuizDmg = isBossBattleActive 
                    ? Math.max(statDmg, Math.floor(monsterMaxHp * 0.035)) 
                    : statDmg;
                // 연속 정답 콤보 상승 로직 적용 (처음 기본 데미지부터 시작하여 연속 정답 시 최대 2.0배 상승)
                if (typeof gameState.quizCombo === 'undefined') gameState.quizCombo = 0;
                gameState.quizCombo++;
                const comboBonus = 1.0 + Math.min(1.0, (gameState.quizCombo - 1) * 0.05);

                const quizDmg = Math.max(10, Math.floor(rawQuizDmg * chaliceMult * bossBonus * comboBonus));
                processCombatDamage(quizDmg);
                spawnDamageFloatingText(arena.getBoundingClientRect().width / 2, arena.getBoundingClientRect().height / 2, `⚡ 콤보 크리티컬! -${quizDmg.toLocaleString()}`);

                gameState.currentQuizIndex = (gameState.currentQuizIndex + 1) % gameState.wordsPool.length;

                showBattleToast(`🔥 [콤보 x${gameState.quizCombo}] 정답 타격! -${quizDmg.toLocaleString()} 피해 / +${reward.toLocaleString()}G / +10 FP`);

                setTimeout(() => {
                    generateQuizCard();
                    populateMasteredVocabulary();
                    refreshStateVisuals();
                    isEvaluatingQuiz = false;
                    for (let i = 0; i < buttons.length; i++) {
                        buttons[i].style.pointerEvents = "auto";
                    }
                }, 1000);

            } else {
                gameState.quizCombo = 0; // 오답 시 콤보 초기화
                playSoundEffect('incorrect');
                buttons[index].className = "choice-btn p-3.5 bg-red-950/80 border-2 border-red-500 text-white font-bold rounded-none-forced text-center transition flex items-center justify-center";
                
                // 오답 노트 카운팅 트래킹
                if (!gameState.wrongWordCounts) gameState.wrongWordCounts = {};
                if (current && current.word) {
                    const wKey = current.word.toLowerCase();
                    gameState.wrongWordCounts[wKey] = (gameState.wrongWordCounts[wKey] || 0) + 1;
                }

                // 25% 확률로 기습 공격 발동
                if (Math.random() < 0.25) {
                    showBattleToast("❌ 오답! 몬스터의 크리티컬 공격 발동!");
                    triggerCriticalAttack(current.word, current.meaning, false);
                } else {
                    showBattleToast("❌ 오답! 선택지 위치가 셔플됩니다.");
                }
                
                // 700ms 후 선택지 순서를 섞어 무차별 찍기를 방지합니다.
                setTimeout(() => {
                    if (current) {
                        if (currentQuizType === "word-order" || currentQuizType === "short-answer") {
                            renderQuizConstructedInput(current, currentQuizType);
                        } else {
                            renderChoices(currentQuizChoices, currentQuizCorrectValue);
                        }
                    }
                    isEvaluatingQuiz = false;
                    for (let i = 0; i < buttons.length; i++) {
                        buttons[i].style.pointerEvents = "auto";
                    }
                }, 700);
            }
            saveLocalCache();
        }

        let currentCriticalWord = "";
        let criticalTimerInterval = null;

        function triggerCriticalAttack(word, meaning, isBoss = false) {
            currentCriticalWord = word.toLowerCase();
            document.getElementById("criticalDefenseMeaning").innerText = meaning;
            document.getElementById("criticalDefenseInput").value = "";
            document.getElementById("criticalDefenseError").classList.add("hidden");
            
            const titleEl = document.getElementById("criticalDefenseTitle");
            const descEl = document.getElementById("criticalDefenseDesc");
            
            if (isBoss) {
                titleEl.innerHTML = `<span class="animate-pulse">⚠️</span> 보스의 강력한 공격!`;
                descEl.innerText = "보스의 치명적인 공격입니다! 방어하려면 영단어 스펠링을 정확히 입력하세요.";
            } else {
                titleEl.innerHTML = `<span class="animate-pulse">⚠️</span> 몬스터의 기습 공격!`;
                descEl.innerText = "치명적인 일격이 날아옵니다! 방어하려면 영단어 스펠링을 정확히 입력하세요.";
            }

            const modal = document.getElementById("criticalDefenseModal");
            modal.classList.remove("hidden");
            modal.classList.add("flex");
            document.getElementById("criticalDefenseInput").focus();

            startCriticalTimer();
        }

        function startCriticalTimer() {
            if (criticalTimerInterval) clearInterval(criticalTimerInterval);
            let timeLeft = 200; // 20.0 seconds
            const bar = document.getElementById("criticalDefenseTimerBar");
            const text = document.getElementById("criticalDefenseTimeText");
            
            criticalTimerInterval = setInterval(() => {
                timeLeft -= 1;
                bar.style.width = `${Math.max(0, (timeLeft / 200) * 100)}%`;
                text.innerText = `제한시간: ${(timeLeft / 10).toFixed(1)}초`;
                
                if (timeLeft <= 0) {
                    clearInterval(criticalTimerInterval);
                    punishCriticalFailure("시간 초과");
                }
            }, 100);
        }

        function punishCriticalFailure(reason) {
            if (criticalTimerInterval) clearInterval(criticalTimerInterval);
            playSoundEffect('incorrect');
            const errorEl = document.getElementById("criticalDefenseError");
            
            const gearKeys = ['helmetLvl', 'armorLvl', 'weaponLvl', 'shieldLvl', 'shoesLvl'];
            const gearNames = ['투구', '갑옷', '무기', '방패', '신발'];
            const rIdx = Math.floor(Math.random() * gearKeys.length);
            const targetGear = gearKeys[rIdx];
            const targetName = gearNames[rIdx];

            const shieldRate = getEquippedRelicBonus("relic_shield");
            if (shieldRate > 0 && Math.random() * 100 < shieldRate) {
                showBattleToast(`🛡️ 대지의 수호 방패 발동! 오답 하락 피해 방어 성공! (${shieldRate}%)`);
                const errorEl = document.getElementById("criticalDefenseError");
                if (errorEl) errorEl.innerText = "🛡️ 대지의 수호 방패가 장비 등급 하락을 완전 방어했습니다!";
                return;
            }

            if (gameState[targetGear] > 1) {
                gameState[targetGear] -= 1;
                const msg = `❌ 방어 실패! ${targetName}의 강화 수치가 -1 되었습니다.<br>(정답: <span class="text-white">${currentCriticalWord}</span>)`;
                errorEl.innerHTML = msg;
                showBattleToast(`💥 방어 실패! ${targetName} -1강 하락!`);
                showDamageOverlay(`❌ 방어 실패! ${targetName}의 강화 수치가 -1 되었습니다.\n(정답: ${currentCriticalWord})`);
            } else {
                const msg = `❌ 방어 실패! 치명적인 공격을 받았습니다!<br>(정답: <span class="text-white">${currentCriticalWord}</span>)`;
                errorEl.innerHTML = msg;
                showBattleToast("💥 크리티컬 피격!");
                showDamageOverlay(`❌ 방어 실패! 치명적인 공격을 받았습니다!\n(정답: ${currentCriticalWord})`);
            }
            errorEl.classList.remove("hidden");
            
            const box = document.getElementById("criticalDefenseBox");
            box.classList.add("animate-shake");
            setTimeout(() => { box.classList.remove("animate-shake"); }, 600);

            setTimeout(() => {
                const modal = document.getElementById("criticalDefenseModal");
                modal.classList.remove("flex");
                modal.classList.add("hidden");
                drawHeroAvatar();
                buildUpgradeblacksmith();
                refreshStateVisuals();
                saveLocalCache();
            }, 1500);
        }

        function submitCriticalDefense() {
            const inputEl = document.getElementById("criticalDefenseInput");
            if (!inputEl || !formatEnglishWordInput(inputEl)) return;
            const inputVal = normalizeEnglishAnswer(inputEl.value);
            if (!inputVal) {
                showToast("⚠️ 영단어를 입력해 주세요.");
                return;
            }

            if (inputVal === normalizeEnglishAnswer(currentCriticalWord)) {
                if (criticalTimerInterval) clearInterval(criticalTimerInterval);
                playSoundEffect('correct');
                const modal = document.getElementById("criticalDefenseModal");
                modal.classList.remove("flex");
                modal.classList.add("hidden");
                // 성공 시 반격 폭딜 (보스전에서는 보스 최대 체력의 10% 반격 고정 및 명확한 문구 표시)
                let counterDmg = 0;
                if (isBossBattleActive) {
                    counterDmg = Math.floor(monsterMaxHp * 0.10);
                    showBattleToast(`🛡️ 방어 성공! 보스 체력 10% 감소! (-${counterDmg.toLocaleString()})`);
                } else {
                    counterDmg = Math.floor(((calculateClickAttackPower() * 20) + (calculateDPSPower() * 4)) * 2);
                    showBattleToast(`🛡️ 방어 성공! 반격 타격! (-${counterDmg.toLocaleString()})`);
                }
                processCombatDamage(counterDmg);
                const arena = document.getElementById("battleArena");
                spawnDamageFloatingText(arena.getBoundingClientRect().width / 2, arena.getBoundingClientRect().height / 2, `✨ 방어 성공! 보스 체력 10% 감소! (-${counterDmg.toLocaleString()})`);
            } else {
                punishCriticalFailure("스펠링 오답");
            }
        }

        function populateMasteredVocabulary() {
            const listDiv = document.getElementById("masteredVocabularyCatalog");
            if (!listDiv) return;

            if (!gameState.wrongWordCounts) gameState.wrongWordCounts = {};
            const masteredList = gameState.masteredWords || [];

            // 통계 및 퀴즈 정답률
            const correctEl = document.getElementById("statCorrectCount");
            const incorrectEl = document.getElementById("statIncorrectCount");
            const ratioEl = document.getElementById("statSuccessRatio");
            if (correctEl) correctEl.innerText = (gameState.totalQuizCorrect || 0).toLocaleString();
            if (incorrectEl) incorrectEl.innerText = Math.max(0, (gameState.totalQuizTries || 0) - (gameState.totalQuizCorrect || 0)).toLocaleString();
            if (ratioEl) {
                const tries = gameState.totalQuizTries || 0;
                const correct = gameState.totalQuizCorrect || 0;
                ratioEl.innerText = tries > 0 ? `${Math.round((correct / tries) * 100)}%` : "0%";
            }

            // 🛡️ 내 영웅 정보 프로필 전용 종합 스펙 실시간 동기화
            const profileClick = document.getElementById("profileClickPower");
            const profileDps = document.getElementById("profileDpsPower");
            const profileSkillDmg = document.getElementById("profileSkillDmgBonus");
            const profileCrit = document.getElementById("profileCritChance");
            const profileBossDmg = document.getElementById("profileBossDmgBonus");
            const profileCdRed = document.getElementById("profileCooldownRed");
            const profileGold = document.getElementById("profileGoldBonus");
            const profileQuizCorrect = document.getElementById("profileQuizCorrectBonus");
            const profileGearTotal = document.getElementById("profileGearTotalBonus");
            const profilePetTotal = document.getElementById("profilePetBonusTotal");
            
            const profileRelicName = document.getElementById("profileEquippedRelicName");
            const profileRelicEffect = document.getElementById("profileEquippedRelicEffect");
            const profileAccSummary = document.getElementById("profileAccessoriesSummary");
            const profileStageBadge = document.getElementById("heroProfileStageBadge");

            if (profileClick) profileClick.innerText = `${calculateClickAttackPower().toLocaleString()} Dmg`;
            if (profileDps) profileDps.innerText = `+${calculateDPSPower().toLocaleString()}/초`;
            if (profileStageBadge) profileStageBadge.innerText = `🚩 현재 진행: Stage ${gameState.stage || 1}-${(gameState.progress || 0) + 1}`;

            // 상세 효과 수치 산출
            // 추가 스킬 피해량 (목걸이 + 잠재력 + 유물)
            const necklaceSkillBonus = (gameState.necklaceLvl || 0) * 1.5;
            const potentialSkillBonus = getPotentialStatBonus('skillDmg');
            const relicSkillBonus = getEquippedRelicBonus("relic_scroll");
            const totalSkillBonusPct = necklaceSkillBonus + potentialSkillBonus + relicSkillBonus;
            if (profileSkillDmg) profileSkillDmg.innerText = `+${totalSkillBonusPct.toFixed(1)}%`;

            const critBonus = getEquippedRelicBonus("relic_dice");
            const braceletCrit = Math.min(25, (gameState.braceletLvl || 0) * 0.25);
            const critRate = 5.0 + critBonus + getPotentialStatBonus('critRate') + braceletCrit;
            if (profileCrit) profileCrit.innerText = `${critRate.toFixed(1)}%`;

            const ringBossPct = (gameState.ringLvl || 0) * 1.0;
            const bossDmgBonus = ringBossPct + getEquippedRelicBonus("relic_feather") + getPotentialStatBonus('bossDmg');
            if (profileBossDmg) profileBossDmg.innerText = `+${bossDmgBonus.toFixed(1)}%`;

            const necklaceCdRed = Math.min(30, (gameState.necklaceLvl || 0) * 0.3);
            const relicCdRed = getEquippedRelicBonus("relic_clock");
            const totalCdRed = Math.min(60, necklaceCdRed + relicCdRed);
            if (profileCdRed) profileCdRed.innerText = `-${totalCdRed.toFixed(1)}%`;

            const slimeLvl = (gameState.petLevels && gameState.petLevels['slime']) || 0;
            const slimeBonus = slimeLvl * PET_PARAMS['slime'].goldBonus;
            const relicGoldBonus = getEquippedRelicBonus("relic_compass") / 100;
            const goldMultiplier = 1.0 + slimeBonus + relicGoldBonus + (getPotentialStatBonus('goldBonus') / 100);
            if (profileGold) profileGold.innerText = `×${goldMultiplier.toFixed(2)}배`;

            // 📖 퀴즈 단어 정답 타격 피해 수치 & 증폭률
            const baseQuizStatDmg = (calculateClickAttackPower() * 8) + Math.floor(calculateDPSPower() * 1.5);
            const relicChaliceDmg = getEquippedRelicBonus("relic_chalice");
            const quizCombo = gameState.combo || 0;
            const comboDmgPct = Math.min(150, quizCombo * 5); // 콤보당 +5% (최대 +150%)
            const totalQuizDmgBonus = relicChaliceDmg + comboDmgPct;
            const finalQuizStatDmg = Math.floor(baseQuizStatDmg * (1 + totalQuizDmgBonus / 100));
            if (profileQuizCorrect) {
                profileQuizCorrect.innerText = `${finalQuizStatDmg.toLocaleString()} Dmg (+${totalQuizDmgBonus.toFixed(0)}%)`;
            }

            // ⚡ 크리티컬 피해 배율 (기본 200% = ×2.0배)
            const profileCritDmg = document.getElementById("profileCritDmgMult");
            if (profileCritDmg) profileCritDmg.innerText = "200% (×2.0배)";

            // ⚔️ 용사 종합 전투력 Index
            const combatPower = calculatePlayerCP();
            const profileCp = document.getElementById("profileCombatPower");
            if (profileCp) profileCp.innerText = combatPower.toLocaleString();

            // 유물 장착 상태 요약 (실제 유물 이미지 표시, 이름 앞 🏺 아이콘 제거)
            const isRelicUnlocked = (gameState.stage || 1) >= 35;
            if (!isRelicUnlocked) {
                if (profileRelicName) profileRelicName.innerText = "🔒 미해금 (35스테이지)";
                if (profileRelicEffect) profileRelicEffect.innerText = "35스테이지 정복 시 유물 해금";
                const profileRelicImg = document.getElementById("profileEquippedRelicImg");
                if (profileRelicImg) profileRelicImg.classList.add("hidden");
            } else if (gameState.equippedRelicId) {
                const eqR = RELIC_DEFINITIONS.find(item => item.id === gameState.equippedRelicId);
                const acR = (gameState.acquiredRelics || []).find(item => item.id === gameState.equippedRelicId);
                if (eqR) {
                    if (profileRelicName) profileRelicName.innerText = eqR.name;
                    if (profileRelicEffect) profileRelicEffect.innerHTML = getRelicEffectString(eqR, acR).replace(/<br>/gi, ' ');
                    const profileRelicImg = document.getElementById("profileEquippedRelicImg");
                    if (profileRelicImg) {
                        profileRelicImg.src = eqR.img;
                        profileRelicImg.classList.remove("hidden");
                    }
                }
            } else {
                if (profileRelicName) profileRelicName.innerText = "[장착된 유물 없음]";
                if (profileRelicEffect) profileRelicEffect.innerText = "능력치 적용 미발동";
                const profileRelicImg = document.getElementById("profileEquippedRelicImg");
                if (profileRelicImg) profileRelicImg.classList.add("hidden");
            }

            // 💰 획득 재화 현황 실시간 업데이트 (데이터 동기화 보장)
            const goldEl = document.getElementById("profileGoldTotal");
            const fpEl = document.getElementById("profileFpTotal");
            const tokenEl = document.getElementById("profileTokenTotal");
            const bossTokenText = document.getElementById("bossTokenCountText"); // 유물 탭의 증표 표시
            if (goldEl) goldEl.innerText = Math.floor(gameState.gold || 0).toLocaleString();
            if (fpEl) fpEl.innerText = Math.floor(gameState.masteryPoints || 0).toLocaleString();
            if (tokenEl) tokenEl.innerText = Math.floor(gameState.bossTokens || 0).toLocaleString();
            if (bossTokenText) bossTokenText.innerText = Math.floor(gameState.bossTokens || 0).toLocaleString();

            // 장신구 연마 레벨 및 효과 수치 실시간 갱신
            const applyAccProfileUI = (containerId, key, name, lvl, img, effectClass, unlockStage) => {
                const container = document.getElementById(containerId);
                if (!container) return;
                const isUnlocked = (gameState.stage || 1) >= unlockStage;
                if (!isUnlocked) {
                    container.className = "bg-black/50 border border-gray-800/40 p-1.5 rounded flex flex-col items-center justify-center min-w-0 opacity-50 grayscale";
                    container.innerHTML = `
                        <div class="flex items-center justify-center gap-1 mb-1">
                            <span class="text-gray-500 font-extrabold text-[9px] whitespace-nowrap">🔒 미해금 (${unlockStage}스테이지)</span>
                        </div>
                    `;
                } else {
                    container.className = `bg-${effectClass}-950/40 border border-${effectClass}-800/40 p-1.5 rounded flex flex-col items-center justify-center min-w-0`;
                    container.innerHTML = `
                        <div class="flex items-center justify-center gap-1 mb-1">
                            <img src="${img}" class="w-5 h-5 object-contain shrink-0" onerror="this.style.display='none'">
                            <span class="text-${effectClass}-300 font-extrabold text-[9px] whitespace-nowrap">${name} <b class="text-white">${lvl || 0}강</b></span>
                        </div>
                        <span class="text-[8.5px] text-${effectClass}-200 font-bold block leading-tight break-words">${getAccessoryEffectSummary(key, lvl)}</span>
                    `;
                }
            };
            
            applyAccProfileUI('profileNecklaceContainer', 'necklace', '목걸이', gameState.necklaceLvl, 'media/accessories/necklace.webp', 'purple', 45);
            applyAccProfileUI('profileBraceletContainer', 'bracelet', '팔찌', gameState.braceletLvl, 'media/accessories/bracelet.webp', 'sky', 55);
            applyAccProfileUI('profileRingContainer', 'ring', '반지', gameState.ringLvl, 'media/accessories/ring.webp', 'amber', 65);

            // 학습 기록을 행동 중심의 상태·진행도·유형별 성취로 재구성합니다.
            const weakContainer = document.getElementById("weakWordsContainer");
            const weakBadge = document.getElementById("weakWordsCountBadge");
            const normalizeLearningWordKey = (value) => String(value || "").trim().toLowerCase();
            const legacyWordLookup = new Map();
            const addLegacyWordLookup = (item) => {
                const word = typeof item === "string" ? item : item?.word;
                const key = normalizeLearningWordKey(word);
                if (!key) return;
                const meaning = typeof item === "object" && item ? String(item.meaning || "") : "";
                const previous = legacyWordLookup.get(key);
                if (!previous || (!previous.meaning && meaning)) legacyWordLookup.set(key, { word: String(word), meaning });
            };
            (gameState.wordsPool || []).forEach(addLegacyWordLookup);
            Object.values(MOCK_WORDS).flat().forEach(addLegacyWordLookup);
            (masteredList || []).forEach(addLegacyWordLookup);

            let learningRows = Object.entries(gameState.wordLearningStats || {}).map(([key, raw]) => {
                const correct = Math.max(0, Number(raw?.c || 0));
                const wrong = Math.max(0, Number(raw?.x || 0));
                const tries = correct + wrong;
                const accuracy = tries ? correct / tries * 100 : 0;
                const mastered = correct >= WORD_MASTERY_CORRECT_THRESHOLD && accuracy >= WORD_MASTERY_ACCURACY_THRESHOLD * 100;
                return { key: normalizeLearningWordKey(key), word: String(raw?.w || key), meaning: String(raw?.m || ""), correct, wrong, tries, accuracy, mastered, updatedAt: Number(raw?.u || 0), byType: raw?.t || {} };
            }).filter((row) => row.word);
            const learningRowKeys = new Set(learningRows.map((row) => row.key));
            Object.entries(gameState.wrongWordCounts || {}).forEach(([rawKey, rawWrong]) => {
                const key = normalizeLearningWordKey(rawKey);
                const wrong = Math.max(0, Number(rawWrong || 0));
                if (!key || wrong <= 0 || learningRowKeys.has(key)) return;
                const legacyWord = legacyWordLookup.get(key);
                learningRows.push({
                    key,
                    word: String(legacyWord?.word || rawKey),
                    meaning: String(legacyWord?.meaning || "뜻 정보 없음"),
                    correct: 0,
                    wrong,
                    tries: wrong,
                    accuracy: 0,
                    mastered: false,
                    updatedAt: 0,
                    byType: {}
                });
                learningRowKeys.add(key);
            });
            const learnedKeys = new Set(learningRows.map((row) => row.key));
            (masteredList || []).forEach((item) => learnedKeys.add(String(item?.word || "").trim().toLowerCase()));
            Object.keys(gameState.wrongWordCounts || {}).forEach((key) => learnedKeys.add(String(key).trim().toLowerCase()));
            const masteredRows = learningRows.filter((row) => row.mastered);
            const wrongRows = learningRows.filter((row) => row.wrong > 0)
                .sort((a, b) => b.wrong - a.wrong || a.accuracy - b.accuracy || b.updatedAt - a.updatedAt);
            const reviewRows = learningRows.filter((row) => !row.mastered && row.wrong > 0 && row.accuracy < 80)
                .sort((a, b) => (b.wrong * 3 - b.correct) - (a.wrong * 3 - a.correct) || b.updatedAt - a.updatedAt);
            const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
            const typeLabels = { "meaning-choice": "뜻 찾기", "fill-blank": "빈칸 넣기", "word-choice": "영어 단어 찾기", "listen-meaning": "발음 듣고 뜻 찾기", "word-order": "철자 순서 맞추기", "short-answer": "영어 단답식" };
            const typeTotals = {};
            learningRows.forEach((row) => Object.entries(row.byType || {}).forEach(([type, values]) => {
                if (!Array.isArray(values)) return;
                if (!typeTotals[type]) typeTotals[type] = { tries: 0, correct: 0 };
                typeTotals[type].tries += Math.max(0, Number(values[0] || 0));
                typeTotals[type].correct += Math.max(0, Number(values[1] || 0));
            }));
            const totalTypeTries = Object.values(typeTotals).reduce((sum, value) => sum + Math.max(0, Number(value?.tries || 0)), 0);
            const typeAchievementHtml = Object.entries(typeLabels).map(([type, label]) => {
                const value = typeTotals[type] || { tries: 0, correct: 0 };
                const rate = value.tries > 0 ? value.correct / value.tries * 100 : 0;
                const color = value.tries < 1 ? "bg-gray-700" : rate >= 80 ? "bg-emerald-400" : rate >= 60 ? "bg-amber-400" : "bg-rose-500";
                const textColor = value.tries < 1 ? "text-gray-500" : rate >= 80 ? "text-emerald-300" : rate >= 60 ? "text-amber-300" : "text-rose-300";
                return `<article class="border border-[#24323a] bg-black/70 p-2.5"><div class="flex items-center justify-between gap-2"><b class="truncate text-[10px] text-gray-200">${esc(label)}</b><span class="shrink-0 text-[9px] font-bold ${textColor}">${value.correct}/${value.tries} · ${rate.toFixed(0)}%</span></div><div class="mt-2 h-2 overflow-hidden bg-[#222]"><span class="block h-full ${color}" style="width:${Math.min(100, rate)}%"></span></div></article>`;
            }).join("");
            if (weakBadge) weakBadge.innerText = `총 ${totalTypeTries.toLocaleString()}회`;
            if (weakContainer) {
                weakContainer.innerHTML = typeAchievementHtml;
            }

            const conqueredCount = new Set((masteredList || []).map((item) => String(item?.word || "").trim().toLowerCase()).filter(Boolean)).size;
            const totalEl = document.getElementById("masteredTotalText");
            if (totalEl) totalEl.innerText = `${conqueredCount}`;
            const profileTotalEl = document.getElementById("profileMasteredTotalText");
            if (profileTotalEl) profileTotalEl.innerText = `${conqueredCount}개`;

            const insightCards = `
                <div class="grid grid-cols-2 gap-2 md:grid-cols-4">
                    <div class="border border-cyan-900/60 bg-cyan-950/10 p-3 text-center"><span class="text-[8px] text-gray-500">만나 본 단어</span><b class="mt-1 block text-lg text-cyan-300">${learnedKeys.size}개</b></div>
                    <div class="border border-sky-900/60 bg-sky-950/10 p-3 text-center"><span class="text-[8px] text-gray-500">1회 이상 정답</span><b class="mt-1 block text-lg text-sky-300">${conqueredCount}개</b></div>
                    <div class="border border-emerald-900/60 bg-emerald-950/10 p-3 text-center"><span class="text-[8px] text-gray-500">숙련 단어</span><b class="mt-1 block text-lg text-emerald-300">${masteredRows.length}개</b></div>
                    <div class="border border-rose-900/60 bg-rose-950/10 p-3 text-center"><span class="text-[8px] text-gray-500">우선 복습</span><b class="mt-1 block text-lg text-rose-300">${reviewRows.length}개</b></div>
                </div>`;
            const wrongHtml = wrongRows.length ? wrongRows.slice(0, 12).map((row, index) => `<article class="border border-[#3a252a] bg-black p-2.5"><div class="flex items-start justify-between gap-2"><div class="min-w-0"><b class="block truncate text-[10px] text-white">${index + 1}. ${esc(row.word)}</b><span class="mt-0.5 block truncate text-[8px] text-gray-400">${esc(row.meaning || "뜻 정보 없음")}</span></div><span class="shrink-0 text-[9px] font-bold text-rose-300">오답 ${row.wrong}회</span></div><div class="mt-2 flex items-center justify-between border-t border-[#311d22] pt-1.5 text-[8px]"><span class="text-sky-300">정답 ${row.correct}회</span><span class="text-gray-500">정답률 ${row.accuracy.toFixed(0)}%</span></div></article>`).join("") : '<p class="col-span-full border border-dashed border-emerald-900/60 p-5 text-center text-[10px] text-emerald-300">아직 기록된 오답 단어가 없어요.</p>';
            const masteredHtml = [...masteredRows].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 20).map((row) => `<article class="border border-emerald-900/60 bg-black p-2.5"><div class="flex items-start justify-between gap-2"><div class="min-w-0"><b class="block truncate text-[10px] text-emerald-200">${esc(row.word)}</b><span class="mt-0.5 block truncate text-[8px] text-gray-400">${esc(row.meaning || "뜻 정보 없음")}</span></div><span class="shrink-0 text-[9px] font-bold text-emerald-300">숙련</span></div><p class="mt-2 border-t border-[#173128] pt-1.5 text-[8px] text-gray-500">정답 ${row.correct}회 · 정답률 ${row.accuracy.toFixed(0)}%</p></article>`).join("") || '<p class="col-span-full border border-dashed border-emerald-900/60 p-5 text-center text-[10px] text-gray-500">정답 10회·정답률 80%를 달성하면 숙련 단어가 나타나요.</p>';
            const detailRows = [...learningRows].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 300).map((row) => `<div class="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2 border-b border-[#1f2933] py-2 text-[9px]"><span class="truncate text-gray-200">${esc(row.word)} · ${esc(row.meaning)}</span><span class="text-sky-300">${row.correct}정답</span><span class="${row.mastered ? "text-emerald-300" : row.wrong ? "text-rose-300" : "text-gray-400"}">${row.mastered ? "숙련" : row.wrong + "오답"}</span></div>`).join("");
            listDiv.innerHTML = `${insightCards}<div class="mt-3 grid gap-3 lg:grid-cols-2"><section class="border border-rose-900/50 bg-rose-950/5 p-3"><div class="flex items-center justify-between"><b class="text-xs text-rose-300">내가 많이 틀린 단어</b><span class="text-[8px] text-gray-500">오답 횟수 높은 순</span></div><div class="mt-2 grid gap-2 sm:grid-cols-2">${wrongHtml}</div></section><section class="border border-emerald-900/50 bg-emerald-950/5 p-3"><div class="flex items-center justify-between"><b class="text-xs text-emerald-300">숙련 단어</b><span class="text-[8px] text-gray-500">최근 숙련 순</span></div><div class="mt-2 grid gap-2 sm:grid-cols-2">${masteredHtml}</div></section></div><details class="mt-3 border border-[#27323a] bg-black"><summary class="cursor-pointer px-3 py-2 text-[10px] font-bold text-gray-300">전체 단어 학습 기록 펼쳐보기 (${learningRows.length}개)</summary><div class="max-h-64 overflow-y-auto px-3 pb-3">${detailRows || '<p class="py-4 text-center text-[10px] text-gray-500">아직 단어별 학습 기록이 없어요.</p>'}</div></details>`;
        }
        // ==========================================
        // STAGE BOSS SYSTEM
        // ==========================================
        function startBossBattle() {
            if (isBossBattleActive) return;

            isBossBattleActive = true;
            bossTimeRemaining = GAME_CONFIG.BOSS_TIME_LIMIT;
            bossCriticalsQueue = 1; // 1차 기습: 보스 전투 시작 직후 1회
            hasTriggeredCrit30s = false;
            hasTriggeredCrit3s = false;

            showBattleToast("🚨 보스 몬스터 출현! 60초 이내 처치!");
            playSoundEffect('levelup');

            document.getElementById("bossBattleTimerHeader").classList.remove("hidden");
            document.getElementById("bossTriggerBtn").classList.add("hidden");

            respawnActiveMonster();

            if (bossTimerInterval) clearInterval(bossTimerInterval);

            bossTimerInterval = setInterval(() => {
                const isCritModalOpen = document.getElementById("criticalDefenseModal") && document.getElementById("criticalDefenseModal").classList.contains("flex");
                if (isCritModalOpen) return; // 강력한 공격 팝업 열려있는 동안 보스 도전 타이머 일시정지!

                bossTimeRemaining -= 0.1;

                // 2차 기습: 30.0초 남았을 때 1회 발동
                if (!hasTriggeredCrit30s && bossTimeRemaining <= 30.0) {
                    hasTriggeredCrit30s = true;
                    bossCriticalsQueue++;
                }

                // 3차 기습: 3.0초 남았을 때 1회 발동
                if (!hasTriggeredCrit3s && bossTimeRemaining <= 3.0) {
                    hasTriggeredCrit3s = true;
                    bossCriticalsQueue++;
                }

                // 보스전 전용 크리티컬 방어 기믹 대기열 처리
                if (bossCriticalsQueue > 0 && !document.getElementById("criticalDefenseModal").classList.contains("flex")) {
                    bossCriticalsQueue--;
                    if (gameState.wordsPool && gameState.wordsPool.length > 0) {
                        const rWord = gameState.wordsPool[Math.floor(Math.random() * gameState.wordsPool.length)];
                        showBattleToast("⚠️ 보스의 치명적인 강력한 공격이 날아옵니다!");
                        triggerCriticalAttack(rWord.word, rWord.meaning, true);
                    }
                }

                // 💚 보스 자동 체력 회복 (초당 0.5% 회복, 60초간 총 30% 회복으로 텐션 유지)
                if (monsterCurrentHp > 0 && monsterCurrentHp < monsterMaxHp) {
                    const regenAmount = Math.max(1, Math.floor(monsterMaxHp * 0.005 * 0.1)); // 0.1초당 0.05%
                    monsterCurrentHp = Math.min(monsterMaxHp, monsterCurrentHp + regenAmount);
                    updateArenaHpBars();
                }

                if (bossTimeRemaining <= 0) {
                    failBossBattle();
                } else {
                    const pct = (bossTimeRemaining / GAME_CONFIG.BOSS_TIME_LIMIT) * 100;
                    document.getElementById("bossTimerBar").style.width = `${pct}%`;
                    document.getElementById("bossTimeLimitCount").innerText = `${bossTimeRemaining.toFixed(1)}초`;
                }
            }, 100);
        }

        function failBossBattle() {
            clearInterval(bossTimerInterval);
            isBossBattleActive = false;

            document.getElementById("bossBattleTimerHeader").classList.add("hidden");

            showBattleToast("⚠️ 시간 초과! 보스가 물러갑니다.");

            respawnActiveMonster();
            refreshStateVisuals();
        }

        function concludeBossSuccess() {
            clearInterval(bossTimerInterval);
            isBossBattleActive = false;

            document.getElementById("bossBattleTimerHeader").classList.add("hidden");

            gameState.stage++;
            gameState.progress = 0;

            showBattleToast(`🏆 스테이지 ${gameState.stage} 클리어!`);

            respawnActiveMonster();
            refreshStateVisuals();
        }

        function refreshStateVisuals() {
            if (typeof gameState.masteryPoints === 'undefined') gameState.masteryPoints = 0;
            const goldEl = document.getElementById("goldCount");
            if (goldEl) goldEl.innerText = Math.floor(gameState.gold).toLocaleString();

            const mpEl = document.getElementById("masteryPointsCount");
            if (mpEl) mpEl.innerText = Math.floor(gameState.masteryPoints).toLocaleString();

            const bossTokenText = document.getElementById("bossTokenCountText");
            if (bossTokenText) bossTokenText.innerText = Math.floor(gameState.bossTokens || 0).toLocaleString();

            const autoGoldEl = document.getElementById("autoGoldCount");
            if (autoGoldEl) autoGoldEl.innerText = calculateAutoGoldPerSec().toLocaleString();

            const dpsEl = document.getElementById("dpsCount");
            if (dpsEl) dpsEl.innerText = calculateDPSPower().toLocaleString();

            const clickEl = document.getElementById("clickPowerCount");
            if (clickEl) clickEl.innerText = calculateClickAttackPower();

            const stageEl = document.getElementById("displayStageNum");
            if (stageEl) {
                stageEl.innerText = isBossBattleActive 
                    ? `보스 스테이지 ${gameState.stage}`
                    : `스테이지 ${gameState.stage}-${gameState.progress + 1}`;
            }

            const relicUnlockedSection = document.getElementById("relicAltarUnlockedSection");
            const relicLockedSection = document.getElementById("relicAltarLockedSection");
            if (relicUnlockedSection && relicLockedSection) {
                if ((gameState.stage || 1) >= 30) {
                    relicUnlockedSection.classList.remove("hidden");
                    relicLockedSection.classList.add("hidden");
                } else {
                    relicUnlockedSection.classList.add("hidden");
                    relicLockedSection.classList.remove("hidden");
                }
            }

            // ⚔️ 권장 전투력(Required CP) 및 내 전투력(My CP) 동기화 & 미달 피드백
            const stageNum = gameState.stage || 1;
            const reqCp = calculateRequiredCP(stageNum, isBossBattleActive);
            const myCp = calculatePlayerCP();

            const recCpEl = document.getElementById("recommendedCpDisplay");
            const playerCpEl = document.getElementById("playerCpDisplay");

            if (recCpEl) recCpEl.innerText = reqCp.toLocaleString();
            if (playerCpEl) {
                playerCpEl.innerText = myCp.toLocaleString();
                if (myCp >= reqCp) {
                    playerCpEl.className = "font-bold text-emerald-400";
                } else {
                    const deficitPct = Math.round((1 - (myCp / reqCp)) * 100);
                    playerCpEl.className = "font-bold text-rose-400 animate-pulse";
                    playerCpEl.title = `⚠️ 권장 전투력 대비 ${deficitPct}% 미달 (데미지 감쇄 패널티 적용중)`;
                }
            }

            const curProg = gameState.progress;
            const progressRatio = Math.min(100, (curProg / BOSS_UNLOCK_LIMIT) * 100);

            const pBarEl = document.getElementById("bossProgressBar");
            if (pBarEl) pBarEl.style.width = `${progressRatio}%`;

            const unlockRatioEl = document.getElementById("bossUnlockRatio");
            if (unlockRatioEl) unlockRatioEl.innerText = `${curProg} / ${BOSS_UNLOCK_LIMIT}`;

            const triggerBtn = document.getElementById("bossTriggerBtn");
            if (triggerBtn) {
                if (curProg >= BOSS_UNLOCK_LIMIT && !isBossBattleActive) {
                    triggerBtn.classList.remove("hidden");
                    triggerBtn.classList.add("flex");
                } else {
                    triggerBtn.classList.add("hidden");
                }
            }

            const statCorrEl = document.getElementById("statCorrectCount");
            if (statCorrEl) statCorrEl.innerText = gameState.totalQuizCorrect;

            const statIncorrEl = document.getElementById("statIncorrectCount");
            if (statIncorrEl) statIncorrEl.innerText = gameState.totalQuizTries - gameState.totalQuizCorrect;

            const ratio = gameState.totalQuizTries > 0
                ? Math.round((gameState.totalQuizCorrect / gameState.totalQuizTries) * 100)
                : 0;
            const statRatioEl = document.getElementById("statSuccessRatio");
            if (statRatioEl) statRatioEl.innerText = `${ratio}%`;

            // 길드명·칭호·닉네임은 각각 별도 요소로 렌더링합니다.
            // 칭호 광원은 칭호 배지에만 적용하고 이름표 바깥 컨테이너와 양옆 장비에는 번지지 않게 합니다.
            refreshHeroIdentity();
            [document.getElementById("heroNameTag"), document.getElementById("userInfoDisplay")].forEach((container) => {
                if (!container) return;
                ["color", "border-color", "background-color", "box-shadow", "text-shadow"].forEach((property) => container.style.removeProperty(property));
            });
        }
        function updateSoundSettingsUI() {
            if (!gameState.soundSettings) {
                gameState.soundSettings = {
                    masterSoundOn: true,
                    sfxAttack: true,
                    sfxQuiz: true,
                    sfxLevelup: true,
                    sfxSkill: true,
                    masterVolume: 10,
                    volAttack: 10,
                    volQuiz: 10,
                    volLevelup: 10,
                    volSkill: 10
                };
            }
            // 이전 버전 하위 호환
            if (typeof gameState.soundSettings.masterSoundOn === 'undefined') {
                gameState.soundSettings.masterSoundOn = !gameState.soundSettings.masterMute;
            }

            const ss = gameState.soundSettings;
            if (typeof ss.masterSoundOn === 'undefined') {
                ss.masterSoundOn = typeof ss.masterMute !== 'undefined' ? !ss.masterMute : true;
            }
            if (typeof ss.masterVolume === 'undefined') ss.masterVolume = 10;
            if (typeof ss.volAttack === 'undefined') ss.volAttack = 10;
            if (typeof ss.volQuiz === 'undefined') ss.volQuiz = 10;
            if (typeof ss.volLevelup === 'undefined') ss.volLevelup = 10;
            if (typeof ss.sfxSkill === 'undefined') ss.sfxSkill = true;
            if (typeof ss.volSkill === 'undefined') ss.volSkill = 10;

            const masterMuteEl = document.getElementById("settingSfxMaster");
            const sfxAttackEl = document.getElementById("settingSfxAttack");
            const sfxQuizEl = document.getElementById("settingSfxQuiz");
            const sfxLevelupEl = document.getElementById("settingSfxLevelup");
            const sfxSkillEl = document.getElementById("settingSfxSkill");
            const detailContainer = document.getElementById("detailSoundSettingsContainer");

            const isMasterOn = !!ss.masterSoundOn;

            if (masterMuteEl) masterMuteEl.checked = isMasterOn;
            if (sfxAttackEl) {
                sfxAttackEl.checked = isMasterOn ? !!ss.sfxAttack : false;
                sfxAttackEl.disabled = !isMasterOn;
            }
            if (sfxQuizEl) {
                sfxQuizEl.checked = isMasterOn ? !!ss.sfxQuiz : false;
                sfxQuizEl.disabled = !isMasterOn;
            }
            if (sfxLevelupEl) {
                sfxLevelupEl.checked = isMasterOn ? !!ss.sfxLevelup : false;
                sfxLevelupEl.disabled = !isMasterOn;
            }
            if (sfxSkillEl) {
                sfxSkillEl.checked = isMasterOn ? !!ss.sfxSkill : false;
                sfxSkillEl.disabled = !isMasterOn;
            }

            // 슬라이더 수치 및 연동 처리
            const volMasterEl = document.getElementById("volumeMaster");
            const volMasterValEl = document.getElementById("volumeMasterVal");
            if (volMasterEl) {
                volMasterEl.value = ss.masterVolume;
                volMasterEl.disabled = !isMasterOn;
            }
            if (volMasterValEl) volMasterValEl.innerText = ss.masterVolume;

            const volAttackEl = document.getElementById("volumeAttack");
            const volAttackValEl = document.getElementById("volumeAttackVal");
            if (volAttackEl) {
                volAttackEl.value = ss.volAttack;
                volAttackEl.disabled = !isMasterOn || !ss.sfxAttack;
            }
            if (volAttackValEl) volAttackValEl.innerText = ss.volAttack;

            const volQuizEl = document.getElementById("volumeQuiz");
            const volQuizValEl = document.getElementById("volumeQuizVal");
            if (volQuizEl) {
                volQuizEl.value = ss.volQuiz;
                volQuizEl.disabled = !isMasterOn || !ss.sfxQuiz;
            }
            if (volQuizValEl) volQuizValEl.innerText = ss.volQuiz;

            const volLevelupEl = document.getElementById("volumeLevelup");
            const volLevelupValEl = document.getElementById("volumeLevelupVal");
            if (volLevelupEl) {
                volLevelupEl.value = ss.volLevelup;
                volLevelupEl.disabled = !isMasterOn || !ss.sfxLevelup;
            }
            if (volLevelupValEl) volLevelupValEl.innerText = ss.volLevelup;

            const volSkillEl = document.getElementById("volumeSkill");
            const volSkillValEl = document.getElementById("volumeSkillVal");
            if (volSkillEl) {
                volSkillEl.value = ss.volSkill;
                volSkillEl.disabled = !isMasterOn || !ss.sfxSkill;
            }
            if (volSkillValEl) volSkillValEl.innerText = ss.volSkill;

            if (detailContainer) {
                if (!isMasterOn) {
                    detailContainer.classList.add("opacity-40", "pointer-events-none");
                } else {
                    detailContainer.classList.remove("opacity-40", "pointer-events-none");
                }
            }
        }


        // ======= [계정 관리 및 소셜 로그인 로직] =======
        window.loginWithGoogle = async function() {
            try {
                const result = await window._signInWithPopup(window._fbAuth, window._fbGoogleProvider);
                const googleUid = result.user.uid;
                
                const usersRef = window._fbCollection(window._fbDb, "users");
                const q = window._fbQuery(usersRef, window._fbWhere("linkedGoogleUid", "==", googleUid));
                const querySnapshot = await window._fbGetDocs(q);
                
                if (querySnapshot.empty) {
                    showAlert("영혼에 각인된 영웅을 찾을 수 없습니다.<br>기존 로그인 후 설정에서 구글 계정을 연동해주세요.", "⚠️", "연동 계정 없음");
                    return;
                }
                
                const docSnap = querySnapshot.docs[0];
                const data = docSnap.data();
                const targetUid = docSnap.id;
                
                const sessionData = {
                    uid: targetUid,
                    schoolName: data.schoolName,
                    grade: data.grade,
                    classNum: data.classNum,
                    studentNum: data.studentNum,
                    name: data.name,
                    password: data.password
                };
                
                sessionStorage.setItem("vocahero_active_session", JSON.stringify(sessionData));
                localStorage.setItem("vocahero_active_session", JSON.stringify(sessionData));
                localStorage.setItem("vocahero_last_student", JSON.stringify(sessionData));
                
                window.selectedSchoolName = data.schoolName;
                document.getElementById("inputSchool").value = data.schoolName;
                document.getElementById("inputGrade").value = data.grade;
                document.getElementById("inputClass").value = data.classNum;
                document.getElementById("inputNumber").value = data.studentNum;
                document.getElementById("inputName").value = data.name;
                
                closeModal('loginModal');
                
                tempCredentials = sessionData;
                await window._fbSetDoc(window._fbDoc(window._fbDb, "users", targetUid), { lastLogin: window._fbServerTimestamp() }, { merge: true });
                syncStateFromServer(data);
                
                showToast("구글 연동 계정으로 로그인되었습니다.");
            } catch (error) {
                console.error("구글 로그인 에러:", error);
                showAlert("구글 로그인이 취소되었거나 오류가 발생했습니다.", "⚠️", "구글 로그인 에러");
            }
        };

        
        window._getTempUid = function() {
            if (!tempCredentials) return null;
            if (tempCredentials.uid) return tempCredentials.uid;
            if (typeof getUid === 'function' && tempCredentials.schoolName) {
                return getUid(tempCredentials.schoolName, tempCredentials.grade, tempCredentials.classNum, tempCredentials.studentNum, tempCredentials.name);
            }
            return null;
        };

        window.linkGoogleAccount = async function() {
            const currentUid = window._getTempUid();
            if (!currentUid) {
                showAlert("먼저 게임에 로그인해야 연동할 수 있습니다.", "🔐", "로그인 필요"); return;
                return;
            }
            try {
                const result = await window._signInWithPopup(window._fbAuth, window._fbGoogleProvider);
                const googleUid = result.user.uid;
                
                const usersRef = window._fbCollection(window._fbDb, "users");
                const q = window._fbQuery(usersRef, window._fbWhere("linkedGoogleUid", "==", googleUid));
                const querySnapshot = await window._fbGetDocs(q);
                
                if (!querySnapshot.empty && querySnapshot.docs[0].id !== currentUid) {
                    showAlert("이 구글 계정은 이미 다른 게임 계정에<br>연동되어 있습니다.", "⚠️", "연동 오류"); return;
                    return;
                }
                
                await window._fbUpdateDoc(window._fbDoc(window._fbDb, "users", currentUid), {
                    linkedGoogleUid: googleUid
                });
                
                const btn = document.getElementById("btnLinkGoogle");
                if (btn) {
                    btn.innerHTML = '✅ 연동 완료';
                    btn.classList.add("opacity-50", "cursor-not-allowed");
                    btn.onclick = null;
                }
                
                showAlert("구글 계정 연동이 성공적으로 완료되었습니다!<br>이제 구글 로그인으로 계정에 접속할 수 있습니다.", "✅", "연동 완료");
            } catch (error) {
                console.error("구글 연동 에러:", error);
                showAlert("구글 계정 연동 중 오류가 발생했습니다.<br>잠시 후 다시 시도해 주세요.", "❌", "연동 실패");
            }
        };

        window.changePinCode = function() {
            const currentUid = window._getTempUid();
            const exitNow = (fromBackButton) => {
                if (fromBackButton && /android/i.test(navigator.userAgent)) return;
                
                try { window.close(); } catch(e) {}
                
                if (/android/i.test(navigator.userAgent)) {
                    try { 
                        window.location.href = "intent:#Intent;action=android.intent.action.MAIN;category=android.intent.category.HOME;end"; 
                    } catch(e) {}
                }
                
                if (/android|iphone|ipad|ipod/i.test(navigator.userAgent)) {
                    setTimeout(() => {
                        let msg = "(뒤로가기를 두 번 누르거나 폰의 홈 버튼을 눌러주세요)";
                        document.body.insertAdjacentHTML('beforeend', `<div style="position:fixed;inset:0;z-index:999999;display:flex;justify-content:center;align-items:center;background-color:#000;color:#fff;font-size:24px;text-align:center;font-weight:bold;flex-direction:column;padding:20px;line-height:1.5;">영웅의 영혼석에 기록이<br>안전하게 각인되었습니다!<br><br>이제 게임을 종료하셔도 됩니다.<br><br><span style="font-size:14px;color:#888;">${msg}</span></div>`);
                    }, 800);
                }
            };
            if (!currentUid) return;

            showInputModal({
                icon: "🔑",
                title: "PIN 암호 변경",
                message: "새로 사용할 <b>4자리 PIN 암호</b>를 입력하세요.<br><span class='text-gray-400 text-[10px]'>숫자 4자리만 입력 가능합니다</span>",
                inputType: "number",
                inputPlaceholder: "0000",
                inputMaxLength: 4,
                confirmLabel: "🔒 변경하기",
                cancelLabel: "취소",
                onConfirm: async (newPin) => {
                    if (!newPin) return;
                    if (!/^\d{4}$/.test(newPin)) {
                        showAlert("PIN 암호는 반드시 4자리 숫자여야 합니다.", "⚠️", "입력 오류");
                        return;
                    }
                    try {
                        await window._fbUpdateDoc(window._fbDoc(window._fbDb, "users", currentUid), { password: newPin });
                        tempCredentials.password = newPin;
                        gameState.password = newPin;
                        sessionStorage.setItem("vocahero_active_session", JSON.stringify(tempCredentials));
                        localStorage.setItem("vocahero_last_student", JSON.stringify(tempCredentials));
                        showAlert("PIN 암호가 성공적으로 변경되었습니다.", "✅", "변경 완료");
                    } catch(e) {
                        console.error(e);
                        showAlert("PIN 암호 변경 중 오류가 발생했습니다.", "❌", "변경 실패");
                    }
                }
            });
        };

        window.changeHeroName = function() {
            const currentUid = window._getTempUid();
            if (!currentUid) return;
            const isFirstNicknameChange = !gameState.freeNicknameChangeUsed;
            const nicknameChangeCost = isFirstNicknameChange ? 0 : 500;
            if ((gameState.masteryPoints || 0) < nicknameChangeCost) {
                showAlert("단어 정복 포인트(FP)가 부족합니다.<br>닉네임 변경에는 <b>500 FP</b>가 필요합니다.<br><span class='text-yellow-400 font-bold'>현재 FP: " + (gameState.masteryPoints || 0) + "</span>", "💰", "FP 부족");
                return;
            }
            showInputModal({
                icon: "✏️",
                title: "영웅 닉네임 변경",
                // 자동 생성된 첫 별명은 학생이 원하는 닉네임으로 무료 교체할 수 있습니다.
                message: "새로운 <b>영웅 닉네임</b>을 입력하세요.<br><span class='text-red-400 text-[10px]'>⚠️ 기존 이름으로 재접속 불가</span><br><span class='text-yellow-400 text-[10px]'>" + (isFirstNicknameChange ? "첫 변경 무료" : "비용: 500 FP 소모") + "</span>",
                inputType: "text",
                inputPlaceholder: "새 닉네임 입력",
                confirmLabel: "✏️ 변경하기",
                cancelLabel: "취소",
                onConfirm: (newName) => {
                    if (!newName || newName.trim() === "") return;
                    if (newName.trim() === tempCredentials.name) { showAlert("현재 이름과 동일합니다.", "⚠️", "변경 불필요"); return; }
                    if (newName.trim() === "방문자" || newName.includes(" ")) { showAlert("사용할 수 없는 닉네임입니다.<br>(공백 포함 불가)", "⚠️", "사용 불가"); return; }
                    showConfirm(
                        "[" + newName.trim() + "] 으로 변경하시겠습니까?<br><span class='text-red-400'>" + (isFirstNicknameChange ? "첫 닉네임 변경은 무료입니다." : "500 FP 소모 후 게임이 재시작됩니다.") + "</span>",
                        async () => {
                            try {
                                const oldUid = currentUid;
                                const newUid = getUid(tempCredentials.schoolName, tempCredentials.grade, tempCredentials.classNum, tempCredentials.studentNum, newName.trim());
                                const newDocSnap = await window._fbGetDoc(window._fbDoc(window._fbDb, "users", newUid));
                                if (newDocSnap.exists()) { showAlert("이미 존재하는 닉네임입니다.", "⚠️", "중복 닉네임"); return; }
                                const oldDocSnap = await window._fbGetDoc(window._fbDoc(window._fbDb, "users", oldUid));
                                if (!oldDocSnap.exists()) { showAlert("기존 계정 데이터를 찾을 수 없습니다.", "❌", "오류"); return; }
                                const oldData = oldDocSnap.data();
                                oldData.name = newName.trim();
                                oldData.uid = newUid;
                                oldData.masteryPoints = Math.max(0, (oldData.masteryPoints || 0) - nicknameChangeCost);
                                oldData.freeNicknameChangeUsed = true;
                                oldData.nicknameChangeCount = (oldData.nicknameChangeCount || 0) + 1;
                                await window._fbSetDoc(window._fbDoc(window._fbDb, "users", newUid), oldData, { merge: true });
                                await window._fbDeleteDoc(window._fbDoc(window._fbDb, "users", oldUid));
                                sessionStorage.removeItem("vocahero_active_session");
                                const last = { schoolName: oldData.schoolName, grade: oldData.grade, classNum: oldData.classNum, studentNum: oldData.studentNum, name: oldData.name, password: oldData.password };
                                localStorage.setItem("vocahero_last_student", JSON.stringify(last));
                                localStorage.setItem("vocahero_active_session", JSON.stringify(last));
                                gameState.name = newName.trim();
                                gameState.uid = newUid;
                                showAlert("닉네임이 성공적으로 변경되었습니다.<br>다시 로그인합니다.", "✅", "변경 완료", () => { location.reload(); });
                            } catch(e) {
                                console.error(e);
                                showAlert("닉네임 변경 중 오류가 발생했습니다.", "❌", "변경 실패");
                            }
                        },
                        null,
                        { icon: "⚠️", title: "닉네임 변경 확인", yesLabel: "✅ 변경", noLabel: "🔙 취소" }
                    );
                }
            });
        };


        function showInputModal({ icon, title, message, inputType, inputPlaceholder, inputMaxLength, confirmLabel, cancelLabel, confirmFirst = false, onConfirm }) {
            const existingOverlay = document.getElementById('inputModalOverlay');
            if (existingOverlay) existingOverlay.remove();

            const overlay = document.createElement('div');
            overlay.id = 'inputModalOverlay';
            overlay.className = 'fixed inset-0 bg-black/80 z-[99999] flex items-center justify-center p-4';
            overlay.innerHTML = `
                <div class="bg-[#0a0a0c] border border-yellow-500/50 max-w-sm w-full p-5 shadow-[0_0_30px_rgba(234,179,8,0.2)] text-white">
                    <div class="flex items-center gap-2 mb-3 border-b border-gray-800 pb-2">
                        <span class="text-2xl">${icon}</span>
                        <h3 class="font-extrabold text-yellow-400 text-sm">${title}</h3>
                    </div>
                    <p class="text-gray-300 text-xs mb-3 leading-relaxed">${message}</p>
                    <input id="inputModalValue" type="${inputType || 'text'}" placeholder="${inputPlaceholder || ''}" ${inputMaxLength ? 'maxlength="' + inputMaxLength + '"' : ''}
                        class="w-full bg-gray-900 border border-gray-700 text-white text-sm px-3 py-2 mb-4 outline-none focus:border-yellow-500 transition  tracking-widest"
                    />
                    <div class="flex gap-2">
                        <button id="inputModalCancel" class="flex-1 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 font-bold text-xs transition">${cancelLabel || '취소'}</button>
                        <button id="inputModalConfirm" class="flex-1 py-2 bg-yellow-600 hover:bg-yellow-500 text-black font-extrabold text-xs transition">${confirmLabel || '확인'}</button>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);
            if (confirmFirst) { const cancel = document.getElementById('inputModalCancel'), confirm = document.getElementById('inputModalConfirm'); if (cancel && confirm) cancel.parentElement.insertBefore(confirm, cancel); }
            setTimeout(() => { const el = document.getElementById('inputModalValue'); if (el) el.focus(); }, 100);

            document.getElementById('inputModalCancel').onclick = () => overlay.remove();
            document.getElementById('inputModalConfirm').onclick = () => {
                const val = document.getElementById('inputModalValue').value;
                overlay.remove();
                if (onConfirm) onConfirm(val);
            };
            document.getElementById('inputModalValue').addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { document.getElementById('inputModalConfirm').click(); }
                if (e.key === 'Escape') { overlay.remove(); }
            });
        }

        function openSettingsModal() {
            updateSoundSettingsUI();
            openModal("settingsModal");
        }

        function toggleMasterMute(isSoundOn) {
            if (!gameState.soundSettings) gameState.soundSettings = {};
            gameState.soundSettings.masterSoundOn = isSoundOn;
            gameState.soundSettings.masterMute = !isSoundOn;
            updateSoundSettingsUI();
            showToast(isSoundOn ? "🔊 전체 효과음 사운드가 활성화되었습니다." : "🔇 전체 사운드가 음소거되었습니다.");
            saveLocalCache();
            saveSessionToCloud(true);
        }

        function toggleSoundSetting(key, isEnabled) {
            if (!gameState.soundSettings) gameState.soundSettings = {};
            gameState.soundSettings[key] = isEnabled;
            updateSoundSettingsUI();
            saveSessionToCloud(true);
        }

        function toggleMasterSound(isEnabled) {
            if (!gameState.soundSettings) gameState.soundSettings = {};
            gameState.soundSettings.masterSoundOn = isEnabled;
            const detailContainer = document.getElementById('detailSoundSettingsContainer');
            if (detailContainer) {
                detailContainer.style.opacity = isEnabled ? '1' : '0.4';
                detailContainer.style.pointerEvents = isEnabled ? 'auto' : 'none';
            }
            updateSoundSettingsUI();
            saveSessionToCloud(true);
        }

        function changeSoundVolume(key, val) {
            if (!gameState.soundSettings) gameState.soundSettings = {};
            const numVal = parseInt(val, 10);
            gameState.soundSettings[key] = numVal;

            if (key === 'masterVolume') {
                const el = document.getElementById("volumeMasterVal");
                if (el) el.innerText = numVal;
            } else if (key === 'volAttack') {
                const el = document.getElementById("volumeAttackVal");
                if (el) el.innerText = numVal;
            } else if (key === 'volQuiz') {
                const el = document.getElementById("volumeQuizVal");
                if (el) el.innerText = numVal;
            } else if (key === 'volLevelup') {
                const el = document.getElementById("volumeLevelupVal");
                if (el) el.innerText = numVal;
            } else if (key === 'volSkill') {
                const el = document.getElementById("volumeSkillVal");
                if (el) el.innerText = numVal;
            }

            // 볼륨 변경 테스트음 살짝 출력 (퀴즈/공격 조절 시)
            if (typeof playSoundEffect === 'function') {
                if (key === 'volAttack') playSoundEffect('click');
                else if (key === 'volQuiz') playSoundEffect('correct');
                else if (key === 'volLevelup') playSoundEffect('reroll');
                else if (key === 'volSkill') playSoundEffect('skill');
            }

            saveSessionToCloud(true);
        }

        // ==========================================
        // DATA SYNC & STORAGE
        // ==========================================
        // ==========================================
        // DATA SYNC & STORAGE (3-Layer Smart Auto-Save System)
        // ==========================================
        function saveLocalCache() {
            if (!gameState.grade || !gameState.name || gameState.name === "방문자") return;
            gameState.lastSaved = Date.now();
            const cacheKey = `vocahero_${gameState.grade}_${gameState.classNum}_${gameState.studentNum}_${gameState.name}`;
            try {
                localStorage.setItem(cacheKey, JSON.stringify(gameState));
            } catch(e) {}
        }

        

        

        let isExiting = false;
        
        // 안드로이드 하드웨어 뒤로가기 버튼 감지 및 저장/종료 팝업 처리
        // URL이 동일하면 브라우저가 pushState를 무시할 수 있으므로, 확실한 히스토리 스택 생성을 위해 해시(#playing)를 추가합니다.
        // load 이벤트를 기다리지 않고 즉시 실행하여 초반 이탈도 방지합니다.
        try {
            history.pushState({ state: 'playing' }, null, location.pathname + location.search + "#playing");
        } catch(e) {}

        window.addEventListener('popstate', (e) => {
            if (isExiting) return; // 이미 종료 중이면 동작 무시
            
            Swal.fire({
                title: '여정을 멈추시겠습니까?',
                html: "현재까지의 업적을 <b>영웅의 영혼</b>에 각인하고 떠납니다.",
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#f59e0b',
                cancelButtonColor: '#4b5563',
                confirmButtonText: '💾 저장하기',
                cancelButtonText: '⚔️ 돌아가기',
                background: '#1a1a1a',
                color: '#fff',
                allowOutsideClick: false
            }).then((result) => {
                if (result.isConfirmed) {
                    isExiting = true;
                    
                    // 모달의 '저장하기' 버튼 클릭 시 User Gesture가 유효하므로 즉시 앱 최소화(홈으로 이동) 가능
                    if (/android/i.test(navigator.userAgent)) {
                        try { window.location.href = "intent:#Intent;action=android.intent.action.MAIN;category=android.intent.category.HOME;end"; } catch(e) {}
                    }
                    
                    // 화면이 내려간 상태(백그라운드)에서 조용히 저장을 마저 수행합니다.
                    saveAndExit(true);
                } else {
                    // 취소 시 다시 뒤로가기를 감지하기 위해 더미 상태 푸시
                    try {
                        history.pushState({ state: 'playing' }, null, location.pathname + location.search + "#playing");
                    } catch(e) {}
                }
            });
        });

        function saveAndExit(fromBackButton = false) {
            if (typeof gameLoopInterval !== 'undefined' && gameLoopInterval) clearInterval(gameLoopInterval);
            isExiting = true;
            saveLocalCache();
            showToast("💾 데이터 저장 중...");
            


            // 저장 완료 후 앱을 완전히 닫는 함수
            // showAlert의 onConfirm 콜백으로 주입 → 사용자가 OK를 누르는 순간 User Gesture 유효 상태에서 즉시 종료
            const exitNow = () => {
                if (fromBackButton && /android/i.test(navigator.userAgent)) return; // 이미 홈으로 나간 경우
                
                // 1. 즉시 창 닫기 시도 (PC 웹 브라우저 등에서 사용자 제스처로 인정받으려면 동기적으로 실행해야 함)
                try {
                    window.open('', '_self').close();
                    window.close();
                } catch(e) {}
                
                // 2. 안드로이드 환경: 홈 화면으로 즉시 이동 (일반 앱처럼 꺼짐)
                if (/android/i.test(navigator.userAgent)) {
                    try { 
                        window.location.href = "intent:#Intent;action=android.intent.action.MAIN;category=android.intent.category.HOME;end"; 
                    } catch(e) {}
                }
                
                // 3. 최후의 수단: 창 닫기가 무시되는 환경을 위한 풀스크린 안내 (PC 포함 모든 기기)
                setTimeout(() => {
                    let msg = /android|iphone|ipad|ipod/i.test(navigator.userAgent) 
                        ? "(뒤로가기를 두 번 누르거나 폰의 홈 버튼을 눌러주세요)" 
                        : "(열려있는 브라우저 탭을 직접 닫아주세요)";
                    let screen = document.getElementById("safeExitScreen");
                    if (!screen) {
                        screen = document.createElement("div");
                        screen.id = "safeExitScreen";
                        screen.style.cssText = "position:fixed;inset:0;z-index:99999;display:flex;justify-content:center;align-items:center;min-height:100dvh;background:#000;color:#fff;font-size:24px;text-align:center;font-weight:bold;flex-direction:column;padding:20px;line-height:1.5;";
                        document.body.appendChild(screen);
                    }
                    screen.innerHTML = `영웅의 영혼석에 기록이<br>안전하게 각인되었습니다!<br><br>이제 게임을 종료하셔도 됩니다.<br><br><span style="font-size:14px;color:#888;">${msg}</span>`;
                }, 500);
            };

            const doExit = () => {
                if (fromBackButton && /android/i.test(navigator.userAgent)) {
                    // 뒤로가기 버튼 경로: 이미 저장하기 버튼(User Gesture) 클릭 시 홈으로 나갔으므로 추가 조치 불필요
                    return;
                }
                // 저장 완료 팝업 표시 → 확인 버튼 클릭 시 exitNow() 즉시 실행
                showAlert("영웅의 영혼에 기록이 각인되었습니다!\n확인을 누르면 앱이 종료됩니다.", "💾", "기록 각인 완료", exitNow);
            };


                if (window._fbDb && window._fbDoc && window._fbSetDoc
                    && gameState.name && gameState.name !== "방문자"
                    && gameState.schoolName && gameState.schoolName !== 'Unknown') {
                const uid = getUid(gameState.schoolName, gameState.grade, gameState.classNum, gameState.studentNum, gameState.name);
                gameState.lastSaved = Date.now();
                window._fbSetDoc(window._fbDoc(window._fbDb, "users", uid), gameState, { merge: true })
                    .then(() => doExit())
                    .catch((e) => { console.error(e); doExit(); });
            } else {
                setTimeout(() => { doExit(); }, 800);
            }
        }

        function openRetireModal() {
            const input = document.getElementById("retireConfirmInput");
            const btn = document.getElementById("retireSubmitBtn");
            if (input) input.value = "";
            if (btn) {
                btn.disabled = true;
                btn.className = "flex-1 py-2.5 px-4 bg-red-950 text-gray-600 font-extrabold text-xs rounded transition opacity-50 cursor-not-allowed border border-red-900";
            }
            const overlay = document.getElementById("retireModalOverlay");
            if (overlay) {
                overlay.style.zIndex = "999999";
                overlay.style.display = "flex";
            }
        }

        function closeRetireModal() {
            const overlay = document.getElementById("retireModalOverlay");
            if (overlay) overlay.style.display = "none";
        }

        function validateRetireInput() {
            const input = document.getElementById("retireConfirmInput");
            const btn = document.getElementById("retireSubmitBtn");
            if (!input || !btn) return;
            const val = input.value.trim();
            if (val === "영웅 은퇴") {
                btn.disabled = false;
                btn.className = "flex-1 py-2.5 px-4 bg-gradient-to-r from-red-600 to-red-800 hover:from-red-500 hover:to-red-700 text-white font-extrabold text-xs rounded shadow-lg transition cursor-pointer border border-red-500 animate-pulse";
            } else {
                btn.disabled = true;
                btn.className = "flex-1 py-2.5 px-4 bg-red-950 text-gray-600 font-extrabold text-xs rounded transition opacity-50 cursor-not-allowed border border-red-900";
            }
        }

                async function executeFullRetireDataDeletion() {
            closeRetireModal();
            showToast("✨ 영웅이 화려한 명성을 남기고 은퇴를 결심했습니다.");

            // 로컬 캐시 전체 삭제 (vocahero 관련 모든 키)
            // 모든 vocahero 관련 로컬 캐시 완전 삭제
            const allKeys = [];
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k) allKeys.push(k);
            }
            allKeys.forEach(k => localStorage.removeItem(k));
            sessionStorage.clear();

            const doReload = () => {
                showToast("✨ 영웅의 영혼이 안식처로 떠납니다...");
                gameState.name = "방문자"; // 새로고침 시 beforeunload가 데이터를 부활시키는 것 방지
                setTimeout(() => { try { window.close(); } catch(e) {} setTimeout(() => location.reload(), 100); }, 1500);
            };

            if (!window._fbDb || !window._fbDoc || !window._fbDeleteDoc || gameState.name === "방문자") {
                doReload();
                return;
            }

            // 1. Firebase Firestore에서 유저 문서 삭제
            const uid = tempCredentials && tempCredentials.uid ? tempCredentials.uid : `${gameState.schoolName || 'Unknown'}_${gameState.grade}_${gameState.classNum}_${gameState.studentNum}_${gameState.name}`;
            console.log('[Retire] Deleting Firestore doc:', 'users/' + uid);
            try {
                await window._fbDeleteDoc(window._fbDoc(window._fbDb, "users", uid));
                console.log('[Retire] Firestore doc deleted successfully.');
            } catch (err) {
                console.error('[Retire] Firestore delete failed:', err.code, err.message);
                // Even if Firestore fails, we try to continue with reload
            }

            doReload();
        }

        function resetFullSession() {
            openRetireModal();
        }

        // ⏱️ 3분 주기 자동 동기화: 진행 손실을 제한하면서 서버 함수 호출량을 줄인다.
        setInterval(() => {
            // 백그라운드에서는 이탈 순간의 저장 시각을 유지해야 오프라인 시간이 줄어들지 않는다.
            if (document.visibilityState === "visible" && gameState.name && gameState.name !== "방문자") {
                saveSessionToCloud(true);
            }
        }, 180000);

        // 🚨 창 닫기 / 탭 이탈 시 이탈 감지 무실시간 즉시 저장 처리
        window.addEventListener("beforeunload", function () {
            saveLocalCache();
            if (gameState.name && gameState.name !== "방문자") {
                saveSessionToCloud(true);
            }
        });

        document.addEventListener("visibilitychange", function () {
            if (document.visibilityState === "hidden") {
                saveLocalCache();
                if (gameState.name && gameState.name !== "방문자") {
                    saveSessionToCloud(true);
                }
            }
        });

        function switchTab(tabId) {
            if (!gameState.tutorialCompleted && tutorialStep === 2 && tabId === 'gearTab') {
                tutorialStep = 3;
                setTimeout(showTutorialOverlay, 300);
            }
            if (!gameState.tutorialCompleted && tutorialStep === 4 && tabId === 'petTab') {
                tutorialStep = 5;
                setTimeout(showTutorialOverlay, 300);
            }
            if (!gameState.tutorialCompleted && tutorialStep === 6 && tabId === 'skillTab') {
                tutorialStep = 7;
                setTimeout(showTutorialOverlay, 300);
            }
            if (!gameState.tutorialCompleted && tutorialStep === 8 && tabId === 'worldBossTab') {
                tutorialStep = 9;
                setTimeout(showTutorialOverlay, 300);
            }
            if (!gameState.tutorialCompleted && tutorialStep === 9 && tabId === 'hallOfFameTab') {
                tutorialStep = 10;
                setTimeout(showTutorialOverlay, 300);
            }
            if (!gameState.tutorialCompleted && tutorialStep === 10 && tabId === 'statsTab') {
                tutorialStep = 11;
                setTimeout(showTutorialOverlay, 300);
            }
            const leftPanel = document.getElementById("leftRpgPanel");
            const rightPanel = document.getElementById("rightMainPanel");

            if (tabId === 'worldBossTab' || tabId === 'hallOfFameTab' || tabId === 'statsTab') {
                if (leftPanel) leftPanel.classList.add("hidden");
                if (rightPanel) {
                    rightPanel.classList.remove("md:col-span-7", "lg:col-span-8");
                    rightPanel.classList.add("md:col-span-12", "lg:col-span-12");
                }
            } else {
                if (leftPanel) leftPanel.classList.remove("hidden");
                if (rightPanel) {
                    rightPanel.classList.remove("md:col-span-12", "lg:col-span-12");
                    rightPanel.classList.add("md:col-span-7", "lg:col-span-8");
                }
            }

            // 모든 탭 강제 숨김 (display도 none으로)
            const allTabs = ["quizTab", "gearTab", "petTab", "skillTab", "worldBossTab", "hallOfFameTab", "statsTab"];
            allTabs.forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    el.classList.add("hidden");
                    el.style.display = "none";
                }
            });

            const activeEl = document.getElementById(tabId);
            if (activeEl) {
                activeEl.classList.remove("hidden");
                activeEl.style.display = "flex";
            }

            // 저장/은퇴 버튼은 statsTab에서만 노출
            const statsActions = document.getElementById("statsActionButtons");
            if (statsActions) {
                if (tabId === 'statsTab') {
                    statsActions.classList.remove("hidden");
                    statsActions.style.display = "flex";
                } else {
                    statsActions.classList.add("hidden");
                    statsActions.style.display = "none";
                }
            }

            const tabButtons = ["quizTabBtn", "gearTabBtn", "petTabBtn", "skillTabBtn", "worldBossTabBtn", "hallOfFameTabBtn", "statsTabBtn"];
            tabButtons.forEach(btnId => {
                const btn = document.getElementById(btnId);
                if (btn) {
                    btn.className = "py-2.5 text-center font-bold text-xs uppercase tracking-widest text-[#7e7e7e] hover:text-white rounded-none-forced flex items-center justify-center gap-1 transition";
                }
            });

            const activeBtn = document.getElementById(`${tabId}Btn`);
            if (activeBtn) {
                activeBtn.className = "py-2.5 text-center font-bold text-xs uppercase tracking-widest text-black bg-white rounded-none-forced flex items-center justify-center gap-1";
            }

            if (tabId === 'skillTab') {
                buildSkillTabUI();
            } else if (tabId === 'worldBossTab') {
                updateWorldBossUI();
            } else if (tabId === 'hallOfFameTab') {
                fetchHallOfFameUI();
                renderTitleInventoryUI();
            } else if (tabId === 'gearTab') {
                buildUpgradeblacksmith();
                renderGearPotentialLabUI();
                renderAccessoriesAndRelicsUI();
            } else if (tabId === 'petTab') {
                // 펫/유물 탭 진입 시 즉시 렌더링 (탭 전환 없이도 바로 보이도록)
                if (typeof buildCompanionPetLab === 'function') buildCompanionPetLab();
                if (typeof renderRelicsUI === 'function') renderRelicsUI();
                const tokenEl = document.getElementById('bossTokenCountText');
                if (tokenEl) tokenEl.innerText = (gameState.bossTokens || 0);
            } else if (tabId === 'statsTab') {
                refreshStateVisuals();
                populateMasteredVocabulary();
            }
        }

        // ==========================================
        // HALL OF FAME RANKING SYSTEM (명예의 전장)
        // ==========================================
        function fetchHallOfFameUI() {
            if (window._secureHallOfFame) {
                window._secureHallOfFame();
                return;
            }
            const studentKey = `${gameState.grade}_${gameState.classNum}_${gameState.studentNum}_${gameState.name}`;

            // UI 로딩 상태
            ['hofStageList','hofBossList','hofGoldList'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.innerHTML = '<p class="text-gray-500 text-center py-4 animate-pulse">랭킹 불러오는 중...</p>';
            });

            if (!window._fbReady || !window._fbDb) {
                ['hofStageList','hofBossList','hofGoldList'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.innerHTML = '<p class="text-gray-500 text-center py-4">오프라인 상태입니다.</p>';
                });
                return;
            }

            const getTitleBadgeHtml = (item) => {
                let titleName = item.equippedTitle;
                if ((!titleName || titleName.trim() === "") && item.key === studentKey) {
                    titleName = gameState.equippedTitle || "";
                }
                if (!titleName || titleName.trim() === "") return "";
                const titleDef = AVAILABLE_TITLES.find(t => t.name === titleName || t.id === titleName);
                let badgeClass = "text-amber-300 bg-amber-950/90 border-amber-600";
                if (titleDef) {
                    if (titleDef.tier === "신화") badgeClass = "text-yellow-300 bg-amber-950/90 border-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]";
                    else if (titleDef.tier === "전설") badgeClass = "text-red-300 bg-red-950/90 border-red-600 shadow-[0_0_6px_rgba(220,38,38,0.5)]";
                    else if (titleDef.tier === "영웅") badgeClass = "text-purple-300 bg-purple-950/90 border-purple-600";
                    else if (titleDef.tier === "희귀") badgeClass = "text-sky-300 bg-sky-950/90 border-sky-600";
                    else badgeClass = "text-gray-300 bg-gray-900 border-gray-700";
                }
                return `<span class="text-[8.5px] font-bold px-1 py-0.2 border shrink-0 mr-0.5 whitespace-nowrap rounded-none-forced ${badgeClass}">[${titleName}]</span>`;
            };

            // Firestore에서 학년 내 전체 유저 데이터 조회 + 월드보스 데미지 병합
            const grade = gameState.grade;
            const curWeek = getCurrentWeekNum();
            Promise.all([
                window._fbGetDocs ? window._fbGetDocs(window._fbCollection(window._fbDb, "users")) : null,
                window._fbGetDoc ? window._fbGetDoc(window._fbDoc(window._fbDb, "world_bosses", `global_week_${curWeek}`)) : null
            ]).then(([snapshot, bossSnap]) => {
                if (!snapshot) {
                    ['hofStageList','hofBossList','hofGoldList'].forEach(id => {
                        const el = document.getElementById(id);
                        if (el) el.innerHTML = '<p class="text-gray-500 text-center py-4">랭킹을 불러오지 못했어요.</p>';
                    });
                    return;
                }
                
                let curWeekDamages = {};
                if (bossSnap && bossSnap.exists()) {
                    curWeekDamages = bossSnap.data().damages || {};
                }

                const users = [];
                snapshot.forEach(doc => {
                    const d = doc.data();
                    if (d.name && d.name !== "방문자" && d.schoolName && d.schoolName !== 'Unknown') {
                        const key = `${d.grade}_${d.classNum}_${d.studentNum}_${d.name}`;
                        // 월드보스 데미지를 world_bosses 컬렉션 기준으로 덮어쓰기 (가장 정확한 랭킹용)
                        d.wbBestDamage = curWeekDamages[key] || 0;
                        d.wbBestDamageWeek = d.wbBestDamage > 0 ? curWeek : 0;
                        users.push({ ...d, key });
                    }
                });

                // 스테이지 랭킹
                const stageRanked = [...users].sort((a,b) => (b.stage||1)-(a.stage||1) || (b.progress||0)-(a.progress||0));
                const myStageRank = stageRanked.findIndex(u => u.key === studentKey) + 1;
                document.getElementById("myStageRankText").innerText = myStageRank ? `${myStageRank}위` : "-위";
                const stageTop5 = stageRanked.slice(0, 100);
                document.getElementById("hofStageList").innerHTML = stageTop5.length > 0
                    ? stageTop5.map((item, idx) => {
                        const medal = ["🥇","🥈","🥉"][idx] || `${idx+1}.`;
                        return `<div class="flex justify-between items-center py-1 border-b border-[#1c1c1c] text-xs min-w-0 gap-1"><div class="flex items-center min-w-0 truncate gap-0.5 text-[10.5px]"><span class="shrink-0 mr-0.5 font-bold">${medal}</span><span class="text-gray-400 text-[9px] shrink-0 mr-0.5 whitespace-nowrap">[${(item.schoolName || '하주초').replace(/(초|중|고)등학교$/, '$1')} ${item.grade || 5}학년]</span>${getTitleBadgeHtml(item)}<span class="text-white font-bold truncate shrink">${item.name}</span></div><span class="text-sky-400 font-extrabold shrink-0 whitespace-nowrap ml-1 text-right text-[10.5px]">Stage ${item.stage||1}-${(item.progress||0)+1}</span></div>`;
                    }).join('')
                    : '<p class="text-gray-500 text-center py-4">기록 없음</p>';

                // 월드보스 랭킹
                const bossRanked = [...users].sort((a,b) => {
                    const aDmg = (a.wbBestDamageWeek === curWeek) ? (a.wbBestDamage || 0) : 0;
                    const bDmg = (b.wbBestDamageWeek === curWeek) ? (b.wbBestDamage || 0) : 0;
                    return bDmg - aDmg;
                });
                const myBossRank = bossRanked.findIndex(u => u.key === studentKey) + 1;
                document.getElementById("myBossRankText").innerText = (myBossRank && bossRanked[myBossRank-1].wbBestDamageWeek === curWeek && bossRanked[myBossRank-1].wbBestDamage > 0) ? `${myBossRank}위` : "-위";
                const bossTop5 = bossRanked.slice(0, 100).filter(u => u.wbBestDamageWeek === curWeek && (u.wbBestDamage||0) > 0);
                document.getElementById("hofBossList").innerHTML = bossTop5.length > 0
                    ? bossTop5.map((item, idx) => {
                        const medal = ["🥇","🥈","🥉"][idx] || `${idx+1}.`;
                        return `<div class="flex justify-between items-center py-1 border-b border-[#1c1c1c] text-xs min-w-0 gap-1"><div class="flex items-center min-w-0 truncate gap-0.5 text-[10.5px]"><span class="shrink-0 mr-0.5 font-bold">${medal}</span><span class="text-gray-400 text-[9px] shrink-0 mr-0.5 whitespace-nowrap">[${(item.schoolName || '하주초').replace(/(초|중|고)등학교$/, '$1')} ${item.grade || 5}학년]</span>${getTitleBadgeHtml(item)}<span class="text-white font-bold truncate shrink">${item.name}</span></div><span class="text-red-400 font-extrabold shrink-0 whitespace-nowrap ml-1 text-right text-[10.5px]">${(item.wbBestDamage||0).toLocaleString()} DMG</span></div>`;
                    }).join('')
                    : '<p class="text-gray-500 text-center py-4">기록 없음</p>';

                // 골드 랭킹
                const goldRanked = [...users].sort((a,b) => (b.accGold||b.gold||0)-(a.accGold||a.gold||0));
                const myGoldRank = goldRanked.findIndex(u => u.key === studentKey) + 1;
                document.getElementById("myGoldRankText").innerText = myGoldRank ? `${myGoldRank}위` : "-위";
                const goldTop5 = goldRanked.slice(0, 100).filter(u => (u.accGold||u.gold||0) > 0);
                document.getElementById("hofGoldList").innerHTML = goldTop5.length > 0
                    ? goldTop5.map((item, idx) => {
                        const medal = ["🥇","🥈","🥉"][idx] || `${idx+1}.`;
                        return `<div class="flex justify-between items-center py-1 border-b border-[#1c1c1c] text-xs min-w-0 gap-1"><div class="flex items-center min-w-0 truncate gap-0.5 text-[10.5px]"><span class="shrink-0 mr-0.5 font-bold">${medal}</span><span class="text-gray-400 text-[9px] shrink-0 mr-0.5 whitespace-nowrap">[${(item.schoolName || '하주초').replace(/(초|중|고)등학교$/, '$1')} ${item.grade || 5}학년]</span>${getTitleBadgeHtml(item)}<span class="text-white font-bold truncate shrink">${item.name}</span></div><span class="text-yellow-400 font-extrabold shrink-0 whitespace-nowrap ml-1 text-right text-[10.5px]">${(item.accGold||item.gold||0).toLocaleString()} G</span></div>`;
                    }).join('')
                    : '<p class="text-gray-500 text-center py-4">기록 없음</p>';

                cachedHofData = { myStageRank, myBossRank, myGoldRank };
            }).catch(err => {
                console.error("[HoF] Firestore query error:", err);
                ['hofStageList','hofBossList','hofGoldList'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.innerHTML = '<p class="text-gray-500 text-center py-4">랭킹 로드 실패</p>';
                });
            });
        }

        // ==========================================
        // TITLE EQUIPMENT SYSTEM (칭호 등급 체계: 신화/전설/영웅/희귀/일반)
        // ==========================================
        const AVAILABLE_TITLES = [
            // ========================================
            // 🌟 [신화 등급 - Mythic] — 최상위 랭커 전용
            // ========================================
            { id: "수호신", name: "수호신", tier: "신화", desc: "월드보스 완전 격퇴 및 기여도 1위 (주간 결산 시 수여)", condition: (gs) => (gs.unlockedTitles || []).includes("수호신") || gs.wbTitle === "수호신", style: "mythic-aurora-card border-[#f59e0b] text-yellow-300 shadow-[0_0_15px_rgba(245,158,11,0.8)]" },
            { id: "정복왕", name: "정복왕", tier: "신화", desc: "스테이지 정복 랭킹 전체 1위", condition: (gs, res) => res?.myStageRank === 1 && ((gs.stage||1)>1 || (gs.progress||0)>0), style: "mythic-aurora-card border-[#3b82f6] text-sky-300 shadow-[0_0_15px_rgba(59,130,246,0.8)]" },
            { id: "황금 거상", name: "황금 거상", tier: "신화", desc: "누적 100,000,000(1억) 골드 이상 보유", condition: (gs) => (gs.gold || 0) >= 100000000, style: "mythic-aurora-card border-[#eab308] text-yellow-200 shadow-[0_0_15px_rgba(234,179,8,0.8)]" },
            { id: "단어의 신", name: "단어의 신", tier: "신화", desc: "단어 정답 1,000개 이상 누적 달성", condition: (gs) => (gs.totalQuizCorrect || 0) >= 1000, style: "mythic-aurora-card border-[#10b981] text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.8)]" },
            { id: "유물의 신", name: "유물의 신", tier: "신화", desc: "고대 유물 10종 수집 및 모두 6성(MAX) 돌파", condition: (gs) => (gs.acquiredRelics || []).filter(r => (r.stars||0) >= 6).length >= 10, style: "mythic-aurora-card border-[#8b5cf6] text-violet-300 shadow-[0_0_15px_rgba(139,92,246,0.8)]" },
            { id: "드래곤 로드", name: "드래곤 로드", tier: "신화", desc: "드래곤 펫 만렙(Lv.100) 달성", condition: (gs) => (gs.petLevels?.dragon || 0) >= 100, style: "mythic-aurora-card border-[#ef4444] text-red-300 shadow-[0_0_15px_rgba(239,68,68,0.8)]" },
            { id: "정령의 지배자", name: "정령의 지배자", tier: "신화", desc: "펫 3종(슬라임, 드래곤, 페어리) 모두 Lv.50 이상", condition: (gs) => { const p = gs.petLevels || {}; return (p.slime||0)>=50 && (p.dragon||0)>=50 && (p.fairy||0)>=50; }, style: "mythic-aurora-card border-[#ec4899] text-pink-300 shadow-[0_0_15px_rgba(236,72,153,0.8)]" },
            { id: "절대 반지 보유자", name: "절대 반지 보유자", tier: "신화", desc: "장신구 '반지' 만렙(Lv.100) 달성", condition: (gs) => (gs.ringLvl || 0) >= 100, style: "mythic-aurora-card border-[#f59e0b] text-yellow-300 shadow-[0_0_15px_rgba(245,158,11,0.8)]" },
            { id: "심연의 정복자", name: "심연의 정복자", tier: "신화", desc: "스테이지 100 이상 돌파", condition: (gs) => (gs.stage || 1) >= 100, style: "mythic-aurora-card border-[#3b82f6] text-sky-300 shadow-[0_0_15px_rgba(59,130,246,0.8)]" },
            { id: "대마법사", name: "대마법사", tier: "신화", desc: "신화(Mythic) 등급 스킬 10개 이상 보유", condition: (gs) => (gs.skillsInventory || []).filter(s => s.grade === 'mythic').length >= 10, style: "mythic-aurora-card border-[#8b5cf6] text-violet-300 shadow-[0_0_15px_rgba(139,92,246,0.8)]" },
            { id: "진정한 마스터", name: "진정한 마스터", tier: "신화", desc: "마스터리 포인트 5,000 돌파", condition: (gs) => (gs.masteryPoints || 0) >= 5000, style: "mythic-aurora-card border-[#10b981] text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.8)]" },

            // ========================================
            // 🔥 [전설 등급 - Legendary]
            // ========================================
            { id: "개척자", name: "개척자", tier: "전설", desc: "스테이지 Top 3 이내 진입", condition: (gs, res) => typeof res?.myStageRank === 'number' && res.myStageRank > 0 && res.myStageRank <= 3 && ((gs.stage||1)>1 || (gs.progress||0)>0), style: "border-[#dc2626] bg-gradient-to-r from-[#b91c1c] to-[#7f1d1d] text-[#fca5a5] shadow-[0_0_10px_rgba(220,38,38,0.7)]" },
            { id: "전설의 대장장이", name: "전설의 대장장이", tier: "전설", desc: "모든 무구 50강(MAX) 달성", condition: (gs) => (gs.helmetLvl||1)>=50 && (gs.armorLvl||1)>=50 && (gs.weaponLvl||1)>=50 && (gs.shieldLvl||1)>=50 && (gs.shoesLvl||1)>=50, style: "border-[#d97706] bg-gradient-to-r from-[#b45309] to-[#78350f] text-[#fde68a] shadow-[0_0_10px_rgba(217,119,6,0.7)]" },
            { id: "고고학자", name: "고고학자", tier: "전설", desc: "고대 유물 전종(10종) 수집 및 모두 3성 이상", condition: (gs) => (gs.acquiredRelics || []).length >= 10 && (gs.acquiredRelics || []).every(r => (r.stars||0) >= 3), style: "border-[#059669] bg-gradient-to-r from-[#047857] to-[#064e3b] text-[#a7f3d0] shadow-[0_0_10px_rgba(5,150,105,0.7)]" },
            { id: "잠재력 마스터", name: "잠재력 마스터", tier: "전설", desc: "잠재력 슬롯 30개 모두 해금", condition: (gs) => { let c=0; ["helmet","armor","weapon","shield","shoes"].forEach(k=>c+=(gs.gearPotentials?.[k]||[]).filter(x=>x).length); return c>=30; }, style: "border-[#059669] bg-gradient-to-r from-[#047857] to-[#064e3b] text-[#a7f3d0] shadow-[0_0_10px_rgba(5,150,105,0.7)]" },
            { id: "신화적 마법사", name: "신화적 마법사", tier: "전설", desc: "신화(Mythic) 스킬 5개 이상 보유", condition: (gs) => (gs.skillsInventory || []).filter(s => s.grade === 'mythic').length >= 5, style: "border-[#059669] bg-gradient-to-r from-[#047857] to-[#064e3b] text-[#a7f3d0] shadow-[0_0_10px_rgba(5,150,105,0.7)]" },
            { id: "서고의 현자", name: "서고의 현자", tier: "전설", desc: "정복 단어 500개 이상 기록", condition: (gs) => (gs.masteredWords || []).length >= 500, style: "border-[#6366f1] bg-gradient-to-r from-[#4f46e5] to-[#3730a3] text-[#c7d2fe] shadow-[0_0_10px_rgba(99,102,241,0.7)]" },
            { id: "스테이지 70 정복자", name: "스테이지 70 정복자", tier: "전설", desc: "스테이지 70 이상 돌파", condition: (gs) => (gs.stage || 1) >= 70, style: "border-[#dc2626] bg-gradient-to-r from-[#b91c1c] to-[#7f1d1d] text-[#fca5a5] shadow-[0_0_10px_rgba(220,38,38,0.7)]" },
            { id: "펫 마스터", name: "펫 마스터", tier: "전설", desc: "펫 3종 모두 레벨 30 이상 달성", condition: (gs) => { const p = gs.petLevels || {}; return (p.slime||0)>=30 && (p.dragon||0)>=30 && (p.fairy||0)>=30; }, style: "border-[#be185d] bg-gradient-to-r from-[#9d174d] to-[#831843] text-[#fbcfe8] shadow-[0_0_10px_rgba(190,24,93,0.7)]" },
            { id: "장신구 대가", name: "장신구 대가", tier: "전설", desc: "목걸이, 팔찌, 반지 모두 Lv.30 달성", condition: (gs) => (gs.necklaceLvl||0)>=30 && (gs.braceletLvl||0)>=30 && (gs.ringLvl||0)>=30, style: "border-[#d97706] bg-gradient-to-r from-[#b45309] to-[#78350f] text-[#fde68a] shadow-[0_0_10px_rgba(217,119,6,0.7)]" },
            { id: "유물 발굴단장", name: "유물 발굴단장", tier: "전설", desc: "신화(Mythic) 등급 유물 5종 수집", condition: (gs) => (gs.acquiredRelics || []).filter(r => r.grade === 'mythic').length >= 5, style: "border-[#059669] bg-gradient-to-r from-[#047857] to-[#064e3b] text-[#a7f3d0] shadow-[0_0_10px_rgba(5,150,105,0.7)]" },

            // ========================================
            // 💜 [영웅 등급 - Hero]
            // ========================================
            { id: "토벌 대장", name: "토벌 대장", tier: "영웅", desc: "월드보스 랭킹 Top 5 이내 진입", condition: (gs, res) => typeof res?.myBossRank === 'number' && res.myBossRank > 0 && res.myBossRank <= 5 && (gs.wbBestDamage||0) > 0, style: "border-[#9333ea] bg-gradient-to-r from-[#7e22ce] to-[#581c87] text-[#e9d5ff]" },
            { id: "정복 선봉장", name: "정복 선봉장", tier: "영웅", desc: "스테이지 40 이상 정복 달성", condition: (gs) => (gs.stage || 1) >= 40, style: "border-[#9333ea] bg-gradient-to-r from-[#7e22ce] to-[#581c87] text-[#e9d5ff]" },
            { id: "단어 마스터", name: "단어 마스터", tier: "영웅", desc: "단어 정답 300개 이상 정복", condition: (gs) => (gs.totalQuizCorrect || 0) >= 300, style: "border-[#9333ea] bg-gradient-to-r from-[#7e22ce] to-[#581c87] text-[#e9d5ff]" },
            { id: "완벽주의자", name: "완벽주의자", tier: "영웅", desc: "정복 단어 150개 이상 기록", condition: (gs) => (gs.masteredWords || []).length >= 150, style: "border-[#9333ea] bg-gradient-to-r from-[#7e22ce] to-[#581c87] text-[#e9d5ff]" },
            { id: "검성", name: "검성", tier: "영웅", desc: "무기(수호검) 50강(MAX) 달성", condition: (gs) => (gs.weaponLvl || 1) >= 50, style: "border-[#b91c1c] bg-gradient-to-r from-[#991b1b] to-[#7f1d1d] text-[#fca5a5]" },
            { id: "방어의 탑", name: "방어의 탑", tier: "영웅", desc: "방어구(수호갑옷) 50강(MAX) 달성", condition: (gs) => (gs.armorLvl || 1) >= 50, style: "border-[#0369a1] bg-gradient-to-r from-[#075985] to-[#0c4a6e] text-[#7dd3fc]" },
            { id: "부유한 모험가", name: "부유한 모험가", tier: "영웅", desc: "누적 10,000,000(1천만) 골드 보유", condition: (gs) => (gs.gold || 0) >= 10000000, style: "border-[#d97706] bg-gradient-to-r from-[#b45309] to-[#78350f] text-[#fde68a]" },
            { id: "유물 사냥꾼", name: "유물 사냥꾼", tier: "영웅", desc: "전설(Legendary) 등급 유물 3종 수집", condition: (gs) => (gs.acquiredRelics || []).filter(r => ['legendary', 'mythic'].includes(r.grade)).length >= 3, style: "border-[#9333ea] bg-gradient-to-r from-[#7e22ce] to-[#581c87] text-[#e9d5ff]" },
            { id: "펫의 친구", name: "펫의 친구", tier: "영웅", desc: "펫 1종 이상 레벨 50 달성", condition: (gs) => Object.values(gs.petLevels || {}).some(v => v >= 50), style: "border-[#ec4899] bg-gradient-to-r from-[#db2777] to-[#9d174d] text-[#fbcfe8]" },
            { id: "스킬 수집가", name: "스킬 수집가", tier: "영웅", desc: "보유 스킬 30개 이상 달성", condition: (gs) => (gs.skillsInventory || []).length >= 30, style: "border-[#9333ea] bg-gradient-to-r from-[#7e22ce] to-[#581c87] text-[#e9d5ff]" },
            { id: "영웅 전사", name: "영웅 전사", tier: "영웅", desc: "영웅(Hero) 등급 이상 스킬 10개 보유", condition: (gs) => (gs.skillsInventory || []).filter(s => ['hero','legendary','mythic'].includes(s.grade)).length >= 10, style: "border-[#9333ea] bg-gradient-to-r from-[#7e22ce] to-[#581c87] text-[#e9d5ff]" },
            { id: "마스터리 포인트 부자", name: "마스터리 포인트 부자", tier: "영웅", desc: "마스터리 포인트 2,000 이상 보유", condition: (gs) => (gs.masteryPoints || 0) >= 2000, style: "border-[#6366f1] bg-gradient-to-r from-[#4f46e5] to-[#3730a3] text-[#c7d2fe]" },
            { id: "보석 세공사", name: "보석 세공사", tier: "영웅", desc: "장신구(목걸이/팔찌/반지) 중 하나 Lv.30 달성", condition: (gs) => (gs.necklaceLvl||0)>=30 || (gs.braceletLvl||0)>=30 || (gs.ringLvl||0)>=30, style: "border-[#d97706] bg-gradient-to-r from-[#b45309] to-[#78350f] text-[#fde68a]" },

            // ========================================
            // 🔷 [희귀 등급 - Rare]
            // ========================================
            { id: "수호자", name: "수호자", tier: "희귀", desc: "스테이지 20 이상 정복 달성", condition: (gs) => (gs.stage || 1) >= 20, style: "border-[#0284c7] bg-gradient-to-r from-[#0369a1] to-[#0c4a6e] text-[#7dd3fc]" },
            { id: "단어의 지배자", name: "단어의 지배자", tier: "희귀", desc: "단어 정답 150개 이상 정복", condition: (gs) => (gs.totalQuizCorrect || 0) >= 150, style: "border-[#0284c7] bg-gradient-to-r from-[#0369a1] to-[#0c4a6e] text-[#7dd3fc]" },
            { id: "자산가", name: "자산가", tier: "희귀", desc: "누적 1,000,000(100만) 골드 이상 보유", condition: (gs) => (gs.gold || 0) >= 1000000, style: "border-[#0284c7] bg-gradient-to-r from-[#0369a1] to-[#0c4a6e] text-[#7dd3fc]" },
            { id: "칠전팔기", name: "칠전팔기", tier: "희귀", desc: "치열한 도전의 흔적 (오답 300회 극복)", condition: (gs) => ((gs.totalQuizTries || 0) - (gs.totalQuizCorrect || 0)) >= 300, style: "border-[#ea580c] bg-gradient-to-r from-[#c2410c] to-[#9a3412] text-[#fdba74]" },
            { id: "유물 탐험가", name: "유물 탐험가", tier: "희귀", desc: "희귀(Rare) 등급 유물 2종 이상 수집", condition: (gs) => (gs.acquiredRelics || []).filter(r => ['rare','epic','legendary','mythic'].includes(r.grade)).length >= 2, style: "border-[#0284c7] bg-gradient-to-r from-[#0369a1] to-[#0c4a6e] text-[#7dd3fc]" },
            { id: "스테이지 30 돌파자", name: "스테이지 30 돌파자", tier: "희귀", desc: "스테이지 30 이상 달성", condition: (gs) => (gs.stage || 1) >= 30, style: "border-[#0284c7] bg-gradient-to-r from-[#0369a1] to-[#0c4a6e] text-[#7dd3fc]" },
            { id: "두뇌파 학자", name: "두뇌파 학자", tier: "희귀", desc: "정답률 85% 이상 & 퀴즈 100회 이상", condition: (gs) => (gs.totalQuizTries||0) >= 100 && ((gs.totalQuizCorrect||0)/(gs.totalQuizTries||1)) >= 0.85, style: "border-[#6366f1] bg-gradient-to-r from-[#4f46e5] to-[#3730a3] text-[#c7d2fe]" },
            { id: "펫 보호자", name: "펫 보호자", tier: "희귀", desc: "펫 1종 이상 레벨 20 이상 달성", condition: (gs) => Object.values(gs.petLevels || {}).some(v => v >= 20), style: "border-[#ec4899] bg-gradient-to-r from-[#db2777] to-[#9d174d] text-[#fbcfe8]" },
            { id: "강화 매니아", name: "강화 매니아", tier: "희귀", desc: "아이템 총 강화 레벨 합계 150 이상", condition: (gs) => ((gs.helmetLvl||1)+(gs.armorLvl||1)+(gs.weaponLvl||1)+(gs.shieldLvl||1)+(gs.shoesLvl||1)) >= 150, style: "border-[#ea580c] bg-gradient-to-r from-[#c2410c] to-[#9a3412] text-[#fdba74]" },
            { id: "마스터리 연구자", name: "마스터리 연구자", tier: "희귀", desc: "마스터리 포인트 800 이상 보유", condition: (gs) => (gs.masteryPoints || 0) >= 800, style: "border-[#6366f1] bg-gradient-to-r from-[#4f46e5] to-[#3730a3] text-[#c7d2fe]" },

            // ========================================
            // ⚪ [일반 등급 - Normal]
            // ========================================
            { id: "견습 모험가", name: "견습 모험가", tier: "일반", desc: "기본 지급 칭호", condition: () => true, style: "border-[#4b5563] bg-[#111827] text-gray-300" },
            { id: "단어 수련생", name: "단어 수련생", tier: "일반", desc: "단어 정답 30개 이상 정복", condition: (gs) => (gs.totalQuizCorrect || 0) >= 30, style: "border-[#4b5563] bg-[#111827] text-gray-300" },
            { id: "첫 발걸음", name: "첫 발걸음", tier: "일반", desc: "스테이지 5 이상 달성", condition: (gs) => (gs.stage || 1) >= 5, style: "border-[#4b5563] bg-[#111827] text-gray-300" },
            { id: "동전 수집가", name: "동전 수집가", tier: "일반", desc: "골드 10,000 이상 보유", condition: (gs) => (gs.gold || 0) >= 10000, style: "border-[#4b5563] bg-[#111827] text-gray-300" },
            { id: "퀴즈 도전자", name: "퀴즈 도전자", tier: "일반", desc: "퀴즈 10회 이상 도전", condition: (gs) => (gs.totalQuizTries || 0) >= 10, style: "border-[#4b5563] bg-[#111827] text-gray-300" },
            { id: "스킬 입문자", name: "스킬 입문자", tier: "일반", desc: "스킬 1개 이상 보유", condition: (gs) => (gs.skillsInventory || []).length >= 1, style: "border-[#4b5563] bg-[#111827] text-gray-300" },
            { id: "첫 펫 조련사", name: "첫 펫 조련사", tier: "일반", desc: "펫 1종 이상 레벨 1 달성", condition: (gs) => Object.values(gs.petLevels || {}).some(v => v >= 1), style: "border-[#4b5563] bg-[#111827] text-gray-300" },
            { id: "유물 입문자", name: "유물 입문자", tier: "일반", desc: "고대 유물 1개 이상 수집", condition: (gs) => (gs.acquiredRelics || []).length >= 1, style: "border-[#4b5563] bg-[#111827] text-gray-300" }
        ];

        function getTitlePresentation(titleName) {
            const normalized = String(titleName || "").trim();
            const definition = AVAILABLE_TITLES.find(title => title.id === normalized || title.name === normalized);
            return {
                name: definition?.name || normalized,
                tier: definition?.tier || "",
                style: definition?.style || "border-[#d97706] bg-[#1a1a1a] text-yellow-300 shadow-[0_0_8px_rgba(251,191,36,0.6)]"
            };
        }
        window.getHeroTitlePresentation = getTitlePresentation;

        let cachedHofData = null;

        function renderTitleInventoryUI() {
            const container = document.getElementById("titleInventoryContainer");
            const equippedText = document.getElementById("currentEquippedTitleText");
            if (!container) return;

            if (equippedText) {
                const currentTitle = getTitlePresentation(gameState.equippedTitle);
                equippedText.innerText = gameState.equippedTitle ? `[${currentTitle.name}]` : "[칭호 미장착]";
                equippedText.className = gameState.equippedTitle
                    ? `inline-block border px-1.5 py-0.5 text-[10px] font-bold ${currentTitle.style}`
                    : "inline-block border border-gray-700 bg-gray-950 px-1.5 py-0.5 text-[10px] font-bold text-gray-400";
            }

            if (!gameState.unlockedTitles) gameState.unlockedTitles = [];

            let html = "";
            AVAILABLE_TITLES.forEach(t => {
                const isUnlocked = t.condition(gameState, cachedHofData) || gameState.unlockedTitles.includes(t.id);
                const isEquipped = gameState.equippedTitle === t.id;

                if (isUnlocked && !gameState.unlockedTitles.includes(t.id)) {
                    gameState.unlockedTitles.push(t.id);
                }

                const tierBadgeColor = t.tier === "신화" ? "bg-amber-500 text-black font-black" :
                                       t.tier === "전설" ? "bg-red-600 text-white font-bold" :
                                       t.tier === "영웅" ? "bg-purple-600 text-white font-bold" :
                                       t.tier === "희귀" ? "bg-sky-600 text-white font-bold" : "bg-gray-700 text-gray-300";

                html += `
                    <div class="p-2.5 border ${isUnlocked ? 'border-gray-700 bg-black' : 'border-gray-900 bg-[#080808] opacity-50'} flex justify-between items-center text-xs rounded-none-forced">
                        <div>
                            <div class="flex items-center gap-1.5 mb-1">
                                <span class="text-[8px] px-1 py-0.2 rounded-none-forced uppercase ${tierBadgeColor}">${t.tier}</span>
                                <span class="font-bold px-1.5 py-0.5 border text-[11px] ${isUnlocked ? t.style : 'text-gray-600 border-gray-800 bg-gray-950'}">[${t.name}]</span>
                                ${isEquipped ? '<span class="text-[9px] text-green-400 font-bold bg-green-950 px-1 border border-green-700">장착중</span>' : ''}
                            </div>
                            <p class="text-[9px] text-gray-400">${t.desc}</p>
                        </div>
                        <div>
                            ${isUnlocked ? 
                                `<button onclick="equipTitle('${t.id}')" class="text-[10px] px-3 py-1 font-bold transition ${isEquipped ? 'bg-gray-800 text-gray-400 border border-gray-700 cursor-default' : 'bg-yellow-950 text-yellow-300 border border-yellow-600 hover:bg-yellow-900'}">${isEquipped ? '해제' : '장착'}</button>`
                                : `<span class="text-[9px] text-gray-600 font-bold border border-gray-800 px-2 py-0.5">🔒 미해금</span>`
                            }
                        </div>
                    </div>
                `;
            });
            container.innerHTML = html;
        }

        function equipTitle(titleId) {
            if (gameState.equippedTitle === titleId) {
                gameState.equippedTitle = "";
                showToast(`🛡️ 칭호 장착을 해제했습니다.`);
            } else {
                gameState.equippedTitle = titleId;
                showToast(`👑 [${titleId}] 칭호를 장착했습니다!`);
            }
            refreshStateVisuals();
            renderTitleInventoryUI();
            saveLocalCache();
            Promise.resolve(saveSessionToCloud())
                .finally(() => fetchHallOfFameUI());
        }

        // ==========================================
        // WORLD BOSS RAID ENGINE (월드보스 시스템)
        // ==========================================
        let isWorldBossRaidActive = false;
        let wbTimerRemaining = GAME_CONFIG.BOSS_TIME_LIMIT;
        let wbPlayerHp = 100;
        let wbPlayerMaxHp = 100;
        let wbTimerInterval = null;
        let wbTotalDamageDealt = 0;
        let wbCorrectAnswers = 0;
        let wbCurrentWordObj = null;

        function calculatePlayerRaidMaxHp() {
            // 대장간 5종 장비 강화도 합산으로 기본 HP 결정 (장비 레벨당 +10 HP 추가)
            const sumGearLvl = (gameState.helmetLvl || 1) + (gameState.armorLvl || 1) + 
                               (gameState.weaponLvl || 1) + (gameState.shieldLvl || 1) + 
                               (gameState.shoesLvl || 1);
            // 기본 50 HP + 장비 레벨당 10 HP (예: 전원 10강시 550 HP)
            return 50 + (sumGearLvl * 10);
        }

        let wbMaxBossHp = 500000000000; // 월드보스 전 학년 공유 기본 최대 체력: 5,000억 (500B)
        let wbCurBossHp = 500000000000;

        const WORLD_BOSS_SEASONS = [
            {
                id: "fafnir",
                name: "심연의 흑룡 파브니르",
                img: "media/worldbose/worldbose_borndragon.webp",
                desc: "고대 영단어 스펠의 마력을 머금고 부활한 흑룡! 불꽃으로 가려진 위험한 정답을 조준 타격하여 비늘을 깨뜨려라!",
                debuffName: "🔥 심연의 화염 (보기 가림)",
                weaknessName: "⚡ 비늘 파괴 (화염 정답 조준 / 10연속 정답)",
                weaknessEffect: "10초간 흑룡 스턴 & 플레이어 전체 타격 딜량 2.5배 폭딜! (약점 종료 후 20초간 용의 비늘 회복 타임)",
                counterSkillName: "🔥 멸망의 흑염 브레스"
            },
            {
                id: "golem",
                name: "대지의 파멸 골렘",
                img: "media/worldbose/worldbose_golem.webp",
                desc: "대지를 뒤흔드는 고대 암석 결계 괴수! 6글자 이상의 알파벳 타일 조립(Unscramble) 정답으로 60% 암석 장갑을 산산조각 내어라!",
                debuffName: "🛡️ 암석 외피 (기본 피해 60% 감쇄)",
                weaknessName: "💥 외피 붕괴 (6글자 이상 철자조합 / 10연속 정답)",
                weaknessEffect: "약점 타격 즉시 장갑 파괴 및 10.0배 단일 강력 폭딜 타격! (조건 만족 시 항시 발동)",
                counterSkillName: "🗿 대지 강진 지진"
            },
            {
                id: "rich",
                name: "불멸의 흑마법 리치",
                img: "media/worldbose/worldbose_rich.webp",
                desc: "금단의 영단어 스펠을 교란하는 저주받은 마왕! 장착 마법 비기 스킬 4회를 연사하여 저주를 정화하고 성수 폭발을 일으켜라!",
                debuffName: "🔮 사령의 저주 (스펠 교란 & HP 흡혈)",
                weaknessName: "✨ 성수 폭발 (마법 스킬 4회 시전 / 10연속 정답)",
                weaknessEffect: "사령의 저주 완벽 정화 및 모든 스킬 쿨타임 즉시 초기화! (약점 종료 후 20초간 사령 저주 재가동)",
                counterSkillName: "🔮 사령 사멸 주문"
            }
        ];

        function getWorldBossSettlementPresentation(details = {}) {
            const defeated = Boolean(details.defeated ?? details.isVictory);
            const myDamage = Math.max(0, Number(details.myDamage) || 0);
            const totalDamage = Math.max(0, Number(details.totalDamage) || 0);
            const participantCount = Math.max(0, Math.floor(Number(details.participantCount) || 0));
            const myRank = Math.max(0, Math.floor(Number(details.myRank) || 0));
            const rewardFp = Math.max(0, Math.floor(Number(details.rewardFp ?? details.totalFp) || 0));
            const gotTitle = Boolean(details.gotTitle ?? details.getsTitle);
            const bossName = String(details.bossName || "").trim();
            const isWeekly = details.isWeekly !== false;
            const explicitRate = Number(details.teamContributionRate ?? details.contributionRate);
            const contributionRate = Number.isFinite(explicitRate)
                ? Math.max(0, Math.min(1, explicitRate))
                : (totalDamage > 0 ? Math.max(0, Math.min(1, myDamage / totalDamage)) : 0);
            const resultText = defeated ? "완전 승리 ✅" : "토벌 실패 · 부분 보상";
            const rankText = myRank
                ? `${myRank.toLocaleString()}위${participantCount ? ` / ${participantCount.toLocaleString()}명` : ""}`
                : "집계되지 않음";
            const titleText = gotTitle
                ? "[수호신] 칭호 획득 👑"
                : (defeated ? "기여 순위에 따라 칭호 판정 완료" : "토벌 성공 시 기여 1위에게 [수호신] 수여");
            const targetText = bossName ? `[${bossName}]` : "전 학년 연합 레이드";
            const periodText = isWeekly ? "지난 주" : "이번";
            const description = totalDamage > 0
                ? `${periodText} ${targetText}에서 전 학년 용사들이 총 ${totalDamage.toLocaleString()} 피해를 기록했어요.`
                : `${periodText} ${targetText} 전투 결과가 집계되었어요.`;
            return {
                banner: isWeekly
                    ? `월드보스 주간 결산 · 전 학년 연합 ${defeated ? "토벌 성공" : "전투 종료"}`
                    : "월드보스 토벌 완료 · 전 학년 연합 레이드",
                heading: defeated ? "🏆 월드보스 완전 토벌!" : "⚔️ 월드보스 주간 전투 종료",
                description,
                targetText,
                resultText,
                statusColor: defeated ? "#4ade80" : "#f87171",
                damageText: `${myDamage.toLocaleString()} HP`,
                contributionText: `${(contributionRate * 100).toFixed(2)}%`,
                rankText,
                titleText,
                titleColor: gotTitle ? "#fbbf24" : "#9ca3af",
                rewardLabel: defeated ? "🎁 승리 기여 보상" : "🎁 미처치 부분 보상 (50%)",
                rewardText: `+${rewardFp.toLocaleString()} FP${gotTitle ? " · [수호신] 칭호" : ""}`
            };
        }

        function renderWorldBossSettlementModal(details = {}) {
            const presentation = getWorldBossSettlementPresentation(details);
            const modal = document.getElementById("wbVictoryNoticeModal");
            if (!modal) return presentation;
            const setText = (id, value) => {
                const element = document.getElementById(id);
                if (element) element.textContent = value;
                return element;
            };
            setText("wbModalBanner", presentation.banner);
            const heading = modal.querySelector("h2");
            if (heading) heading.textContent = presentation.heading;
            setText("wbModalDescription", presentation.description);
            setText("wbModalBossLabel", presentation.targetText);
            const status = setText("wbModalClearStatus", presentation.resultText);
            if (status) status.style.color = presentation.statusColor;
            setText("wbModalMyDamage", presentation.damageText);
            setText("wbModalMyShare", presentation.contributionText);
            setText("wbModalMyRank", presentation.rankText);
            const title = setText("wbModalTitleResult", presentation.titleText);
            if (title) title.style.color = presentation.titleColor;
            setText("wbModalRewardLabel", presentation.rewardLabel);
            setText("wbModalRewardSummary", presentation.rewardText);
            return presentation;
        }

        function syncWorldBossSettlementSupplementalFields() {
            const statusText = document.getElementById("wbModalClearStatus")?.textContent || "";
            const summaryText = document.getElementById("wbModalRewardSummary")?.textContent || "";
            const gotTitle = summaryText.includes("[수호신]");
            const defeated = statusText.includes("승리") || statusText.includes("토벌 성공");
            const title = document.getElementById("wbModalTitleResult");
            if (title) {
                title.textContent = gotTitle
                    ? "[수호신] 칭호 획득 👑"
                    : (defeated ? "기여 순위에 따라 칭호 판정 완료" : "토벌 성공 시 기여 1위에게 [수호신] 수여");
                title.style.color = gotTitle ? "#fbbf24" : "#9ca3af";
            }
            const rewardLabel = document.getElementById("wbModalRewardLabel");
            if (rewardLabel) rewardLabel.textContent = defeated ? "🎁 승리 기여 보상" : "🎁 미처치 부분 보상 (50%)";
        }
        function resolveRichSkillCastState({ bossId, bossState, gracePeriodTimer, skillCastCount } = {}) {
            const currentCount = Math.max(0, Math.floor(Number(skillCastCount) || 0));
            const eligible = bossId === "rich" && bossState === "normal" && Number(gracePeriodTimer || 0) <= 0;
            const counted = eligible ? currentCount + 1 : currentCount;
            const triggered = eligible && counted >= 4;
            return {
                eligible,
                triggered,
                resetCooldowns: triggered,
                nextSkillCastCount: triggered ? 0 : counted
            };
        }

        function advanceRichCurseTimer({ bossId, bossState, gracePeriodTimer, ultimateEventActive, timer, delta = 0.1 } = {}) {
            const numericTimer = Number(timer);
            const currentTimer = Number.isFinite(numericTimer) && numericTimer >= 0 ? numericTimer : 10;
            const active = bossId === "rich" && bossState === "normal" && Number(gracePeriodTimer || 0) <= 0 && !ultimateEventActive;
            if (!active) return { active, triggered: false, nextTimer: currentTimer };
            const remaining = currentTimer - Math.max(0, Number(delta) || 0);
            const triggered = remaining <= 0;
            return { active, triggered, nextTimer: triggered ? 10 : remaining };
        }

        window.renderWorldBossSettlementModal = renderWorldBossSettlementModal;
        window.__vocaHeroTestHooks = {
            ...(window.__vocaHeroTestHooks || {}),
            getWorldBossSettlementPresentation,
            resolveRichSkillCastState,
            advanceRichCurseTimer
        };
        function getCurrentWeekNum() {
            const EPOCH_MONDAY = new Date("2024-07-01T00:00:00Z");
            const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
            const kstMidnight = new Date(Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate()));
            const dayOfWeek = kstMidnight.getUTCDay();
            const daysSinceMonday = (dayOfWeek + 6) % 7;
            const thisMonday = new Date(kstMidnight.getTime() - daysSinceMonday * 24 * 60 * 60 * 1000);
            const oneWeek = 1000 * 60 * 60 * 24 * 7;
            return Math.floor((thisMonday.getTime() - EPOCH_MONDAY.getTime()) / oneWeek);
        }

        function getKstDayString(now = Date.now()) {
            return new Date(now + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
        }

        function getWorldBossRaidStorageKeys() {
            const keys = [];
            if (gameState.uid) keys.push(`vocahero_wb_raid_date_${gameState.uid}`);
            keys.push(`vocahero_wb_raid_date_${gameState.grade}_${gameState.classNum}_${gameState.studentNum}_${gameState.name}`);
            return [...new Set(keys)];
        }

        function hasCompletedWorldBossToday(day = getKstDayString()) {
            let completed = false;
            getWorldBossRaidStorageKeys().forEach((key) => {
                const savedDay = localStorage.getItem(key);
                if (savedDay === day) completed = true;
                else if (savedDay) localStorage.removeItem(key);
            });
            return completed;
        }

        function markWorldBossCompleted(day = getKstDayString()) {
            getWorldBossRaidStorageKeys().forEach((key) => localStorage.setItem(key, day));
        }

        function clearWorldBossCompletion() {
            getWorldBossRaidStorageKeys().forEach((key) => localStorage.removeItem(key));
        }

        function getWorldBossCacheKey() {
            return `vocahero_wb_cache_${gameState.uid || `${gameState.grade}_${gameState.name}_${gameState.studentNum}`}`;
        }

        function getWbExpectedMaxHp() {
            const weekNum = getCurrentWeekNum();
            const relativeWeek = Math.max(0, weekNum - 108); // 이번 주(108주차)부터 100억으로 다시 시작
            return Math.min(100000000000, 10000000000 + (relativeWeek * 1000000000));
        }

        function getFormattedMonthWeekString() {
            const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
            const kstMidnight = new Date(Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate()));
            const dayOfWeek = kstMidnight.getUTCDay();
            const daysSinceMonday = (dayOfWeek + 6) % 7;
            const thisMonday = new Date(kstMidnight.getTime() - daysSinceMonday * 24 * 60 * 60 * 1000);
            
            const month = thisMonday.getUTCMonth() + 1;
            const date = thisMonday.getUTCDate();
            const weekOfMonth = Math.floor((date - 1) / 7) + 1;
            
            return `${month}월 ${weekOfMonth}주차 시즌 보스`;
        }


        function getWeeklyBossIndex() {
            const weekNum = getCurrentWeekNum();
            return ((weekNum % WORLD_BOSS_SEASONS.length) + WORLD_BOSS_SEASONS.length) % WORLD_BOSS_SEASONS.length;
        }

        function updateWorldBossUI() {
            const studentKey = `${gameState.grade}_${gameState.classNum}_${gameState.studentNum}_${gameState.name}`;
            const wbCacheKey = getWorldBossCacheKey();
            wbPlayerMaxHp = calculatePlayerRaidMaxHp();

            // 주차별 월드보스 일러스트 & 정보 동적 세팅
            const seasonIdx = getWeeklyBossIndex();
            const bossInfo = WORLD_BOSS_SEASONS[seasonIdx];

            document.getElementById("wbBossImage").src = bossInfo.img;
            document.getElementById("wbBossName").innerText = bossInfo.name;
            document.getElementById("wbBossDesc").innerText = `"${bossInfo.desc}"`;
            document.getElementById("wbWeekBadge").innerText = getFormattedMonthWeekString();
            document.getElementById("wbGradeTitle").innerText = "전 학년 공유 체력";
            document.getElementById("playerMaxHpDisplay").innerText = `💖 ${wbPlayerMaxHp} HP (무구 강화 수치에 비례)`;

            const tagEl = document.getElementById("wbGuideBossTag");
            if (tagEl) tagEl.innerText = bossInfo.name;
            const debuffNameEl = document.getElementById("wbGuideDebuffName");
            if (debuffNameEl) debuffNameEl.innerText = bossInfo.debuffName;
            const debuffDescEl = document.getElementById("wbGuideDebuffDesc");
            if (debuffDescEl) {
                debuffDescEl.innerHTML = (bossInfo.id === 'fafnir') ? "선다형 보기나 순서맞추기 단어칸에 불꽃이 일렁여 시야를 방해합니다.<br><span class='text-yellow-300 font-bold'>👉 (불꽃이 일렁이는 정답을 타격하면 비늘이 깨집니다!)</span>" :
                                         (bossInfo.id === 'golem') ? "단단한 암석 피부로 일반 타격 데미지를 60% 감소(0.4배)합니다.<br><span class='text-yellow-300 font-bold'>👉 (6글자 이상 철자 조합 정답 또는 10콤보 달성 시 외피가 붕괴됩니다!)</span>" :
                                         "10초마다 플레이어를 중독시켜 스펠을 교란합니다.<br><span class='text-red-400 font-bold'>👉 (마법 속성 오답 공격 시 플레이어 HP 10%를 소모하여 체력을 회복합니다!)</span>";
            }
            const weakNameEl = document.getElementById("wbGuideWeaknessName");
            if (weakNameEl) weakNameEl.innerText = bossInfo.weaknessName;
            const weakEffEl = document.getElementById("wbGuideWeaknessEffect");
            if (weakEffEl) weakEffEl.innerHTML = bossInfo.weaknessEffect;
            const counterNameEl = document.getElementById("wbGuideCounterName");
            if (counterNameEl) counterNameEl.innerText = bossInfo.counterSkillName;
            const counterDescEl = document.getElementById("wbGuideCounterDesc");
            if (counterDescEl) counterDescEl.innerHTML = "약 45초 주기마다 20초 카운터 영단어 이벤트가 발동합니다.<br><span class='text-yellow-300 font-bold'>⚡ 성공 시 필살기 완벽 저지 & 3.0배 폭딜!</span> <span class='text-red-400 font-bold'>⚠️ 실패 시 최대 체력 30% 피해 및 10초 감소!</span> (타이머 ⏸️ 중지)";
            const dpsDisplay = document.getElementById("wbDpsPreviewText");
            if (dpsDisplay) dpsDisplay.innerText = calculatePlayerCP().toLocaleString();

            // 1. 펫 3종 동시 렌더링 (레벨별 진화 1~10단계 이미지 적용)
            const petContainer = document.getElementById("wbPetPreviewContainer");
            if (petContainer) {
                let petHtml = "";
                const petKeys = ['slime', 'dragon', 'fairy'];
                petKeys.forEach(type => {
                    const info = PET_PARAMS[type];
                    const lvl = (gameState.petLevels && gameState.petLevels[type]) || 0;
                    const stage = lvl > 0 ? Math.min(10, Math.ceil(lvl / 10)) : 1;
                    const imgUrl = `media/pet_${type}/pet_${type}_${stage}.webp`;
                    // 펫별 효과 텍스트 계산
                    let petEffectText = '';
                    if (type === 'slime' && lvl > 0) {
                        petEffectText = `🪙 골드 +${(PET_PARAMS.slime.goldBonus * lvl * 100).toFixed(0)}%`;
                    } else if (type === 'dragon' && lvl > 0) {
                        petEffectText = `⚔️ DPS +${(PET_PARAMS.dragon.dps * lvl).toLocaleString()}`;
                    } else if (type === 'fairy' && lvl > 0) {
                        petEffectText = `🔨 강화율 +${(PET_PARAMS.fairy.forgeBonus * lvl).toFixed(1)}%`;
                    } else {
                        petEffectText = '미소환';
                    }
                    petHtml += `
                        <div class="bg-[#0d0d0d] p-1.5 border border-[#3c3c3c] flex items-center gap-2 min-w-0 rounded-none-forced">
                            <img src="${imgUrl}" alt="${info.name}" class="w-8 h-8 object-contain flex-shrink-0">
                            <div class="min-w-0 flex-1">
                                <span class="text-[9px] text-gray-300 font-bold block truncate">${info.name}</span>
                                <span class="text-[10px] font-bold ${lvl > 0 ? 'text-yellow-400' : 'text-gray-600'}  block">Lv.${lvl}</span>
                                <span class="text-[8px] text-cyan-400 font-bold block truncate">${petEffectText}</span>
                            </div>
                        </div>
                    `;
                });
                // 펫 레벨 합계 → 힌트 횟수 계산
                const totalPetLvlForHint = Object.values(gameState.petLevels || {}).reduce((a, b) => a + b, 0);
                const maxHints = 2 + Math.floor(totalPetLvlForHint / 15);
                petHtml += `
                    <div class="col-span-3 mt-1 bg-yellow-950/40 border border-yellow-700/40 px-2 py-1 text-[9px] text-yellow-300 font-bold flex items-center gap-1">
                        🧚 소환수 힌트 찬스: 이번 레이드 <b class="text-yellow-200">${maxHints}회</b> 사용 가능
                        <span class="text-gray-500 font-normal ml-1">(펫 레벨합 ${totalPetLvlForHint} → 15레벨당 1회 추가 = 기본 2 + ${Math.floor(totalPetLvlForHint / 15)})</span>
                    </div>
                `;
                petContainer.innerHTML = petHtml;
            }

            // 2. 장착 스킬 4종 동시 렌더링 (단어 + 등급별 그라데이션 풀 배경 + 별)
            const skillContainer = document.getElementById("wbSkillsPreviewContainer");
            if (skillContainer) {
                let skillHtml = "";
                for (let i = 0; i < 4; i++) {
                    const id = gameState.equippedSkills ? gameState.equippedSkills[i] : null;
                    if (id && gameState.skillsInventory) {
                        const s = gameState.skillsInventory.find(item => item.id === id);
                        if (s) {
                            const gradeInfo = SKILL_GRADES[s.grade] || SKILL_GRADES.normal;
                            const starsHtml = "⭐".repeat(s.stars || 0);
                            const previewMult = getSkillMultiplier(s);
                            skillHtml += `
                                <div class="p-1.5 border-2 ${gradeInfo.colorClass} flex flex-col justify-between min-h-[56px] min-w-0">
                                    <div class="flex justify-between items-center text-[8px]">
                                        <span class="font-bold uppercase tracking-wider text-left">${gradeInfo.name} 티어${s.tier || 1}</span>
                                        <span class="text-yellow-300 font-bold text-[8px]">${starsHtml}</span>
                                    </div>
                                    <span class="text-[9px] sm:text-[10px] font-bold text-white tracking-tighter truncate block text-center">${capitalizeFirstLetter(s.word)}</span>
                                    <span class="text-[9px] font-bold text-pink-300 block text-center w-full">⚡ ×${previewMult}배</span>
                                </div>
                            `;
                        } else {
                            skillHtml += `<div class="bg-[#0d0d0d] p-1.5 border border-dashed border-[#3c3c3c] flex items-center justify-center h-12 text-[9px] text-gray-500 font-bold">비어있음</div>`;
                        }
                    } else {
                        skillHtml += `<div class="bg-[#0d0d0d] p-1.5 border border-dashed border-[#3c3c3c] flex items-center justify-center h-12 text-[9px] text-gray-500 font-bold">비어있음</div>`;
                    }
                }
                skillContainer.innerHTML = skillHtml;
            }

            // 3. 장착 고대 유물 & 💍 장신구 연마 현황 동시 렌더링 (이미지 + 수치 포함 깔끔 카드)
            const relicAccContainer = document.getElementById("wbRelicAccPreviewContainer");
            if (relicAccContainer) {
                let eqR = gameState.equippedRelicId ? RELIC_DEFINITIONS.find(item => item.id === gameState.equippedRelicId) : null;
                let acR = gameState.equippedRelicId ? (gameState.acquiredRelics || []).find(item => item.id === gameState.equippedRelicId) : null;
                
                const isRelicUnlocked = (gameState.stage || 1) >= 35;
                let relicCardHtml = "";
                if (!isRelicUnlocked) {
                    relicCardHtml = `
                        <div class="bg-[#0d0d0d] p-1.5 border border-dashed border-[#3c3c3c] flex items-center justify-center text-[9px] text-gray-500 font-bold rounded-none-forced min-h-[50px]">
                            🔒 미해금 (35스테이지)
                        </div>
                    `;
                } else if (eqR) {
                    relicCardHtml = `
                        <div class="bg-[#0d0d0d] p-1.5 border border-yellow-500/50 flex flex-col justify-center rounded-none-forced min-w-0">
                            <div class="flex items-center justify-center gap-1.5 mb-1">
                                <img src="${eqR.img}" alt="${eqR.name}" class="w-6 h-6 object-contain shrink-0 filter drop-shadow-[0_0_6px_rgba(234,179,8,0.7)]">
                                <span class="text-[9px] text-yellow-300 font-extrabold leading-tight">${eqR.name}</span>
                            </div>
                            <div class="text-center">
                                <span class="text-[9px] text-yellow-200 font-bold leading-tight break-words">${getRelicEffectString(eqR, acR)}</span>
                            </div>
                        </div>
                    `;
                } else {
                    relicCardHtml = `
                        <div class="bg-[#0d0d0d] p-1.5 border border-dashed border-yellow-500/30 flex items-center justify-center text-[9px] text-yellow-400/70 font-bold rounded-none-forced min-h-[50px]">
                            🏺 장착된 유물 없음
                        </div>
                    `;
                }

                const getAccHtml = (key, name, lvl, img, effectClass, unlockStage) => {
                    const isUnlocked = (gameState.stage || 1) >= unlockStage;
                    if (!isUnlocked) {
                        return `
                            <div class="bg-black/50 p-1 border border-gray-800 flex flex-col justify-center min-w-0 opacity-50 grayscale">
                                <div class="flex items-center justify-center gap-1 mb-1">
                                    <span class="text-[9px] text-gray-500 font-bold">🔒 미해금 (${unlockStage}스테이지)</span>
                                </div>
                            </div>
                        `;
                    }
                    return `
                        <div class="bg-black/70 p-1 border border-${effectClass}-900/60 flex flex-col justify-center min-w-0">
                            <div class="flex items-center justify-center gap-1 mb-1">
                                <img src="${img}" class="w-6 h-6 object-contain shrink-0" onerror="this.style.display='none'">
                                <span class="text-[9px] text-${effectClass}-300 font-bold">${name} ${lvl || 0}강</span>
                            </div>
                            <div class="text-center">
                                <span class="text-[9px] text-${effectClass}-200  font-extrabold leading-tight break-words">${getAccessoryEffectSummary(key, lvl)}</span>
                            </div>
                        </div>
                    `;
                };

                let accCardHtml = `
                    <div class="bg-[#0d0d0d] p-1.5 border border-purple-500/40 grid grid-cols-3 gap-1 rounded-none-forced">
                        ${getAccHtml('necklace', '목걸이', gameState.necklaceLvl, 'media/accessories/necklace.webp', 'purple', 45)}
                        ${getAccHtml('bracelet', '팔찌', gameState.braceletLvl, 'media/accessories/bracelet.webp', 'sky', 55)}
                        ${getAccHtml('ring', '반지', gameState.ringLvl, 'media/accessories/ring.webp', 'amber', 65)}
                    </div>
                `;

                relicAccContainer.innerHTML = relicCardHtml + accCardHtml;
            }

            // 로컬 클라이언트 1일 1회 완료 여부 즉시 사전 검사 (학년, 반, 번호, 이름까지 고유 식별 키 생성)
            const todayStr = getKstDayString();
            const isTodayDone = hasCompletedWorldBossToday(todayStr);

            const btn = document.getElementById("startWorldBossBtn");
            const badge = document.getElementById("worldBossEntryBadge");

            let isResume = false;
            if (isTodayDone) {
                if (btn) {
                    btn.disabled = true;
                    btn.className = "w-full py-3.5 bg-[#262626] text-[#7e7e7e] font-bold text-sm tracking-wider uppercase rounded-none-forced cursor-not-allowed border border-red-950";
                    btn.innerText = "🔒 오늘 토벌 완료 (1일 1회 제한)";
                }
                if (badge) {
                    badge.innerText = "오늘 참전 완료";
                    badge.className = "text-[9px] bg-gray-800 text-gray-400 border border-gray-600 px-3 py-1 rounded-none-forced font-bold uppercase tracking-wider";
                }
            } else {
                try {
                    const inProgressKey = `vocahero_wb_progress_${gameState.grade}_${gameState.classNum}_${gameState.studentNum}_${gameState.name}`;
                    const savedJson = localStorage.getItem(inProgressKey);
                    if (savedJson && JSON.parse(savedJson).date === todayStr) isResume = true;
                } catch(e) {}

                if (btn) {
                    btn.disabled = false;
                    btn.className = "w-full py-3.5 bg-gradient-to-r from-red-700 via-pink-700 to-red-600 hover:from-red-600 hover:to-pink-600 text-white font-black text-sm tracking-wider uppercase transition shadow-xl flex items-center justify-center gap-2 cursor-pointer";
                    btn.innerText = isResume ? "⚔️ 전투 이어하기 (이탈 기록 발견)" : "⚔️ 월드보스 토벌전 참전하기 (1일 1회)";
                }
                if (badge) {
                    badge.innerText = isResume ? "진행 중" : "1일 1회 도전 가능";
                    badge.className = "text-[9px] bg-red-950 text-red-400 border border-red-600 px-3 py-1 rounded-none-forced font-bold uppercase tracking-wider animate-pulse";
                }
            }

            const wbDaysLeftEl = document.getElementById("worldBossDaysLeft");
            if (wbDaysLeftEl) {
                const dLeft = (7 - new Date().getDay()) % 7;
                wbDaysLeftEl.innerText = dLeft === 0 ? "오늘 종료" : `${dLeft}일 남음`;
            }

            // ✅ 캐시 데이터 즉시 반영 (이어하기 기록이 있을 때만)
            const cachedWb = JSON.parse(localStorage.getItem(wbCacheKey) || "null");
            if (cachedWb && cachedWb.day === todayStr && isResume) {
                const cachedPct = Math.max(0, Math.min(100, (cachedWb.curHp / cachedWb.maxHp) * 100));
                document.getElementById("worldBossHpBar").style.width = `${cachedPct}%`;
                document.getElementById("worldBossHpText").innerText = `${cachedWb.curHp.toLocaleString()} / ${cachedWb.maxHp.toLocaleString()} HP (${cachedPct.toFixed(1)}%) [캐시]`;
                document.getElementById("myWorldBossDmgDisplay").innerText = cachedWb.myDamage.toLocaleString();
                document.getElementById("myWorldBossShareDisplay").innerText = `${cachedWb.sharePct}%`;
                const expectedTokensCache = Math.min(500, 200 + Math.floor(cachedWb.myDamage / 10000000) * 20);
                const expectedFpCache = Math.round(parseFloat(cachedWb.sharePct) * 1000);
                document.getElementById("myWorldBossRewardDisplay").innerHTML = `처치 시: <span style="color:white">+${expectedFpCache.toLocaleString()} FP</span> | 미처치 시: <span style="color:#9ca3af">+${Math.floor(expectedFpCache / 2).toLocaleString()} FP</span>`;

                // 캐시 기반 클리어 오버레이 즉시 표시
                const defeatedOverlay = document.getElementById("wbDefeatedOverlay");
                if (defeatedOverlay) {
                    if (cachedWb.curHp <= 0) {
                        defeatedOverlay.classList.remove("hidden"); defeatedOverlay.classList.add("flex");
                        if (btn) { btn.disabled = true; btn.innerText = "👑 월드보스 완전 토벌 완료 (시즌 승리)"; btn.className = "w-full py-3.5 bg-[#262626] text-[#7e7e7e] font-bold text-sm tracking-wider uppercase rounded-none-forced cursor-not-allowed border border-red-950"; }
                        if (badge) { badge.innerText = "토벌 성공"; badge.className = "text-[9px] bg-yellow-950 text-yellow-400 border border-yellow-600 px-3 py-1 rounded-none-forced font-bold uppercase tracking-wider"; }
                    } else {
                        defeatedOverlay.classList.remove("flex"); defeatedOverlay.classList.add("hidden");
                    }
                }
            } else {
                const hpTextEl = document.getElementById("worldBossHpText");
                if (hpTextEl) hpTextEl.innerText = "🔄 실시간 레이드 상태 수신 중...";
            }

            // Secure accounts receive aggregate-only boss data from the server.
            if (window._secureWorldBossStatus) {
                window._secureWorldBossStatus().catch((err) => console.error('World boss status error:', err));
                return;
            }

            // 서버에서 최신 데이터 가져오기 (백그라운드 업데이트)
            if (window._fbReady) {
                const bossDocRef = window._fbDoc(window._fbDb, "world_bosses", `global_week_${getCurrentWeekNum()}`);
                window._fbGetDoc(bossDocRef).then(docSnap => {
                    const expectedMaxHp = getWbExpectedMaxHp();
                    let curHp = expectedMaxHp;
                    let maxHp = expectedMaxHp;
                    let damages = {};
                    let canAttack = true;
                    
                    if (docSnap.exists()) {
                        const data = docSnap.data();
                        
                        let dbTotalDmg = 0;
                        if (data.damages) {
                            dbTotalDmg = Object.values(data.damages).reduce((a, b) => a + b, 0);
                        }
                        
                        maxHp = expectedMaxHp;
                        curHp = Math.max(0, maxHp - dbTotalDmg);
                        damages = data.damages || {};
                        const lastPlayedDates = data.lastPlayedDates || {};
                        if (lastPlayedDates[studentKey] === todayStr) {
                            canAttack = false;
                        }
                    }

                    wbCurBossHp = curHp;
                    wbMaxBossHp = maxHp;
                    
                    const myDamage = damages[studentKey] || 0;
                    const sharePct = wbMaxBossHp > 0 ? ((myDamage / wbMaxBossHp) * 100).toFixed(2) : "0.00";
                    const cappedShare = Math.min(100.0, Math.max(0, parseFloat(sharePct) || 0)).toFixed(2);

                    const pct = Math.max(0, Math.min(100, (wbCurBossHp / wbMaxBossHp) * 100));

                    document.getElementById("worldBossHpBar").style.width = `${pct}%`;
                    document.getElementById("worldBossHpText").innerText = `${wbCurBossHp.toLocaleString()} / ${wbMaxBossHp.toLocaleString()} HP (${pct.toFixed(1)}%)`;
                    document.getElementById("myWorldBossDmgDisplay").innerText = myDamage.toLocaleString();
                    document.getElementById("myWorldBossShareDisplay").innerText = `${cappedShare}%`;
                    
                    const expectedTokens = Math.min(500, 200 + Math.floor(myDamage / 10000000) * 20);
                    const expectedFp = Math.round(parseFloat(cappedShare) * 1000);
                    document.getElementById("myWorldBossRewardDisplay").innerHTML = `처치 시: <span style="color:white">+${expectedFp.toLocaleString()} FP</span> | 미처치 시: <span style="color:#9ca3af">+${Math.floor(expectedFp / 2).toLocaleString()} FP</span>`;

                    // ✅ 서버 응답 데이터를 로컬 캐시에 저장 (다음 탭 전환 시 즉시 표시용)
                    localStorage.setItem(wbCacheKey, JSON.stringify({
                        day: todayStr,
                        curHp: wbCurBossHp,
                        maxHp: wbMaxBossHp,
                        myDamage: myDamage,
                        sharePct: cappedShare,
                        canAttack: canAttack,
                        cachedAt: Date.now()
                    }));

                    // 보스 체력이 0 HP일 때 대기실 보스 일러스트 위에 붉은 ✖ 자 강렬한 CLEAR! 낙인 효과 토글 렌더링
                    const defeatedOverlay = document.getElementById("wbDefeatedOverlay");
                    if (defeatedOverlay) {
                        if (wbCurBossHp <= 0) {
                            defeatedOverlay.classList.remove("hidden");
                            defeatedOverlay.classList.add("flex");
                        } else {
                            defeatedOverlay.classList.remove("flex");
                            defeatedOverlay.classList.add("hidden");
                        }
                    }

                    // 👑 보스 체력이 0 HP가 되면 학년 학생들에게 최초 1회 승리 팝업(멀티모달 알림) 출력 및 보상 즉시 지급!
                    if (wbCurBossHp <= 0) {
                        const currentWeek = getCurrentWeekNum();
                        const rewardClaimKey = `vocahero_wb_reward_claimed_${studentKey}_week_${currentWeek}`;
                        if (!localStorage.getItem(rewardClaimKey)) {
                            const baseFp = Math.floor(myDamage / 1000);
                            const shareFp = Math.round(100000 * (wbMaxBossHp > 0 ? myDamage / wbMaxBossHp : 0));
                            const totalFp = baseFp + shareFp;
                            
                            let myRank = 1;
                            let sortedDmg = Object.values(damages).sort((a,b)=>b-a);
                            if(sortedDmg.length > 0) myRank = sortedDmg.indexOf(myDamage) + 1;
                            const getsTitle = myRank === 1;

                            const totalRecordedDamage = Object.values(damages).reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0);
                            const participantCount = Object.values(damages).filter(value => Number(value) > 0).length;
                            renderWorldBossSettlementModal({
                                isWeekly: false,
                                defeated: true,
                                bossName: bossInfo.name,
                                myDamage,
                                totalDamage: totalRecordedDamage,
                                participantCount,
                                myRank,
                                rewardFp: totalFp,
                                gotTitle: getsTitle,
                                teamContributionRate: totalRecordedDamage > 0 ? myDamage / totalRecordedDamage : 0
                            });
                            const claimBtn = document.getElementById("wbVictoryNoticeClaimBtn");
                            if (claimBtn) {
                                claimBtn.onclick = () => {
                                    gameState.fp = (gameState.fp || 0) + totalFp;
                                    if (getsTitle) {
                                        if (!gameState.unlockedTitles) gameState.unlockedTitles = [];
                                        if (!gameState.unlockedTitles.includes("수호신")) gameState.unlockedTitles.push("수호신");
                                    }
                                    localStorage.setItem(rewardClaimKey, "true");
                                    saveLocalCache();
                                    refreshStateVisuals();
                                    closeModal("wbVictoryNoticeModal");
                                    showToast(`월드보스 토벌 보상(+${totalFp.toLocaleString()} FP)을 수령했습니다!`);
                                };
                            }
                            openModal("wbVictoryNoticeModal");
                            playSoundEffect('levelup');
                        }
                    }

                    if (!canAttack) {
                        markWorldBossCompleted(todayStr);
                    }

                    if (!canAttack || isTodayDone || wbCurBossHp <= 0) {
                        if (btn) {
                            btn.disabled = true;
                            btn.className = "w-full py-3.5 bg-[#262626] text-[#7e7e7e] font-bold text-sm tracking-wider uppercase rounded-none-forced cursor-not-allowed border border-red-950";
                            btn.innerText = wbCurBossHp <= 0 ? "👑 월드보스 완전 토벌 완료 (시즌 승리)" : "🔒 오늘 토벌 완료 (1일 1회 제한)";
                        }
                        if (badge) {
                            badge.innerText = wbCurBossHp <= 0 ? "토벌 성공" : "오늘 참전 완료";
                            badge.className = "text-[9px] bg-yellow-950 text-yellow-400 border border-yellow-600 px-3 py-1 rounded-none-forced font-bold uppercase tracking-wider";
                        }
                    }
                }).catch(err => {
                    console.error("Firebase getDoc error for World Boss:", err);
                });
            }
        }

        function applySecureWorldBossStatus(boss) {
            if (!boss) return;
            wbCurBossHp = Math.max(0, Number(boss.curHp) || 0);
            wbMaxBossHp = Math.max(1, Number(boss.maxHp) || 1);
            const myDamage = Math.max(0, Number(boss.myDamage) || 0);
            const sharePct = Math.min(100, (myDamage / wbMaxBossHp) * 100).toFixed(2);
            const pct = Math.max(0, Math.min(100, (wbCurBossHp / wbMaxBossHp) * 100));
            const hpBar = document.getElementById("worldBossHpBar");
            const hpText = document.getElementById("worldBossHpText");
            const damage = document.getElementById("myWorldBossDmgDisplay");
            const share = document.getElementById("myWorldBossShareDisplay");
            const reward = document.getElementById("myWorldBossRewardDisplay");
            if (hpBar) hpBar.style.width = `${pct}%`;
            if (hpText) hpText.innerText = `${wbCurBossHp.toLocaleString()} / ${wbMaxBossHp.toLocaleString()} HP (${pct.toFixed(1)}%)`;
            if (damage) damage.innerText = myDamage.toLocaleString();
            if (share) share.innerText = `${sharePct}%`;
            if (reward) {
                const fp = Math.round(Number(sharePct) * 1000);
                reward.innerHTML = `처치 시: <span style="color:white">+${fp.toLocaleString()} FP</span> | 미처치 시: <span style="color:#9ca3af">+${Math.floor(fp / 2).toLocaleString()} FP</span>`;
            }
            const bossDay = typeof boss.day === 'string' ? boss.day : getKstDayString();
            if (boss.canAttack) clearWorldBossCompletion();
            else markWorldBossCompleted(bossDay);
            localStorage.setItem(getWorldBossCacheKey(), JSON.stringify({ day: bossDay, curHp: wbCurBossHp, maxHp: wbMaxBossHp, myDamage, sharePct, canAttack: Boolean(boss.canAttack), cachedAt: Date.now() }));
            const btn = document.getElementById("startWorldBossBtn");
            const badge = document.getElementById("worldBossEntryBadge");
            const defeated = wbCurBossHp <= 0;
            if (btn && (!boss.canAttack || defeated)) {
                btn.disabled = true;
                btn.className = "w-full py-3.5 bg-[#262626] text-[#7e7e7e] font-bold text-sm tracking-wider uppercase rounded-none-forced cursor-not-allowed border border-red-950";
                btn.innerText = defeated ? "월드보스 토벌 완료" : "오늘의 레이드 완료";
            }
            if (btn && boss.canAttack && !defeated) {
                btn.disabled = false;
                btn.className = "w-full py-4 bg-gradient-to-r from-red-700 via-pink-700 to-red-600 hover:from-red-600 hover:to-pink-600 text-white font-black text-base tracking-wider uppercase transition shadow-xl flex items-center justify-center gap-2 rounded-none-forced";
                btn.innerHTML = '<i data-lucide="swords" class="w-6 h-6"></i><span>월드보스 토벌전 참전하기 (1일 1회)</span>';
                window.lucide?.createIcons?.();
            }
            if (badge && (!boss.canAttack || defeated)) {
                badge.innerText = defeated ? "토벌 성공" : "오늘 참전 완료";
                badge.className = "text-[9px] bg-yellow-950 text-yellow-400 border border-yellow-600 px-3 py-1 rounded-none-forced font-bold uppercase tracking-wider";
            }
            if (badge && boss.canAttack && !defeated) {
                badge.innerText = "1일 1회 도전 가능";
                badge.className = "text-[9px] bg-red-950 text-red-400 border border-red-600 px-3 py-1 rounded-none-forced font-bold uppercase tracking-wider";
            }
            const overlay = document.getElementById("wbDefeatedOverlay");
            if (overlay) overlay.classList.toggle("hidden", !defeated);
            if (overlay && defeated) overlay.classList.add("flex");
            if (overlay && !defeated) overlay.classList.remove("flex");
        }
        window._applySecureWorldBossStatus = applySecureWorldBossStatus;

        // (Removed duplicate HP declarations)

        function updateWorldBossBattleHpBar() {
            const hpTextEl = document.getElementById("wbBattleBossHpText");
            const hpBarEl = document.getElementById("wbBattleBossHpBar");
            const currentRemHp = Math.max(0, wbCurBossHp - wbTotalDamageDealt);
            const pct = Math.max(0, Math.min(100, (currentRemHp / wbMaxBossHp) * 100));

            if (hpTextEl) {
                hpTextEl.innerText = `${currentRemHp.toLocaleString()} / ${wbMaxBossHp.toLocaleString()} HP (${pct.toFixed(1)}%)`;
            }
            if (hpBarEl) {
                hpBarEl.style.width = `${pct}%`;
            }

            // 보스 잔여 HP가 0이 되는 즉시 제한시간에 관계없이 즉시 완전 클리어 판정!
            if (currentRemHp <= 0 && isWorldBossRaidActive) {
                endWorldBossRaid("🎉 전 학년 용사들의 합심으로 월드보스를 완벽히 정복하여 토벌에 성공했습니다!");
            }
        }

        let wbComboCount = 0;
        let wbWrongCount = 0;
        let wbBossState = "normal"; // "normal", "weakness_shattered"
        let wbWeaknessTimer = 0;
        let wbGracePeriodTimer = 0;
        let wbIsFlameActive = false;
        let wbUltimateEventActive = false;
        let wbUltimateTimer = 0;
        let wbNextUltimateTime = 135.0;
        let wbSkillCastCount = 0;
        let wbRichCurseTimer = 10.0;

        function updateWorldBossHudUI() {
            const seasonIdx = getWeeklyBossIndex();
            const bossInfo = WORLD_BOSS_SEASONS[seasonIdx] || WORLD_BOSS_SEASONS[0];
            const maxCombo = 10;
            
            const comboText = document.getElementById("wbComboText");
            if (comboText) comboText.innerText = `${wbComboCount}/${maxCombo}`;
            
            const comboGauge = document.getElementById("wbComboGauge");
            if (comboGauge) {
                const pct = Math.min(100, Math.max(0, (wbComboCount / maxCombo) * 100));
                comboGauge.style.width = `${pct}%`;
            }

            const stateBadge = document.getElementById("wbBossStateBadge");
            if (stateBadge) {
                if (wbUltimateEventActive) {
                    stateBadge.className = "bg-yellow-500 text-black border border-yellow-300 text-[10px] px-2 py-0.5 font-black uppercase tracking-wider animate-bounce shadow-lg";
                    stateBadge.innerText = `🚨 [카운터 저지 모드] (${wbUltimateTimer.toFixed(1)}초)`;
                } else if (wbBossState === "weakness_shattered") {
                    stateBadge.className = "bg-yellow-950 text-yellow-300 border border-yellow-400 text-[10px] px-2 py-0.5 font-black uppercase tracking-wider animate-pulse shadow-md";
                    stateBadge.innerText = (bossInfo.id === 'fafnir') ? `⚡ [비늘 파괴] 딜량 2.5배 (${wbWeaknessTimer.toFixed(1)}초)` :
                                           (bossInfo.id === 'golem') ? `💥 [외피 붕괴] 10배 초폭딜 (${wbWeaknessTimer.toFixed(1)}초)` :
                                           `✨ [성수 정화] 스킬+150% (${wbWeaknessTimer.toFixed(1)}초)`;
                } else if (wbGracePeriodTimer > 0) {
                    stateBadge.className = "bg-gray-800 text-gray-400 border border-gray-600 text-[10px] px-2 py-0.5 font-bold uppercase tracking-wider";
                    stateBadge.innerText = `🛡️ [보스 재정비] 회복 중 (${wbGracePeriodTimer.toFixed(1)}초)`;
                } else if (bossInfo.id === 'golem') {
                    stateBadge.className = "bg-amber-950 text-amber-300 border border-amber-600 text-[10px] px-2 py-0.5 font-bold uppercase tracking-wider";
                    stateBadge.innerText = "🛡️ [암석 외피] 피해 -60%";
                } else if (bossInfo.id === 'fafnir') {
                    stateBadge.className = "bg-red-950 text-red-300 border border-red-600 text-[10px] px-2 py-0.5 font-bold uppercase tracking-wider";
                    stateBadge.innerText = "🔥 [심연의 화염] 보기 가림";
                } else {
                    stateBadge.className = "bg-purple-950 text-purple-300 border border-purple-600 text-[10px] px-2 py-0.5 font-bold uppercase tracking-wider";
                    stateBadge.innerText = "🔮 [사령의 저주] 스펠 교란";
                }
            }

            const multBadge = document.getElementById("wbDmgMultBadge");
            if (multBadge) {
                let mult = 1.0;
                if (wbCurrentQuizType === 'english') mult = 1.2;
                if (wbCurrentQuizType === 'unscramble') mult = 1.6;
                if (wbUltimateEventActive) mult = 3.0;
                if (wbBossState === 'weakness_shattered') mult *= (bossInfo.id === 'fafnir' ? 2.5 : bossInfo.id === 'golem' ? 10.0 : 3.0);
                if (bossInfo.id === 'golem' && wbBossState === 'normal') mult *= 0.4;
                
                multBadge.innerText = `⚡ ${mult.toFixed(1)}x`;
            }
        }

        async function startWorldBossRaid() {
            if (window._secureWorldBossStart) {
                const started = await window._secureWorldBossStart();
                if (!started) return;
            }
            isWorldBossRaidActive = true;
            wbTimerRemaining = 180.0;
            wbWrongCount = 0;
            wbComboCount = 0;
            wbBossState = "normal";
            wbWeaknessTimer = 0;
            wbGracePeriodTimer = 0;
            wbIsFlameActive = false;
            wbUltimateEventActive = false;
            wbUltimateTimer = 0;
            wbNextUltimateTime = 135.0;
            wbSkillCastCount = 0;
            wbRichCurseTimer = 10.0;
            wbTotalDamageDealt = 0;
            wbCorrectAnswers = 0;
            wbSkillCooldowns = {};
            wbPlayerMaxHp = calculatePlayerRaidMaxHp();
            wbPlayerHp = wbPlayerMaxHp;

            const todayStr = getKstDayString();
            const inProgressKey = `vocahero_wb_progress_${gameState.grade}_${gameState.classNum}_${gameState.studentNum}_${gameState.name}`;
            let loadedHintRemaining = null;
            try {
                const savedJson = localStorage.getItem(inProgressKey);
                if (savedJson) {
                    const saved = JSON.parse(savedJson);
                    if (saved.date === todayStr) {
                        wbTimerRemaining = saved.wbTimerRemaining ?? 180.0;
                        wbTotalDamageDealt = saved.wbTotalDamageDealt ?? 0;
                        wbCorrectAnswers = Math.max(0, Math.floor(Number(saved.wbCorrectAnswers) || 0));
                        wbPlayerHp = saved.wbPlayerHp ?? wbPlayerMaxHp;
                        wbSkillCooldowns = saved.wbSkillCooldowns || {};
                        wbRichCurseTimer = Math.max(0.1, Number(saved.wbRichCurseTimer) || 10.0);
                        if (typeof saved.wbPetHintRemaining === 'number') {
                            loadedHintRemaining = saved.wbPetHintRemaining;
                        }
                        wbNextUltimateTime = Math.floor(wbTimerRemaining / 45) * 45 - 5;
                        if (wbNextUltimateTime < 0) wbNextUltimateTime = 135.0;
                    } else {
                        localStorage.removeItem(inProgressKey);
                    }
                }
            } catch(e) { localStorage.removeItem(inProgressKey); }

            document.getElementById("worldBossReadyBox").classList.add("hidden");
            const arena = document.getElementById("worldBossBattleArena");
            arena.classList.remove("hidden");
            arena.classList.add("flex");

            const timerText = document.getElementById("wbTimerText");
            if (timerText) timerText.innerText = "180.0초";
            const hpText = document.getElementById("wbPlayerHpText");
            if (hpText) hpText.innerText = `${wbPlayerHp} / ${wbPlayerMaxHp} HP`;

            const defOverlay = document.getElementById("wbDefeatedOverlay");
            if (defOverlay) defOverlay.classList.add("hidden");
            const ultOverlay = document.getElementById("wbUltimateWarningOverlay");
            if (ultOverlay) ultOverlay.classList.add("hidden");
            
            const shOverlay = document.getElementById("wbWeaknessShatterOverlay");
            if (shOverlay) shOverlay.classList.add("hidden");

            const seasonIdx = getWeeklyBossIndex();
            const bossInfo = WORLD_BOSS_SEASONS[seasonIdx] || WORLD_BOSS_SEASONS[0];
            const bossImg = document.getElementById("wbActiveBossImg");
            if (bossImg) bossImg.src = bossInfo.img;
            const bgImg = document.getElementById("wbStageBackdrop");
            if (bgImg) bgImg.src = bossInfo.img;
            const nameTag = document.getElementById("wbActiveBossNameTag");
            if (nameTag) nameTag.innerText = bossInfo.name;

            const totalPetLvlForHint = Object.values(gameState.petLevels || {}).reduce((a, b) => a + b, 0);
            wbPetHintMaxCount = 2 + Math.floor(totalPetLvlForHint / 15);
            if (loadedHintRemaining !== null) {
                wbPetHintRemaining = loadedHintRemaining;
            } else {
                wbPetHintRemaining = wbPetHintMaxCount;
            }
            updatePetHintBtnUI();
            updateWorldBossHudUI();
            
            renderWorldBossPetStage();

            generateWorldBossQuiz();
            renderWorldBossRaidSkills();
            playSoundEffect('levelup');
            showToast(`🚨 월드보스 [${bossInfo.name}] 참전! 약점 공략과 카운터 스펠로 폭딜을 퍼부으세요!`);

            if (wbTimerInterval) clearInterval(wbTimerInterval);
            wbTimerInterval = setInterval(() => {
                // 필살기 저지 이벤트 중에는 레이드 메인 타이머 일시 중지!
                if (!wbUltimateEventActive) {
                    wbTimerRemaining -= 0.1;
                }
                
                const tText = document.getElementById("wbTimerText");
                if (tText) {
                    tText.innerText = wbUltimateEventActive 
                        ? `${wbTimerRemaining.toFixed(1)}초 (⏸️ 일시중지)`
                        : `${wbTimerRemaining.toFixed(1)}초`;
                }

                // 약점 무력화 및 회복 쿨타임(Grace Period) 차감
                if (wbGracePeriodTimer > 0) {
                    wbGracePeriodTimer -= 0.1;
                }
                if (wbWeaknessTimer > 0) {
                    wbWeaknessTimer -= 0.1;
                    if (wbWeaknessTimer <= 0) {
                        wbBossState = "normal";
                        updateCurrentWbQuizOptionTheme();
                        const sIdx = getWeeklyBossIndex();
                        const bInfo = WORLD_BOSS_SEASONS[sIdx] || WORLD_BOSS_SEASONS[0];
                        wbGracePeriodTimer = (bInfo.id === 'golem' ? 0.0 : 20.0); // 파브니르/리치는 20초 쿨타임, 골렘은 항시
                        if (bInfo.id === 'rich') wbRichCurseTimer = 10.0;
                        showWorldBossFxNotice(`🛡️ 보스의 약점 무력화 상태가 종료되어 외피/저주를 재가동합니다. (${bInfo.id === 'golem' ? '즉시 재시도 가능' : '20초 재정비'})`, "text-gray-400 border-gray-600");
                    }
                }

                // 리치 고유 패턴: 저주가 활성화된 동안 10초마다 장착 스킬의 화면 위치를 교란합니다.
                const timerBossInfo = WORLD_BOSS_SEASONS[getWeeklyBossIndex()] || WORLD_BOSS_SEASONS[0];
                const richCurseTick = advanceRichCurseTimer({
                    bossId: timerBossInfo.id,
                    bossState: wbBossState,
                    gracePeriodTimer: wbGracePeriodTimer,
                    ultimateEventActive: wbUltimateEventActive,
                    timer: wbRichCurseTimer,
                    delta: 0.1
                });
                wbRichCurseTimer = richCurseTick.nextTimer;
                if (richCurseTick.triggered) triggerWorldBossRichCurse();
                // 필살기 저지 카운터 타이머 차감 (20초 제공)
                if (wbUltimateEventActive) {
                    wbUltimateTimer -= 0.1;
                    if (wbUltimateTimer <= 0) {
                        // 저지 실패! 보스 필살기 대미지 타격
                        wbUltimateEventActive = false;
                        const ultO = document.getElementById("wbUltimateWarningOverlay");
                        if (ultO) ultO.classList.add("hidden");
                        const ultDmg = Math.floor(wbPlayerMaxHp * 0.30);
                        wbPlayerHp -= ultDmg;
                        const hpT = document.getElementById("wbPlayerHpText");
                        if (hpT) hpT.innerText = `${Math.max(0, wbPlayerHp)} / ${wbPlayerMaxHp} HP`;
                        triggerWorldBossAttackAnim(`💥 [저지 실패] 보스 필살기 강타! -${ultDmg} HP!`);
                        playSoundEffect('incorrect');
                        generateWorldBossQuiz();
                        if (wbPlayerHp <= 0) {
                            endWorldBossRaid("💀 월드보스의 필살기 공격을 막아내지 못하고 패배하셨습니다!");
                            return;
                        }
                    }
                } else if (wbTimerRemaining <= wbNextUltimateTime && wbTimerRemaining > 15) {
                    // 보스 필살기 차징 카운터 이벤트 시작!
                    wbUltimateEventActive = true;
                    wbUltimateTimer = 20.0; // 20초 제공!
                    wbNextUltimateTime = wbNextUltimateTime - 60.0;
                    const ultO = document.getElementById("wbUltimateWarningOverlay");
                    if (ultO) {
                        ultO.classList.remove("hidden");
                        ultO.classList.add("flex");
                    }
                    playSoundEffect('alert');
                    showWorldBossFxNotice(`🚨 [긴급] 보스 필살기 발동! 20초 내 카운터 스펠을 완성하세요! (타이머 ⏸️ 일시중지)`, "text-red-400 border-red-500 animate-pulse");
                    generateWorldBossQuiz();
                }

                // 쿨타임 카운트다운
                for (let sId in wbSkillCooldowns) {
                    if (wbSkillCooldowns[sId] > 0) {
                        wbSkillCooldowns[sId] -= 0.1;
                        if (wbSkillCooldowns[sId] <= 0) {
                            delete wbSkillCooldowns[sId];
                        }
                    }
                }
                updateWorldBossSkillCooldownsUI();
                updateWorldBossHudUI();

                // 1초 단위로 중간 저장 (이탈 대비)
                if (Math.floor(wbTimerRemaining * 10) % 10 === 0) {
                    try {
                        const todayStr = getKstDayString();
                        const inProgressKey = `vocahero_wb_progress_${gameState.grade}_${gameState.classNum}_${gameState.studentNum}_${gameState.name}`;
                        localStorage.setItem(inProgressKey, JSON.stringify({
                            date: todayStr,
                            wbTimerRemaining,
                            wbTotalDamageDealt,
                            wbCorrectAnswers,
                            wbPlayerHp,
                            wbSkillCooldowns,
                            wbRichCurseTimer,
                            wbPetHintRemaining
                        }));
                    } catch(e) {}
                }

                if (wbTimerRemaining <= 0) {
                    endWorldBossRaid("⏱️ 180초 제한시간이 초과되어 토벌전이 완료되었습니다!");
                }
            }, 100);
        }

        function triggerHeroAttackAnim() {
            const hero = document.getElementById("wbHeroSprite");
            const boss = document.getElementById("wbBossSprite");
            if (hero) {
                hero.classList.add("animate-slash");
                setTimeout(() => hero.classList.remove("animate-slash"), 200);
            }
            if (boss) {
                boss.classList.add("animate-shake");
                setTimeout(() => boss.classList.remove("animate-shake"), 200);
            }
        }

        function triggerWorldBossAttackAnim(msg) {
            const boss = document.getElementById("wbBossSprite");
            const hero = document.getElementById("wbHeroSprite");
            if (boss) {
                boss.classList.add("animate-slash");
                setTimeout(() => boss.classList.remove("animate-slash"), 200);
            }
            if (hero) {
                hero.classList.add("animate-shake");
                setTimeout(() => hero.classList.remove("animate-shake"), 200);
            }
            showWorldBossFxNotice(msg, "text-red-400 border-red-600");
        }

        function showWorldBossFxNotice(text, colorClasses) {
            const notice = document.getElementById("wbBattleFxNotice");
            const txtEl = document.getElementById("wbBattleFxText");
            if (!notice || !txtEl) return;

            txtEl.innerText = text;
            txtEl.className = `text-xs font-black bg-black/90 border px-3 py-1.5 shadow-lg tracking-wider ${colorClasses || 'text-yellow-300 border-yellow-500'}`;
            
            notice.classList.remove("opacity-0", "scale-95");
            notice.classList.add("opacity-100", "scale-105");

            clearTimeout(notice._timer);
            notice._timer = setTimeout(() => {
                notice.classList.remove("opacity-100", "scale-105");
                notice.classList.add("opacity-0", "scale-95");
            }, 1200);
        }

        function spawnWbDamageParticle(text, isSkill = false) {
            const container = document.getElementById("wbDamageParticleBox");
            if (!container) return;

            const p = document.createElement("div");
            p.className = "damage-particle font-black  text-sm z-50 drop-shadow-[0_2px_4px_rgba(0,0,0,1)]";
            p.style.right = `${10 + Math.random() * 25}%`;
            p.style.top = `${20 + Math.random() * 40}%`;
            p.style.color = isSkill ? "#ec4899" : "#f59e0b";
            p.innerText = text;

            container.appendChild(p);
            setTimeout(() => p.remove(), 700);
        }

        function triggerWorldBossRichCurse() {
            const container = document.getElementById("wbRaidSkillsContainer");
            if (!container) return;
            const cards = Array.from(container.querySelectorAll('button[id^="wb-skill-btn-"]'));
            if (cards.length < 2) return;
            for (let i = cards.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [cards[i], cards[j]] = [cards[j], cards[i]];
            }
            cards.forEach((card) => {
                container.appendChild(card);
                card.classList.add('animate-pulse');
                setTimeout(() => card.classList.remove('animate-pulse'), 700);
            });
            playSoundEffect('alert');
            showWorldBossFxNotice("🔮 [사령의 저주] 장착 마법 스킬의 위치가 뒤섞였습니다!", "text-purple-300 border-purple-500 animate-pulse");
        }

        function renderWorldBossRaidSkills() {
            const container = document.getElementById("wbRaidSkillsContainer");
            if (!container) return;

            if (!gameState.equippedSkills || gameState.equippedSkills.length === 0) {
                container.innerHTML = `<p class="text-[8px] text-[#7e7e7e] text-center col-span-4 py-2">장착된 마법 스킬이 없습니다.</p>`;
                return;
            }

            let html = "";
            gameState.equippedSkills.forEach(id => {
                const s = gameState.skillsInventory ? gameState.skillsInventory.find(item => String(item.id) === String(id)) : null;
                if (s) {
                    const gradeInfo = SKILL_GRADES[s.grade] || SKILL_GRADES.normal;
                    const mult = getSkillMultiplier(s);
                    const cdLeft = wbSkillCooldowns[String(s.id)] || wbSkillCooldowns[id] || 0;
                    const isCd = cdLeft > 0;
                    const maxCd = s.maxCooldown || 30.0;
                    const pct = isCd ? Math.round((cdLeft / maxCd) * 100) : 0;

                    html += `
                        <button id="wb-skill-btn-${s.id}" onclick="castWorldBossSkill('${s.id}')" ${isCd ? 'disabled' : ''} 
                                class="relative overflow-hidden p-1.5 ${gradeInfo.colorClass} border-2 hover:scale-[1.02] text-left rounded-none-forced flex flex-col justify-between h-14 transition duration-150 group cursor-pointer shadow-lg ${isCd ? 'opacity-60 cursor-not-allowed' : ''}">
                            <div class="wb-cd-overlay absolute bottom-0 left-0 h-1 bg-red-600 transition-all pointer-events-none" style="width: ${pct}%; display: ${isCd ? 'block' : 'none'};"></div>
                            <div class="flex justify-between items-center w-full z-10">
                                <span class="text-[8px] sm:text-[9px] font-extrabold  truncate tracking-tighter text-white group-hover:text-yellow-300">${capitalizeFirstLetter(s.word)}</span>
                                <span class="wb-cd-timer text-[8px] ${isCd ? 'text-red-400 font-bold  animate-pulse' : 'text-pink-400 font-bold'} z-10 ">
                                    ${isCd ? `⏳ ${cdLeft.toFixed(1)}s` : `⚡ ×${mult}배`}
                                </span>
                            </div>
                            <div class="flex justify-between items-center w-full z-10 text-[8px]">
                                <span class="text-gray-300 font-medium truncate">${s.meaning}</span>
                                <span class="text-[8px] font-extrabold px-1 rounded bg-black/50 border border-white/20">${gradeInfo.name}</span>
                            </div>
                        </button>
                    `;
                }
            });
            container.innerHTML = html;
        }

        function updateWorldBossSkillCooldownsUI() {
            if (!gameState.equippedSkills) return;
            gameState.equippedSkills.forEach(id => {
                const s = gameState.skillsInventory ? gameState.skillsInventory.find(item => String(item.id) === String(id)) : null;
                if (!s) return;
                const btn = document.getElementById(`wb-skill-btn-${s.id}`);
                if (!btn) return;

                const cdLeft = wbSkillCooldowns[String(s.id)] || wbSkillCooldowns[id] || 0;
                const isCd = cdLeft > 0;
                const maxCd = s.maxCooldown || 30.0;
                const pct = isCd ? Math.round((cdLeft / maxCd) * 100) : 0;

                const cdOverlay = btn.querySelector('.wb-cd-overlay');
                const cdTimerText = btn.querySelector('.wb-cd-timer');

                if (isCd) {
                    btn.disabled = true;
                    btn.classList.add("opacity-60", "cursor-not-allowed");
                    if (cdOverlay) {
                        cdOverlay.style.display = "block";
                        cdOverlay.style.width = `${pct}%`;
                    }
                    if (cdTimerText) {
                        cdTimerText.innerText = `⏳ ${cdLeft.toFixed(1)}s`;
                        cdTimerText.className = "wb-cd-timer text-[8px] text-red-400 font-bold  animate-pulse z-10";
                    }
                } else {
                    btn.disabled = false;
                    btn.classList.remove("opacity-60", "cursor-not-allowed");
                    if (cdOverlay) {
                        cdOverlay.style.display = "none";
                        cdOverlay.style.width = "0%";
                    }
                    if (cdTimerText) {
                        const mult = getSkillMultiplier(s);
                        cdTimerText.innerText = `⚡ ×${mult}배`;
                        cdTimerText.className = "wb-cd-timer text-[8px] text-pink-400 font-bold z-10";
                    }
                }
            });
        }

        let wbPetHintRemaining = 3;
        let wbPetHintMaxCount = 3;
        let wbLastHintWordObj = null; // 동일 문제 중복 힌트 차감 방지 메모리

        function renderWorldBossPetStage() {
            const petLayer = document.getElementById("wbPetStageLayer");
            if (!petLayer) return;

            let petHtml = "";
            const petKeys = ['slime', 'dragon', 'fairy'];
            petKeys.forEach(type => {
                const info = PET_PARAMS[type];
                const lvl = (gameState.petLevels && gameState.petLevels[type]) || 0;
                const stage = lvl > 0 ? Math.min(10, Math.ceil(lvl / 10)) : 1;
                const imgUrl = `media/pet_${type}/pet_${type}_${stage}.webp`;
                
                // 3종 펫 모두 오른쪽(보스 방향)을 바라보도록 180도 좌우반전 적용!
                const isFlipped = 'transform: scale(-1, 1);';
                
                petHtml += `
                    <div class="relative group flex flex-col items-center">
                        <img src="${imgUrl}" alt="${info.name}" style="${isFlipped}" class="w-10 h-10 object-contain filter drop-shadow-[0_0_8px_rgba(253,224,71,0.8)] animate-hover-pet">
                        <span class="text-[8px] font-bold ${lvl > 0 ? 'text-yellow-300' : 'text-gray-500'}  bg-black/80 px-1 border border-yellow-500/50">Lv.${lvl}</span>
                    </div>
                `;
            });
            petLayer.innerHTML = petHtml;
        }

        function updatePetHintBtnUI() {
            const btnText = document.getElementById("wbPetHintText");
            const btnIcon = document.getElementById("wbPetHintIcon");
            const btn = document.getElementById("wbPetHintBtn");
            if (!btn || !btnText) return;

            if (wbPetHintRemaining > 0) {
                btn.disabled = false;
                btn.className = "bg-gradient-to-r from-yellow-500 to-amber-600 hover:from-yellow-400 hover:to-amber-500 text-black font-extrabold text-xs px-3.5 py-1.5 border border-yellow-300 rounded-none-forced shadow-lg flex items-center gap-1.5 transition active:scale-95 cursor-pointer";
                btnText.innerText = `소환수 힌트 찬스! (남은 힌트: ${wbPetHintRemaining}/${wbPetHintMaxCount}회)`;
                if (btnIcon) btnIcon.innerText = "🧚";
            } else {
                btn.disabled = true;
                btn.className = "bg-gray-800 text-gray-400 font-bold text-xs px-3.5 py-1.5 border border-gray-600 rounded-none-forced shadow-none flex items-center gap-1.5 cursor-not-allowed opacity-60";
                btnText.innerText = `소환수 힌트 소진 (${wbPetHintMaxCount}회 사용 완료)`;
                if (btnIcon) btnIcon.innerText = "🔒";
            }
        }

        function usePetHintAssistant() {
            if (!isWorldBossRaidActive || !wbCurrentWordObj) return;

            if (wbPetHintRemaining <= 0) {
                showToast("🔒 소환수 힌트 찬스를 모두 소진하셨습니다!");
                return;
            }

            wbPetHintRemaining--;
            updatePetHintBtnUI();
            playSoundEffect('levelup');

            // 가장 높은 레벨의 펫 선별
            let bestPet = '요정';
            const slimeLvl = (gameState.petLevels && gameState.petLevels['slime']) || 0;
            const dragonLvl = (gameState.petLevels && gameState.petLevels['dragon']) || 0;
            const fairyLvl = (gameState.petLevels && gameState.petLevels['fairy']) || 0;
            if (dragonLvl >= slimeLvl && dragonLvl >= fairyLvl) bestPet = '드래곤';
            else if (slimeLvl >= dragonLvl && slimeLvl >= fairyLvl) bestPet = '슬라임';

            const word = wbCurrentWordObj.word.toLowerCase();
            const wordUpper = word.toUpperCase();
            const wordLen = word.length;

            // 동일 문제에서 몇 번째 힌트인지 추적
            if (!wbLastHintWordObj || wbLastHintWordObj.word !== wbCurrentWordObj.word) {
                wbLastHintWordObj = wbCurrentWordObj;
                wbCurrentHintLetterIndex = 0;
            }
            
            wbCurrentHintLetterIndex = Math.min(wordLen, wbCurrentHintLetterIndex + 1);
            const revealedSubstr = wordUpper.slice(0, wbCurrentHintLetterIndex);

            let hintMsg = `🧚 [${bestPet}] "${wbCurrentHintLetterIndex}번째 철자 힌트: '${revealedSubstr}'" (총 ${wordLen}글자 / 뜻: ${wbCurrentWordObj.meaning})`;
            showWorldBossFxNotice(hintMsg, "text-yellow-300 border-yellow-400");
            showToast(`💡 소환수 ${bestPet}의 힌트: 철자 '${revealedSubstr}' 단계까지 공개되었습니다!`);

            // 1. [단답식 필기] 문제인 경우: 입력창에 공개된 글자까지 순차 기입
            const shortInput = document.getElementById("wbShortAnswerInput");
            if (shortInput) {
                shortInput.value = word.slice(0, wbCurrentHintLetterIndex);
                shortInput.focus();
                checkWbShortAnswerAutoSubmit(shortInput);
            }

            // 2. [철자 조합] 문제인 경우: 공개된 순서대로 블록 자동 정렬 조립
            if (wbCurrentQuizType === "unscramble") {
                resetWbUnscramble();
                const targetLetters = word.slice(0, wbCurrentHintLetterIndex).split("");
                
                targetLetters.forEach(char => {
                    // 아직 클릭 안 한 타일 중 해당 글자 타일 찾아서 클릭 처리
                    const letters = wbCurrentWordObj.word.toLowerCase().split("");
                    for (let idx = 0; idx < letters.length; idx++) {
                        const tileId = `wbTile_${idx}`;
                        const btn = document.getElementById(tileId);
                        if (btn && !btn.disabled && btn.innerText.trim().toLowerCase() === char) {
                            clickWbUnscrambleTile(char, tileId);
                            break;
                        }
                    }
                });
            }
        }

        function castWorldBossSkill(skillId) {
            if (!isWorldBossRaidActive || !gameState.skillsInventory) return;
            const skill = gameState.skillsInventory.find(s => String(s.id) === String(skillId));
            if (!skill) return;

            const cdKey = String(skill.id);
            if (wbSkillCooldowns[cdKey] > 0) return;
            let richWeaknessTriggeredBySkill = false;

            if (isWorldBossRaidActive && wbBossState === "normal" && wbGracePeriodTimer <= 0) {
                const seasonIdx = getWeeklyBossIndex();
                const bossInfo = WORLD_BOSS_SEASONS[seasonIdx] || WORLD_BOSS_SEASONS[0];
                if (bossInfo.id === 'rich') {
                    const richCastResolution = resolveRichSkillCastState({
                        bossId: bossInfo.id,
                        bossState: wbBossState,
                        gracePeriodTimer: wbGracePeriodTimer,
                        skillCastCount: wbSkillCastCount
                    });
                    wbSkillCastCount = richCastResolution.nextSkillCastCount;
                    if (richCastResolution.triggered) {
                        wbBossState = "weakness_shattered";
                        richWeaknessTriggeredBySkill = true;
                        updateCurrentWbQuizOptionTheme();
                        wbWeaknessTimer = 15.0;
                        wbSkillCooldowns = {};
                        updateWorldBossSkillCooldownsUI();
                        const shatterOverlay = document.getElementById("wbWeaknessShatterOverlay");
                        if (shatterOverlay) {
                            shatterOverlay.classList.remove("hidden");
                            shatterOverlay.classList.add("flex");
                            setTimeout(() => {
                                shatterOverlay.classList.remove("flex");
                                shatterOverlay.classList.add("hidden");
                            }, 1800);
                        }
                        playSoundEffect('skill');
                        showWorldBossFxNotice("✨ [결계 정화!] 리치의 저주 파쇄 & 모든 스킬 쿨타임 즉시 초기화! (스킬 피해 +150%)", "text-purple-300 border-purple-500 animate-bounce");
                    }
                }
            }

            // 💍 지혜의 목걸이 (necklaceLvl) 쿨타임 감소 적용 (-0.3%/lv, 최대 -30%) + 유물
            const necklaceCdRed = Math.min(30, (gameState.necklaceLvl || 0) * 0.3);
            const relicCdRed = getEquippedRelicBonus("relic_clock");
            const totalCdRed = Math.min(60, necklaceCdRed + relicCdRed);
            const baseCd = skill.maxCooldown || 30.0;
            if (!richWeaknessTriggeredBySkill) wbSkillCooldowns[cdKey] = baseCd * (1 - totalCdRed / 100);

            // 스킬 원어민 음성 발음 재생
            if ('speechSynthesis' in window) {
                const ss = gameState.soundSettings || {};
                const isSkillSfxOn = (typeof ss.masterSoundOn !== 'undefined' && !ss.masterSoundOn) ? false : (typeof ss.sfxSkill !== 'undefined' ? ss.sfxSkill : true);
                if (isSkillSfxOn) {
                    window.speechSynthesis.cancel();
                    const utterance = new SpeechSynthesisUtterance(skill.word);
                    utterance.lang = 'en-US';
                    utterance.rate = 0.9;
                    const masterScale = (typeof ss.masterVolume !== 'undefined' ? ss.masterVolume : 10) / 10;
                    const skillScale = (typeof ss.volSkill !== 'undefined' ? ss.volSkill : 10) / 10;
                    utterance.volume = masterScale * skillScale;
                    window.speechSynthesis.speak(utterance);
                }
            }



            const gradeInfo = SKILL_GRADES[skill.grade] || SKILL_GRADES.normal;
            const mult = getSkillMultiplier(skill);

            // 💍 지혜의 목걸이 (necklaceLvl) 스킬 마법 피해 +1.5%/lv & 잠재력 & 유물
            const necklaceSkillBonus = (gameState.necklaceLvl || 0) * 1.5;
            const potentialSkillBonus = getPotentialStatBonus('skillDmg');
            const relicSkillBonus = getEquippedRelicBonus("relic_scroll");
            const totalSkillMult = 1 + (necklaceSkillBonus + potentialSkillBonus + relicSkillBonus) / 100;

            // 월드보스 상태 배율 계산
            let bossStateSkillMult = 1.0;
            if (isWorldBossRaidActive) {
                const sIdx = getWeeklyBossIndex();
                const bInfo = WORLD_BOSS_SEASONS[sIdx] || WORLD_BOSS_SEASONS[0];
                if (wbBossState === "weakness_shattered") {
                    bossStateSkillMult = (bInfo.id === 'fafnir' ? 2.5 : bInfo.id === 'golem' ? 3.0 : 2.5);
                } else if (bInfo.id === 'golem' && wbBossState === "normal") {
                    bossStateSkillMult = 0.4;
                }
            }

            // 월드보스는 "내 전투력" 수치를 기반으로 데미지가 결정됨
            // 기본 타격 = 전투력 * 2
            const baseDmg = calculatePlayerCP() * 2;
            const statSkillDmg = Math.floor(baseDmg * mult * totalSkillMult * bossStateSkillMult);

            // 최소 보장 데미지 로직 (기본 타격력 반영)
            const wbQuizDmgFloor = Math.floor(calculatePlayerCP() * (mult / 2) * bossStateSkillMult);
            const skillDmg = Math.max(statSkillDmg, wbQuizDmgFloor);

            wbTotalDamageDealt += skillDmg;
            updateWorldBossBattleHpBar();
            
            triggerHeroAttackAnim();

            // 전장 화려한 검기/마법 비기 베기 이펙트(Magic Blast) 생성
            const arena = document.getElementById("wbVisualStage");
            if (arena) {
                const blastEffect = document.createElement("div");
                blastEffect.className = "animate-skill-blast flex flex-col items-center justify-center pointer-events-none z-50";
                
                let blastIcon = "💥";
                if (skill.grade === "mythic") blastIcon = "🌌";
                else if (skill.grade === "legendary") blastIcon = "🔥";
                else if (skill.grade === "hero") blastIcon = "⚡";
                else if (skill.grade === "rare") blastIcon = "✨";

                blastEffect.innerHTML = `
                    <span class="text-7xl filter drop-shadow-[0_0_25px_#ec4899] animate-bounce">${blastIcon}</span>
                    <span class="text-xs font-black  bg-black/90 text-yellow-300 border-2 border-pink-500 px-3 py-1 mt-1 uppercase tracking-widest shadow-2xl">${capitalizeFirstLetter(skill.word)}!</span>
                `;
                arena.appendChild(blastEffect);
                setTimeout(() => blastEffect.remove(), 700);
            }

            spawnWbDamageParticle(`💥 -${skillDmg.toLocaleString()}`, true);
            showWorldBossFxNotice(`⚡ [비기] ${gradeInfo.name} ${capitalizeFirstLetter(skill.word)}! -${skillDmg.toLocaleString()}`, "text-pink-400 border-pink-500");
            playSoundEffect('skill');
            renderWorldBossRaidSkills();
        }

        let wbCurrentQuizType = "meaning"; // "meaning", "english", "short_answer", "unscramble"
        let wbUnscrambleCurrentTiles = [];

        function getWbOptionThemeClass() {
            if (wbBossState === "weakness_shattered") {
                return "wb-shattered-bg";
            }
            const seasonIdx = getWeeklyBossIndex();
            const bossInfo = WORLD_BOSS_SEASONS[seasonIdx] || WORLD_BOSS_SEASONS[0];
            if (bossInfo.id === 'fafnir') return "wb-boss-fafnir-bg";
            if (bossInfo.id === 'golem') return "wb-boss-golem-bg";
            if (bossInfo.id === 'rich') return "wb-boss-rich-bg";
            return "wb-boss-fafnir-bg";
        }

        function updateCurrentWbQuizOptionTheme() {
            const container = document.getElementById("wbChoiceContainer");
            if (!container) return;
            const newClass = getWbOptionThemeClass();
            const allThemeClasses = ["wb-boss-fafnir-bg", "wb-boss-golem-bg", "wb-boss-rich-bg", "wb-shattered-bg"];
            
            container.querySelectorAll("button, div").forEach(el => {
                allThemeClasses.forEach(c => el.classList.remove(c));
                el.classList.add(newClass);
            });
        }

        function generateWorldBossQuiz() {
            let pool = gameState.wordsPool && gameState.wordsPool.length > 0 ? gameState.wordsPool : MOCK_WORDS["4"];
            wbCurrentWordObj = pool[Math.floor(Math.random() * pool.length)];

            const quizWordEl = document.getElementById("wbQuizWord");
            const choiceContainer = document.getElementById("wbChoiceContainer");
            const seasonIdx = getWeeklyBossIndex();
            const bossInfo = WORLD_BOSS_SEASONS[seasonIdx] || WORLD_BOSS_SEASONS[0];

            wbIsFlameActive = false;

            if (wbUltimateEventActive) {
                // 필살기 카운터 저지 이벤트: 단답식 입력창 팝업!
                wbCurrentQuizType = "short_answer";
                if (quizWordEl) quizWordEl.innerHTML = `<span class="text-red-500 animate-pulse">[🚨 필살기 카운터 저지!]</span> ${wbCurrentWordObj.meaning}`;
                if (choiceContainer) {
                    choiceContainer.className = "flex flex-col gap-2 z-10 w-full col-span-2";
                    choiceContainer.innerHTML = `
                        <div class="flex gap-2 w-full">
                            <input type="text" id="wbShortAnswerInput" placeholder="카운터 영단어를 신속히 입력하세요..." autocomplete="off"
                                class="flex-1 bg-black border-2 border-red-600 focus:border-yellow-400 px-4 py-2.5 font-black text-base text-yellow-300 outline-none rounded-none-forced animate-pulse"
                                oninput="checkWbShortAnswerAutoSubmit(this)"
                                onkeydown="if(event.key==='Enter' && !event.isComposing) submitWbShortAnswer()">
                            <button onclick="submitWbShortAnswer()" class="bg-red-700 hover:bg-red-600 text-white font-black text-xs px-6 py-2.5 border-2 border-yellow-400 rounded-none-forced transition shadow-xl animate-bounce">
                                💥 카운터 타격!
                            </button>
                        </div>
                    `;
                }
                setTimeout(() => {
                    const input = document.getElementById("wbShortAnswerInput");
                    if (input) input.focus();
                }, 50);
                updateWorldBossHudUI();
                return;
            }

            // 일반 상태: 100% 터치 전용 (사지선다 뜻/영어, 타일 조합만 출제! short_answer 제외)
            const quizTypes = ["meaning", "english", "unscramble"];
            wbCurrentQuizType = quizTypes[Math.floor(Math.random() * quizTypes.length)];

            // 🐲 심연의 흑룡 파브니르 패턴: 40% 확률로 모든 보기/타일 화염 가림 처리
            if (bossInfo.id === 'fafnir' && (wbCurrentQuizType === 'meaning' || wbCurrentQuizType === 'english' || wbCurrentQuizType === 'unscramble')) {
                if (Math.random() < 0.4) {
                    wbIsFlameActive = true;
                }
            }

            const themeClass = getWbOptionThemeClass();

            if (wbCurrentQuizType === "meaning") {
                if (quizWordEl) quizWordEl.innerText = `[뜻 찾기] ${capitalizeFirstLetter(wbCurrentWordObj.word)}`;
                let choices = [wbCurrentWordObj.meaning];
                let meanings = [];
                pool.forEach(item => {
                    if (item.meaning !== wbCurrentWordObj.meaning && !meanings.includes(item.meaning)) {
                        meanings.push(item.meaning);
                    }
                });
                meanings.sort(() => 0.5 - Math.random());
                for (let i = 0; i < Math.min(3, meanings.length); i++) choices.push(meanings[i]);
                choices.sort(() => 0.5 - Math.random());

                let html = "";
                choices.forEach((m, idx) => {
                    const isCorrect = (m === wbCurrentWordObj.meaning);
                    const isBlind = wbIsFlameActive;
                    const blindClass = isBlind ? "flame-blind-overlay" : "";
                    html += `
                        <button onclick="handleWorldBossAnswer(${isCorrect}, ${idx})" class="p-3.5 ${themeClass} hover:brightness-125 border text-white font-bold text-xs rounded-none-forced transition active:scale-95 shadow-sm relative overflow-hidden ${blindClass}">
                            ${m}
                        </button>
                    `;
                });
                if (choiceContainer) {
                    choiceContainer.className = "grid grid-cols-2 gap-2 z-10";
                    choiceContainer.innerHTML = html;
                }

            } else if (wbCurrentQuizType === "english") {
                if (quizWordEl) quizWordEl.innerText = `[영어 찾기] ${wbCurrentWordObj.meaning}`;
                let choices = [wbCurrentWordObj.word];
                let words = [];
                pool.forEach(item => {
                    if (item.word !== wbCurrentWordObj.word && !words.includes(item.word)) {
                        words.push(item.word);
                    }
                });
                words.sort(() => 0.5 - Math.random());
                for (let i = 0; i < Math.min(3, words.length); i++) choices.push(words[i]);
                choices.sort(() => 0.5 - Math.random());

                let html = "";
                choices.forEach((w, idx) => {
                    const isCorrect = (w === wbCurrentWordObj.word);
                    const isBlind = wbIsFlameActive;
                    const blindClass = isBlind ? "flame-blind-overlay" : "";
                    html += `
                        <button onclick="handleWorldBossAnswer(${isCorrect}, ${idx})" class="p-3.5 ${themeClass} hover:brightness-125 border text-yellow-300 font-bold text-xs rounded-none-forced transition active:scale-95 shadow-sm relative overflow-hidden ${blindClass}">
                            ${capitalizeFirstLetter(w)}
                        </button>
                    `;
                });
                if (choiceContainer) {
                    choiceContainer.className = "grid grid-cols-2 gap-2 z-10";
                    choiceContainer.innerHTML = html;
                }

            } else if (wbCurrentQuizType === "unscramble") {
                if (bossInfo.id === 'golem') {
                    const longWords = pool.filter(item => item.word && item.word.length >= 6);
                    if (longWords.length > 0) {
                        wbCurrentWordObj = longWords[Math.floor(Math.random() * longWords.length)];
                    }
                }
                if (quizWordEl) quizWordEl.innerText = `[철자 조합] ${wbCurrentWordObj.meaning}`;
                const letters = wbCurrentWordObj.word.toLowerCase().split("");
                letters.sort(() => 0.5 - Math.random());
                wbUnscrambleCurrentTiles = [];

                let letterButtonsHtml = letters.map((char, idx) => `
                    <button id="wbTile_${idx}" onclick="clickWbUnscrambleTile('${char}', 'wbTile_${idx}')"
                        class="w-10 h-10 ${themeClass} hover:brightness-125 border text-yellow-300 font-black text-base rounded-none-forced transition shadow-md relative overflow-hidden ${wbIsFlameActive ? 'flame-blind-overlay' : ''}">
                        ${char}
                    </button>
                `).join("");

                if (choiceContainer) {
                    choiceContainer.className = "flex flex-col gap-2 z-10 w-full col-span-2";
                    choiceContainer.innerHTML = `
                        <div class="bg-black border border-red-900 p-2 flex flex-col items-center gap-2">
                            <div id="wbUnscrambleAnswerDisplay" class="h-10 min-w-[200px] ${themeClass} border border-yellow-500/80 px-4 flex items-center justify-center font-black text-lg text-yellow-300 tracking-widest">
                                _ _ _ _
                            </div>
                            <div class="flex flex-wrap justify-center gap-1.5 my-1">
                                ${letterButtonsHtml}
                            </div>
                            <div class="flex gap-2">
                                <button onclick="resetWbUnscramble()" class="text-[10px] bg-gray-800 text-gray-300 px-3 py-1 font-bold">🔄 다시 조립</button>
                                <button onclick="submitWbUnscramble()" class="text-[10px] bg-yellow-600 hover:bg-yellow-500 text-black font-black px-4 py-1">💥 최종 공격!</button>
                            </div>
                        </div>
                    `;
                }
            }

            updateWorldBossHudUI();
        }

        function checkWbShortAnswerAutoSubmit(inputEl) {
            if (!isWorldBossRaidActive || !wbCurrentWordObj || !inputEl) return;
            if (!formatEnglishWordInput(inputEl)) return;
            const val = normalizeEnglishAnswer(inputEl.value);
            const targetWord = normalizeEnglishAnswer(wbCurrentWordObj.word);
            if (val && val === targetWord) handleWorldBossAnswer(true);
        }

        function clickWbUnscrambleTile(char, btnId) {
            const btn = document.getElementById(btnId);
            if (!btn || btn.disabled) return;

            btn.disabled = true;
            btn.classList.add("opacity-30");
            wbUnscrambleCurrentTiles.push({ char, btnId });

            renderWbUnscrambleAnswer();

            const userWord = wbUnscrambleCurrentTiles.map(t => t.char).join("").toLowerCase();
            const targetWord = wbCurrentWordObj ? wbCurrentWordObj.word.toLowerCase() : "";
            if (userWord === targetWord) {
                submitWbUnscramble();
            }
        }

        function renderWbUnscrambleAnswer() {
            const display = document.getElementById("wbUnscrambleAnswerDisplay");
            if (!display) return;
            const str = wbUnscrambleCurrentTiles.map(t => t.char).join(" ");
            display.innerText = str.length > 0 ? str : "_ _ _ _";
        }

        function resetWbUnscramble() {
            wbUnscrambleCurrentTiles.forEach(t => {
                const btn = document.getElementById(t.btnId);
                if (btn) {
                    btn.disabled = false;
                    btn.classList.remove("opacity-30");
                }
            });
            wbUnscrambleCurrentTiles = [];
            renderWbUnscrambleAnswer();
        }

        function submitWbUnscramble() {
            const userWord = wbUnscrambleCurrentTiles.map(t => t.char).join("").toLowerCase();
            const targetWord = wbCurrentWordObj ? wbCurrentWordObj.word.toLowerCase() : "";
            handleWorldBossAnswer(userWord === targetWord);
        }

        function submitWbShortAnswer() {
            const input = document.getElementById("wbShortAnswerInput");
            if (!input || !formatEnglishWordInput(input)) return;
            const val = normalizeEnglishAnswer(input.value);
            if (!val) {
                showToast("⚠️ 영단어를 입력해 주세요.");
                return;
            }
            const targetWord = wbCurrentWordObj ? normalizeEnglishAnswer(wbCurrentWordObj.word) : "";
            handleWorldBossAnswer(val === targetWord);
        }

        function handleWorldBossAnswer(isCorrect, clickedIndex) {
            if (!isWorldBossRaidActive) return;

            const seasonIdx = getWeeklyBossIndex();
            const bossInfo = WORLD_BOSS_SEASONS[seasonIdx] || WORLD_BOSS_SEASONS[0];
            if (isCorrect) wbCorrectAnswers++;

            // 보스 필살기 카운터 저지 이벤트 판정
            if (wbUltimateEventActive) {
                wbUltimateEventActive = false;
                const ultO = document.getElementById("wbUltimateWarningOverlay");
                if (ultO) ultO.classList.add("hidden");

                if (isCorrect) {
                    playSoundEffect('levelup');
                    playSoundEffect('skill');

                    let baseHeroDmg = (calculateClickAttackPower() * 400) + (calculateDPSPower() * 100);
                    let counterDmg = Math.floor(baseHeroDmg * 3.0);

                    wbTotalDamageDealt += counterDmg;
                    updateWorldBossBattleHpBar();
                    spawnWbDamageParticle(`💥 COUNTER! -${counterDmg.toLocaleString()}`, true);

                    const stageView = document.getElementById("wbVisualStage");
                    if (stageView) {
                        stageView.classList.add("animate-shake");
                        setTimeout(() => stageView.classList.remove("animate-shake"), 450);
                    }

                    showWorldBossFxNotice(`⚡ [카운터 성공!] 보스 필살기 완전 파괴! -${counterDmg.toLocaleString()} HP!`, "text-yellow-300 border-yellow-400 shadow-2xl");
                    generateWorldBossQuiz();
                } else {
                    playSoundEffect('incorrect');
                    const ultDmg = Math.floor(wbPlayerMaxHp * 0.3);
                    wbPlayerHp -= ultDmg;
                    wbTimerRemaining -= 10;
                    if (wbTimerRemaining <= 0) wbTimerRemaining = 0.1;
                    const hpT = document.getElementById("wbPlayerHpText");
                    if (hpT) hpT.innerText = `${Math.max(0, wbPlayerHp)} / ${wbPlayerMaxHp} HP`;
                    triggerWorldBossAttackAnim(`💔 카운터 실패! 보스 필살기 폭발 -${ultDmg} HP 및 시간 10초 감소!`);

                    if (wbPlayerHp <= 0) {
                        endWorldBossRaid("💀 보스의 필살기 공격을 막아내지 못하고 사망하셨습니다!");
                    } else {
                        generateWorldBossQuiz();
                    }
                }
                return;
            }

            // 일반 모드 정답/오답 판정
            if (isCorrect) {
                playSoundEffect('correct');
                wbComboCount++;

                // 보스별 약점 파훼 트리거 판정
                // 골렘은 ① 6글자 이상 철자조합과 ② 10콤보를 서로 독립된 경로로 판정한다.
                let isWeaknessTriggered = false;
                let weaknessTriggerKind = "";
                let resetComboAfterAnswer = false;
                const comboForThisAnswer = wbComboCount;
                if (wbBossState === "normal" && wbGracePeriodTimer <= 0) {
                    if (bossInfo.id === 'fafnir') {
                        const isFlameAnswerHit = (wbIsFlameActive === true);
                        if (isFlameAnswerHit || wbComboCount >= 10) {
                            isWeaknessTriggered = true;
                            weaknessTriggerKind = wbComboCount >= 10 ? "combo" : "flame";
                            resetComboAfterAnswer = true;
                        }
                    } else if (bossInfo.id === 'golem') {
                        const currentRaidWord = String(wbCurrentWordObj?.word || "");
                        const isLongUnscramble = wbCurrentQuizType === 'unscramble' && currentRaidWord.length >= 6;
                        const isTenCombo = wbComboCount >= 10;
                        if (isTenCombo || isLongUnscramble) {
                            isWeaknessTriggered = true;
                            weaknessTriggerKind = isTenCombo ? "combo" : "long-unscramble";
                            // 6글자 철자조합 성공은 콤보 경로를 끊지 않는다. 10콤보 달성 때만 콤보를 소모한다.
                            resetComboAfterAnswer = isTenCombo;
                        }
                    } else if (bossInfo.id === 'rich') {
                        if (wbComboCount >= 10 || wbSkillCastCount >= 4) {
                            isWeaknessTriggered = true;
                            weaknessTriggerKind = wbComboCount >= 10 ? "combo" : "skill";
                            resetComboAfterAnswer = true;
                        }
                    }
                }
                if (isWeaknessTriggered && wbBossState !== "weakness_shattered") {
                    wbBossState = "weakness_shattered";
                    updateCurrentWbQuizOptionTheme();
                    wbWeaknessTimer = (bossInfo.id === 'rich' ? 15.0 : bossInfo.id === 'fafnir' ? 10.0 : 12.0);
                    // 콤보 소모 여부는 정답 피해와 협공 연출이 끝난 뒤 경로별로 처리한다.
                    if (bossInfo.id === 'rich') {
                        wbSkillCooldowns = {};
                        updateWorldBossSkillCooldownsUI();
                        showWorldBossFxNotice("✨ [결계 정화!] 리치의 저주 파쇄 & 모든 스킬 쿨타임 즉시 초기화! (스킬 피해 +150%)", "text-purple-300 border-purple-500 animate-bounce");
                    }
                    
                    const shatterOverlay = document.getElementById("wbWeaknessShatterOverlay");
                    if (shatterOverlay) {
                        shatterOverlay.classList.remove("hidden");
                        shatterOverlay.classList.add("flex");
                        setTimeout(() => {
                            shatterOverlay.classList.remove("flex");
                            shatterOverlay.classList.add("hidden");
                        }, 1800);
                    }

                    const stageView = document.getElementById("wbVisualStage");
                    if (stageView) {
                        stageView.classList.add("animate-shake");
                        setTimeout(() => stageView.classList.remove("animate-shake"), 450);
                    }
                    playSoundEffect('skill');
                }

                // 유형별 딜량 배율 (뜻: 1.0, 영어: 1.2, 조합: 1.6)
                let typeMultiplier = 1.0;
                if (wbCurrentQuizType === "english") typeMultiplier = 1.2;
                if (wbCurrentQuizType === "unscramble") typeMultiplier = 1.6;

                // 약점 상태 및 보스별 방어력 반영
                let isGolemShatterStrike = false;
                if (wbBossState === "weakness_shattered") {
                    if (bossInfo.id === 'golem') {
                        typeMultiplier *= 10.0; // 🪨 파멸 골렘: 화면 설명과 동일한 10.0배 단일 충격파
                        isGolemShatterStrike = true;
                    } else {
                        typeMultiplier *= 2.5; // 파브니르 / 리치 2.5배
                    }
                } else if (bossInfo.id === 'golem') {
                    typeMultiplier *= 0.4; // 암석 외피 60% 감쇄
                }

                let baseHeroDmg = (calculateClickAttackPower() * 300) + (calculateDPSPower() * 50);
                let heroDmg = Math.floor(baseHeroDmg * typeMultiplier);

                // 펫 협공 데미지
                const slimeLvl = (gameState.petLevels && gameState.petLevels['slime']) || 0;
                const dragonLvl = (gameState.petLevels && gameState.petLevels['dragon']) || 0;
                const fairyLvl = (gameState.petLevels && gameState.petLevels['fairy']) || 0;

                let petNoticeText = "";
                let totalComboDmg = heroDmg;

                if (comboForThisAnswer === 1) {
                    const slimeDmg = 500 + (slimeLvl * 250);
                    totalComboDmg += slimeDmg;
                    petNoticeText = `🟢 1콤보! [슬라임] 박치기! -${slimeDmg.toLocaleString()}`;
                    spawnWbDamageParticle(`🟢 -${slimeDmg.toLocaleString()}`, false);
                } else if (comboForThisAnswer === 2) {
                    const dragonDmg = 1500 + (dragonLvl * 600);
                    totalComboDmg += dragonDmg;
                    petNoticeText = `🐉 2연속 콤보! [드래곤] 화염 브레스! -${dragonDmg.toLocaleString()}`;
                    spawnWbDamageParticle(`🐉 -${dragonDmg.toLocaleString()}`, true);
                } else {
                    const fairyDmg = 3000 + (fairyLvl * 1000);
                    const totalPetDmg = (slimeLvl * 200) + (dragonLvl * 500) + fairyDmg;
                    totalComboDmg += totalPetDmg;
                    const weakTag = (wbBossState === "weakness_shattered") ? " 💥 [약점 폭딜!]" : "";
                    petNoticeText = `✨ ${comboForThisAnswer}연속 콤보! [펫 3종] 일제 총공격! -${totalPetDmg.toLocaleString()}${weakTag}`;
                    spawnWbDamageParticle(`✨ -${totalPetDmg.toLocaleString()}`, true);
                }

                if (isGolemShatterStrike) {
                    wbBossState = "normal";
                    wbGracePeriodTimer = 0.0; // 골렘은 항시 재시도 가능!
                    updateCurrentWbQuizOptionTheme();
                    const shatterCause = weaknessTriggerKind === "combo" ? "10콤보 달성" : "6글자 이상 철자조합 정답";
                    petNoticeText = `💥 [${shatterCause}·10배 외피 붕괴!] -${totalComboDmg.toLocaleString()}! (외피 즉시 재가동)`;
                }

                wbTotalDamageDealt += totalComboDmg;
                updateWorldBossBattleHpBar();

                triggerHeroAttackAnim();
                showWorldBossFxNotice(petNoticeText, "text-yellow-300 border-yellow-500");
                if (resetComboAfterAnswer) wbComboCount = 0;
                updateWorldBossHudUI();
                generateWorldBossQuiz();
            } else {
                playSoundEffect('incorrect');
                wbComboCount = 0;
                wbWrongCount++;

                const shieldRate = getEquippedRelicBonus("relic_shield");
                const isShieldBlocked = shieldRate > 0 && (Math.random() * 100 < shieldRate);

                if (isShieldBlocked) {
                    triggerWorldBossAttackAnim(`🛡️ 대지의 수호 방패 발동! 오답 반격 완전 방어! (${shieldRate}%)`);
                } else {
                    let bossDmg = 15 + (wbWrongCount * 15);
                    let extraNotice = "";

                    // 🔮 불멸의 리치 고유 디버프: 내 HP 10% 흡혈 + 보스 체력 회복 (내 1회 정답 공격량인 전투력*300 복구)
                    if (bossInfo.id === 'rich') {
                        const vampDmg = Math.max(bossDmg, Math.floor(wbPlayerMaxHp * 0.10));
                        bossDmg = vampDmg;
                        const healAmount = Math.floor(calculatePlayerCP() * 300);
                        wbTotalDamageDealt = Math.max(0, wbTotalDamageDealt - healAmount);
                        updateWorldBossBattleHpBar();
                        extraNotice = ` (🔮 HP 10% 흡혈 & +${healAmount.toLocaleString()} HP 회복!)`;
                    }

                    wbPlayerHp -= bossDmg;
                    const hpT = document.getElementById("wbPlayerHpText");
                    if (hpT) hpT.innerText = `${Math.max(0, wbPlayerHp)} / ${wbPlayerMaxHp} HP`;
                    triggerWorldBossAttackAnim(`💔 오답 ${wbWrongCount}회! 보스 반격 -${bossDmg} HP${extraNotice}`);
                }

                if (wbPlayerHp <= 0) {
                    endWorldBossRaid("💀 연이은 오답으로 보스의 강력한 일격에 사망하셨습니다!");
                } else {
                    generateWorldBossQuiz();
                }
            }
        }

        function showWorldBossResultModal(damage, reasonMessage, rewardGold, rewardTokens) {
            const modal = document.getElementById("wbRaidResultModal");
            if (!modal) return;

            const reasonEl = document.getElementById("wbResultReasonText");
            if (reasonEl) reasonEl.innerText = reasonMessage;

            const dmgEl = document.getElementById("wbResultDamageVal");
            if (dmgEl) dmgEl.innerText = damage.toLocaleString();

            const goldEl = document.getElementById("wbResultGoldVal");
            if (goldEl) goldEl.innerText = `+${rewardGold.toLocaleString()}G`;

            const tokensEl = document.getElementById("wbResultTokensVal");
            if (tokensEl) tokensEl.innerText = `+${rewardTokens}개`;

            modal.classList.remove("hidden");
            modal.classList.add("flex");
        }

        function closeWorldBossRaidResultModal() {
            const modal = document.getElementById("wbRaidResultModal");
            if (modal) {
                modal.classList.remove("flex");
                modal.classList.add("hidden");
            }
        }

        function endWorldBossRaid(reasonMessage) {
            clearInterval(wbTimerInterval);
            isWorldBossRaidActive = false;

            const arena = document.getElementById("worldBossBattleArena");
            arena.classList.add("hidden");
            arena.classList.remove("flex");
            document.getElementById("worldBossReadyBox").classList.remove("hidden");

            try {
                const inProgressKey = `vocahero_wb_progress_${gameState.grade}_${gameState.classNum}_${gameState.studentNum}_${gameState.name}`;
                localStorage.removeItem(inProgressKey);
            } catch(e) {}

            if (!window._secureWorldBossContribute) {
                updateWorldBossUI();
                showToast("⚠️ 안전한 월드보스 정산 연결을 준비하지 못했어요. 보상은 지급되지 않았습니다. 새로고침 후 다시 참전해 주세요.");
                return;
            }

            showToast("⚔️ 전투 기록을 확인하고 보상을 정산하는 중입니다...");
            window._secureWorldBossContribute(wbTotalDamageDealt, wbCorrectAnswers).then((result) => {
                const appliedDamage = Math.max(0, Math.floor(Number(result.applied) || 0));
                const rewardGold = Math.max(0, Math.floor(Number(result.rewardGold) || 0));
                const rewardTokens = Math.max(0, Math.floor(Number(result.rewardTokens) || 0));
                const serverState = result.accountState && typeof result.accountState === "object" ? result.accountState : null;
                const previousGold = Math.max(0, Number(gameState.gold) || 0);
                const previousAccGoldValue = Number(gameState.accGold);
                const previousAccGold = Number.isFinite(previousAccGoldValue) ? Math.max(0, previousAccGoldValue) : previousGold;
                const previousBossTokens = Math.max(0, Number(gameState.bossTokens) || 0);

                gameState.gold = Number.isFinite(Number(serverState?.gold)) ? Math.max(0, Number(serverState.gold)) : previousGold + rewardGold;
                gameState.accGold = Number.isFinite(Number(serverState?.accGold)) ? Math.max(0, Number(serverState.accGold)) : previousAccGold + rewardGold;
                gameState.bossTokens = Number.isFinite(Number(serverState?.bossTokens)) ? Math.max(0, Number(serverState.bossTokens)) : previousBossTokens + rewardTokens;
                gameState.wbBestDamage = Math.max(0, Math.floor(Number(result.damage) || appliedDamage));
                gameState.wbBestDamageWeek = getCurrentWeekNum();
                markWorldBossCompleted(result.boss?.day || getKstDayString());

                playSoundEffect('levelup');
                refreshStateVisuals();
                saveLocalCache();
                updateWorldBossUI();
                showWorldBossResultModal(appliedDamage, reasonMessage, rewardGold, rewardTokens);

                const damageDisplay = document.getElementById("myWorldBossDmgDisplay");
                if (damageDisplay) damageDisplay.innerText = gameState.wbBestDamage.toLocaleString();
                const rewardDisplay = document.getElementById("myWorldBossRewardDisplay");
                if (rewardDisplay) rewardDisplay.innerText = `주간 결산 시 FP / 칭호 지급 (증표 +${rewardTokens})`;

                saveSessionToCloud(true);
                showToast(`${reasonMessage} ⚔️ 실제 피해 ${appliedDamage.toLocaleString()} · 🪙 골드 +${rewardGold.toLocaleString()}G · 🏺 증표 +${rewardTokens}개`);
            }).catch((err) => {
                console.error("World boss submission failed:", err);
                updateWorldBossUI();
                showToast("월드보스 피해와 보상이 기록되지 않았어요. 새 참전을 시작해 주세요.");
            });
        }
        function openPotentialProbModal() {
            openModal('potentialProbModal');
        }

        function showToast(message) {
            const toast = document.getElementById("toastMessage");
            const text = document.getElementById("toastText");
            if (!toast || !text) return;
            text.innerText = message;
            toast.classList.remove("opacity-0", "pointer-events-none");
            toast.classList.add("opacity-100");

            setTimeout(() => {
                toast.classList.remove("opacity-100");
                toast.classList.add("opacity-0", "pointer-events-none");
            }, 3000);
        }

        // 전투 전용 알림: 몬스터 바로 아래 화면 내에 표시
        let _battleToastTimer = null;
        function showBattleToast(message) {
            const el = document.getElementById("battleToast");
            if (!el) { showToast(message); return; }
            el.innerText = message;
            el.style.opacity = "1";
            clearTimeout(_battleToastTimer);
            _battleToastTimer = setTimeout(() => { el.style.opacity = "0"; }, 2200);
        }

        function showSkillModal(skill, gradeInfo) {
            const modal = document.getElementById("skillAcquireModal");
            const box = document.getElementById("skillAcquireBox");
            const gradeEl = document.getElementById("skillAcquireGrade");
            
            gradeEl.innerText = `${gradeInfo.name} (T${skill.tier || 1})`;
            gradeEl.className = `text-xs font-bold px-3 py-1 mb-2 uppercase tracking-widest ${gradeInfo.colorClass}`;
            
            document.getElementById("skillAcquireWord").innerText = capitalizeFirstLetter(skill.word);
            document.getElementById("skillAcquireWord").className = `text-4xl font-bold  tracking-wider mb-1 ${gradeInfo.colorClass.includes('animate-pulse') ? 'animate-pulse text-[#ff8080]' : 'text-white'} text-center`;
            document.getElementById("skillAcquireMeaning").innerText = skill.meaning;

            const starsCount = skill.stars || 0;
            const starsHtml = starsCount > 0 ? "⭐".repeat(starsCount) : "<span class='text-xs text-[#7e7e7e] font-normal'>⭐ 0성 (동일 카드 획득 시 한계돌파)</span>";
            document.getElementById("skillAcquireStarsArea").innerHTML = starsHtml;

            const exp = skill.exp || 0;
            const maxExp = skill.maxExp || getRequiredExpForStar(skill.grade);
            document.getElementById("skillAcquireExpInfo").innerText = `한계돌파 누적 카드 경험치: ${exp} / ${maxExp}`;

            const mult = getSkillMultiplier(skill);
            document.getElementById("skillAcquireDesc").innerText = `💥 최종 피해 배율: 공격력의 ×${mult}배 (Tier & ⭐ 한계돌파 수치 포함)`;
            
            box.className = `relative flex flex-col items-center justify-center p-8 border-2 rounded-none-forced transition-all duration-500 scale-100 ${gradeInfo.colorClass}`;
            
            modal.classList.remove("hidden");
            modal.classList.add("flex");
            playSoundEffect('levelup');

            // 영단어 발음 음성 재생 (Web Speech API)
            if ('speechSynthesis' in window) {
                const utterance = new SpeechSynthesisUtterance(skill.word);
                utterance.lang = 'en-US';
                if (gameState.soundSettings) {
                    const masterScale = (typeof gameState.soundSettings.masterVolume !== 'undefined' ? gameState.soundSettings.masterVolume : 10) / 10;
                    utterance.volume = masterScale;
                }
                window.speechSynthesis.speak(utterance);
            }
        }

        function showForgeResult(isSuccess, title, desc, borderColor) {
            const overlay = document.getElementById("forgeResultOverlay");
            const box = document.getElementById("forgeResultBox");
            const icon = document.getElementById("forgeResultIcon");
            const titleEl = document.getElementById("forgeResultTitle");
            const descEl = document.getElementById("forgeResultDesc");
            const singleBtn = document.getElementById("forgeResultConfirmBtn");

            if (singleBtn) singleBtn.style.display = "block";
            icon.innerText = isSuccess ? "🎉" : "💔";
            titleEl.innerText = title;
            titleEl.style.color = borderColor;
            descEl.innerHTML = desc;
            box.style.borderColor = borderColor;
            box.style.boxShadow = `0 0 32px ${borderColor}55`;

            overlay.classList.remove("hidden");
            overlay.classList.add("flex");

            // 3초 후 자동 닫기
            clearTimeout(overlay._autoClose);
            overlay._autoClose = setTimeout(() => {
                overlay.classList.add("hidden");
                overlay.classList.remove("flex");
            }, 3000);
        }

        function showCombinePreviewModal(htmlContent, onConfirm) {
            const overlay = document.getElementById("forgeResultOverlay");
            const box = document.getElementById("forgeResultBox");
            const icon = document.getElementById("forgeResultIcon");
            const titleEl = document.getElementById("forgeResultTitle");
            const descEl = document.getElementById("forgeResultDesc");
            const singleBtn = document.getElementById("forgeResultConfirmBtn");

            if (singleBtn) singleBtn.style.display = "none";

            icon.innerText = "🔮";
            titleEl.innerText = "마법 조합 연성 확인";
            titleEl.style.color = "#a855f7";
            descEl.innerHTML = `
                ${htmlContent}
                <div class="flex gap-3 mt-4 justify-center items-center">
                    <button id="proceedCombineBtn" class="px-6 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-extrabold text-xs rounded-none-forced shadow-lg cursor-pointer">🔮 연성 시작!</button>
                    <button id="cancelCombineBtn" class="px-5 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 font-bold text-xs border border-gray-600 rounded-none-forced cursor-pointer">취소</button>
                </div>
            `;
            box.style.borderColor = "#a855f7";
            box.style.boxShadow = `0 0 32px rgba(168,85,247,0.5)`;

            overlay.classList.remove("hidden");
            overlay.classList.add("flex");

            clearTimeout(overlay._autoClose);

            document.getElementById("cancelCombineBtn").onclick = () => {
                overlay.classList.add("hidden");
                overlay.classList.remove("flex");
            };
            document.getElementById("proceedCombineBtn").onclick = () => {
                overlay.classList.add("hidden");
                overlay.classList.remove("flex");
                if (onConfirm) onConfirm();
            };
        }

        function copyAppsScriptCode() {
            const codeBox = document.getElementById("appsScriptCode");
            codeBox.select();
            document.execCommand('copy');
            showToast("📋 구글 Apps Script 소스 코드가 완벽하게 복사되었습니다!");
        }

        function downloadCsvTemplate() {
            const header = "Grade,Word,Meaning\n";
            // Example row: 3,apple,사과\n
            const blob = new Blob(["\ufeff" + header], { type: 'text/csv;charset=utf-8;' }); // \ufeff for Excel UTF-8 BOM
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'voca_hero_template.csv';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showToast("📥 CSV 양식 파일이 다운로드되었습니다.");
        }

        function handleCsvFileSelect(event) {
            const file = event.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = function(e) {
                const text = e.target.result;
                processCsvData(text);
                event.target.value = ''; // Reset input
            };
            reader.readAsText(file);
        }

        function processCsvData(csvText) {
            // Very basic CSV parser
            const lines = csvText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
            if (lines.length <= 1) {
                showAlert("업로드할 단어 데이터가 없습니다.", "📭", "파일 오류");
                return;
            }
            
            const wordsArray = [];
            // Skip header (i = 1) if it looks like header
            let startIndex = 0;
            if (lines[0].toLowerCase().includes('grade') || lines[0].includes('학년') || lines[0].includes('단어')) {
                startIndex = 1;
            }

            for (let i = startIndex; i < lines.length; i++) {
                const parts = lines[i].split(',').map(p => p.trim());
                if (parts.length >= 3) {
                    wordsArray.push([parts[0], parts[1], parts[2]]);
                }
            }

            if (wordsArray.length === 0) {
                showAlert("유효한 단어 데이터를 찾을 수 없습니다.", "🔍", "데이터 오류");
                return;
            }

            showConfirm(
                `총 ${wordsArray.length}개의 단어를 파이어베이스 클라우드 단어장(game_data/words)에 일괄 저장하시겠습니까?`,
                async function() {
                    showToast("⏳ 파이어베이스 단어 클라우드 업데이트 중...");
                    if (window._fbReady && window._fbDb && window._fbGetDoc && window._fbSetDoc) {
                        try {
                            const wordsDocRef = window._fbDoc(window._fbDb, "game_data", "words");
                            const docSnap = await window._fbGetDoc(wordsDocRef);
                            let dbData = docSnap.exists() ? docSnap.data() : {};

                            let addedCount = 0;
                            wordsArray.forEach(row => {
                                const g = parseInt(row[0]) || 5;
                                const w = row[1].trim();
                                const m = row[2].trim();
                                if (w && m) {
                                    const key = `grade_${g}`;
                                    if (!dbData[key]) dbData[key] = [];
                                    const existingIdx = dbData[key].findIndex(item => item.word.toLowerCase() === w.toLowerCase());
                                    if (existingIdx >= 0) {
                                        dbData[key][existingIdx] = { word: w, meaning: m };
                                    } else {
                                        dbData[key].push({ word: w, meaning: m });
                                    }
                                    addedCount++;
                                }
                            });

                            await window._fbSetDoc(wordsDocRef, dbData, { merge: true });
                            showToast(`✅ ${addedCount}개 단어가 파이어베이스에 업로드되었습니다!`);
                            fetchWordsFromSpreadsheet();
                        } catch(err) {
                            console.error("Firebase CSV upload error:", err);
                            showToast(`❌ 파이어베이스 단어 저장 실패: ${err.message}`);
                        }
                    } else {
                        showToast("⚠️ 파이어베이스가 연결되어 있지 않습니다. 온라인 상태에서 시도해주세요.");
                    }
                },
                null,
                { icon: "📚", title: "파이어베이스 단어 등록", yesLabel: "일괄 등록", noLabel: "취소" }
            );
        }

        function logoutUser() {
            showConfirm(
                "로그아웃하고 로그인 첫 화면으로 돌아가시겠습니까?",
                function() {
                    sessionStorage.removeItem("vocahero_active_session");
            localStorage.removeItem("vocahero_active_session");
                    localStorage.removeItem("vocahero_active_session");
                    location.reload();
                },
                null,
                { icon: "🚪", title: "로그아웃", yesLabel: "로그아웃", noLabel: "취소" }
            );
        }

        window.onload = function () {
            lucide.createIcons();
            checkConnectionState();

            // Auto fill last logged in student info from localStorage cache
            const lastStudentRaw = localStorage.getItem("vocahero_last_student");
            if (lastStudentRaw) {
                try {
                    const last = JSON.parse(lastStudentRaw);
                    if (last.grade) document.getElementById("inputGrade").value = last.grade;
                    if (last.classNum) document.getElementById("inputClass").value = last.classNum;
                    if (last.studentNum) document.getElementById("inputNumber").value = last.studentNum;
                    if (last.name) document.getElementById("inputName").value = last.name;
                } catch(e) {}
            }

            // 🔄 새로고침 시 자동 로그인 세션 복원 장치 (브라우저 종료 시 삭제됨)
            const activeSessionRaw = sessionStorage.getItem("vocahero_active_session") || localStorage.getItem("vocahero_active_session");
            if (activeSessionRaw) {
                try {
                    const session = JSON.parse(activeSessionRaw);
                    if (session && session.grade && session.name) {
                        showGameLoadingOverlay();
                        tempCredentials = { schoolName: session.schoolName, grade: session.grade, classNum: session.classNum, studentNum: session.studentNum, name: session.name };

                        // ⏱️ 클라우드 자동 로그인에 6초 타임아웃 - 응답 없으면 로컬로 대체
                        let cloudLoginDone = false;
                        const cloudLoginTimeout = setTimeout(() => {
                            if (!cloudLoginDone) {
                                cloudLoginDone = true;
                                console.warn("[VocaHero] 클라우드 자동 로그인 타임아웃 → 로컬 복원 시도");
                                if (session.password) {
                                    handleLocalVerify(session.schoolName, session.grade, session.classNum, session.studentNum, session.name, session.password);
                                } else {
                                    hideGameLoadingOverlay();
                                    openModal('loginModal');
                                }
                            }
                        }, 6000);

                        // Firebase 준비 대기 후 로그인 시도 (100ms 간격 최대 6초)
                        const uid = session.uid || `${session.schoolName || 'Unknown'}_${session.grade}_${session.classNum}_${session.studentNum}_${session.name}`;
                        const tryCloudLogin2 = () => {
                            if (cloudLoginDone) return;
                            if (window._fbDb && window._fbGetDoc) {
                                window._fbGetDoc(window._fbDoc(window._fbDb, "users", uid))
                                    .then(docSnap => {
                                        if (cloudLoginDone) return;
                                        cloudLoginDone = true;
                                        clearTimeout(cloudLoginTimeout);
                                        if (docSnap.exists()) {
                                            const data = docSnap.data();
                                            // 구글 로그인 세션이거나 PIN이 일치할 때 모두 허용
                                            const isGoogleSession = !!session.uid;
                                            const pinMatch = !session.password || data.password === session.password;
                                            if (isGoogleSession || pinMatch) {
                                                closeModal("loginModal");
                                                closeModal("pinVerifyModal");
                                                closeModal("newUserRegisterModal");
                                                syncStateFromServer(data);
                                                showToast(`👋 어서오세요, ${session.name} 용사님! 자동 로그인되었습니다.`);
                                            } else {
                                                handleLocalVerify(session.schoolName, session.grade, session.classNum, session.studentNum, session.name, session.password);
                                            }
                                        } else {
                                            if (session.password) {
                                                handleLocalVerify(session.schoolName, session.grade, session.classNum, session.studentNum, session.name, session.password);
                                            } else {
                                                hideGameLoadingOverlay();
                                                openModal('loginModal');
                                            }
                                        }
                                    }).catch(err => {
                                        if (cloudLoginDone) return;
                                        cloudLoginDone = true;
                                        clearTimeout(cloudLoginTimeout);
                                        if (session.password) {
                                            handleLocalVerify(session.schoolName, session.grade, session.classNum, session.studentNum, session.name, session.password);
                                        } else {
                                            hideGameLoadingOverlay();
                                            openModal('loginModal');
                                        }
                                    });
                            } else {
                                // Firebase 미준비 → 100ms 후 재시도 (타임아웃이 6초 후 로컬로 대체)
                                setTimeout(tryCloudLogin2, 100);
                            }
                        };
                        tryCloudLogin2();
                        return; // 로그인 모달 팝업 방지
                    }
                } catch(e) {
                    console.error("[VocaHero] 세션 복원 실패:", e);
                }
            }

            // 저장된 세션 없음 → 로그인 모달 표시
            openModal("loginModal");
        };
        // PWA Install & Service Worker Logic
        let deferredPrompt;
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredPrompt = e;
            const installBtn = document.getElementById('pwaInstallBtn');
            if (installBtn) {
                installBtn.style.display = 'flex';
                installBtn.addEventListener('click', async () => {
                    installBtn.style.display = 'none';
                    deferredPrompt.prompt();
                    const { outcome } = await deferredPrompt.userChoice;
                    console.log(`User response to the install prompt: ${outcome}`);
                    deferredPrompt = null;
                });
            }
        });

        
        function showDamageOverlay(text) {
            const overlay = document.getElementById("damageOverlay");
            const overlayText = document.getElementById("damageOverlayText");
            overlayText.innerText = text;
            overlay.classList.remove("hidden");
            overlay.classList.add("flex");
            
            document.body.classList.add("animate-shake");
            
            setTimeout(() => {
                overlay.classList.remove("flex");
                overlay.classList.add("hidden");
                document.body.classList.remove("animate-shake");
            }, 3000);
        }

        // ==========================================
        // 🎨 Custom Modal System (replaces alert/confirm)
        // ==========================================
        // ==========================================
        // 🎨 Custom Modal System (replaces alert/confirm)
        // ==========================================
        function _openCustomModal(icon, title, message, buttons) {
            const overlay = document.getElementById("customModalOverlay");
            const box = document.getElementById("customModalBox");
            if (!overlay || !box) throw new Error("Modal elements not found in DOM");

            const iconEl = document.getElementById("customModalIcon");
            const titleEl = document.getElementById("customModalTitle");
            const msgEl = document.getElementById("customModalMessage");
            const btnsEl = document.getElementById("customModalBtns");

            if (iconEl) iconEl.innerText = icon;
            if (titleEl) titleEl.innerText = title;
            if (msgEl) msgEl.innerHTML = message;

            if (btnsEl) {
                btnsEl.innerHTML = "";
                buttons.forEach(btn => {
                    const el = document.createElement("button");
                    el.innerText = btn.label;
                    el.className = btn.primary
                        ? "flex-1 py-2.5 px-5 rounded-xl font-extrabold text-sm text-white shadow-lg transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer"
                        : "flex-1 py-2.5 px-5 rounded-xl font-bold text-sm transition-all duration-200 hover:scale-105 active:scale-95 border cursor-pointer";
                    if (btn.primary) {
                        el.style.background = btn.danger
                            ? "linear-gradient(135deg,#dc2626,#b91c1c)"
                            : "linear-gradient(135deg,#7c3aed,#4f46e5)";
                    } else {
                        el.style.background = "rgba(255,255,255,0.05)";
                        el.style.borderColor = "rgba(255,255,255,0.1)";
                        el.style.color = "#9ca3af";
                    }
                    el.onclick = (e) => {
                        if (e) e.stopPropagation();
                        overlay.style.display = "none";
                        if (btn.onClick) btn.onClick();
                    };
                    btnsEl.appendChild(el);
                });
            }

            box.style.transform = "scale(1) translateY(0)";
            box.style.opacity = "1";
            overlay.style.zIndex = "99999999";
            overlay.style.display = "flex";
            overlay.style.alignItems = "center";
            overlay.style.justifyContent = "center";
        }

        /** alert() 대체 */
        function showAlert(message, icon, title, onConfirm) {
            icon = icon || "ℹ️";
            title = title || "알림";
            try {
                _openCustomModal(icon, title, message, [
                    { label: "확인", primary: true, onClick: onConfirm || null }
                ]);
            } catch (err) {
                window.alert(`${icon} ${title}\n\n${message}`);
                if (typeof onConfirm === 'function') onConfirm();
            }
        }

        /** confirm() 대체 – onYes/onNo 콜백 (폴백 완비) */
        function showConfirm(message, onYes, onNo, opts) {
            opts = opts || {};
            const icon = opts.icon || "❓";
            const title = opts.title || "확인";
            const yesLabel = opts.yesLabel || "확인";
            const noLabel = opts.noLabel || "취소";
            const danger = !!opts.danger;

            try {
                const overlay = document.getElementById("customModalOverlay");
                const box = document.getElementById("customModalBox");
                if (overlay && box) {
                    _openCustomModal(icon, title, message, [
                        { label: yesLabel, primary: true, danger: danger, onClick: onYes || null },
                        { label: noLabel,  primary: false, onClick: onNo  || null }
                    ]);
                    return;
                }
            } catch (err) {
                console.warn("Custom modal failed, using native fallback confirm:", err);
            }

            // 폴백: 브라우저 기본 confirm 팝업
            const confirmed = window.confirm(`${icon} ${title}\n\n${message}`);
            if (confirmed) {
                if (onYes) onYes();
            } else {
                if (onNo) onNo();
            }
        }

    
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
            if (!overlay) return;
            const msg = document.getElementById("tutorialMessage");
            const nextBtn = document.getElementById("tutorialNextBtn");
            
            document.querySelectorAll('.tutorial-highlight').forEach(el => {
                el.classList.remove('tutorial-highlight', 'relative', 'z-[10000]', 'ring-2', 'ring-yellow-400', 'animate-pulse');
            });
            nextBtn.classList.add("hidden");

            // Reset overlay classes
            overlay.className = "fixed inset-0 z-[9999] flex-col p-4 transition-opacity duration-300";
            overlay.classList.remove("hidden");
            overlay.classList.add("flex");
            overlay.style.alignItems = "";
            overlay.style.justifyContent = "";
            overlay.style.paddingTop = "";
            overlay.style.paddingRight = "";
            overlay.style.paddingBottom = "";
            
            const popup = overlay.querySelector('.max-w-sm');
            if (popup) popup.classList.add('pointer-events-auto');

            const mainTabsNav = document.getElementById("mainTabsNav");
            if (mainTabsNav) {
                if ([2, 4, 6, 8, 9, 10, 11].includes(tutorialStep)) {
                    mainTabsNav.classList.add('!z-[10000]', 'relative');
                } else {
                    mainTabsNav.classList.remove('!z-[10000]', 'relative');
                }
            }

            const skipBtn = overlay.querySelector('button[onclick="skipTutorial()"]');
            if(skipBtn) skipBtn.style.display = "block";

            if (tutorialStep === 1) {
                overlay.classList.add('bg-black/90');
                // 팝업을 오른쪽 상단으로 (퀴즈 문항과 겹치지 않도록)
                overlay.style.alignItems = "flex-end";
                overlay.style.justifyContent = "flex-start";
                overlay.style.paddingTop = "70px";
                overlay.style.paddingRight = "24px";
                switchTab('quizTab');
                msg.innerHTML = "환영합니다 용사여!<br>먼저 몬스터를 공격하려면 <b>올바른 뜻을 가진 단어</b>를 선택해야 합니다. <span class='text-yellow-300'>정답을 클릭해보세요!</span>";
                const choices = document.querySelectorAll('.choice-btn');
                choices.forEach(c => c.classList.add('tutorial-highlight', 'relative', 'z-[10000]', 'ring-2', 'ring-yellow-400', 'animate-pulse'));
                const qContainer = document.getElementById('quizContainer');
                if (qContainer) qContainer.classList.add('tutorial-highlight', 'relative', 'z-[10000]');
            } else if (tutorialStep === 2) {
                overlay.classList.add('bg-black/90');
                overlay.style.alignItems = "flex-start";
                overlay.style.justifyContent = "flex-start";
                overlay.style.paddingTop = "52px";
                msg.innerHTML = "훌륭합니다!<br>몬스터를 처치해 얻은 골드로 <b>[대장간]</b> 탭으로 이동하여 장비를 강화해보세요.";
                const gearTabBtn = document.getElementById("gearTabBtn");
                if(gearTabBtn) gearTabBtn.classList.add('tutorial-highlight', 'relative', 'z-[10000]', 'ring-2', 'ring-yellow-400', 'animate-pulse');
            } else if (tutorialStep === 3) {
                overlay.classList.add('bg-black/90');
                overlay.style.alignItems = "flex-start";
                overlay.style.justifyContent = "flex-start";
                overlay.style.paddingTop = "52px";
                selectedGearKey = 'weapon';
                buildUpgradeblacksmith();
                msg.innerHTML = "이제 <b>무기 강화</b> 버튼을 눌러 전투력을 올리세요! (무기는 클릭 데미지와 초당 피해량을 대폭 올려줍니다)";
                const weaponBtnContainer = document.getElementById("gearInfo_weapon");
                if(weaponBtnContainer) weaponBtnContainer.classList.add('tutorial-highlight', 'relative', 'z-[10000]', 'ring-2', 'ring-yellow-400', 'animate-pulse');
            } else if (tutorialStep === 4) {
                overlay.classList.add('bg-black/90');
                overlay.style.alignItems = "flex-start";
                overlay.style.justifyContent = "flex-start";
                overlay.style.paddingTop = "52px";
                msg.innerHTML = "장비 강화 성공!<br>다음으로 <b>[펫/유물 소환]</b> 탭을 클릭하여 든든한 동료와 강력한 유물을 확인해보세요.";
                const btn = document.getElementById("petTabBtn");
                if(btn) btn.classList.add('tutorial-highlight', 'relative', 'z-[10000]', 'ring-2', 'ring-yellow-400', 'animate-pulse'); btn.style.pointerEvents = 'auto';
            } else if (tutorialStep === 5) {
                overlay.classList.add('bg-black/70');
                overlay.style.alignItems = "flex-start";
                overlay.style.justifyContent = "flex-start";
                overlay.style.paddingTop = "52px";
                overlay.style.pointerEvents = 'none';
                msg.innerHTML = "펫 탭에 오신 것을 환영합니다!<br>이제 <b>드래곤 소환</b> 버튼을 눌러 드래곤을 Lv.1로 만들어보세요. (튜토리얼 지원으로 무료 소환됩니다!)";
                const btn = document.querySelector(`button[onclick="interactUpgradePet('dragon')"]`);
                if(btn) { btn.classList.add('tutorial-highlight', 'relative', 'z-[10000]', 'ring-2', 'ring-yellow-400', 'animate-pulse'); btn.style.pointerEvents = 'auto'; }
            } else if (tutorialStep === 6) {
                overlay.classList.add('bg-black/90');
                overlay.style.alignItems = "flex-start";
                overlay.style.justifyContent = "flex-start";
                overlay.style.paddingTop = "52px";
                msg.innerHTML = "드래곤을 소환했습니다!<br>펫은 전투에 큰 도움이 됩니다.<br>이번엔 <b>[스킬]</b> 탭을 클릭하여 마법 스킬을 확인하세요.";
                const btn = document.getElementById("skillTabBtn");
                if(btn) btn.classList.add('tutorial-highlight', 'relative', 'z-[10000]', 'ring-2', 'ring-yellow-400', 'animate-pulse'); btn.style.pointerEvents = 'auto';
            } else if (tutorialStep === 7) {
                overlay.classList.add('bg-black/70');
                overlay.style.alignItems = "flex-start";
                overlay.style.justifyContent = "flex-start";
                overlay.style.paddingTop = "52px";
                overlay.style.pointerEvents = 'none';
                msg.innerHTML = "스킬은 강력한 효과를 지닙니다.<br>무료로 <b>1회 소환</b> 버튼을 눌러 마법 스킬을 하나 뽑아보세요! (영웅 등급 스킬이 확정 지급됩니다)";
                const btn = document.querySelector(`button[onclick="drawSkillCapsule(1)"]`);
                if(btn) { btn.classList.add('tutorial-highlight', 'relative', 'z-[10000]', 'ring-2', 'ring-yellow-400', 'animate-pulse'); btn.style.pointerEvents = 'auto'; }
            } else if (tutorialStep === 8) {
                overlay.style.background = 'transparent';
                overlay.style.alignItems = "flex-start";
                overlay.style.justifyContent = "flex-end";
                overlay.style.paddingTop = "60px";
                overlay.style.paddingRight = "16px";
                overlay.style.pointerEvents = 'auto'; // Block background clicks
                msg.innerHTML = "새로운 스킬 획득!<br>마법 스킬을 활용하면 보스전에서 매우 유리해집니다.<br>이제 상단의 <b>[월드보스]</b> 탭을 클릭해보세요.";
                const btn = document.getElementById("worldBossTabBtn");
                if(btn) { btn.classList.add('tutorial-highlight', 'relative', 'z-[10000]', 'ring-2', 'ring-yellow-400', 'animate-pulse'); btn.style.pointerEvents = 'auto'; }
            } else if (tutorialStep >= 9 && tutorialStep <= 11) {
                // Steps 9, 10, 11
                overlay.style.background = 'transparent';
                overlay.style.alignItems = "flex-start";
                overlay.style.justifyContent = "flex-end";
                overlay.style.paddingTop = "60px";
                overlay.style.paddingRight = "16px";
                overlay.style.pointerEvents = 'none'; // allow scrolling page
                
                let tabName = "";
                let tabDesc = "";
                let nextTabName = "";
                let nextBtnId = "";
                if(tutorialStep === 9) {
                    tabName = "월드보스";
                    tabDesc = "주별로 모든 학년의 학생들과 협력하여 월드보스를 격퇴해보세요. 기여도에 따라 FP를 보상으로 받습니다!";
                    nextTabName = "[명예의 전당] 탭을 클릭하세요"; nextBtnId = "hallOfFameTabBtn";
                }
                if(tutorialStep === 10) {
                    tabName = "명예의 전당";
                    tabDesc = "모든 학년 랭킹을 확인하고, 업적을 해금하여 칭호를 장착해보세요!";
                    nextTabName = "[내 영웅 정보] 탭을 클릭해보세요"; nextBtnId = "statsTabBtn";
                }
                if(tutorialStep === 11) {
                    tabName = "내 영웅 정보";
                    tabDesc = "내 영웅의 스탯, 정복한 단어, 오답 단어를 확인하고 매뉴얼을 살펴볼 수 있습니다.";
                    nextTabName = "다음 버튼을 클릭하세요"; nextBtnId = "tutorialNextBtn";
                }
                
                msg.innerHTML = `📣 <b>${tabName}</b> 탭입니다.<br><span class='text-gray-400 text-xs'>${tabDesc}</span>`;
                
                // 즉시 다음 버튼 활성화 (자유 스크롤 탐색 후 직접 클릭)
                if (tutorialStep === 11) {
                    nextBtn.classList.remove("hidden");
                    nextBtn.innerHTML = '다음';
                    nextBtn.className = "bg-yellow-500 hover:bg-yellow-400 text-black font-bold py-1.5 px-5 text-sm transition-colors rounded shadow-sm flex items-center justify-center";
                    if(skipBtn) skipBtn.style.display = "block";
                } else {
                    setTimeout(() => {
                        const btn = document.getElementById(nextBtnId);
                        if(btn) { btn.classList.add('tutorial-highlight', 'relative', 'z-[10000]', 'ring-2', 'ring-yellow-400', 'animate-pulse'); btn.style.pointerEvents = 'auto'; }
                    }, 300);
                }
            } else if (tutorialStep === 12) {
                overlay.classList.add('bg-black/90');
                overlay.style.pointerEvents = 'auto';
                overlay.style.background = '';
                overlay.style.alignItems = "center";
                overlay.style.justifyContent = "center";
                msg.innerHTML = "<div class='text-yellow-300 text-center w-full block mt-2'>튜토리얼 완료 보상으로 정착 지원금 100,000 골드와 단어 정복 포인트(FP) 450을 드립니다!</div><br><div class='text-center font-bold w-full block mt-2'>건투를 빕니다!</div>";
                nextBtn.classList.remove("hidden");
                nextBtn.innerHTML = '🎁 보상 받기';
                nextBtn.className = "bg-gradient-to-r from-yellow-600 to-amber-500 hover:from-yellow-500 hover:to-amber-400 text-black font-extrabold px-8 py-2.5 text-sm rounded transition shadow-md flex items-center justify-center w-full mt-2";
                if(skipBtn) skipBtn.style.display = "none";
                const parentDiv = nextBtn.parentElement;
                if(parentDiv) {
                    
                }
            }
        }

        function nextTutorialStep() {
            if(tutorialStep === 12) completeTutorial();
            else { tutorialStep++; showTutorialOverlay(); }
        }

        function skipTutorial() { 
            const m = document.getElementById('tutorialSkipModal');
            if(m) { m.classList.remove('hidden'); m.classList.add('flex'); }
        }
        function closeSkipTutorialModal() {
            const m = document.getElementById('tutorialSkipModal');
            if(m) { m.classList.add('hidden'); m.classList.remove('flex'); }
        }
        function confirmSkipTutorial() {
            closeSkipTutorialModal();
            completeTutorial(true); // skipReward = true
        }

        function completeTutorial(skipReward = false) {
            if (gameState.tutorialCompleted) return;
            gameState.tutorialCompleted = true;
            const overlay = document.getElementById("tutorialOverlay");
            if(overlay) {
                overlay.classList.add("hidden");
                overlay.classList.remove("flex");
            }
            const mainTabsNav = document.getElementById("mainTabsNav");
            if (mainTabsNav) {
                mainTabsNav.classList.remove('!z-[10000]', 'relative');
            }
            
            document.querySelectorAll('.tutorial-highlight').forEach(el => {
                el.classList.remove('tutorial-highlight', 'relative', 'z-[10000]', 'ring-2', 'ring-yellow-400', 'animate-pulse');
            });

                        if (!skipReward) {
                gameState.gold = (gameState.gold || 0) + 100000; gameState.accGold = (gameState.accGold || gameState.gold || 0) + 100000;
                gameState.masteryPoints = (gameState.masteryPoints || 0) + 450;
                showToast("🎉 튜토리얼 완료! 정착 지원금 100,000 골드와 단어 정력(FP) 450을 받았습니다.");
            } else {
                showToast("튜토리얼을 건너뛰었습니다. (보상 미지급)");
            }
            refreshStateVisuals();
            saveLocalCache();
            // 튜토리얼 완료 상태와 보상을 즉시 클라우드에 저장
            if (gameState.name && gameState.name !== "방문자") {
                saveSessionToCloud(true);
            }
            if (window.lucide) {
                lucide.createIcons();
            }
        }

        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
                    .then(reg => {
                        console.log('[SW] Registered:', reg.scope);
                        reg.update();
                    })
                    .catch(err => console.warn('[SW] Registration failed:', err));

                let refreshing = false;
                navigator.serviceWorker.addEventListener('controllerchange', () => {
                    if (refreshing) return;
                    refreshing = true;
                    console.log('[SW] New version activated, reloading page for instant update...');
                    window.location.reload();
                });
            });
        }
