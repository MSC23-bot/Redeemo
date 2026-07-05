/**
 * The voucher-builder EDIT-EXISTING journey in a real browser (V1 parity plan
 * 2026-07-04 deferred this until the smoke lane merged - #365, long since
 * merged). Covers: opening an existing custom DRAFT voucher from /vouchers,
 * opening the Edit builder hydrated with its saved values, the always-resend
 * PATCH contract (an unchanged field still rides along with the changed one),
 * the #373 nullable-clear contract in a REAL browser (imageUrl:null +
 * expiryDate independence), and Cancel firing no PATCH.
 *
 * TIME_LIMITED is the fixture type: non-structured (title/description are
 * plain overrides, no terms-checklist composition to route around), and it
 * carries BOTH a saved photo and a saved end date so cases 1-5 share one
 * fixture cheaply (per the task brief).
 *
 * Guards + unmatched-tracker assertions are automatic via ./support/fixtures.
 */
import { test, expect } from './support/fixtures'
import { voucherDetailFixture } from './support/mocks'

const VOUCHER_ID = 'v-custom-1'

// The curated LIST row (GET /merchant/vouchers) - a distinct, narrower shape
// than the DETAIL row (no merchantFields/availabilityWindows/imageUrl on the
// list per lib/api/voucher.ts customVoucherListRowSchema vs
// customVoucherDetailSchema). estimatedSaving ships as a STRING (Prisma
// Decimal) exactly like the detail row.
const LIST_ROW = {
  id: VOUCHER_ID,
  title: 'Happy hour',
  type: 'TIME_LIMITED',
  status: 'DRAFT',
  approvalStatus: 'PENDING',
  approvalComment: null,
  estimatedSaving: '4.50',
  description: 'Enjoy a discount during happy hour.',
  terms: 'One per visit',
  isRmv: false,
  cooldownSeconds: null,
  publishedAt: null,
  expiryDate: '2026-12-01T00:00:00.000Z',
  approvedAt: null,
  createdAt: '2026-06-19T10:00:00.000Z',
  redemptionCount: 0,
}

test.describe('voucher builder edit journey', () => {
  test.use({
    mockOptions: {
      role: 'OWNER',
      customVouchers: [LIST_ROW],
      voucherDetails: { [VOUCHER_ID]: voucherDetailFixture(VOUCHER_ID) },
    },
  })

  test('case 1: the list renders the custom DRAFT row; opening it shows the detail page with a working Edit affordance that hydrates the builder', async ({
    page,
  }) => {
    await page.goto('/vouchers')
    await expect(page.getByRole('heading', { name: /vouchers/i }).first()).toBeVisible()

    // The flagship section is absent (no flagship fixtures); the custom row renders.
    await expect(page.getByTestId('flagship-section')).toHaveCount(0)
    const row = page.locator('[data-voucher-card][data-voucher-id="v-custom-1"]')
    await expect(row).toBeVisible()
    await expect(row.getByText('Happy hour')).toBeVisible()

    await row.click()
    await expect(page).toHaveURL(/\/vouchers\/v-custom-1$/)
    await expect(page.getByRole('heading', { name: 'Happy hour' })).toBeVisible()

    // The Edit affordance (DRAFT is editable).
    const editButton = page.getByRole('button', { name: /^edit$/i })
    await expect(editButton).toBeVisible()
    await editButton.click()

    await expect(page.getByRole('heading', { name: 'Edit voucher' })).toBeVisible()
    // Hydration: description (title has no direct input in the day-2 builder -
    // it is composed/derived, so the description textarea is the field the
    // builder actually exposes for direct editing), saved photo (Remove photo
    // present, proving state.imageUrl === savedImageUrl), and the saved end
    // date ticked.
    await expect(page.getByPlaceholder(/why they will love this offer/i)).toHaveValue(
      'Enjoy a discount during happy hour.',
    )
    await expect(page.getByRole('button', { name: /remove photo/i })).toBeVisible()
    const endDateBox = page.getByRole('checkbox', { name: /ends on a date/i })
    await expect(endDateBox).toBeChecked()
    await expect(page.getByLabel(/^end date$/i)).toHaveValue('2026-12-01')
  })

  test('case 2: editing the description and saving PATCHes with the changed description AND resends the unchanged saved values (always-resend contract)', async ({
    page,
  }) => {
    await page.goto('/vouchers/v-custom-1')
    await expect(page.getByRole('heading', { name: 'Happy hour' })).toBeVisible()
    await page.getByRole('button', { name: /^edit$/i }).click()
    await expect(page.getByRole('heading', { name: 'Edit voucher' })).toBeVisible()

    const descriptionInput = page.getByPlaceholder(/why they will love this offer/i)
    await descriptionInput.fill('Now with an extra hour of happy hour.')

    const patchRequest = page.waitForRequest(
      (req) => req.method() === 'PATCH' && req.url().includes('/api/v1/merchant/vouchers/v-custom-1'),
    );
    await page.getByRole('button', { name: /save as draft/i }).click()
    const req = await patchRequest
    const body = JSON.parse(req.postData() ?? '{}')

    // The changed field.
    expect(body.description).toBe('Now with an extra hour of happy hour.')
    // The always-resend contract: unchanged saved values still ride along even
    // though only the description was touched in this session.
    expect(body.title).toBe('Happy hour')
    expect(body.estimatedSaving).toBe(4.5)
    expect(body.imageUrl).toBe('https://cdn.example/saved.png')
    expect(body.expiryDate).toBe('2026-12-01T00:00:00.000Z')
    expect(body.type).toBe('TIME_LIMITED')

    // The save succeeds and returns to the (refetched) detail view.
    await expect(page.getByRole('heading', { name: 'Edit voucher' })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Happy hour' })).toBeVisible()
  })

  test('case 3: nullable-clear - removing the saved photo sends imageUrl:null while expiryDate keeps its saved value (independence)', async ({
    page,
  }) => {
    await page.goto('/vouchers/v-custom-1')
    await expect(page.getByRole('heading', { name: 'Happy hour' })).toBeVisible()
    await page.getByRole('button', { name: /^edit$/i }).click()
    await expect(page.getByRole('heading', { name: 'Edit voucher' })).toBeVisible()

    const removePhoto = page.getByRole('button', { name: /remove photo/i })
    await expect(removePhoto).toBeVisible()
    await removePhoto.click()
    // The control flips to the "no photo" state (Remove photo control disappears).
    await expect(page.getByRole('button', { name: /remove photo/i })).toHaveCount(0)

    const patchRequest = page.waitForRequest(
      (req) => req.method() === 'PATCH' && req.url().includes('/api/v1/merchant/vouchers/v-custom-1'),
    );
    await page.getByRole('button', { name: /save as draft/i }).click()
    const req = await patchRequest
    const raw = req.postData() ?? ''

    // Assert the RAW body string carries the LITERAL null (not the string "null",
    // not an omitted key) - the exact wire assertion the nullable-clear contract
    // depends on.
    expect(raw).toContain('"imageUrl":null')

    const body = JSON.parse(raw)
    expect(body.imageUrl).toBeNull()
    // Independence: the untouched expiryDate keeps its saved value, not cleared
    // as a side effect of the photo clear.
    expect(body.expiryDate).toBe('2026-12-01T00:00:00.000Z')
  })

  test('case 4: Cancel from the builder fires no PATCH', async ({ page }) => {
    await page.goto('/vouchers/v-custom-1')
    await expect(page.getByRole('heading', { name: 'Happy hour' })).toBeVisible()
    await page.getByRole('button', { name: /^edit$/i }).click()
    await expect(page.getByRole('heading', { name: 'Edit voucher' })).toBeVisible()

    // Make an edit, then cancel instead of saving - no PATCH must fire.
    await page.getByPlaceholder(/why they will love this offer/i).fill('This edit should never be sent')

    let patchFired = false
    page.on('request', (req) => {
      if (req.method() === 'PATCH' && req.url().includes('/api/v1/merchant/vouchers/v-custom-1')) {
        patchFired = true
      }
    })

    await page.getByRole('button', { name: /^cancel$/i }).click()
    await expect(page.getByRole('heading', { name: 'Edit voucher' })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Happy hour' })).toBeVisible()

    // Give any accidental in-flight request a beat to have fired.
    await page.waitForTimeout(250)
    expect(patchFired).toBe(false)
  })

  test('case 5: unticking the saved end date sends expiryDate:null while the unchanged photo keeps its saved value (independence)', async ({
    page,
  }) => {
    await page.goto('/vouchers/v-custom-1')
    await expect(page.getByRole('heading', { name: 'Happy hour' })).toBeVisible()
    await page.getByRole('button', { name: /^edit$/i }).click()
    await expect(page.getByRole('heading', { name: 'Edit voucher' })).toBeVisible()

    const endDateBox = page.getByRole('checkbox', { name: /ends on a date/i })
    await expect(endDateBox).toBeChecked()
    await endDateBox.click()
    await expect(endDateBox).not.toBeChecked()

    const patchRequest = page.waitForRequest(
      (req) => req.method() === 'PATCH' && req.url().includes('/api/v1/merchant/vouchers/v-custom-1'),
    );
    await page.getByRole('button', { name: /save as draft/i }).click()
    const req = await patchRequest
    const raw = req.postData() ?? ''

    expect(raw).toContain('"expiryDate":null')

    const body = JSON.parse(raw)
    expect(body.expiryDate).toBeNull()
    // Independence: the untouched saved photo keeps its saved value.
    expect(body.imageUrl).toBe('https://cdn.example/saved.png')
  })
})
