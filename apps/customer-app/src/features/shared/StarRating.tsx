import React from 'react'
import { View } from 'react-native'
import { Star } from 'lucide-react-native'
import { Text, color } from '@/design-system'

const STAR_SIZE = 14

export function StarRating({ rating, count }: { rating: number | null; count: number }) {
  if (rating === null) return null
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
      {/*
        lucide-react-native@1.14 destructures `testID` off the icon and emits
        it as web-style `data-testid` on the underlying SVG, which RN does not
        expose to react-native-testing-library. Wrap the Star in a View that
        carries the testID + a mirrored `size` prop so tests can pin the icon
        size without coupling to lucide's forwardRef internals.
      */}
      <View testID="star-rating-icon" {...({ size: STAR_SIZE } as { size: number })}>
        <Star size={STAR_SIZE} fill="#F59E0B" color="#F59E0B" />
      </View>
      <Text variant="label.md" style={{ fontSize: 13, fontFamily: 'Lato-Bold', color: color.text.primary }}>
        {rating.toFixed(1)}
      </Text>
      <Text variant="label.md" style={{ fontSize: 11, color: color.text.tertiary }}>
        ({count})
      </Text>
    </View>
  )
}
