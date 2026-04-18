from __future__ import annotations

import time
from typing import Any, Dict, List, Optional

import numpy as np

from ..processing.signal import low_pass_filter, movement_intensity
from .activity_service import classify_activity


def process_sensor_batch(
    session_id: str,
    session_state: Dict[str, Any],
    samples: List[Dict[str, Any]],
    sampling_rate_hz: int,
    gps_speed_ms: Optional[float] = None,
    hw_step_count: Optional[int] = None,
) -> Dict[str, Any]:
    magnitudes = np.array([float(s.get("magnitude", 0.0)) for s in samples], dtype=np.float64)
    filtered = low_pass_filter(magnitudes)

    now = int(time.time() * 1000)

    # ── Step counting ──────────────────────────────────────────────────────────
    # Primary source: hardware pedometer chip (hwStepCount from phone).
    # It is cumulative since watchStepCount() was started (session start).
    # We trust it completely — no IMU thresholding needed.
    if hw_step_count is not None:
        prev_hw = session_state.get("hwStepCountLast", 0)
        new_steps = max(0, hw_step_count - prev_hw)
        if new_steps > 0:
            session_state["stepCountTotal"] += new_steps
            session_state["hwStepCountLast"] = hw_step_count
            # Estimate per-step interval from batch duration for cadence
            batch_duration_ms = len(samples) * (1000 / sampling_rate_hz)
            if new_steps > 0:
                estimated_interval = batch_duration_ms / new_steps
                session_state["recentIntervalsMs"].append(estimated_interval)
                session_state["recentIntervalsMs"] = session_state["recentIntervalsMs"][-10:]
            session_state["lastStepTimestamp"] = now
    else:
        # Fallback: no hardware pedometer — do nothing (cadence will be 0)
        # This avoids false counts; IMU-only detection removed as unreliable
        pass

    # ── Cadence decay ──────────────────────────────────────────────────────────
    # If no step registered for >3 s, user has stopped → cadence = 0
    CADENCE_DECAY_MS = 3000
    last_step = session_state.get("lastStepTimestamp")
    if last_step is not None and (now - last_step) > CADENCE_DECAY_MS:
        session_state["recentIntervalsMs"] = []

    avg_interval = (
        float(np.mean(session_state["recentIntervalsMs"]))
        if session_state["recentIntervalsMs"]
        else 0.0
    )
    cadence_spm = 60000.0 / avg_interval if avg_interval > 0 else 0.0

    # ── Intensity from IMU (still useful for activity classification) ──────────
    intensity = movement_intensity(filtered)
    activity_state = classify_activity(intensity=intensity, cadence_spm=cadence_spm)

    metrics = {
        "sessionId": session_id,
        "userId": session_state.get("userId"),
        "timestamp": now,
        "stepCountTotal": int(session_state["stepCountTotal"]),
        "cadenceSpm": float(round(cadence_spm, 2)),
        "avgStepIntervalMs": float(round(avg_interval, 2)),
        "intensity": float(round(intensity, 3)),
        "activityState": activity_state,
        "sampleCount": len(samples),
        "samplingRateHz": sampling_rate_hz,
    }
    return metrics

