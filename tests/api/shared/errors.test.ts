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

  it('USER_NOT_FOUND produces correct error', () => {
    const err = new AppError('USER_NOT_FOUND')
    expect(err.code).toBe('USER_NOT_FOUND')
    expect(err.statusCode).toBe(404)
  })

  it('CURRENT_PASSWORD_INCORRECT produces correct error', () => {
    const err = new AppError('CURRENT_PASSWORD_INCORRECT')
    expect(err.code).toBe('CURRENT_PASSWORD_INCORRECT')
    expect(err.statusCode).toBe(400)
  })

  it('MERCHANT_UNAVAILABLE produces correct error', () => {
    const err = new AppError('MERCHANT_UNAVAILABLE')
    expect(err.code).toBe('MERCHANT_UNAVAILABLE')
    expect(err.statusCode).toBe(404)
  })

  it('SEARCH_QUERY_REQUIRED produces correct error', () => {
    const err = new AppError('SEARCH_QUERY_REQUIRED')
    expect(err.code).toBe('SEARCH_QUERY_REQUIRED')
    expect(err.statusCode).toBe(400)
  })

  it('ALREADY_FAVOURITED produces correct error', () => {
    const err = new AppError('ALREADY_FAVOURITED')
    expect(err.code).toBe('ALREADY_FAVOURITED')
    expect(err.statusCode).toBe(409)
  })

  it('FAVOURITE_NOT_FOUND produces correct error', () => {
    const err = new AppError('FAVOURITE_NOT_FOUND')
    expect(err.code).toBe('FAVOURITE_NOT_FOUND')
    expect(err.statusCode).toBe(404)
  })

  it('CAMPAIGN_NOT_FOUND produces correct error', () => {
    const err = new AppError('CAMPAIGN_NOT_FOUND')
    expect(err.code).toBe('CAMPAIGN_NOT_FOUND')
    expect(err.statusCode).toBe(404)
  })

  it('INVALID_INTERESTS produces correct error', () => {
    const err = new AppError('INVALID_INTERESTS')
    expect(err.code).toBe('INVALID_INTERESTS')
    expect(err.statusCode).toBe(400)
  })
})
