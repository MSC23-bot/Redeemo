// prisma/set-locality-catchment.ts
//
// Plan 4 M1.23 — owner-run script: replace the LocalityCatchmentEdge rows
// for a source Locality with an owner-curated ordered list of natural
// centres. Temporary operational tooling pending the Phase 5 admin panel
// (see project_admin_panel_market_expansion_tooling.md §AP).
//
// Behaviour:
//   1. Deletes ALL existing edges (heuristic + curated) from the source.
//   2. Inserts the supplied curated edges with `isCurated: true` at the
//      argument order's rank (1, 2, 3, ...).
//   3. On the next `npx prisma db seed`, the heuristic re-runs and adds
//      any non-curated (source, target) pairs back as isCurated=false.
//      The @@unique([source, target]) constraint dedupes — heuristic
//      won't overwrite a curated edge for a (source, target) pair the
//      curator picked.
//
// Usage:
//   npx tsx prisma/set-locality-catchment.ts <sourceSlug> --centre-slugs <slug1,slug2,...> [--dry-run]
//
// Example:
//   npx tsx prisma/set-locality-catchment.ts holmfirth --centre-slugs huddersfield,bradford
//   npx tsx prisma/set-locality-catchment.ts holmfirth --centre-slugs huddersfield --dry-run
//
// The plan flagged a P2.2 pre-flight issue: the earlier argv-positional draft
// would treat the literal "--centre-slugs" token as the source slug. Fixed
// here with explicit flag parsing.
//
// PR #81 review follow-up — added --dry-run. The script is DESTRUCTIVE: it
// deletes all existing edges (heuristic + curated) for the source before
// re-adding curated rows. A typo in `<sourceSlug>` that happens to hit a
// valid-but-unintended Locality (e.g. holmfirth vs holmsfirth — only one
// resolves) would wipe that Locality's heuristic edges. --dry-run reports
// what WOULD be deleted + created without writing.

import 'dotenv/config'
import { PrismaClient } from '../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

// Parse args: <sourceSlug> --centre-slugs <slug1,slug2,...> [--dry-run]
const args = process.argv.slice(2)
const sourceSlug = args[0] && !args[0].startsWith('--') ? args[0] : undefined
const centreSlugsIdx = args.indexOf('--centre-slugs')
const centreSlugsArg = centreSlugsIdx !== -1 && args[centreSlugsIdx + 1] ? args[centreSlugsIdx + 1] : ''
const centreSlugs = centreSlugsArg.split(',').map(s => s.trim()).filter(Boolean)
const dryRun = args.includes('--dry-run')

if (!sourceSlug || centreSlugs.length === 0) {
  console.error('Usage: npx tsx prisma/set-locality-catchment.ts <sourceSlug> --centre-slugs <slug1,slug2,...> [--dry-run]')
  process.exit(1)
}

const adapter = new PrismaPg(new Pool({ connectionString: process.env.DATABASE_URL }))
const prisma = new PrismaClient({ adapter })

;(async () => {
  const source = await prisma.locality.findUnique({ where: { slug: sourceSlug } })
  if (!source) throw new Error(`Source not found: ${sourceSlug}`)

  // Resolve all target slugs upfront so dry-run shows the full plan.
  const targets: Array<{ slug: string; id: string | null }> = []
  for (const slug of centreSlugs) {
    const t = await prisma.locality.findUnique({ where: { slug } })
    targets.push({ slug, id: t?.id ?? null })
  }
  const missing = targets.filter(t => t.id === null).map(t => t.slug)
  if (missing.length > 0) {
    for (const slug of missing) console.warn(`  target missing: ${slug}`)
  }

  if (dryRun) {
    const existingCount = await prisma.localityCatchmentEdge.count({
      where: { sourceLocalityId: source.id },
    })
    console.log(`[DRY-RUN] Would delete ${existingCount} existing edges for source "${sourceSlug}" (id=${source.id})`)
    console.log(`[DRY-RUN] Would create ${targets.length - missing.length} curated edges:`)
    let rank = 1
    for (const t of targets) {
      if (t.id) console.log(`  rank=${rank++}  → ${t.slug}  (id=${t.id}, isCurated=true)`)
    }
    if (missing.length > 0) console.log(`[DRY-RUN] ${missing.length} target slug(s) not resolved — would be skipped`)
    console.log(`[DRY-RUN] No DB writes performed. Re-run without --dry-run to apply.`)
    await prisma.$disconnect()
    return
  }

  // Live path — delete existing edges for this source (curated overrides replace all).
  const deleted = await prisma.localityCatchmentEdge.deleteMany({
    where: { sourceLocalityId: source.id },
  })

  let created = 0
  let rank = 1
  for (const t of targets) {
    if (!t.id) continue
    await prisma.localityCatchmentEdge.create({
      data: {
        sourceLocalityId: source.id,
        targetLocalityId: t.id,
        rank: rank++,
        isCurated: true,
      },
    })
    created++
  }
  console.log(`Catchment override set for ${sourceSlug}: deleted ${deleted.count}, created ${created} curated edges → [${centreSlugs.join(', ')}]`)
  await prisma.$disconnect()
})().catch(e => { console.error(e); process.exit(1) })
