import React, { useRef } from 'react'
import { View, Pressable, StyleSheet } from 'react-native'
import { Swipeable } from 'react-native-gesture-handler'
import { Trash2 } from 'lucide-react-native'

type Props = {
  children: React.ReactNode
  onRemove: () => void
}

export function SwipeToRemove({ children, onRemove }: Props) {
  const swipeRef = useRef<Swipeable>(null)

  const renderRightActions = () => (
    <Pressable
      onPress={() => { swipeRef.current?.close(); onRemove() }}
      style={styles.deleteZone}
      accessibilityLabel="Delete"
      accessibilityRole="button"
    >
      <Trash2 size={18} color="#FFFFFF" />
    </Pressable>
  )

  return (
    <Swipeable
      ref={swipeRef}
      renderRightActions={renderRightActions}
      rightThreshold={80}
      onSwipeableOpen={(direction) => {
        if (direction === 'right') {
          swipeRef.current?.close()
          onRemove()
        }
      }}
      friction={2}
      overshootRight={false}
    >
      {children}
    </Swipeable>
  )
}

const styles = StyleSheet.create({
  deleteZone: {
    backgroundColor: '#EF4444',
    width: 72,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopRightRadius: 14,
    borderBottomRightRadius: 14,
  },
})
