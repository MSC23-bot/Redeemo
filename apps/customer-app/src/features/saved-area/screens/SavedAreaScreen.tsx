import React, { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native'
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated'
import { router } from 'expo-router'
import { useQueryClient } from '@tanstack/react-query'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  Button,
  Card,
  color,
  layout,
  radius,
  spacing,
  Text,
} from '@/design-system'
import {
  ArrowLeft,
  CheckCircle,
  MapPin,
  Navigation,
  Search,
} from '@/design-system/icons'
import { InlineError } from '@/design-system/components/InlineError'
import { RedeemoLoader } from '@/design-system/motion/RedeemoLoader'
import { scale, ms } from '@/design-system/scale'
import { useMe, meQueryKey } from '@/hooks/useMe'
import { useUserLocation } from '@/hooks/useLocation'
import { profileApi } from '@/lib/api/profile'

// ─── helpers (PC2-pattern inline copy, scoped to this surface) ───────────────

// Civil-parish > admin-ward (London) > parliamentary-constituency > admin-
// district > admin-ward ladder. Mirrors PC2's `pickAreaLabel` — kept inline
// here to avoid refactoring PC2 into a shared module (Task 7 locked
// architectural line). Identical behaviour ensures the same user sees the
// same label whether updating during onboarding or here.
function pickAreaLabel(r: {
  parish?: string
  admin_district?: string
  admin_ward?: string
  parliamentary_constituency?: string
  region?: string
}): string | undefined {
  if (r.parish && !/\bunparished\s+area\b/i.test(r.parish)) return r.parish
  if (r.region === 'London' && r.admin_ward) return r.admin_ward
  return r.parliamentary_constituency ?? r.admin_district ?? r.admin_ward
}

type LookupResult = { area: string; region: string; postcode: string }

// ─── screen ───────────────────────────────────────────────────────────────────

export function SavedAreaScreen() {
  const insets = useSafeAreaInsets()
  const qc = useQueryClient()
  const me = useMe()
  const loc = useUserLocation()

  const profile = me.data

  // Inline postcode-lookup pane visibility. Cleaner than a BottomSheet —
  // mirrors PC2's inline approach, single-screen surface, no overlay.
  const [editing, setEditing] = useState(false)
  const [postcodeInput, setPostcodeInput] = useState('')
  const [lookupResult, setLookupResult] = useState<LookupResult | null>(null)
  const [lookupError, setLookupError] = useState<string | null>(null)
  const [isLooking, setIsLooking] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  // Track whether we initiated a GPS request from THIS screen so the post-
  // grant effect only fires for our action, not for ambient location state
  // already populated by another surface (Home pre-fetch, Map, etc).
  // Initial value tracks the at-mount permission state so the effect doesn't
  // self-fire for a user who landed on this screen with permission already
  // granted (e.g. opened it after using Home/Map).
  const requestedGpsRef = useRef(false)
  const sawCoordsRef = useRef<boolean>(loc.status === 'granted' && !!loc.coords)

  // ── debounced postcodes.io lookup ─────────────────────────────────────────
  useEffect(() => {
    if (!editing) return
    const cleaned = postcodeInput.trim().replace(/\s/g, '')
    setLookupResult(null)
    setLookupError(null)
    if (cleaned.length < 5) { setIsLooking(false); return }
    setIsLooking(true)
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(cleaned)}`)
        const json = await res.json() as {
          status: number
          result?: {
            postcode?: string
            parish?: string
            admin_district?: string
            admin_ward?: string
            parliamentary_constituency?: string
            region?: string
            country?: string
          }
        }
        if (json.status === 200 && json.result) {
          const r = json.result
          setLookupResult({
            postcode: r.postcode ?? postcodeInput.trim().toUpperCase(),
            area:     pickAreaLabel(r) ?? postcodeInput.trim().toUpperCase(),
            region:   [r.region, r.country].filter(Boolean).join(', '),
          })
        } else {
          setLookupError('Postcode not found. Please check and try again.')
        }
      } catch {
        setLookupError('Unable to look up postcode. Check your connection and try again.')
      } finally {
        setIsLooking(false)
      }
    }, 600)
    return () => { clearTimeout(timer); setIsLooking(false) }
  }, [postcodeInput, editing])

  // ── post-GPS-grant effect ─────────────────────────────────────────────────
  // Fires when the user tapped "Use current location" AND coords subsequently
  // landed on the hook. Invalidates Discovery + meQueryKey then navigates
  // back. `requestedGpsRef` gates this so ambient coords (set by Home/Map
  // on a prior screen) never auto-navigate the user away. `sawCoordsRef`
  // additionally suppresses self-fire when the user landed on the screen
  // with `granted + coords` already present (no transition to react to).
  useEffect(() => {
    const hasCoords = loc.status === 'granted' && !!loc.coords
    if (!hasCoords) {
      sawCoordsRef.current = false
      return
    }
    if (!requestedGpsRef.current) {
      sawCoordsRef.current = true
      return
    }
    requestedGpsRef.current = false
    sawCoordsRef.current = true
    void qc.invalidateQueries({
      predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === 'discovery',
    })
    void qc.invalidateQueries({ queryKey: meQueryKey })
    handleBack()
    // handleBack is stable enough; loc.coords + status drive the effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loc.status, loc.coords])

  // ── handlers ──────────────────────────────────────────────────────────────
  function handleBack() {
    if (router.canGoBack()) router.back()
    else router.push('/')
  }

  function onUpdatePress() {
    setEditing(true)
    setPostcodeInput(profile?.postcode ?? '')
    setLookupResult(null)
    setLookupError(null)
  }

  async function onSavePostcode() {
    const postcode = (lookupResult?.postcode ?? postcodeInput).trim().toUpperCase()
    if (!postcode) return
    setIsSaving(true)
    try {
      // Postcode-only PATCH per spec §7.2. No lat/lng — GPS coords are NEVER
      // written to User.postcode.
      await profileApi.updateProfile({ postcode })
      // Comprehensive cache invalidation. Predicate matches every key whose
      // first element is `'discovery'` (catches `['discovery','home',…]`,
      // `['discovery','search',…]`, in-area, NBC, etc).
      void qc.invalidateQueries({
        predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === 'discovery',
      })
      void qc.invalidateQueries({ queryKey: meQueryKey })
      handleBack()
    } catch {
      setLookupError('Failed to save postcode. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  async function onUseCurrentLocation() {
    Keyboard.dismiss()
    requestedGpsRef.current = true
    // No opts — the LocationPermissionProvider in (app)/_layout supplies the
    // branded pre-permission explainer + recovery sheet via context. On
    // denial the provider auto-fires the recovery sheet; this surface
    // intentionally does NOT wire its own Modal.
    await loc.request()
  }

  // ── render ────────────────────────────────────────────────────────────────
  if (me.isLoading && !profile) {
    return (
      <View
        testID="saved-area-screen"
        style={[s.screen, { paddingTop: insets.top + spacing[6] }]}
      >
        <View testID="saved-area-loading" style={s.loadingWrap}>
          <RedeemoLoader size={32} accessibilityLabel="Loading saved area" />
        </View>
      </View>
    )
  }

  const postcodeDisplay = profile?.postcode ?? 'Not set'
  const localityDisplay = profile?.city ?? 'Not set'

  return (
    <View testID="saved-area-screen" style={s.screen}>

      {/* ── Sticky header ─────────────────────────────────────────────── */}
      <View style={[s.stickyHeader, { paddingTop: insets.top }]}>
        <View style={s.appBarRow}>
          <Pressable
            onPress={handleBack}
            accessibilityLabel="Go back"
            accessibilityRole="button"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={s.backBtn}
          >
            <ArrowLeft size={scale(22)} color={color.text.primary} />
          </Pressable>
          <Text variant="heading.md" align="center" style={{ flex: 1 }}>
            Saved Area
          </Text>
          <View style={{ width: 40 }} />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[s.scrollContent, { paddingBottom: insets.bottom + spacing[7] }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >

        {/* ── Read-only summary ──────────────────────────────────────── */}
        <Card style={s.card}>
          <View style={s.field}>
            <Text variant="label.md" color="secondary">Current saved postcode</Text>
            <Text variant="heading.sm" color="primary">{postcodeDisplay}</Text>
          </View>
          <View style={s.fieldDivider} />
          <View style={s.field}>
            <Text variant="label.md" color="secondary">Current locality</Text>
            <Text variant="heading.sm" color="primary">{localityDisplay}</Text>
          </View>
        </Card>

        {/* ── Inline postcode-update pane ────────────────────────────── */}
        {editing ? (
          <Animated.View entering={FadeInDown.duration(220)} exiting={FadeOutUp.duration(180)}>
            <Card style={[s.card, { marginTop: spacing[4] }]}>
              <View style={s.field}>
                <Text variant="label.lg" color="secondary">New postcode</Text>
                <View style={s.inputContainer}>
                  <TextInput
                    testID="saved-area-postcode-input"
                    accessibilityLabel="Postcode"
                    value={postcodeInput}
                    onChangeText={(v) => setPostcodeInput(v.toUpperCase())}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    returnKeyType="search"
                    onSubmitEditing={() => Keyboard.dismiss()}
                    placeholder="e.g. SW1A 1AA"
                    placeholderTextColor={color.text.tertiary}
                    style={s.input}
                  />
                  <View style={s.inputIcon} pointerEvents="none">
                    {isLooking
                      ? <RedeemoLoader size={scale(20)} accessibilityLabel="Looking up postcode" />
                      : <Search size={scale(18)} color={color.text.tertiary} />
                    }
                  </View>
                </View>
                {lookupError ? <InlineError message={lookupError} /> : null}
              </View>

              {lookupResult ? (
                <Animated.View entering={FadeInDown.duration(240).springify()}>
                  <View style={s.foundBanner}>
                    <View style={s.foundCheck}>
                      <CheckCircle size={scale(18)} color="#FFFFFF" fill="#16A34A" />
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text variant="label.lg" color="primary">{lookupResult.area}</Text>
                      {lookupResult.region ? (
                        <Text variant="body.sm" color="tertiary" meta>{lookupResult.region}</Text>
                      ) : null}
                    </View>
                  </View>
                </Animated.View>
              ) : null}

              <View style={s.editActions}>
                <Button
                  variant="primary"
                  size="md"
                  fullWidth
                  onPress={onSavePostcode}
                  loading={isSaving}
                  disabled={!lookupResult}
                  accessibilityLabel="Save postcode"
                >
                  Save
                </Button>
                <Button
                  variant="ghost"
                  size="md"
                  fullWidth
                  onPress={() => setEditing(false)}
                  disabled={isSaving}
                >
                  Cancel
                </Button>
              </View>
            </Card>
          </Animated.View>
        ) : (
          <View style={s.ctaStack}>
            <Pressable
              onPress={onUpdatePress}
              accessibilityRole="button"
              accessibilityLabel="Update postcode"
              style={({ pressed }) => [s.ctaRow, pressed && s.ctaRowPressed]}
            >
              <View style={s.ctaIcon}>
                <MapPin size={scale(18)} color={color.brandRose} />
              </View>
              <Text variant="label.lg" color="primary" style={{ flex: 1 }}>
                Update postcode
              </Text>
            </Pressable>

            <Pressable
              onPress={onUseCurrentLocation}
              accessibilityRole="button"
              accessibilityLabel="Use current location"
              disabled={loc.status === 'loading'}
              style={({ pressed }) => [
                s.ctaRow,
                pressed && s.ctaRowPressed,
                loc.status === 'loading' && { opacity: 0.7 },
              ]}
            >
              <View style={s.ctaIcon}>
                {loc.status === 'loading'
                  ? <ActivityIndicator size="small" color={color.brandRose} />
                  : <Navigation size={scale(18)} color={color.brandRose} />
                }
              </View>
              <Text variant="label.lg" color="primary" style={{ flex: 1 }}>
                {loc.status === 'loading' ? 'Detecting your location…' : 'Use current location'}
              </Text>
            </Pressable>
          </View>
        )}

        {/* ── Caveat (verbatim spec §7.1) ───────────────────────────── */}
        <View style={s.caveatWrap}>
          <Text variant="body.sm" color="tertiary" meta align="center">
            Your saved postcode helps us show relevant offers when location is off.
          </Text>
        </View>

      </ScrollView>
    </View>
  )
}

// ─── styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface.page },

  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  stickyHeader: {
    backgroundColor: color.surface.page,
    borderBottomWidth: 1,
    borderBottomColor: color.border.subtle,
  },
  appBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: layout.appBarHeight,
    paddingHorizontal: spacing[4],
  },
  backBtn: {
    width: 40,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },

  scrollContent: {
    paddingHorizontal: layout.screenPaddingH,
    paddingTop: spacing[5],
  },

  card: {
    padding: spacing[5],
    borderRadius: radius.xl,
  },
  field: {
    gap: spacing[1],
  },
  fieldDivider: {
    height: 1,
    backgroundColor: color.border.subtle,
    marginVertical: spacing[4],
  },

  inputContainer: {
    position: 'relative',
    justifyContent: 'center',
    marginTop: spacing[2],
  },
  input: {
    height: scale(52),
    borderRadius: scale(14),
    borderWidth: 1.5,
    borderColor: color.border.default,
    backgroundColor: color.surface.page,
    paddingLeft: ms(14),
    paddingRight: scale(40),
    fontFamily: 'Lato-Regular',
    fontSize: ms(16),
    color: color.text.primary,
    letterSpacing: ms(1),
  },
  inputIcon: {
    position: 'absolute',
    right: ms(14),
    top: 0,
    bottom: 0,
    width: scale(20),
    alignItems: 'center',
    justifyContent: 'center',
  },

  foundBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ms(12),
    backgroundColor: 'rgba(22,163,74,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(22,163,74,0.22)',
    borderRadius: scale(14),
    paddingHorizontal: ms(14),
    paddingVertical: ms(12),
    marginTop: spacing[4],
  },
  foundCheck: {
    width: scale(28),
    height: scale(28),
    borderRadius: scale(14),
    backgroundColor: '#16A34A',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  editActions: {
    marginTop: spacing[5],
    gap: spacing[3],
  },

  ctaStack: {
    marginTop: spacing[4],
    backgroundColor: color.surface.page,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: color.border.subtle,
    overflow: 'hidden',
  },
  ctaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: color.border.subtle,
  },
  ctaRowPressed: { opacity: 0.7 },
  ctaIcon: {
    width: scale(36),
    height: scale(36),
    borderRadius: scale(18),
    backgroundColor: color.surface.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },

  caveatWrap: {
    marginTop: spacing[5],
    paddingHorizontal: spacing[3],
  },
})
