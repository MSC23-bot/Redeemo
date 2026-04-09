import { describe, it, expect } from 'vitest'
import { AppError, ErrorCode } from '../../../src/api/shared/errors'

describe('AppError', () => {
  it('creates an error with code and statusCode', () => {
    const err = new AppError(ErrorCode.INVALID_CREDENTIALS)
    expect(err.code).toBe('INVALID_CREDENTIALS')
    expect(err.statusCode).toBe(401)
    expect(err instanceof Error).toBe(true)
  })

  it('serialises to the standard JSON shape', () => {
    const err = new AppError(ErrorCode.EMAIL_ALREADY_EXISTS)
    expect(err.toJSON()).toEqual({
      error: {
        code: 'EMAIL_ALREADY_EXISTS',
        message: expect.any(String),
        statusCode: 409,
      },
    })
  })
})
