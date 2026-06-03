import { composeInfoLine, composeWhereLine } from '@/features/shared/infoLine'

describe('composeInfoLine — Layout C (three-line info hierarchy)', () => {
  // Layout C: line 1 = descriptor (what it is); line 2 = locality + distance
  // (where, rendered with a pin icon); line 3 = proximity clause (band colour).
  // The helper returns the parts atomically so the consumer composes the
  // pin-icon "where" row and the coloured proximity line.

  it('returns descriptor / locality / distance atomically; IN_YOUR_AREA proximity', () => {
    const out = composeInfoLine({
      descriptor: 'Italian Restaurant',
      locality:   'Brightlingsea',
      distance:   '1.0 mi',
      band:       'IN_YOUR_AREA',
    })
    expect(out.descriptor).toBe('Italian Restaurant')
    expect(out.locality).toBe('Brightlingsea')
    expect(out.distance).toBe('1.0 mi')
    expect(out.proximity).toBe('In your area')
  })

  it('NEARBY band returns proximity=null (no third line)', () => {
    expect(composeInfoLine({
      descriptor: 'Italian Restaurant', locality: 'Brightlingsea', distance: '1.0 mi', band: 'NEARBY',
    }).proximity).toBeNull()
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

  it('atomic parts pass through unchanged (no descriptor·locality joining)', () => {
    expect(composeInfoLine({
      descriptor: 'D', locality: 'L', distance: 'X mi', band: 'IN_YOUR_AREA',
    })).toEqual({ descriptor: 'D', locality: 'L', distance: 'X mi', proximity: 'In your area' })
  })

  it('fully empty input returns empty strings + null proximity without throwing', () => {
    expect(composeInfoLine({ descriptor: '', locality: '', distance: '', band: null }))
      .toEqual({ descriptor: '', locality: '', distance: '', proximity: null })
  })
})

describe('composeWhereLine — locality · distance', () => {
  it('joins locality and distance with a middot', () => {
    expect(composeWhereLine('Brightlingsea', '0.4 mi')).toBe('Brightlingsea · 0.4 mi')
  })

  it('locality only (no distance) — no orphan separator', () => {
    expect(composeWhereLine('Brightlingsea', '')).toBe('Brightlingsea')
  })

  it('distance only (no locality) — no orphan separator', () => {
    expect(composeWhereLine('', '0.4 mi')).toBe('0.4 mi')
  })

  it('both empty → empty string (consumer suppresses the where row)', () => {
    expect(composeWhereLine('', '')).toBe('')
  })
})
