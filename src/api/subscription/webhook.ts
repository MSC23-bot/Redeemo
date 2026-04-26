import { FastifyInstance } from 'fastify'
import { stripe } from '../shared/stripe'
import { AppError } from '../shared/errors'
import { writeAuditLog } from '../shared/audit'
import { resetVoucherCycleForUser } from './cycle'
import { SubscriptionStatus } from '../../../generated/prisma/enums'

export async function webhookRoutes(app: FastifyInstance) {
  // Scoped raw-body parser — must NOT be wrapped in fp() so it stays scoped
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_req, body, done) => {
    done(null, body)
  })

  app.post('/api/v1/stripe/webhook', async (req, reply) => {
    const sig = req.headers['stripe-signature'] as string | undefined
    const secret = process.env.STRIPE_WEBHOOK_SECRET ?? 'whsec_placeholder'

    let event: ReturnType<typeof stripe.webhooks.constructEvent>
    try {
      event = stripe.webhooks.constructEvent(req.body as Buffer, sig ?? '', secret)
    } catch {
      throw new AppError('WEBHOOK_SIGNATURE_INVALID')
    }

    // Idempotency guard — insert stripeEventId; if it already exists, this event was already
    // processed (duplicate delivery or Stripe retry). Acknowledge with 200 to stop retries.
    try {
      await app.prisma.stripeWebhookEvent.create({
        data: { stripeEventId: event.id, type: event.type },
      })
    } catch (err: any) {
      // P2002 = unique constraint violation — event already processed
      if (err?.code === 'P2002') {
        return reply.send({ received: true })
      }
      throw err
    }

    switch (event.type) {
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        // In Stripe v22, billing period dates live on items.data[0], not the top-level object.
        // We read from the item first and fall back to top-level for safety.
        const stripeObj = event.data.object as unknown as {
          id: string
          status: string
          current_period_start: number
          current_period_end: number
          items: { data: Array<{ current_period_start: number; current_period_end: number }> }
        }

        const sub = await app.prisma.subscription.findUnique({
          where: { stripeSubscriptionId: stripeObj.id },
        })
        if (!sub) break

        const firstItem = stripeObj.items?.data?.[0]
        const periodStart = firstItem?.current_period_start ?? stripeObj.current_period_start
        const periodEnd   = firstItem?.current_period_end   ?? stripeObj.current_period_end

        const status: SubscriptionStatus = event.type === 'customer.subscription.deleted'
          ? SubscriptionStatus.CANCELLED
          : mapStripeStatus(stripeObj.status)

        await app.prisma.subscription.update({
          where: { id: sub.id },
          data: {
            status,
            currentPeriodStart: new Date(periodStart * 1000),
            currentPeriodEnd:   new Date(periodEnd   * 1000),
          },
        })

        if (event.type === 'customer.subscription.deleted') {
          writeAuditLog(app.prisma as any, {
            entityId: sub.userId,
            entityType: 'customer',
            event: 'SUBSCRIPTION_CANCELLED',
            ipAddress: 'webhook',
            userAgent: 'stripe',
          })
        } else {
          writeAuditLog(app.prisma as any, {
            entityId: sub.userId,
            entityType: 'customer',
            event: 'SUBSCRIPTION_RENEWED',
            ipAddress: 'webhook',
            userAgent: 'stripe',
          })
        }
        break
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as unknown as {
          id: string
          billing_reason: string
          subscription: string
        }

        if (invoice.billing_reason !== 'subscription_cycle') break

        const sub = await app.prisma.subscription.findUnique({
          where: { stripeSubscriptionId: invoice.subscription },
        })
        if (!sub) break

        await resetVoucherCycleForUser(app.prisma as any, sub.userId)

        writeAuditLog(app.prisma as any, {
          entityId: sub.userId,
          entityType: 'customer',
          event: 'VOUCHER_CYCLE_RESET',
          ipAddress: 'webhook',
          userAgent: 'stripe',
        })

        writeAuditLog(app.prisma as any, {
          entityId: sub.userId,
          entityType: 'customer',
          event: 'SUBSCRIPTION_RENEWED',
          ipAddress: 'webhook',
          userAgent: 'stripe',
          metadata: { invoiceId: invoice.id },
        })
        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as unknown as {
          id: string
          subscription: string
        }

        const sub = await app.prisma.subscription.findUnique({
          where: { stripeSubscriptionId: invoice.subscription },
        })
        if (!sub) break

        await app.prisma.subscription.update({
          where: { id: sub.id },
          data: { status: SubscriptionStatus.PAST_DUE },
        })

        writeAuditLog(app.prisma as any, {
          entityId: sub.userId,
          entityType: 'customer',
          event: 'SUBSCRIPTION_PAYMENT_FAILED',
          ipAddress: 'webhook',
          userAgent: 'stripe',
          metadata: { invoiceId: invoice.id },
        })
        break
      }

      default:
        // Unrecognised event — acknowledge and ignore
        break
    }

    return reply.send({ received: true })
  })
}

function mapStripeStatus(stripeStatus: string): SubscriptionStatus {
  switch (stripeStatus) {
    case 'active':             return SubscriptionStatus.ACTIVE
    case 'trialing':           return SubscriptionStatus.TRIALLING   // note double-L in our enum
    case 'past_due':           return SubscriptionStatus.PAST_DUE
    case 'unpaid':             return SubscriptionStatus.PAST_DUE
    case 'canceled':           return SubscriptionStatus.CANCELLED
    case 'incomplete':         return SubscriptionStatus.PAST_DUE    // payment not yet confirmed
    case 'incomplete_expired': return SubscriptionStatus.EXPIRED     // card confirmation window elapsed
    default:                   return SubscriptionStatus.EXPIRED
  }
}
