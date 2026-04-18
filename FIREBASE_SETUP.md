# Firebase Setup Instructions

This project uses Firebase for:

- Mobile client authentication (anonymous by default)
- Firestore realtime data sync for session metrics
- Backend writes from Flask using Firebase Admin SDK

## 1) Create Firebase Project

1. Open Firebase Console.
2. Create a new project.
3. Enable Firestore (Production mode).
4. Enable Authentication -> Sign-in method -> Anonymous.

## 2) Configure Mobile App Credentials

Create `mobile-app/.env` from `mobile-app/.env.example` and set:

```env
EXPO_PUBLIC_API_BASE_URL=http://<your-lan-ip>:5000
EXPO_PUBLIC_FIREBASE_API_KEY=...
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=...
EXPO_PUBLIC_FIREBASE_PROJECT_ID=...
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=...
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
EXPO_PUBLIC_FIREBASE_APP_ID=...
```

How to get values:

1. Firebase Console -> Project settings -> General.
2. Add app -> Web app (for config object).
3. Copy config values into `.env`.

## 3) Configure Backend Admin Credentials

1. Firebase Console -> Project settings -> Service Accounts.
2. Click "Generate new private key".
3. Save JSON as `backend/firebase-service-account.json`.
4. Create `backend/.env` from `backend/.env.example` and set:

```env
FLASK_ENV=development
FLASK_DEBUG=true
HOST=0.0.0.0
PORT=5000
FIREBASE_PROJECT_ID=<your-project-id>
FIREBASE_CREDENTIALS_PATH=backend/firebase-service-account.json
```

If running backend from inside `backend` folder, use:

```env
FIREBASE_CREDENTIALS_PATH=firebase-service-account.json
```

## 4) Deploy Firestore Rules and Indexes

Install Firebase CLI:

```bash
npm install -g firebase-tools
```

Login and select project:

```bash
firebase login
copy firebase/.firebaserc.example .firebaserc
```

Update `.firebaserc` with your project id, then deploy:

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

## 5) Run Application

Backend:

```bash
cd backend
pip install -r requirements.txt
python run.py
```

Mobile:

```bash
cd mobile-app
npm install
npm run start
```

## 6) Verify End-to-End Realtime Flow

1. Start session in mobile app.
2. Walk for 15-30 seconds.
3. Check Firestore collection:
   - `sessions/{sessionId}`
   - `sessions/{sessionId}/frames/{timestamp}`
4. Confirm `latestMetrics` updates on each new batch.

## 7) Important Notes

- Do not commit private key JSON files.
- For production, replace anonymous auth with email/password or custom auth.
- Restrict Firestore `frames` writes to backend-only patterns when moving to production.
