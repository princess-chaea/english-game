import { adminDb, FieldValue, Timestamp } from './_firebase-admin.js';
import { apiError, handleApiError, hash, isExpired, randomCode, readBody, requireMethod, requireTeacher, safeInt, sendJson, text } from './_http.js';

const teachers = adminDb.collection('teachers');
const accounts = adminDb.collection('accounts');
const classes = adminDb.collection('classes');
const invites = adminDb.collection('classInvites');

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
const guildName = (data) => text(data?.guildName || data?.classLabel, 40) || '이름 없는 길드';
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
  const name = text(body.guildName || body.classLabel, 40);
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
    const members = await snap.ref.collection('members').select().get();
    const memberIds = members.docs.map((member) => member.id).slice(0, 200);
    const accountSnaps = await Promise.all(memberIds.map((id) => accounts.doc(id).get()));
    let totalCorrect = 0;
    let activeStudentCount = 0;
    accountSnaps.forEach((account) => { const correct = safeInt(account.data()?.state?.totalQuizCorrect, 0, 0); totalCorrect += correct; if (correct > 0) activeStudentCount += 1; });
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
    else if (body.action === 'setClassWordPack') response = { assignment: await setWordPack(token.uid, body) };
    else if (body.action === 'createInvite') response = { invite: await invite(token.uid, body) };
    else if (body.action === 'joinAsManager') response = { membership: await joinManager(token.uid, body) };
    else throw apiError(400, 'UNKNOWN_ACTION', '알 수 없는 요청이에요.');
    sendJson(res, 200, { ok: true, ...response });
  } catch (error) { handleApiError(res, error); }
}