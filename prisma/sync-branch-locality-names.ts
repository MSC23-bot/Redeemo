// prisma/sync-branch-locality-names.ts
//
// Plan 4 M1.23 — owner-run script: re-sync Branch.localityName from the
// canonical Locality.name. Useful after an admin renames a Locality (Phase 5)
// or after the ONSPD generator updates Locality names on quarterly refresh.
// The Branch.localityName mirror is a denormalised cache — this script
// re-aligns it with source-of-truth Locality.name.
//
// Temporary operational tooling pending the Phase 5 admin panel (see
// project_admin_panel_market_expansion_tooling.md §AP).
//
// Usage:
//   npx tsx prisma/sync-branch-locality-names.ts
//
// Idempotent: re-runs report 0 rows synced when all mirrors already match.

import 'dotenv/config'
import { PrismaClient } from '../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const adapter = new PrismaPg(new Pool({ connectionString: process.env.DATABASE_URL }))
const prisma = new PrismaClient({ adapter })

;(async () => {
  const branches = await prisma.branch.findMany({
    where: { localityId: { not: null } },
    select: { id: true, name: true, localityId: true, localityName: true },
  })
  let updated = 0
  let alreadyAligned = 0
  for (const b of branches) {
    if (!b.localityId) continue
    const loc = await prisma.locality.findUnique({
      where: { id: b.localityId },
      select: { name: true },
    })
    if (!loc) continue
    if (b.localityName !== loc.name) {
      await prisma.branch.update({
        where: { id: b.id },
        data: { localityName: loc.name },
      })
      updated++
    } else {
      alreadyAligned++
    }
  }
  console.log(`Synced ${updated} Branch.localityName mirrors (${alreadyAligned} already aligned)`)
  await prisma.$disconnect()
})().catch(e => { console.error(e); process.exit(1) })
