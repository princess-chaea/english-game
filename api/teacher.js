import { readFileSync } from 'node:fs';
import { adminDb, adminStorage, FieldValue, Timestamp } from './_firebase-admin.js';
import { apiError, handleApiError, hash, isExpired, randomCode, readBody, requireMethod, requireTeacher, safeInt, sendJson, text } from './_http.js';

const teachers = adminDb.collection('teachers');
const accounts = adminDb.collection('accounts');
const classes = adminDb.collection('classes');
const invites = adminDb.collection('classInvites');
const verificationRequests = adminDb.collection('teacherVerificationRequests');

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
// 3~6학년 하·중·상은 하 ⊂ 중 ⊂ 상 누적 구조이며, 새 길드 기본값은 해당 학년의 중 수준입니다.
const primaryPackKinds = new Set(['grade-tier-cumulative', 'curriculum-draft', 'teacher-review']);
const WORD_PACKS = (packCatalog.packs || []).filter((pack) => primaryPackKinds.has(pack.kind)).map((pack) => ({
  id: text(pack.id, 80),
  label: text(pack.label, 100),
  grade: pack.grade == null ? null : safeInt(pack.grade, 4, 3, 6),
  level: text(pack.level, 16) || null,
  levelLabel: text(pack.levelLabel, 8) || null,
  cumulative: Boolean(pack.cumulative),
  wordCount: Array.isArray(pack.words) ? pack.words.length : safeInt(pack.wordCount, 0, 0),
  kind: text(pack.kind, 40)
}));
const wordPackById = new Map((packCatalog.packs || []).map((pack) => [text(pack?.id, 80), {
  id: text(pack.id, 80),
  label: text(pack.label, 100),
  grade: pack.grade == null ? null : safeInt(pack.grade, 4, 3, 6),
  level: text(pack.level, 16) || null,
  levelLabel: text(pack.levelLabel, 8) || null,
  cumulative: Boolean(pack.cumulative),
  wordCount: Array.isArray(pack.words) ? pack.words.length : safeInt(pack.wordCount, 0, 0),
  kind: text(pack.kind, 40)
}]));
const defaultWordPack = (grade) => 'grade-' + safeInt(grade, 4, 3, 6) + '-mid';
const LEARNING_QUESTION_TYPES = new Set(['meaning-choice', 'fill-blank', 'word-choice', 'listen-meaning']);
const DEFAULT_QUESTION_TYPES = ['meaning-choice'];
function normalizeWordPackIds(value, grade = 4) {
  const source = Array.isArray(value) ? value : value ? [value] : [];
  const ids = [...new Set(source.map((item) => text(item, 80)).filter((id) => wordPackById.has(id)))].slice(0, 12);
  return ids.length ? ids : [defaultWordPack(grade)];
}
function normalizeQuestionTypes(value) {
  const source = Array.isArray(value) ? value : [];
  const types = [...new Set(source.map((item) => text(item, 32)).filter((item) => LEARNING_QUESTION_TYPES.has(item)))];
  return types.length ? types : [...DEFAULT_QUESTION_TYPES];
}
const BLOCKED_GUILD_TERMS = ['admin', 'administrator', 'teacher', 'fuck', 'shit', 'sex', 'porn', '나치', '일베', '섹스', '성기', '자살', '살인', '테러'];
function normalizeGuildName(value) {
  const name = text(value, 40).replace(/\s+/g, ' ');
  const lower = name.toLocaleLowerCase('en-US');
  if (!/^[가-힣A-Za-z0-9 ]{2,24}$/u.test(name) || BLOCKED_GUILD_TERMS.some((term) => lower.includes(term))) throw apiError(400, 'INVALID_GUILD_NAME', '길드 이름은 한글·영문·숫자·공백만 사용해 2~24자로 입력해 주세요.');
  return name;
}
const guildName = (data) => { try { return normalizeGuildName(data?.guildName || data?.classLabel); } catch { return '이름 없는 길드'; } };
function normalizeGuildSubtitle(value) {
  const subtitle = text(value, 48).replace(/\s+/g, ' ');
  if (!subtitle) return '';
  if (!/^[가-힣A-Za-z0-9 ()\-]{1,32}$/u.test(subtitle)) throw apiError(400, 'INVALID_GUILD_SUBTITLE', '교사용 부제목은 한글·영문·숫자·공백·괄호·하이픈만 사용해 32자 이내로 입력해 주세요.');
  return subtitle;
}
function normalizeTeacherName(value) {
  const name = text(value, 48).replace(/\s+/g, ' ');
  if (!/^[가-힣A-Za-z·ㆍ ]{2,40}$/u.test(name)) throw apiError(400, 'INVALID_TEACHER_NAME', '교사 이름을 2~40자로 입력해 주세요.');
  return name;
}
function normalizeSchool(value, rawKey) {
  const schoolName = text(value, 80).replace(/\s+/g, ' ');
  const schoolKey = text(rawKey, 48).toUpperCase();
  if (!/^[가-힣A-Za-z0-9 ()\-\.]{2,80}$/u.test(schoolName) || !/^[A-Z0-9]{2,20}:[A-Z0-9]{2,20}$/.test(schoolKey)) throw apiError(400, 'INVALID_SCHOOL', '학교 검색 결과에서 재직 학교를 선택해 주세요.');
  return { schoolName, schoolKey };
}
function maskedTeacherName(value) {
  const name = text(value, 40).replace(/\s+/g, '');
  if (!name) return '마스터';
  if (name.length === 1) return name;
  if (name.length === 2) return `${name[0]}○`;
  return `${name[0]}${'○'.repeat(Math.max(1, name.length - 2))}${name[name.length - 1]}`;
}function reviewerEmails() {
  return new Set((process.env.TEACHER_REVIEWER_EMAILS || '').split(',').map((value) => value.trim().toLocaleLowerCase('en-US')).filter(Boolean));
}
function isReviewer(token) { return reviewerEmails().has(text(token?.email, 320).toLocaleLowerCase('en-US')); }
function assertReviewer(token) { if (!isReviewer(token)) throw apiError(403, 'REVIEWER_REQUIRED', '교사 인증 검토 권한이 필요해요.'); }
async function verifiedTeacher(uid) {
  const snap = await teachers.doc(uid).get();
  if (!snap.exists || snap.data()?.verificationStatus !== 'verified' || !snap.data()?.schoolKey) throw apiError(403, 'TEACHER_VERIFICATION_REQUIRED', '길드 창설·새 관리 참여 전 교사 재직 인증을 완료해 주세요.');
  return snap;
}
function proofFile(body) {
  const match = /^data:(image\/jpeg|image\/png|application\/pdf);base64,([A-Za-z0-9+/=\r\n]+)$/.exec(typeof body.fileData === 'string' ? body.fileData : '');
  if (!match) throw apiError(400, 'INVALID_PROOF_FILE', 'JPG, PNG 또는 PDF 증빙 파일을 선택해 주세요.');
  const bytes = Buffer.from(match[2].replace(/\s/g, ''), 'base64');
  if (bytes.length < 1024 || bytes.length > 2 * 1024 * 1024) throw apiError(400, 'PROOF_FILE_SIZE', '증빙 파일은 2MB 이하로 준비해 주세요.');
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = bytes.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]));
  const pdf = bytes.subarray(0, 5).toString('ascii') === '%PDF-';
  if ((match[1] === 'image/jpeg' && !jpeg) || (match[1] === 'image/png' && !png) || (match[1] === 'application/pdf' && !pdf)) throw apiError(400, 'PROOF_FILE_MISMATCH', '파일 형식과 실제 내용이 일치하지 않아요.');
  return { bytes, contentType: match[1] };
}
async function submitTeacherVerification(uid, token, body) {
  if (body.redactionConfirmed !== true) throw apiError(400, 'REDACTION_CONFIRMATION_REQUIRED', '주민등록번호·주소·전화번호를 가렸다는 확인이 필요해요.');
  const teacherName = normalizeTeacherName(body.teacherName);
  const { schoolName, schoolKey } = normalizeSchool(body.schoolName, body.schoolKey);
  const { bytes, contentType } = proofFile(body);
  const teacherRef = teachers.doc(uid);
  const teacherSnap = await teacherRef.get();
  if (teacherSnap.data()?.verificationStatus === 'verified') throw apiError(409, 'ALREADY_VERIFIED', '이미 교사 인증이 완료됐어요.');
  const requestRef = verificationRequests.doc();
  const extension = contentType === 'application/pdf' ? 'pdf' : contentType === 'image/png' ? 'png' : 'jpg';
  const objectPath = `teacher-verification/${uid}/${requestRef.id}.${extension}`;
  const expiresAt = Timestamp.fromMillis(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const bucket = adminStorage.bucket();
  await bucket.file(objectPath).save(bytes, { resumable: false, validation: 'md5', metadata: { contentType, contentDisposition: 'attachment; filename=teacher-proof.' + extension, cacheControl: 'private, no-store, max-age=0', metadata: { expiresAt: expiresAt.toDate().toISOString() } } });
  try {
    const batch = adminDb.batch();
    batch.create(requestRef, { uid, teacherName, schoolName, schoolKey, status: 'pending', objectPath, contentType, fileSize: bytes.length, redactionConfirmed: true, createdAt: FieldValue.serverTimestamp(), expiresAt });
    const previousRequestId = text(teacherSnap.data()?.verificationRequestId, 128);
    if (previousRequestId) batch.set(verificationRequests.doc(previousRequestId), { status: 'superseded', supersededAt: FieldValue.serverTimestamp(), objectPath: FieldValue.delete(), teacherName: FieldValue.delete(), schoolName: FieldValue.delete(), schoolKey: FieldValue.delete(), contentType: FieldValue.delete(), fileSize: FieldValue.delete(), fileHash: FieldValue.delete(), redactionConfirmed: FieldValue.delete(), email: FieldValue.delete(), googleDisplayName: FieldValue.delete() }, { merge: true });
    batch.set(teacherRef, { role: 'teacher', teacherName, verificationStatus: 'pending', verificationRequestId: requestRef.id, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    await batch.commit();
  } catch (error) { await bucket.file(objectPath).delete({ ignoreNotFound: true }).catch(() => {}); throw error; }
  const previousPath = text(teacherSnap.data()?.verificationObjectPath, 300);
  if (previousPath) await bucket.file(previousPath).delete({ ignoreNotFound: true }).catch(() => {});
  await teacherRef.set({ verificationObjectPath: objectPath }, { merge: true });
  return { status: 'pending', teacherName, schoolName, expiresAt: expiresAt.toDate().toISOString() };
}
async function listVerificationRequests(token) {
  assertReviewer(token);
  const snapshot = await verificationRequests.where('status', '==', 'pending').limit(50).get();
  const bucket = adminStorage.bucket();
  const activeDocs = snapshot.docs.filter((doc) => !isExpired(doc.data()?.expiresAt));
  const rows = await Promise.all(activeDocs.map(async (doc) => {
    const data = doc.data();
    let reviewUrl = '';
    if (data.objectPath) [reviewUrl] = await bucket.file(data.objectPath).getSignedUrl({ action: 'read', expires: Date.now() + 10 * 60 * 1000, responseDisposition: 'attachment' });
    return { id: doc.id, teacherName: text(data.teacherName, 40), schoolName: text(data.schoolName, 80), contentType: text(data.contentType, 40), fileSize: safeInt(data.fileSize, 0, 0), reviewUrl, createdAt: data.createdAt?.toDate?.().toISOString?.() || null };
  }));
  return rows.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
}
async function reviewTeacherVerification(token, body) {
  assertReviewer(token);
  const requestId = text(body.requestId, 128);
  const decision = body.decision === 'approve' ? 'approved' : body.decision === 'reject' ? 'rejected' : '';
  if (!requestId || !decision) throw apiError(400, 'INVALID_REVIEW', '검토 결과를 확인해 주세요.');
  const requestRef = verificationRequests.doc(requestId);
  const requestSnap = await requestRef.get();
  if (!requestSnap.exists || requestSnap.data()?.status !== 'pending') throw apiError(404, 'REQUEST_NOT_FOUND', '처리할 인증 신청을 찾지 못했어요.');
  const request = requestSnap.data();
  if (request.objectPath) await adminStorage.bucket().file(request.objectPath).delete({ ignoreNotFound: true });
  const teacherRef = teachers.doc(request.uid);
  const batch = adminDb.batch();
  batch.update(requestRef, { status: decision, reviewedByUid: token.uid, reviewedBy: FieldValue.delete(), reviewedAt: FieldValue.serverTimestamp(), objectPath: FieldValue.delete(), teacherName: FieldValue.delete(), schoolName: FieldValue.delete(), schoolKey: FieldValue.delete(), contentType: FieldValue.delete(), fileSize: FieldValue.delete(), fileHash: FieldValue.delete(), redactionConfirmed: FieldValue.delete(), email: FieldValue.delete(), googleDisplayName: FieldValue.delete() });
  if (decision === 'approved') batch.set(teacherRef, { role: 'teacher', teacherName: request.teacherName, schoolName: request.schoolName, schoolKey: request.schoolKey, verificationStatus: 'verified', verificationObjectPath: FieldValue.delete(), verifiedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  else batch.set(teacherRef, { verificationStatus: 'rejected', verificationObjectPath: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  await batch.commit();
  if (decision === 'approved') {
    const teacher = await teacherRef.get();
    const classSnaps = await Promise.all((teacher.data()?.classIds || []).slice(0, 100).map((id) => classes.doc(id).get()));
    const updates = classSnaps.filter((snap) => snap.exists && !snap.data()?.schoolKey && snap.data()?.managerIds?.[0] === request.uid).map((snap) => snap.ref.set({ schoolKey: request.schoolKey, schoolName: request.schoolName, updatedAt: FieldValue.serverTimestamp() }, { merge: true }));
    await Promise.all(updates);
  }
  return { requestId, status: decision };
}
function classPack(grade, wordPackId) {
  return wordPackById.get(wordPackId)?.id || defaultWordPack(grade);
}
async function bootstrap(uid, token) {
  const ref = teachers.doc(uid);
  await ref.set({ role: 'teacher', displayName: FieldValue.delete(), email: FieldValue.delete(), googleDisplayName: FieldValue.delete(), lastLoginAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  const data = (await ref.get()).data();
  return { displayName: text(data.teacherName, 40) || '교사', teacherName: text(data.teacherName, 40), schoolName: text(data.schoolName, 80), verificationStatus: text(data.verificationStatus, 20) || 'unverified', needsProfile: !data.teacherName || !['pending','verified'].includes(data.verificationStatus), isReviewer: isReviewer(token), guildIds: Array.isArray(data.classIds) ? data.classIds : [] };
}
async function ownedClass(uid, id) {
  const snap = await classes.doc(id).get();
  if (!snap.exists) throw apiError(404, 'GUILD_NOT_FOUND', '길드를 찾지 못했어요.');
  if (!snap.data().managerIds?.includes(uid)) throw apiError(403, 'NOT_GUILD_MANAGER', '이 길드의 관리자가 아니에요.');
  return snap;
}
async function createGuild(uid, body) {
  const teacherSnap = await verifiedTeacher(uid);
  const teacher = teacherSnap.data();
  const name = normalizeGuildName(body.guildName || body.classLabel);
  const guildSubtitle = normalizeGuildSubtitle(body.guildSubtitle);
  const grade = safeInt(body.grade, 0, 3, 6);
  if (name.length < 2 || !grade) throw apiError(400, 'INVALID_GUILD', '길드 이름과 기본 단어 수준을 확인해 주세요.');
  const ref = classes.doc();
  const defaultPackId = defaultWordPack(grade);
  const data = { schemaVersion: 2, guildName: name, classLabel: name, guildSubtitle, grade, ownerId: uid, managerIds: [uid], schoolKey: teacher.schoolKey, schoolName: teacher.schoolName, wordPackId: defaultPackId, wordPackIds: [defaultPackId], defaultQuestionTypes: [...DEFAULT_QUESTION_TYPES], createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() };
  await ref.create(data);
  await teachers.doc(uid).set({ classIds: FieldValue.arrayUnion(ref.id), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return { id: ref.id, guildName: name, guildSubtitle, grade, wordPackId: data.wordPackId, wordPackIds: data.wordPackIds, questionTypes: data.defaultQuestionTypes };
}
async function listClasses(uid) {
  const teacher = await teachers.doc(uid).get();
  const ids = (teacher.data()?.classIds || []).slice(0, 100);
  const snapshots = await Promise.all(ids.map((id) => classes.doc(id).get()));
  const result = [];
  for (const snap of snapshots) {
    const data = snap.data();
    if (!snap.exists || !data.managerIds?.includes(uid)) continue;
    const members = await snap.ref.collection('members').select('totalCorrect', 'guildPoints').get();
    let totalCorrect = 0; let guildPoints = 0;
    let activeStudentCount = 0;
    members.docs.forEach((member) => { const correct = safeInt(member.data()?.totalCorrect, 0, 0); const points = safeInt(member.data()?.guildPoints, 0, 0); totalCorrect += correct; guildPoints += points; if (points > 0) activeStudentCount += 1; });
    result.push({ id: snap.id, guildName: guildName(data), guildSubtitle: normalizeGuildSubtitle(data.guildSubtitle), grade: safeInt(data.grade, 4, 3, 6), managerCount: (data.managerIds || []).length, studentCount: members.size, activeStudentCount, totalCorrect, guildPoints, wordPackId: classPack(data.grade, data.wordPackId), wordPackIds: normalizeWordPackIds(data.wordPackIds || data.wordPackId, data.grade), questionTypes: normalizeQuestionTypes(data.defaultQuestionTypes) });
  }
  return result;
}
function safeQuestionTypeStats(value) {
  const result = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return result;
  LEARNING_QUESTION_TYPES.forEach((type) => {
    const row = value[type];
    result[type] = {
      tries: safeInt(row?.tries, 0, 0, 1000000000),
      correct: safeInt(row?.correct, 0, 0, 1000000000)
    };
  });
  return result;
}
async function listGuildMembers(uid, body) {
  const classId = text(body.classId, 128);
  const classSnap = await ownedClass(uid, classId);
  const data = classSnap.data();
  const membersSnap = await classSnap.ref.collection('members')
    .select('nickname', 'learningGrade', 'stage', 'totalCorrect', 'totalQuizTries', 'masteredCount', 'guildCoins', 'guildPoints', 'guildCorrectCount', 'guildStageClears', 'guildBossDamage', 'guildBossPointTotal', 'guildTrialCorrect', 'lastActiveAt', 'assignedWordPackIds', 'questionTypes', 'questionTypeStats')
    .limit(200).get();
  const members = membersSnap.docs.map((member) => {
    const value = member.data() || {};
    const totalCorrect = safeInt(value.totalCorrect, 0, 0, 1000000000);
    const totalQuizTries = Math.max(totalCorrect, safeInt(value.totalQuizTries, totalCorrect, 0, 1000000000));
    return {
      memberId: member.id,
      nickname: text(value.nickname, 30) || '이름 없는 용사',
      learningGrade: safeInt(value.learningGrade, 4, 3, 6),
      stage: safeInt(value.stage, 1, 1, 9999),
      totalCorrect,
      totalQuizTries,
      accuracy: totalQuizTries ? Math.round(totalCorrect / totalQuizTries * 1000) / 10 : 0,
      masteredCount: safeInt(value.masteredCount, 0, 0, 100000),
      guildCoins: safeInt(value.guildCoins, 0, 0, 1000000000),
      guildPoints: safeInt(value.guildPoints, 0, 0, 1000000000),
      guildCorrectCount: safeInt(value.guildCorrectCount, 0, 0, 1000000000),
      guildStageClears: safeInt(value.guildStageClears, 0, 0, 1000000),
      guildBossDamage: safeInt(value.guildBossDamage, 0, 0, 100000000000000),
      guildBossPointTotal: safeInt(value.guildBossPointTotal, 0, 0, 1000000000),
      guildTrialCorrect: safeInt(value.guildTrialCorrect, 0, 0, 1000000),
      assignedWordPackIds: normalizeWordPackIds(value.assignedWordPackIds || data.wordPackIds || data.wordPackId, value.learningGrade || data.grade),
      questionTypes: normalizeQuestionTypes(value.questionTypes || data.defaultQuestionTypes),
      questionTypeStats: safeQuestionTypeStats(value.questionTypeStats),
      lastActiveAt: value.lastActiveAt?.toDate?.().toISOString?.() || null
    };
  }).sort((a, b) => b.guildPoints - a.guildPoints || b.totalCorrect - a.totalCorrect || a.nickname.localeCompare(b.nickname));
  return {
    guild: {
      id: classSnap.id,
      guildName: guildName(data),
      guildSubtitle: normalizeGuildSubtitle(data.guildSubtitle),
      grade: safeInt(data.grade, 4, 3, 6),
      wordPackId: classPack(data.grade, data.wordPackId),
      wordPackIds: normalizeWordPackIds(data.wordPackIds || data.wordPackId, data.grade),
      questionTypes: normalizeQuestionTypes(data.defaultQuestionTypes),
      managerCount: Array.isArray(data.managerIds) ? data.managerIds.length : 0
    },
    members
  };
}
async function setWordPack(uid, body) {
  const classId = text(body.classId, 128);
  const classSnap = await ownedClass(uid, classId);
  const wordPackIds = normalizeWordPackIds(body.wordPackIds || body.wordPackId, classSnap.data().grade);
  await classSnap.ref.update({ wordPackId: wordPackIds[0], wordPackIds, updatedAt: FieldValue.serverTimestamp() });
  return { classId, wordPackId: wordPackIds[0], wordPackIds };
}
async function updateMemberLearningSettings(uid, body) {
  const classId = text(body.classId, 128);
  const classSnap = await ownedClass(uid, classId);
  const wordPackIds = normalizeWordPackIds(body.wordPackIds, classSnap.data().grade);
  const questionTypes = normalizeQuestionTypes(body.questionTypes);
  const membersRef = classSnap.ref.collection('members');
  let memberDocs;
  if (body.applyAll === true) {
    memberDocs = (await membersRef.limit(200).get()).docs;
  } else {
    const ids = [...new Set((Array.isArray(body.memberIds) ? body.memberIds : []).map((id) => text(id, 128)).filter(Boolean))].slice(0, 200);
    if (!ids.length) throw apiError(400, 'MEMBER_SELECTION_REQUIRED', '설정을 적용할 길드원을 선택해 주세요.');
    const snapshots = await Promise.all(ids.map((id) => membersRef.doc(id).get()));
    if (snapshots.some((snap) => !snap.exists)) throw apiError(404, 'GUILD_MEMBER_NOT_FOUND', '선택한 길드원 중 현재 길드에 없는 용사가 있어요.');
    memberDocs = snapshots;
  }
  if (!memberDocs.length) throw apiError(409, 'NO_GUILD_MEMBERS', '설정을 적용할 길드원이 아직 없어요.');
  const batch = adminDb.batch();
  memberDocs.forEach((member) => batch.set(member.ref, {
    assignedWordPackIds: wordPackIds,
    questionTypes,
    learningSettingsVersion: 1,
    learningSettingsUpdatedBy: uid,
    learningSettingsUpdatedAt: FieldValue.serverTimestamp()
  }, { merge: true }));
  if (body.applyAll === true && body.applyToFuture !== false) batch.update(classSnap.ref, {
    wordPackId: wordPackIds[0],
    wordPackIds,
    defaultQuestionTypes: questionTypes,
    updatedAt: FieldValue.serverTimestamp()
  });
  await batch.commit();
  return { classId, updatedCount: memberDocs.length, wordPackIds, questionTypes, futureMembersUpdated: body.applyAll === true && body.applyToFuture !== false };
}
async function wordPackPreview(body) {
  const wordPackId = text(body.wordPackId, 80);
  const meta = wordPackById.get(wordPackId);
  const words = packWordsById.get(wordPackId);
  if (!meta || !words) throw apiError(404, 'WORD_PACK_NOT_FOUND', '단어팩을 찾지 못했어요.');
  return { ...meta, words: [...words.values()].slice(0, 1000) };
}
async function guildLearningReport(uid, body) {
  const details = await listGuildMembers(uid, body);
  const analysis = await wrongWordSummary(uid, body);
  const members = details.members;
  const now = Date.now();
  const questionTypeStats = {};
  LEARNING_QUESTION_TYPES.forEach((type) => { questionTypeStats[type] = { tries: 0, correct: 0 }; });
  members.forEach((member) => LEARNING_QUESTION_TYPES.forEach((type) => {
    questionTypeStats[type].tries += safeInt(member.questionTypeStats?.[type]?.tries, 0, 0);
    questionTypeStats[type].correct += safeInt(member.questionTypeStats?.[type]?.correct, 0, 0);
  }));
  const totalTries = members.reduce((sum, member) => sum + member.totalQuizTries, 0);
  const totalCorrect = members.reduce((sum, member) => sum + member.totalCorrect, 0);
  return {
    guild: details.guild,
    summary: {
      memberCount: members.length,
      active7Days: members.filter((member) => member.lastActiveAt && now - Date.parse(member.lastActiveAt) <= 7 * 24 * 60 * 60 * 1000).length,
      totalTries,
      totalCorrect,
      accuracy: totalTries ? Math.round(totalCorrect / totalTries * 1000) / 10 : 0,
      masteredCount: members.reduce((sum, member) => sum + member.masteredCount, 0),
      guildPoints: members.reduce((sum, member) => sum + member.guildPoints, 0),
      guildBossDamage: members.reduce((sum, member) => sum + member.guildBossDamage, 0)
    },
    questionTypeStats,
    topWrongWords: analysis.words.slice(0, 20),
    activeTrial: analysis.activeTrial,
    members
  };
}
async function memberLearningReport(uid, body) {
  const classId = text(body.classId, 128);
  const memberId = text(body.memberId, 128);
  if (!memberId) throw apiError(400, 'MEMBER_REQUIRED', '길드원을 선택해 주세요.');
  const classSnap = await ownedClass(uid, classId);
  const memberRef = classSnap.ref.collection('members').doc(memberId);
  const [memberSnap, accountSnap] = await Promise.all([memberRef.get(), accounts.doc(memberId).get()]);
  if (!memberSnap.exists) throw apiError(404, 'GUILD_MEMBER_NOT_FOUND', '현재 길드에서 해당 용사를 찾지 못했어요.');
  const member = memberSnap.data() || {};
  const state = accountSnap.data()?.state || {};
  const totalCorrect = safeInt(state.totalQuizCorrect, safeInt(member.totalCorrect, 0, 0), 0, 1000000000);
  const totalQuizTries = Math.max(totalCorrect, safeInt(state.totalQuizTries, safeInt(member.totalQuizTries, totalCorrect, 0), 0, 1000000000));
  const wrong = state.wrongWordCounts && typeof state.wrongWordCounts === 'object' && !Array.isArray(state.wrongWordCounts) ? state.wrongWordCounts : {};
  const wrongWords = Object.entries(wrong).map(([rawWord, rawCount]) => {
    const key = text(rawWord, 80).toLowerCase();
    const entry = wordByKey.get(key);
    return entry ? { ...entry, wrongCount: safeInt(rawCount, 0, 0, 1000000) } : null;
  }).filter((entry) => entry && entry.wrongCount > 0).sort((a, b) => b.wrongCount - a.wrongCount || a.word.localeCompare(b.word)).slice(0, 50);
  return {
    memberId,
    nickname: text(member.nickname, 30) || '이름 없는 용사',
    learningGrade: safeInt(member.learningGrade, 4, 3, 6),
    stage: safeInt(member.stage, 1, 1, 9999),
    totalQuizTries,
    totalCorrect,
    accuracy: totalQuizTries ? Math.round(totalCorrect / totalQuizTries * 1000) / 10 : 0,
    masteredCount: Array.isArray(state.masteredWords) ? state.masteredWords.length : safeInt(member.masteredCount, 0, 0),
    guildPoints: safeInt(member.guildPoints, 0, 0),
    guildCoins: safeInt(member.guildCoins, 0, 0),
    guildBossDamage: safeInt(member.guildBossDamage, 0, 0),
    assignedWordPackIds: normalizeWordPackIds(member.assignedWordPackIds || classSnap.data().wordPackIds || classSnap.data().wordPackId, member.learningGrade || classSnap.data().grade),
    questionTypes: normalizeQuestionTypes(member.questionTypes || classSnap.data().defaultQuestionTypes),
    questionTypeStats: safeQuestionTypeStats(state.questionTypeStats || member.questionTypeStats),
    wrongWords,
    lastActiveAt: member.lastActiveAt?.toDate?.().toISOString?.() || null
  };
}const TRIAL_TYPES = new Set(['meaning-choice', 'word-choice', 'spelling', 'unscramble']);
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
  const eligibleWords = wordByKey;
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
async function listSchoolGuilds(uid) {
  const teacherSnap = await verifiedTeacher(uid);
  const teacher = teacherSnap.data();
  const snapshot = await classes.where('schoolKey', '==', teacher.schoolKey).limit(100).get();
  const ownerIds = [...new Set(snapshot.docs.map((snap) => text(snap.data()?.ownerId, 128)).filter(Boolean))];
  const ownerSnaps = ownerIds.length ? await adminDb.getAll(...ownerIds.map((id) => teachers.doc(id))) : [];
  const ownerNames = new Map(ownerSnaps.map((snap) => [snap.id, text(snap.data()?.teacherName || snap.data()?.displayName, 40) || '마스터']));
  const guilds = [];
  const incomingRequests = [];
  for (const classSnap of snapshot.docs) {
    const data = classSnap.data();
    const managed = Array.isArray(data.managerIds) && data.managerIds.includes(uid);
    const ownRequest = managed ? null : await classSnap.ref.collection('managerRequests').doc(uid).get();
    const masterName = ownerNames.get(text(data.ownerId, 128)) || '마스터';
    guilds.push({ id: classSnap.id, guildName: guildName(data), guildSubtitle: normalizeGuildSubtitle(data.guildSubtitle), grade: safeInt(data.grade, 4, 3, 6), managerCount: Array.isArray(data.managerIds) ? data.managerIds.length : 0, masterName: managed ? masterName : maskedTeacherName(masterName), managed, requestStatus: ownRequest?.data()?.status || '' });
    if (managed) {
      const requests = await classSnap.ref.collection('managerRequests').where('status', '==', 'pending').limit(50).get();
      requests.docs.forEach((request) => incomingRequests.push({ id: request.id, classId: classSnap.id, guildName: guildName(data), teacherName: text(request.data()?.teacherName, 40) || '이름 미확인', requestedAt: request.data()?.requestedAt?.toDate?.().toISOString?.() || null }));
    }
  }
  return { schoolName: teacher.schoolName, guilds: guilds.sort((a, b) => Number(b.managed) - Number(a.managed) || a.guildName.localeCompare(b.guildName)), incomingRequests };
}
async function schoolGuildPreview(uid, body) {
  const teacherSnap = await verifiedTeacher(uid);
  const teacher = teacherSnap.data();
  const classId = text(body.classId, 128);
  const classRef = classes.doc(classId);
  const classSnap = await classRef.get();
  if (!classSnap.exists || classSnap.data()?.schoolKey !== teacher.schoolKey) throw apiError(404, 'SCHOOL_GUILD_NOT_FOUND', '같은 학교의 길드를 찾지 못했어요.');
  const data = classSnap.data();
  const managed = Array.isArray(data.managerIds) && data.managerIds.includes(uid);
  const [memberCountSnap, ownRequest, ownerSnap] = await Promise.all([
    classRef.collection('members').count().get(),
    managed ? Promise.resolve(null) : classRef.collection('managerRequests').doc(uid).get(),
    teachers.doc(text(data.ownerId, 128)).get()
  ]);
  const masterName = text(ownerSnap.data()?.teacherName || ownerSnap.data()?.displayName, 40) || '마스터';
  return { id: classSnap.id, guildName: guildName(data), guildSubtitle: normalizeGuildSubtitle(data.guildSubtitle), grade: safeInt(data.grade, 4, 3, 6), memberCount: safeInt(memberCountSnap.data()?.count, 0, 0, 100000), managerCount: Array.isArray(data.managerIds) ? data.managerIds.length : 0, masterName: managed ? masterName : maskedTeacherName(masterName), managed, requestStatus: ownRequest?.data()?.status || '' };
}async function requestSchoolGuildJoin(uid, body) {
  const teacherSnap = await verifiedTeacher(uid);
  const teacher = teacherSnap.data();
  const classId = text(body.classId, 128);
  const classRef = classes.doc(classId);
  const classSnap = await classRef.get();
  if (!classSnap.exists || classSnap.data()?.schoolKey !== teacher.schoolKey) throw apiError(404, 'SCHOOL_GUILD_NOT_FOUND', '같은 학교의 길드를 찾지 못했어요.');
  if (classSnap.data()?.managerIds?.includes(uid)) return { classId, status: 'approved' };
  await classRef.collection('managerRequests').doc(uid).set({ uid, teacherName: teacher.teacherName, schoolKey: teacher.schoolKey, status: 'pending', requestedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return { classId, status: 'pending' };
}
async function reviewSchoolGuildJoin(uid, body) {
  const classId = text(body.classId, 128);
  const targetUid = text(body.targetUid, 128);
  const decision = body.decision === 'approve' ? 'approved' : body.decision === 'reject' ? 'rejected' : '';
  if (!targetUid || !decision) throw apiError(400, 'INVALID_JOIN_REVIEW', '가입 신청 검토 결과를 확인해 주세요.');
  const classSnap = await ownedClass(uid, classId);
  const requestRef = classSnap.ref.collection('managerRequests').doc(targetUid);
  const [requestSnap, targetTeacher] = await Promise.all([requestRef.get(), teachers.doc(targetUid).get()]);
  if (!requestSnap.exists || requestSnap.data()?.status !== 'pending') throw apiError(404, 'JOIN_REQUEST_NOT_FOUND', '처리할 가입 신청을 찾지 못했어요.');
  if (!targetTeacher.exists || targetTeacher.data()?.verificationStatus !== 'verified' || targetTeacher.data()?.schoolKey !== classSnap.data()?.schoolKey) throw apiError(409, 'SCHOOL_MISMATCH', '같은 학교의 인증된 교사인지 다시 확인해 주세요.');
  const batch = adminDb.batch();
  batch.update(requestRef, { status: decision, reviewedBy: uid, reviewedAt: FieldValue.serverTimestamp() });
  if (decision === 'approved') {
    batch.update(classSnap.ref, { managerIds: FieldValue.arrayUnion(targetUid), updatedAt: FieldValue.serverTimestamp() });
    batch.set(teachers.doc(targetUid), { classIds: FieldValue.arrayUnion(classId), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  }
  await batch.commit();
  return { classId, targetUid, status: decision };
}
async function listGuildManagers(uid, body) {
  const classId = text(body.classId, 128);
  const classSnap = await ownedClass(uid, classId);
  const data = classSnap.data();
  const managerIds = [...new Set((data.managerIds || []).map((id) => text(id, 128)).filter(Boolean))];
  const snapshots = managerIds.length ? await adminDb.getAll(...managerIds.map((id) => teachers.doc(id))) : [];
  const byId = new Map(snapshots.map((snap) => [snap.id, snap.data() || {}]));
  return { classId, isOwner: data.ownerId === uid, managers: managerIds.map((id) => ({ uid: id, teacherName: text(byId.get(id)?.teacherName || byId.get(id)?.displayName, 40) || '이름 미확인', isOwner: id === data.ownerId, isMe: id === uid })) };
}
async function removeGuildManager(uid, body) {
  const classId = text(body.classId, 128);
  const targetUid = text(body.targetUid, 128);
  const classRef = classes.doc(classId);
  const classSnap = await classRef.get();
  if (!classSnap.exists || classSnap.data()?.ownerId !== uid) throw apiError(403, 'GUILD_OWNER_REQUIRED', '길드 마스터만 공동 관리자를 내보낼 수 있어요.');
  if (!targetUid || targetUid === uid || targetUid === classSnap.data()?.ownerId) throw apiError(400, 'INVALID_MANAGER_REMOVAL', '길드 마스터는 내보낼 수 없어요.');
  if (!(classSnap.data()?.managerIds || []).includes(targetUid)) throw apiError(404, 'MANAGER_NOT_FOUND', '공동 관리자를 찾지 못했어요.');
  const batch = adminDb.batch();
  batch.update(classRef, { managerIds: FieldValue.arrayRemove(targetUid), updatedAt: FieldValue.serverTimestamp() });
  batch.set(teachers.doc(targetUid), { classIds: FieldValue.arrayRemove(classId), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  await batch.commit();
  return { classId, targetUid, removed: true };
}async function invite(uid, body) {
  const classId = text(body.classId, 128);
  const type = body.type === 'manager' ? 'manager' : body.type === 'student' ? 'student' : '';
  if (!type) throw apiError(400, 'INVALID_INVITE_TYPE', '초대 코드 종류를 확인해 주세요.');
  const classSnap = await ownedClass(uid, classId);
  const rotate = body.rotate === true;
  const currentCode = text(classSnap.data()?.inviteCodes?.[type]?.code, 32).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!rotate && currentCode) {
    const currentSnap = await invites.doc(hash(currentCode)).get();
    if (currentSnap.exists && currentSnap.data().type === type && currentSnap.data().classId === classId && !isExpired(currentSnap.data().expiresAt)) {
      return { code: currentCode, type, persistent: true };
    }
  }
  let code; let ref; let available = false;
  for (let index = 0; index < 5; index += 1) {
    code = randomCode();
    if (code.length < 6) continue;
    ref = invites.doc(hash(code));
    if (!(await ref.get()).exists) { available = true; break; }
  }
  if (!ref || !available) throw apiError(500, 'INVITE_CREATE_FAILED', '초대 코드를 만들지 못했어요.');
  const previous = await invites.where('classId', '==', classId).limit(100).get();
  const batch = adminDb.batch();
  previous.docs.filter((doc) => doc.data()?.type === type).forEach((doc) => batch.delete(doc.ref));
  batch.create(ref, { type, classId, classLabel: guildName(classSnap.data()), createdBy: uid, persistent: true, createdAt: FieldValue.serverTimestamp() });
  batch.update(classSnap.ref, { [`inviteCodes.${type}`]: { code, rotatedAt: Timestamp.now() }, updatedAt: FieldValue.serverTimestamp() });
  await batch.commit();
  return { code, type, persistent: true };
}
async function joinManager(uid, body) {
  await verifiedTeacher(uid);
  const code = text(body.code, 32).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length < 6) throw apiError(400, 'INVALID_INVITE', '공동 관리자 코드를 확인해 주세요.');
  const ref = invites.doc(hash(code));
  return adminDb.runTransaction(async (transaction) => {
    const invite = await transaction.get(ref);
    if (!invite.exists || invite.data().type !== 'manager' || isExpired(invite.data().expiresAt)) throw apiError(404, 'INVITE_NOT_FOUND', '코드가 올바르지 않거나 만료됐어요.');
    const classRef = classes.doc(invite.data().classId);
    const classSnap = await transaction.get(classRef);
    if (!classSnap.exists) throw apiError(404, 'GUILD_NOT_FOUND', '길드를 찾지 못했어요.');
    const configuredCode = text(classSnap.data()?.inviteCodes?.manager?.code, 32).toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (configuredCode && configuredCode !== code) throw apiError(404, 'INVITE_REPLACED', '이전 초대 정보예요. 길드 마스터에게 새 코드·QR·링크를 받아 주세요.');
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
    else if (body.action === 'submitVerification') response = { verification: await submitTeacherVerification(token.uid, token, body) };
    else if (body.action === 'listVerificationRequests') response = { requests: await listVerificationRequests(token) };
    else if (body.action === 'reviewVerification') response = { review: await reviewTeacherVerification(token, body) };
    else if (body.action === 'listSchoolGuilds') response = { school: await listSchoolGuilds(token.uid) };
    else if (body.action === 'schoolGuildPreview') response = { guild: await schoolGuildPreview(token.uid, body) };
    else if (body.action === 'requestSchoolGuildJoin') response = { request: await requestSchoolGuildJoin(token.uid, body) };
    else if (body.action === 'reviewSchoolGuildJoin') response = { review: await reviewSchoolGuildJoin(token.uid, body) };
    else if (body.action === 'createGuild' || body.action === 'createClass') response = { classroom: await createGuild(token.uid, body) };
    else if (body.action === 'listClasses') response = { classes: await listClasses(token.uid) };
    else if (body.action === 'listWordPacks') response = { wordPacks: WORD_PACKS, questionTypes: [{ id: 'meaning-choice', label: '뜻 찾기 (4지선다)', default: true }, { id: 'fill-blank', label: '빈칸 넣기' }, { id: 'word-choice', label: '영어 단어 찾기 (4지선다)' }, { id: 'listen-meaning', label: '발음 듣고 뜻 찾기' }] };
    else if (body.action === 'wordPackPreview') response = { wordPack: await wordPackPreview(body) };
    else if (body.action === 'guildMembers') response = { details: await listGuildMembers(token.uid, body) };
    else if (body.action === 'guildReport') response = { report: await guildLearningReport(token.uid, body) };
    else if (body.action === 'memberReport') response = { report: await memberLearningReport(token.uid, body) };
    else if (body.action === 'updateMemberLearningSettings') response = { assignment: await updateMemberLearningSettings(token.uid, body) };
    else if (body.action === 'setClassWordPack' || body.action === 'setWordPack') response = { assignment: await setWordPack(token.uid, body) };
    else if (body.action === 'guildWrongWords') response = { analysis: await wrongWordSummary(token.uid, body) };
    else if (body.action === 'createGuildTrial') response = { trial: await createGuildTrial(token.uid, body) };
    else if (body.action === 'listGuildManagers') response = { management: await listGuildManagers(token.uid, body) };
    else if (body.action === 'removeGuildManager') response = { management: await removeGuildManager(token.uid, body) };
    else if (body.action === 'createInvite') response = { invite: await invite(token.uid, body) };
    else if (body.action === 'joinAsManager') response = { membership: await joinManager(token.uid, body) };
    else throw apiError(400, 'UNKNOWN_ACTION', '알 수 없는 요청이에요.');
    sendJson(res, 200, { ok: true, ...response });
  } catch (error) { handleApiError(res, error); }
}
