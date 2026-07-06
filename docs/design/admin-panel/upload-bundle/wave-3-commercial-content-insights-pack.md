# Admin Panel prompt pack: Wave 3 (commercial operations, content and taxonomy, Insights and reporting)

Inherits the shared master context and the approved Wave 1 + Wave 2 output. Reuse the established shell, tables, gated-concept pattern, and privacy discipline.

**Wave 3 goal:** the mostly-gated/future frontier: commercial operations (blocked on merchant billing), content/taxonomy controls (specific, not a generic CMS), and platform analytics (reusing the Merchant Insights foundation as a reference, but a separate admin surface with its own privacy gating). Design faithful concepts; do not present gated items as approved or built.

## Wave 3 intro (paste into the Admin session)

Design Wave 3: merchant-paid commercial operations, the deeper Members and Revenue surfaces (Revenue and Billing MRR/ARR + dunning, Promo Codes and Trials, Redemptions and Engagement aggregate, Conversion), content and taxonomy, and Insights and reporting. Most of this is gated on the monetisation model, a privacy/DPIA gate, or a legal sign-off. Design the intended operator experience and label the gate clearly. Do not fabricate live money, live analytics, or legal content. Member/subscription/revenue data is operational-commercial (fine to show, aggregate where the row would otherwise expose an individual); member behavioural/demographic analysis stays DPIA-gated in Insights.

## Screens (design each with its states)

**How to use this list:** each screen's paragraph below IS the prompt for that screen. Paste it (lightly trimmed if you like) into the Admin session, then ask for its full state set. Work one screen at a time; reference the Wave 1 + Wave 2 shell and gated-concept pattern rather than re-establishing them.

### 3.1 Growth and Commercial operations (merchant-paid; gated on merchant billing; models exist, no admin surface)
A coherent MERCHANT-PAID commercial cluster, all provider/billing-gated. (Reorg per blueprint D27: Promo codes and Subscriptions/Billing/Refunds moved OUT of this Growth group into the Members and Revenue domain, screen 3.5 below; this group now holds only the merchant-paid placement items.)
- **Campaigns** (location-targeted banners): list/create/schedule + drill into opted merchants; location targeting (all-UK or selected areas); cost.
- **Featured placement**: add/schedule a paid placement with radius; DESIGN-IN the integrity fix that a placement must not go live without a paid/confirmed payment status (today discovery does not check payment status; the operator surface should make payment status a visible gate).
- **Trending**: view the algorithmic trending set with a manual add/remove curation control.
Label the whole cluster gated on the (not-yet-built) merchant/provider billing flow. States: gated-billing notice, date-bounded scheduling, payment-status gate (featured), concept panels.

### 3.2 Content and Taxonomy (specific controls, NOT a generic CMS)
Split by substrate maturity:
- **Taxonomy management** (buildable over existing seed models): CRUD + activation for categories, subcategories, tags, amenities, highlights, RMV templates, interests. Note: RMV templates lack a version field today; where versioning is needed, mark it net-new.
- **Versioned Legal / T&C / FAQ**: EXTERNAL/GATED. The static customer-web legal pages are the launch source of truth and owner/legal sign-off is the hard launch gate; the key-value CMS store is deliberately unwired. Design a versioned-legal control as a labelled deferred/external concept; never present it as the legal source of truth or as live-editable-for-launch.
- **Announcements / notices**: FUTURE (no model); concept surface.
Explicitly bound OUT a blog/page-builder/marketing CMS and email-template editing (templates are code). States: taxonomy CRUD with confirm, external-legal caveat, unwired-CMS notice, versioning-net-new marker.

### 3.3 Insights and Reporting (NOT built for admin; reuse the merchant foundation as a reference)
Platform analytics for operators. Honest framing to design in:
- Admin analytics is NOT built; there is no admin analytics API/authz/UI today. A reusable aggregation + eligibility foundation exists in Merchant Insights, but generalising it to a cross-merchant admin surface needs a separate architecture + authz + privacy review.
- **Operational aggregates** (supply/redemption counts, per-merchant/branch/voucher rollups, validation rates, busy-times as intensity) can be shown as a designed concept; join redemptions to a merchant via the branch (there is no direct merchant id on a redemption), and exclude test/QA/deleted data from any count.
- **Behavioural + demographic** analytics (repeat-rate, new-vs-returning, age/gender/location cohorts, event-level export) are DPIA fail-closed and default-off: design them as "not available until the privacy gate opens" surfaces, with suppression/minimum-cohort and no exact-count demographics. Do NOT design a live demographics dashboard. This is also where MEMBER behavioural/demographic analysis lives (member locality, age/gender distribution, interest cohorts, retention/churn cohorts): it is deliberately NOT in the Members and Revenue group (which is operational-commercial only). A Members and Revenue surface must never answer a demographic or behavioural-cohort question; those route here and stay DPIA-gated.
- Historical figures are not immutable (deletions retroactively lower a period; later validations raise the confirmed portion): reflect that where a report implies frozen history.
States: operational dashboard concept, "not available (privacy gate)" for behavioural/demographic, suppression notice, export-safety (purpose-scoped: analytics export applies eligibility cleanliness; a DSAR/legal export is a different purpose and MUST include the subject's data).

### 3.4 Feature flags / config (M23; Platform group; observe now, toggle later)
A read-first configuration surface: observe the platform's feature flags and config booleans and their gate state (for example email-delivery on/off, an analytics-privacy gate, a rotation-parity flag). Two honesty rules to design in: NEVER render a secret or credential value (only the approved allow-listed booleans/states, same discipline as Operational Status); and toggling a flag from the UI is FUTURE (there is no config-write surface today), so present editing as a labelled concept and keep v1 read/observe-only. Note that the live operational slice of this (outbox/job/config health) already appears in Operational Status (M22, Wave 1); this Wave 3 panel is the fuller config/flag register, not a duplicate. States: read-only flag register, gated-toggle concept, allow-list-only notice.

### 3.5 Members and Revenue depth (customer-commercial revenue engine; Wave 2 shipped the core list/detail + a revenue snapshot)
The deeper Members and Revenue surfaces, building on the Wave 2 Members and Subscriptions list/detail + Revenue snapshot. All operational-commercial (fine to show); behavioural/demographic member analysis is NOT here (it lives in Insights, screen 3.3, DPIA-gated).
- **Revenue and Billing (deep):** MRR and ARR broken out by tier/interval (derived read-side, active subs x plan price x interval; labelled net-new, no revenue table today); new vs churned over time; a Past-due / dunning worklist. Refunds, chargebacks, dunning beyond PAST_DUE, and a payment-source breakdown (STRIPE vs a PLANNED APPLE/GOOGLE/ADMIN split) are FUTURE / not-built: show them as clearly-labelled gated concepts, never as live money. Grant a complimentary (admin-granted) subscription is a FUTURE concept action (the `source` enum + admin-grant path are not built): design the outcome with reason + audit, labelled not-live. Historical figures are not immutable (deletions retroactively lower a period; later validations raise the confirmed portion): reflect that where a report implies frozen revenue history.
- **Promo Codes and Trials:** create/manage subscription promo codes (code, discount type percent/fixed-GBP, discount value, uses/max-uses, expiry, active flag, Stripe coupon mapping) + a trial funnel view (members in Trialling, driven by the Stripe-coupon path). This is real substrate (relocated from the old Growth commercial cluster under D27); the admin management UI is net-new.
- **Redemptions and Engagement (aggregate):** redemptions per period, active-member rate, redemption rate, total member savings, and the spread across merchants. AGGREGATE ONLY: never an individual customer identity in a row (redemption rows have no customer-name field; identity is only via a User join, which does not belong on this surface). Apply Insights eligibility cleanliness (exclude test/QA/deleted); join redemptions to a merchant via the branch (there is no direct merchant id on a redemption). Savings are aggregated on-the-fly (no snapshot table); per-period aggregation is net-new.
- **Conversion:** a top-line registered-to-subscribed funnel (registered users to trialling to active-paid), derived read-side. Any breakdown of conversion by locality/age/gender/interest is a behavioural/demographic question and routes to the DPIA-gated Insights surface, not here.
States: derived-net-new notice on MRR/ARR/conversion; not-built label on refunds/chargebacks/source-breakdown/admin-grant; promo CRUD with confirm + audit; aggregate-only (no identity in engagement rows); DPIA "not available" redirect for any demographic/behavioural member cut; suppression on thin aggregates.

## Wave 3 clickable flows
- Members and Revenue: open the Revenue and Billing deep view to the Past-due worklist to a member; mint a promo code and watch the trial funnel; open Conversion and see a demographic breakdown redirect to the DPIA-gated Insights surface; grant a complimentary subscription with reason + audit (labelled FUTURE, not-live).
- Commercial: create a campaign to set locations/cost and add merchants, then schedule live; create a featured placement to see it blocked until payment status is confirmed (the payment-status gate applies to featured placement, not campaigns).
- Content: edit a taxonomy entry (confirm + audit); open the versioned-legal control and see the external/gated caveat.
- Insights: view the operational supply/redemption dashboard concept; open a behavioural/demographic card and see "not available until the privacy gate opens".

## Wave 3 acceptance (in addition to the global checklist)
- Approx scope: ~5 concept areas (merchant-paid commercial cluster, Members and Revenue depth, content/taxonomy, Insights/reporting, feature-flags/config), each a labelled gated/future concept where appropriate.
- The merchant-paid commercial cluster is clearly gated on billing; the featured-placement surface makes payment status a visible go-live gate; Promo codes and Subscriptions/Billing/Refunds are NOT in this Growth cluster (they moved to Members and Revenue, D27).
- Members and Revenue depth: MRR/ARR/conversion are labelled derived read-side net-new; refunds/chargebacks/payment-source-breakdown/admin-grant are not-built labels; Redemptions and Engagement is aggregate-only (no individual identity in a row); any demographic/behavioural member cut redirects to the DPIA-gated Insights surface.
- Feature-flags/config is read/observe-only in v1 (toggle-in-UI is a labelled future concept), renders no secret values, and does not duplicate Operational Status.
- Content is specific controls only, not a generic CMS; legal content is shown as external/gated, never the live source of truth.
- Admin analytics is presented as a designed concept reusing the merchant foundation as a reference; behavioural/demographic surfaces (including member locality/age/gender/interest/retention cohorts) show "not available" until the gate opens; no exact-count demographics; export policy is purpose-scoped (analytics-cleanliness vs DSAR-must-include).
- Nothing in this wave presents gated money, gated analytics, or legal content as approved or built.
