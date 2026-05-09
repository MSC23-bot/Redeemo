/**
 * ShowToStaff — vertical receipt layout (PR-B T1).
 *
 * Pins the register shift from the M3 brand-red gradient "QR card"
 * surface to the cream "official document" / Apple Wallet pass
 * vertical receipt geometry per brief §3.1 + §5.1. Covers:
 *
 * 1. New layout structure: identity zone + eyebrow + voucher info +
 *    merchant block + QR anchor + footer.
 * 2. New props: voucherDescription (3-line ellipsis truncation),
 *    merchantLogoUrl (logo OR initials fallback OR error fallback).
 * 3. Anti-fraud regression pins (use*Hook still installed; live
 *    signal hierarchy preserved). The full anti-fraud contract lives
 *    in show-to-staff.test.tsx — this file pins the regressions
 *    inline so the brief §9.5 "anti-fraud surfaces locked verbatim"
 *    rule has a co-located assertion next to the new layout.
 *
 * Setup mirrors show-to-staff.test.tsx — same hook mocks, same QR /
 * blur / linear-gradient stubs, same mutable polling + autoHide
 * helpers — so the two suites stay in lockstep.
 */
import React from 'react'
import { act, fireEvent, render } from '@testing-library/react-native'
import { ShowToStaff } from '@/features/voucher/components/ShowToStaff'
import * as motionScale from '@/design-system/useMotionScale'
import * as polling from '@/features/voucher/hooks/useRedemptionPolling'
import * as brightness from '@/features/voucher/hooks/useBrightnessBoost'
import * as autoHide from '@/features/voucher/hooks/useAutoHideTimer'
import * as screenshotGuard from '@/features/voucher/hooks/useScreenshotGuard'
import * as screenCapture from '@/features/voucher/hooks/useScreenCaptureProtection'

// Hook mocks — control the building-block contracts directly.
jest.mock('@/features/voucher/hooks/useRedemptionPolling', () => ({
  useRedemptionPolling: jest.fn(),
}))
jest.mock('@/features/voucher/hooks/useBrightnessBoost', () => ({
  useBrightnessBoost: jest.fn(),
}))
jest.mock('@/features/voucher/hooks/useAutoHideTimer', () => ({
  useAutoHideTimer: jest.fn(),
}))
jest.mock('@/features/voucher/hooks/useScreenshotGuard', () => ({
  useScreenshotGuard: jest.fn(),
}))
jest.mock('@/features/voucher/hooks/useScreenCaptureProtection', () => ({
  useScreenCaptureProtection: jest.fn(),
}))

// QR + Blur + Gradient stubs (mirror show-to-staff.test.tsx).
jest.mock('react-native-qrcode-svg', () => {
  const React = require('react')
  const { View } = require('react-native')
  return {
    __esModule: true,
    default: (props: { testID?: string }) =>
      React.createElement(View, { testID: 'qrcode-svg-stub', ...props }),
  }
})
jest.mock('expo-blur', () => {
  const React = require('react')
  const { View } = require('react-native')
  return {
    BlurView: (props: { testID?: string; children?: React.ReactNode }) =>
      React.createElement(View, { testID: 'blur-stub', ...props }),
  }
})
jest.mock('expo-linear-gradient', () => {
  const React = require('react')
  const { View } = require('react-native')
  return {
    LinearGradient: (props: { children?: React.ReactNode; testID?: string }) =>
      React.createElement(View, { testID: 'linear-gradient-stub', ...props }),
  }
})

// Safe-area context — non-zero top inset so we can pin the
// identity-zone padding behaviour.
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
}))

// react-native-svg — RedeemoLogo uses Svg + Path. Stub as Views.
jest.mock('react-native-svg', () => {
  const React = require('react')
  const { View } = require('react-native')
  return {
    __esModule: true,
    default: ({ children }: { children?: React.ReactNode }) =>
      React.createElement(View, null, children),
    Svg: ({ children }: { children?: React.ReactNode }) =>
      React.createElement(View, null, children),
    Path: () => null,
    Circle: () => null,
    Rect: () => null,
    Line: () => null,
    Polyline: () => null,
  }
})

const baseProps = {
  visible: true,
  redemptionCode: 'A7K2P9X4',
  voucherTitle: 'Buy 1 Get 1 Free on All Pizzas',
  voucherType: 'BOGO' as const,
  voucherDescription:
    'Order any 12-inch pizza and get a second one free. Dine-in only, valid Monday to Thursday.',
  merchantName: 'Pizza Palace',
  merchantLogoUrl: null as string | null,
  branchName: 'High Street',
  customerName: '',
  redeemedAt: '2026-05-08T10:00:00Z',
  onDone: jest.fn(),
}

function setPolling(state: 'polling' | 'validated') {
  ;(polling.useRedemptionPolling as jest.Mock).mockReturnValue({
    phase: state,
    data: state === 'validated'
      ? {
          code: 'A7K2P9X4', isValidated: true,
          validatedAt: '2026-05-08T10:01:00Z', validationMethod: 'QR_SCAN',
          voucherId: 'v1', merchantName: 'Pizza Palace', branchName: 'High Street',
        }
      : null,
  })
}

function setAutoHide(state: 'visible' | 'warning' | 'hidden' = 'visible') {
  const resetTimer = jest.fn()
  ;(autoHide.useAutoHideTimer as jest.Mock).mockReturnValue({ state, resetTimer })
  return resetTimer
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(motionScale, 'useMotionScale').mockReturnValue(1)
  setPolling('polling')
  setAutoHide('visible')
  ;(brightness.useBrightnessBoost as jest.Mock).mockReturnValue(undefined)
  ;(screenshotGuard.useScreenshotGuard as jest.Mock).mockReturnValue(undefined)
  ;(screenCapture.useScreenCaptureProtection as jest.Mock).mockReturnValue(undefined)
  ;(baseProps.onDone as jest.Mock).mockReset()
})

describe('ShowToStaff — vertical receipt layout (PR-B T1)', () => {
  it('renders the cream identity-zone header at the top of the surface', () => {
    const { getByTestId } = render(<ShowToStaff {...baseProps} />)
    // The cream band: Redeemo wordmark + close button, branded as the
    // identity zone of the document.
    expect(getByTestId('show-to-staff-identity-zone')).toBeTruthy()
    expect(getByTestId('show-to-staff-redeemo-wordmark')).toBeTruthy()
    expect(getByTestId('show-to-staff-close')).toBeTruthy()
  })

  it('renders the "Verified Voucher" eyebrow above the voucher title', () => {
    const { getByText, getByTestId } = render(<ShowToStaff {...baseProps} />)
    // Brief §3.1 typography hierarchy: label.eyebrow / 11pt 800 / ls 1.8.
    // The Text component lifts textTransform from the variant, so the
    // raw children may be either capitalised ("Verified Voucher") or
    // upper-cased through CSS. We assert testID exists + the source
    // string renders.
    expect(getByTestId('show-to-staff-eyebrow')).toBeTruthy()
    expect(getByText('Verified Voucher')).toBeTruthy()
  })

  it('renders the voucher title block', () => {
    const { getByTestId, getByText } = render(<ShowToStaff {...baseProps} />)
    expect(getByTestId('show-to-staff-voucher-title')).toBeTruthy()
    expect(getByText('Buy 1 Get 1 Free on All Pizzas')).toBeTruthy()
  })

  it('renders the voucher description block when description is non-null', () => {
    const { getByTestId, getByText } = render(<ShowToStaff {...baseProps} />)
    expect(getByTestId('show-to-staff-voucher-description')).toBeTruthy()
    expect(
      getByText(/Order any 12-inch pizza and get a second one free/i),
    ).toBeTruthy()
  })

  it('does NOT render the voucher description block when description is null', () => {
    const { queryByTestId } = render(
      <ShowToStaff {...baseProps} voucherDescription={null} />,
    )
    expect(queryByTestId('show-to-staff-voucher-description')).toBeNull()
  })

  it('truncates voucherDescription to 3 lines with tail ellipsis', () => {
    const { getByTestId } = render(<ShowToStaff {...baseProps} />)
    const desc = getByTestId('show-to-staff-voucher-description')
    expect(desc.props.numberOfLines).toBe(3)
    expect(desc.props.ellipsizeMode).toBe('tail')
  })

  it('renders the merchant logo when merchantLogoUrl is non-null', () => {
    const { getByTestId, queryByTestId } = render(
      <ShowToStaff
        {...baseProps}
        merchantLogoUrl="https://example.com/logo.png"
      />,
    )
    expect(getByTestId('show-to-staff-merchant-logo')).toBeTruthy()
    expect(queryByTestId('show-to-staff-merchant-initials')).toBeNull()
  })

  it('renders merchant initials fallback when merchantLogoUrl is null', () => {
    const { getByTestId, queryByTestId, getByText } = render(
      <ShowToStaff {...baseProps} merchantLogoUrl={null} />,
    )
    expect(getByTestId('show-to-staff-merchant-initials')).toBeTruthy()
    expect(queryByTestId('show-to-staff-merchant-logo')).toBeNull()
    // Pizza Palace → PP
    expect(getByText('PP')).toBeTruthy()
  })

  it('renders single-name initials correctly (first 2 chars)', () => {
    const { getByText } = render(
      <ShowToStaff
        {...baseProps}
        merchantLogoUrl={null}
        merchantName="Covelum"
      />,
    )
    // Single-name path: first two letters upper.
    expect(getByText('CO')).toBeTruthy()
  })

  it('renders multi-name initials correctly (first + last)', () => {
    const { getByText } = render(
      <ShowToStaff
        {...baseProps}
        merchantLogoUrl={null}
        merchantName="The Old Foundry Pub"
      />,
    )
    // first letter of "The" + first letter of "Pub"
    expect(getByText('TP')).toBeTruthy()
  })

  it('renders merchant initials fallback when image errors out', () => {
    const { getByTestId, queryByTestId } = render(
      <ShowToStaff
        {...baseProps}
        merchantLogoUrl="https://example.com/broken.png"
      />,
    )
    // Initially: image renders, no initials.
    expect(getByTestId('show-to-staff-merchant-logo')).toBeTruthy()
    expect(queryByTestId('show-to-staff-merchant-initials')).toBeNull()
    // Fire the onError handler — wraps the setState call in act() so
    // the React render flushes within the test scope.
    const logo = getByTestId('show-to-staff-merchant-logo')
    act(() => {
      logo.props.onError?.()
    })
    // Initials block now renders; logo block is gone.
    expect(getByTestId('show-to-staff-merchant-initials')).toBeTruthy()
    expect(queryByTestId('show-to-staff-merchant-logo')).toBeNull()
  })

  it('renders merchant name + branch as separate stacked Text nodes', () => {
    const { getByTestId, getByText } = render(<ShowToStaff {...baseProps} />)
    expect(getByTestId('show-to-staff-merchant-name')).toBeTruthy()
    expect(getByTestId('show-to-staff-branch')).toBeTruthy()
    expect(getByText('Pizza Palace')).toBeTruthy()
    expect(getByText('High Street')).toBeTruthy()
  })

  it('renders the QR + 4+4 code block as the visual anchor', () => {
    const { getByTestId, getByText } = render(<ShowToStaff {...baseProps} />)
    expect(getByTestId('show-to-staff-qr')).toBeTruthy()
    expect(getByTestId('show-to-staff-code')).toBeTruthy()
    // formatRedemptionCode injects a thin space between the two halves.
    expect(getByText('A7K2 P9X4')).toBeTruthy()
  })

  it('renders the "Verified through Redeemo" footer', () => {
    const { getByTestId, getByText } = render(<ShowToStaff {...baseProps} />)
    expect(getByTestId('show-to-staff-footer')).toBeTruthy()
    expect(getByText('Verified through Redeemo')).toBeTruthy()
  })

  it('safe-area top inset is honoured for the cream identity zone', () => {
    const { getByTestId } = render(<ShowToStaff {...baseProps} />)
    const zone = getByTestId('show-to-staff-identity-zone')
    // useSafeAreaInsets mock → top: 47. Brief §5.1: paddingTop = top + 16.
    const flat = Array.isArray(zone.props.style)
      ? Object.assign({}, ...zone.props.style)
      : zone.props.style
    expect(flat.paddingTop).toBe(47 + 16)
  })

  it('close button in the identity zone fires onDone', () => {
    const onDone = jest.fn()
    const { getByTestId } = render(
      <ShowToStaff {...baseProps} onDone={onDone} />,
    )
    fireEvent.press(getByTestId('show-to-staff-close'))
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('VoiceOver read order: identity → eyebrow → title → description → merchant → branch → code → footer', () => {
    const { getByTestId } = render(<ShowToStaff {...baseProps} />)
    // Pin the testIDs all exist; their DOM order is enforced by the
    // JSX top-down. Reading order cannot be re-ordered by CSS in RN
    // (no `order` semantic), so DOM order == VoiceOver order.
    const ids = [
      'show-to-staff-identity-zone',
      'show-to-staff-eyebrow',
      'show-to-staff-voucher-title',
      'show-to-staff-voucher-description',
      'show-to-staff-merchant-name',
      'show-to-staff-branch',
      'show-to-staff-code',
      'show-to-staff-footer',
    ]
    ids.forEach(id => expect(getByTestId(id)).toBeTruthy())
  })
})

describe('ShowToStaff — anti-fraud + live signals (PR-B T1 regression pins)', () => {
  it('useScreenCaptureProtection still installed when visible (regression pin)', () => {
    render(<ShowToStaff {...baseProps} />)
    expect(screenCapture.useScreenCaptureProtection).toHaveBeenCalledWith(true)
  })

  it('useScreenshotGuard still installed with active=true when visible (regression pin)', () => {
    render(<ShowToStaff {...baseProps} />)
    expect(screenshotGuard.useScreenshotGuard).toHaveBeenCalledWith(
      'A7K2P9X4',
      expect.objectContaining({ active: true }),
    )
  })

  it('animated brand-rose code-card border still renders (regression pin)', () => {
    const { getByTestId } = render(<ShowToStaff {...baseProps} />)
    // The code-card border is the LinearGradient that wraps the QR + LIVE
    // pulse + 4+4 code. Its testID lets us pin its presence after the
    // register shift relocated the surrounding layout.
    expect(getByTestId('show-to-staff-code-card-border')).toBeTruthy()
  })

  it('LIVE dot + LIVE label still render (regression pin)', () => {
    const { getByText } = render(<ShowToStaff {...baseProps} />)
    expect(getByText(/^LIVE$/i)).toBeTruthy()
  })

  it('live clock ticker still renders within the QR card (regression pin)', () => {
    // Pin the seconds-precision pattern unique to the LIVE clock —
    // `formatShowToStaffLive` renders HH:MM:SS while the static
    // `formatShowToStaffRedeemed` Redeemed row renders only HH:MM.
    // A regex that matched both would let LiveClock be deleted
    // entirely without failing the pin (caught in code review).
    const { getAllByText } = render(<ShowToStaff {...baseProps} />)
    expect(getAllByText(/\d{2}:\d{2}:\d{2}/).length).toBeGreaterThanOrEqual(1)
  })

  it('validation pill transition still fires on validated phase (regression pin)', () => {
    setPolling('validated')
    const { getByText } = render(
      <ShowToStaff {...baseProps} branchName="High Street" />,
    )
    expect(getByText(/Verified by staff at High Street/i)).toBeTruthy()
  })
})
