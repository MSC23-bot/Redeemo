/**
 * One-off seed generator: ONSPD → typed Locality seed array.
 *
 * INPUT: Office for National Statistics Postcode Directory (ONSPD) CSV file.
 * Download (manual, quarterly): https://geoportal.statistics.gov.uk/datasets/ons-postcode-directory
 * Expected file path: prisma/scripts/.local/ONSPD_FEB_2026_UK.csv (gitignored).
 *
 * OUTPUT: prisma/seed-data/onspd-localities.ts (typed array, checked into repo).
 *
 * The CSV file is ~1GB and NOT committed. The generated TypeScript array is
 * a curated subset (~5,000-10,000 Localities per spec §4.1.1) and IS committed.
 *
 * Re-run quarterly when ONSPD publishes a refresh:
 *   npx tsx prisma/scripts/build-locality-seed.ts
 */

/*
INPUT 1: ONSPD CSV — postcode → admin hierarchy (parish, ward, LAD, county, region, country, lat/lng).
         Source: https://geoportal.statistics.gov.uk/datasets/ons-postcode-directory
         File: prisma/scripts/.local/ONSPD_FEB_2026_UK.csv (~1GB; gitignored).

INPUT 2: ONS BUA CSV — settlement name + population estimate.
         Source: https://geoportal.statistics.gov.uk/datasets/built-up-areas-2021-and-built-up-area-sub-divisions
         File: prisma/scripts/.local/ons-bua-2021.csv (~few MB; gitignored).
         Contains: bua_code, bua_name, population_estimate, geometry (WKT polygon).

JOIN: ONSPD postcode → BUA via the `bua11` code column on each postcode row.

Required ONS lookup files (distributed in ONSPD's `Documents/` folder; placed next to ONSPD CSV):
  prisma/scripts/.local/Documents/LA_UA names and codes UK as at <date>.csv   — LAD code → name
  prisma/scripts/.local/Documents/CTY names and codes EN as at <date>.csv     — county code → name
  prisma/scripts/.local/Documents/RGN names and codes EN as at <date>.csv      — region code → name
  prisma/scripts/.local/Documents/Parish_NCP names and codes EW as at <date>.csv — parish code → name
  prisma/scripts/.local/Documents/Ward names and codes UK as at <date>.csv     — ward code → name
  prisma/scripts/.local/Documents/Westminster Parliamentary Constituency names and codes UK as at <date>.csv — constituency code → name
  prisma/scripts/.local/Documents/Built-up Area names and codes UK as at <date>.csv — BUA code → name
*/

// prisma/scripts/build-locality-seed.ts
import { createReadStream, writeFileSync } from 'node:fs'
import path from 'node:path'
import { parse as csvParse } from 'csv-parse'
import { glob } from 'glob'

const ONSPD_PATH = path.join(__dirname, '.local/ONSPD_FEB_2026_UK.csv')
const BUA_PATH = path.join(__dirname, '.local/ons-bua-2021.csv')
const OUTPUT_PATH = path.join(__dirname, '..', 'seed-data/onspd-localities.ts')

const ONSPD_COLS = {
  postcode:                      'pcds',
  latitude:                      'lat',
  longitude:                     'long',
  countryCode:                   'ctry',
  ladCode:                       'oslaua',
  adminCountyCode:               'oscty',
  regionCode:                    'rgn',
  parishCode:                    'parish',
  adminWardCode:                 'osward',
  parliamentaryConstituencyCode: 'pcon',
  buaCode:                       'bua11',
  terminationDate:               'doterm',
} as const

type BuaRow = { buaCode: string; buaName: string; population: number | null }
type OnspdRow = {
  postcode: string
  latitude: number
  longitude: number
  countryCode: string
  ladCode: string
  adminCountyCode: string | null
  regionCode: string | null
  parishCode: string | null
  adminWardCode: string | null
  parliamentaryConstituencyCode: string | null
  buaCode: string | null
}
type CodeNameLookup = Map<string, string>
type LocalitySeedRow = {
  name: string
  slug: string
  postTown: string | null
  ladDistrict: string
  adminCounty: string | null
  region: string | null
  country: 'England' | 'Scotland' | 'Wales' | 'Northern Ireland'
  centerLat: number
  centerLng: number
  populationTier: 'UNKNOWN' | 'HAMLET' | 'VILLAGE' | 'SMALL_TOWN' | 'TOWN' | 'LARGE_TOWN' | 'CITY' | 'METRO_CORE'
}

function countryFromOnsCode(code: string): LocalitySeedRow['country'] {
  switch (code) {
    case 'E92000001': return 'England'
    case 'S92000003': return 'Scotland'
    case 'W92000004': return 'Wales'
    case 'N92000002': return 'Northern Ireland'
    default: throw new Error(`Unknown ONS country code: ${code}`)
  }
}

function populationTierFromBua(pop: number | null): LocalitySeedRow['populationTier'] {
  if (pop === null) return 'UNKNOWN'
  if (pop >= 500_000) return 'METRO_CORE'
  if (pop >= 100_000) return 'CITY'
  if (pop >= 30_000)  return 'LARGE_TOWN'
  if (pop >= 10_000)  return 'TOWN'
  if (pop >= 3_000)   return 'SMALL_TOWN'
  if (pop >= 500)     return 'VILLAGE'
  return 'HAMLET'
}

function isUnparishedPlaceholder(parish: string | null): boolean {
  return parish === null || /unparished area$/i.test(parish)
}

function pickLocalityName(
  r: OnspdRow,
  bua: BuaRow | null,
  resolved: {
    parishName: string | null
    adminWardName: string | null
    parliamentaryConstituencyName: string | null
    ladName: string
    regionName: string | null
  },
): string {
  const isLondon = resolved.regionName === 'London'
  if (!isLondon && bua?.buaName) return bua.buaName
  if (resolved.parishName && !isUnparishedPlaceholder(resolved.parishName)) return resolved.parishName
  if (isLondon && resolved.adminWardName) return resolved.adminWardName
  if (resolved.parliamentaryConstituencyName) return resolved.parliamentaryConstituencyName
  if (resolved.adminWardName) return resolved.adminWardName
  return resolved.ladName
}

function slugify(name: string): string {
  return name.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

async function loadBuaIndex(): Promise<Map<string, BuaRow>> {
  const index = new Map<string, BuaRow>()
  const parser = createReadStream(BUA_PATH).pipe(csvParse({ columns: true, trim: true }))
  for await (const row of parser) {
    const code = row['BUA21CD'] ?? row['BUA11CD'] ?? row['bua_code']
    const name = row['BUA21NM'] ?? row['BUA11NM'] ?? row['bua_name']
    const pop = parseInt(row['POPULATION'] ?? row['population_estimate'] ?? '0', 10) || null
    if (code && name) index.set(code, { buaCode: code, buaName: name, population: pop })
  }
  return index
}

async function loadCodeNameLookup(
  filePath: string,
  codeKeyPattern: RegExp,
  nameKeyPattern: RegExp,
): Promise<CodeNameLookup> {
  const map: CodeNameLookup = new Map()
  const parser = createReadStream(filePath).pipe(csvParse({ columns: true, trim: true }))
  for await (const row of parser) {
    const codeKey = Object.keys(row).find(k => codeKeyPattern.test(k))
    const nameKey = Object.keys(row).find(k => nameKeyPattern.test(k))
    if (!codeKey || !nameKey) continue
    const code = row[codeKey]
    const name = row[nameKey]
    if (code && name) map.set(code, name)
  }
  return map
}

async function findLookupFile(pattern: string): Promise<string> {
  const matches = await glob(`prisma/scripts/.local/Documents/${pattern}*.csv`)
  if (matches.length === 0) throw new Error(`Lookup file not found matching: ${pattern}`)
  return matches[0]
}

async function main() {
  console.log('Loading lookup files...')
  const buaIndex = await loadBuaIndex()
  console.log(`  BUAs: ${buaIndex.size}`)

  const ladLookup = await loadCodeNameLookup(
    await findLookupFile('LA_UA names and codes'),       /^LAD\d+CD$/, /^LAD\d+NM$/,
  )
  const countyLookup = await loadCodeNameLookup(
    await findLookupFile('CTY names and codes'),         /^CTY\d+CD$/, /^CTY\d+NM$/,
  )
  const regionLookup = await loadCodeNameLookup(
    await findLookupFile('RGN names and codes'),         /^RGN\d+CD$/, /^RGN\d+NM$/,
  )
  const parishLookup = await loadCodeNameLookup(
    await findLookupFile('Parish_NCP names and codes'),  /^PAR\d+CD$/, /^PAR\d+NM$/,
  )
  const wardLookup = await loadCodeNameLookup(
    await findLookupFile('Ward names and codes'),        /^WD\d+CD$/,  /^WD\d+NM$/,
  )
  const pconLookup = await loadCodeNameLookup(
    await findLookupFile('Westminster Parliamentary'),   /^PCON\d+CD$/, /^PCON\d+NM$/,
  )
  console.log(`  LADs: ${ladLookup.size}, Counties: ${countyLookup.size}, Regions: ${regionLookup.size}`)
  console.log(`  Parishes: ${parishLookup.size}, Wards: ${wardLookup.size}, Constituencies: ${pconLookup.size}`)

  console.log('Streaming ONSPD...')
  type GroupResolved = {
    rows: OnspdRow[]
    bua: BuaRow | null
    resolved: {
      parishName: string | null
      adminWardName: string | null
      parliamentaryConstituencyName: string | null
      ladName: string
      adminCountyName: string | null
      regionName: string | null
    }
  }
  const groups = new Map<string, GroupResolved>()

  const parser = createReadStream(ONSPD_PATH).pipe(csvParse({ columns: true, trim: true }))
  let rowCount = 0
  for await (const raw of parser) {
    rowCount++
    if (rowCount % 100_000 === 0) console.log(`  ${rowCount} postcodes processed`)

    if (raw[ONSPD_COLS.terminationDate]) continue

    const onspd: OnspdRow = {
      postcode:                      raw[ONSPD_COLS.postcode],
      latitude:                      parseFloat(raw[ONSPD_COLS.latitude]),
      longitude:                     parseFloat(raw[ONSPD_COLS.longitude]),
      countryCode:                   raw[ONSPD_COLS.countryCode],
      ladCode:                       raw[ONSPD_COLS.ladCode],
      adminCountyCode:               raw[ONSPD_COLS.adminCountyCode] || null,
      regionCode:                    raw[ONSPD_COLS.regionCode] || null,
      parishCode:                    raw[ONSPD_COLS.parishCode] || null,
      adminWardCode:                 raw[ONSPD_COLS.adminWardCode] || null,
      parliamentaryConstituencyCode: raw[ONSPD_COLS.parliamentaryConstituencyCode] || null,
      buaCode:                       raw[ONSPD_COLS.buaCode] || null,
    }

    if (isNaN(onspd.latitude) || isNaN(onspd.longitude)) continue

    const ladName = ladLookup.get(onspd.ladCode) ?? '(unknown LAD)'
    const adminCountyName = onspd.adminCountyCode ? (countyLookup.get(onspd.adminCountyCode) ?? null) : null
    const regionName = onspd.regionCode ? (regionLookup.get(onspd.regionCode) ?? null) : null
    const parishName = onspd.parishCode ? (parishLookup.get(onspd.parishCode) ?? null) : null
    const adminWardName = onspd.adminWardCode ? (wardLookup.get(onspd.adminWardCode) ?? null) : null
    const pconName = onspd.parliamentaryConstituencyCode
      ? (pconLookup.get(onspd.parliamentaryConstituencyCode) ?? null) : null

    const country = countryFromOnsCode(onspd.countryCode)
    const bua = onspd.buaCode ? buaIndex.get(onspd.buaCode) ?? null : null

    const resolved = {
      parishName, adminWardName, parliamentaryConstituencyName: pconName,
      ladName, adminCountyName, regionName,
    }
    const name = pickLocalityName(onspd, bua, resolved)
    const key = `${country}::${ladName}::${name}`
    const existing = groups.get(key) ?? { rows: [], bua, resolved }
    existing.rows.push(onspd)
    groups.set(key, existing)
  }
  console.log(`  ${rowCount} total postcodes, ${groups.size} unique Localities`)

  const localities: LocalitySeedRow[] = []
  const seenSlugs = new Map<string, number>()

  for (const { rows, bua, resolved } of groups.values()) {
    const first = rows[0]
    const country = countryFromOnsCode(first.countryCode)
    const name = pickLocalityName(first, bua, resolved)
    const ladDistrict = resolved.ladName

    let slug = slugify(name)
    const seen = seenSlugs.get(slug) ?? 0
    if (seen > 0) slug = `${slug}-${slugify(ladDistrict)}`
    seenSlugs.set(slugify(name), seen + 1)

    const centerLat = rows.reduce((s, r) => s + r.latitude, 0) / rows.length
    const centerLng = rows.reduce((s, r) => s + r.longitude, 0) / rows.length
    const populationTier = populationTierFromBua(bua?.population ?? null)

    localities.push({
      name, slug,
      postTown: null,
      ladDistrict,
      adminCounty: resolved.adminCountyName,
      region: resolved.regionName,
      country,
      centerLat, centerLng,
      populationTier,
    })
  }

  const banner = `// AUTO-GENERATED by prisma/scripts/build-locality-seed.ts.\n// Do not edit by hand. Re-run the generator on ONSPD refresh.\n\n`
  const body = `export const ONSPD_LOCALITIES = ${JSON.stringify(localities, null, 2)} as const\n`
  writeFileSync(OUTPUT_PATH, banner + body)
  console.log(`Wrote ${localities.length} Localities to ${OUTPUT_PATH}`)
}

main().catch(e => { console.error(e); process.exit(1) })
