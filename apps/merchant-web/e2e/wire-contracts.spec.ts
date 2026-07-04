/**
 * PR-G1b journey 2: wire-accurate contract rendering (the #327 class).
 * #327 shipped because unit tests mocked apiFetch with TYPED values while the
 * real wire carries Prisma Decimal fields as JSON STRINGS (branch
 * latitude/longitude, redemption estimatedSaving); z.coerce is the fix, and
 * this spec pins it against the REAL parse path in a real browser.
 */
import { test, expect } from '@playwright/test'
import { installMockApi, signIn, attachErrorGuards, redemptionFixture } from './support/mocks'

test('branch detail renders with Decimal-as-string latitude/longitude (no parse crash)', async ({ page, context }) => {
  // branchFixture ships latitude: "53.645792" / longitude: "-1.785035" as strings.
  const tracker = await installMockApi(context, { role: 'OWNER' })
  await signIn(context)
  const guards = attachErrorGuards(page)

  await page.goto('/branches/b1')
  await expect(page.getByRole('heading', { name: 'Old Foundry' })).toBeVisible()
  // The page parsed (zod coerce) rather than erroring: detail cards render.
  await expect(page.getByTestId('branch-pin-card')).toBeVisible()
  await expect(page.getByText('12 Foundry Street').first()).toBeVisible()
  guards.assertClean()
  expect(tracker.unmatched, 'unmocked API calls').toEqual([])
})

test('redemptions log renders with Decimal-as-string estimatedSaving', async ({ page, context }) => {
  const tracker = await installMockApi(context, {
    role: 'OWNER',
    redemptions: [redemptionFixture('r1', { estimatedSaving: '4.50' })],
  })
  await signIn(context)
  const guards = attachErrorGuards(page)

  await page.goto('/redemptions')
  await expect(page.getByText('Free coffee with breakfast')).toBeVisible()
  await expect(page.getByText('Sarah K.')).toBeVisible()
  // The string "4.50" parsed to a number and rendered as a formatted saving.
  await expect(page.getByText(/4\.50/)).toBeVisible()
  guards.assertClean()
  expect(tracker.unmatched, 'unmocked API calls').toEqual([])
})
