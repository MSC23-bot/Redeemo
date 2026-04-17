import React from 'react'
import { View, StyleSheet } from 'react-native'
import { Text } from '@/design-system/Text'
import { spacing } from '@/design-system/tokens'
import { VoucherCard } from './VoucherCard'
import { useFavourite } from '@/hooks/useFavourite'
import type { MerchantVoucher } from '@/lib/api/merchant'

type Props = {
  vouchers: MerchantVoucher[]
  redeemedVoucherIds: Set<string>
  favouritedVoucherIds: Set<string>
  isSubscribed: boolean
  onVoucherPress: (voucherId: string) => void
}

export function VouchersTab({ vouchers, redeemedVoucherIds, favouritedVoucherIds, isSubscribed, onVoucherPress }: Props) {
  if (vouchers.length === 0) {
    return (
      <View style={styles.empty}>
        <Text variant="heading.md" color="secondary" align="center">No vouchers available yet</Text>
        <Text variant="body.sm" color="tertiary" meta align="center" style={{ marginTop: 8 }}>
          Check back soon for exclusive offers
        </Text>
      </View>
    )
  }

  const sorted = [...vouchers].sort((a, b) => {
    const aRedeemed = redeemedVoucherIds.has(a.id) ? 1 : 0
    const bRedeemed = redeemedVoucherIds.has(b.id) ? 1 : 0
    return aRedeemed - bRedeemed
  })

  return (
    <View style={styles.list}>
      {sorted.map(v => (
        <VoucherCardWrapper
          key={v.id}
          voucher={v}
          isRedeemed={redeemedVoucherIds.has(v.id)}
          isFavourited={favouritedVoucherIds.has(v.id)}
          onPress={() => onVoucherPress(v.id)}
        />
      ))}
    </View>
  )
}

function VoucherCardWrapper({ voucher, isRedeemed, isFavourited: initialFav, onPress }: {
  voucher: MerchantVoucher
  isRedeemed: boolean
  isFavourited: boolean
  onPress: () => void
}) {
  const fav = useFavourite({ type: 'voucher', id: voucher.id, isFavourited: initialFav })

  return (
    <VoucherCard
      voucher={voucher}
      isRedeemed={isRedeemed}
      isFavourited={fav.isFavourited}
      onPress={onPress}
      onToggleFavourite={fav.toggle}
    />
  )
}

const styles = StyleSheet.create({
  list: {
    gap: 16,
  },
  empty: {
    paddingVertical: 60,
    paddingHorizontal: spacing[5],
    alignItems: 'center',
  },
})
