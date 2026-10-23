// WeAI UUID v1: a robot's metadata written into its iBeacon UUID as 32 decimal digits (0-9 only),
// fixed width and zero-padded. The blocks follow the UUID's dash groups (8-4-4-4-12):
//
//   VV BBB MMM - L C A 0 - RRRR - SSSS - WWWWW ZZZ NNNN
//   01 002 001 - 1 2 2 0 - 0035 - 0030 - 08500 040 0002   →   01002001-1220-0035-0030-085000400002
//
// Full spec: docs/weai-uuid-v1.md.

export const UUID_VERSION = 1;

// Code → label. The code is the index.
export const MOBILITY = ["Static", "Ground", "Aerial", "Hybrid (ground + air)"];
export const CONTROL = ["Teleoperated", "Programmed", "AI autonomous", "Mixed (AI + human)"];
export const AI_LOCATION = ["No AI", "Cloud", "Onboard"];

export interface RobotMeta {
  brand: number;
  model: number;
  mobility: number; // MOBILITY code
  control: number; // CONTROL code
  ai: number; // AI_LOCATION code
  reachCm: number; // how far it can touch around its base or body
  speedCmS: number; // top speed, 0 if static
  weightG: number;
  volumeL: number;
  robotNo: number; // different on every beacon
}

// Field order and widths, 32 digits in all.
const LAYOUT = [
  ["version", 2],
  ["brand", 3],
  ["model", 3],
  ["mobility", 1],
  ["control", 1],
  ["ai", 1],
  ["reserved", 1],
  ["reachCm", 4],
  ["speedCmS", 4],
  ["weightG", 5],
  ["volumeL", 3],
  ["robotNo", 4],
] as const;

type Field = (typeof LAYOUT)[number][0];

// Largest value each field can hold (99, 999, 9999…).
export const MAX = Object.fromEntries(LAYOUT.map(([name, digits]) => [name, 10 ** digits - 1])) as Record<Field, number>;

// Null when the UUID is not a WeAI v1 UUID (other digits than 0-9, wrong length, other version).
export function decodeUuid(uuid: string): RobotMeta | null {
  const digits = uuid.replace(/-/g, "");
  if (!/^\d{32}$/.test(digits)) return null;
  const v = {} as Record<Field, number>;
  let at = 0;
  for (const [name, n] of LAYOUT) {
    v[name] = Number(digits.slice(at, at + n));
    at += n;
  }
  if (v.version !== UUID_VERSION) return null;
  return {
    brand: v.brand,
    model: v.model,
    mobility: v.mobility,
    control: v.control,
    ai: v.ai,
    reachCm: v.reachCm,
    speedCmS: v.speedCmS,
    weightG: v.weightG,
    volumeL: v.volumeL,
    robotNo: v.robotNo,
  };
}

// The UUID to configure on the beacon, dashed. Throws if a value is not a whole number that fits its field.
export function encodeUuid(meta: RobotMeta): string {
  const values: Record<Field, number> = { version: UUID_VERSION, reserved: 0, ...meta };
  const digits = LAYOUT.map(([name, n]) => {
    const value = values[name];
    if (!Number.isInteger(value) || value < 0 || value > MAX[name]) throw new RangeError(`${name} must be a whole number from 0 to ${MAX[name]}`);
    return String(value).padStart(n, "0");
  }).join("");
  return `${digits.slice(0, 8)}-${digits.slice(8, 12)}-${digits.slice(12, 16)}-${digits.slice(16, 20)}-${digits.slice(20)}`;
}

// Key of a robot's name and photo in the registry, e.g. "2_1".
export const robotKey = (m: { brand: number; model: number }) => `${m.brand}_${m.model}`;

const label = (labels: string[], code: number) => labels[code] ?? `Unknown (${code})`;
const trim = (n: number, decimals: number) => String(Number(n.toFixed(decimals)));

export const formatReach = (cm: number) => (cm < 100 ? `${cm} cm` : `${trim(cm / 100, 2)} m`);
export const formatSpeed = (cmS: number) => `${trim(cmS / 100, 2)} m/s`;
export const formatWeight = (g: number) => (g < 1000 ? `${g} g` : `${trim(g / 1000, 3)} kg`);
export const formatVolume = (l: number) => `${l} L`;

// The rows of the robot card's table.
export function describe(meta: RobotMeta): [string, string][] {
  return [
    ["Mobility", label(MOBILITY, meta.mobility)],
    ["Control", label(CONTROL, meta.control)],
    ["AI", label(AI_LOCATION, meta.ai)],
    ["Reach", formatReach(meta.reachCm)],
    ["Max speed", formatSpeed(meta.speedCmS)],
    ["Weight", formatWeight(meta.weightG)],
    ["Volume", formatVolume(meta.volumeL)],
  ];
}
