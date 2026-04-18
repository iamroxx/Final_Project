from __future__ import annotations

import logging
import os
from threading import Lock
from typing import Any, Dict

import firebase_admin
from firebase_admin import credentials, firestore


logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


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
        logger.warning("[firebase-write][skipped] Firestore is not configured")
        return

    session_ref = db.collection("sessions").document(session_id)
    frame_doc_id = str(metrics["timestamp"])
    frame_ref = session_ref.collection("frames").document(frame_doc_id)

    frame_ref.set(metrics)
    session_ref.set(
        {
            "sessionId": session_id,
            "userId": metrics.get("userId"),
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

    logger.info(
        "[firebase-write][success] sessions/%s/frames/%s",
        session_id,
        frame_doc_id,
    )


def write_session_started(session_id: str, user_id: str, started_at: int) -> None:
    db = _init_firestore()
    if db is None:
        logger.warning("[firebase-write][skipped] Firestore is not configured")
        return

    session_ref = db.collection("sessions").document(session_id)
    session_ref.set(
        {
            "sessionId": session_id,
            "userId": user_id,
            "startedAt": started_at,
            "status": "running",
            "updatedAt": started_at,
        },
        merge=True,
    )

    logger.info("[firebase-write][success] sessions/%s status=running", session_id)


def write_session_stopped(session_id: str, stopped_at: int) -> None:
    db = _init_firestore()
    if db is None:
        logger.warning("[firebase-write][skipped] Firestore is not configured")
        return

    session_ref = db.collection("sessions").document(session_id)
    session_ref.set(
        {
            "sessionId": session_id,
            "stoppedAt": stopped_at,
            "status": "stopped",
            "updatedAt": stopped_at,
        },
        merge=True,
    )

    logger.info("[firebase-write][success] sessions/%s status=stopped", session_id)
