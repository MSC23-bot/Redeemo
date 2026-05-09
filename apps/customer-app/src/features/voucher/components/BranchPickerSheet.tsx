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
  /**
   * Why the picker was opened (locked 2026-05-07 from device QA):
   *   • 'redeem' (default) — picker is the final branch confirmation
   *     step before PIN entry. Title "Confirm redemption branch",
   *     CTA "Confirm & Enter PIN".
   *   • 'change' — picker is a branch-context update only. Confirm
   *     updates the URL/state and closes; no PIN entry follows.
   *     Title "Choose branch", CTA "Change Branch".
   * The actual flow-after-confirm is owned by the caller's
   * `onConfirm`; this prop only swaps the visible copy so the user
   * understands what will happen when they tap Confirm.
   */
  intent?: 'redeem' | 'change'
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
  intent = 'redeem',
}: Props) {
  const titleText =
    intent === 'change' ? 'Choose branch' : 'Confirm redemption branch'
  const confirmText =
    intent === 'change' ? 'Change Branch' : 'Confirm & Enter PIN'
  // Normalise `currentBranchId` to null unless it actually exists in
  // the passed `branches` list. The picker is given an
  // already-active-filtered list (orchestrator filters via
  // `b.isActive`); if the URL/state's currentBranchId points at a
  // branch that's been removed from the list (deactivated, deleted,
  // wrong merchant), pre-selecting it would let the user tap
  // Confirm and submit a hidden id that the backend would reject
  // with BRANCH_UNAVAILABLE. Locked 2026-05-07 from device QA
  // edge-case review — Confirm must be disabled until the user
  // picks a row that is visibly available in the sheet.
  const validInitialId = currentBranchId !== null
    && branches.some((b) => b.id === currentBranchId)
    ? currentBranchId
    : null

  const [previewId, setPreviewId] = useState<string | null>(validInitialId)

  // Reset preview when sheet opens / current branch changes externally,
  // also normalising against the visible branches list.
  useEffect(() => {
    if (visible) {
      const next = currentBranchId !== null
        && branches.some((b) => b.id === currentBranchId)
        ? currentBranchId
        : null
      setPreviewId(next)
    }
  }, [visible, currentBranchId, branches])

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
        {/* Hierarchy (2026-05-09 owner correction):
              title             heading.md (18)  — largest
              instruction       body.md   (16)   — primary, matches row name
              supporting line   body.sm   (14)   — context
              row name          body.md   (16)
              row meta          body.sm   (14)
            Instruction must NOT be smaller than the options the user
            is being asked to pick (was body.sm 14 before — read odd
            against body.md 16 row names). */}
        <Text variant="heading.md" style={styles.title}>
          {titleText}
        </Text>
        <Text variant="body.md" style={styles.subtitle}>
          Pick the branch you're at right now.
        </Text>
        <Text variant="body.sm" style={styles.subtitleSecondary}>
          The PIN you'll enter is specific to that branch.
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
                    size={18}
                    color={isPreview ? color.brandRose : color.text.tertiary}
                    strokeWidth={2.4}
                  />
                </View>
                <View style={styles.rowText}>
                  <Text variant="body.md" style={styles.rowName}>
                    {b.name}
                  </Text>
                  <View style={styles.metaRow}>
                    {b.city ? (
                      <Text variant="body.sm" style={styles.rowMeta}>
                        {b.city}
                      </Text>
                    ) : null}
                    {b.city && distance ? (
                      <Text variant="body.sm" style={styles.rowMetaDot}>
                        ·
                      </Text>
                    ) : null}
                    {distance ? (
                      <Text variant="body.sm" style={styles.rowMeta}>
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
          <Text variant="body.md" style={styles.confirmText}>
            {confirmText}
          </Text>
        </Pressable>
      </View>
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  // heading.md (18 / 24) variant drives.  fontSize override removed
  // 2026-05-09 (cross-surface consistency with PinEntrySheet).
  title: {
    fontWeight: '800',
    color: color.text.primary,
    textAlign: 'center',
  },
  // Instruction (body.md 16) — primary; matches the branch row name
  // weight so the user reads "what to do" + "options" at the same
  // hierarchy step.
  subtitle: {
    marginTop: spacing[2],
    color: color.text.primary,
    textAlign: 'center',
  },
  // Supporting context (body.sm 14) — secondary tone.
  subtitleSecondary: {
    marginTop: 2,
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
  // body.md (16 / 24) drives — branch name is the primary identifier
  // in each row and now reads with the weight it deserves.
  rowName: {
    fontWeight: '700',
    color: color.text.primary,
  },
  metaRow: {
    flexDirection: 'row',
    gap: spacing[1],
    marginTop: 2,
  },
  // body.sm (14 / 21) drives — supporting context.
  rowMeta: {
    color: color.text.secondary,
  },
  rowMetaDot: {
    color: color.text.tertiary,
  },
  checkWrap: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Confirm button — minHeight 56 for tap-target comfort at the
  // bumped body.md text size, matching PinEntrySheet's submit.
  confirm: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    minHeight: 56,
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
  // body.md (16 / 24) drives.  fontSize override removed.
  confirmText: {
    fontWeight: '800',
    color: color.onBrand,
  },
})
