import { PrismaClient } from '../../../generated/prisma/client'
import type Redis from 'ioredis'
import { stripe } from '../shared/stripe'
import { AppError } from '../shared/errors'
import { writeAuditLog } from '../shared/audit'

interface RequestCtx {
  ipAddress: string
  userAgent: string
}

const ACTIVE_STATUSES = ['ACTIVE', 'TRIALLING', 'PAST_DUE'] as const
const SETUP_KEY = (userId: string) => `sub:setup:${userId}`
const SETUP_TTL = 3600 // 1 hour

export async function getActivePlans(prisma: PrismaClient) {
  return prisma.subscriptionPlan.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
  })
}

export async function getMySubscription(prisma: PrismaClient, userId: string) {
  return prisma.subscription.findUnique({
    where: { userId },
    include: { plan: true },
  })
}

/**
 * Step 1 of the payment flow.
 * Creates a Stripe customer, stores stripeCustomerId in Redis (TTL 1h),
 * and returns only clientSecret to the frontend.
 * stripeCustomerId never leaves the server.
 */
export async function createSetupIntent(
  prisma: PrismaClient,
  redis: Redis,
  userId: string
): Promise<{ clientSecret: string }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, firstName: true, lastName: true, stripeCustomerId: true },
  })
  if (!user) throw new AppError('INVALID_CREDENTIALS')

  let stripeCustomerId: string
  if (user.stripeCustomerId) {
    // Reuse existing Stripe customer — prevents orphaned customer records on repeat calls
    stripeCustomerId = user.stripeCustomerId
  } else {
    try {
      const customer = await stripe.customers.create({
        email: user.email,
        name: [user.firstName, user.lastName].filter(Boolean).join(' ') || undefined,
        metadata: { userId },
      })
      stripeCustomerId = customer.id
      await prisma.user.update({
        where: { id: userId },
        data: { stripeCustomerId },
      })
    } catch {
      throw new AppError('STRIPE_ERROR')
    }
  }

  // Store server-side — client never sees this
  await redis.set(SETUP_KEY(userId), stripeCustomerId, 'EX', SETUP_TTL)

  let clientSecret: string
  try {
    const intent = await stripe.setupIntents.create({
      customer: stripeCustomerId,
      usage: 'off_session',
    })
    clientSecret = intent.client_secret!
  } catch {
    throw new AppError('STRIPE_ERROR')
  }

  return { clientSecret }
}

/**
 * Step 2 of the payment flow.
 * Reads stripeCustomerId from Redis using the authenticated userId as key —
 * never from the request body. Throws PAYMENT_METHOD_REQUIRED if the setup
 * session has expired or never existed.
 */
export async function createSubscription(
  prisma: PrismaClient,
  redis: Redis,
  userId: string,
  data: { planId: string; paymentMethodId: string; promoCode?: string },
  ctx: RequestCtx
) {
  // Resolve Stripe customer ID server-side from Redis
  const stripeCustomerId = await redis.get(SETUP_KEY(userId))
  if (!stripeCustomerId) throw new AppError('PAYMENT_METHOD_REQUIRED')

  // Guard: no existing active subscription
  const existing = await prisma.subscription.findUnique({ where: { userId } })
  if (existing && (ACTIVE_STATUSES as readonly string[]).includes(existing.status)) {
    throw new AppError('SUBSCRIPTION_ALREADY_ACTIVE')
  }

  // Validate plan
  const plan = await prisma.subscriptionPlan.findUnique({ where: { id: data.planId } })
  if (!plan || !plan.isActive) throw new AppError('PLAN_NOT_FOUND')

  // Validate promo code — use stripeCouponId for Stripe API call, not the human code
  let promoCodeId: string | undefined
  let stripeCouponId: string | undefined
  if (data.promoCode) {
    const promo = await prisma.promoCode.findUnique({ where: { code: data.promoCode } })
    if (!promo || !promo.isActive || (promo.expiresAt && promo.expiresAt < new Date())) {
      throw new AppError('PROMO_CODE_INVALID')
    }
    if (promo.maxUses !== null && promo.usesCount >= promo.maxUses) {
      throw new AppError('PROMO_CODE_EXHAUSTED')
    }
    promoCodeId = promo.id
    stripeCouponId = promo.stripeCouponId ?? undefined
  }

  // Attach the confirmed payment method to the Stripe customer
  try {
    await stripe.paymentMethods.attach(data.paymentMethodId, { customer: stripeCustomerId })
  } catch {
    throw new AppError('STRIPE_ERROR')
  }

  // Create Stripe subscription
  let stripeSub: Awaited<ReturnType<typeof stripe.subscriptions.create>>
  try {
    stripeSub = await stripe.subscriptions.create({
      customer: stripeCustomerId,
      items: [{ price: plan.stripePriceId }],
      default_payment_method: data.paymentMethodId,
      ...(stripeCouponId ? { discounts: [{ coupon: stripeCouponId }] } : {}),
      expand: ['latest_invoice.payment_intent'],
    })
  } catch {
    throw new AppError('STRIPE_ERROR')
  }

  // In Stripe v22 billing period dates live on SubscriptionItem, not the top-level Subscription.
  // We require the item to be present — a subscription with no items is not a valid state.
  const firstItem = stripeSub.items.data[0]
  if (!firstItem) throw new AppError('STRIPE_ERROR')
  const periodStart = new Date(firstItem.current_period_start * 1000)
  const periodEnd   = new Date(firstItem.current_period_end   * 1000)

  // Persist to DB
  const sub = await prisma.subscription.create({
    data: {
      userId,
      planId: plan.id,
      stripeSubscriptionId: stripeSub.id,
      stripeCustomerId,
      status: stripeStatusToLocal(stripeSub.status),
      currentPeriodStart: periodStart,
      currentPeriodEnd:   periodEnd,
      ...(promoCodeId ? { promoCodeId } : {}),
    },
  })

  // Clean up setup session — one-time use
  await redis.del(SETUP_KEY(userId))

  // Increment promo uses
  if (promoCodeId) {
    await prisma.promoCode.update({
      where: { id: promoCodeId },
      data: { usesCount: { increment: 1 } },
    })
    writeAuditLog(prisma, {
      entityId: userId, entityType: 'customer',
      event: 'SUBSCRIPTION_PROMO_APPLIED',
      ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
      metadata: { promoCodeId },
    })
  }

  writeAuditLog(prisma, {
    entityId: userId, entityType: 'customer',
    event: 'SUBSCRIPTION_CREATED',
    ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
    metadata: { planId: plan.id, stripeSubscriptionId: stripeSub.id },
  })

  return sub
}

export async function cancelSubscription(
  prisma: PrismaClient,
  userId: string,
  ctx: RequestCtx
) {
  const sub = await prisma.subscription.findUnique({ where: { userId } })
  if (!sub) throw new AppError('SUBSCRIPTION_NOT_FOUND')
  if (sub.status === 'CANCELLED' || sub.status === 'EXPIRED') {
    throw new AppError('SUBSCRIPTION_NOT_CANCELLABLE')
  }

  try {
    await stripe.subscriptions.update(sub.stripeSubscriptionId, {
      cancel_at_period_end: true,
    })
  } catch {
    throw new AppError('STRIPE_ERROR')
  }

  // cancelledAt = when the user requested cancellation (not when access ends)
  // Access continues until currentPeriodEnd; cancelAtPeriodEnd tells Stripe to terminate then
  const updated = await prisma.subscription.update({
    where: { userId },
    data: { cancelAtPeriodEnd: true, cancelledAt: new Date() },
  })

  writeAuditLog(prisma, {
    entityId: userId, entityType: 'customer',
    event: 'SUBSCRIPTION_CANCELLED',
    ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
    metadata: { stripeSubscriptionId: sub.stripeSubscriptionId },
  })

  return updated
}

function stripeStatusToLocal(
  status: string
): 'TRIALLING' | 'ACTIVE' | 'CANCELLED' | 'EXPIRED' | 'PAST_DUE' {
  switch (status) {
    case 'trialing':    return 'TRIALLING'
    case 'active':      return 'ACTIVE'
    case 'canceled':    return 'CANCELLED'
    case 'past_due':    return 'PAST_DUE'
    case 'unpaid':      return 'PAST_DUE'
    case 'incomplete':  return 'PAST_DUE'
    default:            return 'EXPIRED'
  }
}
