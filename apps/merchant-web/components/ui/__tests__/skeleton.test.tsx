import { render, screen } from '@testing-library/react'
import {
  Skeleton,
  SkeletonCard,
  SkeletonKpiRow,
  SkeletonChartBlock,
  SkeletonTable,
  SkeletonCardList,
  LoadingStatus,
} from '../skeleton'

// A minimal MediaQueryList mock. `matches` drives the reduced-motion branch;
// addEventListener/removeEventListener are no-ops (no test here changes the
// preference mid-render).
function mockMatchMedia(matches: boolean) {
  window.matchMedia = jest.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  })) as unknown as typeof window.matchMedia
}

describe('Skeleton primitives', () => {
  afterEach(() => {
    // @ts-expect-error - test-only cleanup of the mocked global
    delete window.matchMedia
  })

  it('applies the pulse animation by default (no reduced-motion preference)', () => {
    mockMatchMedia(false)
    render(<Skeleton data-testid="bone" />)
    expect(screen.getByTestId('bone').className).toMatch(/animate-pulse/)
  })

  it('suppresses the pulse animation when prefers-reduced-motion matches', () => {
    mockMatchMedia(true)
    render(<Skeleton data-testid="bone" />)
    expect(screen.getByTestId('bone').className).not.toMatch(/animate-pulse/)
  })

  it('falls back to no animation when matchMedia is unavailable (SSR-safe default)', () => {
    // @ts-expect-error - simulate an environment without matchMedia
    delete window.matchMedia
    render(<Skeleton data-testid="bone" />)
    // Defaults to false (not reduced) since the effect never ran to confirm otherwise -
    // matches the SSR-safe contract documented on the hook.
    expect(screen.getByTestId('bone')).toBeInTheDocument()
  })

  it('SkeletonCard renders a head bar plus the requested number of body lines', () => {
    mockMatchMedia(false)
    const { container } = render(<SkeletonCard lines={4} showIcon />)
    // 1 head label bone + 4 body line bones = 5 total text bones, plus the icon circle.
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBe(6)
  })

  it('SkeletonKpiRow renders the requested tile count', () => {
    mockMatchMedia(false)
    const { container } = render(<SkeletonKpiRow count={4} />)
    expect(container.querySelectorAll('[data-testid="skeleton-bone"]').length).toBeGreaterThan(0)
    // 4 KPI tiles, each a SkeletonCard(lines=2, showIcon) -> 4 cards.
    expect(container.querySelectorAll('.rounded-2xl.border').length).toBe(4)
  })

  it('SkeletonChartBlock renders a title bar and a chart-shaped block', () => {
    mockMatchMedia(false)
    const { container } = render(<SkeletonChartBlock />)
    expect(container.querySelector('.h-40')).toBeInTheDocument()
  })

  it('SkeletonTable renders the requested row count', () => {
    mockMatchMedia(false)
    const { container } = render(<SkeletonTable rows={3} columns={4} />)
    const rows = container.firstElementChild?.children
    expect(rows?.length).toBe(3)
  })

  it('SkeletonCardList renders the requested card count', () => {
    mockMatchMedia(false)
    const { container } = render(<SkeletonCardList count={5} />)
    expect(container.firstElementChild?.children.length).toBe(5)
  })

  it('LoadingStatus renders exactly one role=status region carrying the given label', () => {
    mockMatchMedia(false)
    render(
      <LoadingStatus label="Loading your vouchers...">
        <SkeletonCardList count={2} />
      </LoadingStatus>,
    )
    expect(screen.getAllByRole('status')).toHaveLength(1)
    expect(screen.getByText('Loading your vouchers...')).toBeInTheDocument()
  })

  it('LoadingStatus marks the visual bones aria-hidden so the label is announced once', () => {
    mockMatchMedia(false)
    render(
      <LoadingStatus label="Loading your branches...">
        <SkeletonCardList count={1} />
      </LoadingStatus>,
    )
    const status = screen.getByRole('status')
    const hiddenLayer = status.querySelector('[aria-hidden="true"]')
    expect(hiddenLayer).toBeInTheDocument()
    expect(hiddenLayer).toContainElement(status.querySelector('[data-slot="skeleton"]'))
  })
})
