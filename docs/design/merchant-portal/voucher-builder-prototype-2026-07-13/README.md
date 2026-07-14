# Voucher Builder prototype evidence bundle (2026-07-13)

Evidence base for the Voucher Builder prototype fidelity rebaseline
(plan: docs/superpowers/plans/2026-07-13-voucher-builder-prototype-fidelity.md, PR #503;
S1 merged 7c7c2246 via PR #509).

Contents and provenance:

- PROTOTYPE-INVENTORY.md: complete inventory of the prototype's voucher-builder flow
  (screens, fields, verbatim copy, scoring rules, terms, visual system) derived from the
  captures below, PLUS the "Addendum: live-walk resolutions (2026-07-13)" (A1-A14)
  resolving every ambiguity empirically against the live prototype. The addendum and the
  FULL source override the older captures where they disagree (the live prototype is a
  newer iteration).
- CURRENT-IMPLEMENTATION.md: the pre-S1 implementation map (two builders, the 12 locked
  contracts, backend surface, test baseline). Historical baseline: S1 (PR #509)
  superseded parts of section 1-2; section 3 locks remain authoritative.
- Redeemo-for-Business.FULL.html: the complete prototype source (3.17MB) recovered from
  the design project's serve endpoint on 2026-07-13 (an earlier transfer clipped at
  256KiB and lacked the builder script entirely). Contains the scoring engine, suggestion
  templates, term pools, and submit handlers the build ports from. Safety-scanned before
  commit: no tokens, credentials, or session material embedded (the claude.ai injected
  preview-support script is generic infrastructure code).
- proto-*.png: the owner's 22 sequential full-page captures of the builder flow (plus one
  older 2026-06-25 capture of the same project).
- live-walk/: 19 targeted captures from the 2026-07-13 live ambiguity walk (score states,
  field branches, submit flow, edit/flagship menus). edit-menu.png was cropped before
  commit to remove the owner's private design-session chat panel.
- build-walk/: S1 milestone captures of the rebuilt day-2 builder (8 states) taken via
  the deterministic route-mock Playwright harness.

Owner-settled behaviour decisions this bundle evidences (do not regress):
weak offers stay non-gating with the soft warning confirmation (CC-1, owner ruling
2026-07-13); real draft persistence stays (the prototype's Save-as-draft is a stub);
the prototype's edit-mode term re-seeding bug is not to be copied.
