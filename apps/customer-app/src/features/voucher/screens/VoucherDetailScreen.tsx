import React, { useMemo, useCallback } from 'react'
import { View, ScrollView, StyleSheet, Pressable, Alert } from 'react-native'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ArrowLeft, Heart } from 'lucide-react-native'
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
import { CouponBody } from '../components/CouponBody'
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
  | 'loading'                  // voucher fetch / sub-status fetch in flight
  | 'error'                    // voucher fetch failed / voucher null / merchant fetch failed / selectedBranch null
  | 'free-user'                // not subscribed → subscribe CTA (does not need branch context)
  | 'expired'                  // voucher.expiryDate < now (disabled CTA, no branch needed)
  | 'redeemed-this-cycle'      // server-side cycle-window check returned true (disabled CTA, no branch needed)
  | 'time-limited-unavailable' // outside window
  | 'time-limited-urgent'      // <30min remaining
  | 'time-limited-available'   // within window — REQUIRES branch context
  | 'can-redeem'               // default redeemable state — REQUIRES branch context

export function VoucherDetailScreen() {
  const params = useLocalSearchParams<{ id?: string; branch?: string }>()
  const voucherId = typeof params.id === 'string' ? params.id : undefined
  // Branch context arrives as a URL query param per plan §11 C1. Cold-
  // open (no param) falls through to the merchant-profile resolver's
  // nearest-by-GPS / isMainBranch logic.
  const branchIdParam = typeof params.branch === 'string' ? params.branch : undefined

  const router = useRouter()
  const insets = useSafeAreaInsets()

  const { isSubscribed, isSubLoading } = useSubscription()
  const { location } = useUserLocation()

  const voucherQuery = useCustomerVoucher(voucherId)
  const voucher = voucherQuery.data ?? null

  // Merchant profile fetched only once we know the merchant id from the
  // voucher payload — saves a wasted query when the voucher id is invalid.
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
  const branchReady    = !!selectedBranch
  const branchErrored  = merchantQuery.isError || (
    !!merchant && !merchant.selectedBranch                 // server returned merchant with no selectedBranch
  )

  // ── 12-state derivation ────────────────────────────────────────────
  const stateKey: VoucherStateKey = useMemo(() => {
    // Loading (state 9): voucher fetch in flight, OR subscription
    // state hasn't resolved yet (avoids flashing "Subscribe to redeem"
    // before useSubscription returns).
    if (voucherQuery.isLoading || isSubLoading) return 'loading'
    if (voucherQuery.isError || !voucher) return 'error'

    // Branch context error wins over data states. Triggers when
    // merchantQuery errors or the server returned a merchant with
    // no selectedBranch (e.g. all-suspended fallback). The screen
    // can't safely display a redeem CTA without branch attribution.
    if (branchErrored) return 'error'

    // Voucher EXPIRED (state 4) — wins over everything else once
    // voucher data is in. Disabled CTA, no branch context needed.
    if (voucher.expiryDate) {
      const exp = new Date(voucher.expiryDate)
      if (exp.getTime() <= Date.now()) return 'expired'
    }

    // Already redeemed this cycle (state 3) — backend now applies the
    // cycle-window check (mirrors redemption guard) so this flag is
    // trustworthy across cycle rollovers + cycleAnchorDate resets.
    // Branch-independent per §11 C4. Disabled CTA, no branch context
    // needed.
    if (voucher.isRedeemedThisCycle) return 'redeemed-this-cycle'

    // Free user (state 1) — wins over time-limited / can-redeem so the
    // user always lands on the subscribe path before any other gate.
    // Subscribe CTA does not need branch context.
    if (!isSubscribed) return 'free-user'

    // From here down, states REQUIRE branch context to show an active
    // CTA (per plan §11 / PR #40 review blocker). The state-machine
    // still classifies the voucher correctly; the CTA derivation
    // (below) consumes `branchReady` to gate the active label.

    // TIME_LIMITED variants (states 5/6/7) — M1 stub collapses to
    // available; states 6 + 7 will branch in via useTimeLimited once
    // backend window data is present.
    if (timeLimited.isTimeLimited) {
      if (!timeLimited.isCurrentlyAvailable) return 'time-limited-unavailable'
      if (timeLimited.isUrgent) return 'time-limited-urgent'
      return 'time-limited-available'
    }

    // Default: can redeem (state 2).
    return 'can-redeem'
  }, [voucherQuery.isLoading, voucherQuery.isError, voucher, isSubLoading, isSubscribed, timeLimited, branchErrored])

  // (Branch-context derivations moved above the state-machine useMemo
  // so they're declared before the closure reads them — TDZ avoidance.)

  const handleBack = useCallback(() => {
    lightHaptic()
    router.back()
  }, [router])

  const handleFav = useCallback(() => {
    lightHaptic()
    // M1 stub: favourite toggle wires up in M2 via useFavourite — same
    // hook merchant-profile already uses. For now no-op so the heart
    // button doesn't appear broken.
    Alert.alert('Coming next milestone', 'Voucher favourite toggle ships in M2.')
  }, [])

  const handleChangeBranch = useCallback(() => {
    // M1 stub. M2 wires this to BranchPickerSheet (reusing merchant-
    // profile's picker pattern) → useBranchSelection.select(branchId)
    // → URL updates → merchant profile re-fetches → selectedBranch
    // changes → "Redeem at <newBranch>" updates everywhere.
    Alert.alert(
      'Coming next milestone',
      'Branch picker for changing the redemption branch ships in M2.',
    )
  }, [])

  // RedeemCTA derivation per state. Active states (can-redeem,
  // time-limited-available, time-limited-urgent) gate on `branchReady`
  // — without resolved branch context the CTA is disabled with a
  // "Resolving branch…" label rather than offering an actionable
  // redeem path. PR #40 review blocker: M2's PIN entry must NEVER
  // open without a confirmed selectedBranch.id.
  const cta = useMemo(() => {
    switch (stateKey) {
      case 'free-user':
        return { label: 'Subscribe to redeem', disabled: false, testID: 'redeem-cta-subscribe' }
      case 'can-redeem':
      case 'time-limited-available':
      case 'time-limited-urgent':
        if (!branchReady) {
          return { label: 'Resolving branch…', disabled: true, testID: 'redeem-cta-branch-loading' }
        }
        return { label: 'Redeem voucher', disabled: false, testID: 'redeem-cta-active' }
      case 'redeemed-this-cycle':
        return { label: 'Already redeemed', disabled: true, testID: 'redeem-cta-redeemed' }
      case 'expired':
        return { label: 'Expired', disabled: true, testID: 'redeem-cta-expired' }
      case 'time-limited-unavailable':
        return { label: 'Currently unavailable', disabled: true, testID: 'redeem-cta-unavailable' }
      default:
        return null
    }
  }, [stateKey, branchReady])

  const handleCTA = useCallback(() => {
    if (stateKey === 'free-user') {
      router.push('/(auth)/subscription-prompt' as never)
      return
    }
    // M1 stub for any active redeem path. M2 opens PinEntrySheet here.
    Alert.alert(
      'Coming next milestone',
      'PIN entry + redemption flow ships in M2.',
    )
  }, [stateKey, router])

  // ── Render ───────────────────────────────────────────────────────────

  if (stateKey === 'loading') {
    return (
      <View style={[styles.fullscreen, { paddingTop: insets.top }]} testID="voucher-detail-loading">
        <NavRow onBack={handleBack} insetTop={insets.top} fav={null} onFav={undefined} />
        <View style={styles.loadingCenter}>
          <RedeemoLoader size="lg" accessibilityLabel="Loading voucher" />
        </View>
      </View>
    )
  }

  if (stateKey === 'error' || !voucher) {
    // Distinguish voucher-fetch failure from branch-context failure
    // so the message helps the user. Same testID either way; M2/M3
    // QA can introspect via `data-error-reason` if needed.
    const errorReason: 'voucher' | 'branch' =
      (!voucher || voucherQuery.isError) ? 'voucher' : 'branch'
    const errorTitle = errorReason === 'voucher' ? 'Voucher unavailable' : 'Couldn’t load branch'
    const errorBody  = errorReason === 'voucher'
      ? 'This voucher is no longer available. The merchant may have removed it or it expired.'
      : 'We couldn’t resolve the branch you’re redeeming at. Check your connection and try again.'
    return (
      <View style={[styles.fullscreen, { paddingTop: insets.top }]} testID="voucher-detail-error" data-error-reason={errorReason}>
        <NavRow onBack={handleBack} insetTop={insets.top} fav={null} onFav={undefined} />
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
      <NavRow onBack={handleBack} insetTop={insets.top} fav={voucher.isFavourited} onFav={handleFav} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 56 }]}
        showsVerticalScrollIndicator={false}
      >
        {stateKey === 'redeemed-this-cycle' ? <RedeemedBadge /> : null}

        {timeLimited.isTimeLimited ? (
          <TimeLimitedBanner
            isCurrentlyAvailable={timeLimited.isCurrentlyAvailable}
            isUrgent={timeLimited.isUrgent}
            minutesRemaining={timeLimited.minutesRemaining}
          />
        ) : null}

        <View style={styles.coupon}>
          <CouponHeader
            type={voucher.type}
            title={voucher.title}
            estimatedSaving={voucher.estimatedSaving}
          />
          <PerforationLine />
          <CouponBody
            description={voucher.description}
            terms={voucher.terms}
            expiryDate={voucher.expiryDate}
          />
        </View>

        <MerchantRow
          merchantName={voucher.merchant.businessName}
          merchantLogoUrl={voucher.merchant.logoUrl}
          branchName={branchName}
          isMultiBranch={isMultiBranch}
          onChangeBranch={handleChangeBranch}
        />

        <HowItWorks />
      </ScrollView>

      {cta ? (
        <View style={[styles.ctaWrap, { paddingBottom: insets.bottom + 12 }]}>
          <RedeemCTA
            label={cta.label}
            disabled={cta.disabled}
            onPress={handleCTA}
            testID={cta.testID}
          />
        </View>
      ) : null}
    </View>
  )
}

// ── Nav row (back + favourite) ────────────────────────────────────────────────

function NavRow({
  onBack,
  insetTop,
  fav,
  onFav,
}: {
  onBack: () => void
  insetTop: number
  fav: boolean | null
  onFav: (() => void) | undefined
}) {
  return (
    <View style={[styles.navRow, { top: insetTop + 8 }]}>
      <Pressable
        onPress={onBack}
        style={styles.navBtn}
        accessibilityRole="button"
        accessibilityLabel="Go back"
      >
        <ArrowLeft size={20} color={color.navy} />
      </Pressable>

      {fav !== null && onFav ? (
        <Pressable
          onPress={onFav}
          style={[styles.navBtn, fav && styles.navBtnFavActive]}
          accessibilityRole="button"
          accessibilityLabel={fav ? 'Remove from favourites' : 'Add to favourites'}
        >
          <Heart
            size={20}
            color={fav ? color.brandRose : color.navy}
            fill={fav ? color.brandRose : 'none'}
          />
        </Pressable>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  fullscreen: {
    flex: 1,
    backgroundColor: '#FFF9F5',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 100,
  },
  navRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  navBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  navBtnFavActive: {
    backgroundColor: '#FEE2E2',
  },
  coupon: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  ctaWrap: {
    paddingTop: 4,
    backgroundColor: '#FFF9F5',
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
  },
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
