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

  it('REVIEW_NOT_FOUND produces correct error', () => {
    const err = new AppError('REVIEW_NOT_FOUND')
    expect(err.code).toBe('REVIEW_NOT_FOUND')
    expect(err.statusCode).toBe(404)
  })
  it('REVIEW_NOT_OWNED produces correct error', () => {
    const err = new AppError('REVIEW_NOT_OWNED')
    expect(err.code).toBe('REVIEW_NOT_OWNED')
    expect(err.statusCode).toBe(403)
  })
  it('REVIEW_ALREADY_EXISTS produces correct error', () => {
    const err = new AppError('REVIEW_ALREADY_EXISTS')
    expect(err.code).toBe('REVIEW_ALREADY_EXISTS')
    expect(err.statusCode).toBe(409)
  })
  it('BRANCH_UNAVAILABLE produces correct error', () => {
    const err = new AppError('BRANCH_UNAVAILABLE')
    expect(err.code).toBe('BRANCH_UNAVAILABLE')
    expect(err.statusCode).toBe(404)
  })
  it('ALREADY_VERIFIED produces correct error', () => {
    const err = new AppError('ALREADY_VERIFIED')
    expect(err.code).toBe('ALREADY_VERIFIED')
    expect(err.statusCode).toBe(409)
  })

  // ── Optional details payload (M2 prep) ─────────────────────────────────
  // Backward-compatible: existing `new AppError(code)` keeps working
  // unchanged. New optional second arg `details` flows into the response
  // envelope alongside `code` / `message` / `statusCode`. Used by the
  // redemption surface to surface `remainingAttempts` on INVALID_PIN and
  // `retryAfter` on PIN_RATE_LIMIT_EXCEEDED.

  it('legacy: new AppError(code) without details still serialises to the standard envelope', () => {
    const err = new AppError('INVALID_PIN')
    expect(err.details).toBeUndefined()
    expect(err.toJSON()).toEqual({
      error: {
        code: 'INVALID_PIN',
        message: 'The PIN you entered is incorrect.',
        statusCode: 400,
      },
    })
  })

  it('new: new AppError(code, details) spreads details into the envelope', () => {
    const err = new AppError('INVALID_PIN', { remainingAttempts: 3 })
    expect(err.code).toBe('INVALID_PIN')
    expect(err.statusCode).toBe(400)
    expect(err.details).toEqual({ remainingAttempts: 3 })
    expect(err.toJSON()).toEqual({
      error: {
        code: 'INVALID_PIN',
        message: 'The PIN you entered is incorrect.',
        statusCode: 400,
        remainingAttempts: 3,
      },
    })
  })

  it('new: rate-limit error with retryAfter spreads cleanly', () => {
    const err = new AppError('PIN_RATE_LIMIT_EXCEEDED', { retryAfter: 540 })
    expect(err.toJSON().error).toMatchObject({
      code: 'PIN_RATE_LIMIT_EXCEEDED',
      statusCode: 429,
      retryAfter: 540,
    })
  })

  it('new: details with multiple fields are all preserved', () => {
    const err = new AppError('INVALID_PIN', { remainingAttempts: 2, lockoutSoon: true })
    expect(err.toJSON().error).toMatchObject({
      remainingAttempts: 2,
      lockoutSoon: true,
    })
  })

  it('new: empty details object still spreads (no-op) without breaking the envelope', () => {
    const err = new AppError('INVALID_PIN', {})
    expect(err.toJSON()).toEqual({
      error: {
        code: 'INVALID_PIN',
        message: 'The PIN you entered is incorrect.',
        statusCode: 400,
      },
    })
  })

  it('new: standard envelope fields (code/message/statusCode) cannot be overridden by details', () => {
    // Defensive: if a caller accidentally passes a `code` key in details, the
    // hard-coded code from ERROR_DEFINITIONS must win to prevent envelope
    // confusion downstream.
    const err = new AppError('INVALID_PIN', { code: 'EVIL', message: 'evil', statusCode: 999 } as any)
    expect(err.toJSON().error.code).toBe('INVALID_PIN')
    expect(err.toJSON().error.message).toBe('The PIN you entered is incorrect.')
    expect(err.toJSON().error.statusCode).toBe(400)
  })
})
