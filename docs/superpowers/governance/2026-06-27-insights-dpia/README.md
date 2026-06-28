# Insights & Reports - Privacy / Legal Governance Pack (PR-0a)

> Status: **PREPARATION - awaiting owner + qualified privacy/legal review.**
> This pack **identifies evidence, contradictions, open questions, required decisions, and
> implementation gates**. It does **not** decide them and manufactures **no** legal conclusions.
> Nothing here authorises processing, releases a gate, or edits legal copy.

To keep the qualified reviewer's job unambiguous, the pack separates five things:
1. **Known technical facts** (verified against source) - section 1.
2. **Existing customer-facing policy wording** (verbatim) - section 2.
3. **Contradictions surfaced** (recorded, not adjudicated) - section 3.
4. **Owner / qualified-review decisions** required (the D1-D6 register) - section 4.
5. **What this pack is NOT** (the conclusions it refuses to make) - section 7.

Source of truth: the merged umbrella spec `docs/superpowers/specs/2026-06-27-merchant-web-insights-reports-design.md`
(esp. §1.7, §1.14, §1.17, §4.3, §4.4, §13, §14) and the implementation plan
`docs/superpowers/plans/2026-06-27-merchant-web-insights-reports.md` (§3, §4, §8). PR-A backend is merged
on `main`; file:line citations below were verified against `main` at the time of writing (re-verify if source moves).

## 0. What this pack gates

| Gate | What it releases | Blocking deliverables |
|---|---|---|
| **Bounded behavioural review** | PR-B real-data behavioural analytics (repeat-customer rate, new-vs-returning) **and** the event-level Redemption-activity CSV / event-level printable rows | D1, D3 (as it touches behavioural + export), D4, D5 |
| **Full demographic gate** | The PR-C demographic slice (age / gender / location) | D2, D3, D4 + approved legal artefacts + suppression testing |
| **Busy-times exact-count policy** | Whether busy-times may show exact sparse counts (vs the default intensity-only fallback) | D6 |

Until the relevant gate clears: the runtime gate stays **default-off / production-fail-closed** (spec §13.5), behavioural + event-level export return "not available", busy-times ships **intensity-only** (no exact counts), and **no demographic code is created or reachable** (spec §13.5, §14; plan §8).

**Stop-and-report:** if any deliverable concludes the behavioural / event-level / demographic processing **cannot** proceed lawfully, the corresponding feature stays gated-off and ships **aggregate-only**; surface the conclusion before any gate is opened (spec §13.1, §13.6; plan §3).

---

## 1. Known technical facts (verified against source)

These are engineering facts the qualified reviewer can rely on; they are **not** legal characterisations.

- **What merchant-facing Insights actually surfaces.** Operational aggregates (always on): redemption-activity counts (logged / confirmed / awaiting), estimated savings, voucher + branch rankings, by-type share, busy-times **intensity bands** (no raw counts), validation totals. Behavioural analytics (gated, default-off): the **repeat-customer rate** (a percentage of distinct customers in the period with a prior eligible redemption) and the **new-vs-returning** split. The behavioural figures are a **cohort rate / split derived from per-customer `userId` history**, not a redemption count. (spec §1.1-§1.5; PR-A `src/api/merchant/insights/service.ts`.)
- **No `merchantId` on `VoucherRedemption`.** Merchant attribution is via `branch.merchantId`; the eligible-dataset rule excludes `isTestData=true` (redemption + branch + merchant), QA-account emails, and `user.status='DELETED'` (PR-A `eligibility.ts`).
- **Deletion is soft-anonymisation.** Account deletion (`src/api/auth/customer/routes.ts:209-214`) sets `email` to `deleted_{userId}@deleted.redeemo.co.uk`, `phone=null`, `firstName='[Deleted]'`, `lastName='[Deleted]'`, `passwordHash=null`, `status='DELETED'`, `deletedAt=now()`. **Preserved (never nulled):** `dateOfBirth`, `gender`, `postcode`, `localityId`, `latitude`, `longitude`; the customer's redemption rows remain. Insights excludes DELETED users **at query time**, so a later deletion **retroactively lowers** a historical period's logged totals (spec §4.3, §4.4).
- **Deferred validation (data semantics).** A redemption's logged month (`redeemedAt`) never moves; a later staff validation can increase a historical month's **confirmed** portion without changing its logged total (spec §1.14, §4.3). Relevant to any retention / immutability assumption.
- **No retention-enforcement job exists.** No scheduled purge, grace-period, or data-lifecycle enforcement was found in `src/` (verified by search). Retention today is "data persists".
- **`gender` is a nullable free-form `String`** (`prisma/schema.prisma`), no enum / controlled vocabulary. Any demographic grouping rule is greenfield (spec §14).
- **The behavioural runtime gate is a hard, server-owned, fail-closed invariant** (spec §13.5; PR-A `gate.ts`): default-off; production returns "not available" when unset; no client flag can open it; test/demo access is separately env+merchant-allowlisted and cannot open the production gate; opening requires the recorded D1 output + explicit owner approval (D5). The event-level CSV export is gated the same way (spec §13.6).

---

## 2. Existing customer-facing policy wording (verbatim, on `main`)

Recorded so the reviewer can compare the promises against what Insights surfaces. **Do not edit this copy here** - any change is PR-0b, after approval.

- **Privacy policy** `apps/customer-web/app/privacy/page.tsx:96`: "Merchants ... see only anonymised redemption counts and offer performance data. They do not receive your name, email, or any personally identifying information." (Related sections the reviewer should read: `:42-46` DOB/gender/postcode purposes; `:56-59` offer-performance purpose; `:71-87` purposes + legal basis; `:102-123` rights/retention.)
- **FAQ** `apps/customer-web/app/faq/page.tsx:143`: "... Merchants see anonymised redemption counts only, not your personal data." This is **narrower** than the privacy page ("counts only", "not your personal data").
- **Merchant agreement** `src/api/merchant/onboarding/service.ts:11-18` (`CONTRACT_TEXT`): covers RMV obligations, performance-based promotion, and suspension rights; it is **silent** on what customer-derived insight a merchant will see.

(The spec records the fuller contradiction inventory verbatim in §13.2, including customer-app consent surfaces.)

---

## 3. Contradictions surfaced (recorded; not adjudicated)

Each is a question for the bounded review / DPIA, mapped to a decision below. None is a legal ruling.

- **C1 - "counts" vs "rate".** The customer wording promises merchants see anonymised redemption **counts**; the gated behavioural analytics surface a repeat-customer **rate** and a new-vs-returning **split** derived from per-customer history (section 1). Whether the existing disclosure covers this, or must change, is **D1(c)** + **D2** (identifiability). The operational aggregates are counts/shares/intensity and may fall within the current wording; the behavioural rate is the gap to assess.
- **C2 - merchant agreement silence.** The agreement does not state that merchants will see customer-behavioural cohort output; the merchant's data-protection role + any required disclosure is **D1(b)** + **D1(c)**.
- **C3 - soft-anonymisation + no retention job.** Deletion preserves demographics and redemption rows, and no retention-enforcement job exists (section 1). Whether DELETED-exclusion-at-query-time is sufficient for lawful/fair behavioural profiling is **D1(d)**; the lawful retention + Article-17 erasure model is **D3**.
- **C4 - the word "anonymised".** Customer copy uses "anonymised"; whether the merchant-facing output is **effectively anonymised, pseudonymised, or aggregated personal data** is the identifiability determination **D2** (spec §1.17) and is **not** pre-decided here.

---

## 4. Decision register (owner + qualified reviewer to author)

Each decision lists **what must be decided** and **the evidence/record required**. The reviewer authors the determination; this pack does not pre-empt it. "The spec does not decide this" is restated where the spec is explicit that the matter is reserved (§1.17, §13.4).

### D1 - Bounded behavioural review (gates PR-B real-data behavioural + the event-level export)
Required determinations (qualified review):
- **(a) Article 6 lawful basis** for repeat-customer + new-customer behavioural analytics over `userId`, **and an LIA** if legitimate interests is chosen. *The spec does not choose the basis (§13.4).*
- **(b) The merchant's data-protection role** (controller / joint controller / processor) for the behavioural-insight purpose. *Reserved to qualified review (§1.17, §13.1).*
- **(c) Disclosure coverage:** whether the existing customer-facing wording (section 2; e.g. privacy `:96`, faq `:143`) and the merchant agreement already cover repeat/new-customer analytics (contradiction C1/C2), or must change. **Record the determination; do not edit copy here** (copy changes are PR-0b, after approval).
- **(d) Lawfulness/fairness of `userId` profiling** given the soft-anonymisation/erasure facts (section 1; spec §4.4): whether DELETED-exclusion-at-query-time is sufficient, or further measures are required (contradiction C3).
- **(e) Event-level export (the Redemption-activity CSV AND the printable HTML performance summary, spec §10.2, to the extent it carries event-level rather than aggregate-only rows):** purpose; lawful basis; minimisation + acceptable granularity; retention; authorization + branch scope; the **row cap** (PR-A ships a provisional `EXPORT_CAP=50000`, mirrored from the redemptions export precedent; D1 must confirm or adjust it for the behavioural-export purpose) + audit/rate controls; identifiability wording. *Removing direct identifiers does not by itself make the export anonymous (spec §13.6).*

Evidence to attach: the written bounded-review determination; the LIA (if applicable); the disclosure-coverage decision; the export-controls decision.

### D2 - Full DPIA + identifiability / effective-anonymisation assessment (gates PR-C)
Required (qualified review):
- A **full DPIA** for the demographic slice (age / gender / location).
- The **identifiability / effective-anonymisation assessment**: whether the merchant-facing output is **effectively anonymised, pseudonymised, or aggregated personal data** (contradiction C4; spec §1.17, §13.2). *The spec does not pre-decide this.*
- **Suppression thresholds** (minimum cohort / cell size), the **anti-inference policy** (section-level + per-cell + complementary suppression; coverage disclosure; no silent renormalisation), and an **adversarial-differencing test plan**.
- **Special-category caution** for gender / age handled by qualified review (the spec does not assert Article 9 status either way). Note the `gender` free-form field (section 1) needs an approved data dictionary or deferral.

Evidence to attach: the DPIA; the identifiability assessment; the documented thresholds + anti-inference policy; the differencing test plan. **PR-C is non-executable until all of this clears (plan §8).**

### D3 - Lawful retention + Article-17 erasure model
Required (qualified review + owner):
- A **lawful retention** position and an **Article-17 erasure** model spanning: source fields; redemption history; exports; caches; logs; backups; any future rollups; and recipient/processor notification. The current state is soft-anonymisation leaving demographics + redemption rows intact, with **no retention-enforcement job** (section 1; spec §4.4, §13.2) - the model must state the target and whether an enforcement job is required (a job, if adopted, is Phase-4, plan §9).
- **Specifically:** decide whether a DELETED user's **preserved demographics** (`dateOfBirth`/`gender`/`postcode`/locality/lat/lng) and **retained redemption history** (section 1) may be kept indefinitely, or need a lawful cutoff / erasure target, and therefore whether a retention-enforcement job is required. This bears on D1(d) (whether DELETED-exclusion-at-query-time alone is a sufficient measure for behavioural profiling).

Evidence to attach: the retention schedule entry (or confirmation of an existing one, see D4); the erasure model; the decision on a retention-enforcement job.

### D4 - External-artefact owner checks (before creating duplicates)
Owner action - **confirm / obtain / link** existing records before any are recreated (spec §13.3). The table is intentionally blank: it is an owner checklist to complete. **"No repository evidence found" does NOT mean "does not exist externally."**

| Artefact | Exists? (link/ref) | If missing, owner action |
|---|---|---|
| DPIA(s) | | |
| ROPA / Article-30 record | | |
| LIA(s) | | |
| Data-flow / data-map docs | | |
| Retention schedule | | |
| Lawful-basis register | | |
| Counsel / legal-advice records | | |
| Processor / sub-processor DPAs (Neon, Resend, Twilio, Stripe, R2/S3, Vercel, Railway) | | |
| ICO registration / fee | | |
| DPO / representative appointment | | |
| Signed binding Merchant Agreement + any merchant DPA | | |
| Prior privacy assessments / project notes | | |
| GRC / compliance-system records | | |
| Cookie-consent records | | |

Owner action: complete this table during PR-0a. For each artefact, record whether it **exists** (link/reference) or must be **created**, with the owner action if missing. D4 is "done" only when every row is resolved (linked or marked not-applicable), and it must be resolved **before the bounded review (D1) concludes**, so the review relies on real records rather than duplicates.

### D5 - Gate-open decision record (the runtime gate reads against this)
Required (owner, after D1):
- An **explicit, owner-approved artefact** that the PR-A behavioural runtime gate reads against to determine "open". The gate is **default-off / production-fail-closed**; opening it requires **the recorded bounded-review output (D1) AND explicit owner approval** - never a bare deploy default (spec §13.5; plan §2.5, A6).

Evidence to attach: the signed gate-open record (date, approver, the bounded-review reference it relies on, the exact environments it authorises). **Absent this record, the gate stays closed.**

### D6 - Busy-times sparse-cell + peak policy
Required (qualified review, gates the busy-times exact-count behaviour - spec §1.7):
- Whether **exact sparse counts** may be shown at all.
- The **minimum cohort / cell threshold**.
- **Intensity-only vs hidden** treatment for sub-threshold cells.
- The **"Busiest" badge threshold** (when to omit naming a near-empty peak).
- **Anti-inference across filters** (date / branch / voucher-type narrowing).

**Until D6 is recorded:** busy-times ships the **safe fallback** - server-side **intensity-only**, no exact sparse counts, no raw peak value reaches the browser; `busiest` is omitted unless an approved minimum is recorded (spec §1.7, §15.2; plan §2.7, A4, A7). PR-A implements this default; exact counts are unreachable until an approved D6 policy is recorded.

---

## 5. How PR-A / PR-B / PR-C consume this pack

**Stop-and-report (the unlawful-conclusion path):** if a D1/D2 deliverable concludes the behavioural / event-level / demographic processing **cannot** proceed lawfully, the corresponding feature stays **gated-off** and ships **aggregate-only** (or not at all); the runtime gate is never opened, and the conclusion is surfaced to the owner before any further work. The operational aggregates (counts/shares/intensity/validation) are unaffected.

- **PR-A (backend, non-demographic):** implements the **operational** aggregates (not gated) and the **gated** behavioural + event-export endpoints **default-off / fail-closed**; busy-times intensity-only by default. PR-A is merged with the gate **closed**; the gate cannot be opened until **D5** (which depends on **D1**) is recorded.
- **PR-B (merchant-web):** renders operational analytics immediately; behavioural sections render real data **only when the gate is open** (D1 + D5). The event-level export is gated the same way (D1(e), §13.6). No demographic UI ships in PR-B.
- **PR-0b (legal copy):** authored **only after** the approved legal artefacts exist (D1(c), D2, D3); it is a qualified-approved **roll-forward** (no silent version decrement).
- **PR-C (demographics):** **non-executable** until **D2 + D3 + D4 + approved artefacts + passing suppression/differencing tests** all clear (plan §8). No demographic code is created until then.

---

## 6. What this pack is NOT

- Not a legal opinion, DPIA, LIA, or compliance attestation.
- Not a decision on the Article 6 basis, the merchant's data-protection role, effective-anonymisation, suppression thresholds, the retention/erasure model, re-consent treatment, or the gate-open authorisation - **all reserved to the owner + qualified reviewer** (spec §1.17, §13.4).
- Not authorisation to open the runtime gate, edit legal copy, or process demographic data.
- Not a claim that Redeemo is or is not compliant; the contradictions in section 3 are **surfaced for review**, not adjudicated.

Owner next step: route this pack to qualified privacy/legal review, complete D1-D6 + the D4 register, and record the D5 gate-open decision (or leave the gate closed). PR-A is merged and runs with the gate **closed**; PR-B ships operational-only until the gate is opened.
