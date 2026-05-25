/**
 * Provider — pins context-exposed actions, single sheet mount, and
 * promise-resolves-on-dismiss semantics. Hook-side default opts wiring
 * verified separately in tests/hooks/useLocation.test.tsx.
 */
import React from 'react'
import { Text, Pressable, Linking } from 'react-native'
import { render, fireEvent, act, waitFor } from '@testing-library/react-native'

jest.mock('@/lib/devLocationOverride', () => ({
  devLocationOverride: jest.fn(),
}))

import {
  LocationPermissionProvider,
  useLocationPermissionPrompts,
} from '@/lib/location/LocationPermissionProvider'
import { devLocationOverride } from '@/lib/devLocationOverride'

const mockOverride = devLocationOverride as jest.Mock

// `Linking.openSettings` is a method on the imported singleton.
// Spy + restore per test so other suites that share the jest-expo
// runtime aren't affected.
let openSettingsSpy: jest.SpyInstance

beforeEach(() => {
  mockOverride.mockReset()
  mockOverride.mockReturnValue(null)
  openSettingsSpy = jest
    .spyOn(Linking, 'openSettings')
    .mockResolvedValue(undefined as unknown as void)
})

afterEach(() => {
  openSettingsSpy.mockRestore()
})

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

describe('LocationPermissionProvider — recovery sheet "Open settings" CTA', () => {
  it('invokes Linking.openSettings exactly once when the primary CTA fires (production mode)', async () => {
    const { getByLabelText, getByTestId } = render(
      <LocationPermissionProvider>
        <ConsumerHarness
          onShowRecoveryPress={(resolver) => { void resolver() }}
        />
      </LocationPermissionProvider>,
    )

    await act(async () => {
      fireEvent.press(getByLabelText('show-recovery'))
    })

    await act(async () => {
      fireEvent.press(getByTestId('location-recovery-open-settings'))
    })

    await waitFor(() => expect(openSettingsSpy).toHaveBeenCalledTimes(1))
  })

  it('still dismisses the sheet after Linking.openSettings resolves', async () => {
    let resolverPromise: Promise<void> | null = null
    const { getByLabelText, getByTestId, queryByTestId } = render(
      <LocationPermissionProvider>
        <ConsumerHarness
          onShowRecoveryPress={(resolver) => { resolverPromise = resolver() }}
        />
      </LocationPermissionProvider>,
    )

    act(() => {
      fireEvent.press(getByLabelText('show-recovery'))
    })
    let resolved = false
    void resolverPromise!.then(() => { resolved = true })

    await act(async () => {
      fireEvent.press(getByTestId('location-recovery-open-settings'))
    })

    await waitFor(() => expect(resolved).toBe(true))
    await waitFor(() => expect(queryByTestId('location-recovery-sheet')).toBeNull())
  })

  it('still dismisses the sheet even if Linking.openSettings throws (e.g. no Settings activity)', async () => {
    openSettingsSpy.mockRejectedValueOnce(new Error('no Settings activity'))
    let resolverPromise: Promise<void> | null = null
    const { getByLabelText, getByTestId, queryByTestId } = render(
      <LocationPermissionProvider>
        <ConsumerHarness
          onShowRecoveryPress={(resolver) => { resolverPromise = resolver() }}
        />
      </LocationPermissionProvider>,
    )

    act(() => {
      fireEvent.press(getByLabelText('show-recovery'))
    })
    let resolved = false
    void resolverPromise!.then(() => { resolved = true })

    await act(async () => {
      fireEvent.press(getByTestId('location-recovery-open-settings'))
    })

    await waitFor(() => expect(resolved).toBe(true))
    await waitFor(() => expect(queryByTestId('location-recovery-sheet')).toBeNull())
  })

  it('does NOT call Linking.openSettings in §AU dev override mode, but still dismisses the sheet', async () => {
    mockOverride.mockReturnValue({ lat: 53.6458, lng: -1.785 })
    let resolverPromise: Promise<void> | null = null
    const { getByLabelText, getByTestId, queryByTestId } = render(
      <LocationPermissionProvider>
        <ConsumerHarness
          onShowRecoveryPress={(resolver) => { resolverPromise = resolver() }}
        />
      </LocationPermissionProvider>,
    )

    act(() => {
      fireEvent.press(getByLabelText('show-recovery'))
    })
    let resolved = false
    void resolverPromise!.then(() => { resolved = true })

    await act(async () => {
      fireEvent.press(getByTestId('location-recovery-open-settings'))
    })

    await waitFor(() => expect(resolved).toBe(true))
    expect(openSettingsSpy).not.toHaveBeenCalled()
    expect(queryByTestId('location-recovery-sheet')).toBeNull()
  })
})

describe('LocationPermissionProvider — in-flight resolver chaining', () => {
  // Two parallel `showExplainer()` calls before the sheet dismisses must
  // BOTH resolve on the same dismissal — chained via the ref-rewriting
  // pattern in the provider. Silent-regression risk: a refactor that
  // overwrites the resolver instead of chaining would leave the first
  // caller hanging forever and the test suite wouldn't notice without
  // an explicit await on both promises.
  it('two parallel showExplainer() calls both resolve on the same dismissal', async () => {
    const captured: Array<Promise<void>> = []
    const { getByLabelText, getByTestId } = render(
      <LocationPermissionProvider>
        <ConsumerHarness
          onShowExplainerPress={(resolver) => { captured.push(resolver()) }}
        />
      </LocationPermissionProvider>,
    )

    act(() => {
      fireEvent.press(getByLabelText('show-explainer'))
      fireEvent.press(getByLabelText('show-explainer'))
    })
    expect(captured).toHaveLength(2)

    let resolvedA = false
    let resolvedB = false
    void captured[0]!.then(() => { resolvedA = true })
    void captured[1]!.then(() => { resolvedB = true })

    await act(async () => {
      fireEvent.press(getByTestId('pre-permission-explainer-dismiss'))
    })

    await waitFor(() => {
      expect(resolvedA).toBe(true)
      expect(resolvedB).toBe(true)
    })
  })

  // Mirror for recovery sheet — same resolver-chaining pattern, same
  // silent-regression risk.
  it('two parallel showRecovery() calls both resolve on the same dismissal', async () => {
    const captured: Array<Promise<void>> = []
    const { getByLabelText, getByTestId } = render(
      <LocationPermissionProvider>
        <ConsumerHarness
          onShowRecoveryPress={(resolver) => { captured.push(resolver()) }}
        />
      </LocationPermissionProvider>,
    )

    act(() => {
      fireEvent.press(getByLabelText('show-recovery'))
      fireEvent.press(getByLabelText('show-recovery'))
    })
    expect(captured).toHaveLength(2)

    let resolvedA = false
    let resolvedB = false
    void captured[0]!.then(() => { resolvedA = true })
    void captured[1]!.then(() => { resolvedB = true })

    await act(async () => {
      fireEvent.press(getByTestId('location-recovery-dismiss'))
    })

    await waitFor(() => {
      expect(resolvedA).toBe(true)
      expect(resolvedB).toBe(true)
    })
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
