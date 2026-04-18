def classify_activity(intensity: float, cadence_spm: float) -> str:
    if cadence_spm >= 140 or intensity >= 0.8:
        return "running"
    if cadence_spm >= 50 or intensity >= 0.25:
        return "walking"
    return "idle"
