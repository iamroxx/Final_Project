def classify_activity(intensity: float, cadence_spm: float) -> str:
    if cadence_spm >= 165 or intensity >= 0.9:
        return "running"
    if cadence_spm >= 45 or intensity >= 0.22:
        return "walking"
    return "idle"
