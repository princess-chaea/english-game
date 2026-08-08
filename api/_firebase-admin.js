import { applicationDefault, cert, getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';

function createFirebaseApp() {
  if (getApps().length) return getApp();
  // Support both the documented uppercase names and the existing Vercel names.
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.project_id;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL || process.env.client_email;
  const privateKey = (process.env.FIREBASE_PRIVATE_KEY || process.env.private_key)?.replace(/\\n/g, '\n');
  if (projectId && clientEmail && privateKey) {
    return initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  }
  // Local development can use GOOGLE_APPLICATION_CREDENTIALS. Production must use Vercel secrets above.
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) return initializeApp({ credential: applicationDefault(), projectId });
  throw new Error('Firebase Admin credentials are not configured.');
}

const app = createFirebaseApp();
export const adminAuth = getAuth(app);
export const adminDb = getFirestore(app);
export { FieldValue, Timestamp };
