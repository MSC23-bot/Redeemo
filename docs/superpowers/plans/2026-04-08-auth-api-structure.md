# Auth System + API Structure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete Redeemo backend API foundation — Fastify server, four isolated auth plugins (customer/merchant/branch/admin), JWT + refresh token sessions, Redis permission cache, Twilio OTP, Google/Apple SSO, BranchUser provisioning by MerchantAdmin, branch redemption PIN, audit logging, and persistent mobile sessions with single-device enforcement.

**Architecture:** Single Fastify server (`src/api/`) with four auth plugins each using a separate JWT secret and `authenticate` decorator. Refresh tokens are opaque random strings stored in Redis with 90-day TTL. A Redis permission cache layer sits in front of Postgres for every authenticated request. `UserSession` and `AuditLog` tables in Postgres provide full session tracking and security audit trail.

**Tech Stack:** Node.js 24, TypeScript, Fastify 5, `@fastify/jwt`, `@fastify/rate-limit`, `@fastify/helmet`, `@fastify/cors`, Prisma 7, ioredis, bcryptjs, zod, twilio, resend, google-auth-library, apple-signin-auth, nanoid, Vitest

**Spec:** `docs/superpowers/specs/2026-04-08-auth-api-structure-design.md`

---

## File Map

### New files to create

```
src/
  index.ts                                  # Entry point — calls app.ts, starts server
  api/
    app.ts                                  # Fastify factory function (used in server + tests)
    plugins/
      prisma.ts                             # Prisma client singleton Fastify plugin
      redis.ts                              # ioredis client Fastify plugin
      cors.ts                               # CORS config plugin
      rate-limit.ts                         # Global + auth-specific rate limiting plugin
    auth/
      customer/
        plugin.ts                           # JWT setup + authenticateCustomer decorator
        routes.ts                           # Customer auth routes
        service.ts                          # Customer auth business logic
      merchant/
        plugin.ts                           # JWT setup + authenticateMerchant decorator
        routes.ts                           # Merchant auth routes + branch user mgmt routes
        service.ts                          # Merchant auth + BranchUser provisioning logic
      branch/
        plugin.ts                           # JWT setup + authenticateBranch decorator
        routes.ts                           # Branch user auth routes
        service.ts                          # Branch user auth logic
      admin/
        plugin.ts                           # JWT setup + authenticateAdmin decorator
        routes.ts                           # Admin auth routes
        service.ts                          # Admin auth logic
    shared/
      errors.ts                             # AppError class + all error codes
      password.ts                           # bcrypt hash/compare + policy validation
      tokens.ts                             # JWT sign/verify + refresh token helpers
      otp.ts                                # Twilio Verify OTP send/verify + rate limiting
      audit.ts                              # Fire-and-forget audit log writer
      redis-keys.ts                         # All Redis key patterns (single source of truth)
      schemas.ts                            # Shared Zod schemas (email, password, phone, etc.)
      session.ts                            # UserSession write/revoke helpers
tests/
  api/
    auth/
      customer.test.ts                      # Customer auth integration tests
      merchant.test.ts                      # Merchant auth integration tests
      branch.test.ts                        # Branch user auth integration tests
      admin.test.ts                         # Admin auth integration tests
    shared/
      password.test.ts                      # Password utility unit tests
      tokens.test.ts                        # Token utility unit tests
      otp.test.ts                           # OTP utility unit tests
      session.test.ts                       # Session enforcement unit tests
```

### Files to modify

```
prisma/schema.prisma                        # Add UserSession, AuditLog models; update User,
                                            # MerchantAdmin, BranchUser, AdminRole enum, Branch
package.json                                # Add new dependencies + scripts
tsconfig.json                               # Already correct — no changes needed
```

---

## Task 1: Schema additions + migration

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add new fields to existing models in `prisma/schema.prisma`**

Add to `User` model (after `deletedAt`):
```prisma
emailVerified        Boolean    @default(false)
phoneVerified        Boolean    @default(false)
marketingConsentAt   DateTime?
```

Add to `MerchantAdmin` model (after `updatedAt`):
```prisma
otpVerifiedAt        DateTime?
mustChangePassword   Boolean    @default(false)
```

Add to `BranchUser` model — change `passwordHash String?` to `passwordHash String` (non-nullable), and add after `updatedAt`:
```prisma
mustChangePassword   Boolean    @default(false)
```

Add to `AdminRole` enum — add `FINANCE` value:
```prisma
enum AdminRole {
  SUPER_ADMIN
  OPERATIONS
  FINANCE
  CONTENT
  SUPPORT
}
```

Modify `Branch` model — change `redemptionPin String` to `redemptionPinHash String?` (the plain-text PIN field is replaced with a hash field):
```prisma
redemptionPinHash    String?
```
Remove `redemptionPin String` line.

- [ ] **Step 2: Add `UserSession` model to `prisma/schema.prisma`** (add after `BranchUser` model)

```prisma
// ─────────────────────────────────────────
// SESSION TRACKING
// ─────────────────────────────────────────

model UserSession {
  id            String    @id @default(cuid())
  entityId      String
  entityType    String    // 'customer' | 'merchant' | 'branch' | 'admin'
  sessionId     String    @unique
  deviceId      String
  deviceType    String    // 'ios' | 'android' | 'web'
  deviceName    String?
  ipAddress     String
  userAgent     String
  createdAt     DateTime  @default(now())
  lastActiveAt  DateTime  @default(now())
  revokedAt     DateTime?
  revokedReason String?

  @@index([entityId, entityType])
  @@index([sessionId])
}
```

- [ ] **Step 3: Add `AuditLog` model to `prisma/schema.prisma`** (add after `UserSession`)

```prisma
// ─────────────────────────────────────────
// AUDIT LOG
// ─────────────────────────────────────────

model AuditLog {
  id         String   @id @default(cuid())
  entityId   String
  entityType String   // 'customer' | 'merchant' | 'branch' | 'admin'
  event      String
  ipAddress  String
  userAgent  String
  deviceId   String?
  sessionId  String?
  metadata   Json?
  createdAt  DateTime @default(now())

  @@index([entityId, entityType])
  @@index([event])
  @@index([createdAt])
}
```

- [ ] **Step 4: Generate and apply migration**

```bash
npx prisma migrate dev --name auth_schema_additions
```

Expected output: Migration created and applied. `UserSession` and `AuditLog` tables created. `User`, `MerchantAdmin`, `BranchUser`, `Branch` tables altered.

- [ ] **Step 5: Regenerate Prisma client**

```bash
npx prisma generate
```

Expected: `Generated Prisma Client` in output.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add UserSession, AuditLog models and auth schema additions"
```

---

## Task 2: Install dependencies + project scaffolding

**Files:**
- Modify: `package.json`
- Create: `src/index.ts`, `src/api/app.ts`, `vitest.config.ts`

- [ ] **Step 1: Install production dependencies**

```bash
npm install fastify @fastify/jwt @fastify/cors @fastify/rate-limit @fastify/helmet bcryptjs zod ioredis twilio resend google-auth-library apple-signin-auth nanoid
```

Expected: packages installed, `package.json` updated.

- [ ] **Step 2: Install dev dependencies**

```bash
npm install --save-dev @types/bcryptjs vitest @vitest/coverage-v8
```

Expected: dev packages installed.

- [ ] **Step 3: Update `package.json` scripts**

Replace the `"scripts"` block in `package.json`:
```json
"scripts": {
  "dev": "tsx watch src/index.ts",
  "build": "tsc",
  "start": "node dist/src/index.js",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:coverage": "vitest run --coverage"
}
```

- [ ] **Step 4: Create `vitest.config.ts` in project root**

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
    },
  },
})
```

- [ ] **Step 5: Write failing test for app factory**

Create `tests/api/app.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { buildApp } from '../../src/api/app'

describe('app factory', () => {
  it('builds a Fastify app without throwing', async () => {
    const app = await buildApp()
    expect(app).toBeDefined()
    await app.close()
  })

  it('responds 200 to GET /health', async () => {
    const app = await buildApp()
    const res = await app.inject({ method: 'GET', url: '/health' })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual({ status: 'ok' })
    await app.close()
  })
})
```

- [ ] **Step 6: Run test — verify it fails**

```bash
npm test -- tests/api/app.test.ts
```

Expected: FAIL — `Cannot find module '../../src/api/app'`

- [ ] **Step 7: Create `src/api/app.ts`**

```typescript
import Fastify, { FastifyInstance } from 'fastify'

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: process.env.NODE_ENV !== 'test',
  })

  app.get('/health', async () => ({ status: 'ok' }))

  return app
}
```

- [ ] **Step 8: Run test — verify it passes**

```bash
npm test -- tests/api/app.test.ts
```

Expected: PASS (2 tests)

- [ ] **Step 9: Create `src/index.ts`**

```typescript
import 'dotenv/config'
import { buildApp } from './api/app'

const PORT = parseInt(process.env.PORT ?? '3000', 10)

buildApp().then((app) => {
  app.listen({ port: PORT, host: '0.0.0.0' }, (err) => {
    if (err) {
      app.log.error(err)
      process.exit(1)
    }
  })
})
```

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json vitest.config.ts src/index.ts src/api/app.ts tests/api/app.test.ts
git commit -m "feat: add Fastify scaffolding, health endpoint, Vitest setup"
```

---

## Task 3: Shared utilities — errors, schemas, Redis keys

**Files:**
- Create: `src/api/shared/errors.ts`, `src/api/shared/schemas.ts`, `src/api/shared/redis-keys.ts`

- [ ] **Step 1: Write failing test for errors**

Create `tests/api/shared/errors.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { AppError, ErrorCode } from '../../../src/api/shared/errors'

describe('AppError', () => {
  it('creates an error with code and statusCode', () => {
    const err = new AppError(ErrorCode.INVALID_CREDENTIALS)
    expect(err.code).toBe('INVALID_CREDENTIALS')
    expect(err.statusCode).toBe(401)
    expect(err instanceof Error).toBe(true)
  })

  it('serialises to the standard JSON shape', () => {
    const err = new AppError(ErrorCode.EMAIL_ALREADY_EXISTS)
    expect(err.toJSON()).toEqual({
      error: {
        code: 'EMAIL_ALREADY_EXISTS',
        message: expect.any(String),
        statusCode: 409,
      },
    })
  })
})
```

- [ ] **Step 2: Run test — verify it fails**

```bash
npm test -- tests/api/shared/errors.test.ts
```

Expected: FAIL — `Cannot find module`

- [ ] **Step 3: Create `src/api/shared/errors.ts`**

```typescript
export const ERROR_DEFINITIONS = {
  INVALID_CREDENTIALS:            { statusCode: 401, message: 'The email or password is incorrect.' },
  ACCOUNT_NOT_ACTIVE:             { statusCode: 403, message: 'Your account is not yet active. Please complete verification.' },
  ACCOUNT_LOCKED:                 { statusCode: 423, message: 'Your account is temporarily locked. Please try again later.' },
  ACCOUNT_SUSPENDED:              { statusCode: 403, message: 'Your account has been suspended. Please contact support.' },
  EMAIL_NOT_VERIFIED:             { statusCode: 403, message: 'Please verify your email address.' },
  PHONE_NOT_VERIFIED:             { statusCode: 403, message: 'Please verify your phone number.' },
  EMAIL_ALREADY_EXISTS:           { statusCode: 409, message: 'An account with this email already exists.' },
  PHONE_ALREADY_EXISTS:           { statusCode: 409, message: 'This phone number is already linked to a verified account.' },
  OTP_REQUIRED:                   { statusCode: 403, message: 'A one-time code is required to continue.' },
  OTP_INVALID:                    { statusCode: 400, message: 'The code you entered is incorrect.' },
  OTP_EXPIRED:                    { statusCode: 400, message: 'This code has expired. Please request a new one.' },
  OTP_MAX_ATTEMPTS:               { statusCode: 429, message: 'Too many incorrect attempts. Please try again in 5 minutes.' },
  REFRESH_TOKEN_INVALID:          { statusCode: 401, message: 'Your session has expired. Please log in again.' },
  RESET_TOKEN_INVALID:            { statusCode: 400, message: 'This password reset link is invalid.' },
  RESET_TOKEN_EXPIRED:            { statusCode: 400, message: 'This password reset link has expired.' },
  MERCHANT_SUSPENDED:             { statusCode: 403, message: 'This merchant account is suspended.' },
  MERCHANT_NOT_APPROVED:          { statusCode: 403, message: 'This merchant account is not yet approved.' },
  MERCHANT_DEACTIVATED:           { statusCode: 403, message: 'This merchant account is deactivated.' },
  MERCHANT_REACTIVATION_EXPIRED:  { statusCode: 403, message: 'The reactivation window has expired.' },
  BRANCH_USER_DEACTIVATED:        { statusCode: 403, message: 'This branch user account is deactivated.' },
  BRANCH_USER_NOT_FOUND:          { statusCode: 404, message: 'No user is assigned to this branch.' },
  BRANCH_NOT_OWNED:               { statusCode: 403, message: 'You do not have access to this branch.' },
  INSUFFICIENT_PERMISSIONS:       { statusCode: 403, message: 'You do not have permission to perform this action.' },
  ACTION_TOKEN_INVALID:           { statusCode: 400, message: 'This action has expired. Please start again.' },
  PASSWORD_POLICY_VIOLATION:      { statusCode: 400, message: 'Password must be at least 8 characters and include uppercase, lowercase, a number, and a special character.' },
  PASSWORD_CHANGE_REQUIRED:       { statusCode: 403, message: 'You must set a new password before continuing.' },
  VERIFICATION_TOKEN_INVALID:     { statusCode: 400, message: 'This verification link is invalid.' },
  VERIFICATION_TOKEN_EXPIRED:     { statusCode: 400, message: 'This verification link has expired.' },
} as const

export type ErrorCode = keyof typeof ERROR_DEFINITIONS

export class AppError extends Error {
  public readonly code: ErrorCode
  public readonly statusCode: number

  constructor(code: ErrorCode) {
    const def = ERROR_DEFINITIONS[code]
    super(def.message)
    this.code = code
    this.statusCode = def.statusCode
    this.name = 'AppError'
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        statusCode: this.statusCode,
      },
    }
  }
}
```

- [ ] **Step 4: Run test — verify it passes**

```bash
npm test -- tests/api/shared/errors.test.ts
```

Expected: PASS (2 tests)

- [ ] **Step 5: Create `src/api/shared/redis-keys.ts`**

```typescript
export const RedisKey = {
  // Auth permission cache
  authCustomer:        (userId: string)          => `auth:customer:${userId}`,
  authMerchant:        (merchantAdminId: string)  => `auth:merchant:${merchantAdminId}`,
  authBranch:          (branchUserId: string)     => `auth:branch:${branchUserId}`,
  authAdmin:           (adminUserId: string)      => `auth:admin:${adminUserId}`,

  // Refresh tokens
  refreshToken:        (role: string, entityId: string, sessionId: string) =>
                         `refresh:${role}:${entityId}:${sessionId}`,

  // Active mobile sessions (for single-session enforcement)
  activeMobileSession: (role: string, entityId: string) =>
                         `sessions:mobile:${role}:${entityId}`,

  // OTP
  otp:                 (role: string, entityId: string) => `otp:${role}:${entityId}`,
  otpLock:             (role: string, entityId: string) => `otp:lock:${role}:${entityId}`,
  otpSendCount:        (phone: string)            => `otp:send:${phone}`,
  otpAction:           (userId: string, action: string) => `otp:action:${userId}:${action}`,

  // Email verification
  emailVerify:         (token: string)            => `email-verify:${token}`,
  emailChange:         (token: string)            => `email-change:${token}`,

  // Phone verification (during registration)
  phoneVerifyPending:  (userId: string)           => `phone-verify:${userId}`,

  // Password reset
  passwordReset:       (role: string, token: string) => `pwd-reset:${role}:${token}`,

  // BranchUser first-login temp token
  branchTempToken:     (token: string)            => `branch-temp:${token}`,

  // Merchant OTP session challenge
  otpChallenge:        (role: string, token: string) => `otp-challenge:${role}:${token}`,

  // Rate limiting counters
  rateLimitOtpSend:    (phone: string)            => `rl:otp:${phone}`,
  rateLimitPwdReset:   (email: string)            => `rl:pwd-reset:${email}`,
} as const
```

- [ ] **Step 6: Create `src/api/shared/schemas.ts`**

```typescript
import { z } from 'zod'

export const emailSchema = z
  .string()
  .email('Must be a valid email address')
  .toLowerCase()
  .trim()

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[!@#$%^&*()\-_=+\[\]{}|;:'",.<>?/\\`~]/, 'Password must contain at least one special character')

export const phoneSchema = z
  .string()
  .regex(/^\+[1-9]\d{7,14}$/, 'Phone must be in E.164 format (e.g. +447700900000)')

export const deviceSchema = z.object({
  deviceId:   z.string().uuid('deviceId must be a UUID'),
  deviceType: z.enum(['ios', 'android', 'web']),
  deviceName: z.string().max(100).optional(),
})

export const otpCodeSchema = z
  .string()
  .length(6, 'Code must be 6 digits')
  .regex(/^\d{6}$/, 'Code must be numeric')

export const pinSchema = z
  .string()
  .length(4, 'PIN must be 4 digits')
  .regex(/^\d{4}$/, 'PIN must be numeric')
```

- [ ] **Step 7: Commit**

```bash
git add src/api/shared/errors.ts src/api/shared/redis-keys.ts src/api/shared/schemas.ts tests/api/shared/errors.test.ts
git commit -m "feat: add shared error codes, Redis key patterns, Zod schemas"
```

---

## Task 4: Shared utilities — password, tokens

**Files:**
- Create: `src/api/shared/password.ts`, `src/api/shared/tokens.ts`
- Create: `tests/api/shared/password.test.ts`, `tests/api/shared/tokens.test.ts`

- [ ] **Step 1: Write failing password tests**

Create `tests/api/shared/password.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { hashPassword, verifyPassword, validatePasswordPolicy } from '../../../src/api/shared/password'

describe('password utilities', () => {
  it('hashes a password and verifies correctly', async () => {
    const hash = await hashPassword('MyPass123!')
    expect(hash).not.toBe('MyPass123!')
    const valid = await verifyPassword('MyPass123!', hash)
    expect(valid).toBe(true)
  })

  it('returns false for wrong password', async () => {
    const hash = await hashPassword('MyPass123!')
    const valid = await verifyPassword('WrongPass1!', hash)
    expect(valid).toBe(false)
  })

  it('accepts a valid password', () => {
    expect(validatePasswordPolicy('MyPass123!')).toBe(true)
  })

  it('rejects password with no uppercase', () => {
    expect(validatePasswordPolicy('mypass123!')).toBe(false)
  })

  it('rejects password with no lowercase', () => {
    expect(validatePasswordPolicy('MYPASS123!')).toBe(false)
  })

  it('rejects password with no digit', () => {
    expect(validatePasswordPolicy('MyPassword!')).toBe(false)
  })

  it('rejects password with no special character', () => {
    expect(validatePasswordPolicy('MyPass1234')).toBe(false)
  })

  it('rejects password shorter than 8 characters', () => {
    expect(validatePasswordPolicy('My1!')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test — verify it fails**

```bash
npm test -- tests/api/shared/password.test.ts
```

Expected: FAIL — `Cannot find module`

- [ ] **Step 3: Create `src/api/shared/password.ts`**

```typescript
import bcrypt from 'bcryptjs'
import { passwordSchema } from './schemas'

const BCRYPT_ROUNDS = 12

export async function hashPassword(plaintext: string): Promise<string> {
  return bcrypt.hash(plaintext, BCRYPT_ROUNDS)
}

export async function verifyPassword(plaintext: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plaintext, hash)
}

export function validatePasswordPolicy(password: string): boolean {
  const result = passwordSchema.safeParse(password)
  return result.success
}
```

- [ ] **Step 4: Run test — verify it passes**

```bash
npm test -- tests/api/shared/password.test.ts
```

Expected: PASS (8 tests)

- [ ] **Step 5: Write failing token tests**

Create `tests/api/shared/tokens.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import {
  generateRefreshToken,
  hashRefreshToken,
  generateSessionId,
} from '../../../src/api/shared/tokens'

describe('token utilities', () => {
  it('generates a refresh token of correct length', () => {
    const token = generateRefreshToken()
    // 64 bytes hex = 128 characters
    expect(token).toHaveLength(128)
    expect(/^[a-f0-9]+$/.test(token)).toBe(true)
  })

  it('generates unique refresh tokens', () => {
    const t1 = generateRefreshToken()
    const t2 = generateRefreshToken()
    expect(t1).not.toBe(t2)
  })

  it('hashes a refresh token deterministically', () => {
    const token = generateRefreshToken()
    const hash1 = hashRefreshToken(token)
    const hash2 = hashRefreshToken(token)
    expect(hash1).toBe(hash2)
    expect(hash1).not.toBe(token)
  })

  it('generates a unique session ID', () => {
    const id1 = generateSessionId()
    const id2 = generateSessionId()
    expect(id1).not.toBe(id2)
    expect(id1.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 6: Run test — verify it fails**

```bash
npm test -- tests/api/shared/tokens.test.ts
```

Expected: FAIL — `Cannot find module`

- [ ] **Step 7: Create `src/api/shared/tokens.ts`**

```typescript
import crypto from 'crypto'

export function generateRefreshToken(): string {
  return crypto.randomBytes(64).toString('hex')
}

export function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

export function generateSessionId(): string {
  return crypto.randomBytes(16).toString('hex')
}

export function generateSecureToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('hex')
}

export function generateOtpCode(): string {
  // Cryptographically random 6-digit code
  const num = crypto.randomInt(0, 1_000_000)
  return num.toString().padStart(6, '0')
}
```

- [ ] **Step 8: Run test — verify it passes**

```bash
npm test -- tests/api/shared/tokens.test.ts
```

Expected: PASS (4 tests)

- [ ] **Step 9: Commit**

```bash
git add src/api/shared/password.ts src/api/shared/tokens.ts tests/api/shared/password.test.ts tests/api/shared/tokens.test.ts
git commit -m "feat: add password hash/verify/policy and token generation utilities"
```

---

## Task 5: Fastify plugins — Prisma, Redis, CORS, rate-limit + error handler

**Files:**
- Create: `src/api/plugins/prisma.ts`, `src/api/plugins/redis.ts`, `src/api/plugins/cors.ts`, `src/api/plugins/rate-limit.ts`
- Modify: `src/api/app.ts`

- [ ] **Step 1: Create `src/api/plugins/prisma.ts`**

```typescript
import fp from 'fastify-plugin'
import { FastifyInstance } from 'fastify'
import { PrismaClient } from '../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

async function prismaPlugin(app: FastifyInstance) {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
  const prisma = new PrismaClient({ adapter })
  await prisma.$connect()

  app.decorate('prisma', prisma)

  app.addHook('onClose', async () => {
    await prisma.$disconnect()
  })
}

export default fp(prismaPlugin, { name: 'prisma' })

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient
  }
}
```

- [ ] **Step 2: Install `fastify-plugin`**

```bash
npm install fastify-plugin
```

Expected: installed successfully.

- [ ] **Step 3: Create `src/api/plugins/redis.ts`**

```typescript
import fp from 'fastify-plugin'
import { FastifyInstance } from 'fastify'
import Redis from 'ioredis'

async function redisPlugin(app: FastifyInstance) {
  const redis = new Redis(process.env.REDIS_URL!, {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
  })

  await redis.connect()

  app.decorate('redis', redis)

  app.addHook('onClose', async () => {
    await redis.quit()
  })
}

export default fp(redisPlugin, { name: 'redis' })

declare module 'fastify' {
  interface FastifyInstance {
    redis: Redis
  }
}
```

- [ ] **Step 4: Create `src/api/plugins/cors.ts`**

```typescript
import fp from 'fastify-plugin'
import { FastifyInstance } from 'fastify'
import cors from '@fastify/cors'

async function corsPlugin(app: FastifyInstance) {
  await app.register(cors, {
    origin: process.env.CORS_ORIGIN?.split(',') ?? ['http://localhost:3001'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  })
}

export default fp(corsPlugin, { name: 'cors' })
```

- [ ] **Step 5: Create `src/api/plugins/rate-limit.ts`**

```typescript
import fp from 'fastify-plugin'
import { FastifyInstance } from 'fastify'
import rateLimit from '@fastify/rate-limit'

async function rateLimitPlugin(app: FastifyInstance) {
  await app.register(rateLimit, {
    global: true,
    max: 100,
    timeWindow: '1 minute',
    keyGenerator: (req) => req.ip,
  })
}

export default fp(rateLimitPlugin, { name: 'rate-limit' })
```

- [ ] **Step 6: Update `src/api/app.ts` — register plugins and global error handler**

```typescript
import Fastify, { FastifyInstance, FastifyError } from 'fastify'
import helmet from '@fastify/helmet'
import prismaPlugin from './plugins/prisma'
import redisPlugin from './plugins/redis'
import corsPlugin from './plugins/cors'
import rateLimitPlugin from './plugins/rate-limit'
import { AppError } from './shared/errors'

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: process.env.NODE_ENV !== 'test',
  })

  // Security headers
  await app.register(helmet)

  // Infrastructure plugins
  if (process.env.NODE_ENV !== 'test') {
    await app.register(prismaPlugin)
    await app.register(redisPlugin)
  }
  await app.register(corsPlugin)
  await app.register(rateLimitPlugin)

  // Global error handler
  app.setErrorHandler((error: FastifyError | AppError | Error, _req, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send(error.toJSON())
    }
    // Rate limit error from @fastify/rate-limit
    if ('statusCode' in error && error.statusCode === 429) {
      return reply.status(429).send({
        error: { code: 'RATE_LIMITED', message: 'Too many requests. Please slow down.', statusCode: 429 },
      })
    }
    app.log.error(error)
    return reply.status(500).send({
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.', statusCode: 500 },
    })
  })

  app.get('/health', async () => ({ status: 'ok' }))

  return app
}
```

- [ ] **Step 7: Run existing tests to confirm still passing**

```bash
npm test -- tests/api/app.test.ts
```

Expected: PASS (2 tests)

- [ ] **Step 8: Commit**

```bash
git add src/api/plugins/ src/api/app.ts package.json package-lock.json
git commit -m "feat: register Prisma, Redis, CORS, rate-limit plugins and global error handler"
```

---

## Task 6: Audit log + session helpers

**Files:**
- Create: `src/api/shared/audit.ts`, `src/api/shared/session.ts`
- Create: `tests/api/shared/session.test.ts`

- [ ] **Step 1: Create `src/api/shared/audit.ts`**

```typescript
import { PrismaClient } from '../../generated/prisma/client'

export type AuditEvent =
  | 'AUTH_LOGIN_SUCCESS'
  | 'AUTH_LOGIN_FAILED'
  | 'AUTH_SSO_LOGIN_SUCCESS'
  | 'AUTH_LOGOUT'
  | 'AUTH_REFRESH_FAILED'
  | 'AUTH_OTP_SENT'
  | 'AUTH_OTP_VERIFIED'
  | 'AUTH_OTP_FAILED'
  | 'AUTH_OTP_LOCKED'
  | 'AUTH_PASSWORD_RESET'
  | 'AUTH_EMAIL_CHANGED'
  | 'AUTH_PHONE_CHANGED'
  | 'AUTH_SESSION_REVOKED'
  | 'AUTH_SESSIONS_REVOKED'
  | 'AUTH_ACCOUNT_DELETED'
  | 'AUTH_ACCOUNT_SUSPENDED'
  | 'BRANCH_USER_CREATED'
  | 'BRANCH_USER_PASSWORD_SET'
  | 'BRANCH_USER_PASSWORD_CHANGED'
  | 'BRANCH_USER_PASSWORD_RESET'
  | 'BRANCH_USER_DEACTIVATED'
  | 'BRANCH_USER_REACTIVATED'
  | 'BRANCH_PIN_CHANGED'
  | 'REDEMPTION_QUICK_VALIDATED'
  | 'MERCHANT_DEACTIVATED'
  | 'MERCHANT_REACTIVATED'

export interface AuditContext {
  entityId: string
  entityType: 'customer' | 'merchant' | 'branch' | 'admin'
  event: AuditEvent
  ipAddress: string
  userAgent: string
  deviceId?: string
  sessionId?: string
  metadata?: Record<string, unknown>
}

export function writeAuditLog(prisma: PrismaClient, ctx: AuditContext): void {
  // Fire-and-forget — does not block the request
  prisma.auditLog.create({
    data: {
      entityId:   ctx.entityId,
      entityType: ctx.entityType,
      event:      ctx.event,
      ipAddress:  ctx.ipAddress,
      userAgent:  ctx.userAgent,
      deviceId:   ctx.deviceId,
      sessionId:  ctx.sessionId,
      metadata:   ctx.metadata ?? null,
    },
  }).catch((err: unknown) => {
    console.error('[audit] Failed to write audit log:', err)
  })
}
```

- [ ] **Step 2: Write failing session tests**

Create `tests/api/shared/session.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type Redis from 'ioredis'
import {
  storeRefreshToken,
  revokeRefreshToken,
  revokeAllSessionsForEntity,
} from '../../../src/api/shared/session'

function makeRedis() {
  return {
    set: vi.fn().mockResolvedValue('OK'),
    get: vi.fn().mockResolvedValue(null),
    del: vi.fn().mockResolvedValue(1),
    keys: vi.fn().mockResolvedValue([]),
  } as unknown as Redis
}

describe('session helpers', () => {
  let redis: Redis

  beforeEach(() => {
    redis = makeRedis()
  })

  it('stores a refresh token in Redis with TTL', async () => {
    await storeRefreshToken(redis, {
      role: 'customer',
      entityId: 'user-1',
      sessionId: 'sess-1',
      tokenHash: 'abc123',
      deviceId: 'dev-1',
      deviceType: 'ios',
    })
    expect(redis.set).toHaveBeenCalledWith(
      'refresh:customer:user-1:sess-1',
      expect.any(String),
      'EX',
      expect.any(Number)
    )
  })

  it('revokes a single refresh token', async () => {
    await revokeRefreshToken(redis, { role: 'customer', entityId: 'user-1', sessionId: 'sess-1' })
    expect(redis.del).toHaveBeenCalledWith('refresh:customer:user-1:sess-1')
  })

  it('revokes all sessions for an entity', async () => {
    const mockRedis = makeRedis()
    ;(mockRedis.keys as ReturnType<typeof vi.fn>).mockResolvedValue([
      'refresh:customer:user-1:sess-1',
      'refresh:customer:user-1:sess-2',
    ])
    await revokeAllSessionsForEntity(mockRedis, { role: 'customer', entityId: 'user-1' })
    expect(mockRedis.del).toHaveBeenCalledWith(
      'refresh:customer:user-1:sess-1',
      'refresh:customer:user-1:sess-2'
    )
  })
})
```

- [ ] **Step 3: Run test — verify it fails**

```bash
npm test -- tests/api/shared/session.test.ts
```

Expected: FAIL — `Cannot find module`

- [ ] **Step 4: Create `src/api/shared/session.ts`**

```typescript
import type Redis from 'ioredis'
import type { PrismaClient } from '../../generated/prisma/client'
import { RedisKey } from './redis-keys'
import { hashRefreshToken } from './tokens'

const REFRESH_TOKEN_TTL_SECONDS = 90 * 24 * 60 * 60 // 90 days

export interface StoreRefreshTokenParams {
  role: string
  entityId: string
  sessionId: string
  tokenHash: string
  deviceId: string
  deviceType: string
  deviceName?: string
}

export async function storeRefreshToken(
  redis: Redis,
  params: StoreRefreshTokenParams
): Promise<void> {
  const key = RedisKey.refreshToken(params.role, params.entityId, params.sessionId)
  const value = JSON.stringify({
    tokenHash:  params.tokenHash,
    deviceId:   params.deviceId,
    deviceType: params.deviceType,
    deviceName: params.deviceName,
    createdAt:  new Date().toISOString(),
  })
  await redis.set(key, value, 'EX', REFRESH_TOKEN_TTL_SECONDS)
}

export async function revokeRefreshToken(
  redis: Redis,
  params: { role: string; entityId: string; sessionId: string }
): Promise<void> {
  const key = RedisKey.refreshToken(params.role, params.entityId, params.sessionId)
  await redis.del(key)
}

export async function revokeAllSessionsForEntity(
  redis: Redis,
  params: { role: string; entityId: string }
): Promise<void> {
  const pattern = `refresh:${params.role}:${params.entityId}:*`
  const keys = await redis.keys(pattern)
  if (keys.length > 0) {
    await redis.del(...keys)
  }
}

export async function getActiveMobileSessionId(
  redis: Redis,
  role: string,
  entityId: string
): Promise<string | null> {
  return redis.get(RedisKey.activeMobileSession(role, entityId))
}

export async function setActiveMobileSession(
  redis: Redis,
  role: string,
  entityId: string,
  sessionId: string
): Promise<void> {
  await redis.set(
    RedisKey.activeMobileSession(role, entityId),
    sessionId,
    'EX',
    REFRESH_TOKEN_TTL_SECONDS
  )
}

export async function clearActiveMobileSession(
  redis: Redis,
  role: string,
  entityId: string
): Promise<void> {
  await redis.del(RedisKey.activeMobileSession(role, entityId))
}

export async function writeUserSession(
  prisma: PrismaClient,
  params: {
    entityId: string
    entityType: string
    sessionId: string
    deviceId: string
    deviceType: string
    deviceName?: string
    ipAddress: string
    userAgent: string
  }
): Promise<void> {
  await prisma.userSession.create({ data: params })
}

export async function revokeUserSessionRecord(
  prisma: PrismaClient,
  params: { sessionId: string; reason: string }
): Promise<void> {
  await prisma.userSession.updateMany({
    where: { sessionId: params.sessionId, revokedAt: null },
    data:  { revokedAt: new Date(), revokedReason: params.reason },
  })
}

export async function revokeAllUserSessionRecords(
  prisma: PrismaClient,
  params: { entityId: string; entityType: string; reason: string }
): Promise<void> {
  await prisma.userSession.updateMany({
    where: { entityId: params.entityId, entityType: params.entityType, revokedAt: null },
    data:  { revokedAt: new Date(), revokedReason: params.reason },
  })
}

export function validateRefreshToken(stored: string, presented: string): boolean {
  const parsed = JSON.parse(stored) as { tokenHash: string }
  return parsed.tokenHash === hashRefreshToken(presented)
}
```

- [ ] **Step 5: Run test — verify it passes**

```bash
npm test -- tests/api/shared/session.test.ts
```

Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add src/api/shared/audit.ts src/api/shared/session.ts tests/api/shared/session.test.ts
git commit -m "feat: add audit log writer and session store/revoke helpers"
```

---

## Task 7: OTP utility (Twilio Verify)

**Files:**
- Create: `src/api/shared/otp.ts`
- Create: `tests/api/shared/otp.test.ts`

- [ ] **Step 1: Write failing OTP tests**

Create `tests/api/shared/otp.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type Redis from 'ioredis'
import { checkOtpRateLimit, recordOtpSend } from '../../../src/api/shared/otp'

function makeRedis(getResult: string | null = null) {
  return {
    get: vi.fn().mockResolvedValue(getResult),
    incr: vi.fn().mockResolvedValue(1),
    expire: vi.fn().mockResolvedValue(1),
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
  } as unknown as Redis
}

describe('OTP rate limiting', () => {
  it('allows send when under limit', async () => {
    const redis = makeRedis('2') // 2 sends so far
    const allowed = await checkOtpRateLimit(redis, '+447700900000')
    expect(allowed).toBe(true)
  })

  it('blocks send when at limit (3)', async () => {
    const redis = makeRedis('3')
    const allowed = await checkOtpRateLimit(redis, '+447700900000')
    expect(allowed).toBe(false)
  })

  it('allows send when no prior sends (null)', async () => {
    const redis = makeRedis(null)
    const allowed = await checkOtpRateLimit(redis, '+447700900000')
    expect(allowed).toBe(true)
  })

  it('records an OTP send with TTL', async () => {
    const redis = makeRedis()
    await recordOtpSend(redis, '+447700900000')
    expect(redis.incr).toHaveBeenCalled()
    expect(redis.expire).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test — verify it fails**

```bash
npm test -- tests/api/shared/otp.test.ts
```

Expected: FAIL — `Cannot find module`

- [ ] **Step 3: Create `src/api/shared/otp.ts`**

```typescript
import twilio from 'twilio'
import type Redis from 'ioredis'
import { RedisKey } from './redis-keys'

const OTP_SEND_LIMIT = 3
const OTP_SEND_WINDOW_SECONDS = 3600 // 1 hour
const OTP_MAX_ATTEMPTS = 3
const OTP_LOCK_SECONDS = 300 // 5 minutes

function getTwilioClient() {
  return twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)
}

export async function checkOtpRateLimit(redis: Redis, phone: string): Promise<boolean> {
  const key = RedisKey.rateLimitOtpSend(phone)
  const count = await redis.get(key)
  return count === null || parseInt(count, 10) < OTP_SEND_LIMIT
}

export async function recordOtpSend(redis: Redis, phone: string): Promise<void> {
  const key = RedisKey.rateLimitOtpSend(phone)
  await redis.incr(key)
  await redis.expire(key, OTP_SEND_WINDOW_SECONDS)
}

export async function sendOtp(phone: string): Promise<void> {
  const client = getTwilioClient()
  await client.verify.v2
    .services(process.env.TWILIO_VERIFY_SERVICE_SID!)
    .verifications.create({ to: phone, channel: 'sms' })
}

export interface OtpVerifyResult {
  success: boolean
  locked: boolean
  attemptsRemaining: number
}

export async function verifyOtp(
  redis: Redis,
  phone: string,
  code: string,
  entityId: string,
  role: string
): Promise<OtpVerifyResult> {
  const lockKey = RedisKey.otpLock(role, entityId)
  const isLocked = await redis.get(lockKey)
  if (isLocked) {
    return { success: false, locked: true, attemptsRemaining: 0 }
  }

  const client = getTwilioClient()
  let approved = false
  try {
    const check = await client.verify.v2
      .services(process.env.TWILIO_VERIFY_SERVICE_SID!)
      .verificationChecks.create({ to: phone, code })
    approved = check.status === 'approved'
  } catch {
    approved = false
  }

  if (approved) {
    return { success: true, locked: false, attemptsRemaining: OTP_MAX_ATTEMPTS }
  }

  // Track failed attempts
  const attemptKey = RedisKey.otp(role, entityId)
  const attempts = await redis.incr(attemptKey)
  await redis.expire(attemptKey, 600) // 10-minute window
  const remaining = OTP_MAX_ATTEMPTS - attempts

  if (remaining <= 0) {
    await redis.set(lockKey, '1', 'EX', OTP_LOCK_SECONDS)
    await redis.del(attemptKey)
    return { success: false, locked: true, attemptsRemaining: 0 }
  }

  return { success: false, locked: false, attemptsRemaining: remaining }
}

export async function clearOtpAttempts(redis: Redis, entityId: string, role: string): Promise<void> {
  await redis.del(RedisKey.otp(role, entityId))
}
```

- [ ] **Step 4: Run test — verify it passes**

```bash
npm test -- tests/api/shared/otp.test.ts
```

Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/api/shared/otp.ts tests/api/shared/otp.test.ts
git commit -m "feat: add Twilio OTP send/verify with rate limiting and lockout"
```

---

## Task 8: Customer auth plugin + routes

**Files:**
- Create: `src/api/auth/customer/plugin.ts`, `src/api/auth/customer/service.ts`, `src/api/auth/customer/routes.ts`
- Create: `tests/api/auth/customer.test.ts`
- Modify: `src/api/app.ts`

- [ ] **Step 1: Write failing customer auth tests**

Create `tests/api/auth/customer.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildApp } from '../../../src/api/app'
import type { FastifyInstance } from 'fastify'

// We test with a test app that has mocked prisma + redis
// In tests, prisma/redis plugins are skipped (NODE_ENV=test)
// We inject mocks via app decorators after build

describe('customer auth routes', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    app = await buildApp()

    // Inject mock prisma
    app.decorate('prisma', {
      user: {
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      userSession: { create: vi.fn(), updateMany: vi.fn() },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    } as any)

    // Inject mock redis
    app.decorate('redis', {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue('OK'),
      del: vi.fn().mockResolvedValue(1),
      incr: vi.fn().mockResolvedValue(1),
      expire: vi.fn().mockResolvedValue(1),
      keys: vi.fn().mockResolvedValue([]),
    } as any)
  })

  afterEach(async () => { await app.close() })

  it('POST /api/v1/customer/auth/register returns 200 with valid payload', async () => {
    app.prisma.user.findUnique = vi.fn().mockResolvedValue(null) // email not taken
    app.prisma.user.create = vi.fn().mockResolvedValue({ id: 'u1', email: 'test@example.com' })

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/customer/auth/register',
      payload: {
        email: 'test@example.com',
        password: 'MyPass123!',
        firstName: 'Test',
        lastName: 'User',
        marketingConsent: false,
      },
    })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).message).toContain('email')
  })

  it('POST /api/v1/customer/auth/register returns 409 if email taken', async () => {
    app.prisma.user.findUnique = vi.fn().mockResolvedValue({ id: 'u1' })

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/customer/auth/register',
      payload: {
        email: 'taken@example.com',
        password: 'MyPass123!',
        firstName: 'Test',
        lastName: 'User',
        marketingConsent: false,
      },
    })
    expect(res.statusCode).toBe(409)
    expect(JSON.parse(res.body).error.code).toBe('EMAIL_ALREADY_EXISTS')
  })

  it('POST /api/v1/customer/auth/register returns 400 for weak password', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/customer/auth/register',
      payload: {
        email: 'test@example.com',
        password: 'weak',
        firstName: 'Test',
        lastName: 'User',
        marketingConsent: false,
      },
    })
    expect(res.statusCode).toBe(400)
  })

  it('POST /api/v1/customer/auth/login returns 403 for unverified account', async () => {
    app.prisma.user.findUnique = vi.fn().mockResolvedValue({
      id: 'u1',
      email: 'test@example.com',
      passwordHash: '$2a$12$placeholder',
      emailVerified: false,
      phoneVerified: false,
      status: 'ACTIVE',
    })

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/customer/auth/login',
      payload: {
        email: 'test@example.com',
        password: 'MyPass123!',
        deviceId: '550e8400-e29b-41d4-a716-446655440000',
        deviceType: 'ios',
      },
    })
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('ACCOUNT_NOT_ACTIVE')
  })
})
```

- [ ] **Step 2: Run test — verify it fails**

```bash
npm test -- tests/api/auth/customer.test.ts
```

Expected: FAIL — routes not registered

- [ ] **Step 3: Create `src/api/auth/customer/plugin.ts`**

```typescript
import fp from 'fastify-plugin'
import { FastifyInstance } from 'fastify'
import jwt from '@fastify/jwt'

async function customerAuthPlugin(app: FastifyInstance) {
  await app.register(jwt, {
    secret: process.env.JWT_SECRET_CUSTOMER ?? 'dev-customer-secret',
    namespace: 'customer',
    jwtVerify: 'customerVerify',
    jwtSign: 'customerSign',
  })

  app.decorate('authenticateCustomer', async function (request: any, reply: any) {
    try {
      await request.customerVerify()
    } catch {
      return reply.status(401).send({
        error: { code: 'REFRESH_TOKEN_INVALID', message: 'Unauthorized.', statusCode: 401 },
      })
    }
  })
}

export default fp(customerAuthPlugin, { name: 'customer-auth' })

declare module 'fastify' {
  interface FastifyInstance {
    authenticateCustomer: (request: any, reply: any) => Promise<void>
  }
}
```

- [ ] **Step 4: Create `src/api/auth/customer/service.ts`**

```typescript
import { PrismaClient } from '../../../generated/prisma/client'
import type Redis from 'ioredis'
import { hashPassword, verifyPassword, validatePasswordPolicy } from '../../shared/password'
import { generateRefreshToken, hashRefreshToken, generateSessionId, generateSecureToken } from '../../shared/tokens'
import { AppError } from '../../shared/errors'
import { RedisKey } from '../../shared/redis-keys'
import {
  storeRefreshToken,
  revokeAllSessionsForEntity,
  revokeAllUserSessionRecords,
  writeUserSession,
  getActiveMobileSessionId,
  setActiveMobileSession,
  revokeRefreshToken,
  revokeUserSessionRecord,
  validateRefreshToken,
} from '../../shared/session'
import { writeAuditLog } from '../../shared/audit'

const EMAIL_VERIFY_TTL = 86400       // 24 hours
const PWD_RESET_TTL = 3600           // 1 hour
const REFRESH_TOKEN_TTL = 7776000    // 90 days
const ACCESS_TOKEN_TTL = '15m'

export interface LoginContext {
  ipAddress: string
  userAgent: string
  deviceId: string
  deviceType: string
  deviceName?: string
}

export async function registerCustomer(
  prisma: PrismaClient,
  redis: Redis,
  data: { email: string; password: string; firstName: string; lastName: string; marketingConsent: boolean }
): Promise<{ message: string }> {
  if (!validatePasswordPolicy(data.password)) {
    throw new AppError('PASSWORD_POLICY_VIOLATION')
  }

  const existing = await prisma.user.findUnique({ where: { email: data.email } })
  if (existing) throw new AppError('EMAIL_ALREADY_EXISTS')

  const passwordHash = await hashPassword(data.password)
  const user = await prisma.user.create({
    data: {
      email:             data.email,
      passwordHash,
      firstName:         data.firstName,
      lastName:          data.lastName,
      newsletterConsent: data.marketingConsent,
      marketingConsentAt: data.marketingConsent ? new Date() : null,
      emailVerified:     false,
      phoneVerified:     false,
      status:            'INACTIVE',
    },
  })

  // Store email verification token
  const token = generateSecureToken(32)
  await redis.set(RedisKey.emailVerify(token), user.id, 'EX', EMAIL_VERIFY_TTL)

  // TODO in Phase 3: send email via Resend — for now log token
  console.info(`[dev] Email verify token for ${user.email}: ${token}`)

  return { message: 'Check your email to verify your account.' }
}

export async function verifyEmail(
  prisma: PrismaClient,
  redis: Redis,
  token: string
): Promise<{ message: string }> {
  const userId = await redis.get(RedisKey.emailVerify(token))
  if (!userId) throw new AppError('VERIFICATION_TOKEN_INVALID')

  await prisma.user.update({
    where: { id: userId },
    data:  { emailVerified: true },
  })
  await redis.del(RedisKey.emailVerify(token))

  return { message: 'Email verified. Please add and verify your phone number.' }
}

export async function sendPhoneVerification(
  prisma: PrismaClient,
  redis: Redis,
  userId: string,
  phone: string
): Promise<{ message: string }> {
  // Check phone not already used
  const existing = await prisma.user.findUnique({ where: { phone } })
  if (existing && existing.id !== userId) throw new AppError('PHONE_ALREADY_EXISTS')

  // Check rate limit
  const { checkOtpRateLimit, recordOtpSend, sendOtp } = await import('../../shared/otp')
  const allowed = await checkOtpRateLimit(redis, phone)
  if (!allowed) throw new AppError('OTP_MAX_ATTEMPTS')

  await sendOtp(phone)
  await recordOtpSend(redis, phone)

  // Store pending phone for this user
  await redis.set(RedisKey.phoneVerifyPending(userId), phone, 'EX', 600)

  return { message: 'A verification code has been sent to your phone.' }
}

export async function confirmPhoneVerification(
  prisma: PrismaClient,
  redis: Redis,
  userId: string,
  code: string
): Promise<{ message: string }> {
  const { verifyOtp } = await import('../../shared/otp')

  const pendingPhone = await redis.get(RedisKey.phoneVerifyPending(userId))
  if (!pendingPhone) throw new AppError('OTP_EXPIRED')

  const result = await verifyOtp(redis, pendingPhone, code, userId, 'customer')
  if (result.locked) throw new AppError('OTP_MAX_ATTEMPTS')
  if (!result.success) throw new AppError('OTP_INVALID')

  await prisma.user.update({
    where: { id: userId },
    data:  { phone: pendingPhone, phoneVerified: true, status: 'ACTIVE' },
  })
  await redis.del(RedisKey.phoneVerifyPending(userId))

  return { message: 'Phone verified. Your account is now active.' }
}

export async function loginCustomer(
  prisma: PrismaClient,
  redis: Redis,
  app: any,
  data: { email: string; password: string } & LoginContext
): Promise<{ accessToken: string; refreshToken: string; user: object }> {
  const user = await prisma.user.findUnique({ where: { email: data.email } })

  if (!user || !user.passwordHash) {
    throw new AppError('INVALID_CREDENTIALS')
  }

  const valid = await verifyPassword(data.password, user.passwordHash)
  if (!valid) {
    writeAuditLog(prisma, {
      entityId: user.id, entityType: 'customer', event: 'AUTH_LOGIN_FAILED',
      ipAddress: data.ipAddress, userAgent: data.userAgent,
    })
    throw new AppError('INVALID_CREDENTIALS')
  }

  if (user.status === 'INACTIVE') throw new AppError('ACCOUNT_NOT_ACTIVE')
  if (user.status === 'SUSPENDED') throw new AppError('ACCOUNT_SUSPENDED')
  if (user.status === 'DELETED') throw new AppError('INVALID_CREDENTIALS')

  // Enforce single mobile session
  if (data.deviceType === 'ios' || data.deviceType === 'android') {
    const prevSessionId = await getActiveMobileSessionId(redis, 'customer', user.id)
    if (prevSessionId) {
      await revokeRefreshToken(redis, { role: 'customer', entityId: user.id, sessionId: prevSessionId })
      await revokeUserSessionRecord(prisma, { sessionId: prevSessionId, reason: 'SUPERSEDED_BY_NEW_LOGIN' })
    }
  }

  const sessionId   = generateSessionId()
  const rawRefresh  = generateRefreshToken()
  const tokenHash   = hashRefreshToken(rawRefresh)

  await storeRefreshToken(redis, {
    role: 'customer', entityId: user.id, sessionId,
    tokenHash, deviceId: data.deviceId, deviceType: data.deviceType, deviceName: data.deviceName,
  })

  if (data.deviceType === 'ios' || data.deviceType === 'android') {
    await setActiveMobileSession(redis, 'customer', user.id, sessionId)
  }

  await writeUserSession(prisma, {
    entityId: user.id, entityType: 'customer', sessionId,
    deviceId: data.deviceId, deviceType: data.deviceType, deviceName: data.deviceName,
    ipAddress: data.ipAddress, userAgent: data.userAgent,
  })

  // Cache permission data
  await redis.set(
    RedisKey.authCustomer(user.id),
    JSON.stringify({ subscriptionStatus: null, isActive: true }),
    'EX', 3600
  )

  const accessToken = app.customerSign(
    { sub: user.id, role: 'customer', deviceId: data.deviceId, sessionId },
    { expiresIn: ACCESS_TOKEN_TTL }
  )

  writeAuditLog(prisma, {
    entityId: user.id, entityType: 'customer', event: 'AUTH_LOGIN_SUCCESS',
    ipAddress: data.ipAddress, userAgent: data.userAgent,
    deviceId: data.deviceId, sessionId,
  })

  return {
    accessToken,
    refreshToken: rawRefresh,
    user: { id: user.id, email: user.email, firstName: user.firstName },
  }
}

export async function refreshCustomerToken(
  prisma: PrismaClient,
  redis: Redis,
  app: any,
  data: { refreshToken: string; sessionId: string; entityId: string; ipAddress: string; userAgent: string }
): Promise<{ accessToken: string; refreshToken: string }> {
  const key = RedisKey.refreshToken('customer', data.entityId, data.sessionId)
  const stored = await redis.get(key)

  if (!stored || !validateRefreshToken(stored, data.refreshToken)) {
    writeAuditLog(prisma, {
      entityId: data.entityId, entityType: 'customer', event: 'AUTH_REFRESH_FAILED',
      ipAddress: data.ipAddress, userAgent: data.userAgent,
    })
    throw new AppError('REFRESH_TOKEN_INVALID')
  }

  const parsed = JSON.parse(stored)
  await redis.del(key)

  const newRefresh  = generateRefreshToken()
  const newHash     = hashRefreshToken(newRefresh)

  await storeRefreshToken(redis, {
    role: 'customer', entityId: data.entityId, sessionId: data.sessionId,
    tokenHash: newHash, deviceId: parsed.deviceId, deviceType: parsed.deviceType,
  })

  // Update lastActiveAt
  await prisma.userSession.updateMany({
    where: { sessionId: data.sessionId },
    data:  { lastActiveAt: new Date() },
  })

  const accessToken = app.customerSign(
    { sub: data.entityId, role: 'customer', deviceId: parsed.deviceId, sessionId: data.sessionId },
    { expiresIn: ACCESS_TOKEN_TTL }
  )

  return { accessToken, refreshToken: newRefresh }
}

export async function logoutCustomer(
  prisma: PrismaClient,
  redis: Redis,
  data: { entityId: string; sessionId: string; ipAddress: string; userAgent: string }
): Promise<void> {
  await revokeRefreshToken(redis, { role: 'customer', entityId: data.entityId, sessionId: data.sessionId })
  await revokeUserSessionRecord(prisma, { sessionId: data.sessionId, reason: 'USER_LOGOUT' })
  await redis.del(RedisKey.authCustomer(data.entityId))

  writeAuditLog(prisma, {
    entityId: data.entityId, entityType: 'customer', event: 'AUTH_LOGOUT',
    ipAddress: data.ipAddress, userAgent: data.userAgent, sessionId: data.sessionId,
  })
}

export async function forgotPasswordCustomer(
  prisma: PrismaClient,
  redis: Redis,
  email: string
): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) return // no enumeration — silently return

  const token = generateSecureToken(32)
  await redis.set(RedisKey.passwordReset('customer', token), user.id, 'EX', PWD_RESET_TTL)

  // TODO Phase 3: send email via Resend
  console.info(`[dev] Password reset token for ${user.email}: ${token}`)
}

export async function resetPasswordCustomer(
  prisma: PrismaClient,
  redis: Redis,
  data: { token: string; newPassword: string; ipAddress: string; userAgent: string }
): Promise<void> {
  if (!validatePasswordPolicy(data.newPassword)) throw new AppError('PASSWORD_POLICY_VIOLATION')

  const key    = RedisKey.passwordReset('customer', data.token)
  const userId = await redis.get(key)
  if (!userId) throw new AppError('RESET_TOKEN_EXPIRED')

  const passwordHash = await hashPassword(data.newPassword)
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } })
  await redis.del(key)

  await revokeAllSessionsForEntity(redis, { role: 'customer', entityId: userId })
  await revokeAllUserSessionRecords(prisma, { entityId: userId, entityType: 'customer', reason: 'PASSWORD_RESET' })
  await redis.del(RedisKey.authCustomer(userId))

  writeAuditLog(prisma, {
    entityId: userId, entityType: 'customer', event: 'AUTH_PASSWORD_RESET',
    ipAddress: data.ipAddress, userAgent: data.userAgent,
  })
}
```

- [ ] **Step 5: Create `src/api/auth/customer/routes.ts`**

```typescript
import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { emailSchema, passwordSchema, phoneSchema, deviceSchema, otpCodeSchema } from '../../shared/schemas'
import {
  registerCustomer, verifyEmail, sendPhoneVerification, confirmPhoneVerification,
  loginCustomer, refreshCustomerToken, logoutCustomer,
  forgotPasswordCustomer, resetPasswordCustomer,
} from './service'

export async function customerAuthRoutes(app: FastifyInstance) {
  const prefix = '/api/v1/customer/auth'

  // Register
  app.post(`${prefix}/register`, async (req, reply) => {
    const body = z.object({
      email:             emailSchema,
      password:          passwordSchema,
      firstName:         z.string().min(1).max(50),
      lastName:          z.string().min(1).max(50),
      marketingConsent:  z.boolean().default(false),
    }).parse(req.body)

    const result = await registerCustomer(app.prisma, app.redis, body)
    return reply.send(result)
  })

  // Verify email
  app.get(`${prefix}/verify-email`, async (req, reply) => {
    const { token } = z.object({ token: z.string().min(1) }).parse(req.query)
    const result = await verifyEmail(app.prisma, app.redis, token)
    return reply.send(result)
  })

  // Send phone OTP
  app.post(`${prefix}/verify-phone/send`, async (req, reply) => {
    const body = z.object({ phoneNumber: phoneSchema, userId: z.string() }).parse(req.body)
    const result = await sendPhoneVerification(app.prisma, app.redis, body.userId, body.phoneNumber)
    return reply.send(result)
  })

  // Confirm phone OTP
  app.post(`${prefix}/verify-phone/confirm`, async (req, reply) => {
    const body = z.object({ userId: z.string(), code: otpCodeSchema }).parse(req.body)
    const result = await confirmPhoneVerification(app.prisma, app.redis, body.userId, body.code)
    return reply.send(result)
  })

  // Login
  app.post(`${prefix}/login`, {
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
  }, async (req, reply) => {
    const body = z.object({
      email:    emailSchema,
      password: z.string(),
      ...deviceSchema.shape,
    }).parse(req.body)

    const result = await loginCustomer(app.prisma, app.redis, app, {
      ...body,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.send(result)
  })

  // Refresh token
  app.post(`${prefix}/refresh`, async (req, reply) => {
    const body = z.object({
      refreshToken: z.string(),
      sessionId:    z.string(),
      entityId:     z.string(),
    }).parse(req.body)

    const result = await refreshCustomerToken(app.prisma, app.redis, app, {
      ...body,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.send(result)
  })

  // Logout
  app.post(`${prefix}/logout`, {
    preHandler: [app.authenticateCustomer],
  }, async (req: any, reply) => {
    await logoutCustomer(app.prisma, app.redis, {
      entityId:  req.user.sub,
      sessionId: req.user.sessionId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.send({ message: 'Logged out.' })
  })

  // Forgot password
  app.post(`${prefix}/forgot-password`, {
    config: { rateLimit: { max: 3, timeWindow: '1 hour' } },
  }, async (req, reply) => {
    const { email } = z.object({ email: emailSchema }).parse(req.body)
    await forgotPasswordCustomer(app.prisma, app.redis, email)
    return reply.send({ message: 'If that email is registered, a reset link has been sent.' })
  })

  // Reset password
  app.post(`${prefix}/reset-password`, async (req, reply) => {
    const body = z.object({ token: z.string(), newPassword: passwordSchema }).parse(req.body)
    await resetPasswordCustomer(app.prisma, app.redis, {
      ...body,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.send({ message: 'Password updated. Please log in again.' })
  })
}
```

- [ ] **Step 6: Register customer auth routes in `src/api/app.ts`**

Add imports and registration to `buildApp()`:
```typescript
// Add after existing imports:
import customerAuthPlugin from './auth/customer/plugin'
import { customerAuthRoutes } from './auth/customer/routes'

// Add inside buildApp(), after rate-limit registration:
await app.register(customerAuthPlugin)
await app.register(customerAuthRoutes)
```

- [ ] **Step 7: Run customer auth tests**

```bash
npm test -- tests/api/auth/customer.test.ts
```

Expected: PASS (4 tests)

- [ ] **Step 8: Add SSO stub routes and account lifecycle routes to `src/api/auth/customer/routes.ts`**

Add these routes inside `customerAuthRoutes`, after the reset-password route:

```typescript
  // SSO — Google (stub; full implementation requires Google client credentials in Phase 3)
  app.post(`${prefix}/sso/google`, async (_req, reply) => {
    return reply.status(501).send({ error: { code: 'NOT_IMPLEMENTED', message: 'Google SSO coming in Phase 3.', statusCode: 501 } })
  })

  // SSO — Apple (stub)
  app.post(`${prefix}/sso/apple`, async (_req, reply) => {
    return reply.status(501).send({ error: { code: 'NOT_IMPLEMENTED', message: 'Apple SSO coming in Phase 3.', statusCode: 501 } })
  })

  // Resend verification email
  app.post(`${prefix}/resend-verification-email`, async (req, reply) => {
    const { email } = z.object({ email: emailSchema }).parse(req.body)
    const user = await app.prisma.user.findUnique({ where: { email } })
    if (user && !user.emailVerified) {
      const { generateSecureToken } = await import('../../shared/tokens')
      const { RedisKey } = await import('../../shared/redis-keys')
      const token = generateSecureToken(32)
      await app.redis.set(RedisKey.emailVerify(token), user.id, 'EX', 86400)
      console.info(`[dev] Resend email verify token for ${user.email}: ${token}`)
    }
    return reply.send({ message: 'If your email is unverified, a new link has been sent.' })
  })

  // Request OTP for sensitive account action
  app.post(`${prefix}/otp/send`, { preHandler: [app.authenticateCustomer] }, async (req: any, reply) => {
    const { action } = z.object({ action: z.enum(['EMAIL_CHANGE', 'PHONE_CHANGE', 'ACCOUNT_DELETION']) }).parse(req.body)
    const user = await app.prisma.user.findUnique({ where: { id: req.user.sub } })
    if (!user?.phone) return reply.status(400).send({ error: { code: 'PHONE_NOT_VERIFIED', message: 'No verified phone on file.', statusCode: 400 } })

    const { sendOtp, checkOtpRateLimit, recordOtpSend } = await import('../../shared/otp')
    const { RedisKey } = await import('../../shared/redis-keys')
    const allowed = await checkOtpRateLimit(app.redis, user.phone)
    if (!allowed) throw new AppError('OTP_MAX_ATTEMPTS')
    await sendOtp(user.phone)
    await recordOtpSend(app.redis, user.phone)
    await app.redis.set(RedisKey.otp('customer', req.user.sub), action, 'EX', 600)
    return reply.send({ message: 'Code sent to your verified phone number.' })
  })

  // Verify OTP for sensitive account action — returns actionToken
  app.post(`${prefix}/otp/verify`, { preHandler: [app.authenticateCustomer] }, async (req: any, reply) => {
    const { code } = z.object({ code: z.string().length(6) }).parse(req.body)
    const { verifyOtp } = await import('../../shared/otp')
    const { RedisKey } = await import('../../shared/redis-keys')
    const { generateSecureToken } = await import('../../shared/tokens')
    const user = await app.prisma.user.findUnique({ where: { id: req.user.sub } })
    if (!user?.phone) throw new AppError('PHONE_NOT_VERIFIED')

    const action = await app.redis.get(RedisKey.otp('customer', req.user.sub))
    const result = await verifyOtp(app.redis, user.phone, code, req.user.sub, 'customer')
    if (result.locked) throw new AppError('OTP_MAX_ATTEMPTS')
    if (!result.success) throw new AppError('OTP_INVALID')

    const actionToken = generateSecureToken(16)
    await app.redis.set(RedisKey.otpAction(req.user.sub, action ?? 'unknown'), actionToken, 'EX', 300)
    await app.redis.del(RedisKey.otp('customer', req.user.sub))

    return reply.send({ verified: true, actionToken, action })
  })

  // Account deletion
  app.post(`${prefix}/delete-account`, { preHandler: [app.authenticateCustomer] }, async (req: any, reply) => {
    const { actionToken } = z.object({ actionToken: z.string() }).parse(req.body)
    const { RedisKey } = await import('../../shared/redis-keys')
    const storedToken = await app.redis.get(RedisKey.otpAction(req.user.sub, 'ACCOUNT_DELETION'))
    if (!storedToken || storedToken !== actionToken) throw new AppError('ACTION_TOKEN_INVALID')
    await app.redis.del(RedisKey.otpAction(req.user.sub, 'ACCOUNT_DELETION'))

    const anonymisedEmail = `deleted_${req.user.sub}@deleted.redeemo.com`
    await app.prisma.user.update({
      where: { id: req.user.sub },
      data: {
        email: anonymisedEmail, phone: null, firstName: '[Deleted]', lastName: '[Deleted]',
        passwordHash: null, deletedAt: new Date(), status: 'DELETED',
      },
    })

    const { revokeAllSessionsForEntity, revokeAllUserSessionRecords } = await import('../../shared/session')
    await revokeAllSessionsForEntity(app.redis, { role: 'customer', entityId: req.user.sub })
    await revokeAllUserSessionRecords(app.prisma, { entityId: req.user.sub, entityType: 'customer', reason: 'ACCOUNT_DELETED' })
    await app.redis.del(RedisKey.authCustomer(req.user.sub))

    writeAuditLog(app.prisma, { entityId: req.user.sub, entityType: 'customer', event: 'AUTH_ACCOUNT_DELETED', ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '', sessionId: req.user.sessionId })

    return reply.send({ message: 'Your account has been deleted.' })
  })
```

Add the missing imports at the top of `src/api/auth/customer/routes.ts`:
```typescript
import { AppError } from '../../shared/errors'
import { writeAuditLog } from '../../shared/audit'
```

- [ ] **Step 9: Commit**

```bash
git add src/api/auth/customer/ tests/api/auth/customer.test.ts src/api/app.ts
git commit -m "feat: add customer auth routes — register, verify email/phone, login, refresh, logout, password reset, SSO stubs, OTP actions, account deletion"
```

---

## Task 9: Merchant auth plugin + routes

**Files:**
- Create: `src/api/auth/merchant/plugin.ts`, `src/api/auth/merchant/service.ts`, `src/api/auth/merchant/routes.ts`
- Create: `tests/api/auth/merchant.test.ts`
- Modify: `src/api/app.ts`

- [ ] **Step 1: Write failing merchant auth tests**

Create `tests/api/auth/merchant.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildApp } from '../../../src/api/app'
import type { FastifyInstance } from 'fastify'

describe('merchant auth routes', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    app = await buildApp()
    app.decorate('prisma', {
      merchantAdmin: { findUnique: vi.fn(), update: vi.fn() },
      userSession: { create: vi.fn(), updateMany: vi.fn() },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    } as any)
    app.decorate('redis', {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue('OK'),
      del: vi.fn().mockResolvedValue(1),
      keys: vi.fn().mockResolvedValue([]),
    } as any)
  })

  afterEach(async () => { await app.close() })

  it('POST /api/v1/merchant/auth/login returns 401 for unknown email', async () => {
    app.prisma.merchantAdmin.findUnique = vi.fn().mockResolvedValue(null)

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/auth/login',
      payload: {
        email: 'unknown@merchant.com',
        password: 'MyPass123!',
        deviceId: '550e8400-e29b-41d4-a716-446655440000',
        deviceType: 'web',
      },
    })
    expect(res.statusCode).toBe(401)
    expect(JSON.parse(res.body).error.code).toBe('INVALID_CREDENTIALS')
  })

  it('POST /api/v1/merchant/auth/login returns OTP_REQUIRED for first login', async () => {
    const { hashPassword } = await import('../../../src/api/shared/password')
    const hash = await hashPassword('MyPass123!')

    app.prisma.merchantAdmin.findUnique = vi.fn().mockResolvedValue({
      id: 'ma1',
      email: 'merchant@example.com',
      passwordHash: hash,
      otpVerifiedAt: null,
      status: 'ACTIVE',
      merchant: { id: 'm1', status: 'ACTIVE', businessName: 'Test Co' },
    })

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/auth/login',
      payload: {
        email: 'merchant@example.com',
        password: 'MyPass123!',
        deviceId: '550e8400-e29b-41d4-a716-446655440000',
        deviceType: 'web',
      },
    })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).status).toBe('OTP_REQUIRED')
  })

  it('POST /api/v1/merchant/auth/login returns 403 for suspended merchant', async () => {
    app.prisma.merchantAdmin.findUnique = vi.fn().mockResolvedValue({
      id: 'ma1', passwordHash: 'hash', otpVerifiedAt: new Date(), status: 'ACTIVE',
      merchant: { id: 'm1', status: 'SUSPENDED', businessName: 'Test Co' },
    })

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/auth/login',
      payload: {
        email: 'merchant@example.com',
        password: 'MyPass123!',
        deviceId: '550e8400-e29b-41d4-a716-446655440000',
        deviceType: 'web',
      },
    })
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('MERCHANT_SUSPENDED')
  })
})
```

- [ ] **Step 2: Run test — verify it fails**

```bash
npm test -- tests/api/auth/merchant.test.ts
```

Expected: FAIL — routes not registered

- [ ] **Step 3: Create `src/api/auth/merchant/plugin.ts`**

```typescript
import fp from 'fastify-plugin'
import { FastifyInstance } from 'fastify'
import jwt from '@fastify/jwt'

async function merchantAuthPlugin(app: FastifyInstance) {
  await app.register(jwt, {
    secret: process.env.JWT_SECRET_MERCHANT ?? 'dev-merchant-secret',
    namespace: 'merchant',
    jwtVerify: 'merchantVerify',
    jwtSign: 'merchantSign',
  })

  app.decorate('authenticateMerchant', async function (request: any, reply: any) {
    try {
      await request.merchantVerify()
    } catch {
      return reply.status(401).send({
        error: { code: 'REFRESH_TOKEN_INVALID', message: 'Unauthorized.', statusCode: 401 },
      })
    }
  })
}

export default fp(merchantAuthPlugin, { name: 'merchant-auth' })

declare module 'fastify' {
  interface FastifyInstance {
    authenticateMerchant: (request: any, reply: any) => Promise<void>
  }
}
```

- [ ] **Step 4: Create `src/api/auth/merchant/service.ts`**

```typescript
import { PrismaClient } from '../../../generated/prisma/client'
import type Redis from 'ioredis'
import { verifyPassword, validatePasswordPolicy, hashPassword } from '../../shared/password'
import { generateRefreshToken, hashRefreshToken, generateSessionId, generateSecureToken } from '../../shared/tokens'
import { AppError } from '../../shared/errors'
import { RedisKey } from '../../shared/redis-keys'
import {
  storeRefreshToken, revokeRefreshToken, revokeAllSessionsForEntity,
  revokeAllUserSessionRecords, writeUserSession, validateRefreshToken,
} from '../../shared/session'
import { writeAuditLog } from '../../shared/audit'

const OTP_CHALLENGE_TTL = 600   // 10 minutes
const PWD_RESET_TTL     = 3600
const ACCESS_TOKEN_TTL  = '15m'

function otpRequired(admin: any, deviceId: string, knownDevices: string[]): boolean {
  if (!admin.otpVerifiedAt) return true                       // first ever login
  if (!knownDevices.includes(deviceId)) return true           // new device
  return false
}

export async function loginMerchant(
  prisma: PrismaClient,
  redis: Redis,
  app: any,
  data: { email: string; password: string; deviceId: string; deviceType: string; deviceName?: string; ipAddress: string; userAgent: string }
): Promise<{ accessToken?: string; refreshToken?: string; merchant?: object; status?: string; sessionChallenge?: string }> {
  const admin = await prisma.merchantAdmin.findUnique({
    where:   { email: data.email },
    include: { merchant: true },
  })

  if (!admin || !admin.passwordHash) throw new AppError('INVALID_CREDENTIALS')

  const valid = await verifyPassword(data.password, admin.passwordHash)
  if (!valid) {
    writeAuditLog(prisma, { entityId: admin.id, entityType: 'merchant', event: 'AUTH_LOGIN_FAILED', ipAddress: data.ipAddress, userAgent: data.userAgent })
    throw new AppError('INVALID_CREDENTIALS')
  }

  if ((admin.merchant as any).status === 'SUSPENDED') throw new AppError('MERCHANT_SUSPENDED')
  if ((admin.merchant as any).status === 'INACTIVE')  throw new AppError('MERCHANT_DEACTIVATED')
  if (admin.status === 'SUSPENDED') throw new AppError('ACCOUNT_SUSPENDED')

  // Check known devices (stored as JSON list in Redis)
  const knownRaw = await redis.get(`known-devices:merchant:${admin.id}`)
  const knownDevices: string[] = knownRaw ? JSON.parse(knownRaw) : []

  if (otpRequired(admin, data.deviceId, knownDevices)) {
    const challenge = generateSecureToken(16)
    await redis.set(
      RedisKey.otpChallenge('merchant', challenge),
      JSON.stringify({ adminId: admin.id, deviceId: data.deviceId, deviceType: data.deviceType }),
      'EX', OTP_CHALLENGE_TTL
    )
    // TODO Phase 3: send OTP via Twilio
    console.info(`[dev] OTP challenge created for ${admin.email}: ${challenge}`)
    return { status: 'OTP_REQUIRED', sessionChallenge: challenge }
  }

  return completeMerchantLogin(prisma, redis, app, admin, data, knownDevices)
}

export async function verifyMerchantOtp(
  prisma: PrismaClient,
  redis: Redis,
  app: any,
  data: { sessionChallenge: string; code: string; ipAddress: string; userAgent: string }
): Promise<{ accessToken: string; refreshToken: string; merchant: object }> {
  const raw = await redis.get(RedisKey.otpChallenge('merchant', data.sessionChallenge))
  if (!raw) throw new AppError('ACTION_TOKEN_INVALID')

  const { adminId, deviceId, deviceType } = JSON.parse(raw) as { adminId: string; deviceId: string; deviceType: string }
  await redis.del(RedisKey.otpChallenge('merchant', data.sessionChallenge))

  const admin = await prisma.merchantAdmin.findUnique({
    where: { id: adminId }, include: { merchant: true },
  })
  if (!admin) throw new AppError('INVALID_CREDENTIALS')

  // Verify OTP via Twilio
  const { verifyOtp, clearOtpAttempts } = await import('../../shared/otp')
  const phone = admin.phone ?? ''
  const result = await verifyOtp(redis, phone, data.code, admin.id, 'merchant')

  if (result.locked) throw new AppError('OTP_MAX_ATTEMPTS')
  if (!result.success) throw new AppError('OTP_INVALID')

  await clearOtpAttempts(redis, admin.id, 'merchant')

  // Mark OTP verified + add device
  await prisma.merchantAdmin.update({
    where: { id: admin.id },
    data: { otpVerifiedAt: new Date() },
  })

  const knownRaw = await redis.get(`known-devices:merchant:${admin.id}`)
  const knownDevices: string[] = knownRaw ? JSON.parse(knownRaw) : []
  if (!knownDevices.includes(deviceId)) knownDevices.push(deviceId)
  await redis.set(`known-devices:merchant:${admin.id}`, JSON.stringify(knownDevices), 'EX', 7776000)

  return completeMerchantLogin(prisma, redis, app, admin, {
    deviceId, deviceType, ipAddress: data.ipAddress, userAgent: data.userAgent,
  }, knownDevices)
}

async function completeMerchantLogin(
  prisma: PrismaClient,
  redis: Redis,
  app: any,
  admin: any,
  data: { deviceId: string; deviceType: string; deviceName?: string; ipAddress: string; userAgent: string },
  _knownDevices: string[]
): Promise<{ accessToken: string; refreshToken: string; merchant: object }> {
  const sessionId  = generateSessionId()
  const rawRefresh = generateRefreshToken()
  const tokenHash  = hashRefreshToken(rawRefresh)

  await storeRefreshToken(redis, {
    role: 'merchant', entityId: admin.id, sessionId,
    tokenHash, deviceId: data.deviceId, deviceType: data.deviceType,
  })

  await writeUserSession(prisma, {
    entityId: admin.id, entityType: 'merchant', sessionId,
    deviceId: data.deviceId, deviceType: data.deviceType,
    ipAddress: data.ipAddress, userAgent: data.userAgent,
  })

  await redis.set(
    RedisKey.authMerchant(admin.id),
    JSON.stringify({
      merchantId: admin.merchantId,
      approvalStatus: (admin.merchant as any).status,
      isSuspended: (admin.merchant as any).status === 'SUSPENDED',
    }),
    'EX', 3600
  )

  const accessToken = app.merchantSign(
    { sub: admin.id, role: 'merchant', deviceId: data.deviceId, sessionId },
    { expiresIn: ACCESS_TOKEN_TTL }
  )

  writeAuditLog(prisma, {
    entityId: admin.id, entityType: 'merchant', event: 'AUTH_LOGIN_SUCCESS',
    ipAddress: data.ipAddress, userAgent: data.userAgent, sessionId,
  })

  return {
    accessToken,
    refreshToken: rawRefresh,
    merchant: {
      id: admin.merchantId,
      businessName: (admin.merchant as any).businessName,
      approvalStatus: (admin.merchant as any).status,
    },
  }
}

export async function refreshMerchantToken(
  prisma: PrismaClient,
  redis: Redis,
  app: any,
  data: { refreshToken: string; sessionId: string; entityId: string; ipAddress: string; userAgent: string }
): Promise<{ accessToken: string; refreshToken: string }> {
  const key    = RedisKey.refreshToken('merchant', data.entityId, data.sessionId)
  const stored = await redis.get(key)

  if (!stored || !validateRefreshToken(stored, data.refreshToken)) {
    writeAuditLog(prisma, { entityId: data.entityId, entityType: 'merchant', event: 'AUTH_REFRESH_FAILED', ipAddress: data.ipAddress, userAgent: data.userAgent })
    throw new AppError('REFRESH_TOKEN_INVALID')
  }

  const parsed     = JSON.parse(stored)
  await redis.del(key)

  const newRefresh = generateRefreshToken()
  const newHash    = hashRefreshToken(newRefresh)

  await storeRefreshToken(redis, {
    role: 'merchant', entityId: data.entityId, sessionId: data.sessionId,
    tokenHash: newHash, deviceId: parsed.deviceId, deviceType: parsed.deviceType,
  })

  await prisma.userSession.updateMany({
    where: { sessionId: data.sessionId },
    data:  { lastActiveAt: new Date() },
  })

  const accessToken = app.merchantSign(
    { sub: data.entityId, role: 'merchant', deviceId: parsed.deviceId, sessionId: data.sessionId },
    { expiresIn: ACCESS_TOKEN_TTL }
  )

  return { accessToken, refreshToken: newRefresh }
}

export async function logoutMerchant(
  prisma: PrismaClient,
  redis: Redis,
  data: { entityId: string; sessionId: string; ipAddress: string; userAgent: string }
): Promise<void> {
  await revokeRefreshToken(redis, { role: 'merchant', entityId: data.entityId, sessionId: data.sessionId })
  await redis.del(RedisKey.authMerchant(data.entityId))
  writeAuditLog(prisma, { entityId: data.entityId, entityType: 'merchant', event: 'AUTH_LOGOUT', ipAddress: data.ipAddress, userAgent: data.userAgent, sessionId: data.sessionId })
}

export async function forgotPasswordMerchant(
  prisma: PrismaClient,
  redis: Redis,
  email: string
): Promise<void> {
  const admin = await prisma.merchantAdmin.findUnique({ where: { email } })
  if (!admin) return

  const token = generateSecureToken(32)
  await redis.set(RedisKey.passwordReset('merchant', token), admin.id, 'EX', PWD_RESET_TTL)
  console.info(`[dev] Merchant password reset token for ${admin.email}: ${token}`)
}

export async function resetPasswordMerchant(
  prisma: PrismaClient,
  redis: Redis,
  data: { token: string; newPassword: string; ipAddress: string; userAgent: string }
): Promise<void> {
  if (!validatePasswordPolicy(data.newPassword)) throw new AppError('PASSWORD_POLICY_VIOLATION')

  const key     = RedisKey.passwordReset('merchant', data.token)
  const adminId = await redis.get(key)
  if (!adminId) throw new AppError('RESET_TOKEN_EXPIRED')

  const passwordHash = await hashPassword(data.newPassword)
  await prisma.merchantAdmin.update({ where: { id: adminId }, data: { passwordHash } })
  await redis.del(key)

  await revokeAllSessionsForEntity(redis, { role: 'merchant', entityId: adminId })
  await revokeAllUserSessionRecords(prisma, { entityId: adminId, entityType: 'merchant', reason: 'PASSWORD_RESET' })
  await redis.del(RedisKey.authMerchant(adminId))

  writeAuditLog(prisma, { entityId: adminId, entityType: 'merchant', event: 'AUTH_PASSWORD_RESET', ipAddress: data.ipAddress, userAgent: data.userAgent })
}
```

- [ ] **Step 5: Create `src/api/auth/merchant/routes.ts`**

```typescript
import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { emailSchema, passwordSchema, deviceSchema } from '../../shared/schemas'
import {
  loginMerchant, verifyMerchantOtp, refreshMerchantToken,
  logoutMerchant, forgotPasswordMerchant, resetPasswordMerchant,
} from './service'

export async function merchantAuthRoutes(app: FastifyInstance) {
  const prefix = '/api/v1/merchant/auth'

  app.post(`${prefix}/login`, {
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
  }, async (req, reply) => {
    const body = z.object({
      email:    emailSchema,
      password: z.string(),
      ...deviceSchema.shape,
    }).parse(req.body)

    const result = await loginMerchant(app.prisma, app.redis, app, {
      ...body,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.send(result)
  })

  app.post(`${prefix}/otp/verify`, async (req, reply) => {
    const body = z.object({
      sessionChallenge: z.string(),
      code: z.string().length(6),
    }).parse(req.body)

    const result = await verifyMerchantOtp(app.prisma, app.redis, app, {
      ...body,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.send(result)
  })

  app.post(`${prefix}/refresh`, async (req, reply) => {
    const body = z.object({ refreshToken: z.string(), sessionId: z.string(), entityId: z.string() }).parse(req.body)
    const result = await refreshMerchantToken(app.prisma, app.redis, app, {
      ...body, ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.send(result)
  })

  app.post(`${prefix}/logout`, { preHandler: [app.authenticateMerchant] }, async (req: any, reply) => {
    await logoutMerchant(app.prisma, app.redis, {
      entityId: req.user.sub, sessionId: req.user.sessionId,
      ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.send({ message: 'Logged out.' })
  })

  app.post(`${prefix}/forgot-password`, {
    config: { rateLimit: { max: 3, timeWindow: '1 hour' } },
  }, async (req, reply) => {
    const { email } = z.object({ email: emailSchema }).parse(req.body)
    await forgotPasswordMerchant(app.prisma, app.redis, email)
    return reply.send({ message: 'If that email is registered, a reset link has been sent.' })
  })

  app.post(`${prefix}/reset-password`, async (req, reply) => {
    const body = z.object({ token: z.string(), newPassword: passwordSchema }).parse(req.body)
    await resetPasswordMerchant(app.prisma, app.redis, {
      ...body, ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.send({ message: 'Password updated. Please log in again.' })
  })
}
```

- [ ] **Step 6: Register merchant auth in `src/api/app.ts`**

```typescript
// Add imports:
import merchantAuthPlugin from './auth/merchant/plugin'
import { merchantAuthRoutes } from './auth/merchant/routes'

// Add inside buildApp() after customer registration:
await app.register(merchantAuthPlugin)
await app.register(merchantAuthRoutes)
```

- [ ] **Step 7: Run merchant auth tests**

```bash
npm test -- tests/api/auth/merchant.test.ts
```

Expected: PASS (3 tests)

- [ ] **Step 8: Add merchant deactivate/reactivate routes to `src/api/auth/merchant/routes.ts`**

Add these two routes inside `merchantAuthRoutes`, after the reset-password route:

```typescript
  // Soft-deactivate merchant (self-service)
  app.post(`${prefix}/deactivate`, { preHandler: [app.authenticateMerchant] }, async (req: any, reply) => {
    const admin = await app.prisma.merchantAdmin.findUnique({ where: { id: req.user.sub } })
    if (!admin) throw new AppError('INVALID_CREDENTIALS')

    await app.prisma.merchant.update({
      where: { id: admin.merchantId },
      data:  { status: 'INACTIVE' },
    })

    writeAuditLog(app.prisma, {
      entityId: req.user.sub, entityType: 'merchant', event: 'MERCHANT_DEACTIVATED',
      ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.send({ message: 'Merchant account deactivated.' })
  })

  // Reactivate merchant (self-service, within 30 days)
  app.post(`${prefix}/reactivate`, { preHandler: [app.authenticateMerchant] }, async (req: any, reply) => {
    const admin = await app.prisma.merchantAdmin.findUnique({
      where: { id: req.user.sub }, include: { merchant: true },
    })
    if (!admin) throw new AppError('INVALID_CREDENTIALS')

    const merchant = admin.merchant as any
    if (merchant.status !== 'INACTIVE') {
      return reply.send({ message: 'Merchant account is already active.' })
    }

    await app.prisma.merchant.update({
      where: { id: admin.merchantId },
      data:  { status: 'ACTIVE' },
    })

    writeAuditLog(app.prisma, {
      entityId: req.user.sub, entityType: 'merchant', event: 'MERCHANT_REACTIVATED',
      ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.send({ message: 'Merchant account reactivated.' })
  })
```

Add imports at top of `src/api/auth/merchant/routes.ts`:
```typescript
import { AppError } from '../../shared/errors'
import { writeAuditLog } from '../../shared/audit'
```

- [ ] **Step 9: Commit**

```bash
git add src/api/auth/merchant/ tests/api/auth/merchant.test.ts src/api/app.ts
git commit -m "feat: add merchant auth routes — login with OTP challenge, refresh, logout, password reset, deactivate/reactivate"
```

---

## Task 10: BranchUser provisioning routes (under merchant)

**Files:**
- Create: `src/api/auth/merchant/branch-user.service.ts`, `src/api/auth/merchant/branch-user.routes.ts`
- Modify: `src/api/app.ts`

- [ ] **Step 1: Create `src/api/auth/merchant/branch-user.service.ts`**

```typescript
import { PrismaClient } from '../../../generated/prisma/client'
import type Redis from 'ioredis'
import { hashPassword, validatePasswordPolicy } from '../../shared/password'
import { AppError } from '../../shared/errors'
import { RedisKey } from '../../shared/redis-keys'
import {
  revokeAllSessionsForEntity,
  revokeAllUserSessionRecords,
} from '../../shared/session'
import { writeAuditLog } from '../../shared/audit'
import { generateSecureToken } from '../../shared/tokens'

/** Verify the MerchantAdmin owns the given branch */
async function assertBranchOwnership(
  prisma: PrismaClient,
  merchantAdminId: string,
  branchId: string
): Promise<string> {
  const admin = await prisma.merchantAdmin.findUnique({ where: { id: merchantAdminId } })
  if (!admin) throw new AppError('INVALID_CREDENTIALS')

  const branch = await prisma.branch.findUnique({ where: { id: branchId } })
  if (!branch || branch.merchantId !== admin.merchantId) throw new AppError('BRANCH_NOT_OWNED')

  return admin.merchantId
}

export async function createBranchUser(
  prisma: PrismaClient,
  redis: Redis,
  data: {
    merchantAdminId: string
    branchId: string
    contactName: string
    jobTitle?: string
    contactNumber?: string
    email: string
    password: string
    ipAddress: string
    userAgent: string
  }
): Promise<object> {
  await assertBranchOwnership(prisma, data.merchantAdminId, data.branchId)

  if (!validatePasswordPolicy(data.password)) throw new AppError('PASSWORD_POLICY_VIOLATION')

  const existing = await prisma.branchUser.findUnique({ where: { email: data.email } })
  if (existing) throw new AppError('EMAIL_ALREADY_EXISTS')

  const [firstName, ...rest] = data.contactName.split(' ')
  const lastName = rest.join(' ') || '-'

  const passwordHash = await hashPassword(data.password)
  const branchUser = await prisma.branchUser.create({
    data: {
      branchId:          data.branchId,
      email:             data.email,
      firstName,
      lastName,
      jobTitle:          data.jobTitle,
      phone:             data.contactNumber,
      passwordHash,
      mustChangePassword: true,
      status:            'ACTIVE',
    },
  })

  // TODO Phase 3: send welcome email via Resend
  console.info(`[dev] BranchUser created: ${branchUser.email}, must change password on first login`)

  writeAuditLog(prisma, {
    entityId:   data.merchantAdminId,
    entityType: 'merchant',
    event:      'BRANCH_USER_CREATED',
    ipAddress:  data.ipAddress,
    userAgent:  data.userAgent,
    metadata:   { branchUserId: branchUser.id, branchId: data.branchId },
  })

  return { branchUser: { id: branchUser.id, email: branchUser.email, branchId: data.branchId } }
}

export async function resetBranchUserPassword(
  prisma: PrismaClient,
  redis: Redis,
  data: {
    merchantAdminId: string
    branchId: string
    ipAddress: string
    userAgent: string
  }
): Promise<{ message: string }> {
  await assertBranchOwnership(prisma, data.merchantAdminId, data.branchId)

  const branchUser = await prisma.branchUser.findFirst({ where: { branchId: data.branchId } })
  if (!branchUser) throw new AppError('BRANCH_USER_NOT_FOUND')

  // Generate temp password
  const tempPassword = generateSecureToken(8).slice(0, 12).replace(/[^a-zA-Z0-9]/g, 'x') + 'A1!'
  const passwordHash = await hashPassword(tempPassword)

  await prisma.branchUser.update({
    where: { id: branchUser.id },
    data:  { passwordHash, mustChangePassword: true },
  })

  await revokeAllSessionsForEntity(redis, { role: 'branch', entityId: branchUser.id })
  await revokeAllUserSessionRecords(prisma, { entityId: branchUser.id, entityType: 'branch', reason: 'ADMIN_PASSWORD_RESET' })
  await redis.del(RedisKey.authBranch(branchUser.id))

  // TODO Phase 3: email temp password to branchUser.email via Resend
  console.info(`[dev] Branch user ${branchUser.email} temp password: ${tempPassword}`)

  writeAuditLog(prisma, {
    entityId:   data.merchantAdminId,
    entityType: 'merchant',
    event:      'BRANCH_USER_PASSWORD_RESET',
    ipAddress:  data.ipAddress,
    userAgent:  data.userAgent,
    metadata:   { branchUserId: branchUser.id, branchId: data.branchId },
  })

  return { message: 'Password reset. Branch user must set a new password on next login.' }
}

export async function deactivateBranchUser(
  prisma: PrismaClient,
  redis: Redis,
  data: { merchantAdminId: string; branchId: string; ipAddress: string; userAgent: string }
): Promise<{ message: string }> {
  await assertBranchOwnership(prisma, data.merchantAdminId, data.branchId)

  const branchUser = await prisma.branchUser.findFirst({ where: { branchId: data.branchId } })
  if (!branchUser) throw new AppError('BRANCH_USER_NOT_FOUND')

  await prisma.branchUser.update({ where: { id: branchUser.id }, data: { status: 'INACTIVE' } })

  await revokeAllSessionsForEntity(redis, { role: 'branch', entityId: branchUser.id })
  await revokeAllUserSessionRecords(prisma, { entityId: branchUser.id, entityType: 'branch', reason: 'BRANCH_USER_DEACTIVATED' })
  await redis.del(RedisKey.authBranch(branchUser.id))

  writeAuditLog(prisma, {
    entityId: data.merchantAdminId, entityType: 'merchant', event: 'BRANCH_USER_DEACTIVATED',
    ipAddress: data.ipAddress, userAgent: data.userAgent,
    metadata: { branchUserId: branchUser.id, branchId: data.branchId },
  })

  return { message: 'Branch user deactivated.' }
}

export async function reactivateBranchUser(
  prisma: PrismaClient,
  redis: Redis,
  data: { merchantAdminId: string; branchId: string; ipAddress: string; userAgent: string }
): Promise<{ message: string }> {
  await assertBranchOwnership(prisma, data.merchantAdminId, data.branchId)

  const branchUser = await prisma.branchUser.findFirst({ where: { branchId: data.branchId } })
  if (!branchUser) throw new AppError('BRANCH_USER_NOT_FOUND')

  await prisma.branchUser.update({ where: { id: branchUser.id }, data: { status: 'ACTIVE' } })

  writeAuditLog(prisma, {
    entityId: data.merchantAdminId, entityType: 'merchant', event: 'BRANCH_USER_REACTIVATED',
    ipAddress: data.ipAddress, userAgent: data.userAgent,
    metadata: { branchUserId: branchUser.id },
  })

  return { message: 'Branch user reactivated.' }
}

export async function setBranchPin(
  prisma: PrismaClient,
  data: { merchantAdminId: string; branchId: string; pin: string; ipAddress: string; userAgent: string }
): Promise<{ message: string }> {
  await assertBranchOwnership(prisma, data.merchantAdminId, data.branchId)

  const { hashPassword: hashPin } = await import('../../shared/password')
  const pinHash = await hashPin(data.pin)

  await prisma.branch.update({ where: { id: data.branchId }, data: { redemptionPinHash: pinHash } })

  writeAuditLog(prisma, {
    entityId: data.merchantAdminId, entityType: 'merchant', event: 'BRANCH_PIN_CHANGED',
    ipAddress: data.ipAddress, userAgent: data.userAgent,
    metadata: { branchId: data.branchId },
  })

  return { message: 'Branch PIN updated.' }
}
```

- [ ] **Step 2: Create `src/api/auth/merchant/branch-user.routes.ts`**

```typescript
import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { emailSchema, passwordSchema, pinSchema } from '../../shared/schemas'
import {
  createBranchUser, resetBranchUserPassword, deactivateBranchUser,
  reactivateBranchUser, setBranchPin,
} from './branch-user.service'

export async function branchUserMgmtRoutes(app: FastifyInstance) {
  const prefix = '/api/v1/merchant/branches/:branchId'

  // Create branch user
  app.post(`${prefix}/user`, { preHandler: [app.authenticateMerchant] }, async (req: any, reply) => {
    const { branchId } = z.object({ branchId: z.string() }).parse(req.params)
    const body = z.object({
      contactName:    z.string().min(1).max(100),
      jobTitle:       z.string().max(100).optional(),
      contactNumber:  z.string().optional(),
      email:          emailSchema,
      password:       passwordSchema,
    }).parse(req.body)

    const result = await createBranchUser(app.prisma, app.redis, {
      merchantAdminId: req.user.sub,
      branchId,
      ...body,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.send(result)
  })

  // Reset branch user password
  app.post(`${prefix}/user/reset-password`, { preHandler: [app.authenticateMerchant] }, async (req: any, reply) => {
    const { branchId } = z.object({ branchId: z.string() }).parse(req.params)
    const result = await resetBranchUserPassword(app.prisma, app.redis, {
      merchantAdminId: req.user.sub, branchId,
      ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.send(result)
  })

  // Deactivate branch user
  app.patch(`${prefix}/user/deactivate`, { preHandler: [app.authenticateMerchant] }, async (req: any, reply) => {
    const { branchId } = z.object({ branchId: z.string() }).parse(req.params)
    const result = await deactivateBranchUser(app.prisma, app.redis, {
      merchantAdminId: req.user.sub, branchId,
      ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.send(result)
  })

  // Reactivate branch user
  app.patch(`${prefix}/user/reactivate`, { preHandler: [app.authenticateMerchant] }, async (req: any, reply) => {
    const { branchId } = z.object({ branchId: z.string() }).parse(req.params)
    const result = await reactivateBranchUser(app.prisma, app.redis, {
      merchantAdminId: req.user.sub, branchId,
      ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.send(result)
  })

  // Set branch PIN
  app.patch(`${prefix}/pin`, { preHandler: [app.authenticateMerchant] }, async (req: any, reply) => {
    const { branchId } = z.object({ branchId: z.string() }).parse(req.params)
    const { pin } = z.object({ pin: pinSchema }).parse(req.body)
    const result = await setBranchPin(app.prisma, {
      merchantAdminId: req.user.sub, branchId, pin,
      ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.send(result)
  })
}
```

- [ ] **Step 3: Register branch user mgmt routes in `src/api/app.ts`**

```typescript
// Add imports:
import { branchUserMgmtRoutes } from './auth/merchant/branch-user.routes'

// Add inside buildApp():
await app.register(branchUserMgmtRoutes)
```

- [ ] **Step 4: Write and run branch user provisioning test**

Create `tests/api/auth/branch-user-mgmt.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildApp } from '../../../src/api/app'
import type { FastifyInstance } from 'fastify'

describe('branch user management routes', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    app = await buildApp()

    app.decorate('prisma', {
      merchantAdmin: { findUnique: vi.fn().mockResolvedValue({ id: 'ma1', merchantId: 'm1' }) },
      branch: { findUnique: vi.fn().mockResolvedValue({ id: 'b1', merchantId: 'm1' }), update: vi.fn() },
      branchUser: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: 'bu1', email: 'staff@test.com' }), findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
      userSession: { create: vi.fn(), updateMany: vi.fn() },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    } as any)
    app.decorate('redis', {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue('OK'),
      del: vi.fn().mockResolvedValue(1),
      keys: vi.fn().mockResolvedValue([]),
    } as any)
  })

  afterEach(async () => { await app.close() })

  it('POST /api/v1/merchant/branches/:branchId/user requires auth', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/branches/b1/user',
      payload: { contactName: 'Jane', email: 'j@test.com', password: 'MyPass123!' },
    })
    expect(res.statusCode).toBe(401)
  })
})
```

```bash
npm test -- tests/api/auth/branch-user-mgmt.test.ts
```

Expected: PASS (1 test — auth guard works)

- [ ] **Step 5: Commit**

```bash
git add src/api/auth/merchant/branch-user.service.ts src/api/auth/merchant/branch-user.routes.ts tests/api/auth/branch-user-mgmt.test.ts src/api/app.ts
git commit -m "feat: add BranchUser provisioning routes — create, reset-password, deactivate, reactivate, branch PIN"
```

---

## Task 11: Branch user auth plugin + routes

**Files:**
- Create: `src/api/auth/branch/plugin.ts`, `src/api/auth/branch/service.ts`, `src/api/auth/branch/routes.ts`
- Create: `tests/api/auth/branch.test.ts`
- Modify: `src/api/app.ts`

- [ ] **Step 1: Write failing branch auth tests**

Create `tests/api/auth/branch.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildApp } from '../../../src/api/app'
import type { FastifyInstance } from 'fastify'

describe('branch user auth routes', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    app = await buildApp()
    app.decorate('prisma', {
      branchUser: { findUnique: vi.fn() },
      userSession: { create: vi.fn(), updateMany: vi.fn() },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    } as any)
    app.decorate('redis', {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue('OK'),
      del: vi.fn().mockResolvedValue(1),
      keys: vi.fn().mockResolvedValue([]),
    } as any)
  })

  afterEach(async () => { await app.close() })

  it('POST /api/v1/branch/auth/login returns PASSWORD_CHANGE_REQUIRED on first login', async () => {
    const { hashPassword } = await import('../../../src/api/shared/password')
    const hash = await hashPassword('TempPass1!')

    app.prisma.branchUser.findUnique = vi.fn().mockResolvedValue({
      id: 'bu1', email: 'staff@test.com', passwordHash: hash,
      mustChangePassword: true, status: 'ACTIVE',
      branch: { id: 'b1', merchantId: 'm1', name: 'Main', merchant: { status: 'ACTIVE' } },
    })

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/branch/auth/login',
      payload: {
        email: 'staff@test.com', password: 'TempPass1!',
        deviceId: '550e8400-e29b-41d4-a716-446655440000', deviceType: 'android',
      },
    })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).status).toBe('PASSWORD_CHANGE_REQUIRED')
    expect(JSON.parse(res.body).tempToken).toBeDefined()
  })

  it('POST /api/v1/branch/auth/login returns 403 for deactivated user', async () => {
    app.prisma.branchUser.findUnique = vi.fn().mockResolvedValue({
      id: 'bu1', passwordHash: 'x', mustChangePassword: false, status: 'INACTIVE',
      branch: { merchant: { status: 'ACTIVE' } },
    })

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/branch/auth/login',
      payload: {
        email: 'staff@test.com', password: 'MyPass123!',
        deviceId: '550e8400-e29b-41d4-a716-446655440000', deviceType: 'android',
      },
    })
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('BRANCH_USER_DEACTIVATED')
  })
})
```

- [ ] **Step 2: Run test — verify it fails**

```bash
npm test -- tests/api/auth/branch.test.ts
```

Expected: FAIL — routes not registered

- [ ] **Step 3: Create `src/api/auth/branch/plugin.ts`**

```typescript
import fp from 'fastify-plugin'
import { FastifyInstance } from 'fastify'
import jwt from '@fastify/jwt'

async function branchAuthPlugin(app: FastifyInstance) {
  await app.register(jwt, {
    secret: process.env.JWT_SECRET_BRANCH ?? 'dev-branch-secret',
    namespace: 'branch',
    jwtVerify: 'branchVerify',
    jwtSign: 'branchSign',
  })

  app.decorate('authenticateBranch', async function (request: any, reply: any) {
    try {
      await request.branchVerify()
    } catch {
      return reply.status(401).send({
        error: { code: 'REFRESH_TOKEN_INVALID', message: 'Unauthorized.', statusCode: 401 },
      })
    }
  })
}

export default fp(branchAuthPlugin, { name: 'branch-auth' })

declare module 'fastify' {
  interface FastifyInstance {
    authenticateBranch: (request: any, reply: any) => Promise<void>
  }
}
```

- [ ] **Step 4: Create `src/api/auth/branch/service.ts`**

```typescript
import { PrismaClient } from '../../../generated/prisma/client'
import type Redis from 'ioredis'
import { verifyPassword, validatePasswordPolicy, hashPassword } from '../../shared/password'
import { generateRefreshToken, hashRefreshToken, generateSessionId, generateSecureToken } from '../../shared/tokens'
import { AppError } from '../../shared/errors'
import { RedisKey } from '../../shared/redis-keys'
import {
  storeRefreshToken, revokeRefreshToken,
  writeUserSession, revokeUserSessionRecord,
  getActiveMobileSessionId, setActiveMobileSession,
  validateRefreshToken,
} from '../../shared/session'
import { writeAuditLog } from '../../shared/audit'

const ACCESS_TOKEN_TTL = '15m'
const TEMP_TOKEN_TTL   = 1800 // 30 minutes

export async function loginBranchUser(
  prisma: PrismaClient,
  redis: Redis,
  app: any,
  data: { email: string; password: string; deviceId: string; deviceType: string; deviceName?: string; ipAddress: string; userAgent: string }
): Promise<object> {
  const branchUser = await prisma.branchUser.findUnique({
    where:   { email: data.email },
    include: { branch: { include: { merchant: true } } },
  })

  if (!branchUser) throw new AppError('INVALID_CREDENTIALS')

  const valid = await verifyPassword(data.password, branchUser.passwordHash)
  if (!valid) {
    writeAuditLog(prisma, { entityId: branchUser.id, entityType: 'branch', event: 'AUTH_LOGIN_FAILED', ipAddress: data.ipAddress, userAgent: data.userAgent })
    throw new AppError('INVALID_CREDENTIALS')
  }

  if (branchUser.status === 'INACTIVE') throw new AppError('BRANCH_USER_DEACTIVATED')
  if ((branchUser.branch as any).merchant.status === 'SUSPENDED') throw new AppError('MERCHANT_SUSPENDED')

  if ((branchUser as any).mustChangePassword) {
    const tempToken = generateSecureToken(24)
    await redis.set(RedisKey.branchTempToken(tempToken), branchUser.id, 'EX', TEMP_TOKEN_TTL)
    return { status: 'PASSWORD_CHANGE_REQUIRED', tempToken }
  }

  // Single session enforcement
  const prevSessionId = await getActiveMobileSessionId(redis, 'branch', branchUser.id)
  if (prevSessionId) {
    await revokeRefreshToken(redis, { role: 'branch', entityId: branchUser.id, sessionId: prevSessionId })
    await revokeUserSessionRecord(prisma, { sessionId: prevSessionId, reason: 'SUPERSEDED_BY_NEW_LOGIN' })
  }

  const sessionId  = generateSessionId()
  const rawRefresh = generateRefreshToken()
  const tokenHash  = hashRefreshToken(rawRefresh)

  await storeRefreshToken(redis, {
    role: 'branch', entityId: branchUser.id, sessionId,
    tokenHash, deviceId: data.deviceId, deviceType: data.deviceType,
  })
  await setActiveMobileSession(redis, 'branch', branchUser.id, sessionId)
  await writeUserSession(prisma, {
    entityId: branchUser.id, entityType: 'branch', sessionId,
    deviceId: data.deviceId, deviceType: data.deviceType,
    ipAddress: data.ipAddress, userAgent: data.userAgent,
  })

  await redis.set(
    RedisKey.authBranch(branchUser.id),
    JSON.stringify({ merchantId: branchUser.branch.merchantId, branchId: branchUser.branchId, isActive: true }),
    'EX', 3600
  )

  const accessToken = app.branchSign(
    { sub: branchUser.id, role: 'branch', deviceId: data.deviceId, sessionId },
    { expiresIn: ACCESS_TOKEN_TTL }
  )

  writeAuditLog(prisma, { entityId: branchUser.id, entityType: 'branch', event: 'AUTH_LOGIN_SUCCESS', ipAddress: data.ipAddress, userAgent: data.userAgent, sessionId })

  return {
    accessToken,
    refreshToken: rawRefresh,
    branch: { id: branchUser.branchId, name: (branchUser.branch as any).name, merchantId: branchUser.branch.merchantId },
  }
}

export async function changePasswordFirstLogin(
  prisma: PrismaClient,
  redis: Redis,
  app: any,
  data: { tempToken: string; newPassword: string; deviceId: string; deviceType: string; ipAddress: string; userAgent: string }
): Promise<object> {
  if (!validatePasswordPolicy(data.newPassword)) throw new AppError('PASSWORD_POLICY_VIOLATION')

  const branchUserId = await redis.get(RedisKey.branchTempToken(data.tempToken))
  if (!branchUserId) throw new AppError('ACTION_TOKEN_INVALID')

  const passwordHash = await hashPassword(data.newPassword)
  await prisma.branchUser.update({
    where: { id: branchUserId },
    data:  { passwordHash, mustChangePassword: false },
  })
  await redis.del(RedisKey.branchTempToken(data.tempToken))

  const sessionId  = generateSessionId()
  const rawRefresh = generateRefreshToken()
  const tokenHash  = hashRefreshToken(rawRefresh)

  await storeRefreshToken(redis, {
    role: 'branch', entityId: branchUserId, sessionId,
    tokenHash, deviceId: data.deviceId, deviceType: data.deviceType,
  })

  const branchUser = await prisma.branchUser.findUnique({
    where: { id: branchUserId }, include: { branch: true },
  })

  const accessToken = app.branchSign(
    { sub: branchUserId, role: 'branch', deviceId: data.deviceId, sessionId },
    { expiresIn: ACCESS_TOKEN_TTL }
  )

  writeAuditLog(prisma, { entityId: branchUserId, entityType: 'branch', event: 'BRANCH_USER_PASSWORD_SET', ipAddress: data.ipAddress, userAgent: data.userAgent })

  return {
    accessToken,
    refreshToken: rawRefresh,
    branch: { id: (branchUser as any).branchId, name: (branchUser as any).branch.name },
  }
}

export async function changePasswordBranchUser(
  prisma: PrismaClient,
  data: { branchUserId: string; currentPassword: string; newPassword: string; sessionId: string; ipAddress: string; userAgent: string }
): Promise<{ message: string }> {
  if (!validatePasswordPolicy(data.newPassword)) throw new AppError('PASSWORD_POLICY_VIOLATION')

  const branchUser = await prisma.branchUser.findUnique({ where: { id: data.branchUserId } })
  if (!branchUser) throw new AppError('INVALID_CREDENTIALS')

  const valid = await verifyPassword(data.currentPassword, branchUser.passwordHash)
  if (!valid) throw new AppError('INVALID_CREDENTIALS')

  const passwordHash = await hashPassword(data.newPassword)
  await prisma.branchUser.update({ where: { id: data.branchUserId }, data: { passwordHash } })

  writeAuditLog(prisma, { entityId: data.branchUserId, entityType: 'branch', event: 'BRANCH_USER_PASSWORD_CHANGED', ipAddress: data.ipAddress, userAgent: data.userAgent, sessionId: data.sessionId })

  return { message: 'Password updated.' }
}

export async function refreshBranchToken(
  prisma: PrismaClient,
  redis: Redis,
  app: any,
  data: { refreshToken: string; sessionId: string; entityId: string; ipAddress: string; userAgent: string }
): Promise<{ accessToken: string; refreshToken: string }> {
  const key    = RedisKey.refreshToken('branch', data.entityId, data.sessionId)
  const stored = await redis.get(key)

  if (!stored || !validateRefreshToken(stored, data.refreshToken)) {
    writeAuditLog(prisma, { entityId: data.entityId, entityType: 'branch', event: 'AUTH_REFRESH_FAILED', ipAddress: data.ipAddress, userAgent: data.userAgent })
    throw new AppError('REFRESH_TOKEN_INVALID')
  }

  const parsed     = JSON.parse(stored)
  await redis.del(key)

  const newRefresh = generateRefreshToken()
  await storeRefreshToken(redis, {
    role: 'branch', entityId: data.entityId, sessionId: data.sessionId,
    tokenHash: hashRefreshToken(newRefresh), deviceId: parsed.deviceId, deviceType: parsed.deviceType,
  })

  await prisma.userSession.updateMany({
    where: { sessionId: data.sessionId },
    data:  { lastActiveAt: new Date() },
  })

  const accessToken = app.branchSign(
    { sub: data.entityId, role: 'branch', deviceId: parsed.deviceId, sessionId: data.sessionId },
    { expiresIn: ACCESS_TOKEN_TTL }
  )

  return { accessToken, refreshToken: newRefresh }
}

export async function logoutBranchUser(
  prisma: PrismaClient,
  redis: Redis,
  data: { entityId: string; sessionId: string; ipAddress: string; userAgent: string }
): Promise<void> {
  await revokeRefreshToken(redis, { role: 'branch', entityId: data.entityId, sessionId: data.sessionId })
  await redis.del(RedisKey.authBranch(data.entityId))
  writeAuditLog(prisma, { entityId: data.entityId, entityType: 'branch', event: 'AUTH_LOGOUT', ipAddress: data.ipAddress, userAgent: data.userAgent, sessionId: data.sessionId })
}
```

- [ ] **Step 5: Create `src/api/auth/branch/routes.ts`**

```typescript
import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { passwordSchema, deviceSchema } from '../../shared/schemas'
import {
  loginBranchUser, changePasswordFirstLogin, changePasswordBranchUser,
  refreshBranchToken, logoutBranchUser,
} from './service'

export async function branchAuthRoutes(app: FastifyInstance) {
  const prefix = '/api/v1/branch/auth'

  app.post(`${prefix}/login`, {
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
  }, async (req, reply) => {
    const body = z.object({
      email:    z.string().email(),
      password: z.string(),
      ...deviceSchema.shape,
    }).parse(req.body)

    const result = await loginBranchUser(app.prisma, app.redis, app, {
      ...body,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.send(result)
  })

  app.post(`${prefix}/change-password-first-login`, async (req, reply) => {
    const body = z.object({
      tempToken:   z.string(),
      newPassword: passwordSchema,
      ...deviceSchema.shape,
    }).parse(req.body)

    const result = await changePasswordFirstLogin(app.prisma, app.redis, app, {
      ...body,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.send(result)
  })

  app.post(`${prefix}/change-password`, { preHandler: [app.authenticateBranch] }, async (req: any, reply) => {
    const body = z.object({ currentPassword: z.string(), newPassword: passwordSchema }).parse(req.body)
    const result = await changePasswordBranchUser(app.prisma, {
      branchUserId: req.user.sub, ...body,
      sessionId: req.user.sessionId,
      ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.send(result)
  })

  app.post(`${prefix}/refresh`, async (req, reply) => {
    const body = z.object({ refreshToken: z.string(), sessionId: z.string(), entityId: z.string() }).parse(req.body)
    const result = await refreshBranchToken(app.prisma, app.redis, app, {
      ...body, ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.send(result)
  })

  app.post(`${prefix}/logout`, { preHandler: [app.authenticateBranch] }, async (req: any, reply) => {
    await logoutBranchUser(app.prisma, app.redis, {
      entityId: req.user.sub, sessionId: req.user.sessionId,
      ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.send({ message: 'Logged out.' })
  })
}
```

- [ ] **Step 6: Register in `src/api/app.ts`**

```typescript
// Add imports:
import branchAuthPlugin from './auth/branch/plugin'
import { branchAuthRoutes } from './auth/branch/routes'

// Add inside buildApp():
await app.register(branchAuthPlugin)
await app.register(branchAuthRoutes)
```

- [ ] **Step 7: Run branch auth tests**

```bash
npm test -- tests/api/auth/branch.test.ts
```

Expected: PASS (2 tests)

- [ ] **Step 8: Commit**

```bash
git add src/api/auth/branch/ tests/api/auth/branch.test.ts src/api/app.ts
git commit -m "feat: add branch user auth — login, forced password change, self-service password change, refresh, logout"
```

---

## Task 12: Admin auth plugin + routes

**Files:**
- Create: `src/api/auth/admin/plugin.ts`, `src/api/auth/admin/service.ts`, `src/api/auth/admin/routes.ts`
- Create: `tests/api/auth/admin.test.ts`
- Modify: `src/api/app.ts`

- [ ] **Step 1: Write failing admin auth tests**

Create `tests/api/auth/admin.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildApp } from '../../../src/api/app'
import type { FastifyInstance } from 'fastify'

describe('admin auth routes', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    app = await buildApp()
    app.decorate('prisma', {
      adminUser: { findUnique: vi.fn() },
      userSession: { create: vi.fn(), updateMany: vi.fn() },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    } as any)
    app.decorate('redis', {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue('OK'),
      del: vi.fn().mockResolvedValue(1),
      keys: vi.fn().mockResolvedValue([]),
    } as any)
  })

  afterEach(async () => { await app.close() })

  it('POST /api/v1/admin/auth/login always returns OTP_REQUIRED on valid credentials', async () => {
    const { hashPassword } = await import('../../../src/api/shared/password')
    const hash = await hashPassword('AdminPass1!')

    app.prisma.adminUser.findUnique = vi.fn().mockResolvedValue({
      id: 'a1', email: 'admin@redeemo.com', passwordHash: hash,
      isActive: true, role: 'SUPER_ADMIN',
    })

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/auth/login',
      payload: {
        email: 'admin@redeemo.com', password: 'AdminPass1!',
        deviceId: '550e8400-e29b-41d4-a716-446655440000', deviceType: 'web',
      },
    })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).status).toBe('OTP_REQUIRED')
    expect(JSON.parse(res.body).sessionChallenge).toBeDefined()
  })

  it('POST /api/v1/admin/auth/login returns 401 for wrong password', async () => {
    const { hashPassword } = await import('../../../src/api/shared/password')
    const hash = await hashPassword('AdminPass1!')

    app.prisma.adminUser.findUnique = vi.fn().mockResolvedValue({
      id: 'a1', email: 'admin@redeemo.com', passwordHash: hash, isActive: true,
    })

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/auth/login',
      payload: {
        email: 'admin@redeemo.com', password: 'WrongPass1!',
        deviceId: '550e8400-e29b-41d4-a716-446655440000', deviceType: 'web',
      },
    })
    expect(res.statusCode).toBe(401)
  })
})
```

- [ ] **Step 2: Run test — verify it fails**

```bash
npm test -- tests/api/auth/admin.test.ts
```

Expected: FAIL — routes not registered

- [ ] **Step 3: Create `src/api/auth/admin/plugin.ts`**

```typescript
import fp from 'fastify-plugin'
import { FastifyInstance } from 'fastify'
import jwt from '@fastify/jwt'

async function adminAuthPlugin(app: FastifyInstance) {
  await app.register(jwt, {
    secret: process.env.JWT_SECRET_ADMIN ?? 'dev-admin-secret',
    namespace: 'admin',
    jwtVerify: 'adminVerify',
    jwtSign: 'adminSign',
  })

  app.decorate('authenticateAdmin', async function (request: any, reply: any) {
    try {
      await request.adminVerify()
    } catch {
      return reply.status(401).send({
        error: { code: 'REFRESH_TOKEN_INVALID', message: 'Unauthorized.', statusCode: 401 },
      })
    }
  })
}

export default fp(adminAuthPlugin, { name: 'admin-auth' })

declare module 'fastify' {
  interface FastifyInstance {
    authenticateAdmin: (request: any, reply: any) => Promise<void>
  }
}
```

- [ ] **Step 4: Create `src/api/auth/admin/service.ts`**

```typescript
import { PrismaClient } from '../../../generated/prisma/client'
import type Redis from 'ioredis'
import { verifyPassword } from '../../shared/password'
import { generateRefreshToken, hashRefreshToken, generateSessionId, generateSecureToken } from '../../shared/tokens'
import { AppError } from '../../shared/errors'
import { RedisKey } from '../../shared/redis-keys'
import {
  storeRefreshToken, revokeRefreshToken,
  writeUserSession, validateRefreshToken,
} from '../../shared/session'
import { writeAuditLog } from '../../shared/audit'

const OTP_CHALLENGE_TTL = 600
const ACCESS_TOKEN_TTL  = '15m'

export async function loginAdmin(
  prisma: PrismaClient,
  redis: Redis,
  data: { email: string; password: string; deviceId: string; deviceType: string; ipAddress: string; userAgent: string }
): Promise<{ status: string; sessionChallenge: string }> {
  const admin = await prisma.adminUser.findUnique({ where: { email: data.email } })

  if (!admin) throw new AppError('INVALID_CREDENTIALS')

  const valid = await verifyPassword(data.password, admin.passwordHash)
  if (!valid) {
    writeAuditLog(prisma, { entityId: admin.id, entityType: 'admin', event: 'AUTH_LOGIN_FAILED', ipAddress: data.ipAddress, userAgent: data.userAgent })
    throw new AppError('INVALID_CREDENTIALS')
  }

  if (!admin.isActive) throw new AppError('ACCOUNT_SUSPENDED')

  const challenge = generateSecureToken(16)
  await redis.set(
    RedisKey.otpChallenge('admin', challenge),
    JSON.stringify({ adminId: admin.id, deviceId: data.deviceId, deviceType: data.deviceType }),
    'EX', OTP_CHALLENGE_TTL
  )

  // TODO Phase 3: send OTP via Twilio to admin's phone
  console.info(`[dev] Admin OTP challenge for ${admin.email}: ${challenge}`)

  return { status: 'OTP_REQUIRED', sessionChallenge: challenge }
}

export async function verifyAdminOtp(
  prisma: PrismaClient,
  redis: Redis,
  app: any,
  data: { sessionChallenge: string; code: string; ipAddress: string; userAgent: string }
): Promise<{ accessToken: string; refreshToken: string; admin: object }> {
  const raw = await redis.get(RedisKey.otpChallenge('admin', data.sessionChallenge))
  if (!raw) throw new AppError('ACTION_TOKEN_INVALID')

  const { adminId, deviceId, deviceType } = JSON.parse(raw) as { adminId: string; deviceId: string; deviceType: string }
  await redis.del(RedisKey.otpChallenge('admin', data.sessionChallenge))

  const admin = await prisma.adminUser.findUnique({ where: { id: adminId } })
  if (!admin) throw new AppError('INVALID_CREDENTIALS')

  // TODO Phase 3: verify OTP via Twilio — for now accept any 6-digit code in dev
  if (process.env.NODE_ENV !== 'development' && data.code !== '000000') {
    throw new AppError('OTP_INVALID')
  }

  const sessionId  = generateSessionId()
  const rawRefresh = generateRefreshToken()
  const tokenHash  = hashRefreshToken(rawRefresh)

  await storeRefreshToken(redis, {
    role: 'admin', entityId: admin.id, sessionId,
    tokenHash, deviceId, deviceType,
  })

  await writeUserSession(prisma, {
    entityId: admin.id, entityType: 'admin', sessionId,
    deviceId, deviceType, ipAddress: data.ipAddress, userAgent: data.userAgent,
  })

  await redis.set(
    RedisKey.authAdmin(admin.id),
    JSON.stringify({ adminRole: admin.role }),
    'EX', 3600
  )

  const accessToken = app.adminSign(
    { sub: admin.id, role: 'admin', adminRole: admin.role, sessionId },
    { expiresIn: ACCESS_TOKEN_TTL }
  )

  writeAuditLog(prisma, { entityId: admin.id, entityType: 'admin', event: 'AUTH_LOGIN_SUCCESS', ipAddress: data.ipAddress, userAgent: data.userAgent, sessionId })

  return {
    accessToken,
    refreshToken: rawRefresh,
    admin: { id: admin.id, email: admin.email, adminRole: admin.role },
  }
}

export async function refreshAdminToken(
  prisma: PrismaClient,
  redis: Redis,
  app: any,
  data: { refreshToken: string; sessionId: string; entityId: string; ipAddress: string; userAgent: string }
): Promise<{ accessToken: string; refreshToken: string }> {
  const key    = RedisKey.refreshToken('admin', data.entityId, data.sessionId)
  const stored = await redis.get(key)

  if (!stored || !validateRefreshToken(stored, data.refreshToken)) {
    writeAuditLog(prisma, { entityId: data.entityId, entityType: 'admin', event: 'AUTH_REFRESH_FAILED', ipAddress: data.ipAddress, userAgent: data.userAgent })
    throw new AppError('REFRESH_TOKEN_INVALID')
  }

  const parsed     = JSON.parse(stored)
  await redis.del(key)
  const newRefresh = generateRefreshToken()

  await storeRefreshToken(redis, {
    role: 'admin', entityId: data.entityId, sessionId: data.sessionId,
    tokenHash: hashRefreshToken(newRefresh), deviceId: parsed.deviceId, deviceType: parsed.deviceType,
  })

  await prisma.userSession.updateMany({
    where: { sessionId: data.sessionId }, data: { lastActiveAt: new Date() },
  })

  const admin = await prisma.adminUser.findUnique({ where: { id: data.entityId } })

  const accessToken = app.adminSign(
    { sub: data.entityId, role: 'admin', adminRole: admin?.role, sessionId: data.sessionId },
    { expiresIn: ACCESS_TOKEN_TTL }
  )

  return { accessToken, refreshToken: newRefresh }
}

export async function logoutAdmin(
  prisma: PrismaClient,
  redis: Redis,
  data: { entityId: string; sessionId: string; ipAddress: string; userAgent: string }
): Promise<void> {
  await revokeRefreshToken(redis, { role: 'admin', entityId: data.entityId, sessionId: data.sessionId })
  await redis.del(RedisKey.authAdmin(data.entityId))
  writeAuditLog(prisma, { entityId: data.entityId, entityType: 'admin', event: 'AUTH_LOGOUT', ipAddress: data.ipAddress, userAgent: data.userAgent, sessionId: data.sessionId })
}
```

- [ ] **Step 5: Create `src/api/auth/admin/routes.ts`**

```typescript
import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { emailSchema, deviceSchema } from '../../shared/schemas'
import { loginAdmin, verifyAdminOtp, refreshAdminToken, logoutAdmin } from './service'

export async function adminAuthRoutes(app: FastifyInstance) {
  const prefix = '/api/v1/admin/auth'

  app.post(`${prefix}/login`, {
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
  }, async (req, reply) => {
    const body = z.object({ email: emailSchema, password: z.string(), ...deviceSchema.shape }).parse(req.body)
    const result = await loginAdmin(app.prisma, app.redis, {
      ...body, ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.send(result)
  })

  app.post(`${prefix}/otp/verify`, async (req, reply) => {
    const body = z.object({ sessionChallenge: z.string(), code: z.string().length(6) }).parse(req.body)
    const result = await verifyAdminOtp(app.prisma, app.redis, app, {
      ...body, ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.send(result)
  })

  app.post(`${prefix}/refresh`, async (req, reply) => {
    const body = z.object({ refreshToken: z.string(), sessionId: z.string(), entityId: z.string() }).parse(req.body)
    const result = await refreshAdminToken(app.prisma, app.redis, app, {
      ...body, ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.send(result)
  })

  app.post(`${prefix}/logout`, { preHandler: [app.authenticateAdmin] }, async (req: any, reply) => {
    await logoutAdmin(app.prisma, app.redis, {
      entityId: req.user.sub, sessionId: req.user.sessionId,
      ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.send({ message: 'Logged out.' })
  })
}
```

- [ ] **Step 6: Register in `src/api/app.ts`**

```typescript
// Add imports:
import adminAuthPlugin from './auth/admin/plugin'
import { adminAuthRoutes } from './auth/admin/routes'

// Add inside buildApp():
await app.register(adminAuthPlugin)
await app.register(adminAuthRoutes)
```

- [ ] **Step 7: Run admin auth tests**

```bash
npm test -- tests/api/auth/admin.test.ts
```

Expected: PASS (2 tests)

- [ ] **Step 8: Add admin password reset to `src/api/auth/admin/service.ts`**

Add these two functions to the end of `src/api/auth/admin/service.ts`:

```typescript
export async function forgotPasswordAdmin(
  prisma: PrismaClient,
  redis: Redis,
  email: string
): Promise<void> {
  const admin = await prisma.adminUser.findUnique({ where: { email } })
  if (!admin) return // no enumeration

  const token = generateSecureToken(32)
  await redis.set(RedisKey.passwordReset('admin', token), admin.id, 'EX', 3600)
  // TODO Phase 3: send reset email via Resend
  console.info(`[dev] Admin password reset token for ${admin.email}: ${token}`)
}

export async function resetPasswordAdmin(
  prisma: PrismaClient,
  redis: Redis,
  data: { token: string; newPassword: string; ipAddress: string; userAgent: string }
): Promise<void> {
  const { validatePasswordPolicy, hashPassword } = await import('../../shared/password')
  if (!validatePasswordPolicy(data.newPassword)) throw new AppError('PASSWORD_POLICY_VIOLATION')

  const key     = RedisKey.passwordReset('admin', data.token)
  const adminId = await redis.get(key)
  if (!adminId) throw new AppError('RESET_TOKEN_EXPIRED')

  const passwordHash = await hashPassword(data.newPassword)
  await prisma.adminUser.update({ where: { id: adminId }, data: { passwordHash } })
  await redis.del(key)

  const { revokeAllSessionsForEntity, revokeAllUserSessionRecords } = await import('../../shared/session')
  await revokeAllSessionsForEntity(redis, { role: 'admin', entityId: adminId })
  await revokeAllUserSessionRecords(prisma, { entityId: adminId, entityType: 'admin', reason: 'PASSWORD_RESET' })
  await redis.del(RedisKey.authAdmin(adminId))

  writeAuditLog(prisma, { entityId: adminId, entityType: 'admin', event: 'AUTH_PASSWORD_RESET', ipAddress: data.ipAddress, userAgent: data.userAgent })
}
```

- [ ] **Step 9: Add admin forgot/reset password routes to `src/api/auth/admin/routes.ts`**

Add these after the logout route:

```typescript
  app.post(`${prefix}/forgot-password`, {
    config: { rateLimit: { max: 3, timeWindow: '1 hour' } },
  }, async (req, reply) => {
    const { email } = z.object({ email: emailSchema }).parse(req.body)
    await forgotPasswordAdmin(app.prisma, app.redis, email)
    return reply.send({ message: 'If that email is registered, a reset link has been sent.' })
  })

  app.post(`${prefix}/reset-password`, async (req, reply) => {
    const body = z.object({ token: z.string(), newPassword: passwordSchema }).parse(req.body)
    await resetPasswordAdmin(app.prisma, app.redis, {
      ...body, ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.send({ message: 'Password updated. Please log in again.' })
  })
```

Update the import line at the top of `src/api/auth/admin/routes.ts`:
```typescript
import { loginAdmin, verifyAdminOtp, refreshAdminToken, logoutAdmin, forgotPasswordAdmin, resetPasswordAdmin } from './service'
```

Also add `passwordSchema` to the import from schemas:
```typescript
import { emailSchema, passwordSchema, deviceSchema } from '../../shared/schemas'
```

- [ ] **Step 10: Commit**

```bash
git add src/api/auth/admin/ tests/api/auth/admin.test.ts src/api/app.ts
git commit -m "feat: add admin auth — always-OTP login with session challenge, refresh, logout, password reset"
```

---

## Task 13: Run full test suite + integration smoke test

**Files:**
- No new files

- [ ] **Step 1: Run all tests**

```bash
npm test
```

Expected: All tests PASS. Output lists tests from:
- `tests/api/app.test.ts`
- `tests/api/shared/errors.test.ts`
- `tests/api/shared/password.test.ts`
- `tests/api/shared/tokens.test.ts`
- `tests/api/shared/otp.test.ts`
- `tests/api/shared/session.test.ts`
- `tests/api/auth/customer.test.ts`
- `tests/api/auth/merchant.test.ts`
- `tests/api/auth/branch.test.ts`
- `tests/api/auth/branch-user-mgmt.test.ts`
- `tests/api/auth/admin.test.ts`

- [ ] **Step 2: TypeScript compile check**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Start dev server and verify health endpoint**

Ensure `.env` has `DATABASE_URL`, `REDIS_URL`, and all `JWT_SECRET_*` values set, then:

```bash
npm run dev
```

In a second terminal:

```bash
curl http://localhost:3000/health
```

Expected: `{"status":"ok"}`

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: Phase 2A+2B complete — full auth system and API structure

Four isolated auth plugins (customer/merchant/branch/admin), JWT + 90-day
refresh token sessions, Redis permission cache, single mobile session
enforcement, BranchUser MerchantAdmin provisioning, branch redemption PIN,
Twilio OTP with session challenge flow, audit logging, UserSession tracking,
full password policy validation, and account lifecycle (delete, suspend,
deactivate). Vitest test suite covering all auth flows."
```

---

## Implementation Notes for Subagents

**Prisma 7 import pattern** — always use:
```typescript
import { PrismaClient } from '../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })
```
Never `import { PrismaClient } from '@prisma/client'`.

**`@fastify/jwt` namespace pattern** — when registering with `namespace`, the sign/verify methods become `app.{namespace}Sign` / `request.{namespace}Verify`. Each auth plugin uses its own namespace.

**Test pattern** — in `NODE_ENV=test`, the Prisma and Redis plugins are skipped. Tests decorate the app manually with mock objects after `buildApp()`. This avoids needing real DB/Redis connections in tests.

**Fire-and-forget audit** — `writeAuditLog` is synchronous from the caller's perspective (it internally does an async Prisma write with `.catch()`). Never `await writeAuditLog(...)`.

**OTP in dev** — Twilio calls will fail without real credentials. The `sendOtp` and `verifyOtp` functions in `shared/otp.ts` wrap Twilio. In dev/test, you can stub these. The admin OTP verification has an explicit dev bypass (`code === '000000'` in development).

**`redemptionPin` → `redemptionPinHash`** — the original schema had `redemptionPin String` (plain text). The migration replaces this with `redemptionPinHash String?` (nullable bcrypt hash). The seed script creates branches without a PIN set — that's intentional (merchants set PINs after onboarding).
