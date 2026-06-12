// src/api/shared/emailTemplates.ts
//
// Phase 0 PR-0.4: the MINIMAL transactional templates for the email placeholders
// this PR wires (password reset + branch PIN). Plain, accessible HTML — no
// marketing chrome. Richer branded templates + onboarding emails are Phase 6 /
// the merchant-portal phases; this file is deliberately just the two the
// placeholders need.

const BRAND = 'Redeemo'

export type ResetRole = 'customer' | 'merchant' | 'admin'

/** Escape a DB/merchant-controlled string before it goes into email HTML. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Sanitize a value interpolated into an email SUBJECT (a header). Replace every
 * control character (CR/LF, tab, DEL, etc.) with a space and collapse runs, so a
 * merchant-controlled string can never inject extra header lines — defence-in-
 * depth even though the current Resend JSON transport already neutralises this.
 * Implemented with char codes (no control-char literals in source).
 */
function sanitizeHeader(s: string): string {
  const cleaned = Array.from(s, (ch) => {
    const code = ch.charCodeAt(0)
    return code < 0x20 || code === 0x7f ? ' ' : ch
  }).join('')
  return cleaned.replace(/ {2,}/g, ' ').trim()
}

/**
 * Build the role-appropriate password-reset link. Bases are env-driven with dev
 * defaults; production sets WEB_APP_URL / MERCHANT_PORTAL_URL / ADMIN_PANEL_URL.
 * The token is the hex reset token (already URL-safe; encoded defensively).
 */
export function buildPasswordResetLink(role: ResetRole, token: string): string {
  const raw =
    role === 'merchant'
      ? process.env.MERCHANT_PORTAL_URL || 'https://merchant.redeemo.co.uk'
      : role === 'admin'
        ? process.env.ADMIN_PANEL_URL || 'https://admin.redeemo.co.uk'
        : process.env.WEB_APP_URL || 'http://localhost:3001'
  const base = raw.replace(/\/+$/, '')
  return `${base}/reset-password?token=${encodeURIComponent(token)}`
}

export interface RenderedEmail {
  subject: string
  html: string
  text: string
}

/** Password-reset email. The link carries the (short-lived) token; never logged. */
export function passwordResetEmail(link: string): RenderedEmail {
  const safeLink = escapeHtml(link)
  return {
    subject: `Reset your ${BRAND} password`,
    text:
      `We received a request to reset your ${BRAND} password.\n\n` +
      `Reset it using this link (it expires in 1 hour):\n${link}\n\n` +
      `If you did not request this, you can ignore this email and your password stays the same.`,
    html:
      `<p>We received a request to reset your ${BRAND} password.</p>` +
      `<p><a href="${safeLink}">Reset your password</a>. This link expires in 1 hour.</p>` +
      `<p>If you did not request this, you can ignore this email and your password stays the same.</p>`,
  }
}

/**
 * Build the draft-owner account-claim link. Points at the Merchant Portal
 * (Phase 4 — the set-password page lands there). Token is URL-encoded defensively.
 */
export function buildClaimLink(token: string): string {
  const raw = process.env.MERCHANT_PORTAL_URL || 'https://merchant.redeemo.co.uk'
  const base = raw.replace(/\/+$/, '')
  return `${base}/claim?token=${encodeURIComponent(token)}`
}

/** Draft-owner account-claim email. The link carries the single-use token; never logged. */
export function claimAccountEmail(link: string): RenderedEmail {
  const safeLink = escapeHtml(link)
  return {
    subject: `Set up your ${BRAND} merchant account`,
    text:
      `Your ${BRAND} merchant account has been created.\n\n` +
      `Set your password and finish setting up using this link (it expires in 7 days):\n${link}\n\n` +
      `For your security, only you can set this password. If you were not expecting this, you can ignore this email.`,
    html:
      `<p>Your ${BRAND} merchant account has been created.</p>` +
      `<p><a href="${safeLink}">Set your password</a> to finish setting up. This link expires in 7 days.</p>` +
      `<p>For your security, only you can set this password. If you were not expecting this, you can ignore this email.</p>`,
  }
}

/** Branch staff redemption-PIN email. branchName is merchant-controlled ⇒ escaped/sanitized. */
export function branchPinEmail(branchName: string, pin: string): RenderedEmail {
  const safeName = escapeHtml(branchName)
  const safePin = escapeHtml(pin)
  return {
    // Subject is a header — strip control chars from the merchant-controlled name.
    subject: `${BRAND} redemption PIN for ${sanitizeHeader(branchName)}`,
    text:
      `The staff redemption PIN for ${branchName} is ${pin}.\n\n` +
      `Staff enter this PIN in the app to confirm a customer is in-store before validating a voucher. Keep it confidential.`,
    html:
      `<p>The staff redemption PIN for <strong>${safeName}</strong> is:</p>` +
      `<p style="font-size:24px;font-weight:bold;letter-spacing:2px">${safePin}</p>` +
      `<p>Staff enter this PIN in the app to confirm a customer is in-store before validating a voucher. Keep it confidential.</p>`,
  }
}
