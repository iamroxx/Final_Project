from flask import Blueprint, jsonify, request

from ..services.session_service import create_session, end_session


session_bp = Blueprint("session", __name__)


@session_bp.post("/start")
def start_session_route():
    payload = request.get_json(silent=True) or {}
    user_id = payload.get("userId", "anonymous")
    session = create_session(user_id=user_id)
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
    return jsonify(result), 200
