import React from 'react'
import { fireEvent, render } from '@testing-library/react-native'

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: any) => children ?? null,
}))
jest.mock('@/design-system/haptics', () => ({
  lightHaptic: jest.fn(),
}))

import {
  RedemptionDetailsCard,
  formatExpiryLine,
} from '@/features/voucher/components/RedemptionDetailsCard'

function defaults(overrides: Partial<React.ComponentProps<typeof RedemptionDetailsCard>> = {}) {
  return {
    redemptionCode: 'A7K2P9X4',
    redeemedAt: '2026-05-06T14:32:00Z',
    branchName: 'Brightlingsea',
    voucherType: 'FREEBIE' as const,
    voucherTitle: 'Free Filter Coffee with Any Thali',
    merchantName: 'Covelum Restaurant',
    estimatedSaving: 2.50,
    onShowToStaff: jest.fn(),
    ...overrides,
  } satisfies React.ComponentProps<typeof RedemptionDetailsCard>
}

describe('RedemptionDetailsCard', () => {
  it('renders the card with all key sections', () => {
    const { getByTestId, getByText } = render(<RedemptionDetailsCard {...defaults()} />)
    expect(getByTestId('redemption-details-card')).toBeTruthy()
    expect(getByText('Redemption Details')).toBeTruthy()
    expect(getByTestId('redemption-details-code')).toBeTruthy()
  })

  it('formats the redemption code as 4+4 with single space', () => {
    const { getByTestId } = render(<RedemptionDetailsCard {...defaults()} />)
    const code = getByTestId('redemption-details-code')
    expect(code.props.children).toBe('A7K2 P9X4')
  })

  it('shows the branch name', () => {
    const { getByText } = render(<RedemptionDetailsCard {...defaults()} />)
    expect(getByText('Brightlingsea')).toBeTruthy()
  })

  it('falls back to em-dash when branch is null', () => {
    const { getByText } = render(<RedemptionDetailsCard {...defaults({ branchName: null })} />)
    expect(getByText('—')).toBeTruthy()
  })

  it('shows formatted date in en-GB locale', () => {
    const { getAllByText } = render(<RedemptionDetailsCard {...defaults()} />)
    // "06 May 2026" appears in the subtitle AND the Date info row.
    const matches = getAllByText(/06 May 2026/)
    expect(matches.length).toBeGreaterThanOrEqual(1)
  })

  it('Show-to-Staff button is live in M3 (no longer disabled)', () => {
    const { getByTestId, queryByTestId } = render(<RedemptionDetailsCard {...defaults()} />)
    // M2 stub testID is gone — replaced by the live testID.
    expect(queryByTestId('redemption-details-show-to-staff-stub')).toBeNull()
    const button = getByTestId('redemption-details-show-to-staff')
    expect(button.props.accessibilityState?.disabled).toBeFalsy()
  })

  it('Show-to-Staff button fires onShowToStaff when pressed', () => {
    const onShowToStaff = jest.fn()
    const { getByTestId } = render(
      <RedemptionDetailsCard {...defaults({ onShowToStaff })} />,
    )
    fireEvent.press(getByTestId('redemption-details-show-to-staff'))
    expect(onShowToStaff).toHaveBeenCalledTimes(1)
  })

  it('Show-to-Staff button accessibility label drops the next-milestone suffix', () => {
    const { getByLabelText } = render(<RedemptionDetailsCard {...defaults()} />)
    expect(getByLabelText('Show redemption code to staff')).toBeTruthy()
  })

  it('does not render the validated pill by default', () => {
    const { queryByTestId } = render(<RedemptionDetailsCard {...defaults()} />)
    expect(queryByTestId('redemption-details-validated-pill')).toBeNull()
  })

  it('renders the "Validated by staff" pill when isValidated is true', () => {
    const { getByText, getByTestId } = render(
      <RedemptionDetailsCard {...defaults({ isValidated: true })} />,
    )
    expect(getByTestId('redemption-details-validated-pill')).toBeTruthy()
    expect(getByText(/Validated by staff/i)).toBeTruthy()
  })

  it('does not render any QR section in M2/M3 — the QR is owned by ShowToStaff', () => {
    const { queryByTestId } = render(<RedemptionDetailsCard {...defaults()} />)
    // The QR is a property of the full-screen ShowToStaff surface,
    // NOT of the inline card. The card surfaces the code in 4+4 and
    // routes to ShowToStaff via Show-to-Staff button.
    expect(queryByTestId('redemption-details-qr')).toBeNull()
    expect(queryByTestId('redemption-details-qr-svg')).toBeNull()
  })

  // Voucher summary block (locked 2026-05-07 from device QA). The
  // card identifies exactly what was redeemed via merchant + type +
  // title + "Save up to" amount, so the customer/staff don't have
  // to scan the rest of the page.

  describe('voucher summary block', () => {
    it('renders the voucher type label uppercased', () => {
      const { getByTestId } = render(<RedemptionDetailsCard {...defaults({ voucherType: 'FREEBIE' })} />)
      // FREEBIE → "Freebie" → uppercase "FREEBIE".
      expect(getByTestId('redemption-details-type').props.children).toBe('FREEBIE')
    })

    it('renders BOGO type as uppercased "BUY ONE, GET ONE FREE"', () => {
      const { getByTestId } = render(<RedemptionDetailsCard {...defaults({ voucherType: 'BOGO' })} />)
      expect(getByTestId('redemption-details-type').props.children).toBe('BUY ONE, GET ONE FREE')
    })

    it('renders the voucher title', () => {
      const { getByTestId } = render(<RedemptionDetailsCard {...defaults()} />)
      expect(getByTestId('redemption-details-title').props.children).toBe('Free Filter Coffee with Any Thali')
    })

    it('renders the merchant name', () => {
      const { getByTestId } = render(<RedemptionDetailsCard {...defaults()} />)
      expect(getByTestId('redemption-details-merchant').props.children).toBe('Covelum Restaurant')
    })

    it('renders "Saved up to £X" (past tense, post-redemption) for the estimated saving', () => {
      const { getByTestId } = render(<RedemptionDetailsCard {...defaults({ estimatedSaving: 2.50 })} />)
      // formatPounds(2.50) → "£2.50". Past-tense copy because the
      // card is shown AFTER redemption — "Save up to" would imply
      // the discount is still pending. Locked 2026-05-07 from device
      // QA.
      const node = getByTestId('redemption-details-saving')
      expect(node.props.children).toEqual(['Saved up to ', '£2.50'])
    })

    it('formats whole pounds without decimals', () => {
      const { getByTestId } = render(<RedemptionDetailsCard {...defaults({ estimatedSaving: 5 })} />)
      const node = getByTestId('redemption-details-saving')
      expect(node.props.children).toEqual(['Saved up to ', '£5'])
    })

    it('saving copy is past tense ("Saved", not "Save") so it does NOT regress to pre-redemption wording', () => {
      // Regression pin (locked 2026-05-07 from device QA) — explicit
      // negative assertion catches a future copy edit that
      // accidentally reverts to the present-tense pre-redemption
      // form.
      const { getByTestId } = render(<RedemptionDetailsCard {...defaults()} />)
      const savingChildren = getByTestId('redemption-details-saving').props.children
      expect(savingChildren[0]).toMatch(/^Saved up to /)
      expect(savingChildren[0]).not.toMatch(/^Save up to /)
    })

    it('renders the "Saved up to" disclaimer copy (past tense)', () => {
      const { getByTestId, getByText } = render(<RedemptionDetailsCard {...defaults()} />)
      expect(getByTestId('redemption-details-saving-disclaimer')).toBeTruthy()
      // Pin the substance of the copy without locking the exact
      // wording — copy may evolve. Both tense and the
      // "actual saving may depend" qualifier must be present.
      expect(
        getByText(/Saved up to.*maximum estimated saving/i),
      ).toBeTruthy()
      expect(getByText(/actual saving may depend/i)).toBeTruthy()
    })

    it('disclaimer uses past tense — does NOT use the pre-redemption "Save up to" form', () => {
      // Mirrors the saving-copy regression pin — the disclaimer
      // must read as a post-redemption explanation, not a
      // pre-redemption claim.
      const { getByTestId } = render(<RedemptionDetailsCard {...defaults()} />)
      const disclaimer = getByTestId('redemption-details-saving-disclaimer')
      const text = String(disclaimer.props.children ?? '')
      expect(text).toMatch(/Saved up to/)
      expect(text).not.toMatch(/“Save up to”/)
    })

    it('summary block renders BEFORE the redemption code in the rendered tree', () => {
      // Eye should land on "what was redeemed" before "what's the
      // code". The summary box has a lower DOM index than the code
      // box.
      const { getByTestId } = render(<RedemptionDetailsCard {...defaults()} />)
      const card = getByTestId('redemption-details-card')
      const ids = card
        .findAll((el: any) => typeof el.props?.testID === 'string')
        .map((el: any) => el.props.testID as string)
      const summaryIdx = ids.indexOf('redemption-details-summary')
      const codeIdx = ids.indexOf('redemption-details-code')
      expect(summaryIdx).toBeGreaterThanOrEqual(0)
      expect(codeIdx).toBeGreaterThan(summaryIdx)
    })
  })

  // Presentation-window state machine (locked 2026-05-08, owner direction
  // PR #49). The card surfaces the redemption code + Show-to-Staff button
  // ONLY when both gates pass:
  //   - isPresentationActive = true (≤2h since redemption)
  //   - isValidated = false (staff hasn't verified yet)
  // When either gate fails, the code surface collapses to a tip line
  // pointing at Profile → Redemption History; the rest of the card
  // (header, summary, info rows, disclaimer) stays so the surface still
  // answers "what / where / when".
  describe('presentation-window state machine', () => {
    it('default (isPresentationActive omitted, isValidated false): shows code + Show-to-Staff', () => {
      // Back-compat default — when the prop is unspecified the gate is
      // open. SuccessPopup test fixtures + the in-memory just-redeemed
      // flow rely on this.
      const { getByTestId, queryByTestId } = render(
        <RedemptionDetailsCard {...defaults()} />,
      )
      expect(getByTestId('redemption-details-code')).toBeTruthy()
      expect(getByTestId('redemption-details-show-to-staff')).toBeTruthy()
      expect(queryByTestId('redemption-details-expired-notice')).toBeNull()
    })

    it('isPresentationActive=true + !isValidated: shows code + Show-to-Staff (in-window persisted return)', () => {
      const { getByTestId, queryByTestId } = render(
        <RedemptionDetailsCard
          {...defaults({ isPresentationActive: true, isValidated: false })}
        />,
      )
      expect(getByTestId('redemption-details-code')).toBeTruthy()
      expect(getByTestId('redemption-details-show-to-staff')).toBeTruthy()
      expect(queryByTestId('redemption-details-expired-notice')).toBeNull()
    })

    it('isPresentationActive=false: hides code + Show-to-Staff, shows the expired-window inner notice card', () => {
      const { getByTestId, queryByTestId } = render(
        <RedemptionDetailsCard {...defaults({ isPresentationActive: false })} />,
      )
      expect(queryByTestId('redemption-details-code')).toBeNull()
      expect(queryByTestId('redemption-details-show-to-staff')).toBeNull()
      // Inner notice card replaces the loose-text bottom block.
      expect(getByTestId('redemption-details-expired-notice')).toBeTruthy()
      expect(getByTestId('redemption-details-expired-headline')).toBeTruthy()
      expect(getByTestId('redemption-details-expired-support')).toBeTruthy()
    })

    it('isValidated=true (regardless of window): hides code + button + expired-notice, shows ONLY the validated pill', () => {
      // Validation is terminal — once staff has scanned, the user no
      // longer needs the code re-exposed even if they're inside the
      // 2h window. The expired-window notice ALSO suppresses because
      // the validated pill is the user-facing signal.
      const { getByTestId, queryByTestId } = render(
        <RedemptionDetailsCard
          {...defaults({ isPresentationActive: true, isValidated: true })}
        />,
      )
      expect(queryByTestId('redemption-details-code')).toBeNull()
      expect(queryByTestId('redemption-details-show-to-staff')).toBeNull()
      expect(queryByTestId('redemption-details-expired-notice')).toBeNull()
      expect(getByTestId('redemption-details-validated-pill')).toBeTruthy()
    })

    it('non-sensitive details remain when window expired (header / summary / info rows / disclaimer)', () => {
      // The card still answers "what was used, where, when" even with
      // the code surface collapsed. Critical for the "I redeemed
      // something hours ago, what was it?" return-visit case.
      const { getByText, getByTestId } = render(
        <RedemptionDetailsCard {...defaults({ isPresentationActive: false })} />,
      )
      // Header
      expect(getByText('Redemption Details')).toBeTruthy()
      // Voucher summary block
      expect(getByTestId('redemption-details-summary')).toBeTruthy()
      expect(getByTestId('redemption-details-title')).toBeTruthy()
      expect(getByTestId('redemption-details-merchant')).toBeTruthy()
      // Branch / date / time info row (one of three)
      expect(getByText('Brightlingsea')).toBeTruthy()
      // Saving disclaimer
      expect(getByTestId('redemption-details-saving-disclaimer')).toBeTruthy()
    })

    it('Show-to-Staff is also hidden under a press-attempt fallback (regression pin)', () => {
      // Belt-and-braces: if a future refactor reintroduces the button
      // without re-evaluating the gate, this test will fail because
      // there's no testID to press.
      const { queryByTestId } = render(
        <RedemptionDetailsCard {...defaults({ isPresentationActive: false })} />,
      )
      expect(queryByTestId('redemption-details-show-to-staff')).toBeNull()
    })
  })

  // Expired-window inner notice card (locked 2026-05-09 from PR #49
  // device QA wave 4). Replaces the previous loose-text-at-bottom
  // treatment with an intentional inner notice in the slot where the
  // code panel used to be.
  describe('expired-window inner notice card', () => {
    it('renders the headline + supporting line copy locked by owner', () => {
      const { getByText } = render(
        <RedemptionDetailsCard {...defaults({ isPresentationActive: false })} />,
      )
      expect(getByText('Staff handoff window ended')).toBeTruthy()
      expect(
        getByText(
          'Your code is now saved in Profile → Redemption History for your records.',
        ),
      ).toBeTruthy()
    })

    it('does NOT use the previous loose-text "your details are saved below" copy', () => {
      // Owner direction: "Do not repeat 'your details are saved below'
      // because the details are already visible below."
      const { queryByText } = render(
        <RedemptionDetailsCard {...defaults({ isPresentationActive: false })} />,
      )
      expect(queryByText(/your redemption details are saved below/i)).toBeNull()
    })

    it('positions the notice card BEFORE the info rows in the rendered tree (where the code box used to be)', () => {
      // The notice replaces the code box in the same DOM slot — sits
      // above the Branch/Date/Time info rows. Without this, the
      // visual treatment regresses to the old loose-text-at-bottom.
      const { getByTestId } = render(
        <RedemptionDetailsCard {...defaults({ isPresentationActive: false })} />,
      )
      const card = getByTestId('redemption-details-card')
      const ids = card
        .findAll((el: any) => typeof el.props?.testID === 'string')
        .map((el: any) => el.props.testID as string)
      const noticeIdx = ids.indexOf('redemption-details-expired-notice')
      const summaryIdx = ids.indexOf('redemption-details-summary')
      const disclaimerIdx = ids.indexOf('redemption-details-saving-disclaimer')
      expect(noticeIdx).toBeGreaterThanOrEqual(0)
      // After summary (notice replaces the code-box slot, which was
      // between summary and info rows).
      expect(noticeIdx).toBeGreaterThan(summaryIdx)
      // Before the saving disclaimer (which sits below the info rows).
      expect(noticeIdx).toBeLessThan(disclaimerIdx)
    })

    it('does NOT render alongside the code box (mutually exclusive surface slots)', () => {
      // In-window: code box renders, notice does not.
      const { queryByTestId } = render(
        <RedemptionDetailsCard {...defaults({ isPresentationActive: true })} />,
      )
      expect(queryByTestId('redemption-details-code')).toBeTruthy()
      expect(queryByTestId('redemption-details-expired-notice')).toBeNull()
    })

    it('previous loose-text testIDs are GONE (regression pin against partial revert)', () => {
      // The old `redemption-details-window-ended` and
      // `redemption-details-history-tip` testIDs were removed when
      // the inner notice card replaced both lines. This pin will
      // fail if a future refactor accidentally reintroduces the
      // loose-text variants.
      const { queryByTestId } = render(
        <RedemptionDetailsCard {...defaults({ isPresentationActive: false })} />,
      )
      expect(queryByTestId('redemption-details-window-ended')).toBeNull()
      expect(queryByTestId('redemption-details-history-tip')).toBeNull()
    })
  })

  // User-facing helper copy for the 2-hour presentation window.
  //
  // Display timezone: DEVICE-LOCAL (locked 2026-05-09 from PR #49 device
  // QA wave 4). The card's Date/Time info rows already use device-local;
  // the helper now matches so the user sees one consistent timezone
  // throughout the surface — their wall clock matches the helper.
  //
  // The math is ABSOLUTE in milliseconds (`redeemedAtMs +
  // PRESENTATION_WINDOW_MS`). Display layer reformats the resulting
  // Date in the resolved timezone. Calculation correctness is
  // independent of display TZ.
  //
  // To keep these tests deterministic across host timezones (Qatar dev /
  // UTC CI / London /...), they call the exported `formatExpiryLine`
  // pure function with an explicit `timeZone` argument. The integration
  // test rendering the full card relies on the host's local TZ for the
  // helper output — which means it asserts STRUCTURE, not the exact
  // clock string. Owner direction explicitly asked for Qatar AND London
  // scenarios — these are pinned via `formatExpiryLine` direct calls.
  describe('presentation-window helper copy', () => {
    it('IN-WINDOW renders the helper line on the rendered card (testID present, copy starts with "Available to show staff until")', () => {
      // Integration assertion: structure only, since the host TZ is
      // unknown in CI. Specific clock-string tests live below using
      // `formatExpiryLine` with explicit `timeZone`.
      const { getByTestId } = render(
        <RedemptionDetailsCard
          {...defaults({
            redeemedAt:           '2026-05-09T14:32:00Z',
            isPresentationActive: true,
          })}
        />,
      )
      const helper = getByTestId('redemption-details-availability-helper')
      expect(typeof helper.props.children).toBe('string')
      expect(helper.props.children).toMatch(/^Available to show staff until \d{1,2} \w{3}, \d{2}:\d{2}\.$/)
    })

    it('IN-WINDOW falls back to the 2-hour phrasing when redeemedAt is malformed', () => {
      const { getByTestId } = render(
        <RedemptionDetailsCard
          {...defaults({
            redeemedAt:           'not-a-date',
            isPresentationActive: true,
          })}
        />,
      )
      const helper = getByTestId('redemption-details-availability-helper')
      expect(helper.props.children).toBe(
        'You can show this code to staff for 2 hours after redeeming.',
      )
    })

    it('VALIDATED state does NOT show the "Available to show staff until" copy', () => {
      // Locked owner direction: once validated, surfacing
      // "available to show" copy would be confusing — staff already
      // validated.
      const { queryByTestId } = render(
        <RedemptionDetailsCard
          {...defaults({ isPresentationActive: true, isValidated: true })}
        />,
      )
      expect(queryByTestId('redemption-details-availability-helper')).toBeNull()
    })
  })

  // Pure-function `formatExpiryLine` tests with explicit `timeZone`
  // parameter — deterministic regardless of the host (Qatar dev / UTC
  // CI / London laptop). Owner direction PR #49 device QA wave 4
  // explicitly asked for Qatar AND London scenarios.
  describe('formatExpiryLine — timezone-explicit pure function', () => {
    // Reference scenario throughout: redeemedAt = 19:55 UTC 8 May 2026.
    // - In Asia/Qatar (UTC+3): redeemed local = 22:55 8 May; expiry
    //   UTC = 21:55, expiry local Qatar = 00:55 9 May.
    // - In Europe/London (BST, UTC+1): redeemed local = 20:55 8 May;
    //   expiry UTC = 21:55, expiry local London = 22:55 8 May.
    // - In UTC: redeemed = 19:55 8 May; expiry = 21:55 8 May.
    const REDEEMED = '2026-05-08T19:55:00Z'

    it('Asia/Qatar — expiry crosses midnight to 9 May', () => {
      // Reproduces the user's exact PR #49 device-QA scenario. User
      // is in Qatar; redeems at 22:55 device-local; expiry is
      // 00:55 device-local on the NEXT day — date inclusion makes
      // this unambiguous.
      expect(formatExpiryLine(REDEEMED, 'Asia/Qatar')).toBe('9 May, 00:55')
    })

    it('Europe/London (BST in May) — expiry stays on 8 May', () => {
      // Same absolute redemption instant; London display lands at
      // 22:55 BST on 8 May (BST = UTC+1). Date inclusion still
      // present even when the expiry is same-day.
      expect(formatExpiryLine(REDEEMED, 'Europe/London')).toBe('8 May, 22:55')
    })

    it('UTC — baseline reference', () => {
      expect(formatExpiryLine(REDEEMED, 'UTC')).toBe('8 May, 21:55')
    })

    it('absolute math is timezone-independent — 2h delta in ALL three timezones', () => {
      // Sanity pin: regardless of how the display TZ is reformatted,
      // the ABSOLUTE delta from redeemedAt to expiry is exactly
      // 2 hours. The display tests above prove the timezone shifts
      // are reformatting the same absolute moment.
      const redeemedMs = new Date(REDEEMED).getTime()
      const expiryUTC = new Date(redeemedMs + 2 * 60 * 60 * 1000)
      // The pure function takes the REDEEMED iso and adds 2h
      // internally. Verify by formatting the same expiryUTC manually
      // and comparing to formatExpiryLine output for each TZ.
      const fmtPart = (d: Date, tz: string) => {
        const parts = new Intl.DateTimeFormat('en-US', {
          timeZone: tz, day: 'numeric', month: 'numeric',
          hour: 'numeric', minute: 'numeric', hour12: false, hourCycle: 'h23',
        }).formatToParts(d)
        const find = (t: string) => parts.find((p) => p.type === t)?.value
        return { d: parseInt(find('day') ?? '', 10), m: parseInt(find('month') ?? '', 10) }
      }
      // For all three timezones, the day+month of the expiry render
      // must match what `formatExpiryLine` returns (sanity-checking
      // we're computing the same absolute moment).
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
      for (const tz of ['Asia/Qatar', 'Europe/London', 'UTC']) {
        const { d, m } = fmtPart(expiryUTC, tz)
        const formatted = formatExpiryLine(REDEEMED, tz) ?? ''
        expect(formatted).toContain(`${d} ${months[m - 1]},`)
      }
    })

    it('day-numeric without leading zero (e.g. "9 May" not "09 May")', () => {
      // 08:00 UTC 9 May + 2h = 10:00 UTC 9 May → 13:00 Qatar 9 May.
      expect(formatExpiryLine('2026-05-09T08:00:00Z', 'Asia/Qatar')).toBe('9 May, 13:00')
    })

    it('month transition — 31 May → 1 Jun (Qatar)', () => {
      // 22:30 UTC 31 May + 2h = 00:30 UTC 1 June → 03:30 Qatar 1 June.
      expect(formatExpiryLine('2026-05-31T22:30:00Z', 'Asia/Qatar')).toBe('1 Jun, 03:30')
    })

    it('returns null on malformed ISO (defensive — never renders "Invalid Date")', () => {
      expect(formatExpiryLine('not-a-date', 'UTC')).toBeNull()
      expect(formatExpiryLine('', 'UTC')).toBeNull()
    })

    it('production call (no `timeZone` argument) uses device-local — runs without crashing', () => {
      // Don't assert the exact clock string (depends on host TZ);
      // assert structure: a string in the expected format.
      const out = formatExpiryLine('2026-05-09T08:00:00Z')
      expect(out).not.toBeNull()
      expect(out).toMatch(/^\d{1,2} \w{3}, \d{2}:\d{2}$/)
    })
  })
})
