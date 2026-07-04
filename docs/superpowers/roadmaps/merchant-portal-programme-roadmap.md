# Merchant Portal - Programme Roadmap (canonical, living)

> **Depth document for the Merchant Portal programme.** For global authority, the fact-type
> authority model, the read-only Codex reconciliation protocol, cross-product invariants, and
> the consolidated owner-decision register, see **`docs/PROJECT-STATE.md`** (that document governs;
> this one provides Merchant-Portal detail and sequencing). These two documents are a **coordinated,
> cross-linked pair** (each links the other): kept as separate PRs only for reviewability, but review,
> approval, and merge are coordinated - they are not independent artefacts to evolve separately.
>
> **Freshness:** verified against `origin/main` @ `434ca4eb` on **2026-06-28** (the merged Insights PR-B).
> Grounded in this session's first-hand programme audit + corrections + the G1a discovery. A modification
> date is never evidence of completeness; every status cites its evidence and is re-verified at each milestone.
>
> **"Merged v1" ≠ complete.** No Merchant surface is yet **authenticated-staging-accepted**. Completion
> requires the Definition of Complete (§9).

---

## 1. Status legend

**MERGED** engineered & on `origin/main` · **NOT-ACCEPTED** merged but no authenticated staging acceptance · **FIDELITY** prototype-fidelity/polish outstanding · **PARTIAL** · **PLACEHOLDER** · **NOT-STARTED** · **DEFERRED** · **OWNER-GATED** · **LEGAL-GATED** · **PROVIDER-GATED** · **CONFLICT** (prototype↔source) · **SUPERSEDED?** (prototype behaviour possibly superseded by a later merged decision - owner to confirm).

Authority for "merged" = `origin/main`/Git/PR; for "deployed" = provider SHA + live probe; for "intended" = owner decision + latest approved spec (a merged-vs-spec mismatch is a recorded implementation/contract conflict).

## 2. Completion map (every module, route, global element, role, lifecycle)

| Surface | Prototype expectation | Source (merged) | Backing contract | Status | Missing / gap | Security / privacy / legal | Staging / test evidence | DoD (see §9) |
|---|---|---|---|---|---|---|---|---|
| **Global shell / layout** | shell wraps every authed page | `components/shell/MerchantPortalShell`, `(app)/layout` (Shell+Validate+Toast) | - | MERGED / NOT-ACCEPTED | - | - | jest layout test (#324 regression) | screen DoD |
| **Sidebar nav** | active-route highlight; lifecycle/capability gating | `Sidebar.tsx`, `navItems.ts`; Insights capability-gated | `/merchant/profile.viewerCapabilities` | PARTIAL | **active-route highlight dead** (no `usePathname`); 5 `#` links; no 72px collapse | - | `sidebar.test.tsx` | screen DoD |
| **Topbar: Validate-a-code** | scan/enter → validate | `Topbar` + `ValidateDialogProvider` (`openValidate`) | `/merchant/redemption/verify` (JWT+DB, #328) | NOT-ACCEPTED | not disabled when suspended; no narrow collapse | code sensitive; authz ok | unit only | screen DoD |
| **Topbar: Quick-Actions / app launcher** | popover incl. **branch-PIN reveal** sub-step | inert `IconButton`, no onClick | PIN reveal: `GET /merchant/branches/:id/pin` exists (guarded) | PLACEHOLDER / OWNER-GATED | popover + PIN-reveal placement | PIN AES-256-GCM; **boundary already exists** (reuse, not greenfield) | none | screen DoD |
| **Account dropdown** | My account / Business profile / Help / identity / **logout confirm** | menu = name + immediate Sign out | session signOut | PARTIAL / CONFLICT | items + identity sub-line + **logout confirm (blueprint §13.4)** | shared-device safety | none | screen DoD |
| **Notifications (bell + `/notifications`)** | bell popover (New/Earlier) + overlay; deep-links | `NotificationBell`, `/notifications` page, `resolveDestination` | `/merchant/notifications/*` | PARTIAL / CONFLICT | resolver maps only `merchant`→`/`; live `redemption`/`voucher` dead-end; popover lacks grouping; full view is a page not overlay | confirm no PII in real payloads (tests mock apiFetch) | unit only | module DoD |
| **View-as role lens (topbar)** | Owner views portal as BM/Staff (`showViewAs`, live/suspended) | absent | - | NOT-STARTED / OWNER-GATED / CONFLICT | whole feature | - | none | owner decision first |
| **Auth + recovery + session** | Register, Verify, Sign-in (OTP), Forgot/Reset, Claim, Invite email | `(auth)/*`, `api/merchant-auth/*`, `lib/auth/*`, `middleware.ts` | `src/api/auth/merchant/*` (Staff/BM **can** authenticate) | MERGED / NOT-ACCEPTED; FIDELITY | split-screen brand, keep-signed-in, OTP masked-email/resend, claim business card | Turnstile; httpOnly BFF; refresh-once | well unit-tested | module DoD |
| **Onboarding (6-step wizard)** | Account (auth prerequisite), then Category, Profile, Branch, Vouchers, Agreement (the 6 StepIds in `lib/onboarding/stepState.ts`; + submit-for-review) | `(app)/onboarding/*`, `lib/onboarding/stepState` | `src/api/merchant/onboarding/*` | MERGED / NOT-ACCEPTED; FIDELITY | confirm modals, custom-amenity pending chips, business-type conditional fields | clickwrap agreement (Owner-only) | unit (#324 was e2e-only) | module DoD |
| **Home - setting-up / changes** | staircase checklist hub + changes banner | `(app)/page.tsx` StaircaseHub | profile/branch/voucher reads | MERGED / NOT-ACCEPTED | - | - | unit | screen DoD |
| **Home - submitted / in-review / suspended / rejected** | read-only status homes | `LifecycleHome` | `deriveStatusPill` | MERGED / NOT-ACCEPTED | - | suspended read-only | unit | screen DoD |
| **Home - live-early vs live-established** | distinct live homes | `live_new` collapsed → `live` (no backend signal) | - | SUPERSEDED? / PARTIAL | live-early distinction | - | unit | owner confirm |
| **Home - Live dashboard** | charts / stat cards / attention / recent-redemptions / live-vouchers | `LifecycleHome` live = "dashboard coming soon" placeholder | rich data diverted to Insights | PLACEHOLDER / OWNER-GATED / CONFLICT | the entire live dashboard | - | unit | owner decision + module DoD |
| **Home - Staff view** | lean validate-first staff home | not built (portal STAFF auth exists; lean home unbuilt) | - | NOT-STARTED / OWNER-GATED / CONFLICT | whole screen | staged identity: portal STAFF = `MerchantAdmin` + `MerchantMembership` role STAFF; mobile branch staff = `BranchUser` (distinct identities, not interchangeable) | none | owner decision |
| **Vouchers (list + 7-type builder)** | list, builder | `(app)/vouchers/page.tsx`, `lib/voucher/*` | `src/api/merchant/voucher/*` | MERGED / NOT-ACCEPTED; FIDELITY | - | concierge `merchantFields` trust boundary | unit | module DoD |
| **Voucher (custom-voucher detail screen)** | per-voucher detail + actions (request change/end/run-again/withdraw) | `(app)/vouchers/[id]/page.tsx` | `/merchant/voucher` | MERGED / NOT-ACCEPTED | the 4 prototype actions request-change / request-to-end / run-again / withdraw are RECORDED schema-gated deferrals (Day-2 spec §3.2/§7), not built; detail ships Edit/Submit/Delete/Duplicate (flagship read-only detail is the separate deferred row below) | concierge trust boundary | unit | screen DoD |
| **Vouchers - flagship "Always live" semantics** | flagship status truthful | all `isRmv` rows labelled "Always live" | `/voucher` flagship query | CONFLICT (known bug) | draft/inactive flagship mislabelled | misleading status | flagged | small fix (owner-gated) |
| **Day-2 Vouchers approval lane** | approve-early / activate-delayed | backend + admin lane merged | Model-1 (`voucher`) | NOT-ACCEPTED | structured concierge windows/cooldown deferred | admin-owned keys stripped | unit + adversarial panels | module DoD |
| **Redemptions log + CSV** | merchant-wide log, filters, CSV, confirm-before-validate, detail drawer | `(app)/redemptions/*` | `src/api/merchant/redemptions/*` | MERGED (backend strong) / NOT-ACCEPTED (UI) | - | IDOR-safe, PII-redacted, no-PIN select; #328 dual-auth | 6 backend suites (**integration not in CI**) | module DoD |
| **Redemption reversal** | reason chips, named permanent record (`rdmReverseOpen`) | not built (deferred) | - | DEFERRED / OWNER-GATED / CONFLICT | whole flow | audit/data-integrity | none | owner decision |
| **Branches (list + detail, PR1-PR8)** | hours / photos / PIN / location / alerts / lifecycle; edit/close/withdraw modals | `(app)/branches/*`, `lib/branches/*`, `components/branches/*` | `src/api/merchant/branch/*` | MERGED / NOT-ACCEPTED | PR-level polish | encrypted PIN never rendered (set/not-set); BM scoped writes | unit + branch integration (**not in CI**) | module DoD |
| **Branch PIN reveal** | reveal on demand | guarded route + on-demand `PinCard` | `GET /merchant/branches/:id/pin` + `assertCanManageBranch` | MERGED / NOT-ACCEPTED | launcher placement | decrypt only on explicit Reveal, never list/mount | `PinCard.test.tsx` + `branch/pin.test.ts` | screen DoD |
| **Staff & access** | memberships, invites, app-users, capabilities | `(app)/staff/*`, `lib/staff/*` | `src/api/merchant/staff/*` + auth/branch-user | MERGED / NOT-ACCEPTED | staging role-matrix acceptance | route-guard matrix; assertNotLastOwner; soft-delete | strong backend tests (**membership integration not in CI**) | module DoD |
| **Insights - operational** | KPIs, trend, Vouchers/Branches/Busy-times/Validation tabs, printable report, Reports card | `(app)/insights/*` (#329-#333) | `src/api/merchant/insights/*` | MERGED / **NOT-ACCEPTED** (auth'd staging acceptance incomplete) | - | aggregate-only; eligibility excludes test/QA/DELETED | strong unit + **11 integration suites NOT in CI** | module DoD |
| **Insights - behavioural (repeat-rate, new-vs-returning) + event CSV** | gated analytics + export | code present, gate default-off, fail-closed | `gate.ts` `behaviouralGateOpen()` | **LEGAL-GATED** | nothing ships until gate opens | **D1 + D5; LIA; disclosure** | gate-enforcement suites **not in CI** | gated - see §11 |
| **Insights - demographics (age/gender/location)** | PR-C demographic slice | unimplemented (deliberately absent) | - | **LEGAL-GATED + NOT-STARTED** | entire slice | **D2 DPIA + D3 retention + D4 artefacts + suppression** | n/a | gated - see §11 |
| **Business Profile (day-2 settings)** | live edit of public profile + business/legal (identity propose-change lane; re-accept agreement) | nav `#`, no route | `src/api/merchant/profile/*` (backend exists) | NOT-STARTED | whole settings surface | governed edit (admin review lane exists) | none | module DoD |
| **My Account (personal)** | change email/phone/password (logged-in), sign-out-all, personal | nav `#`, no route | partial backend | NOT-STARTED | whole surface | logged-in password change + session revoke | none | module DoD |
| **Help & Support** | help/contact/tickets + sent-confirmation + print | nav `#`, no route | none | NOT-STARTED | whole module | - | none | brainstorm-first |
| **Promote** | campaigns / featured placement | nav `#` "soon" | none | NOT-STARTED / PROVIDER-GATED | whole module | billing implications | none | provider decision |
| **Payments & Billing** | subscriptions / invoices | nav `#` "soon" | none | NOT-STARTED / PROVIDER-GATED | whole module | payment/PCI + provider | none | provider decision |
| **Generic "coming soon" module shell** | reusable under-construction shell | dead `#` links | - | CONFLICT | honest placeholder route | advertises dead destinations | none | shell wave |
| **/foundations (dev design-system gallery)** | not a prototype screen | `(app)/foundations/page.tsx` (noindex M0 component gallery across the 7 lifecycle + 7 voucher-type states) | - | MERGED / internal | dev showcase only; **scoped out of product DoD** | none | jest (M0) | n/a (dev-only) |

**Backend-only capabilities (no dedicated UI, load-bearing):** authz spine `resolveMerchantContext` + `assertOwner/assertCanManageVouchers/assertBranchAllowed/assertCanManageBranch/assertInsightsAccess`; encryption (PIN); audit log; notification producers; upload/R2; location lookup. A change to any of these triggers the security test lane (§8).

## 3. Prototype cross-check (27 named screens + non-route interactions)

**27 screens** (from the prototype HTML inside the handoff ZIP `docs/design/merchant-portal/prototype-handoff/Redeemo-for-Business-Merchant-Portal-handoff.zip`, inner path `redeemo-for-business-merchant-portal/project/Redeemo for Business.dc.html`): Registration, Verify contact, Sign agreement, Add branch, Business profile (onboarding), Choose category, All notifications, Home/Setting-up, Home/In-review, Home/Staff-view, Home/Live-dashboard, Vouchers, Voucher, Redemptions, Branches, Branch page, Staff and access, Business profile (settings), My account, Insights & reports, {{generic module shell}}, Promote, Payments & billing, Help & support, Sign in, Invite email, Voucher builder. Status per §2.

**Non-route interactions (modals / dropdowns / popovers / global):** account dropdown; Quick-Actions launcher (+ branch-PIN-reveal sub-step); notifications bell popover + All-notifications overlay; Validate-a-code modal; **Reverse-redemption modal**; **View-as role lens**; onboarding submit-for-review modal + branch-confirm modal + full-agreement modal; voucher request-change / request-end / run-again / withdraw modals (built); branch edit (review/instant/hours/identity variants) / close-request / withdraw modals (built); My-account change email/phone/password + sign-out-all modals (not-started); Business-profile identity-edit + re-accept-agreement (not-started); Help request-sent + print view (not-started); logout-confirm modal (missing in source).

## 4. Prototype conflicts + authority resolution

| Conflict | Prototype | Source | Governing authority |
|---|---|---|---|
| Home Live dashboard placement | rich dashboard on Home | diverted to Insights; Home placeholder | **owner product decision** (prototype = visual authority; later Insights spec may intentionally supersede) |
| Staff Home | lean staff home | no portal staff home (staff can auth) | **owner** (staged-identity model may make it superseded) |
| View-as role lens | present | absent | **owner** (build or drop) |
| Redemption reversal | reverse modal | deferred | **owner** (audit/data implications) |
| Full notifications view | centred overlay modal | in-shell page (a code comment frames it intentional) | **UNRESOLVED prototype/source divergence - owner decision required** (not an accepted divergence until the owner confirms the page-vs-overlay choice) |
| Account dropdown depth + logout confirm | rich menu + logout confirm | name + instant sign-out | **blueprint §13.4 governs** (build the confirm) |
| live-early vs established | distinct homes | collapsed | **owner confirm** (no backend signal) |

## 5. Dependency map

- **Authz spine** underlies Branches/Staff/Redemptions/Insights/Vouchers; any change → security test lane (§8).
- **Quality net** (CI integration gate + deterministic browser smoke) precedes trustworthy **staging acceptance** + remediation.
- **Global-shell shared files** (`Sidebar`, `Topbar`, `MerchantPortalShell`, `navItems`, `resolveDestination`) → consolidate shell work into one wave to avoid repeatedly reopening them.
- **Destination-before-link:** a real route (or an explicitly approved honest placeholder) for Business-profile settings, My Account, and Help must exist **before** the account-dropdown / nav destination is made clickable. The global shell may establish IA + styling first, but destinations must not pretend to work - do **not** add new dead links.
- **Insights gate-open** (D5←D1); demographics (D2-D4) → independent **legal track**, parallel.
- **Home Live dashboard** → owner decision + possible backend Home-analytics contract.
- **Promote/Payments** → provider/billing decision (+ PCI) → last.
- **Staging acceptance** → browser-smoke harness + safe staging accounts (owner) + (optional) provisioned domains.
- **53 seed-dependent integration suites** → seeded disposable-DB strategy.

## 6. Approved sequencing - Option C (two-track foundation → vertical slices → not-started surfaces → commercial)

**Track 1 (sequential foundation):** G1a quality pilot → global-shell consolidation (one wave) → deterministic browser smoke + authenticated staging-acceptance harness.
**Track 2 (parallel, owner/legal):** Insights D1-D6 legal track; Promote/Payments provider decisions.
**Then:** thin per-surface "fidelity + acceptance + tests" slices over the merged v1 modules (Vouchers, Redemptions, Branches, Staff, operational Insights) - small, reviewable, riding the net + consolidated shell.
**Then:** build the not-started surfaces, each gated on its decision - Business-profile settings, My Account, Home Live dashboard, Staff Home.
**Help & Support:** gated on a **support-operating-model decision** (how support is staffed/triaged), NOT on billing/PCI/provider; sequence it once that decision lands (it is not coupled to the commercial track).
**Last (commercial / provider-gated):** Promote and Payments & Billing (provider + billing/PCI decision).

Parallel: Track 1 ∥ Track 2 ∥ provider decisions. Sequential: quality net → trustworthy acceptance → remediation; owner decisions → their builds. This minimizes shared-file churn (shell once), keeps PRs small (thin slices), and prevents drift (DoD + acceptance + decision gates).

## 7. Sequencing + quality detail (pointers)

Sequencing is in §6 (Option-C waves/tracks); the quality foundation (G1a findings + planned slices + path-trigger map + CI tiers + retry/loopback rules) is in §8; the Definition of Complete is in §9.

## 8. G1a - quality foundation (exact findings + planned slices)

**Test inventory (verified):** merchant-web jest 135 files (CI-required); backend `test:unit` 195 suites (CI-required); **backend `integration` project = 108 suites, NOT in CI**; **0 e2e/browser tests**. Local DB tooling: keg PG16 16.14 + loopback-guarded `testDb.ts` (`LOOPBACK_HOSTS = 127.0.0.1/localhost/::1/[::1]`, throws before connect) + `TEST_DATABASE_URL`.

**108-suite safety classification (sums to 108):** by connection source - **11 harness** (`makeTestPrisma`, loopback-guarded; all `insights/*` incl. the `_helpers/testDb.smoke` self-test), **89 raw-`DATABASE_URL`**, **8 fully-mocked/DB-absent** (mislabelled `.integration` → move to `unit`). By readiness - **19 safe as-is** (11 harness + 8 mocked), **36 raw conditionally-safe** with a `DATABASE_URL` override to an empty migrated disposable DB, **53 need a seeded DB or other remediation**. By criticality - 39 security, 51 release, 18 standard. **Hazard:** 89 raw suites would mutate shared Neon if run locally without an override (`.env DATABASE_URL` = Neon; `tests/setup.ts` does not guard it).

**Measured (disposable loopback DB, once each):** cold PG bring-up 1.43 s; full migrate-deploy of all **52 migrations** 2.21 s; vitest floor 0.39 s; single suite 0.50 s; 3-suite security subset (behavioural+export+cross-tenant, 24 tests) 2.52 s; **all 11 Insights suites (119 tests) 12.51 s**. Disposable DB torn down + verified not listening; keg retained; `.env` untouched.

**Planned quality slices (PR order; refine only on source evidence):**
- **PR-G1a1** - CI Postgres service container + a **project-global strict-loopback guard** (generalize the harness `LOOPBACK_HOSTS`; fail before Prisma connects; never fall back to repo `DATABASE_URL`/Neon) + move the 8 mocked suites to `unit` + run the 11 harness suites as a **pilot ADVISORY lane (not required yet)**. The CI Postgres service, the global loopback guard, and any promotion to a required check are **owner-approved AFTER evidence + review** - this PR does not pre-authorize infrastructure or branch-protection changes.
- **PR-G1a2** - path-trigger map (below) + migrate proven-safe self-seeding security suites (`suspend-sec-m2`, `membership`, admin authz, redemption) onto the guard + override; promote the security lane to required.
- **PR-G1b** - deterministic **local** Playwright smoke (adds `@playwright/test` - owner approval) against a locally-built merchant-web with a controlled API/session mock boundary; the smallest journeys that would have caught #324 (real `(app)` layout mounts → toast-using route, no uncaught exception) and #327 (mock API returns wire-accurate `Decimal`-as-string → page renders parsed, not error). **Not** external Vercel/Railway.
- **PR-G1c** - authenticated staging acceptance docs/tooling (manual/scheduled against the existing Vercel/Railway staging; needs safe accounts). Never a required per-PR gate.

**Path-trigger map (security lane triggered ONLY by these mapped backend/shared/Prisma/auth/gate paths; unrelated frontend-only and docs-only PRs get the SAME stable check name with a successful "skipped, no relevant paths" result):** `src/api/auth/**`, `src/api/merchant/shared.ts`, `src/api/merchant/insights/{gate,scope,eligibility}.ts`, `src/api/shared/{encryption,audit,errors,merchantMembership}.ts`, `prisma/schema.prisma` + `prisma/migrations/**` + `prisma.config.ts`, `src/api/redemption/**` + `src/api/merchant/redemptions/**`, `tests/setup.ts` + `vitest.config.ts` + the loopback-guard setup. Skip-but-report under a stable check name (success "skipped - no security-relevant paths"), never GitHub native `paths:` (which leaves a required check pending). Periodic full run (nightly + pre-release) ignores the path map to detect path-map mistakes.

**CI tiers:** T0 fast per-app (path-filtered) + backend tsc/`test:unit` (~3-6 min, required); **T0-SEC** security integration (path-triggered; **pilot/advisory first, owner-approved promotion to required**; CI Postgres + global guard; <1 min); T1 changed-module integration; **T2 deterministic browser smoke** (~2-5 min; **pilot/advisory first, owner-approved promotion to required**); **T3 nightly/full integration** (advisory now → **required for release**, amendment 4); **release-readiness gate** (clean full integration + smoke + builds).

**Retry rule:** assertion / authorization / tenant-isolation / privacy-legal-gate / deterministic-app failures are **never** auto-retried; **one** retry only for a clearly-identified Postgres/container startup or health-check infra failure; the original infra failure stays visible in job output.

## 9. Definition of Complete

- **Screen complete:** implemented to the merged spec; prototype-faithful OR the divergence is owner-approved + recorded (§4); all states (loading/empty/error/denial/offline/lifecycle) handled; responsive at the agreed breakpoints; a11y basics (roles/labels/focus/keyboard); authz correct for Owner/BM/Staff; unit/component tests + a browser-smoke touch where it renders a wire-accurate contract; **staging-accepted** for the relevant roles/states.
- **Module complete:** every screen + modal + role view + lifecycle state complete; backend contract + authz + privacy invariants test-pinned (CI-gated for security-critical); deferrals listed with triggers; staging-accepted end-to-end.
- **Milestone complete:** all in-scope modules complete; cross-module shell interactions verified; the wave's owner decisions closed; this roadmap + `PROJECT-STATE.md` updated.
- **Whole portal complete:** all prototype screens built or owner-dropped-as-superseded; Insights gates resolved or formally held; commercial modules built or provider-deferred; full integration regression required + green; browser smoke required; authenticated staging acceptance passed for all roles/lifecycles; custom domains provisioned; legal/privacy sign-off where required; no undocumented deferral.

## 10. Owner decisions (Merchant-specific)

See `PROJECT-STATE.md` §6 for the consolidated register. Merchant-specific: Home Live dashboard (Home vs Insights); Staff Home (build/drop); View-as lens (build/drop); Redemption reversal (build/defer); Quick-Actions launcher + PIN placement; flagship "Always live" fix; Business-profile-settings + My-Account next-build confirmation; Promote/Payments provider+billing; resolve the open divergences (notifications page-vs-overlay; `live_new` collapse). Plus the G1 platform decisions (CI Postgres + guard; `@playwright/test`; seed strategy) and the Insights legal gates (D1-D6).

## 11. Legal / provider gates

- **Insights behavioural + event CSV:** D1 (lawful basis + LIA + disclosure) → D5 (gate-open record). Gate is default-off, fail-closed; do **not** open without the recorded owner/legal artefacts.
- **Insights demographics:** D2 (DPIA + identifiability) + D3 (retention/erasure) + D4 (external-artefact register) + suppression/differencing tests. PR-C non-executable until all clear.
- **Busy-times exact counts:** D6 (intensity-only ships now).
- **Promote / Payments:** provider + billing/PCI decision before any build.
- Governance pack: `docs/superpowers/governance/2026-06-27-insights-dpia/`.

## 12. Governing-document links

Specs/plans (per module): `docs/superpowers/specs/` + `docs/superpowers/plans/` - merchant-web scaffold (M0), M1 auth, M2 onboarding (+voucher-builder extraction), M3 redemptions, M4 notifications, Day-2 vouchers, Staff & Access, Branches programme (PR1-PR8 + mini-specs), Insights & Reports (umbrella + plan). Audits: `docs/superpowers/audits/`. Governance: `docs/superpowers/governance/2026-06-27-insights-dpia/`. Runbooks: `docs/runbooks/` (deploy-security, staging, insights-test-db, insights-demo-fixture). Product blueprint + prototype: `docs/design/merchant-portal/` (design system + the handoff ZIP `prototype-handoff/Redeemo-for-Business-Merchant-Portal-handoff.zip`, inner `project/Redeemo for Business.dc.html`); screenshots `docs/superpowers/prototype-references/merchant-web-{branches,insights-reports}/`. Global state + authority: `docs/PROJECT-STATE.md`. Codex checklists (read-only): see `PROJECT-STATE.md` §2.

---

## Change log

- **2026-06-28** - Roadmap created (docs-only PR). Captures the full Merchant Portal completion map, the 27-screen + non-route prototype cross-check, prototype conflicts + authority resolution, the dependency map, the approved Option-C sequencing, the G1a quality findings + planned slices + path-trigger map + CI tiers + retry/loopback rules, the Definition of Complete, owner decisions, and legal/provider gates. Verified against `origin/main` @ `434ca4eb`. Preserves the three corrections (Staff/BM portal auth exists; Branch PIN reveal already guarded; the three Vercel apps already deployed).
