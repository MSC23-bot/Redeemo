import { NextRequest, NextResponse } from 'next/server'
import { backendPost } from '@/lib/auth/bff'

// POST /api/merchant-auth/register -> backend /register. Registration does NOT issue
// tokens (it returns { status:'VERIFY_EMAIL_SENT', sessionChallenge } for every
// outcome, including a duplicate email - non-enumerating), so there is no cookie to
// set. Routed through the BFF (rather than direct) so the backend origin stays
// server-side and the response shape is normalised in one place.
export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = await req.json().catch(() => ({}))
  const { res, data } = await backendPost('/register', body)
  return NextResponse.json(data ?? { error: { code: 'UNKNOWN', message: 'Registration failed.' } }, { status: res.status })
}
