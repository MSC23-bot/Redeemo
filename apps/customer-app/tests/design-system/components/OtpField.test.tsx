import React from 'react'
import { act, fireEvent, render } from '@testing-library/react-native'
import { OtpField } from '@/design-system/components/OtpField'

describe('<OtpField>', () => {
  it('fires onComplete when all 6 cells filled', () => {
    const onComplete = jest.fn()
    const { getByLabelText } = render(<OtpField length={6} onComplete={onComplete} />)
    const input = getByLabelText('One-time code')
    act(() => fireEvent.changeText(input, '123456'))
    expect(onComplete).toHaveBeenCalledWith('123456')
  })
})
