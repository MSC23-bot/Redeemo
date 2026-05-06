import React, { useEffect, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Check, MapPin, Tag } from 'lucide-react-native'
import { BottomSheet } from '@/design-system/motion/BottomSheet'
import { Text } from '@/design-system/Text'
import { color, opacity, radius, spacing } from '@/design-system/tokens'
import { lightHaptic } from '@/design-system/haptics'

/**
 * Minimal branch shape consumed by the voucher-scoped picker. Mirrors the
 * subset of `merchant.branches[]` we actually need for the redemption-
 * picker UX. Inactive branches must NOT be passed (caller filters; the
 * backend rejects redemption against inactive branches with
 * BRANCH_UNAVAILABLE per PR #43).
 */
export type PickerBranch = {
  id: string
  name: string
  city: string | null
  distanceMetres: number | null
}

type Props = {
  visible: boolean
  branches: PickerBranch[]
  /** The branch currently driving the screen (URL ?branch= or selectedBranch). */
  currentBranchId: string | null
  /**
   * Fires when user taps "Confirm". Caller updates URL via select(branchId)
   * and opens PinEntrySheet. Does NOT fire on row-tap alone — voucher-
   * scoped picker uses an explicit confirm step (different from the
   * merchant-profile picker, which commits on row-tap).
   */
  onConfirm: (branchId: string) => void
  onDismiss: () => void
}

function formatDistance(m: number | null): string | null {
  if (m === null) return null
  if (m < 1000) return `${Math.round(m)} m`
  return `${(m / 1609.34).toFixed(1)} mi`
}

/**
 * Voucher-scoped branch picker — Voucher Detail M2.
 *
 * Differs from `features/merchant/components/BranchPickerSheet` in exit
 * semantics: this picker uses an explicit "Confirm Branch" CTA so the
 * user can preview a row before committing to redemption. The merchant-
 * profile picker commits on row-tap (URL replace) which is fine for
 * navigation but NOT for redemption — the user is about to enter a PIN
 * and must be sure of which branch they're redeeming at.
 *
 * Visual language harmonises with Voucher Detail (cream selection bg,
 * brand-rose accents, brand-gradient confirm CTA).
 */
export function BranchPickerSheet({
  visible,
  branches,
  currentBranchId,
  onConfirm,
  onDismiss,
}: Props) {
  const [previewId, setPreviewId] = useState<string | null>(currentBranchId)

  // Reset preview when sheet opens / current branch changes externally.
  useEffect(() => {
    if (visible) setPreviewId(currentBranchId)
  }, [visible, currentBranchId])

  const handleConfirm = () => {
    if (!previewId) return
    lightHaptic()
    onConfirm(previewId)
  }

  const submitDisabled = !previewId

  return (
    <BottomSheet
      visible={visible}
      onDismiss={onDismiss}
      accessibilityLabel="Choose redemption branch"
    >
      <View testID="voucher-branch-picker-sheet">
        <Text variant="heading.sm" style={styles.title}>
          Where are you redeeming?
        </Text>
        <Text variant="body.sm" style={styles.subtitle}>
          Pick the branch you're at right now. The PIN you'll enter is
          specific to that branch.
        </Text>

        <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
          {branches.map((b) => {
            const isPreview = b.id === previewId
            const distance = formatDistance(b.distanceMetres)
            return (
              <Pressable
                key={b.id}
                accessibilityRole="button"
                accessibilityState={{ selected: isPreview }}
                accessibilityLabel={`${b.name}${isPreview ? ' — selected' : ''}`}
                testID={`branch-picker-row-${b.id}`}
                onPress={() => {
                  lightHaptic()
                  setPreviewId(b.id)
                }}
                style={({ pressed }) => [
                  styles.row,
                  isPreview && styles.rowSelected,
                  pressed && !isPreview && styles.rowPressed,
                ]}
              >
                <View style={styles.iconWrap}>
                  <MapPin
                    size={16}
                    color={isPreview ? color.brandRose : color.text.tertiary}
                    strokeWidth={2.4}
                  />
                </View>
                <View style={styles.rowText}>
                  <Text variant="label.md" style={styles.rowName}>
                    {b.name}
                  </Text>
                  <View style={styles.metaRow}>
                    {b.city ? (
                      <Text variant="label.md" style={styles.rowMeta}>
                        {b.city}
                      </Text>
                    ) : null}
                    {b.city && distance ? (
                      <Text variant="label.md" style={styles.rowMetaDot}>
                        ·
                      </Text>
                    ) : null}
                    {distance ? (
                      <Text variant="label.md" style={styles.rowMeta}>
                        {distance}
                      </Text>
                    ) : null}
                  </View>
                </View>
                {isPreview ? (
                  <View style={styles.checkWrap}>
                    <Check size={16} color={color.brandRose} strokeWidth={3} />
                  </View>
                ) : null}
              </Pressable>
            )
          })}
        </ScrollView>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Confirm branch and continue to PIN entry"
          accessibilityState={{ disabled: submitDisabled }}
          testID="branch-picker-confirm"
          disabled={submitDisabled}
          onPress={handleConfirm}
          style={({ pressed }) => [
            styles.confirm,
            submitDisabled && styles.confirmDisabled,
            pressed && !submitDisabled && styles.confirmPressed,
          ]}
        >
          <LinearGradient
            colors={color.brandGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFillObject}
          />
          <Tag size={18} color={color.onBrand} strokeWidth={2.4} />
          <Text variant="label.md" style={styles.confirmText}>
            Confirm Branch
          </Text>
        </Pressable>
      </View>
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: color.text.primary,
    textAlign: 'center',
  },
  subtitle: {
    marginTop: spacing[2],
    fontSize: 12,
    lineHeight: 18,
    color: color.text.secondary,
    textAlign: 'center',
    marginBottom: spacing[4],
  },
  list: {
    maxHeight: 320,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    padding: spacing[3],
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.border.subtle,
    backgroundColor: color.surface.raised,
    marginBottom: spacing[2],
  },
  rowSelected: {
    borderColor: color.brandRose,
    backgroundColor: color.cream,
  },
  rowPressed: {
    opacity: 0.85,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    backgroundColor: color.surface.subtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
  },
  rowName: {
    fontSize: 13,
    fontWeight: '700',
    color: color.text.primary,
  },
  metaRow: {
    flexDirection: 'row',
    gap: spacing[1],
    marginTop: 2,
  },
  rowMeta: {
    fontSize: 11,
    color: color.text.secondary,
  },
  rowMetaDot: {
    fontSize: 11,
    color: color.text.tertiary,
  },
  checkWrap: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirm: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    paddingVertical: spacing[4],
    borderRadius: radius.lg,
    overflow: 'hidden',
    marginTop: spacing[3],
    shadowColor: color.brandRose,
    shadowOpacity: 0.3,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 6 },
  },
  confirmDisabled: {
    opacity: opacity.disabled,
  },
  confirmPressed: {
    transform: [{ scale: 0.97 }],
  },
  confirmText: {
    fontSize: 15,
    fontWeight: '800',
    color: color.onBrand,
  },
})
