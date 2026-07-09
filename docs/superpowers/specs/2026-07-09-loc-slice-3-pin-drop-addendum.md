# Branch Location Trust Slice 3: Merchant Pin-Drop Addendum

**Status:** APPROVED (2026-07-09). Lead adjudication of the DECISIONS section (D-L1..D-L8)
and owner sign-off on the owner-gated subset (D-O1..D-O5) are both recorded in the new
OWNER + LEAD DECISION OUTCOMES section below. The scoped L1 amendment (§4.1) and the new
`LocationConfidence.MERCHANT_CONFIRMED` value are ratified for implementation. Backend
implementation: `feat/branch-location-trust-slice-3-backend` (PR-1).
**Parent spec:** `docs/superpowers/specs/2026-07-09-branch-location-trust-model.md`
(APPROVED 2026-07-09). This addendum does NOT edit the approved spec; it proposes a
scoped amendment to invariant L1 and a new `LocationConfidence` value, both of which
the parent spec must ratify before implementation.
**Tier:** 3 (schema enum change + a locked-invariant amendment + a new client-coordinate
wire path). Implementation plan: `docs/superpowers/plans/2026-07-09-branch-location-trust-slice-3.md`.
**Register:** `docs/deferrals/open-register.md` §LOC-3.

---

## 0. Scope recap (parent spec §2 point 5)

> No-Google-listing merchants get a merchant-portal mini-map pin-drop constrained to
> within the entered postcode area (outside the area to NEEDS_REVIEW).

Slices 1/1b/2 already cover the merchant who CAN pick a Google listing: their pin
auto-trusts to `ADDRESS_GEOCODED` on a passed cross-check, or stages `NEEDS_REVIEW`.
Slice 3 is the fallback for the merchant whose business is NOT on Google (new premises,
market stall, home-run service, a listing Google has geocoded to the wrong spot). Today
that merchant saves at `POSTCODE_CENTROID` and is invisible on the customer Map. Slice 3
lets them assert an exact pin, server-verified to sit within their own postcode area.

---

## 1. Design summary

A new authenticated merchant endpoint accepts a merchant-dropped pin for an EXISTING
branch, verifies server-side that the pin sits within `LOCATION_TRUST_RADIUS_METRES`
(the existing 1000 m constant) of the branch's entered-postcode centroid, and:

- inside the radius: writes the pin as the branch's exact coordinates with a NEW
  confidence value `MERCHANT_CONFIRMED` (joins the customer-visible confirmed set);
  `googlePlaceId` stays null (there is no Google place);
- outside the radius (or centroid unresolvable): the branch keeps its
  `POSTCODE_CENTROID` coordinates, is stamped `NEEDS_REVIEW`, and the dropped pin is
  staged as an admin-review suggestion with a distinct source `merchant_pin_drop`,
  reusing the exact `locationSuggestionMetadata` staging lane the Google path uses.

This is the Google path's PASS/FAIL shape, with two deliberate differences: the trust
derivation is a single radius check (no Google-postcode cross-check, because there is no
Google place), and the resulting confidence value is distinct so the two provenances are
never conflated.

### 1.1 Endpoint shape (recommended)

`POST /api/v1/merchant/branches/:id/pin-drop`

```
body: { latitude: number, longitude: number }   // zod-bounded; see §4.2
```

- Branch-scoped: the branch must already exist. The endpoint resolves the branch, reads
  its stored `postcode`, re-resolves the postcode CENTROID server-side via the existing
  `resolvePostcode` helper (the branch's own stored lat/lng may already be an exact pin,
  so it cannot be reused as the centroid), and runs the radius check against that
  centroid.
- Auth: `resolveMerchantContext` + `assertCanManageBranch` (OWNER any branch, assigned
  BRANCH_MANAGER; STAFF denied; keeps the SEC-M2 suspended guard). Mirrors the existing
  branch-management WRITE boundary.
- Writer authority: this endpoint is the SOLE writer of `MERCHANT_CONFIRMED` (the L2
  analogue for the new tier). It never writes `ADDRESS_GEOCODED` or `MANUALLY_CONFIRMED`.

Why a separate endpoint rather than resurrecting `latitude`/`longitude` on the branch
create/edit bodies (which today accept-then-DROP them): a single dedicated endpoint keeps
the L1 amendment minimal (exactly one wire path accepts client coordinates) and keeps the
create/edit zod bodies free of client coordinates. The create flow chains create then
pin-drop (§5); it does not carry coordinates through create.

### 1.2 Why not reuse the create body's inline pipeline

`createBranchCore` runs the Google cross-check inline because the Google suggestion is a
server-held stash (resolved from a candidate token, coordinates never on the wire). A
merchant pin-drop is the OPPOSITE: the coordinates ARE the wire payload. Folding it into
create would (a) reintroduce client coordinates into the create body, widening the L1
amendment to two paths, and (b) require the branch centroid at create time before the row
exists. The separate post-create endpoint avoids both.

---

## 2. The new `LocationConfidence.MERCHANT_CONFIRMED` value (item 1)

### 2.1 Recommendation: ADD the value. (Agree with the lead, with a caveat in §3.)

The `LocationConfidence` enum today is `{ MANUALLY_CONFIRMED, ADDRESS_GEOCODED,
POSTCODE_CENTROID, NEEDS_REVIEW }`. Add a fifth value `MERCHANT_CONFIRMED` and make it a
member of the customer-visible `CONFIRMED_LOCATION_SET`.

Rationale (endorsing the lead):

- L2 stays clean: one writer authority per confidence tier. `crossCheckGoogleLocation`
  owns `ADDRESS_GEOCODED`; `confirmBranchLocation` owns `MANUALLY_CONFIRMED`; the new
  pin-drop endpoint owns `MERCHANT_CONFIRMED`. No tier gets a second writer.
- Fraud-audit distinguishability: a merchant-asserted pin (one radius check, entirely
  self-supplied) is a materially weaker trust derivation than a Google-verified pin
  (Google's own geocode + a postcode-string match + the radius check). Keeping them as
  distinct enum values means an admin, an analyst, or a future backfill/audit can tell a
  self-asserted pin from a Google-verified one at a glance, forever, in the column itself.
  `googlePlaceId IS NULL` is a partial discriminator, but it also holds for
  `MANUALLY_CONFIRMED` admin pins, so it does not cleanly separate the three confirmed
  provenances; the enum value does.

### 2.2 Alternative considered and rejected: reuse `ADDRESS_GEOCODED`

Zero migration, zero serializer/zod churn. Rejected because:

- It gives `ADDRESS_GEOCODED` a SECOND writer (the pin-drop endpoint), directly
  contradicting invariant L2 ("`ADDRESS_GEOCODED` is set ONLY by the server-side
  cross-check pipeline"). The pin-drop is a DIFFERENT check (radius only), so labelling
  its output `ADDRESS_GEOCODED` is a category error.
- It conflates two trust strengths under one label, erasing the fraud-audit signal.
- The parent spec's badge copy "Google-verified (unreviewed)" would then be applied to
  pins that Google never verified: an incorrect, trust-inflating label.

### 2.3 Alternative considered and rejected: reuse `MANUALLY_CONFIRMED`

`MANUALLY_CONFIRMED` means "a human admin looked and confirmed". A merchant self-asserting
their own pin is NOT an admin confirmation; labelling it so would inflate trust and give
`confirmBranchLocation` a second (merchant-controlled) writer. Rejected.

### 2.4 Every touchpoint the new value adds (enumerated concretely)

Verified by grep on 2026-07-09 against origin/main HEAD (0d137eed).

Backend (schema + trust set):

1. `prisma/schema.prisma` enum `LocationConfidence` (line ~1866): add `MERCHANT_CONFIRMED`.
   Migration: Postgres `ALTER TYPE "LocationConfidence" ADD VALUE 'MERCHANT_CONFIRMED'`
   (additive; see §6).
2. `src/api/shared/location.ts` `CONFIRMED_LOCATION_SET` (line 33): add
   `'MERCHANT_CONFIRMED'`. This is the SINGLE point that makes the value customer-visible
   everywhere that consumes the constant or `isBranchLocationConfirmed`.

Backend customer-exposure gates (these consume the constant; adding to the set is
sufficient, NO per-site literal edit needed, verified):

3. `src/api/customer/discovery/service.ts`: `exposeBranchPosition` (line ~79 reads
   `b.locationConfidence` then defers to the set via `isBranchLocationConfirmed`); the
   companion distance gate; the four Map/bbox where-filters at lines 2880, 3599, 4488,
   4639 (all `{ in: [...CONFIRMED_LOCATION_SET] }`). No literal change; they widen
   automatically. Task 6 of the plan pins this with tests.
4. `src/api/lib/ranking.ts`: `classifyRung` gates on `isBranchLocationConfirmed` (line
   332), so ranking widens automatically. BUT two TS union literal types hardcode the
   four values (lines 283, 408): they MUST gain `| 'MERCHANT_CONFIRMED'` or a
   `MERCHANT_CONFIRMED` row will not type-check at the call sites that build ranking
   input. Compile-time only.

Backend trust pipeline + endpoint:

5. `src/api/merchant/branch/locationTrust.ts`: add a pure `pinWithinPostcodeArea(...)`
   radius-only helper (reuses `haversineMetres` + `LOCATION_TRUST_RADIUS_METRES`), OR
   extend the module. Keeps the pure-check-in-one-module pattern (L2 style).
6. `src/api/merchant/branch/service.ts`: new `dropBranchPin(...)` core (writer of
   `MERCHANT_CONFIRMED`); reuses `resolveBranchLocationFields`/`resolvePostcode` for the
   centroid and `locationSuggestionMetadata` for the FAIL staging (with `source:
   'merchant_pin_drop'`).
7. `src/api/merchant/branch/routes.ts`: the `POST .../:id/pin-drop` route + its zod body
   + the new rate-limit tier (§4.3).

Backend admin serializer (the FAIL path stages a suggestion the admin panel reads):

8. `src/api/admin/approvals/reviewBranchSerializer.ts`: `ReviewLocationSuggestionSource`
   union (line ~20) gains `'merchant_pin_drop'`; `locationSuggestionMetadata`'s `source`
   literal type in `service.ts` widens to include it. The pending-edit/audit read logic
   already tolerates any string source; only the type union and the panel source-line
   copy need the new arm.

Admin-web:

9. `apps/admin-web/features/shared/locationProvenance.tsx`: add a `MERCHANT_CONFIRMED`
   entry to `PROVENANCE` (proposed label "Merchant-set pin", tone `info` or a distinct
   tone; icon `MapPinned`/`MapPin`), and include it in `isLocationTrusted` (it IS
   customer-visible / satisfies the go-live location gate). Owner/lead to lock the badge
   copy.
10. `apps/admin-web/lib/api/*` zod enums that list confidence values: `branches.ts`,
    `review.ts` (line 89 `source` enum gains `'merchant_pin_drop'`), `merchants.ts`,
    `branchLifecycleReview.ts`. Additive.

Merchant-web:

11. `apps/merchant-web/lib/api/branch.ts` (line 171): `locationConfidence` enum gains
    `'MERCHANT_CONFIRMED'`.
12. `apps/merchant-web/components/branches/sections/LocationCard.tsx`: the confidence
    badge currently reads `confirmed = locationConfidence === 'MANUALLY_CONFIRMED'`
    ONLY. It must treat `MERCHANT_CONFIRMED` (and, arguably, the already-live
    `ADDRESS_GEOCODED`) as confirmed/green. This is a pre-existing gap the new value
    surfaces; fix it as part of Slice 3.
13. `apps/merchant-web/components/branches/AddBranchModal.tsx` + the branch-details edit
    modal + a NEW pin-drop map component: the UX seam (§5).

Customer-app (the forward-compat hazard, see §3.3):

14. `apps/customer-app/src/lib/api/discovery.ts` (line 86): `branchLocationConfidenceSchema
    = z.enum([...4 values])` MUST gain `'MERCHANT_CONFIRMED'` OR be loosened to
    `z.string()` (as `favourites.ts` already is). A `MERCHANT_CONFIRMED` branch reaching
    an OLD app build's discovery payload would FAIL zod parse and break the feed.
15. `apps/customer-app/src/lib/api/favourites.ts`: already `z.string()`; comment-only.

Count: 2 hard schema/set changes, ~7 backend type/serializer/endpoint files, 4 admin-web
files, 3 merchant-web files, 1 customer-app hard change (the release-ordering hazard). The
gate BEHAVIOUR widens through one constant; the churn is almost entirely type unions and
zod enum tuples, plus the customer-app release-ordering constraint in §3.3.

---

## 3. Where this design diverges from or sharpens the lead's positions

### 3.1 `MERCHANT_CONFIRMED` is trust-weaker than `ADDRESS_GEOCODED`: name and treat it so

Agree it joins the customer-visible set, but it should be understood as the WEAKEST member
of that set. The Google path has two independent signals (Google's geocode + postcode
match) plus the radius; the pin-drop has only the radius. The customer-facing consequence
is bounded (§4.4), so joining the set is acceptable, but the admin label should NOT imply
verification: propose "Merchant-set pin", never "verified". Lead to lock copy.

### 3.2 Consider a tighter pin-drop radius (lead-adjudicable, recommend keep 1000 m)

`LOCATION_TRUST_RADIUS_METRES = 1000` exists as a Google-geometry SANITY bound (Google can
return route-level or approximate geometry up to ~1 km off). A deliberate merchant
pin-drop is an assertion of precision, so a case exists for a tighter radius (for example
500 m) to shrink the self-placement abuse window. Recommendation: REUSE the 1000 m constant
in v1 for single-source consistency (the lead's position 2), and revisit only if abuse is
observed. Flag as lead-adjudicable, not owner-gated.

### 3.3 Customer-app release-ordering is a genuine hazard, not a footnote

`apps/customer-app/src/lib/api/discovery.ts` parses `locationConfidence` with a CLOSED
`z.enum` of four values. The moment a `MERCHANT_CONFIRMED` branch appears in a discovery
payload it becomes customer-visible (it is in `CONFIRMED_LOCATION_SET`), and every
ALREADY-INSTALLED app build older than the enum widening will FAIL to parse that payload,
degrading the feed. App builds ship through the store on a slow cadence; the backend ships
in hours. Therefore the write of `MERCHANT_CONFIRMED` must NOT go live before the app's
parse tolerance is in the field.

Mitigation options (lead to pick, plan supports both):

- (A) Loosen `discovery.ts` `branchLocationConfidenceSchema` to `z.string()` (matching the
  already-loosened `favourites.ts`) and ship that ahead, so unknown future values never
  break parse. Cheapest and most durable; recommended.
- (B) Gate the pin-drop WRITE behind a feature flag (default dark) until app adoption of
  the enum widening crosses a threshold, then enable.

Recommend (A) as a standing forward-compat hardening PLUS shipping the explicit enum
value; (B) as the belt-and-braces if the owner wants the write dark until adoption.

---

## 4. The scoped L1 amendment + fraud analysis (item 2)

### 4.1 Proposed amendment text (for the parent spec to ratify)

> L1 (amended, Slice 3): The Google candidate-token flow remains the only wire path for
> Google place coordinates and placeId; clients NEVER send a placeId, and NEVER send
> coordinates on any branch create/edit body. The SINGLE exception is the dedicated
> merchant pin-drop endpoint (`POST /api/v1/merchant/branches/:id/pin-drop`), which
> accepts a zod-bounded `{ latitude, longitude }`. The server does not trust those
> coordinates as confirmed: it independently resolves the branch's postcode centroid and
> admits the pin as `MERCHANT_CONFIRMED` ONLY when the pin lies within
> `LOCATION_TRUST_RADIUS_METRES` of that centroid; otherwise the pin is staged as an
> admin suggestion and the branch is stamped `NEEDS_REVIEW` (the L4 degrade shape). No
> other endpoint accepts client coordinates.

Note this preserves the placeId half of L1 unchanged (a pin-drop has no placeId), and
preserves L3/L4 verbatim: a FAIL keeps `POSTCODE_CENTROID` coordinates and stamps
`NEEDS_REVIEW`; `POSTCODE_CENTROID`/`NEEDS_REVIEW` never expose lat/lng to customers.

### 4.2 Input validation (zod)

```
latitude:  z.number().gte(49).lte(61)     // UK bounding box (approx)
longitude: z.number().gte(-8.7).lte(2.0)
```

Bounding to the UK box is a cheap first filter; the authoritative gate is the radius check
against the postcode centroid. Reject non-finite / NaN (zod `z.number()` already rejects
NaN). The radius check makes the exact box bounds non-load-bearing, so keep them generous.

### 4.3 Rate limiting

The pin-drop endpoint issues a `resolvePostcode` call (postcodes.io) per request to obtain
the centroid, so it shares the postcodes.io-budget concern that `postcodePreview` guards.
It is an AUTHENTICATED, low-frequency WRITE (a merchant sets a pin once per branch, with
occasional re-adjustment), so:

- Recommend a NEW tier `branchPinDrop`, keyed per MERCHANT/user (`req.user.sub`), not per
  IP (a NAT/CGNAT-shared office must not collectively starve). Suggested `prod { max: 10,
  timeWindow: '1 minute' }`, `dev { max: 100, '1 minute' }`. Ten drops/min/merchant is far
  above any legitimate cadence and bounds both postcodes.io spend and self-placement
  fuzzing.
- Alternative: reuse the existing `postcodePreview` tier (30/min). Recommend the new,
  tighter, per-user tier because this is a write with a durable state effect, unlike the
  read-only preview. Lead-adjudicable; either is safe.

The global 300/min backstop already applies on top.

### 4.4 Fraud analysis: what can a malicious merchant achieve?

Threat: a merchant wants their customer-facing Map pin somewhere OTHER than their true
premises (on top of a competitor, on a busy high street to look central, on a landmark).

- The pin is admitted only within `LOCATION_TRUST_RADIUS_METRES` (1000 m) of THEIR OWN
  entered-postcode centroid. So the achievable displacement is bounded: at most ~1 km, and
  only WITHIN their own postcode area. They cannot place a pin in a different town, a
  different postcode district, or an arbitrary map location; those all FAIL the radius
  check and route to `NEEDS_REVIEW` (admin review, not customer-visible).
- Comparison to the Google-pick path: the Google path is a STRICTLY SMALLER abuse surface.
  To get an exact pin there, the merchant must pick a REAL Google listing whose reported
  postcode matches theirs AND whose geometry is within 1 km. They cannot invent a location;
  they can only select an existing place. The pin-drop path lets them assert ANY point in
  the 1 km disc, so it is a larger surface, but still bounded to the same disc the Google
  path is sanity-checked against.
- Customer harm ceiling: a customer may be directed up to ~1 km to the wrong spot WITHIN
  the correct postcode area. Postcode areas are small (UK unit postcodes cover a handful of
  addresses; the 1 km disc is the sanity bound, not the postcode footprint), so real
  displacement is typically far under 1 km. The branch IS genuinely in that area (the
  postcode is theirs). This is low-severity: no different in kind from an admin
  `MANUALLY_CONFIRMED` pin being slightly wrong, and admin pins have NO radius bound at all.
- Redemption safety: unaffected. Redemption is in-store, PIN-gated (business rule 5); a
  misplaced Map pin cannot produce a fraudulent redemption. The pin affects discovery
  placement only.
- Residual: a merchant could nudge their pin toward a busier micro-location for marginal
  discovery advantage. Bounded, low-value, and detectable (the `MERCHANT_CONFIRMED` value +
  the `merchant_pin_drop` audit source make every self-set pin auditable). Acceptable for
  v1; note for the owner.

Conclusion: the fraud ceiling is "misplace my own pin by up to ~1 km within my own postcode
area", strictly bounded and lower-consequence than the existing admin-confirm path, with
full audit provenance. Acceptable.

---

## 5. UX seam (item 4)

### 5.1 Where pin-drop lives

- Primary trigger (matches spec §2.5): the merchant searched Google and found NO acceptable
  match. In `AddBranchModal` and the branch-details edit modal, when the Google
  search-and-pick yields nothing the merchant will use, surface a secondary affordance:
  "Can't find your business on the map? Set your location pin manually." This opens the
  pin-drop map.
- Because the pin-drop endpoint needs an EXISTING branch (to resolve its postcode
  centroid), the CREATE flow is a two-step chain: create the branch (saves at
  `POSTCODE_CENTROID`), then immediately open the pin-drop step on the new branch and call
  `POST .../:id/pin-drop`. The modal orchestrates both calls so it feels like one flow. For
  the onboarding first/main branch (instant-live) this is create-then-drop; for a staged
  subsequent branch the drop still applies (the branch row exists as `PENDING_CREATE`).
- EDIT flow (existing branch): the pin-drop map is reachable from `LocationCard`'s "Update
  location" area for a branch that is not already Google/admin-confirmed.

### 5.2 The "my Google listing's pin is wrong" case (scope decision, recommend DEFER)

The spec scopes Slice 3 to no-Google-listing merchants. A merchant whose Google-picked pin
auto-trusted to a slightly-wrong-but-in-radius spot might also want to correct it. Do NOT,
in v1, let a merchant silently OVERWRITE an existing `ADDRESS_GEOCODED` (Google-verified) or
`MANUALLY_CONFIRMED` (admin-verified) pin with a self-asserted `MERCHANT_CONFIRMED` one:
that is a trust DOWNGRADE masquerading as an edit, and it hands a merchant a lever to move a
verified pin. Recommendation: v1 pin-drop is admitted ONLY when the branch is currently
`POSTCODE_CENTROID` or `NEEDS_REVIEW` (not yet confirmed). Correcting a wrong VERIFIED pin
stays an admin action (`confirmBranchLocation`) or a `NEEDS_REVIEW` staging. Flag
"should merchants self-correct a wrong verified pin?" as an owner/lead question for a later
slice.

### 5.3 What the merchant sees about the constraint

- The map viewport is CENTRED on the branch's postcode centroid at a fixed zoom that frames
  roughly the 1 km sanity disc, with a visible shaded circle of radius
  `LOCATION_TRUST_RADIUS_METRES`. The constraint is thus VISUAL: the merchant sees the area
  their pin must stay within before they drag.
- Copy (no em-dashes, brand tone): "Drag the pin to your exact entrance. Keep it inside your
  postcode area (shown)." On a submit that lands outside (only reachable if the viewport is
  looser than the disc), the server returns the `NEEDS_REVIEW` outcome and the UI shows:
  "That looks outside [postcode]. We'll have someone check it before it goes on the map."
- The raw lat/lng are NEVER shown as numbers (consistent with `LocationCard`'s existing "You
  did not enter coordinates" stance; here they DID place a pin, so copy becomes "You set
  this pin on the map").

---

## 6. Migration + deploy notes

- Migration: `ALTER TYPE "LocationConfidence" ADD VALUE 'MERCHANT_CONFIRMED'`. Additive and
  safe; no data backfill. Prisma 7 generates this from the schema enum edit via `prisma
  migrate dev`. Note: `ALTER TYPE ... ADD VALUE` historically could not run inside a
  transaction block on older Postgres; Postgres 16 (our version) permits it, and Prisma's
  migration runner handles the statement. Confirm the generated migration is a single
  additive statement.
- Deploy ordering: §LOC-MIGRATE records FOUR migrations already pending the owner-gated
  PRODUCTION deploy window (dev + staging are current). This adds a FIFTH. It must ride the
  same owner-gated window; do not apply ad hoc (backend-api rule). The enum value must exist
  in the DB before any code path can write it.
- Customer-app forward-compat (§3.3) is the OTHER ordering constraint: ship the app parse
  tolerance ahead of enabling `MERCHANT_CONFIRMED` writes.

---

## 7. Map provider / CSP feasibility (item 3)

### 7.1 merchant-web CSP inventory (as shipped)

`apps/merchant-web/next.config.ts` sets blanket headers via
`apps/merchant-web/lib/securityHeaders.ts` (`buildContentSecurityPolicy`). Current CSP:

```
default-src 'self'
base-uri 'self'
object-src 'none'
frame-ancestors 'none'
script-src  'self' 'unsafe-inline' https://challenges.cloudflare.com [+ 'unsafe-eval' in dev]
style-src   'self' 'unsafe-inline'
img-src     'self' data: blob: https://*.r2.cloudflarestorage.com https://*.amazonaws.com
font-src    'self'
connect-src 'self' <NEXT_PUBLIC_API_URL origin> https://challenges.cloudflare.com [+ ws: in dev]
frame-src   https://challenges.cloudflare.com
```

The ONLY external hosts allowed today are Cloudflare Turnstile (captcha) and the R2/S3
image hosts (img-src). There is no map provider, no external tile host, no external script
host beyond Turnstile, and no `worker-src` directive (so `worker-src` falls back to
`script-src`, which does NOT permit `blob:` workers).

Existing dependencies: no map library is installed in merchant-web (grep found none). Any
option below adds either a client library, CSP hosts, or both.

### 7.2 Options

(a) Leaflet + OpenStreetMap raster tiles
- Library: `leaflet` is self-hosted (bundled into the Next self-origin bundle), so NO
  `script-src` change. Leaflet loads tiles as `<img>` elements.
- CSP change REQUIRED: add the OSM tile host(s) to `img-src`, i.e.
  `https://*.tile.openstreetmap.org` (or the `a./b./c.tile.openstreetmap.org` subdomains).
- OSM tile-usage policy: the openstreetmap.org tile servers are a COMMUNITY resource. Their
  Tile Usage Policy forbids heavy/commercial use without prior arrangement and requires,
  among other things, valid attribution and no use as a free CDN for a commercial product.
  Redeemo is a commercial product. Even at low merchant-only volume this is a policy risk;
  for production one should use a commercial raster tile provider (which then becomes option
  (b)-like: a provider host + likely a key). Do NOT ship openstreetmap.org tiles in
  production as-is.

(b) MapLibre GL + a vector-tile provider (MapTiler / Protomaps / Stadia)
- Library: `maplibre-gl` self-hosted (no `script-src` change). Renders via WebGL and spawns
  a web WORKER from a `blob:` URL.
- CSP changes REQUIRED: add `worker-src blob:` (currently absent; today blob-workers are
  blocked because `worker-src` falls back to `script-src`); add the provider host to
  `connect-src` (style JSON, vector tiles, glyphs, sprites are fetched) and to `img-src`
  (sprite images). `blob:` is already in `img-src`.
- New PAID provider + a client-exposed API key (referrer-restricted). New vendor
  relationship + billing.
- Most capable UX (smooth pan/zoom/vector) but the largest CSP surface and a new vendor.

(c) Google Maps JS API (Dynamic Maps)
- We already pay Google for Places, but Maps JS (Dynamic Maps) is a SEPARATE billable SKU
  with per-load pricing.
- CSP changes REQUIRED: add `https://maps.googleapis.com` to `script-src` (this is the
  FIRST external SCRIPT host beyond Turnstile: a meaningfully larger attack surface, since
  it executes third-party JS), plus `*.googleapis.com` / `*.gstatic.com` / `*.ggpht.com` to
  `img-src` and `connect-src`, plus `worker-src blob:`.
- The Maps JS API key is EXPOSED client-side by design (referrer-restricted). A new
  client-key-exposure model on the merchant surface.
- One provider (Google), but the heaviest CSP change (external script) and a new key model.

(d) Zero-CSP-change fallback: backend-proxied static map + HTML draggable pin overlay
- The backend adds an endpoint that fetches a STATIC map image (from a static-map provider)
  SERVER-SIDE and streams it from OUR origin. The merchant-web renders it as
  `<img src="/api/.../static-map?...">` (or via the merchant-web API origin already in
  connect-src / img-src 'self'), and overlays an HTML pin marker the merchant drags. The
  client computes lat/lng from the pin's pixel offset against the known image centre, zoom,
  and pixel dimensions (standard Web Mercator pixel-to-lat/lng math).
- CSP change: NONE. The image is same-origin (`img-src 'self'` already permits it, or the
  API origin already in the policy). No external script, no external tile host, no blob
  worker.
- Provider key: stays SERVER-SIDE (never exposed to the client). If the static-map provider
  is Google Static Maps API, it runs on the EXISTING Google account with a
  server-IP-restricted key: one provider, no new vendor, no client key exposure.
- UX trade-off: a FIXED viewport (no free pan/zoom). For THIS task that is arguably a
  FEATURE, not a limitation: the viewport is pinned to the postcode centroid at a zoom that
  frames the 1 km disc, so the merchant literally cannot drag outside their postcode area.
  It visually enforces the constraint (§5.3). For "drop your pin within a small area" this
  is a clean, honest UX.

### 7.3 Recommendation

Recommend (d): the backend-proxied static map with an HTML draggable-pin overlay.

- It is the ONLY option with ZERO CSP change, so it needs no owner/security CSP decision.
- It keeps the provider key SERVER-SIDE (no client key exposure), unlike (b) and (c).
- It sidesteps the OSM commercial-usage question entirely (unlike (a)).
- If the static-map provider is Google Static Maps, it is INCREMENTAL on the existing Google
  provider (no new vendor), calling a new SKU server-side.
- The fixed viewport is well-matched to a postcode-area-constrained pin-drop and reinforces
  the constraint visually.

The single owner-gated item it introduces is enabling the static-map SKU (a billable Google
API line) on the existing Google project; it does NOT touch the CSP and does NOT expose a
key to the browser.

Fallback if the owner declines a new Google SKU: option (a) Leaflet with a COMMERCIAL raster
tile provider (never the openstreetmap.org community servers in production), which then
requires the `img-src` CSP addition (an owner/security decision) plus the provider's key.

---

## 8. DECISIONS

### 8.1 Lead-adjudicable (no owner needed)

- D-L1: Ratify the scoped L1 amendment text (§4.1) into the parent spec on approval.
- D-L2: Confirm the new `MERCHANT_CONFIRMED` enum value + its membership in
  `CONFIRMED_LOCATION_SET` (§2), vs the rejected reuse alternatives.
- D-L3: Pin-drop radius: reuse `LOCATION_TRUST_RADIUS_METRES` (1000 m) vs a tighter value
  (§3.2). Recommendation: reuse 1000 m in v1.
- D-L4: Rate-limit tier: new per-user `branchPinDrop` (10/min) vs reuse `postcodePreview`
  (30/min) (§4.3). Recommendation: new per-user tier.
- D-L5: v1 pin-drop admitted ONLY for `POSTCODE_CENTROID`/`NEEDS_REVIEW` branches (no
  overwriting a verified pin) (§5.2). Recommendation: yes.
- D-L6: Customer-app forward-compat: loosen `discovery.ts` to `z.string()` (option A) as a
  standing hardening (§3.3). Recommendation: yes; optionally also flag-gate the write
  (option B) if the owner wants the write dark until app adoption.
- D-L7: Admin badge copy for `MERCHANT_CONFIRMED` (proposed "Merchant-set pin", tone info;
  never "verified") (§3.1).
- D-L8: Two-surface PR split (§ plan): PR-1 backend + all-client zod widening + admin
  provenance + customer-app tolerance; PR-2 merchant-web pin-drop UI. Recommendation: two
  PRs as described.

### 8.2 Owner-gated (genuinely owner decisions)

- D-O1 (CSP / map provider): Approve the map approach. Recommended option (d) needs NO CSP
  change. Options (a)/(b)/(c) each require a CSP loosening (new external img/script/connect
  hosts and/or `worker-src blob:`), which is a security-posture change on the merchant
  surface and is owner/security-gated.
- D-O2 (new provider / key + billable SKU): Recommended option (d) enables the Google Static
  Maps SKU on the EXISTING Google account (server-side key). This is a new billable Google
  API line: owner-gated. Options (b)/(c) additionally introduce a new vendor and/or a
  client-exposed key: owner-gated.
- D-O3 (OSM commercial-usage): If the owner prefers a Leaflet/OSM raster path, using the
  openstreetmap.org community tile servers for a commercial product is against the OSM Tile
  Usage Policy; a commercial tile provider (or explicit OSMF arrangement) is required. This
  is an owner/legal decision. Recommended path (d) avoids it.
- D-O4 (production migration window): the `MERCHANT_CONFIRMED` enum migration joins the four
  already-pending §LOC-MIGRATE migrations awaiting the owner-gated production deploy window.
- D-O5 (fraud acceptance): accept the bounded self-placement surface (§4.4: up to ~1 km
  within the merchant's own postcode area, in-store redemption unaffected, fully audited).
  Recommendation: accept for v1.

---

## 9. OWNER + LEAD DECISION OUTCOMES (approved 2026-07-09)

This section records the adjudicated outcomes; §8 above is the decision register it resolves.
Where an outcome differs from a §8 recommendation, the outcome is authoritative.

### 9.1 Owner-gated outcomes

- D-O1 (map approach): APPROVED. Backend-proxied Google Static Maps (§7 option (d)) plus a
  draggable HTML pin overlay. NO merchant-web CSP change. The Google key stays server-side
  (never exposed to the browser). Options (a)/(b)/(c) are NOT adopted.
- D-O2 (Static Maps SKU): APPROVED for staging/dev implementation with cost kept visible.
  The proxy is usage-capped mirroring `src/api/lib/googlePlaces.ts` (local daily + monthly
  caps, env-tunable); anything that would spend beyond that discipline is called out
  explicitly, never introduced silently.
- D-O3/enum (`MERCHANT_CONFIRMED`): APPROVED as the WEAKEST member of the customer-visible
  confirmed set. Admin label is "Merchant-set pin" (never "verified"). It is the L2-analogue
  writer-authority tier: written ONLY by the pin-drop endpoint.
- D-O5 (fraud posture): APPROVED. 1 km self-placement bounded to the merchant's OWN postcode
  area, audited (`merchant_pin_drop` provenance), rate-limited (per-user `branchPinDrop`),
  and no-downgrade (a verified pin can never be overwritten by a self-set pin).
- Production migrations stay owner-gated: the `MERCHANT_CONFIRMED` enum migration applies to
  DEV per the normal workflow and JOINS the production-pending §LOC-MIGRATE queue. It is
  NEVER deployed to production here.

### 9.2 Lead-adjudicable outcomes

- D-L1: RATIFIED. The scoped L1 amendment text (§4.1) is adopted: the pin-drop endpoint is
  the ONLY wire path that accepts client coordinates; placeId is still never client-sent;
  create/edit bodies still carry no coordinates.
- D-L2: CONFIRMED. `MERCHANT_CONFIRMED` added to the enum and to `CONFIRMED_LOCATION_SET`;
  the reuse alternatives (`ADDRESS_GEOCODED` / `MANUALLY_CONFIRMED`) are rejected.
- D-L3: reuse `LOCATION_TRUST_RADIUS_METRES` (1000 m) in v1 (single-source consistency).
- D-L4: new per-user `branchPinDrop` tier (10/min prod, relaxed dev), keyed on `req.user.sub`.
- D-L5: pin-drop admitted ONLY for `POSTCODE_CENTROID`/`NEEDS_REVIEW` branches; a verified
  pin (`ADDRESS_GEOCODED` / `MANUALLY_CONFIRMED` / `MERCHANT_CONFIRMED`) is never overwritten
  (typed `BRANCH_LOCATION_ALREADY_CONFIRMED` rejection).
- D-L6: customer-app forward-compat ships SEPARATELY (its own release, ahead of enabling the
  write). This backend PR does NOT touch `apps/customer-app`; the backend PR must merge
  strictly AFTER that app parse-tolerance fix is in the field (§3.3).
- D-L7: admin badge copy LOCKED to "Merchant-set pin", neutral-weak tone (never "verified").
- D-L8: two-surface PR split adopted. This is PR-1 (backend + admin-web zod/provenance +
  static-map proxy, DARK until the merchant-web UI consumes it in PR-2/sequence 3).

### 9.3 As-shipped notes (PR-1 backend)

- OWNER-only auth on the pin-drop + map-preview endpoints (this brief tightens the §1.1
  "OWNER or assigned BRANCH_MANAGER" recommendation to OWNER-only for v1).
- The static-map proxy endpoint is `GET /api/v1/merchant/branches/:id/map-preview`.
- Release ordering (hard): this PR MERGES strictly AFTER the customer-app enum tolerance fix.
