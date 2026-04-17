import React, { useState, useCallback, useMemo } from 'react'
import { View, ScrollView, StyleSheet, ActivityIndicator, Share } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Star } from 'lucide-react-native'
import { Text } from '@/design-system/Text'
import { color, spacing, layout } from '@/design-system/tokens'
import { useAuthStore } from '@/stores/auth'
import { useVoucherDetail } from '../hooks/useVoucherDetail'
import { useRedeem } from '../hooks/useRedeem'
import { useTimeLimited } from '../hooks/useTimeLimited'
import { useFavourite } from '@/hooks/useFavourite'
import { CouponHeader } from '../components/CouponHeader'
import { PerforationLine } from '../components/PerforationLine'
import { CouponCardTop } from '../components/CouponCardTop'
import { CouponBody } from '../components/CouponBody'
import { MerchantRow } from '../components/MerchantRow'
import { HowItWorks } from '../components/HowItWorks'
import { RedeemCTA } from '../components/RedeemCTA'
import { TimeLimitedBanner } from '../components/TimeLimitedBanner'
import { RedeemedBadge } from '../components/RedeemedBadge'
import { PinEntrySheet } from '../components/PinEntrySheet'
import { SuccessPopup } from '../components/SuccessPopup'
import { ShowToStaff } from '../components/ShowToStaff'
import { RedemptionDetailsCard } from '../components/RedemptionDetailsCard'
import { UrgencyBanner } from '../components/UrgencyBanner'

const PAGE_BG = '#F5F0EB'

export function VoucherDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { status, user } = useAuthStore()
  const { data: voucher, isLoading } = useVoucherDetail(id)
  const redeemMutation = useRedeem()

  const isAuthed = status === 'authed'
  const isRedeemed = voucher?.isRedeemedThisCycle ?? false

  const timeLimited = useTimeLimited({
    type: voucher?.type ?? 'BOGO',
    expiryDate: voucher?.expiryDate ?? null,
  })

  const favourite = useFavourite({
    type: 'voucher',
    id: voucher?.id ?? '',
    isFavourited: voucher?.isFavourited ?? false,
  })

  const [showPinSheet, setShowPinSheet] = useState(false)
  const [showSuccessPopup, setShowSuccessPopup] = useState(false)
  const [showStaffScreen, setShowStaffScreen] = useState(false)
  const [pinError, setPinError] = useState<{ code: string; attemptsRemaining?: number } | null>(null)
  const [lockoutSeconds, setLockoutSeconds] = useState(0)

  const ctaState = useMemo(() => {
    if (!isAuthed) return 'subscribe' as const
    if (isRedeemed) return 'already_redeemed' as const
    if (timeLimited.state === 'expired') return 'expired' as const
    if (timeLimited.state === 'outside_window') return 'outside_window' as const
    return 'can_redeem' as const
  }, [isAuthed, isRedeemed, timeLimited.state])

  const handleCTAPress = useCallback(() => {
    if (ctaState === 'subscribe') {
      router.push('/(auth)/subscribe-prompt' as never)
      return
    }
    if (ctaState === 'can_redeem') {
      setPinError(null)
      setShowPinSheet(true)
    }
  }, [ctaState, router])

  const handlePinSubmit = useCallback(async (pin: string) => {
    if (!voucher) return
    try {
      await redeemMutation.mutateAsync({
        voucherId: voucher.id,
        branchId: voucher.merchant.id,
        pin,
      })
      setPinError(null)
      setShowPinSheet(false)
      setShowSuccessPopup(true)
    } catch (err: unknown) {
      const error = err as { code: string; message: string; status: number }
      if (error.code === 'INVALID_PIN') {
        const match = error.message.match(/(\d+) attempts remaining/)
        setPinError({
          code: 'INVALID_PIN',
          attemptsRemaining: match ? parseInt(match[1], 10) : undefined,
        })
      } else if (error.code === 'PIN_RATE_LIMIT_EXCEEDED') {
        setLockoutSeconds(15 * 60)
        setPinError(null)
      } else if (error.code === 'ALREADY_REDEEMED') {
        setShowPinSheet(false)
      } else if (error.code === 'SUBSCRIPTION_REQUIRED') {
        setShowPinSheet(false)
        router.push('/(auth)/subscribe-prompt' as never)
      }
    }
  }, [voucher, redeemMutation, router])

  const handleShare = useCallback(async () => {
    if (!voucher) return
    await Share.share({
      message: `Check out "${voucher.title}" at ${voucher.merchant.businessName} on Redeemo!`,
    })
  }, [voucher])

  if (isLoading || !voucher) {
    return (
      <View style={styles.loadingContainer} accessibilityLabel="Loading voucher details">
        <ActivityIndicator size="large" color={color.brandRose} />
      </View>
    )
  }

  const isExpired = timeLimited.state === 'expired'

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Coupon Header */}
        <View style={{ position: 'relative' }}>
          <CouponHeader
            voucherType={voucher.type}
            title={voucher.title}
            description={voucher.description}
            estimatedSaving={voucher.estimatedSaving}
            isFavourited={favourite.isFavourited}
            onToggleFavourite={favourite.toggle}
            onShare={handleShare}
            isRedeemed={isRedeemed}
            isExpired={isExpired}
          >
            {timeLimited.state !== 'inactive' && (
              <TimeLimitedBanner
                state={timeLimited.state}
                formattedCountdown={timeLimited.formattedCountdown}
                expiryDateFormatted={timeLimited.expiryDateFormatted}
                nextWindowLabel={timeLimited.nextWindowLabel}
                scheduleLabel={timeLimited.scheduleLabel}
              />
            )}
          </CouponHeader>

          {/* Badge positioned OUTSIDE header (sibling, not child) */}
          {isRedeemed && <RedeemedBadge variant="redeemed" />}
          {isExpired && !isRedeemed && <RedeemedBadge variant="expired" />}
        </View>

        {/* Perforation line */}
        <PerforationLine />

        {/* Coupon card top */}
        <CouponCardTop
          imageUrl={voucher.imageUrl}
          voucherType={voucher.type}
          expiryDate={voucher.expiryDate}
          terms={voucher.terms}
          isRedeemed={isRedeemed}
        />

        {/* Mid perforation */}
        <PerforationLine variant="small" />

        {/* Coupon body */}
        <CouponBody terms={voucher.terms} isRedeemed={isRedeemed} />

        {/* Urgency banner for time-limited vouchers */}
        {timeLimited.state !== 'inactive' && (
          <UrgencyBanner
            state={timeLimited.state}
            expiryDateFormatted={timeLimited.expiryDateFormatted}
            nextWindowLabel={timeLimited.nextWindowLabel}
            scheduleLabel={timeLimited.scheduleLabel}
          />
        )}

        {/* Merchant card */}
        <MerchantRow
          merchantId={voucher.merchant.id}
          businessName={voucher.merchant.businessName}
          logoUrl={voucher.merchant.logoUrl}
          category={null}
          branchName={null}
          distance={null}
          isRedeemed={isRedeemed}
        />

        {/* Redemption details (Screen 8) */}
        {isRedeemed && redeemMutation.data && (
          <RedemptionDetailsCard
            redemptionCode={redeemMutation.data.redemptionCode}
            branchName="Branch"
            redeemedAt={redeemMutation.data.redeemedAt}
          />
        )}

        {/* Rate & Review CTA (Screen 8) */}
        {isRedeemed && (
          <View style={styles.reviewCTA}>
            <Star size={14} color="#7C3AED" />
            <Text variant="label.lg" style={styles.reviewText}>Rate & Review {voucher.merchant.businessName}</Text>
          </View>
        )}

        {/* How It Works (Screen 1 only) */}
        {isAuthed && !isRedeemed && !isExpired && <HowItWorks />}

        {/* Bottom spacing for sticky CTA */}
        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Sticky CTA */}
      <RedeemCTA
        state={ctaState}
        onPress={handleCTAPress}
        scheduleLabel={timeLimited.scheduleLabel}
      />

      {/* PIN Entry Sheet */}
      <PinEntrySheet
        visible={showPinSheet}
        onDismiss={() => setShowPinSheet(false)}
        onSubmit={handlePinSubmit}
        merchantName={voucher.merchant.businessName}
        merchantLogo={voucher.merchant.logoUrl}
        branchName="Branch"
        isLoading={redeemMutation.isPending}
        error={pinError}
        lockoutSeconds={lockoutSeconds}
      />

      {/* Success Popup (Screen 7) */}
      {redeemMutation.data && (
        <SuccessPopup
          visible={showSuccessPopup}
          redemptionCode={redeemMutation.data.redemptionCode}
          voucherTitle={voucher.title}
          voucherType={voucher.type}
          merchantName={voucher.merchant.businessName}
          branchName="Branch"
          imageUrl={voucher.imageUrl}
          redeemedAt={redeemMutation.data.redeemedAt}
          onShowToStaff={() => { setShowSuccessPopup(false); setShowStaffScreen(true) }}
          onRateReview={() => { /* navigate to review */ }}
          onDone={() => setShowSuccessPopup(false)}
        />
      )}

      {/* Show to Staff (Screen 7b) */}
      {redeemMutation.data && (
        <ShowToStaff
          visible={showStaffScreen}
          redemptionCode={redeemMutation.data.redemptionCode}
          voucherTitle={voucher.title}
          voucherType={voucher.type}
          merchantName={voucher.merchant.businessName}
          branchName="Branch"
          customerName={user ? `${user.firstName} ${user.email.charAt(0).toUpperCase()}.` : 'Customer'}
          redeemedAt={redeemMutation.data.redeemedAt}
          onDone={() => setShowStaffScreen(false)}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PAGE_BG },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: PAGE_BG },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 0 },
  reviewCTA: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    marginHorizontal: 14,
    marginTop: spacing[4],
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(124,58,237,0.06)',
    borderWidth: 1.5,
    borderColor: '#7C3AED',
  },
  reviewText: { color: '#7C3AED', fontWeight: '700', fontSize: 14 },
})
