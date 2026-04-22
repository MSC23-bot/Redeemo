import React from 'react'
import { act, render } from '@testing-library/react-native'
import { Countdown } from '@/design-system/motion/Countdown'

jest.useFakeTimers()

describe('<Countdown>', () => {
  it('counts down from given seconds and calls onDone', () => {
    const onDone = jest.fn()
    const { getByText } = render(<Countdown seconds={3} onDone={onDone} />)
    expect(getByText(/3/)).toBeTruthy()
    act(() => { jest.advanceTimersByTime(1000) })
    expect(getByText(/2/)).toBeTruthy()
    act(() => { jest.advanceTimersByTime(2000) })
    expect(onDone).toHaveBeenCalled()
  })
})
