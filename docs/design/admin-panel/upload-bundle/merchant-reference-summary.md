# Merchant Portal reference summary (uploadable; the text anchor for the Admin session)

A concise, self-contained summary of the "Redeemo for Business" Merchant Portal prototype, written so the Admin Claude Design session speaks the same platform language WITHOUT depending on the untracked raw merchant artifacts. This file IS tracked in the repo and IS uploaded (it is the primary merchant reference); the raw brand/design-system files and the prototype handoff are owner-local (see the asset manifest in `upload-execution-manifest.md` §2A for availability).

**Anchors, not an exhaustive limit.** These are the merchant patterns the Admin Panel should recognise and stay continuous with. The Admin Panel is the OPERATOR side of the same platform; it reuses the brand and vocabulary but is a dense operations console, not a copy (see the last section, "What the Admin Panel must deliberately NOT copy").

Source of truth for these facts: the merged Merchant Portal blueprint (`docs/superpowers/specs/2026-06-16-merchant-portal-product-blueprint.md`) and its Claude Design prompt pack (`docs/design/merchant-portal/upload-bundle/2026-06-17-merchant-portal-claude-design-prompt-pack.md`) in the owner's checkout. Both are owner-local/untracked; this summary distils them.

## 1. Merchant Portal navigation and modules
A grouped left sidebar with a **live-status pill at the very top** (Setting up / Submitted / In review / Changes needed / Live / Suspended), then:
- **Home** (dashboard-first: a "Get your business live" setup checklist pre-live; a data-rich business dashboard once live).
- **Vouchers and customers** group: Vouchers, Redemptions, Insights and reports.
- **Locations and team** group: Branches, Staff and access.
- **Business** group: Business profile, Documents.
- **Grow your business** group, shown as **Coming soon**: Promote (campaigns/featured), Payments and billing.
- Pinned: **Settings**, **Help and support**.

Top bar: a **"Validate a code"** quick action, a **notifications bell**, and the **business-logo avatar** opening an account menu (My account, Business profile, Help, Log out with a confirmation). Desktop-first, fully responsive (sidebar becomes a drawer plus a bottom tab bar on mobile).

## 2. Merchant onboarding and approval journey
Two lives in one portal:
1. **Pre-live onboarding** (dashboard-first, not a bare form). The setup checklist: account created, category chosen (choosing the category provisions the two mandatory starter vouchers), add the main branch with a map pin (placing a pin is "submitted for review", it does NOT auto-publish the branch), set up two starter offers, sign the agreement (owner-only clickwrap, un-pre-ticked accept, saved copy), then submit. Day-2 modules are visible but locked until approval. Nothing is public until Redeemo approves.
2. **Day-2 management once live:** a professional business dashboard ("is Redeemo working for me?") with redemption activity, charts, summary cards and pending-action cards.

Submission states the merchant sees: Submitted, In review, Changes requested (a banner naming what to fix + a resubmit action), Approved/Live, Rejected (read-only + reason), Suspended (whole portal read-only + contact-Redeemo). The Admin Panel is the counterpart that reviews and drives this lifecycle; the merchant never sees admin internal notes.

## 3. Merchant, branch, voucher and redemption terminology
- **Merchant / business:** the account. Owner + staff. "Business profile" = identity (name, trading name, description, logo, category).
- **Branch:** a physical location. A voucher is **merchant-wide** (works at every visible branch); **redemption is attributed to the branch** where it happens. Branch readiness: Live / Pending pin / Under review / Suspended. Location confidence: manually-confirmed / address-geocoded / postcode-centroid / needs-review. A **redemption PIN** is set per branch (the merchant can view/set/send it; in the Admin Panel it is NEVER shown).
- **Voucher:** two kinds. **Mandatory starter vouchers (flagship, RMV)** = two required to go live, from a category template with guardrails (recommended type, plain-language title/description, minimum customer saving); shown in full detail but not freely editable (a "Request a change" path notifies Redeemo). **Custom vouchers (RCV)** = merchant-created, editable in draft, submitted for approval. Voucher types (type-aware builder): BOGO (the anchor), Spend-and-save, Freebie, Package deal, Discount (fixed), Discount (percentage, de-emphasised), Time-limited, Reusable.
- **Redemption:** customer opens a voucher in the app, gets a short code (+ QR); staff validate in store ("Validate a code" in the portal, QR on the staff app later). A record carries voucher, branch, date/time, method (manual/QR), status (validated/pending), validating staff, and the saving amount, but **never an individual customer's identity** in a row. Cycles: once per monthly cycle across all branches; reusable cooldown (>= 30 min); time-limited windows.

## 4. Lifecycle / status vocabulary (two distinct signals, never colour-alone)
- **Voucher lifecycle:** Draft, Pending approval, Active/Live, Inactive/Paused, Expired, Archived.
- **Voucher approval:** Pending, Approved, Changes requested, Rejected.
- **Merchant lifecycle:** Setting up (registered), Submitted, In review, Changes needed, Live (active), Suspended (immediate takedown, vouchers instantly hidden), Inactive, Deleted.
- Lifecycle status and approval status are always paired with a label or icon, shown as two visually distinct pills.

## 5. Voucher-card and status-pill language
- **Voucher card:** the saving amount is the hero (large display weight, Mustica Pro). A small **voucher-type accent chip** tints the card by type: BOGO `#7C3AED`, Discount `#E20C04`, Freebie `#16A34A`, Spend-and-save `#E84A00`, Package `#2563EB`, Time-limited `#D97706`, Reusable `#0D9488`. Type accents appear ONLY on small chips, never as the card body colour.
- **Status pills:** labelled, never colour-alone; functional signals success `#0F7A3E`, savings `#16A34A`, warning `#B45309`, danger `#B91C1C`, info `#0E7490`. Charts use the functional palette, not the brand rose.

## 6. Shared shell and component patterns (keep continuous)
- **Brand (identical across products):** page background white; cream `#FFF9F5` for identity/warm surfaces; navy `#010C35` for text/depth; a **Rose->coral gradient** (`#E20C04` -> `#E84A00`) used sparingly (<= ~10% of a screen, mostly the single primary action). Two fonts only: **Mustica Pro SemiBold** (display/headings) + **Lato** (body/labels). 60-30-10 balance; one dominant element and one primary action per view; WCAG AA; 44pt targets; no emojis; no long dashes (use colons, semicolons, parentheses, hyphens); British English.
- **Shell chrome:** grouped left sidebar with the top status pill; top bar with a quick action + bell + avatar/account menu (logout with confirmation); useful empty states that teach the next action; skeleton loading; friendly error states; the "Coming soon" gated pattern for future modules.
- **Cross-product state parity:** the operator must see the SAME merchant/branch/voucher/redemption/staff/onboarding/notification/Insights states the merchant sees. Reuse the merchant `deriveStatusPill` label set + tones so the same lifecycle state reads identically on both sides.

## 7. What the Admin Panel must deliberately NOT copy
- **Register/density:** the Merchant Portal is warm and generous for a non-technical cafe owner (big rounded marketing-ish cards, roomy spacing). The Admin Panel is a **dense operations console** for a trained operator: multi-column data tables and split-panes, tighter spacing, hairline dividers, Mustica for one dominant element per screen, calm restraint, one glow action per view.
- **IA and home:** do NOT reuse the merchant's day-2 dashboard IA. The Admin Panel has a platform-level IA (Operations / Relationships / Trust and Safety / Support / Growth / Content / Insights / Platform) and a role-aware Ops Home.
- **Authority and act-on-behalf:** the merchant acts AS itself; the operator acts **FOR, never AS** the merchant, with reason + audit on every on-behalf action, an independent approval lane, and governance surfaces (Global Audit, Admin Users, Operational Status) that have no merchant analogue.
- **Privacy scope:** the merchant only ever sees its own aggregate customer data. The Admin Panel handles cross-merchant customer PII, so it needs PII gating + reveal-on-demand + audit, no customer-home mapping, DPIA-gated analytics, and the redemption PIN never shown.
- **Voucher builder:** the merchant portal's teaching offer-builder is a merchant surface. The Admin equivalent is a review/approve + allow-listed concierge-edit surface, not a full builder.

*Reference summary only. Distilled from the merchant blueprint + prompt pack; where a specific merchant behaviour must be confirmed, consult those owner-local source docs. No Admin Panel code, schema, or build is authorised.*
