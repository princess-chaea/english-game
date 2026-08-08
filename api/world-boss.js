import crypto from 'node:crypto';
import { adminDb, FieldValue, Timestamp } from './_firebase-admin.js';
import { apiError, handleApiError, readBody, requireMethod, requireUser, safeInt, sendJson } from './_http.js';

const bosses = adminDb.collection('world_bosses');
const accounts = adminDb.collection('accounts');
const sessions = adminDb.collection('worldBossSessions');
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const EPOCH_MONDAY_MS = Date.UTC(2024, 6, 1);

function kstDay(now = Date.now()) {
  return new Date(now + KST_OFFSET_MS).toISOString().slice(0, 10);
}
function currentWeek(now = Date.now()) {
  const kst = new Date(now + KST_OFFSET_MS);
  const midnight = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate());
  const monday = midnight - ((new Date(midnight).getUTCDay() + 6) % 7) * 24 * 60 * 60 * 1000;
  return Math.floor((monday - EPOCH_MONDAY_MS) / WEEK_MS);
}
function maxHpForWeek(week) {
  return Math.min(100000000000, 10000000000 + Math.max(0, week - 108) * 1000000000);
}
function bossRef(week) { return bosses.doc(`global_week_${week}`); }
function sessionRef(uid, week) { return sessions.doc(crypto.createHash('sha256').update(`world-boss:${week}:${uid}`).digest('hex')); }
function secret() { return crypto.randomBytes(24).toString('base64url'); }
function secretHash(value) { return crypto.createHash('sha256').update(String(value)).digest('hex'); }
function legacyTotal(data) {
  // Old documents keyed damage by personal school/class/name data. Preserve only
  // the aggregate HP effect, and never return or add to that data map.
  return safeInt(data?.legacyDamageTotal, 0, 0, 100000000000) + Object.values(data?.damages || {}).reduce((sum, value) => sum + safeInt(value, 0, 0, 100000000000), 0);
}
async function status(uid) {
  const week = currentWeek();
  const ref = bossRef(week);
  const [bossSnap, contributionSnap, topSnap] = await Promise.all([
    ref.get(),
    ref.collection('contributions').doc(uid).get(),
    ref.collection('contributions').orderBy('damage', 'desc').limit(250).get()
  ]);
  const boss = bossSnap.data() || {};
  const maxHp = maxHpForWeek(week);
  const totalDamage = Math.min(maxHp, legacyTotal(boss) + safeInt(boss.secureDamageTotal, 0, 0));
  const contribution = contributionSnap.data() || {};
  const publicDocs = topSnap.docs.filter((doc) => doc.data().publicLeaderboard).slice(0, 100);
  const top = publicDocs.map((doc, index) => ({ rank: index + 1, nickname: doc.data().publicNickname, damage: safeInt(doc.data().damage, 0, 0) }));
  const myRankIndex = publicDocs.findIndex((doc) => doc.id === uid);
  return {
    week,
    day: kstDay(),
    maxHp,
    curHp: Math.max(0, maxHp - totalDamage),
    totalDamage,
    myDamage: safeInt(contribution.damage, 0, 0),
    canAttack: contribution.lastPlayedKstDay !== kstDay(),
    myRank: myRankIndex < 0 ? null : myRankIndex + 1,
    top
  };
}
async function start(uid) {
  const week = currentWeek();
  const day = kstDay();
  const ref = sessionRef(uid, week);
  const token = secret();
  const tokenHash = secretHash(token);
  const now = Date.now();
  const expiresAt = Timestamp.fromMillis(now + 15 * 60 * 1000);
  await adminDb.runTransaction(async (tx) => {
    const [contributionSnap, sessionSnap] = await Promise.all([
      tx.get(bossRef(week).collection('contributions').doc(uid)),
      tx.get(ref)
    ]);
    if (contributionSnap.data()?.lastPlayedKstDay === day) throw apiError(409, 'RAID_ALREADY_COMPLETED', "오늘의 월드보스 참전은 이미 완료했어요.");
    const existing = sessionSnap.data();
    if (existing?.day === day && existing?.expiresAt?.toMillis?.() > now && !existing.submitted) {
      throw apiError(409, 'RAID_ALREADY_STARTED', '같은 기기에서 이어하거나 15분 뒤에 다시 시작해 주세요.');
    }
    tx.set(ref, { uid, week, day, tokenHash, submitted: false, createdAt: FieldValue.serverTimestamp(), expiresAt });
  });
  return { week, token, expiresAt: expiresAt.toDate().toISOString() };
}
async function contribute(uid, body) {
  const week = currentWeek();
  const day = kstDay();
  const token = typeof body.raidToken === 'string' ? body.raidToken : '';
  if (token.length < 20) throw apiError(400, 'INVALID_RAID_TOKEN', '먼저 월드보스 참전을 시작해 주세요.');
  const requested = safeInt(body.damage, 0, 0, Math.floor(maxHpForWeek(week) * 0.05));
  if (!requested) throw apiError(400, 'INVALID_DAMAGE', '피해량은 0보다 커야 해요.');
  const accountSnap = await accounts.doc(uid).get();
  if (!accountSnap.exists) throw apiError(404, 'PROFILE_NOT_FOUND', '먼저 용사를 만들어 주세요.');
  const account = accountSnap.data();
  const ref = bossRef(week);
  const contributionRef = ref.collection('contributions').doc(uid);
  const result = await adminDb.runTransaction(async (tx) => {
    const [bossSnap, contributionSnap, sessionSnap] = await Promise.all([tx.get(ref), tx.get(contributionRef), tx.get(sessionRef(uid, week))]);
    const session = sessionSnap.data();
    if (!session || session.day !== day || session.submitted || session.expiresAt?.toMillis?.() <= Date.now() || session.tokenHash !== secretHash(token)) {
      throw apiError(409, 'RAID_SESSION_INVALID', '월드보스 참전 시간이 끝났어요. 새로 시작해 주세요.');
    }
    const previous = contributionSnap.data() || {};
    if (previous.lastPlayedKstDay === day) throw apiError(409, 'RAID_ALREADY_COMPLETED', "오늘의 월드보스 참전은 이미 완료했어요.");
    const maxHp = maxHpForWeek(week);
    const boss = bossSnap.data() || {};
    const currentTotal = legacyTotal(boss) + safeInt(boss.secureDamageTotal, 0, 0);
    const applied = Math.min(requested, Math.max(0, maxHp - currentTotal));
    const secureDamageTotal = safeInt(boss.secureDamageTotal, 0, 0) + applied;
    tx.set(ref, { maxHp, curHp: Math.max(0, maxHp - legacyTotal(boss) - secureDamageTotal), secureDamageTotal, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    tx.set(contributionRef, {
      damage: safeInt(previous.damage, 0, 0) + applied,
      lastPlayedKstDay: day,
      publicLeaderboard: Boolean(account.leaderboardOptIn),
      publicNickname: account.leaderboardOptIn ? account.nickname : null,
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    tx.update(sessionRef(uid, week), { submitted: true, submittedAt: FieldValue.serverTimestamp() });
    return { applied, damage: safeInt(previous.damage, 0, 0) + applied };
  });
  return { ...result, boss: await status(uid) };
}

export default async function handler(req, res) {
  try {
    requireMethod(req, ['POST']);
    const user = await requireUser(req);
    const body = await readBody(req);
    let response;
    if (body.action === 'status') response = { boss: await status(user.uid) };
    else if (body.action === 'start') response = { raid: await start(user.uid) };
    else if (body.action === 'contribute') response = await contribute(user.uid, body);
    else throw apiError(400, 'UNKNOWN_ACTION', '알 수 없는 요청입니다.');
    sendJson(res, 200, { ok: true, ...response });
  } catch (error) { handleApiError(res, error); }
}
