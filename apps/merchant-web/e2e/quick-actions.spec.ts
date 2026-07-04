/**
 * PR-G1b journey 4: same-page Quick Actions (the Codex-corrected contracts).
 * Real browser + real Next router: the page stays mounted while the URL
 * changes, exactly the path unit tests can only simulate.
 *
 * Guards + unmatched-tracker assertions are automatic via ./support/fixtures.
 */
import { test, expect } from './support/fixtures'

test('same-page Create-a-voucher: builder opens from /vouchers, cancel strips the param', async ({ page }) => {
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
})

test("same-page Today's redemptions: the From filter shows today's date", async ({ page }) => {
  await page.goto('/redemptions')
  await expect(page.getByText('Free coffee with breakfast')).toBeVisible()

  await page.getByRole('button', { name: /quick actions/i }).click()
  await page.getByRole('menuitem', { name: /today's redemptions/i }).click()

  await expect(page).toHaveURL(/\/redemptions\?range=today/)
  // The browser's own local calendar date (en-CA gives YYYY-MM-DD, the date
  // input's value format). Documented residual: a sub-second local-midnight
  // race, at most once per day.
  const expected = await page.evaluate(() => new Date().toLocaleDateString('en-CA'))
  const fromInput = page.locator('input[type="date"]').first()
  await expect(fromInput).toHaveValue(expected)
})
