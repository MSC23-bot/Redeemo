import type { FastifyInstance } from 'fastify'
import { validateRequiredEnv } from './shared/env'

/**
 * Boot sequence (Security Stabilisation Gate — PR-1b, boot-validation correctness).
 *
 * `validateRequiredEnv()` MUST run before ANY app module is imported. Some app
 * modules consume secrets at IMPORT time — e.g. `shared/stripe.ts` instantiates
 * the Stripe client at module load via `requireSecret('STRIPE_SECRET_KEY')`. If
 * the app graph were imported first (a static `import './app'`), that single
 * module-level consumer would throw on the first missing secret, BEFORE the
 * aggregated check could report every missing secret at once.
 *
 * The dynamic `import('./app')` below defers loading the app graph until after
 * validation has passed — so a misconfigured environment always surfaces the
 * single aggregated "[env] Refusing to start — N required secret(s) …" error,
 * and the app graph (incl. stripe.ts) only loads once every required secret is
 * present. Fail-closed is preserved; no fallback secrets are introduced.
 */
export async function bootstrap(): Promise<FastifyInstance> {
  validateRequiredEnv()
  const { buildApp } = await import('./app')
  return buildApp()
}
