import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import jwt from '@fastify/jwt'
import customerAuthPlugin from '../../../src/api/auth/customer/plugin'
import { optionalUserId } from '../../../src/api/customer/plugin'

// SEC-C1 (Gate-PR-5) — optionalUserId must VERIFY the JWT signature.
//
// Before this fix optionalUserId base64-decoded the JWT payload and trusted
// `sub` with NO signature check, so a forged token impersonated any user on
// the open discovery/review routes (leaking the victim's redemption code,
// favourites, etc.). It must now resolve to guest (null) for any token whose
// signature does not verify against JWT_SECRET_CUSTOMER, and yield the `sub`
// only for a validly-signed customer token.

function b64url(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString('base64url')
}

// A JWT-shaped string with a victim `sub` but NO valid signature (the attack).
function forgeUnsigned(sub: string): string {
  return `${b64url({ alg: 'none', typ: 'JWT' })}.${b64url({ sub })}.not-a-real-signature`
}

async function probe(app: FastifyInstance, authorization?: string): Promise<string | null> {
  const res = await app.inject({
    method: 'GET',
    url: '/__probe',
    ...(authorization ? { headers: { authorization } } : {}),
  })
  return JSON.parse(res.body).userId
}

let app: FastifyInstance
let wrongApp: FastifyInstance
let validToken: string
let wrongSecretToken: string

beforeAll(async () => {
  // Minimal app: customerAuthPlugin registers @fastify/jwt 'customer' (decorates
  // req.customerVerify app-wide via fastify-plugin) + app.authenticateCustomer.
  // The probe route is UNAUTHENTICATED (mirrors the open discovery scope) and
  // simply reflects whatever optionalUserId resolves to.
  app = Fastify()
  await app.register(customerAuthPlugin)
  app.get('/__probe', async (req) => ({ userId: await optionalUserId(req) }))
  await app.ready()
  validToken = (app.jwt as any).customer.sign({ sub: 'real-user-1' })

  // A throwaway app whose 'customer' JWT secret is DIFFERENT — tokens it signs
  // are well-formed but fail signature verification against the real secret.
  wrongApp = Fastify()
  await wrongApp.register(jwt, {
    secret: 'sec-c1-test-wrong-secret-not-the-real-one',
    namespace: 'customer',
    jwtSign: 'customerSign',
    jwtVerify: 'customerVerify',
  })
  await wrongApp.ready()
  wrongSecretToken = (wrongApp.jwt as any).customer.sign({ sub: 'real-user-1' })
})

afterAll(async () => {
  if (app) await app.close()
  if (wrongApp) await wrongApp.close()
})

describe('SEC-C1 — optionalUserId verifies the JWT signature', () => {
  it('VALID signed customer token → returns its sub', async () => {
    expect(await probe(app, `Bearer ${validToken}`)).toBe('real-user-1')
  })

  it('FORGED unsigned token (victim sub, no valid signature) → null (guest, no impersonation)', async () => {
    expect(await probe(app, `Bearer ${forgeUnsigned('victim-user-9')}`)).toBeNull()
  })

  it('token signed with the WRONG secret → null (signature mismatch)', async () => {
    expect(await probe(app, `Bearer ${wrongSecretToken}`)).toBeNull()
  })

  it('NO Authorization header → null (guest)', async () => {
    expect(await probe(app)).toBeNull()
  })

  it('non-Bearer Authorization → null', async () => {
    expect(await probe(app, 'Basic dXNlcjpwYXNz')).toBeNull()
  })

  it('malformed bearer token → null (no crash)', async () => {
    expect(await probe(app, 'Bearer not.a.jwt')).toBeNull()
    expect(await probe(app, 'Bearer garbage')).toBeNull()
  })
})
