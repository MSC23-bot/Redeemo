/**
 * lib/api/branchLifecycleReview: Zod schema parsing + apiFetch wiring (Branches PR-5).
 *
 * Mirrors lib/api/__tests__/voucherReview.test.ts. Validates the
 * BranchLifecycleReviewContext schema and the three endpoint wrappers
 * (get / approve / reject) against the branchLifecycleApplier contract. Asserts the
 * read shape carries NO redemptionPin field (the backend curates the select).
 */
import {
  branchLifecycleReviewApi,
  branchLifecycleReviewContextSchema,
} from '../branchLifecycleReview'

// ── Mock apiFetch ─────────────────────────────────────────────────────────────

jest.mock('../client', () => ({
  apiFetch: jest.fn(),
}))

import { apiFetch } from '../client'

const mockedApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeContext(kind: 'create' | 'close' = 'create') {
  return {
    kind,
    merchant: { id: 'm-1', businessName: 'Acme Coffee' },
    branch: {
      id: 'branch-1',
      name: 'Acme Soho',
      addressLine1: '1 Greek Street',
      addressLine2: null,
      city: 'London',
      postcode: 'W1D 4DX',
      localityName: 'Soho',
      phone: '020 0000 0000',
      email: 'soho@acme.test',
      websiteUrl: 'https://acme.test/soho',
      isMainBranch: false,
      isActive: kind === 'close',
      lifecycleStatus: kind === 'create' ? 'PENDING_CREATE' : 'PENDING_CLOSE',
      locationConfidence: kind === 'create' ? 'POSTCODE_CENTROID' : 'MANUALLY_CONFIRMED',
      latitude: 51.5,
      longitude: -0.13,
    },
    closeReason: kind === 'close' ? 'We are relocating.' : null,
  }
}

// ── Schema tests ──────────────────────────────────────────────────────────────

describe('branchLifecycleReviewContextSchema', () => {
  it('parses a valid CREATE review context', () => {
    const parsed = branchLifecycleReviewContextSchema.parse(makeContext('create'))
    expect(parsed.kind).toBe('create')
    expect(parsed.branch.id).toBe('branch-1')
    expect(parsed.branch.locationConfidence).toBe('POSTCODE_CENTROID')
    expect(parsed.merchant.businessName).toBe('Acme Coffee')
    expect(parsed.closeReason).toBeNull()
  })

  it('parses a valid CLOSE review context with a close reason', () => {
    const parsed = branchLifecycleReviewContextSchema.parse(makeContext('close'))
    expect(parsed.kind).toBe('close')
    expect(parsed.closeReason).toBe('We are relocating.')
    expect(parsed.branch.isActive).toBe(true)
  })

  it('allows the nullable contact / locality / lat / lng fields to be null', () => {
    const ctx = makeContext('create')
    const bag = {
      ...ctx,
      branch: {
        ...ctx.branch,
        addressLine2: null,
        localityName: null,
        phone: null,
        email: null,
        websiteUrl: null,
        latitude: null,
        longitude: null,
      },
    }
    const parsed = branchLifecycleReviewContextSchema.parse(bag)
    expect(parsed.branch.phone).toBeNull()
    expect(parsed.branch.latitude).toBeNull()
    expect(parsed.branch.longitude).toBeNull()
  })

  it('parses even when the payload carries an extra (unexpected) field, ignoring it', () => {
    // Defence: a stray field on the branch (e.g. a leaked redemptionPin) is NOT
    // surfaced: the schema only picks the declared keys, so it never lands on the
    // parsed object the UI renders.
    const ctx = makeContext('create')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bag = { ...ctx, branch: { ...ctx.branch, redemptionPin: '1234' } } as any
    const parsed = branchLifecycleReviewContextSchema.parse(bag)
    expect((parsed.branch as Record<string, unknown>).redemptionPin).toBeUndefined()
  })

  it('rejects an unknown kind', () => {
    const ctx = makeContext('create')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => branchLifecycleReviewContextSchema.parse({ ...ctx, kind: 'edit' } as any)).toThrow()
  })

  it('throws on a missing required branch field', () => {
    const ctx = makeContext('create')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bad = { ...ctx, branch: { ...ctx.branch, id: undefined } } as any
    expect(() => branchLifecycleReviewContextSchema.parse(bad)).toThrow()
  })
})

// ── branchLifecycleReviewApi.get ──────────────────────────────────────────────

describe('branchLifecycleReviewApi.get', () => {
  afterEach(() => jest.clearAllMocks())

  it('calls apiFetch with the correct URL and auth:true', async () => {
    mockedApiFetch.mockResolvedValueOnce(makeContext('create'))
    await branchLifecycleReviewApi.get('apr-1')
    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/api/v1/admin/approvals/apr-1/branch-lifecycle-review',
      { auth: true },
    )
  })

  it('returns the parsed BranchLifecycleReviewContext', async () => {
    mockedApiFetch.mockResolvedValueOnce(makeContext('close'))
    const result = await branchLifecycleReviewApi.get('apr-1')
    expect(result.kind).toBe('close')
    expect(result.branch.name).toBe('Acme Soho')
  })

  it('propagates apiFetch errors', async () => {
    mockedApiFetch.mockRejectedValueOnce(new Error('APPROVAL_NOT_FOUND'))
    await expect(branchLifecycleReviewApi.get('apr-1')).rejects.toThrow('APPROVAL_NOT_FOUND')
  })
})

// ── branchLifecycleReviewApi.approve ──────────────────────────────────────────

describe('branchLifecycleReviewApi.approve', () => {
  afterEach(() => jest.clearAllMocks())

  it('POSTs to the approve endpoint with auth:true', async () => {
    mockedApiFetch.mockResolvedValueOnce({ approved: true, alreadyDone: false })
    const res = await branchLifecycleReviewApi.approve('apr-1')
    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/api/v1/admin/approvals/apr-1/approve-branch-lifecycle',
      { method: 'POST', auth: true },
    )
    expect(res.approved).toBe(true)
    expect(res.alreadyDone).toBe(false)
  })

  it('parses an idempotent no-op (alreadyDone omitted)', async () => {
    mockedApiFetch.mockResolvedValueOnce({ approved: true })
    const res = await branchLifecycleReviewApi.approve('apr-1')
    expect(res.approved).toBe(true)
    expect(res.alreadyDone).toBeUndefined()
  })
})

// ── branchLifecycleReviewApi.reject ───────────────────────────────────────────

describe('branchLifecycleReviewApi.reject', () => {
  afterEach(() => jest.clearAllMocks())

  it('POSTs the reason to the reject endpoint with auth:true', async () => {
    mockedApiFetch.mockResolvedValueOnce({ rejected: true })
    const res = await branchLifecycleReviewApi.reject('apr-1', 'Address is incomplete.')
    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/api/v1/admin/approvals/apr-1/reject-branch-lifecycle',
      { method: 'POST', auth: true, body: JSON.stringify({ reason: 'Address is incomplete.' }) },
    )
    expect(res.rejected).toBe(true)
  })
})
