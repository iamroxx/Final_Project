from __future__ import annotations

import time
from typing import Any, Dict, List

import numpy as np

from ..processing.detection import detect_step_timestamps
from ..processing.signal import low_pass_filter, movement_intensity
from .activity_service import classify_activity


def process_sensor_batch(
    session_id: str,
    session_state: Dict[str, Any],
    samples: List[Dict[str, Any]],
    sampling_rate_hz: int,
) -> Dict[str, Any]:
    timestamps = [int(s.get("timestamp", 0)) for s in samples]
    magnitudes = np.array([float(s.get("magnitude", 0.0)) for s in samples], dtype=np.float64)

    filtered = low_pass_filter(magnitudes)
    mag_mean = float(np.mean(filtered)) if filtered.size else 0.0
    mag_std = float(np.std(filtered)) if filtered.size else 0.0
    threshold = mag_mean + (0.5 * mag_std)

    step_ts = detect_step_timestamps(
        timestamps=timestamps,
        magnitudes=filtered.tolist(),
        threshold=threshold,
        min_interval_ms=280,
        last_step_timestamp=session_state.get("lastStepTimestamp"),
    )

    if step_ts:
        session_state["stepCountTotal"] += len(step_ts)
        session_state["lastStepTimestamp"] = step_ts[-1]

        intervals = [
            step_ts[i] - step_ts[i - 1]
            for i in range(1, len(step_ts))
            if (step_ts[i] - step_ts[i - 1]) > 0
        ]

        if session_state.get("recentIntervalsMs") and step_ts:
            last_known = session_state.get("lastStepTimestampBeforeBatch")
            if last_known:
                edge_interval = step_ts[0] - last_known
                if edge_interval > 0:
                    intervals.insert(0, edge_interval)

        session_state["recentIntervalsMs"].extend(intervals)
        session_state["recentIntervalsMs"] = session_state["recentIntervalsMs"][-10:]

    avg_interval = (
        float(np.mean(session_state["recentIntervalsMs"]))
        if session_state["recentIntervalsMs"]
        else 0.0
    )
    cadence_spm = 60000.0 / avg_interval if avg_interval > 0 else 0.0
    intensity = movement_intensity(filtered)
    activity_state = classify_activity(intensity=intensity, cadence_spm=cadence_spm)

    now = int(time.time() * 1000)
    metrics = {
        "sessionId": session_id,
        "timestamp": now,
        "stepCountTotal": int(session_state["stepCountTotal"]),
        "cadenceSpm": float(round(cadence_spm, 2)),
        "avgStepIntervalMs": float(round(avg_interval, 2)),
        "intensity": float(round(intensity, 3)),
        "activityState": activity_state,
        "sampleCount": len(samples),
        "samplingRateHz": sampling_rate_hz,
    }

    session_state["lastStepTimestampBeforeBatch"] = session_state.get("lastStepTimestamp")
    return metrics
