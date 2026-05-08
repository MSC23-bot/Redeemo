/**
 * Pins the distinct user-facing copy locked at deferred-followups
 * §AC7 / §AD6. When the api client fires `onSessionExpired` with a
 * `SESSION_REPLACED` reason, the bridge must show the specific
 * "signed in on another device" message — never the generic "session
 * expired" copy.
 *
 * Cross-ref: PR #51 frontend acceptance test 5 ("Device A signs in,
 * Device B signs in, Device A receives SESSION_REPLACED with clear
 * copy").
 */
import React from 'react'
import { render, act } from '@testing-library/react-native'

// Outer-scope variables referenced from `jest.mock` factories MUST be
// `mock`-prefixed — jest hoists `jest.mock(...)` calls to the top of
// the file before regular declarations. Any other name triggers a
// ReferenceError at factory-evaluation time.
const mockToastShow = jest.fn()
const mockSignOut   = jest.fn()
const mockRegistered: { current: ((reason: 'SESSION_EXPIRED' | 'SESSION_REPLACED') => void) | null } = { current: null }

jest.mock('@/lib/api', () => ({
  api: {
    onSessionExpired: jest.fn((cb: (reason: 'SESSION_EXPIRED' | 'SESSION_REPLACED') => void) => {
      mockRegistered.current = cb
    }),
  },
}))
jest.mock('@/stores/auth', () => ({
  useAuthStore: jest.fn((sel: any) => sel({ signOut: mockSignOut })),
}))
jest.mock('@/design-system/motion/Toast', () => ({
  useToast: () => ({ show: mockToastShow }),
}))

import { SessionExpiredBridge } from '@/app-bootstrap/SessionExpiredBridge'

describe('SessionExpiredBridge', () => {
  beforeEach(() => {
    mockToastShow.mockClear()
    mockSignOut.mockClear()
    mockRegistered.current = null
  })

  it('shows the SESSION_REPLACED-specific copy when the api fires that reason (one-mobile-device rule)', () => {
    render(<SessionExpiredBridge />)
    expect(mockRegistered.current).not.toBeNull()

    act(() => {
      mockRegistered.current!('SESSION_REPLACED')
    })

    expect(mockToastShow).toHaveBeenCalledTimes(1)
    expect(mockToastShow).toHaveBeenCalledWith(
      'Your account was signed in on another device, so this session has ended.',
      'danger',
    )
    expect(mockSignOut).toHaveBeenCalledTimes(1)
  })

  it('shows the generic SESSION_EXPIRED copy when the api fires that reason', () => {
    render(<SessionExpiredBridge />)

    act(() => {
      mockRegistered.current!('SESSION_EXPIRED')
    })

    expect(mockToastShow).toHaveBeenCalledWith(
      'Your session has expired. Please sign in again.',
      'danger',
    )
    expect(mockSignOut).toHaveBeenCalledTimes(1)
  })

  it('falls back to the generic copy if an unknown reason somehow reaches the bridge', () => {
    render(<SessionExpiredBridge />)

    act(() => {
      // Hypothetical — a future reason added on the api side without
      // updating the bridge's COPY map. Defensive default protects the
      // user from seeing an empty toast.
      mockRegistered.current!('SOMETHING_ELSE' as any)
    })

    expect(mockToastShow).toHaveBeenCalledWith(
      'Your session has expired. Please sign in again.',
      'danger',
    )
  })

  it('renders nothing (returns null)', () => {
    const { toJSON } = render(<SessionExpiredBridge />)
    expect(toJSON()).toBeNull()
  })
})
