import { adminDb } from './_firebase-admin.js';
import { apiError, handleApiError, readBody, requireMethod, requireUser, safeInt, sendJson } from './_http.js';

const SORTS = new Set(['score', 'stage', 'gold']);
const guildLogoUrl = (value) => typeof value === 'string' && /^https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/[A-Za-z0-9._-]+\/o\//.test(value) ? value : null;

export default async function handler(req, res) {
  try {
    requireMethod(req, ['POST']);
    const user = await requireUser(req);
    const body = await readBody(req);
    const limit = safeInt(body.limit, 30, 1, 100);
    const sort = SORTS.has(body.sort) ? body.sort : 'score';
    const snapshot = await adminDb.collection('leaderboard').orderBy(sort, 'desc').limit(limit).get();
    const entries = snapshot.docs.map((doc, index) => {
      const data = doc.data();
      return {
        rank: index + 1,
        isMe: doc.id === user.uid,
        nickname: data.nickname,
        guildName: typeof data.guildName === 'string' ? data.guildName : null,
        guildLogoUrl: typeof data.guildName === 'string' ? guildLogoUrl(data.guildLogoUrl) : null,
        titleName: typeof data.titleName === 'string' ? data.titleName : null,
        score: safeInt(data.score, 0, 0),
        stage: safeInt(data.stage, 1, 1),
        progress: safeInt(data.progress, 0, 0, 100),
        gold: safeInt(data.gold, 0, 0),
        correctCount: safeInt(data.correctCount, 0, 0)
      };
    });
    sendJson(res, 200, { ok: true, entries });
  } catch (error) { handleApiError(res, error); }
}
