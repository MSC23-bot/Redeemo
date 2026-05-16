# Customer-app dev location override (Plan 4 §AU)

A build-time mechanism for forcing the customer-app's Discovery surfaces
to read a fixed UK lat/lng instead of the device GPS. Exists so the
project owner can QA Plan 4 Discovery (Home / Search / Category /
Map) end-to-end from outside the UK without faking GPS at the OS level.

> **Normal customer-app QA runs via Expo Dev Client + Metro, where this
> override is active.** See [customer-app-qa-workflow.md](customer-app-qa-workflow.md)
> for the canonical setup loop, the decision matrix, and the (narrow)
> list of cases that genuinely warrant an EAS preview build instead.
> Locked 2026-05-16 after the workflow drifted into preview-build-per-
> iteration during the §BF / §BI Map fixes — this override was inert
> across every preview build that followed, which masked Discovery QA
> for several sessions.

## ⚠️ Local dev / Expo dev-client only

> **The override is active ONLY when `__DEV__` is true** — i.e. a local
> Metro session or an Expo dev-client build. EAS preview-channel,
> internal-distribution, and production builds run with
> `__DEV__ === false` and **ignore the override entirely**, even if
> the env vars happen to be baked in.
>
> If at some point we need to QA an installed preview build on a real
> device, that requires a separate opt-in path (e.g. an explicit
> `EXPO_PUBLIC_ENABLE_DEV_LOCATION_OVERRIDE` allow flag); it is
> intentionally **not** part of this mechanism. Use Expo dev-client
> for QA in the meantime.
>
> **Never set these env vars in production CI.**

## How it works

1. `apps/customer-app/app.config.ts` reads `EXPO_PUBLIC_DEV_LOCATION_LAT`
   and `EXPO_PUBLIC_DEV_LOCATION_LNG` at build time. If **both** parse
   as finite numbers, the pair is baked into the Expo config as
   `extra.devLocationOverride = { lat, lng }` (via conditional spread —
   the key is **omitted entirely** when either env var is missing or
   non-numeric).
2. `apps/customer-app/src/lib/devLocationOverride.ts` reads that field
   at runtime, gated by `__DEV__`, and re-validates that both values
   are finite numbers.
3. `apps/customer-app/src/hooks/useLocation.ts` (`useUserLocation`)
   short-circuits to the override coords on mount: skips the OS
   permission probe, skips `Location.getCurrentPositionAsync`, skips
   `Location.reverseGeocodeAsync`. `area` and `city` stay `null` so no
   fake place strings surface in the UI.

Only `useUserLocation` is wrapped. `useLocationAssist` (the PC2
onboarding address resolution path) is intentionally **not** affected;
override mode is a Discovery-QA tool, not a global location spoof.

The backend resolves `effectiveLocality` (locality, post town, LAD,
admin county, region, country) from the raw lat/lng on the wire, so
the override produces a fully realistic UK Discovery response without
any local UI fakery.

## Usage

In `apps/customer-app/.env.local` (gitignored), set:

```
EXPO_PUBLIC_DEV_LOCATION_LAT=53.6458
EXPO_PUBLIC_DEV_LOCATION_LNG=-1.7850
```

Then start the Expo dev server (or relaunch the Expo dev-client). Restart
Metro after editing `.env.local`; env vars are baked at build time.

To turn the override off, comment the two lines out (or delete them)
and restart Metro. With both unset, `useUserLocation` falls back to the
real device GPS path.

## Presets

| Preset                      | Lat       | Lng       | Why it's useful                                            |
|-----------------------------|-----------|-----------|------------------------------------------------------------|
| Huddersfield                | 53.6458   | -1.7850   | Karaara seed fixture — supply-rich Northern town           |
| Brightlingsea               | 51.8100   |  1.0200   | Covelum/Kovalam fixture — supply-thin coastal small town   |
| Central London              | 51.5081   | -0.1281   | Dense urban candidate set (worst case for nearest-locality) |
| Aviemore / Cairngorms       | 57.1944   | -3.8273   | Rural Highland — empty rung counts, fallback ladder paths  |

## Safety properties

- `__DEV__` is replaced by the Metro/Hermes bundler with the literal
  `false` in release / EAS preview builds, so the override branch is
  dead-code eliminated from those bundles. The override genuinely
  cannot fire there.
- `app.config.ts` only adds `extra.devLocationOverride` when both env
  vars parse as finite numbers. A typo or missing var leaves the field
  absent entirely (conditional spread, not `undefined`).
- `devLocationOverride()` re-validates both values are finite numbers
  at runtime — defence against a malformed object somehow landing in
  `extra`.
- No user-facing toggle exists. The override is build-time only.

## Removal

This mechanism is QA scaffolding, not a customer feature. If at some
point a customer-visible debug control replaces it, delete:

- `apps/customer-app/src/lib/devLocationOverride.ts`
- The `parseDevLocationOverride` helper + `extra.devLocationOverride`
  conditional spread in `apps/customer-app/app.config.ts`
- The override branches in `useUserLocation`
- This document and the commented env block in `.env.example`
