# Authentication and deployment runbook

## What is already prepared

- Student sign-in starts with Firebase Anonymous Authentication. A student may optionally link Google to that same Firebase UID for cross-device recovery; the game database stores no Google email.
- Teacher sign-in uses a separate Firebase Auth instance and Google only. The server verifies the ID token, Google provider, verified email, and (when configured) an approved email domain.
- Browser Firestore access is denied except for authenticated reads of `game_data/words`. Accounts, classes, invitations, and leaderboard writes go through the server API.
- `.firebaserc` pins this repository to `vocahero-1876a`; `npm run check:release` checks that release files exist and that required secrets have been supplied.

This repository is prepared but not deployed. Console sign-in, service-account key generation, and adding Vercel secrets must be completed by a project owner. Never send a private key in chat or commit it to Git.


## Student recovery and logout

- A new student starts anonymously and resumes automatically only in the same browser profile while browser storage remains.
- The Settings account button can link Google with `linkWithPopup`. Firebase keeps the same UID, so the existing `accounts/{uid}` game record remains in place; email is not written to Firestore.
- A Google-linked student can sign out and use **Continue with saved Google account** on another device. A guest account does not perform a destructive Firebase sign-out; it shows a protection reminder instead.
- A former legacy record that already stored `linkedGoogleUid` can be migrated after Google sign-in through **Import former Google-linked record**. The server compares only the authenticated UID and does not copy the old real-name, school, student-number, or PIN fields.

## 1. Firebase Authentication

1. Open Firebase Console for `vocahero-1876a` with a project-owner account.
2. Go to **Authentication > Sign-in method**.
3. Enable **Anonymous**. It is the student account provider.
4. Enable **Google**, select a support email, and save. It is the teacher-only provider.
5. In **Authentication > Settings > Authorized domains**, add the final custom domain and Vercel production host. `localhost` is sufficient only for local testing.
6. Do **not** turn on Firebase Identity Platform anonymous-account automatic cleanup. That feature deletes anonymous accounts after 30 days, which conflicts with retained student game accounts and the 60-day legacy-document migration policy.

Reference: [Firebase Anonymous Auth](https://firebase.google.com/docs/auth/web/anonymous-auth) and [Firebase Google Sign-In](https://firebase.google.com/docs/auth/web/google-signin).

## 2. Teacher access gate

Any verified Google account, including a personal Gmail account, may open the teacher portal and submit a verification request. Google login by itself never grants guild-management access.

Guild creation, school guild discovery, member data, trials, and manager participation remain server-locked until the employment-certificate workflow sets the teacher document to `verificationStatus=verified`. Keep `TEACHER_REVIEWER_EMAILS` limited to the administrator accounts that may review ambiguous certificates.

## 3. Firebase Admin credentials

1. Firebase Console > Project settings > **Service accounts**.
2. Generate a new private key once and store the downloaded JSON in a secure password manager or encrypted vault. Do not keep it in this repository.
3. In the JSON, copy `project_id`, `client_email`, and `private_key` into Vercel as `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, and `FIREBASE_PRIVATE_KEY`.
4. Keep the private key's line breaks. The server accepts either actual line breaks or the escaped `\\n` form used by Vercel fields.
5. Generate a random `CRON_SECRET` of at least 16 characters. The scheduled legacy cleanup endpoint rejects callers without this secret.

The Firebase Admin SDK is a privileged server credential; it bypasses client Firestore rules, so it must exist only in server environment variables. Reference: [Firebase Admin SDK setup](https://firebase.google.com/docs/admin/setup).

## 4. Deploy Firestore rules

From this project directory, after authenticating the Firebase CLI with the owner account:

```powershell
firebase login
firebase deploy --only firestore:rules
```

The deployed rules deny all direct browser access to personal data. Test in the Firestore Rules simulator that unauthenticated and ordinary authenticated users cannot read `accounts`, `classes`, `classInvites`, `leaderboard`, or legacy `users`. Authenticated reads of `game_data/words` are the sole exception.

Reference: [Firestore Security Rules deployment](https://firebase.google.com/docs/firestore/security/get-started).

## 5. Deploy to Vercel

1. Create/link the Vercel project to this repository.
2. In **Project Settings > Environment Variables**, add these values to **Production**:
   - `FIREBASE_PROJECT_ID`
   - `FIREBASE_CLIENT_EMAIL`
   - `FIREBASE_PRIVATE_KEY`
   - `CRON_SECRET`
   - `LEGACY_MIGRATION_RETENTION_DAYS=60`
3. Use a separate Firebase project for Preview if preview deployments will be externally reachable. Do not point unprotected experiments at production student data.
4. Deploy. `vercel.json` supplies the security headers and daily `/api/cleanup-legacy` cron schedule.
5. Confirm the Cron Jobs screen lists the cleanup job. Vercel automatically sends `Authorization: Bearer <CRON_SECRET>` when `CRON_SECRET` is configured.

Reference: [Vercel environment variables](https://vercel.com/docs/environment-variables) and [Vercel Cron security](https://vercel.com/docs/cron-jobs/manage-cron-jobs).

## 6. Release checks

Run locally with non-secret configuration available:

```powershell
npm run check
npm run build:curriculum-review
npm run check:release
```

Then test in a private/incognito browser session:

1. Student: anonymous profile creation, optional class-code join, global-ranking opt-in, first nickname change free, then a 500-FP rename.
2. Teacher: Google sign-in, school/class creation, co-manager code, student code, and word-pack change.
3. Student again: after page reload, confirm the assigned class pack is used; confirm the normal grade pack remains the fallback.
4. Migration: import one non-production legacy record, verify that the new `accounts` document contains no real name, school, student number, or PIN.
5. Cleanup: invoke `/api/cleanup-legacy` only with the cron Authorization header in a non-production project. Its first authorized run starts the 60-day grace period; confirm its `pending: true` response before the deadline and that it later removes legacy users and old world-boss personal-data keys.

## 7. Curriculum data policy

`data/curriculum-3000-review-catalog.json` is a review catalog only. It labels words already found in Grade 3-6 current packs, elementary-800 words without a grade placement, and words lacking both a Korean meaning and a grade placement. Do not publish the 3,000-word list as an elementary quiz/skill pack until a teacher reviews meanings, age suitability, unit/context, and grade placement.
