import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native'
import { ChangePasswordSheet } from '../components/ChangePasswordSheet'

const mockPost = jest.fn()
jest.mock('@/lib/api', () => ({
  api: { post: (...args: any[]) => mockPost(...args) },
}))

describe('ChangePasswordSheet', () => {
  beforeEach(() => mockPost.mockClear())

  it('shows all three password fields', () => {
    render(<ChangePasswordSheet visible={true} onDismiss={jest.fn()} onSuccess={jest.fn()} />)
    expect(screen.getByText(/current password/i)).toBeTruthy()
    // "new password" appears multiple times — check confirm field label
    expect(screen.getByText(/confirm new password/i)).toBeTruthy()
  })

  it('shows validation error when fields empty', () => {
    render(<ChangePasswordSheet visible={true} onDismiss={jest.fn()} onSuccess={jest.fn()} />)
    // The button text "Change password" matches the title too — use getByRole
    fireEvent.press(screen.getByRole('button', { name: /change password/i }))
    expect(screen.getByText(/all fields are required/i)).toBeTruthy()
    expect(mockPost).not.toHaveBeenCalled()
  })

  it('shows error when passwords do not match', () => {
    render(<ChangePasswordSheet visible={true} onDismiss={jest.fn()} onSuccess={jest.fn()} />)
    const inputs = screen.getAllByDisplayValue('')
    fireEvent.changeText(inputs[0], 'Old1234!')
    fireEvent.changeText(inputs[1], 'New1234!')
    fireEvent.changeText(inputs[2], 'Different!')
    fireEvent.press(screen.getByRole('button', { name: /change password/i }))
    expect(screen.getByText(/do not match/i)).toBeTruthy()
  })

  it('calls API with current + new password on valid submit', async () => {
    mockPost.mockResolvedValue({})
    render(<ChangePasswordSheet visible={true} onDismiss={jest.fn()} onSuccess={jest.fn()} />)
    const inputs = screen.getAllByDisplayValue('')
    fireEvent.changeText(inputs[0], 'OldPass1!')
    fireEvent.changeText(inputs[1], 'NewPass1!')
    fireEvent.changeText(inputs[2], 'NewPass1!')
    fireEvent.press(screen.getByRole('button', { name: /change password/i }))
    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith(
        '/api/v1/customer/profile/change-password',
        { currentPassword: 'OldPass1!', newPassword: 'NewPass1!' },
      )
    })
  })
})
