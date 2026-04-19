# Smartphone Step and Movement Analysis System

Monorepo starter for a real-time movement analysis app using:

- React Native (Expo) + NativeWind for mobile UI and sensor capture
- Flask for signal processing and step/activity analytics
- Supabase (Postgres + Realtime-ready API) for persistence and multi-device visibility

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

1. Optional: verify Supabase connectivity:

```bash
python check_supabase_connection.py
```

Continuous check every 10 seconds:

```bash
python check_supabase_connection.py --watch --interval 10
```

Default API endpoint: `http://localhost:5000`

## 3) Realtime Data Flow

1. Mobile starts a session (`POST /api/session/start`).
2. Mobile streams sensor windows (`POST /api/ingest`).
3. Flask computes step count, cadence, interval, and activity state.
4. Flask writes metrics to Supabase.
5. Flask broadcasts each metrics frame over Socket.IO namespace `/metrics`.
6. PC dashboard subscribes with `sessionId` and renders live cards + trend chart.

## 4) PC Dashboard (Built-In)

The backend now serves a real-time dashboard page directly.

1. Start backend server (`python run.py`).
2. Open `http://localhost:5000/dashboard` on your PC browser.
3. Paste the active `Session ID` from mobile and press **Connect**.

Dashboard receives live updates from WebSocket events (`metrics`) and shows:

- Step count
- Cadence (spm)
- Step interval (ms)
- Intensity (%)
- Activity state (idle/walking/running)
- Rolling trend chart (cadence + intensity)

## 5) Notes

- This scaffold focuses on clean architecture and working data contracts.
- Step detection thresholds are intentionally simple and should be tuned per phone placement.
- Supabase writes are skipped if `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` are not configured.
