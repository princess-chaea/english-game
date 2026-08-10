import crypto from 'node:crypto';
import { adminDb, FieldValue, Timestamp } from './_firebase-admin.js';
import { apiError, handleApiError, readBody, requireMethod, requireUser, safeInt, sendJson } from './_http.js';

const bosses = adminDb.collection('world_bosses');
const accounts = adminDb.collection('accounts');
const sessions = adminDb.collection('worldBossSessions');
const classes = adminDb.collection('classes');
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const EPOCH_MONDAY_MS = Date.UTC(2024, 6, 1);
const WEEKLY_REWARD_FP_AT_FULL_CONTRIBUTION = 100000;
const RAID_ANSWER_INTERVAL_MS = 1200;
const RAID_MAX_REPORTED_ANSWERS = 120;
const RAID_ANSWERS_FOR_FULL_DAMAGE_CAP = 10;
const RAID_MIN_FULL_DAMAGE_DURATION_MS = 120000;
const RAID_MAX_DAMAGE_RATE = 0.15; // 1일 레이드 정상 고전투력 폭딜 허용, 변조 방지 상한 15%
const guildLogoUrl = (value) => typeof value === 'string' && /^https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/[A-Za-z0-9._-]+\/o\//.test(value) ? value : null;

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
  const rankedDocs = topSnap.docs;
  const publicDocs = rankedDocs.filter((doc) => doc.data().publicLeaderboard).slice(0, 100);
  const top = publicDocs.map((doc, index) => ({ rank: index + 1, nickname: doc.data().publicNickname, guildName: typeof doc.data().publicGuildName === 'string' ? doc.data().publicGuildName : null, guildLogoUrl: typeof doc.data().publicGuildName === 'string' ? guildLogoUrl(doc.data().publicGuildLogoUrl) : null, titleName: typeof doc.data().publicTitleName === 'string' ? doc.data().publicTitleName : null, damage: safeInt(doc.data().damage, 0, 0) }));
  // 공개 설정은 이름표 노출만 제어합니다. 실제 기여 순위와 1위 칭호 판정은
  // 비공개 참가자도 포함한 전체 피해량 순서를 그대로 사용합니다.
  const myRankIndex = rankedDocs.findIndex((doc) => doc.id === uid);
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
async function claimWeeklyReward(uid) {
  const week = currentWeek() - 1;
  const ref = bossRef(week);
  const contributionRef = ref.collection('contributions').doc(uid);
  const claimRef = ref.collection('rewardClaims').doc(uid);
  const existingClaim = await claimRef.get();
  if (existingClaim.exists) return { week, participated: true, alreadyClaimed: true, rewardFp: 0, gotTitle: false };
  const [bossSnap, contributionSnap, winnerSnap] = await Promise.all([
    ref.get(),
    contributionRef.get(),
    ref.collection('contributions').orderBy('damage', 'desc').limit(1).get()
  ]);
  if (!bossSnap.exists || !contributionSnap.exists) return { week, participated: false, alreadyClaimed: false, rewardFp: 0, gotTitle: false };
  const boss = bossSnap.data() || {};
  const maxHp = Math.max(1, safeInt(boss.maxHp, maxHpForWeek(week), 1));
  const totalDamage = legacyTotal(boss) + safeInt(boss.secureDamageTotal, 0, 0);
  const defeated = totalDamage >= maxHp;
  const myDamage = safeInt(contributionSnap.data()?.damage, 0, 0);
  if (!myDamage) return { week, participated: false, alreadyClaimed: false, rewardFp: 0, gotTitle: false };
  const rewardFp = Math.max(0, Math.round(WEEKLY_REWARD_FP_AT_FULL_CONTRIBUTION * Math.min(1, myDamage / maxHp) * (defeated ? 1 : 0.5)));
  const contributionQuery = ref.collection('contributions');
  const [participantAggregate, higherDamageAggregate] = await Promise.all([
    contributionQuery.count().get(),
    contributionQuery.where('damage', '>', myDamage).count().get()
  ]);
  const participantCount = safeInt(participantAggregate.data()?.count, 0, 0);
  const myRank = safeInt(higherDamageAggregate.data()?.count, 0, 0) + 1;
  const teamContributionRate = totalDamage > 0 ? myDamage / totalDamage : 0;
  const rewardContributionRate = Math.min(1, myDamage / maxHp);
  const gotTitle = defeated && winnerSnap.docs[0]?.id === uid;
  const result = await adminDb.runTransaction(async (tx) => {
    const [claimSnap, accountSnap] = await Promise.all([tx.get(claimRef), tx.get(accounts.doc(uid))]);
    if (claimSnap.exists) return { alreadyClaimed: true };
    if (!accountSnap.exists) throw apiError(404, 'PROFILE_NOT_FOUND', '먼저 용사를 만들어 주세요.');
    tx.create(claimRef, { uid, week, rewardFp, gotTitle, claimedAt: FieldValue.serverTimestamp() });
    const accountUpdate = { 'state.masteryPoints': FieldValue.increment(rewardFp), updatedAt: FieldValue.serverTimestamp() };
    if (gotTitle) accountUpdate['state.unlockedTitles'] = FieldValue.arrayUnion('수호신');
    tx.update(accounts.doc(uid), accountUpdate);
    return { alreadyClaimed: false };
  });
  return {
    week,
    participated: true,
    defeated,
    alreadyClaimed: result.alreadyClaimed,
    rewardFp: result.alreadyClaimed ? 0 : rewardFp,
    gotTitle: result.alreadyClaimed ? false : gotTitle,
    myDamage,
    totalDamage,
    maxHp,
    myRank,
    participantCount,
    teamContributionRate,
    rewardContributionRate
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
    tx.set(ref, { uid, week, day, tokenHash, startedAtMs: now, submitted: false, createdAt: FieldValue.serverTimestamp(), expiresAt });
  });
  return { week, day, token, expiresAt: expiresAt.toDate().toISOString() };
}
function rewardsForAppliedDamage(appliedDamage) {
  const applied = safeInt(appliedDamage, 0, 0);
  return {
    rewardGold: Math.max(500, Math.floor(applied / 500)),
    rewardTokens: Math.min(500, 200 + Math.floor(applied / 10000000) * 20)
  };
}
async function contribute(uid, body) {
  const week = currentWeek();
  const day = kstDay();
  const token = typeof body.raidToken === 'string' ? body.raidToken : '';
  if (token.length < 20) throw apiError(400, 'INVALID_RAID_TOKEN', '먼저 월드보스 참전을 시작해 주세요.');
  if (!Object.prototype.hasOwnProperty.call(body, 'correctAnswers') || body.correctAnswers == null) {
    throw apiError(409, 'RAID_CLIENT_UPDATE_REQUIRED', '게임을 새로고침한 후 다시 참전해 주세요.');
  }
  const reportedCorrectAnswers = safeInt(body.correctAnswers, 0, 0, RAID_MAX_REPORTED_ANSWERS);
  const requested = safeInt(body.damage, 0, 0, Math.floor(maxHpForWeek(week) * RAID_MAX_DAMAGE_RATE));
  if (!requested) throw apiError(400, 'INVALID_DAMAGE', '피해량은 0보다 커야 해요.');
  const accountRef = accounts.doc(uid);
  const ref = bossRef(week);
  const contributionRef = ref.collection('contributions').doc(uid);
  const raidSessionRef = sessionRef(uid, week);
  const result = await adminDb.runTransaction(async (tx) => {
    const [bossSnap, contributionSnap, sessionSnap, accountSnap] = await Promise.all([
      tx.get(ref),
      tx.get(contributionRef),
      tx.get(raidSessionRef),
      tx.get(accountRef)
    ]);
    if (!accountSnap.exists) throw apiError(404, 'PROFILE_NOT_FOUND', '먼저 용사를 만들어 주세요.');
    const account = accountSnap.data() || {};
    const activeClassId = typeof account.activeClassId === 'string' ? account.activeClassId : '';
    const memberRef = activeClassId ? classes.doc(activeClassId).collection('members').doc(uid) : null;
    const memberSnap = memberRef ? await tx.get(memberRef) : null;
    const session = sessionSnap.data();
    const now = Date.now();
    const startedAtMs = safeInt(session?.startedAtMs || session?.createdAt?.toMillis?.(), 0, 0, now);
    if (!session || !startedAtMs || startedAtMs > now || session.day !== day || session.submitted || session.expiresAt?.toMillis?.() <= now || session.tokenHash !== secretHash(token)) {
      throw apiError(409, 'RAID_SESSION_INVALID', '월드보스 참전 시간이 끝났어요. 새로 시작해 주세요.');
    }
    const elapsedMs = Math.max(0, now - startedAtMs);
    const allowedAnswersByElapsedTime = Math.min(RAID_MAX_REPORTED_ANSWERS, Math.floor(elapsedMs / RAID_ANSWER_INTERVAL_MS));
    const verifiedCorrectAnswers = Math.min(reportedCorrectAnswers, allowedAnswersByElapsedTime);
    const previous = contributionSnap.data() || {};
    if (previous.lastPlayedKstDay === day) throw apiError(409, 'RAID_ALREADY_COMPLETED', "오늘의 월드보스 참전은 이미 완료했어요.");
    const maxHp = maxHpForWeek(week);
    const boss = bossSnap.data() || {};
    const currentTotal = legacyTotal(boss) + safeInt(boss.secureDamageTotal, 0, 0);
    const verificationScale = Math.min(1, verifiedCorrectAnswers / RAID_ANSWERS_FOR_FULL_DAMAGE_CAP, elapsedMs / RAID_MIN_FULL_DAMAGE_DURATION_MS);
    const verifiedRequestedDamage = Math.floor(requested * verificationScale);
    const hardDamageCap = Math.floor(maxHp * RAID_MAX_DAMAGE_RATE);
    const effectiveDamageCap = Math.min(verifiedRequestedDamage, hardDamageCap);
    const applied = Math.min(effectiveDamageCap, Math.max(0, maxHp - currentTotal));
    const { rewardGold, rewardTokens } = rewardsForAppliedDamage(applied);
    const accountState = account.state && typeof account.state === 'object' && !Array.isArray(account.state) ? account.state : {};
    const currentGold = safeInt(accountState.gold, 0, 0);
    const currentAccGold = safeInt(accountState.accGold ?? accountState.gold, currentGold, 0);
    const currentBossTokens = safeInt(accountState.bossTokens, 0, 0);
    const nextAccountState = {
      gold: safeInt(currentGold + rewardGold, currentGold, 0),
      accGold: safeInt(currentAccGold + rewardGold, currentAccGold, 0),
      bossTokens: safeInt(currentBossTokens + rewardTokens, currentBossTokens, 0)
    };
    const secureDamageTotal = safeInt(boss.secureDamageTotal, 0, 0) + applied;
    tx.set(ref, { maxHp, curHp: Math.max(0, maxHp - legacyTotal(boss) - secureDamageTotal), secureDamageTotal, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    tx.set(contributionRef, {
      damage: safeInt(previous.damage, 0, 0) + applied,
      lastPlayedKstDay: day,
      publicLeaderboard: Boolean(account.leaderboardOptIn),
      publicNickname: account.leaderboardOptIn ? account.nickname : null,
      publicGuildName: account.leaderboardOptIn ? (typeof account.activeGuildName === 'string' ? account.activeGuildName : null) : null,
      publicGuildLogoUrl: account.leaderboardOptIn && account.activeGuildName ? guildLogoUrl(account.activeGuildLogoUrl) : null,
      publicTitleName: account.leaderboardOptIn ? (typeof account.state?.equippedTitle === 'string' ? account.state.equippedTitle : (typeof account.state?.wbTitle === 'string' ? account.state.wbTitle : null)) : null,
      reportedCorrectAnswers: FieldValue.increment(reportedCorrectAnswers),
      verifiedCorrectAnswers: FieldValue.increment(verifiedCorrectAnswers),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    tx.update(raidSessionRef, { reportedCorrectAnswers, verifiedCorrectAnswers, submitted: true, submittedAt: FieldValue.serverTimestamp() });
    tx.update(accountRef, {
      'state.gold': nextAccountState.gold,
      'state.accGold': nextAccountState.accGold,
      'state.bossTokens': nextAccountState.bossTokens,
      updatedAt: FieldValue.serverTimestamp()
    });
    if (memberRef && memberSnap?.exists && applied > 0) {
      const member = memberSnap.data() || {};
      const previousDaily = member.guildBossPointDay === day ? safeInt(member.guildBossPointDayAmount, 0, 0, 100) : 0;
      const earned = Math.max(0, Math.min(100 - previousDaily, Math.floor(applied / 1000000)));
      tx.set(memberRef, {
        guildBossDamage: FieldValue.increment(applied),
        guildBossPointTotal: FieldValue.increment(earned),
        guildBossPointDay: day,
        guildBossPointDayAmount: previousDaily + earned,
        guildPoints: FieldValue.increment(earned),
        lastActiveAt: FieldValue.serverTimestamp()
      }, { merge: true });
    }
    return {
      applied,
      requested,
      damageCap: effectiveDamageCap,
      hardDamageCap,
      verificationScale,
      capped: applied < requested,
      damage: safeInt(previous.damage, 0, 0) + applied,
      reportedCorrectAnswers,
      verifiedCorrectAnswers,
      rewardGold,
      rewardTokens,
      accountState: nextAccountState
    };
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
    else if (body.action === 'weeklyReward') response = { reward: await claimWeeklyReward(user.uid) };
    else if (body.action === 'start') response = { raid: await start(user.uid) };
    else if (body.action === 'contribute') response = await contribute(user.uid, body);
    else throw apiError(400, 'UNKNOWN_ACTION', '알 수 없는 요청입니다.');
    sendJson(res, 200, { ok: true, ...response });
  } catch (error) { handleApiError(res, error); }
}
