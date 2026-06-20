/**
 * DEV ONLY: print the most recent merchant-portal OTP / verification / claim /
 * reset payloads from the local DB. Local email is dark, so nothing is actually
 * sent; notify() persists the rendered email in CommunicationLog.payload until the
 * worker terminalises the row (which NULLs payload). With NO worker running
 * locally, the QUEUED row keeps the code/link.
 *
 * Run: npx tsx prisma/_get-merchant-otp.ts [emailSubstring]
 *   e.g. npx tsx prisma/_get-merchant-otp.ts merchant@redeemo.test
 *
 * Covers types: merchant_otp (login OTP), merchant_email_verify (registration
 * verify), merchant_claim (draft-owner claim), password_reset.
 */
import { PrismaClient } from '../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import * as dotenv from 'dotenv'
dotenv.config()

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter } as any)

const MERCHANT_TYPES = ['merchant_login_otp', 'merchant_email_verify', 'merchant_account_exists', 'merchant_claim', 'password_reset']

async function main() {
  const emailFilter = process.argv[2]

  // CommunicationLog has no recipient-email column; resolve the email to the
  // MerchantAdmin id and filter by recipientId.
  let recipientId: string | undefined
  if (emailFilter) {
    const admin = await prisma.merchantAdmin.findFirst({
      where: { email: { contains: emailFilter } },
      select: { id: true, email: true },
    })
    if (!admin) {
      console.log(`No MerchantAdmin matches "${emailFilter}".`)
      return
    }
    recipientId = admin.id
    console.log(`Filtering for ${admin.email} (recipientId=${admin.id})`)
  }

  const rows = await prisma.communicationLog.findMany({
    where: {
      recipientType: 'MERCHANT_ADMIN',
      type: { in: MERCHANT_TYPES },
      ...(recipientId ? { recipientId } : {}),
    },
    orderBy: { sentAt: 'desc' },
    take: 5,
    select: { id: true, recipientId: true, type: true, status: true, sentAt: true, payload: true },
  })

  if (rows.length === 0) {
    console.log('NO merchant communication rows found. Trigger a login/register/claim/reset first, and run the API WITHOUT the email worker so the QUEUED payload survives.')
    return
  }

  for (const r of rows) {
    const html = (r.payload as any)?.html as string | undefined
    let value = '(payload NULL, worker terminalised it)'
    if (html) {
      const code = html.match(/\b\d{6}\b/)?.[0]
      const token = html.match(/[?&]token=([^"&\s]+)/)?.[1]
      value = code ? `CODE=${code}` : token ? `TOKEN=${decodeURIComponent(token)}` : '(no code/token in html)'
    }
    console.log(
      `sentAt=${r.sentAt.toISOString()} type=${r.type} status=${r.status} recipientId=${r.recipientId} ${value}`
    )
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
