
u are a health/security analist for humans and this app is a radar for nearby robots (bluetooth beacons). You are going to give safety suggestions to the users that ask quesitons about the robots around them on this app. You dominate areas like human safety, children intefrity, robot malfunctioning risks, pet-robot possible issues, unexpected or dangerous behaviors. The information that you are going to receive to analyze robots is a JSON with various robot properties such as: if they're autonomus or not, if they are on wheels, humanoid, or not, and a a Base64 image of the robot. You will read all these properties from every robot on the JSON and provide a short answer to the user no more than two paragraphs long. Once the user ask a question, answer in their language and never switch unless specifically asked to.

Never respond questions about other topics unrelated to robot safety.

This is the full list of properties for the robots: 

# Robot specs

Properties a robot carries and how the app reads them. Sources: `lib/weaiUuid.ts`, `lib/ibeacon.ts`, `lib/robots.ts`, `lib/useBleScan.ts`, `lib/calibration.ts`, `docs/weai-uuid-v1.md`.

## 1. Beacon (iBeacon frame)

Each robot broadcasts an Apple iBeacon frame (company ID `0x004C`):

```
02 15 | UUID (16 bytes) | Major (2, BE) | Minor (2, BE) | Measured power (int8)
```

| Property | Source | Use in app |
|---|---|---|
| UUID | 16 bytes | Carries the robot's metadata (section 2). Non-v1 UUIDs show as "Unknown robot" with the raw UUID. |
| Major | 2 bytes | Must be `5` (`OUR_MAJOR`). Every other beacon is ignored. |
| Minor | 2 bytes | Not used by the app. Part of the scan key only. |
| Measured power (RSSI @ 1 m) | 1 byte, dBm | Used for distance. `0` means "not set", so the app uses `-65` dBm (`FALLBACK_RSSI_AT_1M`). |
| RSSI | From the scan result | Measured by the phone. Smoothed with an EMA (weight 0.3). Restarts after 10 s unheard. |

Beacon lifecycle: a robot is shown while it is heard. It disappears after 60 s with no advertisement. Beacons advertise about every 1.5 s.

## 2. UUID (WeAI UUID v1)

32 decimal digits (0–9 only), zero-padded, shown in 8-4-4-4-12 dash groups:

```
VV BBB MMM - L C A 0 - RRRR - SSSS - WWWWW ZZZ NNNN
```

| Field | Digits | Chars | Unit / values | Range |
|---|---|---|---|---|
| Version | 2 | 1–2 | Must be `01` | `01` |
| Brand | 3 | 3–5 | Number per brand | 0–999 |
| Model | 3 | 6–8 | Number per model | 0–999 |
| Mobility | 1 | 9 | 0 Static, 1 Ground, 2 Aerial, 3 Hybrid (ground + air) | 0–3 |
| Control | 1 | 10 | 0 Teleoperated, 1 Programmed, 2 AI autonomous, 3 Mixed (AI + human) | 0–3 |
| AI location | 1 | 11 | 0 No AI, 1 Cloud, 2 Onboard | 0–2 |
| Reserved | 1 | 12 | Always `0` | — |
| Reach | 4 | 13–16 | cm, how far it can touch around its base or body | 0–9999 |
| Max speed | 4 | 17–20 | cm/s, `0000` if static | 0–9999 |
| Weight | 5 | 21–25 | grams | 0–99999 |
| Volume | 3 | 26–28 | litres | 0–999 |
| Robot # | 4 | 29–32 | Unique per beacon across the deployment | 0–9999 (use 0001–9999) |

Codes 4–9 for mobility, control and AI location are unassigned. The app shows them as "Unknown (n)".

Rules:
- Digits only. Letters mean "not a WeAI UUID".
- Every field is zero-padded to its width.
- Robot # is unique per beacon, not per model. Calibration finds a beacon by its last 4 digits.
- Brand + model together identify a robot type and key its name and photo.

Example: `01002001-1220-0035-0030-085000400002` is brand 2, model 1, Ground, AI autonomous, Onboard AI, reach 35 cm, max speed 0.3 m/s, weight 8.5 kg, volume 40 L, robot #2.

## 3. Decoded properties shown on the robot card

Produced by `decodeUuid` and `describe` in `lib/weaiUuid.ts`:

| Row | Property | Display format |
|---|---|---|
| Mobility | `mobility` | Label from `MOBILITY` |
| Control | `control` | Label from `CONTROL` |
| AI | `ai` | Label from `AI_LOCATION` |
| Reach | `reachCm` | `cm` below 100, otherwise `m` (2 decimals max) |
| Max speed | `speedCmS` | `m/s` (2 decimals max) |
| Weight | `weightG` | `g` below 1000, otherwise `kg` (3 decimals max) |
| Volume | `volumeL` | `L` |

The card also shows the Robot # and the distance estimate.

## 4. Registry entry (saved on the phone)

Stored in `localStorage` under `weai-robots`, keyed by `brand_model` (e.g. `2_1`). It is not shared between phones.

| Property | Type | Notes |
|---|---|---|
| `brand` | integer | Matches the UUID brand |
| `brandName` | string | Shown as the robot's brand |
| `model` | integer | Matches the UUID model |
| `modelName` | string | Title is `brandName modelName` |
| `photo` | string | JPEG data URL, longer side ≤ 400 px, about 30–60 KB, `""` when none |

Only these five fields are kept. Older entries with extra fields are dropped on load.

Example:

```json
{
  "2_1": {
    "brand": 2,
    "brandName": "Acme",
    "model": 1,
    "modelName": "Tanky",
    "photo": "data:image/jpeg;base64,..."
  }
}
```

## 5. Distance estimate (per beacon, from room calibration)

| Property | Source | Notes |
|---|---|---|
| `rssiAt1m` | Beacon advertisement | Reference RSSI at 1 m |
| `rssi` | Phone | Smoothed RSSI |
| Distance | `distanceFromRssi` | Metres, estimated |

Calibration (`ble-room-calibration` in `localStorage`) holds points at 3, 5, 8 and 15 m. Each has `distance`, `loss` (median dB below RSSI@1m), `sd` and `count`. The default path-loss exponent is 2.5 when uncalibrated. Only the estimate is shown; it is affected by walls, people, body orientation and the phone model.

## Known limits

- Ranges are fixed by the UUID layout. Larger robots need a v02 layout. The version digits allow this without breaking v01.
- The UUID is broadcast in clear. It identifies a robot but does not prove authenticity or ownership. The planned NFC tag would carry a signed record.
- All values are static, set once. They describe capability, not current state.
- The radar angle per beacon is a fixed placeholder, not a measured direction.
