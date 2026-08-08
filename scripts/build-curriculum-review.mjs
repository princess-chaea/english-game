import { readFile, writeFile } from 'node:fs/promises';

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
const wordKeys = (value) => String(value || '').toLocaleLowerCase('en-US').match(/[a-z]+(?:'[a-z]+)?/g) || [];

const [curriculum, elementary, packs] = await Promise.all([
  readJson('data/curriculum-3000.json'),
  readJson('data/elementary-800.json'),
  readJson('data/word-packs.json'),
]);

const elementaryByKey = new Map();
for (const entry of elementary.words) {
  for (const key of wordKeys(entry.word)) {
    if (!elementaryByKey.has(key)) elementaryByKey.set(key, entry);
  }
}

const currentGradesByKey = new Map();
for (const pack of packs.packs.filter((item) => item.kind === 'grade-core')) {
  for (const entry of pack.words) {
    for (const key of wordKeys(entry.word)) {
      const grades = currentGradesByKey.get(key) || new Set();
      grades.add(pack.grade);
      currentGradesByKey.set(key, grades);
    }
  }
}

const entries = curriculum.words.map((word) => {
  const key = wordKeys(word)[0] || word.toLocaleLowerCase('en-US');
  const currentGrades = [...(currentGradesByKey.get(key) || new Set())].sort((left, right) => left - right);
  const elementaryEntry = elementaryByKey.get(key);
  if (currentGrades.length) {
    return {
      word,
      status: 'existing-grade-list',
      evidenceGrades: currentGrades,
      suggestedGrade: currentGrades[0],
      elementary800: Boolean(elementaryEntry),
      meaning: elementaryEntry?.meaning || null,
      reviewRequired: true,
    };
  }
  if (elementaryEntry) {
    return {
      word,
      status: 'elementary-800-unplaced',
      evidenceGrades: [],
      suggestedGrade: null,
      elementary800: true,
      meaning: elementaryEntry.meaning,
      reviewRequired: true,
    };
  }
  return {
    word,
    status: 'needs-meaning-and-grade-review',
    evidenceGrades: [],
    suggestedGrade: null,
    elementary800: false,
    meaning: null,
    reviewRequired: true,
  };
});

const countByStatus = Object.fromEntries(['existing-grade-list', 'elementary-800-unplaced', 'needs-meaning-and-grade-review'].map((status) => [status, entries.filter((entry) => entry.status === status).length]));
const catalog = {
  schemaVersion: 1,
  source: 'education-ministry-required-3000.pdf extraction',
  generatedWith: 'scripts/build-curriculum-review.mjs',
  policy: 'This is a review catalog, not an official grade-level placement. Only an existing teacher-reviewed grade list can be used as current grade evidence.',
  scope: 'Grade 3-6 current app packs',
  totals: { sourceWordCount: entries.length, ...countByStatus },
  entries,
};

await writeFile('data/curriculum-3000-review-catalog.json', `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(catalog.totals));
