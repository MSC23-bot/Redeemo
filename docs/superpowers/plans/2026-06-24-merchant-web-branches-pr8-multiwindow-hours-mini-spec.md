# PR-8 mini-spec: Multi-window opening hours (shared platform slice)

Status: DRAFT for owner + Codex review. Docs-only. No implementation until approved. This is the LAST + most cross-cutting Branches slice.

Programme: Merchant Portal Branches (PR-1 to PR-8). Source of truth: `docs/superpowers/specs/2026-06-23-merchant-web-branches-programme-design.md` (umbrella, D9 + the PR-8 section). Forward-coupled to the PR-4 mini-spec (`2026-06-24-merchant-web-branches-pr4-hours-cooloff-mini-spec.md`).

Locked decision being implemented: D9. "Multi-window opening hours via a multi-row model, sequenced LAST, bundling the cross-midnight `isOpenNow` fix. This is a SHARED PLATFORM HOURS SLICE, not a branch-page-only feature: when it lands it must update the backend opening-hours schema/model, the validator, customer `isOpenNow`/open-status reads, the day-2 Branches editor/display, the onboarding branch opening-hours step/editor/display, any shared formatting/display helpers, and tests for BOTH onboarding and day-2. Move from one row per day to multiple rows per day by dropping/replacing `@@unique([branchId, dayOfWeek])`; preserve a clean per-day closed state; validate no overlaps per day; preserve/define ordering; keep or explicitly update the `24:00`/open-24h semantics; fix cross-midnight `isOpenNow` at the same time; make customer reads evaluate multiple windows; migrate existing single-window data safely. If an implementation plan tries to update only day-2 Branches, stop and correct it."

Grounded in a five-subsystem live-code inspection (model + validator; customer `isOpenNow` + cross-midnight + reads; the single->multi migration + PR-4 forward-coupling; the onboarding + day-2 editors; shared formatting + the full customer-app/customer-web surface).

BASELINE NOTE: PR-8 stacks on PR-1..PR-7. The backend hours model/validator/`isOpenNow` + the customer reads (discovery, favourites) + the customer-web hours sections are on `main`. The merchant-web onboarding + day-2 editors + `lib/branches/openNow.ts` + the shared client `hoursModel.ts` are stack-only (PR-1; read via `git show feat/merchant-web-branches-pr3-photos:<path>`). The PR-4 `BranchOpeningHoursPending` model + promotion worker are defined in the PR-4 mini-spec and exist only once PR-4 lands (PR-8 lands AFTER PR-4 in the stack). Locate by symbol; line numbers are indicative.

---

## 1. Live-code reality (what exists today)

- `BranchOpeningHours` (prisma/schema.prisma ~578-589): single window per day enforced by `@@unique([branchId, dayOfWeek])`. Fields `dayOfWeek Int`, `openTime String?`, `closeTime String?` (HH:MM), `isClosed Boolean`, `onDelete: Cascade`.
- `validateOpeningHours` (src/api/merchant/branch/openingHours.ts): single-period-per-day. Duplicate-day reject (~60); `HHMM_REGEX` (~38); `24:00` allowed ONLY as `closeTime` (~84); zero-length (`open===close`) reject (~90); overnight `close < open` ACCEPTED (~88-89, with a docstring note that the customer consumer treats it as crossing midnight - which is the latent bug, see below).
- `setOpeningHours` (src/api/merchant/branch/service.ts): per-day `prisma.branchOpeningHours.upsert` keyed on the `branchId_dayOfWeek` composite (~572). Multi-row breaks this composite-key upsert. (PR-4 makes `setOpeningHours` stage-not-apply; the actual live write moves to the PR-4 promotion worker, which also does a per-day upsert PR-8 must rewrite.)
- `POST /branches/:id/hours` (routes.ts) + `openingHoursBody` Zod: `{ hours: Array<{ dayOfWeek, openTime?, closeTime?, isClosed }> }`. Zod must accept N rows per day under multi-row.
- `isOpenNow` (src/api/shared/isOpenNow.ts): THE canonical server open-status evaluator + the SINGLE producer of the customer open/closed boolean. Reads ONLY today's row (`hours.find(h => h.dayOfWeek === todayDow)`, ~36) and tests `nowMins >= openMins && nowMins < closeMins` (~46, half-open same-day, NO wrap). So an overnight window (`close < open`, e.g. 18:00->02:00) reads as perpetually CLOSED (the half-open interval is empty), AND it never checks yesterday's late window for a 00:00-02:00 spillover. Europe/London via inline Intl parsing (does NOT use the `getLondonClock` helper). This is the cross-midnight bug D9 mandates fixing.
- Customer backend reads: `src/api/customer/discovery/service.ts` has ~6 `isOpenNow` call sites (BranchTile, merchant-profile, search openNow filter) + exposes per-branch `openingHours` arrays to the app; `src/api/customer/favourites/service.ts` has 2 more + drives an `isOpen` sort key. The `openingHours` selects are inconsistent on `orderBy` (some none, some `{dayOfWeek}`). All route the boolean through `isOpenNow`, so fixing `isOpenNow` once corrects every backend call site.
- THE FOUR PARALLEL OPEN-STATUS EVALUATORS (all single-row, same-day, cross-midnight-broken, must be fixed in LOCKSTEP):
  1. backend `src/api/shared/isOpenNow.ts` (the canonical server boolean).
  2. customer-app `apps/customer-app/src/features/merchant/utils/smartStatus.ts` (derives the pill STATE + "Closes at / Closes in N min / Opens at / Opens tomorrow" status TEXT client-side from the raw `openingHours` array; `hours.find(dayOfWeek===today)` + `findNextOpen`, single-interval).
  3. customer-app `apps/customer-app/src/features/merchant/hooks/useOpenStatus.ts` (builds the weekly schedule grid; `hours.find(dayOfWeek===i)`, one row per day, single "{open} to {close}" string).
  4. merchant-web `apps/merchant-web/lib/branches/openNow.ts` (the merchant-web client mirror of `isOpenNow`; explicitly comments "Do NOT fix cross-midnight here: that is PR-8"; single-row, half-open same-day).
- The customer-app contract `apps/customer-app/src/lib/api/merchant.ts` `openingHourEntrySchema` = `{ dayOfWeek, openTime?, closeTime?, isClosed }` (ONE entry per day). Multi-row means multiple entries share a `dayOfWeek`, so every `.find(h => h.dayOfWeek === X)` consumer (smartStatus, useOpenStatus, OpeningHoursCard, HoursPreviewSheet) breaks unless reworked to group-by-day.
- customer-web (on `main`): `apps/customer-web/components/merchant-profile/OpeningHoursSection.tsx` collapses to one row per day via `new Map(hours.map(h => [h.dayOfWeek, h]))` (LAST-wins) + renders a single "{open} to {close}"; `HoursAndAmenitiesSection.tsx` shows the open-now dot (consumes the server boolean, so the `isOpenNow` fix corrects it) + uses device-local `new Date().getDay()` for the TODAY row instead of Europe/London (a pre-existing TZ drift). Both MUST be updated (the shared-platform slice includes customer-web).
- merchant-web editors (stack-only): the SHARED client `apps/merchant-web/components/onboarding/branch/lib/hoursModel.ts` (`DayHours` carries ONE `openTime`/`closeTime`; `validateHoursState` keyed by single dayOfWeek; `toHoursPayload` emits one row per day; `hoursStateFromBranch` prefills via a `Map` keyed by single `dayOfWeek` = a LAST-WINS collapse that silently drops extra windows until reworked, the same break pattern as customer-web `OpeningHoursSection`; copy-Monday; Open-24h) - used by onboarding `BranchStepForm` (Section 4) AND by the PR-4 day-2 editor. The day-2 `OpeningHoursCard` has its OWN inline `DAYS`/`friendlyTime`/`rowText` display (one row per day) + a locked "Add a second window" PR-8 affordance.
- Formatting is DUPLICATED 5x with NO shared module (drift risk): `useOpenStatus` (raw), customer-web `OpeningHoursSection` (raw), customer-web `HoursAndAmenitiesSection` (raw), merchant-web day-2 `OpeningHoursCard` (`friendlyTime`), and the customer-app voucher `scheduleString` (the ONLY multi-window + cross-midnight + 24:00-correct one).
- Seed/compound-key write sites that break at the `@@unique` drop: `service.ts` per-day upsert (~572) + `prisma/seed.ts` (~1203/1261/1321) + `prisma/seed-demo.ts` (~750). `prisma/seed-reference.ts` writes no hours (clean).
- The PR-4 `BranchOpeningHoursPending` model (single-window `proposedHours` JSON + `effectiveAt` + `PendingHoursStatus` PENDING/PROMOTED/CANCELLED) + its promotion worker (per-day upsert) exist once PR-4 lands.

Correction to the prompt framing: the customer-app does NOT merely "consume the server boolean" - `smartStatus` + `useOpenStatus` independently re-derive status TEXT + the weekly schedule from the raw `openingHours` array client-side and both assume one row per day. So PR-8 is NOT a backend-only read change; the client evaluators + display + the `openingHourEntrySchema` consumers all need rework.

---

## 2. Prototype behaviour being targeted

Multiple opening windows per day (e.g. "9am to 2pm, 5pm to 11pm"), entered in both onboarding and the day-2 branch editor, displayed correctly to customers, with correct open/closed status across midnight. The day-2 `OpeningHoursCard`'s "Add a second window" affordance (locked in PR-1) becomes live here.

---

## 3. Schema change (structural, additive-data-safe)

- DROP `@@unique([branchId, dayOfWeek])`; ADD a replacement NON-unique `@@index([branchId, dayOfWeek])` (keeps the always-load-whole per-day reads index-backed).
- NO new column, NO data transform: existing single-window rows ARE already valid 1-window-per-day multi-rows. The migration is purely the constraint swap.
- Ordering (recorded default): order windows by `(dayOfWeek asc, openTime asc)`. No explicit `windowIndex`/`sortOrder` column is needed because within a day the no-overlap rule makes `openTime` a unique, deterministic sort key. Apply this sort in the validator's overlap scan AND in EVERY `openingHours` Prisma select (several selects currently have inconsistent or no `orderBy`) AND in every formatter, so multi-window rows render in a stable order. (Alternative considered: a `sortOrder` column. Rejected as unnecessary given no-overlap; flip at review if the owner wants explicit window ordering independent of time.)
- Migration: one additive dated dir. `DROP INDEX "BranchOpeningHours_branchId_dayOfWeek_key"; CREATE INDEX ... ON "BranchOpeningHours"("branchId","dayOfWeek");`. Dev-first via `prisma migrate dev`; staging/prod via `prisma migrate deploy`.
- IRREVERSIBILITY (rollback note): dropping the unique is effectively ONE-WAY once any branch has 2+ rows for a day. The down-path cannot re-add the unique after multi-row data lands. Flag to owner as an accepted irreversible structural change (the data-preservation forward-path is safe; only the rollback is constrained).

---

## 4. The locked semantics (closed day, overnight, 24:00, ordering)

- CLOSED DAY (recorded default): exactly ONE row `{ dayOfWeek, isClosed: true, openTime: null, closeTime: null }` per closed day; ZERO open-window rows for that day. An open day = N>=1 rows `{ isClosed: false, both times }`. FORBID mixing `isClosed: true` with open windows on the same day (validator reject).
- OVERNIGHT / CROSS-MIDNIGHT (D9-settled, NOT a fresh fork): `close < open` is the first-class encoding for a window that crosses midnight (e.g. `open 18:00, close 02:00` = 6pm to 2am next day). This is already what the validator stores; D9 mandates the READERS be fixed to interpret it as crossing midnight (currently they read it as perpetually-closed). PR-8 fixes the readers, it does NOT change the encoding or reject overnight.
- `24:00` (kept): remains the literal end-of-day close sentinel (`open 09:00, close 24:00` = 9am to midnight). Open-24h = a single `00:00 -> 24:00` window. `24:00` is NOT a valid `openTime` (kept). `24:00`-as-close and `close < open`-overnight are DISTINCT and unambiguous (24:00 = ends exactly at midnight; close<open = continues past midnight into the next day).
- VALIDATOR (`openingHours.ts`) changes: replace the duplicate-day reject with per-day grouping; ADD NO-OVERLAP validation that is BOTH within-day AND CROSS-DAY; keep the per-row format / `24:00`-close / zero-length / closed-day rules; forbid `isClosed:true` mixed with open windows.
  - WITHIN-DAY: after sorting a day's windows by openTime, no two of that day's windows may overlap (on half-open intervals, below).
  - CROSS-DAY (the spill case Codex flagged): an overnight window (`close < open`) on day D spills into day D+1 as the interval `[00:00, close)` of D+1. The validator MUST reject any window on D+1 that overlaps that spill. Example: Monday `18:00-02:00` spills to Tuesday `[00:00, 02:00)`; a Tuesday `01:00-03:00` window overlaps it and MUST be REJECTED. So the overlap scan for each day D considers (a) D's own windows AND (b) the prior day (D-1)'s overnight spill `[00:00, (D-1 overnight close))`. (Within a single day's own rows, an overnight window's span is also treated as `[open, 24:00)` for the same-day part; its `[00:00, close)` part is the spill checked against D+1.)
  - OVERLAP BOUNDARY (locked): overlap is detected on HALF-OPEN intervals `[open, close)` to match `isOpenNow`; abutting windows where `prev.close === next.open` (e.g. `09:00-14:00` then `14:00-23:00`, OR a prior-day spill ending exactly at the next window's open) are ACCEPTED (no gap, no double-open). Do NOT use a closed-interval check (it would wrongly reject legitimate back-to-back windows).
  - CLOSED-DAY + SPILL (clarified): a day marked closed (one `isClosed:true` row, ZERO open windows) may STILL receive a prior-day overnight spill: the branch is genuinely OPEN during `[00:00, (prior-day overnight close))` even though no window ORIGINATES on the closed day, and `isOpenNow`'s yesterday-spillover pass reports it open. This is ALLOWED (a closed day forbids windows originating that day, not a prior-day spill). The cross-day overlap reject only fires when the day has its OWN windows that overlap the prior-day spill; a closed day has none, so there is nothing to reject.

---

## 5. Customer-visible behaviour (the cross-midnight fix + multi-window display)

- `isOpenNow` (src/api/shared/isOpenNow.ts) rewrite (the single anchor; corrects all backend call sites at once): (1) collect ALL of today's non-closed rows (filter by `dayOfWeek === todayDow`, NOT `.find`); for each, parse `openMins`/`closeMins` (`24:00` => 1440); if `closeMins > openMins` (same-day, incl. 1440 end-of-day) test `nowMins >= openMins && nowMins < closeMins`; if `closeMins < openMins` (overnight) test `nowMins >= openMins` (the pre-midnight portion of today's overnight window); return true on first hit. (2) ADD a yesterday-spillover pass: for each of yesterday's rows (`dayOfWeek === (todayDow + 6) % 7`) that are overnight (`closeMins < openMins`), test `nowMins < closeMins` (the post-midnight tail). Derive today + yesterday dow + now-minutes via the `getLondonClock` helper (Europe/London) so the file stops duplicating Intl parsing. No schema field, no second function.
- The same multi-window + overnight logic is mirrored into the 3 client evaluators (smartStatus, useOpenStatus, merchant-web openNow.ts) so the pill state, status text, weekly grid, and merchant-web open-now all become multi-window + cross-midnight correct in lockstep. (LONGER-TERM the backend could emit `statusText`/`isClosingSoon`/`closesAtLocal` so the clients become thin pass-throughs - that wider contract change is DEFERRED; PR-8 makes the existing client logic correct, it does not move the whole derivation server-side.)
- Multi-window DISPLAY: customer-app (`useOpenStatus`/`OpeningHoursCard`/`HoursPreviewSheet`), customer-web (`OpeningHoursSection`), and merchant-web (`OpeningHoursCard`) render N windows per day (e.g. "9:00 am to 2:00 pm, 5:00 pm to 11:00 pm"), ordered by openTime. The customer-app `openingHourEntrySchema` consumers move from `.find(dayOfWeek===X)` to group-by-day.
- The customer open/closed BOOLEAN stays server-computed (one producer, `isOpenNow`); the fix is a backend read-logic change + the client re-derivers being made multi-window-correct. No customer data model change customer-side; the wire just carries N entries per day.

---

## 6. Merchant / admin behaviour

- SHARED client model `hoursModel.ts` -> multi-window: `DayHours` carries `windows: { openTime; closeTime }[]` (not a single pair); `validateHoursState` adds per-day no-overlap + sorted ordering (keeping HHMM + `24:00`-close + `open !== close` rules); `toHoursPayload` emits N rows per day (closed days still omit times, one `isClosed` row); `hoursStateFromBranch` GROUPS backend rows by `dayOfWeek` into `windows[]` (the safe in-UI migration of existing single-window rows); `applyOpen24h` under the windows model. This one file covers BOTH the onboarding editor AND the PR-4 day-2 editor MODEL.
- ONBOARDING `BranchStepForm` (Section 4): add/remove multiple window rows per day with per-row + per-day-overlap inline errors; reconcile the existing cross-midnight hint copy.
- DAY-2 `OpeningHoursCard`: the "Add a second window" `LockedAffordance` becomes live (the editor is editable via the PR-4 cool-off path + `hoursModel.ts`); extend the inline display to render N windows per day.
- merchant-web `openNow.ts` (the 4th evaluator) gets the SAME multi-window + cross-midnight fix as backend `isOpenNow` (identical logic), removing its "Do NOT fix cross-midnight here: that is PR-8" deferral.
- Admin: NONE specific to PR-8 (hours are merchant self-service via the PR-4 cool-off; PR-8 is a model/read change). The day-2 hours edit continues to ride the PR-4 cool-off staging + `assertCanManageBranch` authz; onboarding hours stay direct-write (owner, draft-window). PR-8 changes the MODEL + the readers, not the authz or the staging flow.

---

## 7. Authorization

PR-8 does NOT change who may edit hours. Day-2 hours edits ride the PR-4 cool-off path (OWNER + assigned BRANCH_MANAGER via `assertCanManageBranch`, STAFF denied); onboarding hours are direct-write during the draft window (owner). PR-8 only changes the data MODEL (single->multi-row), the validator, the readers, and the editors' window UI. The customer reads remain unauthenticated discovery reads.

---

## 8. Tests (BOTH onboarding AND day-2 - D9 requires)

Backend:
- Validator: multi-window per day accepted; within-day overlap rejected; CROSS-DAY overlap rejected (Monday `18:00-02:00` overnight spill vs Tuesday `01:00-03:00` -> REJECT); abutting accepted both within-day (`09:00-14:00` + `14:00-23:00`) AND across-day (a prior-day spill ending exactly at the next window's open); closed-day = one `isClosed` row (no times) accepted, `isClosed` mixed with open windows rejected; a closed day WITH a prior-day overnight spill accepted (no window originates that day; `isOpenNow` still reports open during the spill); `24:00`-close accepted; `open === close` rejected; ordering normalised.
- `isOpenNow` (NEW cross-midnight + multi-window tests - none exist today): same-day window in/out; multiple windows in a day (open in the 2nd window); overnight window `close < open` reads OPEN in its pre-midnight portion (today's row) AND in its post-midnight tail (yesterday-spillover pass); 24:00 end-of-day boundary; closed day reads closed; Europe/London correctness (BST/GMT).
- Favourites ordering shift (intended correctness side-effect, pin it): the favourites `isOpen` sort key changes for any branch with an overnight window once `isOpenNow` is fixed (a previously-always-closed overnight branch now reads OPEN in its window and floats up). This is the intended fix, NOT a regression; pin the new ordering in the favourites test so it is not flagged as a QA surprise.
- Migration: existing single-window rows preserved as first/only window (no transform); the `@@unique` drop + index add; the 5 compound-key write sites (service/seed/seed-demo) updated to the multi-row write (transactional delete-all-for-branch + createMany).
- PR-4 forward-coupling: an in-flight PR-4 `BranchOpeningHoursPending` (single-window `proposedHours` JSON) promotes correctly under the multi-row model (the rewritten PR-4 promotion worker does delete-all + createMany); a future-dated PENDING row is carried forward (its single-window JSON is a valid multi-row subset); a due PENDING row promotes inline.

Client (customer-app + customer-web + merchant-web, multi-window + cross-midnight):
- customer-app `smartStatus` + `useOpenStatus` (NO overnight tests exist today): status text + the weekly grid correct for N windows per day + overnight (the post-midnight tail shows OPEN). `HoursPreviewSheet` inherits.
- merchant-web `openNow.ts`: same multi-window + cross-midnight pins as backend `isOpenNow`.
- The onboarding `BranchStepForm` + the day-2 `OpeningHoursCard` editors: add/remove windows, per-day overlap inline error, closed-day, 24:00, the multi-window display.
- customer-web `OpeningHoursSection`: renders N windows per day (no last-row-wins collapse); the TODAY row uses Europe/London (fix the device-local drift).

---

## 9. Rollback plan

- Code rollback: revert the PR. The validator/readers/editors return to single-window. BUT the schema `@@unique` drop is effectively IRREVERSIBLE once any branch has 2+ rows for a day (the down-migration cannot re-add the unique without dropping the extra rows). So a full rollback after multi-window data exists requires a data-cleanup decision (collapse each day to one window) - document this. Before any branch creates a 2nd window, the rollback is clean (re-add the unique).
- The forward migration is data-safe (no transform; existing rows are valid single-window multi-rows). Only the rollback is constrained.
- The 4 client evaluators + the shared formatter + the seed updates revert with the code.

---

## 10. Stop-and-report triggers

- DAY-2-ONLY SCOPE = HARD STOP (D9): any plan that updates only the day-2 `OpeningHoursCard` and omits the onboarding `BranchStepForm`/`hoursModel.ts`, the backend validator + `isOpenNow`, the customer reads (discovery + favourites), customer-web `OpeningHoursSection`, the customer-app `smartStatus`/`useOpenStatus`, OR merchant-web `openNow.ts` - STOP and correct it.
- CROSS-MIDNIGHT DEFERRED-NOT-FIXED = STOP: if a plan preserves the `close < open` perpetually-closed behaviour instead of fixing all four evaluators in lockstep, STOP (D9 bundles the fix).
- The migration cannot preserve existing single-window data safely (NOT expected - it is a no-transform constraint swap; existing rows are valid multi-rows).
- PR-4 in-flight pending records cannot be deterministically resolved (NOT expected - promote-due + carry-forward; the single-window JSON is a valid multi-row subset; PR-8 lands after PR-4 and rewrites PR-4's promotion worker off the dropped `branchId_dayOfWeek` key). If PR-4 is NOT merged at PR-8 implementation time, the coupling is moot (no pending records exist) - confirm at implementation.
- A shared multi-window formatter cannot be cleanly extracted (then update each surface in lockstep instead, and report the duplication retained).
- DECISIONS RECORDED (not stops): closed-day = one `isClosed` row; ordering = sort by `(dayOfWeek, openTime)`, no column; overnight encoding = `close < open` (D9-settled); `24:00` = literal end-of-day close (kept); the 24:00/open-24h DISPLAY = one consistent human-friendly rendering across all surfaces (e.g. "midnight" for a 24:00 close, "Open 24 hours" for a full day) - flip the exact wording at review; the thin-client (backend emits statusText) refactor is deferred.
- DEPLOY: the structural migration must reach staging/prod via `prisma migrate deploy`.

---

## 11. Explicit deferrals

- The thin-client status refactor (backend emits `statusText`/`isClosingSoon`/`closesAtLocal` so the customer-app/merchant-web clients become pass-throughs) - DEFERRED; PR-8 makes the existing client re-derivers multi-window-correct but does not move the whole derivation server-side.
- A `sortOrder`/`windowIndex` column (PR-8 orders by `openTime`; an explicit column is deferred unless time-independent ordering is needed).
- Any further hours features (holiday/special-date hours, per-window labels, seasonal hours) - out of scope.
- PR-8 is the LAST Branches slice; after it the hours model is multi-window + cross-midnight-correct across onboarding, day-2, and all customer + merchant surfaces.

---

## 12. Cross-check table (existing code -> proposed PR-8)

| # | Existing (live code) | Proposed PR-8 | Note |
|---|---|---|---|
| 1 | `BranchOpeningHours` `@@unique([branchId,dayOfWeek])` = one window/day; `setOpeningHours`/the PR-4 worker per-day upsert keyed on that composite. | Drop the unique + add a non-unique `@@index([branchId,dayOfWeek])`; rewrite the write to transactional delete-all-for-branch + `createMany` (N rows/day). | No data transform (existing rows are valid single-window multi-rows). Irreversible once 2+ rows/day exist. |
| 2 | `validateOpeningHours` single-period: duplicate-day reject; `close<open` accepted (latent); `24:00` close sentinel. | Per-day grouping + within-day no-overlap + ordering; `close<open` = first-class overnight; `24:00` = end-of-day close; forbid `isClosed`-mixed-with-windows. | D9 settles `close<open` = crossing midnight. |
| 3 | `isOpenNow` reads ONLY today's row, half-open same-day (`nowMins>=open && nowMins<close`), overnight reads perpetually-CLOSED. | Iterate ALL today's windows (same-day + overnight pre-midnight) + a yesterday-spillover pass (overnight post-midnight tail); via `getLondonClock`. | The single anchor; corrects all 8 backend call sites. The cross-midnight FIX (D9). |
| 4 | FOUR parallel evaluators (backend `isOpenNow`, customer-app `smartStatus` + `useOpenStatus`, merchant-web `openNow.ts`) all single-row + cross-midnight-broken. | All four get the SAME multi-window + cross-midnight logic in lockstep. | Day-2-only / fix-one-evaluator-only = hard stop. |
| 5 | customer-app `openingHourEntrySchema` = one entry/day; `.find(dayOfWeek===X)` consumers. | Multiple entries share a `dayOfWeek`; consumers group-by-day. | Wire carries N entries/day; no customer schema change beyond cardinality. |
| 6 | customer-web `OpeningHoursSection` collapses to one row/day (`new Map` last-wins); device-local TODAY. | Render N windows/day; TODAY via Europe/London (fix the TZ drift). | customer-web is IN the shared-platform slice. |
| 7 | SHARED client `hoursModel.ts` (onboarding + PR-4 day-2 editor): one open/close pair per day. | `DayHours.windows[]`; multi-window validate + emit N rows + group-from-backend; one file covers both editors' model. | Onboarding + day-2 both updated (not day-2-only). |
| 8 | Formatting duplicated 5x, no shared module (only the voucher `scheduleString` is multi-window/cross-midnight/24:00-correct). | Extract ONE shared multi-window hours formatter (ADAPT the rendering from `scheduleString`); apply across customer-app + customer-web + merchant-web. | Kills the drift; consistent 24:00/open-24h rendering. ENCODING CAVEAT: `scheduleString` detects cross-midnight via a TWO-ROW partner pattern (dayN close `24:00` + dayN+1 open `00:00`), but branch hours encode cross-midnight as a SINGLE-ROW `close<open`. The extracted formatter must switch the cross-midnight detection to the `close<open` single-row encoding; it is NOT a verbatim reuse. |
| 9 | PR-4 `BranchOpeningHoursPending` (single-window `proposedHours` JSON + `effectiveAt`) + promotion worker (per-day upsert). | Promote-due inline at migration + carry-forward future-dated PENDING (single-window JSON is a valid multi-row subset); rewrite the PR-4 worker off the dropped composite key. | Deterministic resolution; no data loss. PR-8 lands after PR-4. |
| 10 | Seed/compound-key write sites: `service.ts` + `seed.ts` x3 + `seed-demo.ts`. | Updated to the multi-row write. `seed-reference.ts` (no hours) unaffected. | Required scope, not optional. |

---

## 13. PR shape + sequencing

- PR-8 is Tier-3 (structural schema) and the LAST + most cross-cutting Branches slice. It stacks AFTER PR-1..PR-7 (it depends on PR-4's cool-off staging + worker, which it rewrites for multi-row).
- Suggested order: schema (drop unique + index) + the validator rewrite -> the multi-row write (service + the PR-4 worker) + the migration + the 5 seed updates + the PR-4 pending resolution -> `isOpenNow` cross-midnight + multi-window (the anchor) + the backend selects' orderBy -> the 3 client evaluators (smartStatus, useOpenStatus, merchant-web openNow) in lockstep -> the shared client `hoursModel.ts` multi-window + the onboarding `BranchStepForm` + the day-2 `OpeningHoursCard` editors -> the shared formatter extraction + the multi-window DISPLAY across customer-app + customer-web + merchant-web (+ the customer-web TZ fix) -> tests for BOTH onboarding AND day-2 across all surfaces.
- Out of scope: the thin-client status refactor; a sortOrder column; holiday/special-date/per-window-label hours; anything beyond completing the multi-window + cross-midnight hours model.

No implementation until this mini-spec is owner + Codex approved.
