# Runbook: Vercel per-project build decision (monorepo skip)

Status: DRAFT: Phase A infrastructure only. NOT YET ENABLED on any Vercel project. Enabling
each project is a separate, owner-gated step (see Rollout). Native "Skip Unaffected Projects"
remains ON and no Ignored Build Step is configured until the owner approves a flip.

Related: cost audit + Fable v2 decision packet (chat history), CLAUDE.md sections 8 and 10.

## 1. What this does and why

The three web apps (`apps/customer-web`, `apps/merchant-web`, `apps/admin-web`) are separate
Vercel projects sharing one repo. Today essentially every push rebuilds all three (measured:
~2,164 builds in one cycle; 723 / 720 / 721 in lockstep). This infrastructure lets each
project skip a build when the change provably does not affect it, while GUARANTEEING that a
real change to a web app is never silently skipped.

Mechanism: Vercel's Ignored Build Step runs `scripts/vercel-should-build.mjs <project-key>`
inside the build container. It compares the last successful deployment
(`VERCEL_GIT_PREVIOUS_SHA`) to the current commit and decides BUILD or SKIP.

Vercel contract: the command exits `1` to BUILD (continue) or `0` to SKIP (abort, mark the
deployment CANCELED).

## 2. The safety contract (non-negotiable)

BUILD is the default. The script exits `0` (SKIP) ONLY when it can affirmatively prove every
changed path since the last successful deployment is irrelevant to the project. Everything
else BUILDs:

- invalid/missing project key
- missing/malformed `VERCEL_GIT_PREVIOUS_SHA` (first deploy of a project/branch: no baseline)
- HEAD unresolvable
- `PREV == HEAD` (same-SHA redeploy, e.g. after an env-var change)
- `PREV` not present in the shallow clone (out of depth, force-push, GC)
- git diff failed
- diff output failed the defensive parser (any unexpected status, empty path, odd token count)
- empty tree diff (`PREV != HEAD` but identical trees, e.g. an `--allow-empty` trigger commit)
- any changed path classifies BUILD for this project
- any unexpected exception

## 3. Path classification (single source of truth: `scripts/vercel-build-decision/policy.mjs`)

For project `P` (customer-web | merchant-web | admin-web):

| Changed path | Class | For P |
| --- | --- | --- |
| `apps/P/**` | own app | BUILD |
| `package.json`, `package-lock.json`, `.npmrc`, `.nvmrc` (root) | GLOBAL install seam | BUILD (all three) |
| `apps/<other known app>/**` (the other web apps, `apps/customer-app`) | sibling app | SAFE |
| `src/**`, `prisma/**`, `prisma.config.ts`, `tests/**`, `vitest.config.ts`, `tsconfig*.json`, `Procfile` | backend / test infra | SAFE |
| `docs/**`, `context/**`, `.claude/**`, `.github/**`, `.gitignore`, `.env.example`, root `*.md` | docs / CI / agent | SAFE |
| anything else (new top-level file/dir, an unrecognized `apps/<x>/`) | UNKNOWN | BUILD (fail-open) |

SKIP requires a non-empty changed-path list in which EVERY path is SAFE. Renames are handled
by diffing with `--no-renames`, so a rename decomposes into a delete (old path) plus an add
(new path) and both sides are classified: renaming an app file out to docs still BUILDs that
app. Lockfile changes always BUILD all three (we never try to prove a lockfile change is
web-irrelevant). The tripwire (section 7) shares this exact policy module, so the two cannot
drift.

## 4. Provider configuration per project (owner-gated; TWO settings per flip)

To ENABLE on a project (do NOT do this without owner approval for that project):

1. Settings -> Build and Deployment -> Root Directory -> set "Skip deployment" (native Skip
   Unaffected Projects) to Disabled, and Save.
2. Settings -> Build and Deployment -> Ignored Build Step -> Behavior: "Run my Node script"
   -> command:

   ```
   node ../../scripts/vercel-should-build.mjs <project-key>
   ```

   (`<project-key>` = customer-web | merchant-web | admin-web; the command runs with the
   working directory set to the project Root Directory `apps/<app>`.)

Why BOTH: Vercel's native skip acts BEFORE the build container exists and would pre-empt (and
not log) our script; its lockfile analysis is also more permissive than our "lockfile always
builds all three" policy. Leaving both on means two authorities; we keep exactly one, the
auditable one.

ROLLBACK per project (one-step-per-setting, provider-side, no commit): set Ignored Build Step
Behavior back to "Automatic", and set "Skip deployment" back to Enabled. This restores the
exact pre-flip behaviour.

## 5. `--probe` mode (no-risk pilot)

Command: `node ../../scripts/vercel-should-build.mjs <project-key> --probe`

Probe mode logs its evidence (cwd, `VERCEL_GIT_PREVIOUS_SHA`, the decision it WOULD make) and
then ALWAYS exits `1` (BUILD). Nothing can be skipped. Use it to verify, on a real project,
that the working directory, script path, and previous-SHA semantics are as expected before
enabling real skipping.

IMPORTANT (measurement caveat): because probe mode always BUILDs, it CANNOT measure the cost
or billing of an actual skipped deployment. Skip overhead (does executing the ignore step /
producing a CANCELED deployment consume build minutes?) can only be measured during a
separately approved enforcement pilot on a disposable or low-stakes project. Do not claim skip
savings or skip-billing numbers from probe runs.

## 6. Operator scenarios (expected outcomes)

| Action | Expected |
| --- | --- |
| Normal push touching only `apps/merchant-web/**` | merchant BUILD; customer/admin SKIP |
| Docs-only / backend-only / prisma-only / customer-app-only commit | all three SKIP |
| Root `package.json` / `package-lock.json` change (incl. Dependabot) | all three BUILD |
| Env-var rotation, then dashboard Redeploy of the same commit | BUILD (`PREV == HEAD`) |
| Provider-config change, then Redeploy same commit | BUILD (`PREV == HEAD`) |
| `git commit --allow-empty` to force a rebuild | BUILD (empty tree diff) |
| First deployment of a new branch | BUILD (no baseline) |
| Branch idle long enough that its baseline drops out of the depth-10 clone | BUILD once (baseline out of history), which re-establishes the baseline |

Secondary bypass (documented, not the primary control): the dashboard Redeploy dialog runs the
ignore step by default; to force a build irrespective of the script, uncheck "Use project's
Ignore Build Step". Operator memory must not be relied on: the `PREV == HEAD` rule already
makes same-SHA redeploys BUILD.

## 7. Production tripwire (read-only; pure git; NO credentials, NO network)

Purpose: catch the failure mode we fear most: the script wrongly SKIPping a real production
change. It verifies that every main commit relevant to a project (own source or GLOBAL seam)
is contained in that project's live production deployment SHA.

Script: `scripts/vercel-production-tripwire.mjs` (pure git; compares SHAs by exact equality or
`git merge-base --is-ancestor`, never lexically). It takes the production SHA as input; it does
NOT call the Vercel API and reads NO token.

```
node scripts/vercel-production-tripwire.mjs \
  --key <customer-web|merchant-web|admin-web> \
  --production-sha <40-hex> \
  [--baseline <40-hex last-verified main SHA>] [--main-ref main] [--repo <path>]
```

Exit 0 = PASS; exit 2 = ALERT (roll that project back to Automatic + re-enable native skip,
then investigate); exit 1 = usage error. ALERT conditions: missing/invalid production SHA,
production SHA absent from the repo, production SHA not on main, git enumeration failure, or any
relevant commit not contained in the production SHA. Run against a FULL clone of the repo (the
tripwire needs real history), never the shallow build container.

Obtaining the production SHA (operator step; read-only). Either:

- Dashboard: the project's Deployments list, newest READY Production deployment, its commit SHA.
- Read-only API (operator supplies their own token at runtime; never commit or paste it here):

  ```
  # VERCEL_TOKEN is provided by the operator in their shell; it is not stored by this repo.
  curl -s -H "Authorization: Bearer $VERCEL_TOKEN" \
    "https://api.vercel.com/v6/deployments?projectId=<project>&target=production&state=READY&limit=1&teamId=<team>" \
    | jq -r '.deployments[0].meta.githubCommitSha'
  ```

Operating model (BLOCKED pending separate owner approval): this Phase A ships the tripwire
LOGIC only. It has NO scheduler, secret, webhook, or GitHub Action. Options for running it,
for the owner to choose later:

1. Manual: an operator runs it after notable merges. Zero standing infrastructure; relies on
   the operator remembering.
2. Local cron on a trusted machine with a `VERCEL_TOKEN` in that machine's environment. No repo
   secret; token never enters the repo.
3. CI/GitHub Action with a repository/organization secret. Most automated, but introduces a
   stored credential and a provider integration.

Phase B2 (real skipping enforcement) should not be considered fully safe until the owner has
chosen and approved a tripwire operating model. Recommendation: start with option 1 or 2 during
the admin-web pilot; only adopt option 3 if the cadence needs to be guaranteed.

## 8. Phased rollout (each phase separately owner-gated)

- Phase A (this PR): script, parser, policy, tests, tripwire, runbook. No provider change.
- Phase B1 (admin-web, native skip still ON): Ignored Build Step = `... admin-web --probe`.
  Always BUILDs. Verify cwd, script reachability, `VERCEL_GIT_PREVIOUS_SHA` presence for
  production vs preview, observed clone depth, and confirm the script's log appears on every
  deployment (its absence on a skipped deployment would reveal native pre-emption). Run >= 3
  days.
- Phase B2 (admin-web enforce): disable native skip on admin-web; drop `--probe`. Requires an
  approved tripwire operating model (section 7). Observe >= 1 week or >= 20 real decisions;
  review every SKIP's logged file list.
- Phase C (merchant-web), Phase D (customer-web): same two-setting flip, each owner-gated.

## 9. Boundaries (unchanged by this work)

- Automatic project/production pausing stays OFF; the Spend Management budget stays $35
  alert-only. Nothing here can take a site offline.
- No branch-name or commit-message logic is used to decide builds (labels can lie; paths are
  proof).
- "Include files outside root directory" stays ENABLED (the single root lockfile means installs
  resolve at the repo root).
- No Turborepo adoption and no backend workspace restructuring in this slice.
