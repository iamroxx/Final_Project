from __future__ import annotations

import os
from threading import Lock
from typing import Any, Dict

import firebase_admin
from firebase_admin import credentials, firestore


_db = None
_init_lock = Lock()


def _init_firestore():
    global _db
    if _db is not None:
        return _db

    with _init_lock:
        if _db is not None:
            return _db

        cred_path = os.getenv("FIREBASE_CREDENTIALS_PATH", "").strip()
        if not cred_path or not os.path.exists(cred_path):
            return None

        if not firebase_admin._apps:
            cred = credentials.Certificate(cred_path)
            firebase_admin.initialize_app(cred)

        _db = firestore.client()
        return _db


def write_live_metrics(session_id: str, metrics: Dict[str, Any]) -> None:
    db = _init_firestore()
    if db is None:
        return

    session_ref = db.collection("sessions").document(session_id)
    frame_ref = session_ref.collection("frames").document(str(metrics["timestamp"]))

    frame_ref.set(metrics)
    session_ref.set(
        {
            "sessionId": session_id,
            "updatedAt": metrics["timestamp"],
            "latestMetrics": {
                "stepCountTotal": metrics.get("stepCountTotal", 0),
                "cadenceSpm": metrics.get("cadenceSpm", 0),
                "avgStepIntervalMs": metrics.get("avgStepIntervalMs", 0),
                "intensity": metrics.get("intensity", 0),
                "activityState": metrics.get("activityState", "idle"),
            },
        },
        merge=True,
    )
