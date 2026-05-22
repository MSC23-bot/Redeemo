# §CD Voucher Keyword Search v1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `searchBranches` to match the user query against curated voucher content (title + description), so customers typing voucher-language phrases like `Bottomless Brunch` or `Free Coffee` find merchants whose VOUCHERS describe those things — even when the merchant's name / category / tags don't carry the phrase. Surface a `matchContext` line on the SearchResultItem so the user understands WHY a merchant appeared via the voucher path.

**Architecture:** Backend-first additive change to `searchBranches` predicate (single-token + multi-token); per-tile `matchContext` computation in-process after enrichment; `BranchTile` wire-shape additive `matchContext: string | null`. Customer-app `<SearchResultItem>` renders the line. No relevance scoring (deferred). No customer-web mirror. No `searchMerchants` change. v1 explicitly excludes voucher.terms.

**Tech Stack:** Existing — Prisma 7 + Fastify; customer-app jest-expo + Zod schema; vitest real-DB integration tests.

---

## §0 — Locked decisions (owner approval 2026-05-22)

| # | Decision | Locked value |
|---|---|---|
| §0.1 | Voucher fields searched | **`title` + `description` ONLY.** `terms` DEFERRED to v2 — owner direction: "voucher T&Cs are likely to be boilerplate and repeated; a user searching a word that appears in T&Cs is probably not looking for that voucher." Acknowledged with no pushback (high noise-to-signal ratio even with length gates). |
| §0.2 | `matchContext` copy (locked) | **`Found in "{voucherTitle}" voucher`** — escaped double-quotes around the title; "voucher" suffix for noun-context. |
| §0.3 | `matchContext` shape | **`string \| null`** (minimal). No voucher id, no voucher type, no voucher savings amount. v1 keeps the wire payload tight; deep-linking deferred. |
| §0.4 | `description` length gate | **`MIN_DESCRIPTION_MATCH_LENGTH = 5`** — mirrors the PR #112 fixup-4 `merchant.description` gate. `voucher.title` stays ungated. |
| §0.5 | Multi-token AND-OR | Each token's per-field OR includes voucher.title + voucher.description (gated on full-q length ≥ 5). NOT voucher.terms (excluded per §0.1). |
| §0.6 | matchContext fires only when voucher is the driving signal | When the merchant ALSO surfaces via merchant.businessName / category / curated Tag / branch fields, matchContext is NOT shown. Keeps card uncluttered; voucher context only appears when otherwise unexplained. |
| §0.7 | Multiple matching vouchers priority | **title-match > description-match.** Within same tier: first by `Voucher.createdAt ASC` (deterministic; consistent across re-fetches). |
| §0.8 | `voucher.title` minimum length | **No gate.** Titles are concise; short title-matches are signal. |
| §0.9 | Scope cascade | Unchanged. Voucher-matched merchants flow through the existing rank-then-classify pipeline; cascade widens normally if narrow tiers have no supply. |
| §0.10 | Branch name | `feature/plan-4-voucher-keyword-search` off `main` at `5dbd3b4`. |
| §0.11 | Tier / planning mode | Tier 2 plan-first. This document IS the plan-lock. |

## §0.12 — Hard scope boundaries (owner-locked)

NOT in v1:
- No customer-web changes (`searchMerchants` stays legacy until §CU.1).
- No `searchMerchants` predicate change.
- No `voucher.terms` matching (deferred to v2 if relevance model justifies).
- No Map work (§CZ + §CK deferred together).
- No Home polish (§CO / §CW / §CX / §CY).
- No SearchChip component (§CP locked).
- No §CP proximity-chip / scope-pill alignment.
- No voucher-detail deep-linking from matchContext.
- No relevance-scoring overhaul (voucher-title ABOVE description-match ordering — deferred).
- No matchContext on TAG / null / business-name paths (per §0.6).

---

## File Structure

**Backend (modified):**
- `src/api/customer/discovery/service.ts` — extend the single-token `where.OR` build + multi-token `fieldOrForToken` with a voucher-side branch; extend `MERCHANT_TILE_SELECT.vouchers.select` to include `title` (and `description` if matchContext computation needs it); add per-tile `matchContext` computation after enrichment.
- `src/api/customer/discovery/branchTileSchema.ts` (the Zod source-of-truth for the wire shape) — add `matchContext: z.string().nullable()`.

**Backend (created):**
- `tests/api/customer/discovery/voucher-search.test.ts` — 6 pins (positive title + description; negative pending/inactive vouchers; negative description-gate at q < 5; matchContext shape).

**Customer-app (modified):**
- `apps/customer-app/src/lib/api/discovery.ts` — add `matchContext: z.string().nullable().optional()` to `branchTileSchema`.
- `apps/customer-app/src/features/search/components/SearchResultItem.tsx` — render matchContext line below the meta row when present.

**Customer-app (created):**
- `apps/customer-app/tests/features/search/SearchResultItem.matchContext.test.tsx` — 3 pins (renders when set; hidden when null; locked copy format).

---

## Task A — Backend: voucher predicate (single-token + multi-token)

**Files:**
- Modify: `src/api/customer/discovery/service.ts` (searchBranches `where.OR` + `fieldOrForToken`)

- [ ] **Step 1: Write the failing test**

```ts
// tests/api/customer/discovery/voucher-search.test.ts
import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../../../src/api/app'
import { PrismaClient } from '../../../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma  = new PrismaClient({ adapter })
const HUDDERSFIELD = { lat: 53.6458, lng: -1.785 }

let app: FastifyInstance

beforeAll(async () => {
  app = await buildApp()
  app.decorate('prisma', prisma as any)
  app.decorate('redis', { get: async () => null, set: async () => 'OK', del: async () => 1 } as any)
  await app.ready()
}, 60_000)

afterAll(async () => {
  if (app) await app.close()
  await prisma.$disconnect()
})

describe('§CD voucher keyword search v1 — title + description', () => {
  it('q matching voucher.title surfaces the merchant (e.g. "samosa" → Karaara via KAR-RMV-002)', async () => {
    // Karaara's KAR-RMV-002 voucher title is "FREEBIE samosa with chai" per
    // prisma/seed.ts.  q="samosa" doesn't match the merchant name, category,
    // or any curated tag — voucher.title is the ONLY signal.
    const res = await app.inject({
      method: 'GET',
      url:    `/api/v1/customer/search?q=samosa&lat=${HUDDERSFIELD.lat}&lng=${HUDDERSFIELD.lng}&limit=30`,
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    const names = (body.branches as { merchant: { businessName: string } }[])
      .map(b => b.merchant.businessName.toLowerCase())
    expect(names.some(n => n.includes('karaara'))).toBe(true)
  })
})
```

(Adjust the seed-specific assertion to whatever voucher title is unambiguously voucher-only.)

- [ ] **Step 2: Run test (expect fail)**

```bash
cd /Users/shebinchaliyath/Developer/Redeemo
npx vitest run tests/api/customer/discovery/voucher-search.test.ts
```
Expected: FAIL — voucher predicate not yet wired; merchant doesn't surface.

- [ ] **Step 3: Add voucher branch to single-token `where.OR`**

In `searchBranches` body, where the single-token `where.OR` is built (around line 2833 post-M4):

```ts
where.OR = [
  ...fieldOrForToken(normalizedQ),
  ...(tagMerchantIds.length > 0 ? [{ merchant: { id: { in: tagMerchantIds } } }] : []),
  ...(tagMatch
    ? [
        { merchant: { tags:       { some: { tagId: tagMatch.id } } } },
        { merchant: { highlights: { some: { highlightTagId: tagMatch.id } } } },
      ]
    : []),
  // §CD v1 — voucher keyword search (title + description only; terms DEFERRED).
  //   - title:       no length gate (titles are concise, short matches = signal)
  //   - description: gated on q.length >= 5 (mirrors MIN_DESCRIPTION_MATCH_LENGTH)
  //   - status / approvalStatus gate matches the existing MERCHANT_TILE_SELECT
  //     vouchers filter — only ACTIVE + APPROVED vouchers drive the match.
  {
    merchant: {
      vouchers: {
        some: {
          status:         VoucherStatus.ACTIVE,
          approvalStatus: ApprovalStatus.APPROVED,
          OR: [
            { title: { contains: normalizedQ, mode: 'insensitive' as const } },
            ...(includeDescriptionMatch
              ? [{ description: { contains: normalizedQ, mode: 'insensitive' as const } }]
              : []),
          ],
        },
      },
    },
  },
]
```

- [ ] **Step 4: Add voucher branch to multi-token `fieldOrForToken`**

Inside `fieldOrForToken(token)`'s `variants.flatMap(...)`, append:

```ts
// §CD v1 — voucher keyword search per-token (multi-token AND-OR).
{
  merchant: {
    vouchers: {
      some: {
        status:         VoucherStatus.ACTIVE,
        approvalStatus: ApprovalStatus.APPROVED,
        OR: [
          { title: { contains: v, mode: 'insensitive' as const } },
          ...(includeDescriptionMatch
            ? [{ description: { contains: v, mode: 'insensitive' as const } }]
            : []),
        ],
      },
    },
  },
},
```

- [ ] **Step 5: Run test (expect pass)**

```bash
npx vitest run tests/api/customer/discovery/voucher-search.test.ts
```
Expected: PASS (single pin).

- [ ] **Step 6: Commit**

```bash
git add src/api/customer/discovery/service.ts tests/api/customer/discovery/voucher-search.test.ts
git commit -m "feat(§CD): voucher keyword search v1 predicate — title + description (no terms)"
```

---

## Task B — Backend: matchContext computation + wire-shape

**Files:**
- Modify: `src/api/customer/discovery/service.ts` (MERCHANT_TILE_SELECT — vouchers fields; per-tile matchContext computation)
- Modify: `src/api/customer/discovery/branchTileSchema.ts` (or wherever the Zod source lives) — add `matchContext: z.string().nullable()`

- [ ] **Step 1: Write the failing matchContext test pins**

Extend `voucher-search.test.ts` with:

```ts
it('matchContext populated when voucher-only match drives the hit', async () => {
  const res = await app.inject({
    method: 'GET',
    url:    `/api/v1/customer/search?q=samosa&lat=${HUDDERSFIELD.lat}&lng=${HUDDERSFIELD.lng}&limit=30`,
  })
  const body = JSON.parse(res.body)
  const karaara = (body.branches as any[]).find(b =>
    b.merchant.businessName.toLowerCase().includes('karaara'),
  )
  expect(karaara).toBeTruthy()
  expect(karaara.matchContext).toMatch(/^Found in "[^"]+" voucher$/)
})

it('matchContext null when merchant surfaces via business name / category (driving signal not voucher)', async () => {
  // Karaara's business name contains "Karaara"; q="Karaara" surfaces via
  // merchant.businessName, NOT via voucher.title.  matchContext stays null.
  const res = await app.inject({
    method: 'GET',
    url:    `/api/v1/customer/search?q=Karaara&lat=${HUDDERSFIELD.lat}&lng=${HUDDERSFIELD.lng}&limit=30`,
  })
  const body = JSON.parse(res.body)
  const karaara = (body.branches as any[]).find(b =>
    b.merchant.businessName.toLowerCase().includes('karaara'),
  )
  expect(karaara).toBeTruthy()
  expect(karaara.matchContext ?? null).toBeNull()
})
```

- [ ] **Step 2: Run tests (expect fail)**

```bash
npx vitest run tests/api/customer/discovery/voucher-search.test.ts
```
Expected: FAIL on the new pins (matchContext field absent / undefined).

- [ ] **Step 3: Extend `MERCHANT_TILE_SELECT.vouchers.select`**

In service.ts at the `MERCHANT_TILE_SELECT` constant (around line 235):

```ts
vouchers: {
  where: { status: VoucherStatus.ACTIVE, approvalStatus: ApprovalStatus.APPROVED },
  select: {
    id:              true,
    title:           true,         // §CD v1 — surfaced via matchContext.
    description:     true,         // §CD v1 — gated description match check.
    estimatedSaving: true,
    createdAt:       true,         // §CD v1 — deterministic ordering on multi-match.
  },
  orderBy: { createdAt: 'asc' },   // §CD v1 §0.7 — deterministic priority.
},
```

NOTE: `terms` is NOT added per §0.1.

- [ ] **Step 4: Add `branchTileSchema.matchContext` wire-shape**

In the backend Zod source (locate `branchTileSchema` — should be at `src/api/customer/discovery/branchTileSchema.ts` or similar):

```ts
matchContext: z.string().nullable(),
```

Mirror the customer-app schema at `apps/customer-app/src/lib/api/discovery.ts`:

```ts
matchContext: z.string().nullable().optional(),
```

(`.optional()` on the customer-app side so older mock fixtures still parse.)

- [ ] **Step 5: Add per-tile matchContext computation**

After the rank-then-enrich pipeline completes (where `enrichedTiles` is built), AND before the response is returned, add a helper:

```ts
// §CD v1 — per-tile matchContext computation.
//
// Locked priority (§0.7): title-match > description-match.  Within same
// tier, deterministic by Voucher.createdAt ASC (already sorted by the
// MERCHANT_TILE_SELECT.orderBy clause).  Owner-direction §0.6: matchContext
// fires ONLY when voucher is the driving signal — when the merchant
// surfaces via business name / category / curated tag / branch fields,
// matchContext stays null.
//
// "Driving signal" detection: a merchant surfaces via voucher-only
// when NONE of the merchant-content / branch-content fields contain
// the query.  Computed in-memory using the data already fetched.
function computeMatchContext(
  normalizedQ: string | undefined,
  merchant: {
    businessName: string
    tradingName: string | null
    description: string | null
    primaryCategory: { name: string } | null
    categories: { category: { name: string } }[]
    tags: { tag: { label: string } }[]
    highlights: { tag: { label: string } }[]
    vouchers: { title: string; description: string | null; createdAt: Date }[]
  },
  branch: { name: string; localityName: string | null; postTown: string | null },
  includeDescriptionMatch: boolean,
): string | null {
  if (!normalizedQ) return null
  const q = normalizedQ.toLowerCase()
  const tokens = q.split(/\s+/).filter(t => t.length > 0)

  // Step 1: did any merchant/branch text field match? If yes, skip matchContext.
  const merchantContentMatchesAnyToken = tokens.every(t =>
    merchant.businessName.toLowerCase().includes(t) ||
    (merchant.tradingName?.toLowerCase().includes(t) ?? false) ||
    (merchant.primaryCategory?.name.toLowerCase().includes(t) ?? false) ||
    merchant.categories.some(c => c.category.name.toLowerCase().includes(t)) ||
    merchant.tags.some(mt => mt.tag.label.toLowerCase().includes(t)) ||
    merchant.highlights.some(h => h.tag.label.toLowerCase().includes(t)) ||
    branch.name.toLowerCase().includes(t) ||
    (branch.localityName?.toLowerCase().includes(t) ?? false) ||
    (branch.postTown?.toLowerCase().includes(t) ?? false) ||
    (includeDescriptionMatch && (merchant.description?.toLowerCase().includes(t) ?? false))
  )
  if (merchantContentMatchesAnyToken) return null

  // Step 2: priority-ordered voucher field check.
  for (const v of merchant.vouchers) {
    if (tokens.every(t => v.title.toLowerCase().includes(t))) {
      return `Found in "${v.title}" voucher`
    }
  }
  if (includeDescriptionMatch) {
    for (const v of merchant.vouchers) {
      if (tokens.every(t => v.description?.toLowerCase().includes(t) ?? false)) {
        return `Found in "${v.title}" voucher`
      }
    }
  }
  return null
}
```

Wire it in at the tile-build site:

```ts
matchContext: computeMatchContext(
  normalizedQ,
  /* merchant + categories/tags/highlights/vouchers from the enriched payload */,
  /* branch */,
  includeDescriptionMatch,
),
```

- [ ] **Step 6: Run tests (expect pass)**

```bash
npx vitest run tests/api/customer/discovery/voucher-search.test.ts
```
Expected: all pins pass.

- [ ] **Step 7: Commit**

```bash
git add src/api/customer/discovery/service.ts \
        src/api/customer/discovery/branchTileSchema.ts \
        apps/customer-app/src/lib/api/discovery.ts \
        tests/api/customer/discovery/voucher-search.test.ts
git commit -m "feat(§CD): matchContext computation + wire-shape (§0.2 locked copy)"
```

---

## Task C — Backend: negative-test pins (status + approval + length gate)

**Files:**
- Modify: `tests/api/customer/discovery/voucher-search.test.ts`

- [ ] **Step 1: Write 3 negative pins**

```ts
it('PENDING_APPROVAL voucher does NOT surface its merchant (approval gate)', async () => {
  // Use a deterministic fixture prefix.  Insert a merchant + branch + voucher
  // with approvalStatus=PENDING.  Query against the voucher.title and assert
  // the merchant does NOT appear in results.
  // ...
})

it('INACTIVE voucher does NOT surface its merchant (status gate)', async () => {
  // Similar — VoucherStatus.INACTIVE; merchant should NOT surface.
})

it('q < 5 chars does NOT match voucher.description-only-match merchant (length gate)', async () => {
  // Merchant has voucher.description containing "ofr"; q="ofr" (3 chars).
  // Description match is gated on includeDescriptionMatch (q.length >= 5);
  // merchant must NOT surface.
})
```

- [ ] **Step 2: Run + commit**

```bash
npx vitest run tests/api/customer/discovery/voucher-search.test.ts
# Expected: 5/5 pass (positive + 2 matchContext + 3 negatives).

git add tests/api/customer/discovery/voucher-search.test.ts
git commit -m "test(§CD): negative pins — status/approval gate + description length gate"
```

---

## Task D — Customer-app: render matchContext line in SearchResultItem

**Files:**
- Modify: `apps/customer-app/src/features/search/components/SearchResultItem.tsx`
- Create: `apps/customer-app/tests/features/search/SearchResultItem.matchContext.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// SearchResultItem.matchContext.test.tsx
import React from 'react'
import { render } from '@testing-library/react-native'
import { SearchResultItem } from '@/features/search/components/SearchResultItem'
import { makeBranchTile } from '../../fixtures/branchTile'

describe('<SearchResultItem> matchContext (§CD v1)', () => {
  it('renders matchContext line when present', () => {
    const tile = makeBranchTile({
      id: 'brn-1',
      matchContext: 'Found in "BOGO Pizza" voucher',
      merchant: { id: 'm1', businessName: 'Pino' },
    } as any)
    const { getByText } = render(<SearchResultItem tile={tile} query="pizza" onPress={() => {}} />)
    expect(getByText('Found in "BOGO Pizza" voucher')).toBeTruthy()
  })

  it('does NOT render matchContext line when null', () => {
    const tile = makeBranchTile({ id: 'brn-1' })  // matchContext=null/undefined
    const { queryByText } = render(<SearchResultItem tile={tile} query="pizza" onPress={() => {}} />)
    expect(queryByText(/Found in/)).toBeNull()
  })

  it('matchContext copy matches the locked format `Found in "<title>" voucher`', () => {
    const tile = makeBranchTile({
      id: 'brn-1',
      matchContext: 'Found in "Some Voucher" voucher',
    } as any)
    const { getByText } = render(<SearchResultItem tile={tile} query="some" onPress={() => {}} />)
    expect(getByText(/^Found in "[^"]+" voucher$/)).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run (expect fail — render not implemented)**

```bash
cd apps/customer-app && npx jest tests/features/search/SearchResultItem.matchContext.test.tsx --forceExit
```
Expected: FAIL — matchContext line not rendered.

- [ ] **Step 3: Extend `SearchResultItem.tsx`**

Find the meta row in `SearchResultItem.tsx`; below it, render the matchContext line when present:

```tsx
{tile.matchContext && (
  <Text style={styles.matchContext} numberOfLines={1} testID="search-result-match-context">
    {tile.matchContext}
  </Text>
)}
```

Style (in same file):

```tsx
matchContext: {
  fontSize:    11,
  fontFamily:  'Lato-Regular',
  color:       '#9CA3AF',   // text.tertiary / subtle
  marginTop:   2,
},
```

- [ ] **Step 4: Update fixture builder**

`apps/customer-app/tests/fixtures/branchTile.ts` — add `matchContext: null` to the default object so existing tests still build cleanly.

- [ ] **Step 5: Run (expect pass)**

```bash
npx jest tests/features/search/SearchResultItem.matchContext.test.tsx --forceExit
```
Expected: 3/3 pass.

- [ ] **Step 6: Commit**

```bash
cd /Users/shebinchaliyath/Developer/Redeemo
git add apps/customer-app/src/features/search/components/SearchResultItem.tsx \
        apps/customer-app/tests/features/search/SearchResultItem.matchContext.test.tsx \
        apps/customer-app/tests/fixtures/branchTile.ts
git commit -m "feat(§CD): SearchResultItem renders matchContext line when present"
```

---

## Task E — Sweep + PR

- [ ] **Step 1: Backend tsc + vitest sweep**

```bash
cd /Users/shebinchaliyath/Developer/Redeemo
npx tsc --noEmit                          # expect: clean baseline (4 pre-existing §BV errors only)
npx vitest run tests/api/customer/discovery/    # expect: all pass
```

- [ ] **Step 2: Customer-app tsc + jest sweep**

```bash
cd apps/customer-app
npx tsc --noEmit                          # expect: clean
npx jest tests/features/search --forceExit  # expect: all pass
npx jest --forceExit                        # expect: full sweep clean
```

- [ ] **Step 3: Push + open PR**

```bash
git push -u origin feature/plan-4-voucher-keyword-search
gh pr create --title "feat(§CD): voucher keyword search v1 — title + description matching + matchContext (§0.1 v1; no terms)" --body "..."
```

PR body lists:
- Locked decisions (§0.1-§0.12)
- File touches summary
- Test gates at branch tip
- Device QA checklist (see below)
- §CD v2 deferral (voucher.terms; relevance scoring; matchContext on tag/category paths)

- [ ] **Step 4: Owner device QA + SHA-bound merge**

Device QA checklist (in PR body):
- `samosa` → Karaara surfaces; matchContext shows `Found in "..." voucher`
- `bogo` → vouchers with "BOGO" in title surface (e.g. KAR-RMV-001 chai BOGO)
- `Karaara` → Karaara surfaces via businessName; matchContext does NOT show (driving signal is name, not voucher)
- `valid` (3 chars or T&C boilerplate word) → does NOT surface vouchers via terms (terms excluded from v1)
- `valid until` (multi-token T&C boilerplate) → does NOT surface as a voucher match (terms NOT in scope)
- All `Leeds` / `Indian` / `nail` / pill-tap behaviour from PR #124 unchanged (no regression).

---

## Self-Review

After writing this plan I reviewed it against §CD entry + owner's 12 locked decisions:

1. **Spec coverage:** Every owner decision §0.1-§0.12 has a corresponding task or scope-boundary line in the plan.
2. **Placeholder scan:** Tasks A-E each show concrete code blocks + exact commands + expected outcomes. The voucher-search.test.ts test code is illustrative — exact seed-specific assertions get adjusted at write time to match unambiguous voucher titles in `prisma/seed.ts`.
3. **Type consistency:** `matchContext: string | null` (backend) ↔ `string \| null \| undefined` (customer-app Zod `.nullable().optional()`) — the optional on the customer-app side handles pre-§CD mock fixtures cleanly.
4. **Scope discipline:** Plan stays inside §0.12 boundaries. No customer-web, no searchMerchants, no terms, no relevance ranking, no SearchChip, no Map.
5. **Risk awareness:** Audit identified noisy-terms risk → owner closed it by excluding terms. Performance risk (voucher table traversal) acceptable at current scale; profile + add `@@index([status, approvalStatus])` if device QA surfaces perf concerns.

## Execution Handoff

**Plan complete. Two execution options:**

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task (A → B → C → D → E), review between tasks. Fast iteration; tight context.
2. **Inline Execution** — Execute all 5 tasks in this session.

Given §CD is bounded scope (~5 files; ~1.5 days estimated), inline execution is reasonable. Subagent-driven preferred if owner wants stricter review checkpoints between tasks.

**Default: inline execution unless owner directs otherwise.**


---

## PR #125 device-QA follow-up (2026-05-22) — voucher-driven supply-aware default scope

**Owner-flagged**: voucher-driven searches must obey the same default scope rule as the rest of Search. For some voucher-title/description searches, the default selected pill did not appear to start at the closest available bucket. Asked to verify the M4 `effectiveScopeFromCounts` / supply-aware default selection logic is not bypassed or confused by voucher-driven matches, and to add regression coverage for the 4 scenarios:

1. Voucher title match with nearby supply defaults to `Nearby`.
2. Voucher description match with city but no nearby supply defaults to `Your city`.
3. Voucher match with only wider/platform supply defaults to `More places`.
4. User-tapped pill still overrides the default visual state.

**Investigation outcome — NO BUG.** Probed `searchBranches` directly via a one-off read-only script (`prisma/_probe-cd-supply-scope.ts`, deleted after run) against 8 representative voucher-driven queries from 3 GPS points (Huddersfield / Brightlingsea / Bristol) + no-GPS. Backend correctly:

- Routes voucher-matched merchants through the same `rankBranchesV3` rank pipeline as name/tag/category matches — no special-case bypass.
- Populates `rungCounts.NEARBY/CATCHMENT/POST_TOWN/...` based on the matched branch's actual rung classification relative to `effLoc`.
- Aggregates into `nearbyCount` / `cityCount` / `distantCount` exactly as the customer-app's `effectiveScopeFromCounts` (PR #124 fixup-3) expects.
- Cascades `scopeExpanded` true correctly when LOCAL/MIXED-intent default `[NEARBY, CITY]` is empty and the voucher-matched supply lives in DISTANT only.

Concrete probe evidence:
- `q="samosa"` from Huddersfield (Karaara only via voucher.title) → `nearbyCount=1`, `cityCount=0`, `distantCount=0`, `scopeExpanded=false`, resolvedScope=`city` (LOCAL+MIXED keeps NEARBY+CITY). Customer-app supply-aware default → `Nearby`. ✓
- `q="samosa"` from Bristol (Karaara via voucher.title, far) → `nearbyCount=0`, `cityCount=0`, `distantCount=1`, `scopeExpanded=true`, resolvedScope=`platform`. Customer-app priority short-circuits to backend cascade → `More places`. ✓

**Regression coverage added:**

1. **Backend** — `tests/api/customer/discovery/voucher-search.test.ts` new describe block (`§CD voucher keyword search v1 — supply-aware default scope contract`) — 2 integration pins on real seed data:
   - `q="samosa"` from Huddersfield asserts `branchMeta.nearbyCount >= 1` + `scopeExpanded=false` + at least one tile carries `matchContext != null`.
   - `q="samosa"` from Bristol asserts `nearbyCount=0` + `cityCount=0` + `distantCount >= 1` + `scopeExpanded=true` + `scope='platform'`, with Karaara still on the wire.

2. **Customer-app** — `apps/customer-app/tests/features/search/SearchScreen.defaultScope.voucherDriven.test.tsx` mirrors the existing `SearchScreen.defaultScope.test.tsx` structure with `matchContext` populated on the mocked tile. 4 pins (one per owner scenario):
   - Voucher title match + `nearbyCount=1` → `Nearby` active pill.
   - Voucher description match + `cityCount=1, nearbyCount=0` → `Your city` active pill.
   - Voucher match + `distantCount=1, scopeExpanded=true, scope='platform'` → `More places` active pill.
   - User taps `More places` on a nearby-supply result → active pill follows the tap, not the supply-aware default.

These pins are explicit guards against a future refactor accidentally coupling scope derivation to `matchContext` (e.g. routing voucher-driven matches through a different code path). The customer-app `effectiveScopeFromCounts` and priority logic are blind to `matchContext` today; these tests lock that contract.

**Test gates at PR #125 fix tip:**
- Backend `npx vitest run tests/api/customer/discovery/voucher-search.test.ts` → 11/11 ✓
- Customer-app `npx jest tests/features/search` → 18 suites / 141 tests ✓
- `tsc --noEmit` customer-app clean; backend root unchanged (4 pre-existing §BV errors in `savings.service.test.ts`).
