from __future__ import annotations

import time
from typing import Any, Dict, List, Optional

import numpy as np

from ..processing.detection import detect_step_timestamps
from ..processing.signal import low_pass_filter, movement_intensity
from .activity_service import classify_activity


# Cadence sensitivity controls (forward-axis IMU fallback path).
# Tune here later if cadence is too low/high.
IMU_THRESHOLD_MIN = 0.02
IMU_THRESHOLD_STD_SCALE = 0.6
IMU_MIN_INTERVAL_MS = 220
IMU_MAX_INTERVAL_MS = 2500
IMU_GYRO_CONFIRM_THRESHOLD = 0.06
IMU_GYRO_WINDOW = 5
RECENT_INTERVAL_WINDOW = 12
HW_CADENCE_WINDOW_MS = 8000
HW_CADENCE_MIN_WINDOW_MS = 2000


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
    timestamps = [int(s.get("timestamp", 0)) for s in samples]

    gyro_magnitudes = [
        float(
            np.sqrt(
                float(s.get("gx", 0.0)) ** 2
                + float(s.get("gy", 0.0)) ** 2
                + float(s.get("gz", 0.0)) ** 2
            )
        )
        for s in samples
    ]

    # Use sensor time as the primary processing clock so cadence remains stable
    # even if batches are replayed quickly after reconnect.
    now = timestamps[-1] if timestamps else int(time.time() * 1000)

    # ── Step counting ──────────────────────────────────────────────────────────
    # Primary source: hardware pedometer chip (hwStepCount from phone).
    # It is cumulative since watchStepCount() was started (session start).
    # We trust it completely — no IMU thresholding needed.
    hw_new_steps = 0
    cadence_spm_from_hw = 0.0
    avg_interval_from_hw = 0.0
    if hw_step_count is not None:
        prev_hw = session_state.get("hwStepCountLast")
        if prev_hw is None:
            prev_hw = hw_step_count

        if hw_step_count < prev_hw:
            # Pedometer counter can reset on some devices/app restarts.
            hw_new_steps = 0
        else:
            hw_new_steps = max(0, hw_step_count - prev_hw)

        # Always keep last seen value to prevent stale baseline drift.
        session_state["hwStepCountLast"] = hw_step_count

        if hw_new_steps > 0:
            session_state["stepCountTotal"] += hw_new_steps
            session_state["lastStepTimestamp"] = now

        # Cadence from a sliding hardware-step window (more stable than per-batch interval).
        hw_history = session_state.setdefault("hwCadenceHistory", [])
        hw_history.append({"ts": now, "count": int(hw_step_count)})
        cutoff = now - HW_CADENCE_WINDOW_MS
        hw_history[:] = [point for point in hw_history if int(point.get("ts", 0)) >= cutoff]

        if len(hw_history) >= 2:
            first = hw_history[0]
            last = hw_history[-1]
            step_delta = max(0, int(last["count"]) - int(first["count"]))
            dt_ms = max(1, int(last["ts"]) - int(first["ts"]))
            if step_delta > 0 and dt_ms >= HW_CADENCE_MIN_WINDOW_MS:
                cadence_spm_from_hw = min(200.0, (step_delta * 60000.0) / dt_ms)
                avg_interval_from_hw = dt_ms / step_delta
                session_state["lastCadenceSpm"] = cadence_spm_from_hw
            else:
                cadence_spm_from_hw = float(session_state.get("lastCadenceSpm", 0.0))
    else:
        # No hardware pedometer available: cadence fallback from IMU-only logic.
        cadence_spm_from_hw = 0.0
        avg_interval_from_hw = 0.0

    # Fallback cadence from IMU is used ONLY when hardware pedometer is unavailable.
    # If hardware exists, we trust it and avoid noisy IMU cadence spikes.
    if hw_step_count is None:
        # Use only calibrated forward-axis oscillation for cadence (no 3-axis fusion).
        centered_forward = filtered - float(np.mean(filtered))
        step_signal = np.abs(centered_forward)
        signal_std = float(np.std(step_signal)) if step_signal.size > 0 else 0.0
        adaptive_threshold = max(IMU_THRESHOLD_MIN, signal_std * IMU_THRESHOLD_STD_SCALE)

        imu_steps = detect_step_timestamps(
            timestamps=timestamps,
            magnitudes=step_signal.tolist(),
            threshold=adaptive_threshold,
            min_interval_ms=IMU_MIN_INTERVAL_MS,
            last_step_timestamp=session_state.get("lastCadenceStepTimestamp"),
            gyro_magnitudes=gyro_magnitudes,
            gyro_confirm_threshold=IMU_GYRO_CONFIRM_THRESHOLD,
            gyro_window=IMU_GYRO_WINDOW,
        )

        prev_cadence_step = session_state.get("lastCadenceStepTimestamp")
        for step_ts in imu_steps:
            if prev_cadence_step is not None:
                interval = step_ts - prev_cadence_step
                if IMU_MIN_INTERVAL_MS <= interval <= IMU_MAX_INTERVAL_MS:
                    session_state["recentIntervalsMs"].append(float(interval))
            prev_cadence_step = step_ts

        if imu_steps:
            session_state["lastCadenceStepTimestamp"] = imu_steps[-1]
            session_state["lastStepTimestamp"] = imu_steps[-1]
            session_state["recentIntervalsMs"] = session_state["recentIntervalsMs"][-RECENT_INTERVAL_WINDOW:]

    # ── Cadence decay ──────────────────────────────────────────────────────────
    # If no step registered for >3 s, user has stopped → cadence = 0
    CADENCE_DECAY_MS = 3000
    last_step = session_state.get("lastStepTimestamp")
    if last_step is not None and (now - last_step) > CADENCE_DECAY_MS:
        session_state["recentIntervalsMs"] = []

    if hw_step_count is not None:
        avg_interval = avg_interval_from_hw
        cadence_spm = cadence_spm_from_hw
    else:
        avg_interval = (
            float(np.mean(session_state["recentIntervalsMs"]))
            if session_state["recentIntervalsMs"]
            else 0.0
        )
        cadence_spm = 60000.0 / avg_interval if avg_interval > 0 else 0.0
        cadence_spm = min(cadence_spm, 200.0)

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

