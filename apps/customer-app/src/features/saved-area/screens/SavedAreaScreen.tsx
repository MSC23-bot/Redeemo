import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native'
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { useQueryClient } from '@tanstack/react-query'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  Button,
  Card,
  color,
  elevation,
  layer,
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
import { useUpdateProfile } from '@/hooks/useUpdateProfile'
import { useUserLocation } from '@/hooks/useLocation'
import { useAuthStore } from '@/stores/auth'
import { homeFeedQueryKey } from '@/hooks/useHomeFeed'
import { discoveryApi } from '@/lib/api/discovery'

// ─── helpers (PC2-pattern inline copy, scoped to this surface) ───────────────

// Civil-parish > admin-ward (London) > parliamentary-constituency > admin-
// district > admin-ward ladder. Mirrors PC2's `pickAreaLabel` — kept inline
// here to avoid refactoring PC2 into a shared module. Identical behaviour
// ensures the same user sees the same label whether updating during
// onboarding or here.
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
  const updateProfile = useUpdateProfile()
  const loc = useUserLocation()

  const profile = me.data

  // §DF — `?from=<surface>` URL param drives return navigation.
  // When Your Location is opened from Search (which is a tab), the
  // navigation stack can lose its Search frame (tab-default-tab quirk)
  // and a plain `router.back()` lands the user on Home instead of
  // Search.  Reading the explicit `from` param closes that loophole.
  const params = useLocalSearchParams<{ from?: string | string[] }>()
  const fromParam = (() => {
    const raw = params?.from
    if (Array.isArray(raw)) return raw[0] ?? null
    return typeof raw === 'string' ? raw : null
  })()

  // Inline postcode-lookup pane visibility. Cleaner than a BottomSheet —
  // mirrors PC2's inline approach, single-screen surface, no overlay.
  const [editing, setEditing] = useState(false)
  const [postcodeInput, setPostcodeInput] = useState('')
  const [lookupResult, setLookupResult] = useState<LookupResult | null>(null)
  const [lookupError, setLookupError] = useState<string | null>(null)
  const [isLooking, setIsLooking] = useState(false)
  const isSaving = updateProfile.isPending

  // Track whether we initiated a GPS request from THIS screen so the post-
  // grant effect only fires for our action, not for ambient location state
  // already populated by another surface (Home pre-fetch, Map, etc).
  // Initial value tracks the at-mount permission state so the effect doesn't
  // self-fire for a user who landed on this screen with permission already
  // granted (e.g. opened it after using Home/Map).
  const requestedGpsRef = useRef(false)
  const sawCoordsRef = useRef<boolean>(loc.status === 'granted' && !!loc.coords)

  // §DF — every fresh Saved Area open MUST start in the choice
  // state ("Update postcode" / "Use current location"), NOT in the
  // postcode-edit card.  Pre-fix the local `editing` useState persisted
  // across `router.back()` because Saved Area is registered as a
  // `Tabs.Screen` and the screen instance does NOT unmount on navigation —
  // it survives across visits, so `editing === true` from the previous
  // visit leaked into the next open.  Owner device-QA Round 2 finding 6.
  //
  // useFocusEffect resets the edit-pane state (editing / postcodeInput /
  // lookupResult / lookupError) on every focus.  Crucially, the GPS
  // tracking refs (`requestedGpsRef` / `sawCoordsRef`) are NOT reset —
  // those track the in-session GPS-grant flow and resetting them would
  // break the post-grant auto-navigate path AND re-fire the auto-navigate
  // on every focus.
  //
  // Scope note: "every fresh open" = focus event (navigation arrival), NOT
  // AppState background→foreground.  A user mid-edit who backgrounds the
  // app and resumes keeps their in-progress postcode + lookup intact —
  // preserving in-progress edits across short backgrounds is friendlier
  // than wiping them.  If owner direction changes, this becomes a deliberate
  // §DF-v2 design call rather than a code tweak.
  useFocusEffect(
    useCallback(() => {
      setEditing(false)
      setPostcodeInput('')
      setLookupResult(null)
      setLookupError(null)
    }, []),
  )

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
  // §DF — when Your Location is opened from Search (a tab),
  // Expo Router's tab navigation can lose the back stack frame and
  // `router.canGoBack()` returns false, falling through to `router.push('/')`
  // which dumps the user on Home instead of Search.  The `from` URL param
  // makes the return target explicit and survives the tab-stack quirk.
  //
  // Profile stabilisation hotfix — `from=profile` added so the same
  // loophole closes for Profile → Your Location → Back. Pre-fix, pressing
  // Back from Your Location landed the user on Home instead of Profile.
  function handleBack() {
    if (fromParam === 'search') {
      router.push('/(app)/search' as any)
      return
    }
    if (fromParam === 'profile') {
      router.push('/(app)/profile' as any)
      return
    }
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
    // §DF device-QA Round 3 finding 4 — dismiss the keyboard FIRST so the
    // Save tap is always processed cleanly.  Pre-fix, with the keyboard
    // covering the Save button on standard-height phones, taps where Save
    // visually appeared landed on the keyboard accept region and never
    // reached this handler.  The KeyboardAvoidingView wrap + `keyboard-
    // ShouldPersistTaps="handled"` on the ScrollView fix the input reach;
    // dismissing here also collapses the keyboard immediately so the
    // user sees the `loading={isSaving}` spinner unobstructed.
    Keyboard.dismiss()
    const postcode = (lookupResult?.postcode ?? postcodeInput).trim().toUpperCase()
    if (!postcode) return
    // Postcode-only PATCH per spec §7.2. No lat/lng — GPS coords are NEVER
    // written to User.postcode. `useUpdateProfile` invalidates meQueryKey
    // automatically; we add the broader Discovery refetch BEFORE navigating
    // back so Home/Search/Map/NBC render the new locality immediately rather
    // than serving a stale cached snapshot while a background refetch lands.
    updateProfile.mutate(
      { postcode },
      {
        onSuccess: async () => {
          // §DF — refresh the auth-store user
          // snapshot first so Profile (which reads
          // `useAuthStore((s) => s.user?.postcode)` rather than `useMe()`)
          // surfaces the new postcode atomically with the back-nav.
          await useAuthStore.getState().refreshUser()
          // §DF Round 5 — owner reported the previous
          // `refetchQueries({ predicate })` chain was still leaving Home
          // showing OLD locality text for 5-7s after the back-nav.
          // Root cause: `refetchQueries` on a predicate-match across
          // INACTIVE queries (Home is unmounted while the user is on
          // Saved Area) has timing quirks — the promise can resolve
          // before the cache is committed, AND on re-mount React Query
          // can momentarily serve the previous response before swapping
          // in the fresh data.
          //
          // Fix (Round 5): mark all Discovery queries stale via
          // `invalidateQueries`, then ACTIVELY prefetch the no-coords
          // Home query via `fetchQuery` — this is the most common
          // landing because the user just turned off / left their GPS
          // off to use the saved-area path.  `fetchQuery` populates the
          // cache for the EXACT query key Home will subscribe to on
          // re-mount, guaranteeing the back-nav lands on a Home with
          // fresh data.  The saving overlay carries the visible wait;
          // owner already accepted the trade-off in Round 4.
          qc.invalidateQueries({
            predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === 'discovery',
          })
          await qc.fetchQuery({
            queryKey: homeFeedQueryKey({}),
            queryFn: () => discoveryApi.getHomeFeed({}),
          })
          handleBack()
        },
        onError: () => {
          setLookupError('Failed to save postcode. Please try again.')
        },
      },
    )
  }

  async function onUseCurrentLocation() {
    Keyboard.dismiss()
    requestedGpsRef.current = true
    // No opts — the LocationPermissionProvider in (app)/_layout supplies the
    // branded pre-permission explainer + recovery sheet via context. On
    // denial the provider auto-fires the recovery sheet; this surface
    // intentionally does NOT wire its own Modal. Defensive catch keeps
    // the screen alive if an unexpected rejection escapes the provider.
    try { await loc.request() } catch {}
  }

  // ── render ────────────────────────────────────────────────────────────────
  if (me.isLoading && !profile) {
    return (
      <View
        testID="saved-area-screen"
        style={[s.screen, { paddingTop: insets.top + spacing[6] }]}
      >
        <View testID="saved-area-loading" style={s.loadingWrap}>
          <RedeemoLoader size={32} accessibilityLabel="Loading saved location" />
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
            Your Location
          </Text>
          <View style={{ width: 40 }} />
        </View>
      </View>

      {/*
        §DF device-QA Round 5 — KeyboardAvoidingView offset reset.
        Round 4's `insets.top + layout.appBarHeight` offset, combined
        with a programmatic `scrollToEnd` on `lookupResult`, over-
        corrected: the form jumped too far up so the identity card +
        Save/Cancel surfaces both disappeared behind the keyboard.
        Round 5 simplifies in two ways:
          1. Hide the identity card while `editing === true` (see
             the conditional render below).  Removing the read-only
             summary from the layout gives the form natural room
             without aggressive auto-scroll.
          2. Drop the `scrollToEnd` belt-and-braces effect (was at
             this position pre-Round 5).
          3. Keep KAV with a simpler offset — just `insets.top` —
             since the sticky header is INSIDE the avoiding view's
             reference frame, not outside it.
      */}
      <KeyboardAvoidingView
        style={s.flexFill}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
      >
      {/*
        §DF device-QA Round 6 — drop `automaticallyAdjustKeyboardInsets`
        and `contentInsetAdjustmentBehavior="automatic"` so the
        KeyboardAvoidingView above is the SOLE keyboard-handling
        mechanism.  When both were active, iOS subtracted the keyboard
        height twice — once via the ScrollView's contentInset and once
        via KAV's padding — pushing the edit Card up under the sticky
        header.  `paddingBottom` trimmed to `insets.bottom` only
        (dropped the `+ spacing[7]`) to remove the dead-zone above the
        keyboard; the edit Card's inherent margins provide the
        breathing room.
      */}
      <ScrollView
        contentContainerStyle={[s.scrollContent, { paddingBottom: insets.bottom }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustContentInsets={false}
      >

        {/*
          §DF device-QA Round 4 (Phase 5.4) — identity-card treatment.
          Replaces the previous two-row form-like summary with ONE
          identity card so the surface reads as "this is your current
          state" rather than "these are settings".  Read-only by
          design (no chevron, no Pressable, no edit affordance) —
          the Update CTA below carries the change action.

          §DF device-QA Round 5 — owner direction: hide the identity
          card while `editing === true` to give the form room to
          breathe without aggressive auto-scroll.  The summary is
          informational; while the user is mid-edit, it's not needed
          on-screen.  Round 4's `scrollToEnd` over-correction has been
          dropped together with this conditional.

          Locked spec:
          - cream surface (color.surface.tint) — identity zone.
          - 1px hairline border (color.border.subtle) — quiet
            container, no shadow.
          - 22pt Mustica display.sm for the city name (data is hero).
          - 11pt CURRENT eyebrow (label.eyebrow + tertiary).
          - 14pt body.sm postcode below.
          - 44×44 white circular icon wrap with brand-rose pin.

          Fallback: locality.name first (richer), then city, then
          'Not set'.  Postcode line suppressed entirely when null.
        */}
        {!editing && (
          <View style={s.identityCard} testID="saved-area-identity-card">
            <View style={s.identityIconWrap}>
              <MapPin size={22} color={color.brandRose} />
            </View>
            <View style={s.identityText}>
              <Text variant="label.eyebrow" color="tertiary">CURRENT</Text>
              <Text variant="display.sm" color="primary">
                {localityDisplay}
              </Text>
              {profile?.postcode ? (
                <Text variant="body.sm" color="secondary">{profile.postcode}</Text>
              ) : null}
            </View>
          </View>
        )}

        {/* ── Inline postcode-update pane ────────────────────────────── */}
        {editing ? (
          <Animated.View entering={FadeInDown.duration(220)} exiting={FadeOutUp.duration(180)}>
            <Card style={[s.card, { marginTop: spacing[4] }]}>
              <View style={s.field}>
                <Text variant="label.lg" color="secondary">New postcode</Text>
                {/*
                  §DF — owner device-QA Round 2 finding:
                  the "New postcode" label alone didn't tell the user
                  what saving does.  This explanatory line sits ABOVE
                  the input so the user reads "what this does" before
                  they read the input affordance.
                */}
                <Text
                  variant="body.sm"
                  color="secondary"
                  style={s.helperCopy}
                  testID="saved-area-helper-copy"
                >
                  Update the area we use to show offers when your location is off.
                </Text>
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

        {/*
          §DF device-QA Round 4 (Phase 5.3) — caveat copy refresh.
          Previous: "Your saved location helps us show relevant offers
          when location is off."  Owner-locked replacement drops the
          possessive (the screen is "Your Location"), drops the
          double-"location", and tightens to 8 words.

          §DF device-QA Round 6 — hide the caveat while editing.  The
          edit card's helper line ("Update the area we use to show
          offers when your location is off.") already carries the same
          intent above the input, so leaving this trailing caveat
          mounted in the keyboard-visible region (a) duplicates the
          message and (b) anchors the dead-zone above the keyboard.
          Caveat stays for the choice / read-only state where it
          explains what saving the area does to the non-editing user.
        */}
        {!editing && (
          <View style={s.caveatWrap}>
            <Text variant="body.sm" color="tertiary" meta align="center">
              Used to show nearby offers when location is off.
            </Text>
          </View>
        )}

      </ScrollView>
      </KeyboardAvoidingView>

      {/*
        §DF device-QA Round 4 (Phase 4) — centered saving overlay
        during updateProfile.isPending.  Owner-locked design: dark
        scrim + white card + RedeemoLoader + "Updating your location"
        + "This may take a moment."  Animated entrance (FadeIn 200ms)
        avoids a hard flash on tap; reduced-motion is handled inside
        RedeemoLoader.  pointerEvents='auto' on the scrim blocks taps
        on the underlying form so the user can't double-submit or
        change the screen while save is in flight.

        Sits OUTSIDE the KeyboardAvoidingView so the overlay covers
        the sticky header too — without that, on a phone where the
        keyboard was open and pushed the form up, the header would
        remain interactive while the overlay only covered the
        scroll-region.
      */}
      {isSaving && (
        <Animated.View
          entering={FadeInDown.duration(200)}
          style={s.savingScrim}
          testID="saved-area-saving-overlay"
          pointerEvents="auto"
        >
          <View style={s.savingCard}>
            <RedeemoLoader size={48} accessibilityLabel="Updating your location" />
            <Text variant="heading.md" style={s.savingCopyTitle}>
              Updating your location
            </Text>
            <Text variant="body.sm" color="secondary" style={s.savingCopyBody}>
              This may take a moment.
            </Text>
          </View>
        </Animated.View>
      )}
    </View>
  )
}

// ─── styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface.page },

  // §DF device-QA Round 3 finding 4 — KeyboardAvoidingView wrapper around
  // the scrollable content.  flex:1 lets the avoiding view consume the
  // remaining vertical space below the sticky header.
  flexFill: { flex: 1 },

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

  // §DF — explanatory line above the postcode input.
  // Tight top gap matches the rest of the field-stack rhythm.
  helperCopy: {
    marginTop: spacing[1],
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

  // §DF device-QA Round 4 (Phase 5.4) — read-only identity card.
  // Replaces the two-row "Current saved postcode" / "Current locality"
  // form summary.  Reads as "this is your current state" rather than
  // a settings panel.  Cream-tinted (color.surface.tint = #FEF6F5)
  // identity zone, hairline border (no shadow — quiet container),
  // horizontal flex with icon + text stack.
  identityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[4],
    padding: spacing[5],
    backgroundColor: color.surface.tint,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.border.subtle,
  },
  identityIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: color.surface.page,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identityText: {
    flex: 1,
    gap: spacing[1],
  },

  // §DF device-QA Round 4 (Phase 4) — centered saving overlay.
  // Scrim blocks taps + dims the screen while updateProfile.isPending.
  // Card holds the RedeemoLoader + locked copy ("Updating your
  // location" + "This may take a moment.").  Sits at layer.overlay so
  // it paints above the sticky header + scrollable content.
  savingScrim: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: layer.overlay,
  },
  savingCard: {
    minWidth: 240,
    paddingVertical: spacing[6],
    paddingHorizontal: spacing[6],
    backgroundColor: color.surface.page,
    borderRadius: radius.lg,
    alignItems: 'center',
    gap: spacing[3],
    ...elevation.md,
  },
  savingCopyTitle: {
    textAlign: 'center',
  },
  savingCopyBody: {
    textAlign: 'center',
  },
})
