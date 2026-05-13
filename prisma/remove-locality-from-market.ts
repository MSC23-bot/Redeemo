// prisma/remove-locality-from-market.ts
//
// Plan 4 M1.23 — owner-run script: clear Locality.marketId so the Locality
// reverts to organic (no curated Market). Temporary operational tooling
// pending the Phase 5 admin panel (see
// project_admin_panel_market_expansion_tooling.md §AP).
//
// Usage:
//   npx tsx prisma/remove-locality-from-market.ts <localitySlug>
//
// Example:
//   npx tsx prisma/remove-locality-from-market.ts holmfirth

import 'dotenv/config'
import { PrismaClient } from '../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const [localitySlug] = process.argv.slice(2)
if (!localitySlug) {
  console.error('Usage: npx tsx prisma/remove-locality-from-market.ts <localitySlug>')
  process.exit(1)
}

const adapter = new PrismaPg(new Pool({ connectionString: process.env.DATABASE_URL }))
const prisma = new PrismaClient({ adapter })

;(async () => {
  const locality = await prisma.locality.findUnique({ where: { slug: localitySlug } })
  if (!locality) throw new Error(`Locality not found: ${localitySlug}`)
  await prisma.locality.update({
    where: { id: locality.id },
    data: { marketId: null },
  })
  console.log(`${localitySlug} removed from market (was: ${locality.marketId ?? 'none'})`)
  await prisma.$disconnect()
})().catch(e => { console.error(e); process.exit(1) })
