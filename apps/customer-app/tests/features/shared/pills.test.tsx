import React from 'react'
import { render } from '@testing-library/react-native'
import { SavePill } from '@/features/shared/SavePill'
import { VoucherCountPill } from '@/features/shared/VoucherCountPill'
import { OpenStatusBadge } from '@/features/shared/OpenStatusBadge'
import { StarRating } from '@/features/shared/StarRating'

describe('SavePill', () => {
  it('renders saving amount with pound sign', () => {
    const { getByText } = render(<SavePill amount={15} />)
    expect(getByText('Save up to £15')).toBeTruthy()
  })

  it('returns null when amount is null', () => {
    const { toJSON } = render(<SavePill amount={null} />)
    expect(toJSON()).toBeNull()
  })
})

describe('VoucherCountPill', () => {
  it('renders voucher count', () => {
    const { getByText } = render(<VoucherCountPill count={3} />)
    expect(getByText('3 vouchers')).toBeTruthy()
  })

  it('renders singular for count 1', () => {
    const { getByText } = render(<VoucherCountPill count={1} />)
    expect(getByText('1 voucher')).toBeTruthy()
  })
})

describe('OpenStatusBadge', () => {
  it('renders Open text when isOpen is true', () => {
    const { getByText } = render(<OpenStatusBadge isOpen={true} />)
    expect(getByText('Open')).toBeTruthy()
  })

  it('renders Closed text when isOpen is false', () => {
    const { getByText } = render(<OpenStatusBadge isOpen={false} />)
    expect(getByText('Closed')).toBeTruthy()
  })
})

describe('StarRating', () => {
  it('renders rating and count', () => {
    const { getByText } = render(<StarRating rating={4.5} count={128} />)
    expect(getByText('4.5')).toBeTruthy()
    expect(getByText('(128)')).toBeTruthy()
  })

  it('returns null when rating is null', () => {
    const { toJSON } = render(<StarRating rating={null} count={0} />)
    expect(toJSON()).toBeNull()
  })
})
