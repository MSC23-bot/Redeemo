export const ERROR_DEFINITIONS = {
  INVALID_CREDENTIALS:            { statusCode: 401, message: 'The email or password is incorrect.' },
  ACCOUNT_NOT_ACTIVE:             { statusCode: 403, message: 'Your account is not yet active. Please complete verification.' },
  ACCOUNT_LOCKED:                 { statusCode: 423, message: 'Your account is temporarily locked. Please try again later.' },
  ACCOUNT_SUSPENDED:              { statusCode: 403, message: 'Your account has been suspended. Please contact support.' },
  EMAIL_NOT_VERIFIED:             { statusCode: 403, message: 'Please verify your email address.' },
  PHONE_NOT_VERIFIED:             { statusCode: 403, message: 'Please verify your phone number.' },
  EMAIL_ALREADY_EXISTS:           { statusCode: 409, message: 'An account with this email already exists.' },
  PHONE_ALREADY_EXISTS:           { statusCode: 409, message: 'This phone number is already linked to a verified account.' },
  OTP_REQUIRED:                   { statusCode: 403, message: 'A one-time code is required to continue.' },
  OTP_INVALID:                    { statusCode: 400, message: 'The code you entered is incorrect.' },
  OTP_EXPIRED:                    { statusCode: 400, message: 'This code has expired. Please request a new one.' },
  OTP_MAX_ATTEMPTS:               { statusCode: 429, message: 'Too many incorrect attempts. Please try again in 5 minutes.' },
  REFRESH_TOKEN_INVALID:          { statusCode: 401, message: 'Your session has expired. Please log in again.' },
  RESET_TOKEN_INVALID:            { statusCode: 400, message: 'This password reset link is invalid.' },
  RESET_TOKEN_EXPIRED:            { statusCode: 400, message: 'This password reset link has expired.' },
  MERCHANT_SUSPENDED:             { statusCode: 403, message: 'This merchant account is suspended.' },
  MERCHANT_NOT_APPROVED:          { statusCode: 403, message: 'This merchant account is not yet approved.' },
  MERCHANT_DEACTIVATED:           { statusCode: 403, message: 'This merchant account is deactivated.' },
  MERCHANT_REACTIVATION_EXPIRED:  { statusCode: 403, message: 'The reactivation window has expired.' },
  BRANCH_USER_DEACTIVATED:        { statusCode: 403, message: 'This branch user account is deactivated.' },
  BRANCH_USER_NOT_FOUND:          { statusCode: 404, message: 'No user is assigned to this branch.' },
  BRANCH_NOT_OWNED:               { statusCode: 403, message: 'You do not have access to this branch.' },
  INSUFFICIENT_PERMISSIONS:       { statusCode: 403, message: 'You do not have permission to perform this action.' },
  ACTION_TOKEN_INVALID:           { statusCode: 400, message: 'This action has expired. Please start again.' },
  PASSWORD_POLICY_VIOLATION:      { statusCode: 400, message: 'Password must be at least 8 characters and include uppercase, lowercase, a number, and a special character.' },
  PASSWORD_CHANGE_REQUIRED:       { statusCode: 403, message: 'You must set a new password before continuing.' },
  VERIFICATION_TOKEN_INVALID:     { statusCode: 400, message: 'This verification link is invalid.' },
  VERIFICATION_TOKEN_EXPIRED:     { statusCode: 400, message: 'This verification link has expired.' },
  MERCHANT_NOT_FOUND:             { statusCode: 404, message: 'Merchant not found.' },
  BRANCH_NOT_FOUND:               { statusCode: 404, message: 'Branch not found.' },
  VOUCHER_NOT_FOUND:              { statusCode: 404, message: 'Voucher not found.' },
  PENDING_EDIT_EXISTS:            { statusCode: 409, message: 'A pending edit already exists. Withdraw it before submitting a new one.' },
  PENDING_EDIT_NOT_FOUND:         { statusCode: 404, message: 'Pending edit not found.' },
  BRANCH_IS_MAIN:                 { statusCode: 409, message: 'Cannot delete the main branch. Promote another branch to main first.' },
  BRANCH_LAST_ACTIVE:             { statusCode: 409, message: 'Cannot delete the only active branch of a live merchant.' },
  VOUCHER_NOT_EDITABLE:           { statusCode: 409, message: 'This voucher cannot be edited in its current state.' },
  VOUCHER_NOT_DELETABLE:          { statusCode: 409, message: 'Only draft vouchers can be deleted.' },
  VOUCHER_NOT_SUBMITTABLE:        { statusCode: 409, message: 'This voucher is not in a state that can be submitted for review.' },
  RMV_NOT_FOUND:                  { statusCode: 404, message: 'RMV voucher not found.' },
  RMV_FIELD_NOT_ALLOWED:          { statusCode: 400, message: 'One or more fields cannot be edited on this RMV voucher.' },
  CATEGORY_CHANGE_BLOCKED:        { statusCode: 409, message: 'Category cannot be changed after RMV vouchers have been submitted. Contact support.' },
  ONBOARDING_GATES_INCOMPLETE:    { statusCode: 409, message: 'Not all onboarding requirements are complete. Check your onboarding checklist.' },
  ALREADY_SUBMITTED:              { statusCode: 409, message: 'This merchant has already been submitted for approval.' },
  CONTRACT_ALREADY_SIGNED:        { statusCode: 409, message: 'The contract has already been accepted.' },
  NO_RMV_TEMPLATE:                { statusCode: 422, message: 'No RMV template found for this category. Please contact Redeemo support.' },
  NO_SENSITIVE_FIELDS:            { statusCode: 400, message: 'No editable sensitive fields were provided. Use PATCH /profile for non-sensitive fields.' },
  SENSITIVE_FIELDS_REQUIRE_EDIT_REQUEST: { statusCode: 400, message: 'Sensitive fields cannot be changed directly. Submit an edit request instead.' },
  PLAN_NOT_FOUND:                  { statusCode: 404, message: 'Subscription plan not found.' },
  SUBSCRIPTION_ALREADY_ACTIVE:     { statusCode: 409, message: 'You already have an active subscription.' },
  SUBSCRIPTION_NOT_FOUND:          { statusCode: 404, message: 'No active subscription found.' },
  PROMO_CODE_INVALID:              { statusCode: 400, message: 'This promo code is invalid or has expired.' },
  PROMO_CODE_EXHAUSTED:            { statusCode: 400, message: 'This promo code has reached its usage limit.' },
  STRIPE_ERROR:                    { statusCode: 502, message: 'Payment provider error. Please try again.' },
  WEBHOOK_SIGNATURE_INVALID:       { statusCode: 400, message: 'Webhook signature verification failed.' },
  SUBSCRIPTION_NOT_CANCELLABLE:    { statusCode: 409, message: 'This subscription cannot be cancelled in its current state.' },
  PAYMENT_METHOD_REQUIRED:         { statusCode: 400, message: 'No payment session found. Please restart the payment flow.' },
  PIN_NOT_CONFIGURED:              { statusCode: 400, message: 'This branch has not configured a redemption PIN.' },
  INVALID_PIN:                     { statusCode: 400, message: 'The PIN you entered is incorrect.' },
  PIN_RATE_LIMIT_EXCEEDED:         { statusCode: 429, message: 'Too many incorrect PIN attempts. Please try again in 15 minutes.' },
  INVALID_PIN_FORMAT:              { statusCode: 400, message: 'PIN must be exactly 4 numeric digits.' },
  SUBSCRIPTION_REQUIRED:           { statusCode: 403, message: 'An active subscription is required to redeem vouchers.' },
  BRANCH_MERCHANT_MISMATCH:        { statusCode: 400, message: 'This branch does not belong to the voucher\'s merchant.' },
  ALREADY_REDEEMED:                { statusCode: 409, message: 'You have already redeemed this voucher in the current cycle.' },
  REDEMPTION_NOT_FOUND:            { statusCode: 404, message: 'Redemption code not found.' },
  ALREADY_VALIDATED:               { statusCode: 409, message: 'This redemption has already been validated.' },
  MERCHANT_MISMATCH:               { statusCode: 403, message: 'This redemption code does not belong to your merchant.' },
  BRANCH_ACCESS_DENIED:            { statusCode: 403, message: 'You do not have access to this branch.' },
} as const

export type ErrorCode = keyof typeof ERROR_DEFINITIONS

// Const object so ErrorCode can be used as a value (e.g. ErrorCode.INVALID_CREDENTIALS)
export const ErrorCode = Object.fromEntries(
  Object.keys(ERROR_DEFINITIONS).map((k) => [k, k])
) as { [K in keyof typeof ERROR_DEFINITIONS]: K }

export class AppError extends Error {
  public readonly code: ErrorCode
  public readonly statusCode: number

  constructor(code: ErrorCode) {
    const def = ERROR_DEFINITIONS[code]
    // Include the code in the message so `.toThrow('CODE')` assertions work in tests.
    // The human-readable message is preserved in toJSON() via ERROR_DEFINITIONS.
    super(code)
    this.code = code
    this.statusCode = def.statusCode
    this.name = 'AppError'
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: ERROR_DEFINITIONS[this.code].message,
        statusCode: this.statusCode,
      },
    }
  }
}
