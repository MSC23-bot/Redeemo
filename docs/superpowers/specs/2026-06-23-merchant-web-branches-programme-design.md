# Merchant Portal: Branches Programme: Umbrella Design Spec (PR-1 to PR-8)

> Status: DRAFT (awaiting owner review + Codex review before any implementation plan)
> Tier: 3 (cross-surface; some slices schema-bearing)
> Date: 2026-06-23
> Surface owner: Merchant Portal (`apps/merchant-web`)
> Self-review: completed via a fresh 5-lens adversarial review (pre-commit) plus a Codex review round (3 amendments integrated 2026-06-23); verdict + change log in Section 13.
> Builds on: Staff & Access v1 (shipped on `main` 2026-06-22; provides `resolveMerchantContext`, `assertBranchAllowed`, membership roles).

---

## 0. Why this umbrella spec exists (read first)

Branches is a multi-slice programme, not a single PR. Several slices are schema-bearing and span three or four surfaces at once (backend, admin-web actioner, customer reads, merchant-web, and in one case the onboarding flow). The risk this document exists to prevent is the Branches module shipping a surface spine (PR-1) and then drifting into a pile of vague follow-ups that never converge on the prototype-faithful end-state.

This is one detailed umbrella spec. It locks:

- the prototype-faithful end-state and the module completion checklist;
- the slice sequence PR-1 through PR-8 and what "Branches is complete" means;
- decisions D1 to D9 from the owner-approved grill-me decision tree;
- the corrected live-code cross-check (so no future agent re-derives a wrong audit);
- every locked correction the owner issued during the decision tree.

It is intentionally detailed for PR-1 (the next slice to plan) and contextually complete for PR-2 to PR-8 (so future Claude/Codex agents do not lose context). Each later schema/governance slice (PR-4, PR-5, PR-6, PR-7, PR-8) still gets its own focused mini-spec and implementation plan when it is reached; this umbrella defines the contract those mini-specs must honour, not their full step-by-step.

Operating discipline for the whole programme (same as prior milestones): plan-first per slice; subagent-driven implementation with a fresh implementer and a fresh adversarial reviewer per PR; SHA-bound merge gates (never merge without explicit owner approval bound to the exact head SHA); stop-and-report on any schema/scope/security surprise.

---

## 1. First-class references

| Reference | Location | Role |
|---|---|---|
| Prototype (Claude Design) | `https://claude.ai/design/p/09a77423-ca03-4360-badb-1dca1687c5ab` (Branches module; demo states include Live established / View Owner) | Visual + interaction source of truth |
| Prototype screenshots | `docs/superpowers/prototype-references/merchant-web-branches/` (12-screenshot set) | Discovery reference. NOT shipped in any implementation PR unless explicitly approved as a docs/prototype-reference asset |
| Source audit (this session) | Inlined as the cross-check table in Section 5 below | Ground truth for current backend support |
| Staff & Access v1 | `docs/superpowers/specs/2026-06-22-merchant-web-staff-access-design.md`; shipped PRs #304/#305/#306 | Provides `resolveMerchantContext`, `assertBranchAllowed`, membership roles |
| Merchant Portal baseline memory | `~/.claude/projects/-Users-shebinchaliyath-Developer-Redeemo/memory/project_merchant_portal_build_baseline.md` | Programme context, prior milestones M0 to M5, Day-2 Vouchers |
| Option B B1 edit-applier | `src/api/admin/approvals/editApplier.ts` | The review-lane applier PR-3 extends for photos |

Screenshot legend (verified filenames; the full set is the binding visual reference; the implementer of each slice MUST view the relevant screenshots before building):

- `01-branches-overview.png`: Branches overview (summary cards + branch list with per-row columns).
- `02-branch-detail-top.png`: branch detail top (hero/banner, name, status, "Main branch" badge, contact actions).
- `03-branch-detail-map-contact-hours.png`: location-on-map card + contact card + opening-hours card (with the "2 hour customer cool off" chip).
- `04-branch-pin-alerts-amenities.png`: redemption-PIN card + redemption-alerts card (WHO IS ALERTED list + per-recipient toggles + "Add an extra recipient" email field) + amenities.
- `05-branding-photos-staff-start.png`: branding (logo/banner) + photos (Add-photo tile, Approved badges, in-review counter) + staff-at-branch (start).
- `06-staff-and-close-section.png`: staff-at-branch ("Assign or manage staff", access pills, per-member menu) + close-branch affordance ("cannot remove your main branch" copy).
- `07-second-branch-review-state.png`: awaiting-review state ("Make main branch" button on a non-main branch; "Photos awaiting review" / "1 new photo in review"; "Awaiting location check").
- `08-second-branch-contact-hours-alerts.png`: second-branch contact/hours/alerts variant.
- `09-second-branch-photos-staff-close.png`: second-branch photos/staff/close variant.
- `10-close-branch-request-modal.png`: close-branch request modal.
- `11-edit-branch-details-modal.png`: edit-branch-details modal (Branch name / Description / Address line 1 / Address line 2 (optional) / Town or city / Postcode + an in-modal "Location on the map" preview).
- `12-branches-overview-clean.png`: clean overview variant.

Out of Branches scope (do not re-derive as missing features): the persistent portal shell topbar visible in every screenshot ("Validate a code", the BUSINESS STATUS chip, the View/Demo toggles) is the existing merchant-portal shell (M1/M3), not the Branches module.

---

## 2. Prototype-faithful end-state (definition of "Branches complete")

When the full programme has landed (minus only explicitly owner-approved deferrals), a merchant-portal user sees a Branches module that:

1. Lists every branch of their merchant as cards, scoped to what their role/branch assignment allows them to see. The overview carries summary cards (Locations count; Open-now count; With-Redeemo count = branches live on the customer app) and per-row columns (name, status open/closed, locality/town, Today's hours, a Setup column = PIN status + amenity count, a main-branch indicator).
2. Opens a branch detail page showing: hero/banner + logo; name; lifecycle/status; "Main branch" badge or "Make main branch" action; contact actions; a read-only location card (formatted address + confirmed/awaiting-location badge + map); opening hours (with the "2 hour customer cool off" indicator); amenities; branding (logo/banner/photos); redemption-PIN management; redemption-alerts preference (with its recipient list); and the staff assigned to that branch.
3. Lets the right user edit the right things with the right governance:
   - instant edits for non-identity operational fields (contact phone/email/website, active flag, amenities, PIN, redemption-alerts toggle, set-main-branch);
   - reviewed edits for customer-visible identity fields (name, about, address, logo, banner, photos) through the existing admin review lane, with the existing approved values staying live until approval and pending requests visible and withdrawable;
   - opening-hours edits that take effect on a 2-hour cool-off via a durable staging record;
   - add-branch and close-branch through a shared admin-reviewed branch-lifecycle flow;
   - a provider-backed business/address lookup (merchant searches, picks a result, address autofills, location metadata stored internally) without ever exposing or editing latitude/longitude.
4. Enforces branch-scope server-side: a Branch Manager manages only their assigned branch(es); owners manage all.
5. Keeps admin as the sole authority for the customer-visible precise pin.
6. Notifies the branch in-app when a redemption is validated in-store (if the per-branch alert is enabled).
7. Supports multiple opening-hours windows per day, consistently across onboarding, day-2 Branches, customer reads, and shared formatting.

Branches is NOT complete after PR-1. PR-1 is the safe read/edit spine only. The disabled affordances in PR-1 (add, close, hours edit, multi-window, alerts, live map/lookup) are explicit promises that later slices fulfil; they must never silently perform the wrong behaviour.

---

## 3. Locked decisions D1 to D9 (owner-approved, decision-by-decision)

- D1: Prototype-faithful Tier-3, delivered as a staged programme of multiple owner-gated PRs (PR-1 to PR-8), not one giant PR. The module is not "complete" until it matches the prototype workflow except for explicitly approved deferrals. A module-level completion checklist is maintained and items must not degrade into vague follow-ups.

- D2: Surface-first with a strict PR-1 boundary. PR-1 builds the Branches overview/detail surface over the safe existing backend and must NOT expose actions that contradict final product rules. PR-1 includes: overview cards + list; detail; contact instant-save; amenities instant-save; PIN reveal/change/send; reviewed branch-details edit request via the existing `BranchPendingEdit` lane; pending change-request visibility + withdraw; read-only location/map status badge; staff-at-branch display; safe approved/reviewed badges. PR-1 must NOT enable (these are hard-locked unconditionally; the reason each is unsafe today is that its current backend behaviour is immediate-live, see Section 5): add-branch; close-branch; opening-hours edit; multi-window; redemption alerts; merchant-confirmed live map pin. Those appear as disabled "coming in this Branches rollout" affordances that perform no wrong behaviour. The opening-hours card is read-only in PR-1.

- D3: Prototype-faithful scoped edits for Branch Managers, enforced server-side via `assertBranchAllowed`. A Branch Manager may, for assigned branch(es) only: view detail; edit instant contact; edit instant amenities; view/reveal/change/send PIN; submit branch-details review requests for review-supported fields; view pending requests and withdraw their own branch requests; edit opening hours once the 2-hour cool-off slice exists. A Branch Manager may NOT: create a branch; close/request-close a branch; set a branch as main; manage staff/roles; edit unassigned branches; bypass review for review-required fields; manage business-wide settings. Enforcement is in backend guards, not just hidden in the UI. (Note: the live write paths are owner-only today; PR-1 is therefore owner-only on writes, and PR-2 is the slice that makes these BM-scoped, see Section 7 PR-1 and PR-2.)

- D4: Opening-hours 2-hour cool-off built as its own schema/governance slice using a durable pending/staging model. The merchant edits hours, which creates a pending staging record (`BranchOpeningHoursPending`-style) holding the proposed hours plus `effectiveAt = now + 2h`. The UI shows the pending change and when it goes live; the merchant can cancel/withdraw before `effectiveAt`. Customer reads continue using the live `BranchOpeningHours` until promotion; a delayed worker/job promotes after `effectiveAt`. Multi-window remains a separate later slice. No delayed-job-only without a durable record. Do not combine multi-window with the cool-off unless live code proves it unavoidable (then stop and report the exact schema/customer-read reason).

- D5: Combined branch-lifecycle approval with status-on-Branch staging, staged across separate PRs if needed but one shared lifecycle model. CREATE: the merchant creates a real Branch in a pending/discovery-excluded state plus an `AdminApproval`; the merchant sees "awaiting approval"; customers must not see the pending branch until approval; admin approval makes it live, reusing/aligning the existing admin location-confirmation flow. CLOSE: the merchant submits a close request with a reason; the branch stays live until approval; approval soft-deletes/deactivates; rejection keeps it live. Merchant UI shows pending lifecycle state plus visibility/cancel/withdraw where supported. Reuse `AdminApproval` plus the admin actioner/edit-review panel. Do not use off-Branch pending rows unless live code proves status-on-Branch unsafe (then stop and report). Do not build two separate mechanisms without a source-verified reason.

- D6: Location model in two separate pieces. Output/display in PR-1: branch detail shows the formatted address, a Location-confirmed / Awaiting-location-check badge driven by `locationConfidence`, and a designed read-only map placeholder (not a live provider-backed map yet); the merchant never sees or edits lat/lng and cannot place/drag a pin; the precise customer-visible pin remains admin-confirmed only. Input/lookup in a later dedicated location slice: reuse the existing funded Google Places (New) Text Search integration via the reserved `source:'merchant_portal'` bucket; the merchant searches by business name/address, picks a result, the UI autofills address fields, lat/lng/placeId are stored internally only, confidence is set to `ADDRESS_GEOCODED` (an existing enum value), and admin still confirms the final precise location and flips to `MANUALLY_CONFIRMED`. Do not add Mapbox or a second provider unless Google Places is proven unusable. Do not build type-ahead Autocomplete unless explicitly chosen inside the later slice (Text Search search-and-pick is enough first). Do not call Google from merchant-web in PR-1. The brainstorm-first lock around merchant-side Google calls stands: the location slice needs its own mini-spec/decision before implementation. CORRECTION: the earlier audit note "Google dead/unwired, key blank" is WRONG. Google Places (New) Text Search is built (`src/api/lib/googlePlaces.ts`), the key is SET, it is funded (Text Search Pro free tier; local caps 500/day + 4,500/month keep us inside it; ~$0 at our volume), and a `source:'merchant_portal'` usage bucket is already reserved. It is owner-CLI-only today (`prisma/suggest-branch-pin.ts`) with a documented brainstorm-first lock (see `docs/operations/google-places-setup.md`).

- D7: Photos/branding via the existing edit-request review lane. New logo/banner/photo changes are submitted as reviewed branch change requests through `BranchPendingEdit` + `BRANCH_IDENTITY_EDIT`; close the current `EDIT_PHOTO_APPLY_NOT_SUPPORTED` gap so admin approval applies the reviewed photo-gallery changes to the real records (logo/banner already apply today through the allow-list; only the photo gallery, `includesPhotos`, throws); admin rejection leaves the existing approved images unchanged; existing approved images stay live while new ones are in review; removing an already-approved photo is instant and removes it from customer visibility immediately; the merchant sees pending image-review status and can withdraw a pending request consistently with branch-detail requests; auto image moderation/scanning is deferred (admin review is the moderation mechanism for this slice). Do not build direct-upload automated moderation or a separate `BranchPhoto` review lane unless live code proves the edit-request lane cannot support it (then stop and report).

- D8: Redemption alerts as in-app bell, per-branch toggle, reusing `VOUCHER_REDEEMED` + the M4 merchant bell; email deferred/dark. PR-1 keeps redemption alerts visible but disabled. For the later alerts slice: add a per-branch redemption-alert preference/toggle; when enabled, branch redemption events produce in-app merchant notifications via the existing M4 bell; reuse the `VOUCHER_REDEEMED` notification type; notify the branch's owner/merchant-admins and branch managers where the role/scope model supports it; consider whether `BRANCH_USER` (app/staff-side) recipients are also needed but do not mix app delivery into merchant-web unless explicitly in scope; email remains deferred/dark and copy must say in-app now, email later. TRIGGER: alerts fire on merchant validation (the in-store staff-verified event, `isValidated: true` in `verifyRedemption`), NOT on customer code generation (`voucherRedemption.create` with `isValidated: false`), unless a future product decision changes that. Do not build email-first alerts in this slice. Do not defer the whole feature permanently unless later discovery shows the producer cannot be implemented safely. Do not add notification/email preferences beyond the per-branch toggle unless the slice spec explicitly chooses them. (The prototype shows MORE than a single toggle: per-recipient toggles and an "Add an extra recipient" non-portal email field. That richer recipient model is explicitly DEFERRED and is an open owner decision for the PR-7 mini-spec, see Section 11.)

- D9: Multi-window opening hours via a multi-row model, sequenced LAST, bundling the cross-midnight `isOpenNow` fix. This is a SHARED PLATFORM HOURS SLICE, not a branch-page-only feature: when it lands it must update the backend opening-hours schema/model, the opening-hours validator, customer `isOpenNow`/open-status reads, the day-2 Branches opening-hours editor/display, the onboarding branch opening-hours step/editor/display, any shared formatting/display helpers used by merchant/customer surfaces, and tests for both onboarding and day-2 flows. Model: move from one row per day to multiple rows per day by dropping/replacing the current `@@unique([branchId, dayOfWeek])` constraint; preserve a clean per-day closed state; validate no overlaps per day; preserve/define ordering; keep or explicitly update the `24:00`/open-24h semantics; fix cross-midnight `isOpenNow` at the same time; make customer reads evaluate multiple windows; migrate existing single-window data safely. PR-1 shows multi-window as a disabled affordance; the 2-hour cool-off slice can operate on the single-window model first. If an implementation plan tries to update only day-2 Branches, stop and correct it.

---

## 4. Locked corrections carried forward (programme-wide invariants)

These are binding for every slice and every future agent:

1. PR-1 is the safe read/edit spine ONLY. No action that contradicts final product rules.
2. Opening-hours EDIT is locked (read-only display) until the 2-hour cool-off slice (PR-4).
3. Add-branch and close-branch are locked until the lifecycle-approval slice (PR-5).
4. Google Places is built / key-set / funded but CLI-only; brainstorm-first before any merchant-side usage (PR-6 needs its own mini-spec).
5. Multi-window hours (PR-8) must update onboarding, day-2 Branches, backend validation, customer reads, formatting, tests, AND cross-midnight behaviour.
6. Redemption alerts (PR-7) fire on merchant validation, not customer code generation, unless a future product decision changes that.
7. Branch Manager writes are prototype-faithful but assigned-branch-only and server-enforced (`assertBranchAllowed`). The live write paths are owner-only today, so PR-1 is owner-only on writes and PR-2 is the BM-scoping slice.
8. Photos use the existing edit-request review lane; photo-gallery removal is instant; auto moderation deferred (PR-3). Logo/banner edit-requests already apply via the allow-list today.
9. The merchant never sees or edits latitude/longitude and never drag-places a pin. Admin is the sole authority for the customer-visible precise pin.
10. Reviewed identity edits apply through the allow-list applier only (`pickAllowed`), never a blind spread of `proposedChanges`.

---

## 5. Corrected live-code cross-check (the anchor)

Every existing branch route and service function maps to a slice. Source: `src/api/merchant/branch/{routes.ts,service.ts,openingHours.ts}`, `src/api/redemption/service.ts`, `src/api/admin/approvals/editApplier.ts`, `src/api/lib/googlePlaces.ts`, `src/api/customer/discovery/service.ts`, `prisma/schema.prisma`, Staff & Access shared (`src/api/merchant/shared.ts`).

| # | Existing route / fn (verified) | Prototype feature | Slice | Schema? |
|---|---|---|---|---|
| 1 | `GET /branches` (`listBranches`, scoped via `resolveMerchantContext`) | Overview cards + list | PR-1 | no |
| 2 | `GET /branches/:id` (`getBranch`; `BRANCH_INCLUDE` = openingHours, amenities, photos, pendingEdits; NO staff) | Detail page | PR-1 | no |
| 3 | `PATCH /branches/:id` DIRECT_FIELDS = `phone,email,websiteUrl,isActive` (`updateBranchDirectCore`/`updateBranch`; owner-only resolver today) | Contact instant-save | PR-1 (owner-only until PR-2) | no |
| 4 | `PATCH /branches/:id` with `isMainBranch:true` in the body (SAME route as #3; atomic single-main promotion inline in `updateBranch`; owner-capable) | Set main branch (owner-only, instant) | PR-1 (owner-only) | no |
| 5 | `POST /branches/:id/amenities` (`setAmenities`; `BranchAmenity` join; owner-only resolver today) | Amenities instant-save | PR-1 (owner-only until PR-2) | no |
| 6 | `GET/PUT/POST /branches/:id/pin[/send]` (`getBranchPin`/`setBranchPin`/`sendBranchPin`; AES-encrypted; owner-only resolver today) | PIN reveal/change/send | PR-1 (owner-only until PR-2) | no |
| 7 | `POST /branches/:id/edit-request` (`createBranchEditRequest`; SENSITIVE_FIELDS = `name,about,addressLine1,addressLine2,city,postcode,latitude,longitude,logoUrl,bannerUrl`) | Branch-details review request (incl. logo/banner) | PR-1 (existing review lane) | no |
| 8 | `GET /branches/:id/edit-requests` (`listBranchEditRequests`) + `DELETE …/:editId` (`withdrawBranchEditRequest`) | Pending change-request visibility + withdraw | PR-1 | no |
| 9 | `locationConfidence` read (`MANUALLY_CONFIRMED`/`ADDRESS_GEOCODED`/`POSTCODE_CENTROID`/`NEEDS_REVIEW`) | Location card: badge + address + placeholder | PR-1 (read-only) | no |
| 10 | Staff: `GET /merchant/staff` (`listMembers`, portal members, `branchIds[]`/`allBranches`) + `GET /merchant/staff/app-users` (`listStaffAppUsers`, app-only BranchUsers grouped by branch); BOTH owner-gated (`assertOwner`). `getBranch` does NOT return staff. | Staff-at-branch display (portal + app, merged, owner-only) | PR-1 (owner-only display) | no |
| 11 | `resolveMerchantContext` + `assertBranchAllowed` (shipped, imported into branch/service.ts) | Branch-Manager scoped writes | PR-2 | no |
| 12 | `POST /branches/:id/photos/edit-request` (`createBranchPhotoEditRequest`) + `editApplier.approveEdit` PHOTO BLOCK throwing `EDIT_PHOTO_APPLY_NOT_SUPPORTED` for `includesPhotos` | Photos gallery: add=review / remove=instant; FIX photo-apply | PR-3 | no |
| 13 | `POST /branches/:id/hours` (`setOpeningHours`, instant today; `BranchOpeningHours` single-window, `@@unique([branchId,dayOfWeek])`) | Hours edit + 2h cool-off | PR-4 | YES (staging table + worker) |
| 14 | `POST /branches` (`createBranch`; creates a live branch with NO `AdminApproval` today) | Add branch (-> pending/discovery-excluded + approval) | PR-5 | YES (status-on-Branch + ApprovalType) |
| 15 | `DELETE /branches/:id` (`softDeleteBranch`; immediate soft-delete, no reason, no approval today) | Close branch (-> request + stays-live-until-approval) | PR-5 | YES (shared lifecycle) |
| 16 | `src/api/lib/googlePlaces.ts` Text Search (CLI-only today; key set; `source:'merchant_portal'` reserved) | Business/address lookup -> autofill -> `ADDRESS_GEOCODED` | PR-6 (mini-spec, brainstorm-first) | likely no (`ADDRESS_GEOCODED` exists) |
| 17 | greenfield producer + per-branch pref (no producer fires on redemption today; `VOUCHER_REDEEMED` type + `MERCHANT_ADMIN`/`BRANCH_USER` recipients exist; M4 bell) | Redemption alerts (in-app, on validation) | PR-7 | YES (per-branch toggle; recipient model deferred, see §11) |
| 18 | `BranchOpeningHours` `@@unique([branchId,dayOfWeek])` + single window; `openingHours.ts` validator + customer `isOpenNow` | Multi-window hours (shared platform slice) | PR-8 (last) | YES (multi-row + migration + cross-midnight fix) |

Verified facts that future agents must not re-derive incorrectly:

- `createBranch` does NOT create an `AdminApproval` today: a newly created branch is immediately live. PR-5 changes this.
- `softDeleteBranch` is an immediate soft-delete with no reason and no approval today. PR-5 changes this.
- `setOpeningHours` is instant today (`service.ts` upserts directly). PR-4 moves it behind the 2-hour staging record.
- Branch WRITE routes (contact, amenities, PIN, set-main, edit-request, hours, create, delete) use the owner-only resolver (`resolveAdminMerchant`) today; only `listBranches`/`getBranch` are scoped via `resolveMerchantContext`. PR-2 migrates the classified WRITE routes to `resolveMerchantContext` + `assertBranchAllowed` (and `assertOwner` for owner-only actions).
- `editApplier` disambiguates by `approval.type` (`MERCHANT_IDENTITY_EDIT`/`BRANCH_IDENTITY_EDIT`) via `editKindOf()`, never by `referenceType`, and applies only allow-listed keys (`pickAllowed`). Today its branch path throws `EDIT_PHOTO_APPLY_NOT_SUPPORTED` for any `BranchPendingEdit` with `includesPhotos` before any mutation. A logo/banner-only edit-request (no `includesPhotos`) applies fine today. PR-3 closes the photo-gallery gap.
- `LocationConfidence` already includes `ADDRESS_GEOCODED`; the PR-6 merchant-picked-place state likely needs NO new enum value. CAVEAT: the existing postcode-resolution path (`resolveBranchLocationFields`) hard-codes `POSTCODE_CENTROID` on any postcode change, so PR-6 must EXPLICITLY set `ADDRESS_GEOCODED` on a Google-picked write rather than rely on the resolver default.
- `NotificationType.VOUCHER_REDEEMED` already exists; PR-7 needs a producer + a per-branch preference, not a new type. CAUTION: `VOUCHER_REDEEMED` is also an existing AUDIT-LOG event string fired at customer code-generation time (`isValidated:false` path in `redemption/service.ts`); the alert producer must NOT be co-located there: it belongs only in `verifyRedemption` after `isValidated` flips true.
- Customer photo visibility is governed solely by `moderationStatus:'APPROVED'` (`customer/discovery/service.ts` ~line 1976). PR-3 must preserve this gate.
- Customer branch reads are NOT uniform: the home/featured/trending feeds filter `isActive:true`, but the customer branch PICKER path deliberately loads branches with NO `isActive` filter (it shows suspended branches greyed-out; filters `isTestData:false` only). PR-5 must exclude pending-create branches from BOTH paths by status, not just `isActive`.
- Merchant email is dark by default (`EMAIL_ENABLED` off in `src/api/shared/email.ts`).

OPEN ITEM TO CONFIRM AT THE PR-5 MINI-SPEC: the exact `ApprovalType` enum value(s) to add for branch CREATE and branch CLOSE. The enum CURRENTLY holds exactly: `MERCHANT_ONBOARDING`, `VOUCHER`, `MERCHANT_PROFILE_EDIT`, `MERCHANT_IDENTITY_EDIT`, `BRANCH_IDENTITY_EDIT` (verified `prisma/schema.prisma`). The PR-5 mini-spec finalises the new enum names and whether a single shared branch-lifecycle type with a sub-action or two distinct types is cleanest. This is flagged, not guessed.

---

## 6. Slice sequence and completion checklist

Branches is complete only when PR-1 to PR-8 have all landed, minus explicitly owner-approved deferrals. Each slice is its own owner-gated PR with a SHA-bound merge gate.

- [ ] PR-1: Surface spine (Tier-2, no-schema)
- [ ] PR-2: Branch-Manager scoped writes (Tier-2, no-schema)
- [ ] PR-3: Photos via review lane + fix photo-apply (Tier-2, no-schema)
- [ ] PR-4: Opening-hours 2-hour cool-off staging (Tier-3, schema)
- [ ] PR-5: Branch lifecycle create + close (Tier-3, schema; may split create / close)
- [ ] PR-6: Location business/address lookup (mini-spec, brainstorm-first; likely no-schema)
- [ ] PR-7: Redemption alerts (Tier-3, schema)
- [ ] PR-8: Multi-window hours, shared platform slice (Tier-3, schema), LAST

Recommended ordering rationale: PR-1 to PR-3 are no-schema and unblock the visible surface and its safe edits; PR-4 and PR-5 are the core governance/schema slices; PR-6 is gated by its own brainstorm-first mini-spec; PR-7 adds the alerts producer; PR-8 is the cross-cutting hours migration, sequenced last because it touches onboarding + customer reads + migration and should not block the branch-management surface.

---

## 7. Per-slice specifications

Each slice below defines: purpose; user-facing behavior; surfaces touched; schema status; risks; stop-and-report triggers; test expectations; out-of-scope.

### PR-1: Branches surface spine (Tier-2, NO schema)

Purpose: build the merchant-web Branches list + detail surface over the safe existing backend, exposing only actions that already behave correctly, with every not-yet-safe action present as a disabled "coming in this Branches rollout" affordance.

IMPORTANT PR-1 GUARDRAIL (write paths are owner-only today): every branch WRITE route currently runs through the owner-only resolver (`resolveAdminMerchant`). Therefore in PR-1, ALL write controls (contact, amenities, PIN, set-main, edit-request submit/withdraw) are OWNER-ONLY. For a non-owner Branch Manager, PR-1 renders those controls hidden/disabled (read-only), and the reads that are already scoped (`listBranches`/`getBranch`) work for them. PR-1 MUST NOT migrate resolvers to enable BM writes: that is PR-2. Do not relax any owner gate to make a BM screen feel complete.

User-facing behavior:
- Branches list (prototype `01`/`12`): three summary cards + a branch row list, scoped to what the viewer is allowed to see (owner/allBranches see all; a scoped member sees only allowed branches, via the existing scoped `listBranches`). A disabled "Add branch" affordance is visible (locked, PR-5). ALL cells below derive from the SINGLE `GET /branches` list payload with NO extra per-branch fetch (no N+1); `GET /branches` returns raw Branch rows including `openingHours[]`, `amenities[]`, `isActive`, `isMainBranch`, `locationConfidence`, and `city`/`localityName`/`postTown`:
  - Summary card "Locations" = `branches.length`.
  - Summary card "Open right now" = count of branches open now, computed client-side by mirroring `src/api/shared/isOpenNow.ts` over each `branch.openingHours` in Europe/London (the same pure function customer discovery uses). Derived from the list; no fetch.
  - Summary card "With Redeemo" = count of branches LIVE and discoverable on the customer app = `branch.isActive === true && branch.locationConfidence === 'MANUALLY_CONFIRMED'` (the locked MVP discovery-visible gate; customer discovery nulls a branch's lat/lng unless `MANUALLY_CONFIRMED`). This is INTENTIONALLY distinct from "Open right now" (a branch can be open for business yet not admin-confirmed, which is why the prototype shows Open 2 / With Redeemo 0). MERCHANT-LIFECYCLE GUARD: the branch payload does NOT carry the merchant's lifecycle status; the per-branch `MANUALLY_CONFIRMED` count is only meaningful when the merchant itself is Live. In any pre-Live merchant state (Setting up / Submitted / In review / Suspended) the merchant is not on Redeemo at all, so "With Redeemo" must read 0 (or be suppressed), driven by the portal shell's merchant-status context (`deriveStatusPill`), never the per-branch count in isolation.
  - Per-row columns: name; status (active/closed via `branch.isActive`); locality/town (fallback `city` -> `localityName` -> `postTown`; `postTown` is mostly null in M1); Today's hours (from `branch.openingHours`); Setup = amenity count (`branch.amenities.length`) + a PIN set/not-set indicator (`branch.redemptionPin != null`; since PR #377 the server emits `redemptionPinSet` and the frontend reads that boolean via the shared `branchPinSet` bridge); main-branch indicator (`branch.isMainBranch`; list is already main-first).
  - SECURITY: the `GET /branches` list payload currently ships the AES-encrypted `branch.redemptionPin` to the client (the list path sends raw rows, NOT the `toAdminBranchShape` that strips it). merchant-web MUST derive only the binary set/not-set status and MUST NEVER render, log, or expose the value. The decrypted PIN is obtained only via the separate `GET /branches/:id/pin` route (a per-branch call; do NOT fetch it per row, that is an N+1). A backend follow-up to drop `redemptionPin` from the list select is tracked in Section 11. [SUPERSEDED 2026-07-05 by PR #377: every merchant branch-row exit now strips the ciphertext and emits a derived `redemptionPinSet` boolean; the frontend reads the boolean (with a temporary presence-only legacy bridge for old-backend skew, removal-gated on a confirmed Railway deployment of the corrected contract). Historical description below preserved.]
  - merchant-web client schema: add `locationConfidence` and `isActive` to `apps/merchant-web/lib/api/branch.ts` `branchSchema` (a 2-line addition under the existing `.passthrough()`), purely for type-safety; no contract change.
- Branch detail page sections:
  - Header (prototype `02`): hero/banner + logo; name; status; contact action affordances. Main-branch rendering is ASYMMETRIC: when the branch is the main branch, render a "Main branch" badge and NO promote button; when it is not, render a "Make main branch" action (owner-only). The close-eligibility coupling copy ("you cannot remove your main branch; make another branch the main one first") is part of the PR-5 close flow but the asymmetry must be honoured here.
  - Contact (instant-save, OWNER-ONLY in PR-1): phone, email, website (each "Saves instantly" + Edit per prototype `02`/`03`). The `isActive` flag is part of DIRECT_FIELDS; confirm against the live prototype whether it is surfaced in the Contact card or the branch-status area, and place it accordingly (do not invent a control). Edits persist via `PATCH /branches/:id`.
  - Set as main branch (OWNER-ONLY, instant): the "Make main branch" action toggles `isMainBranch` via the SAME `PATCH /branches/:id` route with `isMainBranch:true` in the body; backend already does atomic single-main promotion. Hidden for non-owners.
  - Location card (read-only, prototype `03`): formatted address; a Location-confirmed / Awaiting-location-check badge driven by `locationConfidence` (`MANUALLY_CONFIRMED` => confirmed; otherwise awaiting); a designed read-only map placeholder. No lat/lng shown, no pin-drop, no Google call. A disabled "Update location / find your business" affordance is visible (locked, PR-6).
  - Opening hours (read-only display in PR-1, prototype `03`): render the current single-window hours. The edit control is a disabled "coming in this Branches rollout" affordance (locked, PR-4). Multi-window is a disabled affordance (locked, PR-8). The "2 hour customer cool off" chip the prototype shows advertises a behaviour that is not live until PR-4: PR-1 must NOT show it as if cool-off is active; either omit it in PR-1 or render it only as part of the disabled hours-edit affordance copy. Decide explicitly in the PR-1 plan; default to deferring the chip to PR-4.
  - Amenities (instant-save, OWNER-ONLY in PR-1): toggle amenities via `POST /branches/:id/amenities`.
  - Branding + photos (prototype `05`/`06`/`07`):
    - Logo/banner: editing logo/banner is part of the branch-details reviewed edit request (they are SENSITIVE_FIELDS and DO apply today via the allow-list). Owner-only in PR-1.
    - Photo gallery: DISPLAY ONLY in PR-1. Render the photo grid + per-photo "Approved" badges + the "X new photo in review" counter as read-only. The "Add photo" / replace / remove controls are DISABLED affordances pointing at PR-3. This is a deliberate, owner-approved PR-1-vs-PR-3 gap, not a fidelity failure: the admin applier cannot apply photo-gallery edits (`includesPhotos`) until PR-3, and instant-removal also lands in PR-3.
  - Redemption PIN (OWNER-ONLY in PR-1, prototype `04`): reveal (`GET …/pin`), change (`PUT …/pin`), send (`POST …/pin/send`).
  - Redemption alerts (prototype `04`): the entire alerts card (the on/off toggle, the WHO IS ALERTED per-recipient list, and the "Add an extra recipient" email field) is DISABLED in PR-1 (locked, PR-7). The per-recipient + extra-recipient model is a deferred owner decision (see Section 11); PR-1 renders it as a disabled affordance, not a partial control.
  - Staff at this branch (prototype `05`/`06`): DISPLAY ONLY, owner-only, assembled CLIENT-SIDE from BOTH existing owner-gated staff endpoints, filtered by this `branchId`; introduces NO new endpoint and NO write. This consumes BOTH portal members AND app-only staff so the prototype's "App access" cards render faithfully (closing the earlier prototype-fidelity gap where only portal members were covered):
    - Portal members: `GET /merchant/staff` -> `{ members: MemberRow[] }` (`MemberRow` = id, name, email, role OWNER/BRANCH_MANAGER/STAFF, status, canManageVouchers, allBranches, branchIds[], claimed, lastLoginAt). Members at this branch = `members.filter(m => m.allBranches || m.branchIds.includes(branchId))`. Render with the "Portal + app" access pill; show an Invited/Pending state when `claimed === false`.
    - App-only staff: `GET /merchant/staff/app-users` -> `{ branches: [{ branchId, branchName, appUserCount, users: [{ id, branchId, firstName, lastName, jobTitle, email, status, lastLoginAt }] }] }`. App users at this branch = the group whose `branchId === branchId` (each user row also carries `branchId`). Render with the "App access" pill.
    - Both endpoints are owner-gated (`ownerCtx` -> `assertOwner`); a Branch Manager receives 403, so the panel does NOT render for non-owners in PR-1. Making it BM-visible is a PR-2 / stop-and-report decision; do NOT relax `assertOwner`.
    - Identity model: portal members (MerchantMembership) and app users (BranchUser) are TWO separate identities (locked Option C staged identity); any de-dup by email is DISPLAY-ONLY and best-effort, never a record merge.
    - Fields that must NEVER be surfaced: `passwordHash` (neither endpoint returns it; `claimed` is the only derived signal), `Branch.redemptionPin` (not in either payload), BranchUser `phone` (not in the app-users payload). Render only the curated fields listed above.
    - The "Assign or manage staff" cross-link routes to the existing Staff & Access surface and is owner-gated (D3). PR-1 introduces no staff write.
  - Reviewed branch-details edit request (OWNER-ONLY in PR-1, prototype `11`): a modal that submits SENSITIVE_FIELDS changes via `POST /branches/:id/edit-request`. Enumerate the modal fields to match the prototype labels: Branch name, Description (= `about`), Address line 1, Address line 2 (optional), Town or city (= `city`), Postcode, plus logo/banner. The modal's in-modal "Location on the map" preview is a designed read-only placeholder in PR-1 (no Google call, no lat/lng), consistent with the detail-page location card and invariant 9. Existing approved values stay live until approval.
  - Pending change-request visibility + withdraw (prototype `07`): list pending edits via `GET /branches/:id/edit-requests`; withdraw an own pending request via `DELETE …/edit-requests/:editId` (owner-only in PR-1).
- Disabled "coming in this Branches rollout" affordances (visible, no wrong behaviour): Add branch; Close branch; Opening-hours edit; Multi-window; Redemption alerts (whole card); merchant-confirmed live map / business-lookup.

Surfaces touched:
- merchant-web (`apps/merchant-web`): new Branches list page, branch detail page, the edit-request modal, pending-requests display, the disabled affordances. New `lib/api/branches.ts` client + zod schemas mirroring the existing backend responses. React Query hooks. Brand layer per the merchant-web design system.
- backend: NONE expected (PR-1 consumes existing routes). If a response field needed by the prototype is missing, STOP AND REPORT rather than adding backend scope into PR-1.
- admin-web: none.
- customer: none.

Schema status: NO schema. NO new backend routes. NO migration.

Risks:
- Scope creep into backend (tempting to add a missing field). Mitigated by the stop-and-report triggers below.
- Owner-only writes: because all branch write paths are owner-only today, a BM-facing PR-1 build that exposes write buttons would ship silent 403s. PR-1 must render BM as read-only on all writes (controls hidden/disabled), NOT migrate resolvers (that is PR-2).
- Staff-at-branch is only loadable by owners today (owner-gated `GET /staff`); the section is owner-only-visible in PR-1.
- Photos: the photo-gallery add path is only functional after PR-3; PR-1 must keep the gallery display-only and not imply a photo was applied.

Stop-and-report triggers (PR-1):
- A prototype-required field is not present on an existing backend response (do not add backend scope; report the gap and the proposed minimal addition).
- Staff-at-branch must be made Branch-Manager-visible (do not relax `assertOwner`; report; this is a PR-2 / dedicated decision).
- Any temptation to migrate write resolvers to enable BM writes in PR-1 (that is PR-2).
- The photo-gallery add control cannot be presented without implying an apply that the backend cannot perform until PR-3 (default to display-only).
- Any temptation to enable a locked affordance to make a screen feel complete.

Test expectations (PR-1): merchant-web component/integration tests for the list (scoped rendering); the three summary cards derived from the single list payload (Locations = length; Open-now = client `isOpenNow` over `openingHours`; With-Redeemo = `isActive && MANUALLY_CONFIRMED` with the merchant-not-Live -> 0/suppressed guard); the per-row Setup column (amenity count + PIN set/not-set from `redemptionPin != null`) with the PIN VALUE never rendered/logged; detail sections; owner instant-save contact/amenities/PIN; the owner edit-request submit + pending display + withdraw; the owner-only set-main asymmetry (badge vs button); staff-at-branch owner-only visibility that MERGES portal members (`/merchant/staff`) + app-only users (`/merchant/staff/app-users`) filtered by `branchId` with correct "Portal + app" vs "App access" pills; photo gallery display-only; and that every locked affordance renders DISABLED and performs no network write. A non-owner Branch Manager sees reads only and no write controls. `tsc` + lint + jest green on `apps/merchant-web`.

Out-of-scope (PR-1): any write that contradicts final rules; backend changes; admin-web; customer surfaces; BM write enablement (PR-2); photo-gallery apply/remove (PR-3); hours edit (PR-4); lifecycle (PR-5); Google lookup (PR-6); alerts (PR-7); multi-window (PR-8).

### PR-2: Branch-Manager scoped writes (Tier-2, NO schema)

Purpose: make the PR-1 write surface server-enforced per role/branch assignment, so a Branch Manager can write only to assigned branch(es) and cannot perform owner-only actions, enforced in backend guards (not just hidden UI). This is the slice that turns PR-1's owner-only write spine into the prototype's role-scoped behaviour.

User-facing behavior: a Branch Manager sees and can use the allowed controls for their assigned branch(es) only (per D3 allow/deny list); owner-only controls (create, close, set-main, staff/role management, business-wide settings) are unavailable and server-rejected if attempted.

Surfaces touched:
- backend: migrate the classified branch WRITE routes from the owner-only resolver (`resolveAdminMerchant`) to `resolveMerchantContext` + `assertBranchAllowed` (and `assertOwner` for owner-only actions). Keep `resolveAdminMerchant` for genuinely owner-only operations. This mirrors the Staff & Access two-resolver pattern. Decide here whether staff-at-branch read becomes BM-visible (a BM-reachable read) or stays owner-only.
- merchant-web: capability/role-aware rendering aligned to the now-enforced backend (turn the PR-1 owner-only-hidden controls into BM-usable ones for assigned branches).
- admin-web/customer: none.

Schema status: NO schema (the role + branch-assignment model shipped in Staff & Access).

Risks: missing a route in the migration (a write left owner-only that a BM should reach, or vice versa); the two reachable redemption routes that bypass the standard resolver (documented in Staff & Access) are NOT branch-write routes but must not regress.

Stop-and-report triggers: any branch write route whose correct guard is ambiguous (owner-only vs BM-allowed) per D3; any route where `assertBranchAllowed` cannot be applied without a structural change.

Test expectations: backend guard tests proving BM-allowed writes succeed for assigned branches and 403 for unassigned; owner-only writes 403 for BM; owner unaffected. merchant-web rendering tests for capability gating.

Out-of-scope: new features; schema; any of PR-3 to PR-8.

### PR-3: Photos via review lane + fix photo-apply (Tier-2, NO schema)

Purpose: make branch photo-gallery changes fully functional through the existing review lane by closing the `EDIT_PHOTO_APPLY_NOT_SUPPORTED` gap, while keeping photo removal instant. (Logo/banner already apply via the allow-list; this slice is specifically the photo gallery.)

User-facing behavior: the merchant submits a new photo as a reviewed change request; existing approved images stay live during review; admin approval applies the change to the real records; admin rejection leaves the existing approved images unchanged; removing an already-approved photo is instant and removes it from customer visibility immediately; pending image-review status is visible and the request is withdrawable consistently with branch-detail requests.

Surfaces touched:
- backend: `editApplier.approveEdit` (branch path) extended to APPLY photo changes for a `BranchPendingEdit` with `includesPhotos` (replace the throw) by writing the reviewed `BranchPhoto` rows (mark `moderationStatus:'APPROVED'`); an instant photo-removal path for already-approved photos that drops them from the APPROVED set. The allow-list/verbatim-apply discipline (`pickAllowed`, never blind-spread) MUST be preserved.
- admin-web: the edit-review panel already surfaces photo changes (diff); ensure approve now applies them and the UI reflects success.
- merchant-web: wire the photo add/replace control (a disabled affordance in PR-1) to the review lane; wire instant removal; show pending image-review status.
- customer: customer photo visibility is governed SOLELY by `moderationStatus:'APPROVED'` (`customer/discovery/service.ts` ~line 1976). PR-3 approve MUST set `APPROVED`; PR-3 instant-removal of an approved photo MUST remove it from the APPROVED set so customer reads drop it immediately; a pending/in-review photo MUST never reach `APPROVED` before admin approval.

Schema status: NO schema (`BranchPhoto`, `BranchPendingEdit.includesPhotos`, `moderationStatus` exist).

Risks: the add=review vs remove=instant split must be precise (the current `createBranchPhotoEditRequest` batches; PR-3 must ensure removal of an approved photo is instant while addition is reviewed); the applier must not blind-spread; `moderationStatus` transitions must be coherent (admin approval => APPROVED; the APPROVED filter is the only thing between a pending/flagged photo and a customer).

Stop-and-report triggers: if the existing edit-request lane genuinely cannot represent add-review-plus-instant-removal without a new mechanism (report the exact reason before building a second lane); if applying photos requires touching storage/R2 keys in a way that risks leaking raw keys.

Test expectations: backend tests for approve-applies-photos (sets APPROVED), reject-leaves-unchanged, instant-removal-of-approved-photo (drops from APPROVED), allow-list safety (no blind spread), pending-never-APPROVED-before-approval; admin-web apply-success; merchant-web pending status + withdraw; a customer-read test that a pending photo is invisible and an approved one is visible.

Out-of-scope: automated image moderation/scanning (deferred); direct-upload auto-moderation; a separate photo-review lane.

### PR-4: Opening-hours 2-hour cool-off staging (Tier-3, SCHEMA). Needs its own mini-spec + plan.

Purpose: opening-hours edits take effect on a 2-hour delay via a durable staging record, so accidental or malicious hour changes have a cancel window and customers keep seeing the live hours until promotion.

User-facing behavior: the merchant edits hours; a pending change is created with `effectiveAt = now + 2h`; the UI shows the pending change and when it goes live; the merchant can cancel/withdraw before `effectiveAt`; customers keep seeing live hours until promotion; a worker promotes after `effectiveAt`. (This is the slice where the prototype's "2 hour customer cool off" chip becomes a live behaviour.)

Surfaces touched: backend (new `BranchOpeningHoursPending`-style staging table + migration; `setOpeningHours` becomes stage-not-apply; a delayed promotion job using the existing BullMQ pattern, for example the `MAINTENANCE_QUEUE`/sweep pattern, with a durable record so a missed/late job still promotes correctly); merchant-web (the disabled hours-edit affordance becomes live + pending display + cancel); customer (reads continue on live `BranchOpeningHours` until promotion). Operates on the single-window model first (multi-window is PR-8).

Schema status: SCHEMA (new staging table). Migration applied to local dev DB during development; staging/prod via normal `prisma migrate deploy` at release.

Risks: durability (no delayed-job-only without a record); promotion idempotency; clock/timezone (Europe/London) consistency; interaction with the future multi-window migration (PR-8 must carry pending records forward or define their handling, see PR-8).

Stop-and-report triggers: if the staging model cannot be built without coupling to multi-window (report the exact schema/customer-read reason); if the BullMQ pattern cannot guarantee promotion without a record.

Test expectations: staging creation sets correct `effectiveAt`; cancel before `effectiveAt`; promotion at/after `effectiveAt`; customer reads unchanged until promotion; idempotent promotion; missed-job recovery.

Out-of-scope: multi-window (PR-8); changing the single-window validation semantics.

### PR-5: Branch lifecycle create + close (Tier-3, SCHEMA; may split create / close). Needs its own mini-spec + plan.

Purpose: add-branch and close-branch through one shared admin-reviewed lifecycle with status-on-Branch staging.

User-facing behavior:
- CREATE: the merchant creates a real Branch in a pending/discovery-excluded state plus an `AdminApproval`; the merchant sees "awaiting approval"; customers do not see the pending branch; admin approval makes it live (reusing/aligning the admin location-confirmation flow); the merchant can cancel/withdraw a pending create where supported.
- CLOSE (prototype `10`): the merchant submits a close request with a reason; the branch stays live until approval; approval soft-deactivates; rejection keeps it live; the merchant sees the pending close state and can withdraw where supported. Honour the "cannot close the main branch; make another branch main first" rule (prototype `06`).

Surfaces touched: backend (`createBranch` now creates pending + `AdminApproval`; `softDeleteBranch` becomes a close-request that does not deactivate until approval; a branch lifecycle status on Branch; new `ApprovalType` value(s) for branch CREATE/CLOSE; customer reads must exclude pending-create branches); admin-web (the actioner gains branch create/close review using the existing `AdminApproval` + edit-review/actioner pattern + the location-confirmation flow); merchant-web (create form, close-request flow, pending lifecycle state, withdraw); customer (must not see pending-create branches).

CUSTOMER EXCLUSION (load-bearing, both paths): pending-create branches must be excluded from BOTH (a) the discovery feeds (which filter `isActive:true`) AND (b) the customer branch PICKER (`customer/discovery/service.ts` ~line 1954), which deliberately loads branches with NO `isActive` filter (it shows suspended branches greyed-out; filters `isTestData:false` only). PR-5 must exclude pending-create branches from the picker by lifecycle STATUS, not just `isActive`.

Schema status: SCHEMA (status-on-Branch + `ApprovalType` additions; current enum = `MERCHANT_ONBOARDING, VOUCHER, MERCHANT_PROFILE_EDIT, MERCHANT_IDENTITY_EDIT, BRANCH_IDENTITY_EDIT`). Migration dev-first; staging/prod via `migrate deploy`.

Risks: customers must never see a pending-create branch (the picker bypass above is the primary leak vector); the first-branch auto-main logic (`isMainBranch = existingCount === 0`) must not promote a pending branch in a way that breaks customer cold-open nearest-branch defaults; aligning create-approval with the existing admin location-confirmation flow (do not build a second confirmation mechanism); close must not deactivate before approval.

Stop-and-report triggers: if status-on-Branch proves unsafe and an off-Branch pending row is genuinely required (report); if a second lifecycle mechanism seems necessary (report); the exact `ApprovalType` enum naming decision (resolve in the mini-spec).

Test expectations: create => pending + approval + customer-invisible (feeds AND picker); approve => live + location-confirm path; close-request => stays live; approve-close => deactivated; reject => unchanged; auto-main not broken by pending branches; both customer paths exclude pending-create branches.

Out-of-scope: make-main governance changes beyond what exists; anything in PR-6 to PR-8.

### PR-6: Location business/address lookup (mini-spec, BRAINSTORM-FIRST; likely no-schema). Needs its own mini-spec before any code.

Purpose: a provider-backed business/address lookup so the merchant can find their business/address and autofill the address, with location metadata stored internally and admin still confirming the precise pin.

User-facing behavior: the merchant searches by business name/address; picks a Google Text Search result; the UI autofills the address fields; lat/lng/placeId are stored internally (never shown); confidence is set to `ADDRESS_GEOCODED`; admin still confirms and flips to `MANUALLY_CONFIRMED`; the merchant never sees/edits lat/lng and never drag-places a pin. The PR-1 read-only location card may gain a real static map image as an optional sub-choice in this slice.

Surfaces touched: backend (a NEW merchant-scoped route calling `searchPlaces(query, { source: 'merchant_portal' })`, reusing the funded `googlePlaces.ts`; the address autofill writes through the existing reviewed branch-details edit path because address is a SENSITIVE field; confidence `ADDRESS_GEOCODED`); merchant-web (search-and-pick UI + autofill); admin (unchanged authority for the precise pin); customer (precise pin still gated on admin confirmation). Optional static-map image is a sub-choice (separate Google Static Maps SKU or render-from-stored-lat/lng).

CAVEAT (do not assume `ADDRESS_GEOCODED` is free): the existing branch-edit/postcode-resolution path (`resolveBranchLocationFields`) hard-codes `locationConfidence = 'POSTCODE_CENTROID'` on any postcode change. PR-6 must EXPLICITLY set `ADDRESS_GEOCODED` on a Google-picked write rather than reuse the postcode-resolver default; otherwise a Google pick routed through the current lane would be stamped `POSTCODE_CENTROID`.

Schema status: likely NO schema (`ADDRESS_GEOCODED` exists). If the mini-spec finds a schema need, that is a stop-and-report.

Risks: the brainstorm-first lock on merchant-side Google calls MUST be honoured (this slice needs its own mini-spec/decision); cost/cap discipline (the `source:'merchant_portal'` bucket + existing local caps); never expose lat/lng; address changes are SENSITIVE => must flow through the review lane (do not let a Google pick bypass identity review); Autocomplete (type-ahead) is a separate SKU/cost and is NOT in scope unless explicitly chosen in the mini-spec.

Stop-and-report triggers: any schema need; any path where a Google pick would write a customer-visible identity change without review; any cost model that exceeds the funded free tier at expected volume.

Test expectations: merchant search returns candidates (mocked Google); pick autofills; lat/lng stored internally and never returned to the client; confidence `ADDRESS_GEOCODED` (explicitly set, not POSTCODE_CENTROID); admin confirm still required for `MANUALLY_CONFIRMED`; cap/bucket accounting.

Out-of-scope: Mapbox/second provider; type-ahead Autocomplete (unless chosen in the mini-spec); merchant pin-drop; bulk geocoding.

### PR-7: Redemption alerts (Tier-3, SCHEMA). Needs its own mini-spec + plan.

Purpose: notify a branch in-app when a redemption is validated in-store, controlled by a per-branch toggle.

User-facing behavior: the merchant enables/disables redemption alerts per branch; when enabled, an in-store validation produces an in-app merchant notification (M4 bell) to the branch's owner/merchant-admins and branch managers; copy says in-app now, email later; email stays dark/deferred.

Surfaces touched: backend (per-branch alert preference + a producer firing on `verifyRedemption` success, `isValidated: true`, reusing `VOUCHER_REDEEMED`); merchant-web (the PR-1 disabled alerts toggle becomes live + the bell renders the alert); customer (none); app/staff-side `BRANCH_USER` delivery considered but NOT mixed into merchant-web unless explicitly scoped.

CAUTION (do not wire the producer at the wrong site): `VOUCHER_REDEEMED` is also an existing AUDIT-LOG event string fired at customer code-generation time (`isValidated:false` path in `redemption/service.ts`). The alert producer must be co-located ONLY in `verifyRedemption` after `isValidated` flips true, NEVER at the code-generation audit site (the customer-code-generation path D8 explicitly forbids as the trigger).

RECIPIENT MODEL (deferred, owner decision at the PR-7 mini-spec): the prototype shows more than a single toggle (per-recipient toggles for owner/branch-manager, plus an "Add an extra recipient" email field for a non-portal user). The locked D8 scope is a per-branch on/off toggle only. The richer recipient model is DEFERRED (Section 11) and is an explicit owner decision for the PR-7 mini-spec: it would need schema beyond a single toggle (per-branch recipient rows) and an external-email recipient is inherently an email-delivery feature, which conflicts with the email-dark lock. PR-7 ships the per-branch toggle; the per-recipient + extra-recipient UI either gets scoped here with its own schema/email reconciliation or stays deferred, but it must not be silently dropped.

Schema status: SCHEMA (per-branch alert preference). Migration dev-first; staging/prod via `migrate deploy`.

Risks: TRIGGER must be validation, not customer code generation (locked); recipient fan-out must respect the role/branch model; do not add notification/email preferences beyond the per-branch toggle unless the slice spec explicitly chooses them; email must not be claimed live.

Stop-and-report triggers: if the producer cannot be implemented safely on the validation path; if recipient resolution is ambiguous; if the trigger semantics need to change (report before deviating from validation); if the deferred recipient model is brought into scope (it adds schema + touches the email-dark lock).

Test expectations: toggle persists per branch; validation with toggle-on fires `VOUCHER_REDEEMED` to the correct recipients; toggle-off fires nothing; redeem (code generation) fires nothing; email remains dark.

Out-of-scope: email delivery; preferences beyond the per-branch toggle (unless explicitly scoped); the per-recipient + extra-recipient model (deferred); app-side delivery unless explicitly scoped.

### PR-8: Multi-window opening hours, SHARED PLATFORM SLICE (Tier-3, SCHEMA), LAST. Needs its own mini-spec + plan.

Purpose: support multiple opening-hours windows per day consistently across onboarding, day-2 Branches, customer reads, and shared formatting, and fix cross-midnight `isOpenNow` in the same pass.

User-facing behavior: a merchant can define multiple windows per day (for example a lunch/dinner split) in BOTH the onboarding branch-hours step AND the day-2 Branches editor; customers see correct open/closed status across multiple windows and across midnight.

Surfaces touched (ALL of these; do not ship a day-2-only version): backend opening-hours schema/model (multi-row: drop/replace `@@unique([branchId,dayOfWeek])`; clean per-day closed state; no-overlap validation; defined ordering; keep/update `24:00`/open-24h semantics; safe single-to-multi data migration); the `openingHours.ts` validator; customer `isOpenNow`/open-status reads (evaluate N windows + cross-midnight fix; anchor the fix to the exact customer `isOpenNow` function at the mini-spec); day-2 Branches editor/display; onboarding branch-hours step/editor/display; any shared formatting/display helpers used by merchant/customer surfaces; tests for both onboarding and day-2 flows.

Schema status: SCHEMA (multi-row model + migration). Migration dev-first; staging/prod via `migrate deploy`.

Risks: data migration of existing single-window rows; overlap/ordering correctness; cross-midnight correctness (the existing latent behaviour, where `close < open` is treated as crossing midnight by the customer consumer, must be fixed not preserved); interaction with any PR-4 pending hours records (define their handling under the new model); leaving onboarding behind (explicitly forbidden: stop and correct any plan that touches only day-2 Branches).

Stop-and-report triggers: if a plan attempts day-2-only scope; if the migration cannot preserve existing data safely; if cross-midnight cannot be fixed within the slice; if PR-8's migration cannot deterministically resolve pre-existing PR-4 `BranchOpeningHoursPending` records.

Test expectations: multi-window create/edit in onboarding AND day-2; no-overlap rejection; ordering; closed-day representation; `24:00`/open-24h preserved/updated as decided; customer `isOpenNow` correct across multiple windows and across midnight; safe migration of existing single-window data; deterministic handling of any in-flight PR-4 pending records under the multi-row model; shared formatting consistent across surfaces.

Out-of-scope: anything not on the hours path.

---

## 8. Security invariants (whole programme)

1. Branch-scope is server-enforced (`assertBranchAllowed` + `resolveMerchantContext`); never UI-only. (PR-1 is owner-only on writes precisely because the BM-scoping guards land in PR-2; PR-1 must not relax any owner gate.)
2. Owner-only actions (create, close, set-main, staff/role management, business-wide settings) are server-rejected for non-owners; BOTH staff reads (`GET /merchant/staff` + `GET /merchant/staff/app-users`) are owner-gated today and must not be relaxed to make staff-at-branch BM-visible without a deliberate PR-2 decision.
3. The merchant never sees or edits lat/lng; never drag-places a pin; admin is the sole authority for the customer-visible precise pin.
4. Reviewed identity edits apply through the allow-list applier only (`pickAllowed`), never a blind spread of `proposedChanges`; the applier owns its own allow-list to prevent silent widening.
5. Customers never see a pending-create branch: exclude by lifecycle status from BOTH the discovery feeds (`isActive` filter) AND the customer branch picker (which intentionally has no `isActive` filter).
6. Customer photo visibility is governed solely by `moderationStatus:'APPROVED'`; a pending/in-review photo must never reach APPROVED before admin approval; instant-removal must drop a photo from the APPROVED set.
7. Redemption-PIN: the decrypted value is exposed ONLY via `GET /branches/:id/pin`. CURRENT-STATE CORRECTION (verified): the `GET /branches` list payload still ships the AES-ENCRYPTED `redemptionPin` (the list path sends raw rows, not the `toAdminBranchShape` that strips it). merchant-web MUST never render/log/expose it and derives only PIN set/not-set from `redemptionPin != null`. A backend follow-up to drop `redemptionPin` from the list select (mirroring `toAdminBranchShape`) is tracked in Section 11. [SUPERSEDED 2026-07-05 by PR #377: every merchant branch-row exit now strips the ciphertext and emits a derived `redemptionPinSet` boolean; the frontend reads the boolean (with a temporary presence-only legacy bridge for old-backend skew, removal-gated on a confirmed Railway deployment of the corrected contract). Historical description below preserved.]
8. Merchant email stays dark until the platform email decision; no surface claims email delivery is live.
9. Google calls from merchant-web are gated behind the PR-6 mini-spec, the reserved `source:'merchant_portal'` bucket, and the existing local caps; never call the CLI-only path from merchant-web before PR-6.

---

## 9. Cross-surface schema vs no-schema summary

- No-schema slices: PR-1, PR-2, PR-3, and (likely) PR-6.
- Schema slices: PR-4 (staging table), PR-5 (status-on-Branch + `ApprovalType`), PR-7 (per-branch alert preference; the deferred recipient model would add more), PR-8 (multi-row hours + migration).
- Every schema migration is applied to the local dev DB during development only; staging/prod are updated via `prisma migrate deploy` at release (consistent with prior milestones, for example the Staff & Access `canManageVouchers` migration applied to local dev only).

---

## 10. Programme-wide stop-and-report triggers

Stop and report (do not work around) if any of these occur in any slice:

- A slice would require schema not anticipated by this spec.
- A no-schema slice (PR-1/2/3/6) is discovered to actually need schema.
- A prototype-required field is missing on an existing backend response (PR-1).
- Staff-at-branch must be made Branch-Manager-visible (do not relax `assertOwner`; PR-2 decision).
- A locked affordance would have to be enabled early to make a screen feel complete.
- The 2-hour cool-off cannot be built without coupling to multi-window (PR-4).
- Status-on-Branch lifecycle proves unsafe and an off-Branch pending row is required (PR-5).
- A Google pick would write a customer-visible identity change without review, or a schema need appears (PR-6).
- The redemption-alert producer cannot be built safely on the validation path, or the trigger must change from validation, or the deferred recipient model is brought into scope (PR-7).
- A multi-window plan attempts day-2-only scope, cannot migrate existing data safely, or cannot deterministically resolve pre-existing PR-4 pending records (PR-8).
- Any security invariant in Section 8 would be weakened.

---

## 11. Deferred / explicitly out-of-scope for the programme

- Redemption-alerts RICHER RECIPIENT MODEL (per-recipient on/off toggles + an "Add an extra recipient" non-portal email field, both visible in prototype `04`): DEFERRED. PR-7 ships the per-branch on/off toggle. Bringing the per-recipient + extra-recipient model into scope is an explicit OWNER DECISION at the PR-7 mini-spec, because it needs schema beyond a single toggle (per-branch recipient rows) and an external-email recipient is an email-delivery feature that conflicts with the email-dark lock. Tracked here so it is not a vague follow-up (D1).
- Automated image moderation/scanning (PR-3 uses admin review; auto-scan deferred).
- Type-ahead Autocomplete for the location lookup (PR-6 uses Text Search search-and-pick unless the mini-spec chooses Autocomplete).
- A second maps provider (Mapbox), unless Google Places is proven unusable.
- A real static map image on the location card (PR-1 uses a designed placeholder; a real static-map provider is an optional PR-6 sub-choice).
- Email delivery of redemption alerts (PR-7 is in-app only; email deferred/dark).
- Merchant pin-drop / merchant-side `MANUALLY_CONFIRMED` (admin remains the authority).
- Any app-side (`BRANCH_USER`) alert delivery, unless explicitly scoped later.
- BACKEND HARDENING FOLLOW-UP (tracked, not PR-1): the `GET /branches` list path returns raw Branch rows including the AES-encrypted `redemptionPin`. Drop `redemptionPin` from the list `select` (mirror `toAdminBranchShape`) so the encrypted secret never rides on the list payload. Small backend change; can fold into PR-2 or a standalone hardening PR. Until then, merchant-web must never render/log the value (it derives only set/not-set). [SUPERSEDED 2026-07-05 by PR #377: every merchant branch-row exit now strips the ciphertext and emits a derived `redemptionPinSet` boolean; the frontend reads the boolean (with a temporary presence-only legacy bridge for old-backend skew, removal-gated on a confirmed Railway deployment of the corrected contract). Historical description below preserved.]

---

## 12. Honesty notes / assumptions to validate

- The exact `ApprovalType` enum value(s) for branch CREATE/CLOSE are not yet named; resolved at the PR-5 mini-spec (flagged, not guessed). The current full enum is recorded in Section 5.
- The PR-1 photo stance is now single and committed: photo GALLERY is display-only with the add/replace/remove controls as disabled affordances pointing at PR-3; logo/banner edit-requests ARE functional in PR-1 (they apply via the allow-list today). If the prototype is later read as requiring functional photo-gallery submission in the first surface, that is a stop-and-report, not a silent enablement.
- The `isActive` flag placement (Contact card vs branch-status area) should be confirmed against the live prototype before PR-1 build so the control is not invented or omitted.
- The 12 prototype screenshots are COMMITTED in this PR under `docs/superpowers/prototype-references/merchant-web-branches/` and referenced by stable filenames (Section 1). They are the binding visual reference; where this spec's prose and the screenshots disagree on layout/affordance, the screenshots win for visuals and this spec wins for governance/behaviour; reconcile at the slice plan.
- The BullMQ promotion mechanism for PR-4 reuses the existing queue/sweep pattern; the exact queue and worker shape are finalised at the PR-4 mini-spec after inspecting the live pattern.

---

## 13. Self-review

A fresh 5-lens adversarial review was run against this spec before commit (source-audit-fidelity, decision-fidelity, prototype-fidelity, consistency/scope/background-safety, completeness-critic). Verdicts: decision-fidelity PASS; the other four PASS_WITH_FIXES. All must-fix findings and the clearly-correct should-fix/nit findings were integrated into this revision:

- Redemption-alerts richer recipient model (per-recipient toggles + non-portal extra-recipient email, prototype `04`) was unmapped: now explicitly DEFERRED in Section 11, flagged as an owner decision at the PR-7 mini-spec, and rendered disabled in PR-1 (D8 note + PR-7 + Section 11).
- PR-1 write paths are owner-only today: PR-1 now states ALL write controls are owner-only and BMs are read-only until PR-2; resolvers must not be migrated in PR-1 (PR-1 guardrail + Risks + cross-check note + Section 8 #1).
- Staff-at-branch is not on `getBranch`: PR-1 sources it from BOTH `GET /merchant/staff` (portal members) AND `GET /merchant/staff/app-users` (app-only `BranchUser`s), merged client-side by `branchId`, owner-only, rendering "Portal + app" vs "App access" pills. Both endpoints are owner-gated (`assertOwner`) and must not be relaxed in PR-1; a non-owner gets 403 so the panel does not render for them (PR-1 staff bullet + row 10 + Section 8 #2 + stop-and-report). (The 5-lens pass caught the `getBranch`/owner-gated issue with portal members only; the app-only `app-users` half was added in the Codex review round below.)
- PR-1 overview columns/summary cards and the "2 hour customer cool off" chip handling are now enumerated (Section 2 + PR-1 list/hours bullets).
- Photo stance resolved to one committed position (gallery display-only -> PR-3; logo/banner functional in PR-1) (D7 + PR-1 + Section 12).
- `ApprovalType` prose corrected to the actual five values; set-main clarified as the same PATCH route; edit-modal field set + in-modal map placeholder enumerated; main-branch badge-vs-button asymmetry + close coupling added; screenshot legend re-mapped to verified filenames; topbar marked out-of-scope.
- PR-5 customer branch-PICKER bypass named (exclude by status from both paths); PR-3 customer `moderationStatus:'APPROVED'` coupling named; PR-6 `ADDRESS_GEOCODED`-vs-`POSTCODE_CENTROID` caveat added; PR-7 `VOUCHER_REDEEMED` audit-event caution added; PR-4/PR-8 pending-record forward-coupling added to PR-8 tests + Section 10.

Residual nits intentionally not changed (non-blocking): the cross-midnight `isOpenNow` exact customer-read function is to be anchored at the PR-8 mini-spec; the `isActive` placement is flagged for confirmation at PR-1 build. No finding contradicted a locked decision; decision-fidelity passed clean.

Verdict: the spec is internally consistent, faithful to D1-D9 and the prototype, grounded in the verified live code, and safe for a low-owner-input background implementation of PR-1 (with PR-2 to PR-8 contextually locked and each later schema/governance slice deferred to its own mini-spec).

### Codex review round (2026-06-23): 3 amendments integrated

Codex reviewed PR #307. All three required amendments were verified against live code (a fresh 3-agent verification workflow) and integrated:

1. Prototype screenshots are now COMMITTED in the PR under `docs/superpowers/prototype-references/merchant-web-branches/` (12 PNGs), referenced by stable filenames; the repo-path claim is now accurate (Section 1 + Section 12).
2. "Staff at this branch" now consumes BOTH `GET /merchant/staff` (portal members) AND `GET /merchant/staff/app-users` (app-only `BranchUser`s, grouped by branch), merged + filtered by `branchId`, owner-only, with "Portal + app" vs "App access" pills. Verified: the app-users endpoint exists, is owner-gated, carries `branchId` per row, and exposes no secrets (no `passwordHash`/PIN/phone). This closes the earlier prototype-fidelity gap on app-only staff cards (PR-1 staff bullet + Section 5 row 10 + Section 8 #2).
3. The "With Redeemo" overview count has an exact, no-N+1 data source: `branch.isActive === true && branch.locationConfidence === 'MANUALLY_CONFIRMED'`, derived from the existing `GET /branches` list payload, distinct from "Open right now", with a merchant-lifecycle guard (read 0 / suppress while the merchant is pre-Live). "Open right now" and the Setup column (amenity count + PIN set/not-set) are likewise list-derivable with no per-branch fetch (PR-1 overview bullet + test expectations).

Additional finding surfaced during verification and integrated: the `GET /branches` list path currently ships the AES-encrypted `redemptionPin` to the client (raw rows, not `toAdminBranchShape`). Invariant #7 was corrected to reflect this; merchant-web must never render/log the value (it derives only set/not-set), and a backend follow-up to drop `redemptionPin` from the list select is tracked in Section 11. [SUPERSEDED 2026-07-05 by PR #377: every merchant branch-row exit now strips the ciphertext and emits a derived `redemptionPinSet` boolean; the frontend reads the boolean (with a temporary presence-only legacy bridge for old-backend skew, removal-gated on a confirmed Railway deployment of the corrected contract). Historical description below preserved.]

Verdict: ready for owner review + Codex re-review. No implementation plan or code until both approve.
