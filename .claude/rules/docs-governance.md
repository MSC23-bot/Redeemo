---
paths:
  - "docs/**"
---

# Documentation governance rules

- `docs/PROJECT-STATE.md` is the authoritative status/decision/warning/deferral document.
  Update it per its own §9 protocol: claim-level (cite the SHA/PR/spec/decision, never a
  date alone), flip the affected status on merge, add a dated change-log line. It and the
  Merchant Portal roadmap are a coordinated pair: review related changes together.
- `docs/deferrals/open-register.md` is the LIVE register of open deferred follow-ups.
  When a deferral opens or closes, update it (and PROJECT-STATE §8 if the item is listed
  there) in the same PR. The 704 KB private-memory deferred archive is historical; do not
  route live status into it.
- Tier 2/3 work requires a plan (and for Tier 3 a spec) in
  `docs/superpowers/plans|specs/YYYY-MM-DD-<topic>.md` BEFORE implementation. Record
  as-shipped addenda in the same doc after merge.
- Customer-flow behaviour changes require a version bump in `docs/customer-flow-current.md`
  and a dated entry in `docs/customer-flow-changelog.md` in the same PR.
- `docs/history/` is an append-only archive: never edit archived content, only add new
  archive files with provenance headers.
- `docs/product-decisions.md` is a superseded historical ledger: mark entries superseded,
  never delete; new decisions go to PROJECT-STATE §6.
- The Codex-owned workflow checklists under `~/Documents/Playground/redeemo-notes/`
  (four as of 2026-07-06; the authoritative list is PROJECT-STATE §2 and the set may grow)
  are READ-ONLY for Claude (also enforced by a hook): read for evidence, never write, and
  record any reconciliation in PROJECT-STATE §10.
- Runbooks carry status headers (DRAFT / SUPERSEDED / preparation-only): check the header
  before following one, and set an honest header on any new runbook.
