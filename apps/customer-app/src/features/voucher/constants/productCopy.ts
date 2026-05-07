/**
 * Product copy constants — Voucher Detail screen
 *
 * **STATUS: TEMPORARY**. The strings in this file are deterministic
 * product copy applied to every voucher because the
 * Admin-managed voucher policy / T&C clause system does not exist
 * yet. They are NOT the final shipping copy; treat them as a
 * placeholder until the policy model lands.
 *
 * Centralising them here so:
 *   • component code is free of hardcoded prose,
 *   • reviewers / legal have one place to audit current language, and
 *   • the eventual swap to backend-sourced policy lines is a small
 *     diff (replace the constants with API calls; keep the function
 *     signatures stable).
 *
 * **Provenance**: lifted verbatim from the locked v4 brainstorm
 * (`.superpowers/brainstorm/88554-1776435672/content/voucher-detail-v4.html`).
 *
 * **Intended product model (deferred to Admin Panel / Phase 5):**
 *   • Fair Use Policy is Redeemo/admin-controlled — NOT merchant-
 *     editable. Admin can add / edit / remove / version policy lines
 *     and assign them by voucher type / template / policy.
 *   • Terms & Conditions are merchant-facing but NOT free-text.
 *     Merchants select from admin-approved clauses when creating a
 *     voucher; voucher.terms today is interim/legacy and will become
 *     a structured list of selected clause ids.
 *   • Voucher Detail will display the admin-approved clauses the
 *     merchant selected, not whatever string the merchant typed.
 *
 * Until that lands, every customer sees the same Fair Use lines per
 * voucher type, and `voucher.terms` is parsed as a free-text
 * paragraph via splitTermsIntoBullets(). See deferred-followups
 * memory entry "Admin-managed voucher policy / T&C clause system".
 */

import type { VoucherType } from '@/lib/api/voucher'

/** Section heading for the Fair Use Policy card. */
export const FAIR_USE_TITLE = 'Fair Use Policy'

/**
 * Universal Fair Use lines that apply to every voucher type. Type-
 * specific lines (e.g. BOGO guest/group rules) are prepended by
 * `fairUseLinesForVoucherType()` below. Keeping the universal set
 * separate so reviewers can see the floor common across all types.
 */
const UNIVERSAL_FAIR_USE: ReadonlyArray<string> = [
  // No em dashes in UI text (project rule, locked 2026-05-02; reaffirmed
  // by PRODUCT.md). Sentences split with periods or paired with shorter
  // clauses instead.
  'Present voucher before ordering. Must be shown before the bill is generated.',
  'Personal use only. Voucher is non-transferable.',
  'Merchant reserves the right to refuse if fair use is not followed.',
]

/**
 * Voucher-type-aware Fair Use lines. Returns a list to render as
 * bullets in the Fair Use Policy card. Type-specific guidance is
 * prepended to the universal lines so the BOGO guest/group rule
 * never appears on a Discount or Spend & Save voucher.
 *
 * Mapping (locked to v4 brainstorm — change with product/legal review):
 *   • BOGO        → "1 voucher per 2 guests. Groups of 4 may use 2,
 *                    groups of 6 may use 3." (table-shared logic)
 *   • PACKAGE_DEAL → "1 voucher per group / table." (single redemption
 *                    even if multiple subscribers in a party)
 *   • everything else → no type-specific line; universal lines only.
 *
 * When backend ships per-type / per-voucher policy data, swap this
 * function to read from the voucher payload with these as fallback.
 */
export function fairUseLinesForVoucherType(type: VoucherType): readonly string[] {
  switch (type) {
    case 'BOGO':
      return [
        '1 voucher per 2 guests. Groups of 4 may use 2, groups of 6 may use 3.',
        ...UNIVERSAL_FAIR_USE,
      ]
    case 'PACKAGE_DEAL':
      return [
        '1 voucher per group / table.',
        ...UNIVERSAL_FAIR_USE,
      ]
    case 'DISCOUNT_FIXED':
    case 'DISCOUNT_PERCENT':
    case 'FREEBIE':
    case 'SPEND_AND_SAVE':
    case 'TIME_LIMITED':
    case 'REUSABLE':
    default:
      return UNIVERSAL_FAIR_USE
  }
}

/**
 * Voucher-type explainer card (locked 2026-05-07 from device QA).
 *
 * The Voucher Detail page already shows the merchant-authored
 * `voucher.description` in the hero teaser. The explainer card sits
 * separately and educates the customer about what THIS TYPE of
 * voucher means in general — e.g. "what is a BOGO" — so first-time
 * users understand the offer category before they tap Redeem. Copy
 * is type-driven (NOT description-driven); the merchant's own offer
 * detail is unchanged.
 *
 * Voucher type list is locked at the 8 enum values in
 * `prisma/schema.prisma` `VoucherType`: BOGO, FREEBIE,
 * SPEND_AND_SAVE, DISCOUNT_FIXED, DISCOUNT_PERCENT, PACKAGE_DEAL,
 * TIME_LIMITED, REUSABLE.
 *
 * **REUSABLE wording — important.** REUSABLE is currently
 * label-only in the backend; it does NOT bypass the
 * once-per-cycle rule (see `src/api/redemption/service.ts` cycle
 * lockout — no type-aware branch, ALREADY_REDEEMED fires for
 * REUSABLE the same as any other type). The explainer must NOT
 * imply unlimited reuse. Today's accurate description: an offer
 * that the merchant runs continuously, returning next cycle,
 * still subject to one-per-cycle.
 */
export const VOUCHER_TYPE_EXPLAINER_TITLE = 'What this voucher means'

export function voucherTypeExplainer(type: VoucherType): string {
  switch (type) {
    case 'BOGO':
      return "Buy one eligible item and get a second item — either free or discounted, depending on the offer. Ask staff which items qualify before ordering."
    case 'FREEBIE':
      return "Claim a free item or add-on when you meet the offer's conditions. Check the voucher details for exactly what's included."
    case 'SPEND_AND_SAVE':
      return "Spend the amount shown to unlock the saving on this voucher. Check the merchant's terms for what counts towards the threshold."
    case 'DISCOUNT_FIXED':
      return "Get a fixed amount off your bill or eligible items, as set by the merchant. The voucher details list what qualifies."
    case 'DISCOUNT_PERCENT':
      return "Get a percentage off your bill or eligible items, as set by the merchant. The voucher details list what qualifies."
    case 'PACKAGE_DEAL':
      return "A bundle or set-menu offer. The voucher details list exactly what's included and any conditions."
    case 'TIME_LIMITED':
      return "This voucher is only redeemable during specific times or days. Check availability before ordering."
    case 'REUSABLE':
      // Honest about current backend semantics — REUSABLE is a
      // merchant intent flag (the offer persists across cycles), not
      // a per-cycle bypass. One redemption per cycle still applies.
      return "An ongoing offer the merchant runs continuously. Like all vouchers, you can redeem this once per cycle — it returns again next cycle."
    default: {
      // Exhaustiveness guard — if a new VoucherType is added to the
      // enum without updating this switch, TS will error here. At
      // runtime fall back to a generic description so the screen
      // doesn't break for an unknown type.
      const _exhaustive: never = type
      void _exhaustive
      return "Check the voucher details for what's included and how to redeem."
    }
  }
}

/**
 * "How It Works" steps — voucher-detail-specific, two variants.
 *
 * Round 17 (owner direction): both variants are now 5 steps. Steps
 * 2-5 are identical across the two lists; only step 1 changes
 * (Subscribe-to-Unlock for free users; Review-the-Voucher for
 * subscribed users).
 *
 * "Tell Staff First" is included in both — fairness + dispute
 * avoidance: the merchant needs to know before the bill is
 * generated.
 */

const STEPS_2_TO_5: ReadonlyArray<{ label: string; desc: string }> = [
  {
    label: 'Tell Staff First',
    desc: 'Before ordering or purchasing, let staff know you’ll be using a Redeemo voucher.',
  },
  {
    label: 'Redeem When Ready',
    desc: 'When staff are ready, tap “Redeem This Voucher” and ask them for the branch PIN.',
  },
  {
    label: 'Enter the Branch PIN',
    desc: 'Enter the branch PIN provided by staff to confirm the redemption.',
  },
  {
    label: 'Show & Save',
    desc: 'Show your live code or QR to staff, then enjoy the saving once it’s applied.',
  },
]

/**
 * Free-user "How It Works" — 5 steps. First step is the conversion
 * gate; remaining four are the redemption flow.
 */
export const HOW_IT_WORKS_STEPS_FREE: ReadonlyArray<{ label: string; desc: string }> = [
  {
    label: 'Subscribe to Unlock',
    desc: 'Choose a monthly or annual plan to unlock this voucher and all other eligible vouchers across Redeemo.',
  },
  ...STEPS_2_TO_5,
]

/**
 * Subscribed-user "How It Works" — 5 steps. First step is the
 * orientation prompt; remaining four are the redemption flow.
 */
export const HOW_IT_WORKS_STEPS_SUBSCRIBED: ReadonlyArray<{ label: string; desc: string }> = [
  {
    label: 'Review the Voucher',
    desc: 'Check the offer, terms, fair-use policy, and selected branch before ordering.',
  },
  ...STEPS_2_TO_5,
]

/** CTA labels (Title Case to match v4 mockup). */
export const CTA_LABELS = {
  redeemActive:    'Redeem This Voucher',
  redeemSubscribe: 'Subscribe to Redeem · £6.99/mo',
  redeemed:        'Already Redeemed This Cycle',
  expired:         'Expired',
  unavailable:     'Currently Unavailable',
  branchLoading:   'Resolving Branch…',
} as const

/**
 * Helper — splits a paragraph-format `terms` string into bullet items
 * for display. Backend currently stores Voucher.terms as a single
 * string with sentences separated by period+space. When merchants
 * later format with line-breaks, those win. Falls back to a single-
 * item list (the entire string) if no boundaries are found.
 */
export function splitTermsIntoBullets(terms: string | null): string[] {
  if (!terms) return []
  const trimmed = terms.trim()
  if (!trimmed) return []
  // Prefer line-break splits when the merchant has formatted with
  // newlines. Otherwise split on sentence boundaries (period followed
  // by whitespace + capital letter), which handles paragraph-format
  // seed data like "In-house only. Cannot be combined with other
  // offers. Once per cycle." cleanly.
  const items = trimmed.includes('\n')
    ? trimmed.split(/\r?\n+/)
    : trimmed.split(/(?<=[.!?])\s+(?=[A-Z])/)
  return items
    .map(s => s.replace(/^\s+|\s+$/g, '').replace(/\.$/, ''))
    .filter(Boolean)
}

/**
 * Heuristic — derive a "Dine-in only" pill from the voucher's terms
 * string when one of the bullets looks like a dine-in / in-house
 * restriction. The seed data and current merchant input both use
 * "In-house only" / "Dine-in only" verbatim near the start of a
 * sentence, so we match those exact phrases case-insensitively at
 * the head of any bullet.
 *
 * **Why not invent it?** Reviewers were concerned about Claude-generated
 * placeholder content. We don't fabricate the pill — we surface it
 * ONLY when the merchant-authored terms text already says it. This is
 * safer than a fixed pill but still gives v4 visual parity for
 * vouchers whose terms include the phrase.
 *
 * **Future direction**: replace with a structured `policyTags` field
 * on Voucher (e.g. ['DINE_IN_ONLY', 'TAKEAWAY_OK']). When that lands,
 * this heuristic becomes a fallback. Until then, no terms string with
 * "dine-in" → no pill (avoids false positives).
 */
export function deriveDineInPill(terms: string | null): string | null {
  if (!terms) return null
  const bullets = splitTermsIntoBullets(terms)
  for (const b of bullets) {
    if (/^(in[- ]house|dine[- ]in)\s*only/i.test(b)) {
      return 'Dine-in only'
    }
  }
  return null
}
