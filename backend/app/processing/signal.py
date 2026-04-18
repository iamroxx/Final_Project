import numpy as np


def low_pass_filter(data: np.ndarray, alpha: float = 0.2) -> np.ndarray:
    if data.size == 0:
        return data
    filtered = np.zeros_like(data)
    filtered[0] = data[0]
    for i in range(1, data.size):
        filtered[i] = alpha * data[i] + (1 - alpha) * filtered[i - 1]
    return filtered


def movement_intensity(data: np.ndarray) -> float:
    if data.size == 0:
        return 0.0
    variance = float(np.var(data))
    return min(variance * 8.0, 1.0)
