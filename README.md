# Nursing Prep

A nursing exam-preparation app with a public landing page, Firebase email/password authentication, university and academic-level onboarding, Paystack one-time checkout, a Firestore-backed question bank, and account-level progress tracking.

## Product flow

1. Visitors learn about Nursing Prep and create an account or log in.
2. Sign-up collects the student's university and academic level.
3. New accounts remain pending until the server verifies a successful Paystack payment.
4. The dashboard, question bank, and progress history are available only to paid accounts.

Wellspring University is the initial university option. Levels 200, 300, and 400 can be selected. The current question set is assigned to 300 level; 200- and 400-level dashboards will show no questions until those banks are added.

The current bank contains 300 questions (150 medium and 150 hard; 210 written response and 90 multiple choice). Written-response scoring currently requires an exact answer after basic text normalization.

## Requirements

- Node.js 20.12 or newer
- A Firebase project with Email/Password Authentication and Cloud Firestore enabled
- Firebase Admin Application Default Credentials for the server
- Paystack test-mode credentials

## Configure Firebase and Paystack

1. Copy `.env.example` to `.env`.
2. Set `FIREBASE_PROJECT_ID`, `FIREBASE_WEB_API_KEY`, `FIREBASE_AUTH_DOMAIN`, and `FIREBASE_APP_ID` from the Firebase web app settings. `FIREBASE_STORAGE_BUCKET`, `FIREBASE_MESSAGING_SENDER_ID`, and `FIREBASE_MEASUREMENT_ID` are optional and can also be copied from that config.
3. Configure Google Application Default Credentials for the server (for local development, set `GOOGLE_APPLICATION_CREDENTIALS` to the service-account JSON file path). Never commit the service-account file or `.env`.
4. Set `PAYSTACK_SECRET_KEY` to a test secret beginning with `sk_test_`. Live keys are intentionally rejected by this initial integration.
5. Set `PAYSTACK_AMOUNT_MINOR` to the agreed one-time fee in Paystack's minor currency unit, and confirm `PAYSTACK_CURRENCY` before accepting payments. The fee is currently undecided; checkout stays disabled until an amount is configured.
6. Set `APP_BASE_URL` to the exact HTTPS site origin when deployed. Add the deployed hostname to Firebase Authentication's authorized domains.

The browser Firebase configuration contains public Firebase app identifiers, not service-account credentials or Paystack secrets. The Paystack secret is only read by the server.

## Seed Firestore questions

Install dependencies and seed the existing 300-level question bank:

```powershell
npm install
npm run seed:questions
```

The seeder writes the question documents to Firestore's `questions` collection with `academicLevel: "300"` and `published: true`. It is safe to rerun to refresh those seeded documents. The app reads questions from Firestore at runtime; `data/questions.js` is retained only as the initial seed source. Firestore client access is denied by `firestore.rules`; the trusted server uses Firebase Admin after verifying each Firebase ID token.

## Run locally

```powershell
npm start
```

Open `http://127.0.0.1:3000`. If a configuration step is incomplete, the landing page remains available and account/payment actions report that setup is required rather than granting access.

## Payment verification

The server initializes Paystack transactions and verifies the returned reference directly with Paystack before setting a user's membership to active. It also accepts signed `charge.success` webhooks at `/api/payments/webhook`; configure that endpoint in the Paystack dashboard. A browser redirect alone never unlocks the dashboard.

## Included features

- Public product landing page with call-to-action links and current product details
- Login, account creation, password reset, and university/level onboarding
- Pending-access checkout screen with Paystack test-mode initialization
- Firestore question filtering by academic level, difficulty, and topic
- Account-scoped exam submissions, recent sessions, and progress totals
- Timed and untimed exams, answer feedback, question navigation, and result review

This app is for study and practice only. Check current evidence, local law, and clinical protocols before applying material to patient care.
