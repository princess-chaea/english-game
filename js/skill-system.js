(function initializeVocaSkillSystem(root) {
    "use strict";

    const GRADE_ORDER = Object.freeze(["normal", "rare", "hero", "legendary", "mythic"]);
    const FUSION_GRADE_ORDER = Object.freeze(["normal", "rare", "hero", "legendary"]);
    const GRADE_RANK = Object.freeze({ normal: 1, rare: 2, hero: 3, legendary: 4, mythic: 5 });
    const GRADE_EXP = Object.freeze({ normal: 1, rare: 3, hero: 9, legendary: 27, mythic: 81 });
    const FUSION_GRADE_WEIGHT = Object.freeze({ normal: 1, rare: 3, hero: 9, legendary: 27 });
    const DISMANTLE_GRADE_ESSENCE = Object.freeze({ normal: 1, rare: 3, hero: 9, legendary: 27, mythic: 81 });
    const TIER_FACTOR = Object.freeze({ 1: 1.2, 2: 1.1, 3: 1 });
    const TIER_ESSENCE_BONUS = Object.freeze({ 1: 100, 2: 50, 3: 0 });
    const SUMMON_CATEGORY_WEIGHT = Object.freeze({ new: 0.4, growth: 0.5, essence: 0.1 });
    const SUMMON_CATEGORY_ORDER = Object.freeze(["new", "growth", "essence"]);
    const MAX_STARS = 6;
    const MAX_PROGRESS_INDEX = 20;
    const ESSENCE_PER_BAR = 100;

    function clamp(value, minimum, maximum) {
        return Math.min(maximum, Math.max(minimum, value));
    }

    function finiteNumber(value, fallback = 0) {
        const number = Number(value);
        return Number.isFinite(number) ? number : fallback;
    }

    function integerInRange(value, minimum, maximum, fallback = minimum) {
        return clamp(Math.floor(finiteNumber(value, fallback)), minimum, maximum);
    }

    function normalizeGrade(grade) {
        return GRADE_RANK[grade] ? grade : "normal";
    }

    function normalizeWordKey(value) {
        return String(value && typeof value === "object" ? value.word : value || "").trim().toLowerCase();
    }

    function getRequiredExpForStar(grade) {
        return GRADE_EXP[normalizeGrade(grade)];
    }

    function normalizeSkillCard(skill = {}) {
        const grade = normalizeGrade(skill.grade);
        const maxExp = getRequiredExpForStar(grade);
        return {
            ...skill,
            grade,
            tier: integerInRange(skill.tier, 1, 3, 3),
            stars: integerInRange(skill.stars, 0, MAX_STARS, 0),
            exp: integerInRange(skill.exp, 0, Math.max(0, maxExp - 1), 0),
            maxExp
        };
    }

    function getProgressRatio(skill) {
        const normalized = normalizeSkillCard(skill);
        return normalized.maxExp > 0 ? normalized.exp / normalized.maxExp : 0;
    }

    // T3 0~6성(0~6), T2 0~6성(7~13), T1 0~6성(14~20)을 한 축으로 다룬다.
    function getSkillProgressIndex(skill) {
        const normalized = normalizeSkillCard(skill);
        return (3 - normalized.tier) * 7 + normalized.stars;
    }

    function decodeSkillProgressIndex(index) {
        const safeIndex = integerInRange(index, 0, MAX_PROGRESS_INDEX, 0);
        if (safeIndex <= 6) return { tier: 3, stars: safeIndex };
        if (safeIndex <= 13) return { tier: 2, stars: safeIndex - 7 };
        return { tier: 1, stars: safeIndex - 14 };
    }

    function advanceSkillBars(skill, bars = 1) {
        const card = normalizeSkillCard(skill);
        const requestedBars = Math.max(0, Math.floor(finiteNumber(bars, 0)));
        const beforeIndex = getSkillProgressIndex(card);
        const barsApplied = Math.min(requestedBars, MAX_PROGRESS_INDEX - beforeIndex);
        const barsOverflow = requestedBars - barsApplied;
        const afterIndex = beforeIndex + barsApplied;
        const decoded = decodeSkillProgressIndex(afterIndex);
        const nextCard = { ...card, ...decoded };
        const events = [];

        if (decoded.tier < card.tier) {
            events.push({ type: "tier-evolution", fromTier: card.tier, toTier: decoded.tier });
        }
        if (afterIndex !== beforeIndex) {
            events.push({ type: "growth", bars: barsApplied, fromIndex: beforeIndex, toIndex: afterIndex });
        }
        if (barsOverflow > 0) {
            events.push({ type: "max-essence", bars: barsOverflow, amount: barsOverflow * ESSENCE_PER_BAR });
        }

        return {
            card: nextCard,
            barsApplied,
            barsOverflow,
            essenceDelta: barsOverflow * ESSENCE_PER_BAR,
            events
        };
    }

    function applyGrowthOutcome(skill, outcome = {}) {
        const before = normalizeSkillCard(skill);
        let card = { ...before };
        const events = [];
        let essenceDelta = 0;
        const rolledGrade = normalizeGrade(outcome.grade);
        const rolledTier = integerInRange(outcome.tier, 1, 3, 3);
        const oldGradeRank = GRADE_RANK[before.grade];
        const rolledGradeRank = GRADE_RANK[rolledGrade];

        if (rolledGradeRank > oldGradeRank) {
            const oldRatio = getProgressRatio(card);
            card.grade = rolledGrade;
            card.maxExp = getRequiredExpForStar(rolledGrade);
            card.exp = Math.min(card.maxExp - 1, Math.floor(oldRatio * card.maxExp));
            events.push({ type: "grade-up", fromGrade: before.grade, toGrade: rolledGrade });
        }

        if (rolledTier < card.tier) {
            const fromTier = card.tier;
            card.tier = rolledTier;
            events.push({ type: "tier-up", fromTier, toTier: rolledTier });
        }

        // 같은 등급이나 낮은 등급도 현재 카드 기준 성장 바를 최소 1칸 보장한다.
        if (rolledGradeRank <= oldGradeRank) {
            const advanced = advanceSkillBars(card, Math.max(1, Math.floor(finiteNumber(outcome.bars, 1))));
            card = advanced.card;
            essenceDelta += advanced.essenceDelta;
            events.push(...advanced.events);
        }

        return { card, essenceDelta, events };
    }

    function getDismantleYield(skill) {
        const card = normalizeSkillCard(skill);
        const expPart = Math.floor(50 * getProgressRatio(card));
        return DISMANTLE_GRADE_ESSENCE[card.grade]
            + 50 * card.stars
            + expPart
            + TIER_ESSENCE_BONUS[card.tier];
    }

    function isSkillProtected(skill, protection = {}) {
        const cardId = String(skill?.id || "");
        const word = normalizeWordKey(skill);
        const equippedIds = new Set((protection.equippedIds || []).map(String));
        const researchWords = new Set((protection.researchWords || []).map(normalizeWordKey));
        const lockedWords = new Set((protection.lockedWords || []).map(normalizeWordKey));
        return equippedIds.has(cardId) || researchWords.has(word) || lockedWords.has(word);
    }

    function getFusionProgressRatio(skill) {
        return clamp(getProgressRatio(skill), 0, 1);
    }

    function getFusionEffectiveWeight(skill) {
        const card = normalizeSkillCard(skill);
        if (!FUSION_GRADE_WEIGHT[card.grade]) {
            throw new RangeError("Mythic cards cannot be used as fusion material.");
        }
        const starFactor = 1 + 0.15 * card.stars;
        const residualExpFactor = 1 + 0.15 * getFusionProgressRatio(card);
        return FUSION_GRADE_WEIGHT[card.grade] * TIER_FACTOR[card.tier] * starFactor * residualExpFactor;
    }

    function validateFusionCards(cards, requireSameGrade = null) {
        if (!Array.isArray(cards) || cards.length !== 3) {
            throw new RangeError("Fusion requires exactly three cards.");
        }
        const normalized = cards.map(normalizeSkillCard);
        if (normalized.some(card => card.grade === "mythic")) {
            throw new RangeError("Mythic cards cannot be used as fusion material.");
        }
        const sameGrade = normalized.every(card => card.grade === normalized[0].grade);
        if (requireSameGrade === true && !sameGrade) throw new RangeError("Same-grade fusion requires three cards of one grade.");
        if (requireSameGrade === false && sameGrade) throw new RangeError("Mixed fusion requires at least two different grades.");
        return normalized;
    }

    function getSameGradePromotionChance(cards, pityFailures = 0) {
        const normalized = validateFusionCards(cards, true);
        const totalStars = normalized.reduce((sum, card) => sum + card.stars, 0);
        // 잔여 EXP는 등급별 절댓값 대신 바 진행률로 환산해 최대 +15%p만 준다.
        const expBonus = normalized.reduce((sum, card) => sum + getFusionProgressRatio(card), 0) * 0.05;
        const pityBonus = Math.max(0, Math.floor(finiteNumber(pityFailures, 0))) * 0.15;
        return Math.min(0.95, 0.2 + totalStars * 0.1 + expBonus + pityBonus);
    }

    function getSameGradeFusionProfile(cards, pityFailures = 0) {
        const normalized = validateFusionCards(cards, true);
        const currentGrade = normalized[0].grade;
        const currentIndex = GRADE_ORDER.indexOf(currentGrade);
        const nextGrade = GRADE_ORDER[currentIndex + 1];
        if (!nextGrade) throw new RangeError("Mythic cards cannot be promoted by fusion.");
        const promotionChance = getSameGradePromotionChance(normalized, pityFailures);
        const probabilities = Object.fromEntries(GRADE_ORDER.map(grade => [grade, 0]));
        probabilities[currentGrade] = 1 - promotionChance;
        probabilities[nextGrade] = promotionChance;
        return { kind: "same-grade", currentGrade, nextGrade, promotionChance, probabilities };
    }

    function getMixedFusionProfile(cards) {
        const normalized = validateFusionCards(cards, false);
        const effectiveWeights = normalized.map(getFusionEffectiveWeight);
        const score = effectiveWeights.reduce((sum, value) => sum + value, 0) / effectiveWeights.length;
        const highestGradeIndex = Math.max(...normalized.map(card => FUSION_GRADE_ORDER.indexOf(card.grade)));
        const probabilities = Object.fromEntries(GRADE_ORDER.map(grade => [grade, 0]));

        if (score >= FUSION_GRADE_WEIGHT[FUSION_GRADE_ORDER[highestGradeIndex]]) {
            probabilities[FUSION_GRADE_ORDER[highestGradeIndex]] = 1;
        } else {
            let lowerIndex = 0;
            for (let index = 0; index < highestGradeIndex; index += 1) {
                if (score >= FUSION_GRADE_WEIGHT[FUSION_GRADE_ORDER[index]]) lowerIndex = index;
            }
            const upperIndex = Math.min(lowerIndex + 1, highestGradeIndex);
            if (upperIndex === lowerIndex) {
                probabilities[FUSION_GRADE_ORDER[lowerIndex]] = 1;
            } else {
                const lowerGrade = FUSION_GRADE_ORDER[lowerIndex];
                const upperGrade = FUSION_GRADE_ORDER[upperIndex];
                const lowerWeight = FUSION_GRADE_WEIGHT[lowerGrade];
                const upperWeight = FUSION_GRADE_WEIGHT[upperGrade];
                const upperChance = clamp((score - lowerWeight) / (upperWeight - lowerWeight), 0, 1);
                probabilities[lowerGrade] = 1 - upperChance;
                probabilities[upperGrade] = upperChance;
            }
        }

        return {
            kind: "mixed",
            score,
            effectiveWeights,
            highestGrade: FUSION_GRADE_ORDER[highestGradeIndex],
            probabilities
        };
    }

    function getFusionProfile(cards, pityFailures = 0) {
        const normalized = validateFusionCards(cards);
        const sameGrade = normalized.every(card => card.grade === normalized[0].grade);
        return sameGrade
            ? getSameGradeFusionProfile(normalized, pityFailures)
            : getMixedFusionProfile(normalized);
    }

    function safeRandom(rng = Math.random) {
        return clamp(finiteNumber(rng(), 0), 0, 1 - Number.EPSILON);
    }

    function rollProbabilityMap(probabilities, order, rng = Math.random) {
        const roll = safeRandom(rng);
        let cumulative = 0;
        for (const key of order) {
            cumulative += Math.max(0, finiteNumber(probabilities[key], 0));
            if (roll < cumulative) return key;
        }
        return order[order.length - 1];
    }

    function rollFusionGrade(profile, rng = Math.random) {
        if (!profile || !profile.probabilities) throw new TypeError("A fusion profile is required.");
        return rollProbabilityMap(profile.probabilities, GRADE_ORDER, rng);
    }

    function getSummonCategoryProbabilities(options = {}) {
        const newAvailable = options.newAvailable !== false;
        const growthAvailable = options.growthAvailable !== false;
        const weights = {
            new: newAvailable ? SUMMON_CATEGORY_WEIGHT.new : 0,
            growth: growthAvailable ? SUMMON_CATEGORY_WEIGHT.growth : 0,
            essence: SUMMON_CATEGORY_WEIGHT.essence
        };
        const total = weights.new + weights.growth + weights.essence;
        return Object.fromEntries(SUMMON_CATEGORY_ORDER.map(category => [category, weights[category] / total]));
    }

    function rollSummonCategory(options = {}, rng = Math.random) {
        return rollProbabilityMap(getSummonCategoryProbabilities(options), SUMMON_CATEGORY_ORDER, rng);
    }

    function countCategory(block, category) {
        return block.reduce((count, value) => count + (value === category ? 1 : 0), 0);
    }

    function enforceCategoryMinimum(block, category, minimum, minimums) {
        while (countCategory(block, category) < minimum) {
            let replacementIndex = block.findIndex(value => value === "essence" && countCategory(block, value) > (minimums[value] || 0));
            if (replacementIndex < 0) {
                replacementIndex = block.findIndex(value => value !== category && countCategory(block, value) > (minimums[value] || 0));
            }
            if (replacementIndex < 0) break;
            block[replacementIndex] = category;
        }
    }

    function planSummonCategories(count = 1, options = {}, rng = Math.random) {
        const safeCount = Math.max(0, Math.floor(finiteNumber(count, 0)));
        const categories = Array.from({ length: safeCount }, () => rollSummonCategory(options, rng));
        if (options.guarantees === false) return categories;

        for (let offset = 0; offset + 10 <= categories.length; offset += 10) {
            const block = categories.slice(offset, offset + 10);
            const minimums = {
                new: options.newAvailable === false ? 0 : 1,
                growth: options.growthAvailable === false ? 0 : 3,
                essence: 0
            };
            enforceCategoryMinimum(block, "new", minimums.new, minimums);
            enforceCategoryMinimum(block, "growth", minimums.growth, minimums);
            categories.splice(offset, 10, ...block);
        }
        return categories;
    }

    function pickWeighted(items, weightForItem, rng = Math.random) {
        if (!Array.isArray(items) || items.length === 0) return null;
        const weights = items.map((item, index) => Math.max(0, finiteNumber(weightForItem(item, index), 0)));
        const total = weights.reduce((sum, value) => sum + value, 0);
        if (total <= 0) return items[0];
        let cursor = safeRandom(rng) * total;
        for (let index = 0; index < items.length; index += 1) {
            cursor -= weights[index];
            if (cursor < 0) return items[index];
        }
        return items[items.length - 1];
    }

    function pickGrowthTarget(candidates, options = {}, rng = Math.random) {
        if (!Array.isArray(candidates) || candidates.length === 0) {
            return { target: null, focusMisses: 0, forcedFocus: false };
        }
        const researchWords = new Set((options.researchWords || []).map(normalizeWordKey));
        const equippedIds = new Set((options.equippedIds || []).map(String));
        const focused = candidates.filter(card => researchWords.has(normalizeWordKey(card)));
        const currentMisses = Math.max(0, Math.floor(finiteNumber(options.focusMisses, 0)));
        const forcedFocus = focused.length > 0 && currentMisses >= 7;
        const source = forcedFocus ? focused : candidates;
        const target = pickWeighted(source, card => {
            if (researchWords.has(normalizeWordKey(card))) return 5;
            if (equippedIds.has(String(card?.id || ""))) return 2;
            return 1;
        }, rng);
        const selectedFocus = Boolean(target && researchWords.has(normalizeWordKey(target)));
        return {
            target,
            forcedFocus,
            focusMisses: focused.length === 0 || selectedFocus ? 0 : currentMisses + 1
        };
    }

    const api = {
        GRADE_ORDER,
        GRADE_RANK,
        GRADE_EXP,
        FUSION_GRADE_WEIGHT,
        SUMMON_CATEGORY_WEIGHT,
        ESSENCE_PER_BAR,
        normalizeWordKey,
        normalizeSkillCard,
        getRequiredExpForStar,
        getProgressRatio,
        getSkillProgressIndex,
        decodeSkillProgressIndex,
        advanceSkillBars,
        applyGrowthOutcome,
        getDismantleYield,
        isSkillProtected,
        getFusionEffectiveWeight,
        getSameGradePromotionChance,
        getSameGradeFusionProfile,
        getMixedFusionProfile,
        getFusionProfile,
        rollFusionGrade,
        getSummonCategoryProbabilities,
        rollSummonCategory,
        planSummonCategories,
        pickWeighted,
        pickGrowthTarget
    };

    root.VocaSkillSystem = Object.freeze(api);
})(typeof globalThis !== "undefined" ? globalThis : window);
