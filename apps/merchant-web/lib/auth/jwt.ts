// M1 Slice 1: decode the merchant access JWT to recover the claims the BFF needs
// to build the backend /refresh body. The backend signs
//   { sub: <merchantAdminId>, role: 'merchant', deviceId, sessionId }
// (src/api/auth/merchant/service.ts). The refresh body is
//   { refreshToken, sessionId, entityId } where entityId === sub.
// We only READ the unsigned payload (the backend already verified the signature on
// issue and re-verifies on every authed call); we never trust it for authz.
export interface MerchantJwtClaims {
  sub: string
  sessionId: string
}

export function decodeMerchantJwt(accessToken: string): MerchantJwtClaims | null {
  try {
    const payload = accessToken.split('.')[1]
    if (!payload) return null
    const json = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<string, unknown>
    if (typeof json.sub === 'string' && typeof json.sessionId === 'string') {
      return { sub: json.sub, sessionId: json.sessionId }
    }
    return null
  } catch {
    return null
  }
}
