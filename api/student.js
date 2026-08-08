import { adminDb, FieldValue } from './_firebase-admin.js';
import { apiError, handleApiError, hash, isExpired, normalizeNickname, readBody, requireMethod, requireUser, safeInt, sendJson, text } from './_http.js';

const accounts = adminDb.collection('accounts');
const leaderboard = adminDb.collection('leaderboard');
const invites = adminDb.collection('classInvites');
const legacyUsers = adminDb.collection('users');
const REVIEW_PACK_ID = 'elementary-800-missing-review';
const defaultWordPack = (grade) => `grade-${grade}-current`;
const curriculumWordPack = (grade) => `curriculum-2022-grade-${grade}`;
function classPack(grade, wordPackId) { return wordPackId === REVIEW_PACK_ID || wordPackId === defaultWordPack(grade) || wordPackId === curriculumWordPack(grade) ? wordPackId : defaultWordPack(grade); }
const fields = new Set(['avatarType','gold','accGold','helmetLvl','armorLvl','weaponLvl','shieldLvl','shoesLvl','petType','petLvl','petLevels','stage','progress','totalQuizTries','totalQuizCorrect','masteredWords','currentQuizIndex','skillsInventory','equippedSkills','activeSkillDeck','skillEssence','lockedPotentialSlots','wrongWordCounts','masteryPoints','necklaceLvl','braceletLvl','ringLvl','acquiredRelics','equippedRelicId','gearPotentials','isPotentialUnlocked','equippedTitle','wbTitle','unlockedTitles','bossTokens','relicEssence','soundSettings','tutorialCompleted','lastSaved']);

function defaultState() { return { avatarType:'male', gold:0, accGold:0, helmetLvl:1, armorLvl:1, weaponLvl:1, shieldLvl:1, shoesLvl:1, stage:1, progress:0, totalQuizTries:0, totalQuizCorrect:0, masteredWords:[], skillsInventory:[], equippedSkills:[], activeSkillDeck:[], skillEssence:0, wrongWordCounts:{}, masteryPoints:0, tutorialCompleted:false }; }
function cleanState(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw apiError(400,'INVALID_STATE','Invalid save data.');
  const state = {};
  fields.forEach((key) => { if (Object.hasOwn(input,key)) state[key] = input[key]; });
  ['gold','accGold','helmetLvl','armorLvl','weaponLvl','shieldLvl','shoesLvl','petLvl','stage','progress','totalQuizTries','totalQuizCorrect','currentQuizIndex','masteryPoints','necklaceLvl','braceletLvl','ringLvl','bossTokens','relicEssence'].forEach((key) => { if (Object.hasOwn(state,key)) state[key]=safeInt(state[key],0,0,9999999999); });
  if (state.masteredWords && !Array.isArray(state.masteredWords)) delete state.masteredWords;
  if (state.skillsInventory && !Array.isArray(state.skillsInventory)) delete state.skillsInventory;
  if ((state.masteredWords?.length||0)>5000 || (state.skillsInventory?.length||0)>1000 || Buffer.byteLength(JSON.stringify(state),'utf8')>600000) throw apiError(400,'STATE_TOO_LARGE','Save data is too large.');
  return state;
}
function score(state) { return safeInt(state.totalQuizCorrect,0,0)*1000 + (Array.isArray(state.masteredWords)?state.masteredWords.length:0)*10 + Math.min(safeInt(state.stage,1,1),999); }
function publicAccount(data) { return { nickname:data.nickname, learningGrade:data.learningGrade, state:{...defaultState(),...(data.state||{})}, freeNicknameChangeUsed:Boolean(data.freeNicknameChangeUsed), renameCount:safeInt(data.renameCount,0,0), leaderboardOptIn:Boolean(data.leaderboardOptIn), classIds:Array.isArray(data.classIds)?data.classIds:[] }; }
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
    return { classId, classLabel: classroom.classLabel || 'Class', wordPackId: classPack(classroom.grade, classroom.wordPackId) };
  }
  return { wordPackId: null };
}
async function publish(uid, data) {
  if (!data.leaderboardOptIn) return leaderboard.doc(uid).delete();
  const state=data.state||defaultState();
  return leaderboard.doc(uid).set({
    nickname:data.nickname,
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
  if (correct>oldCorrect+Math.floor(minutes*120)+30) throw apiError(409,'PROGRESS_RATE_LIMIT','Progress changed too quickly. Please save again later.');
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
async function save(uid, body) {
  const requested=cleanState(body.state); const optIn=typeof body.leaderboardOptIn==='boolean'?body.leaderboardOptIn:null; const ref=accounts.doc(uid);
  const data=await adminDb.runTransaction(async tx=>{const snap=await tx.get(ref);if(!snap.exists)throw apiError(404,'PROFILE_NOT_FOUND','Create a profile first.');const current=snap.data();const state=guardProgress(current.state||defaultState(),requested,current.updatedAt);const update={state,updatedAt:FieldValue.serverTimestamp()};if(optIn!==null)update.leaderboardOptIn=optIn;tx.update(ref,update);return {...current,...update,state};});
  await publish(uid,data);return publicAccount(data);
}
async function rename(uid, body) {
  const nickname=normalizeNickname(body.nickname);const ref=accounts.doc(uid);
  const data=await adminDb.runTransaction(async tx=>{const snap=await tx.get(ref);if(!snap.exists)throw apiError(404,'PROFILE_NOT_FOUND','Create a profile first.');const current=snap.data();const first=!current.freeNicknameChangeUsed;const cost=first?0:500;const state={...defaultState(),...(current.state||{})};if(safeInt(state.masteryPoints,0,0)<cost)throw apiError(409,'NOT_ENOUGH_FP',`You need ${cost} FP to rename.`);state.masteryPoints-=cost;const update={nickname,state,freeNicknameChangeUsed:true,renameCount:safeInt(current.renameCount,0,0)+1,updatedAt:FieldValue.serverTimestamp()};tx.update(ref,update);return {...current,...update};});
  await Promise.all((data.classIds||[]).slice(0,100).map(id=>adminDb.collection('classes').doc(id).collection('members').doc(uid).set({nickname:data.nickname},{merge:true})));
  await publish(uid,data);return {account:publicAccount(data),cost:data.renameCount===1?0:500};
}
async function joinClass(uid, body) {
  const code=text(body.code,32).toUpperCase().replace(/[^A-Z0-9]/g,'');if(code.length<6)throw apiError(400,'INVALID_INVITE','Check the class code.');
  const inviteRef=invites.doc(hash(code));const accountRef=accounts.doc(uid);
  return adminDb.runTransaction(async tx=>{const [inviteSnap,accountSnap]=await Promise.all([tx.get(inviteRef),tx.get(accountRef)]);if(!inviteSnap.exists||inviteSnap.data().type!=='student'||isExpired(inviteSnap.data().expiresAt))throw apiError(404,'INVITE_NOT_FOUND','This class code is invalid or expired.');if(!accountSnap.exists)throw apiError(404,'PROFILE_NOT_FOUND','Create a profile first.');const invite=inviteSnap.data(),account=accountSnap.data();tx.set(adminDb.collection('classes').doc(invite.classId).collection('members').doc(uid),{nickname:account.nickname,learningGrade:account.learningGrade,joinedAt:FieldValue.serverTimestamp()},{merge:true});tx.update(accountRef,{classIds:FieldValue.arrayUnion(invite.classId),activeClassId:invite.classId,updatedAt:FieldValue.serverTimestamp()});return {classId:invite.classId,classLabel:invite.classLabel||'Class'};});
}
function legacyIds(c) { const school=text(c.schoolName,120), grade=safeInt(c.grade,0,3,6), room=safeInt(c.classNum,0,1,99), number=safeInt(c.studentNum,0,1,99), name=text(c.name,30);if(!school||!grade||!room||!number||!name)throw apiError(400,'INVALID_LEGACY_INFO','Complete the former account details.');const suffix=`${grade}_${room}_${number}_${name}`;return [`${school}_${suffix}`,`Unknown_${suffix}`]; }
function legacyState(data) { let extra={};try{extra=typeof data.extraData==='string'?JSON.parse(data.extraData||'{}'):(data.extraData||{});}catch{}return {...defaultState(),...cleanState({...data,...extra})}; }
async function migrateGoogleLegacy(uid, body) {
  const nickname=normalizeNickname(body.nickname),grade=safeInt(body.learningGrade,4,3,6),ref=accounts.doc(uid);
  const matches=await legacyUsers.where('linkedGoogleUid','==',uid).limit(2).get();
  if(matches.empty)throw apiError(404,'LEGACY_GOOGLE_NOT_FOUND','No former Google-linked game record was found.');
  if(matches.size!==1)throw apiError(409,'LEGACY_GOOGLE_AMBIGUOUS','More than one former Google-linked record was found. Use the former-record form instead.');
  const legacyRef=matches.docs[0].ref;
  const data=await adminDb.runTransaction(async tx=>{const [now,legacySnap]=await Promise.all([tx.get(ref),tx.get(legacyRef)]);if(now.data()?.legacyMigratedAt||now.data()?.legacyGoogleMigratedAt)throw apiError(409,'ALREADY_MIGRATED','This safe profile already imported a former record.');if(!legacySnap.exists)throw apiError(404,'LEGACY_NOT_FOUND','Former record not found.');const old=legacySnap.data();if(old.linkedGoogleUid!==uid)throw apiError(403,'LEGACY_GOOGLE_MISMATCH','Former Google link does not match.');if(old.migratedTo&&old.migratedTo!==uid)throw apiError(409,'LEGACY_ALREADY_MOVED','Former record was already moved.');const next={schemaVersion:2,role:'student',nickname,learningGrade:grade,state:legacyState(old),freeNicknameChangeUsed:false,renameCount:0,leaderboardOptIn:Boolean(body.leaderboardOptIn),classIds:[],legacyGoogleMigratedAt:FieldValue.serverTimestamp(),createdAt:now.data()?.createdAt||FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()};tx.set(ref,next,{merge:true});tx.update(legacyRef,{migratedTo:uid,migratedAt:FieldValue.serverTimestamp()});return next;});await publish(uid,data);return publicAccount(data);
}
async function migrate(uid, body) {
  const pin=text(body.pin,12);if(!/^\d{4}$/.test(pin))throw apiError(400,'INVALID_PIN','Enter the former 4-digit PIN.');const ids=legacyIds(body.credentials||{}), nickname=normalizeNickname(body.nickname), grade=safeInt(body.learningGrade,4,3,6),ref=accounts.doc(uid);
  const data=await adminDb.runTransaction(async tx=>{const now=await tx.get(ref);if(now.data()?.legacyMigratedAt)throw apiError(409,'ALREADY_MIGRATED','This new profile already imported a record.');let legacyRef,legacySnap;for(const id of ids){const candidate=legacyUsers.doc(id),snap=await tx.get(candidate);if(snap.exists){legacyRef=candidate;legacySnap=snap;break;}}if(!legacySnap)throw apiError(404,'LEGACY_NOT_FOUND','Former record not found.');const old=legacySnap.data();if(String(old.password||'')!==pin)throw apiError(401,'LEGACY_PIN_MISMATCH','Former PIN does not match.');if(old.migratedTo&&old.migratedTo!==uid)throw apiError(409,'LEGACY_ALREADY_MOVED','Former record was already moved.');const next={schemaVersion:2,role:'student',nickname,learningGrade:grade,state:legacyState(old),freeNicknameChangeUsed:false,renameCount:0,leaderboardOptIn:Boolean(body.leaderboardOptIn),classIds:[],legacyMigratedAt:FieldValue.serverTimestamp(),createdAt:now.data()?.createdAt||FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()};tx.set(ref,next,{merge:true});tx.update(legacyRef,{migratedTo:uid,migratedAt:FieldValue.serverTimestamp()});return next;});await publish(uid,data);return publicAccount(data);
}
async function erase(uid) { const snap=await accounts.doc(uid).get();if(!snap.exists)return;await Promise.all((snap.data().classIds||[]).slice(0,100).map(id=>adminDb.collection('classes').doc(id).collection('members').doc(uid).delete()));await Promise.all([accounts.doc(uid).delete(),leaderboard.doc(uid).delete()]); }
export default async function handler(req,res){try{requireMethod(req,['POST']);const user=await requireUser(req);const body=await readBody(req);let response;if(body.action==='load'){const snap=await accounts.doc(user.uid).get();response={account:snap.exists?publicAccount(snap.data()):null};}else if(body.action==='loadAssignedWordPack')response={assignment:await assignedWordPack(user.uid)};else if(body.action==='create')response={account:await create(user.uid,body)};else if(body.action==='save')response={account:await save(user.uid,body)};else if(body.action==='rename')response=await rename(user.uid,body);else if(body.action==='joinClass')response={membership:await joinClass(user.uid,body)};else if(body.action==='migrateLegacy')response={account:await migrate(user.uid,body)};else if(body.action==='migrateLegacyGoogle'){if(user.firebase?.sign_in_provider!=='google.com')throw apiError(403,'GOOGLE_REQUIRED','Sign in with the former Google account first.');response={account:await migrateGoogleLegacy(user.uid,body)};}else if(body.action==='delete'){await erase(user.uid);response={deleted:true};}else throw apiError(400,'UNKNOWN_ACTION','Unknown request.');sendJson(res,200,{ok:true,...response});}catch(error){handleApiError(res,error);}}
