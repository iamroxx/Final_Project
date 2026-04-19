import json
import os
import time
from pathlib import Path
from threading import Lock
from typing import Any, Dict

import firebase_admin
from firebase_admin import credentials, firestore
from dotenv import load_dotenv


BACKEND_ROOT = Path(__file__).resolve().parent
ROOT_ENV_FILE = BACKEND_ROOT / ".env"

load_dotenv(ROOT_ENV_FILE)


_db = None
_init_lock = Lock()


def _load_service_account_credential(cred_file: Path):
    try:
        payload = json.loads(cred_file.read_text(encoding="utf-8"))
    except OSError as exc:
        raise RuntimeError(f"Unable to read Firebase credentials file: {cred_file}") from exc
    except json.JSONDecodeError as exc:
        raise RuntimeError(
            f"Firebase credentials file is not valid JSON: {cred_file}"
        ) from exc

    if payload.get("type") == "service_account":
        return credentials.Certificate(payload)

    if "project_info" in payload and "client" in payload:
        raise RuntimeError(
            "FIREBASE_CREDENTIALS_PATH points to a Firebase client config file "
            "(for example google-services.json), not an Admin SDK service account key. "
            "Download a service account JSON key from Firebase Console > Project Settings > "
            "Service accounts and update FIREBASE_CREDENTIALS_PATH to point to that file."
        )

    raise RuntimeError(
        'Invalid service account certificate. Expected a JSON file with "type": "service_account".'
    )


def get_firestore_client():
    global _db
    if _db is not None:
        return _db

    with _init_lock:
        if _db is not None:
            return _db

        cred_path = os.getenv("FIREBASE_CREDENTIALS_PATH", "").strip()
        if not cred_path:
            return None

        cred_file = Path(cred_path)
        if not cred_file.is_absolute():
            cred_file = BACKEND_ROOT / cred_file

        if not cred_file.exists():
            return None

        if not firebase_admin._apps:
            cred = _load_service_account_credential(cred_file)
            firebase_admin.initialize_app(cred)

        _db = firestore.client()
        return _db


def check_firestore_connection() -> Dict[str, Any]:
    try:
        db = get_firestore_client()
    except RuntimeError as exc:
        return {
            "ok": False,
            "message": str(exc),
        }

    if db is None:
        return {
            "ok": False,
            "message": "Firestore is not configured. Set FIREBASE_CREDENTIALS_PATH to a valid service account JSON file.",
        }

    started_at = time.perf_counter()
    probe_ref = db.collection("__health__").document("firebase-connection")
    snapshot = probe_ref.get()
    elapsed_ms = round((time.perf_counter() - started_at) * 1000, 2)

    return {
        "ok": True,
        "message": "Firestore connection successful.",
        "elapsedMs": elapsed_ms,
        "projectId": getattr(db, "project", ""),
        "documentExists": snapshot.exists,
        "checkedDocument": "__health__/firebase-connection",
    }