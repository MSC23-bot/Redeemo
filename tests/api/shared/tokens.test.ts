import { describe, it, expect } from 'vitest'
import {
  generateRefreshToken,
  hashRefreshToken,
  generateSessionId,
} from '../../../src/api/shared/tokens'

describe('token utilities', () => {
  it('generates a refresh token of correct length', () => {
    const token = generateRefreshToken()
    // 64 bytes hex = 128 characters
    expect(token).toHaveLength(128)
    expect(/^[a-f0-9]+$/.test(token)).toBe(true)
  })

  it('generates unique refresh tokens', () => {
    const t1 = generateRefreshToken()
    const t2 = generateRefreshToken()
    expect(t1).not.toBe(t2)
  })

  it('hashes a refresh token deterministically', () => {
    const token = generateRefreshToken()
    const hash1 = hashRefreshToken(token)
    const hash2 = hashRefreshToken(token)
    expect(hash1).toBe(hash2)
    expect(hash1).not.toBe(token)
  })

  it('generates a unique session ID', () => {
    const id1 = generateSessionId()
    const id2 = generateSessionId()
    expect(id1).not.toBe(id2)
    expect(id1.length).toBeGreaterThan(0)
  })
})
