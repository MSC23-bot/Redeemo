# Branch Location Trust Model — Spec (owner-approved 2026-07-09)

**Status:** APPROVED by owner 2026-07-09 (conversation decision; supersedes the Branches PR-6
"suggestion is admin-review metadata only" security invariant by deliberate owner direction).
**Tier:** 3 (schema change + trust-policy change + locked-contract adjustment).
**Slice plans:** Slice 1 = `docs/superpowers/plans/2026-07-09-branch-location-trust-slice-1.md`.

## 1. Problem

Exact branch pins currently require an admin to manually confirm every location
(`confirmBranchLocation` → `MANUALLY_CONFIRMED`), and the customer Map shows ONLY
manually-confirmed pins. Yet the merchant portal already fetches the exact Google Places
pin (place ID + lat/lng) when a merchant picks their business from Google search: it is
stashed server-side for 15 minutes, used to autofill address text, then discarded
(Branches PR-6 §4b staged it as audit metadata only). Result: duplicated human work and
merchants missing from the Map.

## 2. Owner-approved model

Let Google do the work; auto-verify with cross-checks; humans handle exceptions only.

1. **Persist the Google pin at apply time.** When a branch create/edit applies a Google
   candidate token, the resolved `{ placeId, latitude, longitude }` is applied to the
   Branch (not discarded).
2. **Auto-trust only when it cross-checks.** Two server-side checks:
   (a) postcode parsed from the Google candidate's formattedAddress matches the
   merchant-entered postcode (normalised);
   (b) the Google pin lies within a sanity radius of the merchant-entered postcode's
   centroid (`LOCATION_TRUST_RADIUS_METRES = 1000`).
   Both pass → branch gets the exact Google coords, `locationConfidence = ADDRESS_GEOCODED`,
   `googlePlaceId` stored. Any check fails (or centroid unresolvable) → branch keeps the
   postcode-centroid behaviour of today, is stamped `NEEDS_REVIEW`, and the Google
   suggestion stays staged as admin-review metadata (existing PR-6 lane) for the exception
   queue.
3. **Customer exposure widens by exactly one tier.** `exposeBranchPosition` and the
   server-side position gate accept `MANUALLY_CONFIRMED` + `ADDRESS_GEOCODED`. The Map
   in-area queries match both. `POSTCODE_CENTROID` and `NEEDS_REVIEW` remain fully
   redacted (LOCKED: never show a fake-exact pin; unchanged from PR #81).
4. **Admins never re-enter locations.** `confirmBranchLocation` (→ `MANUALLY_CONFIRMED`)
   survives purely as the correction/override authority. The admin approval screen shows
   the pin on a mini-map with a provenance badge: "Google-verified (unreviewed)" for
   ADDRESS_GEOCODED · "Human-confirmed" for MANUALLY_CONFIRMED · "Needs review" for the
   exception queue. Approving the merchant IS the human glance; no data entry.
5. **No-Google-listing merchants** get a merchant-portal mini-map pin-drop constrained to
   within the entered postcode area (outside → NEEDS_REVIEW). (Slice 3.)
6. **Backfill**: one-time script re-matches existing non-confirmed branches against Google
   Places by name + address, auto-upgrades on the same cross-checks, queues the rest.
   Owner-gated run (billable Google calls). (Slice 4.)

Unchanged forever: the customer-postcode fallback for GPS-less users (locates the USER,
not the branch); the POSTCODE_CENTROID redaction lock.

## 3. Slices

| Slice | Scope | Surface |
|---|---|---|
| 1 | Schema (`googlePlaceId`), Layer-1 stash carries parsed postcode, trust pipeline on branch CREATE, gate widening (expose + map queries), customer-app confidence-string audit | backend + customer-app grep |
| 1b | Same pipeline on the reviewed-edit APPLY lane (address edits) | backend (editApplier) |
| 2 | Admin approval mini-map + provenance badges + NEEDS_REVIEW queue surfacing | admin-web |
| 3 | Merchant-portal pin-drop (no Google listing path) with postcode-area constraint | merchant-web + backend |
| 4 | Backfill script + runbook (owner-gated run) | script |

## 4. Invariants (new locked set)

- L1: Client NEVER sends lat/lng/placeId; the candidate-token flow stays the only wire path.
- L2: `ADDRESS_GEOCODED` is set ONLY by the server-side cross-check pipeline; `MANUALLY_CONFIRMED`
  ONLY by `confirmBranchLocation`. No other writer may set either.
- L3: `POSTCODE_CENTROID` and `NEEDS_REVIEW` branches never expose lat/lng to customers.
- L4: A failed cross-check must degrade to exactly today's behaviour plus the NEEDS_REVIEW stamp
  (no partial application of Google coords).
