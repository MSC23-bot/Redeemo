# Release-Build Verification Log

Spot-checks confirming that dev-only diagnostic strings, debug logging, and
similar `__DEV__`-gated code are not shipping in production bundles.

When you add a new `__DEV__` block (or any code that should be stripped from
release), append a row here with the verification command and result so we
have a permanent record that the build pipeline still strips it.

---

## §AG8 — `[api.refresh]` diagnostic logging strip (2026-05-10)

**What was checked.** Two `__DEV__`-gated `console.info` calls in
`apps/customer-app/src/lib/api.ts` (lines 213 and 245) that log the refresh
request body shape and HTTP status. Locked 2026-05-08 after the §Y / §AC
auth-rotation incident; deferred-followups §AG8 pinned a release-build
verification before launch.

**Method.**

```bash
cd apps/customer-app
npx expo export --platform ios --output-dir /tmp/redeemo-prod-export

BUNDLE=$(find /tmp/redeemo-prod-export/_expo -name 'entry-*.hbc' -print -quit)
strings "$BUNDLE" | grep -F -e '[api.refresh] body shape' -e '[api.refresh] response status'
strings "$BUNDLE" | grep -E 'api\.refresh|api\] body|api\] response'
```

`expo export` produces a Hermes bytecode bundle (`.hbc`); the bundle is
compiled with `__DEV__` constant-folded to `false`, so any `if (__DEV__)`
block is dead-code-eliminated. The `strings` tool extracts UTF-8 string
literals from the Hermes string table.

**Result.** Both grep commands returned zero matches. Sanity-checked that
`strings` extracts ~10,466 string literals from the bundle and that other
known production strings (`/api/v1/customer/auth/delete-account`,
`PinEntrySheet`, `Save up to`, etc.) DO appear, so the absence of the
diagnostic prefixes is meaningful, not a tooling miss.

**Artefacts.**

- Production bundle: `_expo/static/js/ios/entry-007c97b6c301ecb294086ca78662a05a.hbc`
  (8.67 MB, generated 2026-05-10)
- Stripped strings: `[api.refresh] body shape:`, `[api.refresh] response status:`

**Status.** ✅ Closed. The `__DEV__` guard correctly strips the diagnostic
logs from release builds. Logs remain available in dev (Metro / Expo Go)
where they are needed for the §Y / §AC auth-rotation debugging path.

---

## When to add a row

- New `__DEV__` block lands in `apps/customer-app/`
- New debug-only feature flag (e.g. `process.env.DEBUG_X`)
- New diagnostic logger, profiler, or instrumentation that should not ship

If the verification finds the string IN the production bundle, that is a
release-build bug — investigate the guard, do not just delete the row.
