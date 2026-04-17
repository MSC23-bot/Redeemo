import React, { useRef, useState, useEffect, useCallback } from 'react'
import { View, ScrollView, Dimensions, TouchableOpacity } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Text, color, spacing, radius } from '@/design-system'
import { DotIndicator } from '@/features/shared/DotIndicator'

const SCREEN_WIDTH = Dimensions.get('window').width
const BANNER_WIDTH = SCREEN_WIDTH - 36
const BANNER_GAP = 12
const AUTO_SCROLL_INTERVAL = 12000

const DEFAULT_GRADIENTS: [string, string][] = [
  ['#667EEA', '#764BA2'],
  ['#E20C04', '#E84A00'],
  ['#11998E', '#38EF7D'],
]

type Campaign = {
  id: string
  name: string
  description: string | null
  bannerUrl: string | null
  gradientStart: string | null
  gradientEnd: string | null
  ctaText: string | null
}

type Props = {
  campaigns: Campaign[]
  onCampaignPress: (id: string) => void
}

export function CampaignCarousel({ campaigns, onCampaignPress }: Props) {
  const [activeIndex, setActiveIndex] = useState(0)
  const scrollRef = useRef<ScrollView>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const scrollToIndex = useCallback((index: number) => {
    const clampedIndex = Math.max(0, Math.min(index, campaigns.length - 1))
    scrollRef.current?.scrollTo({
      x: clampedIndex * (BANNER_WIDTH + BANNER_GAP),
      animated: true,
    })
    setActiveIndex(clampedIndex)
  }, [campaigns.length])

  const startAutoScroll = useCallback(() => {
    if (campaigns.length <= 1) return
    timerRef.current = setInterval(() => {
      setActiveIndex((prev) => {
        const next = (prev + 1) % campaigns.length
        scrollRef.current?.scrollTo({
          x: next * (BANNER_WIDTH + BANNER_GAP),
          animated: true,
        })
        return next
      })
    }, AUTO_SCROLL_INTERVAL)
  }, [campaigns.length])

  useEffect(() => {
    startAutoScroll()
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [startAutoScroll])

  if (campaigns.length === 0) return null

  return (
    <View>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled={false}
        snapToInterval={BANNER_WIDTH + BANNER_GAP}
        snapToAlignment="start"
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 18, gap: BANNER_GAP }}
        onMomentumScrollEnd={(e) => {
          const offsetX = e.nativeEvent.contentOffset.x
          const index = Math.round(offsetX / (BANNER_WIDTH + BANNER_GAP))
          setActiveIndex(index)
          // Reset auto-scroll timer on manual scroll
          if (timerRef.current) clearInterval(timerRef.current)
          startAutoScroll()
        }}
      >
        {campaigns.map((campaign, i) => {
          const fallbackIndex = i % DEFAULT_GRADIENTS.length
          const fallback = DEFAULT_GRADIENTS[fallbackIndex] as [string, string]
          const gradientStart = campaign.gradientStart ?? fallback[0]
          const gradientEnd = campaign.gradientEnd ?? fallback[1]

          return (
            <LinearGradient
              key={campaign.id}
              colors={[gradientStart, gradientEnd]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{
                width: BANNER_WIDTH,
                minHeight: 140,
                borderRadius: radius.lg,
                padding: spacing[5],
                justifyContent: 'flex-end',
              }}
            >
              <Text
                variant="heading.md"
                style={{ color: '#FFFFFF', marginBottom: spacing[1] }}
              >
                {campaign.name}
              </Text>
              {campaign.description && (
                <Text
                  variant="body.sm"
                  style={{ color: 'rgba(255,255,255,0.85)', marginBottom: spacing[3] }}
                >
                  {campaign.description}
                </Text>
              )}
              <TouchableOpacity
                onPress={() => onCampaignPress(campaign.id)}
                style={{
                  alignSelf: 'flex-start',
                  backgroundColor: '#FFFFFF',
                  paddingHorizontal: spacing[4],
                  paddingVertical: spacing[2],
                  borderRadius: radius.pill,
                }}
                accessibilityLabel={campaign.ctaText ?? 'Learn More'}
              >
                <Text
                  variant="label.md"
                  style={{ color: color.navy, fontFamily: 'Lato-Bold', fontSize: 12 }}
                >
                  {campaign.ctaText ?? 'Learn More'}
                </Text>
              </TouchableOpacity>
            </LinearGradient>
          )
        })}
      </ScrollView>

      {campaigns.length > 1 && (
        <DotIndicator count={campaigns.length} activeIndex={activeIndex} />
      )}
    </View>
  )
}
