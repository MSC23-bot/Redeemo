# Tier 1 Polish — Perceived-Performance + Image-Loading + Category Skeleton Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close §CV Phase A (BranchTile image-loading affordance), §CS Phase A (Category results skeleton), and §CN (CampaignCarousel `bannerImageUrl` render) in a single focused Tier 1 PR. No data-contract changes, no navigation changes, no backend changes.

**Architecture:** Three small, independent component changes in `apps/customer-app/`. Swap RN `Image` → `expo-image` (already installed) on the shared `<BranchTile>` so all 5 surfaces (Home Featured / Trending / NearbyByCategory / Search Category / Map carousel via `MapBranchTile`) gain cream placeholders + 180ms fade transitions in one place. Add a new `<CategoryResultsSkeleton>` (6 stacked rows reusing the existing `<SkeletonTile>` shimmer primitive) for Category's empty-loading state. Add an `expo-image` render under `<LinearGradient>` overlay (`rgba(1,12,53,0.4)`) on `<CampaignCarousel>` when `bannerImageUrl` is present; keep gradient-only fallback when null.

**Tech Stack:** expo-image 3.0.11 (already installed); existing `<SkeletonTile>` shimmer primitive; expo-linear-gradient (already used).

---

## §0 — Locked decisions (owner approval 2026-05-22)

| # | Decision | Locked value |
|---|---|---|
| §0.1 | §BV inclusion | Inspect briefly; skip unless a TRUE one-line cast/test fix. Default: skip. Do not let §BV expand this PR. |
| §0.2 | Category skeleton row count | **6 rows** (≈ one mobile viewport). |
| §0.3 | CampaignCarousel overlay opacity | **`rgba(1,12,53,0.4)`** — bottom-up navy gradient. |
| §0.4 | `<BranchTile>` banner placeholder | **`#FFF6EE`** cream. |
| §0.5 | Logo placeholder | **Same `#FFF6EE` cream** when `logoUrl` is set; existing initials fallback when `logoUrl === null`. |

## §0.6 — Hard scope boundaries (owner-locked)

NOT in this PR:
- Home scale redesign
- 3D category tile redesign
- Category FilterSheet redesign
- Map filter / performance rework
- Trending model changes
- Backend / customer-web / schema changes
- Plan 4 M4 implementation

## §0.7 — Surfaces in scope

3 customer-app files changed + 1 new component + 3 new test files. Zero changes outside `apps/customer-app/`.

---

## File Structure

**Modified:**
- `apps/customer-app/src/features/shared/BranchTile.tsx` — banner + logo `<Image>` swap to `expo-image` with placeholder + transition.
- `apps/customer-app/src/features/home/components/CampaignCarousel.tsx` — render `bannerImageUrl` under gradient overlay when present.
- `apps/customer-app/src/features/search/screens/CategoryResultsScreen.tsx` — wire the new skeleton component into the loading-empty state.

**Created:**
- `apps/customer-app/src/features/search/components/CategoryResultsSkeleton.tsx` — 6 stacked `<SkeletonTile>` rows.
- `apps/customer-app/tests/features/shared/BranchTile.image.test.tsx`
- `apps/customer-app/tests/features/home/components/CampaignCarousel.bannerImage.test.tsx`
- `apps/customer-app/tests/features/search/CategoryResultsScreen.loading.test.tsx`

---

## Task A — `<BranchTile>` `expo-image` swap (§CV Phase A)

**Files:**
- Modify: `apps/customer-app/src/features/shared/BranchTile.tsx`
- Create test: `apps/customer-app/tests/features/shared/BranchTile.image.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/customer-app/tests/features/shared/BranchTile.image.test.tsx
import React from 'react'
import { render } from '@testing-library/react-native'
import { BranchTile } from '@/features/shared/BranchTile'
import { makeBranchTile } from '../../fixtures/branchTile'

describe('BranchTile image render', () => {
  it('renders expo-image with banner URI + cream placeholder + 180ms transition when bannerUrl set', () => {
    const branch = makeBranchTile({
      merchant: { id: 'm1', businessName: 'Pino', bannerUrl: 'https://example.com/banner.jpg', logoUrl: null, descriptor: 'Italian', primaryCategory: null, voucherCount: 2, maxEstimatedSaving: 5 },
    })
    const tree = render(<BranchTile branch={branch} onPress={() => {}} />).toJSON()
    const json = JSON.stringify(tree)
    expect(json).toContain('https://example.com/banner.jpg')
    expect(json).toContain('#FFF6EE')
    expect(json).toContain('180')
  })

  it('renders LinearGradient fallback when bannerUrl is null', () => {
    const branch = makeBranchTile({
      merchant: { id: 'm1', businessName: 'Pino', bannerUrl: null, logoUrl: null, descriptor: null, primaryCategory: null, voucherCount: 1, maxEstimatedSaving: 3 },
    })
    const tree = render(<BranchTile branch={branch} onPress={() => {}} />).toJSON()
    const json = JSON.stringify(tree)
    expect(json).not.toContain('banner.jpg')
    expect(json).toContain('#667EEA')   // fallback gradient start
  })

  it('renders initials block when logoUrl is null', () => {
    const branch = makeBranchTile({
      merchant: { id: 'm1', businessName: 'Pino', bannerUrl: null, logoUrl: null, descriptor: null, primaryCategory: null, voucherCount: 0, maxEstimatedSaving: 0 },
    })
    const { getByText } = render(<BranchTile branch={branch} onPress={() => {}} />)
    expect(getByText('P')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/customer-app && npx jest tests/features/shared/BranchTile.image.test.tsx --forceExit
```
Expected: 2 fails on placeholder + transition assertions; initials test passes immediately.

- [ ] **Step 3: Implement the changes in `BranchTile.tsx`**

Change import:
```tsx
// BEFORE
import { View, Pressable, StyleSheet, Image } from 'react-native'

// AFTER
import { View, Pressable, StyleSheet } from 'react-native'
import { Image } from 'expo-image'
```

Update banner image (line ~70):
```tsx
<Image
  source={{ uri: branch.merchant.bannerUrl }}
  style={styles.bannerImage}
  contentFit="cover"
  placeholder={{ blurhash: undefined }}
  placeholderContentFit="cover"
  transition={180}
  recyclingKey={branch.id}
/>
```

Banner image style needs `backgroundColor: '#FFF6EE'` so the placeholder paints during loading:
```tsx
bannerImage: { width: '100%', height: '100%', backgroundColor: '#FFF6EE' },
```

Update logo image (line ~123):
```tsx
<Image
  source={{ uri: branch.merchant.logoUrl }}
  style={styles.logo}
  contentFit="cover"
  transition={180}
  recyclingKey={`${branch.id}-logo`}
/>
```

Logo style also needs `backgroundColor: '#FFF6EE'` for the placeholder.

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/customer-app && npx jest tests/features/shared/BranchTile.image.test.tsx --forceExit
```
Expected: 3/3 PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/customer-app/src/features/shared/BranchTile.tsx \
        apps/customer-app/tests/features/shared/BranchTile.image.test.tsx
git commit -m "fix(branchTile): expo-image swap with cream placeholder + 180ms transition (§CV Phase A)"
```

---

## Task B — `<CampaignCarousel>` `bannerImageUrl` render (§CN)

**Files:**
- Modify: `apps/customer-app/src/features/home/components/CampaignCarousel.tsx`
- Create test: `apps/customer-app/tests/features/home/components/CampaignCarousel.bannerImage.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/customer-app/tests/features/home/components/CampaignCarousel.bannerImage.test.tsx
import React from 'react'
import { render } from '@testing-library/react-native'
import { CampaignCarousel } from '@/features/home/components/CampaignCarousel'

const baseCampaign = {
  id: 'c1',
  name: 'Summer Sips',
  description: 'Cool drinks',
  gradientStart: null,
  gradientEnd: null,
  ctaText: null,
  bannerImageUrl: null,
}

describe('CampaignCarousel banner image', () => {
  it('renders an Image with the URI when bannerImageUrl is set', () => {
    const campaigns = [{ ...baseCampaign, bannerImageUrl: 'https://example.com/c1.jpg' }]
    const tree = render(<CampaignCarousel campaigns={campaigns} onCampaignPress={() => {}} />).toJSON()
    expect(JSON.stringify(tree)).toContain('https://example.com/c1.jpg')
  })

  it('renders gradient-only when bannerImageUrl is null', () => {
    const tree = render(<CampaignCarousel campaigns={[baseCampaign]} onCampaignPress={() => {}} />).toJSON()
    const json = JSON.stringify(tree)
    expect(json).not.toContain('example.com')
    expect(json).toContain('#667EEA') // default gradient start
  })

  it('renders the navy overlay (rgba(1,12,53,0.4)) when banner image is present', () => {
    const campaigns = [{ ...baseCampaign, bannerImageUrl: 'https://example.com/c1.jpg' }]
    const tree = render(<CampaignCarousel campaigns={campaigns} onCampaignPress={() => {}} />).toJSON()
    expect(JSON.stringify(tree)).toContain('rgba(1,12,53,0.4)')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/customer-app && npx jest tests/features/home/components/CampaignCarousel.bannerImage.test.tsx --forceExit
```
Expected: fails on URI render + overlay render; gradient-only assertion may pass.

- [ ] **Step 3: Implement the changes in `CampaignCarousel.tsx`**

Add `expo-image` import:
```tsx
import { Image } from 'expo-image'
```

Wrap the per-campaign render in a conditional. When `campaign.bannerImageUrl` set:
- Outer `<View>` with `width: BANNER_WIDTH, minHeight: 140, borderRadius: radius.lg, overflow: 'hidden', justifyContent: 'flex-end'`.
- `<Image style={StyleSheet.absoluteFillObject} contentFit="cover" placeholder={{ blurhash: undefined }} transition={180} source={{ uri: campaign.bannerImageUrl }} />`.
- `<LinearGradient colors={['transparent', 'rgba(1,12,53,0.4)']} style={StyleSheet.absoluteFillObject} />`.
- Existing text + CTA renders on top (within the same outer View).

When `bannerImageUrl` null: unchanged `<LinearGradient>` path.

Important: Both branches return the SAME outer dimensions + same content structure so the surrounding `<ScrollView>` snap behaviour stays identical.

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/customer-app && npx jest tests/features/home/components/CampaignCarousel.bannerImage.test.tsx --forceExit
```
Expected: 3/3 PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/customer-app/src/features/home/components/CampaignCarousel.tsx \
        apps/customer-app/tests/features/home/components/CampaignCarousel.bannerImage.test.tsx
git commit -m "feat(campaignCarousel): render bannerImageUrl when set with navy gradient overlay (§CN)"
```

---

## Task C — `<CategoryResultsSkeleton>` + wire into `<CategoryResultsScreen>` (§CS Phase A)

**Files:**
- Create: `apps/customer-app/src/features/search/components/CategoryResultsSkeleton.tsx`
- Modify: `apps/customer-app/src/features/search/screens/CategoryResultsScreen.tsx`
- Create test: `apps/customer-app/tests/features/search/CategoryResultsScreen.loading.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/customer-app/tests/features/search/CategoryResultsScreen.loading.test.tsx
// (the existing CategoryResultsScreen tests already mock useCategoryMerchants /
// useSearch — follow that pattern; this test file adds focused loading-state pins)

import React from 'react'
import { render } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
// mocks for routing, useCategoryMerchants, useSearch, useUiPreferences ...

describe('CategoryResultsScreen loading skeleton', () => {
  it('renders 6 skeleton rows while loading + empty', () => {
    // mock useCategoryMerchants: { data: undefined, isLoading: true }
    const { getAllByTestId } = renderScreen()
    expect(getAllByTestId('category-results-skeleton-row')).toHaveLength(6)
  })

  it('does NOT render skeleton when loaded with branches', () => {
    // mock useCategoryMerchants: { data: { branches: [makeBranchTile()], ... }, isLoading: false }
    const { queryAllByTestId } = renderScreen()
    expect(queryAllByTestId('category-results-skeleton-row')).toHaveLength(0)
  })

  it('does NOT render skeleton when loaded with empty results', () => {
    // mock useCategoryMerchants: { data: { branches: [], ... }, isLoading: false }
    const { queryAllByTestId, getByTestId } = renderScreen()
    expect(queryAllByTestId('category-results-skeleton-row')).toHaveLength(0)
    expect(getByTestId('empty-state-message')).toBeTruthy()  // existing testID, if absent add it
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/customer-app && npx jest tests/features/search/CategoryResultsScreen.loading.test.tsx --forceExit
```
Expected: fails — no skeleton testID exists yet.

- [ ] **Step 3: Implement `<CategoryResultsSkeleton>`**

```tsx
// apps/customer-app/src/features/search/components/CategoryResultsSkeleton.tsx
import React from 'react'
import { View, StyleSheet, Dimensions } from 'react-native'
import { SkeletonTile } from '@/features/shared/SkeletonTile'
import { spacing } from '@/design-system'

const SCREEN_WIDTH = Dimensions.get('window').width
const ROW_WIDTH = SCREEN_WIDTH - spacing[4] * 2   // matches Category FlatList horizontal padding

const ROW_COUNT = 6

export function CategoryResultsSkeleton() {
  return (
    <View style={styles.list} testID="category-results-skeleton">
      {Array.from({ length: ROW_COUNT }).map((_, i) => (
        <View key={i} style={styles.row} testID="category-results-skeleton-row">
          <SkeletonTile width={ROW_WIDTH} />
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  list: { paddingTop: spacing[2] },
  row:  { marginBottom: spacing[3] },
})
```

- [ ] **Step 4: Wire into `CategoryResultsScreen.tsx`**

Replace the FlatList mount approach. The cleanest path: render the skeleton OR the FlatList depending on `isLoading && branches.length === 0`.

Conceptually:
```tsx
{isLoading && branches.length === 0 ? (
  <CategoryResultsSkeleton />
) : (
  <FlatList ... />
)}
```

Keep `ListEmptyComponent={<EmptyStateMessage reason={emptyReason} />}` unchanged. The existing gating on `!isLoading` in the `emptyReason` calc (line 193) stays — protects against empty-flash on cache-warm refetch.

- [ ] **Step 5: Run test to verify it passes**

```bash
cd apps/customer-app && npx jest tests/features/search/CategoryResultsScreen.loading.test.tsx --forceExit
```
Expected: 3/3 PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/customer-app/src/features/search/components/CategoryResultsSkeleton.tsx \
        apps/customer-app/src/features/search/screens/CategoryResultsScreen.tsx \
        apps/customer-app/tests/features/search/CategoryResultsScreen.loading.test.tsx
git commit -m "feat(category): 6-row CategoryResultsSkeleton on loading-empty state (§CS Phase A)"
```

---

## Task D — Sweep gates + §BV inspection

- [ ] **Step 1: Full customer-app tsc**

```bash
cd apps/customer-app && npx tsc --noEmit
```
Expected: clean (no new errors).

- [ ] **Step 2: Focused jest on touched suites**

```bash
cd apps/customer-app && npx jest \
  tests/features/shared/BranchTile \
  tests/features/home \
  tests/features/search \
  tests/features/map \
  --forceExit
```
Expected: all pass; no regressions in adjacent Home / Search / Map suites that consume `<BranchTile>` or `<CampaignCarousel>`.

- [ ] **Step 3: Full customer-app jest (if practical)**

```bash
cd apps/customer-app && npx jest --forceExit
```
Expected: 207 suites / 2090 + 3 new = 2093 tests pass (count varies). §BG voucher-detail-redeem-flow flake is documented; re-run that suite alone if it trips.

- [ ] **Step 4: §BV inspection (opportunistic)**

```bash
cd /Users/shebinchaliyath/Developer/Redeemo && npx tsc --noEmit 2>&1 | grep "savings.service.test.ts:84"
```

Inspect the actual error message. If it's a one-line cast fix (e.g. tweak the `as any` cast or add a missing `as` annotation), include it as Task D.bonus. If it requires schema understanding or a multi-line edit, leave §BV deferred.

---

## Task E — Push + PR

- [ ] **Step 1: Push branch**

```bash
git push -u origin feature/tier1-polish-perceived-perf
```

- [ ] **Step 2: Open PR**

PR title: `polish(perceived-perf): BranchTile expo-image + CategoryResultsSkeleton + CampaignCarousel bannerImageUrl (§CV/§CS/§CN)`

PR body covers:
- Scope: §CV Phase A + §CS Phase A + §CN
- Hard scope boundaries (the locked NOT-in-PR list)
- Locked decisions (§0.1-§0.5)
- Risk assessment summary
- Device QA checklist (below)
- Test count delta

- [ ] **Step 3: Owner device QA checklist**

```
[ ] Home — open Featured carousel: banner images on Pino's / Bean & Brew / The Coffee House / Iron Forge Gym fade in cleanly with cream placeholder during load
[ ] Home — Campaign banner: at least one of the 3 seeded campaigns now shows the Unsplash photo (Summer Sips / Weekend Workout / Date Night) under a subtle navy gradient overlay
[ ] Home — Campaign banner fallback: if a campaign has bannerImageUrl=null, gradient still renders cleanly
[ ] Category — open a category, observe: 6 placeholder rows visible during load, replaced by real tiles when data lands; no blank screen
[ ] Category — settled empty result (e.g. very narrow filter combination): existing empty-state copy renders, NOT the skeleton
[ ] Map — pan to a populated area: floating card carousel images load with cream placeholder + fade
[ ] Map — open MapListView half-sheet: list rows show image fade-in
[ ] Search — keyword search results: tile images load with cream placeholder + fade
[ ] Navigation — tap any tile across all 5 surfaces → Merchant Profile opens with correct branch + back button returns to the source surface (no nav regression)
```

---

## Self-Review checklist

After writing this plan I reviewed it against the locked decisions:

1. **Spec coverage:**
   - §CV Phase A covered by Task A ✅
   - §CS Phase A covered by Task C ✅
   - §CN covered by Task B ✅
   - §BV inspection opportunistic per §0.1 ✅
   - All 7 "hard scope boundary" items unaddressed (correct — they're NOT in this PR) ✅

2. **Placeholder scan:** Every step has concrete code blocks + concrete commands + concrete expected outcomes. No TBD / TODO.

3. **Type consistency:** `<BranchTile>` `Props` type unchanged. `<CampaignCarousel>` `Props` type unchanged. `<CategoryResultsSkeleton>` is a new self-contained component with zero props. No type contract changes anywhere.

4. **Test coverage:** 3 new test files, each pinning the locked decision (placeholder colour / transition value / row count / overlay opacity).

5. **Risk:** Confirmed Low. No nav changes, no data contract changes, no schema changes, no backend changes. `MapBranchTile` delegates to shared `<BranchTile>` — Task A propagates automatically (no Map-specific code edit). PressableScale outer-wrapper layout (§BM standing dev note) is irrelevant here — no `<PressableScale>` style changes.

---

## Estimated total effort

- Task A: ~30 min
- Task B: ~45 min
- Task C: ~45 min
- Task D: ~20 min (sweeps + §BV inspect)
- Task E: ~15 min (push + PR open + device QA write-up)
- **Total: ~2.5 hours implementation** + owner device QA round.
