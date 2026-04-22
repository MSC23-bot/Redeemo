import React from 'react'
import { render, screen } from '@testing-library/react-native'

jest.mock('@/features/profile/hooks/useDeleteAccount', () => ({
  useDeleteAccount: jest.fn(() => ({
    stage: 'warning',
    setStage: jest.fn(),
    error: null,
    loading: false,
    sendOtp: jest.fn(),
    verifyOtp: jest.fn(),
    confirmDelete: jest.fn(),
    actionToken: null,
  })),
}))

import { DeleteAccountFlow } from '../components/DeleteAccountFlow'

describe('DeleteAccountFlow', () => {
  it('shows warning with consequences list', () => {
    render(<DeleteAccountFlow visible={true} onDismiss={jest.fn()} />)
    expect(screen.getByText(/permanently anonymised/i)).toBeTruthy()
    expect(screen.getByText(/subscription will be cancelled immediately/i)).toBeTruthy()
    expect(screen.getByText(/favourites and redemption history will be removed/i)).toBeTruthy()
  })

  it('shows send OTP button in warning stage', () => {
    render(<DeleteAccountFlow visible={true} onDismiss={jest.fn()} />)
    expect(screen.getByText(/send verification code/i)).toBeTruthy()
  })

  it('shows keep my account button', () => {
    render(<DeleteAccountFlow visible={true} onDismiss={jest.fn()} />)
    expect(screen.getByText(/keep my account/i)).toBeTruthy()
  })
})
