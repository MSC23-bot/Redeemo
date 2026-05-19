import React from 'react'
import { render, fireEvent, waitFor, act } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { SearchScreen } from '@/features/search/screens/SearchScreen'
import { makeBranchTile } from '../../fixtures/branchTile'

// Discovery Rebaseline PR-2 (Phase 2.1) — wire shape now carries
// `branches: BranchTile[]` alongside the legacy `merchants` arm.  SearchScreen
// consumes `branches`; multi-branch merchants render as separate rows.

// jest.mock factories cannot reference out-of-scope variables — use the
// `mock`-prefixed escape hatch to share the fixture across the useSearch
// mock and the assertions below.
const mockPizzaExpress = makeBranchTile({
  id: 'brn1',
  branchName: 'Soho',
  branchLocalityName: 'Soho',
  distance: 800,
  merchant: {
    id:           'm1',
    businessName: 'Pizza Express',
    primaryCategory: {
      id: 'c1', name: 'Food', pinColour: null, pinIcon: null, parentId: null,
    },
    descriptor:         'Italian restaurant',
    voucherCount:       3,
    maxEstimatedSaving: 15,
  },
  avgRating: 4.5,
  reviewCount: 50,
})

const mockMeta = {
  scope:            'city' as const,
  resolvedArea:     'London',
  scopeExpanded:    false,
  nearbyCount:      0,
  cityCount:        1,
  distantCount:     12,
  emptyStateReason: 'none' as const,
}

// Per-scenario state — flipped by individual tests via the controlled flag.
const mockSearchState = {
  scenario: 'happy' as
    | 'happy'
    | 'happy_with_locality'
    | 'empty'
    | 'expanded'
    | 'no_uk_supply'
    | 'multi_branch'
    | 'count_list_mismatch'
    | 'karaara_nearby_only',
}

// Covelum multi-branch fixture — the load-bearing cardinality test.
const covelumBri = makeBranchTile({
  id: 'brn_covelum_bri',
  branchName: 'Brightlingsea',
  branchLocalityName: 'Brightlingsea',
  merchant: {
    id: 'mer_covelum',
    businessName: 'Covelum',
    descriptor: 'Coffee shop',
  },
})
const covelumCol = makeBranchTile({
  id: 'brn_covelum_col',
  branchName: 'Colchester',
  branchLocalityName: 'Colchester',
  merchant: {
    id: 'mer_covelum',
    businessName: 'Covelum',
    descriptor: 'Coffee shop',
  },
})

jest.mock('@/hooks/useSearch', () => ({
  useSearch: (_params: any, enabled: boolean) => {
    if (!enabled) return { data: undefined, isLoading: false }
    // PR-2 device-QA fix (2026-05-19) — SearchScreen reads `branchMeta`
    // (NOT legacy `meta`) for counts + emptyStateReason + locality.
    // Mocks set BOTH so legacy consumers (Home / Map / Category — not
    // yet migrated) continue to work and the SearchScreen path reads
    // the branch-aligned envelope.
    switch (mockSearchState.scenario) {
      case 'empty':
        return {
          data: {
            merchants: [], total: 0,
            branches: [], totalBranches: 0,
            meta:       { ...mockMeta, emptyStateReason: 'none' },
            branchMeta: { ...mockMeta, emptyStateReason: 'none' },
          },
          isLoading: false,
        }
      case 'expanded':
        // PR #112 fixup-3: backend cascaded out of 'city' to 'platform' to
        // find supply.  effectiveLocality carries the user's location label
        // (Huddersfield); branchMeta.scope='platform' is the EFFECTIVE
        // scope the active pill should highlight (NOT 'city' which the
        // user asked for).  See effective-scope spec §4.1.
        return {
          data: {
            merchants: [], total: 0,
            branches: [mockPizzaExpress], totalBranches: 1,
            meta:       {
              ...mockMeta,
              scope: 'platform',
              scopeExpanded: true,
              emptyStateReason: 'expanded_to_wider',
              effectiveLocality: { name: 'Huddersfield' },
            },
            branchMeta: {
              ...mockMeta,
              scope: 'platform',
              scopeExpanded: true,
              emptyStateReason: 'expanded_to_wider',
              effectiveLocality: { name: 'Huddersfield' },
            },
          },
          isLoading: false,
        }
      case 'no_uk_supply':
        return {
          data: {
            merchants: [], total: 0,
            branches: [], totalBranches: 0,
            meta:       { ...mockMeta, nearbyCount: 0, cityCount: 0, distantCount: 0, emptyStateReason: 'no_uk_supply' },
            branchMeta: { ...mockMeta, nearbyCount: 0, cityCount: 0, distantCount: 0, emptyStateReason: 'no_uk_supply' },
          },
          isLoading: false,
        }
      case 'multi_branch':
        return {
          data: {
            merchants: [], total: 0,
            branches: [covelumBri, covelumCol], totalBranches: 2,
            meta:       mockMeta,
            branchMeta: mockMeta,
          },
          isLoading: false,
        }
      case 'happy_with_locality':
        // Happy path with an effectiveLocality on the wire, so the
        // unified header surfaces the "near Huddersfield" suffix.
        return {
          data: {
            merchants: [], total: 0,
            branches: [mockPizzaExpress], totalBranches: 1,
            meta:       { ...mockMeta, effectiveLocality: { name: 'Huddersfield' } },
            branchMeta: { ...mockMeta, effectiveLocality: { name: 'Huddersfield' } },
          },
          isLoading: false,
        }
      case 'karaara_nearby_only':
        // Owner observation that drove the cumulative-display rule:
        // Karaara 276m nearby → backend buckets nearbyCount=1, cityCount=0,
        // distantCount=0.  Bucket display would show "Nearby · 1, Your city · 0,
        // UK-wide · 0" — counter-intuitive because if a result is NEARBY it's
        // also IN YOUR CITY and UK-WIDE.  Cumulative display rule:
        //   Nearby   = 1
        //   Your city = 1 + 0 = 1
        //   UK-wide  = 1 + 0 + 0 = 1
        return {
          data: {
            merchants: [], total: 0,
            branches: [mockPizzaExpress], totalBranches: 1,
            meta:       { ...mockMeta, nearbyCount: 1, cityCount: 0, distantCount: 0, emptyStateReason: 'none' },
            branchMeta: { ...mockMeta, nearbyCount: 1, cityCount: 0, distantCount: 0, emptyStateReason: 'none' },
          },
          isLoading: false,
        }
      case 'count_list_mismatch':
        // Owner-flagged screenshot bug: legacy merchant meta is non-zero
        // (UK-wide pill shows "1") but the branch list is empty.  The
        // FIX is that SearchScreen reads `branchMeta` (branch counts = 0)
        // and the empty-state copy + count both reflect branch reality.
        return {
          data: {
            merchants: [{ id: 'leg-1', businessName: 'Legacy Merchant' }] as any,
            total: 1,
            meta: { ...mockMeta, nearbyCount: 0, cityCount: 0, distantCount: 1, emptyStateReason: 'none' },
            branches: [], totalBranches: 0,
            branchMeta: { ...mockMeta, nearbyCount: 0, cityCount: 0, distantCount: 0, emptyStateReason: 'no_uk_supply' },
          },
          isLoading: false,
        }
      default:
        return {
          data: {
            merchants: [], total: 0,
            branches: [mockPizzaExpress], totalBranches: 1,
            meta:       mockMeta,
            branchMeta: mockMeta,
          },
          isLoading: false,
        }
    }
  },
}))

jest.mock('@/hooks/useLocation', () => ({
  useUserLocation: () => ({
    status: 'granted',
    location: { lat: 51.5, lng: -0.1, area: 'Shoreditch', city: 'London' },
    requestPermission: jest.fn(),
  }),
}))

const mockRouterPush = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockRouterPush, back: jest.fn() }),
}))

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  // PR #112 fixup-3: SearchScreen reads `useSafeAreaInsets()` so the
  // top-bar padding is notch-aware.  SafeAreaProvider must wrap the
  // render tree under test.  initialMetrics keeps the test deterministic
  // (no real device measurement).
  const frame = { x: 0, y: 0, width: 390, height: 844 } as const
  const insets = { top: 47, right: 0, bottom: 34, left: 0 } as const
  return React.createElement(
    SafeAreaProvider,
    { initialMetrics: { frame, insets } },
    React.createElement(QueryClientProvider, { client: qc }, children),
  )
}

async function typeAndSettle(getByPlaceholderText: any, text: string = 'Pizza') {
  jest.useFakeTimers()
  fireEvent.changeText(getByPlaceholderText('Search merchants...'), text)
  await act(async () => { jest.advanceTimersByTime(300) })
  jest.useRealTimers()
}

describe('SearchScreen', () => {
  beforeEach(() => {
    mockSearchState.scenario = 'happy'
    mockRouterPush.mockReset()
  })

  it('renders search input', () => {
    const { getByPlaceholderText } = render(<SearchScreen />, { wrapper })
    expect(getByPlaceholderText('Search merchants...')).toBeTruthy()
  })

  it('shows trending searches before typing', () => {
    const { getByText } = render(<SearchScreen />, { wrapper })
    expect(getByText('Trending')).toBeTruthy()
  })

  it('shows results after typing', async () => {
    const { getByPlaceholderText, getByText } = render(<SearchScreen />, { wrapper })
    await typeAndSettle(getByPlaceholderText)
    await waitFor(() => expect(getByText('Pizza Express')).toBeTruthy())
  })

  it('renders ScopePillRow with CUMULATIVE display counts after typing (PR #112 device-QA fix #2)', async () => {
    // mockMeta: nearbyCount=0, cityCount=1, distantCount=12.
    // PR #112 cumulative display rule (locked):
    //   Nearby   = nearbyCount                          = 0
    //   Your city = nearbyCount + cityCount             = 0 + 1 = 1
    //   UK-wide  = nearbyCount + cityCount + distantCount = 0 + 1 + 12 = 13
    // Backend bucket-count contract on the wire is UNCHANGED — the
    // cumulative transform happens at the display layer only.
    const { getByPlaceholderText, getByText } = render(<SearchScreen />, { wrapper })
    await typeAndSettle(getByPlaceholderText)
    await waitFor(() => {
      expect(getByText(/Nearby · 0/)).toBeTruthy()
      expect(getByText(/Your city · 1/)).toBeTruthy()
      expect(getByText(/UK-wide · 13/)).toBeTruthy()
    })
  })

  it('CUMULATIVE counts — Karaara nearby-only case (1/0/0 buckets → 1/1/1 display)', async () => {
    // Owner-flagged screenshot case (PR #112 device-QA fix #2): Karaara
    // sits 276m away (nearby).  Cumulative display avoids the absurd
    // "Nearby · 1, Your city · 0, UK-wide · 0" that bucket semantics
    // produce — a result that's IN YOUR AREA must ALSO appear in YOUR
    // CITY and UK-WIDE counts.
    mockSearchState.scenario = 'karaara_nearby_only'
    const { getByPlaceholderText, getByText } = render(<SearchScreen />, { wrapper })
    await typeAndSettle(getByPlaceholderText, 'Karaara')
    await waitFor(() => {
      expect(getByText(/Nearby · 1/)).toBeTruthy()
      expect(getByText(/Your city · 1/)).toBeTruthy()
      expect(getByText(/UK-wide · 1/)).toBeTruthy()
    })
  })

  it('renders "No merchants found" copy when results are empty (reason=none)', async () => {
    mockSearchState.scenario = 'empty'
    const { getByPlaceholderText, getByText } = render(<SearchScreen />, { wrapper })
    await typeAndSettle(getByPlaceholderText)
    await waitFor(() => expect(getByText('No merchants found')).toBeTruthy())
  })

  it('renders "No matches in the UK yet" copy when reason=no_uk_supply', async () => {
    mockSearchState.scenario = 'no_uk_supply'
    const { getByPlaceholderText, getByText } = render(<SearchScreen />, { wrapper })
    await typeAndSettle(getByPlaceholderText)
    await waitFor(() => expect(getByText(/No matches in the UK yet/)).toBeTruthy())
  })

  // PR #112 fixup-4 — unified locality-aware header.  Replaces both the
  // separate `<LocalityCaption>` and `<ExpandedResultBanner>` with a SINGLE
  // header line at the top of the result list:
  //
  //   Normal:    Results for "X" near <Locality>
  //   Expanded:  Closest matches for "X" near <Locality>
  //
  // Positive framing on expanded ("Closest matches" instead of
  // "Nothing in X yet") per owner direction.
  it('unified expanded header copy (fixup-4): "Closest matches for X near Locality"', async () => {
    mockSearchState.scenario = 'expanded'
    const { getByPlaceholderText, getByText, queryByText } = render(<SearchScreen />, { wrapper })
    await typeAndSettle(getByPlaceholderText)
    await waitFor(() => {
      expect(getByText('Closest matches for "Pizza" near Huddersfield')).toBeTruthy()
      // List still renders.
      expect(getByText('Pizza Express')).toBeTruthy()
    })
    // Legacy/rejected copy MUST NOT appear (regression guards).
    expect(queryByText(/Nothing in Huddersfield yet/)).toBeNull()
    expect(queryByText(/Here are the closest matches/)).toBeNull()
    expect(queryByText(/showing wider results/)).toBeNull()
    expect(queryByText(/No matches nearby/)).toBeNull()
  })

  it('unified normal header copy (fixup-4): "Results for X near Locality"', async () => {
    // happy-path mockMeta sets scope=city, scopeExpanded=false; we add an
    // effectiveLocality on the wire so the unified header carries the
    // locality suffix.
    mockSearchState.scenario = 'happy_with_locality'
    const { getByPlaceholderText, getByText } = render(<SearchScreen />, { wrapper })
    await typeAndSettle(getByPlaceholderText)
    await waitFor(() => {
      expect(getByText('Results for "Pizza" near Huddersfield')).toBeTruthy()
    })
  })

  it('unified header falls back to plain "Results for X" when locality is absent', async () => {
    // mockMeta default has effectiveLocality undefined.
    const { getByPlaceholderText, getByText } = render(<SearchScreen />, { wrapper })
    await typeAndSettle(getByPlaceholderText)
    await waitFor(() => {
      expect(getByText('Results for "Pizza"')).toBeTruthy()
    })
  })

  // PR #112 fixup-3 — effective-scope pin.
  // The active scope pill reflects what's DISPLAYED, not what was REQUESTED.
  // When backend cascades 'city' → 'platform' (no city supply), the active
  // pill moves to 'UK-wide' so the UI stays internally consistent (no
  // "Your city · 0 selected" while results show below).
  it('active scope pill reflects effective (displayed) scope, not requested scope', async () => {
    mockSearchState.scenario = 'expanded'
    const { getByPlaceholderText, getByLabelText } = render(<SearchScreen />, { wrapper })
    await typeAndSettle(getByPlaceholderText)
    await waitFor(() => {
      // ScopePillRow uses accessibilityState.selected for the active pill.
      // We can confirm via the a11y label "Filter to UK-wide".
      const platformPill = getByLabelText(/Filter to UK-wide/i)
      // RN Testing Library exposes accessibilityState via .props on the host.
      expect(platformPill.props.accessibilityState).toMatchObject({ selected: true })
      const cityPill = getByLabelText(/Filter to Your city/i)
      expect(cityPill.props.accessibilityState).toMatchObject({ selected: false })
    })
  })

  it('does NOT surface a "region" pill — only Nearby / Your city / UK-wide', async () => {
    const { getByPlaceholderText, queryByText } = render(<SearchScreen />, { wrapper })
    await typeAndSettle(getByPlaceholderText)
    await waitFor(() => expect(queryByText(/Region/i)).toBeNull())
  })

  // Discovery Rebaseline PR-2 (Phase 2.1) — load-bearing Covelum cardinality
  // pin. Multi-branch merchants must render as separate Search rows. Before
  // this rebaseline, search collapsed Covelum to one tile and the Colchester
  // branch was lost from the UI.
  it('multi-branch merchant renders as TWO search rows (Covelum bug closure)', async () => {
    mockSearchState.scenario = 'multi_branch'
    const { getByPlaceholderText, getAllByText, queryByText } = render(<SearchScreen />, { wrapper })
    await typeAndSettle(getByPlaceholderText, 'Covelum')
    await waitFor(() => {
      // Merchant identity appears once per branch row — two rows for Covelum.
      expect(getAllByText('Covelum').length).toBe(2)
      // Branch identity surfaces on each row — de-duped per the
      // PR-2 device-QA fix (branchName === localityName).
      expect(getAllByText('Brightlingsea').length).toBe(1)
      expect(getAllByText('Colchester').length).toBe(1)
      // Negative pin: the old buggy duplicate-label format MUST NOT
      // appear — pins the de-dupe contract from formatBranchLine.
      expect(queryByText('Brightlingsea, Brightlingsea')).toBeNull()
      expect(queryByText('Colchester, Colchester')).toBeNull()
    })
  })

  it('tile tap routes to /(app)/merchant/[id]?branch=<branchId> (Spec §6.1 locked URL)', async () => {
    const { getByPlaceholderText, getByText } = render(<SearchScreen />, { wrapper })
    await typeAndSettle(getByPlaceholderText)
    await waitFor(() => expect(getByText('Pizza Express')).toBeTruthy())
    fireEvent.press(getByText('Pizza Express'))
    expect(mockRouterPush).toHaveBeenCalledWith('/(app)/merchant/m1?branch=brn1')
  })

  // PR-2 device-QA fix (2026-05-19) — count/list consistency pin.
  //
  // Owner-flagged screenshot bug: scope pill displayed "UK-wide · 1"
  // while the branch list was empty.  Root cause: SearchScreen consumed
  // the LEGACY merchant `meta.distantCount` (= 1, because the merchant
  // path matched the query) while rendering the EMPTY `branches[]`.
  //
  // Fix: SearchScreen reads `branchMeta` exclusively — counts +
  // emptyStateReason both reflect branch reality.  Empty branch list +
  // zero branch counts + 'no_uk_supply' empty state all agree.
  it('reads branchMeta — does NOT mix legacy merchant counts into branch list (PR-2 device-QA pin)', async () => {
    mockSearchState.scenario = 'count_list_mismatch'
    const { getByPlaceholderText, queryByText, getByText } = render(<SearchScreen />, { wrapper })
    await typeAndSettle(getByPlaceholderText)
    // Branch list is empty → empty-state copy MUST render (not the
    // legacy merchant `Legacy Merchant` name).
    await waitFor(() => {
      expect(queryByText('Legacy Merchant')).toBeNull()
      expect(getByText(/No matches in the UK yet/i)).toBeTruthy()
    })
    // Scope pills: counts must reflect branchMeta (all zero) NOT the
    // legacy merchant meta (distantCount: 1).  The "UK-wide · 1" string
    // MUST NOT appear.
    expect(queryByText(/UK-wide · 1\b/)).toBeNull()
    expect(queryByText(/UK-wide · 0\b/)).toBeTruthy()
  })
})
