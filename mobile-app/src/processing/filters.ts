export function lowPassFilter(prev: number, current: number, alpha = 0.2): number {
  return alpha * current + (1 - alpha) * prev;
}

export function vectorMagnitude(x: number, y: number, z: number): number {
  return Math.sqrt(x * x + y * y + z * z);
}
