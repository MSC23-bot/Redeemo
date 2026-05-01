import React from 'react'
import { View, ActivityIndicator, StyleSheet, ScrollView, Pressable } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { Text, color, spacing, layout, radius } from '@/design-system'
import { ArrowLeft } from '@/design-system/icons'
import { useMerchantProfile } from '@/features/merchant/hooks/useMerchantProfile'

// M1 SKELETON. Renders only enough to verify the data layer end-to-end:
// loading → error → minimal "merchant card" with name / descriptor / open
// status. The full surface (hero / meta / sticky tab bar / vouchers / about
// / branches / reviews / sheets / free-user gate) lands in M2 against this
// same hook return value.
type Props = { id: string | undefined }

export function MerchantProfileScreen({ id }: Props) {
  const insets = useSafeAreaInsets()
  const { data, isLoading, isError, error } = useMerchantProfile(id)

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} accessibilityLabel="Back" hitSlop={8}>
          <ArrowLeft size={24} color={color.text.primary} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {!id && (
          <ErrorBlock title="No merchant id" detail="The route is missing a merchant identifier." />
        )}

        {isLoading && (
          <View style={styles.loading} accessibilityLabel="Loading merchant">
            <ActivityIndicator color={color.brandRose} />
          </View>
        )}

        {isError && (
          <ErrorBlock
            title="Couldn't load merchant"
            detail={error instanceof Error ? error.message : 'Please try again.'}
          />
        )}

        {data && (
          <View style={styles.card} accessibilityLabel={`Merchant: ${data.businessName}`}>
            <Text variant="heading.lg">{data.businessName}</Text>
            {data.descriptor ? (
              <Text variant="body.md" color="secondary" style={{ marginTop: spacing[1] }}>
                {data.descriptor}
              </Text>
            ) : null}
            {data.isOpenNow ? (
              <Text variant="body.sm" style={{ marginTop: spacing[3], color: color.success }}>
                Open now
              </Text>
            ) : (
              <Text variant="body.sm" color="secondary" style={{ marginTop: spacing[3] }}>
                Closed
              </Text>
            )}
            <Text variant="label.md" color="tertiary" style={{ marginTop: spacing[4] }}>
              M1 skeleton — full surface (vouchers, about, branches, reviews) lands in M2.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  )
}

function ErrorBlock({ title, detail }: { title: string; detail: string }) {
  return (
    <View style={styles.card} accessibilityRole="alert" accessibilityLabel={`${title}. ${detail}`}>
      <Text variant="heading.sm">{title}</Text>
      <Text variant="body.sm" color="secondary" style={{ marginTop: spacing[2] }}>
        {detail}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: color.surface.page,
  },
  topBar: {
    paddingHorizontal: layout.screenPaddingH,
    paddingVertical: spacing[3],
  },
  content: {
    padding: layout.screenPaddingH,
    paddingBottom: spacing[8],
  },
  loading: {
    paddingVertical: spacing[8],
    alignItems: 'center',
  },
  card: {
    padding: spacing[5],
    backgroundColor: color.surface.tint,
    borderRadius: radius.lg,
  },
})
