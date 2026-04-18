import time
import uuid
from typing import Dict, Optional


SESSIONS: Dict[str, dict] = {}


def create_session(user_id: str) -> dict:
    session_id = str(uuid.uuid4())
    started_at = int(time.time() * 1000)

    SESSIONS[session_id] = {
        "sessionId": session_id,
        "userId": user_id,
        "startedAt": started_at,
        "stoppedAt": None,
        "stepCountTotal": 0,
        "lastStepTimestamp": None,
        "recentIntervalsMs": [],
    }

    return {"sessionId": session_id, "startedAt": started_at}


def get_session(session_id: str) -> Optional[dict]:
    return SESSIONS.get(session_id)


def end_session(session_id: str) -> Optional[dict]:
    session = SESSIONS.get(session_id)
    if not session:
        return None
    stopped_at = int(time.time() * 1000)
    session["stoppedAt"] = stopped_at
    return {"sessionId": session_id, "stoppedAt": stopped_at}
