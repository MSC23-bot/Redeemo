# Admin Panel: Claude Design upload / execution manifest

The exact order to upload and run, which project/session each item belongs to, expected outputs, review checkpoints, and how later waves inherit approved context without one enormous repeated prompt. **Do not execute any of this until the owner approves this manifest. Nothing is uploaded to Claude Design during the D14 drafting stage.**

## 1. Projects / sessions

- **One Admin Claude Design project**, named exactly `Redeemo Admin Panel` (kept stable; it is the DesignSync target later). SEPARATE from the merchant `Redeemo for Business - Merchant Portal` project.
- Optionally created in the same claude.ai/design account as the merchant project (browser-side continuity only; not a link).
- The Admin project holds every wave. Waves are sessions/passes within it, not separate projects.

## 2. Upload order (context load)

Into the Admin project, in this order:
1. **Context uploads (files):** the merged Admin blueprint (`2026-07-01-admin-panel-platform-blueprint.md`, uploaded as the source-of-truth REFERENCE, not pasted); `00-admin-master-context.md`; `merchant-reference-summary.md` (the tracked, text-only PRIMARY merchant reference); and the selected brand/design-system + merchant visual assets in the exact asset manifest below (§2A). **Availability differs per asset** (tracked in the repo vs owner-local/untracked vs capture-on-demand): run the pre-upload existence check in §2A FIRST. The essential brand (exact hexes, the two fonts, 60-30-10, no-emoji/no-em-dash) is already pasted verbatim in master-context §B, so a missing owner-local `tokens.css`/font file does NOT block the pass. Do NOT upload the full `.dc.html` or the whole handoff zip.
2. **Paste (in order, acknowledge before proceeding):** master context (master-context Section A), then design direction (Section B). These two Sections ARE the pasted prompts; the blueprint stays a reference the model can consult, not a wall of text to paste.
3. **Design-system-first:** ask Claude Design to produce the shared design system + the dense operator shell (palette + two fonts + base components + the grouped 8-group sidebar + top bar with search/bell/identity/logout) BEFORE any screen. This is the first review checkpoint.

Then run the waves in order, each as its own pass, pasting only the short wave-intro + working screen by screen from that wave's pack.

## 2A. Exact asset manifest (which files, where they are, are they present)

Availability keys: **TRACKED** = in the git repo, present in any clean clone + the D14 worktree · **OWNER-LOCAL** = untracked, exists only in the owner's main checkout (ABSENT from a clean clone and from the D14 worktree; the owner attaches it from their local machine if present) · **CAPTURE** = not a ready file; a screen that must be opened and screenshotted on demand · **THIS BUNDLE** = a tracked file in `docs/design/admin-panel/upload-bundle/`.

Reproducibility note: `docs/design/` is NOT in the repo (0 tracked files); everything under `docs/design/merchant-portal/**` is OWNER-LOCAL. The `docs/superpowers/prototype-references/*.png` (22 files) ARE tracked. A clean-clone reviewer therefore has the blueprint, this bundle and the 22 PNGs, but NOT the merchant brand/design-system files or the handoff.

Scope of this table: the assets whose availability varies (the brand/design-system + merchant visual anchors), plus the blueprint and the merchant summary. The bundle's own pasted prompts (`00-admin-master-context.md` and the three wave packs) and the operator/review-aid docs (`README.md`, this manifest, `traceability-crosscheck.md`, `CLAUDE-DESIGN-RUNBOOK.md`) are always-present tracked files in this bundle and are intentionally NOT itemised as rows here; §2 above and the README cover which of those are pasted vs uploaded vs review-aid.

| Asset (purpose) | Exact path | Availability | Lesson it provides | Why included | When |
|---|---|---|---|---|---|
| Admin blueprint (source of truth) | `docs/superpowers/specs/2026-07-01-admin-panel-platform-blueprint.md` | TRACKED | the full operating model, IA, authority, gates | grounding reference | CP-0, uploaded as REFERENCE (not pasted) |
| Merchant reference summary | `docs/design/admin-panel/upload-bundle/merchant-reference-summary.md` | THIS BUNDLE (tracked) | merchant nav/journey/terminology/lifecycle/patterns + "don't copy" | the PRIMARY merchant reference; works with no binary dependency | CP-0, uploaded |
| Merchant brand tokens | `docs/design/merchant-portal/design-system/tokens.css` | OWNER-LOCAL | exact colour/type/spacing/radii/shadow tokens | brand fidelity | CP-0 if present; NOT required (hexes + fonts already in master §B) |
| Design-system pages (3) | `docs/design/merchant-portal/design-system/{01-foundations,02-components,03-voucher-blocks}.html` | OWNER-LOCAL | rendered palette, components, status pills, voucher card | strongest visual brand anchor | CP-0 if present |
| Merchant fonts (2 families) | `docs/design/merchant-portal/design-system/fonts/{MusticaPro-SemiBold.otf, Lato-*.ttf}` | OWNER-LOCAL | the exact two typefaces | type fidelity | attach if present; names are in master §B |
| Brand foundations spec | `docs/design/merchant-portal/upload-bundle/2026-06-10-brand-design-system-foundations-design.md` | OWNER-LOCAL | brand rationale narrative | deeper brand context | consult if present; not required |
| Merchant blueprint + prompt pack | `docs/design/merchant-portal/upload-bundle/{2026-06-16-merchant-portal-product-blueprint.md, 2026-06-17-merchant-portal-claude-design-prompt-pack.md}` | OWNER-LOCAL | full merchant product spec | already distilled into the summary above | LOOKUP ONLY; not uploaded |
| Branches overview PNG | `docs/superpowers/prototype-references/merchant-web-branches/01-branches-overview.png` | TRACKED | merchant table + status-pill visual | real table/status anchor | consult (Wave 1) |
| Branch detail header PNG | `docs/superpowers/prototype-references/merchant-web-branches/02-branch-detail-top.png` | TRACKED | branch/profile header pattern | anchor for Merchant 360 header | consult (Wave 1) |
| Edit-branch modal PNG | `docs/superpowers/prototype-references/merchant-web-branches/11-edit-branch-details-modal.png` | TRACKED | merchant edit pattern | anchor for Admin edit-on-behalf diff | consult (Wave 1) |
| Insights overview PNG | `docs/superpowers/prototype-references/merchant-web-insights-reports/02-overview-live-established.png` | TRACKED | merchant day-2 dashboard register | the warm register Admin must DIVERGE from (contrast anchor) | CP-0 (contrast) |
| Demographics-preview PNG | `docs/superpowers/prototype-references/merchant-web-insights-reports/07-customers-new-returning-age-gender.png` | TRACKED | "Preview - coming later" gated-analytics pattern | anchor for Admin DPIA-gated Insights | consult (Wave 3) |
| Validation-breakdown PNG | `docs/superpowers/prototype-references/merchant-web-insights-reports/10-validation-breakdown.png` | TRACKED | redemption analytics pattern | anchor for Insights/redemption rollups | consult (Wave 3) |
| Merchant shell / LIVE dashboard / onboarding checklist | inside `docs/design/merchant-portal/prototype-handoff/Redeemo-for-Business-Merchant-Portal-handoff.zip` -> `.../project/Redeemo for Business.dc.html` | CAPTURE (from an OWNER-LOCAL zip) | the merchant shell, dashboard, checklist as rendered | only if a specific screen is wanted as an anchor | open the `.dc.html` and screenshot on demand; do NOT upload the `.dc.html` or the zip |

Keep the reference set small and purposeful: the tracked summary + a few tracked PNGs are enough; the owner-local design-system pages are a strong bonus IF present. Do NOT commit or upload the handoff zip, the fonts, or the `.dc.html`.

**Pre-upload existence check (run in the owner's checkout before uploading; a clean clone will be missing the OWNER-LOCAL rows):**
```
# TRACKED (must be present in any clone):
git ls-files docs/superpowers/specs/2026-07-01-admin-panel-platform-blueprint.md
git ls-files docs/superpowers/prototype-references/ | wc -l          # expect 22
# OWNER-LOCAL (present only if the owner has the merchant design bundle locally):
ls docs/design/merchant-portal/design-system/tokens.css 2>/dev/null || echo "  MISSING (owner-local): tokens.css"
ls docs/design/merchant-portal/design-system/0*.html    2>/dev/null || echo "  MISSING (owner-local): design-system pages"
ls docs/design/merchant-portal/prototype-handoff/*.zip  2>/dev/null || echo "  MISSING (owner-local): handoff zip"
```
If the OWNER-LOCAL rows are missing (e.g. a clean clone), proceed with the tracked summary + master-context §B brand + the tracked PNGs; the owner-local artifacts are enrichment, not blockers. **Any decision to bring the merchant design-system files (or the handoff) into the repo is a SEPARATE, explicit preservation/commit decision, not part of this D14 bundle; do not silently commit the large handoff, fonts, prototype HTML, or unrelated untracked merchant artifacts.**

## 3. Wave order, expected output, checkpoints

| Stage | Pack | Expected output | Checkpoint |
|---|---|---|---|
| 0 | (master context + design direction) | Acknowledged context; shared design system + dense shell | CP-0: brand + shell approved before any screen |
| 1 | `wave-1-foundation-spine-governance-pack.md` | Shell + Ops Home; unified queue; the 5-surface review/actioner; merchant directory; Merchant 360; create-draft; Global Audit; Admin Users; Operational Status; bell. All states + the Wave 1 flows. | CP-1: owner + Codex review; capture notes; refine |
| 2 | `wave-2-relationships-crm-onboarding-support-trust-pack.md` | Customer 360; Communications; Tasks; Account Health; Reviews/Fraud/Suggested-tag moderation; Support/Cases; DSAR; View-as; representative-assisted onboarding + signature comparison. | CP-2: owner + Codex review |
| 3 | `wave-3-commercial-content-insights-pack.md` | Commercial cluster; Content and Taxonomy; Insights and Reporting. | CP-3: owner + Codex review |
| 4 | (outputs) | Clickable multi-screen prototype; derived design system/tokens; per-screen exportable code; screenshots (desktop + key mobile); the Claude Code handoff bundle | CP-4: final review; then preserve + DesignSync |

Sequencing rationale: Wave 1 is the most ENGINEERED (design it faithful, it sets the quality bar) and includes governance (Global Audit + Admin Users) EARLY because those oversee everything. Wave 2 is the human/relationship + trust-and-safety layer (mostly net-new/gated). Wave 3 is the mostly-gated commercial/content/analytics frontier. If a review shows a more reviewable split, adjust and record why (the wave names are blueprint anchors, not a hard limit).

## 4. Inheriting approved context without a giant repeated prompt

- The **master context is pasted once** (Stage 0) and inherited by all waves.
- The **design system + shell are built once** (CP-0); every later wave references "the shell, tables, status pills and review pattern you established", it does not re-establish or re-paste them.
- Each **wave pack is short** (a wave-intro + screen list); it names its predecessors' output rather than repeating context.
- After each wave, capture NOTES (missing/wrong/brand-drift/confusing) and fold them into the next pass, rather than re-explaining the whole product.

**Context-continuity fallback (if the waves exceed one Design conversation's reliable context).** A single Claude Design conversation may not hold the whole panel reliably. Guard against silent context loss:
- At each checkpoint (CP-0, CP-1, CP-2), obtain and PRESERVE a concise approved summary: the design system + shell decisions, the key screen decisions made so far, and the unresolved corrections/open items. Save it under `docs/design/admin-panel/notes.md` (per the runbook).
- If a new Design session is required (context exhausted, or resuming later), reload ONLY: that checkpoint summary + `00-admin-master-context.md` + `merchant-reference-summary.md` + the specific reference assets the next screens need. Do NOT blindly re-paste the whole bundle or every wave pack.
- Before continuing in the new session, REVALIDATE the boundaries against the master context: brand (palette/fonts/60-30-10), authority (act-FOR-not-AS, single-actor approval not four-eyes), privacy (PII gating, no customer-home map, PIN never shown, DPIA-gated analytics), and maturity (gated/future labelled, not faked). Only then resume screen work.
- Treat any earlier session's output as a hypothesis to re-verify, not a guarantee the new session remembers it.

## 5. Outputs to request (Stage 4)
- A clickable, multi-screen prototype.
- The derived design system (tokens: colours/type/spacing/radii/shadows; the component set).
- Per-screen exportable code (HTML or React) + screenshots.
- The Claude Code handoff bundle once the prototype is good.

## 6. Preserve + round-trip (after CP-4)
- Save under `docs/design/admin-panel/`: `screenshots/` (named `<wave>.<n>-<screen>-<device>[-<state>].png`), `code/`, `tokens/`, `handoff/` (the bundle zip), `notes.md`.
- Commit the saved outputs as a checkpoint (separate, owner-approved).
- Round-trip the component library into the repo via DesignSync (owner authorizes design access; read-first, finalize_plan, write incrementally, never wholesale). Prompt-only to DESIGN; DesignSync to PRESERVE.

## 7. Safety gates at upload (hard rules)
- Synthetic sample data ONLY (master-context Section F). No real customer/merchant PII.
- No secrets: never upload `.env`, API keys (Stripe/Twilio/Resend/Google/R2), JWT secrets, `DATABASE_URL`, the Redis URL, the encryption key, or any branch redemption PIN.
- Do not connect the prototype to the real backend or real data. Be cautious connecting the repo (ensure it cannot read `.env`/secrets); the brand values are sufficient.
- Nothing gated/future is presented as approved or built; anything crossing a stop-and-review line is flagged, not silently designed.

## 8. What is NOT authorised by this manifest
No Claude Design upload or execution during D14 drafting; no implementation; no D3-D18 product/security decisions; no PR yet. This manifest is a plan for the owner to approve, then run.
