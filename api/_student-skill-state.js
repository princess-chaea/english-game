export const MAX_STORED_SKILL_CARDS = 3500;
export const MAX_STORED_STATE_BYTES = 850000;

const SKILL_GRADES = new Set(['normal', 'rare', 'hero', 'legendary', 'mythic']);
const SKILL_EXP_LIMIT = Object.freeze({ normal: 1, rare: 3, hero: 9, legendary: 27, mythic: 81 });

function integer(value, fallback, minimum, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.floor(number)));
}

function plainText(value, limit) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f<>&]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limit);
}

function uniqueSafeId(rawValue, index, usedIds) {
  const original = String(rawValue ?? '').slice(0, 128);
  const base = original.replace(/[^A-Za-z0-9_:-]/g, '_').slice(0, 96) || `skill_saved_${index}`;
  let candidate = base;
  let suffix = 1;
  while (usedIds.has(candidate)) {
    const tail = `_${index}_${suffix}`;
    candidate = `${base.slice(0, Math.max(1, 96 - tail.length))}${tail}`;
    suffix += 1;
  }
  usedIds.add(candidate);
  return { original, safe: candidate };
}

export function compactSkillInventory(value, options = {}) {
  const source = Array.isArray(value) ? value.slice(0, MAX_STORED_SKILL_CARDS) : [];
  const usedIds = new Set();
  const idAliases = new Map();
  const cards = [];

  source.forEach((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return;
    const word = plainText(raw.word, 80).toLowerCase();
    if (!word) return;
    const { original, safe: id } = uniqueSafeId(raw.id, index, usedIds);
    if (original && !idAliases.has(original)) idAliases.set(original, id);
    idAliases.set(id, id);

    const grade = SKILL_GRADES.has(raw.grade) ? raw.grade : 'normal';
    const tier = integer(raw.tier, 3, 1, 3);
    const stars = integer(raw.stars, 0, 0, 6);
    const exp = integer(raw.exp, 0, 0, Math.max(0, SKILL_EXP_LIMIT[grade] - 1));
    const cooldownRemaining = integer(raw.cooldownRemaining, 0, 0, 86400);
    const maxCooldown = integer(raw.maxCooldown, 30, 1, 3600);
    const meaning = plainText(raw.meaning, 160);
    const card = { id, word, grade, tier, stars };

    // Keep meanings compact but self-contained: students may later switch to
    // a narrower pack where an older card is outside the current catalog view.
    if (meaning) card.meaning = meaning;
    if (exp > 0) card.exp = exp;
    if (cooldownRemaining > 0) card.cooldownRemaining = cooldownRemaining;
    if (maxCooldown !== 30) card.maxCooldown = maxCooldown;
    cards.push(card);
  });

  return { cards, idAliases };
}
