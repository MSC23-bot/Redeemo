import React from 'react'
import { Text } from '@/design-system/Text'
import { StyleSheet } from 'react-native'

type Props = {
  descriptor: string | null
}

export function MerchantDescriptor({ descriptor }: Props) {
  if (!descriptor) return null
  return (
    <Text variant="body.sm" color="secondary" style={styles.text}>{descriptor}</Text>
  )
}

const styles = StyleSheet.create({
  text: { fontSize: 13, fontWeight: '500' },
})
