import { readFileSync } from 'node:fs';
import { adminDb, FieldValue, Timestamp } from './_firebase-admin.js';
import { apiError, handleApiError, hash, isExpired, randomCode, readBody, requireMethod, requireTeacher, safeInt, sendJson, text } from './_http.js';

const teachers = adminDb.collection('teachers');
const accounts = adminDb.collection('accounts');
const classes = adminDb.collection('classes');
const invites = adminDb.collection('classInvites');

const packCatalog = JSON.parse(readFileSync(new URL('../data/word-packs.json', import.meta.url), 'utf8'));
const wordByKey = new Map();
const packWordsById = new Map();
(packCatalog.packs || []).forEach((pack) => {
  const words = new Map();
  (pack.words || []).forEach((entry) => {
    const key = text(entry?.word, 80).toLowerCase();
    const meaning = text(entry?.meaning, 160);
    if (!key || !meaning) return;
    const word = { word: text(entry.word, 80), meaning };
    if (!words.has(key)) words.set(key, word);
    if (!wordByKey.has(key)) wordByKey.set(key, word);
  });
  packWordsById.set(text(pack?.id, 80), words);
});
// 현재 실제 배정 가능한 목록입니다. 1·2학년 원본 목록은 의미 검토·단어팩 등록 전까지 배정하지 않습니다.
const WORD_PACKS = [
  { id: 'grade-3-current', label: '기본 3학년 단어', grade: 3, wordCount: 277, kind: 'grade-core' },
  { id: 'grade-4-current', label: '기본 4학년 단어', grade: 4, wordCount: 260, kind: 'grade-core' },
  { id: 'grade-5-current', label: '기본 5학년 단어', grade: 5, wordCount: 261, kind: 'grade-core' },
  { id: 'grade-6-current', label: '기본 6학년 단어', grade: 6, wordCount: 260, kind: 'grade-core' },
  { id: 'curriculum-2022-grade-3', label: '2022 교육과정 초안 · 3학년', grade: 3, wordCount: 200, kind: 'curriculum-draft' },
  { id: 'curriculum-2022-grade-4', label: '2022 교육과정 초안 · 4학년 누적', grade: 4, wordCount: 300, kind: 'curriculum-draft' },
  { id: 'curriculum-2022-grade-5', label: '2022 교육과정 초안 · 5학년', grade: 5, wordCount: 200, kind: 'curriculum-draft' },
  { id: 'curriculum-2022-grade-6', label: '2022 교육과정 초안 · 6학년 누적', grade: 6, wordCount: 300, kind: 'curriculum-draft' },
  { id: 'elementary-800-missing-review', label: '교사 검토용 · 초등 800 미등록 단어', grade: null, wordCount: 444, kind: 'teacher-review' },
];
const wordPackById = new Map(WORD_PACKS.map((pack) => [pack.id, pack]));
const defaultWordPack = (grade) => `grade-${safeInt(grade, 4, 3, 6)}-current`;
const BLOCKED_GUILD_TERMS = ['admin', 'administrator', 'teacher', 'fuck', 'shit', 'sex', 'porn', '나치', '일베', '섹스', '성기', '자살', '살인', '테러'];
function normalizeGuildName(value) {
  const name = text(value, 40).replace(/\s+/g, ' ');
  const lower = name.toLocaleLowerCase('en-US');
  if (!/^[가-힣A-Za-z0-9 ]{2,24}$/u.test(name) || BLOCKED_GUILD_TERMS.some((term) => lower.includes(term))) throw apiError(400, 'INVALID_GUILD_NAME', '길드 이름은 한글·영문·숫자·공백만 사용해 2~24자로 입력해 주세요.');
  return name;
}
const guildName = (data) => { try { return normalizeGuildName(data?.guildName || data?.classLabel); } catch { return '이름 없는 길드'; } };
function classPack(grade, wordPackId) {
  return wordPackById.get(wordPackId)?.id || defaultWordPack(grade);
}
async function bootstrap(uid, token) {
  const ref = teachers.doc(uid);
  await ref.set({ role: 'teacher', displayName: text(token.name || '교사', 40), lastLoginAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  const data = (await ref.get()).data();
  return { displayName: data.displayName || '교사', guildIds: Array.isArray(data.classIds) ? data.classIds : [] };
}
async function ownedClass(uid, id) {
  const snap = await classes.doc(id).get();
  if (!snap.exists) throw apiError(404, 'GUILD_NOT_FOUND', '길드를 찾지 못했어요.');
  if (!snap.data().managerIds?.includes(uid)) throw apiError(403, 'NOT_GUILD_MANAGER', '이 길드의 관리자가 아니에요.');
  return snap;
}
async function createGuild(uid, body) {
  const name = normalizeGuildName(body.guildName || body.classLabel);
  const grade = safeInt(body.grade, 0, 3, 6);
  if (name.length < 2 || !grade) throw apiError(400, 'INVALID_GUILD', '길드 이름과 기본 단어 수준을 확인해 주세요.');
  const ref = classes.doc();
  const data = { schemaVersion: 2, guildName: name, classLabel: name, grade, managerIds: [uid], wordPackId: defaultWordPack(grade), createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() };
  await ref.create(data);
  await teachers.doc(uid).set({ classIds: FieldValue.arrayUnion(ref.id), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return { id: ref.id, guildName: name, grade, wordPackId: data.wordPackId };
}
async function listClasses(uid) {
  const teacher = await teachers.doc(uid).get();
  const ids = (teacher.data()?.classIds || []).slice(0, 100);
  const snapshots = await Promise.all(ids.map((id) => classes.doc(id).get()));
  const result = [];
  for (const snap of snapshots) {
    const data = snap.data();
    if (!snap.exists || !data.managerIds?.includes(uid)) continue;
    const members = await snap.ref.collection('members').select('totalCorrect').get();
    let totalCorrect = 0;
    let activeStudentCount = 0;
    members.docs.forEach((member) => { const correct = safeInt(member.data()?.totalCorrect, 0, 0); totalCorrect += correct; if (correct > 0) activeStudentCount += 1; });
    result.push({ id: snap.id, guildName: guildName(data), grade: safeInt(data.grade, 4, 3, 6), managerCount: (data.managerIds || []).length, studentCount: members.size, activeStudentCount, totalCorrect, wordPackId: classPack(data.grade, data.wordPackId) });
  }
  return result;
}
async function setWordPack(uid, body) {
  const classId = text(body.classId, 128);
  const wordPackId = text(body.wordPackId, 80);
  const classSnap = await ownedClass(uid, classId);
  const next = classPack(classSnap.data().grade, wordPackId);
  if (next !== wordPackId) throw apiError(400, 'INVALID_WORD_PACK', '선택할 수 없는 단어팩이에요.');
  await classSnap.ref.update({ wordPackId: next, updatedAt: FieldValue.serverTimestamp() });
  return { classId, wordPackId: next };
}
const TRIAL_TYPES = new Set(['meaning-choice', 'word-choice', 'spelling', 'unscramble']);
async function activeTrialStats(classRef, classData) {
  const trialId = text(classData?.activeTrialId, 128);
  if (!trialId) return null;
  const trialRef = classRef.collection('trials').doc(trialId);
  const trialSnap = await trialRef.get();
  if (!trialSnap.exists) return null;
  const [progress, completions] = await Promise.all([
    trialRef.collection('progress').limit(200).get(),
    trialRef.collection('completions').limit(200).get()
  ]);
  let attemptCount = 0; let retryCount = 0; let hintCount = 0;
  progress.docs.forEach((doc) => {
    attemptCount += safeInt(doc.data()?.attemptCount, 0, 0, 10000);
    retryCount += safeInt(doc.data()?.retryCount, 0, 0, 10000);
    hintCount += safeInt(doc.data()?.hintsUsed, 0, 0, 10000);
  });
  const trial = trialSnap.data();
  return {
    id: trialId,
    questionCount: safeInt(trial.questionCount, 0, 0, 20),
    rewardGuildCoins: safeInt(trial.rewardGuildCoins, 0, 0, 1000),
    participantCount: progress.size,
    completedCount: completions.size,
    attemptCount,
    retryCount,
    hintCount,
    expired: isExpired(trial.expiresAt)
  };
}
async function wrongWordSummary(uid, body) {
  const classId = text(body.classId, 128);
  const classSnap = await ownedClass(uid, classId);
  const eligibleWords = packWordsById.get(classPack(classSnap.data().grade, classSnap.data().wordPackId)) || wordByKey;
  const members = await classSnap.ref.collection('members').select().get();
  const memberIds = members.docs.map((member) => member.id).slice(0, 200);
  const accountSnaps = await Promise.all(memberIds.map((id) => accounts.doc(id).get()));
  const totals = new Map();
  accountSnaps.forEach((accountSnap) => {
    const wrong = accountSnap.data()?.state?.wrongWordCounts;
    if (!wrong || typeof wrong !== 'object' || Array.isArray(wrong)) return;
    Object.entries(wrong).forEach(([rawWord, rawCount]) => {
      const key = text(rawWord, 80).toLowerCase();
      const count = safeInt(rawCount, 0, 0, 1000000);
      if (key && count > 0 && eligibleWords.has(key)) totals.set(key, (totals.get(key) || 0) + count);
    });
  });
  const words = [...totals.entries()]
    .map(([key, wrongCount]) => ({ ...eligibleWords.get(key), wrongCount }))
    .sort((a, b) => b.wrongCount - a.wrongCount || a.word.localeCompare(b.word))
    .slice(0, 100);
  return { classId, guildName: guildName(classSnap.data()), memberCount: memberIds.length, words, activeTrial: await activeTrialStats(classSnap.ref, classSnap.data()) };
}
async function createGuildTrial(uid, body) {
  const summary = await wrongWordSummary(uid, body);
  const count = safeInt(body.count, 5, 5, 20);
  const candidates = summary.words.slice(0, count);
  if (candidates.length < 5) throw apiError(409, 'NOT_ENOUGH_WRONG_WORDS', '시련을 만들려면 뜻이 등록된 길드 오답 단어가 5개 이상 필요해요.');
  const candidateByKey = new Map(candidates.map((entry) => [entry.word.toLowerCase(), entry]));
  const requested = Array.isArray(body.items) ? body.items.slice(0, count) : [];
  const seen = new Set();
  const words = requested.map((item) => {
    const key = text(item?.word, 80).toLowerCase();
    const source = candidateByKey.get(key);
    const type = text(item?.type, 32);
    if (!source || seen.has(key) || !TRIAL_TYPES.has(type)) return null;
    seen.add(key);
    return { word: source.word, meaning: source.meaning, wrongCount: source.wrongCount, type };
  }).filter(Boolean);
  if (words.length !== candidates.length) throw apiError(400, 'INVALID_TRIAL_REVIEW', '검토한 단어와 문제 유형을 다시 확인해 주세요.');
  const classRef = classes.doc(summary.classId);
  const trialRef = classRef.collection('trials').doc();
  const rewardGuildCoins = words.length * 5;
  const maxHints = Math.max(1, Math.ceil(words.length / 5));
  const expiresAt = Timestamp.fromMillis(Date.now() + 14 * 24 * 60 * 60 * 1000);
  const batch = adminDb.batch();
  batch.create(trialRef, {
    schemaVersion: 2,
    status: 'active',
    kind: 'wrong-words',
    words,
    questionCount: words.length,
    maxHints,
    rewardGuildCoins,
    createdBy: uid,
    createdAt: FieldValue.serverTimestamp(),
    expiresAt
  });
  batch.update(classRef, { activeTrialId: trialRef.id, updatedAt: FieldValue.serverTimestamp() });
  await batch.commit();
  return { id: trialRef.id, classId: summary.classId, guildName: summary.guildName, questionCount: words.length, maxHints, rewardGuildCoins, expiresAt: expiresAt.toDate().toISOString() };
}
async function invite(uid, body) {
  const classId = text(body.classId, 128);
  const type = body.type === 'manager' ? 'manager' : body.type === 'student' ? 'student' : '';
  if (!type) throw apiError(400, 'INVALID_INVITE_TYPE', '초대 코드 종류를 확인해 주세요.');
  const classSnap = await ownedClass(uid, classId);
  const hours = safeInt(body.expiresInHours, type === 'manager' ? 168 : 72, 1, 720);
  let code; let ref;
  for (let index = 0; index < 5; index += 1) { code = randomCode(); ref = invites.doc(hash(code)); if (!(await ref.get()).exists) break; }
  if (!ref) throw apiError(500, 'INVITE_CREATE_FAILED', '초대 코드를 만들지 못했어요.');
  const expiresAt = Timestamp.fromMillis(Date.now() + hours * 3600000);
  await ref.create({ type, classId, classLabel: guildName(classSnap.data()), createdBy: uid, expiresAt, createdAt: FieldValue.serverTimestamp() });
  return { code, type, expiresAt: expiresAt.toDate().toISOString() };
}
async function joinManager(uid, body) {
  const code = text(body.code, 32).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length < 6) throw apiError(400, 'INVALID_INVITE', '공동 관리자 코드를 확인해 주세요.');
  const ref = invites.doc(hash(code));
  return adminDb.runTransaction(async (transaction) => {
    const invite = await transaction.get(ref);
    if (!invite.exists || invite.data().type !== 'manager' || isExpired(invite.data().expiresAt)) throw apiError(404, 'INVITE_NOT_FOUND', '코드가 올바르지 않거나 만료됐어요.');
    const classRef = classes.doc(invite.data().classId);
    const classSnap = await transaction.get(classRef);
    if (!classSnap.exists) throw apiError(404, 'GUILD_NOT_FOUND', '길드를 찾지 못했어요.');
    transaction.update(classRef, { managerIds: FieldValue.arrayUnion(uid), updatedAt: FieldValue.serverTimestamp() });
    transaction.set(teachers.doc(uid), { classIds: FieldValue.arrayUnion(classRef.id), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return { classId: classRef.id, classLabel: guildName(classSnap.data()) };
  });
}

export default async function handler(req, res) {
  try {
    requireMethod(req, ['POST']);
    const token = await requireTeacher(req);
    const body = await readBody(req);
    let response;
    if (body.action === 'bootstrap') response = { teacher: await bootstrap(token.uid, token) };
    else if (body.action === 'createGuild' || body.action === 'createClass') response = { classroom: await createGuild(token.uid, body) };
    else if (body.action === 'listClasses') response = { classes: await listClasses(token.uid) };
    else if (body.action === 'listWordPacks') response = { wordPacks: WORD_PACKS };
    else if (body.action === 'setClassWordPack' || body.action === 'setWordPack') response = { assignment: await setWordPack(token.uid, body) };
    else if (body.action === 'guildWrongWords') response = { analysis: await wrongWordSummary(token.uid, body) };
    else if (body.action === 'createGuildTrial') response = { trial: await createGuildTrial(token.uid, body) };
    else if (body.action === 'createInvite') response = { invite: await invite(token.uid, body) };
    else if (body.action === 'joinAsManager') response = { membership: await joinManager(token.uid, body) };
    else throw apiError(400, 'UNKNOWN_ACTION', '알 수 없는 요청이에요.');
    sendJson(res, 200, { ok: true, ...response });
  } catch (error) { handleApiError(res, error); }
}