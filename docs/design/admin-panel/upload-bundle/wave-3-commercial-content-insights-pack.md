# Admin Panel prompt pack: Wave 3 (commercial operations, content and taxonomy, Insights and reporting)

Inherits the shared master context and the approved Wave 1 + Wave 2 output. Reuse the established shell, tables, gated-concept pattern, and privacy discipline.

**Wave 3 goal:** the mostly-gated/future frontier: commercial operations (blocked on merchant billing), content/taxonomy controls (specific, not a generic CMS), and platform analytics (reusing the Merchant Insights foundation as a reference, but a separate admin surface with its own privacy gating). Design faithful concepts; do not present gated items as approved or built.

## Wave 3 intro (paste into the Admin session)

Design Wave 3: commercial operations, content and taxonomy, and Insights and reporting. Most of this is gated on the monetisation model, a privacy/DPIA gate, or a legal sign-off. Design the intended operator experience and label the gate clearly. Do not fabricate live money, live analytics, or legal content.

## Screens (design each with its states)

**How to use this list:** each screen's paragraph below IS the prompt for that screen. Paste it (lightly trimmed if you like) into the Admin session, then ask for its full state set. Work one screen at a time; reference the Wave 1 + Wave 2 shell and gated-concept pattern rather than re-establishing them.

### 3.1 Commercial operations (gated on merchant billing; models exist, no admin surface)
A coherent commercial cluster, all provider/billing-gated:
- **Campaigns** (location-targeted banners): list/create/schedule + drill into opted merchants; location targeting (all-UK or selected areas); cost.
- **Featured placement**: add/schedule a paid placement with radius; DESIGN-IN the integrity fix that a placement must not go live without a paid/confirmed payment status (today discovery does not check payment status; the operator surface should make payment status a visible gate).
- **Trending**: view the algorithmic trending set with a manual add/remove curation control.
- **Promo codes**: create/manage subscription promo codes (uses, expiry, Stripe coupon mapping).
- **Subscriptions / Billing / Refunds** (all FUTURE / provider-gated concept actions; none are wired to a live provider): view a customer's subscription; grant a complimentary subscription; cancel-on-behalf; refund; investigate a failed payment / dispute.
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
- **Behavioural + demographic** analytics (repeat-rate, new-vs-returning, age/gender/location cohorts, event-level export) are DPIA fail-closed and default-off: design them as "not available until the privacy gate opens" surfaces, with suppression/minimum-cohort and no exact-count demographics. Do NOT design a live demographics dashboard.
- Historical figures are not immutable (deletions retroactively lower a period; later validations raise the confirmed portion): reflect that where a report implies frozen history.
States: operational dashboard concept, "not available (privacy gate)" for behavioural/demographic, suppression notice, export-safety (purpose-scoped: analytics export applies eligibility cleanliness; a DSAR/legal export is a different purpose and MUST include the subject's data).

### 3.4 Feature flags / config (M23; Platform group; observe now, toggle later)
A read-first configuration surface: observe the platform's feature flags and config booleans and their gate state (for example email-delivery on/off, an analytics-privacy gate, a rotation-parity flag). Two honesty rules to design in: NEVER render a secret or credential value (only the approved allow-listed booleans/states, same discipline as Operational Status); and toggling a flag from the UI is FUTURE (there is no config-write surface today), so present editing as a labelled concept and keep v1 read/observe-only. Note that the live operational slice of this (outbox/job/config health) already appears in Operational Status (M22, Wave 1); this Wave 3 panel is the fuller config/flag register, not a duplicate. States: read-only flag register, gated-toggle concept, allow-list-only notice.

## Wave 3 clickable flows
- Commercial: create a campaign to set locations/cost and add merchants, then schedule live; create a featured placement to see it blocked until payment status is confirmed (the payment-status gate applies to featured placement, not campaigns); mint a promo code; grant a complimentary subscription with reason + audit.
- Content: edit a taxonomy entry (confirm + audit); open the versioned-legal control and see the external/gated caveat.
- Insights: view the operational supply/redemption dashboard concept; open a behavioural/demographic card and see "not available until the privacy gate opens".

## Wave 3 acceptance (in addition to the global checklist)
- Approx scope: ~4 concept areas (commercial cluster, content/taxonomy, Insights/reporting, feature-flags/config), each a labelled gated/future concept where appropriate.
- The commercial cluster is clearly gated on billing; the featured-placement surface makes payment status a visible go-live gate.
- Feature-flags/config is read/observe-only in v1 (toggle-in-UI is a labelled future concept), renders no secret values, and does not duplicate Operational Status.
- Content is specific controls only, not a generic CMS; legal content is shown as external/gated, never the live source of truth.
- Admin analytics is presented as a designed concept reusing the merchant foundation as a reference; behavioural/demographic surfaces show "not available" until the gate opens; no exact-count demographics; export policy is purpose-scoped (analytics-cleanliness vs DSAR-must-include).
- Nothing in this wave presents gated money, gated analytics, or legal content as approved or built.
