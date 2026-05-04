import React from 'react'
import { View, Pressable, ScrollView, StyleSheet } from 'react-native'
import { X } from '@/design-system/icons'
import { Text } from '@/design-system/Text'
import { BottomSheet } from '@/design-system/motion/BottomSheet'
import { StatusPill } from './StatusPill'
import { smartStatus } from '../utils/smartStatus'
import { useOpenStatus } from '../hooks/useOpenStatus'
import type { OpeningHourEntry } from '@/lib/api/merchant'

type Props = {
  visible:      boolean
  branchName:   string
  isOpenNow:    boolean
  openingHours: OpeningHourEntry[]
  onDismiss:    () => void
}

// Visual correction round 3 §A4 (post-PR-#35 QA): migrated onto the
// shared `<BottomSheet>` primitive from design-system/motion. The
// primitive owns the modal, fade-scrim, drag handle, swipe-down-to-
// dismiss, and reduced-motion handling. We just supply the content.
export function HoursPreviewSheet({ visible, branchName, isOpenNow, openingHours, onDismiss }: Props) {
  // Hooks unconditional (rules of hooks). For empty `openingHours`,
  // useOpenStatus still produces a 7-day "Closed" schedule we just
  // don't render (empty-state branch wins).
  const { weekSchedule } = useOpenStatus(openingHours)
  const status = smartStatus(isOpenNow, openingHours)
  const hasHours = openingHours.length > 0

  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} accessibilityLabel="Branch hours preview">
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text variant="label.md" style={styles.headerEyebrow}>Opening hours</Text>
          <Text variant="display.sm" style={styles.headerTitle} numberOfLines={1} ellipsizeMode="tail">
            {branchName}
          </Text>
        </View>
        <StatusPill state={status.pillState} label={status.pillLabel} />
        <Pressable accessibilityLabel="Close hours preview" onPress={onDismiss} style={styles.closeBtn} hitSlop={8}>
          <X size={16} color="#666" />
        </Pressable>
      </View>

      {!hasHours ? (
        <Text variant="body.sm" style={styles.emptyText}>Hours not available</Text>
      ) : (
        <ScrollView style={styles.scrollView}>
          {weekSchedule.map((day, i) => (
            <View
              key={i}
              accessibilityLabel={`Hours row ${i}`}
              style={[styles.row, i < weekSchedule.length - 1 && styles.rowBorder]}
            >
              <View style={styles.dayCol}>
                <Text variant="label.lg" style={[styles.dayText, day.isToday && styles.dayToday]}>
                  {day.day}
                </Text>
                {day.isToday ? (
                  <View style={styles.todayBadge}>
                    <Text variant="label.md" style={styles.todayText}>TODAY</Text>
                  </View>
                ) : null}
              </View>
              <Text
                variant="body.sm"
                style={[styles.hoursText, day.isToday && styles.hoursToday, day.isClosed && styles.hoursClosed]}
              >
                {day.hours}
              </Text>
            </View>
          ))}
        </ScrollView>
      )}
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  // Header
  header:        { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  headerText:    { flex: 1, minWidth: 0 },
  headerEyebrow: { fontSize: 11, color: '#888' },
  headerTitle:   { fontSize: 22, fontWeight: '800', color: '#010C35' },
  closeBtn:      { padding: 4 },

  // Empty state
  emptyText: { color: '#888', fontStyle: 'italic', paddingVertical: 16 },

  // Day rows — visual style copied from OpeningHoursCard for parity with
  // the About tab's existing schedule treatment.
  scrollView:    { maxHeight: 420 },
  row:           { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingVertical: 8 },
  rowBorder:     { borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.03)' },
  dayCol:        { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dayText:       { fontSize: 13, fontWeight: '600', color: '#010C35' },
  dayToday:      { color: '#E20C04' },
  todayBadge:    { backgroundColor: 'rgba(226,12,4,0.08)', paddingVertical: 2, paddingHorizontal: 6, borderRadius: 4 },
  todayText:     { fontSize: 9, fontWeight: '800', color: '#E20C04', textTransform: 'uppercase', letterSpacing: 0.6 },
  hoursText:     { fontSize: 13, fontWeight: '500', color: '#4B5563', textAlign: 'right' },
  hoursToday:    { color: '#E20C04' },
  hoursClosed:   { fontStyle: 'italic', color: '#888' },
})
