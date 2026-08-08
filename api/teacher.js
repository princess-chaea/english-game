import { adminDb, FieldValue, Timestamp } from './_firebase-admin.js';
import { apiError, handleApiError, hash, isExpired, randomCode, readBody, requireMethod, requireTeacher, safeInt, sendJson, text } from './_http.js';

const teachers = adminDb.collection('teachers');
const schools = adminDb.collection('schools');
const classes = adminDb.collection('classes');
const invites = adminDb.collection('classInvites');
const WORD_PACKS = [
  { id: 'grade-3-current', label: 'Grade 3 current list', grade: 3, wordCount: 277, kind: 'grade-core' },
  { id: 'grade-4-current', label: 'Grade 4 current list', grade: 4, wordCount: 260, kind: 'grade-core' },
  { id: 'grade-5-current', label: 'Grade 5 current list', grade: 5, wordCount: 261, kind: 'grade-core' },
  { id: 'grade-6-current', label: 'Grade 6 current list', grade: 6, wordCount: 260, kind: 'grade-core' },
  { id: 'curriculum-2022-grade-3', label: '2022 curriculum draft - Grade 3', grade: 3, wordCount: 200, kind: 'curriculum-draft' },
  { id: 'curriculum-2022-grade-4', label: '2022 curriculum draft - Grade 4 cumulative', grade: 4, wordCount: 300, kind: 'curriculum-draft' },
  { id: 'curriculum-2022-grade-5', label: '2022 curriculum draft - Grade 5', grade: 5, wordCount: 200, kind: 'curriculum-draft' },
  { id: 'curriculum-2022-grade-6', label: '2022 curriculum draft - Grade 6 cumulative', grade: 6, wordCount: 300, kind: 'curriculum-draft' },
  { id: 'elementary-800-missing-review', label: 'Elementary 800 missing-word review', grade: null, wordCount: 444, kind: 'teacher-review' },
];
const wordPackById = new Map(WORD_PACKS.map((pack) => [pack.id, pack]));
const defaultWordPack = (grade) => `grade-${grade}-current`;

function classPack(grade, wordPackId) {
  const candidate = wordPackById.get(wordPackId) || wordPackById.get(defaultWordPack(grade));
  return candidate && (candidate.grade === grade || candidate.kind === 'teacher-review') ? candidate.id : defaultWordPack(grade);
}
async function bootstrap(uid, token) {
  const ref = teachers.doc(uid);
  await ref.set({ role: 'teacher', displayName: text(token.name || 'Teacher', 40), lastLoginAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  const data = (await ref.get()).data();
  return { displayName: data.displayName || 'Teacher', classIds: Array.isArray(data.classIds) ? data.classIds : [] };
}
async function ownedClass(uid, id) {
  const snap = await classes.doc(id).get();
  if (!snap.exists) throw apiError(404, 'CLASS_NOT_FOUND', 'Class not found.');
  if (!snap.data().managerIds?.includes(uid)) throw apiError(403, 'NOT_CLASS_MANAGER', 'You do not manage this class.');
  return snap;
}
async function createSchool(uid, body) {
  const name = text(body.schoolName, 80);
  if (name.length < 2) throw apiError(400, 'INVALID_SCHOOL_NAME', 'Enter a school name.');
  const ref = schools.doc();
  await ref.create({ name, ownerId: uid, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  await teachers.doc(uid).set({ schoolIds: FieldValue.arrayUnion(ref.id), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return { id: ref.id, name };
}
async function listSchools(uid) {
  const doc = await teachers.doc(uid).get();
  const ids = (doc.data()?.schoolIds || []).slice(0, 100);
  const snapshots = await Promise.all(ids.map((id) => schools.doc(id).get()));
  return snapshots.filter((snap) => snap.exists && snap.data().ownerId === uid).map((snap) => ({ id: snap.id, name: snap.data().name }));
}
async function createClass(uid, body) {
  const schoolId = text(body.schoolId, 128);
  const label = text(body.classLabel, 40);
  const grade = safeInt(body.grade, 0, 3, 6);
  if (!schoolId || !label || !grade) throw apiError(400, 'INVALID_CLASS', 'Check the school, grade, and class name.');
  const school = await schools.doc(schoolId).get();
  if (!school.exists) throw apiError(404, 'SCHOOL_NOT_FOUND', 'School not found.');
  if (school.data().ownerId !== uid) throw apiError(403, 'NOT_SCHOOL_OWNER', 'Only the school creator can create a class.');
  const ref = classes.doc();
  const data = { schoolId, schoolName: school.data().name, grade, classLabel: label, managerIds: [uid], wordPackId: defaultWordPack(grade), createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() };
  await ref.create(data);
  await teachers.doc(uid).set({ classIds: FieldValue.arrayUnion(ref.id), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return { id: ref.id, ...data };
}
async function listClasses(uid) {
  const teacher = await teachers.doc(uid).get();
  const ids = (teacher.data()?.classIds || []).slice(0, 100);
  const snapshots = await Promise.all(ids.map((id) => classes.doc(id).get()));
  const result = [];
  for (const snap of snapshots) {
    if (!snap.exists || !snap.data().managerIds?.includes(uid)) continue;
    const members = await snap.ref.collection('members').select().get();
    const data = snap.data();
    result.push({ id: snap.id, schoolId: data.schoolId, schoolName: data.schoolName, grade: data.grade, classLabel: data.classLabel, managerCount: data.managerIds.length, studentCount: members.size, wordPackId: classPack(data.grade, data.wordPackId) });
  }
  return result;
}
async function setWordPack(uid, body) {
  const classId = text(body.classId, 128);
  const wordPackId = text(body.wordPackId, 80);
  const classSnap = await ownedClass(uid, classId);
  const next = classPack(classSnap.data().grade, wordPackId);
  if (next !== wordPackId) throw apiError(400, 'INVALID_WORD_PACK', 'This word pack is not available for the class grade.');
  await classSnap.ref.update({ wordPackId: next, updatedAt: FieldValue.serverTimestamp() });
  return { classId, wordPackId: next };
}
async function invite(uid, body) {
  const classId = text(body.classId, 128);
  const type = body.type === 'manager' ? 'manager' : body.type === 'student' ? 'student' : '';
  if (!type) throw apiError(400, 'INVALID_INVITE_TYPE', 'Invalid invitation type.');
  const classSnap = await ownedClass(uid, classId);
  const hours = safeInt(body.expiresInHours, type === 'manager' ? 168 : 72, 1, 720);
  let code;
  let ref;
  for (let index = 0; index < 5; index += 1) {
    code = randomCode();
    ref = invites.doc(hash(code));
    if (!(await ref.get()).exists) break;
  }
  if (!ref) throw apiError(500, 'INVITE_CREATE_FAILED', 'Could not create a code.');
  const expiresAt = Timestamp.fromMillis(Date.now() + hours * 3600000);
  await ref.create({ type, classId, classLabel: `Grade ${classSnap.data().grade} ${classSnap.data().classLabel}`, createdBy: uid, expiresAt, createdAt: FieldValue.serverTimestamp() });
  return { code, type, expiresAt: expiresAt.toDate().toISOString() };
}
async function joinManager(uid, body) {
  const code = text(body.code, 32).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length < 6) throw apiError(400, 'INVALID_INVITE', 'Check the co-manager code.');
  const ref = invites.doc(hash(code));
  return adminDb.runTransaction(async (transaction) => {
    const invite = await transaction.get(ref);
    if (!invite.exists || invite.data().type !== 'manager' || isExpired(invite.data().expiresAt)) throw apiError(404, 'INVITE_NOT_FOUND', 'Code is invalid or expired.');
    const classRef = classes.doc(invite.data().classId);
    const classSnap = await transaction.get(classRef);
    if (!classSnap.exists) throw apiError(404, 'CLASS_NOT_FOUND', 'Class not found.');
    transaction.update(classRef, { managerIds: FieldValue.arrayUnion(uid), updatedAt: FieldValue.serverTimestamp() });
    transaction.set(teachers.doc(uid), { classIds: FieldValue.arrayUnion(classRef.id), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return { classId: classRef.id, classLabel: invite.data().classLabel || 'Class' };
  });
}

export default async function handler(req, res) {
  try {
    requireMethod(req, ['POST']);
    const token = await requireTeacher(req);
    const body = await readBody(req);
    let response;
    if (body.action === 'bootstrap') response = { teacher: await bootstrap(token.uid, token) };
    else if (body.action === 'createSchool') response = { school: await createSchool(token.uid, body) };
    else if (body.action === 'listSchools') response = { schools: await listSchools(token.uid) };
    else if (body.action === 'createClass') response = { classroom: await createClass(token.uid, body) };
    else if (body.action === 'listClasses') response = { classes: await listClasses(token.uid) };
    else if (body.action === 'listWordPacks') response = { wordPacks: WORD_PACKS };
    else if (body.action === 'setClassWordPack') response = { assignment: await setWordPack(token.uid, body) };
    else if (body.action === 'createInvite') response = { invite: await invite(token.uid, body) };
    else if (body.action === 'joinAsManager') response = { membership: await joinManager(token.uid, body) };
    else throw apiError(400, 'UNKNOWN_ACTION', 'Unknown request.');
    sendJson(res, 200, { ok: true, ...response });
  } catch (error) {
    handleApiError(res, error);
  }
}
