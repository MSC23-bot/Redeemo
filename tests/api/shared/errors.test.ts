import { describe, it, expect } from 'vitest'
import { AppError, ErrorCode, ERROR_DEFINITIONS } from '../../../src/api/shared/errors'

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

  it('USER_NOT_FOUND is defined', () => { expect(ERROR_DEFINITIONS.USER_NOT_FOUND.statusCode).toBe(404) })
  it('CURRENT_PASSWORD_INCORRECT is defined', () => { expect(ERROR_DEFINITIONS.CURRENT_PASSWORD_INCORRECT.statusCode).toBe(400) })
  it('MERCHANT_UNAVAILABLE is defined', () => { expect(ERROR_DEFINITIONS.MERCHANT_UNAVAILABLE.statusCode).toBe(404) })
  it('SEARCH_QUERY_REQUIRED is defined', () => { expect(ERROR_DEFINITIONS.SEARCH_QUERY_REQUIRED.statusCode).toBe(400) })
  it('ALREADY_FAVOURITED is defined', () => { expect(ERROR_DEFINITIONS.ALREADY_FAVOURITED.statusCode).toBe(409) })
  it('FAVOURITE_NOT_FOUND is defined', () => { expect(ERROR_DEFINITIONS.FAVOURITE_NOT_FOUND.statusCode).toBe(404) })
  it('CAMPAIGN_NOT_FOUND is defined', () => { expect(ERROR_DEFINITIONS.CAMPAIGN_NOT_FOUND.statusCode).toBe(404) })
  it('INVALID_INTERESTS is defined', () => { expect(ERROR_DEFINITIONS.INVALID_INTERESTS.statusCode).toBe(400) })
})
