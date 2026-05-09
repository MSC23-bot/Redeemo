import {
  RedemptionStatusByCodeSchema,
  redemptionApi,
} from '@/lib/api/redemption'
import { api } from '@/lib/api'

// M3 Task 6 — customer-app API client extensions for the
// Show-to-Staff polling endpoint + screenshot-flag telemetry endpoint.
//
// Encoding contract (locked in plan §M3a Task 6 + owner Task 6 direction):
//   - URL-encode the code via encodeURIComponent for transport safety.
//   - Do NOT normalise client-side (lowercase/spaces/hyphens). The
//     backend service handles normalisation canonically — two
//     implementations would drift.
//
// Slim payload contract (owner direction at Task 6 kickoff):
//   - Schema parses exactly 7 keys: code, isValidated, validatedAt,
//     validationMethod, voucherId, merchantName, branchName.
//   - No userId. No validatedById. No estimatedSaving. No redeemedAt.
//   - Customer / validation actor fields MUST NOT leak.

beforeEach(() => {
  jest.spyOn(api, 'get').mockReset()
  jest.spyOn(api, 'post').mockReset()
})

describe('RedemptionStatusByCodeSchema — slim polling payload', () => {
  const validPayload = {
    code:             'A7K2P9X4',
    isValidated:      false,
    validatedAt:      null,
    validationMethod: null,
    voucherId:        'v1',
    merchantName:     'Pizza Palace',
    branchName:       'High Street',
  }

  it('parses an unvalidated payload', () => {
    const result = RedemptionStatusByCodeSchema.safeParse(validPayload)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual(validPayload)
    }
  })

  it('parses a validated payload with QR_SCAN method', () => {
    const result = RedemptionStatusByCodeSchema.safeParse({
      ...validPayload,
      isValidated:      true,
      validatedAt:      '2026-05-08T10:00:00Z',
      validationMethod: 'QR_SCAN',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.isValidated).toBe(true)
      expect(result.data.validationMethod).toBe('QR_SCAN')
    }
  })

  it('parses a validated payload with MANUAL method', () => {
    const result = RedemptionStatusByCodeSchema.safeParse({
      ...validPayload,
      isValidated:      true,
      validatedAt:      '2026-05-08T10:00:00Z',
      validationMethod: 'MANUAL',
    })
    expect(result.success).toBe(true)
  })

  it('rejects an unknown validationMethod', () => {
    const result = RedemptionStatusByCodeSchema.safeParse({
      ...validPayload,
      validationMethod: 'CARRIER_PIGEON',
    })
    expect(result.success).toBe(false)
  })

  it('strips extra fields — customer/actor data MUST NOT leak through the schema', () => {
    // Even if the backend drifts and starts returning extra fields, the
    // client schema must NOT surface them — keeps the slim contract.
    const result = RedemptionStatusByCodeSchema.safeParse({
      ...validPayload,
      // Things the backend purposely keeps off the wire — pin that
      // they don't leak through if anyone ever adds them.
      userId:          'u1',
      validatedById:   'staff1',
      estimatedSaving: 4.5,
      redeemedAt:      '2026-05-12T18:30:00Z',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(Object.keys(result.data).sort()).toEqual([
        'branchName', 'code', 'isValidated', 'merchantName',
        'validatedAt', 'validationMethod', 'voucherId',
      ])
      // @ts-expect-error — these fields must NOT exist on the parsed type
      expect(result.data.userId).toBeUndefined()
      // @ts-expect-error
      expect(result.data.validatedById).toBeUndefined()
    }
  })
})

describe('redemptionApi.getMyRedemptionByCode', () => {
  const okPayload = {
    code:             'A7K2P9X4',
    isValidated:      false,
    validatedAt:      null,
    validationMethod: null,
    voucherId:        'v1',
    merchantName:     'Pizza Palace',
    branchName:       'High Street',
  }

  it('GETs /api/v1/redemption/me/<encoded-code> and returns the parsed payload', async () => {
    (api.get as jest.Mock).mockResolvedValue(okPayload)
    const result = await redemptionApi.getMyRedemptionByCode('A7K2P9X4')
    expect(api.get).toHaveBeenCalledWith('/api/v1/redemption/me/A7K2P9X4')
    expect(result.code).toBe('A7K2P9X4')
    expect(result.isValidated).toBe(false)
  })

  it('flips to validated phase when payload returns isValidated:true', async () => {
    (api.get as jest.Mock).mockResolvedValue({
      ...okPayload,
      isValidated:      true,
      validatedAt:      '2026-05-08T10:01:15Z',
      validationMethod: 'QR_SCAN',
    })
    const result = await redemptionApi.getMyRedemptionByCode('A7K2P9X4')
    expect(result.isValidated).toBe(true)
    expect(result.validatedAt).toBe('2026-05-08T10:01:15Z')
    expect(result.validationMethod).toBe('QR_SCAN')
  })

  it('URL-encodes unusual code shapes (transport safety; no client-side normalisation)', async () => {
    // Defensive: even though codes are 8-char A-Z+0-9 minus O,I in
    // production, manual-entry surfaces could pass user-typed shapes.
    // We URL-encode for transport safety. Normalisation stays
    // server-side (single source of truth in the backend service).
    (api.get as jest.Mock).mockResolvedValue(okPayload)
    await redemptionApi.getMyRedemptionByCode('a7k2 p9x4')
    expect(api.get).toHaveBeenCalledWith('/api/v1/redemption/me/a7k2%20p9x4')
  })

  it('throws when the backend returns a malformed payload (Zod rejection)', async () => {
    (api.get as jest.Mock).mockResolvedValue({ code: 'A7K2P9X4' /* missing required fields */ })
    await expect(redemptionApi.getMyRedemptionByCode('A7K2P9X4')).rejects.toThrow()
  })
})

describe('redemptionApi.postScreenshotFlag', () => {
  it('POSTs platform body to /api/v1/redemption/<encoded-code>/screenshot-flag', async () => {
    (api.post as jest.Mock).mockResolvedValue({ accepted: true })
    const result = await redemptionApi.postScreenshotFlag('A7K2P9X4', 'ios')
    expect(api.post).toHaveBeenCalledWith(
      '/api/v1/redemption/A7K2P9X4/screenshot-flag',
      { platform: 'ios' },
    )
    expect(result.accepted).toBe(true)
  })

  it('returns accepted:false when the server reports a dedup hit', async () => {
    (api.post as jest.Mock).mockResolvedValue({ accepted: false })
    const result = await redemptionApi.postScreenshotFlag('A7K2P9X4', 'android')
    expect(result.accepted).toBe(false)
  })

  it('URL-encodes the code in the path', async () => {
    (api.post as jest.Mock).mockResolvedValue({ accepted: true })
    await redemptionApi.postScreenshotFlag('a b c', 'ios')
    const calledPath = (api.post as jest.Mock).mock.calls[0][0] as string
    expect(calledPath).toBe('/api/v1/redemption/a%20b%20c/screenshot-flag')
  })
})
