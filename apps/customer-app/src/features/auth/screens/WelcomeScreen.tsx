import React, { useEffect } from 'react'
import { View, TouchableOpacity, StyleSheet, Alert } from 'react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { StatusBar } from 'expo-status-bar'
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withTiming,
  Easing,
  type SharedValue,
} from 'react-native-reanimated'
import Svg, { Path, Rect, Polyline, Line } from 'react-native-svg'
import { Text } from '@/design-system/Text'
import { scale, ms } from '@/design-system/scale'
import { RedeemoLogo } from '../components/RedeemoLogo'

function AppleIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="#010C35">
      <Path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </Svg>
  )
}

function GoogleIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
      <Path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <Path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 001 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
      <Path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </Svg>
  )
}

function StarIcon({ color }: { color: string }) {
  return (
    <Svg width={7} height={7} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.5}>
      <Path d="M12 2L15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2z" />
    </Svg>
  )
}

function VoucherCard({
  style,
  offsetY,
  rotateDeg,
  type,
  title,
  merchant,
  saving,
  accentColor,
  accentColorEnd,
}: {
  style?: object
  offsetY: SharedValue<number>
  rotateDeg: string
  type: string
  title: string
  merchant: string
  saving: string
  accentColor: string
  accentColorEnd: string
}) {
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: offsetY.value }, { rotate: rotateDeg }],
  }))

  return (
    <Animated.View style={[styles.voucherCard, { shadowColor: accentColor }, style, animStyle]}>
      {/* Pastel peach surface — same on both vouchers so the two cards read
          as a unified design with type-only content variation. Strong
          top-left → bottom-right gradient gives a clear 3D shading; ties
          warm-tone-wise to the brand glow on the screen behind. */}
      <LinearGradient
        colors={['#FFEFE2', '#FFCFB3']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.voucherSurface}
      />

      {/* Left accent stripe */}
      <LinearGradient
        colors={[accentColor, accentColorEnd]}
        style={styles.voucherStripe}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
      />
      <View style={styles.voucherBody}>
        <View style={styles.voucherHead}>
          <View style={[styles.typeBadge, { borderColor: accentColor + '30', backgroundColor: accentColor + '14' }]}>
            <Text style={[styles.typeBadgeText, { color: accentColor }]}>{type}</Text>
          </View>
          <LinearGradient
            colors={['#10B981', '#059669']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.savingPill}
          >
            <Text style={styles.savingText}>{saving}</Text>
          </LinearGradient>
        </View>
        <Text style={styles.voucherTitle}>{title}</Text>
        <Text style={styles.voucherMerchant}>{merchant}</Text>
      </View>
      <View style={styles.voucherFooter}>
        <StarIcon color={accentColor} />
        <Text style={styles.voucherFooterText}>Subscribe to redeem</Text>
      </View>
    </Animated.View>
  )
}

export function WelcomeScreen() {
  const insets = useSafeAreaInsets()

  const floatBack = useSharedValue(0)
  const floatFront = useSharedValue(0)

  useEffect(() => {
    // Larger amplitude (12/14px) than before (5/7px) so the float is
    // actually perceptible. Slightly different durations on each card so
    // they drift out of phase and feel like independent objects rather
    // than a synchronised pair.
    floatBack.value = withRepeat(
      withTiming(-12, { duration: 2400, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    )
    floatFront.value = withRepeat(
      withTiming(-14, { duration: 2100, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    )
  }, [floatBack, floatFront])

  const handleSocialAuth = () =>
    Alert.alert('Coming soon', 'Social sign-in will be available in a future update.')

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <StatusBar style="light" />

      {/* Ambient brand glow — top-right (red-rose) and bottom-left (coral).
          Each is a circular masked LinearGradient blob with the strongest
          colour at the corner closest to the viewport edge fading to
          transparent across the diagonal. Owner explicitly preferred this
          look over a smooth radial fade. */}
      <View pointerEvents="none" style={styles.glowTopRight}>
        <LinearGradient
          colors={['rgba(226,12,4,0.55)', 'rgba(226,12,4,0)']}
          start={{ x: 0.85, y: 0.15 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </View>
      <View pointerEvents="none" style={styles.glowBottomLeft}>
        <LinearGradient
          colors={['rgba(232,74,0,0.45)', 'rgba(232,74,0,0)']}
          start={{ x: 0.15, y: 0.85 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      </View>

      {/* Logo */}
      <View style={styles.logoSection}>
        <RedeemoLogo size={scale(68)} />
        <Text style={styles.wordmark}>Redeemo</Text>
      </View>

      {/* Floating voucher cards. Both cards share the same brand-red accent
          (stripe / type badge / star / shadow) so they read as two
          specimens of the same design system rather than two competing
          colour identities. The TYPE badge text still differentiates
          FREEBIE / BOGO. */}
      <View style={styles.cardsContainer}>
        {/* Back card — FREEBIE */}
        <VoucherCard
          style={styles.cardBack}
          offsetY={floatBack}
          rotateDeg="-4deg"
          type="FREEBIE"
          title={'Free Pastry with\nAny Drink'}
          merchant="The Coffee Room · Birmingham"
          saving="Save £4"
          accentColor="#E20C04"
          accentColorEnd="#E84A00"
        />

        {/* Front card — BOGO */}
        <VoucherCard
          style={styles.cardFront}
          offsetY={floatFront}
          rotateDeg="3deg"
          type="BOGO"
          title={'Buy One Get\nOne Free'}
          merchant="Pasta Palace · Manchester"
          saving="Save £22"
          accentColor="#E20C04"
          accentColorEnd="#E84A00"
        />
      </View>

      {/* Copy */}
      <View style={styles.copySection}>
        <Text style={styles.headline}>
          {'The best places near you.\n'}
          <Text style={styles.headlineAccent}>Member prices.</Text>
        </Text>
        <Text style={styles.subheadline}>
          {'Restaurants, cafes, gyms, salons.\nBrowse free. Save when you’re ready.'}
        </Text>
      </View>

      {/* CTAs */}
      <View style={[styles.ctaSection, { paddingBottom: insets.bottom + 20 }]}>
        {/* Create account gradient pill */}
        <TouchableOpacity
          onPress={() => router.push('/(auth)/register')}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Create your free account"
        >
          <LinearGradient
            colors={['#E20C04', '#E84A00']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.primaryBtn}
          >
            <Text style={styles.primaryBtnText}>Create your free account</Text>
          </LinearGradient>
        </TouchableOpacity>

        {/* Apple + Google */}
        <View style={styles.socialRow}>
          <TouchableOpacity onPress={handleSocialAuth} activeOpacity={0.85} style={styles.appleBtn}>
            <AppleIcon />
            <Text style={styles.appleBtnText}>Apple</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleSocialAuth} activeOpacity={0.85} style={styles.googleBtn}>
            <GoogleIcon />
            <Text style={styles.googleBtnText}>Google</Text>
          </TouchableOpacity>
        </View>

        {/* Sign in link */}
        <TouchableOpacity
          onPress={() => router.push('/(auth)/login')}
          accessibilityRole="button"
          style={styles.signinRow}
        >
          <Text style={styles.signinPrompt}>Already a member? </Text>
          <Text style={styles.signinLink}>Sign in</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#010C35',
  },
  // Ambient glow blobs — circular-masked LinearGradients. `overflow:hidden` +
  // matching `borderRadius` clips the rectangular gradient to a soft circle.
  glowTopRight: {
    position: 'absolute',
    top: -ms(140),
    right: -ms(140),
    width: ms(420),
    height: ms(420),
    borderRadius: ms(220),
    overflow: 'hidden',
  },
  glowBottomLeft: {
    position: 'absolute',
    bottom: -ms(120),
    left: -ms(120),
    width: ms(360),
    height: ms(360),
    borderRadius: ms(190),
    overflow: 'hidden',
  },
  logoSection: {
    alignItems: 'center',
    paddingTop: ms(36),
    paddingHorizontal: ms(24),
  },
  wordmark: {
    fontSize: ms(26),
    lineHeight: ms(32),
    fontFamily: 'Lato-Bold',
    color: '#FFFFFF',
    letterSpacing: -0.3,
    marginTop: 0,
  },
  cardsContainer: {
    width: scale(340),
    alignSelf: 'center',
    height: scale(195),
    marginTop: ms(40),
    position: 'relative',
  },
  cardBack: {
    position: 'absolute',
    top: scale(10),
    left: scale(20),
    zIndex: 1,
  },
  cardFront: {
    position: 'absolute',
    top: scale(42),
    left: scale(110),
    zIndex: 2,
  },
  voucherCard: {
    width: scale(200),
    borderRadius: scale(16),
    // Background painted by `voucherSurface` LinearGradient below; keep card
    // itself transparent so the shadow draws around the rounded silhouette.
    backgroundColor: 'transparent',
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.10)',
    // Shadow color is per-instance (set inline using the card's accentColor)
    // so each card glows with its own brand tone — red for the BOGO,
    // coral-orange for the FREEBIE. On the navy backdrop a navy shadow was
    // invisible; brand-coloured glow gives premium lift without feeling
    // gaudy at this opacity.
    shadowOpacity: 0.45,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 14 },
    elevation: 12,
  },
  voucherSurface: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: scale(16),
  },
  voucherStripe: {
    position: 'absolute',
    left: 0,
    top: scale(12),
    bottom: scale(12),
    width: scale(3.5),
    borderRadius: 2,
  },
  voucherBody: {
    paddingTop: scale(13),
    paddingRight: scale(13),
    paddingBottom: scale(9),
    paddingLeft: scale(18),
  },
  voucherHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: scale(8),
  },
  typeBadge: {
    paddingHorizontal: scale(8),
    paddingVertical: scale(3),
    borderRadius: 20,
    borderWidth: 1,
  },
  typeBadgeText: {
    fontSize: ms(10),
    fontFamily: 'Lato-Bold',
    letterSpacing: 0.15,
    textTransform: 'uppercase',
  },
  savingPill: {
    paddingHorizontal: scale(10),
    paddingVertical: scale(3),
    borderRadius: 20,
  },
  savingText: {
    fontSize: ms(10),
    fontFamily: 'Lato-Bold',
    color: '#FFFFFF',
  },
  voucherTitle: {
    fontSize: ms(14),
    fontFamily: 'Lato-Bold',
    color: '#010C35',
    lineHeight: ms(18),
    marginBottom: scale(3),
  },
  voucherMerchant: {
    fontSize: ms(11),
    color: '#9CA3AF',
    fontFamily: 'Lato-Regular',
  },
  voucherFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(4),
    marginHorizontal: scale(13),
    borderTopWidth: 1,
    borderTopColor: 'rgba(1,12,53,0.08)',
    borderStyle: 'dashed',
    paddingVertical: scale(6),
    paddingLeft: scale(4),
  },
  voucherFooterText: {
    fontSize: ms(10),
    color: '#9CA3AF',
    fontFamily: 'Lato-Medium',
  },
  copySection: {
    alignItems: 'center',
    textAlign: 'center',
    paddingHorizontal: ms(24),
    paddingTop: ms(4),
    marginTop: ms(40),
  },
  headline: {
    fontSize: ms(21),
    fontFamily: 'Lato-Bold',
    color: '#FFFFFF',
    letterSpacing: -0.3,
    lineHeight: ms(28),
    textAlign: 'center',
    marginBottom: ms(12),
  },
  headlineAccent: {
    color: '#E20C04',
    fontSize: ms(21),
    fontFamily: 'Lato-Bold',
  },
  subheadline: {
    fontSize: ms(15),
    color: 'rgba(255,255,255,0.72)',
    lineHeight: ms(22),
    textAlign: 'center',
    fontFamily: 'Lato-Regular',
  },
  ctaSection: {
    paddingHorizontal: ms(24),
    paddingTop: ms(22),
    gap: ms(12),
    // Auto-margin pushes CTA to the bottom of the screen; the leftover
    // vertical space now sits between the copy block and the CTA, instead
    // of between the cards and the copy. Visually breaks the awkward
    // proximity of "Member prices." and the "Create your free account"
    // pill that was reading as one chunk.
    marginTop: 'auto',
  },
  primaryBtn: {
    borderRadius: 50,
    paddingVertical: ms(16),
    alignItems: 'center',
    shadowColor: '#E20C04',
    shadowOpacity: 0.2,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  primaryBtnText: {
    fontSize: ms(16),
    fontFamily: 'Lato-Bold',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  socialRow: {
    flexDirection: 'row',
    gap: ms(10),
  },
  appleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: ms(7),
    paddingVertical: ms(14),
    borderRadius: 50,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
  },
  appleBtnText: {
    fontSize: ms(14),
    fontFamily: 'Lato-Bold',
    color: '#010C35',
  },
  googleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: ms(7),
    paddingVertical: ms(14),
    borderRadius: 50,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
  },
  googleBtnText: {
    fontSize: ms(14),
    fontFamily: 'Lato-Bold',
    color: '#010C35',
  },
  signinRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: ms(4),
  },
  signinPrompt: {
    fontSize: ms(14),
    color: 'rgba(255,255,255,0.72)',
    fontFamily: 'Lato-Regular',
  },
  signinLink: {
    fontSize: ms(14),
    color: '#E20C04',
    fontFamily: 'Lato-Bold',
  },
})
