# §DF-v2-j Route Boundary + Memo Audit

**Date:** 2026-05-26
**Author:** Implementer (Claude, Opus 4.7) under owner direction
**Workstream:** §DF-v2-j + §DF-v2-i (atomic bundle)
**Spec:** `docs/superpowers/specs/2026-05-26-locationcontext-parity-design.md` v1.1 §4.2 / §4.3
**Plan:** `docs/superpowers/plans/2026-05-26-locationcontext-parity.md` Task 0
**Decision lock:** **Variant (a) — route-level resolve.** **No standalone memo helper built.**

---

## 1. Purpose

Spec amendments 3 + 4 (owner review 2026-05-26) require an explicit audit of:

1. The Search route boundary — the user-facing endpoint combines `searchMerchants` + `searchBranches`; the `locationContext` envelope must ride ONCE at the route response root, not duplicated per inner service.
2. The request-scope memo integration shape — the contract is request-scoped uniqueness (D7), but pure service helpers must NOT gain `FastifyRequest` parameters just to satisfy memoization.

This audit locks the integration variant before any implementation code is written (Tasks 1–11 inherit the lock).

---

## 2. Route inventory (re-read 2026-05-26)

Routes registered in [src/api/customer/discovery/routes.ts](../../src/api/customer/discovery/routes.ts):

| Route | Handler line | Handler shape | Merge / response shape |
|---|---|---|---|
| `GET /api/v1/customer/home` | L48 | single service call (`getHomeFeed`) | `reply.send(feed)` — service returns the full payload object; route does no merging today |
| `GET /api/v1/customer/merchants/:id` | L65 | single service call (`getCustomerMerchant`) | `reply.send(merchant)` — service returns the full payload object |
| `GET /api/v1/customer/search` | L116 | `Promise.all([searchMerchants, searchBranches])` | `reply.send({ ...merchantResult, branches, totalBranches, branchMeta })` — route handler spreads + merges |
| `GET /api/v1/customer/categories/:id/merchants` | L149 | `Promise.all([getCategoryMerchants, getCategoryBranches])` | route handler spreads + merges (same pattern as `/search`) |
| `GET /api/v1/customer/discovery/in-area` | L216 | `Promise.all([getInAreaMerchants, getInAreaBranches])` | `reply.send({ ...merchantResult, branches })` — route handler spreads |

Notes:

- The route handlers are the natural envelope-injection point in every case. 3 of 5 already perform a merge in the handler; the 2 single-service ones (`/home`, `/merchants/:id`) own the response payload via `reply.send(...)` directly.
- `getCustomerMerchant` returns a merchant payload — confirmed no `locationContext` key collision (the existing payload uses keys like `id`, `businessName`, `tradingName`, `branches`, `vouchers`, `selectedBranch`, `meta`, etc.).
- `getInAreaMerchants` returns an object spread by the route (`...merchantResult`) — adding `locationContext` as a new key at the route level is collision-free.
- `searchMerchants` returns an object also spread by the route (`...merchantResult`); same collision-free additivity.

## 3. Current `resolveLocationContext` invariants (pre-§DF-v2-i)

[src/api/customer/discovery/service.ts:109-151](../../src/api/customer/discovery/service.ts) — current implementation:

- **Coordinates branch (L115-127):** if `lat !== null && lng !== null`, returns `source='coordinates'` with the nearest Locality (or null if no nearest match).
- **Profile-by-localityId branch (L128-139):** if user has `localityId`, returns `source='profile'` with the locality, even if `lat`/`lng` are null.
- **Profile-by-city-text branch (L140-148):** if user has `city` text (no `localityId`), tries `findFirst` on Locality.name; failing that, returns `source='profile'` with the bare `city` text and `locality: null`.
- **None branch (L150):** `source='none'`.

The helper is currently NOT exported (file-private `async function`).

Helper return type:
```ts
{ locality: { id: string; name: string } | null;
  city:     string | null;
  lat:      number | null;
  lng:      number | null;
  source:   'coordinates' | 'profile' | 'none' }
```

Wire envelope (per [discovery.ts:189-200](../../apps/customer-app/src/lib/api/discovery.ts)) is the 3-field subset: `{ city, source, locality }` — `lat`/`lng` are stripped on emit. `getHomeFeed` performs the strip explicitly at [service.ts:1750](../../src/api/customer/discovery/service.ts):

```ts
locationContext: { city: locationCtx.city, source: locationCtx.source, locality: locationCtx.locality },
```

The strip pattern is repeated for Tasks 4-6 — each route handler injects the same 3-field shape.

## 4. Variant decision (locked)

**Variant (a) — route-level resolve.**

For each of the 4 routes shipping `locationContext` in §DF-v2-j (Home / Search / In-area / Merchant Profile):

1. Route handler resolves the envelope once at the top via `resolveLocationContext(prisma, userId, lat, lng)`.
2. Route handler strips to the 3-field wire shape `{ city, source, locality }`.
3. Route handler injects into the response root.

**Implementation consequences:**

- `resolveLocationContext` MUST be exported from the service module — currently `async function`, becomes `export async function`. Task 1 (the §DF-v2-i tighten) keeps it as a file-private helper logically, but Task 2 promotes its visibility.
- The `LocationContext` type (the helper's full return type, plus a 3-field `LocationContextWire` if useful) should be exported alongside so route handlers and downstream consumers reference one source of truth.
- `getHomeFeed` migrates to receive `locationContext` from the route handler (Task 2). The strip is hoisted up to the route handler too — `getHomeFeed` no longer needs to know about wire shape.

**Why (a) over (b) — resolve in upper-most service:**

- Variants (b) and (c) require pushing wire-shape concerns into service helpers, OR creating a wrapper service per route. Both are heavier than the route-handler approach.
- Route handlers are where Fastify wire concerns belong. Services stay focused on business logic.
- The merge of `merchantResult` + `branches` + `branchMeta` already happens at the route handler for `/search` + `/in-area` + `/categories/:id/merchants`. Adding `locationContext` to the same merge is natural.

**Why no `FastifyRequest` argument anywhere:**

- The helper signature `resolveLocationContext(prisma, userId, lat, lng)` is pure-functional from a Fastify-coupling perspective. It already uses only `prisma` + 3 scalar args. No request needed.
- Per amendment 4 + D7: pure service helpers don't gain `FastifyRequest` parameters. Variant (a) preserves this.

## 5. Memo decision (locked)

**No standalone memo helper is built in this PR.**

Reasoning:

- Variant (a) resolves `locationContext` exactly once per request (at the top of each route handler), then injects the resolved value into both the response root AND any service that needs the underlying location anchor.
- Each of the 4 routes resolves the envelope exactly once on the request hot path. The spec D7 contract ("same request + same `(userId, lat, lng)` triple → resolves once") is satisfied by construction, not by an explicit memoization layer.
- Building a memo helper purely to satisfy the contract — when no current call path duplicates the resolution within a single request — is YAGNI.

**Future-flag (not a deferred follow-up; just a watch-point):**

- If a future feature introduces a code path where the same Fastify request resolves `locationContext` more than once (e.g. a middleware + a service both resolve independently), revisit the memo decision then. The most defensive approach in that future is to thread the already-resolved value through the new code path (variant (a) discipline), not to add a memo helper retrospectively.
- No new deferred follow-up filed for this — variant (a) is robust to the foreseeable future cases.

## 6. `getHomeFeed` migration (Task 2)

`getHomeFeed` currently calls `resolveLocationContext` internally at [service.ts:1427](../../src/api/customer/discovery/service.ts) and strips to wire shape at [service.ts:1750](../../src/api/customer/discovery/service.ts).

Migration plan (Task 2):

1. Add a required `locationContext: LocationContext` field to `getHomeFeed`'s `options` parameter.
2. Remove the internal `await resolveLocationContext(...)` call at L1427.
3. Remove the wire-shape construction at L1750; route handler builds it instead.
4. `/home` route handler at routes.ts:48 resolves the envelope, strips to wire shape, calls `getHomeFeed({ userId, lat, lng, locationContext })`, then sends the feed with the envelope injected at the response root.

Backwards compatibility: `getHomeFeed` is called from exactly one caller (the `/home` route handler). No external compat concern.

## 7. `LocationContext` type export shape

Task 2 should export from `src/api/customer/discovery/service.ts`:

```ts
export type LocationContext = {
  locality: { id: string; name: string } | null
  city:     string | null
  lat:      number | null
  lng:      number | null
  source:   'coordinates' | 'profile' | 'none'
}
```

And the route handlers strip to the wire shape inline at emit time:

```ts
const wire = { city: locCtx.city, source: locCtx.source, locality: locCtx.locality }
return reply.send({ ...payload, locationContext: wire })
```

Alternative: export a `toLocationContextWire(ctx: LocationContext): LocationContextWire` helper to DRY the strip across 4 route handlers. Plan Task 2 will decide between inline strip vs helper based on call-site clarity.

## 8. Acceptance criteria for downstream tasks (binding)

For Tasks 1, 2, 4, 5, 6 (backend) and the integration pins:

1. **Routes resolve `locationContext` exactly once per request** via `resolveLocationContext(prisma, userId, lat, lng)` at the top of each route handler.
2. **`getHomeFeed`, `getCustomerMerchant` receive the resolved value** as an `options.locationContext` argument — they do NOT call `resolveLocationContext` internally.
3. **Wire-shape strip happens at the route handler**, not in any service helper.
4. **Response root** includes `locationContext: { city, source, locality }` on all 4 routes (Home / Search / In-area / Merchant Profile).
5. **No service helper gains a `FastifyRequest` parameter.**
6. **No standalone memo helper is created.**
7. **`resolveLocationContext` is exported** from the service module (was file-private).
8. **`LocationContext` type is exported** alongside the helper.

## 9. Out of scope (audit boundary)

- `/categories/:id/merchants` (L149) is NOT in §DF-v2-j scope per spec §4.2 (although the spec calls out adding `locationContext: locationContextSchema.optional()` to the client schema in §5.3 — that's defensive forward-compat for a future backend emit, not part of this PR's backend work).
- Voucher Detail (`/vouchers/:id` at L86) is deferred to §DF-v2-o per spec D11. Audit confirms the route currently has NO `lat`/`lng` query plumbing — restoring it is a §DF-v2-o concern, NOT this PR.
- Memo benchmark / load test — out of scope; variant (a) makes memoization unnecessary.

## 10. Risk register (audit-scope only)

| ID | Risk | Mitigation |
|---|---|---|
| **A1** | Exporting `resolveLocationContext` creates a public API surface for the service module that downstream code could couple to in ways we don't intend. | Mitigated: the export is `internal-customer-facing` only (route handlers in the same package). No type re-export to the customer-app or merchant-api packages. If future leakage emerges, switch to a barrel re-export pattern. |
| **A2** | `getCustomerMerchant`'s payload could grow a `locationContext` key in some future commit, colliding with the route-level injection. | Mitigated: Task 6 grep confirms no current collision. Any future addition would surface in test pins immediately. |
| **A3** | Variant (a) means 4 route handlers each repeat 1-2 lines of resolve + strip boilerplate. | Acceptable: 1-2 lines × 4 routes = 4-8 lines total. A DRY helper is over-engineering for this scale. Plan Task 2 will decide on inline vs helper based on readability. |
| **A4** | If a future PR introduces a middleware that pre-resolves `locationContext` and passes via `request.locationContext`, route handlers would double-resolve unless updated to read the pre-resolved value. | Future-flag only; not a deferred follow-up. Handle if/when it surfaces. |

## 11. Sign-off

Variant (a) — route-level resolve — is the locked integration pattern for §DF-v2-j. No memo helper is built. Tasks 1-11 of the implementation plan inherit this lock.

Proceed to Task 1 (§DF-v2-i atomic fix) per the plan.
