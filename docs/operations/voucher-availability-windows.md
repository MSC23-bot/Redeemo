# TIME_LIMITED Voucher Availability Windows — API Contract Reference

> **Audience:** future Phase 4 Merchant Portal engineers, future M5 REUSABLE
> workstream, ops on-call when investigating window-related redemption
> rejections.

## Schema

`VoucherAvailabilityWindow` table — see `prisma/schema.prisma`:

| Field | Type | Notes |
|---|---|---|
| `id`        | UUID    | PK |
| `voucherId` | UUID    | FK → `Voucher.id` (`ON DELETE CASCADE`) |
| `dayOfWeek` | Int     | 0=Sun, 1=Mon, …, 6=Sat — matches `BranchOpeningHours.dayOfWeek` |
| `openTime`  | String  | `"HH:mm"` wall-clock Europe/London, range `[00:00, 23:59]` |
| `closeTime` | String  | `"HH:mm"` wall-clock Europe/London, range `[00:01, 23:59]` OR special sentinel `"24:00"` |

Index: `(voucherId)`.

`VoucherRedemption.windowStartsAt: DateTime?` (M4a-6.1) — persisted at redemption time for TIME_LIMITED vouchers as the current window-occurrence's startsAt; null for all other types. Combined with `@@unique([userId, voucherId, windowStartsAt])` this is the schema-level enforcement of "one redemption per (user, voucher, window-occurrence)". Postgres NULLs are distinct in unique indexes so non-TIME_LIMITED rows don't conflict.

## Validation rules (enforced at merchant CRUD layer per `src/api/merchant/voucher/service.ts`)

1. Each row = one window-occurrence per week. Split-day (lunch + dinner) = two rows.
2. Half-open ranges: `[openTime, closeTime)`. Boundary-touching (`11:00-15:00` + `15:00-18:00`) is NOT overlap.
3. Cross-midnight uses two rows + the `"24:00"` sentinel:
   - Friday: `(dayOfWeek: 5, openTime: "22:00", closeTime: "24:00")`
   - Saturday: `(dayOfWeek: 6, openTime: "00:00", closeTime: "02:00")`
   - Sentinel `"24:00"` is valid ONLY in `closeTime`, NEVER `openTime`.
4. No overlapping windows for the same `(voucherId, dayOfWeek)`.
5. Branch-hours overlap is NOT enforced in v1 (Phase 4 portal concern).
6. Wall-clock Europe/London semantics. BST/GMT applies automatically.
7. Publishing/activating a TIME_LIMITED voucher requires ≥1 window.

## Endpoints

### Create voucher with windows

`POST /api/v1/merchant/vouchers`

```json
{
  "type": "TIME_LIMITED",
  "title": "Lunch BOGO",
  "estimatedSaving": 8.50,
  "availabilityWindows": [
    { "dayOfWeek": 1, "openTime": "11:00", "closeTime": "15:00" },
    { "dayOfWeek": 2, "openTime": "11:00", "closeTime": "15:00" }
  ]
}
```

### Update windows

`PATCH /api/v1/merchant/vouchers/:id` with `availabilityWindows: [...]` REPLACES all rows wholesale.

### Submit / publish

`POST /api/v1/merchant/vouchers/:id/submit` rejects with `TIME_LIMITED_REQUIRES_WINDOW` if the voucher is `TIME_LIMITED` and has zero windows.

### Redemption guard errors (flat error shape per `AppError.toJSON()`)

| Code | When | Wire payload |
|---|---|---|
| `VOUCHER_OUTSIDE_AVAILABILITY_WINDOW` | No window is currently open | `{ "error": { "code": "...", "message": "...", "statusCode": 400, "nextWindowAt": "ISO" \| null } }` |
| `ALREADY_REDEEMED_THIS_WINDOW` | User already redeemed in the current occurrence | Same flat shape with `nextWindowAt` |

Note: `nextWindowAt` is FLAT on `error`, NOT nested under `error.details`. Customer-app reads it via the `details` spread in `ApiClientError` (see `apps/customer-app/src/lib/api.ts` lines 181-199) and the `RedemptionErrorSchema` discriminated union in `apps/customer-app/src/lib/api/redemption.ts`.

#### Schedule string is derived CLIENT-SIDE, not on the wire

The error payload returns ONLY `nextWindowAt`. **The schedule string ("Mon-Fri, 11am-3pm", "Tuesdays, 6-10pm" etc.) is NOT on the wire** — it is derived client-side by the customer-app's `scheduleString` formatter from `voucher.availabilityWindows`, which is already on every customer payload.

This is an intentional deviation from spec §3.9's original `{ nextWindowAt, schedule }` framing. Reasons:

- Single source of truth: `availabilityWindows` is the canonical schedule data; deriving the string client-side avoids duplicating the formatter implementation (day-name compaction + 12-hour conversion + `"24:00"` sentinel merging) on the server.
- The customer-app needs the formatter anyway for `<TimeLimitedDetailsCard>` "Available during" rendering — making it the natural canonical source.
- The error envelope stays minimal — no per-locale schedule pre-formatting needed if the platform ever expands internationally.

**Implication for M4b:** the graceful boundary-race recovery copy ("This window just closed. Try again next window: Tue 11am") composes the day/time string client-side from the voucher's `availabilityWindows` + the `nextWindowAt` instant from the error payload. No backend payload change is needed.

Tracked as **deferred-followup §AJ3** in `~/.claude/projects/.../memory/project_deferred_followups_index.md`.

## Customer payload

Both `GET /api/v1/customer/vouchers/:id` and the voucher rows in `GET /api/v1/customer/merchants/:id` carry the same TIME_LIMITED fields:

- `availabilityWindows`: array of `{ dayOfWeek, openTime, closeTime }` (empty for non-TIME_LIMITED)
- `currentWindow`: `{ startsAt: ISO, endsAt: ISO } | null`
- `nextWindow`: `{ startsAt: ISO, endsAt: ISO } | null`
- `redeemedWindow`: `{ startsAt: ISO, endsAt: ISO } | null`

`isRedeemedThisCycle` is always `false` for TIME_LIMITED. `availableAgainAt` is always `null` for TIME_LIMITED (customer-app reads `nextWindow.startsAt` for the "Available again" copy).

## Operational notes

### No new Redis namespace
TIME_LIMITED uses `VoucherRedemption.redeemedAt` + `windowStartsAt` as source of truth — no per-window state table needed.

### Cycle-state bypass
`UserVoucherCycleState` is NOT written for TIME_LIMITED redemptions. The redemption guard branches on voucher type. Non-TIME_LIMITED path unchanged.

### Race protection (M4a-6.1)
Two concurrent TIME_LIMITED redemptions for the same `(user, voucher, window-occurrence)` cannot both succeed: the schema-level `@@unique([userId, voucherId, windowStartsAt])` constraint fires P2002 on the second insert, which the service translates to `ALREADY_REDEEMED_THIS_WINDOW` with the standard `nextWindowAt` payload.

### Prisma migration in non-interactive environments

When running `npx prisma migrate dev --name ...` from a non-interactive shell (CI agent, subagent execution, automation pipeline), the Prisma CLI fails with **"non-interactive environment is not supported"**. Workaround:

```bash
# 1. Generate the SQL via schema diff (no TTY required)
npx prisma migrate diff \
  --from-database --to-schema-datamodel prisma/schema.prisma \
  --script > /tmp/migration.sql

# 2. Manually create the migration directory
TS=$(date +%Y%m%d%H%M%S)
mkdir -p "prisma/migrations/${TS}_<description>"
mv /tmp/migration.sql "prisma/migrations/${TS}_<description>/migration.sql"

# 3. Apply + regenerate client
npx prisma migrate deploy
npx prisma generate
```

The resulting migration is byte-equivalent to what `migrate dev` would have produced. Used in M4a-6.1 (`20260511000700_voucher_redemption_window_unique`).

### Forward-compat for Phase 4 / M5
Adding `maxRedemptionsPerWindow Int @default(1)` to `VoucherAvailabilityWindow` is a non-breaking additive migration when configurable per-window quotas are needed (§T1 R5 — REUSABLE). The redemption guard reads the column; no customer-payload migration of existing data needed.

## Spec reference

- `docs/superpowers/specs/2026-05-10-voucher-detail-m4-time-limited-design.md` (locked baseline).
- `docs/superpowers/plans/2026-05-10-voucher-detail-m4-time-limited.md` (this implementation plan).

## Cross-references

- §W production-resilience standing checklist — TIME_LIMITED concentrates redemption traffic at window-open moments; v1 does not add rate-limit changes but the pattern is flagged.
- §T (TIME_LIMITED + REUSABLE umbrella) — REUSABLE is a separate workstream with cooldown semantics.
- §AH (renewal vs expiry copy precedence) — TIME_LIMITED extends §AH with `"Available again"` copy distinct from `"Renews on"` (cycle) and `"Offer ends"` (expiry).
