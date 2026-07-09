/**
 * tokenStore.ts — in-memory access token + the hard-logout latch.
 */
import { getAccessToken, setAccessToken, setOnSessionLost, triggerSessionLost } from '../tokenStore'

beforeEach(() => {
  // A truthy set re-arms the hard-logout latch (setAccessToken(null) alone
  // does NOT — only a truthy token disarms `sessionLostFired`), so each test
  // starts with a fresh, un-fired latch regardless of what a PRIOR test in
  // this file left behind (module-level singleton state).
  setAccessToken('reset-arm')
  setAccessToken(null)
  setOnSessionLost(null)
})

describe('tokenStore — get/set', () => {
  it('starts with no token', () => {
    expect(getAccessToken()).toBeNull()
  })

  it('stores and returns a token', () => {
    setAccessToken('tok-1')
    expect(getAccessToken()).toBe('tok-1')
  })

  it('clears the token when set to null', () => {
    setAccessToken('tok-1')
    setAccessToken(null)
    expect(getAccessToken()).toBeNull()
  })
})

describe('tokenStore — hard-logout latch', () => {
  it('invokes the registered onSessionLost handler', () => {
    const handler = jest.fn()
    setOnSessionLost(handler)
    triggerSessionLost()
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('is at-most-once: a second trigger before a fresh token does nothing', () => {
    const handler = jest.fn()
    setOnSessionLost(handler)
    triggerSessionLost()
    triggerSessionLost()
    triggerSessionLost()
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('a fresh non-null token re-arms the latch so a later dead session can teardown again', () => {
    const handler = jest.fn()
    setOnSessionLost(handler)
    triggerSessionLost()
    expect(handler).toHaveBeenCalledTimes(1)

    setAccessToken('fresh-token')
    triggerSessionLost()
    expect(handler).toHaveBeenCalledTimes(2)
  })

  it('setting the token to null does NOT re-arm the latch', () => {
    const handler = jest.fn()
    setOnSessionLost(handler)
    triggerSessionLost()
    expect(handler).toHaveBeenCalledTimes(1)

    setAccessToken(null)
    triggerSessionLost()
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('falls back to window.location.assign("/login") when no handler is registered', () => {
    const assignMock = jest.fn()
    Object.defineProperty(window, 'location', {
      value: { assign: assignMock },
      writable: true,
    })
    triggerSessionLost()
    expect(assignMock).toHaveBeenCalledWith('/login')
  })
})
