import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

// Walk src/features/home/** and assert no file imports protected Search
// internals. PR A (sticky header) must change ONLY the Home surface and must
// not reach into Search matching / ranking / query parsing (spec §7).
const HOME_DIR = join(__dirname, '..', '..', '..', 'src', 'features', 'home')
const BANNED = [
  'features/search/components/SearchBar',
  'features/search/components/FilterSheet',
  'features/search/screens/SearchScreen',
  'hooks/useSearch',
  'lib/search',
  'lib/api/ranking',
]

function walk(dir: string): string[] {
  return readdirSync(dir)
    .flatMap((name) => {
      const p = join(dir, name)
      return statSync(p).isDirectory() ? walk(p) : [p]
    })
    .filter((p) => p.endsWith('.ts') || p.endsWith('.tsx'))
}

describe('Home does not import protected Search internals (spec §7)', () => {
  const files = walk(HOME_DIR)

  it('finds Home source files to scan', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it.each(BANNED)('no Home file imports %s', (banned) => {
    const offenders = files.filter((f) => readFileSync(f, 'utf8').includes(banned))
    expect(offenders).toEqual([])
  })
})
