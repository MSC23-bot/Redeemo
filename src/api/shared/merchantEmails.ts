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
 * Option B B1 — admin applied a merchant-requested identity edit (merchant
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
 * Option B B1 — admin rejected a merchant-requested identity edit. `reason` is
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
