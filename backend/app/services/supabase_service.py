from __future__ import annotations

import json
import logging
import os
from typing import Any, Dict, Optional

import requests


logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


def _get_supabase_config() -> Optional[Dict[str, str]]:
    url = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not url or not service_key:
        return None
    return {"url": url, "service_key": service_key}


def _headers(service_key: str) -> Dict[str, str]:
    return {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
    }


def _upsert(table: str, payload: Dict[str, Any], on_conflict: str) -> bool:
    cfg = _get_supabase_config()
    if cfg is None:
        logger.warning("[supabase-write][skipped] Supabase is not configured")
        return False

    url = f"{cfg['url']}/rest/v1/{table}?on_conflict={on_conflict}"
    headers = _headers(cfg["service_key"])
    headers["Prefer"] = "resolution=merge-duplicates,return=minimal"

    try:
        response = requests.post(url, headers=headers, data=json.dumps(payload), timeout=5)
        if response.status_code >= 400:
            logger.warning(
                "[supabase-write][failure] table=%s status=%s body=%s",
                table,
                response.status_code,
                response.text[:300],
            )
            return False
        return True
    except requests.RequestException as exc:
        logger.warning("[supabase-write][failure] table=%s error=%s", table, exc)
        return False


def write_live_metrics(session_id: str, metrics: Dict[str, Any]) -> None:
    timestamp = int(metrics.get("timestamp", 0))

    frame_payload = {
        "session_id": session_id,
        "ts": timestamp,
        "payload": metrics,
    }
    _upsert("session_frames", frame_payload, "session_id,ts")

    session_payload = {
        "session_id": session_id,
        "user_id": metrics.get("userId"),
        "updated_at": timestamp,
        "latest_metrics": {
            "stepCountTotal": metrics.get("stepCountTotal", 0),
            "cadenceSpm": metrics.get("cadenceSpm", 0),
            "avgStepIntervalMs": metrics.get("avgStepIntervalMs", 0),
            "intensity": metrics.get("intensity", 0),
            "activityState": metrics.get("activityState", "idle"),
        },
    }
    _upsert("sessions", session_payload, "session_id")

    logger.info("[supabase-write][success] session=%s ts=%s", session_id, timestamp)


def write_session_started(session_id: str, user_id: str, started_at: int) -> None:
    payload = {
        "session_id": session_id,
        "user_id": user_id,
        "started_at": started_at,
        "status": "running",
        "updated_at": started_at,
    }
    if _upsert("sessions", payload, "session_id"):
        logger.info("[supabase-write][success] session=%s status=running", session_id)


def write_session_stopped(session_id: str, stopped_at: int) -> None:
    payload = {
        "session_id": session_id,
        "stopped_at": stopped_at,
        "status": "stopped",
        "updated_at": stopped_at,
    }
    if _upsert("sessions", payload, "session_id"):
        logger.info("[supabase-write][success] session=%s status=stopped", session_id)
