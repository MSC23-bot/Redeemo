// prisma/set-market-status.ts
//
// Plan 4 M1.23 — owner-run script: toggle a Market between ACTIVE and PAUSED.
// Temporary operational tooling pending the Phase 5 admin panel (see
// project_admin_panel_market_expansion_tooling.md §AP for the locked
// long-term requirement to move this into the admin UI).
//
// RETIRED is intentionally NOT accepted here — the Plan 4a MarketStatus
// enum is intentionally simple (ACTIVE | PAUSED only). A RETIRED lifecycle
// state is deferred to Phase 5 Admin Panel / Market Ops tooling, where the
// enum will be extended alongside the admin-UI lifecycle controls and any
// associated retire-and-archive workflow (see §AP + §AQ in the deferred-
// followups index).
//
// Usage:
//   npx tsx prisma/set-market-status.ts <slug> <ACTIVE|PAUSED>
//
// Example:
//   npx tsx prisma/set-market-status.ts huddersfield PAUSED

import 'dotenv/config'
import { PrismaClient } from '../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const ALLOWED = ['ACTIVE', 'PAUSED'] as const
type AllowedStatus = (typeof ALLOWED)[number]

const [slug, status] = process.argv.slice(2)
if (!slug || !ALLOWED.includes(status as AllowedStatus)) {
  console.error('Usage: npx tsx prisma/set-market-status.ts <slug> <ACTIVE|PAUSED>')
  process.exit(1)
}

const adapter = new PrismaPg(new Pool({ connectionString: process.env.DATABASE_URL }))
const prisma = new PrismaClient({ adapter })

;(async () => {
  const m = await prisma.market.update({
    where: { slug },
    data: { status: status as AllowedStatus },
  })
  console.log(`Market ${m.slug} → ${m.status}`)
  await prisma.$disconnect()
})().catch(e => { console.error(e); process.exit(1) })
