# Customer-app QA workflow

Canonical reference for how to run on-device QA against the customer-app
without burning EAS free-tier build slots.

> **TL;DR.** For ~95% of QA, build the Expo Dev Client **once** and
> iterate via Metro Fast Refresh. EAS preview builds are the
> **exception**, reserved for native / Hermes / release-mode-sensitive
> cases listed below. Do not default to `eas build --profile preview`
> for routine JS changes — it burns free-tier quota, disables
> shake-to-reload, disables the §AU dev-location override, and slows
> the iteration loop from seconds to minutes.

## Default workflow — Dev Client + Metro

This is the canonical loop for ANY change that is pure JavaScript /
TypeScript: React state, hooks, props, navigation, styling, copy,
layout, animation, API client, Zod schemas, React Query, design
system, etc.

### One-time setup

1. **Build the Dev Client** (only re-run when native dependencies or
   plugins change — see "When to rebuild the Dev Client" below).

   ```bash
   cd apps/customer-app
   eas build --profile development --platform ios
   ```

   The `development` profile in `apps/customer-app/eas.json` has
   `developmentClient: true` set. The build takes ~5–7 minutes on EAS
   cloud. When it finishes, scan the QR code or open the install link
   on the iOS device to install the Dev Client app.

2. **Configure `apps/customer-app/.env.local`** (gitignored — never
   committed). The two env vars Metro consumes at start time:

   ```
   EXPO_PUBLIC_API_URL=http://<iMac-LAN-IP>:3000
   EXPO_PUBLIC_DEV_LOCATION_LAT=53.6458
   EXPO_PUBLIC_DEV_LOCATION_LNG=-1.7850
   ```

   - `EXPO_PUBLIC_API_URL` points the customer-app at the local backend.
     Find the iMac's LAN IP with `ifconfig | grep "inet " | grep -v 127`.
   - The two `DEV_LOCATION_*` vars enable the §AU dev-location override
     (Huddersfield in the example). See
     [customer-app-dev-location-override.md](customer-app-dev-location-override.md)
     for presets.

3. **Confirm phone + iMac are on the same Wi-Fi LAN.** Metro serves the
   JS bundle over HTTP at port 8081; the phone must be able to reach
   the iMac at that LAN IP.

### Daily loop

1. **Start the backend** (separate terminal):

   ```bash
   cd /Users/shebinchaliyath/Developer/Redeemo
   npm run dev
   ```

   The Node API listens on `0.0.0.0:3000` — accessible to the phone
   via the iMac's LAN IP.

2. **Start Metro** for the customer-app:

   ```bash
   cd apps/customer-app
   npx expo start --dev-client
   ```

   Metro reads `.env.local` at start time and bakes the env vars into
   the bundle. To change values, edit `.env.local` and restart Metro
   (Ctrl-C, re-run the command).

3. **Open the installed Dev Client on the phone.** It auto-discovers
   Metro on the LAN; if not, scan the QR code shown in the terminal.

4. **Edit code → save → Fast Refresh fires within ~1 s.**
   - Shake the phone → dev menu → Reload / Toggle Inspector / etc.
   - Most state survives across Fast Refresh; reach for Reload only
     when you need a clean mount.

### When to rebuild the Dev Client

The Dev Client is a one-time cost. Rebuild only when one of the
following changes:

- A new native dependency (any `expo-*` or `react-native-*` package
  that has native code — i.e. anything that touches the Podfile)
- A change to `app.config.ts` plugins, native config (Info.plist,
  permissions strings, intent filters)
- A change to `eas.json` `build.development` that affects the native
  build
- A bump in the Expo SDK version

Pure JavaScript or TypeScript changes do **not** require a Dev Client
rebuild. Metro serves the latest bundle on every reload.

## Exception — EAS preview build (production-mode QA)

Use `eas build --profile preview --platform ios` **only** for cases
that genuinely need production-mode behaviour. Each preview build
burns one EAS free-tier slot.

### Legitimate triggers

| Trigger | Why it needs a preview build |
|---|---|
| Hermes-specific bugs (timing, bitmap regeneration, dead-code-elimination tests) | These only manifest with `__DEV__ === false` and the production Hermes pipeline. Dev Client / Metro masks them. Examples: §BC track-then-freeze, §BF stable marker dimensions, §BI tracking-window timing. |
| Release-build verification | Confirming no `console.log` of sensitive data, inspecting the bundle, verifying §AG3 / §AG8 release-mode rules. See [release-build-verification.md](release-build-verification.md). |
| Native config changes round-tripping | When a change to `app.config.ts` plugins / native deps needs to be verified end-to-end in a production-style build. |
| Pre-launch device QA | Final sanity check before a TestFlight / production submission. |

### Not legitimate triggers

| Triggered for | Use Dev Client instead because |
|---|---|
| New screen, new component, layout tweak | Pure JS — Fast Refresh covers it in seconds. |
| Copy / token / typography change | Pure JS — Fast Refresh covers it. |
| Hook / state / navigation bug | Pure JS — Dev Client + Metro reproduces it equally well. |
| Verifying API client behaviour | Pure JS + backend; iterate locally. |
| Routine bug fix that doesn't touch native | Pure JS — Dev Client. |

## Decision matrix

| Change type | Workflow |
|---|---|
| React state, hooks, props, navigation | Dev Client + Metro |
| Styling, copy, layout, animation | Dev Client + Metro |
| API client, Zod schemas, React Query | Dev Client + Metro |
| Design-system primitives | Dev Client + Metro |
| New `expo-*` or native-RN package | Rebuild Dev Client → continue with Dev Client |
| Hermes-specific bug | EAS preview |
| Release-build sanity (logs, bundle, env) | EAS preview |
| Final pre-launch device QA | EAS preview |
| §AU dev-location override testing | Dev Client only (override is `__DEV__` gated) |

## Cross-references

- [customer-app-dev-location-override.md](customer-app-dev-location-override.md) — §AU dev-location override (Dev Client only).
- [release-build-verification.md](release-build-verification.md) — the formal release-build checks (§AG8).

## Why this doc exists

Drift to preview-build-per-iteration happened during the §BF / §BI
Map fixes (2026-05-16), which genuinely required production-mode QA.
After those fixes shipped, the workflow stayed on preview builds for
subsequent JS-only PRs (§BH, §BD-1, §BD-2). That regressed the
iteration loop from ~1 s (Fast Refresh) to ~7 minutes (rebuild +
install + cold-launch), burned EAS free-tier slots unnecessarily,
disabled shake-to-reload, and left the §AU dev-location override
inactive (`__DEV__ === false` in preview builds → dead-code
eliminated).

Locked 2026-05-16. Do not default to `eas build --profile preview` for
routine JS changes. When in doubt, ask: "does this change need
production-mode Hermes / release semantics to verify?" If no — Dev
Client.
