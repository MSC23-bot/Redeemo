import crypto from 'crypto'

export function generateRefreshToken(): string {
  return crypto.randomBytes(64).toString('hex')
}

export function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

export function generateSessionId(): string {
  return crypto.randomBytes(16).toString('hex')
}

export function generateSecureToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('hex')
}

export function generateOtpCode(): string {
  // Cryptographically random 6-digit code
  const num = crypto.randomInt(0, 1_000_000)
  return num.toString().padStart(6, '0')
}
