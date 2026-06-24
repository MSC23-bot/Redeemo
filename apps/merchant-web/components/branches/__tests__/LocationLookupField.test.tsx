import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { LocationLookupField } from '@/components/branches/LocationLookupField'
import { ApiError } from '@/lib/api/client'

// Branches PR-6 (Layer 3): the reusable search-and-pick location lookup. It debounces a
// min-length-3 query, calls searchLocation, renders the candidate list (name + formatted
// address + "Use this address"), and on pick calls onPick with { candidateToken,
// addressParts, formattedAddress }. It NEVER renders lat/lng or a map pin. Loading /
// empty / error states are calm and never leak provider internals.

const searchLocation = jest.fn()
jest.mock('@/lib/api/location', () => ({
  searchLocation: (...args: unknown[]) => searchLocation(...args),
}))

const CANDIDATE = {
  candidateToken: 'tok_1',
  name: 'Old Foundry Kitchen',
  formattedAddress: '12 Mill Lane, Huddersfield, HD1 1AA, UK',
  addressParts: { addressLine1: '12 Mill Lane', city: 'Huddersfield', postcode: 'HD1 1AA' },
}

beforeEach(() => {
  searchLocation.mockReset()
})

describe('LocationLookupField min-length + debounce', () => {
  it('does not search below the 3-char minimum', async () => {
    render(<LocationLookupField onPick={jest.fn()} />)
    const input = screen.getByRole('combobox')
    fireEvent.change(input, { target: { value: 'ol' } })
    // Give any debounce window time to (not) fire.
    await new Promise((r) => setTimeout(r, 500))
    expect(searchLocation).not.toHaveBeenCalled()
  })

  it('debounces, fires the search once, and renders the candidate list', async () => {
    searchLocation.mockResolvedValue([CANDIDATE])
    render(<LocationLookupField onPick={jest.fn()} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'old foundry' } })

    await waitFor(() => expect(searchLocation).toHaveBeenCalledTimes(1))
    expect(searchLocation).toHaveBeenCalledWith('old foundry')

    const results = await screen.findByTestId('location-lookup-results')
    expect(results).toBeInTheDocument()
    expect(screen.getByText('Old Foundry Kitchen')).toBeInTheDocument()
    expect(screen.getByText(/12 Mill Lane, Huddersfield, HD1 1AA/)).toBeInTheDocument()
    expect(screen.getByText(/use this address/i)).toBeInTheDocument()
  })

  it('only fires the LATEST query when typing quickly (debounce collapses keystrokes)', async () => {
    searchLocation.mockResolvedValue([CANDIDATE])
    render(<LocationLookupField onPick={jest.fn()} />)
    const input = screen.getByRole('combobox')
    fireEvent.change(input, { target: { value: 'old' } })
    fireEvent.change(input, { target: { value: 'old f' } })
    fireEvent.change(input, { target: { value: 'old foundry' } })

    await waitFor(() => expect(searchLocation).toHaveBeenCalledTimes(1))
    expect(searchLocation).toHaveBeenCalledWith('old foundry')
  })
})

describe('LocationLookupField pick callback', () => {
  it('calls onPick with the token + address parts + formatted address, then collapses the list', async () => {
    searchLocation.mockResolvedValue([CANDIDATE])
    const onPick = jest.fn()
    render(<LocationLookupField onPick={onPick} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'old foundry' } })

    const useBtn = await screen.findByTestId('location-lookup-result')
    fireEvent.click(useBtn)

    expect(onPick).toHaveBeenCalledTimes(1)
    expect(onPick).toHaveBeenCalledWith({
      candidateToken: 'tok_1',
      formattedAddress: '12 Mill Lane, Huddersfield, HD1 1AA, UK',
      addressParts: { addressLine1: '12 Mill Lane', city: 'Huddersfield', postcode: 'HD1 1AA' },
    })
    await waitFor(() =>
      expect(screen.queryByTestId('location-lookup-results')).not.toBeInTheDocument(),
    )
  })
})

describe('LocationLookupField states', () => {
  it('shows a loading state while the search is in flight', async () => {
    let resolveSearch: (v: unknown[]) => void = () => {}
    searchLocation.mockImplementation(() => new Promise((res) => (resolveSearch = res)))
    render(<LocationLookupField onPick={jest.fn()} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'old foundry' } })

    expect(await screen.findByTestId('location-lookup-loading')).toBeInTheDocument()
    resolveSearch([CANDIDATE])
    await waitFor(() =>
      expect(screen.queryByTestId('location-lookup-loading')).not.toBeInTheDocument(),
    )
  })

  it('shows an empty state when there are no matches', async () => {
    searchLocation.mockResolvedValue([])
    render(<LocationLookupField onPick={jest.fn()} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'nowhere here' } })

    expect(await screen.findByTestId('location-lookup-empty')).toBeInTheDocument()
    expect(screen.getByText(/no matches found/i)).toBeInTheDocument()
  })

  it('maps a LOCATION_SEARCH_NO_RESULTS error to the empty state', async () => {
    searchLocation.mockRejectedValue(new ApiError(404, { error: { code: 'LOCATION_SEARCH_NO_RESULTS' } }))
    render(<LocationLookupField onPick={jest.fn()} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'nowhere here' } })

    expect(await screen.findByTestId('location-lookup-empty')).toBeInTheDocument()
  })

  it('shows a calm error that never leaks provider internals when the search is unavailable', async () => {
    searchLocation.mockRejectedValue(new ApiError(503, { error: { code: 'LOCATION_SEARCH_UNAVAILABLE' } }))
    render(<LocationLookupField onPick={jest.fn()} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'old foundry' } })

    const err = await screen.findByTestId('location-lookup-error')
    expect(err).toHaveTextContent(/unavailable right now/i)
    // No provider internals leaked.
    expect(err).not.toHaveTextContent(/google/i)
    expect(err).not.toHaveTextContent(/api key/i)
  })

  it('surfaces a rate-limited message distinctly', async () => {
    searchLocation.mockRejectedValue(new ApiError(429, { error: { code: 'LOCATION_SEARCH_RATE_LIMITED' } }))
    render(<LocationLookupField onPick={jest.fn()} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'old foundry' } })

    const err = await screen.findByTestId('location-lookup-error')
    expect(err).toHaveTextContent(/too many searches/i)
  })
})

describe('LocationLookupField never exposes coordinates or a map pin', () => {
  it('renders no lat/lng even if the candidate object carried them', async () => {
    searchLocation.mockResolvedValue([
      { ...CANDIDATE, latitude: 53.6458, longitude: -1.7799 } as never,
    ])
    render(<LocationLookupField onPick={jest.fn()} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'old foundry' } })

    await screen.findByTestId('location-lookup-results')
    expect(screen.queryByText(/53\.6458/)).not.toBeInTheDocument()
    expect(screen.queryByText(/-1\.7799/)).not.toBeInTheDocument()
    // No interactive map element (no draggable pin / iframe map).
    expect(document.querySelector('iframe')).toBeNull()
  })
})
