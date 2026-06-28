# Insights & Reports - demo fixture (staging-only operator runbook)

The Insights UI (PR-B) needs a realistic "established" dataset to demo: validated and
awaiting redemptions across branches, voucher types, dates, and the six London
dayparts. We must NOT seed that as real activity (it would pollute customer discovery
and production analytics), so the demo fixture writes every row as `isTestData=true`
on a single dedicated, allowlisted demo merchant, and the read path that surfaces it
is a server-owned function that runs ONLY on a staging deploy.

This runbook is for an operator setting the demo up on STAGING. It documents the safe
setup, verification, rerun, and cleanup, plus every env var involved.

## Hard rules (do not weaken)

- The demo seed AND the runtime display BOTH require `REDEEMO_DEPLOY_ENV=staging`
  EXACTLY. Unset, empty, `local`, `test`, `production`, or any unknown value FAILS
  CLOSED (the demo stays disabled). `NODE_ENV` is NOT consulted: Railway staging runs
  `NODE_ENV=production`, so the demo identity is the app-owned `REDEEMO_DEPLOY_ENV`,
  never `NODE_ENV` or a Railway-provided name or any inferred signal.
- Future production sets `REDEEMO_DEPLOY_ENV=production`, which can NEVER permit the
  demo path.
- The demo login password is NEVER committed. The operator supplies it via
  `INSIGHTS_DEMO_ADMIN_PASSWORD`; an unset/empty value fails closed (nothing seeded).
- Do NOT modify Railway or any other provider configuration as part of this runbook
  on this PR. The env vars below describe what an operator sets in the staging
  environment; setting them is a deploy-time operation, not a code change.
- Never print a credential or a connection string. The seed runner prints only
  non-secret identifiers and counts.

## Environment variables

| Var | Used by | Required value | Effect |
| --- | --- | --- | --- |
| `REDEEMO_DEPLOY_ENV` | seed guard + runtime resolver | `staging` (exact) | Staging-identity hard gate. Anything else fails closed. |
| `INSIGHTS_DEMO_FIXTURE` | seed guard | `1` | Explicit default-off flag for the SEED. Without it the seed refuses. |
| `INSIGHTS_DEMO_ADMIN_PASSWORD` | seed | operator-chosen secret | The demo owner login password (hashed at seed time). Unset/empty fails closed. |
| `INSIGHTS_DEMO_INCLUDE` | runtime resolver | `1` | Explicit default-off flag for the DISPLAY. Without it the demo rows stay hidden. |
| `INSIGHTS_DEMO_MERCHANT_ID` | runtime resolver | the seeded demo merchant id | Allowlist: only this merchant's `isTestData=true` rows surface. |

Undecided PR-0a D6 governance thresholds (server-owned, fail-closed; unrelated to the
demo identity but documented here for completeness):

| Var | Effect when unset (fail-closed) | Effect when set to a positive integer |
| --- | --- | --- |
| `INSIGHTS_BUSY_PEAK_MIN_COUNT` | "Busiest" badge never names a peak (null). | Surface busiest only when the peak cell count is at or above the value. |
| `INSIGHTS_REPEAT_RATE_MIN_COHORT` | Repeat-rate is always treated as insufficient. | Compute repeat-rate only when the cohort is at or above the value. |

## 1. Safe staging setup

1. Confirm the target is the staging deploy and that `REDEEMO_DEPLOY_ENV=staging` is
   set in the staging environment.
2. Choose a strong demo owner password and set it as `INSIGHTS_DEMO_ADMIN_PASSWORD`.
   Keep it out of logs, commits, and chat.
3. Set `INSIGHTS_DEMO_FIXTURE=1` for the seed run.
4. Run the seed:

   ```
   REDEEMO_DEPLOY_ENV=staging INSIGHTS_DEMO_FIXTURE=1 \
   INSIGHTS_DEMO_ADMIN_PASSWORD='<operator-chosen-secret>' \
   npm run insights:demo:seed
   ```

5. Record the printed `demo merchant id`. The runner prints only ids and counts, never
   the password or the connection string.

## 2. Enable the display

The seed alone does not surface anything: the canonical eligible rule excludes
`isTestData=true` rows by default. To surface the demo dataset through the normal
authz'd Insights routes (logged in as the demo owner), set:

```
INSIGHTS_DEMO_INCLUDE=1
INSIGHTS_DEMO_MERCHANT_ID=<the demo merchant id printed in step 1>
```

with `REDEEMO_DEPLOY_ENV=staging` still in place. The display resolver requires ALL of:
staging deploy AND `INSIGHTS_DEMO_INCLUDE=1` AND the queried merchant equals
`INSIGHTS_DEMO_MERCHANT_ID`. The carve-out only ever lifts the cleanliness filter for
that single allowlisted merchant (test rows ONLY), so a normal merchant never sees any
test rows.

## 3. Verify

1. Log in to the Merchant Portal on staging as the demo owner
   (`insights-demo-owner@redeemo-insights-demo.invalid`) using the password you set in
   step 1.
2. Open Insights & Reports. The overview should show non-zero redemption activity
   (both validated and awaiting), distinct customers, and savings, spread across
   branches, voucher types, and the six London dayparts.
3. Confirm a NORMAL merchant on staging sees no demo rows: their Insights stays clean.

## 4. Rerun (deterministic)

Re-running the seed is a true reconcile, not an append: it deletes only the
fixture-owned (`isTestData=true`) redemptions on the demo branches and recreates the
fixed set with stable codes, so the redemption count stays identical. A stray non-test
row that somehow exists under a demo branch is preserved. Just re-run the same command
from step 1.

The seed is also collision fail-closed: if a real (non-test) merchant, branch, voucher,
or admin already owns a demo sentinel name, code, or email, the seed throws rather than
mutating or hijacking the real row. The delete and recreate run inside a single
transaction, so an interruption cannot leave partial data.

## 5. Cleanup

To take the demo down:

1. Unset (or clear) `INSIGHTS_DEMO_INCLUDE` so the display resolver returns nothing and
   the demo rows stop surfacing immediately, even before any data removal.
2. If you also want to remove the seeded rows, delete the demo merchant and its
   dependent rows (membership, branches, vouchers, redemptions, the demo admin, the
   `@redeemo-insights-demo.invalid` users) in FK-safe order. All of these carry
   `isTestData=true` (except the demo Users, which live entirely in the
   `@redeemo-insights-demo.invalid` address space), so they are isolated from real data.

## Notes

- Production cleanliness holds even if every demo guard is misconfigured: the rows are
  `isTestData=true` and the canonical eligible rule excludes them, so the gate is the
  data, not the guard. The display resolver is additionally dead on any non-staging
  deploy.
- The demo login uses the standard merchant bcrypt path and the full
  resolveMerchantContext / lifecycle / role / scope chain, so it behaves exactly like a
  real owner login.
