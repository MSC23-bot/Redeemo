import { getOnboardingTaxonomy, setMerchantIdentity } from '@/lib/api/taxonomy'
import * as client from '@/lib/api/client'

jest.mock('@/lib/api/client')
const mockedFetch = client.apiFetch as jest.MockedFunction<typeof client.apiFetch>

describe('taxonomy API', () => {
  beforeEach(() => mockedFetch.mockReset())

  it('getOnboardingTaxonomy parses the nested categories/subcategories/tags shape', async () => {
    mockedFetch.mockResolvedValueOnce({
      categories: [
        {
          id: 'cat-food',
          name: 'Food & Drink',
          parentId: null,
          eligible: true,
          subcategories: [
            {
              id: 'sub-restaurant',
              name: 'Restaurant',
              parentId: 'cat-food',
              tags: [
                { id: 'cui-italian', label: 'Italian', type: 'CUISINE', isPrimaryEligible: true },
                { id: 'spec-brunch', label: 'Brunch', type: 'SPECIALTY', isPrimaryEligible: false },
              ],
            },
          ],
        },
      ],
    })
    const t = await getOnboardingTaxonomy()
    expect(t.categories[0].name).toBe('Food & Drink')
    expect(t.categories[0].subcategories[0].tags[0]).toMatchObject({
      id: 'cui-italian',
      type: 'CUISINE',
      isPrimaryEligible: true,
    })
    expect(mockedFetch).toHaveBeenCalledWith('/api/v1/merchant/onboarding/taxonomy', {
      method: 'GET',
      auth: true,
    })
  })

  it('setMerchantIdentity POSTs the exact { subcategoryId, primaryDescriptorTagId, specialtyTagIds } body', async () => {
    mockedFetch.mockResolvedValueOnce({ id: 'm1' })
    await setMerchantIdentity({
      subcategoryId: 'sub-restaurant',
      primaryDescriptorTagId: 'cui-italian',
      specialtyTagIds: ['spec-brunch', 'cui-french'],
    })
    expect(mockedFetch).toHaveBeenCalledWith('/api/v1/merchant/onboarding/identity', {
      method: 'POST',
      auth: true,
      body: JSON.stringify({
        subcategoryId: 'sub-restaurant',
        primaryDescriptorTagId: 'cui-italian',
        specialtyTagIds: ['spec-brunch', 'cui-french'],
      }),
    })
  })

  it('setMerchantIdentity carries a null primaryDescriptorTagId for non-food', async () => {
    mockedFetch.mockResolvedValueOnce({ id: 'm1' })
    await setMerchantIdentity({
      subcategoryId: 'sub-barber',
      primaryDescriptorTagId: null,
      specialtyTagIds: ['spec-skin-fade'],
    })
    const [, opts] = mockedFetch.mock.calls[0]
    expect(JSON.parse((opts as RequestInit).body as string)).toEqual({
      subcategoryId: 'sub-barber',
      primaryDescriptorTagId: null,
      specialtyTagIds: ['spec-skin-fade'],
    })
  })
})
