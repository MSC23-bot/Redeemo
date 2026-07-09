/**
 * lib/api/review — Zod schema parsing + apiFetch wiring.
 */
import { reviewApi, reviewContextSchema } from '../review'

// ── Mock apiFetch ─────────────────────────────────────────────────────────────

jest.mock('../client', () => ({
  apiFetch: jest.fn(),
}))

import { apiFetch } from '../client'

const mockedApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeContext() {
  return {
    approval: {
      id: 'apr-1',
      type: 'MERCHANT_ONBOARDING',
      status: 'PENDING',
      submittedAt: '2026-06-10T09:00:00.000Z',
      actionedAt: null,
      claimedAt: null,
      comment: null,
      claimedBy: null,
      actionedBy: null,
    },
    merchant: {
      id: 'm-1',
      businessName: 'Acme Coffee',
      tradingName: null,
      description: null,
      websiteUrl: null,
      logoUrl: null,
      bannerUrl: null,
      companyNumber: null,
      vatNumber: null,
      status: 'PENDING_APPROVAL',
      verificationStatus: 'PENDING',
      contractStatus: 'SIGNED',
      contractStartDate: null,
      contractEndDate: null,
      onboardingStep: 'SUBMIT_FOR_REVIEW',
      createdAt: '2026-06-01T08:00:00.000Z',
      category: null,
    },
    owner: {
      id: 'u-1',
      name: 'Ali Hassan',
      email: 'ali@acme.co.uk',
      phone: null,
    },
    branches: [
      {
        id: 'br-1',
        name: 'Main',
        isMainBranch: true,
        isActive: true,
        addressLine1: '1 High Street',
        addressLine2: null,
        city: 'Huddersfield',
        postcode: 'HD1 1AA',
        localityName: 'Huddersfield',
        locationConfidence: 'ADDRESS_GEOCODED',
        latitude: 53.6458,
        longitude: -1.785,
        googlePlaceId: 'place-123',
        locationSuggestion: null,
      },
    ],
    vouchers: [],
    documents: [],
    checklist: {
      branch_created: true,
      contract_signed: true,
      rmv_configured: false,
      all_complete: false,
    },
    thinAreas: {
      documentsUploaded: false,
      companyTypeCaptured: false,
      registeredOfficeCaptured: false,
      sectorEvidenceCaptured: false,
      companyNumberProvided: false,
      vatNumberProvided: false,
      documentsGated: false,
    },
  }
}

// ── Schema tests ──────────────────────────────────────────────────────────────

describe('reviewContextSchema', () => {
  it('parses a valid review context', () => {
    const ctx = makeContext()
    const parsed = reviewContextSchema.parse(ctx)
    expect(parsed.approval.id).toBe('apr-1')
    expect(parsed.merchant?.businessName).toBe('Acme Coffee')
    expect(parsed.branches).toHaveLength(1)
  })

  it('allows merchant to be null', () => {
    const ctx = { ...makeContext(), merchant: null, owner: null, checklist: null, thinAreas: null }
    const parsed = reviewContextSchema.parse(ctx)
    expect(parsed.merchant).toBeNull()
  })

  it('throws on missing required approval field', () => {
    const ctx = makeContext()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bad = { ...ctx, approval: { ...ctx.approval, id: undefined } } as any
    expect(() => reviewContextSchema.parse(bad)).toThrow()
  })

  it('parses a MERCHANT_CONFIRMED branch with a null-placeId merchant_pin_drop suggestion (Slice 3)', () => {
    const ctx = makeContext()
    ctx.branches[0].locationConfidence = 'MERCHANT_CONFIRMED'
    // A merchant pin-drop FAIL surfaces a suggestion with placeId null + the
    // merchant_pin_drop source; the schema must accept both.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(ctx.branches[0] as any).locationSuggestion = {
      placeId: null,
      latitude: 53.9,
      longitude: -1.9,
      postcode: 'HD1 1AA',
      source: 'merchant_pin_drop',
    }
    const parsed = reviewContextSchema.parse(ctx)
    expect(parsed.branches[0].locationConfidence).toBe('MERCHANT_CONFIRMED')
    expect(parsed.branches[0].locationSuggestion).toEqual({
      placeId: null,
      latitude: 53.9,
      longitude: -1.9,
      postcode: 'HD1 1AA',
      source: 'merchant_pin_drop',
    })
  })
})

// ── reviewApi.get ─────────────────────────────────────────────────────────────

describe('reviewApi.get', () => {
  afterEach(() => jest.clearAllMocks())

  it('calls apiFetch with the correct URL and auth:true', async () => {
    const payload = makeContext()
    mockedApiFetch.mockResolvedValueOnce(payload)

    await reviewApi.get('apr-1')

    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/api/v1/admin/approvals/apr-1/review',
      { auth: true }
    )
  })

  it('returns the parsed ReviewContext', async () => {
    const payload = makeContext()
    mockedApiFetch.mockResolvedValueOnce(payload)

    const result = await reviewApi.get('apr-1')

    expect(result.approval.id).toBe('apr-1')
    expect(result.merchant?.businessName).toBe('Acme Coffee')
  })

  it('propagates apiFetch errors', async () => {
    mockedApiFetch.mockRejectedValueOnce(new Error('Network error'))
    await expect(reviewApi.get('apr-1')).rejects.toThrow('Network error')
  })

  it('throws when the response does not match the schema', async () => {
    mockedApiFetch.mockResolvedValueOnce({ not: 'a review context' })
    await expect(reviewApi.get('apr-1')).rejects.toThrow()
  })
})
