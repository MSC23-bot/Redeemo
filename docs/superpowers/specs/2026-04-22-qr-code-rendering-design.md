# QR Code Rendering — Design Spec

**Date:** 2026-04-22
**Status:** Approved for planning
**Scope:** Replace QR placeholders in customer app with real, scannable QR codes and harden the Show to Staff flow against misuse.

---

## Goal

Give subscribers a scannable, on-brand QR code at the point of redemption that merchant staff can trust — whether they scan it with the merchant app or manually key in the code.

---

## Affected surfaces

- `apps/customer-app/src/features/voucher/components/ShowToStaff.tsx` — hero QR at point of redemption
- `apps/customer-app/src/features/voucher/components/RedemptionDetailsCard.tsx` — small QR in the redeemed-voucher card (same design, smaller)
- `src/api/redemption/service.ts` — code generator change (backend)
- `src/api/redemption/routes.ts` — verify endpoint normalisation (backend)

---

## 1. Code format

**The code is one string.** It is the QR payload, the human-readable display, and the value staff types manually. There are not two codes.

- **Length:** 6 characters
- **Alphabet:** uppercase A–Z + digits 0–9, minus ambiguous characters: `0`, `O`, `1`, `I`, `L` (31 usable characters)
- **Display grouping:** 3-3 with a single space, e.g. `K3F 9P7`
- **QR payload:** ungrouped, e.g. `K3F9P7`
- **Uniqueness:** `VoucherRedemption.redemptionCode @unique` remains enforced. Codes are permanent and never reused; full history preserved for admin/merchant reports.
- **Collision space:** 31⁶ ≈ 887 million. Generator retries on rare DB unique-constraint violation.

**QR payload is intentionally context-free.** The QR encodes only the 6-character code — it does not embed merchant ID, branch ID, or URL. Merchant/branch context is supplied by the merchant app when it calls the verify endpoint (it already knows which branch the staff member is authenticated as). This keeps the QR small, fast to scan, and useful as a manual fallback. See §8 #2 for the server-side scope check that enforces the merchant/branch match.

**Existing codes:** 10-character mixed-case codes from test/seed data stay in the database unchanged. Display logic renders whatever length the DB stores (6 or 10). New redemptions generate 6-character codes.

---

## 2. QR visual design

Single design used at both sizes.

- **Finder patterns (three corner squares):** brand red `#E20C04`
- **Data modules:** brand navy `#010C35`
- **Background:** white (forced, regardless of system theme)
- **Centre badge:** 24×24 white rounded square with red "R" wordmark
- **Error correction:** High (H, 30%) — required to survive the centre cutout
- **Library:** `react-native-qrcode-svg`

**Rendered sizes:**
- Show to Staff hero: 240 × 240 pt, with a **hard minimum of 200 pt** on small-height devices or split-screen (Android multi-window). If the available height would force a smaller QR, reduce surrounding padding first; never render below 200 pt.
- Redemption Details Card: 80 × 80 pt

---

## 3. Show to Staff — screen composition

From top to bottom:
1. **LIVE pill** — red dot with glow, uppercase "LIVE" label
2. **QR code** — white card with soft shadow around it
3. **Code text** — monospace, 22pt, letter-spaced, grouped 3-3 (e.g. `K3F 9P7`)
4. **Live clock + date** — updates every second, e.g. `14:32:07 · 22 Apr 2026`
5. **Validation status line** — default text _"Waiting for staff to validate…"_ with a subtle pulsing dot; changes based on poll result (see §5)

**Brightness:** On mount, screen brightness is boosted to 100% via `expo-brightness`. Previous brightness is captured and restored on unmount and on screen blur (navigation away). If iOS Low Power Mode is active, boost may be ignored by the OS — show a toast: _"For best scanning, switch off Low Power Mode."_

---

## 4. Redemption Details Card

Compact version shown in "My Redeemed Vouchers".

- Same visual QR design as above, at 80 × 80 pt
- Code text below, smaller (14pt monospace, grouped 3-3)
- When `isValidated = true`, the QR is hidden and replaced by a validated checkmark and "Validated on [date, time]" — the card becomes a read-only record. Screenshot of the card is therefore never presentable at another merchant.

---

## 5. Validated state — polling + transition

- While Show to Staff is open, poll `GET /api/v1/redemption/me/:code` every **5 seconds**
- Stop polling on: `isValidated = true`, screen exit, or 15 minutes of polling with no result
- On 15-min timeout without validation: polling stops silently, the status line changes to _"Still waiting for staff to validate — you can ask them to scan again"_, and the QR remains visible. The redemption itself is not cancelled; the customer can also dismiss and re-enter Show to Staff from the voucher card to restart polling.
- On success:
  - Haptic success
  - QR and live clock fade out
  - Large animated green checkmark, "Validated ✓" headline, merchant/branch name, timestamp
  - Auto-dismiss back to voucher detail after 4 seconds, or tap "Done"
  - **Auto-dismiss is cancelled** if the user taps anywhere on the Validated state before it fires, so staff can re-check the confirmation. In that case the screen stays until "Done" is tapped or the user navigates away.

Backend: the `/redemption/me/:code` endpoint must exist and return `{ isValidated, validatedAt, validationMethod }` for the authenticated customer's own redemption. If not already built, it's part of the backend changes for this feature.

---

## 6. Anti-fraud mechanisms

All three apply to the Show to Staff screen only.

### 6a. LIVE indicator + ticking clock
Locked as anti-fraud policy, not decoration. The live clock is the primary defence against screenshot misuse — a stale clock is a clear signal to staff that something is off.

### 6b. Screenshot handling
- **iOS:** detect via `expo-screen-capture`. Show an in-app banner: _"Screenshots of this screen are logged. Sharing a redemption code with someone else may result in account review."_ Also POST the event to a new backend endpoint `POST /api/v1/redemption/:code/screenshot-flag` which writes to a `RedemptionScreenshotEvent` table keyed by `userId`, `redemptionId`, `occurredAt`.
- **Android:** apply `FLAG_SECURE` only on the Show to Staff screen (not app-wide) to block screenshots entirely. Still POST a flag event if the OS exposes the attempt (most do not — detection is best-effort).
- **Copy:** moderate, not threatening. No promise of automatic suspension. Admin review of flags is deferred to Phase 5.

### 6c. Auto-hide after inactivity
- 2-minute inactivity timer starts on mount. Any user touch anywhere on the screen resets the timer.
- At 1:50 (10 seconds before blur), show a subtle countdown toast: _"Screen will dim in 10s. Tap to keep showing."_
- At 2:00, overlay the QR with a blur and show a centred "Tap to show again" button. Tapping reveals the QR and restarts the timer. Live clock continues to tick underneath. When the blur is active, the QR container sets `accessibilityLabel="Code hidden. Tap to show again."` so screen readers announce the state.
- Timer and blur only apply on Show to Staff, not on Redemption Details Card.

---

## 7. Accessibility

- The QR component must expose `accessibilityLabel` reading the full code character-by-character with NATO-style cadence: _"Redemption code. K, 3, F, 9, space, P, 7"_. (No actual NATO words — letters and digits only, each announced separately.)
- `accessibilityRole="image"` on the QR itself; `accessibilityLiveRegion="polite"` on the validation status line so the "Validated" transition is announced.
- Respect `prefers-reduced-motion`: the validated-state animation falls back to a cross-fade with no scale/spring.
- Brightness boost respects iOS Guided Access / Screen Time — do not force-override accessibility shortcuts.

---

## 8. Backend changes required

1. **Code generator** (`src/api/redemption/service.ts`)
   - Change length from 10 → 6
   - Change alphabet: uppercase + digits, exclude `0`, `O`, `1`, `I`, `L`
   - Keep retry-on-collision behaviour

2. **Verify endpoint — normalisation + scope check** (`src/api/redemption/routes.ts`, verify handler)
   - **Normalisation:** uppercase input, strip whitespace and hyphens, then compare
   - **Scope check (critical):** the verify handler MUST confirm the code belongs to the merchant/branch the verifying staff is authenticated for. Staff sends `{ code, branchId }` (branch context is always available — staff logs into a branch; merchant admin selects a branch before verifying). Reject with a generic "code not found" error if:
     - the code does not exist, OR
     - the code exists but the redemption's `branchId` / `merchant.id` does not match the authenticated branch/merchant
   - This prevents cross-merchant code leaks: staff at Merchant A cannot validate a code issued at Merchant B (whether by accident or attack).
   - Error response is identical for "not found" and "wrong merchant" — no information leakage about code existence.

3. **Validation after subscription expiry — explicit rule**
   - If a `VoucherRedemption` row exists (i.e. the customer successfully redeemed while their subscription was active), staff validation MUST still succeed even if the customer's subscription has since expired.
   - Verify endpoint does NOT re-check `subscription.status` on the customer — the redemption row itself is the entitlement, and was gated at creation time.
   - Document as a code comment on the verify handler.

4. **Rate limit on verify endpoint**
   - Separate from the existing customer-side PIN rate limit (5/15min per userId+branchId).
   - New limit keyed by `branchUserId` or `merchantAdminId`: e.g. 20 failed verify attempts / 5 min.
   - Prevents staff mistypes from locking out a customer's attempts; prevents a malicious device from brute-forcing codes.

5. **Screenshot flag endpoint + table**
   - `POST /api/v1/redemption/:code/screenshot-flag` (customer-authenticated, own-redemption only)
   - New table `RedemptionScreenshotEvent { id, userId, redemptionId, occurredAt, platform }`
   - **Deduplication / rate limit:** max 1 event per redemption per 5 seconds. iOS fires screenshot events reliably but some user behaviours (rapid successive screenshots, toast triggering detector in a loop) can spam the log. Server-side: if the most recent event for `(redemptionId)` is within 5 seconds, silently return 200 without inserting.
   - No admin review UI — deferred to Phase 5.

6. **Self-lookup endpoint** (for validation polling)
   - `GET /api/v1/redemption/me/:code` returns `{ code, isValidated, validatedAt, validationMethod, voucherId, merchantName, branchName }` for the authenticated user's own redemption.
   - **Security:** query is scoped by `(userId = auth.userId, redemptionCode = :code)`. If the code doesn't exist OR belongs to a different user, return **404** with identical error body. No leakage about which codes exist globally.
   - If the endpoint doesn't already exist, add it.

---

## 9. Testing

- **Backend unit tests:** generator produces 6-char codes, excludes ambiguous chars, retries on collision; verify normalises input (case, whitespace, hyphens); rate limiter kicks in on verify endpoint; screenshot flag endpoint persists events.
- **Frontend unit tests:** QR component renders with correct props for both sizes; validated state transition; auto-hide timer resets on touch; screenshot handler registers on mount / cleans up on unmount; polling starts/stops on lifecycle; accessibility label produces correct string.
- **Manual / E2E:** Maestro flow covering redeem → Show to Staff → staff validates via merchant app → customer screen transitions to Validated. Not automated in this phase (needs merchant mobile app, Phase 4).

---

## 10. Out of scope / deferred

- **Admin review UI for screenshot flags** — Phase 5.
- **Multi-device exclusivity** — same user on phone + tablet can both show the same code. Accepted; not a fraud vector since only one person physically consumes the voucher.
- **Scanner compatibility fallback** — no "plain black QR" toggle. If field issues emerge, revisit.
- **Self-hosted monospace font** — ship with system mono; polish later.
- **Admin unvalidate** — if staff validated in error, handled outside this feature.
- **i18n** — strings are English-only for now.

---

## 11. Risks

- **iOS Low Power Mode** may block brightness boost. Mitigation: toast prompt.
- **Android `FLAG_SECURE`** blocks screen casting and some accessibility tools — applied only on Show to Staff, not app-wide.
- **Centre-logo + High error correction** reduces data capacity, but 6 chars is well within H-level capacity at any QR version.
- **Existing 10-char codes coexisting** — display logic must handle either length without breaking layout.
