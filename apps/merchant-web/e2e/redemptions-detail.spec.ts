/**
 * The Redemptions DETAIL surface (M3 F3, a dialog opened by a row click on the
 * Redemptions log - there is no separate /redemptions/[id] route) and the shared
 * two-step Validate-a-code dialog (M3 F2, reachable from BOTH the topbar global
 * action and the Redemptions page's own action) in a real browser.
 *
 * redemptions-filters.spec.ts already covers the LIST page's Voucher/Sort/Search
 * filters and the Promise.allSettled partial-voucher-source resilience - this spec
 * does not repeat any of that. It covers: the detail dialog rendering a full
 * merchant-safe row (including a Decimal-as-string `estimatedSaving`, the #327
 * regression class) with no customer contact info ever rendered; the
 * Validate-a-code entry -> preview -> done
 * state machine, including the exact lookup-before-verify request sequence; the
 * already-validated preview (no confirm step, no verify POST); the not-found
 * preview (error copy, no verify POST); and the client-side code-format guard that
 * blocks the network entirely before any request is made.
 *
 * Role scope (load-bearing): every case here uses the OWNER role fixture only.
 * PR #381 (open at the time this spec was written) changes BM/STAFF gating on
 * these surfaces; this spec must stay green whether or not it merges, so it makes
 * no assertion about BM/STAFF visibility of any control.
 *
 * Surface note (adapted from the task brief): there is no /redemptions/[id] page
 * to navigate to and "back" from - RedemptionDetail is a dialog the list page
 * mounts conditionally (`{selected && <RedemptionDetail .../>}`). "Navigation" is
 * therefore covered as: (a) a row click opens the dialog over the still-mounted
 * list, and Close unmounts it back to the list; (b) Validate-a-code is opened from
 * the topbar on a page OTHER than /redemptions (the Home page) to prove the shared
 * ValidateDialogProvider mount is global, not page-local, matching its own header
 * comment ("both the topbar global action and the Redemptions page action open the
 * SAME dialog").
 *
 * Guards + unmatched-tracker assertions are automatic via ./support/fixtures.
 */
import { test, expect } from './support/fixtures'
import { redemptionFixture } from './support/mocks'

test.describe('redemption detail dialog (M3 F3)', () => {
  test.use({
    mockOptions: {
      role: 'OWNER',
      redemptions: [
        redemptionFixture('r1', {
          estimatedSaving: '12.50', // STRING on the wire (Prisma Decimal, #327 class)
          // NOTE (surprise, verified against the real source - not asserted
          // below): RedemptionDetail.tsx conditionally renders
          // voucher.description/voucher.terms "when the backend payload
          // carries them", but lib/api/redemptions.ts's redemptionRowSchema
          // only puts .passthrough() on the OUTER object; the nested
          // `voucher: z.object({ id, title, type })` has no .passthrough(),
          // so zod's default `strip` behaviour silently drops description/
          // terms during parse. Verified empirically (a fixture carrying
          // both fields renders neither). That UI branch is effectively dead
          // code today - a real production finding, out of this slice's
          // zero-production-file-change scope to fix.
          voucher: { id: 'v1', title: 'Free coffee with breakfast', type: 'FREEBIE' },
        }),
      ],
    },
  })

  test('renders the full merchant-safe row from a row click, parses the Decimal-string saving, and never renders customer contact info', async ({
    page,
  }) => {
    await page.goto('/redemptions')
    const row = page.locator('tbody tr', { hasText: 'Free coffee with breakfast' })
    await expect(row).toBeVisible()
    await row.click()

    const dialog = page.getByRole('dialog', { name: 'Redemption detail' })
    await expect(dialog).toBeVisible()

    await expect(dialog.getByRole('heading', { name: 'Free coffee with breakfast' })).toBeVisible()
    await expect(dialog.getByText('Freebie')).toBeVisible()
    // Scoped to <header>: the "Validated" status pill lives there, distinct from
    // the "Validated" DetailRow LABEL further down (same exact text, different
    // element) - an unscoped getByText would resolve ambiguously (strict mode).
    await expect(dialog.locator('header').getByText('Validated', { exact: true })).toBeVisible()
    await expect(dialog.getByText('A7K2 P9X4')).toBeVisible()
    await expect(dialog.getByText('Sarah K.')).toBeVisible()
    await expect(dialog.getByText('Old Foundry')).toBeVisible()
    // The Decimal-as-string saving parsed and formatted without a crash (the
    // #327 regression class - a raw ".toFixed on a string" would have thrown,
    // and the auto guards fixture would fail this test on the resulting
    // pageerror even if this specific text assertion were skipped).
    await expect(dialog.getByText('£12.50')).toBeVisible()
    await expect(dialog.getByText('MANUAL')).toBeVisible()
    await expect(dialog.getByText('Validated in the portal')).toBeVisible()

    // Privacy: the curated row never carries email/phone, and this dialog never
    // renders any (no @ sign, no UK mobile/international phone pattern).
    const text = (await dialog.textContent()) ?? ''
    expect(text).not.toMatch(/@|07\d{9}|\+44/)

    await dialog.getByRole('button', { name: 'Close' }).click()
    await expect(page.getByRole('dialog', { name: 'Redemption detail' })).toHaveCount(0)
    // Closing the dialog returns to the still-mounted list (no navigation happened).
    await expect(row).toBeVisible()
  })
})

test.describe('validate-a-code (M3 F2): happy path two-step confirm', () => {
  test.use({
    mockOptions: {
      role: 'OWNER',
      lookupResult: redemptionFixture('r2', {
        status: 'AWAITING_VALIDATION',
        validatedAt: null,
        validationMethod: null,
        validatedByLabel: null,
        estimatedSaving: '3.50',
      }),
      verifyResponse: { id: 'r2', isValidated: true },
    },
  })

  test('opens from the topbar on the Home page, previews, confirms, and pins the lookup-before-verify request order', async ({
    page,
  }) => {
    // Home page, NOT /redemptions - proves the dialog is reachable from the
    // shared topbar mount everywhere in the shell, not only the Redemptions page.
    await page.goto('/')

    const order: string[] = []
    page.on('request', (req) => {
      if (req.url().includes('/api/v1/merchant/redemptions/lookup')) order.push('lookup')
      if (req.method() === 'POST' && req.url().includes('/api/v1/redemption/verify')) order.push('verify')
    })

    const banner = page.getByRole('banner')
    await banner.getByRole('button', { name: 'Validate a code' }).click()

    const dialog = page.getByRole('dialog', { name: 'Validate a code' })
    await expect(dialog).toBeVisible()

    const codeInput = dialog.getByLabel('Redemption code')
    await codeInput.fill('a7k2p9x4')
    await expect(codeInput).toHaveValue('A7K2 P9X4')

    const lookupRequest = page.waitForRequest(
      (req) => req.url().includes('/api/v1/merchant/redemptions/lookup') && req.url().includes('code=A7K2P9X4'),
    )
    await dialog.getByRole('button', { name: 'Look up code' }).click()
    await lookupRequest
    expect(order).toEqual(['lookup'])

    // Preview step: an awaiting-validation match, so Confirm is offered and no
    // verify POST has fired yet. Positive assertions run FIRST so the preview
    // has demonstrably settled before the negative "already validated" check;
    // asserting the absence pre-settle could false-pass against a regression
    // whose render simply had not landed yet.
    await expect(dialog.getByText('Free coffee with breakfast')).toBeVisible()
    await expect(dialog.getByText('A7K2 P9X4')).toBeVisible()
    await expect(dialog.getByText('Sarah K.')).toBeVisible()
    await expect(dialog.getByText('£3.50')).toBeVisible()
    await expect(dialog.getByText('This code is already validated.')).toHaveCount(0)
    expect(order).toEqual(['lookup'])

    const verifyRequest = page.waitForRequest(
      (req) => req.method() === 'POST' && req.url().includes('/api/v1/redemption/verify'),
    )
    await dialog.getByRole('button', { name: 'Confirm redemption' }).click()
    const req = await verifyRequest
    expect(JSON.parse(req.postData() ?? '{}')).toEqual({ code: 'A7K2P9X4', method: 'MANUAL' })
    // The two-step gate: verify only ever fires AFTER lookup, never before/instead.
    expect(order).toEqual(['lookup', 'verify'])

    await expect(dialog.getByText('Validated', { exact: true })).toBeVisible()
    await expect(dialog.getByText(/is now validated/)).toBeVisible()

    await dialog.getByRole('button', { name: 'Done' }).click()
    await expect(page.getByRole('dialog', { name: 'Validate a code' })).toHaveCount(0)
  })
})

test.describe('validate-a-code: already-validated path (no confirm step, no verify POST)', () => {
  test.use({
    mockOptions: {
      role: 'OWNER',
      lookupResult: redemptionFixture('r3', {
        status: 'VALIDATED',
        validationMethod: 'MANUAL',
        validatedByLabel: 'Validated in the portal',
      }),
    },
  })

  test('shows the already-validated preview with no Confirm action, and never POSTs verify', async ({ page }) => {
    await page.goto('/redemptions')

    let verifyFired = false
    page.on('request', (req) => {
      if (req.method() === 'POST' && req.url().includes('/api/v1/redemption/verify')) verifyFired = true
    })

    // The Redemptions page's OWN Validate-a-code action this time (distinct from
    // the topbar one covered above) - scoped to <main> since the topbar's
    // identical-copy button lives outside it (it is not a <main> descendant).
    await page.locator('main').getByRole('button', { name: /validate a code/i }).click()

    const dialog = page.getByRole('dialog', { name: 'Validate a code' })
    await dialog.getByLabel('Redemption code').fill('a7k2p9x4')
    await dialog.getByRole('button', { name: 'Look up code' }).click()

    await expect(dialog.getByText('This code is already validated.')).toBeVisible()
    await expect(dialog.getByText('Validated in the portal')).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Confirm redemption' })).toHaveCount(0)

    await dialog.getByRole('button', { name: 'Done' }).click()
    await expect(page.getByRole('dialog', { name: 'Validate a code' })).toHaveCount(0)

    expect(verifyFired).toBe(false)
  })
})

test.describe('validate-a-code: not-found path (error copy, no verify POST)', () => {
  test.use({
    mockOptions: { role: 'OWNER' }, // lookupResult/lookupError both omitted -> masked 404 default
    // The forced 404 makes Chromium log a devtools "Failed to load resource"
    // console line for that one fetch - expected noise from the deliberate
    // not-found path this test pins (same class of expectation as the forced-500
    // resilience case in redemptions-filters.spec.ts), not an app bug.
    expectedConsoleErrors: [
      { urlSubstring: '/api/v1/merchant/redemptions/lookup', textSubstring: 'Failed to load resource', count: 1 },
    ],
  })

  test('an unrecognised code shows the not-found message and stays on the entry step', async ({ page }) => {
    await page.goto('/redemptions')

    let verifyFired = false
    page.on('request', (req) => {
      if (req.method() === 'POST' && req.url().includes('/api/v1/redemption/verify')) verifyFired = true
    })

    await page.locator('main').getByRole('button', { name: /validate a code/i }).click()
    const dialog = page.getByRole('dialog', { name: 'Validate a code' })
    await dialog.getByLabel('Redemption code').fill('zzzzzzzz')

    const lookupRequest = page.waitForRequest((req) => req.url().includes('/api/v1/merchant/redemptions/lookup'))
    await dialog.getByRole('button', { name: 'Look up code' }).click()
    await lookupRequest

    await expect(dialog.getByText('No redemption found for that code. Check it and try again.')).toBeVisible()
    // Still on the entry step (no preview rendered, code input still present).
    await expect(dialog.getByLabel('Redemption code')).toBeVisible()
    expect(verifyFired).toBe(false)
  })
})

test.describe('validate-a-code: client-side code-format guard blocks the network entirely', () => {
  test.use({ mockOptions: { role: 'OWNER' } })

  test('a too-short code shows a format error and makes NO request at all', async ({ page }) => {
    await page.goto('/redemptions')

    let lookupFired = false
    page.on('request', (req) => {
      if (req.url().includes('/api/v1/merchant/redemptions/lookup')) lookupFired = true
    })

    await page.locator('main').getByRole('button', { name: /validate a code/i }).click()
    const dialog = page.getByRole('dialog', { name: 'Validate a code' })
    await dialog.getByLabel('Redemption code').fill('a7k2')
    await dialog.getByRole('button', { name: 'Look up code' }).click()

    await expect(dialog.getByText('Enter the 8-character code (letters and numbers).')).toBeVisible()
    // Give any accidental in-flight request a beat to have fired.
    await page.waitForTimeout(250)
    expect(lookupFired).toBe(false)
  })
})
