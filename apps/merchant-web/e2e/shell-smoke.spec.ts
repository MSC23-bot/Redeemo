/**
 * PR-G1b journey 1: the authenticated shell mounts for real (the #324 class).
 * #324 was a blank-page ToastProvider crash that every unit test missed
 * because each test wrapped its component in a provider directly; this spec
 * mounts the REAL (app) layout chain and then a toast-using route.
 */
import { test, expect } from '@playwright/test'
import { installMockApi, signIn, attachErrorGuards } from './support/mocks'

test('unauthenticated visit redirects to /sign-in before painting the portal', async ({ page, context }) => {
  await installMockApi(context)
  const guards = attachErrorGuards(page)
  await page.goto('/')
  await expect(page).toHaveURL(/\/sign-in\?next=%2F/)
  await expect(page.getByText(/sign in/i).first()).toBeVisible()
  guards.assertClean()
})

test('authenticated shell mounts: sidebar, topbar, lifecycle home, no uncaught errors', async ({ page, context }) => {
  const tracker = await installMockApi(context, { role: 'OWNER' })
  await signIn(context)
  const guards = attachErrorGuards(page)

  await page.goto('/')
  // Sidebar chrome (real MerchantPortalShell + Sidebar).
  await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Vouchers', exact: true })).toBeVisible()
  await expect(page.getByText('Business status')).toBeVisible()
  // Topbar chrome.
  await expect(page.getByRole('button', { name: /validate a code/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /quick actions/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /notifications/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /account menu/i })).toBeVisible()

  guards.assertClean()
  expect(tracker.unmatched, 'unmocked API calls from the shell mount').toEqual([])
})

test('a toast-using route (branch detail) mounts inside the real (app) layout without crashing (#324 class)', async ({ page, context }) => {
  const tracker = await installMockApi(context, { role: 'OWNER' })
  await signIn(context)
  const guards = attachErrorGuards(page)

  await page.goto('/branches/b1')
  // The branch detail sections (Contact/Hours/PIN cards) all call useToast();
  // a missing ToastProvider in the real layout chain would blank-screen here.
  await expect(page.getByRole('heading', { name: 'Old Foundry' })).toBeVisible()
  await expect(page.getByTestId('branch-pin-card')).toBeVisible()

  guards.assertClean()
  // The surface under test hit only modelled routes.
  expect(tracker.unmatched, 'unmocked API calls from branch detail').toEqual([])
})

test('sidebar navigation reaches every built section without a client crash', async ({ page, context }) => {
  await installMockApi(context, { role: 'OWNER' })
  await signIn(context)
  const guards = attachErrorGuards(page)

  await page.goto('/')
  for (const [label, heading] of [
    ['Redemptions', /redemptions/i],
    ['Branches', /branches/i],
    ['Vouchers', /vouchers/i],
  ] as const) {
    await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: label, exact: true }).click()
    await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible()
  }
  guards.assertClean()
})
