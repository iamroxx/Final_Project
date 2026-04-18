from flask import Blueprint, jsonify, request

from ..services.firebase_service import write_live_metrics
from ..services.session_service import get_session
from ..services.step_service import process_sensor_batch


ingest_bp = Blueprint("ingest", __name__)


@ingest_bp.post("/ingest")
def ingest_sensor_batch():
    payload = request.get_json(silent=True) or {}

    session_id = payload.get("sessionId")
    sampling_rate_hz = int(payload.get("samplingRateHz", 50))
    samples = payload.get("samples", [])

    if not session_id:
        return jsonify({"error": "sessionId is required"}), 400
    if not isinstance(samples, list) or len(samples) == 0:
        return jsonify({"error": "samples must be a non-empty array"}), 400

    session_state = get_session(session_id)
    if session_state is None:
        return jsonify({"error": "session not found"}), 404

    metrics = process_sensor_batch(
        session_id=session_id,
        session_state=session_state,
        samples=samples,
        sampling_rate_hz=sampling_rate_hz,
    )

    write_live_metrics(session_id=session_id, metrics=metrics)

    return jsonify({"metrics": metrics}), 200
