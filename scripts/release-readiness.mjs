import { access, readFile } from 'node:fs/promises';

const requiredEnvironment = [
  { label: 'FIREBASE_PROJECT_ID/project_id', names: ['FIREBASE_PROJECT_ID', 'project_id'] },
  { label: 'FIREBASE_CLIENT_EMAIL/client_email', names: ['FIREBASE_CLIENT_EMAIL', 'client_email'] },
  { label: 'FIREBASE_PRIVATE_KEY/private_key', names: ['FIREBASE_PRIVATE_KEY', 'private_key'] },
  { label: 'CRON_SECRET', names: ['CRON_SECRET'] }
];
const missing = requiredEnvironment.filter((entry) => !entry.names.some((name) => process.env[name])).map((entry) => entry.label);
const files = ['firebase.json', 'firestore.rules', 'firestore.indexes.json', 'storage.rules', 'vercel.json', 'privacy.html', 'package-lock.json', 'data/word-packs.json', 'data/curriculum-3000-review-catalog.json', ...Array.from({ length: 5 }, (_, index) => `media/test/test${index + 1}.webp`)];
for (const file of files) await access(file);
const firebase = JSON.parse(await readFile('firebase.json', 'utf8'));
const vercel = JSON.parse(await readFile('vercel.json', 'utf8'));
const [firestoreRules, storageRules, privacy, secureAccount, studentApi, teacherApi, wordPackText] = await Promise.all([
  readFile('firestore.rules', 'utf8'),
  readFile('storage.rules', 'utf8'),
  readFile('privacy.html', 'utf8'),
  readFile('js/secure-account.js', 'utf8'),
  readFile('api/student.js', 'utf8'),
  readFile('api/teacher.js', 'utf8'),
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
if (!secureAccount.includes('async function init(){build();clearLegacy();try{')) throw new Error('Legacy session PII is not cleared before secure login.');
const createStart = studentApi.indexOf('async function create(uid, body)');
const createEnd = studentApi.indexOf('async function syncWorldBossVisibility', createStart);
const createBlock = createStart >= 0 && createEnd > createStart ? studentApi.slice(createStart, createEnd) : '';
if (!createBlock || /schoolName|classNum|studentNum|pinHash|\bemail\b|realName|studentName/.test(createBlock)) throw new Error('New student account creation includes a disallowed identity field.');
for (const label of ['길드 정보', '길드원 정보', '길드원 관리', '시련', '초대관리']) {
  if (!secureAccount.includes(`data-teacher-guild-section="${({ '길드 정보': 'info', '길드원 정보': 'members', '길드원 관리': 'manage', '시련': 'trial', '초대관리': 'invite' })[label]}"`)) throw new Error(`Teacher guild tab is missing: ${label}`);
}
if (!studentApi.includes("adminAuth.deleteUser(uid)") || !studentApi.includes("collection('contributions').doc(uid).delete()")) throw new Error('Student account erasure coverage is incomplete.');
if (!studentApi.includes('.webp?v=')) throw new Error('Guild trial WebP scene path is missing.');
if (!teacherApi.includes("body.action === 'deleteTeacherAccount'") || !teacherApi.includes('teacher-verification/${uid}/')) throw new Error('Teacher account/proof deletion API is missing.');
if (!teacherApi.includes('PROOF_DATE_EXPIRED')) throw new Error('Manual teacher-proof freshness enforcement is missing.');
if (!teacherApi.includes('extractImageProofText') || !teacherApi.includes('image_ocr') || !teacherApi.includes(`source: 'pdf_ocr'`)) throw new Error('Teacher image/PDF proof OCR screening is missing.');
if (!vercel.headers?.some((route) => route.source === '/data/word-packs.json' && route.headers?.some((header) => header.key === 'Cache-Control' && header.value.includes('immutable')))) throw new Error('Versioned word-pack cache header is missing.');
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
