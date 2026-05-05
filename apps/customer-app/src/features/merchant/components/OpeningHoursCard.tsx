import React from 'react'
import { View, StyleSheet } from 'react-native'
import { Clock } from 'lucide-react-native'
import { Text } from '@/design-system/Text'
import { color } from '@/design-system/tokens'
import Animated, { useAnimatedStyle, withRepeat, withTiming, Easing } from 'react-native-reanimated'

type DaySchedule = {
  day: string
  shortDay: string
  hours: string
  isToday: boolean
  isClosed: boolean
}

type Props = {
  weekSchedule: DaySchedule[]
  isOpen: boolean
}

export function OpeningHoursCard({ weekSchedule, isOpen }: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.titleRow}>
        <View style={styles.titleLeft}>
          <Clock size={18} color={color.brandRose} />
          <Text variant="heading.sm" style={styles.title}>Opening Hours</Text>
        </View>
        <View style={styles.statusRow}>
          <StatusDot isOpen={isOpen} />
          <Text variant="label.md" style={{ color: isOpen ? '#16A34A' : '#B91C1C', fontWeight: '700', fontSize: 11 }}>
            {isOpen ? 'Open now' : 'Closed'}
          </Text>
        </View>
      </View>

      {weekSchedule.map((day, i) => (
        <View key={i} style={[styles.row, i < weekSchedule.length - 1 && styles.rowBorder]}>
          <View style={styles.dayCol}>
            <Text
              variant="label.lg"
              style={[styles.dayText, day.isToday && styles.dayToday]}
            >
              {day.day}
            </Text>
            {day.isToday && (
              <View style={styles.todayBadge}>
                <Text variant="label.md" style={styles.todayText}>TODAY</Text>
              </View>
            )}
          </View>
          <Text
            variant="body.sm"
            style={[styles.hoursText, day.isToday && styles.hoursToday]}
          >
            {day.hours}
          </Text>
        </View>
      ))}
    </View>
  )
}

function StatusDot({ isOpen }: { isOpen: boolean }) {
  const pulseStyle = useAnimatedStyle(() => {
    if (!isOpen) return { opacity: 1 }
    return {
      opacity: withRepeat(
        withTiming(0.45, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
        -1,
        true,
      ),
    }
  })

  return (
    <Animated.View
      style={[
        styles.dot,
        { backgroundColor: isOpen ? '#16A34A' : '#B91C1C' },
        pulseStyle,
      ]}
    />
  )
}

const styles = StyleSheet.create({
  // Round 5 §5 (impeccable polish): radius + title typography
  // aligned with the other About cards (16 → 18 / 15pt 800 → 16pt
  // 700) for a consistent system across the tab.
  card: {
    backgroundColor: '#FFF',
    borderRadius: 18,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  titleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#010C35',
    letterSpacing: -0.2,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  // Round 5 §18: day rows paddingV 8 → 10 — better breathing
  // between Sunday/Monday/Tuesday entries on the schedule list.
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingVertical: 10,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.03)',
  },
  dayCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dayText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#010C35',
  },
  dayToday: {
    color: '#E20C04',
  },
  todayBadge: {
    backgroundColor: 'rgba(226,12,4,0.08)',
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
  },
  todayText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#E20C04',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  hoursText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#4B5563',
    textAlign: 'right',
  },
  hoursToday: {
    color: '#E20C04',
  },
})
