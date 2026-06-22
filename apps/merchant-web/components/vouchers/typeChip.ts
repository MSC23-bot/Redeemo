import type { VoucherType as ChipType } from '@/components/ui/chip'

// Day-2 Vouchers B3/B4: map the backend VoucherType enum to the Chip component's
// type union + a human label. Centralised so the card + detail agree.

export function toChipType(enumType: string): ChipType {
  switch (enumType) {
    case 'BOGO':
      return 'bogo'
    case 'SPEND_AND_SAVE':
      return 'spendsave'
    case 'DISCOUNT_FIXED':
    case 'DISCOUNT_PERCENT':
      return 'discount'
    case 'FREEBIE':
      return 'freebie'
    case 'PACKAGE_DEAL':
      return 'package'
    case 'TIME_LIMITED':
      return 'timelimited'
    case 'REUSABLE':
      return 'reusable'
    default:
      return 'discount'
  }
}

export function voucherTypeLabel(enumType: string): string {
  switch (enumType) {
    case 'BOGO':
      return 'Buy one, get one free'
    case 'SPEND_AND_SAVE':
      return 'Spend & save'
    case 'DISCOUNT_FIXED':
      return 'Discount (fixed)'
    case 'DISCOUNT_PERCENT':
      return 'Discount (percent)'
    case 'FREEBIE':
      return 'Freebie'
    case 'PACKAGE_DEAL':
      return 'Package deal'
    case 'TIME_LIMITED':
      return 'Time limited'
    case 'REUSABLE':
      return 'Reusable'
    default:
      return enumType
  }
}
