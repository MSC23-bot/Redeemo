import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { Switch } from '../switch'

function Controlled({ initial = false }: { initial?: boolean }) {
  const [on, setOn] = useState(initial)
  return <Switch checked={on} onCheckedChange={setOn} label="Open 24 hours" />
}

describe('Switch', () => {
  it('renders an accessible switch with role=switch and a label', () => {
    render(<Switch checked={false} onCheckedChange={() => {}} label="Open 24 hours" />)
    const sw = screen.getByRole('switch', { name: /Open 24 hours/i })
    expect(sw).toBeInTheDocument()
    expect(sw).toHaveAttribute('aria-checked', 'false')
  })

  it('reflects the checked state via aria-checked + data-state', () => {
    render(<Switch checked onCheckedChange={() => {}} label="Open 24 hours" />)
    const sw = screen.getByRole('switch')
    expect(sw).toHaveAttribute('aria-checked', 'true')
    expect(sw).toHaveAttribute('data-state', 'on')
  })

  it('toggles when clicked', async () => {
    render(<Controlled />)
    const sw = screen.getByRole('switch')
    expect(sw).toHaveAttribute('aria-checked', 'false')
    await userEvent.click(sw)
    expect(sw).toHaveAttribute('aria-checked', 'true')
    await userEvent.click(sw)
    expect(sw).toHaveAttribute('aria-checked', 'false')
  })

  it('does not toggle when disabled', async () => {
    const onChange = jest.fn()
    render(<Switch checked={false} onCheckedChange={onChange} disabled label="x" />)
    await userEvent.click(screen.getByRole('switch'))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('paints the brand gradient on the track when on', () => {
    render(<Switch checked onCheckedChange={() => {}} label="x" />)
    const sw = screen.getByRole('switch')
    // The gradient is a Tailwind arbitrary value on className (button.tsx convention);
    // jsdom drops gradient values from inline style, so assert on className.
    expect(sw.className).toMatch(/E20C04/)
  })
})
