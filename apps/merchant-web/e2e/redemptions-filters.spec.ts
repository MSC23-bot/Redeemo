/**
 * The #368 Redemptions fidelity surface in a real browser: the Voucher select
 * (custom + flagship merged), the Sort control, and the code-or-title Search
 * box. Also pins the Promise.allSettled partial-source resilience (one voucher
 * source failing must not blank the other) against the REAL fetch path.
 *
 * Guards + unmatched-tracker assertions are automatic via ./support/fixtures.
 */
import { test, expect } from './support/fixtures'
import { redemptionFixture } from './support/mocks'

// Both schemas (customVoucherListRowSchema / flagshipRowSchema in lib/api/voucher.ts)
// require status/approvalStatus/estimatedSaving/createdAt; a fixture missing any of
// these fails the zod parse silently inside the page's Promise.allSettled, which
// looks identical to "the select never rendered" - so every required field is
// filled in here even though the UI itself only reads id/title.
const CUSTOM_VOUCHER = {
  id: 'v-custom-1',
  title: 'Free coffee with breakfast',
  type: 'FREEBIE',
  status: 'ACTIVE',
  approvalStatus: 'APPROVED',
  estimatedSaving: '4.50',
  createdAt: '2026-06-01T09:00:00.000Z',
  isRmv: false,
}
const FLAGSHIP_VOUCHER = {
  id: 'v-flagship-1',
  title: 'Buy one get one free',
  type: 'BOGO',
  status: 'ACTIVE',
  approvalStatus: 'APPROVED',
  estimatedSaving: '5.00',
  createdAt: '2026-06-01T09:00:00.000Z',
  isRmv: true,
}

test.describe('voucher filter renders from both custom and flagship sources', () => {
  test.use({
    mockOptions: {
      role: 'OWNER',
      customVouchers: [CUSTOM_VOUCHER],
      flagshipVouchers: [FLAGSHIP_VOUCHER],
    },
  })

  test('the Voucher select lists both the custom and the flagship voucher, title-sorted', async ({ page }) => {
    await page.goto('/redemptions')
    // Scoped to the table: the default redemption row's voucher title is also
    // "Free coffee with breakfast" (same string as the custom voucher fixture
    // below), so an unscoped getByText resolves ambiguously against the new
    // Voucher <option> once it renders.
    await expect(page.getByRole('table').getByText('Free coffee with breakfast')).toBeVisible()

    // getByRole('combobox', { name: 'Voucher', exact: true }) matches the
    // select's own accessible name (its wrapping <label>'s direct text node),
    // distinguishing it from "Voucher type" without relying on getByLabel's
    // substring matching (which resolved ambiguously against both selects).
    const voucherSelect = page.getByRole('combobox', { name: 'Voucher', exact: true })
    await expect(voucherSelect).toBeVisible()
    const optionLabels = await voucherSelect.locator('option').allTextContents()
    // 'All vouchers' + the two fixtures, sorted by title: "Buy one..." before "Free coffee...".
    expect(optionLabels).toEqual(['All vouchers', 'Buy one get one free', 'Free coffee with breakfast'])
  })
})

test.describe('sort and search wire filters into the redemptions request', () => {
  test.use({ mockOptions: { role: 'OWNER' } })

  test('choosing "Biggest saving" fires a new request carrying sort=saving', async ({ page }) => {
    await page.goto('/redemptions')
    await expect(page.getByText('Free coffee with breakfast')).toBeVisible()

    const sortRequest = page.waitForRequest(
      (req) => req.url().includes('/api/v1/merchant/redemptions') && req.url().includes('sort=saving'),
    )
    await page.getByLabel('Sort').selectOption('saving')
    const req = await sortRequest
    expect(new URL(req.url()).searchParams.get('sort')).toBe('saving')
  })

  test('typing a search term fires a request carrying code=<term>', async ({ page }) => {
    await page.goto('/redemptions')
    await expect(page.getByText('Free coffee with breakfast')).toBeVisible()

    const searchRequest = page.waitForRequest(
      (req) => req.url().includes('/api/v1/merchant/redemptions') && req.url().includes('code=A7K2'),
    )
    await page.getByPlaceholder('Code or voucher').fill('A7K2')
    const req = await searchRequest
    expect(new URL(req.url()).searchParams.get('code')).toBe('A7K2')
  })
})

test.describe('partial voucher-source failure: flagship 500, custom succeeds', () => {
  test.use({
    mockOptions: {
      role: 'OWNER',
      customVouchers: [CUSTOM_VOUCHER],
      flagshipVouchersStatus: 500,
      redemptions: [redemptionFixture()],
    },
    // The forced 500 makes Chromium log a devtools "Failed to load resource"
    // console line for that one fetch - expected noise from the deliberate
    // failure this test pins, not an app bug (see mocks.ts attachErrorGuards).
    // Count-bounded to exactly 1: the guard fails both if the forced 500 never
    // fires (0 matches) and if anything else ALSO fails during the test
    // (2+ matches, or a non-matching console error) - see fixtures.ts.
    expectedConsoleErrors: [
      { urlSubstring: '/api/v1/merchant/vouchers/rmv', textSubstring: 'Failed to load resource', count: 1 },
    ],
  })

  test('the Voucher select still renders with only the surviving custom option', async ({ page }) => {
    // Proves the forced 500 actually landed on the wire (not just that the UI
    // happens to look right) - awaited before navigation so it can't race the
    // page's own fetch.
    const flagshipFailure = page.waitForResponse(
      (res) => res.url().includes('/api/v1/merchant/vouchers/rmv') && res.status() === 500,
    )
    await page.goto('/redemptions')
    await flagshipFailure

    // Scoped to the table: see the identical note in the describe block above -
    // the redemption row's voucher title and the custom voucher fixture share
    // the same string, so an unscoped getByText can resolve ambiguously once
    // the surviving Voucher <option> renders.
    await expect(page.getByRole('table').getByText('Free coffee with breakfast')).toBeVisible()

    // getByRole('combobox', { name: 'Voucher', exact: true }) matches the
    // select's own accessible name (its wrapping <label>'s direct text node),
    // distinguishing it from "Voucher type" without relying on getByLabel's
    // substring matching (which resolved ambiguously against both selects).
    const voucherSelect = page.getByRole('combobox', { name: 'Voucher', exact: true })
    await expect(voucherSelect).toBeVisible()
    const optionLabels = await voucherSelect.locator('option').allTextContents()
    expect(optionLabels).toEqual(['All vouchers', 'Free coffee with breakfast'])
  })
})
