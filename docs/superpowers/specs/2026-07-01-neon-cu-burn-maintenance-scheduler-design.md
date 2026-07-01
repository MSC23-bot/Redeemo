# Neon CU-Burn Fix: Durable Maintenance Scheduler — Design Spec

> **Status: DRAFT for Codex + owner review (revision 2, post-concurrency review). Docs-only. Not authorised for implementation or operational action.**
> Tier 3 (backend job-scheduling architecture). No schema change by default, EXCEPT possibly ONE additive `NotificationType` enum value for the degraded/recovery alert if no existing type fits (owner decision, §7 / §15).

**Date:** 2026-07-01
**Goal:** Permanently stop the maintenance worker from keeping a Neon compute continuously awake, without weakening the durable delivery/promotion guarantees, and in a way that scales from today's small staging dataset to production.
**Scope:** The three MAINTENANCE_QUEUE sweeps (outbox reconciler, opening-hours promotion, stale-claim) and their scheduling. Delivery workers and the fast paths are touched only where noted. **Out of scope:** the true transactional outbox (O5, §10); any Neon/Railway/Redis operation; R1/P1/P8/P9; credential rotation (Phase 2B); encryption R2/R3/R4/Operations A/B.

---

## 0. Accepted principles (locked)

1. Database records remain authoritative.
2. Redis accelerates delivery but is never the sole reconciliation trigger.
3. Idle database polling must be reduced and honestly costed. **IDLE performs one bounded DB scan per `F_idle`; the invariant is "no more frequently than the approved floor," NOT "zero query."**
4. The 24-hour CommunicationLog terminal-failure + payload-clearing policy remains explicit.
5. Expired/FAILED communications require visible metrics and operator alerting.
6. Maintenance sweeps align wake timing while retaining **genuinely independent** per-sweep failure state, backoff, timeouts, limits, enable flags, and rollback.
7. Staging worker stays Offline through the whole change set until a single owner-approved staging activation (§9).

---

## 1. Diagnosis (confidence-tagged)

**Verified sufficient mechanism and likely dominant contributor (NOT the proven sole cause; no provider telemetry attributes historical CU-hours):** the two unconditional 60-second sweeps — outbox reconciler (`outboxReconciler.ts:48`) and opening-hours promotion (`promotePendingHours.ts:56`) — issue index-covered DB queries every 60s regardless of backlog. Neon scales to zero only after 5 min with no query activity, so a query every 60s keeps a compute awake 24/7; one compute at 0.25 CU is ~182 CU-hr/month, exceeding the 100 CU-hr Free cap in ~16-17 days (r1 §11 names these "the leading identified persistent-activity mechanism, NOT a telemetry-proven sole cause").

**Strong contributing:** the hourly stale-claim sweep (`claimStaleSweep.ts:33`) still wakes the compute ~12x/day (~5 min each, ~7.5 CU-hr/mo alone); per-deploy `prisma migrate deploy`.
**Plausible, unproven:** exact attribution; autoscaling average above 0.25; multiple warm computes; historical frontend-polling while Web served; a link between CU exhaustion and P1001.
**Unrelated to the burn:** `passwordless_access` (auth surface, separate provider-security review); the pooled-endpoint migration rule (operational).

---

## 2. Current-state facts (source-grounded; must be preserved)

- **Outbox DB-backed, commit-then-best-effort-enqueue.** `notify()` writes `CommunicationLog status='QUEUED'` in its OWN `$transaction` (`notify.ts:173-209`), then best-effort `enqueue(EMAIL_QUEUE,{communicationLogId},{jobId=id})` after commit (`notify.ts:214-222`). The row is NOT in the caller's business transaction (the notify()-gap, §10).
- **Reconciler two-tier, fixed window.** `reconcileOutbox` (`outboxReconciler.ts:70-110`): (1) EXPIRE `updateMany WHERE status='QUEUED' AND sentAt < now-24h → FAILED, payload=DbNull`; (2) RE-ENQUEUE `findMany WHERE status='QUEUED' AND sentAt ∈ [now-24h, now-2m), take 200`. Constants `RECONCILE_GRACE_MS=120_000`, `RECONCILE_MAX_AGE_MS=24h`, `RECONCILE_BATCH=200`. The window is fixed and independent of cadence.
- **Time source is the APPLICATION clock:** `reconcileOutbox(prisma, now=new Date())` and the sweeps default to `new Date()`, not DB time (see §8.3).
- **Expiry alerting is a gap:** only `console.warn` (`outboxReconciler.ts:79-84`).
- **Idempotency (not exactly-once):** deterministic `jobId=id`, skip-terminal (`email.ts:77`), CAS `updateMany WHERE {id,status:'QUEUED'}` (`email.ts:47-55`), provider idempotency-key=id (`email.ts:92`). No row locking.
- **Indexes cover the sweeps:** `CommunicationLog @@index([status, sentAt])`; `BranchOpeningHoursPending @@index([status, effectiveAt])` + partial `UNIQUE(branchId) WHERE status='PENDING'`.
- **Pending-hours = durable row + Redis delayed nudge + 60s sweep backstop.** Per-record nudge `enqueue(MAINTENANCE_QUEUE,{job,pendingId},{jobId=`promote-hours-${branchId}`, delay=2h})` (`branch/service.ts:1058-1062`); `promoteOnePendingHours` opens its OWN `$transaction` (re-read-and-recheck).
- **Single worker, one process, NO lock.** `worker.ts:84-94` boots three workers + three repeatables. **No leader election / advisory lock / singleton guard**; the code implicitly assumes one replica. `pg_advisory_xact_lock` IS used elsewhere (`redemption/service.ts:410-426`).
- **BullMQ concurrency:** MAINTENANCE + EMAIL default 1; MODERATION default 5.
- **No process-local timers today:** zero `setInterval`/`setTimeout` in `src/`; all recurring work is Redis-scheduled BullMQ repeatables — **so today's floor does not survive a Redis outage.**
- **Redis `noeviction` required** (`connection.ts:14-17`); repeatable/delayed state lives in Redis (lost on flush, re-derived from DB rows on boot).
- **Graceful shutdown drains in-flight** (`worker.ts:99-119`); `uncaughtException → exit 1`.
- **No outbox scheduler nudge exists**; the reconciler fires only on the 60s repeatable.
- **Alerting seam that DOES exist (Codex source review):** `adminNotify()` writes DB-backed in-app Admin notifications; the `ADMIN_DELIVERY_FAILED` type exists but its emission is currently deferred. There is **no general external metrics backend** in source.

**Reframing (key insight):** normal delivery/promotion already run on Redis-accelerated fast paths; the sweeps only catch the *rare* lost fast-path event, so the durable floor is a low-frequency backstop and its cadence can be relaxed.

---

## 3. Target architecture

Three separated layers:

**A. Fast paths (unchanged, Redis-accelerated).** Direct EMAIL_QUEUE enqueue in `notify()`; the 2h per-record pending-hours delayed nudge. Accelerators only; Redis loss degrades them but never removes the floor (principle 2).

**B. Durable maintenance floor (the fix).** A **process-local-timer-driven** periodic wake that runs each sweep as an independent, bounded, advisory-locked unit; the timer replaces the three BullMQ repeatables. The per-record pending-hours nudge and the EMAIL_QUEUE delivery jobs stay on BullMQ.

**C. Observability.** Per-sweep counters + structured logs + in-app admin alerting on expiry/FAILED/degraded (§7).

Terminology (Codex #10): the **durable guarantee** comes from the DB rows + boot-time re-derivation. The process-local timer is **Redis-independent but NOT durable** — it exists only while the worker process is up. The advisory lock is **overlap protection**, not permission for many scheduler replicas.

---

## 4. Scheduler, timeouts, transactions, ownership

### 4.1 Per-sweep unit + genuinely independent state (Codex #3)

Each sweep is an independent unit with its **own**: enable flag, advisory-lock KEY (distinct per sweep), statement/transaction timeouts, `nextEligibleAt`, `degradedStreak`, `lastSuccessAt`, `lastFailureAt`, and metrics. There is **no shared `dbError`/`degradedStreak`/`delay`**. One sweep failing or backing off does not change any sibling's state.

**Execution model (decision): sequential within a tick, per-sweep bounded — with one honest caveat.** Sweeps run one at a time (bounds concurrent locked connections to 1). Each sweep's **Phase A (DB) work is hard-bounded** (statement + tx timeout) and its per-row Phase-B work is cooperatively bounded (§4.2). **Caveat (Codex boundedness):** an awaited Phase-B `Queue.add` can still block indefinitely during a Redis outage (shared IORedis `maxRetriesPerRequest:null`), which would head-of-line-block later sweeps in the SAME tick AND delay graceful shutdown. So the *complete* sweep is **NOT** independently end-to-end bounded until the **finite producer lifecycle** gate (§4.2 / §9) is in place — that gate is **mandatory pre-release**, not a cost preference. With the gate in place, the finite producer LIFECYCLE — bounded readiness/connection establishment AND bounded command-await + force-close (§4.2; `commandTimeout` alone is NOT the complete bound because it starts only after a command is issued, so cold-start readiness must be bounded too) — bounds the **AWAIT** (the caller's Promise rejects), bounding scheduler progress + shutdown; it does **NOT cancel or prove-fail** the underlying enqueue — its outcome is **UNKNOWN** (may not have run, may have run, may run later) — so the row is classified **UNKNOWN/needsRescan** and correctness is preserved by the deterministic jobId (idempotent replay: a re-enqueue is a BullMQ no-op if the first attempt actually landed). A slow/failing sweep aborts at its own DB timeout and the next runs; a degraded sweep is skipped (its `nextEligibleAt` sits in the future per its own backoff) while siblings proceed. **Rejected alternative: concurrent sweeps** — N simultaneous locked transactions = N connections against Neon's ~10-connection budget and N simultaneous wakes; unnecessary for three small bounded sweeps. Connection-pool model: sequential worst-case = 1 locked connection at a time; the worker Prisma pool `max` is set explicitly (§9 gate 4) with headroom over the app's usage.

**Aligned wake:** healthy sweeps share the current cadence (`F_idle`, or `F_active` while draining a backlog) so they wake together and minimise distinct compute wakes; only a **degraded** sweep diverges onto its own backoff. The timer wakes at `min(nextEligibleAt)` across enabled sweeps, and is (re)armed **exactly once after each tick completes** — never from inside an in-flight tick; a process-local `tickInFlight` **single-flight** guard prevents re-entrancy, and a sweep run only updates its own `nextEligibleAt` (it does not arm the timer). **Explicit result state:** each sweep run resolves to exactly one state — `SUCCESS` / `LOCK_SKIPPED` / `TIMEOUT` / `FAILURE`; `TIMEOUT` and `FAILURE` each increment ONLY the affected sweep's `degradedStreak` + backoff and are never treated as success; `LOCK_SKIPPED` reschedules at `F_idle` without degrading. A sweep run **never rejects**: an unexpected error from `runBoundedSweep` is caught in `runOne` and classified `FAILURE` for that sweep (its `degradedStreak` + backoff advance and `nextEligibleAt` moves forward by at least `degradedBaseMs`), so a rejection cannot leave `nextEligibleAt` in the past or create a tight retry loop, and siblings continue. Phase-B elapsed time is measured with a **monotonic** clock (`performance.now()`), not the wall clock. **Shutdown drain:** `stop()` is **async and idempotent** — it sets `stopped`, clears the armed timer, prevents any new tick or re-arm, and tracks the **active tick Promise** (not merely `tickInFlight`) so shutdown can **bounded-drain** the in-flight tick before teardown (§4.6); concurrent `stop()` calls share one drain Promise, and the drain timeout does NOT cancel the tick. **Cooperative terminal stop (Codex):** `stopped` is a **terminal** signal set BEFORE the drain; the tick loop checks it **before every sweep and after each awaited sweep** (breaking immediately), and the same predicate (`isStopping`) is threaded into Phase B and checked **before each row/side-effect** — so once stop is requested no new sweep and no new Phase-B row starts. It does NOT cancel an already-running Prisma/Redis operation; the force-close (§4.6) makes that operation reject, and a **bounded post-force join** (`forceJoin`) then awaits the unwinding tick.

### 4.2 Timeout, cancellation, and transaction mechanics (Codex #1, #2)

The old `Promise.race` skeleton is **removed**: it did not cancel the underlying work and could release leadership while a timed-out sweep kept running. Replacement:

- **Lock lifetime == work lifetime.** Each sweep's DB-only work runs **inside the same interactive transaction that holds the advisory lock, on the SAME connection (`tx`)** — never the outer client. Because `pg_try_advisory_xact_lock` is transaction-scoped, the lock is released only when that transaction commits or rolls back. Therefore leadership is never released while the sweep's DB work is still in-flight.
- **Two DB-enforced bounds that actually cancel work:** (a) a **parameterized** `SELECT set_config('statement_timeout', <value>, true)` (bound value, NOT string interpolation — no `$executeRawUnsafe`) as the first `tx` statement bounds every individual statement server-side; (b) Prisma's interactive-transaction `timeout` bounds the whole `tx` — on expiry Prisma rolls back, which releases the advisory lock AND aborts the in-flight statement. **Ordering constraint (locked): `STATEMENT_TIMEOUT_MS < prisma tx timeout < any outer wall-clock guard`.** There is no separate 20s `Promise.race`; the previous "20s sweep timeout vs Prisma's default 5s interactive-tx timeout" conflict is eliminated by setting the Prisma tx `timeout` explicitly and keeping the statement timeout below it.
- **Phased execution — locked DB phase then unlocked side-effects:**
  - **Phase A (locked, light + DB-only):** open `prisma.$transaction(fn, { timeout, maxWait })`; set `statement_timeout`; `pg_try_advisory_xact_lock(key)` (if not acquired → return `acquired:false`, skip); read `SELECT now()` once as the authoritative clock (§8.3); do **only light bulk/selection** DB work on `tx` — the outbox bulk EXPIRE `updateMany` (one statement, must be single-execution) plus the **candidate-id SELECTs** for each sweep (outbox re-enqueue ids, pending-hours due ids, stale-claim eligible ids). Return those id lists as the side-effect payload. Commit → lock released. Heavy per-row work is NOT done here.
  - **Phase B (unlocked, idempotent side-effects):** AFTER the transaction settles, perform the per-id work without the lock: outbox Redis re-enqueues (`jobId=id`), **pending-hours promotion per row via the existing re-read-and-recheck `promoteOnePendingHours` in its own short, statement-timeout-bounded transaction**, and stale-claim per-row update+notify. Each is idempotent (BullMQ dedup + skip-terminal + CAS for the outbox; re-read-only-if-still-PENDING + the partial-unique index for promotion; `lastStaleAlertAt` dedup for stale-claim), so running without the sweep lock — or a cross-replica duplicate after the lock released — is a no-op. **No external I/O (Redis) and no heavy per-row loop ever runs inside the locked transaction; and every Phase-B per-row transaction is itself statement-timeout-bounded.** Phase B is bounded by a **cooperative soft budget** — an item cap (`phaseBMaxItems`) and a time budget (`phaseBBudgetMs`) checked BETWEEN rows using a **monotonic** clock (`performance.now`). It bounds how many rows are STARTED; it does NOT hard-cancel an in-flight `Queue.add`, which can block during a Redis outage because the shared connection uses `maxRetriesPerRequest:null`. The full finite producer LIFECYCLE (readiness + command-await + force-close + recovery) is **locked** by §4.2 / Task A5; only its numeric readiness/retry/command/shutdown values remain benchmark/owner-gated. Each row runs in its OWN try/catch, so a per-row failure does NOT stop later rows. If the item cap or time budget is hit with rows remaining, OR any row failed, OR Phase A returned a full batch, the sweep reports `full` (needsRescan): the unprocessed/failed durable rows (still QUEUED/PENDING) are re-selected next scan (**durable rescheduling**) and the sweep stays on `F_active` until clear.

**Finite producer LIFECYCLE — LOCKED + MANDATORY pre-release gate (Codex boundedness + cold-start readiness).** Bounding only `Queue.add` is insufficient: installed BullMQ `RedisConnection.init()` waits for IORedis 'ready' (unless `skipWaitingForReady`), and IORedis `commandTimeout` starts only AFTER a command is issued — so a cold start with Redis DOWN can hang in **readiness/connection** before `commandTimeout` ever applies, and a finite `maxRetriesPerRequest` does not necessarily bound readiness (the reconnect strategy can keep looping). The COMPLETE producer lifecycle must be finite: creation → initial connect/readiness → BullMQ Queue init/version check → `Queue.add` → error invalidation → recreation after recovery → shutdown. **Locked mechanism (verify exact BullMQ/IORedis lifecycle against the installed versions at implementation; correct anything inaccurate):** a **dedicated non-blocking producer created LAZILY** (IORedis `lazyConnect:true`, with an EXPLICIT connect-before-Queue sequence — see below — and BullMQ `skipWaitingForReady` permitted only after the explicit ready step); a **finite connection-establishment policy** — `connectTimeout` + a **finite `retryStrategy`** that returns null after a bounded attempt/time budget so reconnection TERMINATES rather than looping; **`enableOfflineQueue:false`** (commands reject immediately when disconnected instead of queueing); **finite `commandTimeout` + finite `maxRetriesPerRequest`** (bound the command await). The **blocking Worker connections are UNCHANGED** (`maxRetriesPerRequest:null`). Only the NUMERIC values are benchmark-gated. **Locked creation sequence (connect-before-Queue, Codex).** Because `lazyConnect` + `skipWaitingForReady` + `enableOfflineQueue:false` would otherwise let the FIRST Queue op reject during connection establishment even when Redis is HEALTHY, creation MUST: (1) memoise one in-flight creation Promise; (2) instantiate the dedicated IORedis producer (`lazyConnect:true` + the finite readiness/command options); (3) **explicitly `await redis.connect()`** inside the finite readiness policy — `connectTimeout` + finite `retryStrategy` govern this stage, NOT `commandTimeout` (which starts only after a command is issued); (4) verify the client reached `'ready'`; (5) only THEN construct + return/memoise the BullMQ Queue; (6) `skipWaitingForReady` may remain only after this explicit ready step, or be omitted if BullMQ's normal ready check is then immediately satisfied; (7) on connect/readiness/BullMQ-init/version-check failure: force-`disconnect()`, remove listeners, **atomically evict the creation entry**, and permit later recreation. **Semantics:** none of these prove a queued/transmitted command was cancelled — a timed-out/failed `Queue.add` outcome is **UNKNOWN** (may not have run / may have run / may run later); the row is classified **UNKNOWN/needsRescan** and correctness is preserved by the **deterministic jobId** (a re-enqueue is a BullMQ no-op if the first attempt actually landed). On a **readiness OR command timeout/error**, the producer Queue + connection are **evicted from the memoisation maps, force-`disconnect()`-ed, and their listeners removed**; the **next enqueue constructs a fresh producer** after Redis recovers. **Rejected: `Promise.race` as cancellation** — it leaves the add running. **Release gate:** v1 is not shipped until the FULL lifecycle is finite — bounded readiness/connection establishment AND bounded command-await AND force-close AND recreation — and verified. `commandTimeout` alone is NOT the complete bound.

**Memoised producer recovery contract (Codex #3).** Producers are memoised (`makeQueue`), so a rejected BullMQ init must not be reused forever. Contract: (a) **invalidating errors** = connection 'end'/'error' after the finite retry policy, BullMQ init/version-check rejection, `commandTimeout`, and the `enableOfflineQueue:false` immediate-reject; (b) on such an error the Queue + connection are **atomically evicted** from the maps, **force-`disconnect()`**-ed, and their event listeners removed (no leaked socket/listener/timer); (c) concurrent callers memoise the **in-flight CREATION Promise** (not just the resolved Queue), so a burst during recreation yields **exactly one** replacement producer, and on creation failure the entry is evicted so the next call recreates; (d) a later enqueue after Redis recovery constructs a **healthy fresh** producer; (e) **deterministic jobId** makes the retry safe when the previous outcome was UNKNOWN (a same-jobId enqueue on the fresh producer is a BullMQ no-op if the first attempt actually landed). The re-read-and-recheck idempotency of the promotion is load-bearing precisely because Phase B is unlocked.
- **Proof of bounded/cancelled work before leadership release (Codex #1):** on timeout or crash the transaction rolls back, atomically (i) releasing the xact advisory lock and (ii) cancelling the in-flight statement (statement_timeout + rollback). The only post-lock work is Phase B, which is idempotent and needs no leadership. Another replica acquiring the lock afterward therefore cannot collide with in-flight DB work.

Because each sweep does at most `RECONCILE_BATCH=200` rows on index-covered queries, Phase A normally completes in well under the timeouts; the timeouts are the safety net that guarantees the invariant, not the common path.

### 4.3 Ownership under horizontal scaling (Codex #2, #10)

Options compared:

| Option | Split-brain | Failover / lease | New provider dep? | Scale-to-zero compatible? |
|---|---|---|---|---|
| A. Single-replica policy (explicit + Railway-verified) | silent double-scan if ever >1 | n/a | no | yes |
| B. Per-scan xact advisory lock (per sweep) | prevented: one holder per key per tx | auto-released at tx end; next tick re-acquires | no | **yes** (held only during Phase A) |
| C. Dedicated singleton scheduler process (replicas=1) | prevented by replicas=1 | provider restart | new deploy unit | yes |
| D. External scheduler (Railway cron / Neon pg_cron) | provider-managed | provider-managed | **yes — UNVERIFIED** | yes |

**Recommendation (v1): A + B.**
- **A — enforce AND verify replica count = 1.** Every additional replica still runs the `pg_try_advisory_xact_lock` query and thereby wakes the DB, so the lock is not permission for unlimited scheduler replicas. v1 requires the Railway worker service to be set to **1 replica**, and the runbook (§9 / PR-E) must include an explicit **Railway verification step** that replicas = 1, not merely a documented policy.
- **B — per-sweep xact advisory lock** as overlap protection (rolling-deploy overlap where old+new briefly coexist, or an accidental second start), NOT as a licence for many replicas. Session-scoped locks are rejected (torn down when the compute suspends); the per-scan xact lock is held only during Phase A.
- **Trigger to move to C (dedicated singleton scheduler):** when the worker must scale beyond 1 replica for throughput (e.g., email/moderation volume) — at that point the maintenance timer moves into a single dedicated scheduler process (replicas=1) so only one process wakes the DB, and the worker replicas only consume BullMQ jobs. Recorded as an owner decision (§15).
- **D** stays a flagged, provider-verification-required alternative; not introduced silently.

Split-brain/failover model for B: within one Neon primary the advisory lock is cluster-global; at most one holder per key. A crash mid-Phase-A aborts the tx and releases the lock; the next tick (this or another replica) re-acquires. No manual reclamation.

### 4.4 State machine

Authoritative state is the DATABASE in every state; the in-process FSM is reconstructable by a boot scan.

| State | Entered by | DB queries | Survives Redis loss? | Restart recovery |
|---|---|---|---|---|
| **BOOT** | worker start | one immediate bounded scan of every enabled sweep | yes (process-local) | this IS recovery |
| **IDLE** | K consecutive empty scans (per sweep) | one bounded Phase-A scan per sweep per `F_idle` | yes | boot scan re-enters |
| **ACTIVE/BACKLOG** | a sweep returns a full LIMIT-200 batch | that sweep re-scans at `F_active` until empty | yes | boot scan re-enters |
| **DEGRADED (per sweep)** | that sweep's Phase A throws a DB/connection error or times out | that sweep only retries with its own capped exponential backoff; alert after M; siblings unaffected | yes | boot scan re-enters |

Redis-degraded is a modifier: Phase A (DB-only expiry + promotion) proceeds; Phase B (Redis enqueue) and email delivery are best-effort until Redis returns.

### 4.5 First-release sufficiency (Codex #1 sub-question)

Boot re-derivation + a bounded process-local floor + the per-scan advisory lock is sufficient for v1 at **1 enforced replica**. An external/provider scheduler (Railway cron / Neon pg_cron) is **not required for v1** and must not be added silently (provider-verification-required); it is the horizontal-scaling evolution (§4.3 trigger).

### 4.6 Bounded shutdown contract (Codex real-force-close)

Graceful shutdown must terminate cleanly even if Redis is unavailable/half-open (a `commandTimeout` bounds the AWAIT but does NOT prove the socket/command is gone). Contract (grounded in the real `worker.ts:99-116` shutdown, which is idempotent via `shuttingDown` and ends in `finally { process.exit(exitCode) }`):
0. **Terminal cooperative stop signal.** `stop()` sets a **terminal** `stopped` flag BEFORE the drain (never reset). The tick loop checks `stopped` **before every sweep and after each awaited sweep** (breaking immediately), and Phase B checks `isStopping()` **before starting each row/side-effect** — so once stop is requested NO new sweep and NO new Phase-B row starts. This does **NOT** cancel an already-running Prisma/Redis operation; it only prevents NEW work (a force-close below makes an in-flight op reject).
1. **`await scheduler.stop()` — async, idempotent, bounded active-tick drain.** `stop()` clears the armed timer, prevents any re-arm, and **tracks the ACTIVE TICK Promise (not just `tickInFlight`)**, awaiting it within `stopDrainMs`. Because the tick now cooperatively breaks, the common case drains quickly (the current awaited op settles, the loop breaks). If the tick settles → `{ drained:true }`, teardown proceeds; if the bound expires → `{ drained:false }` reported to this sequence — **the timeout does NOT cancel the tick**. Every rejection is caught; **concurrent `stop()` calls share one drain Promise.** Worker shutdown AWAITS `scheduler.stop()` **before** closing Queue/Redis/Prisma. Then **prevent new producer/alert work** (`AlertSink.stop()`; no new enqueues).
2. **Bounded graceful close:** attempt `Queue.close()` (`closeQueues()`) + owned worker/producer connection `quit()` within a bound.
3. **Force-close on expiry:** if the drain OR the graceful-close bound elapses, explicitly `disconnect()`/destroy the producer + Redis sockets and `prisma.$disconnect()` so the underlying socket + any stuck command are actually terminated (**real force-close**, NOT a cosmetic `Promise.race`) — and the tick's in-flight awaited op then **REJECTS** (caught at every layer). This also covers **shutdown while the producer is still in initial connect/readiness** (Redis down at cold start): the lazy connection + finite `retryStrategy` + force-`disconnect()` bound it.
4. **Bounded post-force join (`forceJoin`).** After the force-close, `await scheduler.forceJoin(joinBoundMs)` awaits the now-unwinding tick — which rejects on its destroyed connection, is caught, then BREAKS on `stopped` — swallowing every rejection so none escapes. It starts no new work (cooperative signal).
5. **Equally-safe process-termination fallback.** If `forceJoin` also times out, the real `shutdown()`'s `finally { process.exit(exitCode) }` (`worker.ts:114`) terminates the process: `stopped` being terminal + checked before every sweep/row guarantees NO new DB/Redis op can start regardless, and `process.exit` destroys every remaining handle. A late rejection is caught per-row / by `forceJoin`, or by the process-level `unhandledRejection` LOG backstop (`worker.ts:128`) — never an unhandled crash.
6. **No lingering handles:** after force-close/join no producer socket, timer, or pending event-loop handle remains, so the process exits.
7. **AlertSink:** bounded drain of in-flight writes; after the bound, proceed to the controlled Prisma `$disconnect()`; all resulting rejections are caught. Shutdown never waits indefinitely for an alert or an enqueue. `recoveryPending` stays best-effort across restart.

This is a **mandatory pre-release gate** with **mutation-resistant** tests: stop during sweep 1 of several → later sweeps never start; stop during Phase B → no later row starts; drain-timeout → force-close → the current op settles/rejects safely; no DB/Redis op begins after closure; concurrent `stop()` share one result; and no timer re-arm / unhandled rejection / lingering handle (Redis-unavailable/half-open included). The source-grounded cooperative-stop cross-check table is in the implementation plan (Task A6).

---

## 5. Delivery semantics — honest guarantees (Q3, unchanged)

**No exactly-once claim.** At-least-once queue processing; deterministic `jobId=id` (BullMQ dedup); terminal-state skip (`email.ts:77`); CAS terminal write (`email.ts:47-55`); provider idempotency-key=id within Resend's ~24h retention (= `RECONCILE_MAX_AGE_MS`). Residual: (a) delivered-then-crashed-before-CAS → re-run re-delivers, deduped by the provider within 24h; (b) terminal loss at 24h (§7); (c) no duplicate beyond 24h because the row is expired and never re-enqueued past it. Net: **at-least-once with provider-side dedup within 24h and a bounded 24h terminal loss.**

---

## 6. Redis nudge path (Q4, unchanged)

The durable floor is NOT event-nudged; fast paths handle events and the floor self-tightens on backlog. Pending-hours: the existing 2h delayed nudge is the accelerator (may be lost → the floor backstops it). Outbox: new communications deliver via the direct EMAIL_QUEUE enqueue; the reconciler only catches a *lost* enqueue, whose failure (Redis) shares the failure domain of any nudge, so **the outbox reconciler gets no event nudge** — the periodic floor is its only reliable trigger. `IDLE → ACTIVE` is driven by a full-batch scan result, not an event. Redis loss cannot remove the floor (process-local timer).

---

## 7. 24-hour terminal policy + alerting contract (Codex #5)

- **Preserve the policy exactly:** a `CommunicationLog` still QUEUED at `sentAt < dbNow-24h` is force-FAILED with `payload` NULLed. Not re-enqueued. Expiry precision under a longer floor is `24h + F_idle` worst case; keep `F_idle << 24h`.
- **Alert sink is LOCKED for v1 (no invention at implementation):**
  - **Expired communication:** (i) a **structured external log** (JSON to stderr) with counts + affected communication types; PLUS (ii) an in-app alert we fan out **EXPLICITLY**: **`getAlertableAdmins()`** returns the recipient set (active OPS + SUPER_ADMIN — the existing M8 / PR #237 pattern), and we call **`adminNotify(prisma, { adminUserId, type, title, body, referenceId?, referenceType? })` once per recipient**. `adminNotify()` writes a SINGLE DB-backed in-app `Notification` per call and does **NOT** itself fan out; it sends **no email / no CommunicationLog** (its emission was previously deferred; this work enables it for expiry). **Coalescing:** one notification per (recipient, alert-type) per window — never one-per-row; `type='ADMIN_DELIVERY_FAILED'`. **Dedup is on `Notification.sentAt`** (the model has NO `createdAt`): before emitting, the most-recent maintenance `ADMIN_DELIVERY_FAILED` notification's `sentAt` for that recipient/type is checked and the alert suppressed if within the window (candidate 15 min). **Race honesty:** even at ONE replica, overlapping asynchronous emitters would race a plain query-then-create, so emission is **serialized in-process by the per-alert-key single-flight** (the alert execution contract below) — that prevents double-writes within a replica. Dedup is otherwise **best-effort**: a worker restart mid-window, or a future second replica, can still produce a duplicate. The atomic upgrade (an advisory lock around the check-then-insert, or a unique persisted `(type, time-bucket)` key) is the multi-emitter path. The **concurrent-emitter test asserts the SELECTED contract** (in-process single-flight, best-effort across restart/replicas), not merely the alternatives. The body carries an aggregate count, never one-per-row. **Redaction:** counts + type labels only; NEVER the cleared payload, PIN, reset link, or any PII (the expiry already NULLs `payload`). The `adminNotify` contract is **verified**: `adminNotify(prisma, { adminUserId, type, title, body, referenceId?, referenceType? })`, and `getAlertableAdmins(prisma)` returns active OPERATIONS + SUPER_ADMIN. A routine source-drift recheck before implementation is standard, but the contract is known — not deferred.
  - **DB unavailable (DEGRADED):** an in-app DB notification cannot be written during a DB outage. So: **structured external log/error while unavailable**; then AFTER the DB recovers, `getAlertableAdmins()` + one `adminNotify(prisma, { adminUserId, type, ... })` per recipient carrying the **`RECOVERED` phase** — a **distinct alert identity** per the locked degraded/recovery rule below, **never suppressed by the earlier `DEGRADED` notice**. The phase representation (ONE additive maintenance-status `NotificationType`, candidate `ADMIN_MAINTENANCE_DEGRADED`, + a persisted phase discriminator such as `referenceType` — recommended — OR two distinct types) and any additive `NotificationType` enum migration follow that rule; the additive value is ONE **migration included in PR-C**, applied **migrate-before-image on the Neon direct endpoint** per the approved direct-migration procedure — **not authorized now**; any staging application is gated by the existing **P1/P8/P9/R1** recovery sequence (owner decision §15). No in-app write is attempted while the DB is down.
  - **Degraded vs recovery are DISTINCT alert identities (never mutually suppressing) — LOCKED (CodeRabbit):** the alert **phase** is explicit — `DEGRADED` or `RECOVERED`. (a) The **process-local single-flight key includes the sweep + alert-type + PHASE**, so a degraded attempt and a recovery attempt are never the same key; a duplicate degraded coalesces only with degraded, a duplicate recovery only with recovery. (b) The **persisted dedup identity includes recipient + notification-type + PHASE + window**, so **a recovery notice is NEVER suppressed by a recent degraded notice** (and vice-versa); only a same-phase duplicate inside the window is suppressed. (c) **Minimal representation (recommended, smallest source-compatible):** ONE additive maintenance-status `NotificationType` (candidate `ADMIN_MAINTENANCE_DEGRADED`) PLUS a **persisted phase discriminator** (e.g. `referenceType='DEGRADED'|'RECOVERED'`) folded into the dedup key; the alternative is two distinct types (`…_DEGRADED`/`…_RECOVERED`). Either way the phase is part of BOTH the single-flight key and the persisted dedup identity. Any additive enum value is ONE additive `NotificationType` migration in PR-C under **migrate-before-image** ordering, gated by the existing **P1/P8/P9/R1** sequence (owner decision §15) — **not authorized now**.
  - **Non-DB degradation (DB still reachable):** if a sweep degrades for a reason that does NOT take the DB down (e.g. repeated Phase-B/Redis failures crossing `alertAfterFailures`), the in-app `DEGRADED` notice MAY be written immediately (the DB is reachable), and a later successful scan then emits a distinct `RECOVERED` notice — both carry the explicit phase, so the recovery is never suppressed by the degraded.
  - **No email-based alert** — an email alert would recurse through the same failing outbox.
  - **Alert execution contract (Codex async-seam):** the scheduler calls the alert seam **synchronously and never awaits it**. The seam: emits the **structured redacted stderr/provider log immediately** (synchronous); launches any in-app DB write **fire-and-forget with a `.catch`**, so a rejected Promise can never become an unhandled rejection or break scheduler rescheduling; enforces **at most one in-flight (or coalesced) attempt per alert key** — the key includes the sweep + alert-type + **phase** (`DEGRADED`/`RECOVERED`), so degraded and recovery are separate keys (process-local single-flight); **suppresses in-app DB writes while the DB is known-degraded** (log-only), so repeated degraded scans do not pile up write attempts; attempts the **in-app recovery notice only after a successful DB-recovery signal** (a subsequent successful scan clearing the degraded state); on **`stop()`** launches **no new alert**, **tracks in-flight attempts and awaits them with a bound (bounded drain)**, and after the bound proceeds so the controlled Prisma `$disconnect()` may reject any still-in-flight write (`.catch`'d) — so scheduler shutdown **cannot wait indefinitely** for an alert DB write and cannot race `$disconnect()` into an unhandled rejection. **Durability honesty:** the "recovery-notice-pending" marker is **process-local**, so a worker restart during the outage loses it — the post-recovery notice is **best-effort across restart, NOT guaranteed**. A guaranteed post-recovery notice would need durable incident persistence (a small table), a **separately-gated** follow-up; v1 does not imply a guaranteed notification.
- **"Metrics" definition for v1 (no new backend):** process-local counters (`scanned/re_enqueued/expired/promoted/failed{sweep}`, `degraded_db{sweep}`, last-run duration) surfaced via **structured logs**, plus the **persisted** evidence already available (the in-app `ADMIN_DELIVERY_FAILED` rows and the FAILED `CommunicationLog` rows). **No external metrics provider is introduced** (none exists in source); a future external metrics backend is explicitly out of scope.

---

## 8. Backlog, isolation, and clock (Codex #3, #6)

### 8.1 Backlog
`>200` eligible rows: each sweep keeps LIMIT-200, oldest-first; a full batch → that sweep enters ACTIVE (`F_active`) and re-scans until empty. Bounded per tick.

### 8.2 Isolation (real, per §4.1)
Per-sweep independent state, error boundary, backoff, timeout (§4.2), metrics, and enable flag; last-success/last-failure recorded per sweep. Disabling one sweep leaves the others running on the floor (§4.3, and never enables 60s polling — §9 rollback). Sequential execution hard-bounds each sweep's **Phase A**; **end-to-end** HOL prevention (including a blocked Phase-B `Queue.add`, or a cold-start readiness hang) depends on the finite producer LIFECYCLE gate (§4.2 / §9, mandatory pre-release): bounded readiness/connection establishment AND bounded command-await + force-close (`commandTimeout` alone is not the complete bound). Without that gate, a blocked enqueue or a Redis-down cold start HOL-blocks later sweeps in the tick and delays graceful shutdown — so v1 is not shipped without it. **At shutdown**, a **terminal cooperative stop** (checked before every sweep, after each awaited sweep, and before every Phase-B row) plus a **bounded post-force join** guarantee no new sweep or row begins after resources close — the force-close makes any in-flight op reject rather than cancelling it (§4.6).

### 8.3 Clock — DB-authoritative (Codex #6)
Today the sweeps use the application `new Date()`. **Decision: read one authoritative `SELECT now()` per Phase-A transaction and pass that `dbNow` to every predicate in that sweep** (grace cutoff, max-age cutoff, `effectiveAt <= dbNow`). This makes the clock DB-authoritative and eliminates worker-clock skew across replicas; it integrates cheaply because Phase A already opens a transaction. The pure sweep functions change from `now: Date = new Date()` to receiving `dbNow` read inside `tx` (test override retained). **Clock-skew tests required:** a sweep given a deliberately-skewed application clock still uses `dbNow` for its predicates; two "replicas" with different app clocks compute identical cutoffs from the DB clock. We do **not** claim DB-authoritative time anywhere without this implementation.

---

## 9. Cost, load-test gates, and rollout (Codex #6, #8)

**Approximate cost (candidate cadences, NOT locked; Launch $0.106/CU-hr; Free 100 CU-hr/mo; staging @0.25). `F_idle` must be > 5 min.**

| `F_idle` | ~duty | ~CU-hr/mo (staging) | ~$/mo |
|---|---|---|---|
| 15 min | ~33% | ~61 | ~$6.5 |
| 30 min | ~17% | ~30 | ~$3.2 |
| 60 min | ~8% | ~15 | ~$1.6 |

No zero-query option for the outbox floor. In production the floor's marginal wake cost is **lower (compute already awake), not free** — it still consumes DB/worker capacity and may extend active time.

**Gates before any cadence/CU maximum is locked:** query plans / index verification (`EXPLAIN (ANALYZE, BUFFERS)` on both reconciler tiers + pending-hours + stale-claim; index-covered, no seq scan at production row counts); realistic backlog benchmarks (10k+ rows drain via LIMIT-200); idle-CU measurement per candidate `F_idle`; worker + DB load tests with an explicit worker Prisma pool `max`; a post-deployment 48-72h burn-rate window; stop conditions if spend/latency exceed budget. **The owner-set `$20` Neon spending limit is honoured as owner-set; its exact hard-stop enforcement remains UNVERIFIED.**

**Mandatory pre-release CORRECTNESS gates (Codex boundedness), in addition to the cost gates:** (i) the **locked finite producer LIFECYCLE** (§4.2 — lazy dedicated producer; finite connection establishment via `connectTimeout` + finite `retryStrategy` + BullMQ `skipWaitingForReady`; `enableOfflineQueue:false`; finite `commandTimeout` + `maxRetriesPerRequest`; error-eviction + force-`disconnect()` + recreation; blocking Worker connection separate at `maxRetriesPerRequest:null`) bounding BOTH cold-start readiness AND the command await (`commandTimeout` alone is insufficient; outcome UNKNOWN, jobId replay preserves correctness); (ii) the **deterministic-jobId producer contract + guard** (no unkeyed `Queue.add`); (iii) the **bounded shutdown contract (§4.6)** with a verified no-lingering-handles test (incl. Redis-unavailable/half-open). Until these are implemented + verified, the sweep is NOT end-to-end bounded and v1 must not ship. These are release gates, not cost preferences.

**Rollout ordering (Codex #8):** the worker remains **Offline through the entire code/test stack (all PRs)**. (1) Merge + verify PR-A..PR-D with the worker Offline; (2) benchmark only against disposable loopback Postgres unless separately approved; (3) complete provider/runbook gates; (4) perform **one separately owner-approved staging activation**; (5) observe 48-72h; (6) stop/pause immediately if a cost, latency, or correctness gate fails. **No incremental "deploy PR-A and observe while the other 60s sweep still runs" step.**

---

## 10. Transactional outbox (O5) scope (Q7, unchanged)

The notify()-gap (`CommunicationLog` committed in `notify()`'s own transaction, not the caller's) is a separate correctness concern that does not affect cadence/wake. **Keep O5 as a separately-scoped correctness release, NOT in the first CU-burn fix** (it would touch every `notify()` caller). Owner decision (§15).

---

## 11. Alternatives + decision matrix (output 2)

| Option | Durable guarantee? | Redis-loss safe (scheduling)? | Idle Neon cost | Recommendation |
|---|---|---|---|---|
| O1 status quo (60s BullMQ repeatable) | yes (Redis-scheduled) | **no** | continuous ~182 CU-hr/mo | reject (the problem) |
| O2 Redis-only work-gate | **no** | no | ~0 | reject (breaks durability) |
| O3 fixed lengthened BullMQ repeatable | yes (Redis-scheduled) | no | ~61 CU-hr/mo | partial |
| **O4 process-local-timer floor + per-sweep bounded locked phase + advisory lock** | yes (DB + boot re-derivation) | **yes** (timer Redis-independent) | env-tuned (30 min ≈ 30 CU-hr/mo) | **RECOMMENDED v1** |
| O4+C dedicated singleton scheduler process | yes | yes | lowest wake count | horizontal-scaling evolution |
| O5 transactional outbox | strongest correctness | yes | same as O4 | separate release (§10) |

---

## 12. Correctness / threat / failure model (output 4)

- **Lost single enqueue:** row QUEUED; re-enqueued at the next floor observation after the 2-min grace. Max latency = 2m + `F_idle` (or `F_active`).
- **Timed-out / crashed sweep:** the Phase-A transaction rolls back → lock released + statement cancelled; no DB work continues outside leadership; only idempotent Phase-B enqueue may run.
- **Shutdown mid-tick (Codex):** the terminal cooperative stop signal is checked before every sweep, after each awaited sweep, and before every Phase-B row, so no new sweep/row starts once stop is requested; a drain-timeout force-close makes the in-flight op REJECT (not cancelled), a bounded `forceJoin` awaits the unwinding tick catching the rejection, and `process.exit()` (`worker.ts:114`) is the equally-safe fallback (§4.6). No DB/Redis op begins after resources close.
- **Two replicas / rolling-deploy overlap:** per-sweep advisory lock → only one runs a given sweep's Phase A; graceful shutdown drains in-flight; but N replicas still each wake the DB with the lock-check query, so replicas=1 is enforced + verified (§4.3).
- **Redis outage <24h:** delayed not lost; expiry + promotion (DB-only) continue; delivery resumes on Redis return. **≥24h:** terminal loss for rows aging past 24h, alerted (§7).
- **DB outage:** per-sweep DEGRADED with capped backoff + external-log alert; in-app recovery notice after the DB returns.
- **Clock skew:** DB-authoritative `dbNow` per scan (§8.3) removes worker-clock skew.
- **Config missing/invalid:** fail-safe refusal (§14), never a silent burn path or unbenchmarked cadence.
- **Delivery:** at-least-once with 24h provider dedup; bounded terminal loss (§5, §7).

---

## 13. Source-to-design cross-check (output 8)

| Element | Source | Preserved / changed |
|---|---|---|
| Outbox durable row + commit-then-enqueue | `notify.ts:173-222` | preserved |
| Reconciler two-tier + fixed window + 24h expiry | `outboxReconciler.ts:70-110` | preserved; alerting added (§7) |
| Idempotency | `email.ts:47-55,77,92`, `index.ts:71-75` | preserved |
| Sweep indexes | `schema.prisma:1750,716-722` | preserved; EXPLAIN-verified |
| Pending-hours row + nudge + sweep | `branch/service.ts:1058-1062`, `promotePendingHours.ts` | preserved; sweep moves to the floor; `promoteOnePendingHours` re-parameterised on `tx` |
| Application-clock `new Date()` | `outboxReconciler.ts:70` etc. | **changed** to DB-authoritative `dbNow` (§8.3) |
| 3 BullMQ repeatables | `worker.ts:92-94` | **replaced** by the process-local floor |
| No leader lock; single-replica | `worker.ts:84-94` (absence) | **hardened**: per-sweep advisory lock + enforced+verified replicas=1 |
| Advisory-lock precedent | `redemption/service.ts:410-426` | reused, xact-scoped |
| Alert seam | `adminNotify()` + `ADMIN_DELIVERY_FAILED` (emission deferred in source) | **enabled** for expiry/degraded (§7) |
| Redis `noeviction`; state in Redis | `connection.ts:14-17` | unchanged; floor no longer depends on it |
| Graceful shutdown | `worker.ts:99-119` | preserved; **terminal cooperative stop + awaited bounded drain** (`await scheduler.stop()`) + **bounded post-force join** (`forceJoin`) added before resource close; existing `finally { process.exit() }` (`:114`) is the fallback |

---

## 14. Fail-safe configuration (Codex #9)

For a running (staging/production) worker the maintenance config MUST be explicit — there is **no silent default into either an unbenchmarked adaptive cadence or the legacy 60s burn path.**

**Canonical startup policy — `MAINTENANCE_MODE` is resolved FIRST, then the scheduler values (locked order, Codex #7 / CodeRabbit):**

1. **Resolve `MAINTENANCE_MODE` before any scheduler-value validation.**
   - **`MAINTENANCE_MODE=disabled`** — the ONLY intentional maintenance-off path. The worker boots WITHOUT the scheduler and emits a loud structured log; the scheduler values are NOT required in this mode.
   - **`MAINTENANCE_MODE` unset OR `=enabled`** — maintenance is ON (the default is enabled); proceed to step 2.
   - **`MAINTENANCE_MODE` = any other/unsupported value** — **FAIL STARTUP non-zero.** An unrecognised mode is never coerced to disabled or enabled.
2. **When enabled (explicit or defaulted), every required scheduler value must be present AND valid:** `MAINTENANCE_FLOOR_IDLE_MS` (`> 300_000`), `MAINTENANCE_FLOOR_ACTIVE_MS`, `MAINTENANCE_PHASE_B_MAX_ITEMS`/`_BUDGET_MS`, per-sweep enable flags, `STATEMENT_TIMEOUT_MS < TX_TIMEOUT_MS`. Missing or invalid → the validator **throws and the worker exits non-zero** (fail-startup, supervisor-visible).
3. **A validation failure MUST NEVER silently become disabled mode.** There is **no silent half-running-with-maintenance-off default**, **no defaulted cadence**, and **no `MAINTENANCE_FLOOR_ENABLED=false → legacy 60s` path** (see §15 rollback and Codex #4). Only an explicit `MAINTENANCE_MODE=disabled` turns maintenance off; an invalid config **fails the process, it does not disable it**.

Local/test may pass explicit test config.

---

## 15. Owner decisions + unresolved evidence (output 9)

**Owner decisions:**
1. Ownership: v1 = enforced+Railway-verified replicas=1 + per-sweep advisory lock (recommended); confirm the dedicated singleton scheduler as the >1-replica trigger.
2. External scheduler (Railway cron / Neon pg_cron) ever in scope (provider-verification-required; not v1).
3. O5 transactional outbox: keep separate (recommended).
4. Alert contract per §7: fan-out via `getAlertableAdmins()` + one `adminNotify()` per recipient (in-app-only, no email); `ADMIN_DELIVERY_FAILED` for expiry; an **explicit degraded/recovery identity with the phase (`DEGRADED`/`RECOVERED`) in BOTH the single-flight key and the persisted dedup identity so a recovery is never suppressed by a recent degraded** — minimal representation = ONE additive maintenance-status `NotificationType` (candidate `ADMIN_MAINTENANCE_DEGRADED`) + a persisted phase discriminator (e.g. `referenceType`), OR two distinct types; **dedup persistence** (DB-backed recommended vs process-local single-replica-only); the dedup window value; redaction; metrics = process-local counters + structured logs + in-app rows.
4a. **`MAINTENANCE_MODE` semantics (§14):** `disabled` is the only intentional maintenance-off opt-in (boots without the scheduler + loud log); unset/`enabled` = on (default enabled); any other/unsupported value fails startup; a validation failure never silently disables.
5. Clock: DB-authoritative `dbNow` (recommended, §8.3).
6. Candidate `F_idle` ranges for staging vs production (final values benchmark-gated, §9).
7. Production autoscaling sizing and treatment of the owner-set `$20` limit (enforcement UNVERIFIED).
8. **Rollback model (Codex #4):** primary rollback = **pause the worker (Offline) + redeploy the previously-verified image** (the prior image carries the old 60s repeatables and is redeployed only as a deliberate, cost-accepted emergency). The new image does **not** contain a flag that re-enables 60s polling. Confirm this model.
9. Separate items: `passwordless_access` provider-security review; `MIGRATION_DATABASE_URL` (D-R8).

**Unresolved evidence:** no provider telemetry attributes historical CU-hours; live Railway replica/healthcheck config UNVERIFIED (must be verified during PR-E); historical frontend-polling contribution unquantified; whether a second branch compute was simultaneously warm; exact `$20` hard-stop behaviour UNVERIFIED; provider availability of Neon pg_cron / Railway cron unverified (only relevant if Option D is ever chosen). (The `adminNotify` signature + `getAlertableAdmins` recipient set are **verified** — no longer unresolved; only a routine source-drift recheck before implementation remains.)

---

## 16. Holds (unchanged)

All operational holds remain: `neon-observer` no-use hold; P1/P8/P9 blocked; no R1; no R2/R3/R4 or Operations A/B; no Phase 2B credential rotation; no Neon/Railway/Redis access, MCP invocation, migration, deployment, restart, resume/unarchive, autoscaling change, or key action; PR #338 untouched. Docs-only.

---

## 17. Required-outputs index

1. Architecture spec — §3-§8. 2. Alternatives/decision matrix — §11. 3. Scheduler state machine + ownership — §4. 4. Correctness/threat/failure — §12. 5. Cost + load-test gates — §9. 6. Staged PR plan (source+tests together) — the implementation plan. 7. Deployment/rollback/observation runbook — implementation plan + §9/§15.8. 8. Source-to-design cross-check — §13. 9. Owner decisions + unresolved evidence — §15.
