# Claude Design runbook: Admin Panel prototype

Step-by-step guide for running the Admin Panel prototype in Claude Design. This is a user guide, not implementation. It mirrors the proven Merchant Portal runbook, adapted for the operator console. You follow this; you do not upload it.

**Companion documents (this bundle):** `00-admin-master-context.md` (context + design direction), the three wave packs, `merchant-reference-summary.md` (the tracked merchant reference), `merchant-prototype-linkage-strategy.md`, `upload-execution-manifest.md` (incl. the §2A asset manifest + existence check), `traceability-crosscheck.md`. Source of truth: the merged blueprint `docs/superpowers/specs/2026-07-01-admin-panel-platform-blueprint.md`. Save outputs under `docs/design/admin-panel/`.

## 0. Before you start
You need a paid Claude plan + your claude.ai login (Claude Design is at claude.ai/design), the companion docs open, and the Merchant-prototype reference pack to hand (linkage strategy). **First run the pre-upload existence check in `upload-execution-manifest.md` §2A:** the merchant brand/design-system files and the handoff are OWNER-LOCAL (untracked, absent from a clean clone); the tracked `merchant-reference-summary.md` + the 22 `prototype-references` PNGs are always present, and the exact hexes + 60-30-10 are already in master-context §B, so a missing `tokens.css` does not block those. The two FONT FILES are the exception: exact type fidelity needs the real Mustica Pro + Lato files, so if they are missing or Claude Design cannot ingest them, STOP and report before claiming exact type (a fallback typeface needs owner approval). Use ONLY the synthetic sample data (master-context Section F). Time: one focused session per wave for a broad first pass, then a refine pass after review. Do NOT begin until the owner has approved the upload/execution manifest.

## 1. Step by step
1. **Create the project** at claude.ai/design, named exactly `Redeemo Admin Panel` (kept stable for later DesignSync). Optionally in the same account as the merchant project.
2. **Give it context, in order:** upload the blueprint (as reference) + master context + `merchant-reference-summary.md` (the tracked primary merchant reference) + the TRACKED merchant PNGs from `prototype-references/merchant-web-*`; and, ONLY if present in your checkout (owner-local, per the §2A existence check), the design-system foundations (`tokens.css` + the fonts + the three pages `01-foundations.html` / `02-components.html` / `03-voucher-blocks.html`). Not the full `.dc.html`; not the handoff zip. Paste the master context (Section A), let it acknowledge, then paste the design direction (Section B). Tell it the brand hexes + two fonts are non-negotiable and the listed screens/flows are anchors: design the COMPLETE admin panel.
3. **Design-system + shell FIRST** (before any screen): palette applied, two fonts, base components (buttons, inputs, dense tables, status pills, split-pane, review cards), the grouped 8-group sidebar, the top bar (search, bell, operator identity + role, logout). This is checkpoint CP-0.
4. **Run Wave 1** (`wave-1` pack): work screen by screen; for each, ask for its full state set. Glance against the brand + the "dense operator, not merchant" register before moving on.
5. **Wire the Wave 1 flows** once the screens exist.
6. **Review at CP-1** (owner + Codex): capture notes; refine.
7. **Repeat for Wave 2, then Wave 3**, each referencing "the shell/patterns you built earlier" rather than re-establishing them (do not re-paste the master context).
8. **Ask for outputs** (per manifest Section 5): clickable prototype, derived design system/tokens, per-screen code, screenshots, the Claude Code handoff bundle.
9. **Save and preserve** (Section 5 below).

## 2. Screen generation order within a wave
Follow each wave pack's screen list. Across the whole panel the recommended global order is: shell + Ops Home; the richest screen (the review/actioner split-pane, which exercises the most components); then queue + directory + Merchant 360; then governance (audit + admin users + status); then the Wave 2 relationship/trust surfaces; then the Wave 3 gated frontier; then system states and mobile frames. Reuse the CP-0 foundation throughout. Where this global sequencing and a wave pack's own screen list differ, follow the wave pack (this section is only a recommended cross-panel order).

## 3. Keep it BROAD and honest, not narrow
- Tell it up front: "Design the COMPLETE Admin Panel across all 8 nav groups; the listed screens are anchors; add the sub-states and system states a full operations console needs."
- After each wave ask: "What screens, states, or flows are missing for this to feel like a complete operations control centre?" Then generate those.
- Insist on non-happy-path states: loading skeleton, empty, error (distinct from empty), permission-denied, stale/conflict, destructive-confirm, partial-data, responsive.
- Keep the full grouped nav from the start (gated/future items marked). Do not let gated/future modules render as fake live surfaces.
- Do not let the review screen collapse into a generic form; it is the type-dispatched, claim-to-act split-pane.

## 4. DesignSync vs prompt-only
Stay prompt-only (browser) for the entire design pass. Use DesignSync afterwards (with Claude Code) to round-trip the finalized component library into the repo, incrementally, one component at a time, never wholesale, after you authorize design access. Prompt-only to DESIGN; DesignSync to PRESERVE.

## 5. File and folder naming under docs/design/admin-panel/
```text
docs/design/admin-panel/
  upload-bundle/                (this bundle)
  screenshots/                  <wave>.<n>-<screen>-<device>[-<state>].png  (e.g. 1.4-review-onboarding-desktop-changes-requested.png)
  code/                         exported HTML/React per screen, same naming
  tokens/                       derived tokens (json/css)
  handoff/                      the Claude Code handoff bundle
  notes.md                      your pass notes
```
Keep the wave.section prefix so a screenshot ties to a blueprint module and a future `apps/admin-web` route.

## 6. What to AVOID sharing (hard rules)
- No real customer/merchant PII (use only the synthetic sample data; all customer figures aggregate + anonymous; no plottable address).
- No secrets: never paste/upload `.env`, API keys (Stripe/Twilio/Resend/Google/R2), JWT secrets, `DATABASE_URL`, the Redis URL, the encryption key, or any branch redemption PIN.
- Do not connect the prototype to the real backend or real data. Be cautious connecting the repo (ensure it cannot read `.env`/secrets); the brand values are enough.
- Do not let it design write-impersonation, an admin-signs-contract path, a customer-home map, exact-count demographics, or an unbounded mass-mutate.

## 7. Notes to capture (to refine the packs)
Per screen and overall: Missing (any screen/state/flow not produced); Wrong (off-model states, a wrong voucher/redemption behaviour, customer PII leaking into a row, a merchant PIN implying auto-go-live); Brand drift (rose over-used, wrong fonts, colour-only status, too spacious/merchant-like); Authority/safety drift (an on-behalf action without reason/audit, a "four-eyes" label on the single-actor approval, a gated item shown as built); Confusing interactions; Prompt tuning.

## 8. Review checklist (use while clicking through)
- Feels like a dense operator control centre, not an enlarged Merchant Portal? Same brand, diverged density?
- Complete grouped nav; gated/future honestly labelled, not faked? Role-aware Ops Home (not a redirect)?
- Every on-behalf action shows actor + reason + the right authority outcome; no impersonation, no admin-signs, no password exposure; approval shown as single-actor (not "four-eyes")?
- Every intake (reviews, fraud, suggested tags, bounced emails) has an action surface?
- Customer PII gated + reveal-on-demand + audited; no customer-home map; PIN never shown; no individual identity in redemption/aggregate rows?
- Behavioural/demographic analytics show "not available" until the gate; operational aggregates fine; export purpose-scoped?
- All non-happy-path states present? Responsive on the key screens?
- Did anything silently cross a stop-and-review line (real PII, a customer-home map, demographics presented as shipping, admin-signs, write-impersonation, gated presented as built)?

## 9. After the pass
Save screenshots/code/tokens/handoff/notes into `docs/design/admin-panel/`; tell Claude Code it is ready; Claude Code commits the outputs as a checkpoint, drives DesignSync to pull the component library (after you authorize design access), and folds your notes into refined packs. Implementation (turning the prototype into `apps/admin-web`) is a later, separately approved effort that honours the blueprint's gates.

*Design-preparation guide only. No Admin Panel code, schema, or build is authorised. The merged blueprint remains the source of truth.*
