# Admin Panel prototype reference captures

Full-page captures of the Claude Design Admin Panel prototype (project
`claude.ai/design/p/eae5f333-5c1a-4868-9c5c-cdcdadead6fb`), taken by the owner on
2026-07-09 and copied here as build-fidelity references. Partial coverage only:
these show two to three modules, not the full designed surface (CP-0 + Wave 1 +
Wave 2 are owner-locked; see `docs/design/admin-panel/prototype-execution-log.md`
and `docs/superpowers/specs/2026-07-01-admin-panel-platform-blueprint.md`).

All data shown is synthetic (prototype rule; "Admin v0 (CP-0) · synthetic data"
footer). Numbers, merchants, and people in these captures are NOT real platform
data and must never be treated as operational evidence.

| File | Module / screen | Notes |
|---|---|---|
| `01-ops-home-operations-role.png` | Ops Home (Wave 1 Screen 1.2), Operations role | Full 9-group nav incl. Members and Revenue; work summary, needs-attention, subscription snapshot, DPIA-gated platform analytics shown gated |
| `02-merchant-directory-table.png` | Merchant Directory (Wave 1 Screen 1.5), Table view | Supply-window stat cards, filters, lifecycle/verification pills, per-row actions |
| `03-merchant-directory-supply-map.png` | Merchant Directory, Map view | Net-new supply map surface |
| `04-merchant-directory-group-by-region.png` | Merchant Directory, Group-by (Region) view | Region groups with per-group counts; Category group-by toggle |
| `05-leads-and-onboarding-pipeline.png` | Leads and Onboarding (Wave 1 Screen 1.7 hub + Wave 2 2.11 prospect pipeline) | Inbound pointer, create-draft vs assisted onboarding, in-progress resumes, net-new lead kanban (lead model is net-new; no lead table exists in code) |

## Module screenshot sets (added 2026-07-10, owner-provided)

Owner-captured screenshots of the LOCKED prototype modules, organised per module for the
merchant-recruitment build (owner direction 2026-07-10: build these modules onto the existing
admin-web, Merchant 360 first). Same rules as above: partial coverage, synthetic data only,
never operational evidence. Numbering is capture-time order.

| Folder | Count | Module |
|---|---|---|
| `merchant-360/` | 23 | Merchant 360 workspace (Wave 1 Screen 1.6; 13-tab design) |
| `approval-queue/` | 10 | Approval Queue + per-type review treatments (Wave 1 Screens 1.3/1.4) |
| `leads-and-onboarding/` | 23 | Leads & Onboarding hub + prospect pipeline + assisted onboarding (Screens 1.7/2.11) |

The full interactive prototype source is the Claude Design handoff bundle at
`docs/design/admin-panel/prototype-handoff/Redeemo-Admin-Panel-handoff.zip`
(contains `Redeemo Admin - Foundation.dc.html` + design-system tokens + its own screenshots;
read its README first). The prototype-execution-log (committed) records the decision register
D1-D67 governing these screens.
