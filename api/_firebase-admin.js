import { applicationDefault, cert, getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';
import { AggregateField, FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';

function createFirebaseApp() {
  if (getApps().length) return getApp();
  // Support both the documented uppercase names and the existing Vercel names.
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.project_id;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL || process.env.client_email;
  const privateKey = (process.env.FIREBASE_PRIVATE_KEY || process.env.private_key)?.replace(/\\n/g, '\n');
  if (projectId && clientEmail && privateKey) {
    return initializeApp({ credential: cert({ projectId, clientEmail, privateKey }), storageBucket: process.env.FIREBASE_STORAGE_BUCKET || (projectId + '.firebasestorage.app') });
  }
  // Local development can use GOOGLE_APPLICATION_CREDENTIALS. Production must use Vercel secrets above.
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) return initializeApp({ credential: applicationDefault(), projectId, storageBucket: process.env.FIREBASE_STORAGE_BUCKET || (projectId + '.firebasestorage.app') });
  throw new Error('Firebase Admin credentials are not configured.');
}

const app = createFirebaseApp();
export const adminAuth = getAuth(app);
export const adminDb = getFirestore(app);
export const adminStorage = getStorage(app);
export { AggregateField, FieldValue, Timestamp };
