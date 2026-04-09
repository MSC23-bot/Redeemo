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

    switch (event.type) {
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const stripeObj = event.data.object as unknown as {
          id: string
          status: string
          current_period_start: number
          current_period_end: number
        }

        const sub = await app.prisma.subscription.findUnique({
          where: { stripeSubscriptionId: stripeObj.id },
        })
        if (!sub) break

        const status = (event.type === 'customer.subscription.deleted'
          ? 'CANCELLED'
          : mapStripeStatus(stripeObj.status)) as SubscriptionStatus

        await app.prisma.subscription.update({
          where: { id: sub.id },
          data: {
            status,
            currentPeriodStart: new Date(stripeObj.current_period_start * 1000),
            currentPeriodEnd: new Date(stripeObj.current_period_end * 1000),
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
          data: { status: 'PAST_DUE' as SubscriptionStatus },
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

function mapStripeStatus(stripeStatus: string): string {
  switch (stripeStatus) {
    case 'active':           return 'ACTIVE'
    case 'past_due':         return 'PAST_DUE'
    case 'canceled':         return 'CANCELLED'
    case 'unpaid':           return 'PAST_DUE'
    case 'trialing':         return 'TRIALING'
    case 'incomplete':       return 'INCOMPLETE'
    case 'incomplete_expired': return 'INCOMPLETE_EXPIRED'
    default:                 return 'INACTIVE'
  }
}
