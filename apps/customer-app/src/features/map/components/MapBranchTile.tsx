import React, { useRef, useEffect } from 'react'
import {
  View,
  ScrollView,
  Pressable,
  StyleSheet,
  Animated,
  Dimensions,
  PanResponder,
  type LayoutChangeEvent,
} from 'react-native'
import { X } from 'lucide-react-native'
import { color, spacing, radius, elevation, layer, motion } from '@/design-system'
import { BranchTile } from '@/features/shared/BranchTile'
import { DotIndicator } from '@/features/shared/DotIndicator'
import {
  BranchTile as BranchTileType,
} from '@/lib/api/discovery'

const { width: SCREEN_WIDTH } = Dimensions.get('window')

// Map P2 W1 (F5, 2026-07-12) — carousel snap geometry.
//
// Walkthrough finding F5: the active card rendered LEFT-CLIPPED with the
// next card crammed against it at a tiny gap. Root cause: the ScrollView
// combined `pagingEnabled` (which snaps to the SCROLLVIEW FRAME width)
// with a `snapToInterval` equal to the card width AND lived inside a
// horizontally-padded container, so the two snap mechanisms disagreed
// about where a page boundary was; the card also had zero inter-card gap
// (`scrollContent.gap: 0`) and no next-card peek, so a settled swipe
// could leave the active card straddling the viewport edge.
//
// Fix: a single, standard peek-carousel geometry (one snap mechanism).
// The ScrollView spans the FULL screen width; the active card is inset
// by `PAGE_INSET` on the left via `contentContainerStyle` padding, cards
// are separated by a consistent `CARD_GAP`, and the next card peeks by
// `CARD_PEEK`. Snap points fall on `SNAP_INTERVAL` (card + gap) with
// `snapToAlignment="start"`, so a settled card always lands flush at
// `PAGE_INSET` — fully visible, evenly inset, never clipped.
// Exported for the F5 geometry regression test (not part of the
// component's public runtime API).
export const PAGE_INSET = spacing[4]       // 16 — left inset of the active card
export const CARD_GAP   = spacing[3]       // 12 — consistent gap between cards
export const CARD_PEEK  = spacing[6]       // modest peek of the next card
export const CARD_WIDTH = SCREEN_WIDTH - PAGE_INSET - CARD_GAP - CARD_PEEK
// One card advance = card width + the gap that follows it. Used by BOTH
// the programmatic `scrollTo(activeIndex * SNAP_INTERVAL)` and the
// scroll-settle `round(offsetX / SNAP_INTERVAL)` index read, so the two
// stay in lockstep (a mismatch here was part of the pre-W1 confusion).
export const SNAP_INTERVAL = CARD_WIDTH + CARD_GAP
export const CAROUSEL_SCREEN_WIDTH = SCREEN_WIDTH

// Map Phase 2 S2 Task 4 (spec §7.6) — swipe-down-to-dismiss thresholds.
// Either passing the drag distance OR the flick velocity dismisses;
// both checked on release. Mirrors `BottomSheet.tsx`'s own
// DISMISS_DISTANCE/DISMISS_VELOCITY pattern (kept a little shorter here
// since the carousel card is a much smaller target than a full sheet).
const DISMISS_DISTANCE = 80   // px dragged down from rest
const DISMISS_VELOCITY = 0.8  // px/ms downward flick speed (PanResponder gestureState.vy units)

// Extracted as plain, exported pure functions — `PanResponder`'s
// `panHandlers` recompute gesture state internally from raw native touch
// events (there's no way to inject a synthetic `gestureState` through
// them for a unit test), so the actual claim/dismiss DECISIONS live here
// where they're directly testable in isolation. The PanResponder config
// below is a thin, otherwise-untested wrapper around these two.
export function shouldClaimDismissGesture(gesture: { dy: number; dx: number }): boolean {
  return gesture.dy > 8 && gesture.dy > Math.abs(gesture.dx) * 1.5
}

export function shouldDismissOnRelease(gesture: { dy: number; vy: number }): boolean {
  return gesture.dy > DISMISS_DISTANCE || gesture.vy > DISMISS_VELOCITY
}

type Props = {
  branches: BranchTileType[]
  activeIndex: number
  onClose: () => void
  onIndexChange: (index: number) => void
  /**
   * Fires with the tapped CARD's branch.id (not the merchant.id).
   * The shared `<BranchTile>` consumer passes branch.id directly to
   * its `onPress` callback, which carries the branch identity through
   * the `?branch=${id}&from=map` URL contract.
   */
  onBranchPress: (branchId: string) => void
  /**
   * Map Phase 2 S5b Task 1 — reports the card's rendered height so
   * MapScreen can lift the floating control cluster (locate-me / filter
   * / list buttons) clear of the carousel instead of letting it sit
   * underneath. Optional: omitting it is a no-op (pre-S5b behaviour).
   */
  onLayout?: (event: LayoutChangeEvent) => void
}

// Phase 3C.1g M2.8 — `onFavourite` removed from MapBranchTile + the
// pass-through to `<BranchTile>`.  The heart is now owned by
// `<FavouriteHeart>` inside the shared `<BranchTile>` (M2.7).

export function MapBranchTile({
  branches,
  activeIndex,
  onClose,
  onIndexChange,
  onBranchPress,
  onLayout,
}: Props) {
  const translateY = useRef(new Animated.Value(300)).current
  // Map Phase 2 S2 Task 4 — separate drag offset for swipe-down-to-
  // dismiss, composed additively with the mount-in `translateY` above
  // (see the container's `transform` below) so the two animations never
  // fight over the same Animated.Value.
  const dragY = useRef(new Animated.Value(0)).current
  const scrollRef = useRef<ScrollView>(null)

  // Slide in on mount
  useEffect(() => {
    Animated.spring(translateY, {
      toValue: 0,
      ...motion.spring.snappy,
      useNativeDriver: true,
    }).start()
  }, [translateY])

  // Sync scroll to activeIndex when it changes externally
  useEffect(() => {
    scrollRef.current?.scrollTo({ x: activeIndex * SNAP_INTERVAL, animated: true })
  }, [activeIndex])

  const handleScroll = (e: any) => {
    const offsetX = e.nativeEvent.contentOffset.x
    const index = Math.round(offsetX / SNAP_INTERVAL)
    if (index !== activeIndex && index >= 0 && index < branches.length) {
      onIndexChange(index)
    }
  }

  // Map Phase 2 S2 Task 4 (spec §7.6) — swipe-down-to-dismiss. Bound to
  // the OUTER container via a non-capturing PanResponder
  // (`onMoveShouldSetPanResponder`, not `...Capture`) so the inner
  // horizontal ScrollView (card paging) and the close-button Pressable
  // both keep first refusal on touches; this only claims the gesture
  // once movement is clearly downward-dominant (past a small threshold
  // AND steeper than the horizontal component), so a normal card-swipe
  // drag is never intercepted. Release past the distance/velocity
  // threshold calls `onClose()` directly — same as the X button, no
  // separate outro animation (removal from the tree already provides
  // the "disappear", matching the X button's existing behaviour); below
  // threshold springs back to rest.
  const dismissResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_evt, gesture) => shouldClaimDismissGesture(gesture),
      onPanResponderMove: (_evt, gesture) => {
        if (gesture.dy > 0) dragY.setValue(gesture.dy)
      },
      onPanResponderRelease: (_evt, gesture) => {
        if (shouldDismissOnRelease(gesture)) {
          onClose()
          return
        }
        Animated.spring(dragY, { toValue: 0, ...motion.spring.snappy, useNativeDriver: true }).start()
      },
      onPanResponderTerminate: () => {
        Animated.spring(dragY, { toValue: 0, ...motion.spring.snappy, useNativeDriver: true }).start()
      },
    }),
  ).current

  return (
    <Animated.View
      testID="map-branch-tile-container"
      style={[styles.container, { transform: [{ translateY: Animated.add(translateY, dragY) }] }]}
      onLayout={onLayout}
      {...dismissResponder.panHandlers}
    >
      {/* Close button */}
      <Pressable
        onPress={onClose}
        accessibilityLabel="Close merchant tile"
        style={styles.closeButton}
      >
        <X size={16} color={color.text.secondary} />
      </Pressable>

      {/* Snap-scrolling horizontal list — Map P2 W1 (F5): single peek-
          carousel snap mechanism (snapToInterval, no pagingEnabled), full
          width so the next card can peek at the screen edge. */}
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScroll}
        decelerationRate="fast"
        snapToInterval={SNAP_INTERVAL}
        snapToAlignment="start"
        contentContainerStyle={styles.scrollContent}
      >
        {branches.map((branch) => (
          // Branch-keyed identity (Phase 2.5) — two branches of the
          // same merchant render as TWO distinct carousel cards.
          <View key={branch.id} style={[styles.tileWrapper, { width: CARD_WIDTH }]}>
            <BranchTile
              branch={branch}
              onPress={onBranchPress}
              size="standard"
              width={CARD_WIDTH}
              // Map Phase 2 S4 — carousel card parity with Home: aggregate
              // saving ('Save £X across N vouchers') instead of the
              // single-voucher "Save up to £X" line. Opt-in prop; Search/
              // Category (the other <BranchTile> callers) don't pass it and
              // keep their pre-S4 default rendering unchanged.
              savingsDisplay="aggregate"
            />
          </View>
        ))}
      </ScrollView>

      {/* Dot indicators */}
      {branches.length > 1 && (
        <DotIndicator count={branches.length} activeIndex={activeIndex} />
      )}
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  // Map P2 W1 (F5) — full-bleed container (no horizontal padding) so the
  // inner ScrollView spans the whole screen and the next card can peek at
  // the edge. The active card's inset is applied via the ScrollView's
  // `scrollContent` padding instead; the close button carries its own
  // right inset so it still lines up with the card column.
  container: {
    position: 'absolute',
    bottom: 80,
    left: 0,
    right: 0,
    zIndex: layer.sticky,
    paddingBottom: spacing[2],
  },
  closeButton: {
    alignSelf: 'flex-end',
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: PAGE_INSET,
    marginBottom: spacing[2],
    ...elevation.sm,
  },
  // Map P2 W1 (F5) — leading inset positions the active card at
  // PAGE_INSET; the trailing inset lets the LAST card snap to the same
  // inset instead of jamming against the screen edge.
  scrollContent: {
    paddingHorizontal: PAGE_INSET,
  },
  // Map P2 W1 (F5) — consistent inter-card gap (the peek carousel's
  // single source of spacing; snapToInterval accounts for it).
  tileWrapper: {
    marginRight: CARD_GAP,
  },
})
