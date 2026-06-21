import { render, screen, fireEvent } from '@testing-library/react'
import { ChangeCategoryConfirm } from '@/components/onboarding/category/ChangeCategoryConfirm'

describe('ChangeCategoryConfirm', () => {
  it('renders the warning copy about starter (flagship) vouchers', () => {
    render(<ChangeCategoryConfirm onCancel={jest.fn()} onConfirm={jest.fn()} />)
    expect(screen.getByText(/change your business category/i)).toBeInTheDocument()
    // the phrase appears in both the lead paragraph and the reassurance note
    expect(screen.getAllByText(/starter vouchers/i).length).toBeGreaterThanOrEqual(1)
  })

  it('calls onCancel from the keep button', () => {
    const onCancel = jest.fn()
    render(<ChangeCategoryConfirm onCancel={onCancel} onConfirm={jest.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /keep my category/i }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('calls onConfirm from the choose-a-new-category button', () => {
    const onConfirm = jest.fn()
    render(<ChangeCategoryConfirm onCancel={jest.fn()} onConfirm={onConfirm} />)
    fireEvent.click(screen.getByRole('button', { name: /choose a new category/i }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })
})
