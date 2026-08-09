import { access, readFile } from 'node:fs/promises';

const requiredEnvironment = [
  { label: 'FIREBASE_PROJECT_ID/project_id', names: ['FIREBASE_PROJECT_ID', 'project_id'] },
  { label: 'FIREBASE_CLIENT_EMAIL/client_email', names: ['FIREBASE_CLIENT_EMAIL', 'client_email'] },
  { label: 'FIREBASE_PRIVATE_KEY/private_key', names: ['FIREBASE_PRIVATE_KEY', 'private_key'] },
  { label: 'CRON_SECRET', names: ['CRON_SECRET'] }
];
const missing = requiredEnvironment.filter((entry) => !entry.names.some((name) => process.env[name])).map((entry) => entry.label);
const files = ['firebase.json', 'firestore.rules', 'firestore.indexes.json', 'storage.rules', 'vercel.json', 'data/word-packs.json', 'data/curriculum-3000-review-catalog.json'];
for (const file of files) await access(file);
const firebase = JSON.parse(await readFile('firebase.json', 'utf8'));
const vercel = JSON.parse(await readFile('vercel.json', 'utf8'));
if (firebase.firestore?.rules !== 'firestore.rules') throw new Error('firebase.json must point to firestore.rules.');
if (firebase.firestore?.indexes !== 'firestore.indexes.json') throw new Error('firebase.json must point to firestore.indexes.json.');
if (firebase.storage?.rules !== 'storage.rules') throw new Error('firebase.json must point to storage.rules.');
if (!vercel.crons?.some((job) => job.path === '/api/cleanup-legacy')) throw new Error('Legacy cleanup cron is missing.');
const configuredProjectId = process.env.FIREBASE_PROJECT_ID || process.env.project_id;
if (configuredProjectId && configuredProjectId !== 'vocahero-1876a') throw new Error('Firebase project ID does not match the configured Firebase project.');
if (missing.length) {
  console.log(`Release files are ready. Add these secrets before deployment: ${missing.join(', ')}`);
  process.exitCode = 2;
} else {
  console.log('Release readiness: required secrets and configuration are present.');
}
