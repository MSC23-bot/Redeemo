import React from 'react'
import { render } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RedemptionDetailsCard } from '@/features/voucher/components/RedemptionDetailsCard'
import { redemptionApi } from '@/lib/api/redemption'

jest.mock('@/lib/api/redemption', () => ({
  redemptionApi: { getMyRedemptionByCode: jest.fn() },
}))

jest.mock('expo-router', () => ({
  useFocusEffect: (cb: () => () => void) => {
    const React = require('react')
    React.useEffect(cb, [])
  },
}))

const wrap = (ui: React.ReactElement) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

describe('RedemptionDetailsCard', () => {
  beforeEach(() => jest.clearAllMocks())

  it('pre-validation: shows QR + formatted code', async () => {
    ;(redemptionApi.getMyRedemptionByCode as jest.Mock).mockResolvedValue({
      code: 'K3F9P7', isValidated: false, validatedAt: null, validationMethod: null,
      voucherId: 'v1', merchantName: 'Acme', branchName: 'Shoreditch',
    })
    const { findByText, getByLabelText } = wrap(
      <RedemptionDetailsCard redemptionCode="K3F9P7" branchName="Shoreditch" redeemedAt="2026-04-22T13:00:00Z" />
    )
    expect(await findByText('K3F 9P7')).toBeTruthy()
    expect(getByLabelText('Redemption code. K, 3, F, 9, P, 7.')).toBeTruthy()
  })

  it('post-validation: hides QR and shows "Validated on ..." (from server state, not props)', async () => {
    ;(redemptionApi.getMyRedemptionByCode as jest.Mock).mockResolvedValue({
      code: 'K3F9P7', isValidated: true, validatedAt: '2026-04-22T14:00:00Z',
      validationMethod: 'QR_SCAN', voucherId: 'v1', merchantName: 'Acme', branchName: 'Shoreditch',
    })
    const { findByText, queryByLabelText } = wrap(
      <RedemptionDetailsCard redemptionCode="K3F9P7" branchName="Shoreditch" redeemedAt="2026-04-22T13:00:00Z" />
    )
    expect(await findByText(/Validated on/i)).toBeTruthy()
    expect(queryByLabelText('Redemption code. K, 3, F, 9, P, 7.')).toBeNull()
  })
})
