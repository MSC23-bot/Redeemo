/**
 * Batch 1B (2026-06-01) static-source meta-pin (mirrors the
 * useFavourite allowlist pattern at src/features/favourites/__tests__/
 * FavouriteHeart.test.tsx).
 *
 * Locked invariant: <ProximityBandChip> has ZERO JSX mounts across
 * apps/customer-app/src as of Batch 1B. The component file is allowlisted
 * (it imports itself and references itself in its docstring). If a future
 * surface mounts the standalone chip, add that file to ALLOWLIST AND
 * document the surface in ProximityBandChip.tsx's top-of-file JSDoc.
 */

import * as fs from 'fs'
import * as path from 'path'

describe('ProximityBandChip — zero JSX consumers (Batch 1B)', () => {
  it('no <ProximityBandChip element is mounted anywhere in apps/customer-app/src', () => {
    const srcDir = path.resolve(__dirname, '../../src')
    const ALLOWLIST = new Set([
      // The component's own file (self-reference in JSDoc only, not a JSX mount).
      'design-system/components/ProximityBandChip.tsx',
    ])

    function walk(dir: string, acc: string[]): string[] {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, ent.name)
        if (ent.isDirectory()) {
          if (ent.name === '__tests__') continue
          walk(full, acc)
        } else if (/\.(ts|tsx)$/.test(ent.name)) {
          acc.push(full)
        }
      }
      return acc
    }

    // Strip block comments (/* ... */) then exclude single-line comment
    // lines (//). The latter is line-scoped so a JSX mount on the same
    // line as a trailing comment still flags.
    function stripComments(src: string): string {
      const noBlocks = src.replace(/\/\*[\s\S]*?\*\//g, '')
      return noBlocks
        .split('\n')
        .filter((line) => !/^\s*\/\//.test(line))
        .join('\n')
    }

    const violations: string[] = []
    for (const file of walk(srcDir, [])) {
      const rel = path.relative(srcDir, file)
      if (ALLOWLIST.has(rel)) continue
      const content = fs.readFileSync(file, 'utf-8')
      const stripped = stripComments(content)
      if (/<ProximityBandChip[\s/>]/.test(stripped)) {
        violations.push(rel)
      }
    }
    expect(violations).toEqual([])
  })
})
