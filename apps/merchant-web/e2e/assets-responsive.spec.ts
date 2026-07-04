/**
 * PR-G1b journey 5: static assets/favicon + responsive shell.
 * Pins the shell-wave middleware fix (static assets must NOT be gated: the
 * favicon for logged-out visitors, and the next/image optimizer's cookie-less
 * upstream fetch of the sidebar logo) and the narrow-viewport shell.
 *
 * Guards + unmatched-tracker assertions are automatic via ./support/fixtures.
 */
import { test, expect } from './support/fixtures'
import { BASE_URL } from './support/mocks'

test.describe('logged out', () => {
  test.use({ authenticated: false })

  test('favicon + brand mark are served WITHOUT a session (middleware asset exemption)', async ({ page }) => {
    // page.request bypasses route mocks and hits the real local server only.
    const icon = await page.request.get(`${BASE_URL}/icon.png`, { maxRedirects: 0 })
    expect(icon.status(), '/icon.png must not redirect to /sign-in').toBe(200)
    expect(icon.headers()['content-type']).toContain('image')

    const mark = await page.request.get(`${BASE_URL}/redeemo-r-mark.png`, { maxRedirects: 0 })
    expect(mark.status(), '/redeemo-r-mark.png must not redirect to /sign-in').toBe(200)

    await page.goto('/sign-in')
    const iconLink = page.locator('link[rel~="icon"]').first()
    await expect(iconLink).toHaveAttribute('href', /icon\.png/)
  })
})

test('the sidebar brand mark actually renders through next/image (no broken logo)', async ({ page }) => {
  await page.goto('/')
  const logo = page.getByRole('navigation', { name: 'Primary' }).getByRole('img', { name: 'Redeemo' })
  await expect(logo).toBeVisible()
  // naturalWidth 0 = the optimizer 400'd (the pre-shell-wave regression).
  // Poll: the optimizer's FIRST request after a clean .next build is slow, so
  // the image may still be decoding when the element becomes visible.
  await expect
    .poll(async () => logo.evaluate((el) => (el as HTMLImageElement).naturalWidth), {
      message: 'sidebar logo must decode (optimizer not blocked)',
      timeout: 15_000,
    })
    .toBeGreaterThan(0)
})

test('narrow viewport: drawer + bottom tab bar; wide: collapsible rail', async ({ page }) => {
  // Wide first: hamburger collapses the sidebar to the icon rail.
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/')
  const sidebar = page.getByRole('navigation', { name: 'Primary' })
  await expect(sidebar.getByRole('link', { name: 'Vouchers', exact: true })).toBeVisible()
  await page.getByRole('button', { name: /toggle navigation/i }).click()
  // Collapsed: label text hidden, icon link keeps its accessible name.
  await expect(sidebar.getByText('Vouchers & customers')).toHaveCount(0)
  await expect(sidebar.getByRole('link', { name: 'Vouchers', exact: true })).toBeVisible()
  await page.getByRole('button', { name: /toggle navigation/i }).click()

  // Narrow: bottom tab bar + off-canvas drawer.
  await page.setViewportSize({ width: 500, height: 800 })
  const tabBar = page.getByRole('navigation', { name: 'Quick navigation' })
  await expect(tabBar).toBeVisible()
  await expect(tabBar.getByText('Home')).toBeVisible()
  await expect(tabBar.getByText('Redemptions')).toBeVisible()
  await expect(page.getByText('Redeemo for Business').first()).toBeVisible()
})
