import React from 'react'
import { View, Pressable, Modal, ScrollView, StyleSheet } from 'react-native'
import { X } from '@/design-system/icons'
import { Text } from '@/design-system/Text'
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

export function HoursPreviewSheet({ visible, branchName, isOpenNow, openingHours, onDismiss }: Props) {
  // Hook calls must run unconditionally on every render (rules of hooks).
  // For empty `openingHours`, useOpenStatus still produces a schedule (all 7
  // days "Closed"); we just don't render it — the empty-state branch wins.
  // For visible=false we still need this to be reached so the hook order
  // stays stable across visibility toggles.
  const { weekSchedule } = useOpenStatus(openingHours)
  const status = smartStatus(isOpenNow, openingHours)
  const hasHours = openingHours.length > 0

  // The "returns null when not visible" test asserts an unrendered tree.
  // Modal still emits its container when visible=false; this short-circuit
  // makes the contract explicit. Placed AFTER hook calls so visibility
  // toggling never changes the hook count.
  if (!visible) return null

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <Pressable style={styles.overlay} onPress={onDismiss}>
        <Pressable style={styles.sheet} onPress={e => e?.stopPropagation?.()}>
          <View style={styles.dragHandle} />

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
            <ScrollView>
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
        </Pressable>
      </Pressable>
    </Modal>
  )
}

const styles = StyleSheet.create({
  // Modal chrome — matches BranchPickerSheet for visual parity across sheets.
  overlay:    { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(1,12,53,0.5)' },
  sheet:      { backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 24, paddingTop: 8, paddingBottom: 40, maxHeight: '70%' },
  dragHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#D1D5DB', alignSelf: 'center', marginBottom: 16 },

  // Header
  header:        { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  headerText:    { flex: 1, minWidth: 0 },
  headerEyebrow: { fontSize: 11, color: '#888' },
  headerTitle:   { fontSize: 22, fontWeight: '800', color: '#010C35' },
  closeBtn:      { padding: 4 },

  // Empty state
  emptyText: { color: '#888', fontStyle: 'italic', paddingVertical: 16 },

  // Day rows — visual style copied from OpeningHoursCard for consistency with the
  // About tab's existing schedule treatment. Outer card chrome NOT copied (sheet
  // owns its own chrome; double-card would feel busy).
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
