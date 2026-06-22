// src/api/shared/merchantEmails.ts
//
// Phase 2 Slice 1 M3 — merchant onboarding lifecycle email templates for the
// actioner review loop: changes-requested + rejected. M5 adds the "you're
// live" approval template (it owns the action that fires it). Plain,
// accessible HTML; the admin-supplied `reason` is merchant-facing and escaped.

import { escapeHtml, type RenderedEmail } from './emailTemplates'

const BRAND = 'Redeemo'

/**
 * Admin requested changes on a merchant's onboarding submission. `reason` is
 * admin-controlled free text shown to the merchant ⇒ HTML-escaped.
 */
export function merchantChangesRequestedEmail(reason: string): RenderedEmail {
  const safeReason = escapeHtml(reason)
  return {
    subject: `Changes requested on your ${BRAND} application`,
    text:
      `We reviewed your ${BRAND} merchant application and need a few changes before we can approve it.\n\n` +
      `What to change:\n${reason}\n\n` +
      `Sign in to your merchant portal, make the changes, and resubmit. We will review it again as soon as you do.`,
    html:
      `<p>We reviewed your ${BRAND} merchant application and need a few changes before we can approve it.</p>` +
      `<p><strong>What to change:</strong></p>` +
      `<blockquote>${safeReason}</blockquote>` +
      `<p>Sign in to your merchant portal, make the changes, and resubmit. We will review it again as soon as you do.</p>`,
  }
}

/**
 * Admin rejected a merchant's onboarding submission. `reason` is admin-controlled
 * free text shown to the merchant ⇒ HTML-escaped.
 */
export function merchantRejectedEmail(reason: string): RenderedEmail {
  const safeReason = escapeHtml(reason)
  return {
    subject: `Update on your ${BRAND} application`,
    text:
      `Thank you for your interest in ${BRAND}. After review, we are unable to approve your merchant application at this time.\n\n` +
      `Reason:\n${reason}\n\n` +
      `If you believe this was a mistake or would like to discuss it, please contact our merchant support team.`,
    html:
      `<p>Thank you for your interest in ${BRAND}. After review, we are unable to approve your merchant application at this time.</p>` +
      `<p><strong>Reason:</strong></p>` +
      `<blockquote>${safeReason}</blockquote>` +
      `<p>If you believe this was a mistake or would like to discuss it, please contact our merchant support team.</p>`,
  }
}

/**
 * Option B B1: admin applied a merchant-requested identity edit (merchant
 * profile or branch identity field). No admin free text is shown; only the
 * brand name is interpolated, so nothing here is admin-controlled.
 */
export function merchantEditAppliedEmail(): RenderedEmail {
  return {
    subject: `Your requested change has been applied on ${BRAND}`,
    text:
      `Good news: the change you requested has been reviewed and applied to your ${BRAND} listing.\n\n` +
      `Sign in to your merchant portal to see it live. If something is not right, you can request another change from the portal.`,
    html:
      `<p>Good news: the change you requested has been reviewed and applied to your ${BRAND} listing.</p>` +
      `<p>Sign in to your merchant portal to see it live. If something is not right, you can request another change from the portal.</p>`,
  }
}

/**
 * Option B B1: admin rejected a merchant-requested identity edit. `reason` is
 * admin-controlled free text shown to the merchant ⇒ HTML-escaped.
 */
export function merchantEditRejectedEmail(reason: string): RenderedEmail {
  const safeReason = escapeHtml(reason)
  return {
    subject: `Update on your requested change on ${BRAND}`,
    text:
      `We reviewed the change you requested on your ${BRAND} listing and were unable to apply it.\n\n` +
      `Reason:\n${reason}\n\n` +
      `Your listing has not changed. You can review the note and submit a new request from your merchant portal.`,
    html:
      `<p>We reviewed the change you requested on your ${BRAND} listing and were unable to apply it.</p>` +
      `<p><strong>Reason:</strong></p>` +
      `<blockquote>${safeReason}</blockquote>` +
      `<p>Your listing has not changed. You can review the note and submit a new request from your merchant portal.</p>`,
  }
}

/**
 * Option B B3: an admin submitted the merchant's onboarding application for
 * review ON THE MERCHANT'S BEHALF. `businessName` is the merchant's own name
 * shown back to them; HTML-escaped defensively. No admin free text is shown.
 */
export function merchantSubmittedOnBehalfEmail(businessName: string): RenderedEmail {
  const safeName = escapeHtml(businessName)
  return {
    subject: `Your ${BRAND} application was submitted for review`,
    text:
      `The ${BRAND} team submitted your merchant application for ${businessName} for review on your behalf.\n\n` +
      `There is nothing you need to do right now. We will let you know the outcome, and you can check progress any time by signing in to your merchant portal.`,
    html:
      `<p>The ${BRAND} team submitted your merchant application for ${safeName} for review on your behalf.</p>` +
      `<p>There is nothing you need to do right now. We will let you know the outcome, and you can check progress any time by signing in to your merchant portal.</p>`,
  }
}

// ─── Day-2 Vouchers: VOUCHER approval-lane email templates ───────────────────
//
// The merchant email channel for voucher decisions is dark/deferred (notify()
// requires an email payload, so we construct real templates and pass them, but
// delivery stays off this milestone - the user-visible signal is the in-app
// VOUCHER_APPROVAL_UPDATE bell). `voucherTitle` is the merchant's own offer name
// shown back to them; HTML-escaped defensively. `reason` (changes/reject) is
// admin-controlled merchant-facing free text to HTML-escaped.

/** A voucher was approved and is live now (merchant + flagship already live). */
export function voucherApprovedLiveEmail(voucherTitle: string): RenderedEmail {
  const safe = escapeHtml(voucherTitle)
  return {
    subject: `Your ${BRAND} voucher is approved and live`,
    text:
      `Good news: your voucher "${voucherTitle}" has been approved and is now live on ${BRAND}.\n\n` +
      `Members in your area can find and redeem it from today. Sign in to your merchant portal to see it.`,
    html:
      `<p>Good news: your voucher "${safe}" has been approved and is now live on ${BRAND}.</p>` +
      `<p>Members in your area can find and redeem it from today. Sign in to your merchant portal to see it.</p>`,
  }
}

/** A voucher was approved but is waiting for the merchant to go live. */
export function voucherApprovedWaitingEmail(voucherTitle: string): RenderedEmail {
  const safe = escapeHtml(voucherTitle)
  return {
    subject: `Your ${BRAND} voucher is approved`,
    text:
      `Your voucher "${voucherTitle}" has been approved on ${BRAND}.\n\n` +
      `It will go live automatically once your business is live and your flagship vouchers are live. ` +
      `There is nothing more you need to do.`,
    html:
      `<p>Your voucher "${safe}" has been approved on ${BRAND}.</p>` +
      `<p>It will go live automatically once your business is live and your flagship vouchers are live. ` +
      `There is nothing more you need to do.</p>`,
  }
}

/** A previously-approved-waiting voucher just went live (delayed activation). */
export function voucherNowLiveEmail(voucherTitle: string): RenderedEmail {
  const safe = escapeHtml(voucherTitle)
  return {
    subject: `Your ${BRAND} voucher is now live`,
    text:
      `Your approved voucher "${voucherTitle}" is now live on ${BRAND}.\n\n` +
      `Members in your area can find and redeem it from today.`,
    html:
      `<p>Your approved voucher "${safe}" is now live on ${BRAND}.</p>` +
      `<p>Members in your area can find and redeem it from today.</p>`,
  }
}

/**
 * Fix 2 (notification-loss): when go-live activates MORE THAN ONE approved-waiting
 * custom at once, a SINGLE batched now-live notification is sent (one per voucher
 * would lose the 6th+ to notify()'s 5/hour per-(type,recipient) send limit before
 * the in-app row is written). `count` is server-computed (the activated set size),
 * not free text, so nothing here is admin/merchant-controlled.
 */
export function voucherNowLiveBatchEmail(count: number): RenderedEmail {
  return {
    subject: `Your ${BRAND} vouchers are now live`,
    text:
      `${count} of your custom vouchers are now live on ${BRAND}.\n\n` +
      `Members in your area can find and redeem them from today. Sign in to your merchant portal to see them.`,
    html:
      `<p>${count} of your custom vouchers are now live on ${BRAND}.</p>` +
      `<p>Members in your area can find and redeem them from today. Sign in to your merchant portal to see them.</p>`,
  }
}

/** Admin requested changes on a voucher. `reason` is admin-controlled to escaped. */
export function voucherChangesRequestedEmail(voucherTitle: string, reason: string): RenderedEmail {
  const safeTitle = escapeHtml(voucherTitle)
  const safeReason = escapeHtml(reason)
  return {
    subject: `Changes requested on your ${BRAND} voucher`,
    text:
      `We reviewed your voucher "${voucherTitle}" and need a few changes before we can approve it.\n\n` +
      `What to change:\n${reason}\n\n` +
      `Sign in to your merchant portal, update the voucher, and resubmit. We will review it again as soon as you do.`,
    html:
      `<p>We reviewed your voucher "${safeTitle}" and need a few changes before we can approve it.</p>` +
      `<p><strong>What to change:</strong></p>` +
      `<blockquote>${safeReason}</blockquote>` +
      `<p>Sign in to your merchant portal, update the voucher, and resubmit. We will review it again as soon as you do.</p>`,
  }
}

/** Admin rejected a voucher. `reason` is admin-controlled to escaped. */
export function voucherRejectedEmail(voucherTitle: string, reason: string): RenderedEmail {
  const safeTitle = escapeHtml(voucherTitle)
  const safeReason = escapeHtml(reason)
  return {
    subject: `Update on your ${BRAND} voucher`,
    text:
      `After review, we are unable to approve your voucher "${voucherTitle}" on ${BRAND} at this time.\n\n` +
      `Reason:\n${reason}\n\n` +
      `You can duplicate it and submit a fresh version from your merchant portal.`,
    html:
      `<p>After review, we are unable to approve your voucher "${safeTitle}" on ${BRAND} at this time.</p>` +
      `<p><strong>Reason:</strong></p>` +
      `<blockquote>${safeReason}</blockquote>` +
      `<p>You can duplicate it and submit a fresh version from your merchant portal.</p>`,
  }
}

/**
 * Admin approved a merchant's onboarding and the merchant is now live. M5 owns
 * this template. `businessName` is the merchant's own name shown back to them;
 * HTML-escaped defensively so a name with markup can't break the body.
 */
export function merchantLiveEmail(businessName: string): RenderedEmail {
  const safeName = escapeHtml(businessName)
  return {
    subject: `You're live on ${BRAND}`,
    text:
      `Your business is now live on ${BRAND}. Members can find ${businessName} and redeem your offers from today.\n\n` +
      `What happens now:\n` +
      `- Your offers are visible to members in your area.\n` +
      `- Staff validate every redemption in the ${BRAND} merchant app by QR scan or code entry.\n` +
      `- You can see each redemption, with full reconciliation data, in your merchant portal.\n\n` +
      `Sign in to your portal any time to manage your offers, branches, and team.`,
    html:
      `<p>Your business is now live on ${BRAND}. Members can find ${safeName} and redeem your offers from today.</p>` +
      `<p><strong>What happens now:</strong></p>` +
      `<ul>` +
      `<li>Your offers are visible to members in your area.</li>` +
      `<li>Staff validate every redemption in the ${BRAND} merchant app by QR scan or code entry.</li>` +
      `<li>You can see each redemption, with full reconciliation data, in your merchant portal.</li>` +
      `</ul>` +
      `<p>Sign in to your portal any time to manage your offers, branches, and team.</p>`,
  }
}
