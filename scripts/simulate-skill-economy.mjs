import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

await import("../js/skill-system.js");

const skills = globalThis.VocaSkillSystem;
assert.ok(skills, "VocaSkillSystem global was not initialized");

function mulberry32(seed) {
    let state = seed >>> 0;
    return function random() {
        state += 0x6D2B79F5;
        let value = state;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
}

function assertClose(actual, expected, tolerance = 1e-10, message = "values differ") {
    assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: expected ${expected}, got ${actual}`);
}

function makeCard(grade, overrides = {}) {
    return {
        id: `${grade}-${Math.random()}`,
        word: grade,
        meaning: grade,
        grade,
        tier: 3,
        stars: 0,
        exp: 0,
        maxExp: skills.getRequiredExpForStar(grade),
        ...overrides
    };
}

const packSizes = [150, 600, 3001];
const drawsPerPack = 100_000;
const blocksPerPack = drawsPerPack / 10;
const categoryResults = [];

for (const packSize of packSizes) {
    const rng = mulberry32(0x5EEDC0DE);
    const counts = { new: 0, growth: 0, essence: 0 };

    for (let blockIndex = 0; blockIndex < blocksPerPack; blockIndex += 1) {
        // 후보가 존재하는 동안 팩 크기는 category 확률에 관여하지 않아야 한다.
        const plan = skills.planSummonCategories(10, {
            packSize,
            newAvailable: true,
            growthAvailable: true
        }, rng);

        const blockCounts = { new: 0, growth: 0, essence: 0 };
        for (const category of plan) {
            counts[category] += 1;
            blockCounts[category] += 1;
        }
        assert.ok(blockCounts.new >= 1, `${packSize}-word pack lost the 10-pull new-card guarantee`);
        assert.ok(blockCounts.growth >= 3, `${packSize}-word pack lost the 10-pull growth guarantee`);
    }

    const ratios = Object.fromEntries(Object.entries(counts).map(([key, value]) => [key, value / drawsPerPack]));
    assert.ok(ratios.new >= 0.39 && ratios.new <= 0.41, `unexpected new-card ratio for pack ${packSize}`);
    assert.ok(ratios.growth >= 0.50 && ratios.growth <= 0.52, `unexpected growth ratio for pack ${packSize}`);
    assert.ok(ratios.essence >= 0.08 && ratios.essence <= 0.105, `unexpected essence ratio for pack ${packSize}`);
    categoryResults.push({ packSize, counts, ratios });
}

for (const result of categoryResults.slice(1)) {
    assert.deepEqual(result.counts, categoryResults[0].counts, "pack size changed category planning with the same seed");
}

const noNewRates = skills.getSummonCategoryProbabilities({ newAvailable: false, growthAvailable: true });
assertClose(noNewRates.new, 0, 1e-12, "no-new redistribution new rate");
assertClose(noNewRates.growth, 5 / 6, 1e-12, "no-new redistribution growth rate");
assertClose(noNewRates.essence, 1 / 6, 1e-12, "no-new redistribution essence rate");
assert.deepEqual(
    skills.getSummonCategoryProbabilities({ newAvailable: true, growthAvailable: false }),
    { new: 0.8, growth: 0, essence: 0.2 }
);
assert.deepEqual(
    skills.getSummonCategoryProbabilities({ newAvailable: false, growthAvailable: false }),
    { new: 0, growth: 0, essence: 1 }
);

const lnn = skills.getMixedFusionProfile([makeCard("legendary"), makeCard("normal"), makeCard("normal")]);
assertClose(lnn.score, 29 / 3, 1e-12, "L+N+N score");
assertClose(lnn.probabilities.hero, 26 / 27, 1e-12, "L+N+N hero probability");
assertClose(lnn.probabilities.legendary, 1 / 27, 1e-12, "L+N+N legendary probability");
assert.equal(lnn.probabilities.mythic, 0, "mixed fusion must not produce mythic");

const lhh = skills.getMixedFusionProfile([makeCard("legendary"), makeCard("hero"), makeCard("hero")]);
assertClose(lhh.score, 15, 1e-12, "L+H+H score");
assertClose(lhh.probabilities.hero, 2 / 3, 1e-12, "L+H+H hero probability");
assertClose(lhh.probabilities.legendary, 1 / 3, 1e-12, "L+H+H legendary probability");

const llh = skills.getMixedFusionProfile([makeCard("legendary"), makeCard("legendary"), makeCard("hero")]);
assertClose(llh.score, 21, 1e-12, "L+L+H score");
assertClose(llh.probabilities.hero, 1 / 3, 1e-12, "L+L+H hero probability");
assertClose(llh.probabilities.legendary, 2 / 3, 1e-12, "L+L+H legendary probability");

const legendaryTrio = [makeCard("legendary"), makeCard("legendary"), makeCard("legendary")];
assertClose(skills.getSameGradePromotionChance(legendaryTrio, 0), 0.2, 1e-12, "same-grade base chance");
assertClose(skills.getSameGradePromotionChance(legendaryTrio, 1), 0.35, 1e-12, "same-grade first pity");
assertClose(skills.getSameGradePromotionChance(legendaryTrio, 5), 0.95, 1e-12, "same-grade pity cap");
const legendaryProfile = skills.getSameGradeFusionProfile(legendaryTrio, 0);
assertClose(legendaryProfile.probabilities.legendary, 0.8, 1e-12, "legendary failure probability");
assertClose(legendaryProfile.probabilities.mythic, 0.2, 1e-12, "legendary promotion probability");

let progressCard = makeCard("hero", { tier: 3, stars: 0 });
progressCard = skills.advanceSkillBars(progressCard, 6).card;
assert.deepEqual({ tier: progressCard.tier, stars: progressCard.stars }, { tier: 3, stars: 6 });
progressCard = skills.advanceSkillBars(progressCard, 1).card;
assert.deepEqual({ tier: progressCard.tier, stars: progressCard.stars }, { tier: 2, stars: 0 });
progressCard = skills.advanceSkillBars(progressCard, 6).card;
assert.deepEqual({ tier: progressCard.tier, stars: progressCard.stars }, { tier: 2, stars: 6 });
progressCard = skills.advanceSkillBars(progressCard, 1).card;
assert.deepEqual({ tier: progressCard.tier, stars: progressCard.stars }, { tier: 1, stars: 0 });
progressCard = skills.advanceSkillBars(progressCard, 6).card;
assert.deepEqual({ tier: progressCard.tier, stars: progressCard.stars }, { tier: 1, stars: 6 });
const maxOverflow = skills.advanceSkillBars(progressCard, 1);
assert.deepEqual({ tier: maxOverflow.card.tier, stars: maxOverflow.card.stars }, { tier: 1, stars: 6 });
assert.equal(maxOverflow.essenceDelta, 100, "max-level duplicate must become one essence bar");

assert.deepEqual(
    skills.GRADE_ORDER.map((grade) => skills.getEssenceCostForBar(grade)),
    [500, 1200, 2500, 4500, 7500],
    "essence cost must rise by owned-card grade"
);
assert.equal(skills.DIRECT_ESSENCE_AMOUNT, 25, "direct essence result must stay at 25");
const gradeRates = { normal: 0.75, rare: 0.18, hero: 0.05, legendary: 0.0195, mythic: 0.0005 };
const tierRates = { 3: 0.70, 2: 0.25, 1: 0.05 };
const averageFreshDismantle = Object.entries(gradeRates).reduce((gradeSum, [grade, gradeRate]) => (
    gradeSum + gradeRate * Object.entries(tierRates).reduce((tierSum, [tier, tierRate]) => (
        tierSum + tierRate * skills.getDismantleYield(makeCard(grade, { tier: Number(tier), stars: 0, exp: 0 }))
    ), 0)
), 0);
assertClose(averageFreshDismantle, 124.807, 1e-12, "fresh-card dismantle expectation including cumulative tier value");
const halfUnwantedNewDismantledPerDraw = skills.SUMMON_CATEGORY_WEIGHT.essence * skills.DIRECT_ESSENCE_AMOUNT
    + skills.SUMMON_CATEGORY_WEIGHT.new * 0.5 * averageFreshDismantle;
assertClose(halfUnwantedNewDismantledPerDraw, 27.4614, 1e-12, "baseline essence income per draw");
assert.deepEqual(
    skills.GRADE_ORDER.map((grade) => Math.ceil(skills.getEssenceCostForBar(grade) / halfUnwantedNewDismantledPerDraw)),
    [19, 44, 92, 164, 274],
    "targeted star costs must reflect direct essence plus dismantling half of unwanted new cards"
);
const mythicGrowth = skills.applyGrowthOutcome(makeCard("mythic"), { grade: "normal", tier: 3 });
assert.equal(mythicGrowth.card.stars, 0, "a normal duplicate must not instantly star-up a mythic card");
assert.equal(mythicGrowth.card.exp, 1, "a normal duplicate must contribute one mythic EXP");
const mythicSameGradeGrowth = skills.applyGrowthOutcome(makeCard("mythic"), { grade: "mythic", tier: 3 });
assert.equal(mythicSameGradeGrowth.card.stars, 1, "a same-grade duplicate must complete one current-grade EXP bar");
assert.equal(mythicSameGradeGrowth.card.exp, 0);

assert.equal(
    skills.getDismantleYield(makeCard("rare", { tier: 2, stars: 2, exp: 1 })),
    469,
    "rare T2 two-star dismantle yield"
);
assert.equal(
    skills.getDismantleYield(makeCard("mythic", { tier: 1, stars: 6, exp: 0 })),
    1081,
    "mythic T1 six-star dismantle yield"
);

const gradePowerRanges = {
    normal: { base: 5, max: 22 },
    rare: { base: 10, max: 44 },
    hero: { base: 20, max: 89 },
    legendary: { base: 40, max: 178 },
    mythic: { base: 70, max: 311 }
};
for (const [grade, expected] of Object.entries(gradePowerRanges)) {
    assert.equal(skills.getSkillPowerMultiplier(makeCard(grade, { tier: 3, stars: 0 }), expected.base), expected.base, `${grade} T3 zero-star power`);
    assert.equal(skills.getSkillPowerMultiplier(makeCard(grade, { tier: 1, stars: 6 }), expected.base), expected.max, `${grade} T1 six-star cumulative power`);
}

const indexSource = await readFile(new URL("../index.html", import.meta.url), "utf8");
assert.match(indexSource, /퀴즈 정답으로 <strong>정복 포인트\(FP\)<\/strong>를 모으세요/, "quiz guide must explain the FP-to-capsule path");
assert.match(indexSource, /새 스킬이나 성장 대상이 없으면 남은 결과로 재배분되거나 각성 정수로 바뀝니다/, "summon guide must explain exhausted-candidate conversion without internal terminology");
const skillUiLogicSource = await readFile(new URL("../js/skill-rework.js", import.meta.url), "utf8");
assert.match(skillUiLogicSource, /pickGrowthSkill\(random, usedGrowthIds\)/, "a skill must grow at most once per ten-draw block");
assert.match(skillUiLogicSource, /showForgeResult\(true, "일괄 연성 결과"/, "batch fusion must show a readable result summary");
assert.doesNotMatch(skillUiLogicSource, /const details = groups\.map/, "batch fusion confirmation must not list every fusion row");
assert.match(indexSource, /T1 5% · T2 25% · T3 70%/, "skill guide must expose tier rates");
for (const expected of Object.values(gradePowerRanges)) {
    assert.match(indexSource, new RegExp(`지수 ×${expected.base} ~ ×${expected.max}`), `skill guide must show the ${expected.base}-${expected.max} cumulative power range`);
}
assert.doesNotMatch(indexSource, /퀴즈를 풀면 무작위 등급의 <strong>마법 스킬<\/strong>을 획득/, "obsolete direct quiz-to-skill claim must not return");

const evolutionBoundaries = [
    { label: "T3 six-star to T2 zero-star", before: makeCard("hero", { tier: 3, stars: 6 }), expectedAfter: { tier: 2, stars: 0 } },
    { label: "T2 six-star to T1 zero-star", before: makeCard("hero", { tier: 2, stars: 6 }), expectedAfter: { tier: 1, stars: 0 } }
];
for (const boundary of evolutionBoundaries) {
    const after = skills.advanceSkillBars(boundary.before, 1).card;
    assert.deepEqual({ tier: after.tier, stars: after.stars }, boundary.expectedAfter, `${boundary.label} state`);
    assert.equal(skills.getCumulativeStars(after), skills.getCumulativeStars(boundary.before), `${boundary.label} must retain completed stars`);
    assert.ok(skills.getSkillPowerMultiplier(after, 20) > skills.getSkillPowerMultiplier(boundary.before, 20), `${boundary.label} power must increase`);
    assert.ok(skills.getFusionEffectiveWeight(after) > skills.getFusionEffectiveWeight(boundary.before), `${boundary.label} mixed-fusion weight must increase`);
    assert.ok(skills.getDismantleYield(after) > skills.getDismantleYield(boundary.before), `${boundary.label} dismantle yield must increase`);

    const chanceBefore = skills.getSameGradePromotionChance([boundary.before, makeCard("hero"), makeCard("hero")], 0);
    const chanceAfter = skills.getSameGradePromotionChance([after, makeCard("hero"), makeCard("hero")], 0);
    assert.ok(chanceAfter >= chanceBefore, `${boundary.label} same-grade promotion chance must not decrease`);
}

const focus = makeCard("hero", { id: "focus", word: "focus" });
const other = makeCard("hero", { id: "other", word: "other" });
let growthWithoutEquipped = 0;
for (let index = 0; index < 7; index += 1) {
    const pick = skills.pickGrowthTarget([focus, other], { equippedIds: ["focus"], growthWithoutEquipped }, () => 0.999999);
    assert.equal(pick.target.id, "other");
    growthWithoutEquipped = pick.growthWithoutEquipped;
}
const pityPick = skills.pickGrowthTarget(
    [focus, other],
    { equippedIds: ["focus"], growthWithoutEquipped },
    () => 0.999999
);
assert.equal(pityPick.target.id, "focus", "eighth growth result must force an equipped target after seven misses");
assert.equal(pityPick.growthWithoutEquipped, 0);
assert.equal(pityPick.forcedEquipped, true);

const skillReworkSource = await readFile(new URL("../js/skill-rework.js", import.meta.url), "utf8");
assert.match(skillReworkSource, /const inventory = sortSkillInventory\(gameState\.skillsInventory\);/, "inventory must use the mythic-safe sorter");
assert.doesNotMatch(skillReworkSource, /const inventory = .*effectiveFusionWeight/, "inventory sorting must not call the fusion-only weight");
assert.ok((skillReworkSource.match(/grade: "mythic"/g) || []).length >= 2, "interaction fixture must cover two tied mythic cards");
const reworkContext = {
    VocaSkillSystem: skills,
    gameState: {
        skillsInventory: [],
        equippedSkills: [],
        activeSkillDeck: [],
        skillLockedWords: [],
        skillDiscoveredWords: [],
        skillEssence: 0
    },
    selectedCombineSkillIds: [],
    getSkillMultiplier: () => 70
};
for (const name of ["ensureActiveSkillDeck", "addOrLevelUpSkill", "createSkillDrawSnapshot", "renderSkillDrawResultCard", "showSkillDraw100ResultModal", "drawSkillCapsule", "drawSkillCapsuleInstantSkip", "grantUniversalAwakeningEssence", "toggleSelectCombineSkill", "updateCombineSelectionUI", "combineSkills", "batchCombineSkills", "equipSkill", "autoEquipBestSkills", "buildSkillTabUI"]) {
    reworkContext[name] = () => {};
}
reworkContext.window = reworkContext;
reworkContext.globalThis = reworkContext;
runInNewContext(skillReworkSource, reworkContext, { filename: "js/skill-rework.js" });
const tiedMythics = [makeCard("mythic", { word: "zeta" }), makeCard("mythic", { word: "alpha" })];
const sortedMythics = reworkContext.__vocaHeroTestHooks.sortSkillInventory(tiedMythics);
assert.deepEqual(Array.from(sortedMythics, card => card.word), ["alpha", "zeta"], "two tied mythic cards must sort without a fusion RangeError");
assert.throws(() => skills.getFusionEffectiveWeight(tiedMythics[0]), RangeError, "mythic cards must remain invalid fusion material");


console.table(categoryResults.map(({ packSize, counts, ratios }) => ({
    packSize,
    draws: drawsPerPack,
    new: `${counts.new} (${(ratios.new * 100).toFixed(3)}%)`,
    growth: `${counts.growth} (${(ratios.growth * 100).toFixed(3)}%)`,
    essence: `${counts.essence} (${(ratios.essence * 100).toFixed(3)}%)`
})));
console.log("[skill-economy] OK: category invariance, full-pack growth, EXP, summon+dismantle essence income, grade costs, guarantees, fusion, equipped pity, power, and dismantling verified.");
