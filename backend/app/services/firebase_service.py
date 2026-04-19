from __future__ import annotations

import logging
from typing import Any, Dict

from firebase_connection import get_firestore_client


logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


def write_live_metrics(session_id: str, metrics: Dict[str, Any]) -> None:
    db = get_firestore_client()
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
    db = get_firestore_client()
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
    db = get_firestore_client()
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
