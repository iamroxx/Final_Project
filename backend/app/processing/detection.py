from typing import List


def detect_step_timestamps(
    timestamps: List[int],
    magnitudes: List[float],
    threshold: float,
    min_interval_ms: int,
    last_step_timestamp: int | None,
) -> List[int]:
    if len(timestamps) != len(magnitudes):
        return []

    steps: List[int] = []
    prev_step = last_step_timestamp

    for i in range(1, len(magnitudes) - 1):
        is_peak = magnitudes[i] > magnitudes[i - 1] and magnitudes[i] >= magnitudes[i + 1]
        above_threshold = magnitudes[i] >= threshold
        if not (is_peak and above_threshold):
            continue

        current_ts = timestamps[i]
        if prev_step is None or (current_ts - prev_step) >= min_interval_ms:
            steps.append(current_ts)
            prev_step = current_ts

    return steps
