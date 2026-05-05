import React, { useMemo, useCallback } from 'react'
import { View, ScrollView, StyleSheet, Pressable, Alert, Platform } from 'react-native'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { BlurView } from 'expo-blur'
import { ArrowLeft, Heart, Share2 } from 'lucide-react-native'
import { Text } from '@/design-system/Text'
import { color } from '@/design-system/tokens'
import { lightHaptic } from '@/design-system/haptics'
import { RedeemoLoader } from '@/design-system/motion/RedeemoLoader'
import { useSubscription } from '@/hooks/useSubscription'
import { useUserLocation } from '@/hooks/useLocation'
import { useMerchantProfile } from '@/features/merchant/hooks/useMerchantProfile'
import { useCustomerVoucher } from '../hooks/useCustomerVoucher'
import { useTimeLimited } from '../hooks/useTimeLimited'
import { CouponHeader } from '../components/CouponHeader'
import { CouponTopCard, CouponBodyCard } from '../components/CouponBody'
import { PerforationLine } from '../components/PerforationLine'
import { MerchantRow } from '../components/MerchantRow'
import { HowItWorks } from '../components/HowItWorks'
import { RedeemCTA } from '../components/RedeemCTA'
import { RedeemedBadge } from '../components/RedeemedBadge'
import { TimeLimitedBanner } from '../components/TimeLimitedBanner'

/**
 * VoucherDetailScreen — orchestrates the 12-state UI for a voucher's
 * detail + redemption flow. Phase 3C.1c rebaseline (M1: view-only).
 *
 * Visual reference: `.superpowers/brainstorm/88554-1776435672/content/
 * voucher-detail-v4.html` (locked design baseline). Layout is a
 * stacked-coupon silhouette: type-coloured header → outer perforation
 * → white top card (banner + info pills) → inner perforation → white
 * body card (terms + fair use). Then merchant attribution row, the
 * 4-step How It Works timeline, and a sticky bottom CTA.
 *
 * Data sources (locked dual-endpoint pattern, plan §3 D2):
 *   • `useCustomerVoucher(voucherId)` → voucher row + isRedeemedThisCycle
 *     + isFavourited from `GET /api/v1/customer/vouchers/:id`.
 *   • `useMerchantProfile(merchantId, { branchId })` → branch list +
 *     selectedBranch + distance for the branch-attribution UX.
 *
 * Branch-attribution contract (plan §11):
 *   • The redemption branch comes ONLY from `merchant.selectedBranch.id`,
 *     resolved server-side from the URL's `?branch=<id>` param OR
 *     cold-open fallback (nearest by GPS / `isMainBranch`).
 *   • Display surface MUST surface "Redeem at <branchName>" prominently
 *     before any redeem attempt (handled by `<MerchantRow>`).
 *   • Branch is attribution-only; voucher eligibility
 *     (`isRedeemedThisCycle`) is branch-INDEPENDENT.
 *
 * 12-state derivation (M1 view-only — M2/M3 add states 10/11/12):
 *   1.  Free user — not subscribed → "Subscribe to redeem" CTA.
 *   2.  Can redeem — subscribed + voucher ACTIVE + not yet redeemed.
 *   3.  Already redeemed this cycle — `isRedeemedThisCycle` true.
 *   4.  Voucher expired — past expiryDate.
 *   5/6/7. Time-limited variants — backend window data missing in M1
 *       (see useTimeLimited.ts header) so collapses to state 2 today
 *       with a "Time-limited" badge. Future backend additive field
 *       unlocks states 5/6/7 properly.
 *   8.  Cycle-locked from another voucher — defensive, same as 2 today.
 *   9.  Loading — initial fetch.
 *   10. PIN-entry-active (M2 — not in M1).
 *   11. Success popup (M2 — not in M1).
 *   12. ShowToStaff (M3 — not in M1).
 */

type VoucherStateKey =
  | 'loading'
  | 'error'
  | 'free-user'
  | 'expired'
  | 'redeemed-this-cycle'
  | 'time-limited-unavailable'
  | 'time-limited-urgent'
  | 'time-limited-available'
  | 'can-redeem'

const PAGE_BG = '#F5F0EB'      // v4 cream-stone page background
const COUPON_INSET = 14         // horizontal coupon margin (each side)

export function VoucherDetailScreen() {
  const params = useLocalSearchParams<{ id?: string; branch?: string }>()
  const voucherId = typeof params.id === 'string' ? params.id : undefined
  const branchIdParam = typeof params.branch === 'string' ? params.branch : undefined

  const router = useRouter()
  const insets = useSafeAreaInsets()

  const { isSubscribed, isSubLoading } = useSubscription()
  const { location } = useUserLocation()

  const voucherQuery = useCustomerVoucher(voucherId)
  const voucher = voucherQuery.data ?? null

  const merchantProfileOpts: { lat?: number; lng?: number; branchId?: string } = {
    ...(location ? { lat: location.lat, lng: location.lng } : {}),
    ...(branchIdParam ? { branchId: branchIdParam } : {}),
  }
  const merchantQuery = useMerchantProfile(voucher?.merchant.id, merchantProfileOpts)
  const merchant = merchantQuery.data ?? null

  const timeLimited = useTimeLimited(voucher)

  // Branch context for the redemption attribution UX. Pulled from
  // merchant.selectedBranch — NEVER from merchant.branches[0] or any
  // other source per plan §11 C1. `branchReady` gates the active
  // RedeemCTA: states that require branch attribution (can-redeem,
  // time-limited-available, time-limited-urgent) MUST NOT surface
  // an active CTA before this is true. Without this gate, M2's PIN
  // entry could open with an unresolved or wrong selectedBranch
  // (PR #40 review blocker — corrupts VoucherRedemption.branchId).
  // Declared BEFORE the useMemo below so the closure can read them.
  const selectedBranch = merchant?.selectedBranch ?? null
  const isMultiBranch  = (merchant?.branches.length ?? 0) > 1
  const branchName     = selectedBranch?.name ?? null
  const branchDistance = selectedBranch?.distance ?? null
  const merchantDescriptor = merchant?.descriptor ?? null
  const branchReady    = !!selectedBranch
  const branchErrored  = merchantQuery.isError || (
    !!merchant && !merchant.selectedBranch
  )

  // ── 12-state derivation ────────────────────────────────────────────
  const stateKey: VoucherStateKey = useMemo(() => {
    if (voucherQuery.isLoading || isSubLoading) return 'loading'
    if (voucherQuery.isError || !voucher) return 'error'
    if (branchErrored) return 'error'

    if (voucher.expiryDate) {
      const exp = new Date(voucher.expiryDate)
      if (exp.getTime() <= Date.now()) return 'expired'
    }

    if (voucher.isRedeemedThisCycle) return 'redeemed-this-cycle'

    if (!isSubscribed) return 'free-user'

    if (timeLimited.isTimeLimited) {
      if (!timeLimited.isCurrentlyAvailable) return 'time-limited-unavailable'
      if (timeLimited.isUrgent) return 'time-limited-urgent'
      return 'time-limited-available'
    }

    return 'can-redeem'
  }, [voucherQuery.isLoading, voucherQuery.isError, voucher, isSubLoading, isSubscribed, timeLimited, branchErrored])

  const handleBack = useCallback(() => {
    lightHaptic()
    router.back()
  }, [router])

  const handleFav = useCallback(() => {
    lightHaptic()
    Alert.alert('Coming next milestone', 'Voucher favourite toggle ships in M2.')
  }, [])

  const handleShare = useCallback(() => {
    lightHaptic()
    Alert.alert('Coming next milestone', 'Voucher share ships in M2.')
  }, [])

  const handleChangeBranch = useCallback(() => {
    Alert.alert(
      'Coming next milestone',
      'Branch picker for changing the redemption branch ships in M2.',
    )
  }, [])

  const handleMerchantTap = useCallback(() => {
    if (voucher && merchant) {
      router.push(`/(app)/merchant/${voucher.merchant.id}` as never)
    }
  }, [router, voucher, merchant])

  // RedeemCTA derivation per state. Active states gate on `branchReady`.
  const cta = useMemo(() => {
    switch (stateKey) {
      case 'free-user':
        return { label: 'Subscribe to redeem — £6.99/mo', disabled: false, variant: 'subscribe' as const, testID: 'redeem-cta-subscribe' }
      case 'can-redeem':
      case 'time-limited-available':
      case 'time-limited-urgent':
        if (!branchReady) {
          return { label: 'Resolving branch…', disabled: true, variant: 'primary' as const, testID: 'redeem-cta-branch-loading' }
        }
        return { label: 'Redeem this voucher', disabled: false, variant: 'primary' as const, testID: 'redeem-cta-active' }
      case 'redeemed-this-cycle':
        return { label: 'Already redeemed this cycle', disabled: true, variant: 'primary' as const, testID: 'redeem-cta-redeemed' }
      case 'expired':
        return { label: 'Expired', disabled: true, variant: 'primary' as const, testID: 'redeem-cta-expired' }
      case 'time-limited-unavailable':
        return { label: 'Currently unavailable', disabled: true, variant: 'primary' as const, testID: 'redeem-cta-unavailable' }
      default:
        return null
    }
  }, [stateKey, branchReady])

  const handleCTA = useCallback(() => {
    if (stateKey === 'free-user') {
      router.push('/(auth)/subscription-prompt' as never)
      return
    }
    Alert.alert(
      'Coming next milestone',
      'PIN entry + redemption flow ships in M2.',
    )
  }, [stateKey, router])

  // ── Render ───────────────────────────────────────────────────────────

  if (stateKey === 'loading') {
    return (
      <View style={[styles.fullscreen, { paddingTop: insets.top }]} testID="voucher-detail-loading">
        <NavRow onBack={handleBack} insetTop={insets.top} fav={null} onFav={undefined} onShare={undefined} />
        <View style={styles.loadingCenter}>
          <RedeemoLoader size="lg" accessibilityLabel="Loading voucher" />
        </View>
      </View>
    )
  }

  if (stateKey === 'error' || !voucher) {
    const errorReason: 'voucher' | 'branch' =
      (!voucher || voucherQuery.isError) ? 'voucher' : 'branch'
    const errorTitle = errorReason === 'voucher' ? 'Voucher unavailable' : 'Couldn’t load branch'
    const errorBody  = errorReason === 'voucher'
      ? 'This voucher is no longer available. The merchant may have removed it or it expired.'
      : 'We couldn’t resolve the branch you’re redeeming at. Check your connection and try again.'
    return (
      <View style={[styles.fullscreen, { paddingTop: insets.top }]} testID="voucher-detail-error" data-error-reason={errorReason}>
        <NavRow onBack={handleBack} insetTop={insets.top} fav={null} onFav={undefined} onShare={undefined} />
        <View style={styles.errorCenter}>
          <Text variant="heading.sm" style={styles.errorTitle}>{errorTitle}</Text>
          <Text variant="body.sm" color="secondary" style={styles.errorBody}>{errorBody}</Text>
          <Pressable onPress={handleBack} style={styles.errorBack} accessibilityRole="button" accessibilityLabel="Go back">
            <Text variant="label.md" style={styles.errorBackText}>Go back</Text>
          </Pressable>
        </View>
      </View>
    )
  }

  return (
    <View style={[styles.fullscreen]} testID={`voucher-detail-state-${stateKey}`}>
      <NavRow
        onBack={handleBack}
        insetTop={insets.top}
        fav={voucher.isFavourited}
        onFav={handleFav}
        onShare={handleShare}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Coupon (header → perf → top-card → perf → body) ── */}
        <View style={styles.coupon}>
          <CouponHeader
            type={voucher.type}
            title={voucher.title}
            description={voucher.description}
            estimatedSaving={voucher.estimatedSaving}
          />

          <PerforationLine pageBg={PAGE_BG} variant="outer" />

          <View style={styles.couponCardWrap}>
            <View style={styles.couponTopRound}>
              <CouponTopCard
                type={voucher.type}
                imageUrl={voucher.imageUrl}
                expiryDate={voucher.expiryDate}
                isMultiBranch={isMultiBranch}
              />
            </View>

            <View style={styles.innerPerfWrap}>
              <PerforationLine pageBg={PAGE_BG} variant="inner" />
            </View>

            <View style={styles.couponBottomRound}>
              <CouponBodyCard
                description={voucher.description}
                terms={voucher.terms}
              />
            </View>
          </View>
        </View>

        {stateKey === 'redeemed-this-cycle' ? <RedeemedBadge /> : null}

        {timeLimited.isTimeLimited ? (
          <View style={styles.tlBanner}>
            <TimeLimitedBanner
              isCurrentlyAvailable={timeLimited.isCurrentlyAvailable}
              isUrgent={timeLimited.isUrgent}
              minutesRemaining={timeLimited.minutesRemaining}
            />
          </View>
        ) : null}

        <MerchantRow
          merchantName={voucher.merchant.businessName}
          merchantLogoUrl={voucher.merchant.logoUrl}
          merchantDescriptor={merchantDescriptor}
          branchName={branchName}
          branchDistanceMeters={branchDistance}
          isMultiBranch={isMultiBranch}
          onChangeBranch={handleChangeBranch}
          onPress={handleMerchantTap}
        />

        <HowItWorks />

        <View style={{ height: 110 }} />
      </ScrollView>

      {cta ? (
        <View style={[styles.ctaWrap, { paddingBottom: insets.bottom + 14 }]}>
          <RedeemCTA
            label={cta.label}
            disabled={cta.disabled}
            variant={cta.variant}
            onPress={handleCTA}
            testID={cta.testID}
          />
        </View>
      ) : null}
    </View>
  )
}

// ── Nav row (frosted glass — back, share, favourite) ────────────────────────

function NavRow({
  onBack,
  insetTop,
  fav,
  onFav,
  onShare,
}: {
  onBack: () => void
  insetTop: number
  fav: boolean | null
  onFav: (() => void) | undefined
  onShare: (() => void) | undefined
}) {
  return (
    <View style={[styles.navRow, { top: insetTop + 8 }]}>
      <FrostedNavButton onPress={onBack} accessibilityLabel="Go back">
        <ArrowLeft size={18} color="#FFFFFF" strokeWidth={2.4} />
      </FrostedNavButton>

      <View style={styles.navRight}>
        {onShare ? (
          <FrostedNavButton onPress={onShare} accessibilityLabel="Share voucher">
            <Share2 size={18} color="#FFFFFF" strokeWidth={2.2} />
          </FrostedNavButton>
        ) : null}
        {fav !== null && onFav ? (
          <FrostedNavButton onPress={onFav} accessibilityLabel={fav ? 'Remove from favourites' : 'Add to favourites'}>
            <Heart
              size={18}
              color="#FFFFFF"
              fill={fav ? '#FFFFFF' : 'none'}
              strokeWidth={2.2}
            />
          </FrostedNavButton>
        ) : null}
      </View>
    </View>
  )
}

function FrostedNavButton({
  onPress,
  accessibilityLabel,
  children,
}: {
  onPress: () => void
  accessibilityLabel: string
  children: React.ReactNode
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [styles.navBtn, pressed && styles.navBtnPressed]}
    >
      {Platform.OS === 'android' ? (
        // BlurView on Android can be expensive / inconsistent — use a
        // semi-transparent fallback that visually approximates the
        // frosted look.
        <View style={[StyleSheet.absoluteFillObject, styles.navBtnFallback]} />
      ) : (
        <BlurView intensity={28} tint="dark" style={StyleSheet.absoluteFillObject} />
      )}
      <View style={styles.navBtnInner}>{children}</View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  fullscreen: {
    flex: 1,
    backgroundColor: PAGE_BG,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 0,
  },

  // ── Top nav (frosted) ───────────────────────────────────────────────
  navRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  navRight: {
    flexDirection: 'row',
    gap: 8,
  },
  navBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  navBtnPressed: {
    opacity: 0.85,
  },
  navBtnFallback: {
    backgroundColor: 'rgba(0,0,0,0.32)',
  },
  navBtnInner: {
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Coupon stack ────────────────────────────────────────────────────
  coupon: {
    // The CouponHeader edges run to the screen edges (full-bleed). The
    // top + body cards are inset slightly via couponCardWrap so the
    // perforation cutouts can punch into the page background visibly.
  },
  couponCardWrap: {
    marginHorizontal: COUPON_INSET,
  },
  couponTopRound: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  couponBottomRound: {
    backgroundColor: '#FFFFFF',
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  innerPerfWrap: {
    backgroundColor: '#FFFFFF',
    overflow: 'visible',
  },

  // ── Time-limited banner spacing ─────────────────────────────────────
  tlBanner: {
    marginTop: 12,
    marginHorizontal: 20,
  },

  // ── Sticky CTA ──────────────────────────────────────────────────────
  ctaWrap: {
    paddingTop: 8,
    backgroundColor: PAGE_BG,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.04)',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: -2 },
    elevation: 4,
  },

  // ── Loading + error ─────────────────────────────────────────────────
  loadingCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: color.navy,
  },
  errorBody: {
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 20,
    color: '#6B7280',
    paddingHorizontal: 16,
  },
  errorBack: {
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: color.navy,
  },
  errorBackText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
})
