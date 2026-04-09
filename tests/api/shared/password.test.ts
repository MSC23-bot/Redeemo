import { describe, it, expect } from 'vitest'
import { hashPassword, verifyPassword, validatePasswordPolicy } from '../../../src/api/shared/password'

describe('password utilities', () => {
  it('hashes a password and verifies correctly', async () => {
    const hash = await hashPassword('MyPass123!')
    expect(hash).not.toBe('MyPass123!')
    const valid = await verifyPassword('MyPass123!', hash)
    expect(valid).toBe(true)
  })

  it('returns false for wrong password', async () => {
    const hash = await hashPassword('MyPass123!')
    const valid = await verifyPassword('WrongPass1!', hash)
    expect(valid).toBe(false)
  })

  it('accepts a valid password', () => {
    expect(validatePasswordPolicy('MyPass123!')).toBe(true)
  })

  it('rejects password with no uppercase', () => {
    expect(validatePasswordPolicy('mypass123!')).toBe(false)
  })

  it('rejects password with no lowercase', () => {
    expect(validatePasswordPolicy('MYPASS123!')).toBe(false)
  })

  it('rejects password with no digit', () => {
    expect(validatePasswordPolicy('MyPassword!')).toBe(false)
  })

  it('rejects password with no special character', () => {
    expect(validatePasswordPolicy('MyPass1234')).toBe(false)
  })

  it('rejects password shorter than 8 characters', () => {
    expect(validatePasswordPolicy('My1!')).toBe(false)
  })
})
