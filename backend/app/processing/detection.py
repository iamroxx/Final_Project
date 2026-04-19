from typing import List, Optional


def detect_step_timestamps(
    timestamps: List[int],
    magnitudes: List[float],
    threshold: float,
    min_interval_ms: int,
    last_step_timestamp: Optional[int],
    gyro_magnitudes: Optional[List[float]] = None,
    gyro_confirm_threshold: float = 0.2,
    gyro_window: int = 4,
) -> List[int]:
    if len(timestamps) != len(magnitudes):
        return []

    # Gyro confirmation: a real step produces body rotation (leg swing).
    # Vibrations / chair movements typically lack this rotation signature.
    # Threshold: 0.2 rad/s (noise at rest ~0.01-0.05, walking swing ~0.3-1.5 rad/s)
    use_gyro = gyro_magnitudes is not None and len(gyro_magnitudes) == len(magnitudes)

    steps: List[int] = []
    prev_step = last_step_timestamp

    for i in range(1, len(magnitudes) - 1):
        is_peak = magnitudes[i] > magnitudes[i - 1] and magnitudes[i] >= magnitudes[i + 1]
        above_threshold = magnitudes[i] >= threshold
        if not (is_peak and above_threshold):
            continue

        # Gyro cross-validation: peak gyro in ±GYRO_WINDOW samples must exceed threshold
        if use_gyro:
            lo = max(0, i - gyro_window)
            hi = min(len(gyro_magnitudes) - 1, i + gyro_window)  # type: ignore[index]
            peak_gyro = max(gyro_magnitudes[lo : hi + 1])  # type: ignore[index]
            if peak_gyro < gyro_confirm_threshold:
                continue  # acc peak without gyro rotation → not a step

        current_ts = timestamps[i]
        if prev_step is None or (current_ts - prev_step) >= min_interval_ms:
            steps.append(current_ts)
            prev_step = current_ts

    return steps
