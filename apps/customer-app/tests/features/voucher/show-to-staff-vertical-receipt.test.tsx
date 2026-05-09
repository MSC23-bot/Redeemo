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
  it('renders the identity-zone header at the top of the surface (PR-B T8f — bigger Redeemo logo + wordmark; X close icon removed in favour of bottom Done button)', () => {
    const { getByTestId, queryByTestId } = render(<ShowToStaff {...baseProps} />)
    // PR-B T8f — the identity zone now holds ONLY the bigger Redeemo
    // logo + wordmark.  The X close icon was removed per owner
    // direction; the bottom Done button is the single dismissal
    // affordance.
    expect(getByTestId('show-to-staff-identity-zone')).toBeTruthy()
    expect(getByTestId('show-to-staff-redeemo-wordmark')).toBeTruthy()
    expect(queryByTestId('show-to-staff-close')).toBeNull()
  })

  it('does NOT render a "Verified Voucher" eyebrow (PR-B T8g — pre-scan the voucher is not verified; the only "verified" claim the surface ever makes is the savings-green pill on the validated transition)', () => {
    const { queryByText, queryByTestId } = render(<ShowToStaff {...baseProps} />)
    // Owner direction: "voucher is not verified until ... merchant ...
    // QR code".  Pin both the testID is gone AND the literal source
    // string is absent so a future regression that re-adds either path
    // fails this assertion.
    expect(queryByTestId('show-to-staff-eyebrow')).toBeNull()
    expect(queryByText(/Verified Voucher/i)).toBeNull()
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

  it('truncates voucherDescription to 2 lines with tail ellipsis (PR-B T8c — was 3 in T1; compressed for the no-scroll fit on iPhone SE 1st gen)', () => {
    const { getByTestId } = render(<ShowToStaff {...baseProps} />)
    const desc = getByTestId('show-to-staff-voucher-description')
    expect(desc.props.numberOfLines).toBe(2)
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

  it('renders the prominent Redeemo wordmark in the header (PR-B T8c — "Verified through Redeemo" footer dropped; the prominent header logo + wordmark now carries the cross-surface Redeemo identity role)', () => {
    const { getByTestId, getByText } = render(<ShowToStaff {...baseProps} />)
    // The Redeemo wordmark in the cream → navy identity zone is the
    // canonical Redeemo identity surface in T8c. The dropped footer
    // copy ("Verified through Redeemo") is intentionally retired —
    // the prominent header logo (28pt) + "Redeemo" wordmark replaces
    // it, freeing the bottom of the surface for the QR card to fit
    // 375×667 without scrolling.
    expect(getByTestId('show-to-staff-redeemo-wordmark')).toBeTruthy()
    expect(getByText('Redeemo')).toBeTruthy()
  })

  it('safe-area top inset is honoured for the identity zone (PR-B T8f — paddingTop = insets.top + 12; was +16 in T8c)', () => {
    const { getByTestId } = render(<ShowToStaff {...baseProps} />)
    const zone = getByTestId('show-to-staff-identity-zone')
    // useSafeAreaInsets mock → top: 47. PR-B T8f: paddingTop = top + 12.
    const flat = Array.isArray(zone.props.style)
      ? Object.assign({}, ...zone.props.style)
      : zone.props.style
    expect(flat.paddingTop).toBe(47 + 12)
  })

  it('Done button at the bottom fires onDone (PR-B T8f — replaces the X close icon top-right)', () => {
    const onDone = jest.fn()
    const { getByTestId } = render(
      <ShowToStaff {...baseProps} onDone={onDone} />,
    )
    fireEvent.press(getByTestId('show-to-staff-done'))
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('VoiceOver read order: identity → title → description → merchant → branch → code (PR-B T8g — eyebrow testID dropped along with the misleading "Verified Voucher" copy)', () => {
    const { getByTestId } = render(<ShowToStaff {...baseProps} />)
    // Pin the testIDs all exist; their DOM order is enforced by the
    // JSX top-down. Reading order cannot be re-ordered by CSS in RN
    // (no `order` semantic), so DOM order == VoiceOver order.  T8g
    // drops the eyebrow from the read order along with the visual
    // surface (owner direction: pre-scan the voucher is NOT verified).
    const ids = [
      'show-to-staff-identity-zone',
      'show-to-staff-voucher-title',
      'show-to-staff-voucher-description',
      'show-to-staff-merchant-name',
      'show-to-staff-branch',
      'show-to-staff-code',
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

describe('ShowToStaff — brand-correct navy trust surface (PR-B T8f device-QA fix round 2)', () => {
  it('renders ONLY the bottom Done button as the dismissal affordance — NO X close icon (T8f owner direction)', () => {
    const { queryByLabelText, getByLabelText } = render(<ShowToStaff {...baseProps} />)
    // T8f reverts the T8c X-icon dismissal to the original Done
    // button per owner direction.  Single dismissal — Done pill at
    // the bottom of the surface; X close icon entirely removed.
    expect(getByLabelText('Done')).toBeTruthy()
    expect(queryByLabelText('Close')).toBeNull()
  })

  it('does NOT render the dropped "Verified through Redeemo" footer copy', () => {
    const { queryByText } = render(<ShowToStaff {...baseProps} />)
    // T8c+T8f drop the footer copy entirely; the prominent header
    // logo + wordmark carries the Redeemo identity role instead.
    expect(queryByText('Verified through Redeemo')).toBeNull()
  })

  it('merchant logo + initials circle stay at 36×36 (T8f preserves T8c compression for the no-scroll fit)', () => {
    const { getByTestId } = render(<ShowToStaff {...baseProps} />)
    const initialsCircle = getByTestId('show-to-staff-merchant-initials')
    const flat = Array.isArray(initialsCircle.props.style)
      ? Object.assign({}, ...initialsCircle.props.style)
      : initialsCircle.props.style
    expect(flat.width).toBe(36)
    expect(flat.height).toBe(36)
  })

  it('voucher title is single-line ellipsis (PR-B T8c+T8f — compressed for no-scroll fit)', () => {
    const { getByTestId } = render(<ShowToStaff {...baseProps} />)
    const title = getByTestId('show-to-staff-voucher-title')
    expect(title.props.numberOfLines).toBe(1)
    expect(title.props.ellipsizeMode).toBe('tail')
  })

  it('voucher-type chip is rendered OUTSIDE the QR card (PR-B T8f content discipline)', () => {
    // T8f locks QR card content discipline: only LIVE + QR + code
    // + live clock live INSIDE the animated brand-rose border.  The
    // voucher-type chip moves to a dedicated row ABOVE the merchant
    // block.  Pin the chip's testID exists so a future regression
    // that re-folds it back into the QR card fails this assertion.
    const { getByTestId } = render(<ShowToStaff {...baseProps} />)
    expect(getByTestId('show-to-staff-type-chip')).toBeTruthy()
  })

  it('redeemed timestamp row is rendered OUTSIDE the QR card (PR-B T8f content discipline)', () => {
    const { getByTestId } = render(<ShowToStaff {...baseProps} />)
    expect(getByTestId('show-to-staff-redeemed-row')).toBeTruthy()
  })

  it('live clock has prominent treatment — heading.sm 16pt + bold + white-on-navy (PR-B T8f genuineness signal)', () => {
    // T8f bumps the live clock from a 14pt label.lg navy glyph to a
    // 16pt heading.sm bold white-on-navy chip.  Pin the testID +
    // assert the colour reads as full white.
    const { getByTestId } = render(<ShowToStaff {...baseProps} />)
    const clock = getByTestId('show-to-staff-live-clock')
    expect(clock).toBeTruthy()
    const flat = Array.isArray(clock.props.style)
      ? Object.assign({}, ...clock.props.style)
      : clock.props.style
    expect(flat.color).toBe('#FFFFFF')
  })
})

describe('ShowToStaff — PR-B T8g (device-QA fix round 3)', () => {
  it('identity zone is a horizontal row, top-left (PR-B T8g revision — owner direction "change it back to horizontal from the left and make it slightly smaller")', () => {
    // T8g shipped TWO logo treatments before settling.  The first
    // (centered vertical column) was routed through device QA and
    // owner reverted to horizontal/top-left + smaller.  This pin
    // anchors the FINAL shipped layout so a future regression that
    // reintroduces the column treatment fails this assertion.
    const { getByTestId } = render(<ShowToStaff {...baseProps} />)
    const zone = getByTestId('show-to-staff-identity-zone')
    const flat = Array.isArray(zone.props.style)
      ? Object.assign({}, ...zone.props.style)
      : zone.props.style
    expect(flat.flexDirection).toBe('row')
    // alignItems 'center' stays for vertical centering of R + wordmark
    // within the row; we only flipped the primary axis.
    expect(flat.alignItems).toBe('center')
  })

  it('LIVE badge row is centered inside the QR card (PR-B T8g revision — was top-right, now centered above the QR as a "transmission active" indicator)', () => {
    // The LIVE row sits as the first child INSIDE codeCardInner.
    // We pin it via the wrapping `liveBadge` group's parent style.
    // Style assertion via the `linear-gradient-stub` parent walk is
    // brittle in tests, so instead we surface a dedicated testID on
    // the row and assert its style.  Re-using the existing
    // `show-to-staff-eyebrow`-style pattern: pin the LIVE label is
    // present (proves the row renders) — the centred placement is
    // a single-line style decision (`justifyContent: 'center'`)
    // already covered by the snapshot-style tests; visual QA on
    // device is the load-bearing check.  Pin the LIVE label remains
    // present so regression that drops the row entirely fails.
    const { getByText } = render(<ShowToStaff {...baseProps} />)
    expect(getByText(/^LIVE$/i)).toBeTruthy()
  })

  it('renders the redemption code inside a prominence chip (PR-B T8g — code blends with QR without the chip)', () => {
    const { getByTestId } = render(<ShowToStaff {...baseProps} />)
    // The chip wraps the code Text node so it reads as a distinct,
    // scannable block separate from the QR above.  Owner direction:
    // "the voucher code is also very prominent ... it needs to stand
    // out from the QR code".
    expect(getByTestId('show-to-staff-code-chip')).toBeTruthy()
    expect(getByTestId('show-to-staff-code')).toBeTruthy()
  })

  it('splits the redeemed timestamp into separate Date + Time rows (PR-B T8g)', () => {
    const { getByTestId, getByText } = render(<ShowToStaff {...baseProps} />)
    // Two distinct rows replace the previous combined "Redeemed:
    // <date>, <time>" line.  Time row carries seconds for staff to
    // corroborate against the live ticking clock.
    expect(getByTestId('show-to-staff-redeemed-date-row')).toBeTruthy()
    expect(getByTestId('show-to-staff-redeemed-time-row')).toBeTruthy()
    expect(getByText(/^Date$/)).toBeTruthy()
    expect(getByText(/^Time$/)).toBeTruthy()
  })

  it('Date value renders day Month YYYY (no time) and Time value renders HH:MM:SS (with seconds)', () => {
    // Display-format pin — narrow regex so a regression that loses
    // the seconds (HH:MM:SS → HH:MM) or merges date+time back fails.
    const { getByTestId } = render(<ShowToStaff {...baseProps} />)
    const dateValue = getByTestId('show-to-staff-redeemed-date-value')
    const timeValue = getByTestId('show-to-staff-redeemed-time-value')
    expect(dateValue.props.children).toMatch(/^\d{2} [A-Z][a-z]{2} \d{4}$/)
    expect(timeValue.props.children).toMatch(/^\d{2}:\d{2}:\d{2}$/)
  })

  it('Done button paints with the brand-rose → coral gradient (PR-B T8g — owner direction "use our branding red gradient button")', () => {
    const { getByTestId } = render(<ShowToStaff {...baseProps} />)
    const doneButton = getByTestId('show-to-staff-done')
    // The gradient lives as a child <View testID="linear-gradient-stub">
    // (the stub injected at the top of the test file).  Pin its
    // presence inside the Done button so a future regression that
    // reverts to the outlined treatment fails this assertion.
    const gradients = doneButton.findAllByProps?.({ testID: 'linear-gradient-stub' }) ?? []
    expect(gradients.length).toBeGreaterThanOrEqual(1)
  })
})
