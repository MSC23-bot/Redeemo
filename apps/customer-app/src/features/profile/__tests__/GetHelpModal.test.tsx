/**
 * Sub-PR 1 stub-pin tests for GetHelpModal.
 *
 * GetHelpModal ships as a "Coming soon" Alert stub in Sub-PR 1 because the
 * support-ticket backend (SupportTicket Prisma model + customer/support
 * routes) is not yet on main. The full ticket list / detail / new-form
 * surface ships in Sub-PR 2.
 *
 * These pins are the contract Sub-PR 2 must flip:
 *   1. Behavioural pin — `visible=true` fires the "Coming soon" alert.
 *   2. Negative pin — `visible=false` is a no-op.
 *   3. Static-source pin — the component does not yet import a support API
 *      or hook. Sub-PR 2 will delete this pin when it wires the real hook.
 */
import React from 'react'
import * as fs from 'fs'
import * as path from 'path'
import { Alert } from 'react-native'
import { render } from '@testing-library/react-native'

import { GetHelpModal } from '../components/GetHelpModal'

describe('GetHelpModal (Sub-PR 1 stub)', () => {
  let alertSpy: jest.SpyInstance

  beforeEach(() => {
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
  })

  afterEach(() => {
    alertSpy.mockRestore()
  })

  it('fires the "Coming soon" alert and calls onDismiss when visible=true', () => {
    const onDismiss = jest.fn()
    render(<GetHelpModal visible onDismiss={onDismiss} />)
    expect(alertSpy).toHaveBeenCalledTimes(1)
    expect(alertSpy).toHaveBeenCalledWith('Coming soon', expect.any(String))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('does not fire the alert when visible=false', () => {
    const onDismiss = jest.fn()
    render(<GetHelpModal visible={false} onDismiss={onDismiss} />)
    expect(alertSpy).not.toHaveBeenCalled()
    expect(onDismiss).not.toHaveBeenCalled()
  })

  // Sub-PR 2 seam — when the real support-ticket hook lands, this test will
  // fail and force Sub-PR 2 to delete it intentionally as part of the flip.
  it('imports no support-ticket API or hook (Sub-PR 2 seam)', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../components/GetHelpModal.tsx'),
      'utf-8',
    )
    expect(src).not.toMatch(/@\/lib\/api\/support/)
    expect(src).not.toMatch(/useSupportTickets|useCreateTicket/)
  })
})
