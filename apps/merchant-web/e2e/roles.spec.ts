/**
 * PR-G1b journey 3: role/capability navigation in a real browser.
 * Pins the shell wave's positive-allowlist contract end-to-end: OWNER full
 * nav, STAFF/unknown/absent-capabilities least-privilege baseline, account
 * menu Business-profile gating. Backend authz remains the real boundary -
 * this proves the SHELL's fail-closed rendering against wire payloads.
 *
 * Guards + unmatched-tracker assertions are automatic via ./support/fixtures.
 */
import { test, expect } from './support/fixtures'
import type { RoleFixture } from './support/mocks'
import type { Page } from '@playwright/test'

const BASELINE_VISIBLE = ['Home', 'Redemptions', 'My account', 'Help & support']
const FULL_ONLY = ['Vouchers', 'Branches', 'Staff & access', 'Business profile']

function nav(page: Page) {
  return page.getByRole('navigation', { name: 'Primary' })
}

for (const role of ['STAFF', 'AUDITOR', 'ABSENT'] as RoleFixture[]) {
  test.describe(`role ${role}`, () => {
    test.use({ mockOptions: { role, staffListAllowed: false } })

    test('sidebar fails closed to the least-privilege baseline', async ({ page }) => {
      await page.goto('/')
      const sidebar = nav(page)
      for (const label of BASELINE_VISIBLE) {
        await expect(sidebar.getByRole('link', { name: label, exact: true })).toBeVisible()
      }
      for (const label of FULL_ONLY) {
        await expect(sidebar.getByRole('link', { name: label, exact: true })).toHaveCount(0)
      }
      await expect(sidebar.getByText('Grow your business')).toHaveCount(0)

      // Account menu: no Business profile for a non-allowlisted role.
      await page.getByRole('button', { name: /account menu/i }).click()
      await expect(page.getByRole('menuitem', { name: /my account/i })).toBeVisible()
      await expect(page.getByRole('menuitem', { name: /business profile/i })).toHaveCount(0)
    })
  })
}

test('OWNER: full nav including the Grow group, Insights, and Business profile in the menu', async ({ page }) => {
  await page.goto('/')
  const sidebar = nav(page)
  for (const label of [...BASELINE_VISIBLE, ...FULL_ONLY, 'Insights & reports', 'Promote Soon', 'Payments & billing Soon']) {
    await expect(sidebar.getByRole('link', { name: label, exact: true })).toBeVisible()
  }
  await page.getByRole('button', { name: /account menu/i }).click()
  await expect(page.getByRole('menuitem', { name: /business profile/i })).toBeVisible()
  // Identity line renders the viewer, not another member.
  await expect(page.getByText('Priya Shah')).toBeVisible()
})

test.describe('branch manager', () => {
  test.use({ mockOptions: { role: 'BRANCH_MANAGER', staffListAllowed: false } })

  test('BRANCH_MANAGER: full nav WITHOUT the Grow group', async ({ page }) => {
    await page.goto('/')
    const sidebar = nav(page)
    for (const label of [...FULL_ONLY, 'Insights & reports']) {
      await expect(sidebar.getByRole('link', { name: label, exact: true })).toBeVisible()
    }
    await expect(sidebar.getByText('Grow your business')).toHaveCount(0)
  })
})
