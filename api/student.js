import { adminAuth, adminDb, FieldValue } from './_firebase-admin.js';
import { apiError, handleApiError, hash, isExpired, normalizeNickname, readBody, requireMethod, requireUser, safeInt, sendJson, text } from './_http.js';

const accounts = adminDb.collection('accounts');
const classes = adminDb.collection('classes');
const leaderboard = adminDb.collection('leaderboard');
const invites = adminDb.collection('classInvites');
const legacyUsers = adminDb.collection('users');
const REVIEW_PACK_ID = 'elementary-800-missing-review';
const ASSIGNABLE_WORD_PACK_IDS = new Set(['grade-3-current','grade-4-current','grade-5-current','grade-6-current','curriculum-2022-grade-3','curriculum-2022-grade-4','curriculum-2022-grade-5','curriculum-2022-grade-6',REVIEW_PACK_ID]);
const defaultWordPack = (grade) => `grade-${grade}-current`;
function classPack(grade, wordPackId) { return ASSIGNABLE_WORD_PACK_IDS.has(wordPackId) ? wordPackId : defaultWordPack(grade); }
const fields = new Set(['avatarType','gold','accGold','helmetLvl','armorLvl','weaponLvl','shieldLvl','shoesLvl','petType','petLvl','petLevels','stage','progress','totalQuizTries','totalQuizCorrect','masteredWords','currentQuizIndex','skillsInventory','equippedSkills','activeSkillDeck','skillEssence','lockedPotentialSlots','wrongWordCounts','masteryPoints','necklaceLvl','braceletLvl','ringLvl','acquiredRelics','equippedRelicId','gearPotentials','isPotentialUnlocked','equippedTitle','wbTitle','unlockedTitles','bossTokens','relicEssence','soundSettings','tutorialCompleted','lastSaved']);

function defaultState() { return { avatarType:'male', gold:0, accGold:0, helmetLvl:1, armorLvl:1, weaponLvl:1, shieldLvl:1, shoesLvl:1, stage:1, progress:0, totalQuizTries:0, totalQuizCorrect:0, masteredWords:[], skillsInventory:[], equippedSkills:[], activeSkillDeck:[], skillEssence:0, wrongWordCounts:{}, masteryPoints:0, tutorialCompleted:false }; }
function cleanState(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw apiError(400,'INVALID_STATE','저장할 학습 기록 형식이 올바르지 않아요.');
  const state = {};
  fields.forEach((key) => { if (Object.hasOwn(input,key)) state[key] = input[key]; });
  ['gold','accGold','helmetLvl','armorLvl','weaponLvl','shieldLvl','shoesLvl','petLvl','stage','progress','totalQuizTries','totalQuizCorrect','currentQuizIndex','masteryPoints','necklaceLvl','braceletLvl','ringLvl','bossTokens','relicEssence'].forEach((key) => { if (Object.hasOwn(state,key)) state[key]=safeInt(state[key],0,0,9999999999); });
  if (state.masteredWords && !Array.isArray(state.masteredWords)) delete state.masteredWords;
  if (state.skillsInventory && !Array.isArray(state.skillsInventory)) delete state.skillsInventory;
  if ((state.masteredWords?.length||0)>5000 || (state.skillsInventory?.length||0)>1000 || Buffer.byteLength(JSON.stringify(state),'utf8')>600000) throw apiError(400,'STATE_TOO_LARGE','저장할 학습 기록이 너무 커요.');
  return state;
}
function score(state) { return safeInt(state.totalQuizCorrect,0,0)*1000 + (Array.isArray(state.masteredWords)?state.masteredWords.length:0)*10 + Math.min(safeInt(state.stage,1,1),999); }
function publicAccount(data) { return { nickname:data.nickname, learningGrade:data.learningGrade, state:{...defaultState(),...(data.state||{})}, freeNicknameChangeUsed:Boolean(data.freeNicknameChangeUsed), renameCount:safeInt(data.renameCount,0,0), leaderboardOptIn:Boolean(data.leaderboardOptIn), classIds:Array.isArray(data.classIds)?data.classIds:[], activeGuildName:text(data.activeGuildName,40)||null, legacyGoogleLinked:Boolean(data.legacyGoogleLinked) }; }
function legacyLearningGrade(data, fallback=4) { return safeInt(data?.grade, safeInt(data?.learningGrade, fallback, 3, 6), 3, 6); }
async function loadAccount(uid) {
  const ref=accounts.doc(uid),snap=await ref.get();if(!snap.exists)return null;
  let data=snap.data();
  if(!data.activeGuildName&&data.activeClassId){const assignment=await assignedWordPack(uid);if(assignment.classLabel){const update={activeGuildName:assignment.classLabel,updatedAt:FieldValue.serverTimestamp()};await ref.update(update);data={...data,...update};}}
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
  if (!accountSnap.exists) return { wordPackId: null };
  const account = accountSnap.data();
  const classIds = Array.isArray(account.classIds) ? account.classIds.slice(0, 100) : [];
  const orderedIds = [account.activeClassId, ...classIds.filter((id) => id !== account.activeClassId)].filter(Boolean);
  for (const classId of orderedIds) {
    const classSnap = await adminDb.collection('classes').doc(classId).get();
    if (!classSnap.exists) continue;
    const classroom = classSnap.data();
    if (!classIds.includes(classId)) continue;
    return { classId, classLabel: classroom.guildName || classroom.classLabel || '길드', wordPackId: classPack(classroom.grade, classroom.wordPackId) };
  }
  return { wordPackId: null };
}
function normalizedTrialAnswer(value) { return text(value, 160).normalize('NFKC').trim().toLowerCase().replace(/[.!?,'’\-]/g, '').replace(/\s+/g, ' '); }
async function loadGuildTrial(uid) {
  const assignment = await assignedWordPack(uid);
  if (!assignment.classId) return { guildName: null, wordPackId: null, guildCoins: 0, trial: null };
  const classRef = adminDb.collection('classes').doc(assignment.classId);
  const memberRef = classRef.collection('members').doc(uid);
  const [classSnap, memberSnap] = await Promise.all([classRef.get(), memberRef.get()]);
  if (!classSnap.exists || !memberSnap.exists) return { guildName: assignment.classLabel || null, wordPackId: assignment.wordPackId || null, guildCoins: 0, trial: null };
  const guildCoins = safeInt(memberSnap.data()?.guildCoins, 0, 0, 1000000000);
  const trialId = text(classSnap.data()?.activeTrialId, 128);
  if (!trialId) return { guildName: assignment.classLabel, wordPackId: assignment.wordPackId, guildCoins, trial: null };
  const trialRef = classRef.collection('trials').doc(trialId);
  const [trialSnap, completionSnap, progressSnap] = await Promise.all([trialRef.get(), trialRef.collection('completions').doc(uid).get(), trialRef.collection('progress').doc(uid).get()]);
  if (!trialSnap.exists || completionSnap.exists) return { guildName: assignment.classLabel, wordPackId: assignment.wordPackId, guildCoins, trial: null };
  const trial = trialSnap.data();
  if (trial.status !== 'active' || isExpired(trial.expiresAt) || !Array.isArray(trial.words)) return { guildName: assignment.classLabel, wordPackId: assignment.wordPackId, guildCoins, trial: null };
  return {
    guildName: assignment.classLabel,
    wordPackId: assignment.wordPackId,
    guildCoins,
    trial: {
      id: trialId,
      words: trial.words.slice(0, 20).map((entry) => ({ word: text(entry?.word, 80), meaning: text(entry?.meaning, 160), type: text(entry?.type, 32) })).filter((entry) => entry.word && entry.meaning),
      maxHints: safeInt(trial.maxHints, Math.max(1, Math.ceil(trial.words.length / 5)), 1, 20),
      hintsUsed: safeInt(progressSnap.data()?.hintsUsed, 0, 0, 20),
      attemptCount: safeInt(progressSnap.data()?.attemptCount, 0, 0, 10000),
      retryCount: safeInt(progressSnap.data()?.retryCount, 0, 0, 10000),
      rewardGuildCoins: safeInt(trial.rewardGuildCoins, 0, 0, 1000),
      expiresAt: trial.expiresAt?.toDate?.().toISOString?.() || null
    }
  };
}
async function loadGuildOverview(uid) {
  const guild = await loadGuildTrial(uid);
  const assignment = await assignedWordPack(uid);
  if (!assignment.classId) return { ...guild, memberCount: 0, guildTotalCorrect: 0, guildMasteredCount: 0, members: [] };
  const classRef = classes.doc(assignment.classId);
  const membersRef = classRef.collection('members');
  const [classSnap, ownMemberSnap, membersSnap, memberCountSnap] = await Promise.all([
    classRef.get(),
    membersRef.doc(uid).get(),
    membersRef.select('nickname', 'learningGrade', 'stage', 'totalCorrect', 'masteredCount', 'lastActiveAt').limit(200).get(),
    membersRef.count().get()
  ]);
  if (!classSnap.exists || !ownMemberSnap.exists) return { ...guild, memberCount: 0, guildTotalCorrect: 0, guildMasteredCount: 0, members: [] };
  const members = membersSnap.docs.map((member) => {
    const data = member.data() || {};
    return {
      nickname: text(data.nickname, 30) || '이름 없는 용사',
      learningGrade: safeInt(data.learningGrade, 4, 3, 6),
      stage: safeInt(data.stage, 1, 1, 9999),
      totalCorrect: safeInt(data.totalCorrect, 0, 0, 1000000000),
      masteredCount: safeInt(data.masteredCount, 0, 0, 100000),
      isMe: member.id === uid,
      lastActiveAt: data.lastActiveAt?.toDate?.().toISOString?.() || null
    };
  }).sort((a, b) => b.totalCorrect - a.totalCorrect || b.masteredCount - a.masteredCount || a.nickname.localeCompare(b.nickname));
  return {
    ...guild,
    guildName: text(classSnap.data()?.guildName || classSnap.data()?.classLabel, 40) || guild.guildName,
    memberCount: safeInt(memberCountSnap.data()?.count, members.length, 0),
    guildTotalCorrect: members.reduce((sum, member) => sum + member.totalCorrect, 0),
    guildMasteredCount: members.reduce((sum, member) => sum + member.masteredCount, 0),
    members
  };
}
async function guildTrialEvent(uid, body) {
  const trialId = text(body.trialId, 128);
  const event = text(body.event, 24);
  const attemptId = text(body.attemptId, 128);
  if (!trialId || !['start', 'attempt', 'hint'].includes(event) || (event === 'attempt' && attemptId.length < 8)) throw apiError(400, 'INVALID_TRIAL_EVENT', '시련 진행 정보를 확인해 주세요.');
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
    const current = progressSnap.data() || {};
    if (completionSnap.exists) return { completed: true, attemptCount: safeInt(current.attemptCount, 0, 0), retryCount: safeInt(current.retryCount, 0, 0), hintsUsed: safeInt(current.hintsUsed, 0, 0), hintsRemaining: 0 };
    const update = { updatedAt: FieldValue.serverTimestamp() };
    if (!progressSnap.exists) update.startedAt = FieldValue.serverTimestamp();
    let attemptCount = safeInt(current.attemptCount, 0, 0, 10000);
    let retryCount = safeInt(current.retryCount, 0, 0, 10000);
    let hintsUsed = safeInt(current.hintsUsed, 0, 0, 10000);
    const maxHints = safeInt(trial.maxHints, Math.max(1, Math.ceil((trial.words?.length || 5) / 5)), 1, 20);
    if (event === 'attempt') {
      if (attemptId === text(current.lastAttemptId, 128)) return { completed: false, attemptCount, retryCount, hintsUsed, hintsRemaining: Math.max(0, maxHints - hintsUsed) };
      if (attemptCount > 0) retryCount += 1;
      attemptCount += 1;
      update.attemptCount = attemptCount;
      update.retryCount = retryCount;
      update.lastAttemptId = attemptId;
      update.lastWrongCount = safeInt(body.wrongCount, 0, 0, 20);
      update.lastAttemptAt = FieldValue.serverTimestamp();
    } else if (event === 'hint') {
      if (hintsUsed >= maxHints) throw apiError(409, 'NO_TRIAL_HINTS', '이번 시련에서 사용할 수 있는 힌트를 모두 사용했어요.');
      hintsUsed += 1;
      update.hintsUsed = hintsUsed;
      update.lastHintAt = FieldValue.serverTimestamp();
    }
    tx.set(progressRef, update, { merge: true });
    return { completed: false, attemptCount, retryCount, hintsUsed, hintsRemaining: Math.max(0, maxHints - hintsUsed) };
  });
}
async function syncGuildMemberProgress(uid, data) {
  const classIds = Array.isArray(data?.classIds) ? data.classIds.slice(0, 20) : [];
  const state = data?.state || {};
  await Promise.all(classIds.map((classId) => classes.doc(classId).collection('members').doc(uid).set({
    nickname: data.nickname,
    learningGrade: data.learningGrade,
    totalCorrect: safeInt(state.totalQuizCorrect, 0, 0),
    masteredCount: Array.isArray(state.masteredWords) ? state.masteredWords.length : 0,
    stage: safeInt(state.stage, 1, 1, 9999),
    lastActiveAt: FieldValue.serverTimestamp()
  }, { merge: true })));
}
let guildRankCache = { expiresAt: 0, rows: [] };
async function guildLeaderboard() {
  if (guildRankCache.expiresAt > Date.now()) return guildRankCache.rows;
  const classSnaps = await classes.limit(50).get();
  const rows = await Promise.all(classSnaps.docs.map(async (classSnap) => {
    const memberQuery = classSnap.ref.collection('members');
    const [members, memberCountSnap] = await Promise.all([
      memberQuery.select('totalCorrect', 'masteredCount').limit(100).get(),
      memberQuery.count().get()
    ]);
    let totalCorrect = 0; let masteredCount = 0;
    members.docs.forEach((member) => {
      totalCorrect += safeInt(member.data()?.totalCorrect, 0, 0);
      masteredCount += safeInt(member.data()?.masteredCount, 0, 0);
    });
    return { id: classSnap.id, guildName: text(classSnap.data()?.guildName || classSnap.data()?.classLabel, 40) || '이름 없는 길드', memberCount: safeInt(memberCountSnap.data()?.count, members.size, 0), totalCorrect, masteredCount };
  }));
  const ranked = rows.filter((row) => row.memberCount > 0).sort((a, b) => b.totalCorrect - a.totalCorrect || b.masteredCount - a.masteredCount || a.guildName.localeCompare(b.guildName)).slice(0, 50).map((row, index) => ({ ...row, rank: index + 1 }));
  guildRankCache = { expiresAt: Date.now() + 60_000, rows: ranked };
  return ranked;
}
async function completeGuildTrial(uid, body) {
  const trialId = text(body.trialId, 128);
  const answers = Array.isArray(body.answers) ? body.answers.slice(0, 20) : [];
  if (!trialId || !answers.length) throw apiError(400, 'INVALID_TRIAL_ANSWERS', '시련 답안을 확인해 주세요.');
  const assignment = await assignedWordPack(uid);
  if (!assignment.classId) throw apiError(403, 'GUILD_REQUIRED', '참여 중인 길드가 없어요.');
  const classRef = adminDb.collection('classes').doc(assignment.classId);
  const trialRef = classRef.collection('trials').doc(trialId);
  const memberRef = classRef.collection('members').doc(uid);
  const completionRef = trialRef.collection('completions').doc(uid);
  const answerMap = new Map(answers.map((entry) => [text(entry?.word, 80).toLowerCase(), normalizedTrialAnswer(entry?.answer)]));
  return adminDb.runTransaction(async (tx) => {
    const [classSnap, trialSnap, memberSnap, completionSnap] = await Promise.all([tx.get(classRef), tx.get(trialRef), tx.get(memberRef), tx.get(completionRef)]);
    if (!classSnap.exists || !memberSnap.exists) throw apiError(403, 'GUILD_REQUIRED', '참여 중인 길드를 확인해 주세요.');
    if (text(classSnap.data()?.activeTrialId, 128) !== trialId || !trialSnap.exists) throw apiError(409, 'TRIAL_REPLACED', '선생님이 새 시련을 보냈어요. 새 문제를 불러와 주세요.');
    const trial = trialSnap.data();
    if (trial.status !== 'active' || isExpired(trial.expiresAt)) throw apiError(409, 'TRIAL_EXPIRED', '이 시련의 도전 기간이 끝났어요.');
    const words = Array.isArray(trial.words) ? trial.words.slice(0, 20) : [];
    const allCorrect = words.length >= 5 && words.every((entry) => answerMap.get(text(entry?.word, 80).toLowerCase()) === normalizedTrialAnswer(entry?.meaning));
    if (!allCorrect) throw apiError(409, 'TRIAL_NOT_MASTERED', '아직 정복하지 못한 단어가 있어요. 다시 도전해 주세요.');
    const currentCoins = safeInt(memberSnap.data()?.guildCoins, 0, 0, 1000000000);
    if (completionSnap.exists) return { alreadyCompleted: true, rewardGuildCoins: 0, guildCoins: currentCoins };
    const rewardGuildCoins = safeInt(trial.rewardGuildCoins, words.length * 5, 0, 1000);
    const guildCoins = currentCoins + rewardGuildCoins;
    tx.set(completionRef, { uid, correctCount: words.length, rewardGuildCoins, completedAt: FieldValue.serverTimestamp() });
    tx.set(memberRef, { guildCoins, lastTrialCompletedAt: FieldValue.serverTimestamp() }, { merge: true });
    return { alreadyCompleted: false, rewardGuildCoins, guildCoins };
  });
}
async function publish(uid, data) {
  if (!data.leaderboardOptIn) return leaderboard.doc(uid).delete();
  const state=data.state||defaultState();
  return leaderboard.doc(uid).set({
    nickname:data.nickname,
    guildName:text(data.activeGuildName,40)||null,
    titleName:text(state.equippedTitle||state.wbTitle,80)||null,
    score:score(state),
    stage:safeInt(state.stage,1,1),
    progress:safeInt(state.progress,0,0,100),
    gold:safeInt(state.accGold ?? state.gold,0,0),
    correctCount:safeInt(state.totalQuizCorrect,0,0),
    updatedAt:FieldValue.serverTimestamp()
  });
}
function guardProgress(previous,next,updatedAt) {
  const oldCorrect=safeInt(previous?.totalQuizCorrect,0,0); const correct=safeInt(next.totalQuizCorrect,0,0);
  const minutes=Math.max(0,(Date.now()-(updatedAt?.toMillis?.()||Date.now()))/60000);
  if (correct>oldCorrect+Math.floor(minutes*120)+30) throw apiError(409,'PROGRESS_RATE_LIMIT','학습 기록이 너무 빠르게 증가해 저장을 잠시 멈췄어요. 잠시 후 다시 저장해 주세요.');
  if (correct<oldCorrect) next.totalQuizCorrect=oldCorrect;
  if (safeInt(next.totalQuizTries,0,0)<next.totalQuizCorrect) next.totalQuizTries=next.totalQuizCorrect;
  const maxStage=Math.max(safeInt(previous?.stage,1,1),Math.floor(next.totalQuizCorrect/10)+2);
  if (safeInt(next.stage,1,1)>maxStage) next.stage=maxStage;
  if (Array.isArray(next.masteredWords) && next.masteredWords.length>next.totalQuizCorrect) next.masteredWords=next.masteredWords.slice(0,next.totalQuizCorrect);
  return next;
}
async function create(uid, body) {
  const ref=accounts.doc(uid); const existing=await ref.get(); if (existing.exists) return publicAccount(existing.data());
  if (body.privacyConsent !== true) throw apiError(400,'CONSENT_REQUIRED','학습 기록 저장 안내에 동의해야 시작할 수 있어요.');
  const data={schemaVersion:2,role:'student',nickname:normalizeNickname(body.nickname),learningGrade:safeInt(body.learningGrade,4,3,6),state:defaultState(),freeNicknameChangeUsed:false,renameCount:0,leaderboardOptIn:Boolean(body.leaderboardOptIn),consentVersion:'student-v1',consentAt:FieldValue.serverTimestamp(),classIds:[],createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()};
  await ref.create(data); await publish(uid,data); return publicAccount(data);
}
async function syncWorldBossVisibility(uid, accountData) {
  const account=accountData||((await accounts.doc(uid).get()).data()||null);if(!account)return;
  const ref=adminDb.collection('world_bosses').doc(`global_week_${currentBossWeek()}`).collection('contributions').doc(uid);
  const snap=await ref.get();if(!snap.exists)return;
  const visible=Boolean(account.leaderboardOptIn);
  await ref.update({publicLeaderboard:visible,publicNickname:visible?account.nickname:null,publicGuildName:visible?(text(account.activeGuildName,40)||null):null,publicTitleName:visible?(text(account.state?.equippedTitle||account.state?.wbTitle,80)||null):null,updatedAt:FieldValue.serverTimestamp()});
}async function save(uid, body) {
  const requested=cleanState(body.state); const optIn=typeof body.leaderboardOptIn==='boolean'?body.leaderboardOptIn:null; const ref=accounts.doc(uid);
  const data=await adminDb.runTransaction(async tx=>{const snap=await tx.get(ref);if(!snap.exists)throw apiError(404,'PROFILE_NOT_FOUND','먼저 용사를 만들어 주세요.');const current=snap.data();const state=guardProgress(current.state||defaultState(),requested,current.updatedAt);const update={state,updatedAt:FieldValue.serverTimestamp()};if(optIn!==null)update.leaderboardOptIn=optIn;tx.update(ref,update);return {...current,...update,state};});
  await Promise.all([publish(uid,data),syncWorldBossVisibility(uid,data),syncGuildMemberProgress(uid,data)]);return publicAccount(data);
}
async function rename(uid, body) {
  const nickname=normalizeNickname(body.nickname);const ref=accounts.doc(uid);
  const data=await adminDb.runTransaction(async tx=>{const snap=await tx.get(ref);if(!snap.exists)throw apiError(404,'PROFILE_NOT_FOUND','먼저 용사를 만들어 주세요.');const current=snap.data();const first=!current.freeNicknameChangeUsed;const cost=first?0:500;const state={...defaultState(),...(current.state||{})};if(safeInt(state.masteryPoints,0,0)<cost)throw apiError(409,'NOT_ENOUGH_FP',`${cost} FP가 있어야 닉네임을 변경할 수 있어요.`);state.masteryPoints-=cost;const update={nickname,state,freeNicknameChangeUsed:true,renameCount:safeInt(current.renameCount,0,0)+1,updatedAt:FieldValue.serverTimestamp()};tx.update(ref,update);return {...current,...update};});
  await Promise.all((data.classIds||[]).slice(0,100).map(id=>adminDb.collection('classes').doc(id).collection('members').doc(uid).set({nickname:data.nickname},{merge:true})));
  await Promise.all([publish(uid,data),syncWorldBossVisibility(uid,data)]);return {account:publicAccount(data),cost:data.renameCount===1?0:500};
}
async function joinClass(uid, body) {
  const code=text(body.code,32).toUpperCase().replace(/[^A-Z0-9]/g,'');if(code.length<6)throw apiError(400,'INVALID_INVITE','길드 초대 코드를 확인해 주세요.');
  const inviteRef=invites.doc(hash(code));const accountRef=accounts.doc(uid);
  const membership=await adminDb.runTransaction(async tx=>{const inviteSnap=await tx.get(inviteRef);if(!inviteSnap.exists||inviteSnap.data().type!=='student'||isExpired(inviteSnap.data().expiresAt))throw apiError(404,'INVITE_NOT_FOUND','길드 초대 코드를 확인해 주세요.');const invite=inviteSnap.data(),classRef=adminDb.collection('classes').doc(invite.classId);const [accountSnap,classSnap]=await Promise.all([tx.get(accountRef),tx.get(classRef)]);if(!accountSnap.exists)throw apiError(404,'PROFILE_NOT_FOUND','먼저 용사를 만들어 주세요.');if(!classSnap.exists)throw apiError(404,'GUILD_NOT_FOUND','길드를 찾지 못했어요.');const account=accountSnap.data(),classLabel=text(classSnap.data().guildName||classSnap.data().classLabel||invite.classLabel,40)||'길드';tx.set(classRef.collection('members').doc(uid),{nickname:account.nickname,learningGrade:account.learningGrade,totalCorrect:safeInt(account.state?.totalQuizCorrect,0,0),masteredCount:Array.isArray(account.state?.masteredWords)?account.state.masteredWords.length:0,stage:safeInt(account.state?.stage,1,1,9999),joinedAt:FieldValue.serverTimestamp(),lastActiveAt:FieldValue.serverTimestamp()},{merge:true});tx.update(accountRef,{classIds:FieldValue.arrayUnion(invite.classId),activeClassId:invite.classId,activeGuildName:classLabel,updatedAt:FieldValue.serverTimestamp()});return {classId:invite.classId,classLabel};});
  const updated=await accountRef.get();if(updated.exists)await Promise.all([publish(uid,updated.data()),syncWorldBossVisibility(uid,updated.data())]);return membership;
}
function legacyIds(c) { const school=text(c.schoolName,120), grade=safeInt(c.grade,0,3,6), room=safeInt(c.classNum,0,1,99), number=safeInt(c.studentNum,0,1,99), name=text(c.name,30);if(!school||!grade||!room||!number||!name)throw apiError(400,'INVALID_LEGACY_INFO','기존 계정 정보를 모두 입력해 주세요.');const suffix=`${grade}_${room}_${number}_${name}`;return [`${school}_${suffix}`,`Unknown_${suffix}`]; }
const KST_OFFSET_MS=9*60*60*1000, WEEK_MS=7*24*60*60*1000, EPOCH_MONDAY_MS=Date.UTC(2024,6,1);
function currentBossWeek(now=Date.now()){const kst=new Date(now+KST_OFFSET_MS);const midnight=Date.UTC(kst.getUTCFullYear(),kst.getUTCMonth(),kst.getUTCDate());const monday=midnight-((new Date(midnight).getUTCDay()+6)%7)*24*60*60*1000;return Math.floor((monday-EPOCH_MONDAY_MS)/WEEK_MS);}
function legacyBossKey(credentials){const grade=safeInt(credentials?.grade,0,3,6),room=safeInt(credentials?.classNum,0,1,99),number=safeInt(credentials?.studentNum,0,1,99),name=text(credentials?.name,30);return grade&&room&&number&&name?`${grade}_${room}_${number}_${name}`:null;}
async function transferCurrentBossRecord({toUid,fromUid='',credentials,nickname,publicLeaderboard}){const key=legacyBossKey(credentials),ref=adminDb.collection('world_bosses').doc(`global_week_${currentBossWeek()}`),targetRef=ref.collection('contributions').doc(toUid),sourceRef=fromUid&&fromUid!==toUid?ref.collection('contributions').doc(fromUid):null;await adminDb.runTransaction(async tx=>{const reads=[tx.get(ref),tx.get(targetRef)];if(sourceRef)reads.push(tx.get(sourceRef));const [bossSnap,targetSnap,sourceSnap]=await Promise.all(reads);if(!bossSnap.exists)return;const boss=bossSnap.data()||{},target=targetSnap.data()||{},source=sourceSnap?.data()||{};const legacyDamage=key?safeInt(boss.damages?.[key],0,0,100000000000):0;const importedLegacy=source.legacyImported?0:legacyDamage;const damage=safeInt(target.damage,0,0)+safeInt(source.damage,0,0)+importedLegacy;if(!damage)return;const legacyDay=key&&typeof boss.lastPlayedDates?.[key]==='string'?boss.lastPlayedDates[key]:null;tx.set(targetRef,{damage,lastPlayedKstDay:target.lastPlayedKstDay||source.lastPlayedKstDay||legacyDay||null,publicLeaderboard:Boolean(publicLeaderboard),publicNickname:publicLeaderboard?nickname:null,legacyImported:Boolean(target.legacyImported||source.legacyImported||legacyDamage),updatedAt:FieldValue.serverTimestamp()},{merge:true});if(sourceRef)tx.delete(sourceRef);});}function legacyState(data) { let extra={};try{extra=typeof data.extraData==='string'?JSON.parse(data.extraData||'{}'):(data.extraData||{});}catch{}return {...defaultState(),...cleanState({...data,...extra})}; }
async function migrateGoogleLegacy(uid, body) {
  const nickname=normalizeNickname(body.nickname),requestedGrade=safeInt(body.learningGrade,4,3,6),ref=accounts.doc(uid);
  const matches=await legacyUsers.where('linkedGoogleUid','==',uid).limit(2).get();
  if(matches.empty)throw apiError(404,'LEGACY_GOOGLE_NOT_FOUND','이 Google 계정에 연결된 기존 게임 기록을 찾지 못했어요.');
  if(matches.size!==1)throw apiError(409,'LEGACY_GOOGLE_AMBIGUOUS','기존 Google 연동 기록이 여러 개예요. 기존 기록 입력 방식을 이용해 주세요.');
  const legacyRef=matches.docs[0].ref;
  const data=await adminDb.runTransaction(async tx=>{const [now,legacySnap]=await Promise.all([tx.get(ref),tx.get(legacyRef)]);if(now.data()?.legacyMigratedAt||now.data()?.legacyGoogleMigratedAt)throw apiError(409,'ALREADY_MIGRATED','이 새 계정은 이미 기존 기록을 가져왔어요.');if(!legacySnap.exists)throw apiError(404,'LEGACY_NOT_FOUND','기존 게임 기록을 찾지 못했어요.');const old=legacySnap.data(),grade=legacyLearningGrade(old,requestedGrade);if(old.linkedGoogleUid!==uid)throw apiError(403,'LEGACY_GOOGLE_MISMATCH','기존 Google 연결 정보가 일치하지 않아요.');if(old.migratedTo&&old.migratedTo!==uid)throw apiError(409,'LEGACY_ALREADY_MOVED','이 기존 기록은 이미 새 계정으로 옮겨졌어요.');const next={schemaVersion:2,role:'student',nickname,learningGrade:grade,state:legacyState(old),freeNicknameChangeUsed:false,renameCount:0,leaderboardOptIn:Boolean(body.leaderboardOptIn),classIds:[],legacyGoogleLinked:Boolean(old.linkedGoogleUid),legacyGoogleMigratedAt:FieldValue.serverTimestamp(),createdAt:now.data()?.createdAt||FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()};tx.set(ref,next,{merge:true});tx.update(legacyRef,{migratedTo:uid,migratedAt:FieldValue.serverTimestamp()});return next;});await publish(uid,data);return publicAccount(data);
}
async function migrate(uid, body) {
  const pin=text(body.pin,12);if(!/^\d{4}$/.test(pin))throw apiError(400,'INVALID_PIN','기존 4자리 PIN 번호를 입력해 주세요.');
  const credentials=body.credentials||{},ids=legacyIds(credentials),nickname=normalizeNickname(body.nickname),requestedGrade=safeInt(body.learningGrade,4,3,6),ref=accounts.doc(uid);
  const data=await adminDb.runTransaction(async tx=>{const now=await tx.get(ref);if(now.data()?.legacyMigratedAt)throw apiError(409,'ALREADY_MIGRATED','이 새 계정은 이미 기존 기록을 가져왔어요.');let legacyRef,legacySnap;for(const id of ids){const candidate=legacyUsers.doc(id),snap=await tx.get(candidate);if(snap.exists){legacyRef=candidate;legacySnap=snap;break;}}if(!legacySnap)throw apiError(404,'LEGACY_NOT_FOUND','기존 게임 기록을 찾지 못했어요.');const old=legacySnap.data(),grade=legacyLearningGrade(old,safeInt(credentials.grade,requestedGrade,3,6));if(String(old.password||'')!==pin)throw apiError(401,'LEGACY_PIN_MISMATCH','기존 PIN 번호가 일치하지 않아요.');if(old.migratedTo&&old.migratedTo!==uid)throw apiError(409,'LEGACY_ALREADY_MOVED','이 기존 기록은 이미 새 계정으로 옮겨졌어요. “이전 계정 로그인(구글 연동 오류로 다시 접속)”을 이용해 주세요.');const next={schemaVersion:2,role:'student',nickname,learningGrade:grade,state:legacyState(old),freeNicknameChangeUsed:false,renameCount:0,leaderboardOptIn:Boolean(body.leaderboardOptIn),classIds:[],legacyGoogleLinked:Boolean(old.linkedGoogleUid),legacyMigratedAt:FieldValue.serverTimestamp(),createdAt:now.data()?.createdAt||FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()};tx.set(ref,next,{merge:true});tx.update(legacyRef,{migratedTo:uid,migratedAt:FieldValue.serverTimestamp()});return next;});
  await Promise.all([publish(uid,data),transferCurrentBossRecord({toUid:uid,credentials,nickname:data.nickname,publicLeaderboard:data.leaderboardOptIn})]);return publicAccount(data);
}async function recoverMigratedLegacy(uid, body) {
  const pin=text(body.pin,12);if(!/^\d{4}$/.test(pin))throw apiError(400,'INVALID_PIN','기존 4자리 PIN 번호를 입력해 주세요.');
  const credentials=body.credentials||{},ids=legacyIds(credentials),targetRef=accounts.doc(uid);let sourceUid='';
  const data=await adminDb.runTransaction(async tx=>{const target=await tx.get(targetRef);if(target.exists)throw apiError(409,'RECOVERY_TARGET_EXISTS','현재 계정에 이미 학습 기록이 있어 복구할 수 없어요. 처음 화면에서 새로 시작해 주세요.');let legacyRef,legacySnap;for(const id of ids){const candidate=legacyUsers.doc(id),snap=await tx.get(candidate);if(snap.exists){legacyRef=candidate;legacySnap=snap;break;}}if(!legacySnap)throw apiError(404,'LEGACY_NOT_FOUND','기존 게임 기록을 찾지 못했어요.');const old=legacySnap.data();if(String(old.password||'')!==pin)throw apiError(401,'LEGACY_PIN_MISMATCH','기존 PIN 번호가 일치하지 않아요.');sourceUid=text(old.migratedTo,128);if(!sourceUid||sourceUid===uid)throw apiError(409,'RECOVERY_NOT_NEEDED','복구할 이전 계정을 찾지 못했어요. 기존 기록 가져오기를 이용해 주세요.');const sourceRef=accounts.doc(sourceUid),sourceSnap=await tx.get(sourceRef);if(!sourceSnap.exists)throw apiError(404,'RECOVERY_SOURCE_NOT_FOUND','이전한 계정의 학습 기록을 찾지 못했어요.');const next={...sourceSnap.data(),learningGrade:legacyLearningGrade(old,sourceSnap.data().learningGrade),recoveredAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()};tx.create(targetRef,next);tx.delete(sourceRef);tx.update(legacyRef,{migratedTo:uid,recoveredAt:FieldValue.serverTimestamp()});return next;});
  const classIds=Array.isArray(data.classIds)?data.classIds.slice(0,100):[];await Promise.all(classIds.map(async id=>{const members=adminDb.collection('classes').doc(id).collection('members');await members.doc(uid).set({nickname:data.nickname,learningGrade:data.learningGrade,joinedAt:FieldValue.serverTimestamp()},{merge:true});await members.doc(sourceUid).delete();}));await Promise.all([publish(uid,data),leaderboard.doc(sourceUid).delete(),transferCurrentBossRecord({toUid:uid,fromUid:sourceUid,credentials,nickname:data.nickname,publicLeaderboard:data.leaderboardOptIn})]);return publicAccount(data);
}
async function claimGoogleLink(targetUid, body) {
  const sourceUid=text(body.sourceUid,128),sourceToken=text(body.sourceToken,8192);
  if(!sourceUid||!sourceToken||sourceUid===targetUid)throw apiError(400,'INVALID_GOOGLE_CLAIM','연결할 기존 게임 기록을 확인하지 못했어요.');
  let verified;
  try{verified=await adminAuth.verifyIdToken(sourceToken,true);}catch{throw apiError(401,'INVALID_SOURCE_SESSION','기존 게임 기록의 본인 확인이 만료됐어요. 다시 시도해 주세요.');}
  if(verified.uid!==sourceUid||verified.firebase?.sign_in_provider!=='anonymous')throw apiError(403,'SOURCE_ACCOUNT_MISMATCH','현재 기기의 게스트 게임 기록만 Google 계정으로 옮길 수 있어요.');
  const sourceRef=accounts.doc(sourceUid),targetRef=accounts.doc(targetUid);
  const data=await adminDb.runTransaction(async tx=>{const [sourceSnap,targetSnap]=await Promise.all([tx.get(sourceRef),tx.get(targetRef)]);if(!sourceSnap.exists)throw apiError(404,'SOURCE_ACCOUNT_NOT_FOUND','옮길 게임 기록을 찾지 못했어요.');if(targetSnap.exists)throw apiError(409,'GOOGLE_ACCOUNT_IN_USE','이 Google 계정에는 이미 다른 게임 기록이 있어요.');const next={...sourceSnap.data(),googleLinkedAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()};tx.create(targetRef,next);tx.delete(sourceRef);return next;});
  const classIds=Array.isArray(data.classIds)?data.classIds.slice(0,100):[];
  await Promise.all(classIds.map(async id=>{const members=adminDb.collection('classes').doc(id).collection('members');await members.doc(targetUid).set({nickname:data.nickname,learningGrade:data.learningGrade,joinedAt:FieldValue.serverTimestamp()},{merge:true});await members.doc(sourceUid).delete();}));
  const movedLegacy=await legacyUsers.where('migratedTo','==',sourceUid).limit(5).get();
  await Promise.all(movedLegacy.docs.map(doc=>doc.ref.update({migratedTo:targetUid,googleLinkedAt:FieldValue.serverTimestamp()})));
  await Promise.all([publish(targetUid,data),leaderboard.doc(sourceUid).delete(),transferCurrentBossRecord({toUid:targetUid,fromUid:sourceUid,nickname:data.nickname,publicLeaderboard:data.leaderboardOptIn})]);
  return publicAccount(data);
}
async function erase(uid) { const snap=await accounts.doc(uid).get();if(!snap.exists)return;await Promise.all((snap.data().classIds||[]).slice(0,100).map(id=>adminDb.collection('classes').doc(id).collection('members').doc(uid).delete()));await Promise.all([accounts.doc(uid).delete(),leaderboard.doc(uid).delete()]); }
export default async function handler(req,res){try{requireMethod(req,['POST']);const user=await requireUser(req);const body=await readBody(req);let response;if(body.action==='load')response={account:await loadAccount(user.uid)};else if(body.action==='loadAssignedWordPack')response={assignment:await assignedWordPack(user.uid)};else if(body.action==='create')response={account:await create(user.uid,body)};else if(body.action==='save')response={account:await save(user.uid,body)};else if(body.action==='rename')response=await rename(user.uid,body);else if(body.action==='joinClass')response={membership:await joinClass(user.uid,body)};else if(body.action==='loadGuildTrial')response={guild:await loadGuildTrial(user.uid)};else if(body.action==='loadGuildOverview')response={guild:await loadGuildOverview(user.uid),rankings:await guildLeaderboard()};else if(body.action==='guildTrialEvent')response={progress:await guildTrialEvent(user.uid,body)};else if(body.action==='completeGuildTrial')response={completion:await completeGuildTrial(user.uid,body)};else if(body.action==='migrateLegacy')response={account:await migrate(user.uid,body)};else if(body.action==='recoverMigratedLegacy')response={account:await recoverMigratedLegacy(user.uid,body)};else if(body.action==='migrateLegacyGoogle'){if(user.firebase?.sign_in_provider!=='google.com')throw apiError(403,'GOOGLE_REQUIRED','이전에 연결한 Google 계정으로 먼저 로그인해 주세요.');response={account:await migrateGoogleLegacy(user.uid,body)};}else if(body.action==='claimGoogleLink'){if(user.firebase?.sign_in_provider!=='google.com')throw apiError(403,'GOOGLE_REQUIRED','Google 계정으로 본인 확인 후 연결해 주세요.');response={account:await claimGoogleLink(user.uid,body)};}else if(body.action==='delete'){await erase(user.uid);response={deleted:true};}else throw apiError(400,'UNKNOWN_ACTION','알 수 없는 요청입니다.');sendJson(res,200,{ok:true,...response});}catch(error){handleApiError(res,error);}}
