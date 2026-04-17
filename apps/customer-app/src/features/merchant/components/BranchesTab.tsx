import React from 'react'
import { View, StyleSheet } from 'react-native'
import { BranchCard } from './BranchCard'
import type { BranchDetail } from '@/lib/api/merchant'

type Props = {
  branches: BranchDetail[]
  nearestBranchId: string | null
}

export function BranchesTab({ branches, nearestBranchId }: Props) {
  const sorted = [...branches].sort((a, b) => {
    if (a.id === nearestBranchId) return -1
    if (b.id === nearestBranchId) return 1
    return (a.distance ?? Infinity) - (b.distance ?? Infinity)
  })

  return (
    <View style={styles.container}>
      {sorted.map(branch => (
        <BranchCard
          key={branch.id}
          branch={branch}
          isNearest={branch.id === nearestBranchId}
          onPress={() => {}}
        />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
})
