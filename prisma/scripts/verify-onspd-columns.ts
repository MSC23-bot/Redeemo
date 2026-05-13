// prisma/scripts/verify-onspd-columns.ts
// Prints the headers of ONSPD CSV and each Documents/* lookup file, then exits.
// Used once per ONSPD release to confirm column names match the build-locality-seed.ts
// expectations. If any required column is missing, prints a clear error.

import { createReadStream } from 'node:fs'
import { parse as csvParse } from 'csv-parse'
import { glob } from 'glob'
import path from 'node:path'

// ONSPD column names for the Feb 2026 release — ONS revised the bulk-CSV header
// naming convention from the older flat names (`ctry`, `oslaua`, `oscty`, `rgn`,
// `parish`, `osward`, `pcon`, `bua11`) to the entity-year-suffix pattern used in
// every other ONS lookup file (`<entity><yy>cd`). The bare names (`pcds`, `lat`,
// `long`, `doterm`) stayed stable.
const REQUIRED_ONSPD_COLS = [
  'pcds', 'lat', 'long',
  'ctry25cd', 'lad25cd', 'cty25cd', 'rgn25cd',
  'parncp25cd', 'wd25cd', 'pcon24cd',
  'doterm',
  'bua24cd',
]

// File-name prefixes match the Documents/ folder shipped in the Feb 2026 ONSPD release.
// Column-header regexes accept any 2-digit year suffix so the script survives quarterly
// boundary-set revisions (e.g. LAD24CD/LAD25CD both match `^LAD\d+CD$`).
const REQUIRED_LOOKUPS = [
  { pattern: 'LAD ',     codeRe: /^LAD\d+CD$/,    nameRe: /^LAD\d+NM$/    },
  { pattern: 'CTY ',     codeRe: /^CTY\d+CD$/,    nameRe: /^CTY\d+NM$/    },
  { pattern: 'RGN ',     codeRe: /^RGN\d+CD$/,    nameRe: /^RGN\d+NM$/    },
  { pattern: 'PARNCP ',  codeRe: /^PARNCP\d+CD$/, nameRe: /^PARNCP\d+NM$/ },
  { pattern: 'WD ',      codeRe: /^WD\d+CD$/,     nameRe: /^WD\d+NM$/     },
  { pattern: 'PCON ',    codeRe: /^PCON\d+CD$/,   nameRe: /^PCON\d+NM$/   },
]

async function readHeader(filePath: string): Promise<string[]> {
  const parser = createReadStream(filePath).pipe(csvParse({ to_line: 1, trim: true, bom: true }))
  for await (const row of parser) return row as string[]
  return []
}

async function findLookupFile(pattern: string): Promise<string | null> {
  const matches = await glob(`prisma/scripts/.local/Documents/${pattern}*.csv`)
  return matches[0] ?? null
}

async function main() {
  const onspdHeader = await readHeader('prisma/scripts/.local/ONSPD_FEB_2026_UK.csv')
  console.log('ONSPD columns found:', onspdHeader.length)
  const missing = REQUIRED_ONSPD_COLS.filter(c => !onspdHeader.includes(c))
  if (missing.length > 0) {
    console.error('MISSING ONSPD columns:', missing)
    console.error('Update ONSPD_COLS in build-locality-seed.ts.')
    process.exit(1)
  }
  console.log('  All required ONSPD columns present.')

  for (const { pattern, codeRe, nameRe } of REQUIRED_LOOKUPS) {
    const filePath = await findLookupFile(pattern)
    if (!filePath) { console.error(`MISSING lookup file: ${pattern}*.csv`); process.exit(1) }
    const header = await readHeader(filePath)
    const code = header.find(h => codeRe.test(h))
    const name = header.find(h => nameRe.test(h))
    if (!code || !name) {
      console.error(`Lookup file ${path.basename(filePath)} missing code/name columns matching ${codeRe} / ${nameRe}`)
      console.error('Headers found:', header)
      process.exit(1)
    }
    console.log(`  ${pattern}: ok (${code} → ${name})`)
  }

  console.log('All columns + lookup files verified. Safe to run build-locality-seed.ts.')
}

main().catch(e => { console.error(e); process.exit(1) })
