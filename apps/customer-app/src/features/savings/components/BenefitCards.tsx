import React from 'react'
import { View, StyleSheet } from 'react-native'
// eslint-disable-next-line tokens/no-raw-tokens
import { MapPin, CreditCard, TrendingUp, XCircle } from 'lucide-react-native'
import { Text } from '@/design-system/Text'
import { spacing, radius, elevation } from '@/design-system/tokens'
import { FadeInDown } from '@/design-system/motion/FadeIn'

type Variant = 'free' | 'subscriber-empty'

const CARDS = [
  {
    icon: MapPin,
    iconBg: '#FEE2E2',
    iconColor: '#E20C04',
    title: 'Restaurants, cafés, gyms & more',
    body: 'Local businesses near you — new vouchers added every week',
    key: 'location',
  },
  {
    icon: CreditCard,
    iconBg: '#DCFCE7',
    iconColor: '#16A34A',
    title: 'Show your code, save instantly',
    body: 'Tap Redeem and show the screen at the till — it\'s that simple',
    key: 'redeem',
  },
  {
    icon: TrendingUp,
    iconBg: '#FEF3C7',
    iconColor: '#B45309',
    title: 'Your subscription pays for itself',
    body: 'Redeem just once a month and you\'ve already covered your £6.99',
    key: 'roi',
  },
  {
    icon: XCircle,
    iconBg: '#EDE9FE',
    iconColor: '#7C3AED',
    title: 'Cancel anytime, no commitment',
    body: 'Monthly from £6.99 or save with an annual plan',
    key: 'cancel',
    freeOnly: true,
  },
]

export function BenefitCards({ variant }: { variant: Variant }) {
  const cards = variant === 'free' ? CARDS : CARDS.filter((c) => !c.freeOnly)

  return (
    <View style={styles.container}>
      {cards.map((card, i) => {
        const Icon = card.icon
        return (
          <FadeInDown key={card.key} delay={200 + i * 80}>
            <View style={styles.card}>
              <View style={[styles.iconCircle, { backgroundColor: card.iconBg }]}>
                <Icon size={20} color={card.iconColor} />
              </View>
              <View style={styles.cardText}>
                <Text variant="heading.sm" style={styles.cardTitle}>{card.title}</Text>
                <Text variant="body.sm" color="secondary" meta>{card.body}</Text>
              </View>
            </View>
          </FadeInDown>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing[5],
    paddingTop: spacing[5],
    paddingBottom: spacing[4],
    gap: spacing[3],
  },
  card: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: radius.xl,
    padding: spacing[4],
    gap: spacing[3],
    ...elevation.sm,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardText: {
    flex: 1,
    gap: 2,
  },
  cardTitle: {
    color: '#010C35',
  },
})
