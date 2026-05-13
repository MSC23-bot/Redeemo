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

// ONSPD column map — Feb 2026 release uses the entity-year-suffix naming convention
// (`<entity><yy>cd`). Older releases used flat names (`ctry`, `oslaua`, etc.). Update
// this map when ONS publishes a future release that changes the year suffixes.
const ONSPD_COLS = {
  postcode:                      'pcds',
  latitude:                      'lat',
  longitude:                     'long',
  countryCode:                   'ctry25cd',
  ladCode:                       'lad25cd',
  adminCountyCode:               'cty25cd',
  regionCode:                    'rgn25cd',
  parishCode:                    'parncp25cd',
  adminWardCode:                 'wd25cd',
  parliamentaryConstituencyCode: 'pcon24cd',
  buaCode:                       'bua24cd',
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

function countryFromOnsCode(code: string): LocalitySeedRow['country'] | null {
  switch (code) {
    case 'E92000001': return 'England'
    case 'S92000003': return 'Scotland'
    case 'W92000004': return 'Wales'
    case 'N92000002': return 'Northern Ireland'
    // Crown Dependencies — explicitly out of scope per spec §1.3 (UK only):
    case 'L93000001': return null  // Channel Islands (Jersey + Guernsey + Sark)
    case 'M83000003': return null  // Isle of Man
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

/**
 * If the constituency name is a CITY-PIECE fragment of this postcode's own LAD, returns
 * the cleaned LAD core (Glasgow / Belfast / Cardiff). Otherwise returns null.
 *
 * Examples (fragment → cleaned LAD core):
 *   - "Glasgow North East"           in LAD "Glasgow City"        → "Glasgow"
 *   - "Glasgow South West"           in LAD "Glasgow City"        → "Glasgow"
 *   - "Belfast East"                 in LAD "Belfast"             → "Belfast"
 *   - "Belfast South and Mid Down"   in LAD "Belfast"             → "Belfast"
 *   - "Cardiff North"                in LAD "Cardiff"             → "Cardiff"
 *   - "Manchester Central"           in LAD "Manchester"          → "Manchester"
 *   - "Edinburgh North and Leith"    in LAD "City of Edinburgh"   → "Edinburgh"
 *
 * Counter-examples (not a fragment → returns null):
 *   - "Huddersfield"                 in LAD "Kirklees"             — different first word
 *   - "Belfast East"                 in LAD "Ards and North Down"  — wrong LGD (geographically not Belfast)
 *   - "Vale of Glamorgan"            in LAD "Vale of Glamorgan"    — identical, no fragment
 *
 * The LAD-aware check (vs a global "is this constituency from some Belfast-ish LAD" check)
 * keeps cross-LGD overlap honest: a postcode in Ards LGD whose constituency is "Belfast
 * East" is geographically NOT in Belfast, so we don't claim it for the Belfast Locality.
 * It becomes its own "Belfast East" Locality scoped to Ards LGD.
 */
function fragmentToLadCore(constituencyName: string, ladName: string): string | null {
  const ladCore = ladName
    .replace(/^City of /i, '')
    .replace(/ City$/i, '')
    .trim()
  if (!ladCore) return null
  const lcCon = constituencyName.toLowerCase().trim()
  const lcCore = ladCore.toLowerCase()
  if (lcCon === lcCore) return null                    // identical name — prefer constituency
  if (lcCon.startsWith(lcCore + ' ')) return ladCore   // "<core> <suffix>" → fragment
  if (lcCon.startsWith(lcCore + ',')) return ladCore   // "<core>, <suffix>" → fragment
  return null
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
  // Non-London non-BUA non-parish: if the constituency is a fragment of this postcode's
  // own LAD, use the cleaned LAD core (Glasgow / Belfast / Cardiff) — single sensible name.
  if (resolved.parliamentaryConstituencyName) {
    const cityCore = fragmentToLadCore(resolved.parliamentaryConstituencyName, resolved.ladName)
    if (cityCore) return cityCore
    return resolved.parliamentaryConstituencyName
  }
  return resolved.ladName
}

function slugify(name: string): string {
  return name.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * BUA strategy for Feb 2026 ONSPD release (`bua24cd` column):
 *
 * ONSPD `bua24cd` codes match the BUA24 Documents lookup file shipped alongside ONSPD
 * (e.g. "BUA Built Up Area names and codes EW as at 04_24.csv"). That file gives us
 * NAMES for BUA24 codes — but no populations.
 *
 * The owner-provided `ons-bua-2021.csv` has POPULATIONS for BUA21 — but the BUA21 codes
 * don't match BUA24 codes (ONS reissued codes in the 2024 revision). We get populations
 * by EXACT-NAME matching the BUA24 name against the BUA21 name set.
 *
 * Names that align across the 2021→2024 revision get a population (and thus a real
 * populationTier). Names that don't (newly defined, renamed, or split BUAs) get
 * populationTier: UNKNOWN, which maps to RURAL (fail-generous per spec §3.7).
 *
 * Returns the BUA24 code → { buaName, population (or null) } map for the streaming join.
 */
async function loadBuaIndex(): Promise<Map<string, BuaRow>> {
  // Step 1: load BUA24 code → name from the Documents file.
  const buaNamesPath = await findLookupFile('BUA ')
  const codeToName = new Map<string, string>()
  const namesParser = createReadStream(buaNamesPath).pipe(csvParse({ columns: true, trim: true, bom: true }))
  for await (const row of namesParser) {
    const codeKey = Object.keys(row).find(k => /^BUA\d+CD$/.test(k))
    const nameKey = Object.keys(row).find(k => /^BUA\d+NM$/.test(k))
    if (!codeKey || !nameKey) continue
    if (row[codeKey] && row[nameKey]) codeToName.set(row[codeKey], row[nameKey])
  }

  // Step 2: load name → population from BUA21 CSV.
  const nameToPop = new Map<string, number>()
  const popParser = createReadStream(BUA_PATH).pipe(csvParse({ columns: true, trim: true, bom: true }))
  for await (const row of popParser) {
    const name = row['BUA21NM'] ?? row['BUA11NM'] ?? row['bua_name']
    const pop = parseInt(row['POPULATION'] ?? row['population_estimate'] ?? '0', 10) || null
    if (name && pop !== null) nameToPop.set(name, pop)
  }

  // Step 3: combine — BUA24 code → BuaRow with population from name-match (or null).
  const index = new Map<string, BuaRow>()
  let withPop = 0
  let withoutPop = 0
  for (const [code, name] of codeToName.entries()) {
    const population = nameToPop.get(name) ?? null
    if (population === null) withoutPop++; else withPop++
    index.set(code, { buaCode: code, buaName: name, population })
  }
  console.log(`  BUA24 codes loaded: ${index.size} (BUA21 population matched: ${withPop}, unmatched: ${withoutPop})`)
  return index
}

async function loadCodeNameLookup(
  filePath: string,
  codeKeyPattern: RegExp,
  nameKeyPattern: RegExp,
): Promise<CodeNameLookup> {
  const map: CodeNameLookup = new Map()
  const parser = createReadStream(filePath).pipe(csvParse({ columns: true, trim: true, bom: true }))
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

  // Lookup file-name prefixes match the Feb 2026 ONSPD release Documents/ folder.
  // Column-header regexes accept any 2-digit year suffix (so the script survives
  // future quarterly boundary-set revisions without code change).
  const ladLookup = await loadCodeNameLookup(
    await findLookupFile('LAD '),     /^LAD\d+CD$/,    /^LAD\d+NM$/,
  )
  const countyLookup = await loadCodeNameLookup(
    await findLookupFile('CTY '),     /^CTY\d+CD$/,    /^CTY\d+NM$/,
  )
  const regionLookup = await loadCodeNameLookup(
    await findLookupFile('RGN '),     /^RGN\d+CD$/,    /^RGN\d+NM$/,
  )
  const parishLookup = await loadCodeNameLookup(
    await findLookupFile('PARNCP '),  /^PARNCP\d+CD$/, /^PARNCP\d+NM$/,
  )
  const wardLookup = await loadCodeNameLookup(
    await findLookupFile('WD '),      /^WD\d+CD$/,     /^WD\d+NM$/,
  )
  const pconLookup = await loadCodeNameLookup(
    await findLookupFile('PCON '),    /^PCON\d+CD$/,   /^PCON\d+NM$/,
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

  const parser = createReadStream(ONSPD_PATH).pipe(csvParse({ columns: true, trim: true, bom: true }))
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
    if (country === null) continue  // skip Crown Dependencies (Channel Islands / Isle of Man)
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
  let localitiesWithBuaName = 0
  let localitiesWithBuaPopulation = 0

  for (const { rows, bua, resolved } of groups.values()) {
    const first = rows[0]
    const country = countryFromOnsCode(first.countryCode)
    if (country === null) continue  // type-narrowing — Crown Dependencies were already filtered upstream
    const name = pickLocalityName(first, bua, resolved)
    const ladDistrict = resolved.ladName

    let slug = slugify(name)
    const seen = seenSlugs.get(slug) ?? 0
    if (seen > 0) slug = `${slug}-${slugify(ladDistrict)}`
    seenSlugs.set(slugify(name), seen + 1)

    const centerLat = rows.reduce((s, r) => s + r.latitude, 0) / rows.length
    const centerLng = rows.reduce((s, r) => s + r.longitude, 0) / rows.length
    const populationTier = populationTierFromBua(bua?.population ?? null)

    if (bua?.buaName) localitiesWithBuaName++
    if (bua?.population) localitiesWithBuaPopulation++

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

  const tierOrder: LocalitySeedRow['populationTier'][] = [
    'METRO_CORE', 'CITY', 'LARGE_TOWN', 'TOWN', 'SMALL_TOWN', 'VILLAGE', 'HAMLET', 'UNKNOWN',
  ]
  const tierCounts: Record<string, number> = Object.fromEntries(tierOrder.map(t => [t, 0]))
  for (const l of localities) tierCounts[l.populationTier]++

  console.log('')
  console.log('=== Locality-level BUA match ===')
  console.log(`  Localities total: ${localities.length}`)
  console.log(`  Localities with BUA name (BUA24 hit):       ${localitiesWithBuaName}`)
  console.log(`  Localities with BUA population (real tier): ${localitiesWithBuaPopulation}`)
  console.log(`  Localities without BUA population (UNKNOWN): ${localities.length - localitiesWithBuaPopulation}`)
  console.log('')
  console.log('=== populationTier distribution ===')
  for (const tier of tierOrder) {
    const n = tierCounts[tier]
    const pct = ((n / localities.length) * 100).toFixed(1).padStart(5)
    console.log(`  ${tier.padEnd(11)} ${String(n).padStart(6)}  ${pct}%`)
  }
  console.log('')

  const banner = `// AUTO-GENERATED by prisma/scripts/build-locality-seed.ts.\n// Do not edit by hand. Re-run the generator on ONSPD refresh.\n\n`
  const body = `export const ONSPD_LOCALITIES = ${JSON.stringify(localities, null, 2)} as const\n`
  writeFileSync(OUTPUT_PATH, banner + body)
  console.log(`Wrote ${localities.length} Localities to ${OUTPUT_PATH}`)
}

main().catch(e => { console.error(e); process.exit(1) })
