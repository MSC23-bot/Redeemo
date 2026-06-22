import { describe, it, expect } from 'vitest'
import { ERROR_DEFINITIONS } from '../../../src/api/shared/errors'

describe('Staff & Access error codes', () => {
  it('defines MULTIPLE_BRANCH_USERS (409)', () => {
    expect(ERROR_DEFINITIONS.MULTIPLE_BRANCH_USERS.statusCode).toBe(409)
  })
  it('defines MULTI_MEMBERSHIP_UNSUPPORTED (400)', () => {
    expect(ERROR_DEFINITIONS.MULTI_MEMBERSHIP_UNSUPPORTED.statusCode).toBe(400)
  })
  it('reuses INSUFFICIENT_PERMISSIONS (403) for role denials', () => {
    expect(ERROR_DEFINITIONS.INSUFFICIENT_PERMISSIONS.statusCode).toBe(403)
  })
})
