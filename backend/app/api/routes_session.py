from flask import Blueprint, jsonify, request

from ..services.supabase_service import write_session_started, write_session_stopped
from ..services.session_service import create_session, end_session


session_bp = Blueprint("session", __name__)


@session_bp.post("/start")
def start_session_route():
    payload = request.get_json(silent=True) or {}
    user_id = payload.get("userId", "anonymous")
    session = create_session(user_id=user_id)
    write_session_started(
        session_id=session["sessionId"],
        user_id=user_id,
        started_at=session["startedAt"],
    )
    return jsonify(session), 201


@session_bp.post("/stop")
def stop_session_route():
    payload = request.get_json(silent=True) or {}
    session_id = payload.get("sessionId")
    if not session_id:
        return jsonify({"error": "sessionId is required"}), 400

    result = end_session(session_id)
    if result is None:
        return jsonify({"error": "session not found"}), 404
    write_session_stopped(session_id=session_id, stopped_at=result["stoppedAt"])
    return jsonify(result), 200
