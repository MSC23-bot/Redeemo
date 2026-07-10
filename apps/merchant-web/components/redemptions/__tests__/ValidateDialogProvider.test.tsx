import { render, screen, act } from '@testing-library/react'
import * as React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ValidateDialogProvider } from '../ValidateDialogProvider'
import { useValidateDialog } from '../validateDialogContext'
import { ToastProvider } from '@/components/ui/toast'

// ValidateCodeDialog (mounted by the provider once open) calls these on
// submit; stub so the module resolves without hitting the network. Neither
// is invoked just by opening the entry step.
jest.mock('@/lib/api/redemptions', () => ({
  lookupRedemptionByCode: jest.fn(),
  validateRedemptionCode: jest.fn(),
}))

function Consumer({ onReady }: { onReady: (open: (code?: unknown) => void) => void }) {
  const { openValidate } = useValidateDialog()
  onReady(openValidate as (code?: unknown) => void)
  return null
}

function renderProvider() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  let openValidate!: (code?: unknown) => void
  const utils = render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <ValidateDialogProvider>
          <Consumer onReady={(fn) => (openValidate = fn)} />
        </ValidateDialogProvider>
      </ToastProvider>
    </QueryClientProvider>,
  )
  return { ...utils, open: (code?: unknown) => act(() => openValidate(code)) }
}

describe('ValidateDialogProvider', () => {
  it('openValidate() with no argument opens the dialog with an empty initial code', () => {
    const { open } = renderProvider()
    open()
    expect((screen.getByLabelText(/redemption code/i) as HTMLInputElement).value).toBe('')
  })

  it('openValidate(code) with a real string pre-seeds the entry input', () => {
    const { open } = renderProvider()
    open('A7K2P9X4')
    expect((screen.getByLabelText(/redemption code/i) as HTMLInputElement).value).toBe('A7K2 P9X4')
  })

  // Regression for the staging-acceptance topbar crash: a call site that
  // forwards a React SyntheticEvent (or any other non-string) as `code` must
  // never poison initialCode - normalizeCode() would otherwise run string ops
  // on that object and throw when ValidateCodeDialog mounts.
  it.each([
    ['a SyntheticEvent-shaped object', { type: 'click', target: {} }],
    ['a number', 42],
    ['a boolean', true],
  ])('openValidate(<non-string>) - %s - yields an empty initial code, never a crash', (_label, poison) => {
    const { open } = renderProvider()
    expect(() => open(poison)).not.toThrow()
    expect((screen.getByLabelText(/redemption code/i) as HTMLInputElement).value).toBe('')
  })

  it('mounts nothing extra when never opened', () => {
    renderProvider()
    expect(screen.queryByTestId('validate-code-dialog')).not.toBeInTheDocument()
  })
})
