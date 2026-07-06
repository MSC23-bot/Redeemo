# Admin Panel prompt pack: Wave 2 (relationships, CRM, assisted onboarding, support, trust and safety)

Inherits the shared master context and the approved Wave 1 foundation. Open the same Admin session (it already has the shell, brand, and spine); reference "the shell, tables, status pills and review pattern you built in Wave 1" rather than re-establishing them.

**Wave 2 goal:** the human/relationship side. Most of this is NET-NEW (no admin surface exists yet) or GATED; design the OUTCOMES faithfully, mark gated/future honestly, and never cross a privacy or authority line. This wave is where the "every intake has an outlet" principle pays off.

## Wave 2 intro (paste into the Admin session)

Design Wave 2: relationships, CRM, representative-assisted onboarding, support and cases, trust and safety, and the core of the Members and Revenue domain (the Members and Subscriptions list/detail + a Revenue and Billing snapshot, cross-linked into Customer 360). Reuse the Wave 1 shell and patterns. Much of this is not built yet; where a module is gated or future, design the intended operator experience but show it as a labelled concept with what unlocks it, not a fake live surface. Keep all customer PII gated, reveal-on-demand, and audited; never plot a customer's home; never show individual customer identity in redemption or aggregate views. Member/subscription/revenue data is operational-commercial (fine to show); member behavioural/demographic analysis stays DPIA-gated in Insights (Wave 3).

## Screens (design each with its states)

**How to use this list:** each screen's paragraph below IS the prompt for that screen. Paste it (lightly trimmed if you like) into the Admin session, then ask for its full state set. Work one screen at a time; reference the Wave 1 shell rather than re-establishing it.

### 2.1 Customer 360 (PII-heavy; gated + audited)
A tabbed customer workspace: profile/identity/contact (PII reveal-on-demand, each reveal audited); subscription/plan/cycle/promo (read; grant/cancel/refund are FUTURE); redemption history + lifetime savings (aggregate to the customer, never exposing other customers); reviews (with a link into moderation); favourites/interests; devices/sessions (admin session-revoke is FUTURE); comms/in-app-message timeline (reuse the merchant timeline pattern; never render message payload); interaction / relationship history (a subject-centric timeline of this ONE customer's touchpoints: PII-reveal audits, comms sent, linked support cases, lifecycle changes, reviews left; this is a NET-NEW customer-scoped relationship view, distinct from the platform-wide Global Audit in Wave 1 which is actor/entity-scoped for governance, not a per-customer CRM history); consent (only the coarse marketing flag + terms version exist today; a granular preference centre + consent-history are FUTURE, label them); lifecycle (active/inactive/suspended/deleted). DPIA truth to design in: deletion is anonymise-in-place (some fields, e.g. DOB/gender/postcode/interests, are retained by design and will show on DELETED rows; STOP-AND-FLAG: whether that retention is justified is an open data-minimisation / DSAR review per blueprint D32, not resolved here); precise geo is NEVER mapped. Customer 360 STAYS in the Relationships group (symmetry with Merchant 360) and is the drill-in target FROM the Members and Subscriptions list (screen 2.13, Members and Revenue group): its subscription/cycle/redemption/savings/favourites/consent/DSAR panes are the per-customer enrichment behind the aggregate member/revenue surfaces. States: permission-denied (needs a customer-PII capability), PII masked-until-revealed, DELETED-row disclosure, DPIA notice, loading.

### 2.2 Communications
Per-entity comms/interaction timeline (reuse the review-screen timeline). A platform delivery-monitoring view (queued/sent/failed/bounced; email is currently dark, show that honestly). A broadcast/campaign composer is FUTURE + provider-gated (Resend/FCM not live): design it as a labelled concept. States: delivery-failure list, dark-email notice, gated-broadcast concept.

### 2.3 Tasks and Follow-ups (FUTURE; net-new schema)
Assignable tasks/reminders/next-actions on merchants and customers. Represent as a concept surface built on the proven claim + stale-sweep patterns; label it net-new. (Assignment has one reserved hook already in the backend: an `ADMIN_REVIEW_ASSIGNED` notification type exists but is unemitted, awaiting the assign/reassign flow; the flow and its task schema are still net-new.) States: empty, overdue, reassignment (concept).

### 2.4 Account Health (FUTURE; net-new, Redeemo-owned)
Merchant/customer health and risk signals derived from platform metrics (redemptions, subscription status, review activity, supply). Concept surface; label net-new. States: no-data, concept.

### 2.5 Reviews Moderation (Trust and Safety; intake exists, no outlet today)
A queue of reported reviews (reason: offensive/spam/fake/other); actions: hide, resolve, dismiss (with reason + audit). This closes a real black-hole intake. States: empty (no reports), review-card detail, destructive-confirm (hide/delete), stale.

### 2.6 Fraud and Redemption Reversals (fraud telemetry exists; reversal is schema-gated)
A fraud-signal review surface (screenshot/telemetry events, currently captured but unseen). A redemption-reversal/void flow that is SCHEMA-GATED: design the operator flow but label it clearly as needing a schema change, and surface the coupling warning that reversing a redemption can affect a linked "verified review". States: telemetry list (read), reversal-concept with schema-gated banner + coupling warning, permission-denied.

### 2.7 Suggested-tag Moderation (net-new BOTH ends)
Approve/reject merchant-suggested discovery tags. Note honestly: discovery already consumes approved tags but nothing produces them, so this is net-new on both the intake and the moderation side. States: empty, approve/reject with reason.

### 2.8 Support and Cases (build-vs-integrate)
A support-case queue + case detail (intake, assignment, status, notes, linked entity). Flag the open build-vs-integrate decision (Redeemo may lean on Zoho for helpdesk); design the in-house concept but label the decision. States: empty, case detail, assignment.

### 2.9 DSAR / Data Requests (legal-gated)
A data-subject-request queue: intake to identity-verify to in-progress to export-produced / erasure-confirmed to closed, with an SLA clock and full audit. Erasure MUST be able to include the subject's DELETED/anonymised records (that is the point). Legal-gated: label it. States: SLA clock, identity-verify step, export/erasure confirmation, gated notice.

### 2.10 Read-only View-as (security-gated)
An audited, READ-ONLY lens onto a merchant or customer account (never write-impersonation; never a merchant-signs or password path). Every view-as session is audited and banner-marked. Security-gated: label it. States: audited-read banner, entry confirmation, permission-denied.

### 2.11 Representative-assisted onboarding (the assisted supply channel; mostly design-only)
Two onboarding channels are real (self-serve register/verify; admin create-draft + secure claim). The full representative-assisted channel is DESIGN-ONLY/net-new: a lead pipeline (create/qualify a lead, record acquisition/referral source), an in-person visit record, field-verification evidence capture, same-session voucher co-creation, secure owner handoff, and onboarding provenance (self-serve / rep-assisted / admin-created / partner-imported). Field verification is EVIDENCE, not authorization: a rep visit does not auto-approve; verification and fast-track authority are OWNER-POLICY decisions (rep verifies, Operations approves; a senior rep may verify + approve lower-risk; sensitive/legal/financial always independent). Design the lead-to-live workflow and mark the net-new/policy-gated parts. Provenance honesty: onboarding provenance (self-serve / rep-assisted / admin-created / partner-imported) is NOT a first-class field today (it is only inferable from AuditLog action strings), and the lead record, in-person visit record and field-verification evidence are net-new schema (new models/columns on the merchant and document side). Show them as designed concepts, not existing data. States: lead board (new/contacted/agreed/invited/converted/dead), visit record, evidence capture, fast-track-policy concept, handoff.

### 2.12 Agreement and signature (compare channels; do not approve one legally)
On the onboarding/agreements surface, compare acceptance channels without approving one legally: online checkbox/versioned acceptance; in-person e-sign on a controlled device; secure sign-link or OTP on the merchant's own device; external e-sign; paper + verified upload. Hard rule to design in: the merchant's own authorized signatory personally accepts through their own session or device; Redeemo staff NEVER accept terms, sign, or set the password. Show the evidence captured today (method/version/timestamp/IP) and mark the gaps (signatory name/title, authority-to-bind, device/in-person provenance) as net-new. Two more honesty flags to design in: the 12-month term is a policy expectation but `contractEndDate` is never populated today (no stored end date, so any "expires on" is a computed/absent concept, not stored data); and the external e-sign channel (`ZOHO_SIGN`) exists only as an unwired enum value (no integration), so show it as a labelled future channel, not a working one. Legal validity/identity-assurance/retention are owner/legal-gated. States: channel comparison, evidence panel, "admin facilitates, merchant attests" framing.

### 2.13 Members and Subscriptions + Revenue and Billing snapshot (Members and Revenue; core member/revenue surface)
The customer-commercial revenue engine's Wave 2 core (real data; the admin read-layer is net-new). Two connected surfaces:
- **Members and Subscriptions list + detail:** a dense, searchable/filterable member list by tier (Free = no active subscription; Monthly GBP 6.99; Annual GBP 69.99) and by subscription lifecycle status (Trialling / Active / Past-due / Cancelled / Expired: use the real member/subscription status-pill family). Columns: member (anonymised initials or masked handle; NEVER a plottable address or full PII in the row), tier, status pill, plan + billing interval, cycle-anchor day, promo (if any), joined. A member row drills into Customer 360 (screen 2.1) for the per-customer detail; the detail surfaced here is subscription-scoped (plan, cycle window, cancel-at-period-end, period start/end, promo, Stripe presence as a boolean), with any deeper PII reveal-on-demand + audited via the Customer 360 capability. Honesty: Free tier is the ABSENCE of a subscription row, not a "Free plan" row; grant/cancel/refund actions are FUTURE (provider-gated), so show them as labelled concepts, not live actions.
- **Revenue and Billing snapshot:** a compact revenue tile set: MRR (derived, active subs x plan price x interval), ARR, new vs churned this period, and a Past-due / dunning list (members whose subscription is PAST_DUE). Label MRR/ARR as derived read-side + net-new (there is no revenue table today). Refunds, chargebacks, dunning beyond PAST_DUE, and a payment-source breakdown are FUTURE / not-built: show them as clearly-labelled gated concepts, not live figures. Behavioural/demographic member analysis (locality, age/gender, retention cohorts) is NOT here; it stays DPIA-gated in Insights (Wave 3).
States: loading skeleton; empty ("no members match"); permission-denied (needs customer:read / subscription:read / revenue:view); PII masked-in-row + reveal-on-demand into Customer 360; derived-net-new notice on MRR/ARR; not-built label on refunds/chargebacks/source-breakdown; past-due list.

## Wave 2 clickable flows
- Member to revenue: Members and Subscriptions list to a member detail to Customer 360 (PII reveal + audit); Revenue and Billing snapshot to the Past-due list to a member.
- Support to a customer: case intake to Customer 360 (PII reveal + audit) to a read-only view-as to resolving the case.
- Trust and safety: reported review to hide/resolve; fraud signal to a (schema-gated) reversal concept with the coupling warning.
- Assisted onboarding: create a lead to qualify to record a visit + evidence to co-create the two flagship vouchers to secure handoff (claim email) to (Operations) approval; with the signature-channel comparison at the agreement step.
- DSAR: request intake to identity-verify to export/erasure (including anonymised records) to closed, with the SLA clock.

## Wave 2 acceptance (in addition to the global checklist)
- Approx scope: ~13 screens (Customer 360, Communications, Tasks, Account Health, Reviews Moderation, Fraud/Reversals, Suggested-tag Moderation, Support/Cases, DSAR, View-as, assisted-onboarding lead-to-live, agreement/signature, Members and Subscriptions + Revenue and Billing snapshot), each shown as a labelled concept where gated/future.
- Every trust-and-safety intake has an action outlet (reviews, fraud, suggested tags).
- Customer PII is masked-until-revealed and every reveal is audited; no customer-home map; no individual identity in aggregates.
- Reversal, DSAR, view-as, tasks, account-health, broadcast are shown as clearly-labelled gated/future concepts, not fake live surfaces.
- Assisted onboarding never lets a rep auto-approve; the signature step keeps "merchant signatory personally attests, admin facilitates"; no admin-signs, no password.
- Members and Subscriptions uses the real tier + subscription-status pill family (Free = no active subscription; Trialling / Active / Past-due / Cancelled / Expired); rows cross-link into Customer 360 with PII masked-in-row + reveal-on-demand; grant/cancel/refund are labelled FUTURE, not live; MRR/ARR are labelled derived read-side net-new; refunds/chargebacks/source-breakdown are not-built labels; behavioural/demographic member analysis is NOT here.
