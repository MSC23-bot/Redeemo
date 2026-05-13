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
//   npx tsx prisma/set-locality-catchment.ts <sourceSlug> --centre-slugs <slug1,slug2,...>
//
// Example:
//   npx tsx prisma/set-locality-catchment.ts holmfirth --centre-slugs huddersfield,bradford
//
// The plan flagged a P2.2 pre-flight issue: the earlier argv-positional draft
// would treat the literal "--centre-slugs" token as the source slug. Fixed
// here with explicit flag parsing.

import 'dotenv/config'
import { PrismaClient } from '../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

// Parse args: <sourceSlug> --centre-slugs <slug1,slug2,...>
const args = process.argv.slice(2)
const sourceSlug = args[0] && !args[0].startsWith('--') ? args[0] : undefined
const centreSlugsIdx = args.indexOf('--centre-slugs')
const centreSlugsArg = centreSlugsIdx !== -1 && args[centreSlugsIdx + 1] ? args[centreSlugsIdx + 1] : ''
const centreSlugs = centreSlugsArg.split(',').map(s => s.trim()).filter(Boolean)

if (!sourceSlug || centreSlugs.length === 0) {
  console.error('Usage: npx tsx prisma/set-locality-catchment.ts <sourceSlug> --centre-slugs <slug1,slug2,...>')
  process.exit(1)
}

const adapter = new PrismaPg(new Pool({ connectionString: process.env.DATABASE_URL }))
const prisma = new PrismaClient({ adapter })

;(async () => {
  const source = await prisma.locality.findUnique({ where: { slug: sourceSlug } })
  if (!source) throw new Error(`Source not found: ${sourceSlug}`)

  // Delete existing edges for this source — curated overrides replace all.
  const deleted = await prisma.localityCatchmentEdge.deleteMany({
    where: { sourceLocalityId: source.id },
  })

  let created = 0
  for (let i = 0; i < centreSlugs.length; i++) {
    const target = await prisma.locality.findUnique({ where: { slug: centreSlugs[i] } })
    if (!target) {
      console.warn(`  target missing: ${centreSlugs[i]}`)
      continue
    }
    await prisma.localityCatchmentEdge.create({
      data: {
        sourceLocalityId: source.id,
        targetLocalityId: target.id,
        rank: i + 1,
        isCurated: true,
      },
    })
    created++
  }
  console.log(`Catchment override set for ${sourceSlug}: deleted ${deleted.count}, created ${created} curated edges → [${centreSlugs.join(', ')}]`)
  await prisma.$disconnect()
})().catch(e => { console.error(e); process.exit(1) })
