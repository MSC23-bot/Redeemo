# Voucher Builder prototype fidelity rebaseline (Tier 2)

Status: APPROVED-DIRECTION (owner directive 2026-07-13: "it needs to be just like the
prototype"; autonomous execution, Fable 5 leads, Opus/Sonnet execute). Plan written before
implementation per Tier 2 rules.

## 1. Goal

Rebuild the merchant-portal voucher builder so its structure, fields, live scoring,
live customer preview, terms composition, and visual system match the Claude Design
prototype ("Redeemo for Business - Merchant Portal", project 09a77423, page: voucher
builder), closing the gap the owner identified between the shipped builder and the
intended design.

## 2. Evidence base (all in docs/design/merchant-portal/voucher-builder-prototype-2026-07-13/)

- 22 sequential full-page prototype captures (proto-01_21_55 .. proto-01_31_37) plus one
  older capture; catalogued in PROTOTYPE-INVENTORY.md (flow map, per-screen verbatim
  copy, 7-type table, scoring panel behaviour, preview anatomy, terms checklist, visual
  system, 14 ambiguities).
- CURRENT-IMPLEMENTATION.md: full map of today's two builders, the 12 locked contracts,
  backend surface, test baseline (~308 jest blocks / 28 files + 1 Playwright spec).
- Redeemo-for-Business.dc.html: prototype source, TRUNCATED at 256KiB (transfer cap):
  it lacks the builder page markup/JS. Full-source recovery is an open evidence item
  (section 8); the inventory is screenshot-derived and sufficient to start slices 1-2.

## 3. Tier call and scope decisions (lead adjudication)

- Tier 2, frontend-only. No backend contract change is required: every structured
  per-type input the prototype shows already lives in the merchantFields JSON bag;
  the advisory score is client-side (and stays non-gating per CC-1); the two-column
  builder+preview layout already exists. If any slice discovers a genuine backend need
  (new column, new endpoint), that slice PAUSES and escalates to Tier 3 for that part.
- One shared component core, two lanes. Today's duplicated builders (onboarding
  flagship vs day-2 custom) both adopt new SHARED prototype-fidelity components
  (field primitives, score panel, preview card, terms composer). The flagship lane
  keeps its template-driven constraints; the custom lane keeps all 8 types.
- Prototype wrapper model for TIME_LIMITED and REUSABLE (they wrap a base mechanic)
  is represented client-side in the bag; stored VoucherType stays the wrapper type.
  Windows/cooldown validation is untouched.
- The prototype's "Preview suggestions as <category>" selector is DEMO-only by its own
  banner: the real merchant category drives suggestions in the product; no category
  picker ships.

## 4. Locks preserved (from CURRENT-IMPLEMENTATION.md section 3; violations = defects)

Flagship byte-lock on live RMV (no direct edit/delete); nullable-clear contract
(imageUrl/expiryDate independent, DRAFT-only PATCH); end-date UI placement stays
TIME_LIMITED-only unless the owner separately decides otherwise; governed
VoucherPendingEdit lane (one PENDING per voucher, flagship never endable, mandatory
reasons, withdraw paths); RmvTemplate.allowedFields governs both direct-edit and
request-change keys; ELIGIBLE_FLAGSHIP_TYPES (6) + FLAGSHIP_RMV_CAP=2; score never
gates Save/Submit (CC-1); admin-owned merchantFields keys stripped; 16KB/50-key bag
guard respected; duplicate stays client-orchestrated; no customer PII in previews;
capability gate stays display-only with server re-enforcement.

## 5. Slices

- S1 Shared core to prototype fidelity (custom lane first): new shared builder
  components under components/vouchers/shared/ (structured per-type field groups with
  prototype copy verbatim, chips/presets, typical-order-value input, minimum-spend
  toggle, suggested title/description generation, terms checklist, score panel with
  prototype rules, live preview card with type-coloured header). Day-2 custom builder
  (components/vouchers/builder/*) rewired to the shared core, all 8 types.
- S2 Onboarding flagship lane adopts the shared core (template-driven defaults,
  allowedFields-constrained, 6 eligible types, cap-2 language preserved).
- S3 Score-rule fidelity + ambiguity closure: reconcile lib/voucher/scoring.ts with the
  prototype's exact rules once full source is recovered (section 8); until then S1 ships
  the observed rules (Too weak / Good / Great, strengths + improvements lists) marked
  with a scoring-rules provenance comment.
- S4 Verification walk: Playwright + manual browser walk of both lanes against the 22
  captures; side-by-side fidelity check; jest/tsc/next build green; update the 1
  Playwright spec and affected jest suites consciously (test updates are in-scope work,
  not collateral).

Each slice is its own PR, SHA-bound approval as usual. Milestone pauses: end of S1 and
end of S2 (owner sees screenshots before the next slice proceeds).

## 6. Verification bar (every slice)

Root tsc + merchant-web tsc clean; merchant-web jest green (with consciously updated
suites); next build clean; browser walk evidence archived under
docs/design/merchant-portal/voucher-builder-prototype-2026-07-13/build-walk/;
no lock in section 4 violated (spot-check list in each PR body).

## 7. Open owner decisions

None at plan time. The owner's parity directive is the product decision; engineering
decisions (shared core, wrapper representation) are recorded in section 3. If S3
uncovers score rules that contradict CC-1 (a gating score) or any lock, that becomes
an owner decision before building it.

## 8. Open evidence items

- Full prototype source recovery (256KiB cap workaround): owner either signs into
  claude.ai in the automation browser (login page already open) or downloads
  "Redeemo for Business.dc.html" from the design app into ~/Downloads for pickup.
- The 14 inventory ambiguities: resolve empirically via the live prototype walk once
  auth exists; each resolution lands as an inventory addendum. S1/S2 build only on
  unambiguous evidence; ambiguous branches ship behind the observed default until
  resolved.
