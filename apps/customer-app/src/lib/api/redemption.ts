// Voucher type literal — mirrors the `VoucherType` Prisma enum
// (prisma/schema.prisma). Used by VoucherCard / VouchersTab and (when the
// Voucher Detail rebaseline lands) the redemption flow. This file is
// intentionally minimal in M2 — Voucher Detail rebaseline will extend with
// the redemption client + hooks when that surface ships.
export type VoucherType =
  | 'BOGO'
  | 'SPEND_AND_SAVE'
  | 'DISCOUNT_FIXED'
  | 'DISCOUNT_PERCENT'
  | 'FREEBIE'
  | 'PACKAGE_DEAL'
  | 'TIME_LIMITED'
  | 'REUSABLE'
