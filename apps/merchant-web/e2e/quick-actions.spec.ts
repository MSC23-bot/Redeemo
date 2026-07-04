/**
 * PR-G1b journey 4: same-page Quick Actions (the Codex-corrected contracts).
 * Real browser + real Next router: the page stays mounted while the URL
 * changes, exactly the path unit tests can only simulate.
 */
import { test, expect } from '@playwright/test'
import { installMockApi, signIn, attachErrorGuards } from './support/mocks'

test('same-page Create-a-voucher: builder opens from /vouchers, cancel strips the param', async ({ page, context }) => {
  const tracker = await installMockApi(context, { role: 'OWNER' })
  await signIn(context)
  const guards = attachErrorGuards(page)

  await page.goto('/vouchers')
  await expect(page.getByRole('heading', { name: /vouchers/i }).first()).toBeVisible()

  await page.getByRole('button', { name: /quick actions/i }).click()
  await page.getByRole('menuitem', { name: /create a voucher/i }).click()

  await expect(page).toHaveURL(/\/vouchers\?create=1/)
  await expect(page.getByRole('heading', { name: 'Create a voucher' })).toBeVisible()

  await page.getByRole('button', { name: /^cancel$/i }).click()
  await expect(page).toHaveURL(/\/vouchers$/)
  await expect(page.getByRole('heading', { name: 'Create a voucher' })).toHaveCount(0)

  // Reload: the cancelled builder must NOT reopen.
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Create a voucher' })).toHaveCount(0)

  guards.assertClean()
  expect(tracker.unmatched, 'unmocked API calls').toEqual([])
})

test("same-page Today's redemptions: the From filter shows today's date", async ({ page, context }) => {
  const tracker = await installMockApi(context, { role: 'OWNER' })
  await signIn(context)
  const guards = attachErrorGuards(page)

  await page.goto('/redemptions')
  await expect(page.getByText('Free coffee with breakfast')).toBeVisible()

  await page.getByRole('button', { name: /quick actions/i }).click()
  await page.getByRole('menuitem', { name: /today's redemptions/i }).click()

  await expect(page).toHaveURL(/\/redemptions\?range=today/)
  // The browser's own local calendar date (en-CA gives YYYY-MM-DD, the date
  // input's value format).
  const expected = await page.evaluate(() => new Date().toLocaleDateString('en-CA'))
  const fromInput = page.locator('input[type="date"]').first()
  await expect(fromInput).toHaveValue(expected)

  guards.assertClean()
  expect(tracker.unmatched, 'unmocked API calls').toEqual([])
})
