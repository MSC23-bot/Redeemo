import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react'
import { PrePermissionExplainer } from './PrePermissionExplainer'
import { LocationRecoverySheet } from './LocationRecoverySheet'

/**
 * Provider that owns the explainer + recovery sheet mounts and
 * exposes show actions via React context.
 *
 * Why a provider:
 *   • Sheets are mounted ONCE at the (app) tree root — every screen
 *     inherits without duplicating Modal mounts per consumer.
 *   • The extended `useUserLocation` hook reads default explainer +
 *     recovery callbacks from this context, so consumers call
 *     `request()` with no opts and still get the branded sheets.
 *   • Promise-resolves-on-dismiss semantics let the hook AWAIT the
 *     explainer before firing the native OS prompt, and AWAIT the
 *     recovery sheet on a `denied` outcome before unblocking the
 *     caller — preserves the existing `request()` async contract.
 *
 * Reusable: Task 7's Saved Area screen will consume the same
 * provider via `useUserLocation`. No surface needs to wire its own
 * Modal.
 */

type ResolveFn = () => void

type ContextValue = {
  showExplainer: () => Promise<void>
  showRecovery: () => Promise<void>
}

// Fallback returned when the hook is consumed outside a provider.
// No-op resolvers settle synchronously so callers wrapped in test
// environments (or any tree without the provider) don't hang.
const NOOP_CONTEXT: ContextValue = {
  showExplainer: () => Promise.resolve(),
  showRecovery: () => Promise.resolve(),
}

const LocationPermissionContext = createContext<ContextValue | null>(null)

type Props = { children: React.ReactNode }

export function LocationPermissionProvider({ children }: Props) {
  const [explainerVisible, setExplainerVisible] = useState(false)
  const [recoveryVisible, setRecoveryVisible] = useState(false)
  // Pending resolvers — only one of each sheet can be in-flight at a
  // time (the sheets are modal). A second `showExplainer()` while
  // the first is still visible no-ops and resolves with the original
  // dismissal so the caller's await chain never deadlocks.
  const explainerResolverRef = useRef<ResolveFn | null>(null)
  const recoveryResolverRef = useRef<ResolveFn | null>(null)

  const showExplainer = useCallback((): Promise<void> => {
    return new Promise<void>((resolve) => {
      if (explainerResolverRef.current) {
        // Already in flight — queue this resolver onto the existing
        // dismissal by chaining: resolve immediately AFTER the prior
        // one fires. Simpler than maintaining a list: keep a single
        // pending resolver and dismiss-all-on-close.
        const prior = explainerResolverRef.current
        explainerResolverRef.current = () => { prior(); resolve() }
      } else {
        explainerResolverRef.current = resolve
      }
      setExplainerVisible(true)
    })
  }, [])

  const showRecovery = useCallback((): Promise<void> => {
    return new Promise<void>((resolve) => {
      if (recoveryResolverRef.current) {
        const prior = recoveryResolverRef.current
        recoveryResolverRef.current = () => { prior(); resolve() }
      } else {
        recoveryResolverRef.current = resolve
      }
      setRecoveryVisible(true)
    })
  }, [])

  const dismissExplainer = useCallback(() => {
    setExplainerVisible(false)
    const r = explainerResolverRef.current
    explainerResolverRef.current = null
    r?.()
  }, [])

  const dismissRecovery = useCallback(() => {
    setRecoveryVisible(false)
    const r = recoveryResolverRef.current
    recoveryResolverRef.current = null
    r?.()
  }, [])

  // Open settings is delegated by the consumer (the hook) — provider
  // doesn't import expo's Linking directly. We just dismiss the sheet
  // here and trust the hook to fire `openSettings()` as part of its
  // own flow when it kicks off the show.
  const onOpenSettings = useCallback(() => {
    dismissRecovery()
  }, [dismissRecovery])

  const value = useMemo<ContextValue>(() => ({ showExplainer, showRecovery }), [showExplainer, showRecovery])

  return (
    <LocationPermissionContext.Provider value={value}>
      {children}
      <PrePermissionExplainer
        visible={explainerVisible}
        onContinue={dismissExplainer}
        onDismiss={dismissExplainer}
      />
      <LocationRecoverySheet
        visible={recoveryVisible}
        onOpenSettings={onOpenSettings}
        onDismiss={dismissRecovery}
      />
    </LocationPermissionContext.Provider>
  )
}

/**
 * Consumer hook for the show actions. Returns a graceful no-op
 * context when no provider is mounted so test environments and any
 * surface rendered outside the (app) tree don't crash.
 */
export function useLocationPermissionPrompts(): ContextValue {
  const ctx = useContext(LocationPermissionContext)
  return ctx ?? NOOP_CONTEXT
}
