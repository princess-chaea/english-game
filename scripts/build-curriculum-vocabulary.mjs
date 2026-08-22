import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const DATA = path.join(ROOT, 'data');
const RAW_HEADWORDS = path.join(DATA, 'curriculum-3000.json');
const MARKER_SNAPSHOT = path.join(DATA, 'curriculum-3000-markers.json');
const OUTPUT_VOCABULARY = path.join(DATA, 'curriculum-3000-with-meanings.json');
const OUTPUT_PACKS_JSON = path.join(DATA, 'word-packs.json');
const OUTPUT_PACKS_JS = path.join(DATA, 'word-packs.js');

const DECLARED_COUNTS = { elementary: 800, middleHighCommon: 1200, highOther: 1000, total: 3000 };
const GRADE_LIMITS = {
  3: { low: 50, mid: 100, high: 150 },
  4: { low: 200, mid: 250, high: 300 },
  5: { low: 350, mid: 400, high: 450 },
  6: { low: 500, mid: 550, high: 600 },
  7: { low: 700, mid: 800, high: 900 },
  8: { low: 1000, mid: 1100, high: 1200 },
  9: { low: 1300, mid: 1400, high: 1500 },
  10: { low: 1600, mid: 1700, high: 1800 },
  11: { low: 1934, mid: 2067, high: 2200 },
  12: { low: 2467, mid: 2734, high: 3001 }
};
const LEVEL_LABELS = { low: '하', mid: '중', high: '상' };
const CEFR_ORDER = new Map(['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map((value, index) => [value, index]));
const PLACEMENT_KEYS = [
  ['grade3Foundation', 3],
  ['grade4Extension', 4],
  ['grade5Foundation', 5],
  ['grade6Extension', 6]
];

const MANUAL_MEANINGS = {
  a: '하나의, 어떤',
  i: '나',
  one: '하나, 한',
  two: '둘',
  three: '셋',
  four: '넷',
  five: '다섯',
  six: '여섯',
  seven: '일곱',
  eight: '여덟',
  nine: '아홉',
  ten: '열',
  thirteen: '열셋',
  could: '~할 수 있었다, ~일 수도 있다',
  life: '삶, 생명',
  thing: '것, 물건',
  should: '~해야 한다',
  form: '형태, 형식; 만들다',
  mind: '마음, 생각; 꺼리다',
  sale: '판매, 할인 판매',
  type: '종류, 유형; 타이핑하다',
  add: '더하다, 추가하다',
  wish: '바라다, 소원',
  save: '구하다, 절약하다, 저장하다',
  wife: '아내',
  program: '프로그램, 계획',
  guy: '남자, 사람',
  file: '파일, 서류철',
  goal: '목표, 골',
  check: '확인하다, 점검하다',
  design: '설계하다, 디자인',
  nothing: '아무것도 없음',
  worry: '걱정하다, 걱정',
  fan: '부채, 팬',
  discuss: '토론하다, 의논하다',
  kiss: '입맞추다, 키스',
  memory: '기억',
  college: '대학',
  husband: '남편',
  mouse: '쥐',
  habit: '습관',
  collect: '모으다, 수집하다',
  ugly: '못생긴',
  lazy: '게으른',
  partner: '동료, 짝',
  football: '축구',
  jacket: '재킷, 웃옷',
  newspaper: '신문',
  potato: '감자',
  clever: '영리한, 똑똑한',
  bee: '벌, 꿀벌',
  pizza: '피자',
  prince: '왕자',
  shy: '수줍어하는',
  chocolate: '초콜릿',
  grandfather: '할아버지',
  part: '부분, 역할',
  area: '지역, 영역',
  might: '~일지도 모른다',
  cost: '비용; 비용이 들다',
  company: '회사, 함께 있음',
  issue: '문제, 쟁점',
  during: '~동안',
  power: '힘, 권력',
  clear: '명확한, 맑은',
  member: '구성원, 회원',
  however: '그러나',
  against: '~에 반대하여, ~에 맞서',
  human: '인간, 인간의',
  staff: '직원들, 지팡이',
  death: '죽음',
  fail: '실패하다',
  voice: '목소리',
  control: '통제하다, 조절하다',
  court: '법정, 경기장',
  image: '이미지, 모습',
  couple: '둘, 한 쌍',
  enter: '들어가다, 입력하다',
  heat: '열, 뜨겁게 하다',
  certain: '확실한, 어떤',
  style: '방식, 스타일',
  wine: '포도주',
  track: '길, 트랙; 추적하다',
  advertize: '광고하다',
  aggress: '공격하다',
  amuse: '즐겁게 하다',
  astonish: '깜짝 놀라게 하다',
  carve: '새기다, 조각하다',
  compel: '강요하다',
  comprehend: '이해하다',
  destruct: '파괴하다',
  drown: '익사하다, 물에 빠뜨리다',
  environ: '둘러싸다',
  especial: '특별한',
  ethic: '윤리, 도덕 원칙',
  frown: '눈살을 찌푸리다',
  illude: '속이다',
  irritate: '짜증 나게 하다',
  livingroom: '거실',
  narrate: '이야기하다, 서술하다',
  offend: '불쾌하게 하다, 위반하다',
  outrage: '격분시키다, 격분',
  oversea: '해외의',
  pave: '포장하다',
  'twenty-first': '스물한 번째의',
  'twenty-second': '스물두 번째의',
  'twenty-third': '스물세 번째의',
  mean: '의미하다, 평균의',
  object: '물체, 대상; 반대하다',
  subject: '주제, 과목, 대상',
  present: '현재의, 선물; 제시하다',
  record: '기록, 기록하다',
  minute: '분, 잠깐; 매우 작은'
};

function normalizeWord(value) {
  const word = String(value || '').trim().toLowerCase();
  if (word === 'a. an' || word === 'a/an') return 'a';
  return word;
}

async function readJson(filePath, fallback = null) {
  if (!existsSync(filePath)) return fallback;
  return JSON.parse(await readFile(filePath, 'utf8'));
}

function gradeLabel(grade) {
  if (grade <= 6) return `초등 ${grade}학년`;
  if (grade <= 9) return `중학교 ${grade - 6}학년`;
  return `고등학교 ${grade - 9}학년`;
}

function recommendation(marker) {
  if (marker === '*') return { group: 'elementary', label: '초등학교 권장' };
  if (marker === '**') return { group: 'middle-high-common', label: '중·고등학교 공통과목 권장' };
  return { group: 'high-other', label: '고등학교 기타 과목 권장' };
}

async function loadPdfJs() {
  if (process.env.CURRICULUM_PDFJS_MODULE_URL) {
    return import(process.env.CURRICULUM_PDFJS_MODULE_URL);
  }
  try {
    return await import('pdfjs-dist/legacy/build/pdf.mjs');
  } catch (error) {
    throw new Error('pdfjs-dist를 찾지 못했습니다. npm install 후 다시 실행하거나 CURRICULUM_PDFJS_MODULE_URL을 지정하세요.', { cause: error });
  }
}

async function extractMarkerRows(pdfPath) {
  const pdfjs = await loadPdfJs();
  const data = new Uint8Array(await readFile(pdfPath));
  const pdf = await pdfjs.getDocument({ data }).promise;
  const rawHeadwords = await readJson(RAW_HEADWORDS, { words: [] });
  const canonicalWords = rawHeadwords.words
    .map(normalizeWord)
    .filter((word) => word && (!/^[a-z]$/.test(word) || word === 'a' || word === 'i'));
  const canonicalSet = new Set(canonicalWords);
  const extracted = new Map();
  const seen = new Set();

  for (let pageNumber = 264; pageNumber <= 296; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    for (const item of content.items) {
      const text = String(item.str || '').trim();
      if (!text || /^[A-Z]$/.test(text)) continue;
      const match = text.match(/^([a-z][a-z'-]*)(\*\*|\*)?/);
      if (!match) continue;
      const word = normalizeWord(match[1]);
      if (!word || !canonicalSet.has(word) || seen.has(word)) continue;
      seen.add(word);
      extracted.set(word, match[2] || '');
    }
  }
  // 대문자 I는 알파벳 구획 제목과 모양이 같아 PDF 텍스트만으로 구별되지 않는다.
  extracted.set('i', '*');
  return canonicalWords.map((word) => ({ word, marker: extracted.get(word) ?? '' }));
}

async function markerRows() {
  const pdfPath = process.env.CURRICULUM_PDF;
  if (pdfPath) {
    const rows = await extractMarkerRows(pdfPath);
    await writeFile(MARKER_SNAPSHOT, `${JSON.stringify({
      schemaVersion: 1,
      source: '2022 개정 영어과 교육과정 별책 14, 기본 어휘 목록',
      declaredCounts: DECLARED_COUNTS,
      extractedHeadwordCount: rows.length,
      words: rows
    }, null, 2)}\n`, 'utf8');
    return rows;
  }
  const snapshot = await readJson(MARKER_SNAPSHOT);
  if (!snapshot?.words?.length) {
    throw new Error('CURRICULUM_PDF 환경변수 또는 data/curriculum-3000-markers.json이 필요합니다.');
  }
  return snapshot.words;
}

function collectRepositoryMeanings(elementary, oldCatalog, previousVocabulary) {
  const meanings = new Map();
  const add = (word, meaning, source) => {
    const key = normalizeWord(word);
    const value = String(meaning || '').trim();
    if (key && value && !meanings.has(key)) meanings.set(key, { meaning: value, source });
  };
  for (const entry of elementary?.words || []) add(entry.word, entry.meaning, 'elementary-800-reviewed');
  for (const pack of oldCatalog?.packs || []) {
    for (const entry of pack.words || []) add(entry.word, entry.meaning, 'repository-reviewed');
  }
  for (const entry of previousVocabulary?.words || []) add(entry.word, entry.meaning, entry.meaningSource || 'previous-generated');
  return meanings;
}

function difficultyScore(entry) {
  const cefr = CEFR_ORDER.has(entry.cefr) ? CEFR_ORDER.get(entry.cefr) : 3;
  const frequency = Number.isFinite(entry.frequencyRank) ? Math.log10(Math.max(10, entry.frequencyRank)) : 5;
  const surface = Math.max(0, entry.word.length - 4) * 0.12 + (entry.word.match(/[^aeiou]/g)?.length || 0) * 0.025;
  return cefr * 10 + frequency + surface;
}

function sortByDifficulty(entries) {
  return [...entries].sort((a, b) => difficultyScore(a) - difficultyScore(b) || a.word.localeCompare(b.word));
}

function elementaryProgression(entries, placement) {
  const starEntries = entries.filter((entry) => entry.marker === '*');
  const starByWord = new Map(starEntries.map((entry) => [entry.word, entry]));
  const hints = new Map();
  for (const [key, grade] of PLACEMENT_KEYS) {
    for (const rawWord of placement?.[key] || []) {
      const word = normalizeWord(rawWord);
      if (starByWord.has(word) && !hints.has(word)) hints.set(word, grade);
    }
  }

  const unused = new Set(starEntries.map((entry) => entry.word));
  const spill = new Map([[3, []], [4, []], [5, []], [6, []]]);
  const result = [];
  for (const grade of [3, 4, 5, 6]) {
    const hinted = sortByDifficulty(starEntries.filter((entry) => hints.get(entry.word) === grade && unused.has(entry.word)));
    const candidates = sortByDifficulty([
      ...(spill.get(grade) || []),
      ...hinted,
      ...starEntries.filter((entry) => !hints.has(entry.word) && unused.has(entry.word))
    ].filter((entry, index, all) => all.findIndex((other) => other.word === entry.word) === index));
    const selected = candidates.slice(0, 150);
    selected.forEach((entry) => unused.delete(entry.word));
    result.push(...selected);
    if (grade < 6) spill.set(grade + 1, hinted.filter((entry) => unused.has(entry.word)));
  }

  const enrichment = sortByDifficulty(starEntries.filter((entry) => unused.has(entry.word)));
  return [...result, ...enrichment];
}

function introducedAt(rank) {
  for (const [gradeText, limits] of Object.entries(GRADE_LIMITS)) {
    const grade = Number(gradeText);
    for (const level of ['low', 'mid', 'high']) {
      if (rank <= limits[level]) return { grade, level };
    }
  }
  return { grade: 12, level: 'high' };
}

function validateMarkerCounts(rows) {
  const counts = rows.reduce((sum, row) => {
    if (row.marker === '*') sum.elementary += 1;
    else if (row.marker === '**') sum.middleHighCommon += 1;
    else sum.highOther += 1;
    return sum;
  }, { elementary: 0, middleHighCommon: 0, highOther: 0 });
  if (counts.middleHighCommon !== 1200 || counts.highOther !== 1000 || ![800, 801].includes(counts.elementary)) {
    throw new Error(`별표 추출 수가 예상 범위를 벗어났습니다: ${JSON.stringify(counts)}`);
  }
  return counts;
}

const rows = await markerRows();
const markerCounts = validateMarkerCounts(rows);
const [elementary, oldCatalog, placement, previousVocabulary] = await Promise.all([
  readJson(path.join(DATA, 'elementary-800.json'), { words: [] }),
  readJson(OUTPUT_PACKS_JSON, { packs: [] }),
  readJson(path.join(DATA, 'curriculum-2022-placement.json'), {}),
  readJson(OUTPUT_VOCABULARY, { words: [] })
]);
const repositoryMeanings = collectRepositoryMeanings(elementary, oldCatalog, previousVocabulary);
const previousByWord = new Map((previousVocabulary.words || []).map((entry) => [normalizeWord(entry.word), entry]));

let openDictionary = {};
const dictionaryPath = process.env.OPEN_ENGLISH_KOREAN_DICT;
if (dictionaryPath && existsSync(dictionaryPath)) openDictionary = await readJson(dictionaryPath, {});

const vocabulary = rows.map(({ word, marker }) => {
  const manual = MANUAL_MEANINGS[word];
  const repository = repositoryMeanings.get(word);
  const previous = previousByWord.get(word) || {};
  const dictionary = openDictionary[word] || {};
  const meaning = manual || repository?.meaning || dictionary.meaning_ko || '';
  if (!meaning) throw new Error(`한국어 뜻이 없습니다: ${word}`);
  const meaningSource = manual ? 'manual-reviewed' : repository?.source || 'open-english-korean-dict';
  const meaningStatus = meaningSource === 'open-english-korean-dict' ? 'draft' : 'reviewed';
  const recommendationInfo = recommendation(marker);
  return {
    word,
    meaning,
    marker,
    recommendationGroup: recommendationInfo.group,
    recommendationLabel: recommendationInfo.label,
    meaningStatus,
    meaningSource,
    cefr: dictionary.cefr || previous.cefr || null,
    frequencyRank: Number.isFinite(dictionary.freq_rank) ? dictionary.freq_rank : Number.isFinite(previous.frequencyRank) ? previous.frequencyRank : null,
    ipa: dictionary.ipa || previous.ipa || null,
    partOfSpeech: dictionary.pos || previous.partOfSpeech || null
  };
});

const elementaryWords = elementaryProgression(vocabulary, placement);
const commonWords = sortByDifficulty(vocabulary.filter((entry) => entry.marker === '**'));
const highWords = sortByDifficulty(vocabulary.filter((entry) => !entry.marker));
const ordered = [...elementaryWords, ...commonWords, ...highWords];
if (new Set(ordered.map((entry) => entry.word)).size !== vocabulary.length) {
  throw new Error('나선형 어휘 순서에 중복 또는 누락이 있습니다.');
}

const orderedWords = ordered.map((entry, index) => {
  const spiralRank = index + 1;
  const introduced = introducedAt(spiralRank);
  return { ...entry, spiralRank, introducedGrade: introduced.grade, introducedLevel: introduced.level };
});
const wordByKey = Object.fromEntries(orderedWords.map((entry) => [entry.word, entry]));
const packs = [];
for (const grade of Object.keys(GRADE_LIMITS).map(Number)) {
  const limits = GRADE_LIMITS[grade];
  const previousGradeHigh = grade === 3 ? 0 : GRADE_LIMITS[grade - 1].high;
  for (const level of ['low', 'mid', 'high']) {
    const wordCount = Math.min(limits[level], orderedWords.length);
    const priorLevelCount = level === 'low'
      ? previousGradeHigh
      : limits[level === 'mid' ? 'low' : 'mid'];
    const packWords = orderedWords.slice(0, wordCount);
    packs.push({
      id: `grade-${grade}-${level}`,
      label: `${gradeLabel(grade)} ${LEVEL_LABELS[level]} · 누적 ${wordCount}단어`,
      kind: 'curriculum-spiral',
      grade,
      gradeLabel: gradeLabel(grade),
      schoolLevel: grade <= 6 ? 'elementary' : grade <= 9 ? 'middle' : 'high',
      level,
      levelLabel: LEVEL_LABELS[level],
      cumulative: true,
      wordCount,
      supportWordCount: Math.min(priorLevelCount, wordCount),
      targetWordCount: wordCount - Math.min(priorLevelCount, wordCount),
      curriculumEndpoint: grade === 6 && level === 'high'
        ? '초등학교 3~6학년 누계 600단어 이내'
        : grade === 9 && level === 'high'
          ? '중학교 1~3학년 1,500단어 이내'
          : grade === 10 && level === 'high'
            ? '고등학교 공통영어 1·2 1,800단어 이내'
            : grade === 12 && level === 'high'
              ? '영어과 기본 어휘 목록 전체'
              : null,
      teacherReviewRequired: packWords.some((entry) => entry.meaningStatus === 'draft'),
      wordKeys: packWords.map((entry) => entry.word)
    });
  }
}

const discrepancy = rows.length === DECLARED_COUNTS.total ? null : {
  declaredTotal: DECLARED_COUNTS.total,
  extractedHeadwordCount: rows.length,
  note: 'PDF 본문은 800+1200+1000=3000개로 안내하지만 표에서 중복 제거 후 추출되는 표제어는 3001개입니다. 근거 없이 한 단어를 삭제하지 않고 모두 보존했습니다.'
};
const vocabularyOutput = {
  schemaVersion: 1,
  source: '교육부 고시 제2022-33호 [별책 14] 영어과 교육과정 기본 어휘 목록',
  declaredCounts: DECLARED_COUNTS,
  extractedCounts: { ...markerCounts, total: rows.length },
  sourceDiscrepancy: discrepancy,
  meaningPolicy: {
    reviewed: '기존 초등 필수 어휘·프로젝트 검토값 또는 수동 보정',
    draft: '공개 영한사전 초안이며 교사 검토 대상',
    license: 'open-english-korean-dict 파생 뜻 데이터는 CC BY-SA 4.0'
  },
  words: orderedWords
};
const packOutput = {
  schemaVersion: 3,
  generatedFrom: 'data/curriculum-3000-with-meanings.json',
  curriculumBasis: {
    document: '2022 개정 영어과 교육과정 [별책 14]',
    officialMarkerPolicy: '* 초등 권장, ** 중·고 공통과목 권장, 무표 고등 기타 과목 권장',
    appPlacementPolicy: '교육과정의 학년군 어휘 수 상한을 기준으로 난이도·빈도·기존 초등 배치 힌트를 결합한 앱 내부 나선형 배열',
    inclusiveLevels: '하 ⊂ 중 ⊂ 상'
  },
  sourceDiscrepancy: discrepancy,
  adaptivePolicy: {
    scope: '선택한 누적 단어팩 내부',
    supportWordCount: '각 팩의 이전 단계까지 누적된 복습 후보 수',
    resolved: { streak: 3, accuracy: 80 },
    supportMode: { minTries: 8, accuracyBelow: 75, unresolvedCount: 3, unresolvedWrongTotal: 4 },
    targetRatios: {
      normal: { unresolved: 20, review: 20, current: 60 },
      support: { unresolved: 55, review: 30, current: 15 }
    },
    note: '오답·미숙달과 이전 단계 단어를 선택 팩 안에서 우선 출제할 수 있도록 spiralRank를 제공합니다.'
  },
  words: orderedWords,
  packs
};

await Promise.all([
  writeFile(OUTPUT_VOCABULARY, `${JSON.stringify(vocabularyOutput, null, 2)}\n`, 'utf8'),
  writeFile(OUTPUT_PACKS_JSON, `${JSON.stringify(packOutput, null, 2)}\n`, 'utf8'),
  writeFile(OUTPUT_PACKS_JS, `export default ${JSON.stringify(packOutput)};\n`, 'utf8')
]);

console.log(JSON.stringify({
  words: orderedWords.length,
  markerCounts,
  reviewedMeanings: orderedWords.filter((entry) => entry.meaningStatus === 'reviewed').length,
  draftMeanings: orderedWords.filter((entry) => entry.meaningStatus === 'draft').length,
  packs: packs.length,
  elementaryCore: GRADE_LIMITS[6].high,
  middleEndpoint: GRADE_LIMITS[9].high,
  highEndpoint: GRADE_LIMITS[12].high
}, null, 2));
