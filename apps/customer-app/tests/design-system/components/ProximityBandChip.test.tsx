import React from 'react'
import { render } from '@testing-library/react-native'
import { ProximityBandChip } from '@/design-system/components/ProximityBandChip'

describe('<ProximityBandChip>', () => {
  // ─── Plan 4 M3.6 — proximityBand → label mapping ──────────────────────
  //
  // Pinned per spec §10.1 + plan M3.6. The chip renders nothing in
  // FOUR situations:
  //   - 'NEARBY' band (already-nearby merchants — visual contract)
  //   - null band (M3a hybrid phase — V2-rejected merchants like
  //     POSTCODE_CENTROID / NEEDS_REVIEW)
  //   - undefined band (older / pre-M3 responses missing the field)
  //   - missing band prop (forward-compat with future call sites)
  //
  // All four "renders nothing" cases are pinned so M3b's tile
  // rendering can write `<ProximityBandChip band={tile.proximityBand} />`
  // without a guard, regardless of whether the backend response was
  // pre-M3, M3a hybrid, or full M3b.

  it('NEARBY renders null (no chip — already-nearby merchants need no reminder)', () => {
    const { toJSON } = render(<ProximityBandChip band="NEARBY" />)
    expect(toJSON()).toBeNull()
  })

  it('null band renders null (M3a hybrid — V2-rejected merchants)', () => {
    const { toJSON } = render(<ProximityBandChip band={null} />)
    expect(toJSON()).toBeNull()
  })

  it('undefined band renders null (pre-M3 responses without the field)', () => {
    const { toJSON } = render(<ProximityBandChip band={undefined} />)
    expect(toJSON()).toBeNull()
  })

  it('missing band prop renders null (forward-compat)', () => {
    const { toJSON } = render(<ProximityBandChip />)
    expect(toJSON()).toBeNull()
  })

  it('IN_YOUR_AREA renders "In your area"', () => {
    const { getByText } = render(<ProximityBandChip band="IN_YOUR_AREA" />)
    expect(getByText('In your area')).toBeTruthy()
  })

  // PR #112 device-QA fixup-3 copy lock (2026-05-19) — owner-locked copy:
  //   A_LITTLE_FURTHER   → 'A short trip away'        (was 'A little further away' —
  //                                                    too casual at 6.7 miles per device QA)
  //   NEAREST_ON_REDEEMO → 'Closest match on Redeemo' (unchanged)
  // Negative pins guard old copy across BOTH prior fixups.
  it('A_LITTLE_FURTHER renders "A short trip away" (PR #112 fixup-3 copy)', () => {
    const { getByText, queryByText } = render(<ProximityBandChip band="A_LITTLE_FURTHER" />)
    expect(getByText('A short trip away')).toBeTruthy()
    expect(queryByText('A little further')).toBeNull()
    expect(queryByText('A little further away')).toBeNull()
  })

  it('NEAREST_ON_REDEEMO renders "Closest match on Redeemo" (locked since fixup-2)', () => {
    const { getByText, queryByText } = render(<ProximityBandChip band="NEAREST_ON_REDEEMO" />)
    expect(getByText('Closest match on Redeemo')).toBeTruthy()
    expect(queryByText('Nearest on Redeemo')).toBeNull()
  })

  it('uses the visible label as the default accessibilityLabel', () => {
    const { getByLabelText } = render(<ProximityBandChip band="IN_YOUR_AREA" />)
    expect(getByLabelText('In your area')).toBeTruthy()
  })

  it('honours an explicit accessibilityLabel override', () => {
    const { getByLabelText, queryByLabelText } = render(
      <ProximityBandChip band="A_LITTLE_FURTHER" accessibilityLabel="About 5 miles away" />,
    )
    expect(getByLabelText('About 5 miles away')).toBeTruthy()
    // Default label is NOT applied when an override is provided.
    expect(queryByLabelText('A short trip away')).toBeNull()
  })

  // v1.8 PR #126 device-QA-5 owner direction (2026-05-23) — semantic-tinted
  // variant tinting.  The chip background colour must vary by band so
  // colour communicates meaning, not just text:
  //   IN_YOUR_AREA       → soft sage/green tint  (#E8F5EE)
  //   A_LITTLE_FURTHER   → soft amber/peach tint (#FEF3E6)
  //   NEAREST_ON_REDEEMO → cream-rose tint       (#FEF6F5 = color.surface.tint)
  //
  // RNTL renders style props through to the host View's `style` array.  We
  // assert the variant `backgroundColor` is the inline override (which
  // wins over the base StyleSheet `chip` style) so a future refactor that
  // accidentally drops the per-band override would fail this pin.
  describe('v1.8 variant tinting (semantic colour by band)', () => {
    const findChipBg = (json: any): string | undefined => {
      // RNTL returns a tree where the outer View carries the chip styles.
      // The variant override is the LAST style entry in the merged array.
      const styles = json?.props?.style
      if (Array.isArray(styles)) {
        for (let i = styles.length - 1; i >= 0; i--) {
          const s = styles[i]
          if (s && typeof s === 'object' && 'backgroundColor' in s) {
            return s.backgroundColor as string
          }
        }
      } else if (styles && typeof styles === 'object' && 'backgroundColor' in styles) {
        return styles.backgroundColor as string
      }
      return undefined
    }

    it('IN_YOUR_AREA renders with green tint (#E8F5EE)', () => {
      const { toJSON } = render(<ProximityBandChip band="IN_YOUR_AREA" />)
      expect(findChipBg(toJSON())).toBe('#E8F5EE')
    })

    it('A_LITTLE_FURTHER renders with amber tint (#FEF3E6)', () => {
      const { toJSON } = render(<ProximityBandChip band="A_LITTLE_FURTHER" />)
      expect(findChipBg(toJSON())).toBe('#FEF3E6')
    })

    it('NEAREST_ON_REDEEMO renders with rose tint (#FEF6F5)', () => {
      const { toJSON } = render(<ProximityBandChip band="NEAREST_ON_REDEEMO" />)
      expect(findChipBg(toJSON())).toBe('#FEF6F5')
    })

    it('the three variants render visually distinct backgrounds', () => {
      const { toJSON: j1 } = render(<ProximityBandChip band="IN_YOUR_AREA" />)
      const { toJSON: j2 } = render(<ProximityBandChip band="A_LITTLE_FURTHER" />)
      const { toJSON: j3 } = render(<ProximityBandChip band="NEAREST_ON_REDEEMO" />)
      const bg1 = findChipBg(j1())
      const bg2 = findChipBg(j2())
      const bg3 = findChipBg(j3())
      expect(bg1).toBeDefined()
      expect(bg2).toBeDefined()
      expect(bg3).toBeDefined()
      expect(new Set([bg1, bg2, bg3]).size).toBe(3)
    })
  })
})
