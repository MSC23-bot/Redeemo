# Strict-marker dry-run packet: pre-fix staging DRAFT rows (READ-ONLY, NOT APPLIED)

Status: DRY-RUN ONLY. No write has been performed. This packet exists so the owner can
approve (or decline) stamping the two pre-fix rows during a later staging deployment /
reconciliation window. Do NOT run the UPDATE without separate owner approval. Production is
out of scope entirely.

## Context

PR #528 (`430de8f0`) makes every NEWLY created voucher strict via a server-owned
`__submitContract: 'strict-v1'` marker. Rows created BEFORE that change are markerless and
therefore stay legacy-exempt (they can still submit incomplete). The authorized read-only
staging inventory found exactly two such submittable-DRAFT rows. Both are mandatory RMV
drafts for a single merchant, created 2026-07-13 during this programme's own testing (empty
bags, no structured mechanic): recent artifacts, not genuine pre-S5 merchant offers.

## The two rows (staging only; identifiers included per the packet request)

| Voucher id | Code | Merchant id | Type | Status | Bag now | Has marker | Has strict-contract |
|---|---|---|---|---|---|---|---|
| 56c58c9f-5036-4374-8460-d60cb4088e41 | RMV-02CAB5B1 | 18f19a3f-fa01-4b3f-8d15-4ee9fb609713 | PACKAGE_DEAL | DRAFT | `{}` | no | no |
| fb4ad3e1-f1d0-47dc-ab9f-7f48e6427e94 | RMV-CD2282BA | 18f19a3f-fa01-4b3f-8d15-4ee9fb609713 | SPEND_AND_SAVE | DRAFT | `{}` | no | no |

No merchant/customer PII, secrets, or voucher content is included; both bags are empty `{}`.

## Recommended eventual disposition (Codex + lead)

Stamp ONLY these two known ids during the later staging deploy/reconciliation window, so
they fall under the strict contract and fail closed at submit until the merchant completes
the mechanic. Do not invent a createdAt cutover, do not backfill any other row, do not
require merchant resaves, do not add a schema migration.

## Exact targeted change (staging branch `br-ancient-water-abdbzcyu` only; NOT APPLIED)

```sql
-- Adds the server-owned strict marker to exactly the two known pre-fix rows.
-- Idempotent (jsonb_set with an existing {} bag); touches nothing else.
UPDATE "Voucher"
SET "merchantFields" = jsonb_set(
      coalesce("merchantFields"::jsonb, '{}'::jsonb),
      '{__submitContract}', '"strict-v1"', true)
WHERE id IN (
  '56c58c9f-5036-4374-8460-d60cb4088e41',
  'fb4ad3e1-f1d0-47dc-ab9f-7f48e6427e94'
);
-- Expected: UPDATE 2. Post-check: both rows has_strict_contract = true; both now fail
-- closed at submit (empty bag, no mechanic). Reversible by removing the key.
```

## Effect after stamping

Both rows would move from legacy-exempt to strict: a submit attempt returns
`VOUCHER_INCOMPLETE` (they carry no mechanic fields) until the merchant fills the builder,
which is the intended, honest end state for an unfinished mandatory flagship draft.
