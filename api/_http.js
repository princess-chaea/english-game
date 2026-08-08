import crypto from 'node:crypto';
import { adminAuth } from './_firebase-admin.js';

export function sendJson(res, status, body) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.status(status).json(body);
}
export function apiError(status, code, message) { const e = new Error(message); e.status = status; e.code = code; return e; }
export function handleApiError(res, error) {
  const status = Number.isInteger(error?.status) ? error.status : 500;
  if (status >= 500) console.error(error);
  sendJson(res, status, { ok: false, error: { code: error?.code || 'SERVER_ERROR', message: status >= 500 ? 'Server error. Please try again.' : error.message } });
}
export function requireMethod(req, methods) { if (!methods.includes(req.method)) throw apiError(405, 'METHOD_NOT_ALLOWED', 'Method not allowed.'); }
export async function readBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { throw apiError(400, 'INVALID_JSON', 'Invalid request.'); } }
  if (typeof req.body !== 'object' || Array.isArray(req.body)) throw apiError(400, 'INVALID_BODY', 'Invalid request.');
  return req.body;
}
export async function requireUser(req, { googleOnly = false } = {}) {
  const value = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '')?.[1];
  if (!value) throw apiError(401, 'AUTH_REQUIRED', 'Sign-in is required.');
  let token;
  try { token = await adminAuth.verifyIdToken(value, true); } catch { throw apiError(401, 'INVALID_TOKEN', 'Your sign-in has expired.'); }
  if (googleOnly && token.firebase?.sign_in_provider !== 'google.com') throw apiError(403, 'GOOGLE_REQUIRED', 'Teacher features require Google sign-in.');
  return token;
}
export async function requireTeacher(req) {
  const token = await requireUser(req, { googleOnly: true });
  const email = text(token.email, 320).toLocaleLowerCase('en-US');
  if (!token.email_verified || !email.includes('@')) throw apiError(403, 'VERIFIED_EMAIL_REQUIRED', 'Teacher features require a verified Google email.');
  const domains = (process.env.TEACHER_ALLOWED_DOMAINS || '').split(',').map((value) => value.trim().toLocaleLowerCase('en-US').replace(/^@/, '')).filter(Boolean);
  if (domains.length && !domains.includes(email.split('@').pop())) throw apiError(403, 'TEACHER_DOMAIN_NOT_ALLOWED', 'This Google email domain is not approved for teacher access.');
  return token;
}
export function text(value, max = 80) { return typeof value === 'string' ? value.normalize('NFKC').trim().slice(0, max) : ''; }
export function safeInt(value, fallback = 0, min = 0, max = Number.MAX_SAFE_INTEGER) { const n = Number(value); return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.trunc(n))) : fallback; }
export function hash(value) { return crypto.createHash('sha256').update(String(value)).digest('hex'); }
export function randomCode() { return crypto.randomBytes(6).toString('base64url').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8); }
export function isExpired(timestamp) { return Boolean(timestamp?.toMillis && timestamp.toMillis() <= Date.now()); }
const K = String.fromCharCode(92);
const BLOCKED = [
  'admin','administrator','teacher','fuck','fuk','shit','bitch','asshole','sex','porn','rape','nazi',
  K+'uc528'+K+'ubc1c',K+'uc2dc'+K+'ubc1c',K+'uac1c'+K+'uc0c8',K+'ubcd1'+K+'uc2e0',K+'uc878',K+'uc874'+K+'ub098',K+'uc139'+K+'uc2a4',K+'uc57c'+K+'ub3d9',K+'uac15'+K+'uac04',K+'uc790'+K+'uc0b4',K+'uc8fd'+K+'uc5b4',K+'uc0b4'+K+'uc778',K+'ud14c'+K+'ub7ec'
].map((v) => v.replace(/\\u([0-9a-f]{4})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16))));
export function normalizeNickname(value) {
  const nickname = text(value, 24).replace(/[\u200B-\u200D\uFEFF]/g, '');
  if (!/^[\p{L}\p{N}_-]{2,12}$/u.test(nickname)) throw apiError(400, 'INVALID_NICKNAME', 'Nickname must be 2-12 letters, numbers, _ or -, without spaces.');
  const lower = nickname.toLocaleLowerCase('en-US');
  if (BLOCKED.some((word) => lower.includes(word))) throw apiError(400, 'BLOCKED_NICKNAME', 'Please choose a safe nickname.');
  if (/\d{3}[-_]?\d{3,4}[-_]?\d{4}/.test(nickname) || /https?|www|@/.test(lower)) throw apiError(400, 'PERSONAL_INFO_NICKNAME', 'Personal contact details are not allowed in a nickname.');
  return nickname;
}
