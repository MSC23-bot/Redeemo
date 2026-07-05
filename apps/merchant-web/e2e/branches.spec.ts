/**
 * The Branches module (list + detail) in a real browser. The module carries 253+
 * jest tests but zero real-browser journeys before this spec - this closes that gap
 * for the advisory Playwright smoke lane.
 *
 * Covers: the overview list (summary cards, Setup column PIN/amenity signals, Main
 * indicator, row-click navigation), the full detail section stack rendering with
 * Decimal-as-string lat/lng (the #327 class) without a parse crash, the on-demand PIN
 * reveal contract (never fetched before the click), the #377 wire-hygiene bridge
 * (an older-backend payload that omits `redemptionPinSet` but still carries the legacy
 * `redemptionPin` ciphertext must still read as PIN-set), and a cheap Contact-card
 * edit/cancel affordance (no PATCH on Cancel, matching the vouchers-builder-edit
 * pattern).
 *
 * Role scope (load-bearing): every case here uses the OWNER role fixture only.
 * PR #381 (open at the time this spec was written) changes BM/STAFF gating on these
 * pages; this spec must stay green whether or not it merges, so it makes no
 * assertion about BM/STAFF visibility of any branch control.
 *
 * Guards + unmatched-tracker assertions are automatic via ./support/fixtures.
 */
import { test, expect } from './support/fixtures'
import { branchFixture } from './support/mocks'

test.describe('branches overview list', () => {
  test.use({
    mockOptions: {
      role: 'OWNER',
      branches: [
        branchFixture('b1', {
          amenities: [
            { amenity: { id: 'a1', name: 'Wi-Fi' } },
            { amenity: { id: 'a2', name: 'Parking' } },
          ],
          // redemptionPinSet: true (fixture default) - Setup column reads "PIN".
        }),
        branchFixture('b2', {
          redemptionPinSet: false, // Setup column reads "No PIN".
          // amenities: [] (fixture default) - Setup column reads "0".
        }),
      ],
    },
  })

  test('renders the scoped list, summary cards, per-row Setup signals and the main-branch indicator; a row click navigates to detail', async ({
    page,
  }) => {
    await page.goto('/branches')
    await expect(page.getByRole('heading', { name: 'Branches', exact: true })).toBeVisible()

    // Summary cards, derived from the two-branch fixture list (openingHours: [] on
    // both branches means "Open right now" is deterministically 0 regardless of
    // wall-clock time; "With Redeemo" is 2 since both are isActive + MANUALLY_CONFIRMED
    // and the OWNER profile fixture is merchant-lifecycle ACTIVE/"Live").
    await expect(page.getByTestId('summary-locations').getByText('2')).toBeVisible()
    await expect(page.getByTestId('summary-open-now').getByText('0')).toBeVisible()
    await expect(page.getByTestId('summary-with-redeemo').getByText('2')).toBeVisible()

    // Row 1 (b1, main, PIN set, 2 amenities).
    const mainRow = page.getByRole('button', { name: 'Old Foundry' })
    await expect(mainRow).toBeVisible()
    await expect(mainRow.getByText('Main', { exact: true })).toBeVisible()
    await expect(mainRow.getByText('PIN', { exact: true })).toBeVisible()
    await expect(mainRow.getByText('2', { exact: true })).toBeVisible()

    // Row 2 (b2, not main, PIN not set, 0 amenities).
    const secondRow = page.getByRole('button', { name: 'Riverside' })
    await expect(secondRow).toBeVisible()
    await expect(secondRow.getByText('Main', { exact: true })).toHaveCount(0)
    await expect(secondRow.getByText('No PIN')).toBeVisible()
    await expect(secondRow.getByText('0', { exact: true })).toBeVisible()

    // Row click navigates to the detail page (client-side nav via router.push).
    await mainRow.click()
    await expect(page).toHaveURL(/\/branches\/b1$/)
  })
})

test.describe('branch detail full section stack (OWNER)', () => {
  test.use({ mockOptions: { role: 'OWNER' } })

  test('renders the whole section stack with Decimal-as-string lat/lng and no crash', async ({ page }) => {
    // branchFixture ships latitude: "53.645792" / longitude: "-1.785035" as STRINGS
    // (Prisma Decimal on the wire, the #327 class) - the page must parse (zod
    // coerce) rather than error, and every section card must mount.
    await page.goto('/branches/b1')

    // Header.
    await expect(page.getByRole('heading', { name: 'Old Foundry' })).toBeVisible()
    await expect(page.getByTestId('main-branch-badge')).toBeVisible()
    await expect(page.getByTestId('branch-status-pill')).toBeVisible()

    // Branch details (identity, read-only + Edit).
    await expect(page.getByTestId('branch-details-card').getByRole('heading', { name: 'Branch details' })).toBeVisible()
    await expect(page.getByText('12 Foundry Street').first()).toBeVisible()

    // Location (placeholder, no network, no crash on the Decimal-as-string coords).
    await expect(page.getByTestId('branch-location-card').getByRole('heading', { name: 'Location on the map' })).toBeVisible()
    await expect(page.getByTestId('branch-map-placeholder')).toBeVisible()
    await expect(page.getByTestId('location-confidence-badge')).toHaveText(/Location confirmed/)

    // Contact.
    await expect(page.getByTestId('branch-contact-card').getByRole('heading', { name: 'Contact' })).toBeVisible()
    await expect(page.getByText('01484 000000')).toBeVisible()

    // Opening hours.
    await expect(page.getByTestId('branch-hours-card').getByRole('heading', { name: 'Opening hours' })).toBeVisible()

    // PIN (masked by default).
    await expect(page.getByTestId('branch-pin-card').getByRole('heading', { name: 'Redemption PIN' })).toBeVisible()
    await expect(page.getByTestId('branch-pin-masked')).toBeVisible()

    // Redemption alerts.
    await expect(page.getByTestId('branch-alerts-card').getByRole('heading', { name: 'Redemption alerts' })).toBeVisible()

    // Amenities.
    await expect(page.getByTestId('branch-amenities-card').getByRole('heading', { name: 'Amenities' })).toBeVisible()

    // Branding and photos.
    await expect(page.getByTestId('branch-branding-card').getByRole('heading', { name: 'Branding and photos' })).toBeVisible()

    // Staff at this branch (owner-only; renders from the default members fixture).
    await expect(page.getByRole('heading', { name: 'Staff at this branch' })).toBeVisible()

    // Close section (owner-only; b1 is the main branch, so the close button is
    // present but disabled with the "make another main first" copy).
    await expect(page.getByTestId('branch-close-section')).toBeVisible()
    await expect(page.getByText('Permanently close this branch')).toBeVisible()
  })
})

test.describe('PIN reveal journey (OWNER)', () => {
  test.use({ mockOptions: { role: 'OWNER', branchPins: { b1: '1234' } } })

  test('the decrypted PIN is fetched and shown only after the Reveal click, never before', async ({ page }) => {
    let pinRequestFired = false
    page.on('request', (req) => {
      if (req.url().includes('/api/v1/merchant/branches/b1/pin')) pinRequestFired = true
    })

    await page.goto('/branches/b1')
    await expect(page.getByTestId('branch-pin-card')).toBeVisible()
    await expect(page.getByTestId('branch-pin-masked')).toBeVisible()

    // Give any accidental prefetch a beat to have fired before we click.
    await page.waitForTimeout(250)
    expect(pinRequestFired, '/pin must not be requested before Reveal is clicked').toBe(false)

    const pinResponse = page.waitForResponse(
      (res) => res.url().includes('/api/v1/merchant/branches/b1/pin') && res.status() === 200,
    )
    await page.getByRole('button', { name: /^reveal$/i }).click()
    await pinResponse

    expect(pinRequestFired).toBe(true)
    await expect(page.getByTestId('branch-pin-value')).toHaveText('1234')
    await expect(page.getByTestId('branch-pin-masked')).toHaveCount(0)
  })
})

test.describe('#377 legacy PIN-skew wire bridge (older backend, no redemptionPinSet)', () => {
  test.use({
    mockOptions: {
      role: 'OWNER',
      branches: [
        branchFixture('b1', {
          // Simulates an OLDER backend during Vercel/Railway deploy skew: the
          // `redemptionPinSet` key is entirely ABSENT from the wire payload (not
          // merely false - `undefined` here makes JSON.stringify omit the key), but
          // the legacy ciphertext field is still present. lib/branches/pinSet.ts
          // must fall back to presence-only detection and still read PIN-set.
          redemptionPinSet: undefined,
          redemptionPin: 'ENC:legacy-ciphertext-blob==',
        }),
        branchFixture('b2'),
      ],
    },
  })

  test('the list Setup column and the detail PIN card both read PIN-set via the presence-only fallback', async ({
    page,
  }) => {
    await page.goto('/branches')
    const row = page.getByRole('button', { name: 'Old Foundry' })
    await expect(row.getByText('PIN', { exact: true })).toBeVisible()
    await expect(row.getByText('No PIN')).toHaveCount(0)

    await page.goto('/branches/b1')
    await expect(page.getByTestId('branch-pin-masked')).toBeVisible()
    await expect(page.getByText('No PIN set yet')).toHaveCount(0)
  })
})

test.describe('Contact card edit affordance (OWNER)', () => {
  test.use({ mockOptions: { role: 'OWNER' } })

  test('Edit opens the instant-save form; Cancel discards the draft and fires no PATCH', async ({ page }) => {
    await page.goto('/branches/b1')
    const contactCard = page.getByTestId('branch-contact-card')
    await expect(contactCard.getByRole('heading', { name: 'Contact' })).toBeVisible()

    await contactCard.getByRole('button', { name: /^edit$/i }).click()
    const phoneInput = page.getByLabel('Phone', { exact: true })
    await expect(phoneInput).toBeVisible()
    await phoneInput.fill('+44 7700 900123')

    let patchFired = false
    page.on('request', (req) => {
      if (req.method() === 'PATCH' && req.url().endsWith('/api/v1/merchant/branches/b1')) {
        patchFired = true
      }
    })

    await contactCard.getByRole('button', { name: /^cancel$/i }).click()

    // Back to the read-only view: the Edit button is back, the form is gone, and the
    // original saved phone number still renders (the draft was discarded).
    await expect(contactCard.getByRole('button', { name: /^edit$/i })).toBeVisible()
    await expect(phoneInput).toHaveCount(0)
    await expect(page.getByText('01484 000000')).toBeVisible()

    // Give any accidental in-flight request a beat to have fired.
    await page.waitForTimeout(250)
    expect(patchFired).toBe(false)
  })
})
