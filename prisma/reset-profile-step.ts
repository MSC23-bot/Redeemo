/**
 * Dev utility — resets profile completion fields for a user so you can re-test onboarding steps.
 *
 * Usage:
 *   npx tsx prisma/reset-profile-step.ts <email> <step>
 *
 * Steps:
 *   pc1   — clears firstName, lastName, dateOfBirth, gender  (re-enters About You)
 *   pc2   — clears postcode only                             (re-enters Your Address)
 *   all   — clears everything above + onboardingCompletedAt  (full restart)
 */
import pg from 'pg'
import dotenv from 'dotenv'
dotenv.config()

const email = process.argv[2]
const step  = process.argv[3] as 'pc1' | 'pc2' | 'all' | undefined

if (!email || !step) {
  console.error('Usage: npx tsx prisma/reset-profile-step.ts <email> <pc1|pc2|all>')
  process.exit(1)
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL })

async function run() {
  await client.connect()

  // Verify user exists
  const check = await client.query<{ id: string }>('SELECT id FROM "User" WHERE email = $1', [email])
  if (check.rowCount === 0) {
    console.error(`No user found with email: ${email}`)
    await client.end()
    process.exit(1)
  }
  const userId = check.rows[0]!.id

  let setClauses: string
  let values: (string | null)[]

  if (step === 'pc2') {
    setClauses = '"postcode" = $2'
    values = [userId, null]
  } else if (step === 'pc1') {
    setClauses = '"firstName" = $2, "lastName" = $3, "dateOfBirth" = $4, "gender" = $5'
    values = [userId, null, null, null, null]
  } else {
    // all
    setClauses = '"firstName" = $2, "lastName" = $3, "dateOfBirth" = $4, "gender" = $5, "postcode" = $6, "onboardingCompletedAt" = $7'
    values = [userId, null, null, null, null, null, null]
  }

  await client.query(`UPDATE "User" SET ${setClauses} WHERE id = $1`, values)

  console.log(`✓ Reset step "${step}" for ${email}`)
  if (step === 'pc2' || step === 'all') console.log('  → Next login will land on PC2 (Your Address)')
  if (step === 'pc1')                   console.log('  → Next login will land on PC1 (About You)')
  if (step === 'all')                   console.log('  → Full onboarding restart')

  await client.end()
}

run().catch((e) => { console.error(e); process.exit(1) })
