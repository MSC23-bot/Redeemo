// prisma/suggest-branch-pin.ts
//
// Plan 4 M2.2 — admin/owner-run script that suggests a Google Places pin for
// a branch and (on explicit confirmation) flips the branch's
// locationConfidence to MANUALLY_CONFIRMED with full audit trail.
//
// Owner-run only. NOT a customer-facing endpoint. NEVER call this from any
// customer code path. See:
//   docs/superpowers/specs/2026-05-14-merchant-exact-pin-confirmation-design.md
//
// Usage:
//   npx tsx prisma/suggest-branch-pin.ts <branchId>                                  (suggest, no writes)
//   npx tsx prisma/suggest-branch-pin.ts <branchId> --confirm-best                   (suggest + confirm #1)
//   npx tsx prisma/suggest-branch-pin.ts <branchId> --confirm-place-id <placeId>     (suggest + confirm by id)
//   npx tsx prisma/suggest-branch-pin.ts <branchId> --manual --lat <n> --lng <n>     (manual override, no Google call)
//
// Optional flag (all modes that write): --note "<text>"
//
// Cost: 1 Google Places Text Search call per invocation in suggest /
// confirm-best / confirm-place-id modes. 0 calls in --manual mode.

import 'dotenv/config'
import { PrismaClient } from '../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { haversineMetres } from '../src/api/shared/haversine'
import { searchPlaces, bestCandidateConfidence, type GooglePlaceCandidate } from '../src/api/lib/googlePlaces'

const UK_BOUNDS = { minLat: 49.5, maxLat: 61.0, minLng: -8.5, maxLng: 2.0 }

// Reads the value that should follow `args[idx]`. Returns null when the slot
// is missing OR when the slot itself looks like another flag (`--foo`), so
// `--confirm-place-id --note foo` cannot silently consume `--note` as the
// placeId. Each caller turns the null into a flag-specific usage error.
function valueAfter(args: string[], idx: number): string | null {
  if (idx === -1) return null
  const next = args[idx + 1]
  if (next === undefined) return null
  if (next.startsWith('--')) return null
  return next
}

function parseArgs(argv: string[]):
  | {
      branchId: string
      mode: 'suggest' | 'confirm-best' | 'confirm-place-id' | 'manual'
      placeId?: string
      lat?: number
      lng?: number
      note?: string
    }
  | { error: string } {
  const args = argv.slice(2)
  const branchId = args[0] && !args[0].startsWith('--') ? args[0] : undefined
  if (!branchId) return { error: 'branchId is required' }

  const hasConfirmBest = args.includes('--confirm-best')
  const placeIdIdx = args.indexOf('--confirm-place-id')
  const hasConfirmPlaceId = placeIdIdx !== -1
  const hasManual = args.includes('--manual')
  const modeFlags = [hasConfirmBest, hasConfirmPlaceId, hasManual].filter(Boolean).length
  if (modeFlags > 1) {
    return { error: 'Modes --confirm-best / --confirm-place-id / --manual are mutually exclusive' }
  }

  let mode: 'suggest' | 'confirm-best' | 'confirm-place-id' | 'manual' = 'suggest'
  let placeId: string | undefined
  let lat: number | undefined
  let lng: number | undefined

  if (hasConfirmBest) mode = 'confirm-best'
  if (hasConfirmPlaceId) {
    mode = 'confirm-place-id'
    const value = valueAfter(args, placeIdIdx)
    if (value === null) return { error: '--confirm-place-id requires a placeId argument' }
    placeId = value
  }
  if (hasManual) {
    mode = 'manual'
    const latIdx = args.indexOf('--lat')
    const lngIdx = args.indexOf('--lng')
    if (latIdx === -1 || lngIdx === -1) return { error: '--manual requires --lat and --lng' }
    const latRaw = valueAfter(args, latIdx)
    const lngRaw = valueAfter(args, lngIdx)
    if (latRaw === null) return { error: '--lat requires a numeric value' }
    if (lngRaw === null) return { error: '--lng requires a numeric value' }
    // Number() rejects trailing-garbage (`Number('51.8abc') === NaN`), unlike
    // parseFloat which would silently accept the prefix `51.8`.
    lat = Number(latRaw)
    lng = Number(lngRaw)
    if (Number.isNaN(lat) || Number.isNaN(lng)) return { error: '--lat and --lng must be numeric' }
    if (
      lat < UK_BOUNDS.minLat ||
      lat > UK_BOUNDS.maxLat ||
      lng < UK_BOUNDS.minLng ||
      lng > UK_BOUNDS.maxLng
    ) {
      return {
        error: `--lat / --lng out of UK bounds (lat ${UK_BOUNDS.minLat}-${UK_BOUNDS.maxLat}, lng ${UK_BOUNDS.minLng}-${UK_BOUNDS.maxLng})`,
      }
    }
  }

  const noteIdx = args.indexOf('--note')
  let note: string | undefined
  if (noteIdx !== -1) {
    const value = valueAfter(args, noteIdx)
    if (value === null) return { error: '--note requires a value' }
    note = value
  }

  return { branchId, mode, placeId, lat, lng, note }
}

async function main() {
  const parsed = parseArgs(process.argv)
  if ('error' in parsed) {
    console.error(`Error: ${parsed.error}`)
    console.error('Usage:')
    console.error('  npx tsx prisma/suggest-branch-pin.ts <branchId>')
    console.error('  npx tsx prisma/suggest-branch-pin.ts <branchId> --confirm-best [--note "..."]')
    console.error('  npx tsx prisma/suggest-branch-pin.ts <branchId> --confirm-place-id <placeId> [--note "..."]')
    console.error('  npx tsx prisma/suggest-branch-pin.ts <branchId> --manual --lat <n> --lng <n> [--note "..."]')
    process.exit(1)
  }
  const { branchId, mode, placeId, lat: manualLat, lng: manualLng, note } = parsed

  const adapter = new PrismaPg(new Pool({ connectionString: process.env.DATABASE_URL }))
  const prisma = new PrismaClient({ adapter })

  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    include: { merchant: { select: { businessName: true, tradingName: true } } },
  })
  if (!branch) {
    console.error(`Branch ${branchId} not found`)
    await prisma.$disconnect()
    process.exit(1)
  }

  // Trimmed-fallback (not nullish-only): an empty / whitespace-only
  // `tradingName` would otherwise produce a degenerate Google query like
  // " 1 High St, ...". Falls through to `businessName` in that case.
  const merchantLabel = branch.merchant.tradingName?.trim() || branch.merchant.businessName
  console.log(`Branch:       ${branch.id} (${branch.name})`)
  console.log(`Merchant:     ${merchantLabel}`)
  console.log(`Address:      ${branch.addressLine1}, ${branch.city} ${branch.postcode}`)
  console.log(`Current pin:  ${branch.latitude ?? 'null'}, ${branch.longitude ?? 'null'} (${branch.locationConfidence})`)
  console.log('')

  // --manual mode: skip Google entirely.
  if (mode === 'manual') {
    await confirmPin(prisma, branch, {
      provider: 'manual',
      placeId: null,
      candidateName: null,
      candidateAddress: null,
      candidateTypes: null,
      googleMapsUrl: null,
      bestConfidence: null,
      distanceFromPostcodeCentroidMetres: null,
      newLatitude: manualLat!,
      newLongitude: manualLng!,
      apiCalls: 0,
      note: note ?? null,
    })
    await prisma.$disconnect()
    return
  }

  // Build query + call Google.
  const query = `${merchantLabel} ${branch.addressLine1}, ${branch.city} ${branch.postcode}`
  console.log(`Google Places query: "${query}"`)
  const result = await searchPlaces(query)
  if (!result.ok) {
    console.error(`Google Places error: ${result.error}`)
    if (result.error === 'API_KEY_MISSING') {
      console.error('Set GOOGLE_MAPS_API_KEY in .env (see docs/operations/google-places-setup.md).')
    }
    if (result.error === 'LOCAL_DAILY_CAP_REACHED') {
      console.error('You have hit the local daily cap for Google Places calls.')
      console.error('Resets at local midnight. To raise temporarily, re-run with')
      console.error('  GOOGLE_PLACES_DAILY_CAP=1000 npx tsx prisma/suggest-branch-pin.ts ...')
      console.error('See docs/operations/google-places-setup.md for the default + reasoning.')
    }
    if (result.error === 'LOCAL_MONTHLY_CAP_REACHED') {
      console.error('You have hit the local MONTHLY cap for Google Places calls.')
      console.error('Default cap sits below the 5,000 free Text Search Pro events/month.')
      console.error('Resets on the 1st of next month (local time). To raise temporarily:')
      console.error('  GOOGLE_PLACES_MONTHLY_CAP=6000 npx tsx prisma/suggest-branch-pin.ts ...')
    }
    await prisma.$disconnect()
    process.exit(1)
  }

  const centroidLat = branch.latitude !== null ? Number(branch.latitude) : null
  const centroidLng = branch.longitude !== null ? Number(branch.longitude) : null
  const merchantNames = [branch.merchant.businessName, branch.merchant.tradingName ?? '', branch.name].filter(Boolean)

  console.log(`\nCandidates (${result.candidates.length}):`)
  result.candidates.forEach((c, i) => {
    const dist =
      centroidLat !== null && centroidLng !== null
        ? Math.round(haversineMetres(centroidLat, centroidLng, c.latitude, c.longitude))
        : null
    const conf =
      i === 0 && centroidLat !== null && centroidLng !== null
        ? bestCandidateConfidence(c, { lat: centroidLat, lng: centroidLng }, merchantNames)
        : null
    const star = conf === 'HIGH' ? ' ★ HIGH-CONFIDENCE' : ''
    console.log(`  #${i + 1}  ${c.name}${star}`)
    console.log(`        ${c.formattedAddress}`)
    console.log(`        ${c.latitude}, ${c.longitude}`)
    console.log(`        placeId:  ${c.placeId}`)
    if (c.googleMapsUrl) console.log(`        gmaps:    ${c.googleMapsUrl}`)
    if (dist !== null) console.log(`        distance from postcode centroid: ~${dist}m`)
    console.log(`        types:    [${c.types.join(', ')}]`)
  })
  console.log('')

  if (mode === 'suggest') {
    console.log('To confirm the best candidate:   re-run with --confirm-best')
    console.log('To confirm a specific candidate: re-run with --confirm-place-id <placeId>')
    console.log('To override manually:            re-run with --manual --lat <n> --lng <n>')
    console.log('No DB writes performed.')
    await prisma.$disconnect()
    return
  }

  let chosen: GooglePlaceCandidate | undefined
  if (mode === 'confirm-best') {
    chosen = result.candidates[0]
  } else {
    chosen = result.candidates.find((c) => c.placeId === placeId)
    if (!chosen) {
      console.error(`placeId ${placeId} not present in top-${result.candidates.length} results.`)
      console.error('Re-run without --confirm-place-id to see candidates again.')
      await prisma.$disconnect()
      process.exit(1)
    }
  }

  const dist =
    centroidLat !== null && centroidLng !== null
      ? Math.round(haversineMetres(centroidLat, centroidLng, chosen.latitude, chosen.longitude))
      : null
  const conf =
    centroidLat !== null && centroidLng !== null
      ? bestCandidateConfidence(chosen, { lat: centroidLat, lng: centroidLng }, merchantNames)
      : null

  await confirmPin(prisma, branch, {
    provider: 'google_places',
    placeId: chosen.placeId,
    candidateName: chosen.name,
    candidateAddress: chosen.formattedAddress,
    candidateTypes: chosen.types,
    googleMapsUrl: chosen.googleMapsUrl,
    bestConfidence: conf,
    distanceFromPostcodeCentroidMetres: dist,
    newLatitude: chosen.latitude,
    newLongitude: chosen.longitude,
    apiCalls: 1,
    note: note ?? null,
  })
  await prisma.$disconnect()
}

async function confirmPin(
  prisma: PrismaClient,
  branch: {
    id: string
    latitude: unknown
    longitude: unknown
    locationConfidence: string
  },
  audit: {
    provider: 'google_places' | 'manual'
    placeId: string | null
    candidateName: string | null
    candidateAddress: string | null
    candidateTypes: string[] | null
    googleMapsUrl: string | null
    bestConfidence: 'HIGH' | 'LOW' | null
    distanceFromPostcodeCentroidMetres: number | null
    newLatitude: number
    newLongitude: number
    apiCalls: number
    note: string | null
  },
) {
  const oldLat = branch.latitude !== null && branch.latitude !== undefined ? Number(branch.latitude) : null
  const oldLng = branch.longitude !== null && branch.longitude !== undefined ? Number(branch.longitude) : null
  const oldConfidence = branch.locationConfidence

  await prisma.$transaction([
    prisma.branch.update({
      where: { id: branch.id },
      data: {
        latitude: audit.newLatitude,
        longitude: audit.newLongitude,
        locationConfidence: 'MANUALLY_CONFIRMED',
        locationResolvedAt: new Date(),
      },
    }),
    prisma.auditLog.create({
      data: {
        entityId: branch.id,
        entityType: 'branch',
        event: 'BRANCH_PIN_CONFIRMED',
        ipAddress: 'cli',
        userAgent: 'prisma/suggest-branch-pin.ts',
        metadata: {
          provider: audit.provider,
          placeId: audit.placeId,
          candidateName: audit.candidateName,
          candidateAddress: audit.candidateAddress,
          candidateTypes: audit.candidateTypes,
          googleMapsUrl: audit.googleMapsUrl,
          bestConfidence: audit.bestConfidence,
          distanceFromPostcodeCentroidMetres: audit.distanceFromPostcodeCentroidMetres,
          oldLatitude: oldLat,
          oldLongitude: oldLng,
          oldConfidence: oldConfidence,
          newLatitude: audit.newLatitude,
          newLongitude: audit.newLongitude,
          newConfidence: 'MANUALLY_CONFIRMED',
          confirmedBy: 'cli',
          note: audit.note,
          apiCalls: audit.apiCalls,
        },
      },
    }),
  ])

  console.log('Confirmation applied.')
  console.log(`  before:  ${oldLat ?? 'null'}, ${oldLng ?? 'null'} (${oldConfidence})`)
  console.log(`  after:   ${audit.newLatitude}, ${audit.newLongitude} (MANUALLY_CONFIRMED)`)
  console.log(`  audit:   logged ${audit.apiCalls} Google call(s); event=BRANCH_PIN_CONFIRMED`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
