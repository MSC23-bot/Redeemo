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
        {/* Hierarchy (PR-B T8l, impeccable pass):
              title           display.sm 22pt Mustica Pro — gateway-
                              moment editorial weight per DESIGN.md
                              "Mustica-for-Display Rule".
              lead subtitle   body.md 16pt navy — primary instruction
              helper subtitle body.sm 14pt secondary navy — context
              row name        heading.sm 16pt Lato-Semibold — option label
              row meta        body.sm 14pt secondary — context
            Title moves Lato heading.md → Mustica display.sm because
            this sheet is the gateway between "browsing" and
            "redeeming"; the user is about to enter a PIN.  The
            display tier matches the surface importance. */}
        <Text variant="display.sm" style={styles.title}>
          {titleText}
        </Text>
        <Text variant="body.md" style={styles.subtitle}>
          Pick the branch you're at right now.
        </Text>
        <Text variant="body.sm" style={styles.subtitleSecondary}>
          The PIN you'll enter is specific to that branch.
        </Text>

        <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
          {branches.map((b, idx) => {
            const isPreview = b.id === previewId
            const distance = formatDistance(b.distanceMetres)
            const isLast = idx === branches.length - 1
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
                  !isLast && styles.rowDivider,
                  isPreview && styles.rowSelected,
                  pressed && !isPreview && styles.rowPressed,
                ]}
              >
                <MapPin
                  size={20}
                  color={isPreview ? color.brandRose : color.text.tertiary}
                  strokeWidth={2.2}
                />
                <View style={styles.rowText}>
                  <Text variant="heading.sm" style={styles.rowName}>
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
                  <Check size={18} color={color.brandRose} strokeWidth={2.6} />
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
          <Text variant="heading.sm" style={styles.confirmText}>
            {confirmText}
          </Text>
        </Pressable>
      </View>
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  // PR-B T8l (impeccable pass): title bumped from heading.md (Lato
  // Semibold 18) → display.sm (Mustica Pro Semibold 22) per
  // DESIGN.md "Mustica-for-Display Rule".  Tight letter-spacing
  // (-0.3) gives the title the editorial weight a high-stakes-
  // action gateway deserves.  Variant default fontFamily +
  // fontSize + lineHeight come through; we only override colour,
  // alignment, and tracking.
  title: {
    color: color.text.primary,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  // Lead instruction (body.md 16, primary navy) — matches row name
  // weight so "what to do" + "options" sit at the same hierarchy
  // step on the user's eye.
  subtitle: {
    marginTop: spacing[2],
    color: color.text.primary,
    textAlign: 'center',
  },
  // Helper context (body.sm 14, secondary navy) — quieter tone,
  // marginBottom drives the rhythm break before the list.
  subtitleSecondary: {
    marginTop: 2,
    color: color.text.secondary,
    textAlign: 'center',
    marginBottom: spacing[5],
  },
  list: {
    maxHeight: 320,
  },
  // PR-B T8l: drop per-row card chrome (no border, no raised bg, no
  // bottom margin) and use hairline dividers between rows instead.
  // DESIGN.md "No-Card-On-Card Rule" — rows inside a sheet that's
  // already a card-like surface are nested cards; the impeccable
  // refactor is to use a single list with hairlines + selected bg
  // tint as the affordance.  Padding bumped to 14pt vertical so the
  // taller heading.sm row name + meta row breathe.
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingVertical: 14,
    paddingHorizontal: spacing[3],
    borderRadius: radius.md,
  },
  // Hairline divider between consecutive rows (skipped on the last
  // row).  StyleSheet.hairlineWidth resolves to ≈0.5pt on iOS and
  // 1px on Android — the right "barely there" weight for premium
  // list separation per DESIGN.md "Flat-By-Default Rule".
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.border.subtle,
  },
  // Selected row uses surface-tint warm cream `#FEF6F5` (NOT
  // `color.cream` which is the identity-zone framing per DESIGN.md
  // "Cream-for-Identity Rule").  surface-tint is the quieter cream
  // adjacent reserved for state moments.  No border — the bg tint
  // + the brand-rose pin icon + the trailing Check carry the
  // selection cue.
  rowSelected: {
    backgroundColor: color.surface.tint,
  },
  rowPressed: {
    opacity: 0.75,
  },
  rowText: {
    flex: 1,
  },
  // PR-B T8l: row name moves body.md → heading.sm (Lato Semibold
  // 16) so the option lifts as "I am the option you pick" against
  // the secondary meta line below.  Cross-surface parity with the
  // PinEntrySheet primary-action labelling.
  rowName: {
    color: color.text.primary,
  },
  metaRow: {
    flexDirection: 'row',
    gap: spacing[1],
    marginTop: 2,
  },
  rowMeta: {
    color: color.text.secondary,
  },
  rowMetaDot: {
    color: color.text.tertiary,
  },
  // PR-B T8l (impeccable pass): confirm CTA aligned to DESIGN.md
  // `button-primary-lg`:
  //   • borderRadius radius.md (12) — DESIGN.md "Buttons Shape:
  //     rounded-md (12px) on every variant".  Was radius.lg (16).
  //   • shadowOpacity 0.30 → 0.20, shadowRadius 24 → 18 — calmer
  //     brand glow per DESIGN.md "Glow-is-the-CTA Rule" (the glow
  //     is a brand pulse, not a marketing flare).
  //   • paddingHorizontal 24 explicit per the spec.
  //   • Label moves body.md → heading.sm (Lato Semibold 16) per
  //     button-primary-lg.
  confirm: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    minHeight: 56,
    paddingVertical: spacing[4],
    paddingHorizontal: 24,
    borderRadius: radius.md,
    overflow: 'hidden',
    marginTop: spacing[4],
    shadowColor: color.brandRose,
    shadowOpacity: 0.20,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
  },
  confirmDisabled: {
    opacity: opacity.disabled,
  },
  confirmPressed: {
    transform: [{ scale: 0.97 }],
  },
  confirmText: {
    color: color.onBrand,
  },
})
