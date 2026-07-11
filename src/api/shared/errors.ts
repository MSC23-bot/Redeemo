export const ERROR_DEFINITIONS = {
  INVALID_CREDENTIALS:            { statusCode: 401, message: 'The email or password is incorrect.' },
  ACCOUNT_INACTIVE:               { statusCode: 403, message: "This account isn't active. Please contact support." },
  ACCOUNT_SUSPENDED:              { statusCode: 403, message: 'Your account has been suspended. Please contact support.' },
  EMAIL_NOT_VERIFIED:             { statusCode: 403, message: 'Please verify your email address.' },
  PHONE_NOT_VERIFIED:             { statusCode: 403, message: 'Please verify your phone number.' },
  ALREADY_VERIFIED:               { statusCode: 409, message: 'This account is already verified.' },
  EMAIL_ALREADY_EXISTS:           { statusCode: 409, message: 'An account with this email already exists.' },
  PHONE_ALREADY_EXISTS:           { statusCode: 409, message: 'This phone number is already linked to a verified account.' },
  OTP_REQUIRED:                   { statusCode: 403, message: 'A one-time code is required to continue.' },
  OTP_INVALID:                    { statusCode: 400, message: 'The code you entered is incorrect.' },
  OTP_EXPIRED:                    { statusCode: 400, message: 'This code has expired. Please request a new one.' },
  OTP_MAX_ATTEMPTS:               { statusCode: 429, message: 'Too many incorrect attempts. Please try again in 5 minutes.' },
  // SEC-H3 (Gate-PR-7): SMS/OTP toll-fraud controls. Details may carry `retryAfter` (seconds).
  SMS_DESTINATION_NOT_ALLOWED:    { statusCode: 400, message: "We can't send a verification code to this number." },
  OTP_RESEND_COOLDOWN:            { statusCode: 429, message: 'Please wait a moment before requesting another code.' },
  SMS_RATE_LIMITED:               { statusCode: 429, message: 'Too many code requests. Please try again later.' },
  SMS_GLOBAL_LIMIT:               { statusCode: 429, message: 'Verification codes are temporarily unavailable. Please try again later.' },
  REFRESH_TOKEN_INVALID:          { statusCode: 401, message: 'Your session has expired. Please log in again.' },
  // Distinct from REFRESH_TOKEN_INVALID — fired when the previous mobile
  // session was deliberately superseded by a newer login on another
  // device. The customer app maps this to specific copy:
  // "Your account was signed in on another device, so this session has
  // ended." See `apps/customer-app/src/app-bootstrap/SessionExpiredBridge.tsx`.
  // Locked product rule: one mobile device per account at a time.
  SESSION_REPLACED:               { statusCode: 401, message: 'Your account was signed in on another device, so this session has ended.' },
  // Distinct from REFRESH_TOKEN_INVALID (token merely expired) — fired when a
  // still-valid access token belongs to a session that was REVOKED (admin
  // merchant suspension, logout, or password reset deleted its refresh token).
  // Lets revocation take effect before the access-token TTL, not only at refresh.
  SESSION_REVOKED:                { statusCode: 401, message: 'Your session has ended. Please log in again.' },
  RESET_TOKEN_INVALID:            { statusCode: 400, message: 'This password reset link is invalid.' },
  RESET_TOKEN_EXPIRED:            { statusCode: 400, message: 'This password reset link has expired.' },
  CLAIM_TOKEN_EXPIRED:            { statusCode: 400, message: 'This account setup link is invalid or has expired.' },
  // SEC-H4 (Gate-PR-8): password-reset request abuse control. details.retryAfter (seconds).
  // Generic by design — never reveals whether the email belongs to a real account.
  PWD_RESET_RATE_LIMITED:         { statusCode: 429, message: 'Too many password reset requests. Please try again later.' },
  MERCHANT_SUSPENDED:             { statusCode: 403, message: 'This merchant account is suspended.' },
  // Insights PR-A (lifecycle decision A / SEC-M2 preserved). Insights requires
  // Merchant.status === 'ACTIVE' server-side before any query. resolveMerchantContext
  // already hard-blocks SUSPENDED (MERCHANT_SUSPENDED); this single typed code
  // additionally blocks REGISTERED / PENDING_APPROVAL / INACTIVE / DELETED (and a
  // missing merchant), so pre-live merchants are server-blocked, not just UI-hidden.
  MERCHANT_NOT_ACTIVE:            { statusCode: 403, message: 'This merchant account is not active.' },
  MERCHANT_NOT_APPROVED:          { statusCode: 403, message: 'This merchant account is not yet approved.' },
  MERCHANT_DEACTIVATED:           { statusCode: 403, message: 'This merchant account is deactivated.' },
  MERCHANT_REACTIVATION_EXPIRED:  { statusCode: 403, message: 'The reactivation window has expired.' },
  MERCHANT_UNAVAILABLE:           { statusCode: 404, message: 'This merchant is no longer available.' },
  BRANCH_USER_DEACTIVATED:        { statusCode: 403, message: 'This branch user account is deactivated.' },
  BRANCH_USER_NOT_FOUND:          { statusCode: 404, message: 'No user is assigned to this branch.' },
  BRANCH_NOT_OWNED:               { statusCode: 403, message: 'You do not have access to this branch.' },
  INSUFFICIENT_PERMISSIONS:       { statusCode: 403, message: 'You do not have permission to perform this action.' },
  // Staff & Access (v1) PR-A. Code-only additions (not schema).
  // MULTIPLE_BRANCH_USERS (§5.3): a branch has >1 BranchUser, so a reset/
  // deactivate/reactivate action keyed by branchId is ambiguous — the service
  // refuses (mutates nothing) instead of acting on a non-deterministic findFirst
  // row. MULTI_MEMBERSHIP_UNSUPPORTED (§4.1): a person somehow holds >1 ACTIVE
  // MerchantMembership; resolveMerchantContext/getActiveMembership refuse
  // deterministically (multi-merchant identity is deferred). Role/owner/
  // capability denials REUSE INSUFFICIENT_PERMISSIONS (403) above — no new
  // generic forbidden code.
  MULTIPLE_BRANCH_USERS:          { statusCode: 409, message: 'This branch has more than one app user. Use the app-management screen to choose which one to update.' },
  MULTI_MEMBERSHIP_UNSUPPORTED:   { statusCode: 400, message: 'This account is linked to more than one business, which is not supported yet.' },
  // Phase 2 Slice 1 M1: ownership-integrity guard. A merchant must always
  // retain at least one ACTIVE OWNER membership.
  LAST_OWNER_PROTECTED:           { statusCode: 409, message: 'This is the only owner of the merchant account and cannot be removed or deactivated.' },
  // Phase 2 Slice 1 M2: admin capability gate.
  ADMIN_CAPABILITY_DENIED:        { statusCode: 403, message: 'You do not have permission to perform this action.' },
  // Team & Roles S1: SUPER_ADMIN team-management surface (admin:manage-team).
  ADMIN_NOT_FOUND:                { statusCode: 404, message: 'Admin account not found.' },
  // A capability grant was requested for a capability that is not on the
  // server-side GRANTABLE_CAPABILITIES allow-list (privilege-escalation guard).
  CAPABILITY_NOT_GRANTABLE:       { statusCode: 400, message: 'This capability cannot be granted.' },
  GRANT_NOT_FOUND:                { statusCode: 404, message: 'No active grant of this capability exists for this admin.' },
  // Self-lockout guard: an admin cannot deactivate their own account.
  ADMIN_SELF_ACTION_FORBIDDEN:    { statusCode: 400, message: 'You cannot perform this action on your own account.' },
  // Last-super-admin lockout guard: the platform must keep >=1 active SUPER_ADMIN.
  LAST_SUPER_ADMIN_PROTECTED:     { statusCode: 409, message: 'The last active Super Admin cannot be demoted or deactivated.' },
  // Team & Roles S3 (spec §4.2): FIELD pre-live scope guard. A FIELD rep's
  // on-behalf caps (edit / submit / manage-branches / manage-documents /
  // manage-vouchers) apply ONLY to pre-live merchants (REGISTERED /
  // PENDING_APPROVAL). This 403 fires when a FIELD actor targets a merchant that
  // has gone live (ACTIVE / INACTIVE / SUSPENDED / DELETED). OPERATIONS and
  // SUPER_ADMIN are never scope-restricted (they act on any merchant).
  MERCHANT_NOT_PRE_LIVE_FOR_FIELD: { statusCode: 403, message: 'Field reps can only act on merchants that are still being onboarded.' },
  // Phase 2 Slice 1 M3: actioner.
  APPROVAL_NOT_FOUND:             { statusCode: 404, message: 'Approval not found.' },
  APPROVAL_ALREADY_CLAIMED:       { statusCode: 409, message: 'This approval is already being reviewed by another admin.' },
  APPROVAL_NOT_ACTIONABLE:        { statusCode: 409, message: 'This approval is not in a state that can be actioned.' },
  // Day-2 Vouchers PR-A (Fix 1): the voucher's OWN status is not PENDING_AWAITING
  // approval. Distinct from APPROVAL_NOT_ACTIONABLE (which gates the AdminApproval
  // status). A CHANGES_REQUESTED AdminApproval is "actionable", but if the voucher
  // is still DRAFT (the merchant has not resubmitted), approving/rejecting/
  // requesting-changes would act on a not-genuinely-submitted voucher (force-
  // publishing a DRAFT). The voucher-decision handlers re-validate the entity
  // status and throw this when voucher.status !== 'PENDING_APPROVAL', mirroring
  // editApplier's independent re-validation of the underlying entity.
  VOUCHER_NOT_ACTIONABLE:         { statusCode: 409, message: 'This voucher is not in a state that can be actioned.' },
  // Phase 2 Slice 1 M5: release-owner guard (D1). Only the admin who CLAIMED the
  // approval, or a SUPER_ADMIN (force-release), may release it. An ordinary admin
  // releasing another admin's claim is refused with this code.
  APPROVAL_NOT_CLAIMER:           { statusCode: 403, message: 'Only the admin who claimed this approval, or a super admin, can release it.' },
  // Option B B1 (admin pending-edit applier). The underlying MerchantPendingEdit
  // / BranchPendingEdit is no longer PENDING (already approved, rejected, or
  // withdrawn), so the linked approval cannot be applied or rejected.
  PENDING_EDIT_NOT_ACTIONABLE:    { statusCode: 409, message: 'This edit request is no longer pending and cannot be actioned.' },
  // Option B B1: a BRANCH_IDENTITY_EDIT that includes photo changes cannot be
  // applied by B1 (photo apply ships in a follow-up). The edit can still be
  // rejected. (Field-only branch edits and merchant identity edits ARE applied.)
  EDIT_PHOTO_APPLY_NOT_SUPPORTED: { statusCode: 409, message: 'Photo edits cannot be applied yet. You can reject this request, or apply it in a future update.' },
  ACTION_TOKEN_INVALID:           { statusCode: 400, message: 'This action has expired. Please start again.' },
  PASSWORD_POLICY_VIOLATION:      { statusCode: 400, message: 'Password must be at least 8 characters and include uppercase, lowercase, a number, and a special character.' },
  PASSWORD_CHANGE_REQUIRED:       { statusCode: 403, message: 'You must set a new password before continuing.' },
  VERIFICATION_TOKEN_INVALID:     { statusCode: 400, message: 'This verification link is invalid.' },
  VERIFICATION_TOKEN_EXPIRED:     { statusCode: 400, message: 'This verification link has expired.' },
  // M1 Slice R: self-serve merchant registration captcha (Cloudflare Turnstile).
  CAPTCHA_FAILED:                 { statusCode: 400, message: "We couldn't verify that you're human. Please try again." },
  MERCHANT_NOT_FOUND:             { statusCode: 404, message: 'Merchant not found.' },
  BRANCH_NOT_FOUND:               { statusCode: 404, message: 'Branch not found.' },
  BRANCH_UNAVAILABLE:             { statusCode: 404, message: 'This branch is no longer available.' },
  // Branch Location Trust Slice 3 (pin-drop addendum §5.2 / D-L5, APPROVED
  // 2026-07-09): the merchant pin-drop endpoint is admitted ONLY for a branch
  // whose location is not yet confirmed (locationConfidence POSTCODE_CENTROID or
  // NEEDS_REVIEW). A branch already at a confirmed tier (ADDRESS_GEOCODED /
  // MANUALLY_CONFIRMED / MERCHANT_CONFIRMED) is rejected here so a merchant can
  // never overwrite a verified pin with a self-asserted one (no-downgrade rule);
  // correcting a wrong verified pin stays an admin action.
  BRANCH_LOCATION_ALREADY_CONFIRMED: { statusCode: 409, message: 'This branch location is already confirmed and cannot be replaced with a self-set pin.' },
  // Branch Location Trust Slice 3: the backend-proxied static map preview is DARK
  // by default (mirrors STORAGE_ENABLED / EMAIL_ENABLED). When the Google Static
  // Maps key is not configured the endpoint fails closed with this typed error and
  // NEVER constructs a provider request. Also returned when the local usage cap is
  // reached (cost circuit-breaker).
  MAP_PREVIEW_NOT_ENABLED:        { statusCode: 503, message: 'Map preview is not available right now. Please try again later.' },
  PHOTO_LIMIT_REACHED:            { statusCode: 409, message: 'This branch has reached its photo limit. Remove a photo before adding another.' },
  // Branches PR-3 (instant photo-removal). Additive code-only (no schema).
  // BRANCH_PHOTO_NOT_FOUND: the targeted BranchPhoto id is not on this branch
  // (unknown / cross-branch). PHOTO_NOT_REMOVABLE: the instant-removal route only
  // deletes a live (moderationStatus APPROVED) photo; a PENDING/FLAGGED row is
  // guarded out (pending adds are not rows, so they never reach this).
  BRANCH_PHOTO_NOT_FOUND:         { statusCode: 404, message: 'Photo not found.' },
  PHOTO_NOT_REMOVABLE:            { statusCode: 409, message: 'This photo cannot be removed in its current state.' },
  // Branches PR-3 (P1 trust-boundary fix). A photo edit-request `add` URL must be
  // an OWNED upload our storage minted for THIS merchant's `photo` kind
  // (`${R2_PUBLIC_BASE_URL}/photo/<merchantId>/...`). An external origin, an
  // other-merchant ownerId, an other-kind (logo/banner/document/voucher), or a
  // malformed/traversal key is rejected here so an admin-apply can never create an
  // unvalidated external image as an APPROVED branch photo. Additive code-only.
  INVALID_PHOTO_URL:              { statusCode: 400, message: 'One or more photo URLs are not valid uploaded images.' },
  VOUCHER_NOT_FOUND:              { statusCode: 404, message: 'Voucher not found.' },
  USER_NOT_FOUND:                 { statusCode: 404, message: 'User not found.' },
  PENDING_EDIT_EXISTS:            { statusCode: 409, message: 'A pending edit already exists. Withdraw it before submitting a new one.' },
  PENDING_EDIT_NOT_FOUND:         { statusCode: 404, message: 'Pending edit not found.' },
  // Branches PR-4 (§4b): no PENDING opening-hours change to cancel for this branch.
  PENDING_HOURS_NOT_FOUND:        { statusCode: 404, message: 'No pending opening-hours change to cancel.' },
  BRANCH_IS_MAIN:                 { statusCode: 409, message: 'Cannot delete the main branch. Promote another branch to main first.' },
  BRANCH_LAST_ACTIVE:             { statusCode: 409, message: 'Cannot delete the only active branch of a live merchant.' },
  // Branches PR-5 (D5, branch lifecycle). Additive code-only.
  // BRANCH_NOT_PENDING_CREATE: cancel-pending-create targeted a branch that is not
  //   awaiting create approval (already LIVE / closed / mid-close), so there is
  //   nothing to cancel.
  // BRANCH_CLOSE_REQUEST_EXISTS: the branch already has an open close request
  //   (lifecycleStatus PENDING_CLOSE) — withdraw it before requesting again.
  // BRANCH_CLOSE_REQUEST_NOT_FOUND: withdraw-close found no open close request for
  //   the branch.
  BRANCH_NOT_PENDING_CREATE:      { statusCode: 409, message: 'This branch is not awaiting create approval.' },
  BRANCH_CLOSE_REQUEST_EXISTS:    { statusCode: 409, message: 'A close request is already pending for this branch.' },
  BRANCH_CLOSE_REQUEST_NOT_FOUND: { statusCode: 404, message: 'No pending close request to withdraw.' },
  VOUCHER_NOT_EDITABLE:           { statusCode: 409, message: 'This voucher cannot be edited in its current state.' },
  VOUCHER_NOT_DELETABLE:          { statusCode: 409, message: 'Only draft vouchers can be deleted.' },
  VOUCHER_NOT_SUBMITTABLE:        { statusCode: 409, message: 'This voucher is not in a state that can be submitted for review.' },
  // Voucher governed flows (2026-07-07). Additive code-only.
  // VOUCHER_EDIT_NOT_ALLOWED: the governed request/apply targets a voucher of the
  //   wrong kind or state — request-change needs a LIVE (ACTIVE) flagship
  //   (isRmv:true); request-to-end needs a LIVE CUSTOM voucher (isRmv:false; D4:
  //   a flagship can NEVER be ended by the merchant, and the applier re-rejects
  //   it too); the applier also throws this when the voucher is no longer ACTIVE
  //   at apply time.
  // VOUCHER_WITHDRAW_NOT_PENDING: withdraw-submission targets a voucher that has
  //   no open submission awaiting review (not PENDING_APPROVAL, already decided,
  //   or approved-waiting — an approvalStatus:APPROVED voucher was reviewed, so
  //   there is nothing to withdraw).
  VOUCHER_EDIT_NOT_ALLOWED:       { statusCode: 409, message: 'This voucher is not eligible for this request in its current state.' },
  VOUCHER_WITHDRAW_NOT_PENDING:   { statusCode: 409, message: 'This voucher has no submission awaiting review to withdraw.' },
  // VOUCHER_EDIT_INVALID_FIELD: the governed request-change proposal failed value
  //   validation (mirrors MERCHANT_EDIT_REQUEST_INVALID_FIELD for the voucher
  //   lane): empty proposal, empty/non-string title, non-string text field, or a
  //   missing/empty reason on a direct service call. A bad estimatedSaving keeps
  //   the existing SAVING_INVALID.
  VOUCHER_EDIT_INVALID_FIELD:     { statusCode: 400, message: 'One or more proposed voucher changes are invalid. Propose at least one editable field; the title cannot be empty and text fields must be text.' },
  RMV_NOT_FOUND:                  { statusCode: 404, message: 'RMV voucher not found.' },
  RMV_FIELD_NOT_ALLOWED:          { statusCode: 400, message: 'One or more fields cannot be edited on this RMV voucher.' },
  CATEGORY_CHANGE_BLOCKED:        { statusCode: 409, message: 'Category cannot be changed after RMV vouchers have been submitted. Contact support.' },
  // M2 B2 (D5): merchant identity write validation. The chosen subcategory must
  // exist (CATEGORY_NOT_FOUND), be a real subcategory and not a top-level category
  // (NOT_A_SUBCATEGORY), and every chosen cuisine/specialty tag must be linked to
  // that subcategory via SubcategoryTag (TAG_NOT_ELIGIBLE; the descriptor tag must
  // additionally be isPrimaryEligible).
  CATEGORY_NOT_FOUND:             { statusCode: 404, message: 'That category could not be found.' },
  NOT_A_SUBCATEGORY:              { statusCode: 400, message: 'Choose a specific subcategory, not a top-level category.' },
  TAG_NOT_ELIGIBLE:               { statusCode: 400, message: 'One or more selected tags are not available for this subcategory.' },
  // M2 B2 (review fix): the merchant identity write is an ONBOARDING-only action
  // (spec D5). It is gated to the draft window (status REGISTERED, or
  // onboardingStep NEEDS_CHANGES) so it can never flip primaryCategoryId AFTER
  // submission and decouple the customer-facing descriptor + MerchantCategory
  // (isPrimary) from already-submitted/active RMVs (the CATEGORY_CHANGE_BLOCKED
  // rule, spec section 4.2). Day-2 governed identity edits are M3.
  IDENTITY_EDIT_REQUIRES_DRAFT:   { statusCode: 409, message: 'Your category and identity can only be changed while your application is in draft. Submit an edit request instead.' },
  ONBOARDING_GATES_INCOMPLETE:    { statusCode: 409, message: 'Not all onboarding requirements are complete. Check your onboarding checklist.' },
  ALREADY_SUBMITTED:              { statusCode: 409, message: 'This merchant has already been submitted for approval.' },
  // Phase 2 Slice 1 M5: go-live gate — the merchant's main branch location is
  // not yet confirmed (locationConfidence not in CONFIRMED_LOCATION_SET). The
  // admin resolves it via POST /admin/branches/:id/confirm-location (M4).
  MAIN_BRANCH_LOCATION_UNCONFIRMED: { statusCode: 409, message: 'The main branch location is not confirmed yet. Confirm the branch location before approving.' },
  // Phase 2 Slice 1 M6a: admin reactivate is the reverse of suspend — it only
  // acts on a SUSPENDED merchant (never force-activates a non-approved one).
  MERCHANT_NOT_SUSPENDED:         { statusCode: 409, message: 'This merchant is not suspended, so it cannot be reactivated.' },
  CONTRACT_ALREADY_SIGNED:        { statusCode: 409, message: 'The contract has already been accepted.' },
  NO_RMV_TEMPLATE:                { statusCode: 422, message: 'No RMV template found for this category. Please contact Redeemo support.' },
  // M2 B3 (D2): the merchant chose a flagship voucher type that is not eligible
  // for a mandatory flagship RMV. Eligible: BOGO, SPEND_AND_SAVE, DISCOUNT_FIXED,
  // DISCOUNT_PERCENT, FREEBIE, PACKAGE_DEAL. Ineligible: TIME_LIMITED, REUSABLE
  // (custom-only, M4). Surfaced by the create-flagship endpoint before any
  // template lookup.
  VOUCHER_TYPE_NOT_ELIGIBLE:      { statusCode: 400, message: 'This voucher type is not available for a flagship voucher. Choose Buy one get one, Spend and save, Discount, Freebie, or Package deal.' },
  // M2 B3 (review fix): backend cap of two mandatory flagship RMVs per merchant.
  // The merchant already occupies both flagship slots (DRAFT, PENDING_APPROVAL or
  // ACTIVE). Enforced in createFlagshipRmvVoucher before any template lookup or
  // create; INACTIVE/REJECTED RMVs free a slot and do not count.
  FLAGSHIP_RMV_LIMIT_REACHED:     { statusCode: 409, message: 'You can set up at most two mandatory flagship vouchers. Edit or remove an existing one to add a different type.' },
  NO_SENSITIVE_FIELDS:            { statusCode: 400, message: 'No editable sensitive fields were provided. Use PATCH /profile for non-sensitive fields.' },
  SENSITIVE_FIELDS_REQUIRE_EDIT_REQUEST: { statusCode: 400, message: 'Sensitive fields cannot be changed directly. Submit an edit request instead.' },
  // BP-ADJ2 (Business Profile hardening): `createMerchantEditRequestCore` stores
  // SENSITIVE_FIELDS verbatim with no type validation, so a raw-API
  // `{ businessName: null }` (or empty/wrong-typed) was silently stored, then
  // failed the merchant-web response parse AND the admin approveEdit NOT NULL
  // constraint downstream. This is the reject code for that server-side guard.
  // `businessName` must be a non-empty trimmed string when present;
  // `tradingName`/`description`/`logoUrl`/`bannerUrl` must be `string | null`
  // when present: `null` on those four stays a legitimate clear (M4 contract).
  MERCHANT_EDIT_REQUEST_INVALID_FIELD: { statusCode: 400, message: 'One or more proposed field changes are invalid. Business name cannot be empty; other fields must be text or cleared.' },
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
  // M4a-6 (TIME_LIMITED): voucher.type === 'TIME_LIMITED' AND no
  // current window-occurrence is open at server-side `now`. The
  // response payload includes `nextWindowAt` (ISO | null) so the
  // customer-app can render "Available again <date>" without a
  // separate round-trip. See spec §3.8.
  VOUCHER_OUTSIDE_AVAILABILITY_WINDOW: { statusCode: 400, message: 'This voucher is not available right now.' },
  // M4a-6 (TIME_LIMITED): user already redeemed this voucher inside
  // the CURRENT window-occurrence. TIME_LIMITED bypasses the per-cycle
  // UserVoucherCycleState lock — the truth is the redeemedAt timestamp
  // on the existing VoucherRedemption row falling within the active
  // window-occurrence. Payload includes `nextWindowAt` for next-occurrence
  // copy. Distinct from ALREADY_REDEEMED (per-cycle, non-TIME_LIMITED).
  ALREADY_REDEEMED_THIS_WINDOW:    { statusCode: 400, message: "You've already used this offer for the current window." },
  // M5 v1 (REUSABLE): user redeemed this REUSABLE voucher and is still
  // inside the effective cooldown window. Fast-fails at pre-PIN Guard 8a
  // and is re-checked authoritatively under an advisory lock inside the
  // atomic-claim transaction. REUSABLE bypasses both the per-cycle
  // UserVoucherCycleState lock AND the TIME_LIMITED window-occurrence
  // gate — its truth is `lastRedemption.redeemedAt + effectiveCooldownMs`.
  // Payload carries `availableAgainAt` (ISO; = lastRedeemedAt +
  // effectiveCooldownMs) so the customer-app can render countdown copy
  // ("This voucher is available again in N minutes") without an extra
  // round-trip. See spec §5.1 / §5.3.
  REUSABLE_COOLDOWN_ACTIVE:        { statusCode: 400, message: 'This voucher is on cooldown. Please try again later.' },
  // PR #72 pre-merge review fix (Finding 2, 2026-05-12): service-layer
  // cross-field validation for PATCH cooldownSeconds. The Zod refine on
  // updateVoucherSchema can't cleanly enforce the "non-null cooldownSeconds
  // requires REUSABLE type" rule on partial updates — the existing
  // voucher's type isn't in the Zod input. The check moved to the service
  // layer (updateVoucher) which fetches the existing voucher and resolves
  // effectiveType. This code surfaces when a merchant tries to PATCH a
  // non-null cooldownSeconds onto a non-REUSABLE existing voucher (either
  // by omitting `type` and relying on the existing type, or by including
  // a non-REUSABLE type in the same payload).
  COOLDOWN_REUSABLE_ONLY:          { statusCode: 400, message: 'cooldownSeconds may only be set on REUSABLE vouchers.' },
  // M4a-7 (TIME_LIMITED CRUD): availabilityWindows payload failed
  // validation. Reasons surface via `details.reason` and include:
  //   - non-TIME_LIMITED voucher with windows attached (D2 type-attachment lock)
  //   - "24:00" used as openTime (only valid as closeTime sentinel)
  //   - closeTime <= openTime (cross-midnight rejected in single row)
  //   - overlapping windows for same (voucherId, dayOfWeek)
  //   - type change away from TIME_LIMITED while windows still attached
  INVALID_AVAILABILITY_WINDOWS:    { statusCode: 400, message: 'Voucher availability windows are invalid.' },
  // M4a-7 (TIME_LIMITED CRUD): submitVoucher / publish path requires at
  // least one availabilityWindow row for a TIME_LIMITED voucher. DRAFT
  // create with zero windows is permitted; the gate is enforced at
  // submission/publication only.
  TIME_LIMITED_REQUIRES_WINDOW:    { statusCode: 400, message: 'TIME_LIMITED vouchers require at least one availability window before publishing.' },
  REDEMPTION_NOT_FOUND:            { statusCode: 404, message: 'Redemption code not found.' },
  ALREADY_VALIDATED:               { statusCode: 409, message: 'This redemption has already been validated.' },
  MERCHANT_MISMATCH:               { statusCode: 403, message: 'This redemption code does not belong to your merchant.' },
  BRANCH_ACCESS_DENIED:            { statusCode: 403, message: 'You do not have access to this branch.' },

  CURRENT_PASSWORD_INCORRECT:      { statusCode: 400, message: 'Your current password is incorrect.' },
  // My Account (§BP-ACC): merchant authenticated change-password. The new
  // password matches the current one — reject before hashing/updating so a
  // no-op "change" can't silently succeed and can't be used as a password-
  // guessing oracle against the current hash (verifyPassword already ran
  // above for the current-password check; this reuses that same compare).
  NEW_PASSWORD_SAME_AS_CURRENT:    { statusCode: 400, message: 'Your new password must be different from your current password.' },
  SEARCH_QUERY_REQUIRED:           { statusCode: 400, message: 'A search query or category is required.' },
  ALREADY_FAVOURITED:              { statusCode: 409, message: 'Already in your favourites.' },
  FAVOURITE_NOT_FOUND:             { statusCode: 404, message: 'This item is not in your favourites.' },
  CAMPAIGN_NOT_FOUND:              { statusCode: 404, message: 'Campaign not found.' },
  INVALID_INTERESTS:               { statusCode: 400, message: 'One or more interest IDs are invalid or inactive.' },
  REVIEW_NOT_FOUND:                { statusCode: 404, message: 'Review not found.' },
  REVIEW_NOT_OWNED:                { statusCode: 403, message: 'You can only edit or delete your own reviews.' },
  REVIEW_ALREADY_EXISTS:           { statusCode: 409, message: 'You have already reviewed this branch.' },
  // PR-C 2026-05-09: verified-review redemption-linkage validation.
  // Distinct from BRANCH_MERCHANT_MISMATCH (voucher-vs-branch) and
  // MERCHANT_MISMATCH (redemption-code-vs-merchant-staff) — these
  // codes specifically describe a review-side linkage failure.
  REDEMPTION_BRANCH_MISMATCH:      { statusCode: 400, message: 'This redemption was at a different branch.' },
  REDEMPTION_MERCHANT_MISMATCH:    { statusCode: 400, message: 'This redemption is for a different merchant.' },
  // Plan 4 M1.20 — postcode-resolver error codes, surfaced by PC2 submit
  // (customer profile update) and Branch create / pending-edit (M1.21).
  // POSTCODE_REQUIRED: 400, returned by Branch.create when called without a postcode.
  // POSTCODE_NOT_FOUND: 400, postcodes.io 404 OR canonical form < 5 chars.
  // GAZETTEER_UNAVAILABLE: 503, postcodes.io 5xx / network failure — transient.
  POSTCODE_REQUIRED:               { statusCode: 400, message: 'A postcode is required.' },
  POSTCODE_NOT_FOUND:              { statusCode: 400, message: "We couldn't recognise this postcode. Please check and try again." },
  GAZETTEER_UNAVAILABLE:           { statusCode: 503, message: "We couldn't verify your postcode right now. Please try again in a moment." },
  // Option B B4 (admin document support). Document upload is gated on R2 storage
  // being provisioned (STORAGE_ENABLED + R2_* secrets); when dark, upload fails
  // closed with this code BEFORE any bytes are read. The rest are server-side
  // upload validation (the API holds the bytes, so type/size are HARD-enforced).
  STORAGE_NOT_ENABLED:             { statusCode: 503, message: 'Document storage is not enabled yet. Please try again later or contact support.' },
  DOCUMENT_NOT_FOUND:              { statusCode: 404, message: 'Document not found.' },
  FILE_REQUIRED:                   { statusCode: 400, message: 'A file is required.' },
  FILE_TOO_LARGE:                  { statusCode: 413, message: 'The file is too large. The maximum size is 10 MB.' },
  UNSUPPORTED_FILE_TYPE:           { statusCode: 400, message: 'Unsupported file type. Upload a PDF, JPG, or PNG.' },
  // A multipart upload that breached a parser limit (more than one file, too many
  // fields/parts) or was malformed. A client error, not a 500.
  INVALID_UPLOAD:                  { statusCode: 400, message: 'The upload was invalid. Send a single file (PDF, JPG, or PNG) with the required fields.' },
  // M2 B5 (merchant server-proxied image upload). Per-kind image validation
  // (content-type + size + dimensions) BEFORE the object is written.
  IMAGE_TOO_LARGE:                 { statusCode: 413, message: 'The image is too large. The maximum size is 2 MB for logos and 5 MB for banners and photos.' },
  IMAGE_UNREADABLE:                { statusCode: 400, message: "We couldn't read that image. Upload a valid PNG or JPEG." },
  IMAGE_DIMENSIONS_INVALID:        { statusCode: 400, message: 'The image dimensions are not allowed. Logos must be square (at least 512x512); banners must be landscape (at least 1600x600); photos must be landscape (at least 1200x600).' },
  // M2 B4 (D8a): server-side opening-hours validation on setOpeningHours. The
  // LIVE storage is single-period-per-day, so a duplicate dayOfWeek (the
  // single-period "overlap"), a dayOfWeek out of 0-6, a closed day still carrying
  // times, an open day missing times, a malformed time (incl. "24:00" as
  // openTime), or a degenerate zero-length period (openTime === closeTime) are
  // rejected. close < open is ACCEPTED (overnight close, per the customer-app
  // consumer); "24:00" is allowed only as a closeTime (end-of-day / Open 24h).
  OPENING_HOURS_INVALID:           { statusCode: 400, message: 'The opening hours are invalid. Check the days, times, and that closed days have no hours set.' },
  // M2 B4 (D8b): advisory present/positive saving sanity on the merchant voucher
  // SAVE paths that write a top-level estimatedSaving value. The saving must be
  // present and greater than zero. There is NO hard floor (a below-ideal-floor but
  // positive value is accepted; the floor is an advisory client-side scoring input
  // per D8b, with admin review the quality backstop).
  SAVING_INVALID:                  { statusCode: 400, message: 'Enter a saving amount greater than zero.' },
  // Day-2 Vouchers B1 (item 3): defensive guard on the free-form Voucher
  // merchantFields bag (no Zod cap). Rejected when the bag exceeds 16KB of JSON
  // or more than 50 top-level keys, before it can reach Prisma.
  MERCHANT_FIELDS_TOO_LARGE:       { statusCode: 400, message: 'The voucher details are too large. Please simplify and try again.' },
  // Branches PR-6 (§4a/§4e): merchant Google location-search. Provider internals
  // are NEVER leaked — every searchPlaces ok:false union member maps to one of
  // these client-safe codes. details.retryAfter (seconds) accompanies the rate
  // limit. LOCATION_SEARCH_RATE_LIMITED is the multi-instance-safe limiter block
  // (per-user / per-IP / per-merchant / global daily cost ceiling).
  LOCATION_SEARCH_NO_RESULTS:       { statusCode: 404, message: 'No matching places were found. Try a different search.' },
  LOCATION_SEARCH_UNAVAILABLE:      { statusCode: 503, message: 'Location lookup is unavailable right now. Please try again in a moment, or enter the address manually.' },
  LOCATION_SEARCH_RATE_LIMITED:     { statusCode: 429, message: 'Too many location searches. Please try again later.' },
  // Staff & Access (v1) PR-B (review FIX 5): dedicated portal-member error codes,
  // replacing the previously-reused ALREADY_VERIFIED (resend-invite on an
  // already-claimed member) and USER_NOT_FOUND (target membership not found /
  // cross-tenant). Member-specific copy so the portal UI can speak about a team
  // member rather than a generic account/user.
  MEMBER_ALREADY_CLAIMED:          { statusCode: 409, message: 'This team member has already set up their account.' },
  MEMBER_NOT_FOUND:                { statusCode: 404, message: 'Team member not found.' },
  // Encryption key-rotation R1 (spec §3.10 Guard-10 three-bucket hardening).
  // KEY_NOT_AVAILABLE: a decrypt resolved a kid that is absent/retired from the
  // keyring (KeyNotAvailableError). On the redemption hot path Guard-10 now fails
  // CLOSED LOUDLY with this code instead of silently mapping every throw to a
  // wrong-PIN result — a missing key must not look like (and is far rarer than) a
  // wrong PIN. Mapped to a controlled 500 envelope (never a raw 500) so no
  // ciphertext/key/plaintext can leak through the global error handler.
  KEY_NOT_AVAILABLE:               { statusCode: 500, message: 'A configuration error prevented this action. Please try again later or contact support.' },
  // REDEMPTION_PIN_UNREADABLE: the stored branch PIN value failed envelope parsing
  // (EnvelopeParseError — malformed format / non-hex iv-or-tag / bad kid charset),
  // a data-integrity fault distinct from a genuine wrong PIN. Guard-10 fails closed
  // LOUDLY (alert) instead of swallowing it as a silent wrong-PIN. The error message
  // is built from branch id + counts only — never the stored value.
  REDEMPTION_PIN_UNREADABLE:       { statusCode: 500, message: "We couldn't process this redemption. Please contact the merchant or support." },
} as const

export type ErrorCode = keyof typeof ERROR_DEFINITIONS

// Const object so ErrorCode can be used as a value (e.g. ErrorCode.INVALID_CREDENTIALS)
export const ErrorCode = Object.fromEntries(
  Object.keys(ERROR_DEFINITIONS).map((k) => [k, k])
) as { [K in keyof typeof ERROR_DEFINITIONS]: K }

export class AppError extends Error {
  public readonly code: ErrorCode
  public readonly statusCode: number
  // Optional payload that flows into the error envelope alongside the
  // standard (code, message, statusCode) fields. Used for callable details
  // like `remainingAttempts` on INVALID_PIN or `retryAfter` on
  // PIN_RATE_LIMIT_EXCEEDED. Standard fields always win — `details.code`
  // / `details.message` / `details.statusCode` cannot override the
  // ERROR_DEFINITIONS-driven shape.
  public readonly details?: Record<string, unknown>

  constructor(code: ErrorCode, details?: Record<string, unknown>) {
    const def = ERROR_DEFINITIONS[code]
    // Include the code in the message so `.toThrow('CODE')` assertions work in tests.
    // The human-readable message is preserved in toJSON() via ERROR_DEFINITIONS.
    super(code)
    this.code = code
    this.statusCode = def.statusCode
    this.name = 'AppError'
    if (details !== undefined) this.details = details
  }

  toJSON() {
    return {
      error: {
        // Spread details FIRST so the standard fields below override any
        // accidental `code` / `message` / `statusCode` keys in details.
        ...(this.details ?? {}),
        code: this.code,
        message: ERROR_DEFINITIONS[this.code].message,
        statusCode: this.statusCode,
      },
    }
  }
}
