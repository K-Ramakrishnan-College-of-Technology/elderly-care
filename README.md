# KinCare — Elderly Care & Medication Management Platform

KinCare is a collaborative healthcare management platform built to help elderly individuals manage daily medications, doctor appointments, and wellness check-ins while keeping family members and caretakers informed—without sacrificing the older adult's dignity or decision-making control.

## Key Capabilities

- **Senior-Centered Daily View**: High-contrast large-print schedule, browser Speech Synthesis read-aloud (`Read My Routine Aloud`), 1-tap medication completion, and voice-ready mood/side-effect check-ins.
- **Passcode-Gated Care Circles**: Zero-enumeration `Care Code` + 6-digit `Care Passcode` onboarding (`SHA-256` hashed tokens) allowing authorized family members and caretakers to collaborate safely across accounts and protect Caregiver editing on shared tablets.
- **Senior Autonomy & Consent Ledger**: Older adults can enable **Require My Approval** for caretaker medication proposals, grant or revoke `Can Edit Schedule` permissions, and pause member access in real time.
- **Proactive Email Reminder Engine**: Continuously evaluates upcoming doses (within 45m), missed doses (> 30m overdue), low pill supplies, and appointments (24h & 2h windows), delivering live SMTP emails via Nodemailer when configured or logging exportable `.eml` alerts in the Care Circle Outbox.
- **Server-Side Gemini AI Care Intelligence**:
  - **Prescription Label & Pill Bottle Scanner** (multimodal image/text extraction into schedule fields)
  - **Medication Safety & Plain-Language Guardian** (interaction considerations & gentle plain-language summaries)
  - **Doctor Visit Preparation Briefs** (synthesizes adherence logs, missed doses, and check-ins into a printable 1-page clinical brief)
  - **Smart Daily Care Briefing**

---

## Architecture & Security Highlights

- **Frontend**: React 19, TypeScript, Tailwind CSS v4, Firebase Auth (Google Federated Sign-In), Cloud Firestore real-time listeners.
- **Backend**: Express (`server.ts`) verifying Firebase ID tokens on all `/api/ai/*` and `/api/reminders/*` routes, Zod input validation, indirect prompt injection wrapping, and a resilient `@google/genai` fallback ladder.
- **Database Isolation**: Owner-bound and Care Circle membership-gated Firestore Security Rules (`firestore.rules`) with strict schema validation, PII isolation (`/users/{userId}/private/info`), and server-timestamp enforcement.

---

## 1. Prerequisites & Google Cloud Setup

Install the Google Cloud CLI (`gcloud`) and Firebase CLI, then authenticate and enable the required APIs:

```bash
gcloud auth login
gcloud config set project YOUR_PROJECT_ID

gcloud services enable \
  run.googleapis.com \
  secretmanager.googleapis.com \
  firestore.googleapis.com \
  cloudbuild.googleapis.com
```

---

## 2. Secret Manager Configuration

Store your `GEMINI_API_KEY` (and optional SMTP credentials for live email delivery) in Google Cloud Secret Manager—never hardcode keys in source code.

```bash
# Create and populate the Gemini API key secret
gcloud secrets create GEMINI_API_KEY --replication-policy="automatic"
echo -n "YOUR_API_KEY" | gcloud secrets versions add GEMINI_API_KEY --data-file=-

# Grant the default Cloud Run service account access to read the secret
gcloud secrets add-iam-policy-binding GEMINI_API_KEY \
  --member="serviceAccount:YOUR_PROJECT_NUMBER-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

*(Optional)* For live outbound SMTP email delivery in production, also create `SMTP_HOST`, `SMTP_USER`, and `SMTP_PASS` secrets in Secret Manager and mount them in Cloud Run.

---

## 3. Firestore Security Rules Configuration

Provision Cloud Firestore and deploy `firestore.rules`. The rules enforce user data isolation and Care Circle membership checks:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/interactions/{interactionId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

KinCare's complete production `firestore.rules` extends this isolation model across `/users/{userId}/private/{infoDoc}`, `/carePasses/{passToken}` (zero-enumeration), and `/careProfiles/{profileId}/*` subcollections. Deploy rules with:

```bash
firebase deploy --only firestore:rules
```

---

## 4. Local Development

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy `.env.example` to `.env` and set `GEMINI_API_KEY` (and optional SMTP variables).
3. Start the unified Express + Vite server on port `3000`:
   ```bash
   npm run dev
   ```

---

## 5. Automated Testing & Verification

Run the automated test suite (unit tests for Care Passcode cryptography, payload sanitization, proactive reminder engine, Express API security/auth guards, and React component accessibility) and Firestore security rules linter:

```bash
npm test
npm run test:rules
npm run lint
```

### End-to-End Functional Walkthrough Checklist
1. **Authentication & Onboarding**: Sign in with Google (`Sign in with Google`), create a care profile with a 6-digit Care Passcode, and confirm a unique `KIN-XXXX` Care Code is generated.
2. **Passcode-Gated Collaboration**: Sign in as a second member, select **Join with Passcode**, enter the `KIN-XXXX` code and 6-digit passcode, and verify shared access without exposing unjoined profiles.
3. **Senior Autonomy & Daily Routine**: Open **Senior Care View**, toggle **Text Size: Large/Standard**, click **Read My Routine Aloud**, log a medication via **I Took This**, and verify supply decrements automatically.
4. **Approval Queue**: With **Require Elderly Approval** enabled, propose a new medication from Care Circle View and confirm it waits in Senior Mode's **Changes Waiting for Your Approval** queue until approved.
5. **Proactive Email Alerts & AI Tools**: Trigger **Scan & Send Due Alerts**, verify alerts log cleanly to **Dispatched Email History** (`.eml` exportable), and run **AI Interaction Check** / **AI Visit Prep Brief**.

---

## 6. Cloud Run Deployment

Build the production client bundle and deploy to Google Cloud Run with Secret Manager bindings:

```bash
npm run build

gcloud run deploy kincare-platform \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --set-secrets="GEMINI_API_KEY=GEMINI_API_KEY:latest" \
  --set-env-vars="NODE_ENV=production"
```

---

## 7. Campaign Verification Labeling

Apply the required campaign resource label to your deployed Cloud Run service for automated verification:

```bash
gcloud run services update <SERVICE_NAME> \
  --update-labels=dev-tutorial=cloud-run-ai-challenge \
  --region=<REGION>
```
