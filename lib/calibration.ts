// Per-beacon calibration of the log-distance model, fitted from RSSI measured at known distances.
export interface Calibration {
  rssiAt1m: number; // dBm, as seen by this phone
  n: number; // path-loss exponent
}

export interface Measurement {
  distance: number; // m
  rssi: number; // median dBm
}

const STORAGE_KEY = "ble-calibrations";

export function median(values: number[]) {
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function stdev(values: number[]) {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length);
}

export function percentile(values: number[], p: number) {
  const s = [...values].sort((a, b) => a - b);
  const i = (s.length - 1) * p;
  const lo = Math.floor(i);
  return s[lo] + (s[Math.ceil(i)] - s[lo]) * (i - lo);
}

// Drops samples farther than 3 scaled MADs from the median (fades, body shadowing, bursts).
export function rejectOutliers(values: number[]) {
  const m = median(values);
  const mad = 1.4826 * median(values.map((v) => Math.abs(v - m)));
  if (mad === 0) return values;
  return values.filter((v) => Math.abs(v - m) <= 3 * mad);
}

// Least squares of RSSI = rssiAt1m - 10 n log10(d). Needs two distinct distances.
export function fitCalibration(points: Measurement[]): (Calibration & { residual: number }) | null {
  if (new Set(points.map((p) => p.distance)).size < 2) return null;
  const xs = points.map((p) => Math.log10(p.distance));
  const ys = points.map((p) => p.rssi);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  const slope = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / xs.reduce((a, x) => a + (x - mx) ** 2, 0);
  const intercept = my - slope * mx;
  const residual = Math.sqrt(ys.reduce((a, y, i) => a + (y - (intercept + slope * xs[i])) ** 2, 0) / ys.length);
  return { rssiAt1m: intercept, n: -slope / 10, residual };
}

export function loadCalibrations(): Record<string, Calibration> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

export function saveCalibration(uuid: string, cal: Calibration) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...loadCalibrations(), [uuid]: cal }));
  } catch {}
}
