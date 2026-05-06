import React from 'react'
import { View, StyleSheet } from 'react-native'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { Check, Clock, FileText, Home, Info, Shield, Tag } from 'lucide-react-native'
import { Text } from '@/design-system/Text'
import type { VoucherType } from '@/lib/api/voucher'
import { voucherGradient } from '../utils/voucherTheme'
import {
  FAIR_USE_TITLE,
  deriveDineInPill,
  fairUseLinesForVoucherType,
  splitTermsIntoBullets,
} from '../constants/productCopy'

type CouponTopCardProps = {
  type: VoucherType
  imageUrl: string | null
  expiryDate: string | null  // ISO
  isMultiBranch: boolean
  /**
   * Voucher terms — passed through to derive the "Dine-in only" pill
   * from terms content. Per v4 mockup the pill row sits in the top
   * card; the terms themselves render in the bottom card.
   */
  terms: string | null
}

type CouponBodyCardProps = {
  /**
   * Voucher type — drives the Fair Use lines via
   * fairUseLinesForVoucherType(). BOGO gets the guest/group rule;
   * other types get the universal three.
   */
  type: VoucherType
  /**
   * Voucher terms — backend stores this as a single string; we split
   * into bullet items for display via splitTermsIntoBullets().
   * Description is intentionally NOT shown here — it lives in the
   * coupon header so it's the first thing users see (per v4 mockup).
   */
  terms: string | null
}

const NAVY        = '#010C35'
const TEXT_2ND    = '#4B5563'
const TEXT_MUTED  = '#9CA3AF'
const SAVING_GRN  = '#16A34A'
const ROSE        = '#E20C04'
const CREAM       = '#FFF9F5'

/**
 * Coupon TOP card — banner image (or gradient placeholder) + voucher
 * info pills. Sits between the outer perforation (under header) and
 * the inner perforation (above body). Per v4 §coupon-top-card.
 */
export function CouponTopCard({ type, imageUrl, expiryDate, isMultiBranch, terms }: CouponTopCardProps) {
  const expiryLabel = expiryDate
    ? `Expires ${new Date(expiryDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
    : null
  const dineInLabel = deriveDineInPill(terms)

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
              <Text variant="label.md" style={styles.bannerLabel}>VOUCHER BANNER IMAGE</Text>
            </View>
          </>
        )}
      </View>

      <View style={styles.infoBlock}>
        <Text variant="label.md" style={styles.infoTitle}>VOUCHER DETAILS</Text>
        <View style={styles.pillsRow}>
          {expiryLabel ? (
            <Pill tone="expiry" icon={<Clock size={14} color="#B91C1C" strokeWidth={2.2} />}>
              {expiryLabel}
            </Pill>
          ) : (
            <Pill tone="ongoing" icon={<Check size={14} color="#166534" strokeWidth={2.4} />}>
              No expiry
            </Pill>
          )}
          {dineInLabel ? (
            <Pill tone="neutral" icon={<Home size={14} color={TEXT_2ND} strokeWidth={2} />}>
              {dineInLabel}
            </Pill>
          ) : null}
          <Pill tone="neutral" icon={<Tag size={14} color={TEXT_2ND} strokeWidth={2} />}>
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
 *
 * Description is NOT rendered here — it appears in the CouponHeader
 * (per v4 mockup screen 1). Showing it twice on the same screen was
 * a Round-1 visual regression.
 */
export function CouponBodyCard({ type, terms }: CouponBodyCardProps) {
  const termsList    = splitTermsIntoBullets(terms)
  const fairUseLines = fairUseLinesForVoucherType(type)

  return (
    <View style={styles.bodyCard} testID="coupon-body">
      {termsList.length > 0 ? (
        <View style={styles.section}>
          <View style={styles.sectionHeading}>
            <FileText size={17} color={ROSE} strokeWidth={2} />
            <Text variant="label.md" style={styles.sectionTitle}>Terms &amp; Conditions</Text>
          </View>
          <View style={styles.termsList}>
            {termsList.map((line, i) => (
              <View key={i} style={[styles.termsRow, i === termsList.length - 1 && styles.termsRowLast]}>
                <Check size={15} color={SAVING_GRN} strokeWidth={2.4} />
                <Text variant="body.sm" style={styles.termsText}>{line}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      <View style={styles.fairUse}>
        <View style={styles.fairHeading}>
          <Shield size={16} color={ROSE} strokeWidth={2} />
          <Text variant="label.md" style={styles.fairTitle}>{FAIR_USE_TITLE}</Text>
        </View>
        {fairUseLines.map((line, i) => (
          <View key={i} style={styles.fairItem}>
            <Info size={13} color={TEXT_MUTED} strokeWidth={2} />
            <Text variant="body.sm" style={styles.fairItemText}>{line}</Text>
          </View>
        ))}
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

const styles = StyleSheet.create({
  // ── TOP CARD (banner + pills) ──────────────────────────────────────
  topCard: {
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  banner: {
    height: 180,
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
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 3,
  },
  infoBlock: {
    paddingHorizontal: 22,
    paddingTop: 20,
    paddingBottom: 20,
  },
  infoTitle: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.4,
    color: TEXT_MUTED,
    marginBottom: 14,
  },
  pillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 9,
  },
  pillOngoing: { backgroundColor: '#ECFDF5' },
  pillExpiry:  { backgroundColor: '#FEF2F2' },
  pillNeutral: { backgroundColor: 'rgba(0,0,0,0.05)' },
  pillText: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  pillTextOngoing: { color: '#166534' },
  pillTextExpiry:  { color: '#B91C1C' },
  pillTextNeutral: { color: TEXT_2ND },

  // ── BODY CARD (terms + fair use) ────────────────────────────────────
  bodyCard: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 26,
  },
  section: {
    marginBottom: 18,
  },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: NAVY,
  },
  termsList: {
    gap: 0,
  },
  termsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.04)',
  },
  termsRowLast: {
    borderBottomWidth: 0,
  },
  termsText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 21,
    color: TEXT_2ND,
  },
  fairUse: {
    backgroundColor: CREAM,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
    marginTop: 8,
  },
  fairHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginBottom: 12,
  },
  fairTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: NAVY,
  },
  fairItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    paddingVertical: 5,
  },
  fairItemText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: TEXT_2ND,
  },
})
