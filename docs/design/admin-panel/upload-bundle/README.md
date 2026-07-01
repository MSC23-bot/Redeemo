# Claude Design upload bundle: Admin Panel (D14 stage)

This folder gathers the documents needed to run the Redeemo **Admin Panel** prototype in Claude Design. It is docs-only design preparation. It authorises no upload and no implementation.

**Governing source of truth:** the merged Admin Panel blueprint at `docs/superpowers/specs/2026-07-01-admin-panel-platform-blueprint.md` (on `main` @ `5ff06d8`). Everything here is derived from and traceable to that blueprint. Where this bundle and the blueprint disagree, the blueprint wins.

**Status:** DRAFT for owner + Codex review. **Do not upload anything to Claude Design until the owner approves the upload/execution manifest.**

## What is in here

| File | Role |
|---|---|
| `README.md` | This index + provenance. |
| `00-admin-master-context.md` | The **shared master context** for the whole Admin prototype: platform, brand, relationships, personas + authority, complete information architecture, shell, design direction, status semantics, safety/privacy/legal boundaries, cross-product terminology, responsive/a11y/complete-state rules, and the guardrails that stop Claude Design silently inventing approved product/security decisions. Paste FIRST; every wave inherits it. |
| `wave-1-foundation-spine-governance-pack.md` | Wave 1: foundation, operational spine and governance (shell + Ops Home, approvals/actioner, merchant directory + Merchant 360, admin-created onboarding, oversight: Global Audit + Admin Users). |
| `wave-2-relationships-crm-onboarding-support-trust-pack.md` | Wave 2: relationships and CRM, representative-assisted onboarding, support and cases, DSAR, view-as, trust and safety (reviews / fraud-reversals / media / suggested-tags), Customer 360. |
| `wave-3-commercial-content-insights-pack.md` | Wave 3: commercial operations, content and taxonomy, Insights and reporting. |
| `merchant-reference-summary.md` | The **tracked, text-only, uploadable** Merchant Portal reference: nav + modules, onboarding/approval journey, terminology, lifecycle/status vocabulary, voucher-card + status-pill language, shared shell patterns, and what the Admin Panel must NOT copy. The PRIMARY merchant context (works in a clean clone with none of the raw merchant artifacts present). |
| `merchant-prototype-linkage-strategy.md` | How to give the Admin session the Merchant Portal prototype context safely (the mechanism, what to reuse, what must differ, token efficiency). Grounded in the actual Claude Design / DesignSync capabilities. |
| `upload-execution-manifest.md` | The exact artifact order, which project/session each item belongs to, expected outputs, review checkpoints, and how later waves inherit approved earlier context without one enormous repeated prompt. |
| `traceability-crosscheck.md` | Cross-check tables tying each Admin module to its source capability, Merchant prototype counterpart, cross-product dependency, target screen, authority/safety boundary, maturity status, open decision/gate, and its prompt pack + wave. |
| `CLAUDE-DESIGN-RUNBOOK.md` | The operator's step-by-step guide for running the sessions (a user guide; you do not upload it). |

**Uploaded vs review-aid.** Claude Design receives: the master context (pasted, Sections A then B), the three wave packs (pasted screen-by-screen), the merged blueprint (uploaded as a REFERENCE file, not pasted), and the shared brand/design-system + a handful of merchant assets. `README.md`, `traceability-crosscheck.md`, `upload-execution-manifest.md` and `CLAUDE-DESIGN-RUNBOOK.md` are operator + owner/Codex review aids: you follow them, you do NOT upload them.

## Recommended use (summary; full detail in the manifest and runbook)

1. Read the merged blueprint first (it is the source of truth).
2. Upload the blueprint + `00-admin-master-context.md` + the shared brand/design-system foundations as Claude Design context; paste the master context, then the design direction.
3. Establish the shared design system + dense operator shell FIRST (before any screen).
4. Run **Wave 1**, review at its checkpoint, then **Wave 2**, then **Wave 3** (each inherits the approved foundation from the prior wave; you do not re-paste the whole context).
5. Preserve outputs (screenshots, code, tokens, handoff) under `docs/design/admin-panel/` per the runbook.

Use ONLY the synthetic sample data in the master context. Never upload real customer/merchant PII, secrets, `.env`, keys, `DATABASE_URL`, the Redis URL, the encryption key, or any branch redemption PIN.

## Provenance

**Availability of every source is classified in `upload-execution-manifest.md` §2A** (the exact asset manifest + a pre-upload existence check). Key point for a clean-clone reviewer: `docs/design/merchant-portal/**` currently has **zero tracked files** (this Admin bundle under `docs/design/admin-panel/` IS tracked), so everything under `docs/design/merchant-portal/**` is **owner-local/untracked** and will be ABSENT from a fresh clone and from the D14 worktree; the `docs/superpowers/prototype-references/*.png` (22), the merchant product blueprint under `docs/superpowers/specs/`, and this bundle ARE tracked. The tracked, text-only `merchant-reference-summary.md` deliberately carries the essential merchant context so the reference does not depend on those untracked artifacts.

| Item | Source | Availability |
|---|---|---|
| Admin Panel blueprint (source of truth) | `docs/superpowers/specs/2026-07-01-admin-panel-platform-blueprint.md`, `main` @ `5ff06d8` (PR #345 squash `5ff06d87`) | TRACKED |
| Merchant reference (primary, text-only) | `merchant-reference-summary.md` (this bundle) | TRACKED |
| Merchant screenshots (visual anchors) | `docs/superpowers/prototype-references/merchant-web-*` (22 PNGs) | TRACKED |
| Shared brand + design-system foundations | `docs/design/merchant-portal/design-system/{tokens.css, fonts/, 0*.html}` + `.../upload-bundle/2026-06-10-brand-design-system-foundations-design.md` | OWNER-LOCAL/untracked (essentials duplicated in master §B) |
| Merchant handoff (shell/dashboard screens) | `docs/design/merchant-portal/prototype-handoff/Redeemo-for-Business-Merchant-Portal-handoff.zip` (contains the `.dc.html`) | OWNER-LOCAL/untracked; capture-on-demand; NOT uploaded/committed |
| Process template mirrored | `docs/design/merchant-portal/upload-bundle/{CLAUDE-DESIGN-RUNBOOK.md, 2026-06-17-merchant-portal-claude-design-prompt-pack.md, README.md}` | OWNER-LOCAL/untracked; lookup only |
| Source-capability evidence | `src/api/admin/**`, `src/api/merchant/**`, `prisma/schema.prisma` @ `5ff06d8` (unchanged since the blueprint audit at `37cc0f69`) | TRACKED |

Any decision to bring the owner-local merchant design files (or the handoff) into the repo is a SEPARATE, explicit preservation/commit decision, not part of this bundle. Do not silently commit the handoff, fonts, prototype HTML, or unrelated untracked merchant artifacts.

Note: like the merchant brand spec, internal design specs in this bundle may use long dashes / arrow glyphs in prose; the brand no-em-dash rule applies to customer-facing and operator UI text and seed copy, not to these internal specs.

*Design-preparation bundle only. No Admin Panel code, schema, or build is authorised. The merged blueprint remains the source of truth.*
