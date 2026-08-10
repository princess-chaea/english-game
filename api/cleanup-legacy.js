import crypto from 'node:crypto';
import { adminDb, adminStorage, FieldValue, Timestamp } from './_firebase-admin.js';
import { handleApiError, safeInt, sendJson } from './_http.js';

const settings = adminDb.collection('_system').doc('legacyMigrationCleanup');

function hasValidCronSecret(req) {
  const expected = process.env.CRON_SECRET;
  const received = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '')?.[1] || '';
  if (!expected || !received) return false;
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);
  return expectedBuffer.length === receivedBuffer.length && crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}
function legacyDamageTotal(data) {
  const existing = safeInt(data?.legacyDamageTotal, 0, 0, 100000000000);
  const mapTotal = Object.values(data?.damages || {}).reduce((sum, value) => sum + safeInt(value, 0, 0, 100000000000), 0);
  return existing + mapTotal;
}
async function cleanupExpiredTeacherProofs() {
  const now = Timestamp.now();
  const expired = await adminDb.collection('teacherVerificationRequests').where('expiresAt', '<=', now).limit(50).get();
  const expiredDocs = expired.docs;
  if (!expiredDocs.length) return 0;
  const pendingDocs = expiredDocs.filter((doc) => ['pending', 'superseded'].includes(doc.data()?.status));
  const teacherIds = [...new Set(pendingDocs.map((doc) => doc.data()?.uid).filter(Boolean))];
  const teacherSnaps = teacherIds.length ? await adminDb.getAll(...teacherIds.map((uid) => adminDb.collection('teachers').doc(uid))) : [];
  const teacherById = new Map(teacherSnaps.map((snap) => [snap.id, snap]));
  const clearedProofIds = new Set();
  await Promise.all(expiredDocs.map(async (doc) => {
    const objectPath = doc.data()?.objectPath;
    if (!objectPath) {
      clearedProofIds.add(doc.id);
      return;
    }
    try {
      await adminStorage.bucket().file(objectPath).delete({ ignoreNotFound: true });
      clearedProofIds.add(doc.id);
    } catch (error) {
      console.warn('Expired teacher proof cleanup deferred', { requestId: doc.id, message: error?.message || String(error) });
    }
  }));
  const batch = adminDb.batch();
  expiredDocs.forEach((doc) => {
    const data = doc.data() || {};
    const update = {
      teacherName: FieldValue.delete(), schoolName: FieldValue.delete(), schoolKey: FieldValue.delete(),
      contentType: FieldValue.delete(), fileSize: FieldValue.delete(), fileHash: FieldValue.delete(), redactionConfirmed: FieldValue.delete(),
      email: FieldValue.delete(), googleDisplayName: FieldValue.delete()
    };
    if (clearedProofIds.has(doc.id)) update.objectPath = FieldValue.delete();
    if (['pending', 'superseded'].includes(data.status)) Object.assign(update, { status: 'expired', expiredAt: FieldValue.serverTimestamp() });
    batch.set(doc.ref, update, { merge: true });
    const teacherSnap = teacherById.get(data.uid);
    if (teacherSnap?.exists && teacherSnap.data()?.verificationRequestId === doc.id && teacherSnap.data()?.verificationStatus === 'pending') {
      batch.set(teacherSnap.ref, { verificationStatus: 'expired', verificationObjectPath: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }
  });
  await batch.commit();
  return expiredDocs.length;
}
async function cleanupSchedule() {
  const days = Math.min(180, Math.max(60, Number(process.env.LEGACY_MIGRATION_RETENTION_DAYS || 60)));
  return adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(settings);
    const data = snap.data();
    if (data?.deleteAfter?.toMillis) return { days, deleteAfter: data.deleteAfter, startedNow: false };
    const startedAt = Timestamp.now();
    const deleteAfter = Timestamp.fromMillis(startedAt.toMillis() + days * 24 * 60 * 60 * 1000);
    tx.set(settings, { startedAt, deleteAfter, retentionDays: days, createdAt: FieldValue.serverTimestamp() }, { merge: true });
    return { days, deleteAfter, startedNow: true };
  });
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return sendJson(res, 405, { ok: false });
    if (!hasValidCronSecret(req)) return sendJson(res, 401, { ok: false });
    const expiredTeacherProofsDeleted = await cleanupExpiredTeacherProofs();
    const schedule = await cleanupSchedule();
    if (schedule.deleteAfter.toMillis() > Date.now()) {
      return sendJson(res, 200, { ok: true, pending: true, retentionDays: schedule.days, deleteAfter: schedule.deleteAfter.toDate().toISOString(), startedNow: schedule.startedNow, expiredTeacherProofsDeleted });
    }
    const [userDocs, bossDocs] = await Promise.all([
      adminDb.collection('users').limit(200).get(),
      adminDb.collection('world_bosses').limit(200).get()
    ]);
    const batch = adminDb.batch();
    userDocs.docs.forEach((doc) => batch.delete(doc.ref));
    bossDocs.docs.forEach((doc) => {
      const data = doc.data();
      if (data.damages || data.lastPlayedDates) {
        batch.set(doc.ref, {
          legacyDamageTotal: legacyDamageTotal(data),
          damages: FieldValue.delete(),
          lastPlayedDates: FieldValue.delete(),
          legacySanitizedAt: FieldValue.serverTimestamp()
        }, { merge: true });
      }
    });
    if (!userDocs.empty || !bossDocs.empty) await batch.commit();
    sendJson(res, 200, {
      ok: true,
      pending: false,
      retentionDays: schedule.days,
      deleteAfter: schedule.deleteAfter.toDate().toISOString(),
      legacyUsersDeleted: userDocs.size,
      worldBossDocumentsSanitized: bossDocs.docs.filter((doc) => Boolean(doc.data().damages || doc.data().lastPlayedDates)).length,
      expiredTeacherProofsDeleted
    });
  } catch (error) { handleApiError(res, error); }
}
