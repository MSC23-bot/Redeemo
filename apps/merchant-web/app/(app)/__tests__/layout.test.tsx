import React from 'react'
import { render, screen } from '@testing-library/react'
import AppLayout from '../layout'
import { useToast } from '@/components/ui/toast'

// The shell carries heavy session/nav deps; stub it to a passthrough so this test
// asserts ONLY the contract that matters: the (app) layout provides a ToastProvider
// to its subtree. Regression for the onboarding "Add your main branch" + day-2
// branch-detail blank-page crash (useToast threw with no provider in the tree).
jest.mock('@/components/shell/MerchantPortalShell', () => ({
  MerchantPortalShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

// Renders only if an ancestor ToastProvider exists; otherwise useToast() throws.
function ToastConsumer() {
  useToast()
  return <div>toast-ok</div>
}

test('(app) layout mounts ToastProvider so any page can call useToast without crashing', () => {
  render(
    <AppLayout>
      <ToastConsumer />
    </AppLayout>,
  )
  expect(screen.getByText('toast-ok')).toBeInTheDocument()
})
