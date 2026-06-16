# Merchant Portal + Admin Actioner + Onboarding — Design Spec

**Status:** Design / brainstorm-locked (grill-me Q1–Q7 complete). NOT yet planned or implemented.
**Date:** 2026-06-10
**Owner:** Redeemo
**Tier:** 3 (new architecture + backend contracts + schema changes + infra) — requires this spec → `writing-plans` → implementation.
**v1.1 refinements (2026-06-10, post-review):** (1) **day-2 edit tiering** — operational/marketing fields (hours/phone/photos/description) publish **instantly + audited + revertible**; only **identity/integrity** fields (name/address/map-location/logo) gate for approval (§3/§8/§10/§12); reverses the earlier "tighten everything visible" lean. (2) verification pre-score must surface **structured findings**, not just a RAG colour (§5/§8). (3) **RmvTemplate coverage = 2 tailored (Food & Drink, Beauty) + 4 generic placeholders to REPLACE (Health & Fitness, Shopping, Out & About, Home & Local Services — their `20% Off` contradicts the brand) + 5 empty (Travel & Hotels, Health & Medical, Family & Kids, Auto & Garage, Pet Services)** — first-pass templates for all 9 are drafted in the companion doc (§7/§16).
**Scope of this doc:** The complete design for the **"first live merchant" loop** — register → onboard → verify → approve → go-live → day-2 management. Captures every decision locked in the grill-me brainstorm (2026-06-10). The Phase-5 commercial layer (merchant billing / campaigns / featured) is explicitly OUT and gets its own brainstorm later.

**Builds on (does not re-derive):**
- `docs/superpowers/specs/2026-06-07-merchant-admin-platform-strategy.md` — the umbrella strategy/audit (the chokepoint diagnosis, phased roadmap).
- `docs/superpowers/specs/2026-05-14-merchant-exact-pin-confirmation-design.md` — Google Places pin confirmation (`confirmPin`).
- `docs/superpowers/specs/2026-04-28-category-taxonomy-design.md` — the category taxonomy + `RmvTemplate` system.
- `docs/runbooks/deploy-security-runbook.md` + the Security/Legal/Domain gate (mostly code-complete) — the foundations this builds on.

---

## 0. Goal, scope boundary, key principle

**Goal:** make a merchant go **lead/register → ACTIVE and redeemable through the product** (not seed-only). The binding constraint today is that `AdminApproval` has writers but **zero readers** — no actioner exists, so no merchant can reach `ACTIVE` through the product.

**Governing principle (locked):** **An admin may act FOR a merchant, never AS a merchant.** And: **the merchant always owns their credentials, their legal acceptance, and their commercial offer.**

**Scope boundary:**
- **IN (this spec):** lifecycle state model · entry/identity + self-register + `MerchantLead`/claim · merchant RBAC (`MerchantMembership`) · onboarding workspace + verification + contract + mandatory-voucher offer engine · admin actioner + admin RBAC + platform-wide audit + admin-edit-on-behalf · go-live + day-2 portal + redemption visibility + validation.
- **PREREQUISITE (Phase 0 foundations — separate plan, this loop depends on them):** Resend email + `shared/notify.ts` dispatcher (writes `Notification` + `CommunicationLog`) · R2 file upload (multipart + presigned) · §SEC.1 atomic password-reset limiter · background-job runner (BullMQ on Redis) · staging environment.
- **FAST-FOLLOW:** full `MerchantLead` CRM (Kanban/rep-assignment/coverage) · admin-create-lead + claim if not pulled into MVP · read-only view-as-merchant · AI offer suggestions · admin RmvTemplate/tip editor · richer analytics/statements/exports · grant-management UI.
- **DEFERRED:** merchant billing / campaigns / featured (Phase-5 commercial — its own brainstorm) · FINANCE payment capabilities · multi-user merchant roles beyond OWNER/BRANCH_MANAGER/STAFF · QR-scan + dedicated merchant mobile app (Phase 4) · Plan 3 PC3-interests migration.

---

## 1. Merchant lifecycle state model (the backbone)

**Decision (Q2): adopt the existing 4-axis model and CONSTRAIN it — do NOT collapse/rename/remove enums. Additive changes only.** The actioner is the SINGLE atomic writer of approval/review transitions; the four axes must never drift.

**Four axes + source-of-truth:**
- `MerchantStatus` — **ops/customer-visibility truth** (`REGISTERED → PENDING_APPROVAL → ACTIVE / INACTIVE / SUSPENDED / DELETED`). Discovery + redemption gate on `ACTIVE`.
- `OnboardingStep` — **merchant-facing journey** (primary source for the portal status label).
- `VerificationStatus` — **review outcome** (`NOT_SUBMITTED → PENDING → VERIFIED / REJECTED`).
- `ContractStatus` — **sub-fact** (`NOT_SIGNED → SIGNED`).

**Additive enum changes (locked):**
- `OnboardingStep += REJECTED` (terminal, distinct from `NEEDS_CHANGES`) `+= UNDER_REVIEW` (claim-to-review). **No `INVITED`** — invite/claim-pending lives on `MerchantLead`.
- **Wire `VerificationStatus`** (currently inert — never written): submit → `PENDING`, approve → `VERIFIED`, reject → `REJECTED`.
- **Deferred** (add later only if proven needed): `WITHDRAWN`, merchant self-pause, explicit verified-but-not-live.

**Current code reality (verified):** `onboardingStep` is only ever written as `SUBMITTED` (granular steps unused; progress is *derived* from the checklist); `MerchantStatus` only `REGISTERED→PENDING_APPROVAL` through product (ACTIVE seed-only); `verificationStatus` **never written**; `contractStatus` `NOT_SIGNED→SIGNED` is the only complete transition. Two latent incoherences (submit leaves verificationStatus=NOT_SUBMITTED; seed jumps to ACTIVE) — the actioner-as-single-writer + the transition table fix these.

**Merchant-facing status = a derived projection**, primarily from `OnboardingStep`, with `MerchantStatus` overriding for hard ops states (suspended/deleted).

**State-transition table (the spec backbone — each row: current state · allowed actor · action · resulting MerchantStatus/OnboardingStep/VerificationStatus · side effects · audit/event/email · portal capability delta):**

| State (projection) | MerchantStatus | OnboardingStep | VerificationStatus | Contract | Driver | Visible | Redeemable | Portal edit |
|---|---|---|---|---|---|---|---|---|
| Draft/preparing | REGISTERED | REGISTERED (sub-progress derived) | NOT_SUBMITTED | →SIGNED | system+merchant | No | No | full draft edit |
| Submitted | PENDING_APPROVAL | SUBMITTED | PENDING | SIGNED | merchant | No | No | locked |
| Under review | PENDING_APPROVAL | UNDER_REVIEW | PENDING | SIGNED | admin claims | No | No | locked |
| Changes requested | PENDING_APPROVAL | NEEDS_CHANGES | PENDING | SIGNED | admin | No | No | re-opened |
| Resubmitted | PENDING_APPROVAL | SUBMITTED | PENDING | SIGNED | merchant | No | No | locked |
| Active/live | ACTIVE | LIVE | VERIFIED | SIGNED | admin approve | **Yes** | **Yes** | cosmetic-live + pending-edit |
| Suspended | SUSPENDED | SUSPENDED | VERIFIED | SIGNED | admin | No | No | read/limited |
| Rejected (terminal) | REGISTERED/INACTIVE | REJECTED | REJECTED | SIGNED | admin (reopenable) | No | No | read-only |
| Deleted/archived | DELETED | — | — | — | admin/merchant | No | No | none |

Reasons/comments on `AdminApproval.comment`; history in `AuditLog`.

---

## 2. Entry & identity

**Decision (Q3): MVP primary = self-register; `MerchantLead` is a separate CRM object (NOT a shell `Merchant`); token-based claim (never temp-passwords); admin-create-lead + claim is IN scope for MVP (scoped Option 2).**

**Five acquisition channels:**
1. Organic self-service → self-register (`source=ORGANIC`)
2. Rep-assisted in person → self-register, merchant sets own credentials (`source=REP`)
3. Email campaign → self-register + campaign/UTM (`source=EMAIL_CAMPAIGN`)
4. Social media / paid ads → self-register + campaign/UTM (`source=SOCIAL`)
5. Phone-assisted → `MerchantLead` + tokenised claim (`source=PHONE`)

**Mechanics:**
- **Self-register** creates `Merchant` (`REGISTERED`) + first `MerchantAdmin`/OWNER membership in **one transaction**; merchant sets own password, verifies email/phone, accepts terms themselves.
- **`MerchantLead`** (separate model): businessName, contact, `source`, repId, status (`NEW → CONTACTED → AGREED → INVITED → CONVERTED/DEAD`), notes, campaign/UTM, `claimToken`, `claimTokenExpiry`, `convertedMerchantId`. Real `Merchant` created only at register/claim.
- **Phone-assisted/admin-create:** admin creates a `MerchantLead` → **tokenised claim link emailed** → merchant clicks, sets own password, verifies, accepts terms → creates `Merchant`+`MerchantAdmin`, links `convertedMerchantId`. **No `OnboardingStep.INVITED`.** Hard-scoped: lead model + one "create lead → invite" admin action + the claim page. Full CRM = fast-follow.
- **Admin operations capability:** admin can create leads, update business details, correct info, manage status (all audited) — but **never** owns the account, knows the password, or accepts terms.
- **Hard constraints:** staff never create/know/read the owner's password (reset-link only, sent to the merchant's verified contact, admin never sees the token); staff never accept terms/sign on the merchant's behalf.

**Attribution:** new `MerchantSource` enum (`ORGANIC / REP / EMAIL_CAMPAIGN / SOCIAL / PHONE`) + optional campaign/UTM detail on `Merchant` (and reused on `MerchantLead`). (Currently no attribution field exists.)

---

## 3. Merchant RBAC

**Decision (Q4): scoped Option B — build the `MerchantMembership` foundation in MVP** (because chains/franchises/multi-branch may be launch targets; building portal/actioner against single-admin then migrating is the slower, riskier path).

- **Identity separate from membership:** a person (login/credentials) vs their membership (merchant + role + branch-scope), so one person can later belong to multiple merchants (franchise networks) **without a second migration**.
- **`MerchantMembership`** = `(merchantId, userId, role, scope { allBranches | branchIds[] }, status, invitedBy?, ...)`. Register/claim creates the first **OWNER** membership. Replaces the `MerchantAdmin.merchantId @unique` single-admin constraint.
- **MVP roles:** **OWNER** (full merchant control), **BRANCH_MANAGER** (assigned branch(es); **vouchers are NOT branch-scoped — merchant-wide, OWNER/Redeemo-Admin only**; **identity/integrity** branch edits queue for approval, while **operational/marketing** edits publish instantly with audit + revert — §12), **STAFF** = existing `BranchUser` (validate-only; redemption-integrated, kept as-is; fold into membership later).
- **Design now, build as needed:** MANAGER, FINANCE/REPORTING, READ_ONLY, MARKETING/VOUCHER_MANAGER + the full capability matrix + branch-scope enforcement.
- **OWNER-only forever:** accept/sign legal terms + contract; ownership transfer; billing/payment ownership; destructive (delete/suspend); manage high-permission users; change registered legal identity.
- **Vouchers are merchant-wide** → created/edited/submitted by OWNER (and Redeemo Admin where appropriate); never by BRANCH_MANAGER/STAFF.
- **Day-2 edit tiering (v1.1):** the approval gate is about **identity/integrity risk, not mere visibility** — operational/marketing edits publish instantly (audited + revertible); only identity/integrity edits queue for approval. Full split in §12.

---

## 4. Onboarding workspace (3 gates, low-friction)

**Decision (Q5, research-backed): progressive "account-first" onboarding — three gates, never one wall.** Supply-side onboarding must be low-friction; the mandatory-voucher step must never cause drop-off.

- **Gate 1 — Create account (~60s):** email + password + business name + phone + **OTP verify** + **category** (drives templates + personalisation + discovery).
- **Gate 2 — Portal + resumable guided checklist (5–7 items):** profile · main branch · documents (optional at submit) · 2 mandatory vouchers (the offer engine, §7) · contract. Pre-seeded ~20% (endowed progress), save-and-continue, resume nudges, "why" beside each step, **"you're not live until we approve — nothing is public yet"** reassurance, specific CTAs ("List your business free"), no urgency theatre. **Capability-gated:** unverified can prepare/edit drafts/upload/submit-vouchers/see-status/respond-to-changes; cannot publish/redeem/appear/full-analytics until approved (already enforced by the `MerchantStatus===ACTIVE` discovery + redemption gates).
- **Gate 3 — Submit → admin review → live.**
- **Concierge lane** for chains/high-value (admin co-builds, capability exists at MVP via the actioner; dedicated console = fast-follow).
- **Subcategory** captured at the profile step.

---

## 5. Verification (low-friction, free-API-led, human-final)

**Decision (Q5a): minimal submit gate; documents at the verify tier (not a hard submit wall); auto-checks pre-score a human-reviewed queue; auto-approve nothing.** This satisfies business rule #7's *intent* with far less friction.

**Submit-gate tiers:**
| Tier | Required |
|---|---|
| Create account | email + password + business name + phone + **OTP** + category |
| **Submit for review** | profile + main branch (address/location) + **2 mandatory vouchers** + **contract signed (OWNER-only)** + light evidence (website/social/photos) + **optional proactive document upload** |
| **Verify (pre-approval)** | free-API checks + email-domain + duplicate screen → pre-scored; **formal docs/ID only if risk-flagged** |
| Go live | admin approve (atomic actioner) |

**Verification signals (layered; pre-score green/amber/red on the `AdminApproval` card):**
- **Google Places — the universal lead verifier** (covers companies AND sole traders): existence + **phone/address/website cross-check** + business status + review-count legitimacy + **autofill** (pick-your-listing → pre-fill name/address/phone/website + capture `placeId`) + **pin confirmation** (upgrades `POSTCODE_CENTROID → ADDRESS_GEOCODED/MANUALLY_CONFIRMED`) + the **OTP-to-public-contact** authority check. Wrapper exists (`src/api/lib/googlePlaces.ts`, cost-capped); extend Text-Search → Place Details for phone/website/status/rating; add a `merchant_onboarding` usage source; re-check TOS for stored/displayed fields.
- **FHRS** (food, free, no key, searchable by name+address) — strongest free "premises trades here" signal (Just Eat 3+, Deliveroo 2+).
- **Companies House** (Ltd/LLP only — **optional, never a gate**; sole traders aren't listed): status (active/dissolved) · registered name (soft) · registered office (soft) · **officers/PSC vs registrant (authority signal)** · SIC vs category.
- **Email-domain match + in-house duplicate-detection** (company#/address/phone/email/IP across applications — highest-leverage, zero-cost anti-fraud).
- **Human admin final approval** — pre-scored card, heavy asks (ID/proof-of-address/call-back) only on amber/red.
- **Pre-score = structured FINDINGS, not just a colour (v1.1).** Each signal records the **check**, the **result** (pass/flag/fail), and a **human-readable finding** — e.g. "phone matches the Google listing"; "entered address differs from Google: entered '12 High St', Google '12 High Street' (minor)"; "Companies House 12345678 ACTIVE; registered 'X Ltd', trading name differs (normal)"; "FHRS rating 5"; "⚠ duplicate: same company number as application #47"; "email domain is generic (gmail) — neutral". The green/amber/red is a **derived summary**; the actioner card shows the **full findings list + inlined source records** (the Google Places result, Companies House record, FHRS record) so the admin can verify or take a specific action — not just trust a light.

**Limits (honest):** Google Places/CH prove the business is real + partial authority; full authority confidence = layered (officer/listing match + business-domain email + OTP to the public contact + the signed contract). Phone *match* = legitimacy; **OTP to the listed contact** = authority.

---

## 6. Contract (clickwrap, MVP-sufficient)

**Decision (Q5, research-backed, NOT legal advice): clickwrap is legally sufficient for a 12-month B2B commercial agreement — no Zoho Sign/DocuSign at MVP.** (*Parker-Grennan v Camelot* [2024] EWCA Civ 185; ECA 2000 s.7; retained UK eIDAS Art. 25; Law Commission 2019.)

- **Capture for evidential weight:** un-pre-ticked checkbox + commitment-labelled button · **immutable copy of the exact version accepted** · signatory identity + **authority-to-bind warranty** · timestamp · IP · **`userAgent` (currently NOT persisted — add it)** · immutable audit log · email the merchant a copy.
- **Onerous-term signposting** (the 12-month lock-in, auto-renewal, termination penalty) — extra notice per Interfoto "red-hand", or they may not bind.
- **Structurally safe:** `acceptContract` is merchant-session-context-bound → an admin cannot invoke it. Never add an admin path.
- **SOLICITOR-REVIEW (not product):** draft the Merchant Agreement; onerous-term signposting; authority-to-bind wording; lock-in remedy (penalty doctrine); CRA/unfair-terms; UK GDPR/PECR for IP capture + retention; sign-off the acceptance UX.

---

## 7. Mandatory-voucher / offer engine

**Decision (Q5c): anchor on 2-for-1, sector-flexible via the existing `RmvTemplate` engine; fairness by per-category customer-value FLOOR (not uniform type); 5-rung anti-drop-off ladder; "mandatory to go live, never a blocker to progress."**

- **Engine = seeded `RmvTemplate`s** (model exists: `categoryId`, `voucherType`, `title`, `description`, `allowedFields`, **`minimumSaving` = the value floor**). Per **category** by default; **subcategory override only where economics differ** (mirrors `ladderProfileOverride`). `VoucherType` already complete (BOGO/FREEBIE/PACKAGE_DEAL/SPEND_AND_SAVE/DISCOUNT_FIXED/PERCENT/TIME_LIMITED/REUSABLE).
- **⚠ WORK ITEM (v1.1) — sector templates are incomplete (inspected).** Real coverage: **2 tailored** (Food & Drink, Beauty & Wellness) + **4 generic placeholders that contradict the brand and must be REPLACED** (`20% Off`/`Spend-Save` on Health & Fitness, Shopping, Out & About, Home & Local Services — % is the de-emphasised flagship) + **5 empty** (Travel & Hotels, Health & Medical, Family & Kids, Auto & Garage, Pet Services). **First-pass templates for all 9 are drafted** in `docs/superpowers/specs/2026-06-10-rmv-templates-9-categories.md` (full fields per template). This is **content work, NOT code**, and it **BLOCKS the offer engine** for the 9 until seeded. Sector nuances: **Travel & Hotels** = 2-for-1 room-night (higher floor ~£60+); **Health & Medical / Vets** = sensitive/clinical — free consultation/check, NOT BOGO/% on treatments (compliance check needed); **Out & About / Family & Kids** = 2-for-1 entry; **Auto & Garage** = free health-check / bundle / £-off (NO BOGO); **Home & Local Services** = £-off first booking / spend-save (free-quote only where normally charged); **Shopping** = spend-save / gift-with-purchase; **Pet Services** = free add-on / package.
- **Anchor:** 2-for-1 as one merchant-scoped primitive ("buy one *[qualifying item]*, get one free" — the Entertainer mechanism). **Once-per-cycle cap + merchant-set margin + no commission makes it safer than Tastecard/Groupon** (regulars stay full-price; the deal is a hook, not a leak).
- **Sector fallback ladder** where 2-for-1 doesn't fit (garage can't BOGO): free add-on/health-check, package/bundle, fixed-£ off, spend-&-save, intro class/trial. **Fairness = `minimumSaving` floor**, calibrated per sector — a garage's free health-check (~£30) is *equivalently fair* to a restaurant 2-for-1 (~£12).
- **Offer-type hierarchy (recommendation, NOT a restriction):** Freebie/BOGO/Package > Spend&Save > Fixed-£ > **% (lowest, included but de-emphasised)**. **No type removed** — all available; % is floor-policed (a weak % that doesn't clear `minimumSaving` is flagged/blocked).
- **Anti-drop-off 5-rung ladder** ("Choose your flagship offer," not "create a voucher"): (1) pick a pre-built sector template (£-value + "what you absorb per visit" shown) → (2) recommended default (one tap) → (3) "help me build this" guided builder → (4) submit non-standard for admin approval (and keep moving) → (5) park + concierge co-build. **The mandatory voucher is mandatory to GO LIVE but never a hard BLOCKER to PROGRESS.** Park-rate = friction signal.
- **Taxonomy governance:** curated/closed; merchants **pick-closest + suggest new** (admin-approved, `MerchantSuggestedTag` pattern); unmatched niches **inherit parent-category flagships**. Never free merchant-added categories (would break discovery + the engine).
- **Guidance, not restriction:** per-sector research-backed "why" tips (live with the template) + visible shortlist + "propose your own" escape.
- **Copy:** "your offer · your margin · your control"; never "discount"/"deal-seeker"; sell footfall/reviews/analytics. 2 permanent RMVs = the core flagship; custom RCVs = the bonus tier.
- **Terms of use = curated clause selection, NOT free-text — with real-time guardrails at voucher creation (§20).** Merchants pick from the admin-managed clause library (scoped by category + voucher type); the rules engine **blocks conflicting / banned / over-restrictive combinations at save**; templates pre-select sensible defaults. Platform-given rules (one-per-cycle) and unenforceable ones (new-customers) are excluded.
- **Type-specific assisted voucher builder, NOT one generic form (§21).** Each `VoucherType` has a different commercial shape → a guided, type-aware builder with a live customer-app preview, plain-language value/margin logic, and fields+terms validated together. Voucher creation is the single biggest merchant-creation drop-off risk.
- **Reconciliation note (2026-06-16):** B5.1-core (admin RMV co-build, shipped PR #259 / `e50ca5c`) is the INERT PRECURSOR to this engine. Its admin RMV submit-on-behalf aligns with §10 concierge co-build; its admin RMV edit (writes customer-invisible `merchantFields`, the deferred §A3 swap) is superseded by the §21 builder + the §10 merchant-confirmation gate. B5.1-web was RETIRED as a standalone admin-panel slice and folded into this Phase 2/3 work: do NOT expose admin co-build via UI before the §10 confirmation gate exists. Inspection record: `docs/superpowers/specs/2026-06-16-rmv-public-offer-model-correction-brainstorm-seed.md` (reconciled).

---

## 8. Admin actioner (the chokepoint)

**Decision (Q6a): one unified `AdminApproval` inbox; claim-to-review; atomic + idempotent actions.**

- **Unified inbox** over all 5 `ApprovalType`s (MERCHANT_ONBOARDING, VOUCHER, MERCHANT_PROFILE_EDIT, MERCHANT_IDENTITY_EDIT, BRANCH_IDENTITY_EDIT), filterable by type/status/risk/claim/admin, **one operational queue**. Type-specific cards: onboarding (submission + checklist + **pre-score signals**); voucher (offer + `minimumSaving` floor + sector context); merchant/branch edits (**before/after diff** + customer-visible flag).
- **Pre-score** (Google Places/FHRS/CH/dup) runs at submit (async), stored as a **structured findings snapshot** (per-signal check/result/detail, §5) on/beside the `AdminApproval`; the card shows the **findings list**, not just a RAG colour, so the admin can verify or act; **auto-approve nothing**.
- **Claim-to-review:** add `claimedById` + `claimedAt` to `AdminApproval`; claim moves onboarding to `UNDER_REVIEW`; Release supported; prevents double-handling.
- **Atomic + idempotent actions** (reuse `prisma.$transaction`, established in redemption): each of Approve / Request-Changes (reason) / Reject (reason) runs in ONE transaction that checks still-actionable → flips `AdminApproval` (status/actionedAt/actor) → applies the entity transition (4-axis merchant flip / voucher status / **pending-edit apply**) → **transactional `AuditLog`** → reason. Safe conflict/no-op on double-action (reuse the `StripeWebhookEvent` idempotency precedent).
- **Holistic onboarding approval (Q6a-1):** the `MERCHANT_ONBOARDING` card reviews the **whole** submission **including the 2 mandatory vouchers inline**; one approve flips merchant `ACTIVE` + activates the mandatory vouchers together. `VOUCHER` approval type is for **post-launch** voucher submissions/edits (**fix the submit-doesn't-enqueue bug** there).
- **Additions:** pre-score storage; **queue SLA/aging** (stale onboarding = supply drop-off); **resubmission continuity** (NEEDS_CHANGES → resubmit reopens the same thread with history, routed back to the requesting admin); **notifications enqueued on every transition** ("you're live"/"changes needed: <reason>"/"rejected: <reason>" via the job runner); **reject is reopenable** (admin-only, audited); **no bulk-approve** (deliberate decisions).
- **Pending-edit applier:** `MerchantPendingEdit`/`BranchPendingEdit` have merchant-scoped readers but **no admin applier** — the actioner is that applier. **Field tiering (v1.1 — corrects the earlier "tighten everything visible" lean):** the gate is **identity/integrity risk, not mere visibility**. Keep roughly the current `DIRECT` (instant) vs `SENSITIVE` (approval) split (§12), **move photos to instant**, and **add an admin REVERT** for instant-published edits (the before/after audit makes revert one click).

---

## 9. Admin RBAC + bootstrap

**Decision (Q6b): three capability CLASSES + the ADMIN (Platform Manager) role + capability-based enforcement + module-grants.**

- **Three classes:** **operational** (broadly delegable) · **financial** (money — separation of duties) · **platform-critical** ("don't break it": admin/role management, feature flags + kill-switches, hard-delete/purge, secrets/integrations, legal/pricing config) — **SUPER_ADMIN-only, never delegated by default**.
- **Role ladder:** OWNER/SUPER_ADMIN (all + platform-critical) → **ADMIN / Platform Manager** (all operational + financial, can manage department staff, **NO platform-critical**, can't mint admins) → OPERATIONS (approvals + merchant lifecycle) · SALES/MERCHANT_SUCCESS (recruiters: leads + onboarding assist + relationships, **no payments**) · FINANCE (billing/payments/refunds) · MARKETING (campaigns/featured ops, no payment) · SUPPORT (assist/request-changes, no approve/money) · CONTENT (CMS/categories/templates).
- **Capability-based enforcement:** keep `AdminRole` enum (expand: add `ADMIN` + `SALES`/`MERCHANT_SUCCESS` + `MARKETING`), but gate every route with **`requireAdminCapability('cap')`** + a code-level role→capability map (NOT role-hardcoded). Currently `AdminRole` is defined but **never enforced** (SEC-M3) — enforce the moment any admin-ops route ships.
- **Module-based per-user grants:** effective access = role's modules ∪ granted − revoked. Platform-critical module **SUPER_ADMIN-only to grant**; can't-grant-what-you-don't-hold; all grants **audited + reviewable** ("who has Finance?"). Grants for *exceptions*, roles for *patterns*. Build the **grant-ready data model** (`AdminCapabilityGrant`) + enforcement at MVP; grant-management UI = thin fast-follow.
- **Separation of duties for money:** SALES *initiates* a campaign sale; FINANCE *processes* payments/refunds.
- **MVP build:** SUPER_ADMIN + ADMIN + OPERATIONS (+ SALES if reps at launch); design the rest; FINANCE payments with Phase-5 billing.
- **Bootstrap:** env-gated one-time first `SUPER_ADMIN` (refuses if any admin exists) + in-app **tokenised admin invites** thereafter (admin sets own password — never admin-set); every admin create/role-change audited.

---

## 10. Admin-edit-on-behalf

**Decision (Q6c): "act FOR, never AS."**

- **Can (audited as the admin):** correct merchant/branch business data (**direct publish + audit**, before/after + reason) · co-build vouchers (concierge) · status/lifecycle (actioner) · trigger a password-reset link (sent only to the merchant's verified contact; admin never sees the token).
- **Forbidden day one:** set/know/**read-out** the password · accept terms/sign/click legal acceptance on behalf · **write-impersonation** (never logged in as the merchant) · self-grant capabilities.
- **ADMIN/SUPER_ADMIN only (high-risk):** legal/registered identity changes · ownership transfer · replace/remove OWNER · hard-delete — reason-required + confirmation-gated + audited.
- **Edit asymmetry (v1.1):** merchant/branch-manager **identity/integrity** edit → **pending-edit → approval**; **operational/marketing** edit → **instant publish + audit + revertible** (§12); admin edits → **direct publish + audit** (admin = authority, no self-approval loop).
- **Admin co-built / materially-changed vouchers** (value/terms/eligibility/redemption-rules/dates/branches/limits/economics — NOT minor typos) require **lightweight merchant confirmation** before go-live ("Approve — this is my offer / Request a change"). Unconfirmed → stays blocked (don't publish an offer they never agreed to; don't force-live an unengaged merchant).
- **Read-only view-as-merchant = fast-follow** (read-only + audited + reason when built).

---

## 11. Platform-wide audit (standing requirement)

**Decision: audit is platform-wide, not admin-only.** Every **meaningful state-changing or security/commercially-sensitive** action records **who · what affected · what changed · when · from where**. **Not** ordinary browsing/navigation.

- **Polymorphic ACTOR** (`actorId` + `actorType` ∈ `ADMIN · MERCHANT_ADMIN · BRANCH_MANAGER · BRANCH_STAFF · CUSTOMER · SYSTEM`) **separate from the affected ENTITY** (`entityId`/`entityType`). *(Current `AuditLog` has entity + ip/ua/device/session/metadata but NO explicit actor — this is the key gap. `writeAuditLog` is fire-and-forget.)*
- **Add:** `actorId`/`actorType` · **before/after** (where relevant) · **reason/comment** (where relevant). Keep when (timestamp) + where (ip/ua/device/session).
- **Transactional** for state-changing/sensitive actions (actioner, status changes, payments, role grants); fire-and-forget acceptable only for low-stakes telemetry.
- **What-to-audit reference (anchors):** admin (approve/reject/suspend/grants/refunds/exports/settings) · owner (contract-accept/profile-edit/voucher-submit/user-changes/PIN) · branch-manager (visible edits/hours/photos/PIN/staff) · staff (validation attempts + suspicious repeats) · customer (security/OTP/subscription/redemption) · system (status sweeps/cache). NOT clicks.

---

## 12. Go-live + day-2 portal

**Decision (Q7):**

- **Atomic go-live transaction** (on approve): `MerchantStatus → ACTIVE` · `VerificationStatus → VERIFIED` · `OnboardingStep → LIVE` · mandatory vouchers `ACTIVE`/`APPROVED` · **transactional audit** · **no server cache invalidation at MVP** (discovery is uncached — queries DB live → merchant eligible on next query/client refetch).
- **Future requirement (recorded):** when Redis/server discovery caching is added, the actioner must invalidate affected merchant/locality/category/tag caches on go-live / suspension / voucher activation-deactivation / branch-location change.
- **Go-live gates:** `isTestData=false` · review approved · **contract accepted by the merchant themselves** · ≥ required mandatory vouchers approved+active · ≥1 valid/main branch · **locality-bound** · **`locationConfidence ∈ {MANUALLY_CONFIRMED, ADDRESS_GEOCODED}` — POSTCODE_CENTROID insufficient** (fallback: **admin pin-drop `confirmPin` surfaced in the actioner**; no merchant permanently blocked, but a human confirms the pin) · **per-branch visibility follows the §19.1 predicate (merchant-level approval + branch-level discovery eligibility)** · admin-co-built material vouchers confirmed by merchant.
- **Day-2 portal:** OWNER = whole account · BRANCH_MANAGER = assigned branch ops/details · STAFF = validate + recent assigned-branch activity · new/edited vouchers → VOUCHER approval · admin corrections → direct + transactional audit.
- **Day-2 edit tiering (v1.1) — the gate is identity/integrity risk, NOT mere visibility.** (The Christmas-hours problem: gating *every* customer-visible change is an admin bottleneck + merchant friction — 30 merchants updating holiday hours = 30 approvals, none visible until clicked.)
  - **Instant publish + audited + REVERTIBLE (operational/marketing):** opening hours, phone, email, website, description, photos, operational toggles. Published immediately; the platform-wide audit records who/before/after; the **admin can REVERT** with one click.
  - **Photos — special handling within the instant tier (v1.1, owner-flagged):** a per-branch **photo count cap** (configurable, ~10–20); **admin can remove/revert** any photo; a **report-photo** mechanism for staff/customers. **Instant photo publishing is GATED on automated moderation — the two are not independent.** **MVP stance (recommended, safer — given the owner's inappropriate-upload concern):** *either* an **automated image-moderation scan** is wired into the R2 upload pipeline for MVP, so photos publish **instantly when clean / quarantine when flagged**; *or*, if the scan cannot be ready for MVP, **photos default to PENDING admin review (NOT instant)** until it exists. **We do NOT ship instant photos without moderation** — so an inappropriate photo never goes live unreviewed either way. (Description and the other operational fields stay instant + revertible regardless; this gate is photos-only.)
  - **Approve-before-publish (identity/integrity):** business name, trading name, registered identity, **address, postcode, map location (lat/lng)**, logo/banner (brand identity / impersonation risk). Queue as pending-edits.
  - **Owner-confirmed (2026-06-10):** photos + description = instant (photos with the count-cap + moderation + remove/report safeguards above); logo/banner = approval (impersonation risk). Roughly matches the current `DIRECT`/`SENSITIVE` code split, moving photos to instant + adding revert, and reverses the earlier 'all customer-visible → approval' lean.
- **Redemption visibility — MVP:** role-scoped **counts + recent/live feed** from `VoucherRedemption` (who/what/branch/time/method/validating-staff — model fully supports it). OWNER all branches · BRANCH_MANAGER assigned · STAFF assigned/recent. **Fast-follow:** trends, savings totals, exports, statements.
- **Validation — MVP:** existing **`POST /redemption/verify` with `method: 'MANUAL'`** (code entry). **Phase 4:** QR scan + dedicated merchant mobile app.

---

## 13. Schema-change summary (all additive)

- `OnboardingStep += REJECTED, UNDER_REVIEW`. `AdminRole += ADMIN, SALES/MERCHANT_SUCCESS, MARKETING`. New `MerchantSource` enum.
- New models: `MerchantMembership`, `MerchantLead`, `AdminCapabilityGrant`.
- `Merchant += source` (+ optional campaign/UTM detail) `+= leadId?`.
- `MerchantContract += userAgent` (+ store immutable accepted-version copy).
- `AdminApproval += claimedById, claimedAt` (+ a pre-score snapshot field/JSON).
- `AuditLog += actorId, actorType` (+ before/after, reason in structured metadata).
- `RmvTemplate`: seed data per category + the **offer-engine migration** — `+ guidanceTip, imageGuidance, isRecommended, defaultEstimatedSaving, isActive, version`; replace `allowedFields` `['terms','expiryDate'] → ['selectedClauses','expiryDate']` + add the per-type editable field set (§20.8 / §21.5 / §22.3). Branch field re-classification (visible-vs-operational) for pending-edit.
- **Curated terms (§20) + type-builder (§21) — new schema:** `TermsClause` model (the clause library) + `VoucherTermsClause` join (selected clauses + parameter values), **both with `isActive` + `version`**; rules-engine config (conflicts / bans / value-erosion weights / threshold) in code/config. `Voucher.merchantFields Json?` becomes the validated structured per-type data home (server-side per-type validation); the composed clause output renders into `Voucher.terms` (display-only). Every curated engine is admin-managed + versioned + audited (§22).
- `VerificationStatus` wiring (no new values). `Voucher` enqueue fix (post-launch VOUCHER approvals).
- Migrate `MerchantAdmin` single-admin → `MerchantMembership` (expand-contract; OWNER membership backfill).

---

## 14. Phase-0 prerequisites (separate plan)
Resend + `shared/notify.ts` (writes `Notification` + `CommunicationLog`) · R2 upload (multipart + presigned + content-type/size validation **+ a photo count cap + an image-moderation scan hook**, §12) · §SEC.1 atomic password-reset limiter · BullMQ job runner (email retries, notifications, sweeps) · staging env (Neon branch + secrets + seed).

---

## 15. MVP vs fast-follow vs deferred
- **MVP:** the full loop §1–§12 **+ the curated-terms / builder / admin-management foundations (§20–§22)** — self-register + scoped lead/claim · `MerchantMembership` (OWNER/BRANCH_MANAGER/STAFF) · 3-gate onboarding + verification (Google Places/FHRS/CH/dup) + clickwrap + offer engine + 5-rung ladder · **the §20 curated-terms clause system (seeded `TermsClause` library + real-time guardrails at voucher creation) + the §21 type-specific assisted builder (live preview + structured `merchantFields`) + the §22 engines seeded & schema management-ready** · unified actioner + admin RBAC (SUPER_ADMIN/ADMIN/OPERATIONS/+SALES) + module-grant-ready model + platform-wide audit · go-live + day-2 + redemption feed + manual validation.
- **Fast-follow:** full lead CRM · view-as-merchant · AI offer suggestions · **the admin-panel CRUD UI for the curated engines (templates / clauses / rules-config / per-type field config — §22.3)** · richer analytics/statements/exports · grant-management UI · FINANCE/MARKETING/SUPPORT/CONTENT roles.
- **Deferred:** Phase-5 billing/campaigns/featured (own brainstorm) · multi-merchant-per-person · QR/mobile validation (Phase 4) · Plan 3 PC3 migration.

---

## 16. Open decisions / owner + solicitor input
- **Solicitor:** the Merchant Agreement itself + onerous-term signposting + authority-to-bind + lock-in remedy + CRA/GDPR/PECR (see §6).
- **Owner/ops:** is phone/admin-assisted day-one-critical (confirmed: scoped Option 2 in MVP)? · chain/franchise in the first cohort (affects BRANCH_MANAGER build timing)? · launch-readiness threshold (concrete Huddersfield supply metric) · whether SALES ships at MVP.
- **Content/research WORK ITEM (v1.1):** author RmvTemplate seed for the **9 remaining categories** (§7) — blocks the offer engine for them (sector flagships + `minimumSaving` floors + guidance tips).
- **Owner-confirmed (2026-06-10):** day-2 borderline placement — photos + description = instant (photos with count-cap + automated moderation + admin-remove + report); logo/banner = approval. §12.
- **RmvTemplate content (v1.1):** the 9 remaining categories are drafted (first pass) in `docs/superpowers/specs/2026-06-10-rmv-templates-9-categories.md` — owner to review; `minimumSaving` floors are starting points; Health & Medical / Vets need a healthcare-advertising compliance sanity-check.
- **Q8 (separate brainstorm):** merchant billing / campaigns / featured.

---

## 17. Implementation phasing (feeds `writing-plans`)
1. **Phase 0 — foundations** (§14): email/notify + R2 + §SEC.1 + job runner + staging.
2. **Phase 2 — actioner + merchant creation** (the chokepoint): `MerchantMembership` + self-register + the actioner + atomic transitions + `VerificationStatus` wiring + verification pre-score + go-live + platform-wide audit + admin RBAC/bootstrap. *(A lead-sourced merchant onboarded with docs + 2 RMVs is approved and appears in discovery.)*
3. **Phase 3 — merchant portal MVP**: the onboarding workspace UI + day-2 management + redemption feed + the offer-engine UI = the **§21 type-specific assisted builder** (live customer-app preview + structured `merchantFields`) with **§20 curated-clause selection + real-time guardrails** (the 5-rung ladder). *(The §20 `TermsClause` library + §22 rules config are **seeded in Phase 2** so the actioner can re-validate terms at approval; the in-app admin CRUD UI for the engines is fast-follow per §22.3.)*
4. **Fast-follow / Phase 4 / Phase 5** per §15.

---

## 18. Gaps & edge cases (adversarial review, 2026-06-10) — resolve during `writing-plans`

The locked design covers the happy path well. These are the holes and edge cases a hard pass surfaced; each must be resolved (or explicitly deferred with a reason) in the phased plans.

### 18.1 HIGH — real design holes to close before/within Phase 2

*(#1, #5, #8 are RESOLVED in §19 below; the rest remain open for the plans.)*

1. **Multi-branch go-live granularity (chains).** Go-live is specified merchant-level, but a chain may have 20 branches where only some are pin-confirmed/valid. **Decide: per-branch eligibility** — a merchant goes ACTIVE, but each branch appears in discovery only when *it* is locality-bound + pin-confirmed (`MANUALLY_CONFIRMED`/`ADDRESS_GEOCODED`) + active. Unconfirmed branches stay hidden until resolved (don't block the whole merchant). The `Branch.isActive` + `locationConfidence` gates already exist per-branch; the spec must state branch-level visibility, not merchant-level.
2. **Duplicate / already-existing business at registration.** A merchant self-registers for a business that is **already on Redeemo** (already claimed/live, or a second person from the same business). Need a duplicate-business check (name+address / Google `placeId` / company number) → a "this business already exists — request access / contact us" path, distinct from the fraud dup-screen.
3. **Category change after RMV configuration.** Category drives the `RmvTemplate`s; changing it mid-onboarding invalidates the configured mandatory vouchers. Define behaviour: warn + re-provision RMVs from the new category's templates (code has `handleCategoryChange` — extend it); block category change after go-live (or route via identity-edit approval).
4. **Last-OWNER / last-SUPER_ADMIN protection.** Prevent removing the last OWNER of a merchant (orphaned account) and deactivating the last SUPER_ADMIN (platform lockout). Hard guards + clear errors.
5. **Suspension cascade + mid-cycle customers (SEC-M1/M2).** Suspend merchant → all vouchers inactive immediately (rule #8). The strategy spec's SEC-M1/M2 (Redis-cached status → ~1hr stale on the staff-verify path; suspended admin keeps access) are **go-live prerequisites** for this loop — reference + require the immediate-revocation fix. Define what a customer mid-redemption-cycle sees when a merchant is suspended.
6. **Post-live ongoing monitoring.** Re-verification policy: FHRS rating drops below threshold (food), business marked CLOSED on Google, location goes stale, or active-voucher count drops below the R1 floor (≥1 active approved voucher per visible branch). Decide which trigger an alert / flag / auto-suspend vs a passive admin signal.
7. **Partial approval granularity.** Holistic onboarding approval (§8) approves the whole submission at once. If 1 of the 2 mandatory vouchers is sub-standard but everything else is fine → the admin must **request-changes on the submission** (no partial approve). Confirm this is acceptable, or add per-item approve within the onboarding card.
8. **Verification fallback / degraded mode.** Google Places **no-match** (new/unlisted business) or **API down/quota-exceeded** (the wrapper caps) → graceful fallback to manual entry + admin review; the **thinnest case** (sole trader, no company number, not on Google, not food) → minimum evidence + mandatory human review. Pre-score must degrade, not block.
9. **Claim-token edge cases.** Expiry, single-use enforcement, claiming an **already-claimed** lead, the same person separately self-registering then receiving a claim link (collision → merge/reject), claim email to the wrong contact. Define token lifecycle + collision resolution.
10. **Merchant GDPR — DSAR / deletion / retention.** Customer deletion exists; extend to **merchants** (+ leads, verification docs, audit). Reconcile right-to-erasure with the 12-month contract evidence + the immutable audit trail (retention schedule per data class; verification docs encrypted + short-retention).

### 18.2 MEDIUM — handle in implementation

- **Email collision:** registrant email already a `MerchantAdmin`, or the same as a customer account — define cross-account policy.
- **Abandoned registrations:** stale `REGISTERED` accounts that never submit — nudge + cleanup policy.
- **Contract version drift:** merchant accepted v1.0 as a draft, v1.1 publishes before go-live → re-acceptance rule.
- **Resubmission / edit while admin mid-review** (race): lock or re-queue cleanly; orphaned claim when the claiming admin is deactivated → auto-release/reassign.
- **Stale pre-score:** verification ran at submit, admin reviews days later → re-run on demand.
- **Voucher edit/deactivate mid-customer-cycle:** a user already redeemed (or is about to) a voucher the merchant edits/deactivates — cycle-state interaction.
- **Distinct mandatory vouchers:** must the 2 RMVs differ, or can both be the same offer type? + mandatory-voucher interaction with `expiryDate` (RMVs are permanent), `REUSABLE` (cooldown), `TIME_LIMITED` (windows).
- **Capability-grant persistence on role change:** when a user's base role changes, do per-user module grants persist or reset? (Recommend: explicit, reviewed.)
- **Admin acting on their own merchant** (if an admin also owns a merchant): conflict-of-interest guard + audit flag.
- **Audit PII:** before/after on a phone/email change stores PII → retention + access policy on the audit trail.
- **Notification delivery failure / email change mid-onboarding:** bounce handling via `CommunicationLog`; where comms route when the merchant changes their email.
- **Registration API cost/abuse:** Google Places/FHRS/CH calls + OTP at registration scale → rate-limit registration + CAPTCHA/honeypot (the `smsLimiter` + the public-form protections already exist; extend to the verification calls).

### 18.3 LOW / noted
- OTP-to-public-contact authority when the listed number is a shared/reception line (weaker signal — fall back to other layers).
- FHRS "awaiting inspection" for new food businesses (allow, per research).
- The `MerchantAdmin → MerchantMembership` expand-contract migration edge cases (merchant with no admin / duplicate) — handle in the migration step.

---

---

## 19. Resolved HIGH gaps — architecture decisions (2026-06-10)

### 19.1 Multi-branch go-live granularity (resolves §18.1 #1)
**Model: merchant-level approval + per-branch visibility eligibility.**
- `Merchant.status = ACTIVE` is the merchant-level gate (approved, verified, contract-signed, ≥2 mandatory vouchers active, ≥1 valid+confirmed main branch). "The business is approved to operate on Redeemo."
- A branch is **discovery-visible + redeemable** iff the **per-branch predicate** holds: `merchant.status === ACTIVE AND branch.isActive AND branch.locationConfidence ∈ {MANUALLY_CONFIRMED, ADDRESS_GEOCODED} AND branch.localityId != null AND branch.isTestData === false AND branch.deletedAt == null`.
  - **Change from current (verified):** discovery today filters branches on `isActive + isTestData` only and **shows `POSTCODE_CENTROID` branches with redacted position** (`discovery/service.ts:338`). We **add the confirmed-pin `locationConfidence` gate** to *visibility* so an unconfirmed branch is **hidden** (not shown without distance) — consistent with the Q7 go-live decision + the distance-trust requirement. Safe: no real (non-test) merchant branches exist yet.
  - **Reconcile the exact-position predicate set:** `hasExactPosition` in `discovery/service.ts` currently keys on `MANUALLY_CONFIRMED` while `ranking.ts` accepts both `MANUALLY_CONFIRMED` + `ADDRESS_GEOCODED` — unify the "confirmed" set across visibility + ranking + the go-live gate.
- **One branch live while another blocked:** YES. A chain goes `ACTIVE` once its main branch is confirmed; each additional branch appears **independently** as its pin is confirmed (merchant self-confirm via Google Places, or admin pin-drop `confirmPin`). 5 confirmed branches show; 15 pending stay hidden under one ACTIVE merchant. No branch blocks the merchant or the others.
- **New branches added day-2** are created **hidden** (pending) and go through a per-branch BRANCH approval + pin-confirmation before becoming visible (identity/integrity tier — a new location is high-risk).
- **Fields:** existing `Branch.{isActive, locationConfidence, localityId, isTestData, deletedAt}` suffice for the predicate. Surface a per-branch **readiness state** in the portal (derived: *live / pending-pin / under-review*) so the OWNER sees which branches are live; add an explicit branch lifecycle field only if the derived view proves insufficient.
- **Effects:** Discovery = already branch-first (one tile/branch), gated per-branch. **Vouchers stay merchant-wide** → available at every *visible* branch automatically (no per-branch voucher config). **Redemption** = branch-attributed; only visible+active branches are selectable, and the redeem/verify guards require branch active + merchant ACTIVE (live). **Portal** = per-branch status list.

### 19.2 Suspension cascade + SEC-M1/M2 (resolves §18.1 #5)
**Model: atomic suspend + immediate live-status enforcement + session revocation.**
- **On suspend (admin, one transaction):** `Merchant.status → SUSPENDED` + transactional audit (actor=admin, reason) + **revoke the merchant's cached Redis auth sessions** (`authMerchant` + every `authBranch` for its branch users) so no cached snapshot survives.
- **Immediate effects:**
  - **Discovery:** merchant + all branches vanish instantly (discovery filters `status===ACTIVE` against the live DB — uncached → immediate).
  - **New redemptions:** blocked (the redeem guard already checks merchant ACTIVE).
  - **Validation (staff-verify):** **SEC-M1 FIX — re-check merchant + branch status from the DB (live) on the verify path, not the cached session.** Today `redemption/routes.ts:140,153` reads `session.isActive` / `merchantSession.isSuspended` from the Redis login snapshot (≤1hr stale). The suspended/active gate must be **live-DB**; the cached session may stay for identity but not for that decision. (Session revocation above = defense-in-depth.)
  - **Merchant portal:** **SEC-M2 FIX — `resolveAdminMerchant` + token refresh must re-check `merchant.status` live.** A suspended OWNER drops to a **read-only SUSPENDED state** ("Your account is suspended. [reason]. Contact Redeemo."), not full access until token expiry.
- **Customers mid-cycle:** an in-flight redemption (code created, not yet validated) → validation now fails (merchant suspended); the customer sees "temporarily unavailable." **Refinement (recommend): do NOT consume the cycle-state for an un-validated in-flight redemption** (cycle refund) so the customer isn't penalised if the merchant returns. An already-validated redemption stays historical.
- **Must be live-DB / immediate:** merchant status on (1) the redemption-**verify** path (SEC-M1), (2) **merchant-admin resolve + refresh** (SEC-M2), (3) discovery (already live). **SEC-M1 + SEC-M2 are HARD go-live prerequisites** — a suspended merchant must be unable to operate within seconds, not ~1hr.

### 19.3 Verification degraded mode (resolves §18.1 #8)
**Principle: auto-checks INFORM a findings pre-score; the human admin is always the final arbiter; missing/unavailable signals are "neutral/unavailable," never "fail"; thin/mismatched cases escalate to manual evidence — never a permanent auto-block.**
- **New / unlisted business (not on Google):** autofill unavailable → manual entry; verify via whatever exists (FHRS if food, CH if Ltd, website/social, email-domain, OTP-to-public-contact) + **admin requests light evidence** (proof of address / business-rates bill / a photo of the premises with signage) and reviews. Absence of Google ≠ block.
- **Sole trader, no company number:** CH N/A — **neutral, never a flag**. Lean on Google/FHRS/website/email/OTP.
- **Google/FHRS/CH API down or quota-hit:** the signal shows **"unavailable — retry,"** not "fail"; the submission is **not blocked**; the actioner can **re-run the check** when the API is back (a `merchant_onboarding` budget + a retry action).
- **Name/address mismatch:** **soft (amber) finding**, surfaced verbatim ("entered 'X' vs Google/CH 'Y'"); the human judges (trading names legitimately differ); ask for docs only if genuinely suspicious.
- **No public phone/email match:** weaker **authority** signal (amber) → escalate to officer/PSC match, OTP, docs, or a call-back to the publicly-listed number. Not a block.
- **Food vs non-food:** food gets the strong free **FHRS** premises signal; non-food has one fewer free signal → may need slightly more manual evidence. The layered model degrades gracefully.
- **Anti-impersonation preserved:** nothing goes live without **human approval**; **in-house dup-detection** runs regardless of external APIs; **thin/mismatched cases get MORE scrutiny** (evidence + call-back), not less. The actioner surfaces a **"could not auto-verify — manual review required"** state (→ request-changes for evidence + re-review); the merchant sees "we're reviewing your application," never a silent permanent block.

---

---

## 20. Voucher terms-of-use — curated clause system (owner direction, 2026-06-10; fleshes out deferred §A2/A3)

**Decision: NO merchant free-text terms.** Merchants **SELECT** from a global, admin-managed, versioned **clause library**, scoped by category + voucher type, with a **criteria/rules engine** that prevents conflicting or over-restrictive combinations. **These rules are real-time GUARDRAILS enforced at voucher creation/save** — a merchant cannot save a voucher with conflicting, banned, or over-restrictive terms (an inline explanation tells them why), and the actioner re-validates at approval. **Customer-favourable by default** — Redeemo's once-per-cycle cap already protects merchants (vs Tastecard/Groupon unlimited), so vouchers default OPEN; restrictions are opt-in, capped, and prominently displayed. Research-grounded (ASA/CAP §8, DMCC Act 2024, CRA 2015; competitor friction analysis).

### 20.1 Why
- **Compliance asset:** a curated, plain-language, pre-approved clause set satisfies **CAP §8.17** (state significant conditions clearly + upfront; **§8.23** not "too complex") and reduces **DMCC-2024** misleading-omission + **CRA-2015** unfair-term risk — far better than free-text, which invites both non-compliant fine print and customer-hostile terms.
- **Trust asset:** the biggest source of voucher disputes across Tastecard/Groupon/Entertainer/Wowcher is **restrictions that weren't salient upfront** (buried fine print, hidden blackouts/booking limits, surprise min-spend, service-charge clawback). Redeemo's structural edge is squandered if merchants over-restrict.

### 20.2 Clause model
`{ id, key, displayCopy, categoryScope[], voucherTypeScope[], severity (EXPECTED|CAUTION|RESTRICTIVE), enforcement (SYSTEM_GATE|DISPLAYED_ADVISORY), parameter? (bounded: min-spend band / day-time window / date list), conflictsWith[], requires[], valueErosionWeight, isActive, version }`.

### 20.3 Two enforcement classes
- **SYSTEM_GATE (app hard-enforces at redemption/validation):** valid days, valid times, expiry, blackout dates, and **min-spend ONLY where the transaction/basket amount is captured at validation** — if it isn't captured, min-spend is **displayed-advisory** (the merchant applies it), never silently "enforced."
- **DISPLAYED_ADVISORY (merchant honours at point of sale; app displays prominently, does NOT gate):** dine-in/takeaway, advance-booking, show-before-ordering, group-size. Per CAP, stated clearly on the voucher; fulfilment is the merchant's.

### 20.4 EXCLUDED from the library (never selectable)
- **Platform-given (automatic):** one-redemption-per-cycle, subscription-required → surfaced as **platform context** ("Use once this cycle"), NOT a merchant term (restating them is noise per §8.23 and misframes the benefit).
- **Unenforceable + bait:** **"new customers only" / "existing-members-only"** — the system can't verify customer history, and on intro offers it reads as bait (DMCC risk). A genuinely first-visit offer is framed in the OFFER (the template), not a term.
- **Clawback-feel:** service-charge/gratuity-excluded — de-prioritised.
- **Vague catch-alls:** **"subject to availability" is NOT a selectable clause** — per CAP §8.9 it doesn't relieve the promoter of the duty to avoid disappointing customers. Capacity is expressed via **bounded** clauses instead: `booking-required`, `limited-slots-shown-before-booking`, `booking-confirmation-required`, and `blackout-dates` (only where explicitly listed + capped). No catch-all that lets a merchant refuse redemption unpredictably.

### 20.5 Severity, prominence, parameters
- **CAUTION + RESTRICTIVE clauses render as visible badges on the voucher card at preview** (not a collapsed drawer) — the antidote to "buried fine print" + CAP §8.17.
- **Cap:** ≤1 `RESTRICTIVE` clause per voucher.
- **Bounded parameters, not open ranges:** min-spend = a dropdown of **vetted bands**; day/time = a picker that **rejects blocking the majority of trading hours**; blackout = bounded count.

### 20.6 Criteria/rules engine (validated at save + admin approval)
1. **Scope:** offerable only if `categoryScope` + `voucherTypeScope` match.
2. **Conflict:** mutually-exclusive clauses can't co-exist (`conflictsWith`) — e.g. dine-in-only vs takeaway-only; booking-required vs booking-recommended.
3. **Dependency:** `requires`.
4. **Type bans (value-protection):** **min-spend BANNED on FREEBIE/free-item offers** (the freebie isn't free); **group-size-1 BANNED on BOGO** (impossible); "existing-members-only" BANNED on intro offers.
5. **Value-erosion cap:** sum `valueErosionWeight`; over threshold → **reject** ("too restrictive to be worth it to a paying member"). Don't rely on merchant rationality.
6. **Trading-hours floor:** valid-days + valid-times can't restrict to a tiny window.

### 20.7 Starter clause library (first pass)
| key | displayCopy | scope | severity | enforcement | rule notes |
|---|---|---|---|---|---|
| `dine-in-only` | Dine-in only | food | EXPECTED | DISPLAYED | conflicts: takeaway-eligible |
| `takeaway-eligible` | Valid on takeaway | food | EXPECTED | DISPLAYED | conflicts: dine-in-only |
| `not-with-other-offers` | Not valid with other offers | all | EXPECTED | DISPLAYED | universally expected |
| `show-before-ordering` | Show before ordering | all | EXPECTED | DISPLAYED | |
| `booking-recommended` | Booking recommended | services/experiences/hotels | EXPECTED | DISPLAYED | conflicts: booking-required |
| `booking-required` | Advance booking required | services/experiences/hotels | CAUTION | DISPLAYED | conflicts: booking-recommended |
| `booking-confirmation` | Booking confirmation required | services/experiences/hotels | CAUTION | DISPLAYED | bounded; no unpredictable refusal |
| `limited-slots` | Limited slots — shown before booking | services/experiences/hotels | CAUTION | DISPLAYED | replaces vague "subject to availability" |
| `valid-days` | Valid [days] | all | CAUTION | SYSTEM_GATE | picker rejects majority-blocking |
| `valid-times` | Valid [time window] | all | CAUTION | SYSTEM_GATE | e.g. weekday lunch |
| `blackout-dates` | Excludes [dates] | all | CAUTION | SYSTEM_GATE | bounded count |
| `min-spend` | Valid on orders over £[band] | food/retail/services (NOT freebie) | RESTRICTIVE | SYSTEM_GATE only if basket captured, else DISPLAYED | vetted bands; BANNED on FREEBIE |
| `group-size` | Up to [N] people | experiences/family/food | CAUTION | DISPLAYED | size-1 BANNED on BOGO |
| `expiry` | Valid until [date] | all | EXPECTED | SYSTEM_GATE | the existing `expiryDate` |

### 20.8 Schema implications
- New **`TermsClause`** model (the library) + **`VoucherTermsClause`** join (selected clauses + parameter values); admin-managed + versioned (deferred §A2). Rules-engine config (conflicts/bans/weights/threshold) in code/config (deferred §A3).
- **`terms` is no longer free-text:** today `RmvTemplate.allowedFields = ['terms','expiryDate']`. Now the merchant **selects clauses**; the rendered `Voucher.terms` string becomes the **composed output of the selected clauses** (display only). `allowedFields` → `['selectedClauses','expiryDate']`. Templates pre-select sensible default clauses per category/type.

### 20.9 Customer-favourable default
The cycle cap is the merchant's protection, so the library **defaults open** — a voucher with only EXPECTED clauses (dine-in/takeaway, show-before-ordering, not-with-other-offers) is the norm. RESTRICTIVE/CAUTION clauses are opt-in, capped, badged. Members get vouchers that **actually work on arrival** — Redeemo's edge over the fine-print-laden incumbents, turned into a trust signal.

### 20.10 RMV-specific guardrails (the mandatory flagship)
The customer-favourable rule applies **most strictly to RMVs** (they are the offers Redeemo promotes):
- **Mandatory (RMV) vouchers default OPEN.**
- **`valid-days` / `valid-times` are BLOCKED on RMVs by default** — a merchant who wants day/time-limited redemption uses an **optional `TIME_LIMITED` voucher**, not the flagship.
- **Capacity on RMVs** is expressed via `booking-required` / `booking-recommended` or **bounded, explicitly-listed, capped `blackout-dates`** — never broad off-peak / day-blocking.
- **Exceptions require Redeemo/admin approval** and must still preserve customer value (e.g. **hotels' off-peak room-nights** — approved per sector, routed via a `TIME_LIMITED` window or an admin-approved RMV exception, never a silent default).

---

---

## 21. Type-specific assisted voucher builder (offer-engine UI; attacks creation drop-off)

**Decision (owner, 2026-06-10): voucher creation is NOT one generic form.** Each `VoucherType` has a different commercial shape, so the portal uses a **type-specific assisted builder** — voucher creation is the single biggest merchant-creation drop-off risk. **Low-friction is the overriding goal: minimise free typing — prefer dropdowns / select / tap / pre-filled template defaults / vetted bands; the platform supplies the value/margin info and sensible defaults FOR the merchant; the merchant supplies the least possible (often just confirm + tweak).**

### 21.1 Code reality (inspected)
- `VoucherType` = BOGO, SPEND_AND_SAVE, DISCOUNT_FIXED, DISCOUNT_PERCENT, FREEBIE, PACKAGE_DEAL, TIME_LIMITED, REUSABLE.
- `Voucher` has **`merchantFields Json?`** — the home for structured per-type data (currently under-used).
- `createVoucher` accepts type/title/description/estimatedSaving (+ terms/expiry); per-type structure isn't enforced today.
- **Customer app renders per-type COPY (deterministic, keyed off `type` in `productCopy.ts`) + title/description/estimatedSaving + parsed terms — but NOT structured per-type fields.** The offer specifics (the £30 threshold, the qualifying item) live in free-text title/description today. → To "map cleanly to display," the app must render from structured `merchantFields` (the deferred §A3 swap).

### 21.2 The builder flow
1. **Pick / be recommended a type** (from the offer engine / RmvTemplate; RMVs come pre-typed).
2. **Type-specific fields — low-friction inputs:** show only the fields that type needs (§21.3), as **dropdowns / selects / tappable options / vetted bands**, pre-filled with the template defaults; free-text is the exception, not the norm.
3. **Plain-language value + margin logic** — "the customer saves £Y; you absorb ~£X per redemption" (from the offer-engine guidance + the `minimumSaving` floor).
4. **Live customer-app preview** — render the voucher exactly as it will appear in the customer app (coupon card + detail), updating as fields change.
5. **Validate fields + terms together** — per-type field validation + the §20 clause rules + the value floor, as one unit.
6. **Output maps cleanly to display** — structured fields → `merchantFields` → the customer-app per-type rendering.

### 21.3 Per-type field schemas (→ `merchantFields`)
| Type | Structured fields | estimatedSaving | notes |
|---|---|---|---|
| `SPEND_AND_SAVE` | threshold (£), saveAmount (£) | = saveAmount | "Spend £30, save £8"; min-spend captured at validation (§20) |
| `BOGO` | qualifyingItem, freeItem, cheaperItemApplies (bool) | = value of free item | the cheaper-item rule must be explicit |
| `FREEBIE` | freeItem/service, triggerPurchase? | = value of free item | **min-spend *clause* BANNED** (§20) — a spend-to-unlock amount is the structured `triggerPurchase` field, NOT the `min-spend` clause (so "free gift when you spend £30" is valid) |
| `PACKAGE_DEAL` | includedItems[], packageValue (£), packagePrice (£) | = packageValue − packagePrice | |
| `DISCOUNT_FIXED` | amount (£), eligibleScope | = amount | clean for high-ticket |
| `DISCOUNT_PERCENT` | percentage (%), eligibleScope | derived from typical spend | **de-emphasised + floor-policed** (§7) |
| `TIME_LIMITED` | validDays, validTimes (+ the underlying offer) | = the underlying offer's | **optional / non-RMV** (§20.10) — generally NOT a mandatory flagship |
| `REUSABLE` | cooldownSeconds (+ the underlying offer) | per the underlying offer | platform-default cooldown if null |

### 21.4 Connection to the curated terms system (§20)
- **The selected voucher type controls which terms clauses are offerable** (clause `voucherTypeScope`).
- **Conflicting fields/terms blocked in real time** at save (§20.6 + per-type field rules) — e.g. FREEBIE + min-spend; BOGO + group-size-1.
- **RMVs stay customer-favourable by default**; **time/day limits are NOT the normal path for mandatory vouchers** (→ optional `TIME_LIMITED`, §20.10).

### 21.5 Schema + customer-app implications
- Use **`merchantFields Json?`** for the structured per-type data (validated server-side per type) — connects to deferred §A3.
- **Replace `RmvTemplate.allowedFields = ['terms','expiryDate']`** with a **per-type editable field set** (the builder config) + clause selection (§20).
- **Customer-app:** extend the per-type rendering to read structured `merchantFields` (not parse title/description) so the live builder preview and the real card match — the §A3 customer-app swap.
- **MVP vs fast-follow:** MVP = the type-specific builder for the core types + live preview + structured `merchantFields` + the §20 terms validation. Fast-follow = the richer conversational "help me build" builder + AI suggestions.

---

---

## 22. Admin-panel management of the curated engines (owner direction, 2026-06-10)

**Decision: every curated/config engine in this spec is MANAGED FROM THE REDEEMO ADMIN PANEL — add / edit / remove / version, with audit, and NO code deploy required to evolve it.** Redeemo can tune offers, terms, rules, and mappings per category / voucher type as the marketplace learns.

### 22.1 What is admin-managed
- **RmvTemplate library (§7):** add/edit/remove/version templates per category/subcategory — offer type, copy, `minimumSaving` floor, guidance tip, recommended flag, default clauses.
- **Terms clause library `TermsClause` (§20):** add/edit/remove/version clauses — displayCopy, category + voucher-type scope, severity, enforcement class, `conflictsWith`/`requires`, value-erosion weight, parameter bounds.
- **Terms rules-engine config (§20.6):** conflict pairs, type-bans, the value-erosion threshold + the restrictive-clause cap, the trading-hours floor — all tunable.
- **Per-type voucher field config (§21):** the field model per `VoucherType` + the **type↔clause compatibility** matrix (`voucherTypeScope`). (The `VoucherType` *enum* stays code/schema; the field config + compatibility is admin-config.)
- **Category taxonomy + mappings (§7):** add/edit/approve categories + subcategories (incl. merchant `MerchantSuggestedTag` requests); the category→template and category→clause-scope bindings; intent/ladder profiles.
- **Fair Use / disclaimer lines (§A1):** the admin-managed policy lines (e.g. medical disclaimers).

### 22.2 How
- **CONTENT (+ SUPER_ADMIN) capability** (§9) owns these via `requireAdminCapability('manage_content')`. Changes to `minimumSaving` floors / commercial value may be gated higher where sensitive.
- **Versioned + audited (§11):** every add/edit/remove is **versioned** (live vouchers keep the version they were created against) and written to the platform-wide audit (actor=admin, before/after, reason).
- **Live-merchant safety:** editing/removing a template or clause must **NOT retroactively break or alter LIVE vouchers** — changes apply to NEW vouchers (and to drafts on next edit); existing vouchers keep their captured config until re-edited + re-approved. Remove = **`isActive: false` soft-retire**, never a hard delete that orphans live vouchers.

### 22.3 MVP vs fast-follow
- **MVP:** the engines exist and are **seeded** via `seed-data` (templates, clauses, rules config) — and the **schema is built management-ready** (`RmvTemplate`, `TermsClause`, `VoucherTermsClause`, all with `isActive` + `version`), so no later migration.
- **Fast-follow:** the in-app **admin-panel CRUD UI** (the CONTENT management surface) for editing these without a seed/redeploy.

---

*(This is a design spec; implementation requires approved phased plans via `writing-plans`. Decisions here are brainstorm-locked from the 2026-06-10 grill-me session. §18 lists remaining open gaps; §19 resolves the top three; §20 = curated voucher terms-of-use; §21 = type-specific voucher builder; §22 = admin-panel management of the curated engines.)*
