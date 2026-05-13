// prisma/add-locality-to-market.ts
//
// Plan 4 M1.23 — owner-run script: assign a Locality to a Market by setting
// Locality.marketId. Temporary operational tooling pending the Phase 5
// admin panel (see project_admin_panel_market_expansion_tooling.md §AP).
//
// Usage:
//   npx tsx prisma/add-locality-to-market.ts <localitySlug> <marketSlug>
//
// Example:
//   npx tsx prisma/add-locality-to-market.ts honley huddersfield

import 'dotenv/config'
import { PrismaClient } from '../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const [localitySlug, marketSlug] = process.argv.slice(2)
if (!localitySlug || !marketSlug) {
  console.error('Usage: npx tsx prisma/add-locality-to-market.ts <localitySlug> <marketSlug>')
  process.exit(1)
}

const adapter = new PrismaPg(new Pool({ connectionString: process.env.DATABASE_URL }))
const prisma = new PrismaClient({ adapter })

;(async () => {
  const market = await prisma.market.findUnique({ where: { slug: marketSlug } })
  if (!market) throw new Error(`Market not found: ${marketSlug}`)
  const locality = await prisma.locality.findUnique({ where: { slug: localitySlug } })
  if (!locality) throw new Error(`Locality not found: ${localitySlug}`)
  await prisma.locality.update({
    where: { id: locality.id },
    data: { marketId: market.id },
  })
  console.log(`${localitySlug} → market ${marketSlug} (id=${market.id})`)
  await prisma.$disconnect()
})().catch(e => { console.error(e); process.exit(1) })
