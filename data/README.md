# Curriculum vocabulary data

## Runtime catalog

- `word-packs.json` and `word-packs.js` are the runtime catalogs. They contain one shared 3,001-headword dictionary and 30 cumulative packs (`grade-3-low` through `grade-12-high`).
- The visible levels are inclusive: `low ⊂ mid ⊂ high`. Every pack also stores `supportWordCount`, which marks the previous stage available for adaptive review.
- App grade codes are 3-6 for elementary school, 7-9 for middle school, and 10-12 for high school.
- The spiral endpoints follow the 2022 revised curriculum limits: elementary cumulative 600, middle school 1,500, high-school common English 1,800, and the full basic-vocabulary list at the final high-school stage.
- Individual word-to-grade placement is an app-authored pedagogical sequence using the official marker group, CEFR/frequency hints, and the existing elementary placement draft. It is not a Ministry-issued word-by-grade assignment.

## Sources and review status

- `curriculum-3000-markers.json` is extracted from the basic-vocabulary table in the 2022 revised English curriculum: `*` elementary recommendation, `**` middle/high common-subject recommendation, and no marker for other high-school subjects.
- The curriculum declares 800 + 1,200 + 1,000 = 3,000 words. The table yields 801 + 1,200 + 1,000 = 3,001 unique headwords after headings and wrapped variants are removed. No word is deleted without documentary evidence; this discrepancy is recorded in generated metadata.
- `curriculum-3000-with-meanings.json` combines reviewed repository meanings, manual corrections, and openly licensed draft meanings. Entries with `meaningStatus: "draft"` remain teacher-review candidates.
- `elementary-800.json`, `curriculum-2022-placement.json`, and the older audit/review files remain provenance and review inputs. They are not loaded as separate student packs.

## Rebuilding

Run `npm run build:curriculum-vocabulary`. If the marker snapshot already exists, the generator can rebuild from committed data. To re-extract the PDF markers and refresh meanings, set:

- `CURRICULUM_PDF` to `[별책14] 영어과 교육과정.pdf`
- `OPEN_ENGLISH_KOREAN_DICT` to `open-english-korean-dict/dict/words.json`

See `data/CREDITS.md` for data licensing.
