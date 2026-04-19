from flask import Blueprint, jsonify, request

from ..extensions import socketio
from ..services.supabase_service import write_live_metrics
from ..services.session_service import get_session
from ..services.step_service import process_sensor_batch


ingest_bp = Blueprint("ingest", __name__)


@ingest_bp.post("/ingest")
def ingest_sensor_batch():
    payload = request.get_json(silent=True) or {}

    session_id = payload.get("sessionId")
    sampling_rate_hz = int(payload.get("samplingRateHz", 50))
    samples = payload.get("samples", [])
    gps_speed_ms = payload.get("gpsSpeedMs")
    if gps_speed_ms is not None:
        gps_speed_ms = float(gps_speed_ms)
    hw_step_count = payload.get("hwStepCount")
    if hw_step_count is not None:
        hw_step_count = int(hw_step_count)

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
        gps_speed_ms=gps_speed_ms,
        hw_step_count=hw_step_count,
    )

    write_live_metrics(session_id=session_id, metrics=metrics)
    socketio.emit("metrics", metrics, room=session_id, namespace="/metrics")

    return jsonify({"metrics": metrics}), 200
