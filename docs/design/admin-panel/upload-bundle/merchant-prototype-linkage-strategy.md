# Merchant Portal prototype: linkage / reference strategy for the Admin Panel

The owner's clarification: Claude Design already built the "Redeemo for Business" Merchant Portal prototype, so it holds valuable context about Redeemo's brand, merchant workflows, terminology, modules, interactions and visual language. The Admin Panel should reference or link to that context where Claude Design supports it. This document establishes what Claude Design actually supports (no assumptions) and recommends the safest mechanism.

## 1. What Claude Design / DesignSync actually supports (verified from the tool capability, not assumed)

The DesignSync tool (the repo-side bridge to claude.ai/design) operates on a SINGLE claude.ai **design-system project** at a time. Its methods are: `list_projects`, `get_project`, `list_files`, `get_file` (read); `create_project`; `finalize_plan` then `write_files` / `delete_files` (write, incremental, one component at a time, never wholesale). It reads/writes files WITHIN one project.

**Finding: there is no cross-project "link" feature.** DesignSync cannot reference or link one Claude Design project from another. The Merchant Portal prototype is a regular Claude Design project (its clickable `.dc.html` prototype), created in the browser prompt-only; only its derived design-system component library is round-trippable via DesignSync. So "reference the merchant prototype" cannot be a tool-level link; it must be done by **providing context to the Admin session**.

(We inspected the DesignSync capability only. We did NOT call any DesignSync method, to avoid an authorization prompt or any change, per the closed scope. Reading the live project would also require the owner's interactive design authorization, which this non-interactive session cannot perform.)

## 2. The supported ways to carry the merchant context (and their trade-offs)

| Mechanism | Supported? | Use it for | Cost / risk |
|---|---|---|---|
| **Same claude.ai account / adjacent project, in-prompt reference** | Browser-side only (not a tool feature) | Telling Claude Design "this is the operator side of the same platform whose Redeemo for Business portal you built" | Do NOT assume it auto-carries the prior project's context; treat it as a hint, always pair it with the reference pack |
| **Curated Merchant-prototype reference pack (RECOMMENDED PRIMARY)** | Yes (upload as context) | Brand + terminology + shell/interaction continuity, concisely | Low; a few pages + a handful of screenshots |
| **Shared design-system foundations (tokens.css + two fonts + brand spec)** | Yes (upload as context) | Exact brand: palette, type, spacing, radii, shadows | Low; these are the same across products |
| **Selected merchant screenshots / HTML fragments** | Yes (attach) | A few key visuals; the design-system HTML pages render shell/components/voucher-card/status-pills directly | Attach a handful of PNGs (or the 3 design-system HTML pages); do NOT attach the full 1.48 MB `.dc.html` |
| **DesignSync read of the merchant design-system project** | Yes, but interactive-auth + owner-run | Pulling the finalized component library to reuse | Requires the owner to authorize design access and run it; PRESERVE/reuse, not "linking" |
| **Attach the whole merchant handoff bundle / full prototype** | Possible | (not recommended) | High token cost; it is the merchant prototype, not the admin IA; risks the Admin becoming a merchant copy |

**Availability caveat.** The tokens/fonts/design-system pages and the handoff are all **OWNER-LOCAL** (untracked; see the exact asset manifest + pre-upload existence check in `upload-execution-manifest.md` §2A). Only `merchant-reference-summary.md` and the 22 `docs/superpowers/prototype-references/*.png` are TRACKED and guaranteed present in any clone. Run the existence check before relying on any owner-local file; if one is missing, fall back to the tracked summary + master-context §B brand.

## 3. Recommendation

**Primary mechanism:** a concise **Merchant-prototype reference pack** uploaded into the Admin session. Each item is tagged by availability: **TRACKED** (in any clone) / **OWNER-LOCAL** (only in the owner's checkout; ABSENT from a clean clone and the D14 worktree) / **CAPTURE** (screenshot on demand). The exact per-asset list + a pre-upload existence check are in `upload-execution-manifest.md` §2A. The pack:
1. **`merchant-reference-summary.md`** (**TRACKED**, this bundle) as the PRIMARY reference: merchant nav + modules, onboarding/approval journey, merchant/branch/voucher/redemption terminology, lifecycle/status vocabulary, voucher-card + status-pill language, shared shell/component patterns, and what the Admin Panel must NOT copy. Because it is tracked and text-only, it works even in a clean clone with none of the raw merchant artifacts present.
2. the shared **design-system foundations** (`docs/design/merchant-portal/design-system/tokens.css` + the two fonts + `.../upload-bundle/2026-06-10-brand-design-system-foundations-design.md`) as the exact brand source: **OWNER-LOCAL/untracked**, attach from the owner's checkout if present. NOT required for the pass: the exact hexes + font names + 60-30-10 + no-emoji/no-em-dash are already pasted verbatim in master-context §B.
3. the three **design-system reference pages** `.../design-system/{01-foundations.html, 02-components.html, 03-voucher-blocks.html}`: **OWNER-LOCAL/untracked**; the strongest visual anchor when present (they render the palette, components, status-pill language and voucher-card directly). Attach from the owner's checkout if present.
4. **a few real merchant screenshots as visual anchors:** **TRACKED** git PNGs under `docs/superpowers/prototype-references/merchant-web-branches/` (branch overview, branch detail, edit modal) and `.../merchant-web-insights-reports/` (dashboard/reports, demographics-preview, validation-breakdown); the selected six are named in the asset manifest. Honesty note: there is NO ready curated PNG of the shell / LIVE dashboard / onboarding-checklist; those live inside the **OWNER-LOCAL** `Redeemo for Business.dc.html` in the handoff zip. If one is wanted as an anchor, open the `.dc.html` and capture it (**CAPTURE**-on-demand); do not assume a pre-cropped PNG exists, and do not upload the `.dc.html` or the whole handoff.

**Plus** the in-prompt instruction (already in the master context) that the Admin Panel is the OPERATOR side of the same platform. **Optionally** run the Admin session in the same claude.ai/design account for browser-side continuity, but do not rely on it.

**Do NOT** upload the full `.dc.html`, the whole handoff zip, or the merchant product blueprint as the primary driver: it is token-heavy and it risks turning the Admin Panel into an enlarged Merchant Portal. Use the merchant blueprint only as a lookup if a specific merchant behaviour needs confirming.

## 4. What to keep CONSISTENT with the merchant prototype
- Brand: exact palette (Rose / brand red `#E20C04`, coral `#E84A00`, navy `#010C35`, cream `#FFF9F5`; "Rose" is the merchant portal's name for the brand red, reused for continuity), the two fonts (Mustica Pro + Lato), 60-30-10, no-emoji/no-em-dash, British English.
- Shell chrome: grouped left sidebar, top bar with bell + avatar/identity, status-pill language (never colour-alone; reuse the merchant `deriveStatusPill` label set + tones so the same lifecycle state reads identically on both sides), the voucher-card visual, the gated/"coming soon" pattern.
- Terminology and cross-product state: merchant/branch/voucher/redemption/staff/onboarding/notification/Insights, and the exact lifecycle + approval + branch-triple-axis + location-confidence vocabulary. The operator must see the SAME states the merchant sees.

## 5. What must intentionally DIFFER (so the Admin Panel is not a merchant copy)
- **Density and register:** dense data tables + split-panes, not big generous marketing cards; Mustica for one dominant element per screen; tighter spacing; one glow action per view.
- **Persona and IA:** a trained operator, a platform-level admin information architecture (Operations / Relationships / Trust and Safety / Support / Growth / Content / Insights / Platform), a role-aware Ops Home, NOT the merchant's day-2 dashboard IA.
- **Authority and act-on-behalf:** the six-level authority model, "act FOR not AS", reason + audit on every on-behalf action, the approval/review lanes, and the governance surfaces (Global Audit, Admin Users, Operational Status) that have no merchant analogue.
- **Privacy discipline:** Customer 360 PII gating + reveal-on-demand + audit, no customer-home mapping, DPIA-gated analytics, redemption PIN never shown, no individual identity in aggregates. The merchant portal never handles cross-merchant customer PII; the Admin Panel must, carefully.

## 6. Token efficiency
- Provide the reference pack once (a few pages + a few screenshots), not the whole prototype.
- Establish the shared design system + shell FIRST in the Admin session; each later wave references "the shell, tables, status pills and review pattern you built in Wave 1", it does not re-establish or re-paste them.
- Keep each wave pack short and screen-focused; the shared master context is pasted once and inherited.
