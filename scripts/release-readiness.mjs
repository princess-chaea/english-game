import { access, readFile } from 'node:fs/promises';

const requiredEnvironment = [
  { label: 'FIREBASE_PROJECT_ID/project_id', names: ['FIREBASE_PROJECT_ID', 'project_id'] },
  { label: 'FIREBASE_CLIENT_EMAIL/client_email', names: ['FIREBASE_CLIENT_EMAIL', 'client_email'] },
  { label: 'FIREBASE_PRIVATE_KEY/private_key', names: ['FIREBASE_PRIVATE_KEY', 'private_key'] },
  { label: 'CRON_SECRET', names: ['CRON_SECRET'] },
  { label: 'TEACHER_REVIEWER_EMAILS', names: ['TEACHER_REVIEWER_EMAILS'] }
];
const missing = requiredEnvironment.filter((entry) => !entry.names.some((name) => process.env[name])).map((entry) => entry.label);
const guildSkinFiles = ['azure','sakura','neon','lion','crimson','frost','inventor','moon','starlight','dragon','clockwork','cloud','deepsea','candy','dino','rhythm','origami','comet','scarab','lantern','skypirate','mushroom','volcanic','mecha','chess','galaxywhale','phoenix','leviathan','chronomancer','prismatic','mirror','dreamlibrary','glaciertrain','constellation','coral','jungle','aurora','toybox','cosmicchef','camera','gravity','crystalsinger','thundercloud','fourseasons','glassknight','starpost','detective','festival','observatory','runegarden','seastar','ballerina','dragonfruit','moonexplorer','rainbowrider'].map((name) => `media/player/guild_skin_${name}.webp`);
const files = ['firebase.json', 'firestore.rules', 'firestore.indexes.json', 'storage.rules', 'vercel.json', 'privacy.html', 'package-lock.json', 'data/word-packs.json', 'data/word-packs.js', 'data/curriculum-3000-markers.json', 'data/curriculum-3000-with-meanings.json', 'data/CREDITS.md', 'data/curriculum-3000-review-catalog.json', 'docs/promotion/captures/teacher-member-adaptive-path-actual.png', 'media/guild/dimensional-summon-banner.webp', 'media/guild/guild-shop-items.webp', 'media/guild/guild-effects.webp', ...Array.from({ length: 5 }, (_, index) => `media/test/test${index + 1}.webp`), ...guildSkinFiles];
for (const file of files) await access(file);
const firebase = JSON.parse(await readFile('firebase.json', 'utf8'));
const vercel = JSON.parse(await readFile('vercel.json', 'utf8'));
const [firestoreRules, storageRules, privacy, indexHtml, secureAccount, mainJs, studentApi, teacherApi, worldBossApi, cleanupApi, skillSystem, skillRework, wordPackText, wordPackJsText, teacherQuickGuide, teacherManual] = await Promise.all([
  readFile('firestore.rules', 'utf8'),
  readFile('storage.rules', 'utf8'),
  readFile('privacy.html', 'utf8'),
  readFile('index.html', 'utf8'),
  readFile('js/secure-account.js', 'utf8'),
  readFile('js/main.js', 'utf8'),
  readFile('api/student.js', 'utf8'),
  readFile('api/teacher.js', 'utf8'),
  readFile('api/world-boss.js', 'utf8'),
  readFile('api/cleanup-legacy.js', 'utf8'),
  readFile('js/skill-system.js', 'utf8'),
  readFile('js/skill-rework.js', 'utf8'),
  readFile('data/word-packs.json', 'utf8'),
  readFile('data/word-packs.js', 'utf8'),
  readFile('docs/promotion/teacher-quick-guide-detailed.html', 'utf8'),
  readFile('docs/promotion/teacher-manual.md', 'utf8')
]);
const wordPackCatalog = JSON.parse(wordPackText);
const normalizedWordPackJsText = wordPackJsText.replace(/\r\n/g, '\n');
if (normalizedWordPackJsText !== `export default ${JSON.stringify(wordPackCatalog)};\n`) throw new Error('word-packs.json and word-packs.js must remain exact runtime mirrors.');
if (wordPackCatalog.words?.length !== 3001) throw new Error('Curriculum vocabulary catalog must preserve all 3,001 extracted headwords.');
if (wordPackCatalog.words.some((entry) => !entry.word || !entry.meaning || !Number.isInteger(entry.spiralRank))) throw new Error('Curriculum words require a meaning and spiral rank.');
const spiralPacks = (wordPackCatalog.packs || []).filter((pack) => pack.kind === 'curriculum-spiral');
if (spiralPacks.length !== 30) throw new Error('Curriculum spiral catalog must contain Grade 3-12 low/mid/high packs.');
let previousSpiralWordCount = 0;
for (let grade = 3; grade <= 12; grade += 1) {
  const levels = ['low', 'mid', 'high'].map((level) => spiralPacks.find((pack) => pack.id === `grade-${grade}-${level}`));
  if (levels.some((pack) => !pack)) throw new Error(`Curriculum spiral packs are incomplete for grade ${grade}.`);
  if (!(levels[0].wordCount < levels[1].wordCount && levels[1].wordCount < levels[2].wordCount)) throw new Error(`Curriculum levels are not cumulative for grade ${grade}.`);
  if (!levels[0].wordKeys.every((word, index) => levels[1].wordKeys[index] === word) || !levels[1].wordKeys.every((word, index) => levels[2].wordKeys[index] === word)) throw new Error(`Curriculum pack prefixes are not inclusive for grade ${grade}.`);
  for (const pack of levels) {
    if (Number(pack.supportWordCount) !== previousSpiralWordCount) throw new Error(`Curriculum support range is incorrect for ${pack.id}.`);
    previousSpiralWordCount = Number(pack.wordCount);
  }
}
if (spiralPacks.find((pack) => pack.id === 'grade-6-high')?.wordCount !== 600 || spiralPacks.find((pack) => pack.id === 'grade-9-high')?.wordCount !== 1500 || spiralPacks.find((pack) => pack.id === 'grade-10-high')?.wordCount !== 1800 || spiralPacks.find((pack) => pack.id === 'grade-12-high')?.wordCount !== 3001) throw new Error('Curriculum endpoint counts are incorrect.');
const assignedPackLoadStart = mainJs.indexOf('async function loadAssignedWordPacks()');
const assignedPackLoadEnd = mainJs.indexOf('async function fetchWordsFromSpreadsheet()', assignedPackLoadStart);
const assignedPackLoadBlock = assignedPackLoadStart >= 0 && assignedPackLoadEnd > assignedPackLoadStart ? mainJs.slice(assignedPackLoadStart, assignedPackLoadEnd) : '';
if (
  !assignedPackLoadBlock.includes('gameState.assignedWordPackIds.find(Boolean)')
  || !assignedPackLoadBlock.includes('let ids = [assignedPackId ||')
  || /assignedWordPackIds\s*\.\s*filter\s*\(/.test(assignedPackLoadBlock)
  || /\bids\s*=\s*(?:gameState\.)?assignedWordPackIds\b/.test(assignedPackLoadBlock)
  || /\bids\.(?:push|unshift|splice|concat)\s*\(/.test(assignedPackLoadBlock)
  || /\bids\s*=\s*\[\s*\.\.\./.test(assignedPackLoadBlock)
) throw new Error('The game must load exactly one assigned cumulative word pack instead of merging legacy assignedWordPackIds.');
if (!mainJs.includes('const activePackLabel = gameState.activeWordPackLabel ||') || !mainJs.includes('`현재 학습팩 · ${activePackLabel}`')) throw new Error('The game badge must show the actual active word-pack label.');
const quizDistractorStart = mainJs.indexOf('function quizDistractors(field, correct)');
const quizDistractorEnd = mainJs.indexOf('function ensureQuizTypeLabel', quizDistractorStart);
const quizDistractorBlock = quizDistractorStart >= 0 && quizDistractorEnd > quizDistractorStart ? mainJs.slice(quizDistractorStart, quizDistractorEnd) : '';
const packDistractorAt = quizDistractorBlock.indexOf('(gameState.wordsPool || []).forEach(add);');
const mockFallbackAt = quizDistractorBlock.indexOf('if (values.length < 3) Object.values(MOCK_WORDS).flat().forEach(add);');
if (packDistractorAt < 0 || mockFallbackAt <= packDistractorAt) throw new Error('Quiz choices must prefer the active pack and use MOCK_WORDS only when fewer than three distractors exist.');
if (!mainJs.includes('function selectAdaptiveQuizIndex(') || !mainJs.includes('gameState.activeWordPackSupportCount') || !mainJs.includes('supportMode')) throw new Error('Adaptive wrong-answer and previous-stage routing is missing.');
const adaptivePolicy = wordPackCatalog.adaptivePolicy || {};
const normalAdaptiveRatios = adaptivePolicy.targetRatios?.normal || {};
const supportAdaptiveRatios = adaptivePolicy.targetRatios?.support || {};
if (
  adaptivePolicy.resolved?.streak !== 3
  || adaptivePolicy.resolved?.accuracy !== 80
  || adaptivePolicy.supportMode?.minTries !== 8
  || adaptivePolicy.supportMode?.accuracyBelow !== 75
  || adaptivePolicy.supportMode?.unresolvedCount !== 3
  || adaptivePolicy.supportMode?.unresolvedWrongTotal !== 4
  || normalAdaptiveRatios.unresolved !== 20
  || normalAdaptiveRatios.review !== 20
  || normalAdaptiveRatios.current !== 60
  || supportAdaptiveRatios.unresolved !== 55
  || supportAdaptiveRatios.review !== 30
  || supportAdaptiveRatios.current !== 15
) throw new Error('The shared adaptive-question policy thresholds or target ratios are incorrect.');
const adaptiveQuizStart = mainJs.indexOf('function selectAdaptiveQuizIndex(');
const adaptiveQuizEnd = mainJs.indexOf('window.__vocaSelectAdaptiveQuizIndex', adaptiveQuizStart);
const adaptiveQuizBlock = adaptiveQuizStart >= 0 && adaptiveQuizEnd > adaptiveQuizStart ? mainJs.slice(adaptiveQuizStart, adaptiveQuizEnd) : '';
if (!assignedPackLoadBlock.includes('adaptivePolicy: normalizeAdaptiveQuestionPolicy(catalog.adaptivePolicy)') || !mainJs.includes('gameState.activeAdaptiveQuestionPolicy = normalizeAdaptiveQuestionPolicy(metadata.adaptivePolicy)') || !adaptiveQuizBlock.includes('policy.resolved.streak') || !adaptiveQuizBlock.includes('policy.supportMode.minTries') || !adaptiveQuizBlock.includes('policy.targetRatios.support')) throw new Error('The student quiz selector must use the shared catalog adaptive policy.');
if (!mainJs.includes('let recentQuizWordKeys = [];') || !adaptiveQuizBlock.includes('!recentSet.has(item.key)') || !mainJs.includes('recentQuizWordKeys = [...recentQuizWordKeys.filter')) throw new Error('Student quizzes must keep a bounded recent-word cooldown with safe fallback.');
const teacherLearningStart = secureAccount.indexOf('function teacherSpiralPackRow(');
const teacherLearningEnd = secureAccount.indexOf('async function previewTeacherWordPack', teacherLearningStart);
const teacherLearningBlock = teacherLearningStart >= 0 && teacherLearningEnd > teacherLearningStart ? secureAccount.slice(teacherLearningStart, teacherLearningEnd) : '';
if (!teacherLearningBlock.includes('Number(pack.grade)<=guildGrade') || !teacherLearningBlock.includes(`input.type='radio'`) || !teacherLearningBlock.includes('teacherSpiralPackGuide') || !teacherLearningBlock.includes('teacherAdaptivePathGuide') || !teacherLearningBlock.includes('오답·기초 자동 복습') || !teacherLearningBlock.includes('배정된 누적팩 안에서만 자동 조정') || !teacherLearningBlock.includes('이전 학년 누적팩을 직접 배정')) throw new Error('Teacher spiral pack grouping, single selection, or adaptive-path guidance is incomplete.');
const memberReportStart = teacherApi.indexOf('async function memberLearningReport(');
const memberReportEnd = teacherApi.indexOf('const TRIAL_TYPES', memberReportStart);
const memberReportBlock = memberReportStart >= 0 && memberReportEnd > memberReportStart ? teacherApi.slice(memberReportStart, memberReportEnd) : '';
if (!teacherApi.includes('function adaptivePathForMember(') || !teacherApi.includes('const adaptivePolicySource = packCatalog.adaptivePolicy || {}') || !memberReportBlock.includes('const adaptivePath = adaptivePathForMember(learningRows, learningSettings.wordPackId)') || memberReportBlock.indexOf('const adaptivePath = adaptivePathForMember') > memberReportBlock.indexOf('Object.entries(wrong).forEach') || !memberReportBlock.includes('adaptivePath,')) throw new Error('Teacher member reports must calculate the adaptive path from canonical word-learning stats before legacy wrong-word display merging.');
if (!secureAccount.includes('function renderTeacherMemberAdaptivePath(') || !secureAccount.includes(`adaptive.id='secureTeacherMemberAdaptivePath'`) || !secureAccount.includes('renderTeacherMemberAdaptivePath(report.adaptivePath') || !secureAccount.includes('보충 진입 근거:') || !secureAccount.includes('현재 단계 단어')) throw new Error('Teacher member reports must render each student adaptive path, evidence, and target ratios.');
if (secureAccount.includes('단어팩 · 중복 선택') || !secureAccount.includes('누적 단어팩 · 하나 선택')) throw new Error('Teacher pack heading must describe the cumulative single-choice assignment from the initial markup.');
if ((teacherApi.match(/supportWordCount: safeInt\(pack\.supportWordCount/g) || []).length < 2) throw new Error('Teacher word-pack catalog and preview must expose the previous-step support range.');
const teacherPackNormalizeStart = teacherApi.indexOf('function highestAllowedWordPack(');
const teacherPackNormalizeEnd = teacherApi.indexOf('function normalizeQuestionTypes', teacherPackNormalizeStart);
const teacherPackNormalizeBlock = teacherPackNormalizeStart >= 0 && teacherPackNormalizeEnd > teacherPackNormalizeStart ? teacherApi.slice(teacherPackNormalizeStart, teacherPackNormalizeEnd) : '';
if (!teacherPackNormalizeBlock.includes('primaryPackKinds.has(pack.kind)') || !teacherPackNormalizeBlock.includes('Number(pack.grade) <= allowedGrade') || !teacherPackNormalizeBlock.includes('Number(b.wordCount || 0) - Number(a.wordCount || 0)') || !teacherPackNormalizeBlock.includes('WORD_PACK_LEVEL_ORDER[b.level]') || !teacherPackNormalizeBlock.includes('return [selected?.id || defaultWordPack(grade)]')) throw new Error('Teacher pack normalization must select the largest allowed cumulative pack and reject higher-grade or non-primary packs.');
const studentPackNormalizeStart = studentApi.indexOf('function highestAllowedStudentWordPack(');
const studentPackNormalizeEnd = studentApi.indexOf('function normalizedQuestionTypes', studentPackNormalizeStart);
const studentPackNormalizeBlock = studentPackNormalizeStart >= 0 && studentPackNormalizeEnd > studentPackNormalizeStart ? studentApi.slice(studentPackNormalizeStart, studentPackNormalizeEnd) : '';
if (!studentPackNormalizeBlock.includes('Number(pack.grade)<=allowedGrade') || !studentPackNormalizeBlock.includes('studentWordPackCount(b)-studentWordPackCount(a)') || !studentPackNormalizeBlock.includes('STUDENT_WORD_PACK_LEVEL_ORDER[b.level]') || !studentPackNormalizeBlock.includes('return [selected?.id||defaultWordPack(grade)]')) throw new Error('Student pack normalization must select the largest allowed cumulative pack and reject higher-grade packs.');
if (!secureAccount.includes('canonicalAssignedWordPackId?[canonicalAssignedWordPackId]')) throw new Error('The client must restore the server canonical wordPackId before any legacy pack array.');
if (!teacherPackNormalizeBlock.includes('return [selected?.id || defaultWordPack(grade)]') || !studentPackNormalizeBlock.includes('return [selected?.id||defaultWordPack(grade)]') || !secureAccount.includes('canonicalAssignedWordPackId?[canonicalAssignedWordPackId]')) throw new Error('Cumulative word packs must remain a single-choice assignment across the teacher UI and APIs.');
const effectiveMemberSettingsStart = teacherApi.indexOf('function effectiveMemberLearningSettings(');
const effectiveMemberSettingsEnd = teacherApi.indexOf('async function bootstrap', effectiveMemberSettingsStart);
const effectiveMemberSettingsBlock = effectiveMemberSettingsStart >= 0 && effectiveMemberSettingsEnd > effectiveMemberSettingsStart ? teacherApi.slice(effectiveMemberSettingsStart, effectiveMemberSettingsEnd) : '';
if (!effectiveMemberSettingsBlock.includes('member.usesGuildLearningDefaults !== false') || !effectiveMemberSettingsBlock.includes('(classroom.wordPackIds || classroom.wordPackId) : member.assignedWordPackIds') || !effectiveMemberSettingsBlock.includes('classroom.defaultQuestionTypes : member.questionTypes') || !teacherApi.includes(`'usesGuildLearningDefaults', 'assignedWordPackIds'`)) throw new Error('Teacher member reads must resolve guild defaults and member overrides with the same flag semantics as the student API.');
const memberLearningUpdateStart = teacherApi.indexOf('async function updateMemberLearningSettings(');
const memberLearningUpdateEnd = teacherApi.indexOf('async function wordPackPreview', memberLearningUpdateStart);
const memberLearningUpdateBlock = memberLearningUpdateStart >= 0 && memberLearningUpdateEnd > memberLearningUpdateStart ? teacherApi.slice(memberLearningUpdateStart, memberLearningUpdateEnd) : '';
if (!teacherApi.includes(`'WORD_PACK_ABOVE_MEMBER_GRADE'`) || !teacherApi.includes('더 낮은 누적팩을 선택해 주세요') || !memberLearningUpdateBlock.includes('ensureWordPackWithinGrade(selectedPack, memberGrade)') || (memberLearningUpdateBlock.match(/FieldValue\.delete\(\)/g) || []).length < 2 || !memberLearningUpdateBlock.includes('usesGuildLearningDefaults: followsGuildDefaults')) throw new Error('Teacher assignments must reject packs above every target member grade and delete stale overrides when following guild defaults.');
const teacherPreviewStart = teacherApi.indexOf('async function wordPackPreview(body)');
const teacherPreviewEnd = teacherApi.indexOf('async function guildLearningReport', teacherPreviewStart);
const teacherPreviewBlock = teacherPreviewStart >= 0 && teacherPreviewEnd > teacherPreviewStart ? teacherApi.slice(teacherPreviewStart, teacherPreviewEnd) : '';
if (!teacherPreviewBlock.includes('[...words.values()].slice(0, 3500)')) throw new Error('Teacher word-pack previews must support the full 3,500-word curriculum ceiling.');
const teacherSinglePackStart = secureAccount.indexOf('function teacherSinglePackIds(');
const teacherSinglePackEnd = secureAccount.indexOf('let teacherWordPackApplyAllScope', teacherSinglePackStart);
const teacherSinglePackBlock = teacherSinglePackStart >= 0 && teacherSinglePackEnd > teacherSinglePackStart ? secureAccount.slice(teacherSinglePackStart, teacherSinglePackEnd) : '';
const teacherGradeCapStart = secureAccount.indexOf('function teacherLearningTargetGradeCap(');
const teacherGradeCapEnd = secureAccount.indexOf('function syncTeacherWordPackGradeAvailability', teacherGradeCapStart);
const teacherGradeCapBlock = teacherGradeCapStart >= 0 && teacherGradeCapEnd > teacherGradeCapStart ? secureAccount.slice(teacherGradeCapStart, teacherGradeCapEnd) : '';
if (
  !teacherLearningBlock.includes(`input.type='radio';input.name='secureTeacherWordPackChoice'`)
  || !teacherSinglePackBlock.includes('return ids.length?[ids[0]]:(fallback?[fallback]:[]);')
  || !teacherGradeCapBlock.includes('Math.min(guildGrade,...targets.map')
  || !secureAccount.includes('unavailable=packGrade>activeCap')
) throw new Error('Teacher pack selection must remain a single radio choice capped by the lowest target learning grade.');
if (!secureAccount.includes('function commonTeacherMemberLearningSettings(') || !secureAccount.includes(`fillTeacherLearningSelections([],['meaning-choice'])`) || !secureAccount.includes('fillTeacherLearningSelections(teacherGuildPackIds(guild)') || !secureAccount.includes('member.usesGuildLearningDefaults=usesGuildLearningDefaults') || !secureAccount.includes(`teacherMemberReportCache.delete(selectedTeacherManagedGuildId+':'+member.memberId)`) || !secureAccount.includes('renderTeacherMembers(members);updateTeacherSelectionHint();')) throw new Error('Teacher multi-member selection and post-save caches must remain synchronized with effective single-pack settings.');

const cumulativeSkillStart = skillSystem.indexOf('function getCumulativeStars(skill)');
const cumulativeSkillEnd = skillSystem.indexOf('function getProgressRatio(skill)', cumulativeSkillStart);
const cumulativeSkillBlock = cumulativeSkillStart >= 0 && cumulativeSkillEnd > cumulativeSkillStart ? skillSystem.slice(cumulativeSkillStart, cumulativeSkillEnd) : '';
if (
  !cumulativeSkillBlock.includes('return (3 - card.tier) * MAX_STARS + card.stars;')
  || !cumulativeSkillBlock.includes('const starFactor = 1 + 0.15 * getCumulativeStars(card);')
  || !skillSystem.includes('50 * getCumulativeStars(card)')
  || !skillSystem.includes('const totalStars = normalized.reduce((sum, card) => sum + getCumulativeStars(card), 0);')
  || !skillSystem.includes('const starFactor = 1 + 0.15 * getCumulativeStars(card);')
  || !mainJs.includes('globalThis.VocaSkillSystem.getCumulativeStars(skill)')
  || !mainJs.includes('globalThis.VocaSkillSystem.getSkillPowerMultiplier(skill, baseGrade.multiplier)')
) throw new Error('Skill power, dismantling, and fusion must share the cumulative-star multiplier rules.');
const skillSnapshotStart = skillRework.indexOf('createSkillDrawSnapshot = function');
const skillSnapshotEnd = skillRework.indexOf('const SKILL_RESULT_LABELS', skillSnapshotStart);
const skillSnapshotBlock = skillSnapshotStart >= 0 && skillSnapshotEnd > skillSnapshotStart ? skillRework.slice(skillSnapshotStart, skillSnapshotEnd) : '';
if (
  !skillSnapshotBlock.includes('const actual = ownedSkill ? SkillRules.normalizeSkill(ownedSkill) : null;')
  || !skillSnapshotBlock.includes('stars: Number(actual?.stars) || 0, exp: Number(actual?.exp) || 0,')
  || (skillRework.match(/outcome\.skill, outcome\.essenceGained, outcome\.experienceGained\)/g) || []).length < 2
  || !skillRework.includes('"max-essence": "MAX 정수 +100"')
  || !skillRework.includes('Number(result.essenceAmount) || 100')
  || !skillRework.includes('pickGrowthSkill(random, usedGrowthIds)')
  || !indexHtml.includes('새 스킬이나 성장 대상이 없으면 각성 정수로 바뀝니다')
) throw new Error('Skill draw results must show final owned growth, MAX +100 essence, one-growth-per-block protection, and candidate conversion guidance.');
if (
  !skillSystem.includes('const DIRECT_ESSENCE_AMOUNT = 25;')
  || !skillSystem.includes('normal: 500')
  || !skillSystem.includes('rare: 1200')
  || !skillSystem.includes('hero: 2500')
  || !skillSystem.includes('legendary: 4500')
  || !skillSystem.includes('mythic: 7500')
  || !skillSystem.includes('function addSkillExperience(')
  || !skillRework.includes('return full.filter((entry) => !owned.has(wordKey(entry.word)))')
  || !skillRework.includes('growthWithoutEquipped')
  || skillRework.includes('skillResearchTargets')
  || mainJs.includes('skillResearchTargets')
  || !teacherManual.includes('일반 500 · 희귀 1,200 · 영웅 2,500 · 전설 4,500 · 신화 7,500개')
  || !teacherQuickGuide.includes('일반 500·희귀 1,200·영웅 2,500·전설 4,500·신화 7,500개')
) throw new Error('Skills must use full-pack acquisition, equipped auto-focus, EXP duplicates, and summon+dismantle-tuned essence costs without focus-research state.');

const coreManualStart = indexHtml.indexOf('용사 여정 핵심 매뉴얼');
const coreManualEnd = indexHtml.indexOf('</details>', coreManualStart);
const coreManualBlock = coreManualStart >= 0 && coreManualEnd > coreManualStart ? indexHtml.slice(coreManualStart, coreManualEnd) : '';
const coreManualHasGradeRange = /초3\s*(?:~|～|-)\s*고3/.test(coreManualBlock) || /초등학교\s*3학년(?:부터|\s*[~～-]\s*)고등학교\s*3학년/.test(coreManualBlock);
const coreManualHasSinglePack = /누적(?:\s*단어)?팩[^<]{0,40}(?:하나|1개)/.test(coreManualBlock);
if (
  !coreManualHasGradeRange
  || !coreManualHasSinglePack
  || !coreManualBlock.includes('미해결')
  || !coreManualBlock.includes('경로')
  || !coreManualBlock.includes('영단어 스킬 수집·성장·합성')
  || !coreManualBlock.includes('T1 6성 MAX')
  || !coreManualBlock.includes('동일 등급 3장')
  || !coreManualBlock.includes('혼합 3장')
  || !coreManualBlock.includes('신화는 합성할 수 없지만 분해할 수 있습니다')
) throw new Error('The core manual must cover Grade 3-12, one cumulative pack, the unresolved-answer path, and the implemented skill rules.');

if (!secureAccount.includes("new Set(['초등학교','중학교','고등학교'])") || !secureAccount.includes('configureLearningGradeOptions()')) throw new Error('Elementary, middle, and high school registration support is incomplete.');
if (firebase.firestore?.rules !== 'firestore.rules') throw new Error('firebase.json must point to firestore.rules.');
if (firebase.firestore?.indexes !== 'firestore.indexes.json') throw new Error('firebase.json must point to firestore.indexes.json.');
if (firebase.storage?.rules !== 'storage.rules') throw new Error('firebase.json must point to storage.rules.');
if (!vercel.crons?.some((job) => job.path === '/api/cleanup-legacy')) throw new Error('Legacy cleanup cron is missing.');
if (!firestoreRules.includes('match /{document=**} { allow read, write: if false; }')) throw new Error('Firestore private-data deny rule is missing.');
if (!storageRules.includes('allow read, write: if false;')) throw new Error('Storage direct-access deny rule is missing.');
if (!privacy.includes('학생의 실명·학교·반·번호·PIN·Google 이메일은 새 게임 계정에 저장하지 않습니다.')) throw new Error('Student privacy-minimization notice is missing.');
if (!privacy.includes('교사 계정 삭제')) throw new Error('Teacher deletion instructions are missing from the privacy page.');
if (!secureAccount.includes('href="/privacy"') || !secureAccount.includes('deleteTeacherAccount')) throw new Error('Public privacy link or teacher deletion UI is missing.');
const createStart = studentApi.indexOf('async function create(uid, body)');
const createEnd = studentApi.indexOf('async function syncWorldBossVisibility', createStart);
const createBlock = createStart >= 0 && createEnd > createStart ? studentApi.slice(createStart, createEnd) : '';
if (!createBlock || /schoolName|classNum|studentNum|pinHash|\bemail\b|realName|studentName/.test(createBlock)) throw new Error('New student account creation includes a disallowed identity field.');
for (const label of ['길드 정보', '길드원 정보', '길드원 관리', '시련', '길드 및 초대관리']) {
  if (!secureAccount.includes(`data-teacher-guild-section="${({ '길드 정보': 'info', '길드원 정보': 'members', '길드원 관리': 'manage', '시련': 'trial', '길드 및 초대관리': 'invite' })[label]}"`)) throw new Error(`Teacher guild tab is missing: ${label}`);
}
if (!secureAccount.includes('legacyShortcuts?.remove()') || secureAccount.includes("$('secureTeacherOpenTrial').onclick") || secureAccount.includes("$('secureTeacherStudentInvite').onclick") || secureAccount.includes("$('secureTeacherManagerInvite').onclick")) throw new Error('Teacher guild duplicate shortcut actions must stay removed.');
if (!secureAccount.includes('#secureTeacherGuildNav{display:flex!important') || !secureAccount.includes('#secureTeacherGlobalSummary{grid-template-columns:repeat(4,minmax(0,1fr))!important')) throw new Error('Teacher mobile navigation and summary must remain single-row compact layouts.');
if (!secureAccount.includes('#secureTeacherSelectedGuildLogoButton{display:flex!important') || secureAccount.includes('#secureTeacherSelectedGuildLogoButton{display:none!important')) throw new Error('Teacher mobile guild logo must remain visible.');
if (!secureAccount.includes(`teacherChromePreferenceKey='vocahero_teacher_chrome_collapsed_v1'`) || !secureAccount.includes(`toggle.setAttribute('aria-controls','secureTeacherPortalHeader secureTeacherGuildHeader')`) || !secureAccount.includes(`button.setAttribute('aria-expanded',String(!collapsed))`) || !secureAccount.includes('.teacher-workspace-active.teacher-chrome-collapsed #secureTeacherPortalHeader{display:none!important}') || !secureAccount.includes('@media(max-width:900px),(pointer:coarse){#secureTeacherChromeToggle{display:none!important}')) throw new Error('Teacher desktop header collapse must remain accessible, persistent, workspace-scoped, and disabled on mobile/coarse pointers.');
if (!teacherQuickGuide.includes(`image:C+'teacher-member-adaptive-path-actual.png'`) || !teacherQuickGuide.includes('학생 리포트에서 <em>오답·기초 자동 복습</em>') || !teacherQuickGuide.includes('PC 상단 접기·펼치기') || !teacherQuickGuide.includes('다음 문항 목표') || !teacherQuickGuide.includes('지원 필요·성장 중·안정은 참여·전체 성취 그룹')) throw new Error('The detailed teacher quick guide must show the real adaptive-path report, desktop collapse, and separate support-group semantics.');
if (!teacherManual.includes('현재 적용 중인 일반 출제·오답·기초 자동 복습') || !teacherManual.includes('지원 필요·성장 중·안정') || !teacherManual.includes('### 데스크톱에서 리포트 공간 넓게 보기') || !teacherManual.includes('휴대폰·터치 중심 화면은')) throw new Error('The teacher manual must remain aligned with the adaptive report and desktop-only collapse behavior.');
if (!secureAccount.includes(`teacherCatalogStorageKey='vocahero_teacher_catalog_v20260820_spiral1'`) || !secureAccount.includes('teacherGuildReportPromises=new Map()') || !secureAccount.includes('teacherCacheFresh(cached,teacherListCacheMs)')) throw new Error('Teacher catalog and report request caches must remain enabled.');
if (!secureAccount.includes(`Promise.all([refreshClasses(),teacher.verificationStatus==='verified'?refreshTeacherSchoolData():Promise.resolve()])`)) throw new Error('Teacher dashboard data must load in parallel after login.');
const listClassesStart = teacherApi.indexOf('async function listClasses(uid)');
const listClassesEnd = teacherApi.indexOf('function safeQuestionTypeStats', listClassesStart);
const listClassesBlock = listClassesStart >= 0 && listClassesEnd > listClassesStart ? teacherApi.slice(listClassesStart, listClassesEnd) : '';
if (!listClassesBlock.includes('return Promise.all(managedSnapshots.map(async (snap) =>') || !teacherApi.includes('async function guildMemberSummary') || !teacherApi.includes('[TeacherGuildSummary] Aggregate fallback') || !teacherApi.includes(`select('totalCorrect', 'guildPoints').limit(500).get()`)) throw new Error('Teacher guild summaries must use parallel aggregation with a bounded compatibility fallback.');
if ((teacherApi.match(/guildManagerIds\(snap\.data\(\)\)\.includes\(uid\)/g)||[]).length<2) throw new Error('Teacher guild ownership checks must preserve legacy manager compatibility.');
if (!listClassesBlock.includes('[TeacherGuildRank] Ranking unavailable during login') || !listClassesBlock.includes('return new Map();')) throw new Error('Teacher login must remain available when global guild ranking aggregation is temporarily unavailable.');
const listSchoolStart = teacherApi.indexOf('async function listSchoolGuilds(uid)');
const listSchoolEnd = teacherApi.indexOf('async function schoolGuildPreview', listSchoolStart);
const listSchoolBlock = listSchoolStart >= 0 && listSchoolEnd > listSchoolStart ? teacherApi.slice(listSchoolStart, listSchoolEnd) : '';
if (!listSchoolBlock.includes('Promise.all(snapshot.docs.map(async (classSnap) =>')) throw new Error('School guild request summaries must load in parallel.');
const guildReportStart = teacherApi.indexOf('async function guildLearningReport(uid, body)');
const guildReportEnd = teacherApi.indexOf('async function memberLearningReport', guildReportStart);
const guildReportBlock = guildReportStart >= 0 && guildReportEnd > guildReportStart ? teacherApi.slice(guildReportStart, guildReportEnd) : '';
if (!guildReportBlock.includes('listGuildMembers(uid, body, true)') || !guildReportBlock.includes('wrongWordSummary(uid, body, details.members)') || !guildReportBlock.includes('dailyLearning, wrongWordCounts, ...member')) throw new Error('Guild reports must reuse internal wrong-word fields without returning them.');
const relicDrawStart = mainJs.indexOf('function drawRelicCapsule');
const relicDrawEnd = mainJs.indexOf('function getRelicDrawResultPresentation', relicDrawStart);
const relicDrawBlock = relicDrawStart >= 0 && relicDrawEnd > relicDrawStart ? mainJs.slice(relicDrawStart, relicDrawEnd) : '';
const relicExpMap = 'const expMap = { normal: 1, rare: 3, hero: 9, legendary: 27, mythic: 81 };';
if (!relicDrawBlock.includes(relicExpMap) || !relicDrawBlock.includes('rolledGrade, currentGrade: existing.grade') || !relicDrawBlock.includes('gainedExp: rolledExp')) throw new Error('Relic draws must preserve the rolled grade, owned grade, and awarded EXP separately.');
const relicPresentationStart = mainJs.indexOf('function getRelicDrawResultPresentation');
const relicPresentationEnd = mainJs.indexOf('function showRelicDrawResultModal', relicPresentationStart);
const relicPresentationBlock = relicPresentationStart >= 0 && relicPresentationEnd > relicPresentationStart ? mainJs.slice(relicPresentationStart, relicPresentationEnd) : '';
if (!relicPresentationBlock.includes('const rolledGrade =') || !relicPresentationBlock.includes('const currentGrade =') || !relicPresentationBlock.includes('const gainedExp =') || !relicPresentationBlock.includes('basicEffectText') || !relicPresentationBlock.includes('applicationText') || !relicPresentationBlock.includes('MAX 중복 → 신화 정수') || !relicPresentationBlock.includes('return { rolledGrade, currentGrade') || !mainJs.includes('getRelicDrawResultPresentation };')) throw new Error('Relic draw presentation must separate the pulled relic from its owned-card application result.');
const relicResultStart = mainJs.indexOf('function showRelicDrawResultModal');
const relicResultEnd = mainJs.indexOf('function closeRelicDrawResultModal', relicResultStart);
const relicResultBlock = relicResultStart >= 0 && relicResultEnd > relicResultStart ? mainJs.slice(relicResultStart, relicResultEnd) : '';
if (!relicResultBlock.includes('basicEffectText') || !relicResultBlock.includes('applicationText') || relicResultBlock.includes('starsHtml') || relicResultBlock.includes('res.currentExp')) throw new Error('Relic summon cards must show pulled grade/basic effect without owned stars or EXP fractions.');
const relicRestoreStart = mainJs.indexOf('const savedRelicTranscendLvl = Number(');
const relicRestoreEnd = mainJs.indexOf('gameState.totalQuizTries', relicRestoreStart);
const relicRestoreBlock = relicRestoreStart >= 0 && relicRestoreEnd > relicRestoreStart ? mainJs.slice(relicRestoreStart, relicRestoreEnd) : '';
const relicSerializeStart = mainJs.indexOf('function buildExtraDataString()');
const relicSerializeEnd = mainJs.indexOf('function getReadableSaveMetadata', relicSerializeStart);
const relicSerializeBlock = relicSerializeStart >= 0 && relicSerializeEnd > relicSerializeStart ? mainJs.slice(relicSerializeStart, relicSerializeEnd) : '';
if (!relicRestoreBlock.includes('extra.relicTranscendLvl ?? data.relicTranscendLvl ?? 0') || !relicRestoreBlock.includes('gameState.relicTranscendLvl = Number.isFinite(savedRelicTranscendLvl)') || !relicSerializeBlock.includes('relicTranscendLvl: Math.max(0, Math.floor(Number(gameState.relicTranscendLvl) || 0))')) {
  throw new Error('Relic transcendence level must be serialized and restored safely.');
}
const relicValueStart = mainJs.indexOf('function getRelicTotalValue(');
const relicValueEnd = mainJs.indexOf('function getRelicEffectString', relicValueStart);
const relicValueBlock = relicValueStart >= 0 && relicValueEnd > relicValueStart ? mainJs.slice(relicValueStart, relicValueEnd) : '';
if (!relicValueBlock.includes('const transcendMult = 1.0 + (transcendLvl * 0.1)') || !relicValueBlock.includes('baseValue * rMult * starMult * transcendMult')) {
  throw new Error('Relic total value must include the cumulative transcendence multiplier.');
}
const relicDrawCommitEnd = mainJs.indexOf('function selectMythicCraftTarget', relicDrawStart);
const relicDrawCommitBlock = relicDrawStart >= 0 && relicDrawCommitEnd > relicDrawStart ? mainJs.slice(relicDrawStart, relicDrawCommitEnd) : '';
const relicCraftStart = mainJs.indexOf('function craftMythicRelicFromEssence()');
const relicCraftEnd = mainJs.indexOf('function saveRelicStateImmediately()', relicCraftStart);
const relicCraftBlock = relicCraftStart >= 0 && relicCraftEnd > relicCraftStart ? mainJs.slice(relicCraftStart, relicCraftEnd) : '';
const relicDrawResultAt = relicDrawCommitBlock.indexOf('showRelicDrawResultModal(drawnResults)');
const relicDrawSaveAt = relicDrawCommitBlock.lastIndexOf('saveRelicStateImmediately();');
const relicCraftRefreshAt = relicCraftBlock.indexOf('refreshStateVisuals();');
const relicCraftSaveAt = relicCraftBlock.lastIndexOf('saveRelicStateImmediately();');
if (!relicDrawCommitBlock || !relicCraftBlock || relicDrawResultAt < 0 || relicDrawSaveAt < relicDrawResultAt || relicCraftRefreshAt < 0 || relicCraftSaveAt < relicCraftRefreshAt) {
  throw new Error('Relic draw and mythic craft completion must immediately persist relic state.');
}
if (
  !relicCraftBlock.includes("const rolledGrade = 'mythic';")
  || !relicCraftBlock.includes('showRelicDrawResultModal([result]);')
  || relicCraftBlock.includes('targetRelic.stars = 6')
) {
  throw new Error('Mythic guaranteed summon must use actual progression and the reveal result modal.');
}
const relicResultCloseStart = mainJs.indexOf('function closeRelicDrawResultModal');
const relicResultCloseEnd = mainJs.indexOf('function closeSkillAcquireModal', relicResultCloseStart);
const relicResultCloseBlock = relicResultCloseStart >= 0 && relicResultCloseEnd > relicResultCloseStart ? mainJs.slice(relicResultCloseStart, relicResultCloseEnd) : '';
if (!relicResultCloseBlock.includes('Number(window.wbRelicsToReveal || 0) > 0') || !relicResultCloseBlock.includes('renderRelicsUI();')) {
  throw new Error('High-grade relic results must stay open until revealed and refresh after closing.');
}
const learningTypes = ['meaning-choice', 'fill-blank', 'word-choice', 'listen-meaning', 'word-order', 'short-answer'];
const learningRecordStart = mainJs.indexOf('function recordWordLearningResult');
const learningRecordEnd = mainJs.indexOf('function getWordMasterySummary', learningRecordStart);
const learningRecordBlock = learningRecordStart >= 0 && learningRecordEnd > learningRecordStart ? mainJs.slice(learningRecordStart, learningRecordEnd) : '';
const learningEvaluateStart = mainJs.indexOf('function evaluateAnswer(index)');
const learningEvaluateEnd = mainJs.indexOf('let currentCriticalWord', learningEvaluateStart);
const learningEvaluateBlock = learningEvaluateStart >= 0 && learningEvaluateEnd > learningEvaluateStart ? mainJs.slice(learningEvaluateStart, learningEvaluateEnd) : '';
if (learningTypes.some((type) => !learningRecordBlock.includes(`"${type}"`)) || !learningEvaluateBlock.includes('recordWordLearningResult(current, currentQuizType,')) {
  throw new Error('Every main quiz type must record per-word learning results through the shared evaluator.');
}
if (!mainJs.includes('.sort((a, b) => b.correct - a.correct || b.tries - a.tries || a.word.localeCompare(b.word, "en"))') || !mainJs.includes('정답 횟수 높은 순')) {
  throw new Error('The full word-learning record must remain sorted by correct count, then attempts, then word.');
}
const manualQuizAdvancePattern = /(?:\+\+\s*gameState\.currentQuizIndex|gameState\.currentQuizIndex\s*(?:\+\+|\+=\s*1|=\s*\(?\s*gameState\.currentQuizIndex\s*\+\s*1))/;
if (!learningEvaluateBlock.includes('generateQuizCard();') || manualQuizAdvancePattern.test(learningEvaluateBlock)) throw new Error('Correct answers must hand the next question to adaptive generation without manually incrementing currentQuizIndex.');
if (
  !learningEvaluateBlock.includes('const fpGained = Math.floor(')
  || !learningEvaluateBlock.includes('gameState.masteryPoints += fpGained;')
  || !learningEvaluateBlock.includes('${fpGained.toLocaleString()} FP')
) throw new Error('The correct-answer FP toast must display the actual fpGained amount that was awarded.');
if (!mainJs.includes('gameState.questionTypeStats = extra.questionTypeStats || data.questionTypeStats || {};') || !relicSerializeBlock.includes('questionTypeStats: gameState.questionTypeStats || {}')) {
  throw new Error('Question-type learning statistics must be restored and serialized in legacy save data.');
}
const trialServerMarkers = [
  "randomUUID } from 'node:crypto';",
  "event === 'start' ? randomUUID()",
  'activeAttemptId: attemptId',
  'entry?.questionId',
  'hintKeys: FieldValue.delete()'
 ];
trialServerMarkers[1] = 'function createActiveTrialQuestions';
trialServerMarkers.push('safeActiveTrialQuestions(current.activeQuestions');
trialServerMarkers.push('questions: publicTrialQuestions');
if (trialServerMarkers.some((marker) => !studentApi.includes(marker))) throw new Error('Guild trial server-issued attempt/question identity or hint cleanup is incomplete.');
const trialClientMarkers = [
  'attemptId:progress.attemptId',
  'state.answers.set(key,{questionId:key,answer})',
  'guildTrialCorrectChoices=new WeakSet()'
 ];
trialClientMarkers[2] = 'questions=Array.isArray(progress.questions)';
trialClientMarkers.push('hideOptionIds');
if (trialClientMarkers.some((marker) => !secureAccount.includes(marker)) || secureAccount.includes('dataset.correct')) throw new Error('Guild trial client must use server IDs and keep correct choices out of DOM data attributes.');
if (studentApi.includes('words: trial.words.slice')) throw new Error('Guild trial answers must not be returned by the load endpoint.');
if (secureAccount.includes('guildTrialCorrectChoices')) throw new Error('Guild trial correct choices must stay on the server.');
if (secureAccount.includes('question.word')) throw new Error('Guild trial word answers must stay on the server.');
if (secureAccount.includes('question.meaning')) throw new Error('Guild trial meaning answers must stay on the server.');
const teacherSessionMarkers = [
  "const teacherSessionMarker='vocahero_teacher_session_v1';",
  "localStorage.setItem(teacherSessionMarker,'1')",
  'localStorage.removeItem(teacherSessionMarker)',
  "localStorage.getItem(teacherSessionMarker)==='1'",
  "reviewerButton.classList.toggle('hidden',!teacherProfileCache?.isReviewer)",
  'if(!teacherProfileCache?.isReviewer)return;'
 ];
if (teacherSessionMarkers.some((marker) => !secureAccount.includes(marker))) throw new Error('Teacher session restoration or reviewer-only visibility guard is missing.');
const eraseStart = studentApi.indexOf('async function erase(uid)');
const eraseEnd = studentApi.indexOf('export default async function handler', eraseStart);
const eraseBlock = eraseStart >= 0 && eraseEnd > eraseStart ? studentApi.slice(eraseStart, eraseEnd) : '';
const eraseMarkers = [
  'adminDb.bulkWriter()',
  'forEachQueryPage(',
  "collection('contributions').doc(uid)",
  "collection('rewardClaims').doc(uid)",
  'await writer.close()',
  'teachers.doc(uid).get()',
  'adminAuth.deleteUser(uid)'
];
if (!studentApi.includes('async function forEachQueryPage') || !studentApi.includes('query.startAfter(cursor)') || eraseMarkers.some((marker) => !eraseBlock.includes(marker))) {
  throw new Error('Student account erasure coverage is incomplete.');
}
if (!studentApi.includes('const PROGRESS_TOKEN_CAPACITY = 240;') || !studentApi.includes('const PROGRESS_TOKEN_REFILL_MS = 750;') || !studentApi.includes('tokens: PROGRESS_TOKEN_INITIAL')) {
  throw new Error('Student progress guard does not support the normal three-minute save batch.');
}
const teacherPresenceAt = eraseBlock.indexOf('teachers.doc(uid).get()');
const authDeleteAt = eraseBlock.indexOf('adminAuth.deleteUser(uid)');
if (teacherPresenceAt < 0 || authDeleteAt < teacherPresenceAt || !eraseBlock.includes('if (!teacherSnap.exists)')) throw new Error('Student deletion must preserve a shared teacher authentication account.');
const pinMigrationStart = studentApi.indexOf('async function migrate(uid, body)');
const pinMigrationEnd = studentApi.indexOf('async function transferGuildMemberships', pinMigrationStart);
const pinMigrationBlock = pinMigrationStart >= 0 && pinMigrationEnd > pinMigrationStart ? studentApi.slice(pinMigrationStart, pinMigrationEnd) : '';
if (!pinMigrationBlock.includes('legacyMigratedAt||now.data()?.legacyGoogleMigratedAt')) throw new Error('PIN migration must reject an account already migrated through Google.');
const pinRecoveryStart = studentApi.indexOf('async function recoverMigratedLegacy');
const pinRecoveryEnd = studentApi.indexOf('async function claimGoogleLink', pinRecoveryStart);
const pinRecoveryBlock = pinRecoveryStart >= 0 && pinRecoveryEnd > pinRecoveryStart ? studentApi.slice(pinRecoveryStart, pinRecoveryEnd) : '';
const recoveryAuthCheckAt = pinRecoveryBlock.indexOf('authUserOrNull(preliminarySourceUid)');
const recoveryTransactionAt = pinRecoveryBlock.indexOf('adminDb.runTransaction');
if (recoveryAuthCheckAt < 0 || recoveryTransactionAt < recoveryAuthCheckAt || !studentApi.includes("'GOOGLE_ACCOUNT_PROTECTED'") || !pinRecoveryBlock.includes('googleProtectedError()') || !pinRecoveryBlock.includes('hasFreshGoogleLinkPending')) {
  throw new Error('PIN recovery must reject Google-protected or linking source accounts before moving data.');
}
const markLinkedStart = studentApi.indexOf('async function markGoogleLinked');
const markLinkedEnd = studentApi.indexOf('async function markGoogleUnlinked', markLinkedStart);
const markUnlinkedEnd = studentApi.indexOf('function recoveryCredentialsFromLegacyDoc', markLinkedEnd);
const markLinkedBlock = markLinkedStart >= 0 && markLinkedEnd > markLinkedStart ? studentApi.slice(markLinkedStart, markLinkedEnd) : '';
const markUnlinkedBlock = markLinkedEnd >= 0 && markUnlinkedEnd > markLinkedEnd ? studentApi.slice(markLinkedEnd, markUnlinkedEnd) : '';
if (!markLinkedBlock.includes('legacyPinRecoveryDisabledAt: FieldValue.serverTimestamp()') || markUnlinkedBlock.includes('legacyPinRecoveryDisabledAt: FieldValue.delete()') || !pinRecoveryBlock.includes('legacyPinRecoveryDisabledAt')) throw new Error('A previously Google-protected account must remain permanently ineligible for legacy PIN recovery.');
const finalizeRecoveryStart = studentApi.indexOf('async function finalizeLegacyRecovery');
const finalizeRecoveryEnd = studentApi.indexOf('async function recoverMigratedLegacy', finalizeRecoveryStart);
const finalizeRecoveryBlock = finalizeRecoveryStart >= 0 && finalizeRecoveryEnd > finalizeRecoveryStart ? studentApi.slice(finalizeRecoveryStart, finalizeRecoveryEnd) : '';
if (!finalizeRecoveryBlock.includes("legacyRecoveryStatus !== 'pending'") || !finalizeRecoveryBlock.includes("legacyRecoveryStatus: 'complete'") || !pinRecoveryBlock.includes("legacyRecoveryStatus:'pending'") || !studentApi.includes("if(data.legacyRecoveryStatus==='pending')") || !studentApi.includes('target.legacyImported||source.legacyImported?0:legacyDamage')) throw new Error('Legacy PIN recovery post-processing must be resumable and idempotent.');
for (const marker of ["action:'prepareGoogleLink'", "action:'markGoogleLinked'", "action:'markGoogleUnlinked'"]) {
  if (!secureAccount.includes(marker)) throw new Error(`Student Google link state synchronization is missing: ${marker}`);
}
if (!studentApi.includes("body.action==='prepareGoogleLink'") || !studentApi.includes("body.action==='markGoogleLinked'") || !studentApi.includes("body.action==='markGoogleUnlinked'")) throw new Error('Student Google link-state server actions are missing.');
const contributeStart = worldBossApi.indexOf('async function contribute(uid, body)');
const contributeEnd = worldBossApi.indexOf('export default async function handler', contributeStart);
const contributeBlock = contributeStart >= 0 && contributeEnd > contributeStart ? worldBossApi.slice(contributeStart, contributeEnd) : '';
const compatibilityGuardAt = contributeBlock.indexOf("hasOwnProperty.call(body, 'correctAnswers')");
const sessionSubmitAt = contributeBlock.indexOf('submitted: true');
if (compatibilityGuardAt < 0 || sessionSubmitAt < compatibilityGuardAt || contributeBlock.includes('reportedCorrectAnswers < 1')) {
  throw new Error('World-boss legacy client guard must run before session submission and allow a reported zero.');
}
const contributeTransactionAt = contributeBlock.indexOf('const result = await adminDb.runTransaction(async (tx) => {');
const contributeTransactionBlock = contributeTransactionAt >= 0 ? contributeBlock.slice(contributeTransactionAt) : '';
const atomicRewardMarkers = [
  'tx.get(accountRef)',
  'const { rewardGold, rewardTokens } = rewardsForAppliedDamage(applied);',
  'tx.update(accountRef, {',
  "'state.gold': nextAccountState.gold",
  "'state.accGold': nextAccountState.accGold",
  "'state.bossTokens': nextAccountState.bossTokens",
  'rewardGold,',
  'rewardTokens,',
  'accountState: nextAccountState'
];
if (contributeTransactionAt < 0 || atomicRewardMarkers.some((marker) => !contributeTransactionBlock.includes(marker))) {
  throw new Error('World-boss contribution must atomically update account gold/tokens and return the authoritative reward state.');
}
const endRaidStart = mainJs.indexOf('function endWorldBossRaid(reasonMessage)');
const endRaidEnd = mainJs.indexOf('function openPotentialProbModal()', endRaidStart);
const endRaidBlock = endRaidStart >= 0 && endRaidEnd > endRaidStart ? mainJs.slice(endRaidStart, endRaidEnd) : '';
const secureContributionAt = endRaidBlock.indexOf('window._secureWorldBossContribute(wbTotalDamageDealt, wbCorrectAnswers).then((result) => {');
const authoritativeStateAt = endRaidBlock.indexOf('const serverState = result.accountState');
const clientRewardMutationAt = endRaidBlock.indexOf('gameState.gold =');
const legacyClientRewardMarkers = [
  'const rewardGold = Math.max(500, Math.floor(wbTotalDamageDealt / 500));',
  'gameState.gold = (gameState.gold || 0) + rewardGold',
  'gameState.bossTokens = (gameState.bossTokens || 0) + rewardTokens',
  'window._fbDoc(',
  'window._fbRunTransaction(',
  '"world_bosses"'
];
if (secureContributionAt < 0 || authoritativeStateAt < secureContributionAt || clientRewardMutationAt < authoritativeStateAt || legacyClientRewardMarkers.some((marker) => endRaidBlock.includes(marker))) {
  throw new Error('World-boss raid completion must wait for the server reward state and must not pre-credit or write Firestore directly.');
}
if (worldBossApi.includes('RAID_MAX_DAMAGE_RATE') || worldBossApi.includes('hardDamageCap') || worldBossApi.includes('verificationScale')) throw new Error('World-boss damage must not use a personal percentage or elapsed-time reduction cap.');
if (!worldBossApi.includes("throw apiError(409, 'RAID_ANSWER_RATE_INVALID'") || !worldBossApi.includes("throw apiError(409, 'RAID_DAMAGE_VERIFICATION_FAILED'")) throw new Error('World-boss answer-rate and damage plausibility rejection checks are missing.');
if (!worldBossApi.includes('const bossApplied = Math.min(requested, Math.max(0, maxHp - currentTotal));')) throw new Error('World-boss must apply the full verified requested damage, limited only by remaining boss HP.');
if (!worldBossApi.includes('const savedPower = safeInt(account.state?.combatPower') || !worldBossApi.includes('verifiedCorrectAnswers + 4')) throw new Error('World-boss plausibility verification must use server-saved combat power and verified answers.');
const raidRegressionRemainingHp = 12_000_000_000;
const raidRegressionRequestedDamage = 1_000_000_000;
const raidRegressionAppliedDamage = Math.min(raidRegressionRequestedDamage, raidRegressionRemainingHp);
if (raidRegressionAppliedDamage !== raidRegressionRequestedDamage) throw new Error('World-boss regression: a verified 1B request must apply the full 1B damage.');
if (!mainJs.includes('function getKstDayString(now = Date.now())') || !mainJs.includes('월드보스 토벌전 참전하기 (1일 1회)')) throw new Error('KST raid-day logic or the active raid button wording is missing.');
if (!mainJs.includes('function hasWorldBossResumeProgress') || !mainJs.includes('const isResume = Boolean(boss.canAttack) && !defeated && hasWorldBossResumeProgress(bossDay)') || !mainJs.includes('월드보스 전투 이어하기 (이탈 기록 발견)')) throw new Error('World-boss resume progress must survive the secure status refresh.');
if (!mainJs.includes('const tierFactor = 1 + (3 - tier) * 0.10') || !mainJs.includes('if (tierRoll < 0.05) return 1') || !mainJs.includes('rolledTier < oldTier') || !studentApi.includes('function migrateSkillTierOrder') || !studentApi.includes('tier:4-previousTier')) throw new Error('Skill Tier 1 must remain the strongest without devaluing legacy Tier 3 skills.');
const skillDrawStart = mainJs.indexOf('function createSkillDrawSnapshot');
const skillDrawEnd = mainJs.indexOf('function getSkillSourcePool', skillDrawStart);
const skillDrawBlock = skillDrawStart >= 0 && skillDrawEnd > skillDrawStart ? mainJs.slice(skillDrawStart, skillDrawEnd) : '';
if (!skillDrawBlock.includes('grade: SKILL_GRADES[rolledGrade] ? rolledGrade : "normal"') || !skillDrawBlock.includes('tier: Math.max(1, Math.min(3, Number(rolledTier) || 3))') || !skillDrawBlock.includes('data-draw-grade=') || !skillDrawBlock.includes('data-draw-tier=') || !mainJs.includes('createSkillDrawSnapshot(picked.word, picked.meaning, rolledGrade, rolledTier, alreadyOwned)')) {
  throw new Error('Skill summon results must preserve and render the grade and tier rolled in the current draw.');
}
if (!indexHtml.includes('id="gameMainLayout"') || !indexHtml.includes('#gameMainLayout.full-panel-tab-active') || !mainJs.includes('mainLayout?.classList.toggle("full-panel-tab-active", isFullPanelTab)')) {
  throw new Error('World boss, hall of fame, and hero information tabs must occupy the full game layout.');
}
if (mainJs.includes('>추첨 ${rolledGradeInfo.name}</span>')) throw new Error('Relic and skill result cards must show only the two-character rarity name.');
const englishInputStart = mainJs.indexOf('function formatEnglishWordInput');
const englishInputEnd = mainJs.indexOf('function formatEnglishWordDisplay', englishInputStart);
const englishInputBlock = englishInputStart >= 0 && englishInputEnd > englishInputStart ? mainJs.slice(englishInputStart, englishInputEnd) : '';
if (!englishInputBlock.includes('잘못 입력한 글자만 지우고 계속 작성해 주세요') || englishInputBlock.includes('inputEl.value = ""') || englishInputBlock.includes("inputEl.value = ''")) throw new Error('Invalid Korean or numeric quiz input must be preserved for correction instead of clearing the full answer.');
const worldBossHookStart = mainJs.indexOf('window.__vocaHeroTestHooks = {', mainJs.indexOf('window.renderWorldBossSettlementModal'));
const worldBossHookEnd = mainJs.indexOf('};', worldBossHookStart);
const worldBossHookBlock = worldBossHookStart >= 0 && worldBossHookEnd > worldBossHookStart ? mainJs.slice(worldBossHookStart, worldBossHookEnd) : '';
if (!mainJs.includes('window.renderWorldBossSettlementModal = renderWorldBossSettlementModal;') || !worldBossHookBlock.includes('resolveRichSkillCastState') || !worldBossHookBlock.includes('advanceRichCurseTimer')) throw new Error('World-boss settlement or rich-boss regression test hooks are missing.');
const initStart = secureAccount.indexOf('async function init()');
const initEnd = secureAccount.indexOf('async function openTeacher()', initStart);
const initBlock = initStart >= 0 && initEnd > initStart ? secureAccount.slice(initStart, initEnd) : '';
const skipReadAt = initBlock.indexOf("localStorage.getItem(studentAutoEntrySkip)==='1'");
const skipConsumeAt = initBlock.indexOf('localStorage.removeItem(studentAutoEntrySkip)');
const skipReturnAt = initBlock.indexOf("if(skipStudentAutoEntry){cancelGameEntry('secureWelcomeModal');return;}");
const accountLoadAt = initBlock.indexOf("request(studentApi,{action:'load'}");
const legacyClearAt = initBlock.indexOf('clearLegacy()');
if (skipReadAt < 0 || skipConsumeAt < skipReadAt || skipReturnAt < skipConsumeAt || accountLoadAt < skipReturnAt || legacyClearAt < 0 || accountLoadAt < legacyClearAt) {
  throw new Error('Teacher logout must skip student auto-entry exactly once.');
}
if (!studentApi.includes('.webp?v=')) throw new Error('Guild trial WebP scene path is missing.');
if (!teacherApi.includes("body.action === 'deleteTeacherAccount'") || !teacherApi.includes('teacher-verification/${uid}/')) throw new Error('Teacher account/proof deletion API is missing.');
if (!teacherApi.includes('PROOF_DATE_EXPIRED')) throw new Error('Manual teacher-proof freshness enforcement is missing.');
if (!teacherApi.includes('extractImageProofText') || !teacherApi.includes('image_ocr') || !teacherApi.includes(`source: 'pdf_ocr'`)) throw new Error('Teacher image/PDF proof OCR screening is missing.');
if (teacherApi.includes("outcome = 'auto_approved'") || teacherApi.includes("screening.outcome === 'auto_approved'")) throw new Error('Teacher proof must require manual reviewer approval.');
if (!teacherApi.includes('INVITE_CODE_LENGTH = 6') || !teacherApi.includes("teacherSchoolKey !== guildSchoolKey") || !teacherApi.includes("teacherSchoolKey !== inviteSchoolKey")) throw new Error('Manager invite entropy or school binding is incomplete.');
const submitProofStart = teacherApi.indexOf('async function submitTeacherVerification');
const submitProofEnd = teacherApi.indexOf('async function listVerificationRequests', submitProofStart);
const submitProofBlock = submitProofStart >= 0 && submitProofEnd > submitProofStart ? teacherApi.slice(submitProofStart, submitProofEnd) : '';
const submitProofCommitAt = submitProofBlock.indexOf('await batch.commit()');
const previousProofDeleteAt = submitProofBlock.indexOf('bucket.file(previousPath).delete');
if (submitProofCommitAt < 0 || previousProofDeleteAt < submitProofCommitAt || !submitProofBlock.includes('Superseded proof cleanup deferred')) throw new Error('Superseded teacher proof cleanup must remain retryable after commit.');
const reviewStart = teacherApi.indexOf('async function reviewTeacherVerification');
const reviewEnd = teacherApi.indexOf('function classPack(', reviewStart);
const reviewBlock = reviewStart >= 0 && reviewEnd > reviewStart ? teacherApi.slice(reviewStart, reviewEnd) : '';
const reviewCommitAt = reviewBlock.indexOf('await batch.commit()');
const proofDeleteAt = reviewBlock.indexOf('file(objectPath).delete');
if (reviewCommitAt < 0 || proofDeleteAt < reviewCommitAt || !reviewBlock.includes('Post-review storage cleanup deferred')) throw new Error('Teacher proof cleanup must run after the review commit and remain retryable.');
const removeManagerStart = teacherApi.indexOf('async function removeGuildManager');
const removeManagerEnd = teacherApi.indexOf('async function transferGuildOwnership', removeManagerStart);
const removeManagerBlock = removeManagerStart >= 0 && removeManagerEnd > removeManagerStart ? teacherApi.slice(removeManagerStart, removeManagerEnd) : '';
if (!removeManagerBlock.includes('targetTeacherSnap.exists') || removeManagerBlock.includes('batch.set(teachers.doc(targetUid)')) throw new Error('Removing a guild manager must not recreate a missing teacher profile.');
const deleteGuildStart = teacherApi.indexOf('async function deleteGuild');
const deleteGuildEnd = teacherApi.indexOf('async function invite', deleteGuildStart);
const deleteGuildBlock = deleteGuildStart >= 0 && deleteGuildEnd > deleteGuildStart ? teacherApi.slice(deleteGuildStart, deleteGuildEnd) : '';
if (!deleteGuildBlock.includes("invites.where('classId', '==', classId)") || !deleteGuildBlock.includes('batch.delete(inviteDoc.ref)') || deleteGuildBlock.includes('batch.set(write.ref')) throw new Error('Guild deletion must remove invitations without recreating missing account documents.');
const deleteTeacherStart = teacherApi.indexOf('async function deleteTeacherAccount');
const deleteTeacherEnd = teacherApi.indexOf('export default async function handler', deleteTeacherStart);
const deleteTeacherBlock = deleteTeacherStart >= 0 && deleteTeacherEnd > deleteTeacherStart ? teacherApi.slice(deleteTeacherStart, deleteTeacherEnd) : '';
if (!teacherApi.includes('async function queryAllDocs') || !teacherApi.includes('async function getAllInChunks') || !deleteTeacherBlock.includes('queryAllDocs(verificationRequests') || /verificationRequests[^\n]+limit\(100\)/.test(deleteTeacherBlock)) throw new Error('Teacher account deletion must page through every private record.');
const createGuildStart = teacherApi.indexOf('async function createGuild');
const createGuildEnd = teacherApi.indexOf('let teacherGuildRankCache', createGuildStart);
const createGuildBlock = createGuildStart >= 0 && createGuildEnd > createGuildStart ? teacherApi.slice(createGuildStart, createGuildEnd) : '';
if (!createGuildBlock.includes('batch.create(ref, data)') || !createGuildBlock.includes('batch.set(teachers.doc(uid)') || !createGuildBlock.includes('await batch.commit()') || createGuildBlock.includes('await ref.create(data)')) throw new Error('Guild creation and teacher membership must commit atomically.');
if (!cleanupApi.includes('const clearedProofIds = new Set()') || !cleanupApi.includes('if (clearedProofIds.has(doc.id)) update.objectPath = FieldValue.delete()') || cleanupApi.includes(".delete({ ignoreNotFound: true }).catch(() => {})")) throw new Error('Expired teacher proof deletion must preserve objectPath for retry on storage failure.');
if (!studentApi.includes("!Object.hasOwn(data,'activeGuildLogoUrl')")) throw new Error('A guild with the default null logo must not trigger a Firestore repair write on every login.');
const guildEffectStart = studentApi.indexOf('async function investGuildEffect');
const guildEffectEnd = studentApi.indexOf('async function updateGuildSkin', guildEffectStart);
const guildEffectBlock = guildEffectStart >= 0 && guildEffectEnd > guildEffectStart ? studentApi.slice(guildEffectStart, guildEffectEnd) : '';
const guildSkinStart = studentApi.indexOf('async function updateGuildSkin');
const guildSkinEnd = studentApi.indexOf('async function guildTrialEvent', guildSkinStart);
const guildSkinBlock = guildSkinStart >= 0 && guildSkinEnd > guildSkinStart ? studentApi.slice(guildSkinStart, guildSkinEnd) : '';
if (!studentApi.includes('const GUILD_EFFECT_CONTRIBUTION = 25') || !studentApi.includes('levelProgress') || !guildEffectBlock.includes('adminDb.runTransaction') || !guildEffectBlock.includes('guildEffectPointsSpent: spentPoints + contribution') || guildEffectBlock.includes('guildCoins: coins - cost') || !guildEffectBlock.includes("collection('effectInvestments')")) throw new Error('Guild effects must accumulate 25-point contributions toward each current-level requirement without reducing lifetime ranking points or personal coins.');
if (!guildSkinBlock.includes('adminDb.runTransaction') || !guildSkinBlock.includes('guildCosmetics: cosmetics') || !guildSkinBlock.includes('SKIN_NOT_OWNED')) throw new Error('Guild skin purchase and equip actions must remain server-authoritative.');
if (!guildSkinBlock.includes("mode === 'unlockVariant'") || !guildSkinBlock.includes('cosmetics.skinShards-=shardCost') || !studentApi.includes('GUILD_SKIN_SHARD_UNLOCK_COST') || !secureAccount.includes('function unlockGuildSkinVariant') || !secureAccount.includes('decorateGuildSkinShardUnlocks(guild)')) throw new Error('Dimension shards must unlock missing collection variants through a server-authoritative action.');
if (!studentApi.includes('totalVariants:275') || !studentApi.includes("['rainbow-dragon-rider','무지개 용기사','rainbowrider']") || !studentApi.includes('GUILD_SKIN_RARITIES') || studentApi.includes('sinceMythic>=149') || studentApi.includes('sinceLegendary>=49') || studentApi.includes('sinceRare>=9')) throw new Error('The guild collection must publish 55 appearances across five server-authoritative rarities without guaranteed-summon overrides.');
const femaleSkinIds=studentApi.match(/const GUILD_SKIN_FEMALE_IDS=new Set\(\[(.*?)\]\);/)?.[1]?.match(/'[^']+'/g)||[];
if(femaleSkinIds.length!==28)throw new Error('Guild appearance presentation balance must remain 27 male and 28 female.');
if (!studentApi.includes("id:'forgeGuard'") || !studentApi.includes("resource:'bossTokens'") || !mainJs.includes("consumeGuildBoost('forgeGuard')") || !mainJs.includes("applyGuildPowerRune")) throw new Error('Meaningful guild forge, combat, and currency exchange items must remain connected to runtime logic.');
if ((mainJs.match(/consumeGuildBoost\('forgeGuard'\)/g) || []).length < 2) throw new Error('Guild forge guard must protect both forge drops and critical-defense drops.');
if (!mainJs.includes('criticalDefenseResolved') || !mainJs.includes('showGuildGuardShieldEffect') || !indexHtml.includes('id="criticalDefenseSubmit"')) throw new Error('Strong-attack and wrong-answer critical-defense submissions must resolve once and show the guild guard shield effect.');
if (!secureAccount.includes('차원 영웅(외형) · 도감') || !secureAccount.includes('data-secure-guild-tab="effects"') || !secureAccount.includes('function summonGuildSkins') || !secureAccount.includes("action:'loadGuildRankings'")) throw new Error('Six-tab guild shop, collection, effects UI or lazy ranking load is missing.');
if (!secureAccount.includes('dimensional-summon-banner.webp') || !secureAccount.includes('guild-shop-items.webp') || !secureAccount.includes('guild-effects.webp') || !secureAccount.includes("changeGuildSkin('equip',best.key") || !secureAccount.includes("locked.textContent='🔒'")) throw new Error('Guild shop artwork, owned-first appearance sorting, automatic best-rarity equip, or locked cards are missing.');
if (!secureAccount.includes('guildMarkupWithoutSummonPity') || !secureAccount.includes("guildMarkupWithoutSummonPity().replace") || !secureAccount.includes('paintGuildCurrencies') || !secureAccount.includes('길드 포인트')) throw new Error('Guaranteed-summon copy removal or combined guild currency header is missing.');
if (!teacherApi.includes('function guildInviteCode()') || !teacherApi.includes('INVITE_CODE_LENGTH = 6') || !teacherApi.includes('/[A-Z]/.test(code)') || !teacherApi.includes('/\\d/.test(code)') || teacherApi.includes('MANAGER_INVITE_LENGTH = 24') || !secureAccount.includes("normalizeSixCharacterInviteInput($('secureManagerCode'))") || !secureAccount.includes("normalizeSixCharacterInviteInput($('secureGuildCode'))")) throw new Error('Student and co-manager invites must use mixed alphanumeric six-character codes.');
if (!secureAccount.includes("if(span.textContent==='관리 화면 열기 →')span.remove()")) throw new Error('The redundant teacher guild-card navigation copy must be removed.');
if (!secureAccount.includes('guildRarityEffectText') || !secureAccount.includes('guild-summon-beam') || !secureAccount.includes("highGrade=gradeLabel==='전설'||gradeLabel==='신화'") || !secureAccount.includes('rarityMap.get(row.rarity)')) throw new Error('Guild summon rarity guide, beam reveal, high-rarity click reveal, or exact rolled-rarity rendering is missing.');
if (!secureAccount.includes("classList.add('mx-auto','aspect-square'")) throw new Error('Guild shop artwork must remain square and centered.');
if (!mainJs.includes('if (skinImageUrl)') || !mainJs.includes("getGuildEffectBonus('forge')") || !mainJs.includes("getGuildCosmeticBonus('defensePct')") || !mainJs.includes("getGuildCosmeticBonus('attackPct')") || !mainJs.includes('rollGuildRewardGrade')) throw new Error('Guild skins and balanced cosmetic effects are not connected to runtime formulas.');
if (!vercel.headers?.some((route) => route.source === '/data/(.*)\\.(json|txt)' && route.headers?.some((header) => header.key === 'Vercel-CDN-Cache-Control' && header.value.includes('immutable')))) throw new Error('Versioned data CDN cache header is missing.');
if (!teacherApi.includes('usesGuildLearningDefaults: followsGuildDefaults') || !teacherApi.includes('learningSettingsVersion: FieldValue.increment(1)') || !studentApi.includes('member.usesGuildLearningDefaults === false')) throw new Error('Teacher member assignments must override guild defaults and carry a monotonic settings version.');
if (!secureAccount.includes('function syncAssignedLearningSettings') || !secureAccount.includes('startBackgroundStudentSync()')) throw new Error('Student assignment refresh is missing.');
for (const block of [removeManagerBlock, deleteGuildBlock, deleteTeacherBlock]) {
  if (block.includes('data()?.ownerId !== uid') || block.includes('data()?.ownerId === uid')) throw new Error('Legacy guild owner actions must use the managerIds[0] compatibility fallback.');
}
if (!mainJs.includes('wbSkillCastCount = 0;') || !/wbSkillCastCount,\r?\n\s+wbComboCount,/.test(mainJs) || !mainJs.includes('wbRichLockedSkillIds: [...wbRichLockedSkillIds]') || !mainJs.includes('attemptWorldBossRichSkillUnlock') || !mainJs.includes('nextTimer: triggered ? 20 : remaining')) throw new Error('Rich curse purification, 20-second seal cycle, unlock quiz, or reconnect persistence is incomplete.');
if (!mainJs.includes('vocahero_secure_wb_raid_') || !mainJs.includes('Math.min(savedTimerRemaining, secureTimerRemaining)') || !mainJs.includes('World boss battle checkpoint error')) throw new Error('World-boss secure resume and checkpoint flow is incomplete.');
if (!worldBossApi.includes('finalizeRolledOverRaid') || !worldBossApi.includes('async function checkpoint(uid, body)') || !worldBossApi.includes('autoFinalizedAtRollover: true')) throw new Error('World-boss rollover final-damage settlement is incomplete.');
if (!secureAccount.includes('showGuildSummonResultsModal') || !secureAccount.includes('secureGuildSummonResultModal') || !secureAccount.includes('changeGuildSkin(\'unequip\'') || !secureAccount.includes('차원 파편')) throw new Error('Guild summon modal, skin toggle, or shard unlock UI is incomplete.');
if (!secureAccount.includes('guildSummonPending') || !secureAccount.includes('setGuildSummonPending(true)') || !mainJs.includes('relicSummonBusy') || !mainJs.includes('skillSummonBusy') || !mainJs.includes('repeatSkillDraw')) throw new Error('Guild hero, relic, or magic-card summon re-entry lock is missing.');
if (!mainJs.includes('getGuildRewardGradeRates') || !mainJs.includes('const grade = rollGuildRewardGrade()') || !indexHtml.includes('data-guild-reward-rate-table') || !secureAccount.includes('소환 확률(행운 미적용)')) throw new Error('Guild luck application or actual probability breakdown is incomplete.');
const guildSkinSummonStart = studentApi.indexOf("if (mode === 'summon')");
const guildSkinSummonEnd = studentApi.indexOf("} else if (mode === 'equip')", guildSkinSummonStart);
const guildSkinSummonBlock = guildSkinSummonStart >= 0 && guildSkinSummonEnd > guildSkinSummonStart ? studentApi.slice(guildSkinSummonStart, guildSkinSummonEnd) : '';
if (!guildSkinSummonBlock || /fortune|guildEffect|guildCosmeticEffect/i.test(guildSkinSummonBlock)) throw new Error('Dimension hero summon must keep its fixed server-side rarity weights without guild luck.');
if (!studentApi.includes('guildSkinCollectionEffects') || !studentApi.includes('equippedEffects') || !studentApi.includes('collectionEffects') || !secureAccount.includes('외형 등급 +') || !secureAccount.includes('도감 등급 +') || !secureAccount.includes('도감 ${heldCount}/5 · 보유 효과') || !secureAccount.includes('guildMythicPulse')) throw new Error('Guild cosmetic equipped/collection effect breakdown or summon rarity presentation is incomplete.');
if (!mainJs.includes("['meaning-choice', 'word-choice', 'word-order', 'fill-blank']") || !mainJs.includes('wbRichUnlockQuizActive') || !mainJs.includes('wb-rich-curse-lock') || !mainJs.includes('wbGuildHeroSkinImage')) throw new Error('World-boss curse quiz, lock effect, timer pause, or guild hero skin is incomplete.');
if (!mainJs.includes("wbRichLockedSkillIds = new Set((gameState.equippedSkills || []).map(String));") || !mainJs.includes('setTimeout(() => castWorldBossSkill(skillId), 0)') || !mainJs.includes('counted >= 4') || !mainJs.includes('wbUltimateEventActive || wbRichUnlockQuizActive')) throw new Error('Rich entry lock, immediate post-unlock cast, four-cast purification, or curse-timer pause is incomplete.');
if (!mainJs.includes('function renderWorldBossExpectedReward') || !mainJs.includes('100000 * Math.min(1, safeDamage / safeMaxHp)') || mainJs.includes('주간 결산 시 FP / 칭호 지급 (증표 +')) throw new Error('World-boss defeated and undefeated weekly FP estimates must remain visible after raid submission.');
if (!secureAccount.includes('availableWidth/1600') || !secureAccount.includes('min-width:1600px!important') || !secureAccount.includes('pointer:coarse') || !secureAccount.includes('grid-template-columns:repeat(5,minmax(0,1fr))') || !secureAccount.includes('--teacher-design-height')) throw new Error('Teacher phone/tablet layouts must keep the desktop workspace, prevent flex double-scaling, and fill the available viewport width.');
if (!studentApi.includes('Math.floor(correctCoinProgress / 5)') || !studentApi.includes('dailyConsistencyBonus') || !studentApi.includes('stageGain * 5') || !worldBossApi.includes('Math.floor(coinProgress / 10)')) throw new Error('Guild coins must be earned across learning, consistency, stage, trial, and world-boss activity.');
if (!teacherApi.includes('const rewardGuildCoins = count * 5') || !studentApi.includes('words.length * 5')) throw new Error('Guild trial rewards must stay at five coins per completed question across teacher and student APIs.');
if (!studentApi.includes('const GUILD_EFFECT_BASE_COST = 100') || !studentApi.includes('const GUILD_EFFECT_LEVEL_COST_STEP = 20') || !studentApi.includes('guildEffectLevelCost(level)') || !studentApi.includes('levelProgress -= requirement')) throw new Error('Guild effect level requirements must scale from 100P by 20P per level while accepting fixed 25P contributions with overflow carry.');
if (!studentApi.includes("valuePerLevel: 0.4, maxLevel: 50") || !studentApi.includes("valuePerLevel: 0.2, maxLevel: 50") || !studentApi.includes("valuePerLevel: 0.04, maxLevel: 50") || !studentApi.includes("valuePerLevel: 0.6, maxLevel: 50") || !studentApi.includes("resource:'masteryPoints',amount:200") || !studentApi.includes("resource:'relicEssence',amount:5") || !studentApi.includes("resource:'bossTokens',amount:100")) throw new Error('Guild effect caps or requested currency exchange amounts changed unexpectedly.');
if (!mainJs.includes('/^[A-Za-z\\s]*$/.test(raw)') || !mainJs.includes('잘못 입력한 글자만 지우고 계속 작성해 주세요')) throw new Error('English text inputs must allow spaces and preserve invalid input for student correction without scoring an answer.');
for (const [startName, endName] of [['offlineAnswerFIB', '_offlineNextQuestion'], ['submitConstructedQuizAnswer', 'renderQuizConstructedInput'], ['submitCriticalDefense', 'populateMasteredVocabulary'], ['submitWbShortAnswer', 'handleWorldBossAnswer']]) {
  const startAt = mainJs.indexOf(`function ${startName}`);
  const endAt = mainJs.indexOf(`function ${endName}`, startAt);
  const block = startAt >= 0 && endAt > startAt ? mainJs.slice(startAt, endAt) : '';
  if (!block.includes('formatEnglishWordInput(')) throw new Error(`English answer path must validate invalid input without scoring: ${startName}`);
}
if (!mainJs.includes('button.textContent = entry.char;') || mainJs.includes('button.textContent = entry.char.toUpperCase();')) throw new Error('Word-order letter tiles must remain lowercase.');
if (!mainJs.includes('formatEnglishWordDisplay(selected.map((entry) => entry.char).join(""))') || !mainJs.includes('formatEnglishWordDisplay(word) : "_ _ _ _"')) throw new Error('Constructed-word answer displays must use initial-cap sentence casing.');
if (!mainJs.includes('normalizeEnglishAnswer(wbUnscrambleCurrentTiles.map(t => t.char).join(""))')) throw new Error('World-boss spelling comparison must ignore spacing consistently.');
if (!worldBossApi.includes("body.action === 'raidStatus'") || !worldBossApi.includes('return { week, day: kstDay(), maxHp, curHp: Math.max(0, maxHp - totalDamage) };') || !worldBossApi.includes('response = { raid, boss };')) throw new Error('World-boss raid start and lightweight polling must return authoritative current/max HP.');
if (!secureAccount.includes('secureWorldBossRaidStatus') || !secureAccount.includes('window._applySecureWorldBossRaidHp?.(boss)') || !mainJs.includes('wbBattleHpSyncInterval = setInterval')) throw new Error('World-boss battle HP must initialize from the server and refresh during the raid.');
if (!mainJs.includes('const currentRemHp = Math.max(0, wbCurBossHp - wbTotalDamageDealt);')) throw new Error('World-boss battle HP must include both shared remaining HP and local unsubmitted damage.');
const genericScriptHeaderAt = vercel.headers?.findIndex((route) => route.source === '/(.*)\\.(css|js)') ?? -1;
const finalServiceWorkerHeaderAt = vercel.headers?.map((route) => route.source).lastIndexOf('/sw.js') ?? -1;
const finalServiceWorkerHeaders = finalServiceWorkerHeaderAt >= 0 ? vercel.headers[finalServiceWorkerHeaderAt]?.headers || [] : [];
if (finalServiceWorkerHeaderAt <= genericScriptHeaderAt || !finalServiceWorkerHeaders.some((header) => header.key === 'Cache-Control' && header.value.includes('no-store')) || !finalServiceWorkerHeaders.some((header) => header.key === 'Vercel-CDN-Cache-Control' && header.value === 'no-store')) throw new Error('Service worker must end with browser and CDN no-store headers.');
if (!vercel.headers?.some((route) => route.headers?.some((header) => header.key === 'Content-Security-Policy' && header.value.includes('https://firebasestorage.googleapis.com')))) throw new Error('Firebase Storage image CSP source is missing.');
if (/Grade [3-6] current list|Elementary 800 missing-word review|curriculum draft - Grade/.test(wordPackText)) throw new Error('Teacher word-pack labels still contain stale English UI text.');
const configuredProjectId = process.env.FIREBASE_PROJECT_ID || process.env.project_id;
if (configuredProjectId && configuredProjectId !== 'vocahero-1876a') throw new Error('Firebase project ID does not match the configured Firebase project.');
if (missing.length) {
  console.log(`Release files are ready. Add these secrets before deployment: ${missing.join(', ')}`);
  process.exitCode = 2;
} else {
  console.log('Release readiness: required secrets and configuration are present.');
}
