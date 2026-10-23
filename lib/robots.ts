import { robotKey } from "./weaiUuid";

// Names and photos of known robots, keyed by "brand_model" (e.g. "2_1"). The beacon's UUID carries the
// robot's metadata; this adds what a UUID can't: readable names and a photo.
// Saved on this phone only (localStorage), like the calibration: it survives restarts. Created on the first save.

export interface RobotRecord {
  brand: number;
  brandName: string;
  model: number;
  modelName: string;
  photo: string; // JPEG data URL, "" when none
}

export type Registry = Record<string, RobotRecord>;

const STORAGE_KEY = "weai-robots";

export const robotTitle = (r: RobotRecord) => `${r.brandName} ${r.modelName}`;

// Keeps only well-formed entries, and only the fields above (entries saved by older versions had more).
export function loadRobots(): Registry {
  let raw: unknown;
  try {
    raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
  } catch {
    return {};
  }
  const registry: Registry = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return registry;
  for (const r of Object.values(raw as Record<string, Partial<RobotRecord>>)) {
    if (!r || !Number.isInteger(r.brand) || !Number.isInteger(r.model)) continue;
    const record = { brand: r.brand!, brandName: String(r.brandName ?? ""), model: r.model!, modelName: String(r.modelName ?? ""), photo: String(r.photo ?? "") };
    registry[robotKey(record)] = record;
  }
  return registry;
}

// Throws when the phone's storage is full.
export function saveRobots(registry: Registry) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(registry));
}

// Shrinks a photo so its longer side is at most `maxPx` and returns it as a JPEG data URL (~30-60 KB).
// A full camera photo is several MB, and a few would fill the app's storage.
export async function shrinkPhoto(file: File, maxPx = 400): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode(); // the browser applies the photo's EXIF rotation
    const scale = Math.min(1, maxPx / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not process the photo.");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.8);
  } finally {
    URL.revokeObjectURL(url);
  }
}
