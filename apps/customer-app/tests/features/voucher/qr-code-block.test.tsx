import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { QRCodeBlock } from '@/features/voucher/components/QRCodeBlock'
import { codeAccessibilityLabel } from '@/features/voucher/utils/formatRedemptionCode'

// react-native-qrcode-svg is stubbed at module-load time so the suite
// doesn't need its underlying SVG renderer. expo-blur's BlurView is
// also stubbed — the blurred state's behaviour we care about is the
// accessibility shape (button + tap-to-show label + onPress wiring),
// not the visual blur rendering. Visual goes through manual device QA
// per plan §Manual device QA checklist.
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

describe('QRCodeBlock', () => {
  it('renders a QR code with accessibility label derived from the formatted 8-char code', () => {
    const { getByLabelText, getByTestId } = render(
      <QRCodeBlock value="A7K2P9X4" size={200} testID="qr" />,
    )
    // codeAccessibilityLabel('A7K2P9X4') = "Redemption code A 7 K 2, P 9 X 4"
    expect(getByLabelText(codeAccessibilityLabel('A7K2P9X4'))).toBeTruthy()
    // QR child renders (proves we're on the non-blurred branch).
    expect(getByTestId('qrcode-svg-stub')).toBeTruthy()
  })

  it('uses image accessibility role on the visible state', () => {
    const { getByTestId } = render(
      <QRCodeBlock value="A7K2P9X4" size={200} testID="qr" />,
    )
    // RNTL 13's getByRole is strict — `image` role on a plain View
    // isn't reliably indexed. Verify the wrapper has the right
    // accessibility props via the testID round-trip instead.
    const wrapper = getByTestId('qr')
    expect(wrapper.props.accessibilityRole).toBe('image')
  })

  it('renders blurred state with a button-role + tap-to-show accessibility label', () => {
    const { getByRole, queryByTestId } = render(
      <QRCodeBlock value="A7K2P9X4" size={200} testID="qr" blurred />,
    )
    const node = getByRole('button')
    expect(node.props.accessibilityLabel).toMatch(/tap to show/i)
    // Critical anti-fraud: when blurred the QR child MUST NOT render.
    // A screenshot taken while blurred captures the blur overlay, NOT
    // the underlying QR code.
    expect(queryByTestId('qrcode-svg-stub')).toBeNull()
  })

  it('blurred state calls onShow when pressed (tap-to-show wiring)', () => {
    const onShow = jest.fn()
    const { getByRole } = render(
      <QRCodeBlock value="A7K2P9X4" size={200} testID="qr" blurred onShow={onShow} />,
    )
    fireEvent.press(getByRole('button'))
    expect(onShow).toHaveBeenCalledTimes(1)
  })

  it('enforces hero-mode size floor of 200px', () => {
    const { getByTestId } = render(
      <QRCodeBlock value="A7K2P9X4" size={120} hero testID="qr" />,
    )
    const wrapper = getByTestId('qr')
    // The wrapper style is an array containing the sizing object.
    const styleArr = Array.isArray(wrapper.props.style) ? wrapper.props.style : [wrapper.props.style]
    expect(styleArr).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ width: 200, height: 200 }),
      ]),
    )
  })

  it('honors size when above the hero floor', () => {
    const { getByTestId } = render(
      <QRCodeBlock value="A7K2P9X4" size={240} hero testID="qr" />,
    )
    const wrapper = getByTestId('qr')
    const styleArr = Array.isArray(wrapper.props.style) ? wrapper.props.style : [wrapper.props.style]
    expect(styleArr).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ width: 240, height: 240 }),
      ]),
    )
  })

  it('uses the supplied size unchanged when not in hero mode', () => {
    const { getByTestId } = render(
      <QRCodeBlock value="A7K2P9X4" size={140} testID="qr" />,
    )
    const wrapper = getByTestId('qr')
    const styleArr = Array.isArray(wrapper.props.style) ? wrapper.props.style : [wrapper.props.style]
    expect(styleArr).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ width: 140, height: 140 }),
      ]),
    )
  })

  describe('PR-B T8q — brand-coloured Redeemo R overlay (replaces invisible white PNG)', () => {
    // Owner direction: "the Redeemo logo in the center of the QR
    // code is white, we can't see it.  Make sure it goes well with
    // the QR code."
    //
    // The previous `redeemo-r-mark.png` asset was a near-white R on
    // transparent — invisible against the QR's white background and
    // the white `logoBackgroundColor` mask.  T8q replaces that with
    // an absolute-positioned overlay that hosts the canonical
    // <RedeemoLogo> SVG component (brand-rose + brand-coral paths)
    // on a white anchor square.  The QR's built-in `logo` /
    // `logoSize` / `logoBackgroundColor` props are dropped — the
    // overlay handles the masking visually instead.

    it('renders the brand <RedeemoLogo> overlay in the centre of the QR (testID present, non-blurred state only)', () => {
      const { getByTestId } = render(
        <QRCodeBlock value="A7K2P9X4" size={200} testID="qr" />,
      )
      // The brand-rose/coral overlay sits as an absolute child of
      // the QR wrapper and pins via testID="qrcode-redeemo-overlay".
      expect(getByTestId('qrcode-redeemo-overlay')).toBeTruthy()
    })

    it('overlay is hidden in the blurred state (anti-fraud — neither the QR nor the brand mark surfaces under blur)', () => {
      const { queryByTestId } = render(
        <QRCodeBlock value="A7K2P9X4" size={200} testID="qr" blurred />,
      )
      // Critical anti-fraud: blurred branch renders ONLY the BlurView,
      // not the QR + overlay subtree.  A screenshot under blur
      // captures neither the code nor the brand mark.
      expect(queryByTestId('qrcode-redeemo-overlay')).toBeNull()
      expect(queryByTestId('qrcode-svg-stub')).toBeNull()
    })

    it('overlay anchor square is centred + sized at ~25% of the QR (within the H-level 30% error-correction tolerance)', () => {
      const qrSize = 200
      const { getByTestId } = render(
        <QRCodeBlock value="A7K2P9X4" size={qrSize} testID="qr" />,
      )
      const overlay = getByTestId('qrcode-redeemo-overlay')
      const styleArr = Array.isArray(overlay.props.style)
        ? overlay.props.style.flat(Infinity).filter(Boolean)
        : [overlay.props.style]
      const flat = Object.assign({}, ...styleArr)
      // Anchor size = round(round(0.18 × 200) × 1.4) = round(36 × 1.4) = 50.
      const expectedLogoSize = Math.round(qrSize * 0.18)
      const expectedAnchorSize = Math.round(expectedLogoSize * 1.4)
      expect(flat.width).toBe(expectedAnchorSize)
      expect(flat.height).toBe(expectedAnchorSize)
      // Centred — top + left = (qrSize - anchor) / 2.
      const expectedOffset = (qrSize - expectedAnchorSize) / 2
      expect(flat.top).toBe(expectedOffset)
      expect(flat.left).toBe(expectedOffset)
      // White anchor square — masks the QR modules behind so the
      // brand mark sits on a clean canvas.
      expect(flat.backgroundColor).toBe('#FFFFFF')
      expect(flat.position).toBe('absolute')
    })
  })
})

describe('codeAccessibilityLabel', () => {
  it('spaces each character of the 8-char code and inserts a comma between the two groups', () => {
    expect(codeAccessibilityLabel('A7K2P9X4')).toBe('Redemption code A 7 K 2, P 9 X 4')
  })

  it('falls back to the raw code for non-8-char inputs (defensive)', () => {
    expect(codeAccessibilityLabel('SHORT')).toBe('Redemption code SHORT')
  })
})
