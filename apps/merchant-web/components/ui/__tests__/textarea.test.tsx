import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { Textarea } from '../textarea'

function Controlled({ maxLength = 600 }: { maxLength?: number }) {
  const [value, setValue] = useState('')
  return (
    <Textarea
      label="Description"
      maxLength={maxLength}
      value={value}
      onChange={(e) => setValue(e.target.value)}
    />
  )
}

describe('Textarea', () => {
  it('renders a labelled textarea', () => {
    render(<Textarea label="Description" maxLength={600} />)
    expect(screen.getByLabelText(/Description/i)).toBeInTheDocument()
  })

  it('shows a live character counter that updates as the user types', async () => {
    render(<Controlled />)
    expect(screen.getByText('0 / 600')).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText(/Description/i), 'Hello')
    expect(screen.getByText('5 / 600')).toBeInTheDocument()
  })

  it('enforces the maxLength on the underlying textarea', () => {
    render(<Textarea label="Description" maxLength={600} />)
    expect(screen.getByLabelText(/Description/i)).toHaveAttribute('maxLength', '600')
  })

  it('flags an over-limit / at-limit counter state via data-over when near the cap', async () => {
    render(<Controlled maxLength={5} />)
    await userEvent.type(screen.getByLabelText(/Description/i), 'abcde')
    const counter = screen.getByText('5 / 5')
    expect(counter).toHaveAttribute('data-over', 'true')
  })

  it('does not flag the counter when below the cap', async () => {
    render(<Controlled maxLength={10} />)
    await userEvent.type(screen.getByLabelText(/Description/i), 'abc')
    expect(screen.getByText('3 / 10')).toHaveAttribute('data-over', 'false')
  })
})
