import packCatalog from '../data/word-packs.js';
import { readFile } from 'node:fs/promises';
import { compactSkillInventory, MAX_STORED_SKILL_CARDS, MAX_STORED_STATE_BYTES } from '../api/_student-skill-state.js';

const sourceWords = (packCatalog.words || []).slice(0, 3000);
if (sourceWords.length !== 3000) throw new Error('Storage simulation requires 3,000 curriculum words.');
const studentApi = await readFile(new URL('../api/student.js', import.meta.url), 'utf8');
if (!studentApi.includes('requestedSkillCount>MAX_STORED_SKILL_CARDS')) throw new Error('Save path must reject 3,501 cards before compact truncation.');
if (!studentApi.includes("Buffer.byteLength(JSON.stringify(state),'utf8')>MAX_STORED_STATE_BYTES")) throw new Error('Save path must enforce the safe serialized-state byte limit.');
const skillRework = await readFile(new URL('../js/skill-rework.js', import.meta.url), 'utf8');
if (!skillRework.includes('while (usedIds.has(id))') || !skillRework.includes('previousEquipped.map((id) => idAliases.get(id)') || !skillRework.includes('meaning: plainSkillText(entry.meaning, 160)')) throw new Error('Client load normalization must preserve unique IDs, equipped remaps, and safe deck text.');



const rawCards = sourceWords.map((entry, index) => ({
  id: `skill_${1760000000000 + index}_${index}`,
  word: entry.word,
  meaning: entry.meaning,
  grade: ['normal', 'rare', 'hero', 'legendary', 'mythic'][index % 5],
  tier: index % 3 + 1,
  stars: index % 7,
  exp: index % 17,
  maxExp: 999999,
  cooldownRemaining: index % 11 === 0 ? 17 : 0,
  maxCooldown: 30,
  injectedField: '<img src=x onerror=alert(1)>'
}));
const { cards } = compactSkillInventory(rawCards);
if (cards.length !== 3000) throw new Error('Compact inventory lost curriculum cards.');
if (cards.some((card) => Object.hasOwn(card, 'maxExp') || Object.hasOwn(card, 'injectedField'))) throw new Error('Compact inventory retained redundant or unapproved fields.');

const hostile = compactSkillInventory([{
  id: `bad'"><img src=x onerror=alert(1)>`,
  word: '<script>alert(1)</script>',
  meaning: '<img src=x onerror=alert(1)>뜻',
  grade: 'hacked', tier: 99, stars: 99, exp: 999999
}]).cards[0];
if (!hostile || /[^A-Za-z0-9_:-]/.test(hostile.id) || /[<>&]/.test(hostile.word + hostile.meaning) || hostile.grade !== 'normal' || hostile.tier !== 3 || hostile.stars !== 6 || hostile.exp) throw new Error('Hostile skill data was not normalized safely.');
const collisionResult = compactSkillInventory([
  { id: "same'", word: 'alpha', meaning: '알파' },
  { id: 'same"', word: 'beta', meaning: '베타' }
]);
if (new Set(collisionResult.cards.map((card) => card.id)).size !== 2) throw new Error('Sanitized skill IDs must remain unique after collisions.');
if (collisionResult.idAliases.get("same'") === collisionResult.idAliases.get('same"')) throw new Error('Original equipped IDs must remap to distinct sanitized cards.');


const wordLearningStats = Object.fromEntries(sourceWords.slice(0, 2000).map((entry, index) => [String(entry.word).toLowerCase(), {
  w: entry.word,
  m: entry.meaning,
  c: 10 + index % 90,
  x: index % 7,
  s: index % 12,
  b: index % 20,
  t: { 'meaning-choice': [20 + index % 30, 16 + index % 20], 'word-choice': [10 + index % 10, 8 + index % 8] },
  u: 1760000000000 + index
}]));
const state = {
  skillsInventory: cards,
  equippedSkills: cards.slice(0, 4).map((card) => card.id),
  activeSkillDeck: sourceWords.slice(0, 24).map(({ word, meaning }) => ({ word, meaning })),
  skillLockedWords: sourceWords.slice(0, 3000).map((entry) => entry.word),
  skillDiscoveredWords: sourceWords.map((entry) => entry.word),
  masteredWords: sourceWords.map((entry) => entry.word),
  wordLearningStats,
  wrongWordCounts: Object.fromEntries(sourceWords.slice(0, 300).map((entry, index) => [entry.word, index + 1])),
  questionTypeStats: {
    'meaning-choice': { tries: 999999, correct: 800000 },
    'fill-blank': { tries: 999999, correct: 700000 },
    'word-choice': { tries: 999999, correct: 750000 },
    'listen-meaning': { tries: 999999, correct: 780000 },
    'word-order': { tries: 999999, correct: 720000 },
    'short-answer': { tries: 999999, correct: 680000 }
  }
};
const bytes = Buffer.byteLength(JSON.stringify(state), 'utf8');
if (bytes > MAX_STORED_STATE_BYTES) throw new Error(`Representative state exceeds safe limit: ${bytes}/${MAX_STORED_STATE_BYTES}`);
if (MAX_STORED_SKILL_CARDS !== 3500 || Array.from({ length: 3501 }).length <= MAX_STORED_SKILL_CARDS) throw new Error('3,501-card overflow contract is invalid.');

console.log(JSON.stringify({ cards: cards.length, learningStats: Object.keys(wordLearningStats).length, bytes, limit: MAX_STORED_STATE_BYTES, spareBytes: MAX_STORED_STATE_BYTES - bytes }));
