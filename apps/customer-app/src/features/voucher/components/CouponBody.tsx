import React from 'react'
import { View, StyleSheet } from 'react-native'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { Check, Clock, Info, Shield, Tag } from 'lucide-react-native'
import { Text } from '@/design-system/Text'
import type { VoucherType } from '@/lib/api/voucher'
import { voucherGradient } from '../utils/voucherTheme'

type CouponTopCardProps = {
  type: VoucherType
  imageUrl: string | null
  expiryDate: string | null  // ISO
  isMultiBranch: boolean
}

type CouponBodyCardProps = {
  description: string | null
  terms: string | null
}

const NAVY        = '#010C35'
const TEXT_2ND    = '#4B5563'
const TEXT_MUTED  = '#9CA3AF'
const BORDER      = '#E8E2DC'
const SAVING_GRN  = '#16A34A'
const ROSE        = '#E20C04'
const CREAM       = '#FFF9F5'

/**
 * Coupon TOP card — banner image (or gradient placeholder) + voucher
 * info pills. Sits between the outer perforation (under header) and
 * the inner perforation (above body). Per v4 §coupon-top-card.
 */
export function CouponTopCard({ type, imageUrl, expiryDate, isMultiBranch }: CouponTopCardProps) {
  const expiryLabel = expiryDate
    ? `Expires ${new Date(expiryDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
    : null

  // Banner fallback: darken the type gradient so it reads as a hero
  // image area rather than as the coupon's main colour fill.
  const [light, dark] = voucherGradient(type)
  const bannerColors: readonly [string, string] = [`${light}33`, dark]

  return (
    <View style={styles.topCard} testID="coupon-top-card">
      <View style={styles.banner}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
        ) : (
          <>
            <LinearGradient
              colors={bannerColors}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFillObject}
            />
            <View style={styles.bannerOverlay} pointerEvents="none">
              <Text variant="label.md" style={styles.bannerLabel}>VOUCHER BANNER</Text>
            </View>
          </>
        )}
      </View>

      <View style={styles.infoBlock}>
        <Text variant="label.md" style={styles.infoTitle}>VOUCHER DETAILS</Text>
        <View style={styles.pillsRow}>
          {expiryLabel ? (
            <Pill tone="expiry" icon={<Clock size={12} color="#B91C1C" strokeWidth={2.2} />}>
              {expiryLabel}
            </Pill>
          ) : (
            <Pill tone="ongoing" icon={<Check size={12} color="#166534" strokeWidth={2.2} />}>
              No expiry
            </Pill>
          )}
          <Pill tone="neutral" icon={<Tag size={12} color={TEXT_2ND} strokeWidth={2} />}>
            {isMultiBranch ? 'All branches' : 'Single branch'}
          </Pill>
        </View>
      </View>
    </View>
  )
}

/**
 * Coupon BODY card — terms list + fair-use card. Sits below the inner
 * perforation. Per v4 §coupon-body.
 */
export function CouponBodyCard({ description, terms }: CouponBodyCardProps) {
  // Terms text is stored as a single multi-line string. Split into
  // bullet points by blank line / line break so the UI matches v4
  // (each bullet rendered as its own list item with a check icon).
  // Falls back to whitespace splitting only if the source text doesn't
  // already use line-breaks.
  const termsList = (terms ?? '').split(/\r?\n+/).map(s => s.trim()).filter(Boolean)

  return (
    <View style={styles.bodyCard} testID="coupon-body">
      {description ? (
        <Text variant="body.md" style={styles.description}>
          {description}
        </Text>
      ) : null}

      {termsList.length > 0 ? (
        <View style={styles.section}>
          <View style={styles.sectionHeading}>
            <Tag size={15} color={ROSE} strokeWidth={2} />
            <Text variant="label.md" style={styles.sectionTitle}>Terms &amp; Conditions</Text>
          </View>
          <View style={styles.termsList}>
            {termsList.map((line, i) => (
              <View key={i} style={[styles.termsRow, i === termsList.length - 1 && styles.termsRowLast]}>
                <Check size={13} color={SAVING_GRN} strokeWidth={2.4} />
                <Text variant="body.sm" style={styles.termsText}>{line}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      <View style={styles.fairUse}>
        <View style={styles.sectionHeading}>
          <Shield size={14} color={ROSE} strokeWidth={2} />
          <Text variant="label.md" style={styles.fairTitle}>Fair Use Policy</Text>
        </View>
        <FairItem text="Vouchers are for personal use only — non-transferable." />
        <FairItem text="Present voucher before ordering — must be shown before the bill is generated." />
        <FairItem text="Merchant reserves the right to refuse if fair use is not followed." />
      </View>
    </View>
  )
}

// ── Internal pieces ──────────────────────────────────────────────────────────

function Pill({ tone, icon, children }: {
  tone: 'ongoing' | 'expiry' | 'neutral'
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <View style={[styles.pill, tone === 'ongoing' && styles.pillOngoing, tone === 'expiry' && styles.pillExpiry, tone === 'neutral' && styles.pillNeutral]}>
      {icon}
      <Text variant="label.md" style={[
        styles.pillText,
        tone === 'ongoing' && styles.pillTextOngoing,
        tone === 'expiry'  && styles.pillTextExpiry,
        tone === 'neutral' && styles.pillTextNeutral,
      ]}>
        {children}
      </Text>
    </View>
  )
}

function FairItem({ text }: { text: string }) {
  return (
    <View style={styles.fairItem}>
      <Info size={11} color={TEXT_MUTED} strokeWidth={2} />
      <Text variant="body.sm" style={styles.fairItemText}>{text}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  // ── TOP CARD (banner + pills) ──────────────────────────────────────
  topCard: {
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  banner: {
    height: 140,
    backgroundColor: '#1a1a2e',
    overflow: 'hidden',
  },
  bannerOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerLabel: {
    color: 'rgba(255,255,255,0.18)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 3,
  },
  infoBlock: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 14,
  },
  infoTitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: TEXT_MUTED,
    marginBottom: 10,
  },
  pillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  pillOngoing: { backgroundColor: '#ECFDF5' },
  pillExpiry:  { backgroundColor: '#FEF2F2' },
  pillNeutral: { backgroundColor: 'rgba(0,0,0,0.04)' },
  pillText: {
    fontSize: 11,
    fontWeight: '600',
  },
  pillTextOngoing: { color: '#166534' },
  pillTextExpiry:  { color: '#B91C1C' },
  pillTextNeutral: { color: TEXT_2ND },

  // ── BODY CARD (terms + fair use) ────────────────────────────────────
  bodyCard: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 22,
  },
  description: {
    fontSize: 14,
    lineHeight: 21,
    color: TEXT_2ND,
    marginBottom: 16,
  },
  section: {
    marginBottom: 14,
  },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: NAVY,
  },
  termsList: {
    gap: 0,
  },
  termsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.04)',
  },
  termsRowLast: {
    borderBottomWidth: 0,
  },
  termsText: {
    flex: 1,
    fontSize: 12.5,
    lineHeight: 19,
    color: TEXT_2ND,
  },
  fairUse: {
    backgroundColor: CREAM,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
    marginTop: 6,
  },
  fairTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: NAVY,
  },
  fairItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 4,
  },
  fairItemText: {
    flex: 1,
    fontSize: 11.5,
    lineHeight: 18,
    color: TEXT_2ND,
  },
})
