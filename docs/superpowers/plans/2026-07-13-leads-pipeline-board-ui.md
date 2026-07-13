# Plan: Prospect pipeline board (Leads UI completion slice)

Status: ACTIVE · Tier 2 (bounded multi-file change, one surface: admin-web)
Authority: leads-onboarding-spec §A2/§B2 (docs/superpowers/specs/2026-07-10-admin-panel-module-specs/);
OD1 owner decisions; backend contract = the MERGED MerchantLead packet (#500, eeaab9df).
Recon finding driving this scope: the Leads hub, create-draft, and assisted wizard ALREADY EXIST
(PR #473 family). The ONLY unbuilt spec piece is the §A2 prospect pipeline; its current
`ProspectPipelinePlaceholder` copy ("no lead table exists yet") is now factually stale.

## 1. Scope (exactly)

In `apps/admin-web`:
1. NEW `lib/api/leads.ts`: Zod-validated client for the four #500 routes (list with
   stage/source/overdue/includeTerminal params as LITERAL 'true'/'false'; create returning
   { lead, duplicateWarning }; patch; convert). Mirrors team.ts idiom (header route block,
   z.infer types, apiFetch auth:true, ApiError codes documented).
2. NEW `lib/leads/useLeadsPipeline.ts` (+ mutation hooks): React Query, { enabled } gated on
   ready && can('lead:manage'), invalidation on mutate.
3. REPLACE `ProspectPipelinePlaceholder` with a real `features/leads/ProspectPipeline.tsx`
   section per spec §A2: header ("Prospect pipeline" + amber Net-new chip + "+ Add lead" when
   can('lead:manage')); honesty note UPDATED to the true current state (lead model live;
   customer-app "Request a merchant" intake still deferred/future source; assign-then-claim;
   Lost requires a reason and is audited); 3-column board (Lead / Contacted / Visit booked,
   tone bar + count pill + hint per spec, tones mapped to EXISTING BadgeTone semantics in
   adminTones.ts, no new hex); prospect cards per §B2 (biz name, "{categoryGuess} (guess) ·
   {locationHint}", source chip + amber "Future intake" chip for CUSTOMER_REQUEST, contact,
   "Next: {nextAction}" + "Due {date}" with Overdue red when dueDate < now client-side,
   "Rep: {assignedRepId}"); Lost section (grey pill + "Reason: {lostReason}") and Converted
   section (green pill) fetched via includeTerminal=true; states: empty (dashed "No prospects
   yet"), loading (3 skeleton columns), error ("Could not load the pipeline" + "Try again"),
   denied ("Pipeline is restricted": role lacks lead:manage).
4. Card actions (buttons, NO drag-drop v1): stage moves (Lead->Contacted->Visit booked, and
   backwards), "Mark lost" (dialog; reason REQUIRED; includes the OWNER-QUEUE ITEM copy hint:
   "Do not put personal or contact details in the reason: it is kept for analytics"),
   "Convert" (dialog collecting ownerEmail/first/last + optional tradingName, prefilled from
   contactName/contactEmail where sensible; visible only when can('lead:manage') AND
   can('merchant:create-draft'), mirroring the backend dual gate; success links to the new
   merchant's 360). "+ Add lead" dialog: minimal form per OD1 (businessName required; category
   guess, location, contact fields, source select, next action + due date, all optional) with
   the same no-personal-data hint next to free-text fields; surfaces duplicateWarning as a
   non-blocking amber notice after create.
5. `NamedGateBanner` CODE_MESSAGES: add LEAD_NOT_FOUND, LEAD_LOST_REASON_REQUIRED,
   LEAD_STAGE_NOT_DIRECTLY_SETTABLE, LEAD_ALREADY_CONVERTED, LEAD_ANONYMISED.
6. Verify admin-web's AdminCapability mirror includes 'lead:manage'; add if missing.

OUT of scope: hub sections 1-2 (built), create-draft (built), assisted wizard (built),
drag-drop, URL-addressable filters (avoids the useSearchParams/Suspense build trap),
assignedRep name resolution (shows the id or omits when null; roster join is a follow-up),
PROTOTYPE-ONLY demo switchers (omitted per spec).

## 2. Decisions (Fable)

- Overdue = client-side dueDate < now on render (spec's hardcoded prototype today dropped);
  the backend overdue query param stays unused by the board v1 (one fetch, filter locally).
- Two fetches: lanes (default list) + terminal (includeTerminal=true, filtered client-side to
  CONVERTED/LOST for the two sections). Acceptable at take-500 scale.
- Anonymised leads (anonymisedAt set) render with contact block replaced by a muted
  "Contact details anonymised (data retention)" line; edit actions hidden (backend 409s).
- Stage tone mapping: LEAD -> neutral, CONTACTED -> info, VISIT_BOOKED -> warn (existing
  BadgeTone palette; spec hexes are prototype-only).
- lostReason PII hint ships HERE (closes the owner-queue item from #500).

## 3. Verification lane (all four, mandatory)

`npx tsc --noEmit` · `npm run lint` · `npx jest` · `npx next build` in apps/admin-web.
Tests mirror house idiom (mock useSession + data hooks): board renders lanes/cards from hook
data; denied state when !can('lead:manage'); Add lead hidden without cap; Convert hidden
without merchant:create-draft; overdue flag logic; Mark-lost dialog requires reason; dedupe
warning rendered non-blocking; NamedGateBanner lead codes; anonymised card treatment;
lib/api/leads.ts contract tests (Zod parse, literal boolean params, ApiError passthrough).

## 4. Process

Opus builds -> Fable verifies -> Opus adversarial review (contract drift vs #500 routes,
cap-gate parity, stale-copy removal, a11y of dialogs, test vacuity) -> adjudicate -> PR
(frozen) -> Codex -> owner SHA gate. No backend changes; no schema; no env/provider surface.
