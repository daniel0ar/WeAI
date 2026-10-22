// iBeacon frames travel as Apple (company ID 0x004C) manufacturer data:
//   0x02 0x15 | UUID (16) | major (2, BE) | minor (2, BE) | measured power @1m (int8)
export const APPLE_COMPANY_ID = 0x004c;

// Calibration of the deployed beacons.
export const DEFAULT_RSSI_AT_1M = -64; // dBm
// Path-loss exponent: ~2 in free space, 2.5-3 indoors. Raise it if distances read too far.
export const PATH_LOSS_EXPONENT = 2.5;

// Our beacons. Omit major/minor to match every beacon with that UUID.
// While this list is empty, every iBeacon in range is shown.
export const OUR_BEACONS: { uuid: string; major?: number; minor?: number }[] = [];

export function isOurs(f: { uuid: string; major: number; minor: number }) {
  return (
    OUR_BEACONS.length === 0 ||
    OUR_BEACONS.some(
      (b) =>
        b.uuid.toLowerCase() === f.uuid &&
        (b.major === undefined || b.major === f.major) &&
        (b.minor === undefined || b.minor === f.minor),
    )
  );
}

export interface IBeaconFrame {
  uuid: string;
  major: number;
  minor: number;
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
    rssiAt1m: data.getInt8(22) || DEFAULT_RSSI_AT_1M,
  };
}

// Log-distance path-loss model: d = 10^((RSSI@1m - RSSI) / (10 n)).
export function distanceFromRssi(rssi: number, rssiAt1m: number) {
  return 10 ** ((rssiAt1m - rssi) / (10 * PATH_LOSS_EXPONENT));
}
