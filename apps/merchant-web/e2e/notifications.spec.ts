/**
 * The topbar bell popover opens with route-mocked recent notifications, and
 * the full /notifications page renders the New/Earlier grouping.
 *
 * Guards + unmatched-tracker assertions are automatic via ./support/fixtures.
 */
import { test, expect } from './support/fixtures'
import { notificationFixture } from './support/mocks'

const UNREAD = notificationFixture('n1', {
  title: 'Voucher approved',
  body: 'Your "Free coffee with breakfast" voucher was approved.',
  isRead: false,
})
const READ = notificationFixture('n2', {
  title: 'Application update',
  body: 'Your onboarding application was approved.',
  referenceId: null,
  referenceType: null,
  isRead: true,
  readAt: '2026-06-30T09:00:00.000Z',
})

test.describe('bell popover', () => {
  test.use({ mockOptions: { role: 'OWNER', notifications: [UNREAD, READ] } })

  test('opens and lists the route-mocked recent notifications', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /notifications/i }).click()

    const popover = page.getByRole('menu', { name: 'Notifications' })
    await expect(popover).toBeVisible()
    await expect(popover.getByText('Voucher approved')).toBeVisible()
    await expect(popover.getByText('Application update')).toBeVisible()
  })
})

test.describe('full notifications page', () => {
  test.use({ mockOptions: { role: 'OWNER', notifications: [UNREAD, READ] } })

  test('renders the New/Earlier grouping, unread under New and read under Earlier', async ({ page }) => {
    await page.goto('/notifications')
    await expect(page.getByRole('heading', { name: 'Notifications' })).toBeVisible()

    await expect(page.getByText('New', { exact: true })).toBeVisible()
    await expect(page.getByText('Earlier', { exact: true })).toBeVisible()

    // Anchored regex (^): each row button's accessible name is the full
    // title+timestamp+body text, and the page subtitle ("Application updates,
    // voucher decisions...") also contains "Application update" as a
    // substring, so an unanchored match on the row could resolve ambiguously.
    const unreadRow = page.getByRole('button', { name: /^Voucher approved/ })
    const readRow = page.getByRole('button', { name: /^Application update/ })
    await expect(unreadRow).toBeVisible()
    await expect(readRow).toBeVisible()

    // Each section's <section> ancestor scopes its heading to its own row,
    // pinning the grouping (not just presence of both labels somewhere).
    const newSection = page.locator('section', { hasText: 'New' }).filter({ has: unreadRow })
    const earlierSection = page.locator('section', { hasText: 'Earlier' }).filter({ has: readRow })
    await expect(newSection).toHaveCount(1)
    await expect(earlierSection).toHaveCount(1)
    // The unread row must NOT also land in the Earlier section, and vice versa.
    await expect(page.locator('section', { hasText: 'Earlier' }).filter({ has: unreadRow })).toHaveCount(0)
    await expect(page.locator('section', { hasText: 'New' }).filter({ has: readRow })).toHaveCount(0)
  })
})
