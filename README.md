# Smartphone Step and Movement Analysis System

Monorepo starter for a real-time movement analysis app using:

- React Native (Expo) + NativeWind for mobile UI and sensor capture
- Flask for signal processing and step/activity analytics
- Firebase (Auth + Firestore) for real-time persistence and multi-device visibility

## Repository Structure

```text
Final_Projct/
  mobile-app/        # React Native app (Expo + NativeWind)
  backend/           # Flask API + processing pipeline
  shared/            # JSON schemas and shared constants
```

## 1) Mobile App Setup

1. Open a terminal in `mobile-app`.
2. Install dependencies:

```bash
npm install
```

1. Copy `.env.example` to `.env` and fill values.
2. Start the app:

```bash
npm run start
```

## 2) Backend Setup

1. Open a terminal in `backend`.
2. Create and activate a Python virtual environment.
3. Install dependencies:

```bash
pip install -r requirements.txt
```

1. Copy `.env.example` to `.env` and fill values.
2. Run the server:

```bash
python run.py
```

1. Optional: verify Firebase connectivity:

```bash
python check_firebase_connection.py
```

Continuous check every 10 seconds:

```bash
python check_firebase_connection.py --watch --interval 10
```

Default API endpoint: `http://localhost:5000`

## 3) Realtime Data Flow

1. Mobile starts a session (`POST /api/session/start`).
2. Mobile streams sensor windows (`POST /api/ingest`).
3. Flask computes step count, cadence, interval, and activity state.
4. Flask writes metrics to Firestore.
5. Any connected client can observe updates from Firestore in realtime.

## 4) Notes

- This scaffold focuses on clean architecture and working data contracts.
- Step detection thresholds are intentionally simple and should be tuned per phone placement.
- Firebase writes are no-op if admin credentials are not configured.
