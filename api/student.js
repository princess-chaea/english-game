import packCatalog from '../data/word-packs.js';
import { randomInt, randomUUID } from 'node:crypto';
import { adminAuth, adminDb, FieldValue, Timestamp } from './_firebase-admin.js';
import { apiError, handleApiError, hash, isExpired, normalizeNickname, readBody, requireMethod, requireUser, safeInt, sendJson, text } from './_http.js';

const accounts = adminDb.collection('accounts');
const teachers = adminDb.collection('teachers');
const classes = adminDb.collection('classes');
const GUILD_EFFECT_BASE_COST = 100;
const GUILD_EFFECT_LEVEL_COST_STEP = 20;
const guildEffectLevelCost = (level) => GUILD_EFFECT_BASE_COST + safeInt(level, 0, 0, 49) * GUILD_EFFECT_LEVEL_COST_STEP;
const GUILD_EFFECT_DEFINITIONS = Object.freeze({
  vitality: { id: 'vitality', name: '수호자의 맹세', icon: 'heart-pulse', description: '월드보스와 보스전 최대 HP가 증가합니다.', unit: '%', valuePerLevel: 0.4, maxLevel: 50 },
  forge: { id: 'forge', name: '장인의 화로', icon: 'anvil', description: '대장간 장비 강화 성공 확률이 증가합니다.', unit: '%p', valuePerLevel: 0.2, maxLevel: 50 },
  fortune: { id: 'fortune', name: '행운의 서고', icon: 'sparkles', description: '스킬·유물 뽑기의 희귀 이상 등장 확률이 증가합니다.', unit: '%p', valuePerLevel: 0.04, maxLevel: 50 },
  prosperity: { id: 'prosperity', name: '풍요의 등불', icon: 'coins', description: '퀴즈 정답으로 얻는 골드가 증가합니다.', unit: '%', valuePerLevel: 0.6, maxLevel: 50 }
});
const GUILD_SKIN_FEMALE_IDS=new Set(['sakura-blade','frost-wolf','arcane-inventor','moon-rabbit','cloud-shepherd','candy-alchemist','rhythm-bard','comet-striker','sky-pirate','mushroom-druid','chess-monarch','phoenix-herald','prismatic-sovereign','dream-librarian','constellation-archer','coral-princess','aurora-dancer','memory-ranger','crystal-singer','season-elementalist','star-postmage','festival-dancer','rune-gardener','sea-star-witch','clockwork-ballerina','dragonfruit-warrior','moon-relic-explorer','rainbow-dragon-rider']);
const GUILD_SKIN_DEFINITIONS = Object.freeze([
  ['azure-scholar','청람의 지식 수호자','azure'],['sakura-blade','벚꽃 검무사','sakura'],['neon-shadow','네온 그림자','neon'],['golden-lion','황금 사자 성기사','lion'],['crimson-rune','홍염의 룬 기사','crimson'],['frost-wolf','설원의 늑대 궁수','frost'],['arcane-inventor','마도 기계 발명가','inventor'],['moon-rabbit','달토끼 치유사','moon'],['starlight-sage','별빛의 현자','starlight'],['dragon-captain','드래곤 학원 대장','dragon'],
  ['clockwork-courier','시계태엽 차원 배달부','clockwork'],['cloud-shepherd','구름 목동','cloud'],['deepsea-explorer','심해 탐사대장','deepsea'],['candy-alchemist','사탕 연금술사','candy'],['dino-scout','공룡 차원 정찰병','dino'],['rhythm-bard','리듬 차원 음유시인','rhythm'],['origami-guardian','종이접기 수호자','origami'],['comet-striker','혜성의 돌격대장','comet'],['scarab-lancer','황금 풍뎅이 창기사','scarab'],['lantern-samurai','영등불 무사','lantern'],['sky-pirate','하늘해적 선장','skypirate'],['mushroom-druid','버섯 숲 드루이드','mushroom'],['volcanic-tamer','화산 거인 조련사','volcanic'],['mecha-pilot','사이버 메카 파일럿','mecha'],['chess-monarch','체스판 군주','chess'],['galaxy-whale','은하 고래 항해사','galaxywhale'],['phoenix-herald','태양 불사조 전령','phoenix'],['leviathan-knight','심연 레비아탄 기사','leviathan'],['time-chronomancer','시간룡 크로노맨서','chronomancer'],['prismatic-sovereign','프리즘 차원 군주','prismatic'],
  ['mirror-duelist','거울 왕국 결투사','mirror'],['dream-librarian','꿈 도서관 정령사','dreamlibrary'],['glacier-conductor','빙하 열차 차장','glaciertrain'],['constellation-archer','별자리 궁수','constellation'],['coral-princess','산호 왕국 기사','coral'],['jungle-pathfinder','정글 유적 길잡이','jungle'],['aurora-dancer','오로라 빙상 무희','aurora'],['toybox-commander','장난감 군단장','toybox'],['cosmic-chef','은하 주방장','cosmicchef'],['memory-ranger','추억 사진 사냥꾼','camera'],['gravity-captain','중력 학원 대장','gravity'],['crystal-singer','수정 동굴 가희','crystalsinger'],['thunder-rider','천둥 구름 기수','thundercloud'],['season-elementalist','사계 정령술사','fourseasons'],['glass-knight','유리 미궁 기사','glassknight'],['star-postmage','별빛 우편 마법사','starpost'],['phantom-detective','유령 도시 탐정','detective'],['festival-dancer','등불 축제 무희','festival'],['observatory-keeper','차원 관측소장','observatory'],['rune-gardener','룬 정원지기','runegarden'],['sea-star-witch','바다별 마녀','seastar'],['clockwork-ballerina','태엽 발레리나','ballerina'],['dragonfruit-warrior','용과꽃 무사','dragonfruit'],['moon-relic-explorer','달빛 유적 탐험가','moonexplorer'],['rainbow-dragon-rider','무지개 용기사','rainbowrider']
].map(([id,name,file])=>Object.freeze({id,name,presentation:GUILD_SKIN_FEMALE_IDS.has(id)?'female':'male',image:`/media/player/guild_skin_${file}.webp?v=20260811-2`,description:'다른 차원에서 찾아온 전신 영웅 외형'})));
const GUILD_SKIN_BY_ID = new Map(GUILD_SKIN_DEFINITIONS.map((skin) => [skin.id, skin]));
const GUILD_SKIN_RARITIES = Object.freeze([
  {id:'normal',name:'일반',weight:6000,shards:2,color:'#9ca3af',attackPct:.5,defensePct:.5,goldPct:.5,forgePctPoint:.05,fortunePctPoint:.02},
  {id:'rare',name:'희귀',weight:2500,shards:5,color:'#38bdf8',attackPct:1,defensePct:1,goldPct:1,forgePctPoint:.1,fortunePctPoint:.05},
  {id:'hero',name:'영웅',weight:1000,shards:15,color:'#a855f7',attackPct:2,defensePct:2,goldPct:2,forgePctPoint:.2,fortunePctPoint:.1},
  {id:'legendary',name:'전설',weight:400,shards:40,color:'#facc15',attackPct:3.5,defensePct:3.5,goldPct:4,forgePctPoint:.35,fortunePctPoint:.2},
  {id:'mythic',name:'신화',weight:100,shards:100,color:'#fb7185',attackPct:5,defensePct:5,goldPct:6,forgePctPoint:.6,fortunePctPoint:.35}
]);
const GUILD_SKIN_RARITY_BY_ID = new Map(GUILD_SKIN_RARITIES.map((rarity)=>[rarity.id,rarity]));
const GUILD_SKIN_SUMMON_COST = Object.freeze({1:25,10:225});
const GUILD_SKIN_SHARD_UNLOCK_COST = Object.freeze({normal:20,rare:60,hero:180,legendary:500,mythic:1500});
const GUILD_CONSUMABLE_DEFINITIONS=Object.freeze([
  {id:'forgeCharm',type:'charge',name:'장인의 행운권',cost:45,charges:5,value:5,unit:'%p',description:'다음 장비 강화 5회의 성공 확률 +5%p'},
  {id:'forgeGuard',type:'charge',name:'강화 수호 인장',cost:60,charges:5,value:100,unit:'%',description:'강화 실패·강력한 공격 방어 실패의 단계 하락 판정을 5회까지 확정 수호'},
  {id:'powerRune',type:'charge',name:'용사의 강공 룬',cost:50,charges:10,value:10,unit:'%',description:'다음 정답 공격 10회의 최종 피해 +10%'},
  {id:'masteryPointsExchange',type:'exchange',name:'단어정복 포인트 교환',cost:50,resource:'masteryPoints',amount:200,resourceName:'단어정복 포인트(FP)',description:'길드 코인 50개를 단어정복 포인트(FP) 200개로 교환'},
  {id:'relicEssenceExchange',type:'exchange',name:'고대 신화 정수 교환',cost:50,resource:'relicEssence',amount:5,resourceName:'고대 신화 정수',description:'길드 코인 50개를 6성 유물 중복 획득 화폐인 고대 신화 정수 5개로 교환'},
  {id:'bossTokenExchange',type:'exchange',name:'보스 증표 교환',cost:50,resource:'bossTokens',amount:100,resourceName:'고대 보스 증표',description:'길드 코인 50개를 고대 보스 증표 100개로 교환'}
]);
const GUILD_CONSUMABLE_BY_ID=new Map(GUILD_CONSUMABLE_DEFINITIONS.map((item)=>[item.id,item]));
function safeGuildBoostCharges(value){const source=value&&typeof value==='object'&&!Array.isArray(value)?value:{};return Object.fromEntries(GUILD_CONSUMABLE_DEFINITIONS.filter((item)=>item.type==='charge').map((item)=>[item.id,safeInt(source[item.id],0,0,10000)]));}

function safeGuildEffects(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return Object.fromEntries(Object.entries(GUILD_EFFECT_DEFINITIONS).map(([id, definition]) => {
    const row = source[id] && typeof source[id] === 'object' ? source[id] : {};
    return [id, { level: safeInt(row.level, 0, 0, definition.maxLevel), totalInvested: safeInt(row.totalInvested, 0, 0, 1000000000) }];
  }));
}
function safeGuildCosmetics(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const legacy=(Array.isArray(source.ownedSkinIds)?source.ownedSkinIds:[]).map((id)=>`${text(id,80)}:rare`);
  const ownedVariantKeys=[...new Set([...(Array.isArray(source.ownedVariantKeys)?source.ownedVariantKeys:[]),...legacy].map((key)=>text(key,100)).filter((key)=>{const [skinId,rarity]=key.split(':');return GUILD_SKIN_BY_ID.has(skinId)&&GUILD_SKIN_RARITY_BY_ID.has(rarity);}))].slice(0,275);
  const legacyEquipped=source.equippedSkinId?`${text(source.equippedSkinId,80)}:rare`:'';
  const equippedVariantKey=ownedVariantKeys.includes(text(source.equippedVariantKey,100))?text(source.equippedVariantKey,100):(ownedVariantKeys.includes(legacyEquipped)?legacyEquipped:null);
  return {ownedVariantKeys,equippedVariantKey,skinShards:safeInt(source.skinShards,0,0,1000000000),summonStats:{totalSummons:safeInt(source.summonStats?.totalSummons,0,0,1000000000)}};
}
function publicGuildEffectCatalog(effects) {
  return Object.values(GUILD_EFFECT_DEFINITIONS).map((definition) => {
    const level = effects[definition.id]?.level || 0;
    return { ...definition, level, currentValue: Number((level * definition.valuePerLevel).toFixed(2)), nextCost: level < definition.maxLevel ? guildEffectLevelCost(level) : null, totalInvested: effects[definition.id]?.totalInvested || 0 };
  });
}
function guildSkinCollectionEffects(count) {
  const scale=count>=5?1:count===4?0.7:count===3?0.45:count===2?0.2:0;
  return {attackPct:.06*scale,defensePct:.06*scale,goldPct:.12*scale,forgePctPoint:.012*scale,fortunePctPoint:.006*scale};
}
function calculateGuildCosmeticEffects(value) {
  const cosmetics=safeGuildCosmetics(value),totals={attackPct:0,defensePct:0,goldPct:0,forgePctPoint:0,fortunePctPoint:0},equippedEffects={attackPct:0,defensePct:0,goldPct:0,forgePctPoint:0,fortunePctPoint:0},collectionEffects={attackPct:0,defensePct:0,goldPct:0,forgePctPoint:0,fortunePctPoint:0};
  const rarity=GUILD_SKIN_RARITY_BY_ID.get(cosmetics.equippedVariantKey?.split(':')[1]);if(rarity)Object.keys(totals).forEach((key)=>{equippedEffects[key]=Number(rarity[key]||0);totals[key]+=equippedEffects[key];});
  const skinProgress={};cosmetics.ownedVariantKeys.forEach((key)=>{const id=key.split(':')[0];skinProgress[id]=(skinProgress[id]||0)+1;});
  Object.values(skinProgress).forEach((count)=>{const bonus=guildSkinCollectionEffects(count);Object.keys(totals).forEach((key)=>{collectionEffects[key]+=bonus[key];totals[key]+=bonus[key];});});
  for(const group of [totals,equippedEffects,collectionEffects])Object.keys(group).forEach((key)=>{group[key]=Number(group[key].toFixed(4));});return {...totals,equippedEffects,collectionEffects,equippedVariantKey:cosmetics.equippedVariantKey,completedVariants:cosmetics.ownedVariantKeys.length,totalVariants:275,skinProgress};
}
function publicGuildSkinCatalog(){return {skins:GUILD_SKIN_DEFINITIONS.map((skin)=>({...skin})),rarities:GUILD_SKIN_RARITIES.map((rarity)=>({...rarity})),summonCosts:GUILD_SKIN_SUMMON_COST,shardUnlockCosts:{...GUILD_SKIN_SHARD_UNLOCK_COST},collectionBonuses:Object.fromEntries([1,2,3,4,5].map((count)=>[count,guildSkinCollectionEffects(count)])),totalVariants:275};}
const leaderboard = adminDb.collection('leaderboard');
const invites = adminDb.collection('classInvites');
const legacyUsers = adminDb.collection('users');
const legacyRecoveryGuards = adminDb.collection('legacyRecoveryGuards');
const REVIEW_PACK_ID = 'elementary-800-missing-review';
const TIER_WORD_PACK_IDS = [3,4,5,6].flatMap((grade) => ['low','mid','high'].map((level) => 'grade-' + grade + '-' + level));
const ASSIGNABLE_WORD_PACK_IDS = new Set(['grade-3-current','grade-4-current','grade-5-current','grade-6-current','curriculum-2022-grade-3','curriculum-2022-grade-4','curriculum-2022-grade-5','curriculum-2022-grade-6',...TIER_WORD_PACK_IDS,REVIEW_PACK_ID]);
const LEARNING_QUESTION_TYPES = new Set(['meaning-choice','fill-blank','word-choice','listen-meaning','word-order','short-answer']);
const STUDENT_WORD_PACKS = packCatalog?.packs || [];
const STUDENT_WORD_PACK_BY_ID = new Map(STUDENT_WORD_PACKS.map((pack) => [pack.id, pack]));
const safeGuildLogoUrl = (value) => { const url=text(value,1200);return /^https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/[A-Za-z0-9._-]+\/o\//.test(url)?url:null; };
const defaultWordPack = (grade) => 'grade-' + grade + '-mid';
const DAY_MS = 24 * 60 * 60 * 1000;
const PROGRESS_TOKEN_INITIAL = 20;
const PROGRESS_TOKEN_CAPACITY = 240;
const PROGRESS_TOKEN_REFILL_MS = 750;
const LEGACY_GUARD_SHORT_WINDOW_MS = 15 * 60 * 1000;
const LEGACY_GUARD_DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;
const LEGACY_GUARD_SHORT_MAX = 5;
const LEGACY_GUARD_DAILY_MAX = 20;
const DELETE_PAGE_SIZE = 100;
const GOOGLE_LINK_PENDING_MS = 15 * 60 * 1000;
const TRIAL_MAX_ATTEMPTS = 3;
const TRIAL_HISTORY_DAYS = 120;
function seoulDayKey(now = Date.now()) {
  return new Date(now + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
function safeDailyLearning(value) {
  const rows = [];
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    Object.entries(value).forEach(([day, raw]) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return;
      rows.push([day, {
        tries: safeInt(raw?.tries, 0, 0, 1000000),
        correct: safeInt(raw?.correct, 0, 0, 1000000),
        stageClears: safeInt(raw?.stageClears, 0, 0, 10000)
      }]);
    });
  }
  return Object.fromEntries(rows.sort(([a], [b]) => a.localeCompare(b)).slice(-120));
}
function safeTrialAttemptHistory(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(-TRIAL_MAX_ATTEMPTS).map((raw) => ({
    attemptId: text(raw?.attemptId, 128),
    attemptNo: safeInt(raw?.attemptNo, 1, 1, TRIAL_MAX_ATTEMPTS),
    correctCount: safeInt(raw?.correctCount, 0, 0, 20),
    questionCount: safeInt(raw?.questionCount, 0, 0, 20),
    accuracy: Math.max(0, Math.min(100, Number(raw?.accuracy) || 0)),
    hintsUsed: safeInt(raw?.hintsUsed, 0, 0, 20),
    correctAfterHint: safeInt(raw?.correctAfterHint, 0, 0, 20),
    unassistedCorrect: safeInt(raw?.unassistedCorrect, 0, 0, 20),
    unassistedTries: safeInt(raw?.unassistedTries, 0, 0, 20),
    completedAtMs: safeInt(raw?.completedAtMs, 0, 0, 9999999999999),
    overcome: Boolean(raw?.overcome)
  })).filter((entry) => entry.attemptId && entry.questionCount > 0);
}
function safeTrialDailyResults(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const rows = Object.entries(value).filter(([day]) => /^\d{4}-\d{2}-\d{2}$/.test(day)).sort(([a], [b]) => a.localeCompare(b)).slice(-TRIAL_HISTORY_DAYS);
  return Object.fromEntries(rows.map(([day, attempts]) => [day, (Array.isArray(attempts) ? attempts : []).slice(-12).map((raw) => ({
    trialId: text(raw?.trialId, 128),
    attemptNo: safeInt(raw?.attemptNo, 1, 1, TRIAL_MAX_ATTEMPTS),
    correctCount: safeInt(raw?.correctCount, 0, 0, 20),
    questionCount: safeInt(raw?.questionCount, 0, 0, 20),
    accuracy: Math.max(0, Math.min(100, Number(raw?.accuracy) || 0)),
    hintsUsed: safeInt(raw?.hintsUsed, 0, 0, 20),
    correctAfterHint: safeInt(raw?.correctAfterHint, 0, 0, 20),
    unassistedCorrect: safeInt(raw?.unassistedCorrect, 0, 0, 20),
    unassistedTries: safeInt(raw?.unassistedTries, 0, 0, 20),
    completedAtMs: safeInt(raw?.completedAtMs, 0, 0, 9999999999999),
    overcome: Boolean(raw?.overcome)
  })).filter((entry) => entry.trialId && entry.questionCount > 0)]));
}function safeWrongWordCounts(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value)
    .map(([rawWord, rawCount]) => [text(rawWord, 80).toLowerCase(), safeInt(rawCount, 0, 0, 1000000)])
    .filter(([word, count]) => word && count > 0)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 300));
}
const WORD_MASTERY_CORRECT_THRESHOLD = 10;
const WORD_MASTERY_ACCURACY_THRESHOLD = 0.8;
function safeWordLearningStats(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const rows = Object.entries(value).map(([rawKey, raw]) => {
    const key = text(rawKey, 80).toLowerCase();
    if (!key || !raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const correct = safeInt(raw.c, 0, 0, 1000000);
    const wrong = safeInt(raw.x, 0, 0, 1000000);
    const streak = safeInt(raw.s, 0, 0, 1000000);
    const bestStreak = Math.max(streak, safeInt(raw.b, streak, 0, 1000000));
    const byType = {};
    LEARNING_QUESTION_TYPES.forEach((type) => {
      const stats = raw.t?.[type];
      if (!Array.isArray(stats)) return;
      const tries = safeInt(stats[0], 0, 0, 1000000);
      const typeCorrect = Math.min(tries, safeInt(stats[1], 0, 0, 1000000));
      if (tries > 0) byType[type] = [tries, typeCorrect];
    });
    return [key, { w: text(raw.w || rawKey, 80), m: text(raw.m, 160), c: correct, x: wrong, s: streak, b: bestStreak, t: byType, u: safeInt(raw.u, 0, 0, 9999999999999) }];
  }).filter(Boolean).sort((a, b) => b[1].u - a[1].u).slice(0, 2000);
  return Object.fromEntries(rows);
}
function wordMasterySummary(value, conqueredFallback = 0) {
  const stats = safeWordLearningStats(value);
  let masteredCount = 0;
  Object.values(stats).forEach((entry) => {
    const tries = entry.c + entry.x;
    if (entry.c >= WORD_MASTERY_CORRECT_THRESHOLD && entry.c / Math.max(1, tries) >= WORD_MASTERY_ACCURACY_THRESHOLD) masteredCount += 1;
  });
  return { stats, masteredCount, conqueredCount: safeInt(conqueredFallback, 0, 0, 100000) };
}function normalizedPackIds(value, grade) { const source=Array.isArray(value)?value:(value?[value]:[]);const ids=[...new Set(source.map((item)=>text(item,80)).filter((id)=>ASSIGNABLE_WORD_PACK_IDS.has(id)))].slice(0,12);return ids.length?ids:[defaultWordPack(grade)]; }
function normalizedQuestionTypes(value) { const types=[...new Set((Array.isArray(value)?value:[]).map((item)=>text(item,32)).filter((item)=>LEARNING_QUESTION_TYPES.has(item)))];return ['meaning-choice',...types.filter((item)=>item!=='meaning-choice')]; }
function assignedPackMetadata(ids) { return (ids || []).map((id) => STUDENT_WORD_PACK_BY_ID.get(id)).filter(Boolean).map((pack) => ({ id: pack.id, label: text(pack.label, 120) || pack.id, wordCount: safeInt(pack.wordCount, Array.isArray(pack.words) ? pack.words.length : 0, 0, 5000) })); }
function safeQuestionTypeStats(value) { const result={};LEARNING_QUESTION_TYPES.forEach((type)=>{const row=value&&typeof value==='object'&&!Array.isArray(value)?value[type]:null;result[type]={tries:safeInt(row?.tries,0,0,1000000000),correct:safeInt(row?.correct,0,0,1000000000)};});return result; }
function classPack(grade, wordPackId) { return ASSIGNABLE_WORD_PACK_IDS.has(wordPackId) ? wordPackId : defaultWordPack(grade); }
const fields = new Set(['avatarType','gold','accGold','helmetLvl','armorLvl','weaponLvl','shieldLvl','shoesLvl','petType','petLvl','petLevels','stage','progress','totalQuizTries','totalQuizCorrect','masteredWords','currentQuizIndex','skillsInventory','skillTierOrderVersion','equippedSkills','activeSkillDeck','skillEssence','lockedPotentialSlots','wrongWordCounts','wordLearningStats','questionTypeStats','combatPower','masteryPoints','necklaceLvl','braceletLvl','ringLvl','acquiredRelics','equippedRelicId','gearPotentials','isPotentialUnlocked','equippedTitle','wbTitle','unlockedTitles','bossTokens','relicEssence','relicTranscendLvl','soundSettings','tutorialCompleted','lastSaved','guildBoostCharges']);

function defaultState() { return { avatarType:'male', gold:0, accGold:0, helmetLvl:1, armorLvl:1, weaponLvl:1, shieldLvl:1, shoesLvl:1, stage:1, progress:0, totalQuizTries:0, totalQuizCorrect:0, masteredWords:[], skillsInventory:[], skillTierOrderVersion:2, equippedSkills:[], activeSkillDeck:[], skillEssence:0, wrongWordCounts:{}, wordLearningStats:{}, questionTypeStats:{}, combatPower:0, masteryPoints:0, tutorialCompleted:false }; }
function cleanState(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw apiError(400,'INVALID_STATE','저장할 학습 기록 형식이 올바르지 않아요.');
  const state = {};
  fields.forEach((key) => { if (Object.hasOwn(input,key)) state[key] = input[key]; });
  ['gold','accGold','helmetLvl','armorLvl','weaponLvl','shieldLvl','shoesLvl','petLvl','stage','progress','totalQuizTries','totalQuizCorrect','currentQuizIndex','masteryPoints','necklaceLvl','braceletLvl','ringLvl','skillEssence','bossTokens','relicEssence','combatPower'].forEach((key) => { if (Object.hasOwn(state,key)) state[key]=safeInt(state[key],0,0,9999999999); });
  if (Object.hasOwn(state,'relicTranscendLvl')) state.relicTranscendLvl=safeInt(state.relicTranscendLvl,0,0,10000);
  if (Object.hasOwn(state,'skillTierOrderVersion')) state.skillTierOrderVersion=safeInt(state.skillTierOrderVersion,2,0,2);
  if (state.masteredWords && !Array.isArray(state.masteredWords)) delete state.masteredWords;
  state.wrongWordCounts = safeWrongWordCounts(state.wrongWordCounts);
  state.wordLearningStats = safeWordLearningStats(state.wordLearningStats);
  state.questionTypeStats = safeQuestionTypeStats(state.questionTypeStats);
  state.guildBoostCharges = safeGuildBoostCharges(state.guildBoostCharges);
  if (state.skillsInventory && !Array.isArray(state.skillsInventory)) delete state.skillsInventory;
  if ((state.masteredWords?.length||0)>5000 || (state.skillsInventory?.length||0)>1000 || Buffer.byteLength(JSON.stringify(state),'utf8')>600000) throw apiError(400,'STATE_TOO_LARGE','저장할 학습 기록이 너무 커요.');
  return state;
}
function score(state) { return safeInt(state.totalQuizCorrect,0,0)*1000 + (Array.isArray(state.masteredWords)?state.masteredWords.length:0)*10 + Math.min(safeInt(state.stage,1,1),999); }
function publicAccount(data) { const guildCosmetics=safeGuildCosmetics(data.guildCosmetics);return { nickname:data.nickname, learningGrade:data.learningGrade, state:{...defaultState(),...(data.state||{})}, freeNicknameChangeUsed:Boolean(data.freeNicknameChangeUsed), renameCount:safeInt(data.renameCount,0,0), leaderboardOptIn:Boolean(data.leaderboardOptIn), classIds:Array.isArray(data.classIds)?data.classIds:[], activeGuildName:text(data.activeGuildName,40)||null, activeGuildLogoUrl:data.activeGuildName?safeGuildLogoUrl(data.activeGuildLogoUrl):null, guildCosmetics, guildCosmeticEffects:calculateGuildCosmeticEffects(guildCosmetics), legacyGoogleLinked:Boolean(data.legacyGoogleLinked) }; }
function migrateSkillTierOrder(stateValue) {
  const state=stateValue&&typeof stateValue==='object'&&!Array.isArray(stateValue)?{...stateValue}:{};
  if(safeInt(state.skillTierOrderVersion,0,0,2)>=2)return {state,changed:false};
  state.skillsInventory=Array.isArray(state.skillsInventory)?state.skillsInventory.map((skill)=>{
    if(!skill||typeof skill!=='object'||Array.isArray(skill))return skill;
    const previousTier=safeInt(skill.tier,1,1,3);
    return {...skill,tier:4-previousTier};
  }):[];
  state.skillTierOrderVersion=2;
  return {state,changed:true};
}
function legacyLearningGrade(data, fallback=4) { return safeInt(data?.grade, safeInt(data?.learningGrade, fallback, 3, 6), 3, 6); }
async function loadAccount(uid) {
  const ref=accounts.doc(uid),snap=await ref.get();if(!snap.exists)return null;
  let data=snap.data();
  if(data.legacyRecoveryStatus==='pending'){
    try{await finalizeLegacyRecovery(uid,data);data=(await ref.get()).data()||data;}
    catch(error){console.error('Legacy recovery finalization deferred',{uid,message:error?.message||String(error)});throw apiError(503,'RECOVERY_FINALIZING','이전 영웅의 주변 기록을 정리하고 있어요. 잠시 후 다시 시도해 주세요.');}
  }
  const tierMigration=migrateSkillTierOrder(data.state);
  if(tierMigration.changed){const update={state:tierMigration.state,updatedAt:FieldValue.serverTimestamp()};await ref.update(update);data={...data,...update};}
  if(data.activeClassId&&(!data.activeGuildName||!Object.hasOwn(data,'activeGuildLogoUrl'))){const assignment=await assignedWordPack(uid);if(assignment.classLabel){const update={activeGuildName:assignment.classLabel,activeGuildLogoUrl:assignment.guildLogoUrl,updatedAt:FieldValue.serverTimestamp()};await ref.update(update);data={...data,...update};}}
  if(!data.legacyMigratedAt&&!data.legacyGoogleMigratedAt)return publicAccount(data);
  const matches=await legacyUsers.where('migratedTo','==',uid).limit(2).get();
  if(matches.size!==1)return publicAccount(data);
  const legacyData=matches.docs[0].data(),legacyGoogleLinked=Boolean(legacyData.linkedGoogleUid);
  const grade=legacyLearningGrade(legacyData,data.learningGrade);
  if(grade===data.learningGrade)return {...publicAccount(data),legacyGoogleLinked};
  const update={learningGrade:grade,updatedAt:FieldValue.serverTimestamp()};
  await ref.update(update);data={...data,...update};
  await Promise.all((data.classIds||[]).slice(0,100).map(id=>adminDb.collection('classes').doc(id).collection('members').doc(uid).set({learningGrade:grade},{merge:true})));
  await publish(uid,data);
  return {...publicAccount(data),legacyGoogleLinked};
}
async function assignedWordPack(uid) {
  const accountSnap = await accounts.doc(uid).get();
  if (!accountSnap.exists) return { wordPackId: null, wordPackIds: [], questionTypes: ['meaning-choice'], guildLogoUrl: null };
  const account = accountSnap.data();
  const classIds = Array.isArray(account.classIds) ? account.classIds.slice(0, 100) : [];
  const orderedIds = [account.activeClassId, ...classIds.filter((id) => id !== account.activeClassId)].filter(Boolean);
  for (const classId of orderedIds) {
    if (!classIds.includes(classId)) continue;
    const classRef = classes.doc(classId);
    const [classSnap, memberSnap] = await Promise.all([classRef.get(), classRef.collection('members').doc(uid).get()]);
    if (!classSnap.exists || !memberSnap.exists) continue;
    const classroom = classSnap.data();
    const member = memberSnap.data() || {};
    const grade = safeInt(member.learningGrade, safeInt(classroom.grade, account.learningGrade, 3, 6), 3, 6);
    const hasMemberOverride = member.usesGuildLearningDefaults === false;
    const rawPackIds = hasMemberOverride ? member.assignedWordPackIds : (classroom.wordPackIds || classroom.wordPackId);
    const rawQuestionTypes = hasMemberOverride ? member.questionTypes : classroom.defaultQuestionTypes;
    const wordPackIds = normalizedPackIds(rawPackIds, grade);
    const questionTypes = normalizedQuestionTypes(rawQuestionTypes);
    const guildTitleStats = { guildPoints: safeInt(member.guildPoints, 0, 0, 1000000000), guildCorrectCount: safeInt(member.guildCorrectCount, 0, 0, 1000000000), guildStageClears: safeInt(member.guildStageClears, 0, 0, 1000000), guildBossPointTotal: safeInt(member.guildBossPointTotal, 0, 0, 1000000000), guildTrialCorrect: safeInt(member.guildTrialCorrect, 0, 0, 1000000), guildLearningCoinTotal: safeInt(member.guildLearningCoinTotal, 0, 0, 1000000000) };
    return { classId, classLabel: classroom.guildName || classroom.classLabel || '길드', guildLogoUrl: safeGuildLogoUrl(classroom.guildLogoUrl), guildEffects: safeGuildEffects(classroom.guildEffects), guildTitleStats, wordPackId: wordPackIds[0], wordPackIds, wordPacks: assignedPackMetadata(wordPackIds), questionTypes, assignmentSource: hasMemberOverride ? 'member' : 'guild', learningSettingsVersion: safeInt(hasMemberOverride ? member.learningSettingsVersion : classroom.learningSettingsVersion, 0, 0) };
  }
  return { wordPackId: null, wordPackIds: [], questionTypes: ['meaning-choice'], guildLogoUrl: null };
}function normalizedTrialAnswer(value) { return text(value, 160).normalize('NFKC').trim().toLowerCase().replace(/[^a-z0-9가-힣]/g, ''); }
function safeActiveTrialQuestions(value, wordCount) {
  const seen = new Set();
  return (Array.isArray(value) ? value : []).slice(0, 20).map((entry) => {
    const id = text(entry?.id, 80).toLowerCase();
    const sourceIndex = Number(entry?.sourceIndex);
    if (id.length < 8 || seen.has(id) || !Number.isInteger(sourceIndex) || sourceIndex < 0 || sourceIndex >= wordCount) return null;
    seen.add(id);
    return { id, sourceIndex };
  }).filter(Boolean);
}
function safeActiveTrialAnswerResults(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(-20).map((entry) => ({
    questionId: text(entry?.questionId, 80).toLowerCase(),
    answer: text(entry?.answer, 160),
    correct: Boolean(entry?.correct)
  })).filter((entry) => entry.questionId);
}
function createActiveTrialQuestions(words) {
  return words.map((_entry, sourceIndex) => ({ id: randomUUID().toLowerCase(), sourceIndex })).sort((a, b) => a.id.localeCompare(b.id));
}
function trialQuestionSpec(words, question, attemptId) {
  const entry = words[question.sourceIndex] || {};
  const id = question.id;
  const type = text(entry?.type, 32) || 'meaning-choice';
  const word = text(entry?.word, 80);
  const meaning = text(entry?.meaning, 160);
  const isMeaningChoice = type === 'meaning-choice' || type === 'listen-meaning';
  const isWordChoice = type === 'word-choice';
  const expected = isMeaningChoice ? meaning : word;
  const publicQuestion = { id, type, prompt: '' };
  let correctOptionId = null;
  if (isMeaningChoice || isWordChoice) {
    const field = isMeaningChoice ? 'meaning' : 'word';
    const values = [];
    const add = (value) => {
      const clean = text(value, field === 'meaning' ? 160 : 80);
      if (clean && !values.includes(clean)) values.push(clean);
    };
    add(expected);
    words.forEach((item) => add(item?.[field]));
    const distractors = values.filter((value) => normalizedTrialAnswer(value) !== normalizedTrialAnswer(expected))
      .sort((a, b) => hash(`${attemptId}:${id}:d:${a}`).localeCompare(hash(`${attemptId}:${id}:d:${b}`)))
      .slice(0, 3);
    const options = [expected, ...distractors].map((label) => ({
      id: hash(`${attemptId}:${id}:option:${normalizedTrialAnswer(label)}`).slice(0, 20),
      label
    })).sort((a, b) => hash(`${attemptId}:${id}:o:${a.id}`).localeCompare(hash(`${attemptId}:${id}:o:${b.id}`)));
    correctOptionId = options.find((option) => normalizedTrialAnswer(option.label) === normalizedTrialAnswer(expected))?.id || null;
    publicQuestion.prompt = isMeaningChoice
      ? (type === 'listen-meaning' ? '발음을 듣고 알맞은 뜻을 고르세요.' : `“${word}”의 뜻은?`)
      : `“${meaning}”에 알맞은 영어는?`;
    publicQuestion.options = options;
    if (type === 'listen-meaning') publicQuestion.speakText = word;
  } else {
    const baseLetters = word.toLowerCase().replace(/[^a-z]/g, '');
    const letters = [...baseLetters].map((letter, position) => ({ letter, key: hash(`${attemptId}:${id}:letter:${position}:${letter}`) }))
      .sort((a, b) => a.key.localeCompare(b.key)).map((item) => item.letter);
    if (letters.join('') === baseLetters) letters.reverse();
    const isOrder = type === 'unscramble' || type === 'word-order';
    publicQuestion.prompt = isOrder
      ? `뜻: ${meaning}`
      : type === 'fill-blank'
        ? `뜻: ${meaning}\n빈칸: ${baseLetters.replace(/[a-z]/g, '_ ')}`
        : `뜻: ${meaning}\n알맞은 영어 단어를 입력하세요.`;
    if (isOrder) publicQuestion.letters = letters;
  }
  return { publicQuestion, expected, correctOptionId, word };
}
function publicTrialQuestions(words, questions, attemptId) {
  // Only presentation-safe fields are returned to the browser.
  return questions.map((question) => trialQuestionSpec(words, question, attemptId).publicQuestion);
}
async function loadGuildTrial(uid, prefetchedAssignment = null) {
  const assignment = prefetchedAssignment || await assignedWordPack(uid);
  const assignmentPayload = { wordPackId: assignment.wordPackId || null, wordPackIds: assignment.wordPackIds || [], questionTypes: assignment.questionTypes || ['meaning-choice'], assignmentSource: assignment.assignmentSource || null, learningSettingsVersion: safeInt(assignment.learningSettingsVersion, 0, 0), guildEffects: safeGuildEffects(assignment.guildEffects), guildTitleStats: assignment.guildTitleStats || {} };
  if (!assignment.classId) return { guildName: null, guildLogoUrl: null, wordPackId: null, guildCoins: 0, trial: null };
  const classRef = adminDb.collection('classes').doc(assignment.classId);
  const memberRef = classRef.collection('members').doc(uid);
  const [classSnap, memberSnap] = await Promise.all([classRef.get(), memberRef.get()]);
  if (!classSnap.exists || !memberSnap.exists) return { guildName: assignment.classLabel || null, guildLogoUrl: assignment.guildLogoUrl || null, ...assignmentPayload, guildCoins: 0, trial: null };
  const guildCoins = safeInt(memberSnap.data()?.guildCoins, 0, 0, 1000000000);
  const trialId = text(classSnap.data()?.activeTrialId, 128);
  if (!trialId) return { guildName: assignment.classLabel, guildLogoUrl: assignment.guildLogoUrl || null, ...assignmentPayload, guildCoins, trial: null };
  const trialRef = classRef.collection('trials').doc(trialId);
  const [trialSnap, completionSnap, progressSnap] = await Promise.all([trialRef.get(), trialRef.collection('completions').doc(uid).get(), trialRef.collection('progress').doc(uid).get()]);
  if (!trialSnap.exists) return { guildName: assignment.classLabel, guildLogoUrl: assignment.guildLogoUrl || null, ...assignmentPayload, guildCoins, trial: null };
  const trial = trialSnap.data();
  if (trial.status !== 'active' || isExpired(trial.expiresAt) || !Array.isArray(trial.words)) return { guildName: assignment.classLabel, guildLogoUrl: assignment.guildLogoUrl || null, ...assignmentPayload, guildCoins, trial: null };
  const history = safeTrialAttemptHistory(progressSnap.data()?.attemptHistory);
  const attemptCount = Math.max(history.length, safeInt(progressSnap.data()?.attemptCount, 0, 0, TRIAL_MAX_ATTEMPTS));
  const overcome = completionSnap.exists;
  const exhausted = !overcome && attemptCount >= TRIAL_MAX_ATTEMPTS;
  return {
    guildName: assignment.classLabel,
    guildLogoUrl: assignment.guildLogoUrl || null,
    ...assignmentPayload,
    guildCoins,
    trial: {
      id: trialId,
      sceneImage: '/media/test/test' + (parseInt(hash(uid + ':' + trialId).slice(0, 8), 16) % 5 + 1) + '.webp?v=20260810-1',
      questionCount: trial.words.slice(0, 20).filter((entry) => text(entry?.word, 80) && text(entry?.meaning, 160)).length,
      maxHintsPerQuestion: 1,
      hintHelp: '객관식은 오답 보기 2개를 지우고, 입력형은 첫 글자와 영문 글자 수를 알려줘요.',
      attemptHistory: history,
      attemptCount,
      retryCount: Math.max(0, attemptCount - 1),
      remainingAttempts: Math.max(0, TRIAL_MAX_ATTEMPTS - attemptCount),
      maxAttempts: TRIAL_MAX_ATTEMPTS,
      mustForce: !overcome && attemptCount === 0,
      overcome,
      exhausted,
      canAttempt: !overcome && !exhausted,
      rewardGuildCoins: safeInt(trial.rewardGuildCoins, 0, 0, 1000),
      expiresAt: trial.expiresAt?.toDate?.().toISOString?.() || null
    }
  };
}async function loadGuildOverview(uid) {
  const assignment = await assignedWordPack(uid);
  const guild = await loadGuildTrial(uid, assignment);
  if (!assignment.classId) return { ...guild, memberCount: 0, guildTotalCorrect: 0, guildMasteredCount: 0, members: [] };
  const classRef = classes.doc(assignment.classId);
  const membersRef = classRef.collection('members');
  const [classSnap, ownMemberSnap, membersSnap, memberCountSnap, accountSnap, investmentSnap] = await Promise.all([
    classRef.get(),
    membersRef.doc(uid).get(),
    membersRef.select('nickname', 'learningGrade', 'stage', 'totalCorrect', 'totalQuizTries', 'conqueredCount', 'masteredCount', 'combatPower', 'titleName', 'guildCoins', 'guildPoints', 'guildCorrectCount', 'guildStageClears', 'guildBossDamage', 'guildBossPointTotal', 'guildTrialCorrect', 'lastActiveAt').limit(200).get(),
    membersRef.count().get(),
    accounts.doc(uid).get(),
    classRef.collection('effectInvestments').doc(uid).get()
  ]);
  if (!classSnap.exists || !ownMemberSnap.exists) return { ...guild, memberCount: 0, guildTotalCorrect: 0, guildMasteredCount: 0, members: [] };
  const classData = classSnap.data() || {};
  const guildEffects = safeGuildEffects(classData.guildEffects);
  const rawInvestment = investmentSnap.data() || {};
  const contributionByEffect = Object.fromEntries(Object.keys(GUILD_EFFECT_DEFINITIONS).map((id) => [id, safeInt(rawInvestment.contributionByEffect?.[id], 0, 0, 1000000000)]));
  const ownerId = text(classData.ownerId || classData.managerIds?.[0], 128);
  const rawManagerIds = (Array.isArray(classData.managerIds) ? classData.managerIds : []).map((id) => text(id, 128)).filter(Boolean);
  const coManagerIds = [...new Set(rawManagerIds)].filter((id) => id && id !== ownerId);
  const allStaffIds = [...new Set([ownerId, ...coManagerIds].filter(Boolean))].slice(0, 30);

  const staffSnaps = await Promise.all(allStaffIds.map(async (id) => {
    const [tSnap, aSnap] = await Promise.all([teachers.doc(id).get(), accounts.doc(id).get()]);
    const tData = tSnap.data() || {};
    const aData = aSnap.data() || {};
    const name = text(tData.teacherName || tData.displayName || tData.googleDisplayName || tData.name || aData.nickname || aData.teacherName || aData.displayName, 40) || '선생님';
    return { id, name };
  }));
  const staffNameMap = new Map(staffSnaps.map((s) => [s.id, s.name]));

  const masterName = ownerId ? (staffNameMap.get(ownerId) || '선생님') : '선생님';
  const coManagerNames = coManagerIds.map((id) => staffNameMap.get(id)).filter(Boolean);

  const staff = [
    { role: 'master', name: masterName },
    ...coManagerNames.map((name) => ({ role: 'manager', name }))
  ];
  const members = membersSnap.docs.map((member) => {
    const data = member.data() || {};
    return {
      nickname: text(data.nickname, 30) || '이름 없는 용사',
      learningGrade: safeInt(data.learningGrade, 4, 3, 6),
      stage: safeInt(data.stage, 1, 1, 9999),
      totalCorrect: safeInt(data.totalCorrect, 0, 0, 1000000000),
      totalQuizTries: Math.max(safeInt(data.totalCorrect, 0, 0, 1000000000), safeInt(data.totalQuizTries, 0, 0, 1000000000)),
      conqueredCount: safeInt(data.conqueredCount, safeInt(data.masteredCount, 0, 0), 0, 100000),
      masteredCount: safeInt(data.masteredCount, 0, 0, 100000),
      combatPower: safeInt(data.combatPower, 0, 0, 9999999999999),
      titleName: text(data.titleName, 80) || null,
      guildCoins: safeInt(data.guildCoins, 0, 0, 1000000000),
      guildPoints: safeInt(data.guildPoints, 0, 0, 1000000000),
      guildCorrectCount: safeInt(data.guildCorrectCount, 0, 0, 1000000000),
      guildStageClears: safeInt(data.guildStageClears, 0, 0, 1000000),
      guildBossDamage: safeInt(data.guildBossDamage, 0, 0, 100000000000000),
      guildBossPointTotal: safeInt(data.guildBossPointTotal, 0, 0, 1000000000),
      guildTrialCorrect: safeInt(data.guildTrialCorrect, 0, 0, 1000000),
      isMe: member.id === uid,
      lastActiveAt: data.lastActiveAt?.toDate?.().toISOString?.() || null
    };
  }).sort((a, b) => b.guildPoints - a.guildPoints || b.totalCorrect - a.totalCorrect || a.nickname.localeCompare(b.nickname));
  return {
    ...guild,
    guildName: text(classData.guildName || classData.classLabel, 40) || guild.guildName,
    guildLogoUrl: safeGuildLogoUrl(classData.guildLogoUrl),
    memberCount: safeInt(memberCountSnap.data()?.count, members.length, 0),
    guildTotalCorrect: members.reduce((sum, member) => sum + member.totalCorrect, 0),
    guildConqueredCount: members.reduce((sum, member) => sum + member.conqueredCount, 0),
    guildMasteredCount: members.reduce((sum, member) => sum + member.masteredCount, 0),
    guildPoints: members.reduce((sum, member) => sum + member.guildPoints, 0),
    wordPackId: assignment.wordPackId,
    wordPackIds: assignment.wordPackIds,
    assignedWordPacks: assignment.wordPacks || [],
    questionTypes: assignment.questionTypes,
    assignmentSource: assignment.assignmentSource,
    guildEffects,
    guildEffectCatalog: publicGuildEffectCatalog(guildEffects),
    guildSkinCatalog: publicGuildSkinCatalog(),
    guildCosmetics: safeGuildCosmetics(accountSnap.data()?.guildCosmetics),
    guildCosmeticEffects: calculateGuildCosmeticEffects(accountSnap.data()?.guildCosmetics),
    guildConsumableCatalog:GUILD_CONSUMABLE_DEFINITIONS.map((item)=>({...item})),
    guildBoostCharges:safeGuildBoostCharges(accountSnap.data()?.state?.guildBoostCharges),
    guildContributionPoints: Math.max(0, safeInt(ownMemberSnap.data()?.guildPoints, 0, 0, 1000000000) - safeInt(ownMemberSnap.data()?.guildEffectPointsSpent, 0, 0, 1000000000)),
    myGuildInvestment: { contributionByEffect, total: Object.values(contributionByEffect).reduce((sum, value) => sum + value, 0) },
    staff,
    members
  };
}
async function investGuildEffect(uid, body) {
  const effectId = text(body.effectId, 40);
  const definition = GUILD_EFFECT_DEFINITIONS[effectId];
  if (!definition) throw apiError(400, 'INVALID_GUILD_EFFECT', '투자할 길드 효과를 확인해 주세요.');
  const accountRef = accounts.doc(uid);
  return adminDb.runTransaction(async (tx) => {
    const accountSnap = await tx.get(accountRef);
    if (!accountSnap.exists) throw apiError(404, 'PROFILE_NOT_FOUND', '용사 기록을 찾지 못했어요.');
    const classId = text(accountSnap.data()?.activeClassId, 128);
    if (!classId) throw apiError(403, 'GUILD_REQUIRED', '참여 중인 길드가 없어요.');
    const classRef = classes.doc(classId);
    const memberRef = classRef.collection('members').doc(uid);
    const investmentRef = classRef.collection('effectInvestments').doc(uid);
    const [classSnap, memberSnap, investmentSnap] = await Promise.all([tx.get(classRef), tx.get(memberRef), tx.get(investmentRef)]);
    if (!classSnap.exists || !memberSnap.exists) throw apiError(403, 'GUILD_REQUIRED', '현재 길드 소속을 확인해 주세요.');
    const effects = safeGuildEffects(classSnap.data()?.guildEffects);
    const current = effects[effectId];
    if (current.level >= definition.maxLevel) throw apiError(409, 'GUILD_EFFECT_MAX', '이미 최고 레벨인 길드 효과예요.');
    const cost = guildEffectLevelCost(current.level);
    const coins = safeInt(memberSnap.data()?.guildCoins, 0, 0, 1000000000);
    const lifetimePoints = safeInt(memberSnap.data()?.guildPoints, 0, 0, 1000000000);
    const spentPoints = safeInt(memberSnap.data()?.guildEffectPointsSpent, 0, 0, lifetimePoints);
    const availablePoints = Math.max(0, lifetimePoints - spentPoints);
    if (availablePoints < cost) throw apiError(409, 'GUILD_POINT_SHORTAGE', `사용 가능한 길드 기여 포인트가 ${cost - availablePoints}P 부족해요.`);
    effects[effectId] = { level: current.level + 1, totalInvested: current.totalInvested + cost };
    const oldInvestment = investmentSnap.data() || {};
    const contributionByEffect = Object.fromEntries(Object.keys(GUILD_EFFECT_DEFINITIONS).map((id) => [id, safeInt(oldInvestment.contributionByEffect?.[id], 0, 0, 1000000000)]));
    contributionByEffect[effectId] += cost;
    const total = Object.values(contributionByEffect).reduce((sum, value) => sum + value, 0);
    tx.update(memberRef, { guildEffectPointsSpent: spentPoints + cost, lastActiveAt: FieldValue.serverTimestamp() });
    tx.update(classRef, { guildEffects: effects, guildEffectsUpdatedAt: FieldValue.serverTimestamp() });
    tx.set(investmentRef, { contributionByEffect, total, lastInvestedAt: FieldValue.serverTimestamp() }, { merge: true });
    return { guildCoins: coins, guildContributionPoints: availablePoints - cost, effects, catalog: publicGuildEffectCatalog(effects), myGuildInvestment: { contributionByEffect, total } };
  });
}

async function updateGuildSkin(uid, body) {
  const mode = text(body.mode, 20);
  if(mode==='buyConsumable')return buyGuildConsumable(uid,body);
  const variantKey = text(body.variantKey, 100);
  const summonCount = safeInt(body.count, 1, 1, 10);
  if (!['summon', 'equip', 'unequip', 'unlockVariant'].includes(mode)) throw apiError(400, 'INVALID_SKIN_ACTION', '외형 요청을 확인해 주세요.');
  if(mode==='summon'&&![1,10].includes(summonCount))throw apiError(400,'INVALID_SUMMON_COUNT','소환 횟수를 확인해 주세요.');
  const rolls=mode==='summon'?Array.from({length:summonCount},()=>({skinIndex:randomInt(GUILD_SKIN_DEFINITIONS.length),rarityRoll:randomInt(10000)})):[];
  const accountRef = accounts.doc(uid);
  return adminDb.runTransaction(async (tx) => {
    const accountSnap = await tx.get(accountRef);
    if (!accountSnap.exists) throw apiError(404, 'PROFILE_NOT_FOUND', '용사 기록을 찾지 못했어요.');
    const classId = text(accountSnap.data()?.activeClassId, 128);
    if (!classId) throw apiError(403, 'GUILD_REQUIRED', '참여 중인 길드가 없어요.');
    const memberRef = classes.doc(classId).collection('members').doc(uid);
    const memberSnap = await tx.get(memberRef);
    if (!memberSnap.exists) throw apiError(403, 'GUILD_REQUIRED', '현재 길드 소속을 확인해 주세요.');
    const cosmetics = safeGuildCosmetics(accountSnap.data()?.guildCosmetics);
    let coins = safeInt(memberSnap.data()?.guildCoins, 0, 0, 1000000000);
    const summonResults=[];
    if (mode === 'summon') {
      const cost=GUILD_SKIN_SUMMON_COST[summonCount];if(coins<cost)throw apiError(409,'GUILD_COIN_SHORTAGE',`길드 코인이 ${cost-coins}개 부족해요.`);coins-=cost;
      rolls.forEach((roll)=>{let rarityIndex=0,cursor=0;for(let i=0;i<GUILD_SKIN_RARITIES.length;i+=1){cursor+=GUILD_SKIN_RARITIES[i].weight;if(roll.rarityRoll<cursor){rarityIndex=i;break;}}
        const rarity=GUILD_SKIN_RARITIES[rarityIndex],skin=GUILD_SKIN_DEFINITIONS[roll.skinIndex],key=`${skin.id}:${rarity.id}`,duplicate=cosmetics.ownedVariantKeys.includes(key);let shardsGained=0;
        if(duplicate){shardsGained=rarity.shards;cosmetics.skinShards+=shardsGained;}else cosmetics.ownedVariantKeys.push(key);
        cosmetics.summonStats.totalSummons+=1;
        if(!cosmetics.equippedVariantKey&&!duplicate)cosmetics.equippedVariantKey=key;summonResults.push({skinId:skin.id,rarity:rarity.id,variantKey:key,duplicate,shardsGained});
      });
      tx.update(memberRef, { guildCoins: coins, lastActiveAt: FieldValue.serverTimestamp() });
    } else if (mode === 'equip') {
      if (!cosmetics.ownedVariantKeys.includes(variantKey)) throw apiError(403, 'SKIN_NOT_OWNED', '보유한 외형 등급만 장착할 수 있어요.');
      cosmetics.equippedVariantKey = variantKey;
    } else if (mode === 'unlockVariant') {
      const [skinId,rarityId]=variantKey.split(':');
      if(!GUILD_SKIN_BY_ID.has(skinId)||!GUILD_SKIN_RARITY_BY_ID.has(rarityId))throw apiError(400,'INVALID_SKIN_VARIANT','해금할 차원 영웅 등급을 확인해 주세요.');
      if(cosmetics.ownedVariantKeys.includes(variantKey))throw apiError(409,'SKIN_ALREADY_OWNED','이미 보유한 차원 영웅 등급이에요.');
      const shardCost=GUILD_SKIN_SHARD_UNLOCK_COST[rarityId];
      if(cosmetics.skinShards<shardCost)throw apiError(409,'SKIN_SHARD_SHORTAGE',`차원 파편이 ${shardCost-cosmetics.skinShards}개 부족해요.`);
      cosmetics.skinShards-=shardCost;
      cosmetics.ownedVariantKeys.push(variantKey);
      if(!cosmetics.equippedVariantKey)cosmetics.equippedVariantKey=variantKey;
    } else {
      cosmetics.equippedVariantKey = null;
    }
    tx.update(accountRef, { guildCosmetics: cosmetics, updatedAt: FieldValue.serverTimestamp() });
    return { guildCoins: coins, guildCosmetics: cosmetics, guildCosmeticEffects:calculateGuildCosmeticEffects(cosmetics), guildSkinCatalog: publicGuildSkinCatalog(), summonResults };
  });
}

async function buyGuildConsumable(uid,body){
  const item=GUILD_CONSUMABLE_BY_ID.get(text(body.itemId,40));
  if(!item)throw apiError(400,'INVALID_GUILD_ITEM','구입할 효과 아이템을 확인해 주세요.');
  const accountRef=accounts.doc(uid);
  return adminDb.runTransaction(async(tx)=>{
    const accountSnap=await tx.get(accountRef);
    if(!accountSnap.exists)throw apiError(404,'PROFILE_NOT_FOUND','용사 기록을 찾지 못했어요.');
    const classId=text(accountSnap.data()?.activeClassId,128);
    if(!classId)throw apiError(403,'GUILD_REQUIRED','참여 중인 길드가 없어요.');
    const memberRef=classes.doc(classId).collection('members').doc(uid),memberSnap=await tx.get(memberRef);
    if(!memberSnap.exists)throw apiError(403,'GUILD_REQUIRED','현재 길드 소속을 확인해 주세요.');
    const coins=safeInt(memberSnap.data()?.guildCoins,0,0,1000000000);
    if(coins<item.cost)throw apiError(409,'GUILD_COIN_SHORTAGE',`길드 코인이 ${item.cost-coins}개 부족해요.`);
    const accountData=accountSnap.data(),state={...defaultState(),...(accountData.state||{})},charges=safeGuildBoostCharges(state.guildBoostCharges);
    if(item.type==='exchange')state[item.resource]=Math.min(9999999999,safeInt(state[item.resource],0,0,9999999999)+item.amount);
    else charges[item.id]=Math.min(10000,charges[item.id]+item.charges);
    state.guildBoostCharges=charges;
    tx.update(memberRef,{guildCoins:coins-item.cost,lastActiveAt:FieldValue.serverTimestamp()});
    tx.update(accountRef,{state,updatedAt:FieldValue.serverTimestamp()});
    return {guildCoins:coins-item.cost,guildBoostCharges:charges,resources:{masteryPoints:safeInt(state.masteryPoints,0,0,9999999999),relicEssence:safeInt(state.relicEssence,0,0,9999999999),bossTokens:safeInt(state.bossTokens,0,0,9999999999)},guildConsumableCatalog:GUILD_CONSUMABLE_DEFINITIONS.map((row)=>({...row}))};
  });
}

async function guildTrialEvent(uid, body) {
  const trialId = text(body.trialId, 128);
  const event = text(body.event, 24);
  const requestedAttemptId = text(body.attemptId, 128);
  const proposedAttemptId = randomUUID().toLowerCase();
  const questionKey = text(body.questionKey, 80).toLowerCase();
  const submittedAnswer = text(body.answer, 160);
  if (!trialId || !['start', 'hint', 'answer'].includes(event) || (event !== 'start' && (requestedAttemptId.length < 8 || !questionKey)) || (event === 'answer' && !submittedAnswer)) throw apiError(400, 'INVALID_TRIAL_EVENT', '시련 진행 정보를 확인해 주세요.');
  const assignment = await assignedWordPack(uid);
  if (!assignment.classId) throw apiError(403, 'GUILD_REQUIRED', '참여 중인 길드가 없어요.');
  const classRef = classes.doc(assignment.classId);
  const trialRef = classRef.collection('trials').doc(trialId);
  const memberRef = classRef.collection('members').doc(uid);
  const progressRef = trialRef.collection('progress').doc(uid);
  const completionRef = trialRef.collection('completions').doc(uid);
  return adminDb.runTransaction(async (tx) => {
    const [classSnap, trialSnap, memberSnap, progressSnap, completionSnap] = await Promise.all([tx.get(classRef), tx.get(trialRef), tx.get(memberRef), tx.get(progressRef), tx.get(completionRef)]);
    if (!classSnap.exists || !memberSnap.exists) throw apiError(403, 'GUILD_REQUIRED', '참여 중인 길드를 확인해 주세요.');
    if (text(classSnap.data()?.activeTrialId, 128) !== trialId || !trialSnap.exists) throw apiError(409, 'TRIAL_REPLACED', '선생님이 새 시련을 보냈어요. 새 문제를 불러와 주세요.');
    const trial = trialSnap.data();
    if (trial.status !== 'active' || isExpired(trial.expiresAt)) throw apiError(409, 'TRIAL_EXPIRED', '이 시련의 도전 기간이 끝났어요.');
    const trialWords = (Array.isArray(trial.words) ? trial.words : []).slice(0, 20).filter((entry) => text(entry?.word, 80) && text(entry?.meaning, 160));
    if (!trialWords.length) throw apiError(409, 'TRIAL_EMPTY', '시련 문제를 다시 만들어 주세요.');
    const current = progressSnap.data() || {};
    const history = safeTrialAttemptHistory(current.attemptHistory);
    const attemptCount = Math.max(history.length, safeInt(current.attemptCount, 0, 0, TRIAL_MAX_ATTEMPTS));
    const completed = completionSnap.exists;
    if (event === 'start') {
      const exhausted = !completed && attemptCount >= TRIAL_MAX_ATTEMPTS;
      if (completed || exhausted) return { attemptId: null, questions: [], completed, exhausted, attemptCount, retryCount: Math.max(0, attemptCount - 1), remainingAttempts: Math.max(0, TRIAL_MAX_ATTEMPTS - attemptCount), attemptHistory: history };
      const existingAttemptId = text(current.activeAttemptId, 128).toLowerCase();
      const existingQuestions = safeActiveTrialQuestions(current.activeQuestions, trialWords.length);
      const canResume = existingAttemptId.length >= 8 && existingQuestions.length === trialWords.length;
      const attemptId = canResume ? existingAttemptId : proposedAttemptId;
      const activeQuestions = canResume ? existingQuestions : createActiveTrialQuestions(trialWords);
      if (!canResume) tx.set(progressRef, { uid, activeAttemptId: attemptId, activeQuestions, activeAnswerResults: [], hintKeys: FieldValue.delete(), activeAttemptStartedAt: FieldValue.serverTimestamp(), startedAt: current.startedAt || FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      return { attemptId, questions: publicTrialQuestions(trialWords, activeQuestions, attemptId), answerResults: canResume ? safeActiveTrialAnswerResults(current.activeAnswerResults) : [], completed: false, exhausted: false, attemptCount, retryCount: Math.max(0, attemptCount - 1), remainingAttempts: Math.max(0, TRIAL_MAX_ATTEMPTS - attemptCount), attemptHistory: history };
    }
    if (completed) return { completed: true, exhausted: false, attemptCount, retryCount: Math.max(0, attemptCount - 1), remainingAttempts: 0, attemptHistory: history };
    if (attemptCount >= TRIAL_MAX_ATTEMPTS) throw apiError(409, 'TRIAL_ATTEMPTS_EXHAUSTED', '이번 시련의 도전 기회를 모두 사용했어요.');
    const attemptId = requestedAttemptId.toLowerCase();
    if (text(current.activeAttemptId, 128).toLowerCase() !== attemptId) throw apiError(409, 'TRIAL_ATTEMPT_REPLACED', '새로 시작한 도전이 있어요. 길드 본부에서 다시 시작해 주세요.');
    const activeQuestions = safeActiveTrialQuestions(current.activeQuestions, trialWords.length);
    const activeQuestion = activeQuestions.find((question) => question.id === questionKey);
    if (!activeQuestion) throw apiError(400, 'INVALID_TRIAL_QUESTION', '현재 시련 문제를 다시 불러와 주세요.');
    const spec = trialQuestionSpec(trialWords, activeQuestion, attemptId);
    if (event === 'answer') {
      const expected = spec.correctOptionId || spec.expected;
      const correct = normalizedTrialAnswer(submittedAnswer) === normalizedTrialAnswer(expected);
      const results = safeActiveTrialAnswerResults(current.activeAnswerResults).filter((entry) => entry.questionId !== questionKey);
      results.push({ questionId: questionKey, answer: submittedAnswer, correct });
      tx.set(progressRef, { uid, activeAnswerResults: results.slice(-20), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      return { completed: false, exhausted: false, answerResult: { questionId: questionKey, correct, correctAnswer: Array.isArray(spec.publicQuestion.options) ? spec.publicQuestion.options.find((option) => option.id === spec.correctOptionId)?.label : spec.word } };
    }
    const hintKey = `${attemptId}:${questionKey}`;
    const hintKeys = [...new Set((Array.isArray(current.hintKeys) ? current.hintKeys : []).map((value) => text(value, 220)).filter(Boolean))].slice(-60);
    if (!hintKeys.includes(hintKey)) hintKeys.push(hintKey);
    tx.set(progressRef, { uid, hintKeys: hintKeys.slice(-60), hintsUsed: hintKeys.length, lastHintAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    const usedThisAttempt = hintKeys.filter((key) => key.startsWith(`${attemptId}:`)).length;
    const hint = Array.isArray(spec.publicQuestion.options)
      ? { kind: 'choice-eliminate', hideOptionIds: spec.publicQuestion.options.filter((option) => option.id !== spec.correctOptionId).slice(0, 2).map((option) => option.id) }
      : { kind: 'input-meta', firstLetter: spec.word.match(/[A-Za-z]/)?.[0]?.toUpperCase() || '?', letterCount: spec.word.replace(/[^A-Za-z]/g, '').length };
    return { completed: false, exhausted: false, attemptCount, retryCount: Math.max(0, attemptCount - 1), remainingAttempts: TRIAL_MAX_ATTEMPTS - attemptCount, hintRecorded: true, hintsUsedThisAttempt: usedThisAttempt, hint };
  });
}async function syncGuildMemberProgress(uid, data) {
  const classIds = typeof data?.activeClassId === 'string' && data.activeClassId ? [data.activeClassId] : [];
  const state = data?.state || {};
  await Promise.all(classIds.map((classId) => {
    const memberRef = classes.doc(classId).collection('members').doc(uid);
    return adminDb.runTransaction(async (tx) => {
      const memberSnap = await tx.get(memberRef);
      if (!memberSnap.exists) return;
      const member = memberSnap.data() || {};
      const correct = safeInt(state.totalQuizCorrect, 0, 0);
      const tries = safeInt(state.totalQuizTries, correct, correct, 1000000000);
      const stage = safeInt(state.stage, 1, 1, 9999);
      const countedCorrect = safeInt(member.countedCorrect, correct, 0);
      const countedTries = safeInt(member.countedTries, tries, 0);
      const countedStage = safeInt(member.countedStage, stage, 1);
      const correctGain = Math.max(0, correct - countedCorrect);
      const triesGain = Math.max(correctGain, tries - countedTries);
      const stageGain = Math.max(0, stage - countedStage);
      const day = seoulDayKey();
      const dailyLearning = safeDailyLearning(member.dailyLearning);
      const currentDay = dailyLearning[day] || { tries: 0, correct: 0, stageClears: 0 };
      const previousDailyCorrect = safeInt(currentDay.correct, 0, 0, 1000000);
      const nextDailyCorrect = previousDailyCorrect + correctGain;
      const correctCoinRemainder = safeInt(member.guildCoinCorrectRemainder, 0, 0, 4);
      const correctCoinProgress = correctCoinRemainder + correctGain;
      const correctCoinGain = Math.floor(correctCoinProgress / 5);
      const nextCorrectCoinRemainder = correctCoinProgress % 5;
      const dailyConsistencyBonus = previousDailyCorrect < 10 && nextDailyCorrect >= 10 ? 5 : 0;
      const stageCoinGain = stageGain * 5;
      const guildCoinGain = correctCoinGain + dailyConsistencyBonus + stageCoinGain;
      dailyLearning[day] = {
        tries: currentDay.tries + triesGain,
        correct: currentDay.correct + correctGain,
        stageClears: currentDay.stageClears + stageGain
      };
      const prunedDailyLearning = Object.fromEntries(Object.entries(dailyLearning)
        .filter(([key]) => Date.parse(`${key}T00:00:00+09:00`) >= Date.now() - 120 * DAY_MS)
        .sort(([a], [b]) => a.localeCompare(b)));
      const conqueredCount = Array.isArray(state.masteredWords) ? state.masteredWords.length : 0;
      const mastery = wordMasterySummary(state.wordLearningStats, conqueredCount);
      tx.set(memberRef, {
        nickname: data.nickname,
        learningGrade: data.learningGrade,
        totalCorrect: correct,
        totalQuizTries: tries,
        questionTypeStats: safeQuestionTypeStats(state.questionTypeStats),
        wrongWordCounts: safeWrongWordCounts(state.wrongWordCounts),
        wordLearningStats: mastery.stats,
        conqueredCount,
        masteredCount: mastery.masteredCount,
        combatPower: safeInt(state.combatPower, 0, 0, 9999999999999),
        titleName: text(state.equippedTitle || state.wbTitle, 80) || null,
        stage,
        countedCorrect: Math.max(countedCorrect, correct),
        countedTries: Math.max(countedTries, tries),
        countedStage: Math.max(countedStage, stage),
        dailyLearning: prunedDailyLearning,
        guildCorrectCount: FieldValue.increment(correctGain),
        guildStageClears: FieldValue.increment(stageGain),
        guildPoints: FieldValue.increment(correctGain + stageGain * 20),
        guildCoins: FieldValue.increment(guildCoinGain),
        guildLearningCoinTotal: FieldValue.increment(guildCoinGain),
        guildCoinCorrectRemainder: nextCorrectCoinRemainder,
        lastActiveAt: FieldValue.serverTimestamp()
      }, { merge: true });
    });
  }));
}
let guildRankCache = { expiresAt: 0, rows: [] };
async function guildWordPackPreview(uid, body) {
  const assignment = await assignedWordPack(uid);
  if (!assignment.classId) throw apiError(404, 'GUILD_NOT_JOINED', '가입한 길드를 찾지 못했어요.');
  const wordPackId = text(body.wordPackId, 80);
  if (!assignment.wordPackIds.includes(wordPackId)) throw apiError(403, 'WORD_PACK_NOT_ASSIGNED', '현재 배정된 단어팩만 확인할 수 있어요.');
  const pack = STUDENT_WORD_PACK_BY_ID.get(wordPackId);
  if (!pack) throw apiError(404, 'WORD_PACK_NOT_FOUND', '단어팩을 찾지 못했어요.');
  return {
    id: pack.id,
    label: text(pack.label, 120) || pack.id,
    wordCount: safeInt(pack.wordCount, Array.isArray(pack.words) ? pack.words.length : 0, 0, 5000),
    words: (Array.isArray(pack.words) ? pack.words : []).slice(0, 500).map((entry) => ({ word: text(entry?.word, 80), meaning: text(entry?.meaning, 160) })).filter((entry) => entry.word && entry.meaning)
  };
}
async function guildLeaderboard() {
  if (guildRankCache.expiresAt > Date.now()) return guildRankCache.rows;
  const classSnaps = await classes.limit(50).get();
  const rows = await Promise.all(classSnaps.docs.map(async (classSnap) => {
    const memberQuery = classSnap.ref.collection('members');
    const [members, memberCountSnap] = await Promise.all([
      memberQuery.select('guildPoints', 'guildCorrectCount', 'guildStageClears', 'guildBossPointTotal', 'guildTrialCorrect').limit(200).get(),
      memberQuery.count().get()
    ]);
    let guildPoints = 0; let correctPoints = 0; let stagePoints = 0; let bossPoints = 0; let trialPoints = 0;
    members.docs.forEach((member) => {
      const data = member.data() || {};
      guildPoints += safeInt(data.guildPoints, 0, 0);
      correctPoints += safeInt(data.guildCorrectCount, 0, 0);
      stagePoints += safeInt(data.guildStageClears, 0, 0) * 20;
      bossPoints += safeInt(data.guildBossPointTotal, 0, 0);
      trialPoints += safeInt(data.guildTrialCorrect, 0, 0) * 10;
    });
    return { id: classSnap.id, guildName: text(classSnap.data()?.guildName || classSnap.data()?.classLabel, 40) || '이름 없는 길드', guildLogoUrl: safeGuildLogoUrl(classSnap.data()?.guildLogoUrl), memberCount: safeInt(memberCountSnap.data()?.count, members.size, 0), guildPoints, breakdown: { correct: correctPoints, stage: stagePoints, worldBoss: bossPoints, trial: trialPoints } };
  }));
  const ranked = rows.filter((row) => row.memberCount > 0).sort((a, b) => b.guildPoints - a.guildPoints || a.guildName.localeCompare(b.guildName)).slice(0, 50).map((row, index) => ({ ...row, rank: index + 1 }));
  guildRankCache = { expiresAt: Date.now() + 60_000, rows: ranked };
  return ranked;
}
async function completeGuildTrial(uid, body) {
  const trialId = text(body.trialId, 128);
  const attemptId = text(body.attemptId, 128).toLowerCase();
  const answers = Array.isArray(body.answers) ? body.answers.slice(0, 20) : [];
  if (!trialId || attemptId.length < 8 || !answers.length) throw apiError(400, 'INVALID_TRIAL_ANSWERS', '시련 답안을 확인해 주세요.');
  const assignment = await assignedWordPack(uid);
  if (!assignment.classId) throw apiError(403, 'GUILD_REQUIRED', '참여 중인 길드가 없어요.');
  const classRef = classes.doc(assignment.classId);
  const trialRef = classRef.collection('trials').doc(trialId);
  const memberRef = classRef.collection('members').doc(uid);
  const progressRef = trialRef.collection('progress').doc(uid);
  const completionRef = trialRef.collection('completions').doc(uid);
  const answerMap = new Map(answers.map((entry) => [text(entry?.questionId, 80).toLowerCase(), normalizedTrialAnswer(entry?.answer)]));
  return adminDb.runTransaction(async (tx) => {
    const [classSnap, trialSnap, memberSnap, progressSnap, completionSnap] = await Promise.all([tx.get(classRef), tx.get(trialRef), tx.get(memberRef), tx.get(progressRef), tx.get(completionRef)]);
    if (!classSnap.exists || !memberSnap.exists) throw apiError(403, 'GUILD_REQUIRED', '참여 중인 길드를 확인해 주세요.');
    if (text(classSnap.data()?.activeTrialId, 128) !== trialId || !trialSnap.exists) throw apiError(409, 'TRIAL_REPLACED', '선생님이 새 시련을 보냈어요. 새 문제를 불러와 주세요.');
    const trial = trialSnap.data();
    if (trial.status !== 'active' || isExpired(trial.expiresAt)) throw apiError(409, 'TRIAL_EXPIRED', '이 시련의 도전 기간이 끝났어요.');
    const words = (Array.isArray(trial.words) ? trial.words : []).slice(0, 20).filter((entry) => text(entry?.word, 80) && text(entry?.meaning, 160));
    if (words.length < 1) throw apiError(409, 'TRIAL_EMPTY', '시련 문제를 다시 만들어 주세요.');
    const current = progressSnap.data() || {};
    const history = safeTrialAttemptHistory(current.attemptHistory);
    const prior = history.find((entry) => entry.attemptId === attemptId);
    const currentCoins = safeInt(memberSnap.data()?.guildCoins, 0, 0, 1000000000);
    if (prior) return { result: prior, attemptCount: history.length, remainingAttempts: Math.max(0, TRIAL_MAX_ATTEMPTS - history.length), overcome: prior.overcome || completionSnap.exists, exhausted: !prior.overcome && history.length >= TRIAL_MAX_ATTEMPTS, rewardGuildCoins: 0, guildCoins: currentCoins, alreadyRecorded: true };
    if (completionSnap.exists) return { result: history.at(-1) || null, attemptCount: history.length, remainingAttempts: 0, overcome: true, exhausted: false, rewardGuildCoins: 0, guildCoins: currentCoins, alreadyCompleted: true };
    if (history.length >= TRIAL_MAX_ATTEMPTS) throw apiError(409, 'TRIAL_ATTEMPTS_EXHAUSTED', '이번 시련의 도전 기회를 모두 사용했어요.');
    if (text(current.activeAttemptId, 128).toLowerCase() !== attemptId) throw apiError(409, 'TRIAL_ATTEMPT_REPLACED', '새로 시작한 도전이 있어요. 길드 본부에서 다시 시작해 주세요.');
    const activeQuestions = safeActiveTrialQuestions(current.activeQuestions, words.length);
    if (activeQuestions.length !== words.length) throw apiError(409, 'TRIAL_ATTEMPT_INVALID', '현재 시련 문제를 다시 시작해 주세요.');
    const hintPrefix = `${attemptId}:`;
    const hintKeys = [...new Set((Array.isArray(current.hintKeys) ? current.hintKeys : []).map((value) => text(value, 220)).filter(Boolean))];
    const hintedWords = new Set(hintKeys.filter((key) => key.startsWith(hintPrefix)).map((key) => key.slice(hintPrefix.length)));
    const results = activeQuestions.map((question) => {
      const spec = trialQuestionSpec(words, question, attemptId);
      const expected = spec.correctOptionId || spec.expected;
      return { wordKey: question.id, correct: answerMap.get(question.id) === normalizedTrialAnswer(expected), hinted: hintedWords.has(question.id) };
    });
    const correctCount = results.filter((entry) => entry.correct).length;
    const hintsUsed = results.filter((entry) => entry.hinted).length;
    const correctAfterHint = results.filter((entry) => entry.hinted && entry.correct).length;
    const unassistedTries = results.length - hintsUsed;
    const unassistedCorrect = results.filter((entry) => !entry.hinted && entry.correct).length;
    const overcome = correctCount === words.length;
    const attemptNo = history.length + 1;
    const completedAtMs = Date.now();
    const result = { attemptId, attemptNo, correctCount, questionCount: words.length, accuracy: Math.round(correctCount / words.length * 1000) / 10, hintsUsed, correctAfterHint, unassistedCorrect, unassistedTries, completedAtMs, overcome };
    const nextHistory = [...history, result].slice(-TRIAL_MAX_ATTEMPTS);
    const day = seoulDayKey(completedAtMs);
    const memberData = memberSnap.data() || {};
    const daily = safeTrialDailyResults(memberData.trialDailyResults);
    daily[day] = [...(daily[day] || []), { trialId, ...result }].slice(-12);
    const prunedDaily = safeTrialDailyResults(daily);
    const rewardGuildCoins = overcome ? safeInt(trial.rewardGuildCoins, words.length * 5, 0, 1000) : 0;
    const guildCoins = currentCoins + rewardGuildCoins;
    tx.set(progressRef, { uid, activeAttemptId: FieldValue.delete(), activeQuestions: FieldValue.delete(), activeAnswerResults: FieldValue.delete(), activeAttemptStartedAt: FieldValue.delete(), attemptCount: nextHistory.length, retryCount: Math.max(0, nextHistory.length - 1), attemptHistory: nextHistory, hintKeys: FieldValue.delete(), hintsUsed: nextHistory.reduce((sum, entry) => sum + entry.hintsUsed, 0), lastWrongCount: words.length - correctCount, lastAttemptAt: FieldValue.serverTimestamp(), status: overcome ? 'overcome' : nextHistory.length >= TRIAL_MAX_ATTEMPTS ? 'exhausted' : 'retry-available', updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    const memberUpdate = { trialAttempts: FieldValue.increment(1), trialRetries: FieldValue.increment(attemptNo > 1 ? 1 : 0), trialHintsUsed: FieldValue.increment(hintsUsed), trialHintedCorrect: FieldValue.increment(correctAfterHint), trialUnassistedCorrect: FieldValue.increment(unassistedCorrect), trialUnassistedTries: FieldValue.increment(unassistedTries), trialDailyResults: prunedDaily, lastTrialActivityAt: FieldValue.serverTimestamp() };
    if (overcome) {
      Object.assign(memberUpdate, { guildCoins, guildTrialCorrect: FieldValue.increment(words.length), guildPoints: FieldValue.increment(words.length * 10), lastTrialCompletedAt: FieldValue.serverTimestamp() });
      tx.set(completionRef, { uid, correctCount, rewardGuildCoins, attemptNo, completedAt: FieldValue.serverTimestamp() });
    }
    tx.set(memberRef, memberUpdate, { merge: true });
    return { result, attemptCount: nextHistory.length, remainingAttempts: Math.max(0, TRIAL_MAX_ATTEMPTS - nextHistory.length), overcome, exhausted: !overcome && nextHistory.length >= TRIAL_MAX_ATTEMPTS, rewardGuildCoins, guildCoins };
  });
}async function publish(uid, data) {
  if (!data.leaderboardOptIn) return leaderboard.doc(uid).delete();
  const state=data.state||defaultState();
  return leaderboard.doc(uid).set({
    nickname:data.nickname,
    guildName:text(data.activeGuildName,40)||null,
    guildLogoUrl:data.activeGuildName?safeGuildLogoUrl(data.activeGuildLogoUrl):null,
    titleName:text(state.equippedTitle||state.wbTitle,80)||null,
    score:score(state),
    stage:safeInt(state.stage,1,1),
    progress:safeInt(state.progress,0,0,100),
    gold:safeInt(state.accGold ?? state.gold,0,0),
    correctCount:safeInt(state.totalQuizCorrect,0,0),
    updatedAt:FieldValue.serverTimestamp()
  });
}
function newProgressGuard(now = Date.now()) {
  return { tokens: PROGRESS_TOKEN_INITIAL, refillAt: Timestamp.fromMillis(now) };
}
function refillProgressGuard(value, now = Date.now()) {
  const storedTokens = Number.isFinite(Number(value?.tokens)) ? Math.max(0, Math.min(PROGRESS_TOKEN_CAPACITY, Number(value.tokens))) : PROGRESS_TOKEN_CAPACITY;
  const rawRefillAt = value?.refillAt?.toMillis?.();
  const refillAt = Number.isFinite(rawRefillAt) && rawRefillAt <= now ? rawRefillAt : now;
  const refills = Math.floor(Math.max(0, now - refillAt) / PROGRESS_TOKEN_REFILL_MS);
  const tokens = Math.min(PROGRESS_TOKEN_CAPACITY, storedTokens + refills);
  const nextRefillAt = tokens >= PROGRESS_TOKEN_CAPACITY ? now : refillAt + refills * PROGRESS_TOKEN_REFILL_MS;
  return { tokens, refillAt: nextRefillAt };
}
function assertProgressStats(state) {
  const correct = safeInt(state.totalQuizCorrect, 0, 0);
  const tries = safeInt(state.totalQuizTries, correct, correct);
  const wordTotals = Object.values(state.wordLearningStats || {}).reduce((sum, entry) => {
    sum.correct += safeInt(entry?.c, 0, 0);
    sum.tries += safeInt(entry?.c, 0, 0) + safeInt(entry?.x, 0, 0);
    return sum;
  }, { correct: 0, tries: 0 });
  const typeTotals = Object.values(state.questionTypeStats || {}).reduce((sum, entry) => {
    sum.correct += safeInt(entry?.correct, 0, 0);
    sum.tries += safeInt(entry?.tries, 0, 0);
    return sum;
  }, { correct: 0, tries: 0 });
  if (wordTotals.correct > correct || wordTotals.tries > tries || typeTotals.correct > correct || typeTotals.tries > tries) {
    throw apiError(409, 'PROGRESS_STATS_INVALID', '학습 통계와 전체 퀴즈 기록이 일치하지 않아 저장하지 못했어요. 최신 기록을 다시 불러와 주세요.');
  }
}
function guardProgress(previous, next, storedGuard, now = Date.now()) {
  const oldCorrect = safeInt(previous?.totalQuizCorrect, 0, 0);
  const requestedCorrect = safeInt(next.totalQuizCorrect, 0, 0);
  const correct = Math.max(oldCorrect, requestedCorrect);
  const gain = correct - oldCorrect;
  const bucket = refillProgressGuard(storedGuard, now);
  if (gain > bucket.tokens) throw apiError(409, 'PROGRESS_RATE_LIMIT', '학습 기록이 너무 빠르게 증가해 저장을 잠시 멈췄어요. 잠시 후 다시 저장해 주세요.');
  next.totalQuizCorrect = correct;
  const oldTries = safeInt(previous?.totalQuizTries, oldCorrect, oldCorrect);
  next.totalQuizTries = Math.max(oldTries, safeInt(next.totalQuizTries, correct, correct));
  assertProgressStats(next);
  const maxStage = Math.max(safeInt(previous?.stage, 1, 1), Math.floor(correct / 10) + 2);
  if (safeInt(next.stage, 1, 1) > maxStage) next.stage = maxStage;
  if (Array.isArray(next.masteredWords) && next.masteredWords.length > correct) next.masteredWords = next.masteredWords.slice(0, correct);
  return {
    state: next,
    progressGuard: { tokens: bucket.tokens - gain, refillAt: Timestamp.fromMillis(bucket.refillAt) }
  };
}
async function create(uid, body) {
  const ref=accounts.doc(uid); const existing=await ref.get(); if (existing.exists) return publicAccount(existing.data());
  if (body.privacyConsent !== true) throw apiError(400,'CONSENT_REQUIRED','학습 기록 저장 안내에 동의해야 시작할 수 있어요.');
  const data={schemaVersion:2,role:'student',nickname:normalizeNickname(body.nickname),learningGrade:safeInt(body.learningGrade,4,3,6),state:{...defaultState(),lastSaved:Date.now()},progressGuard:newProgressGuard(),freeNicknameChangeUsed:false,renameCount:0,leaderboardOptIn:Boolean(body.leaderboardOptIn),consentVersion:'student-v1',consentAt:FieldValue.serverTimestamp(),classIds:[],createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()};
  await ref.create(data); await publish(uid,data); return publicAccount(data);
}
async function syncWorldBossVisibility(uid, accountData) {
  const account=accountData||((await accounts.doc(uid).get()).data()||null);if(!account)return;
  const ref=adminDb.collection('world_bosses').doc(`global_week_${currentBossWeek()}`).collection('contributions').doc(uid);
  const snap=await ref.get();if(!snap.exists)return;
  const visible=Boolean(account.leaderboardOptIn);
  await ref.update({publicLeaderboard:visible,publicNickname:visible?account.nickname:null,publicGuildName:visible?(text(account.activeGuildName,40)||null):null,publicGuildLogoUrl:visible&&account.activeGuildName?safeGuildLogoUrl(account.activeGuildLogoUrl):null,publicTitleName:visible?(text(account.state?.equippedTitle||account.state?.wbTitle,80)||null):null,updatedAt:FieldValue.serverTimestamp()});
}async function save(uid, body) {
  const requested=cleanState(body.state);
  // 클라이언트 시계와 무관하게 서버가 오프라인 보상의 기준 시각을 확정한다.
  requested.lastSaved=Date.now(); const optIn=typeof body.leaderboardOptIn==='boolean'?body.leaderboardOptIn:null; const ref=accounts.doc(uid);
  const data=await adminDb.runTransaction(async tx=>{const snap=await tx.get(ref);if(!snap.exists)throw apiError(404,'PROFILE_NOT_FOUND','먼저 용사를 만들어 주세요.');const current=snap.data();const storedGuard=current.progressGuard||{tokens:PROGRESS_TOKEN_INITIAL,refillAt:current.updatedAt};const guarded=guardProgress(current.state||defaultState(),requested,storedGuard);const update={state:guarded.state,progressGuard:guarded.progressGuard,updatedAt:FieldValue.serverTimestamp()};if(optIn!==null)update.leaderboardOptIn=optIn;tx.update(ref,update);return {...current,...update,state:guarded.state};});
  await Promise.all([publish(uid,data),syncWorldBossVisibility(uid,data),syncGuildMemberProgress(uid,data)]);return publicAccount(data);
}
async function rename(uid, body) {
  const nickname=normalizeNickname(body.nickname);const ref=accounts.doc(uid);
  const data=await adminDb.runTransaction(async tx=>{const snap=await tx.get(ref);if(!snap.exists)throw apiError(404,'PROFILE_NOT_FOUND','먼저 용사를 만들어 주세요.');const current=snap.data();const first=!current.freeNicknameChangeUsed;const cost=first?0:500;const state={...defaultState(),...(current.state||{})};if(safeInt(state.masteryPoints,0,0)<cost)throw apiError(409,'NOT_ENOUGH_FP',`${cost} FP가 있어야 닉네임을 변경할 수 있어요.`);state.masteryPoints-=cost;const update={nickname,state,freeNicknameChangeUsed:true,renameCount:safeInt(current.renameCount,0,0)+1,updatedAt:FieldValue.serverTimestamp()};tx.update(ref,update);return {...current,...update};});
  await Promise.all((data.classIds||[]).slice(0,100).map(id=>adminDb.collection('classes').doc(id).collection('members').doc(uid).set({nickname:data.nickname},{merge:true})));
  await Promise.all([publish(uid,data),syncWorldBossVisibility(uid,data)]);return {account:publicAccount(data),cost:data.renameCount===1?0:500};
}
async function previewGuildInvite(uid, body) {
  const code=text(body.code,32).toUpperCase().replace(/[^A-Z0-9]/g,'');
  if(code.length!==6||!/[A-Z]/.test(code)||!/\d/.test(code))throw apiError(400,'INVALID_INVITE','영문·숫자 혼합 6자리 길드 초대 코드를 확인해 주세요.');
  const inviteSnap=await invites.doc(hash(code)).get();
  if(!inviteSnap.exists||inviteSnap.data().type!=='student'||isExpired(inviteSnap.data().expiresAt))throw apiError(404,'INVITE_NOT_FOUND','길드 초대 코드를 확인해 주세요.');
  const invite=inviteSnap.data(),classSnap=await classes.doc(invite.classId).get();
  if(!classSnap.exists)throw apiError(404,'GUILD_NOT_FOUND','길드를 찾지 못했어요.');
  const classroom=classSnap.data()||{},configuredCode=text(classroom.inviteCodes?.student?.code,32).toUpperCase().replace(/[^A-Z0-9]/g,'');
  if(configuredCode&&configuredCode!==code)throw apiError(404,'INVITE_REPLACED','이전 초대 정보예요. 선생님에게 새 코드·QR·링크를 받아 주세요.');
  const [memberSnap,countSnap]=await Promise.all([classSnap.ref.collection('members').doc(uid).get(),classSnap.ref.collection('members').count().get()]);
  return {classId:classSnap.id,classLabel:text(classroom.guildName||classroom.classLabel||invite.classLabel,40)||'길드',guildLogoUrl:safeGuildLogoUrl(classroom.guildLogoUrl),memberCount:safeInt(countSnap.data()?.count,0,0,100000),alreadyMember:memberSnap.exists};
}
async function joinClass(uid, body) {
  const code=text(body.code,32).toUpperCase().replace(/[^A-Z0-9]/g,'');if(code.length!==6||!/[A-Z]/.test(code)||!/\d/.test(code))throw apiError(400,'INVALID_INVITE','영문·숫자 혼합 6자리 길드 초대 코드를 확인해 주세요.');
  const inviteRef=invites.doc(hash(code));const accountRef=accounts.doc(uid);
  const membership=await adminDb.runTransaction(async tx=>{
    const inviteSnap=await tx.get(inviteRef);
    if(!inviteSnap.exists||inviteSnap.data().type!=='student'||isExpired(inviteSnap.data().expiresAt))throw apiError(404,'INVITE_NOT_FOUND','길드 초대 코드를 확인해 주세요.');
    const invite=inviteSnap.data(),classRef=classes.doc(invite.classId),memberRef=classRef.collection('members').doc(uid);
    const [accountSnap,classSnap,memberSnap]=await Promise.all([tx.get(accountRef),tx.get(classRef),tx.get(memberRef)]);
    if(!accountSnap.exists)throw apiError(404,'PROFILE_NOT_FOUND','먼저 용사를 만들어 주세요.');if(!classSnap.exists)throw apiError(404,'GUILD_NOT_FOUND','길드를 찾지 못했어요.');
    const configuredCode=text(classSnap.data()?.inviteCodes?.student?.code,32).toUpperCase().replace(/[^A-Z0-9]/g,'');
    if(configuredCode&&configuredCode!==code)throw apiError(404,'INVITE_REPLACED','이전 초대 정보예요. 선생님에게 새 코드·QR·링크를 받아 주세요.');
    const account=accountSnap.data(),classLabel=text(classSnap.data().guildName||classSnap.data().classLabel||invite.classLabel,40)||'길드',guildLogoUrl=safeGuildLogoUrl(classSnap.data().guildLogoUrl),correct=safeInt(account.state?.totalQuizCorrect,0,0),stage=safeInt(account.state?.stage,1,1,9999);
    const classroom=classSnap.data()||{},defaultPacks=normalizedPackIds(classroom.wordPackIds||classroom.wordPackId,account.learningGrade),defaultTypes=normalizedQuestionTypes(classroom.defaultQuestionTypes);
    const conqueredCount=Array.isArray(account.state?.masteredWords)?account.state.masteredWords.length:0,mastery=wordMasterySummary(account.state?.wordLearningStats,conqueredCount);const base={nickname:account.nickname,learningGrade:account.learningGrade,totalCorrect:correct,totalQuizTries:safeInt(account.state?.totalQuizTries,correct,correct,1000000000),questionTypeStats:safeQuestionTypeStats(account.state?.questionTypeStats),wrongWordCounts:safeWrongWordCounts(account.state?.wrongWordCounts),wordLearningStats:mastery.stats,conqueredCount,masteredCount:mastery.masteredCount,combatPower:safeInt(account.state?.combatPower,0,0,9999999999999),titleName:text(account.state?.equippedTitle||account.state?.wbTitle,80)||null,stage,lastActiveAt:FieldValue.serverTimestamp()};
    if(!memberSnap.exists)Object.assign(base,{usesGuildLearningDefaults:true,assignedWordPackIds:defaultPacks,questionTypes:defaultTypes,countedCorrect:correct,countedTries:base.totalQuizTries,countedStage:stage,dailyLearning:{},guildCorrectCount:0,guildStageClears:0,guildBossDamage:0,guildBossPointTotal:0,guildTrialCorrect:0,trialAttempts:0,trialRetries:0,trialHintsUsed:0,guildPoints:0,guildCoins:0,joinedAt:FieldValue.serverTimestamp()});
    (Array.isArray(account.classIds)?account.classIds:[]).slice(0,100).filter(id=>id&&id!==invite.classId).forEach(id=>tx.delete(classes.doc(id).collection('members').doc(uid)));
    tx.set(memberRef,base,{merge:true});tx.update(accountRef,{classIds:[invite.classId],activeClassId:invite.classId,activeGuildName:classLabel,activeGuildLogoUrl:guildLogoUrl,updatedAt:FieldValue.serverTimestamp()});return {classId:invite.classId,classLabel,guildLogoUrl};
  });
  const updated=await accountRef.get();if(updated.exists)await Promise.all([publish(uid,updated.data()),syncWorldBossVisibility(uid,updated.data())]);return membership;
}
async function leaveClass(uid) {
  const accountRef = accounts.doc(uid);
  let activeTrialId = '';
  let classId = '';
  const data = await adminDb.runTransaction(async (tx) => {
    const accountSnap = await tx.get(accountRef);
    if (!accountSnap.exists) throw apiError(404, 'PROFILE_NOT_FOUND', '용사 기록을 찾지 못했어요.');
    const current = accountSnap.data();
    classId = text(current.activeClassId, 128);
    if (!classId) throw apiError(409, 'GUILD_NOT_JOINED', '현재 참여 중인 길드가 없어요.');
    const classRef = classes.doc(classId);
    const classSnap = await tx.get(classRef);
    activeTrialId = text(classSnap.data()?.activeTrialId, 128);
    tx.delete(classRef.collection('members').doc(uid));
    const classIds = (Array.isArray(current.classIds) ? current.classIds : []).filter((id) => id !== classId);
    tx.update(accountRef, { classIds, activeClassId: FieldValue.delete(), activeGuildName: FieldValue.delete(), activeGuildLogoUrl: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() });
    const next = { ...current, classIds };
    delete next.activeClassId;
    delete next.activeGuildName;
    delete next.activeGuildLogoUrl;
    return next;
  });
  if (activeTrialId) {
    const trialRef = classes.doc(classId).collection('trials').doc(activeTrialId);
    await Promise.all([
      trialRef.collection('progress').doc(uid).delete().catch(() => {}),
      trialRef.collection('completions').doc(uid).delete().catch(() => {})
    ]);
  }
  await Promise.all([publish(uid, data), syncWorldBossVisibility(uid, data)]);
  return publicAccount(data);
}
function legacyIds(c) { const school=text(c.schoolName,120), grade=safeInt(c.grade,0,3,6), room=safeInt(c.classNum,0,1,99), number=safeInt(c.studentNum,0,1,99), name=text(c.name,30);if(!school||!grade||!room||!number||!name)throw apiError(400,'INVALID_LEGACY_INFO','기존 계정 정보를 모두 입력해 주세요.');const suffix=`${grade}_${room}_${number}_${name}`;return [`${school}_${suffix}`,`Unknown_${suffix}`]; }
function legacyGuardRef(ids) {
  // 학교명 철자를 바꿔도 동일 학생 식별 조합의 잠금을 우회할 수 없도록 안정 키를 쓴다.
  return legacyRecoveryGuards.doc(hash(ids[ids.length - 1]));
}
function legacyCredentialError() {
  return apiError(401, 'LEGACY_CREDENTIALS_INVALID', '기존 게임 기록 또는 PIN 번호를 확인해 주세요.');
}
function legacyLockedError() {
  return apiError(429, 'LEGACY_RECOVERY_LOCKED', '기존 기록 확인 시도가 많아 잠시 보호 중이에요. 잠시 후 다시 시도해 주세요.');
}
function legacyGuardState(value, now = Date.now()) {
  const shortStartedRaw = value?.shortWindowStartedAt?.toMillis?.();
  const dailyStartedRaw = value?.dailyWindowStartedAt?.toMillis?.();
  const shortStartedAt = Number.isFinite(shortStartedRaw) && shortStartedRaw <= now && now - shortStartedRaw < LEGACY_GUARD_SHORT_WINDOW_MS ? shortStartedRaw : now;
  const dailyStartedAt = Number.isFinite(dailyStartedRaw) && dailyStartedRaw <= now && now - dailyStartedRaw < LEGACY_GUARD_DAILY_WINDOW_MS ? dailyStartedRaw : now;
  return {
    shortStartedAt,
    dailyStartedAt,
    shortFailures: shortStartedAt === shortStartedRaw ? safeInt(value?.shortFailures, 0, 0, LEGACY_GUARD_SHORT_MAX) : 0,
    dailyFailures: dailyStartedAt === dailyStartedRaw ? safeInt(value?.dailyFailures, 0, 0, LEGACY_GUARD_DAILY_MAX) : 0,
    lockedUntil: value?.lockedUntil?.toMillis?.() || 0
  };
}
function failedLegacyGuard(value, now = Date.now()) {
  const state = legacyGuardState(value, now);
  const shortFailures = state.shortFailures + 1;
  const dailyFailures = state.dailyFailures + 1;
  let lockedUntil = state.lockedUntil > now ? state.lockedUntil : 0;
  if (shortFailures >= LEGACY_GUARD_SHORT_MAX) lockedUntil = Math.max(lockedUntil, state.shortStartedAt + LEGACY_GUARD_SHORT_WINDOW_MS);
  if (dailyFailures >= LEGACY_GUARD_DAILY_MAX) lockedUntil = Math.max(lockedUntil, state.dailyStartedAt + LEGACY_GUARD_DAILY_WINDOW_MS);
  return {
    shortWindowStartedAt: Timestamp.fromMillis(state.shortStartedAt),
    dailyWindowStartedAt: Timestamp.fromMillis(state.dailyStartedAt),
    shortFailures,
    dailyFailures,
    lockedUntil: lockedUntil ? Timestamp.fromMillis(lockedUntil) : null,
    updatedAt: FieldValue.serverTimestamp()
  };
}
function legacyGuardIsLocked(value, now = Date.now()) {
  return legacyGuardState(value, now).lockedUntil > now;
}
const KST_OFFSET_MS=9*60*60*1000, WEEK_MS=7*24*60*60*1000, EPOCH_MONDAY_MS=Date.UTC(2024,6,1);
function currentBossWeek(now=Date.now()){const kst=new Date(now+KST_OFFSET_MS);const midnight=Date.UTC(kst.getUTCFullYear(),kst.getUTCMonth(),kst.getUTCDate());const monday=midnight-((new Date(midnight).getUTCDay()+6)%7)*24*60*60*1000;return Math.floor((monday-EPOCH_MONDAY_MS)/WEEK_MS);}
function legacyBossKey(credentials){const grade=safeInt(credentials?.grade,0,3,6),room=safeInt(credentials?.classNum,0,1,99),number=safeInt(credentials?.studentNum,0,1,99),name=text(credentials?.name,30);return grade&&room&&number&&name?`${grade}_${room}_${number}_${name}`:null;}
async function transferCurrentBossRecord({toUid,fromUid='',credentials,nickname,publicLeaderboard}){const key=legacyBossKey(credentials),ref=adminDb.collection('world_bosses').doc(`global_week_${currentBossWeek()}`),targetRef=ref.collection('contributions').doc(toUid),sourceRef=fromUid&&fromUid!==toUid?ref.collection('contributions').doc(fromUid):null;await adminDb.runTransaction(async tx=>{const reads=[tx.get(ref),tx.get(targetRef)];if(sourceRef)reads.push(tx.get(sourceRef));const [bossSnap,targetSnap,sourceSnap]=await Promise.all(reads);if(!bossSnap.exists)return;const boss=bossSnap.data()||{},target=targetSnap.data()||{},source=sourceSnap?.data()||{};const legacyDamage=key?safeInt(boss.damages?.[key],0,0,100000000000):0;const importedLegacy=target.legacyImported||source.legacyImported?0:legacyDamage;const damage=safeInt(target.damage,0,0)+safeInt(source.damage,0,0)+importedLegacy;if(!damage)return;const legacyDay=key&&typeof boss.lastPlayedDates?.[key]==='string'?boss.lastPlayedDates[key]:null;tx.set(targetRef,{damage,lastPlayedKstDay:target.lastPlayedKstDay||source.lastPlayedKstDay||legacyDay||null,publicLeaderboard:Boolean(publicLeaderboard),publicNickname:publicLeaderboard?nickname:null,legacyImported:Boolean(target.legacyImported||source.legacyImported||legacyDamage),updatedAt:FieldValue.serverTimestamp()},{merge:true});if(sourceRef)tx.delete(sourceRef);});}function legacyState(data) { let extra={};try{extra=typeof data.extraData==='string'?JSON.parse(data.extraData||'{}'):(data.extraData||{});}catch{}return {...defaultState(),...cleanState({...data,...extra})}; }
async function migrateGoogleLegacy(uid, body) {
  const nickname=normalizeNickname(body.nickname),requestedGrade=safeInt(body.learningGrade,4,3,6),ref=accounts.doc(uid);
  const matches=await legacyUsers.where('linkedGoogleUid','==',uid).limit(2).get();
  if(matches.empty)throw apiError(404,'LEGACY_GOOGLE_NOT_FOUND','이 Google 계정에 연결된 기존 게임 기록을 찾지 못했어요.');
  if(matches.size!==1)throw apiError(409,'LEGACY_GOOGLE_AMBIGUOUS','기존 Google 연동 기록이 여러 개예요. 기존 기록 입력 방식을 이용해 주세요.');
  const legacyRef=matches.docs[0].ref;
  const data=await adminDb.runTransaction(async tx=>{const [now,legacySnap]=await Promise.all([tx.get(ref),tx.get(legacyRef)]);if(now.data()?.legacyMigratedAt||now.data()?.legacyGoogleMigratedAt)throw apiError(409,'ALREADY_MIGRATED','이 새 계정은 이미 기존 기록을 가져왔어요.');if(!legacySnap.exists)throw apiError(404,'LEGACY_NOT_FOUND','기존 게임 기록을 찾지 못했어요.');const old=legacySnap.data(),grade=legacyLearningGrade(old,requestedGrade);if(old.linkedGoogleUid!==uid)throw apiError(403,'LEGACY_GOOGLE_MISMATCH','기존 Google 연결 정보가 일치하지 않아요.');if(old.migratedTo&&old.migratedTo!==uid)throw apiError(409,'LEGACY_ALREADY_MOVED','이 기존 기록은 이미 새 계정으로 옮겨졌어요.');const next={schemaVersion:2,role:'student',nickname,learningGrade:grade,state:legacyState(old),progressGuard:newProgressGuard(),freeNicknameChangeUsed:false,renameCount:0,leaderboardOptIn:Boolean(body.leaderboardOptIn),classIds:[],legacyGoogleLinked:Boolean(old.linkedGoogleUid),legacyGoogleMigratedAt:FieldValue.serverTimestamp(),googleLinkedAt:FieldValue.serverTimestamp(),legacyPinRecoveryDisabledAt:FieldValue.serverTimestamp(),googleLinkPendingAt:FieldValue.delete(),createdAt:now.data()?.createdAt||FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()};tx.set(ref,next,{merge:true});tx.update(legacyRef,{migratedTo:uid,migratedAt:FieldValue.serverTimestamp(),googleLinkedAt:FieldValue.serverTimestamp()});return next;});await publish(uid,data);return publicAccount(data);
}
async function migrate(uid, body) {
  const pin=text(body.pin,12);if(!/^\d{4}$/.test(pin))throw apiError(400,'INVALID_PIN','기존 4자리 PIN 번호를 입력해 주세요.');
  const credentials=body.credentials||{},ids=legacyIds(credentials),nickname=normalizeNickname(body.nickname),requestedGrade=safeInt(body.learningGrade,4,3,6),ref=accounts.doc(uid);
  const guardRef=legacyGuardRef(ids),attemptedAt=Date.now();
  const outcome=await adminDb.runTransaction(async tx=>{
    const candidates=ids.map(id=>legacyUsers.doc(id));
    const [now,guardSnap,...legacySnaps]=await Promise.all([tx.get(ref),tx.get(guardRef),...candidates.map(candidate=>tx.get(candidate))]);
    if(now.data()?.legacyMigratedAt||now.data()?.legacyGoogleMigratedAt)throw apiError(409,'ALREADY_MIGRATED','이 새 계정은 이미 기존 기록을 가져왔어요.');
    const guard=guardSnap.data()||{};
    if(legacyGuardIsLocked(guard,attemptedAt))return {kind:'locked'};
    const index=legacySnaps.findIndex(snap=>snap.exists),legacySnap=index>=0?legacySnaps[index]:null,legacyRef=index>=0?candidates[index]:null;
    if(!legacySnap||String(legacySnap.data()?.password||'')!==pin){const failed=failedLegacyGuard(guard,attemptedAt);tx.set(guardRef,failed,{merge:true});return {kind:failed.lockedUntil?'locked':'credentials'};}
    const old=legacySnap.data(),grade=legacyLearningGrade(old,safeInt(credentials.grade,requestedGrade,3,6));
    if(old.migratedTo&&old.migratedTo!==uid)throw apiError(409,'LEGACY_ALREADY_MOVED','이 기존 기록은 이미 새 계정으로 옮겨졌어요. “이전 계정 로그인(구글 연동 오류로 다시 접속)”을 이용해 주세요.');
    const next={schemaVersion:2,role:'student',nickname,learningGrade:grade,state:legacyState(old),progressGuard:newProgressGuard(attemptedAt),freeNicknameChangeUsed:false,renameCount:0,leaderboardOptIn:Boolean(body.leaderboardOptIn),classIds:[],legacyGoogleLinked:Boolean(old.linkedGoogleUid),legacyMigratedAt:FieldValue.serverTimestamp(),createdAt:now.data()?.createdAt||FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()};
    tx.set(ref,next,{merge:true});tx.update(legacyRef,{migratedTo:uid,migratedAt:FieldValue.serverTimestamp()});tx.delete(guardRef);return {data:next};
  });
  if(outcome.kind==='locked')throw legacyLockedError();
  if(outcome.kind==='credentials')throw legacyCredentialError();
  const data=outcome.data;
  await Promise.all([publish(uid,data),transferCurrentBossRecord({toUid:uid,credentials,nickname:data.nickname,publicLeaderboard:data.leaderboardOptIn})]);return publicAccount(data);
}
async function transferGuildMemberships(classIds, fromUid, toUid, accountData) {
  await Promise.all(classIds.slice(0, 100).map(async (id) => {
    const members = classes.doc(id).collection('members');
    const sourceRef = members.doc(fromUid);
    const targetRef = members.doc(toUid);
    await adminDb.runTransaction(async (tx) => {
      const [source, target] = await Promise.all([tx.get(sourceRef), tx.get(targetRef)]);
      const preserved = source.exists ? source.data() : (target.exists ? target.data() : { joinedAt: FieldValue.serverTimestamp() });
      tx.set(targetRef, { ...preserved, nickname: accountData.nickname, learningGrade: accountData.learningGrade, transferredAt: FieldValue.serverTimestamp() }, { merge: true });
      tx.delete(sourceRef);
    });
  }));
}
async function authUserOrNull(uid) {
  try {
    return await adminAuth.getUser(uid);
  } catch (error) {
    if (error?.code === 'auth/user-not-found') return null;
    throw error;
  }
}
function hasGoogleProvider(user) {
  return Boolean(user?.providerData?.some((provider) => provider?.providerId === 'google.com'));
}
function hasFreshGoogleLinkPending(data, now = Date.now()) {
  const value = data?.googleLinkPendingAt;
  const createdAt = typeof value?.toMillis === 'function' ? value.toMillis() : 0;
  return createdAt > now - GOOGLE_LINK_PENDING_MS;
}
function googleProtectedError() {
  return apiError(409, 'GOOGLE_ACCOUNT_PROTECTED', '이 영웅은 Google 계정으로 보호되고 있어요. 처음 화면의 “이어하기”에서 해당 Google 계정으로 로그인해 주세요.');
}
async function prepareGoogleLink(uid) {
  const [authUser, accountSnap] = await Promise.all([authUserOrNull(uid), accounts.doc(uid).get()]);
  if (!accountSnap.exists) throw apiError(404, 'ACCOUNT_NOT_FOUND', '먼저 용사를 만들거나 기존 진행 상황을 불러와 주세요.');
  if (!authUser || hasGoogleProvider(authUser)) throw apiError(409, 'GOOGLE_LINK_STATE_CHANGED', 'Google 연결 상태가 변경됐어요. 페이지를 새로고침한 뒤 다시 시도해 주세요.');
  await accountSnap.ref.update({ googleLinkPendingAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  return { prepared: true };
}
async function markGoogleLinked(uid) {
  const authUser = await authUserOrNull(uid);
  if (!hasGoogleProvider(authUser)) throw apiError(409, 'GOOGLE_LINK_NOT_CONFIRMED', 'Google 연결을 확인하지 못했어요. 페이지를 새로고침한 뒤 다시 시도해 주세요.');
  await accounts.doc(uid).update({ googleLinkedAt: FieldValue.serverTimestamp(), legacyPinRecoveryDisabledAt: FieldValue.serverTimestamp(), googleLinkPendingAt: FieldValue.delete(), googleUnlinkedAt: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() });
  return { linked: true };
}
async function markGoogleUnlinked(uid) {
  const authUser = await authUserOrNull(uid);
  if (!authUser) throw apiError(401, 'ACCOUNT_SESSION_MISSING', '현재 계정의 로그인 상태를 확인하지 못했어요. 다시 로그인해 주세요.');
  if (hasGoogleProvider(authUser)) throw apiError(409, 'GOOGLE_STILL_LINKED', 'Google 연결이 아직 유지되고 있어요. 잠시 후 다시 시도해 주세요.');
  await accounts.doc(uid).update({ googleLinkPendingAt: FieldValue.delete(), googleUnlinkedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  return { linked: false };
}
function recoveryCredentialsFromLegacyDoc(doc) {
  const data = doc?.data?.() || {};
  const direct = { grade: data.grade, classNum: data.classNum, studentNum: data.studentNum, name: data.name };
  if (legacyBossKey(direct)) return direct;
  const parts = String(doc?.id || '').split('_');
  if (parts.length < 4) return {};
  return { grade: parts.at(-4), classNum: parts.at(-3), studentNum: parts.at(-2), name: parts.at(-1) };
}
async function finalizeLegacyRecovery(uid, data, credentials = null) {
  if (data?.legacyRecoveryStatus !== 'pending') return data;
  const sourceUid = text(data.legacyRecoverySourceUid, 128);
  if (!sourceUid || sourceUid === uid) throw apiError(409, 'RECOVERY_STATE_INVALID', '이전 계정 복구 상태를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.');
  let bossCredentials = credentials;
  if (!legacyBossKey(bossCredentials)) {
    const legacyMatches = await legacyUsers.where('migratedTo', '==', uid).limit(2).get();
    if (legacyMatches.size === 1) bossCredentials = recoveryCredentialsFromLegacyDoc(legacyMatches.docs[0]);
  }
  const classIds = Array.isArray(data.classIds) ? data.classIds.slice(0, 100) : [];
  await transferGuildMemberships(classIds, sourceUid, uid, data);
  await Promise.all([
    publish(uid, data),
    leaderboard.doc(sourceUid).delete(),
    transferCurrentBossRecord({ toUid: uid, fromUid: sourceUid, credentials: bossCredentials, nickname: data.nickname, publicLeaderboard: data.leaderboardOptIn })
  ]);
  const targetRef = accounts.doc(uid);
  await adminDb.runTransaction(async (tx) => {
    const target = await tx.get(targetRef);
    if (!target.exists) throw apiError(404, 'RECOVERY_TARGET_MISSING', '복구한 계정을 찾지 못했어요. 잠시 후 다시 시도해 주세요.');
    const current = target.data() || {};
    if (current.legacyRecoveryStatus !== 'pending') return;
    if (text(current.legacyRecoverySourceUid, 128) !== sourceUid) throw apiError(409, 'RECOVERY_STATE_CHANGED', '계정 복구 상태가 변경됐어요. 페이지를 새로고침해 주세요.');
    tx.update(targetRef, { legacyRecoveryStatus: 'complete', legacyRecoverySourceUid: FieldValue.delete(), legacyRecoveryCompletedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  });
  return data;
}
async function recoverMigratedLegacy(uid, body) {
  const pin=text(body.pin,12);if(!/^\d{4}$/.test(pin))throw apiError(400,'INVALID_PIN','기존 4자리 PIN 번호를 입력해 주세요.');
  const credentials=body.credentials||{},ids=legacyIds(credentials),targetRef=accounts.doc(uid),guardRef=legacyGuardRef(ids),attemptedAt=Date.now();
  const [preliminaryTarget, ...preliminaryLegacySnaps] = await Promise.all([targetRef.get(), ...ids.map((id) => legacyUsers.doc(id).get())]);
  const preliminaryLegacy = preliminaryLegacySnaps.find((snap) => snap.exists && String(snap.data()?.password || '') === pin);
  const resumingPendingRecovery = preliminaryTarget.exists && preliminaryTarget.data()?.legacyRecoveryStatus === 'pending';
  const preliminarySourceUid = resumingPendingRecovery ? '' : text(preliminaryLegacy?.data()?.migratedTo, 128);
  if (preliminarySourceUid && preliminarySourceUid !== uid) {
    const sourceAuth = await authUserOrNull(preliminarySourceUid);
    if (hasGoogleProvider(sourceAuth)) throw googleProtectedError();
  }
  const outcome=await adminDb.runTransaction(async tx=>{
    const candidates=ids.map(id=>legacyUsers.doc(id));
    const [target,guardSnap,...legacySnaps]=await Promise.all([tx.get(targetRef),tx.get(guardRef),...candidates.map(candidate=>tx.get(candidate))]);
    const guard=guardSnap.data()||{};
    if(legacyGuardIsLocked(guard,attemptedAt))return {kind:'locked'};
    const index=legacySnaps.findIndex(snap=>snap.exists),legacySnap=index>=0?legacySnaps[index]:null,legacyRef=index>=0?candidates[index]:null;
    if(!legacySnap||String(legacySnap.data()?.password||'')!==pin){const failed=failedLegacyGuard(guard,attemptedAt);tx.set(guardRef,failed,{merge:true});return {kind:failed.lockedUntil?'locked':'credentials'};}
    const old=legacySnap.data(),sourceUid=text(old.migratedTo,128);
    if(target.exists){const current=target.data()||{},pendingSourceUid=text(current.legacyRecoverySourceUid,128);if(current.legacyRecoveryStatus!=='pending'||!pendingSourceUid||sourceUid!==uid)throw apiError(409,'RECOVERY_TARGET_EXISTS','현재 계정에 이미 학습 기록이 있어 복구할 수 없어요. 처음 화면에서 새로 시작해 주세요.');tx.delete(guardRef);return {data:current,sourceUid:pendingSourceUid,resumed:true};}
    if(!sourceUid||sourceUid===uid)throw apiError(409,'RECOVERY_NOT_NEEDED','복구할 이전 계정을 찾지 못했어요. 기존 기록 가져오기를 이용해 주세요.');
    const sourceRef=accounts.doc(sourceUid),sourceSnap=await tx.get(sourceRef);
    if(!sourceSnap.exists)throw apiError(404,'RECOVERY_SOURCE_NOT_FOUND','이전한 계정의 학습 기록을 찾지 못했어요.');
    if(sourceSnap.data()?.legacyPinRecoveryDisabledAt||sourceSnap.data()?.googleLinkedAt||hasFreshGoogleLinkPending(sourceSnap.data(),attemptedAt))throw googleProtectedError();
    const next={...sourceSnap.data(),progressGuard:sourceSnap.data().progressGuard||newProgressGuard(attemptedAt),learningGrade:legacyLearningGrade(old,sourceSnap.data().learningGrade),legacyRecoveryStatus:'pending',legacyRecoverySourceUid:sourceUid,recoveredAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()};
    tx.create(targetRef,next);tx.delete(sourceRef);tx.update(legacyRef,{migratedTo:uid,recoveredAt:FieldValue.serverTimestamp()});tx.delete(guardRef);return {data:next,sourceUid};
  });
  if(outcome.kind==='locked')throw legacyLockedError();
  if(outcome.kind==='credentials')throw legacyCredentialError();
  const {data}=outcome;
  await finalizeLegacyRecovery(uid,data,credentials);
  return publicAccount((await targetRef.get()).data()||data);
}
async function claimGoogleLink(targetUid, body) {
  const sourceUid=text(body.sourceUid,128),sourceToken=text(body.sourceToken,8192);
  if(!sourceUid||!sourceToken||sourceUid===targetUid)throw apiError(400,'INVALID_GOOGLE_CLAIM','연결할 기존 게임 기록을 확인하지 못했어요.');
  let verified;
  try{verified=await adminAuth.verifyIdToken(sourceToken,true);}catch{throw apiError(401,'INVALID_SOURCE_SESSION','기존 게임 기록의 본인 확인이 만료됐어요. 다시 시도해 주세요.');}
  if(verified.uid!==sourceUid||verified.firebase?.sign_in_provider!=='anonymous')throw apiError(403,'SOURCE_ACCOUNT_MISMATCH','현재 기기의 게스트 게임 기록만 Google 계정으로 옮길 수 있어요.');
  const sourceRef=accounts.doc(sourceUid),targetRef=accounts.doc(targetUid);
  const data=await adminDb.runTransaction(async tx=>{const [sourceSnap,targetSnap]=await Promise.all([tx.get(sourceRef),tx.get(targetRef)]);if(!sourceSnap.exists)throw apiError(404,'SOURCE_ACCOUNT_NOT_FOUND','옮길 게임 기록을 찾지 못했어요.');if(targetSnap.exists)throw apiError(409,'GOOGLE_ACCOUNT_IN_USE','이 Google 계정에는 이미 다른 게임 기록이 있어요.');const next={...sourceSnap.data(),googleLinkedAt:FieldValue.serverTimestamp(),legacyPinRecoveryDisabledAt:FieldValue.serverTimestamp(),googleLinkPendingAt:FieldValue.delete(),googleUnlinkedAt:FieldValue.delete(),updatedAt:FieldValue.serverTimestamp()};tx.create(targetRef,next);tx.delete(sourceRef);return next;});
  const classIds=Array.isArray(data.classIds)?data.classIds.slice(0,100):[];
  await transferGuildMemberships(classIds,sourceUid,targetUid,data);
  const movedLegacy=await legacyUsers.where('migratedTo','==',sourceUid).limit(5).get();
  await Promise.all(movedLegacy.docs.map(doc=>doc.ref.update({migratedTo:targetUid,googleLinkedAt:FieldValue.serverTimestamp()})));
  await Promise.all([publish(targetUid,data),leaderboard.doc(sourceUid).delete(),transferCurrentBossRecord({toUid:targetUid,fromUid:sourceUid,nickname:data.nickname,publicLeaderboard:data.leaderboardOptIn})]);
  return publicAccount(data);
}
async function forEachQueryPage(baseQuery, visit) {
  let cursor = null;
  while (true) {
    let query = baseQuery.limit(DELETE_PAGE_SIZE);
    if (cursor) query = query.startAfter(cursor);
    const page = await query.get();
    if (page.empty) return;
    for (const doc of page.docs) await visit(doc);
    if (page.size < DELETE_PAGE_SIZE) return;
    cursor = page.docs[page.docs.length - 1];
  }
}
async function erase(uid) {
  const writer = adminDb.bulkWriter();
  const writeFailures = [];
  writer.onWriteError((error) => error.failedAttempts < 3);
  const queueDelete = (ref) => { writer.delete(ref).catch((error) => writeFailures.push(error)); };
  let scanError = null;
  try {
    await forEachQueryPage(classes.select(), async (classSnap) => {
      queueDelete(classSnap.ref.collection('members').doc(uid));
      queueDelete(classSnap.ref.collection('effectInvestments').doc(uid));
      await forEachQueryPage(classSnap.ref.collection('trials').select(), async (trialSnap) => {
        queueDelete(trialSnap.ref.collection('progress').doc(uid));
        queueDelete(trialSnap.ref.collection('completions').doc(uid));
      });
    });
    await forEachQueryPage(adminDb.collection('world_bosses').select(), async (bossSnap) => {
      queueDelete(bossSnap.ref.collection('contributions').doc(uid));
      queueDelete(bossSnap.ref.collection('rewardClaims').doc(uid));
    });
    await forEachQueryPage(adminDb.collection('worldBossSessions').where('uid', '==', uid).select(), async (sessionSnap) => queueDelete(sessionSnap.ref));
    await forEachQueryPage(legacyUsers.where('migratedTo', '==', uid).select(), async (legacySnap) => queueDelete(legacySnap.ref));
  } catch (error) {
    scanError = error;
  }
  await writer.close();
  if (scanError) throw scanError;
  if (writeFailures.length) throw writeFailures[0];
  await Promise.all([accounts.doc(uid).delete(), leaderboard.doc(uid).delete()]);
  const teacherSnap = await teachers.doc(uid).get();
  if (!teacherSnap.exists) {
    try {
      await adminAuth.deleteUser(uid);
    } catch (error) {
      if (error?.code !== 'auth/user-not-found') throw error;
    }
  }
}
export default async function handler(req,res){try{requireMethod(req,['POST']);const user=await requireUser(req);const body=await readBody(req);let response;if(body.action==='load')response={account:await loadAccount(user.uid)};else if(body.action==='loadAssignedWordPack')response={assignment:await assignedWordPack(user.uid)};else if(body.action==='create')response={account:await create(user.uid,body)};else if(body.action==='save')response={account:await save(user.uid,body)};else if(body.action==='rename')response=await rename(user.uid,body);else if(body.action==='previewGuildInvite')response={guild:await previewGuildInvite(user.uid,body)};else if(body.action==='joinClass')response={membership:await joinClass(user.uid,body)};else if(body.action==='leaveClass')response={account:await leaveClass(user.uid)};else if(body.action==='loadGuildTrial')response={guild:await loadGuildTrial(user.uid)};else if(body.action==='loadGuildOverview')response={guild:await loadGuildOverview(user.uid)};else if(body.action==='loadGuildRankings')response={rankings:await guildLeaderboard()};else if(body.action==='investGuildEffect')response=await investGuildEffect(user.uid,body);else if(body.action==='updateGuildSkin')response=await updateGuildSkin(user.uid,body);else if(body.action==='guildWordPackPreview')response={wordPack:await guildWordPackPreview(user.uid,body)};else if(body.action==='guildTrialEvent')response={progress:await guildTrialEvent(user.uid,body)};else if(body.action==='completeGuildTrial')response={completion:await completeGuildTrial(user.uid,body)};else if(body.action==='migrateLegacy')response={account:await migrate(user.uid,body)};else if(body.action==='recoverMigratedLegacy')response={account:await recoverMigratedLegacy(user.uid,body)};else if(body.action==='migrateLegacyGoogle'){if(user.firebase?.sign_in_provider!=='google.com')throw apiError(403,'GOOGLE_REQUIRED','이전에 연결한 Google 계정으로 먼저 로그인해 주세요.');response={account:await migrateGoogleLegacy(user.uid,body)};}else if(body.action==='prepareGoogleLink')response=await prepareGoogleLink(user.uid);else if(body.action==='markGoogleLinked')response=await markGoogleLinked(user.uid);else if(body.action==='markGoogleUnlinked')response=await markGoogleUnlinked(user.uid);else if(body.action==='claimGoogleLink'){if(user.firebase?.sign_in_provider!=='google.com')throw apiError(403,'GOOGLE_REQUIRED','Google 계정으로 본인 확인 후 연결해 주세요.');response={account:await claimGoogleLink(user.uid,body)};}else if(body.action==='delete'){await erase(user.uid);response={deleted:true};}else throw apiError(400,'UNKNOWN_ACTION','알 수 없는 요청입니다.');sendJson(res,200,{ok:true,...response});}catch(error){handleApiError(res,error);}}
