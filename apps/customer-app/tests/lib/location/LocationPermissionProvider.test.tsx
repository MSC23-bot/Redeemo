/**
 * Provider — pins context-exposed actions, single sheet mount, and
 * promise-resolves-on-dismiss semantics. Hook-side default opts wiring
 * verified separately in tests/hooks/useLocation.test.tsx.
 */
import React from 'react'
import { Text, Pressable } from 'react-native'
import { render, fireEvent, act, waitFor } from '@testing-library/react-native'
import {
  LocationPermissionProvider,
  useLocationPermissionPrompts,
} from '@/lib/location/LocationPermissionProvider'

function ConsumerHarness({
  onShowExplainerPress,
  onShowRecoveryPress,
}: {
  onShowExplainerPress?: (resolver: () => Promise<void>) => void
  onShowRecoveryPress?: (resolver: () => Promise<void>) => void
}) {
  const { showExplainer, showRecovery } = useLocationPermissionPrompts()
  return (
    <>
      <Pressable
        accessibilityLabel="show-explainer"
        onPress={() => onShowExplainerPress?.(showExplainer)}
      >
        <Text>Show Explainer</Text>
      </Pressable>
      <Pressable
        accessibilityLabel="show-recovery"
        onPress={() => onShowRecoveryPress?.(showRecovery)}
      >
        <Text>Show Recovery</Text>
      </Pressable>
    </>
  )
}

describe('LocationPermissionProvider — context actions', () => {
  it('exposes showExplainer + showRecovery via useLocationPermissionPrompts', () => {
    let captured: { showExplainer?: unknown; showRecovery?: unknown } = {}
    function Probe() {
      captured = useLocationPermissionPrompts()
      return null
    }
    render(
      <LocationPermissionProvider>
        <Probe />
      </LocationPermissionProvider>,
    )
    expect(typeof captured.showExplainer).toBe('function')
    expect(typeof captured.showRecovery).toBe('function')
  })

  it('mounts the explainer sheet exactly once at the provider level (no per-consumer duplication)', async () => {
    // Three consumers — each capable of triggering the explainer.
    // After all three trigger, only ONE sheet must be visible in the
    // tree (the provider owns the single Modal mount).
    const { getAllByLabelText, queryAllByTestId } = render(
      <LocationPermissionProvider>
        <ConsumerHarness
          onShowExplainerPress={(resolver) => { void resolver() }}
        />
        <ConsumerHarness
          onShowExplainerPress={(resolver) => { void resolver() }}
        />
        <ConsumerHarness
          onShowExplainerPress={(resolver) => { void resolver() }}
        />
      </LocationPermissionProvider>,
    )
    const triggerBtns = getAllByLabelText('show-explainer')
    expect(triggerBtns).toHaveLength(3)
    await act(async () => {
      fireEvent.press(triggerBtns[0])
      fireEvent.press(triggerBtns[1])
      fireEvent.press(triggerBtns[2])
    })
    await waitFor(() => {
      expect(queryAllByTestId('pre-permission-explainer-sheet')).toHaveLength(1)
    })
  })

  it('mounts the recovery sheet exactly once at the provider level (no per-consumer duplication)', async () => {
    const { getAllByLabelText, queryAllByTestId } = render(
      <LocationPermissionProvider>
        <ConsumerHarness
          onShowRecoveryPress={(resolver) => { void resolver() }}
        />
        <ConsumerHarness
          onShowRecoveryPress={(resolver) => { void resolver() }}
        />
      </LocationPermissionProvider>,
    )
    const triggerBtns = getAllByLabelText('show-recovery')
    expect(triggerBtns).toHaveLength(2)
    await act(async () => {
      fireEvent.press(triggerBtns[0])
      fireEvent.press(triggerBtns[1])
    })
    await waitFor(() => {
      expect(queryAllByTestId('location-recovery-sheet')).toHaveLength(1)
    })
  })
})

describe('LocationPermissionProvider — promise resolution', () => {
  it('showExplainer() returns a promise that resolves when the explainer is dismissed', async () => {
    let resolverPromise: Promise<void> | null = null
    const { getByLabelText, getByTestId } = render(
      <LocationPermissionProvider>
        <ConsumerHarness
          onShowExplainerPress={(resolver) => {
            resolverPromise = resolver()
          }}
        />
      </LocationPermissionProvider>,
    )

    act(() => {
      fireEvent.press(getByLabelText('show-explainer'))
    })
    expect(resolverPromise).not.toBeNull()

    let resolved = false
    void resolverPromise!.then(() => {
      resolved = true
    })

    await act(async () => {
      fireEvent.press(getByTestId('pre-permission-explainer-dismiss'))
    })

    await waitFor(() => expect(resolved).toBe(true))
  })

  it('showExplainer() resolves when the continue CTA is pressed too', async () => {
    let resolverPromise: Promise<void> | null = null
    const { getByLabelText, getByTestId } = render(
      <LocationPermissionProvider>
        <ConsumerHarness
          onShowExplainerPress={(resolver) => {
            resolverPromise = resolver()
          }}
        />
      </LocationPermissionProvider>,
    )

    act(() => {
      fireEvent.press(getByLabelText('show-explainer'))
    })
    let resolved = false
    void resolverPromise!.then(() => { resolved = true })

    await act(async () => {
      fireEvent.press(getByTestId('pre-permission-explainer-continue'))
    })

    await waitFor(() => expect(resolved).toBe(true))
  })

  it('showRecovery() returns a promise that resolves when the recovery sheet is dismissed', async () => {
    let resolverPromise: Promise<void> | null = null
    const { getByLabelText, getByTestId } = render(
      <LocationPermissionProvider>
        <ConsumerHarness
          onShowRecoveryPress={(resolver) => {
            resolverPromise = resolver()
          }}
        />
      </LocationPermissionProvider>,
    )

    act(() => {
      fireEvent.press(getByLabelText('show-recovery'))
    })
    let resolved = false
    void resolverPromise!.then(() => { resolved = true })

    await act(async () => {
      fireEvent.press(getByTestId('location-recovery-dismiss'))
    })

    await waitFor(() => expect(resolved).toBe(true))
  })
})

describe('LocationPermissionProvider — graceful no-provider fallback', () => {
  it('useLocationPermissionPrompts returns no-op actions when no provider is mounted', async () => {
    let captured: { showExplainer?: () => Promise<void>; showRecovery?: () => Promise<void> } = {}
    function Probe() {
      captured = useLocationPermissionPrompts()
      return null
    }
    render(<Probe />)
    expect(typeof captured.showExplainer).toBe('function')
    expect(typeof captured.showRecovery).toBe('function')

    // No-op resolvers settle immediately so callers wrapped in test
    // environments without the provider don't hang awaiting a sheet
    // that will never mount.
    await expect(captured.showExplainer!()).resolves.toBeUndefined()
    await expect(captured.showRecovery!()).resolves.toBeUndefined()
  })
})
