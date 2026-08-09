import { readFile, writeFile } from 'node:fs/promises';

const url = new URL('../data/word-packs.json', import.meta.url);
const catalog = JSON.parse(await readFile(url, 'utf8'));
const levels = [
  { key: 'low', label: '하', ratio: 1 / 3 },
  { key: 'mid', label: '중', ratio: 2 / 3 },
  { key: 'high', label: '상', ratio: 1 }
];

function difficulty(entry) {
  const word = String(entry.word || '').toLowerCase().trim();
  const compact = word.replace(/[^a-z]/g, '');
  const wordCount = word.split(/[\s-]+/).filter(Boolean).length;
  const vowelGroups = (compact.match(/[aeiouy]+/g) || []).length;
  const rareLetters = (compact.match(/[qzxjv]/g) || []).length;
  const repeatedClusters = (compact.match(/[^aeiouy]{3,}/g) || []).join('').length;
  const meaningLength = [...String(entry.meaning || '').replace(/[\s,()]/g, '')].length;
  return compact.length * 1.2 + Math.max(0, wordCount - 1) * 6 + vowelGroups * 0.8
    + rareLetters * 1.5 + repeatedClusters * 0.5 + Math.min(6, meaningLength * 0.15);
}

function uniqueWords(words) {
  const byWord = new Map();
  for (const entry of words || []) {
    const key = String(entry?.word || '').normalize('NFKC').trim().toLowerCase();
    if (!key) continue;
    const previous = byWord.get(key);
    if (!previous) {
      byWord.set(key, { ...entry, word: String(entry.word).trim(), meaning: String(entry.meaning || '').trim() });
      continue;
    }
    const meanings = [...new Set([previous.meaning, String(entry.meaning || '').trim()].filter(Boolean))];
    previous.meaning = meanings.join(', ');
  }
  return [...byWord.values()];
}

const sourcePacks = new Map((catalog.packs || []).map(pack => [pack.id, pack]));
const generated = [];
for (let grade = 3; grade <= 6; grade += 1) {
  const source = sourcePacks.get(`grade-${grade}-current`);
  if (!source) throw new Error(`Missing grade-${grade}-current`);
  const ranked = uniqueWords(source.words).map((entry, index) => ({ entry, index, score: difficulty(entry) }))
    .sort((a, b) => a.score - b.score || a.index - b.index);
  for (const level of levels) {
    const count = level.key === 'high' ? ranked.length : Math.ceil(ranked.length * level.ratio);
    const chosen = ranked.slice(0, count).sort((a, b) => a.index - b.index).map(item => item.entry);
    generated.push({
      id: `grade-${grade}-${level.key}`,
      label: `${grade}학년 ${level.label} 수준`,
      kind: 'grade-tier-cumulative',
      grade,
      level: level.key,
      levelLabel: level.label,
      cumulative: true,
      sourcePackId: source.id,
      classification: 'deterministic-difficulty-draft-v1',
      wordCount: chosen.length,
      words: chosen
    });
  }
}
const generatedIds = new Set(generated.map(pack => pack.id));
catalog.packs = [...(catalog.packs || []).filter(pack => !generatedIds.has(pack.id)), ...generated];
catalog.tieredPackPolicy = {
  version: 1,
  grades: [3, 4, 5, 6],
  levels: ['low', 'mid', 'high'],
  cumulative: true,
  defaultLevel: 'mid',
  note: '하 ⊂ 중 ⊂ 상 누적 구조. 철자·구문 복잡도 기반 교사 검토용 초안입니다.'
};
await writeFile(url, JSON.stringify(catalog, null, 2) + '\n', 'utf8');
for (const pack of generated) console.log(`${pack.id}: ${pack.wordCount}`);