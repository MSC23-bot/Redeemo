# Admin Panel: Claude Design upload / execution manifest

The exact order to upload and run, which project/session each item belongs to, expected outputs, review checkpoints, and how later waves inherit approved context without one enormous repeated prompt. **Do not execute any of this until the owner approves this manifest. Nothing is uploaded to Claude Design during the D14 drafting stage.**

## 1. Projects / sessions

- **One Admin Claude Design project**, named exactly `Redeemo Admin Panel` (kept stable; it is the DesignSync target later). SEPARATE from the merchant `Redeemo for Business - Merchant Portal` project.
- Optionally created in the same claude.ai/design account as the merchant project (browser-side continuity only; not a link).
- The Admin project holds every wave. Waves are sessions/passes within it, not separate projects.

## 2. Upload order (context load)

Into the Admin project, in this order:
1. **Context uploads (files, for reference; not all pasted):** the merged Admin blueprint (`2026-07-01-admin-panel-platform-blueprint.md`, uploaded as the source-of-truth REFERENCE, not pasted verbatim as a prompt); `00-admin-master-context.md`; the shared design-system foundations (`docs/design/merchant-portal/design-system/tokens.css` + the two fonts + `2026-06-10-brand-design-system-foundations-design.md`); the three design-system reference pages (`01-foundations.html`, `02-components.html`, `03-voucher-blocks.html`); the Merchant-prototype reference pack (the concise summary + a handful of real merchant PNGs from `docs/superpowers/prototype-references/merchant-web-*` + handoff `screenshots/audit-home.png`, per the linkage strategy). Do NOT upload the full `.dc.html` or the whole handoff zip.
2. **Paste (in order, acknowledge before proceeding):** master context (master-context Section A), then design direction (Section B). These two Sections ARE the pasted prompts; the blueprint stays a reference the model can consult, not a wall of text to paste.
3. **Design-system-first:** ask Claude Design to produce the shared design system + the dense operator shell (palette + two fonts + base components + the grouped 8-group sidebar + top bar with search/bell/identity/logout) BEFORE any screen. This is the first review checkpoint.

Then run the waves in order, each as its own pass, pasting only the short wave-intro + working screen by screen from that wave's pack.

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
