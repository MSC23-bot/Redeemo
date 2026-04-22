import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { TextField } from '@/design-system/components/TextField'

describe('<TextField>', () => {
  it('renders label + exposes accessibilityLabel', () => {
    const { getByLabelText } = render(<TextField label="Email" value="" onChangeText={() => {}} />)
    expect(getByLabelText('Email')).toBeTruthy()
  })
  it('shows error text', () => {
    const { getByText } = render(<TextField label="Email" value="" onChangeText={() => {}} error="Required" />)
    expect(getByText('Required')).toBeTruthy()
  })
  it('password toggles visibility', () => {
    const { getByLabelText } = render(<TextField label="Password" secure value="abc" onChangeText={() => {}} />)
    const input = getByLabelText('Password')
    expect(input.props.secureTextEntry).toBe(true)
    fireEvent.press(getByLabelText('Show password'))
    expect(getByLabelText('Password').props.secureTextEntry).toBe(false)
  })
})
