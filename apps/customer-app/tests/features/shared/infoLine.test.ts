import { composeInfoLine } from '@/features/shared/infoLine'

describe('composeInfoLine — Batch 1B Tier 3 Layout B (two-line info hierarchy)', () => {
  // Layout B: line 1 = `descriptor · locality` (primary); line 2 =
  // `distance · proximity`. The helper returns the three parts separately
  // so the consumer can render two `numberOfLines={1}` Text rows, with the
  // proximity clause as a band-coloured nested child of line 2.

  it('primary = descriptor · locality; distance passes through; IN_YOUR_AREA proximity', () => {
    const out = composeInfoLine({
      descriptor: 'Italian Restaurant',
      locality:   'Brightlingsea',
      distance:   '1.0 mi',
      band:       'IN_YOUR_AREA',
    })
    expect(out.primary).toBe('Italian Restaurant · Brightlingsea')
    expect(out.distance).toBe('1.0 mi')
    expect(out.proximity).toBe('In your area')
  })

  it('NEARBY band returns proximity=null (no clause on line 2)', () => {
    const out = composeInfoLine({
      descriptor: 'Italian Restaurant',
      locality:   'Brightlingsea',
      distance:   '1.0 mi',
      band:       'NEARBY',
    })
    expect(out.primary).toBe('Italian Restaurant · Brightlingsea')
    expect(out.distance).toBe('1.0 mi')
    expect(out.proximity).toBeNull()
  })

  it('null band returns proximity=null', () => {
    expect(composeInfoLine({
      descriptor: 'Italian Restaurant', locality: 'Brightlingsea', distance: '1.0 mi', band: null,
    }).proximity).toBeNull()
  })

  it('undefined band returns proximity=null', () => {
    expect(composeInfoLine({
      descriptor: 'Italian Restaurant', locality: 'Brightlingsea', distance: '1.0 mi', band: undefined,
    }).proximity).toBeNull()
  })

  it('A_LITTLE_FURTHER returns "A short trip away"', () => {
    expect(composeInfoLine({
      descriptor: 'Café', locality: '', distance: '', band: 'A_LITTLE_FURTHER',
    }).proximity).toBe('A short trip away')
  })

  it('NEAREST_ON_REDEEMO returns "Nearest match on Redeemo"', () => {
    expect(composeInfoLine({
      descriptor: 'Café', locality: '', distance: '', band: 'NEAREST_ON_REDEEMO',
    }).proximity).toBe('Nearest match on Redeemo')
  })

  it('empty locality produces no orphan separator in primary (descriptor only)', () => {
    const out = composeInfoLine({
      descriptor: 'Café', locality: '', distance: '1.0 mi', band: 'IN_YOUR_AREA',
    })
    expect(out.primary).toBe('Café')
    expect(out.distance).toBe('1.0 mi')
    expect(out.proximity).toBe('In your area')
  })

  it('empty distance returns distance="" so line 2 falls back to the proximity clause only', () => {
    const out = composeInfoLine({
      descriptor: 'Café', locality: 'Brightlingsea', distance: '', band: 'IN_YOUR_AREA',
    })
    expect(out.primary).toBe('Café · Brightlingsea')
    expect(out.distance).toBe('')
    expect(out.proximity).toBe('In your area')
  })

  it('descriptor-only (no locality, no distance, no band): primary=descriptor, distance="", proximity=null', () => {
    const out = composeInfoLine({
      descriptor: 'Café', locality: '', distance: '', band: null,
    })
    expect(out.primary).toBe('Café')
    expect(out.distance).toBe('')
    expect(out.proximity).toBeNull()
  })

  it('Layout B separation: primary holds [descriptor, locality]; distance + proximity returned SEPARATELY for line 2', () => {
    // The two-line split is the whole point — line 1 (descriptor·locality)
    // can tail-ellipsis without ever starving line 2 (distance·proximity).
    expect(composeInfoLine({
      descriptor: 'D', locality: 'L', distance: 'X mi', band: 'IN_YOUR_AREA',
    })).toEqual({ primary: 'D · L', distance: 'X mi', proximity: 'In your area' })
  })

  it('fully empty input collapses primary to "" without throwing (consumer suppresses the render)', () => {
    const out = composeInfoLine({ descriptor: '', locality: '', distance: '', band: null })
    expect(out.primary).toBe('')
    expect(out.distance).toBe('')
    expect(out.proximity).toBeNull()
  })
})
