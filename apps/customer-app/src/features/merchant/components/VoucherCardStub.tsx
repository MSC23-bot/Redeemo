import React from 'react'
import { View, StyleSheet } from 'react-native'
import { Clock, FileText } from 'lucide-react-native'
import { Text } from '@/design-system/Text'

type Pill = {
  label: string
  type: 'expiry' | 'term' | 'time-active' | 'time-ending' | 'time-off' | 'redeemed' | 'view-code'
}

type Props = {
  pills: Pill[]
}

const PILL_STYLES: Record<Pill['type'], { bg: string; color: string; borderColor?: string }> = {
  'expiry': { bg: 'rgba(0,0,0,0.04)', color: '#9CA3AF' },
  'term': { bg: 'rgba(0,0,0,0.04)', color: '#4B5563' },
  'time-active': { bg: 'rgba(22,163,74,0.12)', color: '#166534', borderColor: 'rgba(22,163,74,0.3)' },
  'time-ending': { bg: 'rgba(220,38,38,0.1)', color: '#991B1B', borderColor: 'rgba(220,38,38,0.3)' },
  'time-off': { bg: 'rgba(0,0,0,0.05)', color: '#4B5563', borderColor: 'rgba(0,0,0,0.06)' },
  'redeemed': { bg: 'rgba(0,0,0,0.04)', color: '#9CA3AF' },
  'view-code': { bg: 'rgba(226,12,4,0.06)', color: '#E20C04' },
}

export function VoucherCardStub({ pills }: Props) {
  return (
    <View style={styles.container}>
      <View style={[styles.cutout, styles.cutoutLeft]} />
      <View style={[styles.cutout, styles.cutoutRight]} />

      <View style={styles.pills}>
        {pills.map((pill, i) => {
          const ps = PILL_STYLES[pill.type]
          return (
            <View
              key={i}
              style={[
                styles.pill,
                { backgroundColor: ps.bg },
                ps.borderColor ? { borderWidth: 1, borderColor: ps.borderColor } : {},
              ]}
            >
              {(pill.type === 'expiry') && <Clock size={10} color={ps.color} />}
              {(pill.type === 'term') && <FileText size={10} color={ps.color} />}
              <Text variant="label.md" style={{ color: ps.color, fontSize: 10, fontWeight: '600' }}>
                {pill.label}
              </Text>
            </View>
          )
        })}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    borderTopWidth: 2,
    borderTopColor: 'rgba(0,0,0,0.08)',
    borderStyle: 'dashed',
    paddingVertical: 12,
    paddingLeft: 20,
    paddingRight: 16,
    position: 'relative',
  },
  cutout: {
    position: 'absolute',
    top: -9,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#FFF',
  },
  cutoutLeft: { left: -8 },
  cutoutRight: { right: -8 },
  pills: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
})
