import React from 'react'
import { render } from '@testing-library/react-native'
import { QRCodeBlock } from '@/features/voucher/components/QRCodeBlock'

describe('QRCodeBlock', () => {
  it('renders with provided code as accessibilityLabel', () => {
    const { getByLabelText } = render(<QRCodeBlock value="K3F9P7" size={240} />)
    expect(getByLabelText('Redemption code. K, 3, F, 9, P, 7.')).toBeTruthy()
  })

  it('clamps to minimum size of 200 when requested size is smaller than 200 AND hero=true', () => {
    const { UNSAFE_getByType } = render(<QRCodeBlock value="K3F9P7" size={180} hero />)
    const QRCode = require('react-native-qrcode-svg').default
    const node = UNSAFE_getByType(QRCode)
    expect(node.props.size).toBe(200)
  })

  it('does not clamp non-hero usage (Redemption Details Card at 80 is allowed)', () => {
    const { UNSAFE_getByType } = render(<QRCodeBlock value="K3F9P7" size={80} />)
    const QRCode = require('react-native-qrcode-svg').default
    const node = UNSAFE_getByType(QRCode)
    expect(node.props.size).toBe(80)
  })

  it('sets accessibilityLabel to "Code hidden. Tap to show again." when blurred=true', () => {
    const { getByLabelText } = render(<QRCodeBlock value="K3F9P7" size={240} blurred />)
    expect(getByLabelText('Code hidden. Tap to show again.')).toBeTruthy()
  })
})
