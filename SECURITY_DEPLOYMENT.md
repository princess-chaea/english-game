# Secure deployment checklist

This version moves student records away from browser-accessible Firestore documents.

1. In Firebase Authentication, enable **Anonymous** and **Google** providers. Student accounts use Anonymous only; the separate teacher app instance accepts Google only.
2. Set `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, and a long random `CRON_SECRET` in Vercel Environment Variables. Do not put a service-account key in this repository or in browser code.
3. Deploy the Vercel app. The API routes require `firebase-admin` from `package.json`.
4. After the new app is live, deploy `firestore.rules` with `firebase deploy --only firestore:rules`. It blocks every direct client read/write except authenticated reads of the word list.
5. Keep the legacy `users` collection only for the one-time migration window. The first production cron run starts a 60-day countdown. Until then, legacy data is blocked by Firestore Rules; afterward `/api/cleanup-legacy` deletes legacy `users` documents and strips personal-data keys from old world-boss documents while preserving only their aggregate damage. The Vercel cron runs daily at 03:00 UTC; configure the same `CRON_SECRET` in Vercel.
6. Before publishing, test: new anonymous profile, first free rename, second 500-FP rename, legacy migration, student code join, manager code join, teacher school/class creation, class word-pack selection, student pack loading, and opt-in leaderboard.

7. Deploy the `data/word-packs.json` static file with the app. Do not replace its teacher-review pack with an automatically grade-assigned list: the source 800-word document has no official grade mapping.

## Privacy model

- `accounts/{anonymousUid}`: private game state, alias, optional class membership IDs.
- `leaderboard/{anonymousUid}`: opt-in public alias, score, stage, correct-count only.
- `classes/{classId}/members/{anonymousUid}`: alias and learning grade only; no real name, number, school search, or PIN.
- Legacy school/name/number/PIN are sent only to the server during migration and are never copied into `accounts`.

## Important release follow-up

Google login proves control of a Google account, not teacher employment. Before broad school release, add a district-admin approval workflow or allow-listed school domains. Also move quiz reward calculation fully server-side before making the global ranking competitive; the current API rate-limits impossible jumps, but client-originated game events are not full anti-cheat authority.
