# Redeemo · Project Instructions for Claude

Durable instructions only. Current status lives in `docs/PROJECT-STATE.md` (see §2).
Path-specific guidance lives in `.claude/rules/`. Build history: `docs/history/`.

## 1. What Redeemo is

UK-based, location-first digital marketplace connecting consumers with local businesses
through exclusive digital vouchers. Consumers pay a subscription to unlock redemption.
Merchants join free, pay for featured placement and campaigns. Multi-sided marketplace,
not a basic coupon app.

## 2. Where to look first (authority routing)

- **Current status, programme sequence, open owner decisions, warnings, deferrals:**
  `docs/PROJECT-STATE.md` is authoritative. Read its §1 authority model and the §4 section
  for your programme before starting work. Never infer current status from this file.
- **Merchant Portal detail:** `docs/superpowers/roadmaps/merchant-portal-programme-roadmap.md`
  (coordinated pair with PROJECT-STATE).
- **Open deferred follow-ups:** `docs/deferrals/open-register.md` (live register).
- **Customer flow contract:** `docs/customer-flow-current.md` + `docs/customer-flow-changelog.md`.
- **Intended behaviour:** owner decisions, then the latest approved spec/plan in
  `docs/superpowers/{specs,plans}/`. Shipped code that diverges from an approved spec is a
  contract conflict to record, not the new truth.
- **Private auto-memory** (MEMORY.md + topic files) is discovery/routing aid only; it never
  overrides merged source, PROJECT-STATE, or owner decisions.
- **Codex-owned checklists** under `~/Documents/Playground/redeemo-notes/` are READ-ONLY
  evidence. Never edit, append to, rename, or delete them.

## 3. Product surfaces

| Surface | App | Notes |
|---|---|---|
| Customer App | `apps/customer-app` (Expo/React Native) | discovery, vouchers, redemption |
| Customer Website | `apps/customer-web` (Next.js) | no redemption (mobile only) |
| Merchant Web Portal | `apps/merchant-web` (Next.js) | management, staff, insights |
| Merchant Mobile App | (not started) | branch staff scan/validate |
| Admin Panel | `apps/admin-web` (Next.js) | approvals, ops console |

## 4. Tech stack essentials

Backend: Node 24 + TypeScript + Fastify · PostgreSQL 16 on Neon · Prisma 7 · Redis ·
Stripe · Twilio · FCM · Resend (wired, dark by default) · R2 storage (feature-flagged).
Web apps: Next.js 15 (TypeScript). Mobile: Expo SDK 54 + expo-router.

**Node version policy (do not conflate):**
- Backend / repo root / Railway / CI: Node 24 (root `.nvmrc`).
- Customer app toolchain: Node 20.19.4 (`apps/customer-app/.nvmrc`); jest-expo hangs on
  Node 24. Do not bump without re-verifying jest-expo.

**Prisma 7 specifics:** datasource URL in `prisma.config.ts` (not schema.prisma); generated
client at `generated/prisma/client`; import `{ PrismaClient } from '../generated/prisma/client'`;
requires `@prisma/adapter-pg` + `pg`; seed configured in `prisma.config.ts` under `migrations.seed`.

## 5. Database and dev credentials

Schema: `prisma/schema.prisma` · migrations: `prisma/migrations/` · seed: `npx prisma db seed`.
`DATABASE_URL` in `.env` points at shared Neon; never commit it.

Dev seed logins (non-production; deliberately committed):

| Role | Email | Password |
|---|---|---|
| Admin | admin@redeemo.com | Admin1234! |
| Customer | customer@redeemo.com | Customer1234! |
| Merchant Admin | merchant@redeemo.test | Merchant1234! |
| Branch Staff | staff@redeemo.com | Staff1234! |

## 6. Key business rules (preserve in all code)

1. Subscription gates redemption; free tier browses only.
2. Monthly voucher cycle is subscription-anchored, not calendar-based:
   `getCurrentCycleWindow(cycleAnchorDate, now)` in `src/api/subscription/cycle.ts` is the
   single source of truth; independent of billing interval and payment source; day-clamped.
3. A voucher is redeemable once per user per cycle across ALL branches.
4. Redemption flow: redeem creates `VoucherRedemption` with a persistent `redemptionCode`
   (8 chars, A-Z + 0-9 minus O/I, shown 4+4); merchant validates in-store; code lasts the cycle.
5. In-store validation only (QR scan, manual entry, or merchant Quick Validate); never self-serve.
6. Two mandatory vouchers per merchant (RMV-001/002) before approval; merchant cannot edit
   or delete them. Custom vouchers: RCV-XXX.
7. Merchant approval gated on: mandatory fields + docs + 2 RMV vouchers + main branch + branch user.
8. Merchant suspension is immediate; all vouchers deactivate; history preserved.
9. 12-month merchant contract, signed digitally during onboarding.
10. Trending = merchants with redemptions this month within admin-configured radius.
11. Featured = paid placement, admin-set duration and radius.
12. The website never supports redemption (fraud prevention; mobile only).
13. One unified merchant account: web portal manages, mobile app validates, same credentials.

Subscription pricing: Free £0 · Monthly £6.99 · Annual £69.99 (~2 months free). Cancel anytime,
access to period end. Free trials via promo codes only. Stripe for standard billing;
`stripeSubscriptionId`/`stripeCustomerId` are nullable (IAP/admin-grant ready).
Voucher types: BOGO, Spend & Save, Discount (£ or %), Freebie, Package Deal, Time-Limited, Reusable.

## 7. Workflow tiers (classify BEFORE implementing; state the tier in your first reply)

- **Tier 0** tiny fix: no plan doc.
- **Tier 1** small bounded change in one surface: no plan doc; PR must explain scope/risk/tests.
- **Tier 2** surface rebaseline / multi-file work: written plan in `docs/superpowers/plans/`
  FIRST; owner decisions surfaced before implementation; pause at milestones; amend the plan
  on gaps (never hack around); update behaviour docs in the same PR.
- **Tier 3** new architecture / backend contract / schema change: full flow
  brainstorm → spec → plan → implement → review → lock.
- Rebaselines are Tier 2 by default. If the tier is unclear, PAUSE and ask the owner.

## 8. Git safety (enforced by `.claude/hooks/pre-bash/01-git-safety.sh`)

Blocked: broad `git add` (use explicit paths) · push to main (use PRs) · `--force` without
lease · `git reset --hard` / `git clean` / dirty-tree `checkout|restore -- <paths>` without
their `REDEEMO_CONFIRM_*` env override · `gh pr merge` without
`REDEEMO_PR_SCOPE_VERIFIED=<current-head-SHA>`.
Before merging any PR, verify GitHub's live `compare` diff (commit count + files) against
expectation; PR-level cached fields go stale.

Hard rules (from the 2026-04-26 v7 UI-loss incident; apply to humans too):
1. Before ANY destructive command, run `git status --short` in the TARGET tree and classify
   every entry as intended-to-discard or preserved.
2. Compaction summaries are hypotheses about the conversation, not facts about the repo;
   verify with `git log --all -- <path>`.
3. Worktree state is per-worktree; check the right tree.
4. Work is "done" only when committed or in a PR, never when only on disk.

## 9. Style and copy locks (all output: UI, docs, PRs, marketing, chat)

- No emojis in product UI; use SVG icons.
- No em-dashes; use `:` `;` `()` `·` or a period instead.
- Real brand colours only, via tokens: red `#E20C04`, coral `#E84A00`, navy `#010C35`,
  cream `#FFF9F5`.
- Owner-locked framing: NEVER describe iOS screenshot handling as "prevention" in any spec,
  plan, PR, marketing, or in-app copy. iOS screenshots are detect-and-react only; iOS screen
  RECORDING is prevented (system blur); Android FLAG_SECURE blocks both.

## 10. Running locally

| App | Command | Port |
|---|---|---|
| Backend API | `npm run dev` (repo root) | 3000 |
| Customer web | `npm run dev` in `apps/customer-web` | 3001 |
| Admin panel | `npm run dev` in `apps/admin-web` | 3002 |
| Merchant portal | `npm run dev` in `apps/merchant-web` | 3003 |

Customer app: `npx expo start` in `apps/customer-app` (run `fnm use` there first: Node 20.19.4).

## 11. Running tests

- Backend unit (safe; what CI runs): `npm run test:unit`. Plain `npx vitest run` includes
  integration suites: most of those MUTATE the shared Neon database unless `DATABASE_URL`
  is overridden to a disposable DB. Do not run them casually.
- Customer app: `cd .worktrees/customer-app/apps/customer-app && npx jest --forceExit`
  (Node 20.19.4 via `fnm use`).
- merchant-web / admin-web: `npx jest` in the app dir. Merchant browser-smoke lane:
  `npx playwright test` in `apps/merchant-web` (deterministic local lane; advisory in CI).

## 12. Worktree CLAUDE.md rule

Root `CLAUDE.md` is the single source. Manual worktrees under `.worktrees/` must symlink it,
never copy: `rm -f .worktrees/<name>/CLAUDE.md && ln -s ../../CLAUDE.md .worktrees/<name>/CLAUDE.md`.
(`.claude/worktrees/` agent worktrees are harness-managed copies; this rule is for `.worktrees/`.)

## 13. Dev/QA tooling

For dev/QA scripts (grant subscriptions, decrypt branch PINs, set auth states, issue reset
tokens, reset redemption cycles, backfills) and auth-UX test recipes, invoke the
`redeemo-dev-qa-toolkit` skill.

## 14. Governing documents

| Doc | Role |
|---|---|
| `docs/PROJECT-STATE.md` | status, decisions, warnings, deferrals (authoritative) |
| `docs/superpowers/roadmaps/merchant-portal-programme-roadmap.md` | Merchant programme map |
| `docs/deferrals/open-register.md` | live open deferred follow-ups |
| `docs/customer-flow-current.md` (+ changelog) | locked customer-flow contract; version-bump on change |
| `docs/product-decisions.md` | historical decision ledger (superseded by PROJECT-STATE §6) |
| `docs/superpowers/{specs,plans,audits,governance}/` | intended-behaviour evidence |
| `docs/runbooks/` | deploy/security/ops runbooks (check status headers; some are draft-only) |
| `docs/history/` | archived historical records (e.g. the pre-2026-07 CLAUDE.md) |

Build history 2026-04 → 2026-06 (all phases, locked baselines, per-PR detail):
`docs/history/claude-md-2026-06-20-archive.md`.

## 15. graphify caveat

`graphify-out/` exists but has been stale since 2026-04-18 (predates merchant-web, admin-web
and all security work). Do not rely on `GRAPH_REPORT.md` until regenerated
(`graphify update .`); regenerate-or-retire is an open owner decision.
