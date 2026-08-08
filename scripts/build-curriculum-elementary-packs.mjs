import { readFile, writeFile } from 'node:fs/promises';

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
const [placement, elementary, catalog] = await Promise.all([
  readJson('data/curriculum-2022-placement.json'),
  readJson('data/elementary-800.json'),
  readJson('data/word-packs.json'),
]);
const elementaryByWord = new Map(elementary.words.map((entry) => [entry.word.toLocaleLowerCase('en-US'), entry]));
const toEntries = (words) => words.map((word) => {
  const entry = elementaryByWord.get(word.toLocaleLowerCase('en-US'));
  if (!entry) throw new Error(`Missing elementary-800 entry: ${word}`);
  return entry;
});
const packDefinitions = [
  { id: 'curriculum-2022-grade-3', label: '2022 curriculum draft - Grade 3', grade: 3, band: '3-4', words: placement.grade3Foundation },
  { id: 'curriculum-2022-grade-4', label: '2022 curriculum draft - Grade 4 cumulative', grade: 4, band: '3-4', words: [...placement.grade3Foundation, ...placement.grade4Extension] },
  { id: 'curriculum-2022-grade-5', label: '2022 curriculum draft - Grade 5', grade: 5, band: '5-6', words: placement.grade5Foundation },
  { id: 'curriculum-2022-grade-6', label: '2022 curriculum draft - Grade 6 cumulative', grade: 6, band: '5-6', words: [...placement.grade5Foundation, ...placement.grade6Extension] },
];
const packs = packDefinitions.map((definition) => ({
  id: definition.id,
  label: definition.label,
  kind: 'curriculum-draft',
  grade: definition.grade,
  curriculumBand: definition.band,
  wordCount: definition.words.length,
  teacherReviewRequired: true,
  words: toEntries(definition.words),
}));
for (const pack of packs) {
  const unique = new Set(pack.words.map((entry) => entry.word.toLocaleLowerCase('en-US')));
  if (unique.size !== pack.wordCount) throw new Error(`Duplicate word in ${pack.id}`);
}
const output = {
  schemaVersion: 1,
  source: placement.source,
  policy: placement.policy,
  packs,
};
await writeFile('data/curriculum-2022-elementary-packs.json', `${JSON.stringify(output, null, 2)}\n`, 'utf8');
catalog.packs = [...catalog.packs.filter((pack) => !pack.id.startsWith('curriculum-2022-grade-')), ...packs];
catalog.curriculumDraft = {
  source: placement.source,
  policy: placement.policy,
  rebuiltWith: 'scripts/build-curriculum-elementary-packs.mjs',
};
await writeFile('data/word-packs.json', `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(packs.map((pack) => ({ id: pack.id, wordCount: pack.wordCount }))));
