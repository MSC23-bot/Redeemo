/**
 * /staff renders the roster from route-mocked staff + app-user + branches
 * endpoints, and the row-actions menu + remove-confirm dialog mount for a
 * non-last-owner member in a real browser (jest already pins the mutation
 * contract page-level; this is real-browser render + menu + dialog mount only,
 * no actual removal journey).
 *
 * Guards + unmatched-tracker assertions are automatic via ./support/fixtures.
 */
import { test, expect } from './support/fixtures'
import { memberFixture } from './support/mocks'

const OWNER_MEMBER = memberFixture('OWNER')
const MANAGER_MEMBER = {
  ...memberFixture('BRANCH_MANAGER'),
  id: 'mm2',
  name: 'Bea Manager',
  email: 'bea@roe.test',
  canManageVouchers: false,
  allBranches: false,
  branchIds: ['b1'],
}

test.describe('OWNER: roster renders from route-mocked staff + app-user + branches', () => {
  test.use({
    mockOptions: { role: 'OWNER', members: [OWNER_MEMBER, MANAGER_MEMBER] },
  })

  test('the roster lists both the owner and the manager', async ({ page }) => {
    await page.goto('/staff')
    await expect(page.getByRole('heading', { name: /staff & access/i })).toBeVisible()
    await expect(page.getByText('Priya Shah')).toBeVisible()
    await expect(page.getByText('Bea Manager')).toBeVisible()
  })

  test('opening the row actions menu for the non-last-owner member shows "Remove from team"', async ({ page }) => {
    await page.goto('/staff')
    await expect(page.getByText('Bea Manager')).toBeVisible()

    await page.getByRole('button', { name: /actions for bea manager/i }).click()
    const removeItem = page.getByRole('menuitem', { name: /remove from team/i })
    await expect(removeItem).toBeVisible()
  })

  test('clicking "Remove from team" opens the confirm dialog with the member name; Cancel closes it', async ({
    page,
  }) => {
    await page.goto('/staff')
    await expect(page.getByText('Bea Manager')).toBeVisible()

    await page.getByRole('button', { name: /actions for bea manager/i }).click()
    await page.getByRole('menuitem', { name: /remove from team/i }).click()

    const dialog = page.getByTestId('staff-confirm')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText('Remove Bea Manager from the team?')).toBeVisible()

    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByTestId('staff-confirm')).toHaveCount(0)
  })
})
