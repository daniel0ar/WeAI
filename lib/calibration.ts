// Distance from RSSI, calibrated to the room rather than to any one beacon.
//
// Each beacon advertises the RSSI it gives at exactly 1 m. What the room changes is how much signal is
// lost beyond that, so calibration records the loss (advertised RSSI@1m − measured RSSI, in dB) at a few
// known distances. All our beacons are the same model with the same TX power, so one table serves them all.
// It lives in localStorage: it survives restarts and is cleared only by resetting the calibration.

export const CALIBRATION_DISTANCES = [3, 5, 8, 15]; // m

// Path-loss exponent used until the room is calibrated: ~2 in free space, 2.5-3 indoors.
export const DEFAULT_PATH_LOSS_EXPONENT = 2.5;

export interface CalibrationPoint {
  distance: number; // m
  loss: number; // dB below the advertised RSSI@1m (median)
  sd: number; // dB
  count: number; // samples kept
}

const STORAGE_KEY = "ble-room-calibration";

export function median(values: number[]) {
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function stdev(values: number[]) {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length);
}

// Drops samples farther than 3 scaled MADs from the median (fades, body shadowing, bursts).
export function rejectOutliers(values: number[]) {
  const m = median(values);
  const mad = 1.4826 * median(values.map((v) => Math.abs(v - m)));
  if (mad === 0) return values;
  return values.filter((v) => Math.abs(v - m) <= 3 * mad);
}

export function loadCalibration(): CalibrationPoint[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

export function saveCalibrationPoint(point: CalibrationPoint): CalibrationPoint[] {
  const points = [...loadCalibration().filter((p) => p.distance !== point.distance), point].sort((a, b) => a.distance - b.distance);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(points));
  } catch {}
  return points;
}

export function resetCalibration() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

// The exponent n that best fits loss = 10 n log10(d) through all points (the line passes through 0 dB at 1 m).
// Used outside the measured range.
export function pathLossExponent(points: CalibrationPoint[]) {
  if (points.length === 0) return DEFAULT_PATH_LOSS_EXPONENT;
  const xs = points.map((p) => Math.log10(p.distance));
  const n = xs.reduce((a, x, i) => a + x * points[i].loss, 0) / (10 * xs.reduce((a, x) => a + x * x, 0));
  return Math.min(6, Math.max(1, n));
}

// Converts an RSSI to metres. Between calibrated distances the loss is interpolated linearly against
// log10(distance) (the log-distance model, with its own slope in each stretch); below 1 m and past the
// farthest point it follows the fitted exponent. Without calibration it is the plain log-distance model.
export function distanceFromRssi(rssi: number, rssiAt1m: number, points: CalibrationPoint[]) {
  const loss = rssiAt1m - rssi;
  const n = pathLossExponent(points);
  // Anchor at 1 m / 0 dB, then the table with loss forced to grow with distance (noise can invert neighbours).
  const table = [{ x: 0, loss: 0 }];
  for (const p of [...points].sort((a, b) => a.distance - b.distance)) {
    table.push({ x: Math.log10(p.distance), loss: Math.max(p.loss, table[table.length - 1].loss + 0.1) });
  }
  if (loss <= 0) return 10 ** (loss / (10 * n));
  for (let i = 1; i < table.length; i++) {
    const a = table[i - 1];
    const b = table[i];
    if (loss <= b.loss) return 10 ** (a.x + ((loss - a.loss) / (b.loss - a.loss)) * (b.x - a.x));
  }
  const last = table[table.length - 1];
  return 10 ** (last.x + (loss - last.loss) / (10 * n));
}
