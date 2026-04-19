import { Accelerometer } from "expo-sensors";
import type { AxisName, MotionCalibration } from "../../types";

type AccSample = { x: number; y: number; z: number };

type CalibrationOptions = {
  durationMs?: number;
  samplingRateHz?: number;
};

const AXES: AxisName[] = ["x", "y", "z"];

function mean(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const total = values.reduce((sum, value) => sum + value, 0);
  return total / values.length;
}

function axisValues(samples: AccSample[], axis: AxisName): number[] {
  return samples.map((sample) => sample[axis]);
}

function rms(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const meanSquares = values.reduce((sum, value) => sum + value * value, 0) / values.length;
  return Math.sqrt(meanSquares);
}

function dominantSign(values: number[]): 1 | -1 {
  let best = 0;
  for (const value of values) {
    if (Math.abs(value) > Math.abs(best)) {
      best = value;
    }
  }
  return best >= 0 ? 1 : -1;
}

export async function calibratePhoneAxes(options: CalibrationOptions = {}): Promise<MotionCalibration> {
  const durationMs = options.durationMs ?? 5000;
  const samplingRateHz = options.samplingRateHz ?? 50;

  const isAvailable = await Accelerometer.isAvailableAsync();
  if (!isAvailable) {
    throw new Error("Accelerometer not available for calibration.");
  }

  const samples: AccSample[] = [];
  const updateIntervalMs = Math.floor(1000 / samplingRateHz);
  Accelerometer.setUpdateInterval(updateIntervalMs);

  await new Promise<void>((resolve) => {
    const sub = Accelerometer.addListener((sample) => {
      samples.push({ x: sample.x, y: sample.y, z: sample.z });
    });

    setTimeout(() => {
      sub.remove();
      resolve();
    }, durationMs);
  });

  if (samples.length < 10) {
    throw new Error("Calibration failed: not enough sensor samples captured.");
  }

  const meanByAxis = {
    x: mean(axisValues(samples, "x")),
    y: mean(axisValues(samples, "y")),
    z: mean(axisValues(samples, "z")),
  };

  const absMeanByAxis = AXES.map((axis) => ({ axis, value: Math.abs(meanByAxis[axis]) }));
  absMeanByAxis.sort((a, b) => b.value - a.value);
  const verticalAxis = absMeanByAxis[0].axis;

  const horizontalAxes = AXES.filter((axis) => axis !== verticalAxis);

  const horizontalLinearRms = horizontalAxes.map((axis) => {
    const linearValues = axisValues(samples, axis).map((value) => value - meanByAxis[axis]);
    return { axis, value: rms(linearValues), linearValues };
  });
  horizontalLinearRms.sort((a, b) => b.value - a.value);
  const forwardAxis = horizontalLinearRms[0].axis;
  const forwardSign = dominantSign(horizontalLinearRms[0].linearValues);

  return {
    verticalAxis,
    forwardAxis,
    forwardSign,
    sampledAt: Date.now(),
  };
}
