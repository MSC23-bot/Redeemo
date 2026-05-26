export const SUPPORT_TOPICS = [
  'Account issue',
  'Subscription',
  'Technical problem',
  'Voucher dispute',
  'General enquiry',
  'Other',
] as const

export type SupportTopic = (typeof SUPPORT_TOPICS)[number]
