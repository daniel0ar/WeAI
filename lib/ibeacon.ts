// iBeacon frames travel as Apple (company ID 0x004C) manufacturer data:
//   0x02 0x15 | UUID (16) | major (2, BE) | minor (2, BE) | measured power @1m (int8)
export const APPLE_COMPANY_ID = 0x004c;

// Every beacon of ours advertises major 5; anything else is ignored.
export const OUR_MAJOR = 5;

// Used only when a beacon advertises 0 (measured power not set).
export const FALLBACK_RSSI_AT_1M = -65; // dBm

export function isOurs(f: { major: number }) {
  return f.major === OUR_MAJOR;
}

export interface IBeaconFrame {
  uuid: string;
  major: number;
  minor: number;
  // RSSI the beacon says it gives at exactly 1 m (its advertised measured power),
  // or FALLBACK_RSSI_AT_1M when it advertises 0, which means "not set".
  rssiAt1m: number;
}

export function parseIBeacon(data: DataView): IBeaconFrame | null {
  if (data.byteLength < 23 || data.getUint8(0) !== 0x02 || data.getUint8(1) !== 0x15) return null;
  const hex = Array.from({ length: 16 }, (_, i) => data.getUint8(2 + i).toString(16).padStart(2, "0")).join("");
  const uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  return {
    uuid,
    major: data.getUint16(18, false),
    minor: data.getUint16(20, false),
    rssiAt1m: data.getInt8(22) || FALLBACK_RSSI_AT_1M,
  };
}
