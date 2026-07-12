# Plan: MerchantLead packet (recruitment pipeline data layer)

Status: DRAFT for owner milestone review · Tier 3 (schema + new backend contract)
Owner authority: grill-me 2026-07-10 decisions OD1/OD4 (memory
`admin-recruitment-owner-decisions-2026-07-10`); recruitment build plan #460
(`2026-07-10-admin-panel-recruitment-build.md`) + module spec `leads-onboarding-spec.md`.
Migration posture: CREATE-ONLY, UNAPPLIED. Joins the owner-gated bundled staging window
alongside AdminCapabilityGrant (already on main, unapplied), MerchantNote, MerchantAgreementRecord.

## 1. Why this packet, why now

FIELD role + capability grants merged (#483/#487/#489/#494) but dormant. The recruitment
critical path is: FIELD authz (done) -> email enablement -> **leads pipeline** -> D65 signing.
`lead:manage` is already in the FIELD baseline on main; its capability.ts comment reserves
"the MerchantLead pipeline routes" as the sibling packet. This packet builds that data layer and
its routes so a rep can capture and progress a prospect, then hand off to the existing
create-draft / assisted-onboarding paths.

Scope of THIS packet: `MerchantLead` model + `MerchantSource` + `LeadStage` enums + backend
routes/service + the 6-month anonymisation job + unit tests. NOT in scope (separate packets in the
bundled window): `MerchantNote` (OD2), `MerchantAgreementRecord`/D65, and the admin-web Leads UI
screens (those consume this API in a later frontend slice).

## 2. RECONCILIATION: stale sketch vs owner-locked decisions (needs owner ack)

The `model MerchantLead` sketch in `code-mapping.md` predates the grill-me and conflicts with the
locked OD1 decisions. This plan follows OD1 (the authority). Discrepancies resolved:

| Field | Stale code-mapping sketch | OD1 owner-locked (AUTHORITY, used here) |
|---|---|---|
| Pipeline stages | `NEW->CONTACTED->QUALIFIED->ONBOARDING->WON->LOST` (6 kanban lanes) | Kanban lanes = **Lead / Contacted / Visit booked**; **Converted** and **Lost** are filterable STATES, not lanes |
| Source | free-text `source String? // referral/inbound/event/cold` | `MerchantSource` enum: REP_VISIT, INBOUND_ENQUIRY, PHONE, SOCIAL, EMAIL_CAMPAIGN, CUSTOMER_REQUEST |
| Retention/PII | none | 6-month auto-anonymise of Lost + stale-untouched leads (null contact name/phone/email; keep business name + category + location + outcome); converted leads keep merchant link; anonymise not delete; auditable scheduled job |
| Terminal naming | `WON` | `CONVERTED` (+ `convertedMerchantId` link) |
| Lost | `lostReason String?` | Lost REQUIRES a reason and is audited |
| Dedupe | not specified | warn-only (similar business name + postcode); never blocks |

If any of the above is not what you intend, say so before I write code.

## 3. Schema (create-only; mirrors the AdminCapabilityGrant migration pattern)

```prisma
enum MerchantSource {
  REP_VISIT
  INBOUND_ENQUIRY
  PHONE
  SOCIAL
  EMAIL_CAMPAIGN
  CUSTOMER_REQUEST
}

enum LeadStage {
  LEAD          // "Lead" lane: captured, not yet contacted
  CONTACTED     // reached out, in conversation
  VISIT_BOOKED  // meeting or on-site scheduled
  CONVERTED     // state, not a lane: create-draft/assisted fired from this lead
  LOST          // state, not a lane: requires lostReason, audited
}

model MerchantLead {
  id                  String        @id @default(uuid())
  businessName        String                        // retained through anonymisation
  categoryGuess       String?                       // retained (funnel analytics)
  locationHint        String?                       // postcode / city; retained
  contactName         String?                       // NULLED on anonymise
  contactEmail        String?                       // NULLED on anonymise
  contactPhone        String?                       // NULLED on anonymise
  source              MerchantSource?
  stage               LeadStage     @default(LEAD)
  nextAction          String?
  dueDate             DateTime?
  assignedRepId       String?                       // AdminUser id; no FK (additive, matches sketch note)
  lostReason          String?                       // required when stage=LOST (enforced in service)
  convertedMerchantId String?                       // set on convert; retained (keeps merchant link)
  lastActivityAt      DateTime      @default(now())  // drives the 6-month stale-untouched clock
  anonymisedAt        DateTime?                      // set by the scheduled job; idempotency guard
  createdAt           DateTime      @default(now())
  updatedAt           DateTime      @updatedAt

  @@index([stage])
  @@index([assignedRepId])
  @@index([dueDate])
  @@index([stage, anonymisedAt])   // anonymisation sweep predicate
}
```

Notes:
- No FK on `assignedRepId`/`convertedMerchantId`: additive, avoids cross-table migration coupling
  in the bundled window (matches the sketch's stated intent). Referential integrity enforced in
  service layer.
- `lastActivityAt` is the anonymisation clock (bumped on any stage/contact/note write), distinct
  from `updatedAt` (bumped by Prisma on every write incl. the anonymise write itself, so it can't
  be the clock).

## 4. Backend

- **Capabilities**: `lead:manage` already exists (FIELD baseline). Read is covered by the same cap
  for v1 (no separate `lead:read`; FIELD holds `lead:manage`, other ops roles get it via grant if
  owner later wishes). Confirm: single-cap v1, or split read/manage? (default: single `lead:manage`).
- **Routes** (`src/api/admin/leads/`): `GET /admin/leads` (list + filters: stage, assignedRep,
  overdue, source, includeConverted/Lost); `POST /admin/leads` (create; warn-only dedupe returns a
  `duplicateWarning` alongside the created row); `PATCH /admin/leads/:id` (edit fields / advance
  stage; LOST requires `lostReason`); `POST /admin/leads/:id/convert` (writes `convertedMerchantId`
  + stage=CONVERTED, then calls existing `createMerchantDraft`; single audited action).
  Boolean query params (`overdue`, `includeTerminal`) parse the literal token
  (`z.enum(['true','false']).transform`), NOT `z.coerce.boolean()`: `Boolean('false')` is truthy, so
  a coerced `?overdue=false` would wrongly filter (F2 fix, mirrors the redemptions surface).
- **Audit**: emit admin audit events for create / stage-change / lost / convert (reuse existing
  admin audit emitter used by approvals). Lead audit rows are **PII-FREE by design** (F1): a
  LEAD_UPDATED row carries a before/after diff of only the CHANGED **non-PII** fields plus a
  `metadata.changedFields` list of every changed field NAME; contact PII values
  (contactName/contactEmail/contactPhone) never enter an audit row, because audit rows OUTLIVE the
  lead's PII (the 6-month anonymisation below nulls the contact fields but retains the AuditLog).
  Field names may appear in `changedFields`; values never do. LEAD_CONVERTED retains
  `metadata.ownerEmail` (converted leads are exempt and that email lives on the merchant draft).
- **Anonymisation sweep** (`src/api/queues/processors/leadAnonymiseSweep.ts`, sweep name
  `lead-anonymise`, lock key `731_004`): idempotent, advisory-locked, bounded sweep on the
  process-local maintenance scheduler (the same durable floor as outbox / pending-hours /
  claim-stale, its own enable flag `MAINTENANCE_SWEEP_LEAD_ANONYMISE_ENABLED`), NOT a BullMQ
  repeatable. Phase A (locked, DB clock) selects up to 200 rows WHERE
  `anonymisedAt IS NULL AND convertedMerchantId IS NULL AND (stage=LOST OR lastActivityAt <
  dbNow - 6 months)`. Phase B per row is one atomic transaction: a conditional CAS `updateMany`
  re-checks the EXACT Phase-A snapshot (id + anonymisedAt still null + convertedMerchantId still
  null + lastActivityAt unchanged + stage unchanged), so a **touched lead re-arms its 6-month
  clock** and a **converted lead becomes exempt at CAS time** (both safely SKIP: no write, not a
  failure). The winner nulls the three contact fields, stamps `anonymisedAt`, and writes a
  PII-free `LEAD_ANONYMISED` audit row (actorType SYSTEM, `metadata.trigger` = `LOST` | `STALE`,
  no nulled values snapshotted) in the SAME transaction.

## 5. Slices (each its own reviewed commit; one PR)

1. Schema + create-only migration (UNAPPLIED) + enum wiring; `npx prisma generate` only, never
   `migrate`/`db push` against a shared DB.
2. Service + routes + capability guard + audit; unit tests (list/create/dedupe/convert/lost-guard).
3. Anonymisation job + its unit tests (clock predicate, idempotency, converted-exempt).
4. Opus adversarial review (PII handling, cap enforcement, dedupe false-negatives, job idempotency)
   -> fix on-branch -> Codex source review -> owner SHA-bound gate -> merge.

## 6. Test lane

Backend `npm run test:unit` ONLY. No integration suites (they mutate shared Neon). Migration is
never applied here; schema validated via `npx prisma validate` + `generate`.

## 7. Boundaries preserved

Create-only migration, unapplied to any shared DB until the owner's bundled window. No prod, no
provider, no secrets. UK-GDPR anonymisation per OD1. Nothing merges without Codex review + owner
SHA-bound approval + live gate.
