import React, { useState } from 'react'
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Alert } from 'react-native'
import { BottomSheet } from '@/design-system/motion/BottomSheet'
import { useCancelSubscription } from '../hooks/useCancelSubscription'
import type { Subscription } from '@/lib/api/subscription'

interface Props {
  visible: boolean
  onDismiss: () => void
  subscription: Subscription | null | undefined
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function billingSuffix(interval: 'MONTHLY' | 'ANNUAL'): string {
  return interval === 'ANNUAL' ? '/yr' : '/mo'
}

export function SubscriptionManagementSheet({ visible, onDismiss, subscription }: Props) {
  const { mutate: cancel, isPending } = useCancelSubscription()
  const [cancelError, setCancelError] = useState<string | null>(null)

  const renewIso = subscription?.currentPeriodEnd ?? null
  const renewDate = renewIso ? formatDate(renewIso) : null

  const handleCancel = () => {
    Alert.alert(
      'Cancel subscription?',
      `Your access continues until ${renewDate ?? 'the end of your billing period'}. You can resubscribe at any time.`,
      [
        { text: 'Keep my subscription', style: 'cancel' },
        {
          text: 'Cancel subscription',
          style: 'destructive',
          onPress: () => {
            setCancelError(null)
            cancel(undefined, {
              onSuccess: () => onDismiss(),
              onError: () => setCancelError('Failed to cancel. Please try again.'),
            })
          },
        },
      ],
    )
  }

  if (!subscription) {
    return (
      <BottomSheet visible={visible} onDismiss={onDismiss} accessibilityLabel="Subscription">
        <View style={styles.content}>
          <Text style={styles.title}>Subscription</Text>
          <View style={styles.emptyCard}>
            <Text style={styles.emptyHeading}>No active plan</Text>
            <Text style={styles.emptyBody}>Subscribe to unlock voucher redemption.</Text>
          </View>
        </View>
      </BottomSheet>
    )
  }

  const isAlreadyCancelling = subscription.cancelAtPeriodEnd
  const planName = subscription.plan?.name ?? 'Redeemo'
  const priceGbp = subscription.plan?.priceGbp ?? 0
  const suffix = billingSuffix(subscription.plan?.billingInterval ?? 'MONTHLY')

  return (
    <BottomSheet
      visible={visible}
      onDismiss={onDismiss}
      accessibilityLabel="Subscription management"
    >
      <View style={styles.content}>
        <Text style={styles.title}>Subscription</Text>

        {/* Plan card */}
        <View style={styles.planCard}>
          <Text style={styles.planName}>
            {planName} · £{priceGbp.toFixed(2)}{suffix}
          </Text>
          {renewDate && (
            <Text style={styles.planDate}>
              {isAlreadyCancelling ? `Access until ${renewDate}` : `Renews ${renewDate}`}
            </Text>
          )}
        </View>

        {!isAlreadyCancelling && (
          <>
            {renewDate && (
              <View style={styles.callout}>
                <Text style={styles.calloutText}>
                  Your access continues until {renewDate} even after cancelling.
                </Text>
              </View>
            )}
            {cancelError && <Text style={styles.errorText}>{cancelError}</Text>}
            <Pressable
              style={[styles.cancelButton, isPending && styles.buttonDisabled]}
              onPress={handleCancel}
              disabled={isPending}
              accessibilityRole="button"
              accessibilityLabel="Cancel subscription"
            >
              {isPending ? (
                <ActivityIndicator color="#DC2626" />
              ) : (
                <Text style={styles.cancelButtonText}>Cancel subscription</Text>
              )}
            </Pressable>
          </>
        )}

        {isAlreadyCancelling && (
          <View style={styles.callout}>
            <Text style={styles.calloutText}>
              Cancellation scheduled. You have access until {renewDate ?? 'the end of your billing period'}.
            </Text>
          </View>
        )}
      </View>
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  content: { padding: 20 },
  title: { fontSize: 18, fontWeight: '700', color: '#010C35', marginBottom: 16 },
  planCard: { backgroundColor: '#F9FAFB', borderRadius: 12, padding: 16, marginBottom: 16 },
  planName: { fontSize: 16, fontWeight: '600', color: '#010C35', marginBottom: 4 },
  planDate: { fontSize: 13, color: 'rgba(1,12,53,0.5)' },
  callout: { backgroundColor: '#FEF3C7', borderRadius: 10, padding: 12, marginBottom: 16 },
  calloutText: { fontSize: 13, color: '#92400E', lineHeight: 20 },
  cancelButton: {
    borderWidth: 1.5,
    borderColor: '#DC2626',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.5 },
  cancelButtonText: { color: '#DC2626', fontSize: 15, fontWeight: '600' },
  errorText: { fontSize: 13, color: '#DC2626', marginBottom: 12 },
  emptyCard: { backgroundColor: '#F9FAFB', borderRadius: 12, padding: 20, alignItems: 'center' },
  emptyHeading: { fontSize: 16, fontWeight: '600', color: '#010C35', marginBottom: 6 },
  emptyBody: { fontSize: 13, color: 'rgba(1,12,53,0.5)', textAlign: 'center' },
})
