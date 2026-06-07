import Stripe from 'stripe'
import { requireSecret } from './env'

export const stripe = new Stripe(requireSecret('STRIPE_SECRET_KEY'), {
  apiVersion: '2026-04-22.dahlia',
})
