(function installSkillRework() {
    "use strict";

    const RawSkillRules = globalThis.VocaSkillSystem;
    if (!RawSkillRules) throw new Error("VocaSkillSystem must load before skill-rework.js");
    // Keep the UI layer independent from the pure module's verbose result shapes.
    const SkillRules = {
        ...RawSkillRules,
        normalizeSkill: RawSkillRules.normalizeSkillCard,
        gradeRank: (grade) => Math.max(0, Number(RawSkillRules.GRADE_RANK?.[grade] || 1) - 1),
        requiredExp: RawSkillRules.getRequiredExpForStar,
        isMaxSkill: (skill) => RawSkillRules.getSkillProgressIndex(skill) >= 20,
        completeGrowthBar(skill) {
            const result = RawSkillRules.advanceSkillBars(skill, 1);
            const tierUp = result.events.some((event) => event.type === "tier-evolution" || event.type === "tier-up");
            return { skill: result.card, event: result.essenceDelta ? "essence" : tierUp ? "tier-up" : "star-up", essenceGained: result.essenceDelta || 0 };
        },
        applyGrowthOutcome(skill, grade, tier) {
            const result = RawSkillRules.applyGrowthOutcome(skill, { grade, tier });
            const hasGrade = result.events.some((event) => event.type === "grade-up");
            const hasTier = result.events.some((event) => event.type === "tier-evolution" || event.type === "tier-up");
            const event = result.essenceDelta ? "essence" : hasGrade && hasTier ? "grade-tier-up" : hasGrade ? "grade-up" : hasTier ? "tier-up" : "star-up";
            return { skill: result.card, event, essenceGained: result.essenceDelta || 0 };
        },
        dismantleYield: RawSkillRules.getDismantleYield,
        effectiveFusionWeight: RawSkillRules.getFusionEffectiveWeight,
        fusionPreview(cards, pityFailures = 0) {
            const profile = RawSkillRules.getFusionProfile(cards, pityFailures);
            return {
                mode: profile.kind === "same-grade" ? "promotion" : "weighted",
                distribution: profile.probabilities,
                successChance: profile.promotionChance || 0,
                baseGrade: profile.currentGrade || null,
                nextGrade: profile.nextGrade || null
            };
        },
        rollDistribution(distribution, random = Math.random) {
            return RawSkillRules.rollFusionGrade({ probabilities: distribution }, random);
        },
        weightedPick: RawSkillRules.pickWeighted,
        planSummonCategories(count, availability = {}, random = Math.random) {
            return RawSkillRules.planSummonCategories(count, {
                newAvailable: availability.hasNew !== false,
                growthAvailable: availability.hasGrowth !== false
            }, random);
        }
    };

    const wordKey = (value) => String(value || "").trim().toLowerCase();
    const uniqueWords = (values, limit = Infinity) => [...new Set((Array.isArray(values) ? values : []).map(wordKey).filter(Boolean))].slice(0, limit);
    const escapeSkillHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
    const safeSkillId = (value) => String(value || "").replace(/[^A-Za-z0-9_:-]/g, "_");
    const plainSkillText = (value, limit) => String(value ?? "").normalize("NFKC").replace(/[\u0000-\u001f\u007f<>&]/g, " ").replace(/\s+/g, " ").trim().slice(0, limit);
    const skillJsArg = (value) => escapeSkillHtml(JSON.stringify(String(value ?? "")).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029"));

    function skillInventorySortWeight(skill) {
        const normalized = SkillRules.normalizeSkill(skill || {});
        const maxExp = Math.max(1, Number(normalized.maxExp) || SkillRules.requiredExp(normalized.grade));
        const expRatio = Math.max(0, Math.min(1, (Number(normalized.exp) || 0) / maxExp));
        return SkillRules.gradeRank(normalized.grade) * 10000 + (3 - normalized.tier) * 1000 + normalized.stars * 100 + expRatio;
    }
    function sortSkillInventory(skills) {
        return [...(Array.isArray(skills) ? skills : [])].sort((a, b) => getSkillMultiplier(b) - getSkillMultiplier(a) || skillInventorySortWeight(b) - skillInventorySortWeight(a) || wordKey(a.word).localeCompare(wordKey(b.word)));
    }

    function normalizeSkillSystemState() {
        if (!Array.isArray(gameState.skillsInventory)) gameState.skillsInventory = [];
        const previousEquipped = Array.isArray(gameState.equippedSkills) ? gameState.equippedSkills.map(String) : [];
        const usedIds = new Set();
        const idAliases = new Map();
        gameState.skillsInventory = gameState.skillsInventory.filter((skill) => skill && typeof skill === "object" && plainSkillText(skill.word, 80)).map((skill, index) => {
            const normalized = SkillRules.normalizeSkill(skill);
            const originalId = String(skill.id || "");
            const baseId = safeSkillId(originalId || `skill_migrated_${Date.now()}_${index}`).slice(0, 96) || `skill_migrated_${index}`;
            let id = baseId;
            let suffix = 1;
            while (usedIds.has(id)) id = `${baseId.slice(0, 84)}_${index}_${suffix++}`;
            usedIds.add(id);
            if (originalId && !idAliases.has(originalId)) idAliases.set(originalId, id);
            idAliases.set(id, id);
            return {
                ...normalized, id,
                word: plainSkillText(skill.word, 80),
                meaning: plainSkillText(skill.meaning, 160),
                cooldownRemaining: Math.max(0, Number(skill.cooldownRemaining) || 0),
                maxCooldown: Math.max(1, Number(skill.maxCooldown) || 30)
            };
        });
        const validIds = new Set(gameState.skillsInventory.map((skill) => String(skill.id)));
        gameState.equippedSkills = [...new Set(previousEquipped.map((id) => idAliases.get(id) || "").filter((id) => validIds.has(id)))].slice(0, 4);
        gameState.skillResearchTargets = uniqueWords(gameState.skillResearchTargets, 4);
        gameState.skillLockedWords = uniqueWords(gameState.skillLockedWords, 4000);
        gameState.skillDiscoveredWords = uniqueWords([
            ...(Array.isArray(gameState.skillDiscoveredWords) ? gameState.skillDiscoveredWords : []),
            ...gameState.skillsInventory.map((skill) => skill.word)
        ], 4000);
        gameState.activeSkillDeck = (Array.isArray(gameState.activeSkillDeck) ? gameState.activeSkillDeck : [])
            .filter((entry) => entry && wordKey(entry.word)).slice(0, 24)
            .map((entry) => ({ word: plainSkillText(entry.word, 80), meaning: plainSkillText(entry.meaning, 160) }));
        gameState.skillEssence = Math.max(0, Math.floor(Number(gameState.skillEssence) || 0));
        const summonPity = gameState.skillSummonPity && typeof gameState.skillSummonPity === "object" ? gameState.skillSummonPity : {};
        gameState.skillSummonPity = { growthWithoutFocus: Math.max(0, Math.min(7, Math.floor(Number(summonPity.growthWithoutFocus) || 0))) };
        const fusionPity = gameState.skillFusionPity && typeof gameState.skillFusionPity === "object" ? gameState.skillFusionPity : {};
        gameState.skillFusionPity = Object.fromEntries(["normal", "rare", "hero", "legendary"].map((grade) => [grade, Math.max(0, Math.min(5, Math.floor(Number(fusionPity[grade]) || 0)))]));
        sanitizeSelectedCombineSkillIds();
        return gameState;
    }

    function isSkillResearchTarget(skillOrWord) {
        return new Set(gameState.skillResearchTargets || []).has(wordKey(typeof skillOrWord === "object" ? skillOrWord.word : skillOrWord));
    }

    function skillProtectionReason(skill) {
        if (!skill) return "카드를 찾지 못했습니다.";
        if ((gameState.equippedSkills || []).includes(skill.id)) return "장착 중인 카드는 보호됩니다.";
        if (isSkillResearchTarget(skill)) return "집중 연구 카드는 보호됩니다.";
        if ((gameState.skillLockedWords || []).includes(wordKey(skill.word))) return "잠금 카드입니다.";
        return "";
    }

    function isSkillProtected(skill) {
        return Boolean(skillProtectionReason(skill));
    }

    function sanitizeSelectedCombineSkillIds() {
        if (!Array.isArray(selectedCombineSkillIds)) selectedCombineSkillIds = [];
        const byId = new Map((gameState.skillsInventory || []).map((skill) => [String(skill.id), skill]));
        selectedCombineSkillIds = [...new Set(selectedCombineSkillIds.map(String))].filter((id) => {
            const skill = byId.get(id);
            return skill && skill.grade !== "mythic" && !isSkillProtected(skill);
        }).slice(0, 3);
        return selectedCombineSkillIds;
    }

    function markSkillDiscovered(word) {
        gameState.skillDiscoveredWords = uniqueWords([...(gameState.skillDiscoveredWords || []), word], 4000);
    }

    ensureActiveSkillDeck = function ensureActiveSkillDeckReworked(preferredPool = null) {
        normalizeSkillSystemState();
        const source = getSkillSourcePool(preferredPool);
        const sourceByKey = new Map(source.map((entry) => [wordKey(entry.word), entry]));
        const priorityKeys = [];
        const addPriority = (value) => {
            const key = wordKey(value);
            if (key && sourceByKey.has(key) && !priorityKeys.includes(key)) priorityKeys.push(key);
        };
        (gameState.skillResearchTargets || []).forEach(addPriority);
        (gameState.equippedSkills || []).forEach((id) => addPriority((gameState.skillsInventory || []).find((skill) => skill.id === id)?.word));

        const owned = [...(gameState.skillsInventory || [])].sort(() => Math.random() - 0.5);
        owned.forEach((skill) => addPriority(skill.word));
        const learningStats = gameState.wordLearningStats || {};
        const candidates = source.filter((entry) => !priorityKeys.includes(wordKey(entry.word))).sort((left, right) => {
            const a = learningStats[wordKey(left.word)] || {};
            const b = learningStats[wordKey(right.word)] || {};
            const aScore = (Number(a.x) || 0) * 4 + (Number(a.c) || 0);
            const bScore = (Number(b.x) || 0) * 4 + (Number(b.c) || 0);
            return bScore - aScore || Math.random() - 0.5;
        });
        candidates.forEach((entry) => addPriority(entry.word));
        gameState.activeSkillDeck = priorityKeys.slice(0, Math.min(24, source.length)).map((key) => ({ ...sourceByKey.get(key) }));
        return gameState.activeSkillDeck;
    };

    function newSkillCandidates(preferredPool = null) {
        const full = getSkillSourcePool(preferredPool);
        const owned = new Set((gameState.skillsInventory || []).map((skill) => wordKey(skill.word)));
        const deck = ensureActiveSkillDeck(full).filter((entry) => !owned.has(wordKey(entry.word)));
        return deck.length ? deck : full.filter((entry) => !owned.has(wordKey(entry.word)));
    }

    function growthSkillCandidates() {
        return gameState.skillsInventory || [];
    }

    function pickNewSkillCandidate(random = Math.random) {
        const candidates = newSkillCandidates();
        const targets = new Set(gameState.skillResearchTargets || []);
        return SkillRules.weightedPick(candidates, (entry) => targets.has(wordKey(entry.word)) ? 5 : 1, random);
    }

    function pickGrowthSkill(random = Math.random) {
        const candidates = growthSkillCandidates();
        if (!candidates.length) return null;
        const targets = new Set(gameState.skillResearchTargets || []);
        const focused = candidates.filter((skill) => targets.has(wordKey(skill.word)));
        const pity = Number(gameState.skillSummonPity?.growthWithoutFocus) || 0;
        const pool = pity >= 7 && focused.length ? focused : candidates;
        const picked = SkillRules.weightedPick(pool, (skill) => {
            if (targets.has(wordKey(skill.word))) return 5;
            if ((gameState.equippedSkills || []).includes(skill.id)) return 2;
            return 1;
        }, random);
        if (picked && targets.has(wordKey(picked.word))) gameState.skillSummonPity.growthWithoutFocus = 0;
        else if (focused.length) gameState.skillSummonPity.growthWithoutFocus = Math.min(7, pity + 1);
        return picked;
    }

    function createOwnedSkill(word, meaning, grade, tier) {
        const skill = {
            id: `skill_${Date.now()}_${Math.floor(Math.random() * 1000000)}`,
            word: String(word || "").trim(),
            meaning: String(meaning || "").trim(),
            grade: SkillRules.normalizeGrade(grade),
            tier: SkillRules.normalizeTier(tier),
            stars: 0,
            exp: 0,
            maxExp: SkillRules.requiredExp(grade),
            cooldownRemaining: 0,
            maxCooldown: 30
        };
        gameState.skillsInventory.push(skill);
        markSkillDiscovered(skill.word);
        return skill;
    }

    function acquireSkillOutcome(word, meaning, rolledGrade, rolledTier) {
        normalizeSkillSystemState();
        const existing = (gameState.skillsInventory || []).find((skill) => wordKey(skill.word) === wordKey(word));
        if (!existing) {
            const skill = createOwnedSkill(word, meaning, rolledGrade, rolledTier);
            return { skill, resultType: "new", alreadyOwned: false, essenceGained: 0 };
        }
        const result = SkillRules.applyGrowthOutcome(existing, rolledGrade, rolledTier);
        Object.assign(existing, result.skill);
        if (result.essenceGained) gameState.skillEssence += result.essenceGained;
        const labels = { "grade-up": "grade-up", "grade-tier-up": "grade-tier-up", "tier-up": "tier-up", "star-up": "star-up", essence: "max-essence" };
        return { skill: existing, resultType: labels[result.event] || "growth", alreadyOwned: true, essenceGained: result.essenceGained || 0 };
    }

    addOrLevelUpSkill = function addOrLevelUpSkillReworked(word, meaning, rolledGrade, suppressModal = false, rolledTier = null) {
        const outcome = acquireSkillOutcome(word, meaning, rolledGrade, rolledTier || rollSkillTier());
        if (!suppressModal) {
            if (outcome.resultType === "max-essence") showToast(`✨ MAX 중복이 각성 정수 +${outcome.essenceGained}로 변환되었습니다.`);
            showSkillModal(outcome.skill, SKILL_GRADES[outcome.skill.grade] || SKILL_GRADES.normal);
            buildSkillTabUI();
            renderSkillsUI();
            saveLocalCache();
        }
        return outcome.skill;
    };

    createSkillDrawSnapshot = function createSkillDrawSnapshotReworked(word, meaning, rolledGrade, rolledTier, alreadyOwned = false, resultType = null, ownedSkill = null, essenceAmount = 0) {
        if (resultType === "essence") return { word: "각성 정수", meaning: "원하는 스킬 성장에 사용", resultType: "essence", essenceAmount: 25, alreadyOwned: false };
        const actual = ownedSkill ? SkillRules.normalizeSkill(ownedSkill) : null;
        const snapshot = {
            word: String(actual?.word ?? word ?? ""), meaning: String(actual?.meaning ?? meaning ?? ""),
            grade: SkillRules.normalizeGrade(actual?.grade ?? rolledGrade), tier: SkillRules.normalizeTier(actual?.tier ?? rolledTier),
            stars: Number(actual?.stars) || 0, exp: Number(actual?.exp) || 0,
            maxExp: Number(actual?.maxExp) || SkillRules.requiredExp(actual?.grade ?? rolledGrade),
            rolledGrade: SkillRules.normalizeGrade(rolledGrade), rolledTier: SkillRules.normalizeTier(rolledTier),
            essenceAmount: Math.max(0, Number(essenceAmount) || 0),
            alreadyOwned: Boolean(alreadyOwned), resultType: resultType || (alreadyOwned ? "growth" : "new")
        };
        snapshot.drawMultiplier = getSkillMultiplier(snapshot);
        return snapshot;
    };

    const SKILL_RESULT_LABELS = { new: "신규", growth: "성장", "star-up": "성급 상승", "grade-up": "등급 상승", "grade-tier-up": "등급·티어 상승", "tier-up": "티어 상승", essence: "각성 정수", "max-essence": "MAX 정수 +100" };

    renderSkillDrawResultCard = function renderSkillDrawResultCardReworked(drawResult) {
        if (drawResult.resultType === "essence") return `
            <div class="border-2 border-amber-500 bg-amber-950/40 p-2 text-center min-h-[90px]" data-draw-result="essence">
                <b class="text-[10px] text-amber-200">각성 정수</b><p class="my-1 text-xl">✨</p><span class="text-[9px] font-black text-yellow-300">+${Number(drawResult.essenceAmount) || 25}</span>
            </div>`;
        const gradeInfo = SKILL_GRADES[drawResult.grade] || SKILL_GRADES.normal;
        const tier = SkillRules.normalizeTier(drawResult.tier);
        return `
            <div class="border-2 ${gradeInfo.colorClass} p-2 text-center flex flex-col justify-between min-h-[90px]" data-draw-grade="${drawResult.grade}" data-draw-tier="${tier}" data-draw-result="${drawResult.resultType}">
                <div><div class="flex items-center justify-between text-[9px] font-black"><span>${gradeInfo.name}</span><span class="text-yellow-300">T${tier} \u2605${Number(drawResult.stars) || 0}</span></div><p class="mt-0.5 truncate text-[11px] font-bold text-white">${escapeSkillHtml(capitalizeFirstLetter(drawResult.word))}</p></div>
                <div><span class="block truncate text-[9px] text-[#ddd]">${escapeSkillHtml(drawResult.meaning)}</span><span class="block text-[8px] font-black text-cyan-200">${SKILL_RESULT_LABELS[drawResult.resultType] || "성장"}</span><span class="block text-[9px] font-bold text-pink-300">지수 ×${Number(drawResult.drawMultiplier || getSkillMultiplier(drawResult))}</span></div>
            </div>`;
    };

    function executeSkillDrawBatch(drawCount = 1, options = {}) {
        normalizeSkillSystemState();
        const count = Math.max(1, Math.floor(Number(drawCount) || 1));
        const random = typeof options.random === "function" ? options.random : Math.random;
        const hasNew = newSkillCandidates().length > 0;
        const hasGrowth = (gameState.skillsInventory || []).length > 0;
        const categories = options.tutorial
            ? [hasNew ? "new" : hasGrowth ? "growth" : "essence"]
            : SkillRules.planSummonCategories(count, { hasNew, hasGrowth }, random);
        const descriptors = categories.map((category) => ({ category, grade: category === "essence" ? null : rollGuildRewardGrade(random()), tier: category === "essence" ? null : rollSkillTier(random()) }));
        if (options.tutorial && descriptors[0]?.category !== "essence") descriptors[0].grade = "hero";
        if (count >= 10) {
            for (let start = 0; start < count; start += 10) {
                const cardRows = descriptors.slice(start, Math.min(count, start + 10)).filter((row) => row.category !== "essence");
                if (cardRows.length && !cardRows.some((row) => row.grade !== "normal")) cardRows[cardRows.length - 1].grade = "rare";
            }
        }

        const results = [];
        const summary = { newCards: 0, growth: 0, essenceResults: 0, essenceGained: 0 };
        descriptors.forEach((descriptor) => {
            let category = descriptor.category;
            if (category === "new" && !newSkillCandidates().length) category = (gameState.skillsInventory || []).length ? "growth" : "essence";
            if (category === "growth" && !(gameState.skillsInventory || []).length) category = newSkillCandidates().length ? "new" : "essence";
            if (category === "essence") {
                gameState.skillEssence += 25;
                summary.essenceResults += 1;
                summary.essenceGained += 25;
                results.push(createSkillDrawSnapshot("", "", null, null, false, "essence"));
                return;
            }
            if (category === "new") {
                const picked = pickNewSkillCandidate(random);
                if (!picked) {
                    gameState.skillEssence += 25;
                    summary.essenceResults += 1;
                    summary.essenceGained += 25;
                    results.push(createSkillDrawSnapshot("", "", null, null, false, "essence"));
                    return;
                }
                const outcome = acquireSkillOutcome(picked.word, picked.meaning, descriptor.grade, descriptor.tier);
                summary.newCards += 1;
                results.push(createSkillDrawSnapshot(picked.word, picked.meaning, descriptor.grade, descriptor.tier, false, outcome.resultType, outcome.skill, outcome.essenceGained));
                return;
            }
            const target = pickGrowthSkill(random);
            if (!target) return;
            const outcome = acquireSkillOutcome(target.word, target.meaning, descriptor.grade, descriptor.tier);
            summary.growth += 1;
            summary.essenceGained += outcome.essenceGained;
            results.push(createSkillDrawSnapshot(target.word, target.meaning, descriptor.grade, descriptor.tier, true, outcome.resultType, outcome.skill, outcome.essenceGained));
        });
        gameState.activeSkillDeck = [];
        ensureActiveSkillDeck();
        summary.inventoryCount = (gameState.skillsInventory || []).length;
        summary.packSize = getSkillSourcePool().length;
        return { results, summary, categories };
    }

    showSkillDraw100ResultModal = function showSkillDraw100ResultModalReworked(acquiredList, drawSummary = {}) {
        const counts = { mythic: 0, legendary: 0, hero: 0, rare: 0, normal: 0 };
        acquiredList.forEach((item) => { const grade = item.rolledGrade || item.grade; if (counts[grade] !== undefined) counts[grade] += 1; });
        const topList = acquiredList.filter((item) => item.resultType !== "essence").sort((a, b) => getSkillMultiplier(b) - getSkillMultiplier(a)).slice(0, 8);
        const gridEl = document.getElementById("gacha100TopGrid");
        if (gridEl) gridEl.innerHTML = topList.map(renderSkillDrawResultCard).join("");
        const summaryEl = document.getElementById("gacha100SummaryText");
        if (summaryEl) summaryEl.innerHTML = `<span class="font-black text-emerald-300">신규 ${drawSummary.newCards || 0}</span> | <span class="font-bold text-cyan-300">성장 ${drawSummary.growth || 0}</span> | <span class="font-bold text-amber-300">정수 획득 +${drawSummary.essenceGained || 0} (직접 ${drawSummary.essenceResults || 0}회·MAX 전환 포함)</span><br><span class="font-black text-rose-400">신화 ${counts.mythic}</span> | 전설 ${counts.legendary} | 영웅 ${counts.hero} | 희귀 ${counts.rare} | 일반 ${counts.normal}<br><span class="text-[10px] text-gray-500">상위 결과 8개만 표시 · 도감 ${gameState.skillDiscoveredWords.length}종 · 보유 ${drawSummary.inventoryCount || 0}종</span>`;
        const modal = document.getElementById("gacha100xResultModal");
        modal?.classList.remove("hidden"); modal?.classList.add("flex");
    };

    function finishSkillDraw(drawCount, tutorial = false) {
        const { results, summary } = executeSkillDrawBatch(drawCount, { tutorial });
        if (drawCount === 100) showSkillDraw100ResultModal(results, summary);
        else if (drawCount === 10) {
            const grid = document.getElementById("gacha10xGrid");
            if (grid) grid.innerHTML = results.map(renderSkillDrawResultCard).join("");
            const modal = document.getElementById("gacha10xResultModal");
            modal?.classList.remove("hidden"); modal?.classList.add("flex");
        } else {
            const result = results[0];
            if (result?.resultType === "essence") {
                showToast("✨ 각성 정수 +25 획득!");
                skillSummonBusy = false;
            } else if (result) {
                if (result.resultType === "max-essence") showToast(`MAX 중복이 각성 정수 +${Number(result.essenceAmount) || 100}로 변환되었습니다.`);
                showSkillModal(result, SKILL_GRADES[result.grade] || SKILL_GRADES.normal);
            }
        }
        buildSkillTabUI(); renderSkillsUI(); saveLocalCache(); playSoundEffect("levelup");
    }

    drawSkillCapsule = function drawSkillCapsuleReworked(drawCount = 1) {
        if (skillSummonBusy) return;
        normalizeSkillSystemState();
        const count = [1, 10, 100].includes(Number(drawCount)) ? Number(drawCount) : 1;
        const tutorial = !gameState.tutorialCompleted && tutorialStep === 7 && count === 1;
        const cost = tutorial ? 0 : count === 100 ? 4500 : count === 10 ? 450 : 50;
        gameState.masteryPoints = Math.max(0, Number(gameState.masteryPoints) || 0);
        if (!tutorial && gameState.masteryPoints < cost) return showToast(`⚠️ 단어 캡슐 연성에 ${cost.toLocaleString()} FP가 필요합니다.`);
        skillSummonBusy = true;
        gameState.masteryPoints -= cost;
        refreshStateVisuals();
        const modal = document.getElementById("gachaOverlayModal");
        const bar = document.getElementById("gachaProgressBar");
        const title = document.getElementById("gachaStatusTitle");
        modal?.classList.remove("hidden"); modal?.classList.add("flex");
        if (bar) { bar.style.transition = "width 650ms linear"; bar.style.width = "0%"; requestAnimationFrame(() => { bar.style.width = "100%"; }); }
        if (title) title.textContent = count === 100 ? "⚡ 100연속 연구 경로 계산 중..." : count === 10 ? "✨ 10연속 연구 경로 계산 중..." : "마법 캡슐 연구 중...";
        setTimeout(() => {
            modal?.classList.remove("flex"); modal?.classList.add("hidden");
            finishSkillDraw(count, tutorial);
        }, 700);
    };

    drawSkillCapsuleInstantSkip = function drawSkillCapsuleInstantSkipReworked(drawCount = 10) {
        if (skillSummonBusy) return;
        const count = Number(drawCount) === 100 ? 100 : 10;
        const cost = count === 100 ? 4500 : 450;
        gameState.masteryPoints = Math.max(0, Number(gameState.masteryPoints) || 0);
        if (gameState.masteryPoints < cost) return showToast(`⚠️ 단어 캡슐 연성에 ${cost.toLocaleString()} FP가 필요합니다.`);
        skillSummonBusy = true;
        gameState.masteryPoints -= cost;
        refreshStateVisuals();
        finishSkillDraw(count, false);
    };

    grantUniversalAwakeningEssence = function grantUniversalAwakeningEssenceReworked(amount = 1) {
        gameState.skillEssence = Math.max(0, Math.floor(Number(gameState.skillEssence) || 0) + Math.max(0, Math.floor(Number(amount) || 0)));
        return gameState.skillEssence;
    };

    function applyEssenceToSkill(skillId) {
        normalizeSkillSystemState();
        const target = gameState.skillsInventory.find((skill) => skill.id === skillId);
        if (!target) return;
        if (gameState.skillEssence < 100) return showToast("⚠️ 성장 바 1칸에는 각성 정수 100개가 필요합니다.");
        if (SkillRules.isMaxSkill(target)) return showToast("⭐ T1 6성 MAX 스킬입니다.");
        const result = SkillRules.completeGrowthBar(target);
        Object.assign(target, result.skill);
        gameState.skillEssence -= 100;
        showToast(result.event === "tier-up" ? `👑 ${target.word} 티어 진화! T${target.tier}` : `⭐ ${target.word} 성급 상승!`);
        buildSkillTabUI(); renderSkillsUI(); refreshStateVisuals(); saveLocalCache();
    }

    function addResearchTarget(word) {
        normalizeSkillSystemState();
        const key = wordKey(word);
        const source = getSkillSourcePool();
        const entry = source.find((item) => wordKey(item.word) === key);
        if (!entry) return showToast("⚠️ 현재 선택된 단어팩 안의 단어만 연구 대상으로 지정할 수 있습니다.");
        if (gameState.skillResearchTargets.includes(key)) return showToast("이미 연구 대상으로 지정된 단어입니다.");
        if (gameState.skillResearchTargets.length >= 4) return showToast("⚠️ 집중 연구 대상은 최대 4개입니다.");
        gameState.skillResearchTargets.push(key);
        sanitizeSelectedCombineSkillIds();
        gameState.activeSkillDeck = [];
        buildSkillTabUI(); saveLocalCache();
    }

    window.addSkillResearchTargetFromInput = function addSkillResearchTargetFromInputReworked() {
        const input = document.getElementById("skillResearchWordInput");
        if (!input || !input.value.trim()) return showToast("연구할 단어를 입력해 주세요.");
        addResearchTarget(input.value);
        input.value = "";
    };

    window.toggleSkillResearch = function toggleSkillResearchReworked(skillId) {
        const skill = (gameState.skillsInventory || []).find((item) => item.id === skillId);
        if (!skill) return;
        const key = wordKey(skill.word);
        if ((gameState.skillResearchTargets || []).includes(key)) gameState.skillResearchTargets = gameState.skillResearchTargets.filter((word) => word !== key);
        else return addResearchTarget(skill.word);
        sanitizeSelectedCombineSkillIds(); gameState.activeSkillDeck = []; buildSkillTabUI(); saveLocalCache();
    };

    window.removeSkillResearchTarget = function removeSkillResearchTargetReworked(word) {
        gameState.skillResearchTargets = (gameState.skillResearchTargets || []).filter((target) => target !== wordKey(word));
        gameState.activeSkillDeck = []; buildSkillTabUI(); saveLocalCache();
    };

    window.toggleSkillLock = function toggleSkillLockReworked(skillId) {
        const skill = (gameState.skillsInventory || []).find((item) => item.id === skillId);
        if (!skill) return;
        const key = wordKey(skill.word);
        gameState.skillLockedWords = (gameState.skillLockedWords || []).includes(key)
            ? gameState.skillLockedWords.filter((word) => word !== key)
            : uniqueWords([...(gameState.skillLockedWords || []), key], 4000);
        sanitizeSelectedCombineSkillIds(); buildSkillTabUI(); saveLocalCache();
    };

    function removeSkillCard(skill) {
        gameState.skillsInventory = gameState.skillsInventory.filter((item) => item.id !== skill.id);
        gameState.equippedSkills = (gameState.equippedSkills || []).filter((id) => id !== skill.id);
        gameState.skillLockedWords = (gameState.skillLockedWords || []).filter((word) => word !== wordKey(skill.word));
        selectedCombineSkillIds = (selectedCombineSkillIds || []).filter((id) => id !== skill.id);
    }

    window.dismantleSkill = function dismantleSkillReworked(skillId) {
        normalizeSkillSystemState();
        const skill = gameState.skillsInventory.find((item) => item.id === skillId);
        if (!skill) return;
        const reason = skillProtectionReason(skill);
        if (reason) return showToast(`⚠️ ${reason}`);
        const amount = SkillRules.dismantleYield(skill);
        const execute = () => {
            removeSkillCard(skill);
            gameState.skillEssence += amount;
            buildSkillTabUI(); renderSkillsUI(); refreshStateVisuals(); saveLocalCache();
            showToast(`✨ ${capitalizeFirstLetter(skill.word)} 분해 완료 · 각성 정수 +${amount}`);
        };
        const finalConfirm = () => {
            if (["legendary", "mythic"].includes(skill.grade) && typeof showConfirm === "function") {
                showConfirm(`정말로 [${SKILL_GRADES[skill.grade].name}] ${escapeSkillHtml(skill.word)} 카드를 분해할까요?<br>도감 기록은 유지됩니다.`, execute, null, { icon: "⚠️", title: "고등급 카드 최종 확인", yesLabel: "분해", noLabel: "취소" });
            } else execute();
        };
        const message = `${escapeSkillHtml(skill.word)} 카드를 분해해 각성 정수 <b>${amount}</b>개를 얻을까요?<br>재획득할 수 있고 영구 도감 기록은 남습니다.`;
        if (typeof showConfirm === "function") showConfirm(message, finalConfirm, null, { icon: "✨", title: "스킬 카드 분해", yesLabel: "계속", noLabel: "취소" });
        else if (window.confirm(message.replace(/<[^>]+>/g, "")) && (!["legendary", "mythic"].includes(skill.grade) || window.confirm("고등급 카드입니다. 정말 분해할까요?"))) execute();
    };

    toggleSelectCombineSkill = function toggleSelectCombineSkillReworked(skillId) {
        normalizeSkillSystemState();
        const selectedIndex = selectedCombineSkillIds.indexOf(skillId);
        if (selectedIndex >= 0) {
            selectedCombineSkillIds.splice(selectedIndex, 1);
            updateCombineSelectionUI();
            return;
        }
        const skill = gameState.skillsInventory.find((item) => item.id === skillId);
        if (!skill) return;
        const reason = skillProtectionReason(skill);
        if (reason) return showToast(`⚠️ ${reason}`);
        if (skill.grade === "mythic") return showToast("⚠️ 신화 카드는 합성할 수 없지만 분해하여 정수로 바꿀 수 있습니다.");
        if (selectedCombineSkillIds.length >= 3) return showToast("⚠️ 합성 재료는 최대 3장입니다.");
        selectedCombineSkillIds.push(skillId);
        updateCombineSelectionUI();
    };

    updateCombineSelectionUI = function updateCombineSelectionUIReworked() {
        sanitizeSelectedCombineSkillIds();
        const count = document.getElementById("selectedCombineCountText");
        if (count) count.textContent = String(selectedCombineSkillIds.length);
        const group = document.getElementById("selectedManualCombineGroup");
        group?.classList.toggle("hidden", selectedCombineSkillIds.length === 0);
        group?.classList.toggle("flex", selectedCombineSkillIds.length > 0);
        buildSkillTabUI();
    };

    function chooseFusionWord(cards, random = Math.random) {
        return SkillRules.weightedPick(cards, (skill) => SkillRules.effectiveFusionWeight(skill), random) || cards[0];
    }

    function resolveFusion(cards, random = Math.random) {
        const sameGrade = cards.every((skill) => skill.grade === cards[0].grade);
        const pity = sameGrade ? Number(gameState.skillFusionPity[cards[0].grade]) || 0 : 0;
        const preview = SkillRules.fusionPreview(cards, pity);
        const resultGrade = SkillRules.rollDistribution(preview.distribution, random);
        if (sameGrade) gameState.skillFusionPity[cards[0].grade] = resultGrade === preview.nextGrade ? 0 : Math.min(5, pity + 1);
        const source = chooseFusionWord(cards, random);
        cards.forEach(removeSkillCard);
        const result = createOwnedSkill(source.word, source.meaning, resultGrade, source.tier);
        return { preview, resultGrade, result };
    }

    function fusionDistributionText(preview) {
        return Object.entries(preview.distribution).filter(([, chance]) => chance > 0).map(([grade, chance]) => `${SKILL_GRADES[grade]?.name || grade} ${Math.round(chance * 1000) / 10}%`).join(" · ");
    }

    combineSkills = function combineSkillsReworked() {
        normalizeSkillSystemState();
        const available = gameState.skillsInventory.filter((skill) => skill.grade !== "mythic" && !isSkillProtected(skill));
        let cards = [];
        if (selectedCombineSkillIds.length) {
            if (selectedCombineSkillIds.length !== 3) return showToast(`⚠️ 카드를 3장 선택해야 합니다. (현재 ${selectedCombineSkillIds.length}장)`);
            cards = selectedCombineSkillIds.map((id) => available.find((skill) => skill.id === id)).filter(Boolean);
        } else {
            for (const grade of ["normal", "rare", "hero", "legendary"]) {
                const group = available.filter((skill) => skill.grade === grade).sort((a, b) => SkillRules.effectiveFusionWeight(a) - SkillRules.effectiveFusionWeight(b));
                if (group.length >= 3) { cards = group.slice(0, 3); break; }
            }
            if (cards.length < 3) cards = available.sort((a, b) => SkillRules.effectiveFusionWeight(a) - SkillRules.effectiveFusionWeight(b)).slice(0, 3);
        }
        if (cards.length !== 3) return showToast("⚠️ 보호되지 않은 합성 가능 카드가 3장 필요합니다.");
        const sameGrade = cards.every((skill) => skill.grade === cards[0].grade);
        const preview = SkillRules.fusionPreview(cards, sameGrade ? gameState.skillFusionPity[cards[0].grade] : 0);
        const modeText = sameGrade ? `동일 등급 승급 도전 · 실패 보정 ${Number(gameState.skillFusionPity[cards[0].grade] || 0) * 15}%p` : "혼합 카드 가중 평균 · 최고 재료 등급을 초과하지 않음";
        const html = `<b>${modeText}</b><br><br>${cards.map((skill) => `[${SKILL_GRADES[skill.grade].name}] T${skill.tier} ★${skill.stars} ${escapeSkillHtml(skill.word)}`).join("<br>")}<br><br><span class="text-yellow-300">결과: ${fusionDistributionText(preview)}</span><br><span class="text-gray-400">결과 단어도 세 카드의 품질 가중치로 선택됩니다.</span>`;
        showCombinePreviewModal(html, () => {
            const resolved = resolveFusion(cards);
            selectedCombineSkillIds = [];
            playSoundEffect("levelup");
            showToast(`🔮 [${SKILL_GRADES[resolved.resultGrade].name}] ${resolved.result.word} 합성 완료!`);
            buildSkillTabUI(); renderSkillsUI(); refreshStateVisuals(); saveLocalCache();
        });
    };

    batchCombineSkills = function batchCombineSkillsReworked() {
        normalizeSkillSystemState();
        const allowed = [
            ["normal", "chkGradeNormal"], ["rare", "chkGradeRare"], ["hero", "chkGradeHero"], ["legendary", "chkGradeLegendary"]
        ].filter(([, id]) => document.getElementById(id)?.checked).map(([grade]) => grade);
        const groups = [];
        allowed.forEach((grade) => {
            const pool = gameState.skillsInventory.filter((skill) => skill.grade === grade && !isSkillProtected(skill)).sort((a, b) => SkillRules.effectiveFusionWeight(a) - SkillRules.effectiveFusionWeight(b));
            while (pool.length >= 3) groups.push(pool.splice(0, 3));
        });
        if (!groups.length) return showToast("⚠️ 선택 등급에서 보호되지 않은 동일 등급 카드 3장 묶음이 없습니다.");
        const details = groups.map((cards, index) => {
            const preview = SkillRules.fusionPreview(cards, gameState.skillFusionPity[cards[0].grade]);
            return `${index + 1}. ${SKILL_GRADES[cards[0].grade].name} 3장 → ${index === 0 ? fusionDistributionText(preview) : "앞선 결과에 따라 실패 보정 확률 변동"}`;
        }).join("<br>");
        showCombinePreviewModal(`<b>낮은 품질 카드부터 ${groups.length}회 일괄 합성합니다.</b><br><br>${details}<br><br>장착·집중 연구·잠금 카드는 제외됩니다.`, () => {
            const results = groups.map((cards) => resolveFusion(cards));
            selectedCombineSkillIds = [];
            showToast(`✨ 일괄 합성 ${results.length}회 완료!`);
            buildSkillTabUI(); renderSkillsUI(); refreshStateVisuals(); saveLocalCache();
        });
    };

    equipSkill = function equipSkillReworked(skillId) {
        normalizeSkillSystemState();
        if (gameState.equippedSkills.includes(skillId)) return;
        if (gameState.equippedSkills.length >= 4) return showToast("⚠️ 장착 슬롯은 최대 4개입니다.");
        gameState.equippedSkills.push(skillId);
        selectedCombineSkillIds = selectedCombineSkillIds.filter((id) => id !== skillId);
        buildSkillTabUI(); renderSkillsUI(); refreshStateVisuals(); saveLocalCache();
        showToast("🔮 스킬을 장착했습니다.");
    };

    autoEquipBestSkills = function autoEquipBestSkillsReworked() {
        normalizeSkillSystemState();
        gameState.equippedSkills = [...gameState.skillsInventory].sort((a, b) => getSkillMultiplier(b) - getSkillMultiplier(a)).slice(0, 4).map((skill) => skill.id);
        sanitizeSelectedCombineSkillIds(); buildSkillTabUI(); renderSkillsUI(); refreshStateVisuals(); saveLocalCache();
        showToast("✨ 가장 강력한 스킬 4개를 장착했습니다.");
    };

    window.handleSkillCardKeydown = function handleSkillCardKeydownReworked(event, skillId) {
        if (event.target !== event.currentTarget || !["Enter", " "].includes(event.key)) return;
        event.preventDefault(); toggleSelectCombineSkill(skillId);
    };

    function skillProgressLabel(skill) {
        if (SkillRules.isMaxSkill(skill)) return "MAX";
        if ((skill.stars || 0) >= 6) return "다음 성장: 티어 진화";
        return `다음 성장: ★${(skill.stars || 0) + 1}`;
    }

    function renderResearchTargets() {
        const slots = document.getElementById("skillResearchTargetSlots");
        const options = document.getElementById("skillResearchWordOptions");
        const essence = document.getElementById("skillEssenceCount");
        if (essence) essence.textContent = Number(gameState.skillEssence || 0).toLocaleString();
        if (options) options.innerHTML = getSkillSourcePool().map((entry) => `<option value="${escapeSkillHtml(entry.word)}">${escapeSkillHtml(entry.meaning)}</option>`).join("");
        if (!slots) return;
        const source = new Map(getSkillSourcePool().map((entry) => [wordKey(entry.word), entry]));
        slots.innerHTML = Array.from({ length: 4 }, (_, index) => {
            const key = gameState.skillResearchTargets[index];
            if (!key) return `<div class="flex min-h-12 items-center justify-center border border-dashed border-cyan-900 text-[9px] text-gray-600">${index + 1} · 비어 있음</div>`;
            const owned = gameState.skillsInventory.find((skill) => wordKey(skill.word) === key);
            const entry = owned || source.get(key) || { word: key, meaning: "" };
            const inCurrentPack = source.has(key);
            const researchStatus = owned ? "보유 성장 ×5" : inCurrentPack ? "획득 희망 ×5" : "현재 팩 밖 · 획득 일시정지";
            return `<button type="button" onclick="removeSkillResearchTarget(${skillJsArg(key)})" class="min-h-12 border border-cyan-700 bg-black p-2 text-left hover:border-red-400" title="클릭하여 연구 대상 해제"><b class="block truncate text-[10px] text-cyan-200">${index + 1}. ${escapeSkillHtml(capitalizeFirstLetter(entry.word))}</b><span class="block truncate text-[8px] text-gray-500">${researchStatus} · ${escapeSkillHtml(entry.meaning)}</span></button>`;
        }).join("");
    }

    buildSkillTabUI = function buildSkillTabUIReworked() {
        normalizeSkillSystemState();
        ensureActiveSkillDeck();
        sanitizeSelectedCombineSkillIds();
        renderResearchTargets();
        const deckInfo = document.getElementById("skillDeckInfo");
        if (deckInfo) deckInfo.textContent = `연구 후보 ${gameState.activeSkillDeck.length}/24 · 기본 분기 신규 40% / 보유 성장 50% / 각성 정수 10% · 후보가 없으면 재배분 · 보유 카드 성장은 현재 팩 ${getSkillSourcePool().length}개와 무관`;
        const count = document.getElementById("selectedCombineCountText");
        if (count) count.textContent = String(selectedCombineSkillIds.length);
        const manualGroup = document.getElementById("selectedManualCombineGroup");
        manualGroup?.classList.toggle("hidden", selectedCombineSkillIds.length === 0);
        manualGroup?.classList.toggle("flex", selectedCombineSkillIds.length > 0);

        const eqGrid = document.getElementById("equippedSkillsGrid");
        if (eqGrid) eqGrid.innerHTML = Array.from({ length: 4 }, (_, index) => {
            const skill = gameState.skillsInventory.find((entry) => entry.id === gameState.equippedSkills[index]);
            if (!skill) return `<div class="flex min-h-[85px] items-center justify-center border border-dashed border-[#3c3c3c] p-2 text-[8px] font-bold text-[#7e7e7e]">슬롯 비어있음</div>`;
            const grade = SKILL_GRADES[skill.grade] || SKILL_GRADES.normal;
            return `<div class="group relative flex min-h-[85px] flex-col justify-between border-2 ${grade.colorClass} p-2 text-center"><button type="button" onclick="unequipSkill('${safeSkillId(skill.id)}')" class="absolute -right-1 -top-1 z-20 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-[9px] font-black text-white opacity-0 group-hover:opacity-100">×</button><div class="flex justify-between text-[7px] font-bold"><span>${grade.name} T${skill.tier}</span><span class="text-yellow-400">★${skill.stars}</span></div><b class="truncate text-[10px] text-white">${escapeSkillHtml(capitalizeFirstLetter(skill.word))}</b><span class="text-[8px] font-bold text-pink-300">지수 ×${getSkillMultiplier(skill)}</span></div>`;
        }).join("");

        const invGrid = document.getElementById("skillsInventoryGrid");
        if (!invGrid) return;
        if (!gameState.skillsInventory.length) {
            invGrid.innerHTML = `<p class="col-span-4 py-8 text-center text-xs text-[#7e7e7e]">아직 획득한 스킬이 없습니다.</p>`;
            return;
        }
        const inventory = sortSkillInventory(gameState.skillsInventory);
        invGrid.innerHTML = inventory.map((skill) => {
            const grade = SKILL_GRADES[skill.grade] || SKILL_GRADES.normal;
            const selected = selectedCombineSkillIds.includes(skill.id);
            const equipped = gameState.equippedSkills.includes(skill.id);
            const focused = isSkillResearchTarget(skill);
            const locked = gameState.skillLockedWords.includes(wordKey(skill.word));
            const maxExp = Math.max(1, skill.maxExp || SkillRules.requiredExp(skill.grade));
            const pct = Math.min(100, Math.round((Number(skill.exp) || 0) / maxExp * 100));
            const id = safeSkillId(skill.id);
            return `<article data-skill-card data-skill-id="${id}" data-selected="${selected}" role="button" tabindex="0" aria-pressed="${selected}" onclick="toggleSelectCombineSkill('${id}')" onkeydown="handleSkillCardKeydown(event,'${id}')" class="skill-inventory-card group relative flex min-h-[190px] cursor-pointer flex-col justify-between border-2 ${equipped ? "border-white" : "border-[#262626]"} ${grade.colorClass} bg-[#0d0d0d] p-2 text-center">
                ${selected ? `<span class="absolute -left-1 -top-2 z-20 bg-yellow-400 px-1.5 py-0.5 text-[8px] font-black text-black">합성 선택</span>` : ""}
                <div><div class="flex items-center justify-between text-[8px] font-bold"><span>${grade.name} T${skill.tier}</span><span class="text-yellow-400">★${skill.stars}${SkillRules.isMaxSkill(skill) ? " MAX" : ""}</span></div><b class="mt-1 block truncate text-xs text-white">${escapeSkillHtml(capitalizeFirstLetter(skill.word))}</b><span class="block truncate text-[9px] text-[#bbb]">${escapeSkillHtml(skill.meaning)}</span><span class="mt-1 block text-[9px] font-black text-pink-300">지수 ×${getSkillMultiplier(skill)}</span></div>
                <div class="mt-1.5"><div class="h-1.5 w-full overflow-hidden border border-[#3c3c3c] bg-[#111]"><div class="h-full bg-yellow-500" style="width:${pct}%"></div></div><div class="mb-1 flex justify-between text-[7px] text-gray-400"><span>${skillProgressLabel(skill)}</span><span>${skill.exp}/${maxExp}</span></div>
                    <div class="grid grid-cols-2 gap-1"><button type="button" data-skill-action="focus" onclick="event.stopPropagation();toggleSkillResearch('${id}')" class="border border-cyan-800 bg-cyan-950/50 py-1 text-[8px] font-bold text-cyan-200">${focused ? "연구 해제" : "집중 연구"}</button><button type="button" data-skill-action="lock" onclick="event.stopPropagation();toggleSkillLock('${id}')" class="border border-gray-700 bg-black py-1 text-[8px] font-bold text-gray-300">${locked ? "🔒 잠금 해제" : "🔓 잠금"}</button><button type="button" data-skill-action="essence" onclick="event.stopPropagation();applyEssenceToSkill('${id}')" class="border border-amber-800 bg-amber-950/30 py-1 text-[8px] font-bold text-amber-200">정수 100 투입</button><button type="button" data-skill-action="dismantle" onclick="event.stopPropagation();dismantleSkill('${id}')" class="border border-red-900 bg-red-950/30 py-1 text-[8px] font-bold text-red-300">분해 +${SkillRules.dismantleYield(skill)}</button></div>
                    <button type="button" data-skill-action="equip" onclick="event.stopPropagation();${equipped ? `unequipSkill('${id}')` : `equipSkill('${id}')`}" class="mt-1 w-full py-1 text-[9px] font-black ${equipped ? "bg-red-600 text-white" : "bg-white text-black"}">${equipped ? "장착 해제" : "장착하기"}</button>
                </div></article>`;
        }).join("");
    };

    Object.assign(window.__vocaHeroTestHooks = window.__vocaHeroTestHooks || {}, {
        normalizeSkillSystemState,
        executeSkillDrawBatch,
        isSkillProtected,
        skillProtectionReason,
        acquireSkillOutcome,
        fusionPreview: SkillRules.fusionPreview,
        dismantleYield: SkillRules.dismantleYield,
        skillInventorySortWeight,
        sortSkillInventory,
        seedSkillInteractionDemo() {
            gameState.wordsPool = [
                { word: "apple", meaning: "사과", spiralRank: 1 }, { word: "book", meaning: "책", spiralRank: 2 },
                { word: "cloud", meaning: "구름", spiralRank: 3 }, { word: "dream", meaning: "꿈", spiralRank: 4 },
                { word: "earth", meaning: "지구", spiralRank: 5 }
            ];
            gameState.skillsInventory = [
                { id: "test_apple", word: "apple", meaning: "사과", grade: "rare", tier: 3, stars: 1, exp: 0, maxExp: 3, cooldownRemaining: 0, maxCooldown: 30 },
                { id: "test_book", word: "book", meaning: "책", grade: "hero", tier: 2, stars: 2, exp: 0, maxExp: 9, cooldownRemaining: 0, maxCooldown: 30 },
                { id: "test_cloud", word: "cloud", meaning: "구름", grade: "legendary", tier: 3, stars: 0, exp: 0, maxExp: 27, cooldownRemaining: 0, maxCooldown: 30 },
                { id: "test_dream", word: "dream", meaning: "꿈", grade: "mythic", tier: 3, stars: 0, exp: 0, maxExp: 81, cooldownRemaining: 0, maxCooldown: 30 },
                { id: "test_vision", word: "vision", meaning: "비전", grade: "mythic", tier: 3, stars: 0, exp: 0, maxExp: 81, cooldownRemaining: 0, maxCooldown: 30 }
            ];
            gameState.equippedSkills = [];
            gameState.skillResearchTargets = [];
            gameState.skillLockedWords = [];
            gameState.skillDiscoveredWords = [];
            gameState.skillEssence = 200;
            selectedCombineSkillIds = [];
            buildSkillTabUI();
            return true;
        },
        interactionState() {
            return { selected: [...selectedCombineSkillIds], equipped: [...gameState.equippedSkills], research: [...gameState.skillResearchTargets], locked: [...gameState.skillLockedWords] };
        }
    });

    window.applyEssenceToSkill = applyEssenceToSkill;
    window.normalizeSkillSystemState = normalizeSkillSystemState;
    normalizeSkillSystemState();
})();
