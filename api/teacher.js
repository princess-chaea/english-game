import { readFileSync } from 'node:fs';
import { randomInt, randomUUID } from 'node:crypto';
import { adminAuth, adminDb, adminStorage, AggregateField, FieldValue, Timestamp } from './_firebase-admin.js';
import { apiError, handleApiError, hash, isExpired, readBody, requireMethod, requireTeacher, safeInt, sendJson, text } from './_http.js';

const teachers = adminDb.collection('teachers');
const accounts = adminDb.collection('accounts');
const classes = adminDb.collection('classes');
const invites = adminDb.collection('classInvites');
const verificationRequests = adminDb.collection('teacherVerificationRequests');
const INVITE_CODE_LENGTH = 6;
const INVITE_CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const INVITE_CODE_DIGITS = '23456789';
const INVITE_CODE_ALPHABET = INVITE_CODE_LETTERS + INVITE_CODE_DIGITS;
const DELETE_QUERY_PAGE_SIZE = 100;

function guildCoManagerCount(data) {
  const ownerId = guildOwnerId(data);
  const managerIds = Array.isArray(data?.managerIds) ? data.managerIds : [];
  return managerIds.filter((id) => text(id, 128) && text(id, 128) !== ownerId).length;
}

function guildOwnerId(data) {
  return text(data?.ownerId || data?.managerIds?.[0], 128);
}
function guildManagerIds(data) {
  const ownerId = guildOwnerId(data);
  return [...new Set([ownerId, ...(Array.isArray(data?.managerIds) ? data.managerIds : [])].map((id) => text(id, 128)).filter(Boolean))];
}

function normalizeInviteCode(value) {
  return text(value, 32).toUpperCase().replace(/[^A-Z0-9]/g, '');
}
function guildInviteCode() {
  const chars = [
    INVITE_CODE_LETTERS[randomInt(INVITE_CODE_LETTERS.length)],
    INVITE_CODE_DIGITS[randomInt(INVITE_CODE_DIGITS.length)],
    ...Array.from({ length: INVITE_CODE_LENGTH - 2 }, () => INVITE_CODE_ALPHABET[randomInt(INVITE_CODE_ALPHABET.length)])
  ];
  for (let index = chars.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    [chars[index], chars[swapIndex]] = [chars[swapIndex], chars[index]];
  }
  return chars.join('');
}
async function queryAllDocs(baseQuery, pageSize = DELETE_QUERY_PAGE_SIZE) {
  const docs = [];
  let cursor = null;
  while (true) {
    let query = baseQuery.limit(pageSize);
    if (cursor) query = query.startAfter(cursor);
    const page = await query.get();
    docs.push(...page.docs);
    if (page.size < pageSize) return docs;
    cursor = page.docs[page.docs.length - 1];
  }
}
async function getAllInChunks(refs, chunkSize = DELETE_QUERY_PAGE_SIZE) {
  const snapshots = [];
  for (let offset = 0; offset < refs.length; offset += chunkSize) {
    snapshots.push(...await adminDb.getAll(...refs.slice(offset, offset + chunkSize)));
  }
  return snapshots;
}
async function deleteRefsInBatches(refs) {
  const uniqueRefs = [...new Map(refs.map((ref) => [ref.path, ref])).values()];
  for (let offset = 0; offset < uniqueRefs.length; offset += 400) {
    const batch = adminDb.batch();
    uniqueRefs.slice(offset, offset + 400).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
}

const packCatalog = JSON.parse(readFileSync(new URL('../data/word-packs.json', import.meta.url), 'utf8'));
const MIN_LEARNING_GRADE = 3;
const MAX_LEARNING_GRADE = 12;
const wordByKey = new Map((packCatalog.words || []).map((entry) => {
  const key = text(entry?.word, 80).toLowerCase();
  return [key, { ...entry, word: text(entry?.word, 80), meaning: text(entry?.meaning, 160) }];
}).filter(([key, entry]) => key && entry.meaning));
const packWordsById = new Map();
(packCatalog.packs || []).forEach((pack) => {
  const words = new Map();
  const entries = Array.isArray(pack.wordKeys)
    ? pack.wordKeys.map((key) => wordByKey.get(text(key, 80).toLowerCase())).filter(Boolean)
    : (pack.words || []);
  entries.forEach((entry) => {
    const key = text(entry?.word, 80).toLowerCase();
    const meaning = text(entry?.meaning, 160);
    if (!key || !meaning) return;
    const word = { word: text(entry.word, 80), meaning };
    if (!words.has(key)) words.set(key, word);
    if (!wordByKey.has(key)) wordByKey.set(key, word);
  });
  packWordsById.set(text(pack?.id, 80), words);
});
// 초3~고3 하·중·상은 하 ⊂ 중 ⊂ 상 누적 구조이며, 새 길드 기본값은 해당 학년의 중 수준입니다.
const primaryPackKinds = new Set(['curriculum-spiral']);
const WORD_PACKS = (packCatalog.packs || []).filter((pack) => primaryPackKinds.has(pack.kind)).map((pack) => ({
  id: text(pack.id, 80),
  label: text(pack.label, 100),
  grade: pack.grade == null ? null : safeInt(pack.grade, 4, MIN_LEARNING_GRADE, MAX_LEARNING_GRADE),
  level: text(pack.level, 16) || null,
  levelLabel: text(pack.levelLabel, 8) || null,
  cumulative: Boolean(pack.cumulative),
  wordCount: Array.isArray(pack.wordKeys) ? pack.wordKeys.length : Array.isArray(pack.words) ? pack.words.length : safeInt(pack.wordCount, 0, 0),
  kind: text(pack.kind, 40)
}));
const wordPackById = new Map((packCatalog.packs || []).map((pack) => [text(pack?.id, 80), {
  id: text(pack.id, 80),
  label: text(pack.label, 100),
  grade: pack.grade == null ? null : safeInt(pack.grade, 4, MIN_LEARNING_GRADE, MAX_LEARNING_GRADE),
  level: text(pack.level, 16) || null,
  levelLabel: text(pack.levelLabel, 8) || null,
  cumulative: Boolean(pack.cumulative),
  wordCount: Array.isArray(pack.wordKeys) ? pack.wordKeys.length : Array.isArray(pack.words) ? pack.words.length : safeInt(pack.wordCount, 0, 0),
  kind: text(pack.kind, 40)
}]));
const defaultWordPack = (grade) => 'grade-' + safeInt(grade, 4, MIN_LEARNING_GRADE, MAX_LEARNING_GRADE) + '-mid';
const LEARNING_QUESTION_TYPES = new Set(['meaning-choice', 'fill-blank', 'word-choice', 'listen-meaning', 'word-order', 'short-answer']);
const DEFAULT_QUESTION_TYPES = ['meaning-choice'];
function normalizeWordPackIds(value, grade = 4) {
  const source = Array.isArray(value) ? value : value ? [value] : [];
  const ids = [...new Set(source.map((item) => text(item, 80)).filter((id) => wordPackById.has(id)))].slice(0, 12);
  return ids.length ? ids : [defaultWordPack(grade)];
}
function normalizeQuestionTypes(value) {
  const source = Array.isArray(value) ? value : [];
  const types = [...new Set(source.map((item) => text(item, 32)).filter((item) => LEARNING_QUESTION_TYPES.has(item)))];
  return ['meaning-choice', ...types.filter((item) => item !== 'meaning-choice')];
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
  if (!/^[가-힣A-Za-z0-9 ()\-]{1,32}$/u.test(subtitle)) throw apiError(400, 'INVALID_GUILD_SUBTITLE', '길드 태그는 한글·영문·숫자·공백·괄호·하이픈만 사용해 32자 이내로 입력해 주세요.');
  return subtitle;
}
function safeGuildLogoUrl(value) {
  const url = text(value, 1200);
  return /^https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/[A-Za-z0-9._-]+\/o\//.test(url) ? url : null;
}
function guildLogoFile(body) {
  const match = /^data:(image\/jpeg|image\/png|image\/webp);base64,([A-Za-z0-9+/=\r\n]+)$/.exec(typeof body.fileData === 'string' ? body.fileData : '');
  if (!match) throw apiError(400, 'INVALID_GUILD_LOGO', 'JPG, PNG 또는 WebP 로고 파일을 선택해 주세요.');
  const bytes = Buffer.from(match[2].replace(/\s/g, ''), 'base64');
  if (bytes.length < 512 || bytes.length > 2 * 1024 * 1024) throw apiError(400, 'GUILD_LOGO_SIZE', '길드 로고는 2MB 이하로 준비해 주세요.');
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = bytes.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]));
  const webp = bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP';
  if (!jpeg && !png && !webp) throw apiError(400, 'INVALID_GUILD_LOGO', '이미지 파일의 실제 형식을 확인해 주세요.');
  return bytes;
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
function normalizedProofText(value) {
  return text(value, 20000).toLocaleLowerCase('ko-KR').replace(/[^0-9a-z가-힣]/g, '');
}
function seoulDateOnly() {
  const shifted = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()));
}
function oneCalendarMonthBefore(date) {
  const result = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1));
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(date.getUTCDate(), lastDay));
  return result;
}
function proofDateCandidates(value) {
  const source = text(value, 20000);
  const found = [];
  const pattern = /(20\d{2})\s*(?:년|[.\/-])\s*(\d{1,2})\s*(?:월|[.\/-])\s*(\d{1,2})\s*(?:일)?/g;
  for (const match of source.matchAll(pattern)) {
    const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day) found.push(date);
  }
  return found.sort((a, b) => b.getTime() - a.getTime());
}
async function extractPdfProofText(bytes) {
  let document;
  try {
    const Canvas = await import('@napi-rs/canvas');
    globalThis.DOMMatrix ||= Canvas.DOMMatrix;
    globalThis.ImageData ||= Canvas.ImageData;
    globalThis.Path2D ||= Canvas.Path2D;
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    document = await getDocument({ data: new Uint8Array(bytes), disableFontFace: true, isEvalSupported: false, useWorkerFetch: false }).promise;
    const page = await document.getPage(1);
    const content = await page.getTextContent();
    const embeddedText = text(content.items.map((item) => typeof item?.str === 'string' ? item.str : '').join(' '), 20000);
    if (embeddedText.length >= 8) return { rawDocumentText: embeddedText, confidence: 100, source: 'pdf_text' };
    const baseViewport = page.getViewport({ scale: 1 });
    let renderScale = Math.max(0.05, Math.min(2.5, 1800 / baseViewport.width, 2400 / baseViewport.height));
    let viewport = page.getViewport({ scale: renderScale });
    const maxPixels = 3_000_000;
    if (viewport.width * viewport.height > maxPixels) {
      renderScale *= Math.sqrt(maxPixels / (viewport.width * viewport.height));
      viewport = page.getViewport({ scale: renderScale });
    }
    const canvas = Canvas.createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    const [{ createWorker }, { default: korData }] = await Promise.all([import('tesseract.js'), import('@tesseract.js-data/kor')]);
    const worker = await createWorker('kor', 1, { langPath: korData.langPath, gzip: true, cacheMethod: 'none' });
    try {
      const result = await worker.recognize(canvas.toBuffer('image/png'));
      return { rawDocumentText: text(result.data.text, 20000), confidence: safeInt(result.data.confidence, 0, 0, 100), source: 'pdf_ocr' };
    } finally {
      await worker.terminate();
    }
  } catch (error) {
    console.warn('[TeacherProof] PDF OCR failed:', error?.message || error);
    return { rawDocumentText: '', confidence: 0, source: 'failed' };
  } finally {
    if (document) await document.destroy().catch(() => {});
  }
}
async function extractImageProofText(bytes) {
  try {
    const [{ createWorker }, { default: korData }] = await Promise.all([import('tesseract.js'), import('@tesseract.js-data/kor')]);
    const worker = await createWorker('kor', 1, { langPath: korData.langPath, gzip: true, cacheMethod: 'none' });
    try {
      const result = await worker.recognize(bytes);
      return { rawDocumentText: text(result.data.text, 20000), confidence: safeInt(result.data.confidence, 0, 0, 100), source: 'image_ocr' };
    } finally {
      await worker.terminate();
    }
  } catch (error) {
    console.warn('[TeacherProof] Image OCR failed:', error?.message || error);
    return { rawDocumentText: '', confidence: 0, source: 'failed' };
  }
}async function screenTeacherProof(bytes, teacherName, schoolName, contentType) {
  const extraction = contentType === 'application/pdf' ? await extractPdfProofText(bytes) : await extractImageProofText(bytes);
  const { rawDocumentText, confidence, source } = extraction;
  const documentText = normalizedProofText(rawDocumentText);
  const normalizedName = normalizedProofText(teacherName);
  const normalizedSchool = normalizedProofText(schoolName);
  const nameMatched = Boolean(normalizedName && documentText.includes(normalizedName));
  const schoolMatched = Boolean(normalizedSchool && documentText.includes(normalizedSchool));
  const documentMatched = documentText.includes('재직증명서') && (documentText.includes('교사') || documentText.includes('재직'));
  const templateMatched = documentText.includes('발급번호') && documentText.includes('재직함을증명');
  const today = seoulDateOnly();
  const futureLimit = new Date(today);
  futureLimit.setUTCDate(futureLimit.getUTCDate() + 1);
  const issueDate = proofDateCandidates(rawDocumentText).find((date) => date <= futureLimit) || null;
  const cutoff = oneCalendarMonthBefore(today);
  const dateFresh = Boolean(issueDate && issueDate >= cutoff && issueDate <= futureLimit);
  const dateExpired = Boolean(issueDate && issueDate < cutoff);
  const checks = { nameMatched, schoolMatched, documentMatched, templateMatched, dateFresh };
  let outcome = 'needs_review';
  let reason = '이름·학교명·문서 종류·발급일 중 일부를 자동 확인하지 못했어요.';
  const exactIdentityAndTemplate = nameMatched && schoolMatched && documentMatched && templateMatched;
  const isReadableStandardDocument = source === 'pdf_text' || (['pdf_ocr', 'image_ocr'].includes(source) && confidence >= 45);
  if (isReadableStandardDocument && exactIdentityAndTemplate && dateExpired) {
    outcome = 'auto_rejected';
    reason = '발급일이 현재 날짜 기준 1개월을 초과했어요.';
  } else if (isReadableStandardDocument && rawDocumentText.length >= 8 && Object.values(checks).every(Boolean)) {
    reason = '1차 자동 확인을 통과했어요. 총괄 관리자의 수동 승인을 기다려 주세요.';
  } else {
    const missing = [];
    if (!nameMatched) missing.push('이름');
    if (!schoolMatched) missing.push('학교명');
    if (!documentMatched) missing.push('문서 종류');
    if (!templateMatched) missing.push('표준 양식');
    if (!dateFresh) missing.push('최근 1개월 발급일');
    if (contentType === 'application/pdf' && missing.length) reason = missing.join('·') + ' 확인이 필요해요.';
  }
  return { outcome, reason, confidence, source, checks, issueDate: issueDate?.toISOString().slice(0, 10) || null };
}
async function applyVerifiedSchoolToOwnedGuilds(uid, schoolKey, schoolName) {
  const teacher = await teachers.doc(uid).get();
  const classSnaps = await Promise.all((teacher.data()?.classIds || []).slice(0, 100).map((id) => classes.doc(id).get()));
  await Promise.all(classSnaps.filter((snap) => snap.exists && !snap.data()?.schoolKey && snap.data()?.managerIds?.[0] === uid).map((snap) => snap.ref.set({ schoolKey, schoolName, updatedAt: FieldValue.serverTimestamp() }, { merge: true })));
}
async function submitTeacherVerification(uid, token, body) {
  if (body.redactionConfirmed !== true) throw apiError(400, 'REDACTION_CONFIRMATION_REQUIRED', '주민등록번호·주소·전화번호를 가렸다는 확인이 필요해요.');
  const teacherName = normalizeTeacherName(body.teacherName);
  const { schoolName, schoolKey } = normalizeSchool(body.schoolName, body.schoolKey);
  const { bytes, contentType } = proofFile(body);
  const teacherRef = teachers.doc(uid);
  const teacherSnap = await teacherRef.get();
  if (teacherSnap.data()?.verificationStatus === 'verified') throw apiError(409, 'ALREADY_VERIFIED', '이미 교사 인증이 완료됐어요.');
  const previousAttempt = teacherSnap.data()?.verificationSubmittedAt?.toMillis?.() || 0;
  if (Date.now() - previousAttempt < 60 * 1000) throw apiError(429, 'VERIFICATION_RATE_LIMIT', '재직증명서 확인은 1분 뒤 다시 시도해 주세요.');
  await teacherRef.set({ verificationSubmittedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  const requestRef = verificationRequests.doc();
  const extension = contentType === 'application/pdf' ? 'pdf' : contentType === 'image/png' ? 'png' : 'jpg';
  const objectPath = `teacher-verification/${uid}/${requestRef.id}.${extension}`;
  const expiresAt = Timestamp.fromMillis(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const bucket = adminStorage.bucket();
  const previousRequestId = text(teacherSnap.data()?.verificationRequestId, 128);
  const previousPath = text(teacherSnap.data()?.verificationObjectPath, 500);
  const screening = await screenTeacherProof(bytes, teacherName, schoolName, contentType);
  if (screening.outcome === 'needs_review') await bucket.file(objectPath).save(bytes, { resumable: false, validation: 'md5', metadata: { contentType, contentDisposition: 'attachment; filename=teacher-proof.' + extension, cacheControl: 'private, no-store, max-age=0', metadata: { expiresAt: expiresAt.toDate().toISOString() } } });
  try {
    const batch = adminDb.batch();
    const requestStatus = screening.outcome === 'auto_rejected' ? 'rejected' : 'pending';
    const requestData = {
      uid, status: requestStatus, screeningOutcome: screening.outcome, screeningReason: screening.reason,
      screeningConfidence: screening.confidence, screeningSource: screening.source,
      screeningChecks: screening.checks, issueDate: screening.issueDate, createdAt: FieldValue.serverTimestamp(), expiresAt
    };
    if (screening.outcome === 'needs_review') Object.assign(requestData, { teacherName, schoolName, schoolKey, objectPath, contentType, fileSize: bytes.length, redactionConfirmed: true });
    else Object.assign(requestData, { decidedAutomatically: true, reviewedAt: FieldValue.serverTimestamp() });
    batch.create(requestRef, requestData);
    if (previousRequestId) batch.set(verificationRequests.doc(previousRequestId), { status: 'superseded', supersededAt: FieldValue.serverTimestamp(), teacherName: FieldValue.delete(), schoolName: FieldValue.delete(), schoolKey: FieldValue.delete(), contentType: FieldValue.delete(), fileSize: FieldValue.delete(), fileHash: FieldValue.delete(), redactionConfirmed: FieldValue.delete(), email: FieldValue.delete(), googleDisplayName: FieldValue.delete() }, { merge: true });
    batch.set(teacherRef, { role: 'teacher', teacherName, verificationStatus: screening.outcome === 'auto_rejected' ? 'rejected' : 'pending', verificationRequestId: requestRef.id, verificationObjectPath: screening.outcome === 'needs_review' ? objectPath : FieldValue.delete(), verificationSubmittedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    await batch.commit();
  } catch (error) {
    if (screening.outcome === 'needs_review') await bucket.file(objectPath).delete({ ignoreNotFound: true }).catch(() => {});
    throw error;
  }
  if (previousPath) {
    try {
      await bucket.file(previousPath).delete({ ignoreNotFound: true });
      if (previousRequestId) await verificationRequests.doc(previousRequestId).update({ objectPath: FieldValue.delete() });
    } catch (error) {
      console.warn('[TeacherProof] Superseded proof cleanup deferred:', error?.message || error);
    }
  }
  return {
    status: screening.outcome === 'auto_rejected' ? 'rejected' : 'pending',
    screeningOutcome: screening.outcome,
    screeningReason: screening.reason,
    teacherName,
    schoolName,
    expiresAt: screening.outcome === 'needs_review' ? expiresAt.toDate().toISOString() : null
  };
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
    return { id: doc.id, teacherName: text(data.teacherName, 40), schoolName: text(data.schoolName, 80), contentType: text(data.contentType, 40), fileSize: safeInt(data.fileSize, 0, 0), reviewUrl, screeningReason: text(data.screeningReason, 200), screeningConfidence: safeInt(data.screeningConfidence, 0, 0, 100), screeningChecks: data.screeningChecks || {}, issueDate: text(data.issueDate, 20), createdAt: data.createdAt?.toDate?.().toISOString?.() || null };
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
  if (decision === 'approved' && request.issueDate && request.screeningChecks?.dateFresh !== true) throw apiError(409, 'PROOF_DATE_EXPIRED', '발급일이 현재 날짜 기준 1개월을 초과한 재직증명서는 승인할 수 없어요.');
  const objectPath = text(request.objectPath, 500);
  const teacherRef = teachers.doc(request.uid);
  const batch = adminDb.batch();
  batch.update(requestRef, { status: decision, reviewedByUid: token.uid, reviewedBy: FieldValue.delete(), reviewedAt: FieldValue.serverTimestamp(), teacherName: FieldValue.delete(), schoolName: FieldValue.delete(), schoolKey: FieldValue.delete(), contentType: FieldValue.delete(), fileSize: FieldValue.delete(), fileHash: FieldValue.delete(), redactionConfirmed: FieldValue.delete(), email: FieldValue.delete(), googleDisplayName: FieldValue.delete() });
  if (decision === 'approved') batch.set(teacherRef, { role: 'teacher', teacherName: request.teacherName, schoolName: request.schoolName, schoolKey: request.schoolKey, verificationStatus: 'verified', verificationObjectPath: FieldValue.delete(), verifiedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  else batch.set(teacherRef, { verificationStatus: 'rejected', verificationObjectPath: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  await batch.commit();
  if (objectPath) {
    try {
      await adminStorage.bucket().file(objectPath).delete({ ignoreNotFound: true });
      await requestRef.update({ objectPath: FieldValue.delete() });
    } catch (error) {
      console.warn('[TeacherProof] Post-review storage cleanup deferred:', error?.message || error);
    }
  }
  if (decision === 'approved') {
    await applyVerifiedSchoolToOwnedGuilds(request.uid, request.schoolKey, request.schoolName);
  }
  return { requestId, status: decision };
}
function classPack(grade, wordPackId) {
  return wordPackById.get(wordPackId)?.id || defaultWordPack(grade);
}
async function bootstrap(uid, token) {
  const ref = teachers.doc(uid);
  const googleName = text(token?.name, 40);
  const updateData = { role: 'teacher', lastLoginAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() };
  if (googleName) updateData.googleDisplayName = googleName;
  await ref.set(updateData, { merge: true });
  const data = (await ref.get()).data() || {};
  const teacherName = text(data.teacherName || data.displayName || data.googleDisplayName, 40);
  const displayName = teacherName || googleName || '교사';
  return { displayName, teacherName: text(data.teacherName, 40), schoolName: text(data.schoolName, 80), verificationStatus: text(data.verificationStatus, 20) || 'unverified', needsProfile: !data.teacherName || !['pending','verified'].includes(data.verificationStatus), isReviewer: isReviewer(token), guildIds: Array.isArray(data.classIds) ? data.classIds : [] };
}
async function ownedClass(uid, id) {
  const snap = await classes.doc(id).get();
  if (!snap.exists) throw apiError(404, 'GUILD_NOT_FOUND', '길드를 찾지 못했어요.');
  if (!guildManagerIds(snap.data()).includes(uid)) throw apiError(403, 'NOT_GUILD_MANAGER', '이 길드의 관리자가 아니에요.');
  return snap;
}
async function createGuild(uid, body) {
  const teacherSnap = await verifiedTeacher(uid);
  const teacher = teacherSnap.data();
  const name = normalizeGuildName(body.guildName || body.classLabel);
  const guildSubtitle = normalizeGuildSubtitle(body.guildTag ?? body.guildSubtitle);
  const grade = safeInt(body.grade, 0, MIN_LEARNING_GRADE, MAX_LEARNING_GRADE);
  if (name.length < 2 || !grade) throw apiError(400, 'INVALID_GUILD', '길드 이름과 기본 단어 수준을 확인해 주세요.');
  const ref = classes.doc();
  const defaultPackId = defaultWordPack(grade);
  const data = { schemaVersion: 2, guildName: name, classLabel: name, guildSubtitle, guildLogoUrl: null, guildLogoPath: null, grade, ownerId: uid, managerIds: [uid], schoolKey: teacher.schoolKey, schoolName: teacher.schoolName, wordPackId: defaultPackId, wordPackIds: [defaultPackId], defaultQuestionTypes: [...DEFAULT_QUESTION_TYPES], createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() };
  const batch = adminDb.batch();
  batch.create(ref, data);
  batch.set(teachers.doc(uid), { classIds: FieldValue.arrayUnion(ref.id), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  await batch.commit();
  return { id: ref.id, guildName: name, guildSubtitle, guildLogoUrl: null, grade, wordPackId: data.wordPackId, wordPackIds: data.wordPackIds, questionTypes: data.defaultQuestionTypes };
}
let teacherGuildRankCache = { expiresAt: 0, ranks: new Map() };
async function guildMemberSummary(guildRef) {
  const members = guildRef.collection('members');
  try {
    const [totals, active] = await Promise.all([
      members.limit(500).aggregate({ studentCount: AggregateField.count(), totalCorrect: AggregateField.sum('totalCorrect'), guildPoints: AggregateField.sum('guildPoints') }).get(),
      members.where('guildPoints', '>', 0).limit(500).count().get()
    ]);
    return {
      studentCount: safeInt(totals.data()?.studentCount, 0, 0, 500),
      activeStudentCount: safeInt(active.data()?.count, 0, 0, 500),
      totalCorrect: safeInt(totals.data()?.totalCorrect, 0, 0, 1000000000),
      guildPoints: safeInt(totals.data()?.guildPoints, 0, 0, 1000000000)
    };
  } catch (error) {
    console.warn('[TeacherGuildSummary] Aggregate fallback', { classId: guildRef.id, code: error?.code || null, message: error?.message || String(error) });
    const snapshot = await members.select('totalCorrect', 'guildPoints').limit(500).get();
    return snapshot.docs.reduce((summary, member) => {
      const totalCorrect = safeInt(member.data()?.totalCorrect, 0, 0, 1000000000);
      const guildPoints = safeInt(member.data()?.guildPoints, 0, 0, 1000000000);
      summary.studentCount += 1;
      summary.totalCorrect += totalCorrect;
      summary.guildPoints += guildPoints;
      if (guildPoints > 0) summary.activeStudentCount += 1;
      return summary;
    }, { studentCount: 0, activeStudentCount: 0, totalCorrect: 0, guildPoints: 0 });
  }
}
async function teacherGuildRankMap() {
  const now = Date.now();
  if (teacherGuildRankCache.expiresAt > now) return teacherGuildRankCache.ranks;
  const guildSnaps = await classes.limit(100).get();
  const rows = await Promise.all(guildSnaps.docs.map(async (guildSnap) => {
    const totals = await guildMemberSummary(guildSnap.ref);
    return { id: guildSnap.id, memberCount: totals.studentCount, guildPoints: totals.guildPoints, name: guildName(guildSnap.data()) };
  }));
  const ranked = rows.filter((row) => row.memberCount > 0).sort((a, b) => b.guildPoints - a.guildPoints || a.name.localeCompare(b.name));
  const ranks = new Map(ranked.map((row, index) => [row.id, index + 1]));
  teacherGuildRankCache = { expiresAt: now + 60_000, ranks };
  return ranks;
}
async function listClasses(uid) {
  const teacher = await teachers.doc(uid).get();
  const ids = (teacher.data()?.classIds || []).slice(0, 100);
  const [snapshots, rankMap] = await Promise.all([
    Promise.all(ids.map((id) => classes.doc(id).get())),
    teacherGuildRankMap().catch((error) => {
      console.warn('[TeacherGuildRank] Ranking unavailable during login', { code: error?.code || null, message: error?.message || String(error) });
      return new Map();
    })
  ]);
  const managedSnapshots = snapshots.filter((snap) => snap.exists && guildManagerIds(snap.data()).includes(uid));
  return Promise.all(managedSnapshots.map(async (snap) => {
    const data = snap.data();
    const totals = await guildMemberSummary(snap.ref);
    const ownerId = guildOwnerId(data);
    return { id: snap.id, guildName: guildName(data), guildSubtitle: normalizeGuildSubtitle(data.guildSubtitle), guildLogoUrl: safeGuildLogoUrl(data.guildLogoUrl), grade: safeInt(data.grade, 4, MIN_LEARNING_GRADE, MAX_LEARNING_GRADE), ownerId, isOwner: ownerId === uid, managerCount: guildCoManagerCount(data), ...totals, guildRank: rankMap.get(snap.id) || null, wordPackId: classPack(data.grade, data.wordPackId), wordPackIds: normalizeWordPackIds(data.wordPackIds || data.wordPackId, data.grade), questionTypes: normalizeQuestionTypes(data.defaultQuestionTypes) };
  }));
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
const WORD_MASTERY_CORRECT_THRESHOLD = 10;
const WORD_MASTERY_ACCURACY_THRESHOLD = 0.8;
function wordLearningRows(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.entries(value).map(([rawKey, raw]) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const word = text(raw.w || rawKey, 80);
    if (!word) return null;
    const correctCount = safeInt(raw.c, 0, 0, 1000000);
    const wrongCount = safeInt(raw.x, 0, 0, 1000000);
    const tries = correctCount + wrongCount;
    const byType = {};
    LEARNING_QUESTION_TYPES.forEach((type) => {
      const values = raw.t?.[type];
      if (!Array.isArray(values)) return;
      const typeTries = safeInt(values[0], 0, 0, 1000000);
      const typeCorrect = Math.min(typeTries, safeInt(values[1], 0, 0, 1000000));
      if (typeTries > 0) byType[type] = { tries: typeTries, correct: typeCorrect, wrong: typeTries - typeCorrect, accuracy: Math.round(typeCorrect / typeTries * 1000) / 10 };
    });
    return {
      word,
      meaning: text(raw.m, 160) || wordByKey.get(word.toLowerCase())?.meaning || '',
      correctCount,
      wrongCount,
      tries,
      accuracy: tries ? Math.round(correctCount / tries * 1000) / 10 : 0,
      streak: safeInt(raw.s, 0, 0, 1000000),
      bestStreak: safeInt(raw.b, 0, 0, 1000000),
      mastered: correctCount >= WORD_MASTERY_CORRECT_THRESHOLD && correctCount / Math.max(1, tries) >= WORD_MASTERY_ACCURACY_THRESHOLD,
      byType,
      lastSeenAt: safeInt(raw.u, 0, 0, 9999999999999)
    };
  }).filter(Boolean);
}

const ANALYTICS_DAY_MS = 24 * 60 * 60 * 1000;
const TRIAL_HISTORY_DAYS = 120;
const TRIAL_MAX_ATTEMPTS = 3;
function analyticsDayKey(daysAgo = 0) {
  return new Date(Date.now() + 9 * 60 * 60 * 1000 - daysAgo * ANALYTICS_DAY_MS).toISOString().slice(0, 10);
}
function safeDailyLearning(value) {
  const result = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return result;
  Object.entries(value).forEach(([day, raw]) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return;
    result[day] = {
      tries: safeInt(raw?.tries, 0, 0, 1000000),
      correct: safeInt(raw?.correct, 0, 0, 1000000),
      stageClears: safeInt(raw?.stageClears, 0, 0, 10000)
    };
  });
  return result;
}
function safeTrialDailyResults(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const rows = Object.entries(value)
    .filter(([day]) => /^\d{4}-\d{2}-\d{2}$/.test(day))
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-TRIAL_HISTORY_DAYS);
  return Object.fromEntries(rows.map(([day, attempts]) => [day, (Array.isArray(attempts) ? attempts : [])
    .slice(-12)
    .map((raw) => ({
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
    }))
    .filter((entry) => entry.trialId && entry.questionCount > 0)]));
}
function percent(correct, tries) {
  return tries ? Math.round(correct / tries * 1000) / 10 : 0;
}
function dailySeriesForMembers(members, days = 14) {
  return Array.from({ length: days }, (_, index) => analyticsDayKey(days - index - 1)).map((day) => {
    const totals = members.reduce((sum, member) => {
      const row = member.dailyLearning?.[day] || {};
      sum.tries += safeInt(row.tries, 0, 0);
      sum.correct += safeInt(row.correct, 0, 0);
      sum.stageClears += safeInt(row.stageClears, 0, 0);
      return sum;
    }, { tries: 0, correct: 0, stageClears: 0 });
    return { day, ...totals, accuracy: totals.tries ? Math.round(totals.correct / totals.tries * 1000) / 10 : 0 };
  });
}
async function listGuildMembers(uid, body, includeWrongWords = false) {
  const classId = text(body.classId, 128);
  const classSnap = await ownedClass(uid, classId);
  const data = classSnap.data();
  const memberFields = ['nickname', 'learningGrade', 'stage', 'totalCorrect', 'totalQuizTries', 'conqueredCount', 'masteredCount', 'combatPower', 'titleName', 'guildCoins', 'guildPoints', 'guildCorrectCount', 'guildStageClears', 'guildBossDamage', 'guildBossPointTotal', 'guildTrialCorrect', 'trialAttempts', 'trialRetries', 'trialHintsUsed', 'trialHintedCorrect', 'trialUnassistedCorrect', 'trialUnassistedTries', 'lastActiveAt', 'assignedWordPackIds', 'questionTypes', 'questionTypeStats', 'dailyLearning'];
  if (includeWrongWords) memberFields.push('wrongWordCounts');
  const membersSnap = await classSnap.ref.collection('members')
    .select(...memberFields)
    .limit(200).get();
  const members = membersSnap.docs.map((member) => {
    const value = member.data() || {};
    const totalCorrect = safeInt(value.totalCorrect, 0, 0, 1000000000);
    const totalQuizTries = Math.max(totalCorrect, safeInt(value.totalQuizTries, totalCorrect, 0, 1000000000));
    const trialHintsUsed = safeInt(value.trialHintsUsed, 0, 0, 1000000);
    const trialHintedCorrect = Math.min(trialHintsUsed, safeInt(value.trialHintedCorrect, 0, 0, 1000000));
    const trialUnassistedTries = safeInt(value.trialUnassistedTries, 0, 0, 1000000);
    const trialUnassistedCorrect = Math.min(trialUnassistedTries, safeInt(value.trialUnassistedCorrect, 0, 0, 1000000));
    return {
      memberId: member.id,
      nickname: text(value.nickname, 30) || '이름 없는 용사',
      learningGrade: safeInt(value.learningGrade, 4, MIN_LEARNING_GRADE, MAX_LEARNING_GRADE),
      stage: safeInt(value.stage, 1, 1, 9999),
      totalCorrect,
      totalQuizTries,
      accuracy: totalQuizTries ? Math.round(totalCorrect / totalQuizTries * 1000) / 10 : 0,
      conqueredCount: safeInt(value.conqueredCount, safeInt(value.masteredCount, 0, 0), 0, 100000),
      masteredCount: safeInt(value.masteredCount, 0, 0, 100000),
      combatPower: safeInt(value.combatPower, 0, 0, 9999999999999),
      titleName: text(value.titleName, 80) || null,
      guildCoins: safeInt(value.guildCoins, 0, 0, 1000000000),
      guildPoints: safeInt(value.guildPoints, 0, 0, 1000000000),
      guildCorrectCount: safeInt(value.guildCorrectCount, 0, 0, 1000000000),
      guildStageClears: safeInt(value.guildStageClears, 0, 0, 1000000),
      guildBossDamage: safeInt(value.guildBossDamage, 0, 0, 100000000000000),
      guildBossPointTotal: safeInt(value.guildBossPointTotal, 0, 0, 1000000000),
      guildTrialCorrect: safeInt(value.guildTrialCorrect, 0, 0, 1000000),
      trialAttempts: safeInt(value.trialAttempts, 0, 0, 1000000),
      trialRetries: safeInt(value.trialRetries, 0, 0, 1000000),
      trialHintsUsed,
      trialHintedCorrect,
      trialHintedAccuracy: percent(trialHintedCorrect, trialHintsUsed),
      trialUnassistedCorrect,
      trialUnassistedTries,
      trialUnassistedAccuracy: percent(trialUnassistedCorrect, trialUnassistedTries),
      dailyLearning: safeDailyLearning(value.dailyLearning),
      assignedWordPackIds: normalizeWordPackIds(value.assignedWordPackIds || data.wordPackIds || data.wordPackId, value.learningGrade || data.grade),
      questionTypes: normalizeQuestionTypes(value.questionTypes || data.defaultQuestionTypes),
      questionTypeStats: safeQuestionTypeStats(value.questionTypeStats),
      lastActiveAt: value.lastActiveAt?.toDate?.().toISOString?.() || null,
      ...(includeWrongWords ? { wrongWordCounts: value.wrongWordCounts } : {})
    };
  }).sort((a, b) => b.guildPoints - a.guildPoints || b.totalCorrect - a.totalCorrect || a.nickname.localeCompare(b.nickname));
  return {
    guild: {
      id: classSnap.id,
      guildName: guildName(data),
      guildSubtitle: normalizeGuildSubtitle(data.guildSubtitle),
      guildLogoUrl: safeGuildLogoUrl(data.guildLogoUrl),
      grade: safeInt(data.grade, 4, MIN_LEARNING_GRADE, MAX_LEARNING_GRADE),
      wordPackId: classPack(data.grade, data.wordPackId),
      wordPackIds: normalizeWordPackIds(data.wordPackIds || data.wordPackId, data.grade),
      questionTypes: normalizeQuestionTypes(data.defaultQuestionTypes),
      managerCount: guildCoManagerCount(data)
    },
    members
  };
}
async function updateGuildAppearance(uid, body) {
  const classId = text(body.classId, 128);
  const classSnap = await ownedClass(uid, classId);
  const previousPath = text(classSnap.data()?.guildLogoPath, 500);
  const source = guildLogoFile(body);
  const Canvas = await import('@napi-rs/canvas');
  let image;
  try { image = await Canvas.loadImage(source); } catch { throw apiError(400, 'INVALID_GUILD_LOGO', '길드 로고 이미지를 읽지 못했어요.'); }
  const size = Math.min(image.width, image.height);
  if (!size) throw apiError(400, 'INVALID_GUILD_LOGO', '길드 로고 이미지 크기를 확인해 주세요.');
  const canvas = Canvas.createCanvas(256, 256);
  const context = canvas.getContext('2d');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, Math.floor((image.width - size) / 2), Math.floor((image.height - size) / 2), size, size, 0, 0, 256, 256);
  const bytes = await canvas.encode('webp', 82);
  const token = randomUUID();
  const objectPath = `guild-logos/${classId}/${randomUUID()}.webp`;
  const bucket = adminStorage.bucket();
  const uploaded = bucket.file(objectPath);
  await uploaded.save(bytes, { resumable: false, validation: 'md5', metadata: { contentType: 'image/webp', cacheControl: 'public, max-age=31536000, immutable', metadata: { firebaseStorageDownloadTokens: token } } });
  const guildLogoUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(objectPath)}?alt=media&token=${token}`;
  try {
    await classSnap.ref.update({ guildLogoUrl, guildLogoPath: objectPath, guildLogoVersion: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() });
    const members = await classSnap.ref.collection('members').select().limit(500).get();
    for (let offset = 0; offset < members.docs.length; offset += 400) {
      const batch = adminDb.batch();
      members.docs.slice(offset, offset + 400).forEach((member) => batch.set(accounts.doc(member.id), { activeGuildLogoUrl: guildLogoUrl, updatedAt: FieldValue.serverTimestamp() }, { merge: true }));
      await batch.commit();
    }
  } catch (error) {
    await uploaded.delete({ ignoreNotFound: true }).catch(() => {});
    throw error;
  }
  if (previousPath && previousPath !== objectPath && previousPath.startsWith(`guild-logos/${classId}/`)) {
    await bucket.file(previousPath).delete({ ignoreNotFound: true }).catch(() => {});
  }
  return { classId, guildLogoUrl };
}
async function updateGuildTag(uid, body) {
  const classId = text(body.classId, 128);
  const classSnap = await ownedClass(uid, classId);
  const guildSubtitle = normalizeGuildSubtitle(body.guildTag ?? body.guildSubtitle);
  await classSnap.ref.update({ guildSubtitle, updatedAt: FieldValue.serverTimestamp() });
  return { classId, guildSubtitle, guildTag: guildSubtitle };
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
  const followsGuildDefaults = body.applyAll === true && body.applyToFuture !== false;
  const batch = adminDb.batch();
  memberDocs.forEach((member) => batch.set(member.ref, {
    assignedWordPackIds: wordPackIds,
    questionTypes,
    usesGuildLearningDefaults: followsGuildDefaults,
    learningSettingsVersion: FieldValue.increment(1),
    learningSettingsUpdatedBy: uid,
    learningSettingsUpdatedAt: FieldValue.serverTimestamp()
  }, { merge: true }));
  if (followsGuildDefaults) batch.update(classSnap.ref, {
    wordPackId: wordPackIds[0],
    wordPackIds,
    defaultQuestionTypes: questionTypes,
    learningSettingsVersion: FieldValue.increment(1),
    updatedAt: FieldValue.serverTimestamp()
  });
  await batch.commit();
  return { classId, updatedCount: memberDocs.length, wordPackIds, questionTypes, futureMembersUpdated: followsGuildDefaults };
}
async function wordPackPreview(body) {
  const wordPackId = text(body.wordPackId, 80);
  const meta = wordPackById.get(wordPackId);
  const words = packWordsById.get(wordPackId);
  if (!meta || !words) throw apiError(404, 'WORD_PACK_NOT_FOUND', '단어팩을 찾지 못했어요.');
  return { ...meta, words: [...words.values()].slice(0, 1000) };
}
async function guildLearningReport(uid, body) {
  const details = await listGuildMembers(uid, body, true);
  const analysis = await wrongWordSummary(uid, body, details.members);
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
  const dailySeries = dailySeriesForMembers(members, 14);
  const activeToday = members.filter((member) => member.lastActiveAt && now - Date.parse(member.lastActiveAt) <= ANALYTICS_DAY_MS).length;
  const active7Days = members.filter((member) => member.lastActiveAt && now - Date.parse(member.lastActiveAt) <= 7 * ANALYTICS_DAY_MS).length;
  const neverStarted = members.filter((member) => member.totalQuizTries === 0).length;
  const inactive7Days = members.filter((member) => member.totalQuizTries > 0 && (!member.lastActiveAt || now - Date.parse(member.lastActiveAt) > 7 * ANALYTICS_DAY_MS)).length;
  const isInactive7Days = (member) => member.totalQuizTries > 0 && (!member.lastActiveAt || now - Date.parse(member.lastActiveAt) > 7 * ANALYTICS_DAY_MS);
  const needsSupport = (member) => member.totalQuizTries === 0 || (member.totalQuizTries >= 10 && member.accuracy < 40) || isInactive7Days(member);
  const isStable = (member) => member.totalQuizTries >= 10 && member.accuracy >= 70 && !isInactive7Days(member);
  const achievementGroups = {
    needsSupport: members.filter(needsSupport).length,
    developing: members.filter((member) => !needsSupport(member) && !isStable(member)).length,
    onTrack: members.filter(isStable).length
  };
  const questionPriority = Object.entries(questionTypeStats)
    .map(([type, value]) => ({ type, tries: value.tries, accuracy: value.tries ? Math.round(value.correct / value.tries * 1000) / 10 : null }))
    .sort((a, b) => (a.accuracy ?? 101) - (b.accuracy ?? 101));
  const suggestedQuestionTypes = questionPriority.filter((row) => row.tries > 0).slice(0, 2).map((row) => row.type);
  const overallAccuracy = totalTries ? totalCorrect / totalTries * 100 : 0;
  const enoughEvidence = totalTries >= Math.max(10, members.length * 5);
  const suggestedLevel = !enoughEvidence ? 'mid' : overallAccuracy < 65 ? 'low' : overallAccuracy >= 85 ? 'high' : 'mid';
  const supportMembers = members
    .filter(needsSupport)
    .sort((a, b) => a.accuracy - b.accuracy || a.totalQuizTries - b.totalQuizTries)
    .slice(0, 20)
    .map((member) => ({ memberId: member.memberId, nickname: member.nickname, accuracy: member.accuracy, totalQuizTries: member.totalQuizTries, lastActiveAt: member.lastActiveAt, reason: member.totalQuizTries === 0 ? '학습 미시작' : member.totalQuizTries >= 10 && member.accuracy < 40 ? '정답률 40% 미만' : '7일 이상 미접속' }));
  return {
    guild: details.guild,
    summary: {
      memberCount: members.length,
      activeToday,
      active7Days,
      inactive7Days,
      neverStarted,
      totalTries,
      totalCorrect,
      accuracy: totalTries ? Math.round(totalCorrect / totalTries * 1000) / 10 : 0,
      conqueredCount: members.reduce((sum, member) => sum + member.conqueredCount, 0),
      masteredCount: members.reduce((sum, member) => sum + member.masteredCount, 0),
      guildPoints: members.reduce((sum, member) => sum + member.guildPoints, 0),
      guildBossDamage: members.reduce((sum, member) => sum + member.guildBossDamage, 0)
    },
    questionTypeStats,
    dailySeries,
    achievementGroups,
    achievementCriteria: { support: '학습 미시작, 7일 이상 미접속 또는 10회 이상 응시·정답률 40% 미만', developing: '최근 참여 중이며 지원 필요·안정 기준 사이', stable: '최근 7일 참여, 10회 이상 응시·정답률 70% 이상' },
    recommendations: {
      focusWords: analysis.words.slice(0, 8),
      suggestedQuestionTypes: suggestedQuestionTypes.length ? suggestedQuestionTypes : ['meaning-choice'],
      suggestedLevel
    },
    supportMembers,
    topWrongWords: analysis.words.slice(0, 20),
    activeTrial: analysis.activeTrial,
    members: members.map(({ dailyLearning, wrongWordCounts, ...member }) => member)
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
  const learningRows = wordLearningRows(state.wordLearningStats || member.wordLearningStats);
  const rowKeys = new Set(learningRows.map((entry) => entry.word.toLowerCase()));
  Object.entries(wrong).forEach(([rawWord, rawCount]) => {
    const key = text(rawWord, 80).toLowerCase();
    if (!key || rowKeys.has(key)) return;
    const entry = wordByKey.get(key);
    if (entry) learningRows.push({ ...entry, correctCount: 0, wrongCount: safeInt(rawCount, 0, 0, 1000000), tries: safeInt(rawCount, 0, 0, 1000000), accuracy: 0, streak: 0, bestStreak: 0, mastered: false, byType: {}, lastSeenAt: 0 });
  });
  learningRows.sort((a, b) => b.wrongCount - a.wrongCount || b.tries - a.tries || a.word.localeCompare(b.word));
  const wrongWords = learningRows.filter((entry) => entry.wrongCount > 0).slice(0, 100);
  const masteredCount = learningRows.filter((entry) => entry.mastered).length;
  const trialHintsUsed = safeInt(member.trialHintsUsed, 0, 0, 1000000);
  const trialHintedCorrect = Math.min(trialHintsUsed, safeInt(member.trialHintedCorrect, 0, 0, 1000000));
  const trialUnassistedTries = safeInt(member.trialUnassistedTries, 0, 0, 1000000);
  const trialUnassistedCorrect = Math.min(trialUnassistedTries, safeInt(member.trialUnassistedCorrect, 0, 0, 1000000));
  const trialHintedAccuracy = percent(trialHintedCorrect, trialHintsUsed);
  const trialUnassistedAccuracy = percent(trialUnassistedCorrect, trialUnassistedTries);
  return {
    memberId,
    nickname: text(member.nickname, 30) || '이름 없는 용사',
    learningGrade: safeInt(member.learningGrade, 4, MIN_LEARNING_GRADE, MAX_LEARNING_GRADE),
    stage: safeInt(member.stage, 1, 1, 9999),
    totalQuizTries,
    totalCorrect,
    accuracy: totalQuizTries ? Math.round(totalCorrect / totalQuizTries * 1000) / 10 : 0,
    conqueredCount: Array.isArray(state.masteredWords) ? state.masteredWords.length : safeInt(member.conqueredCount, 0, 0),
    masteredCount,
    masteryCriteria: { correctThreshold: WORD_MASTERY_CORRECT_THRESHOLD, accuracyThreshold: WORD_MASTERY_ACCURACY_THRESHOLD * 100 },
    wordLearning: learningRows.slice(0, 300),
    guildPoints: safeInt(member.guildPoints, 0, 0),
    guildCoins: safeInt(member.guildCoins, 0, 0),
    guildBossDamage: safeInt(member.guildBossDamage, 0, 0),
    trialAttempts: safeInt(member.trialAttempts, 0, 0),
    trialRetries: safeInt(member.trialRetries, 0, 0),
    trialHintsUsed,
    trialHintedTries: trialHintsUsed,
    trialHintedCorrect,
    trialHintedAccuracy,
    trialUnassistedCorrect,
    trialUnassistedTries,
    trialUnassistedAccuracy,
    trialHintCorrelation: {
      hinted: { tries: trialHintsUsed, correct: trialHintedCorrect, accuracy: trialHintedAccuracy },
      unassisted: { tries: trialUnassistedTries, correct: trialUnassistedCorrect, accuracy: trialUnassistedAccuracy }
    },
    trialDailyResults: safeTrialDailyResults(member.trialDailyResults),
    dailySeries: dailySeriesForMembers([{ dailyLearning: safeDailyLearning(member.dailyLearning) }], 120),
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
async function wrongWordSummary(uid, body, memberRows = null) {
  const classId = text(body.classId, 128);
  const classSnap = await ownedClass(uid, classId);
  const eligibleWords = wordByKey;
  const rows = Array.isArray(memberRows) ? memberRows.slice(0, 200).map((member) => ({ id: member.memberId, wrongWordCounts: member.wrongWordCounts })) : (await classSnap.ref.collection('members').select('wrongWordCounts').limit(200).get()).docs.map((member) => ({ id: member.id, wrongWordCounts: member.data()?.wrongWordCounts }));
  const memberIds = rows.map((member) => member.id);
  const totals = new Map();
  const missing = [];
  rows.forEach((member) => {
    const wrong = member.wrongWordCounts;
    if (!wrong || typeof wrong !== 'object' || Array.isArray(wrong)) {
      missing.push(member.id);
      return;
    }
    Object.entries(wrong).forEach(([rawWord, rawCount]) => {
      const key = text(rawWord, 80).toLowerCase();
      const count = safeInt(rawCount, 0, 0, 1000000);
      if (key && count > 0 && eligibleWords.has(key)) totals.set(key, (totals.get(key) || 0) + count);
    });
  });
  const legacyAccountSnaps = await Promise.all(missing.slice(0, 200).map((id) => accounts.doc(id).get()));
  legacyAccountSnaps.forEach((accountSnap) => {
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
  const maxHintsPerQuestion = 1;
  // 구버전 클라이언트의 전체 힌트 한도 필드도 문제당 1회와 같은 총량으로 유지합니다.
  const maxHints = words.length;
  const expiresAt = Timestamp.fromMillis(Date.now() + 14 * 24 * 60 * 60 * 1000);
  const batch = adminDb.batch();
  batch.create(trialRef, {
    schemaVersion: 3,
    status: 'active',
    kind: 'wrong-words',
    words,
    questionCount: words.length,
    maxHintsPerQuestion,
    maxHints,
    rewardGuildCoins,
    createdBy: uid,
    createdAt: FieldValue.serverTimestamp(),
    expiresAt
  });
  batch.update(classRef, { activeTrialId: trialRef.id, updatedAt: FieldValue.serverTimestamp() });
  await batch.commit();
  return { id: trialRef.id, classId: summary.classId, guildName: summary.guildName, questionCount: words.length, maxHintsPerQuestion, maxHints, rewardGuildCoins, expiresAt: expiresAt.toDate().toISOString() };
}
async function listSchoolGuilds(uid) {
  const teacherSnap = await verifiedTeacher(uid);
  const teacher = teacherSnap.data();
  const snapshot = await classes.where('schoolKey', '==', teacher.schoolKey).limit(100).get();
  const ownerIds = [...new Set(snapshot.docs.map((snap) => text(snap.data()?.ownerId || snap.data()?.managerIds?.[0], 128)).filter(Boolean))];
  const ownerSnaps = ownerIds.length ? await Promise.all(ownerIds.map(async (id) => {
    const [tSnap, aSnap] = await Promise.all([teachers.doc(id).get(), accounts.doc(id).get()]);
    const tData = tSnap.data() || {};
    const aData = aSnap.data() || {};
    const name = text(tData.teacherName || tData.displayName || tData.googleDisplayName || tData.name || aData.nickname || aData.teacherName || aData.displayName, 40) || '마스터';
    return { id, name };
  })) : [];
  const ownerNames = new Map(ownerSnaps.map((item) => [item.id, item.name]));
  const rows = await Promise.all(snapshot.docs.map(async (classSnap) => {
    const data = classSnap.data();
    const managed = Array.isArray(data.managerIds) && data.managerIds.includes(uid);
    const [ownRequest, requests] = await Promise.all([
      managed ? Promise.resolve(null) : classSnap.ref.collection('managerRequests').doc(uid).get(),
      managed ? classSnap.ref.collection('managerRequests').where('status', '==', 'pending').limit(50).get() : Promise.resolve(null)
    ]);
    const masterName = ownerNames.get(text(data.ownerId || data.managerIds?.[0], 128)) || '마스터';
    return {
      guild: { id: classSnap.id, guildName: guildName(data), guildSubtitle: normalizeGuildSubtitle(data.guildSubtitle), guildLogoUrl: safeGuildLogoUrl(data.guildLogoUrl), grade: safeInt(data.grade, 4, MIN_LEARNING_GRADE, MAX_LEARNING_GRADE), managerCount: guildCoManagerCount(data), masterName: managed ? masterName : maskedTeacherName(masterName), managed, requestStatus: ownRequest?.data()?.status || '' },
      incomingRequests: requests ? requests.docs.map((request) => ({ id: request.id, classId: classSnap.id, guildName: guildName(data), teacherName: text(request.data()?.teacherName, 40) || '이름 미확인', requestedAt: request.data()?.requestedAt?.toDate?.().toISOString?.() || null })) : []
    };
  }));
  const guilds = rows.map((row) => row.guild);
  const incomingRequests = rows.flatMap((row) => row.incomingRequests);
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
  const ownerId = text(data.ownerId || data.managerIds?.[0], 128);
  const [memberCountSnap, ownRequest, ownerTSnap, ownerASnap] = await Promise.all([
    classRef.collection('members').count().get(),
    managed ? Promise.resolve(null) : classRef.collection('managerRequests').doc(uid).get(),
    teachers.doc(ownerId).get(),
    accounts.doc(ownerId).get()
  ]);
  const ownerTData = ownerTSnap.data() || {};
  const ownerAData = ownerASnap.data() || {};
  const masterName = text(ownerTData.teacherName || ownerTData.displayName || ownerTData.googleDisplayName || ownerTData.name || ownerAData.nickname || ownerAData.teacherName || ownerAData.displayName, 40) || '마스터';
  return { id: classSnap.id, guildName: guildName(data), guildSubtitle: normalizeGuildSubtitle(data.guildSubtitle), guildLogoUrl: safeGuildLogoUrl(data.guildLogoUrl), grade: safeInt(data.grade, 4, MIN_LEARNING_GRADE, MAX_LEARNING_GRADE), memberCount: safeInt(memberCountSnap.data()?.count, 0, 0, 100000), managerCount: guildCoManagerCount(data), masterName: managed ? masterName : maskedTeacherName(masterName), managed, requestStatus: ownRequest?.data()?.status || '' };
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
  const ownerId = text(data.ownerId || data.managerIds?.[0], 128);
  const rawManagerIds = (Array.isArray(data.managerIds) ? data.managerIds : []).map((id) => text(id, 128)).filter(Boolean);
  const coManagerIds = [...new Set(rawManagerIds)].filter((id) => id && id !== ownerId);
  const allIds = [ownerId, ...coManagerIds].filter(Boolean);
  const snapshots = allIds.length ? await Promise.all(allIds.map(async (id) => {
    const [tSnap, aSnap] = await Promise.all([teachers.doc(id).get(), accounts.doc(id).get()]);
    const tData = tSnap.data() || {};
    const aData = aSnap.data() || {};
    const name = text(tData.teacherName || tData.displayName || tData.googleDisplayName || tData.name || aData.nickname || aData.teacherName || aData.displayName, 40) || '이름 미확인';
    return { id, name };
  })) : [];
  const byId = new Map(snapshots.map((s) => [s.id, s.name]));
  const managers = allIds.map((id) => ({ uid: id, teacherName: byId.get(id) || '이름 미확인', isOwner: id === ownerId, isMe: id === uid }));
  return { classId, isOwner: ownerId === uid, managers };
}
async function removeGuildMember(uid, body) {
  const classId = text(body.classId, 128);
  const targetUid = text(body.memberUid || body.targetUid, 128);
  if (!targetUid) throw apiError(400, 'INVALID_GUILD_MEMBER', '내보낼 길드원을 선택해 주세요.');
  const classSnap = await ownedClass(uid, classId);
  const memberRef = classSnap.ref.collection('members').doc(targetUid);
  const accountRef = accounts.doc(targetUid);
  await adminDb.runTransaction(async (transaction) => {
    const [memberSnap, accountSnap] = await Promise.all([transaction.get(memberRef), transaction.get(accountRef)]);
    if (!memberSnap.exists) throw apiError(404, 'GUILD_MEMBER_NOT_FOUND', '길드원을 찾지 못했어요.');
    transaction.delete(memberRef);
    if (accountSnap.exists) {
      const update = { classIds: FieldValue.arrayRemove(classId), updatedAt: FieldValue.serverTimestamp() };
      if (accountSnap.data()?.activeClassId === classId) Object.assign(update, {
        activeClassId: FieldValue.delete(),
        activeGuildName: FieldValue.delete(),
        activeGuildLogoUrl: FieldValue.delete()
      });
      transaction.update(accountRef, update);
    }
  });
  return { classId, memberUid: targetUid, removed: true };
}
async function removeGuildManager(uid, body) {
  const classId = text(body.classId, 128);
  const targetUid = text(body.targetUid, 128);
  const classRef = classes.doc(classId);
  const targetTeacherRef = teachers.doc(targetUid);
  const [classSnap, targetTeacherSnap] = await Promise.all([classRef.get(), targetTeacherRef.get()]);
  const ownerId = classSnap.exists ? guildOwnerId(classSnap.data()) : '';
  if (!classSnap.exists || ownerId !== uid) throw apiError(403, 'GUILD_OWNER_REQUIRED', '길드 마스터만 공동 관리자를 내보낼 수 있어요.');
  if (!targetUid || targetUid === uid || targetUid === ownerId) throw apiError(400, 'INVALID_MANAGER_REMOVAL', '길드 마스터는 내보낼 수 없어요.');
  if (!(classSnap.data()?.managerIds || []).includes(targetUid)) throw apiError(404, 'MANAGER_NOT_FOUND', '공동 관리자를 찾지 못했어요.');
  const batch = adminDb.batch();
  batch.update(classRef, { managerIds: FieldValue.arrayRemove(targetUid), updatedAt: FieldValue.serverTimestamp() });
  if (targetTeacherSnap.exists) batch.update(targetTeacherRef, { classIds: FieldValue.arrayRemove(classId), updatedAt: FieldValue.serverTimestamp() });
  await batch.commit();
  return { classId, targetUid, removed: true };
}
async function transferGuildOwnership(uid, body) {
  const classId = text(body.classId, 128);
  const targetUid = text(body.targetUid, 128);
  if (!targetUid || targetUid === uid) throw apiError(400, 'INVALID_GUILD_MASTER', '위임할 공동 관리자를 선택해 주세요.');
  const classRef = classes.doc(classId);
  await adminDb.runTransaction(async (transaction) => {
    const classSnap = await transaction.get(classRef);
    if (!classSnap.exists || guildOwnerId(classSnap.data()) !== uid) throw apiError(403, 'GUILD_OWNER_REQUIRED', '길드 마스터만 마스터 권한을 위임할 수 있어요.');
    const data = classSnap.data();
    if (!(data.managerIds || []).includes(targetUid)) throw apiError(404, 'MANAGER_NOT_FOUND', '위임할 공동 관리자를 찾지 못했어요.');
    const targetTeacher = await transaction.get(teachers.doc(targetUid));
    if (!targetTeacher.exists || targetTeacher.data()?.verificationStatus !== 'verified' || targetTeacher.data()?.schoolKey !== data.schoolKey) throw apiError(409, 'GUILD_MASTER_NOT_ELIGIBLE', '같은 학교의 인증된 공동 관리자에게만 위임할 수 있어요.');
    transaction.update(classRef, { ownerId: targetUid, managerIds: FieldValue.arrayUnion(uid, targetUid), updatedAt: FieldValue.serverTimestamp() });
  });
  teacherGuildRankCache.expiresAt = 0;
  return { classId, previousOwnerUid: uid, ownerId: targetUid, transferred: true };
}
async function deleteGuild(uid, body) {
  const classId = text(body.classId, 128);
  const classRef = classes.doc(classId);
  const classSnap = await classRef.get();
  if (!classSnap.exists || guildOwnerId(classSnap.data()) !== uid) throw apiError(403, 'GUILD_OWNER_REQUIRED', '길드 마스터만 길드를 폐쇄할 수 있어요.');
  const data = classSnap.data();
  const name = guildName(data);
  if (text(body.confirmGuildName, 40) !== name) throw apiError(400, 'GUILD_NAME_CONFIRMATION_REQUIRED', '폐쇄할 길드 이름을 정확히 입력해 주세요.');
  const members = await classRef.collection('members').get();
  const guildInvites = await invites.where('classId', '==', classId).get();
  const managerIds = [...new Set((data.managerIds || []).map((id) => text(id, 128)).filter(Boolean))];
  const [accountSnaps, managerSnaps] = await Promise.all([
    members.size ? adminDb.getAll(...members.docs.map((member) => accounts.doc(member.id))) : [],
    managerIds.length ? adminDb.getAll(...managerIds.map((managerId) => teachers.doc(managerId))) : []
  ]);
  const accountById = new Map(accountSnaps.filter((snap) => snap.exists).map((snap) => [snap.id, snap.data() || {}]));
  const writes = [];
  members.docs.forEach((member) => {
    if (!accountById.has(member.id)) return;
    const accountRef = accounts.doc(member.id);
    const update = { classIds: FieldValue.arrayRemove(classId), updatedAt: FieldValue.serverTimestamp() };
    if (accountById.get(member.id)?.activeClassId === classId) Object.assign(update, { activeClassId: FieldValue.delete(), activeGuildName: FieldValue.delete(), activeGuildLogoUrl: FieldValue.delete() });
    writes.push({ ref: accountRef, update });
  });
  managerSnaps.filter((snap) => snap.exists).forEach((managerSnap) => writes.push({ ref: managerSnap.ref, update: { classIds: FieldValue.arrayRemove(classId), updatedAt: FieldValue.serverTimestamp() } }));
  for (let offset = 0; offset < writes.length; offset += 400) {
    const batch = adminDb.batch();
    writes.slice(offset, offset + 400).forEach((write) => batch.update(write.ref, write.update));
    await batch.commit();
  }
  for (let offset = 0; offset < guildInvites.docs.length; offset += 400) {
    const batch = adminDb.batch();
    guildInvites.docs.slice(offset, offset + 400).forEach((inviteDoc) => batch.delete(inviteDoc.ref));
    await batch.commit();
  }
  await adminDb.recursiveDelete(classRef);
  const logoPath = text(data.guildLogoPath, 500);
  if (logoPath) await adminStorage.bucket().file(logoPath).delete({ ignoreNotFound: true }).catch(() => {});
  teacherGuildRankCache.expiresAt = 0;
  return { classId, guildName: name, deleted: true, removedMembers: members.size, removedInvites: guildInvites.size };
}
async function invite(uid, body) {
  const classId = text(body.classId, 128);
  const type = body.type === 'manager' ? 'manager' : body.type === 'student' ? 'student' : '';
  if (!type) throw apiError(400, 'INVALID_INVITE_TYPE', '초대 코드 종류를 확인해 주세요.');
  const classSnap = await ownedClass(uid, classId);
  const classSchoolKey = text(classSnap.data()?.schoolKey, 48).toUpperCase();
  if (type === 'manager' && !classSchoolKey) throw apiError(409, 'GUILD_SCHOOL_REQUIRED', '학교 인증이 연결된 길드에서만 공동 관리자를 초대할 수 있어요.');
  const rotate = body.rotate === true;
  const currentCode = normalizeInviteCode(classSnap.data()?.inviteCodes?.[type]?.code);
  const currentCodeIsValid = currentCode.length === INVITE_CODE_LENGTH && /[A-Z]/.test(currentCode) && /\d/.test(currentCode);
  if (!rotate && currentCodeIsValid) {
    const currentSnap = await invites.doc(hash(currentCode)).get();
    const currentSchoolKey = text(currentSnap.data()?.schoolKey, 48).toUpperCase();
    if (currentSnap.exists && currentSnap.data().type === type && currentSnap.data().classId === classId && (type !== 'manager' || currentSchoolKey === classSchoolKey) && !isExpired(currentSnap.data().expiresAt)) {
      return { code: currentCode, type, persistent: true };
    }
  }
  let code; let ref; let available = false;
  for (let index = 0; index < 5; index += 1) {
    code = guildInviteCode();
    if (code.length !== INVITE_CODE_LENGTH || !/[A-Z]/.test(code) || !/\d/.test(code)) continue;
    ref = invites.doc(hash(code));
    if (!(await ref.get()).exists) { available = true; break; }
  }
  if (!ref || !available) throw apiError(500, 'INVITE_CREATE_FAILED', '초대 코드를 만들지 못했어요.');
  const previous = await invites.where('classId', '==', classId).limit(100).get();
  const batch = adminDb.batch();
  previous.docs.filter((doc) => doc.data()?.type === type).forEach((doc) => batch.delete(doc.ref));
  batch.create(ref, { type, classId, classLabel: guildName(classSnap.data()), schoolKey: classSchoolKey || null, createdBy: uid, persistent: true, createdAt: FieldValue.serverTimestamp() });
  batch.update(classSnap.ref, { [`inviteCodes.${type}`]: { code, rotatedAt: Timestamp.now() }, updatedAt: FieldValue.serverTimestamp() });
  await batch.commit();
  return { code, type, persistent: true };
}
async function joinManager(uid, body) {
  const code = normalizeInviteCode(body.code);
  if (code.length !== INVITE_CODE_LENGTH || !/[A-Z]/.test(code) || !/\d/.test(code)) throw apiError(400, 'INVALID_INVITE', '영문·숫자 혼합 6자리 공동 관리자 코드를 확인해 주세요.');
  const ref = invites.doc(hash(code));
  return adminDb.runTransaction(async (transaction) => {
    const invite = await transaction.get(ref);
    if (!invite.exists || invite.data().type !== 'manager' || isExpired(invite.data().expiresAt)) throw apiError(404, 'INVITE_NOT_FOUND', '코드가 올바르지 않거나 만료됐어요.');
    const classRef = classes.doc(invite.data().classId);
    const [classSnap, teacherSnap] = await Promise.all([transaction.get(classRef), transaction.get(teachers.doc(uid))]);
    if (!classSnap.exists) throw apiError(404, 'GUILD_NOT_FOUND', '길드를 찾지 못했어요.');
    const teacherSchoolKey = text(teacherSnap.data()?.schoolKey, 48).toUpperCase();
    const guildSchoolKey = text(classSnap.data()?.schoolKey, 48).toUpperCase();
    const inviteSchoolKey = text(invite.data()?.schoolKey, 48).toUpperCase();
    if (!teacherSnap.exists || teacherSnap.data()?.verificationStatus !== 'verified' || !teacherSchoolKey || teacherSchoolKey !== guildSchoolKey || teacherSchoolKey !== inviteSchoolKey) {
      throw apiError(409, 'SCHOOL_MISMATCH', '같은 학교의 인증된 교사만 공동 관리자로 참여할 수 있어요.');
    }
    const configuredCode = normalizeInviteCode(classSnap.data()?.inviteCodes?.manager?.code);
    if (configuredCode !== code) throw apiError(404, 'INVITE_REPLACED', '이전 초대 정보예요. 길드 마스터에게 새 코드·QR·링크를 받아 주세요.');
    transaction.update(classRef, { managerIds: FieldValue.arrayUnion(uid), updatedAt: FieldValue.serverTimestamp() });
    transaction.set(teachers.doc(uid), { classIds: FieldValue.arrayUnion(classRef.id), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return { classId: classRef.id, classLabel: guildName(classSnap.data()) };
  });
}

async function deleteTeacherAccount(uid) {
  const teacherRef = teachers.doc(uid);
  const teacherSnap = await teacherRef.get();
  const teacher = teacherSnap.data() || {};
  const classIds = Array.isArray(teacher.classIds) ? [...new Set(teacher.classIds.map((id) => text(id, 128)).filter(Boolean))] : [];
  const managedClasses = await getAllInChunks(classIds.map((id) => classes.doc(id)));
  const blockedGuilds = managedClasses.filter((snap) => {
    if (!snap.exists || guildOwnerId(snap.data()) !== uid) return false;
    return !(snap.data()?.managerIds || []).some((managerId) => managerId !== uid);
  });
  if (blockedGuilds.length) {
    const names = blockedGuilds.slice(0, 3).map((snap) => guildName(snap.data())).join(', ');
    throw apiError(409, 'GUILD_OWNER_TRANSFER_REQUIRED', `먼저 ${names} 길드에 공동 관리자를 추가해 주세요. 길드 마스터 권한을 넘긴 뒤 계정을 삭제할 수 있어요.`);
  }

  for (const classSnap of managedClasses) {
    if (!classSnap.exists || !(classSnap.data()?.managerIds || []).includes(uid)) continue;
    const nextOwner = guildOwnerId(classSnap.data()) === uid
      ? (classSnap.data()?.managerIds || []).find((managerId) => managerId !== uid)
      : null;
    const update = { managerIds: FieldValue.arrayRemove(uid), updatedAt: FieldValue.serverTimestamp() };
    if (nextOwner) update.ownerId = nextOwner;
    await Promise.all([
      classSnap.ref.update(update),
      classSnap.ref.collection('managerRequests').doc(uid).delete().catch(() => {})
    ]);
  }

  const [schoolClassDocs, verificationDocs, inviteDocs, studentAccount] = await Promise.all([
    teacher.schoolKey ? queryAllDocs(classes.where('schoolKey', '==', teacher.schoolKey)) : [],
    queryAllDocs(verificationRequests.where('uid', '==', uid)),
    queryAllDocs(invites.where('createdBy', '==', uid)),
    accounts.doc(uid).get()
  ]);
  const proofPaths = new Set([
    text(teacher.verificationObjectPath, 500),
    ...verificationDocs.map((doc) => text(doc.data()?.objectPath, 500))
  ].filter((path) => path.startsWith(`teacher-verification/${uid}/`)));
  await Promise.all([...proofPaths].map((path) => adminStorage.bucket().file(path).delete({ ignoreNotFound: true })));
  await deleteRefsInBatches([
    ...schoolClassDocs.map((snap) => snap.ref.collection('managerRequests').doc(uid)),
    ...verificationDocs.map((doc) => doc.ref),
    ...inviteDocs.map((doc) => doc.ref),
    teacherRef
  ]);
  if (!studentAccount.exists) {
    try { await adminAuth.deleteUser(uid); } catch (error) { if (error?.code !== 'auth/user-not-found') throw error; }
  }
  return { deleted: true, authAccountKeptForStudent: studentAccount.exists };
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
    else if (body.action === 'listWordPacks') response = { wordPacks: WORD_PACKS, questionTypes: [{ id: 'meaning-choice', label: '뜻 찾기 (4지선다)', default: true }, { id: 'fill-blank', label: '빈칸 넣기' }, { id: 'word-choice', label: '영어 단어 찾기 (4지선다)' }, { id: 'listen-meaning', label: '발음 듣고 뜻 찾기' }, { id: 'word-order', label: '철자 순서 맞추기' }, { id: 'short-answer', label: '영어 단답식' }] };
    else if (body.action === 'wordPackPreview') response = { wordPack: await wordPackPreview(body) };
    else if (body.action === 'guildMembers') response = { details: await listGuildMembers(token.uid, body) };
    else if (body.action === 'guildReport') response = { report: await guildLearningReport(token.uid, body) };
    else if (body.action === 'memberReport') response = { report: await memberLearningReport(token.uid, body) };
    else if (body.action === 'updateMemberLearningSettings') response = { assignment: await updateMemberLearningSettings(token.uid, body) };
    else if (body.action === 'updateGuildAppearance') response = { appearance: await updateGuildAppearance(token.uid, body) };
    else if (body.action === 'updateGuildTag') response = { guild: await updateGuildTag(token.uid, body) };
    else if (body.action === 'setClassWordPack' || body.action === 'setWordPack') response = { assignment: await setWordPack(token.uid, body) };
    else if (body.action === 'guildWrongWords') response = { analysis: await wrongWordSummary(token.uid, body) };
    else if (body.action === 'createGuildTrial') response = { trial: await createGuildTrial(token.uid, body) };
    else if (body.action === 'listGuildManagers') response = { management: await listGuildManagers(token.uid, body) };
    else if (body.action === 'removeGuildMember') response = { membership: await removeGuildMember(token.uid, body) };
    else if (body.action === 'removeGuildManager') response = { management: await removeGuildManager(token.uid, body) };
    else if (body.action === 'transferGuildOwnership') response = { management: await transferGuildOwnership(token.uid, body) };
    else if (body.action === 'deleteGuild') response = { deletion: await deleteGuild(token.uid, body) };
    else if (body.action === 'createInvite') response = { invite: await invite(token.uid, body) };
    else if (body.action === 'joinAsManager') response = { membership: await joinManager(token.uid, body) };
    else if (body.action === 'deleteTeacherAccount') response = { deletion: await deleteTeacherAccount(token.uid) };
    else throw apiError(400, 'UNKNOWN_ACTION', '알 수 없는 요청이에요.');
    sendJson(res, 200, { ok: true, ...response });
  } catch (error) { handleApiError(res, error); }
}
