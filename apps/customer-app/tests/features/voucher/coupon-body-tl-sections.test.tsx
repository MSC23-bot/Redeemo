import React from 'react'
import { render } from '@testing-library/react-native'
import { CouponBodyCard, CouponTopCard } from '@/features/voucher/components/CouponBody'

const TL_PROPS_BASE = {
  type: 'TIME_LIMITED' as const,
  terms: 'In-house only. Cannot be combined with other offers.',
  description: 'Buy any pizza and get a free side salad.',
  scheduleString: 'Mon-Fri, 11am-3pm',
  expiryDate: null as string | null,
}

describe('CouponBodyCard — TIME_LIMITED sections (spec §5 + D6(C))', () => {
  it('renders Availability section for TL with schedule string', () => {
    const { getByTestId } = render(<CouponBodyCard {...TL_PROPS_BASE} />)
    const availability = getByTestId('coupon-body-availability')
    expect(availability).toBeTruthy()
    expect(availability.props.accessibilityLabel || '').toContain('Mon-Fri, 11am-3pm')
  })

  it('renders Usage rule section for TL with "Redeem once per active window" copy', () => {
    const { getByTestId } = render(<CouponBodyCard {...TL_PROPS_BASE} />)
    const usage = getByTestId('coupon-body-usage-rule')
    expect(usage).toBeTruthy()
    expect(usage.props.accessibilityLabel || '').toContain('once per active window')
  })

  it('renders Description section for TL (moved from hero per D6(C))', () => {
    const { getByText } = render(<CouponBodyCard {...TL_PROPS_BASE} />)
    expect(getByText('Buy any pizza and get a free side salad.')).toBeTruthy()
  })

  // ── Goal 2 guidance card (TL wording amendment 2026-05-11) ──────────

  it('renders Redeem-before-window-ends guidance card for TL with locked title + body', () => {
    const { getByTestId, getByText } = render(<CouponBodyCard {...TL_PROPS_BASE} />)
    const guidance = getByTestId('coupon-body-redeem-guidance')
    expect(guidance).toBeTruthy()
    expect(getByText('Redeem before the window ends')).toBeTruthy()
    expect(
      getByText(
        /Redeem this voucher before the availability window ends\. Once redeemed, your code stays available to show staff for up to 2 hours\./,
      ),
    ).toBeTruthy()
  })

  it('guidance card a11y label covers both title and body', () => {
    const { getByTestId } = render(<CouponBodyCard {...TL_PROPS_BASE} />)
    const guidance = getByTestId('coupon-body-redeem-guidance')
    const a11y = guidance.props.accessibilityLabel || ''
    expect(a11y).toContain('Redeem before the window ends')
    expect(a11y).toContain('show staff for up to 2 hours')
  })

  it('guidance card renders unconditionally for TL — even with null description', () => {
    const { getByTestId, queryByTestId } = render(
      <CouponBodyCard {...TL_PROPS_BASE} description={null} />,
    )
    expect(getByTestId('coupon-body-redeem-guidance')).toBeTruthy()
    // Description testID absent (null description), but guidance card stays.
    expect(queryByTestId('coupon-body-description')).toBeNull()
  })

  it('guidance card does NOT render for non-TL voucher types (TL-only scope)', () => {
    const { queryByTestId } = render(<CouponBodyCard {...TL_PROPS_BASE} type="BOGO" />)
    expect(queryByTestId('coupon-body-redeem-guidance')).toBeNull()
  })

  it('renders Offer ends section ONLY when expiryDate is non-null', () => {
    const withExpiry = render(<CouponBodyCard {...TL_PROPS_BASE} expiryDate="2026-12-31T00:00:00Z" />)
    expect(withExpiry.getByTestId('coupon-body-offer-ends')).toBeTruthy()

    const withoutExpiry = render(<CouponBodyCard {...TL_PROPS_BASE} expiryDate={null} />)
    expect(withoutExpiry.queryByTestId('coupon-body-offer-ends')).toBeNull()
  })

  it('sections render in DOM order: Availability → Usage rule → Guidance → Description → Terms → Fair Use → Offer ends', () => {
    const { toJSON } = render(
      <CouponBodyCard {...TL_PROPS_BASE} expiryDate="2026-12-31T00:00:00Z" />,
    )
    const tree = JSON.stringify(toJSON())
    const idxAvailability = tree.indexOf('coupon-body-availability')
    const idxUsage        = tree.indexOf('coupon-body-usage-rule')
    const idxGuidance     = tree.indexOf('coupon-body-redeem-guidance')
    const idxDescription  = tree.indexOf('coupon-body-description')
    const idxTerms        = tree.indexOf('coupon-body-terms')
    const idxFairUse      = tree.indexOf('coupon-body-fair-use')
    const idxOfferEnds    = tree.indexOf('coupon-body-offer-ends')

    expect(idxAvailability).toBeGreaterThan(-1)
    expect(idxUsage).toBeGreaterThan(idxAvailability)
    expect(idxGuidance).toBeGreaterThan(idxUsage)
    expect(idxDescription).toBeGreaterThan(idxGuidance)
    expect(idxTerms).toBeGreaterThan(idxDescription)
    expect(idxFairUse).toBeGreaterThan(idxTerms)
    expect(idxOfferEnds).toBeGreaterThan(idxFairUse)
  })

  it('does NOT render TL-only sections for non-TL voucher types (D6(C) scope fence)', () => {
    const { queryByTestId } = render(
      <CouponBodyCard {...TL_PROPS_BASE} type="BOGO" />,
    )
    expect(queryByTestId('coupon-body-availability')).toBeNull()
    expect(queryByTestId('coupon-body-usage-rule')).toBeNull()
    expect(queryByTestId('coupon-body-redeem-guidance')).toBeNull()
    expect(queryByTestId('coupon-body-offer-ends')).toBeNull()
    // Description is NOT moved for non-TL — stays in hero in M4d.
    expect(queryByTestId('coupon-body-description')).toBeNull()
  })

  it('renders existing Terms section for non-TL voucher types (unchanged behaviour)', () => {
    const { getByTestId } = render(
      <CouponBodyCard {...TL_PROPS_BASE} type="BOGO" />,
    )
    // Terms section keeps its testID; the section structure for non-TL is unchanged.
    expect(getByTestId('coupon-body-terms')).toBeTruthy()
    expect(getByTestId('coupon-body-fair-use')).toBeTruthy()
  })
})

describe('CouponTopCard — banner image height (spec D5)', () => {
  it('renders banner image at 240pt when imageUrl is present', () => {
    const { getByTestId } = render(
      <CouponTopCard
        type="TIME_LIMITED"
        imageUrl="https://example.com/banner.jpg"
        expiryDate={null}
        isMultiBranch={false}
        terms={null}
      />,
    )
    const img = getByTestId('coupon-top-banner-image')
    // The style may be an array (StyleSheet.create + inline) — flatten and look for height: 240.
    const styles = Array.isArray(img.props.style) ? img.props.style : [img.props.style]
    const flat = Object.assign({}, ...styles)
    expect(flat.height).toBe(240)
  })

  it('falls back to 6pt accent line when imageUrl is null (no fake banner)', () => {
    const { queryByTestId, getByTestId } = render(
      <CouponTopCard
        type="TIME_LIMITED"
        imageUrl={null}
        expiryDate={null}
        isMultiBranch={false}
        terms={null}
      />,
    )
    expect(queryByTestId('coupon-top-banner-image')).toBeNull()
    const accent = getByTestId('coupon-top-accent-line')
    const styles = Array.isArray(accent.props.style) ? accent.props.style : [accent.props.style]
    const flat = Object.assign({}, ...styles)
    expect(flat.height).toBe(6)
  })
})
