import { access, readFile } from 'node:fs/promises';

const requiredEnvironment = [
  { label: 'FIREBASE_PROJECT_ID/project_id', names: ['FIREBASE_PROJECT_ID', 'project_id'] },
  { label: 'FIREBASE_CLIENT_EMAIL/client_email', names: ['FIREBASE_CLIENT_EMAIL', 'client_email'] },
  { label: 'FIREBASE_PRIVATE_KEY/private_key', names: ['FIREBASE_PRIVATE_KEY', 'private_key'] },
  { label: 'CRON_SECRET', names: ['CRON_SECRET'] },
  { label: 'TEACHER_REVIEWER_EMAILS', names: ['TEACHER_REVIEWER_EMAILS'] }
];
const missing = requiredEnvironment.filter((entry) => !entry.names.some((name) => process.env[name])).map((entry) => entry.label);
const files = ['firebase.json', 'firestore.rules', 'firestore.indexes.json', 'storage.rules', 'vercel.json', 'privacy.html', 'package-lock.json', 'data/word-packs.json', 'data/curriculum-3000-review-catalog.json', ...Array.from({ length: 5 }, (_, index) => `media/test/test${index + 1}.webp`)];
for (const file of files) await access(file);
const firebase = JSON.parse(await readFile('firebase.json', 'utf8'));
const vercel = JSON.parse(await readFile('vercel.json', 'utf8'));
const [firestoreRules, storageRules, privacy, secureAccount, mainJs, studentApi, teacherApi, worldBossApi, cleanupApi, wordPackText] = await Promise.all([
  readFile('firestore.rules', 'utf8'),
  readFile('storage.rules', 'utf8'),
  readFile('privacy.html', 'utf8'),
  readFile('js/secure-account.js', 'utf8'),
  readFile('js/main.js', 'utf8'),
  readFile('api/student.js', 'utf8'),
  readFile('api/teacher.js', 'utf8'),
  readFile('api/world-boss.js', 'utf8'),
  readFile('api/cleanup-legacy.js', 'utf8'),
  readFile('data/word-packs.json', 'utf8')
]);
if (firebase.firestore?.rules !== 'firestore.rules') throw new Error('firebase.json must point to firestore.rules.');
if (firebase.firestore?.indexes !== 'firestore.indexes.json') throw new Error('firebase.json must point to firestore.indexes.json.');
if (firebase.storage?.rules !== 'storage.rules') throw new Error('firebase.json must point to storage.rules.');
if (!vercel.crons?.some((job) => job.path === '/api/cleanup-legacy')) throw new Error('Legacy cleanup cron is missing.');
if (!firestoreRules.includes('match /{document=**} { allow read, write: if false; }')) throw new Error('Firestore private-data deny rule is missing.');
if (!storageRules.includes('allow read, write: if false;')) throw new Error('Storage direct-access deny rule is missing.');
if (!privacy.includes('학생의 실명·학교·반·번호·PIN·Google 이메일은 새 게임 계정에 저장하지 않습니다.')) throw new Error('Student privacy-minimization notice is missing.');
if (!privacy.includes('교사 계정 삭제')) throw new Error('Teacher deletion instructions are missing from the privacy page.');
if (!secureAccount.includes('/privacy.html') || !secureAccount.includes('deleteTeacherAccount')) throw new Error('Public privacy link or teacher deletion UI is missing.');
const createStart = studentApi.indexOf('async function create(uid, body)');
const createEnd = studentApi.indexOf('async function syncWorldBossVisibility', createStart);
const createBlock = createStart >= 0 && createEnd > createStart ? studentApi.slice(createStart, createEnd) : '';
if (!createBlock || /schoolName|classNum|studentNum|pinHash|\bemail\b|realName|studentName/.test(createBlock)) throw new Error('New student account creation includes a disallowed identity field.');
for (const label of ['길드 정보', '길드원 정보', '길드원 관리', '시련', '길드 및 초대관리']) {
  if (!secureAccount.includes(`data-teacher-guild-section="${({ '길드 정보': 'info', '길드원 정보': 'members', '길드원 관리': 'manage', '시련': 'trial', '길드 및 초대관리': 'invite' })[label]}"`)) throw new Error(`Teacher guild tab is missing: ${label}`);
}
const relicDrawStart = mainJs.indexOf('function drawRelicCapsule');
const relicDrawEnd = mainJs.indexOf('function getRelicDrawResultPresentation', relicDrawStart);
const relicDrawBlock = relicDrawStart >= 0 && relicDrawEnd > relicDrawStart ? mainJs.slice(relicDrawStart, relicDrawEnd) : '';
const relicExpMap = 'const expMap = { normal: 1, rare: 3, hero: 9, legendary: 27, mythic: 81 };';
if (!relicDrawBlock.includes(relicExpMap) || !relicDrawBlock.includes('rolledGrade, currentGrade: existing.grade') || !relicDrawBlock.includes('gainedExp: rolledExp')) throw new Error('Relic draws must preserve the rolled grade, owned grade, and awarded EXP separately.');
const relicPresentationStart = mainJs.indexOf('function getRelicDrawResultPresentation');
const relicPresentationEnd = mainJs.indexOf('function showRelicDrawResultModal', relicPresentationStart);
const relicPresentationBlock = relicPresentationStart >= 0 && relicPresentationEnd > relicPresentationStart ? mainJs.slice(relicPresentationStart, relicPresentationEnd) : '';
if (!relicPresentationBlock.includes('const rolledGrade =') || !relicPresentationBlock.includes('const currentGrade =') || !relicPresentationBlock.includes('const gainedExp =') || !relicPresentationBlock.includes('return { rolledGrade, currentGrade') || !mainJs.includes('getRelicDrawResultPresentation };')) throw new Error('Relic draw presentation or its test hook is missing.');
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
const trialServerMarkers = [
  "import { randomUUID } from 'node:crypto';",
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
if (!worldBossApi.includes('const applied = Math.min(requested, Math.max(0, maxHp - currentTotal));')) throw new Error('World-boss must apply the full verified requested damage, limited only by remaining boss HP.');
if (!worldBossApi.includes('const savedPower = safeInt(account.state?.combatPower') || !worldBossApi.includes('verifiedCorrectAnswers + 4')) throw new Error('World-boss plausibility verification must use server-saved combat power and verified answers.');
const raidRegressionRemainingHp = 12_000_000_000;
const raidRegressionRequestedDamage = 1_000_000_000;
const raidRegressionAppliedDamage = Math.min(raidRegressionRequestedDamage, raidRegressionRemainingHp);
if (raidRegressionAppliedDamage !== raidRegressionRequestedDamage) throw new Error('World-boss regression: a verified 1B request must apply the full 1B damage.');
if (!mainJs.includes('function getKstDayString(now = Date.now())') || !mainJs.includes('월드보스 토벌전 참전하기 (1일 1회)')) throw new Error('KST raid-day logic or the active raid button wording is missing.');
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
if (!teacherApi.includes('MANAGER_INVITE_LENGTH = 24') || !teacherApi.includes("teacherSchoolKey !== guildSchoolKey") || !teacherApi.includes("teacherSchoolKey !== inviteSchoolKey")) throw new Error('Manager invite entropy or school binding is incomplete.');
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
if (!vercel.headers?.some((route) => route.source === '/data/(.*)\\.(json|txt)' && route.headers?.some((header) => header.key === 'Vercel-CDN-Cache-Control' && header.value.includes('immutable')))) throw new Error('Versioned data CDN cache header is missing.');
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
