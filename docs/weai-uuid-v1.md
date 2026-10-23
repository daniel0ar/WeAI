# WeAI UUID v1: robot metadata in the iBeacon UUID

Status: implemented in the WeAI Android app (PoC, ShanHaiWoo event). Decoder: `lib/weaiUuid.ts`.

## Summary

Every robot carries a BLE beacon broadcasting a standard Apple iBeacon frame. WeAI writes the robot's metadata into the frame's 128-bit UUID as **32 decimal digits**, fixed width and zero-padded. Major is fixed at `5` (project group). Minor is not used. The phone app shows every Major-5 beacon, decodes its UUID, looks up the robot's names and photo by brand and model, and shows a card with the decoded fields and an approximate distance.

## Place in the iBeacon frame

```
02 01 06 1A FF 4C 00 02 15 [UUID: 16 bytes] [Major: 2 bytes] [Minor: 2 bytes] [Measured power: 1 byte]
```

| Field | WeAI use |
|---|---|
| UUID (16 bytes) | Robot metadata, this spec. Two digits per byte (`01` is byte `0x01`). |
| Major (2 bytes, big-endian) | `5` on every WeAI beacon at this event. The app ignores every other Major. |
| Minor (2 bytes) | Free. Not read by the app. |
| Measured power (1 byte) | The beacon's RSSI at 1 m, used for distance. `0` (not set) falls back to −65 dBm. |

## Format

```
VV BBB MMM - L C A 0 - RRRR - SSSS - WWWWW ZZZ NNNN
```

The blocks line up with the UUID's dash groups (8-4-4-4-12), so each block reads on its own when the UUID is shown with dashes.

| Chars | Digits | Field | Unit / values | Range |
|---|---|---|---|---|
| 1–2 | 2 | Version | `01` | must be `01` |
| 3–5 | 3 | Brand | number assigned per brand | 001–999 |
| 6–8 | 3 | Model | number assigned per model | 001–999 |
| 9 | 1 | Mobility | see codes below | 0–3 |
| 10 | 1 | Control | see codes below | 0–3 |
| 11 | 1 | AI location | see codes below | 0–2 |
| 12 | 1 | Reserved | `0` | |
| 13–16 | 4 | Reach | cm: how far the robot can touch around its base (fixed) or body (mobile), e.g. arm reach | 0–9999 cm (99.99 m) |
| 17–20 | 4 | Max speed | cm/s, top travel speed; `0000` if static | 0–9999 cm/s (99.99 m/s) |
| 21–25 | 5 | Weight | grams | 0–99999 g (99.999 kg) |
| 26–28 | 3 | Volume | liters | 0–999 L |
| 29–32 | 4 | Robot # | different on every beacon in the deployment | 0001–9999 |

### Codes

| Code | Mobility | Control | AI location |
|---|---|---|---|
| 0 | Static (fixed in place) | Teleoperated (a person drives it, including leader-follower arms that copy each movement) | No AI |
| 1 | Ground (wheels, tracks, legs) | Programmed (fixed routine, no AI) | Cloud / remote |
| 2 | Aerial | AI autonomous | Onboard (local) |
| 3 | Hybrid (ground + air) | Mixed (AI with human override) | |

Codes 4–9 are unassigned. The app still decodes them and shows "Unknown (n)".

### Rules

1. Digits `0`–`9` only. A UUID with letters is not a WeAI UUID.
2. Every field is zero-padded to its width: brand 2 is `002`, 8.5 kg is `08500`.
3. Units are chosen so whole numbers work for small robots: cm, cm/s, g, L.
4. Robot # is unique across all beacons, not per model. The app's calibration screen finds a beacon by the last 4 digits of its UUID, which is the robot #.
5. Brand + model identify the robot type and key its name and photo. In this PoC no two robots share a brand and model.

## Examples

Specs below are illustrative. Use each robot's own figures.

| Robot | UUID | Reads as |
|---|---|---|
| Fixed arm, teleoperated, #1 | `01001001-0000-0040-0000-006000150001` | Brand 1, model 1 · Static · Teleoperated · No AI · reach 40 cm · 0 m/s · 600 g · 15 L |
| Slow tank with arm, AI, #2 | `01002001-1220-0035-0030-085000400002` | Brand 2, model 1 · Ground · AI autonomous · Onboard AI · reach 35 cm · 0.3 m/s · 8.5 kg · 40 L |
| Remote-controlled robot, #3 | `01003001-1000-0050-0050-032000200003` | Brand 3, model 1 · Ground · Teleoperated · No AI · reach 50 cm · 0.5 m/s · 3.2 kg · 20 L |

Breakdown of the tank:

```
01  002  001 - 1  2  2  0 - 0035 - 0030 - 08500  040  0002
ver brand model  mob ctl AI res  reach  speed  weight vol  robot#
```

## How the app uses it

1. Scans iBeacon frames and shows every beacon with Major `5`.
2. Decodes the UUID and looks up `brand_model` (e.g. `2_1`) in the robots saved on the phone:
   - v1 UUID, brand and model saved: the card shows the photo, "Brand name Model name", robot #, distance and the decoded table (mobility, control, AI, reach, max speed, weight, volume).
   - v1 UUID, not saved: "Unknown robot" with a placeholder photo and the same decoded table. The metadata comes from the UUID, so it is complete even without a saved entry.
   - Not a v1 UUID (wrong length, letters, version other than `01`): "Unknown robot" with the raw UUID and nothing decoded. This covers beacons not yet configured, such as the earlier test UUIDs `00000000-…-000000000001` or the DX-CP101 factory default `E2C56DB5-DFFB-48D2-B060-D0F5A71096E0`, which also uses Major 5.
4. Distance comes from the beacon's advertised RSSI@1m and the room calibration (3, 5, 8, 15 m). It is an estimate, affected by walls, people, orientation and the phone model. The radar angle is a fixed placeholder per beacon, not a measured direction.
5. A robot disappears after 60 s without an advertisement.

## Robot registry (names and photos)

A JSON object saved on each phone (no sharing between phones in this PoC), created on the first save. Menu → Add robot asks only for brand # and name, model # and name, and the photo. Everything else on the card is decoded from the UUID.

```json
{
  "2_1": {
    "brand": 2,
    "brandName": "Acme",
    "model": 1,
    "modelName": "Tanky",
    "photo": "data:image/jpeg;base64,/9j/4AAQ…"
  }
}
```

- Key: `brand_model`, whole numbers without padding.
- Photo: taken with the camera (or picked from the gallery), shrunk to at most 400 px on the longer side, JPEG, stored as base64 (~30–60 KB each).

## Configuring a beacon

1. Write the robot's UUID from the format above (zero-padded, digits only).
2. In the beacon's configuration app (e.g. DX-SMART): iBeacon mode with a fixed UUID, enter the UUID, Major `5`, any Minor. Keep TX power +2.5 dBm and the 1500 ms interval. Save, then power-cycle the beacon to confirm it kept the settings.
3. In WeAI: Menu → Add robot, enter the same brand # and model # with their names, and take the photo. The beacon's card then shows the names and photo.

## Limits

- Ranges: up to 99.999 kg, 999 L, 99.99 m reach, 99.99 m/s. Larger robots need a v02 layout; the version digits allow that without breaking v01 decoding.
- The UUID is broadcast in clear and anyone can copy it. It identifies a robot, it does not prove the robot is genuine or who owns it. Ownership and authenticity are planned for the NFC tag (signed record).
- The values are static, configured once. They describe the robot's capabilities, not its current state.

## Link to NFC (proposed, not in the app yet)

The UUID gives a stable logical robot ID: `BBB-MMM-NNNN`, e.g. `002-001-0002` for the tank. The NFC tag on the same beacon can carry a URL built from it, e.g. `https://useweai.help/r/002-001-0002`, so BLE discovery and the NFC tap resolve to the same robot record.
