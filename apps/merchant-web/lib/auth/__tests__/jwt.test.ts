import { decodeMerchantJwt } from '@/lib/auth/jwt'

function jwt(payload: object): string {
  const b = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${b({ alg: 'HS256' })}.${b(payload)}.sig`
}

describe('decodeMerchantJwt (M1 Slice 1)', () => {
  it('extracts sub + sessionId from a merchant access token', () => {
    const token = jwt({ sub: 'ma1', role: 'merchant', deviceId: 'd', sessionId: 's1' })
    expect(decodeMerchantJwt(token)).toEqual({ sub: 'ma1', sessionId: 's1' })
  })

  it('returns null when a required claim is missing or the token is malformed', () => {
    expect(decodeMerchantJwt(jwt({ sub: 'ma1' }))).toBeNull() // no sessionId
    expect(decodeMerchantJwt(jwt({ sessionId: 's1' }))).toBeNull() // no sub
    expect(decodeMerchantJwt('garbage')).toBeNull()
    expect(decodeMerchantJwt('')).toBeNull()
  })
})
