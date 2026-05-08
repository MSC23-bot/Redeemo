# Customer App — Voucher Detail + Redemption Flow Design Spec

---

## Overview

This spec defines the visual design, interaction patterns, screen states, and post-redemption automations for the Voucher Detail screen and full Redemption flow of the Redeemo customer app (React Native / Expo).

This spec covers **mobile app only**. The customer website shows voucher details but does NOT support redemption (by product design — fraud prevention).

**Mockups:** Visual companion files in `.superpowers/brainstorm/88554-1776435672/content/`
- `voucher-detail-v4.html` — Screens 1–6 (voucher detail states, PIN entry flow)
- `voucher-detail-v6.html` — Screens 7, 7b, 8 (success popup, show to staff, already redeemed)

---

## Section 1: Design System (extends Home & Discovery + Merchant Profile specs)

All tokens, colours, typography, and motion from `2026-04-17-customer-app-home-discovery-map-design.md` Section 1 and `2026-04-17-merchant-profile-design.md` apply. This section documents additions specific to the Voucher Detail and Redemption screens.

### 1.1 Voucher Type Colour Palette (header background)

Each voucher type has a distinct solid colour used as the coupon header background:

| Voucher Type | Header Background | CSS Variable |
|-------------|-------------------|-------------|
| BOGO | `#7C3AED` (purple) | `--bogo` |
| DISCOUNT | `#E20C04` (brandRose) | `--discount` |
| FREEBIE | `#16A34A` (green) | `--freebie` |
| SPEND_SAVE | `#E84A00` (coral) | `--spend-save` |
| PACKAGE | `#2563EB` (blue) | `--package` |
| TIME_LIMITED | `#D97706` (amber) | `--time-limited` |
| REUSABLE | `#0D9488` (teal) | `--reusable` |

### 1.2 Elevation / Shadow Scale (additions)

| Element | Shadow | Purpose |
|---------|--------|---------|
| Success popup modal | `0 32px 80px rgba(0,0,0,0.35), 0 0 0 1px rgba(0,0,0,0.04)` | Floating modal over blurred backdrop |
| PIN entry bottom sheet | via `sheetUp` animation — slides from bottom | Overlay sheet with backdrop blur |
| Staff screen info card | none — uses `backdrop-filter: blur(8px)` with border | Glassmorphic card on gradient bg |
| Redeemed overlay badge | `0 8px 32px rgba(22,163,74,0.4), 0 2px 8px rgba(0,0,0,0.2)` | Green badge floating over greyed header |
| Success checkmark ring | `0 4px 16px rgba(22,163,74,0.35)` | Green glow on success icon |

### 1.3 Animation Tokens (additions)

| Animation | Duration | Easing | Usage |
|-----------|----------|--------|-------|
| `modalSpring` | 450ms | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Success popup entrance (scale 0.8→1 + translateY 30→0) |
| `checkBounce` | 600ms | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Checkmark icon bounce (scale 0→1.2→1), 200ms delay |
| `confettiFall` | 2.8s | ease-out | Confetti particles falling with rotation |
| `sheetUp` | 400ms | `cubic-bezier(0.16, 1, 0.3, 1)` | PIN entry bottom sheet slide-up |
| `shake` | 400ms | ease-in-out | Wrong PIN input box shake (±6px, ±3px) |
| `gradientShift` | 2.5s | linear, infinite | Animated border on Show to Staff code card |
| `livePulse` | 1.4s | ease-in-out, infinite | LIVE badge dot pulsing (scale 1→0.6→1, opacity 1→0.3→1) |

---

## Section 2: Screen Inventory

| # | Screen | Source File | State |
|---|--------|------------|-------|
| 1 | Voucher Detail — Subscribed User | v4 | Active voucher, can redeem |
| 1a | Voucher Detail — Time-Limited (Active) | timelimited-v1 | Amber header, countdown, urgency |
| 1b | Voucher Detail — Time-Limited (Expired) | timelimited-v1 | Washed out, red expired badge |
| 1c | Voucher Detail — Outside Availability | timelimited-v1 | Full colour, blue banner, CTA disabled |
| 2 | Voucher Detail — Free User | v4 | Browse only, subscribe CTA |
| 3 | PIN Entry — Keyboard Visible | v4 | Bottom sheet with numeric keypad |
| 4 | PIN Entered — Ready to Confirm | v4 | All 4 digits filled, button active |
| 5 | Wrong PIN — Error | v4 | Shake animation, attempts counter |
| 6 | Locked Out — Too Many Attempts | v4 | 15 min lockout countdown |
| 7 | Redemption Success — Popup | v6 | Compact floating modal |
| 7b | Show to Staff — Full Screen | v6 | Rose/coral gradient, anti-fraud |
| 8 | Voucher Detail — Already Redeemed | v6 | Washed out, redemption details |

---

## Section 3: Screen 1 — Voucher Detail (Subscribed User)

The voucher detail page is designed as a **coupon/voucher** — visually distinct from the merchant profile page.

### 3.1 Coupon Header

- **Background:** solid colour matching voucher type (e.g. BOGO = `#7C3AED` purple)
- **Gradient overlay:** `linear-gradient(180deg, rgba(0,0,0,0.1) 0%, transparent 40%, rgba(0,0,0,0.25) 100%)` for depth
- **Subtle radial highlights:** two radial gradients at 20%/80% positions for glass-like light effect
- **Top nav:** back button (left) + share + favourite heart (right), all 38×38px frosted circles (`rgba(255,255,255,0.2)` + `backdrop-filter: blur(16px)`)
- **Favourite heart:** filled white when favourited, outline when not
- **Content (all z-index: 5, above overlays):**
  - Voucher type badge: uppercase, 11px, 800 weight, 0.12em letter-spacing, with tag icon
  - Voucher title: 26px, 800 weight, white, max-width 280px
  - Description: 13px, `rgba(255,255,255,0.8)`, max-width 300px
- **Save badge:** positioned absolute top-right (top: 100px, right: 20px), 80×80px circle, `rgba(255,255,255,0.2)` + `backdrop-filter: blur(8px)`, 2px dashed white border. Shows "Save" label + amount in £ (GBP only)
- **Min-height:** 260px
- **Padding:** 100px top (for status bar + nav), 20px sides

### 3.2 Perforation Line

Separates coupon header from coupon body. Creates the torn-coupon effect:

- **Height:** 24px, background matches page bg (`#F5F0EB`)
- **Circular cutouts:** 28×28px circles positioned at left: -14px and right: -14px, top: -14px. Same bg colour as page, with `inset 0 2px 6px rgba(0,0,0,0.06)` shadow for depth
- **Dashed line:** 2px dashed `rgba(0,0,0,0.1)` centred between cutouts, 20px margin each side

### 3.3 Coupon Card (top section)

- **Container:** white background, margin 0 14px, rounded top corners 20px
- **Voucher banner image:** 160px height, full width, placeholder gradient. In production: actual voucher banner image from API
- **"Voucher Details" label:** 11px, uppercase, muted, 0.1em letter-spacing
- **Info pills row:** flex-wrap, 8px gap, each pill is 11px with 5px/10px padding, 8px border-radius
  - Ongoing/no expiry pill: green bg `#ECFDF5`, green text `#166534`, check icon
  - Expiry pill: red bg `#FEF2F2`, red text `#B91C1C`, clock icon
  - Type pills: neutral bg `rgba(0,0,0,0.04)`, secondary text colour

### 3.4 Mid-Coupon Perforation

Second tear line between top card and body:
- Same dashed line style as main perforation
- Cutout circles: 24×24px (slightly smaller), positioned at left/right -14px, top -12px

### 3.5 Coupon Body

- **Container:** white background, margin 0 14px, rounded bottom corners 20px, padding 20px 18px 24px, shadow `0 4px 20px rgba(0,0,0,0.06)`
- **Terms & Conditions section:**
  - Section title: 14px, 800 weight, navy, with document icon (rose coloured)
  - List items: 12px, secondary colour, 1.6 line-height, green check icons, 6px vertical padding, subtle bottom borders
- **Fair Use Policy card:**
  - Background: cream (`#FFF9F5`), 16px border-radius, 18px padding, subtle border
  - Title: 12px, 800 weight, navy, shield icon (rose)
  - Items: 11px, secondary colour, info circle icons (muted), 4px vertical padding
  - Content examples: "BOGO: 1 voucher per 2 guests. Groups of 4 may use 2, groups of 6 may use 3", "Present voucher before ordering", "For personal use only — non-transferable", "Merchant reserves the right to refuse"

### 3.6 Below-Coupon Content

- **Merchant card:** tappable row linking to merchant profile. 44×44px logo, merchant name (14px, 800 weight), category + branch with distance. Chevron right indicator. Same design as used in merchant profile spec.
- **"How It Works" section:**
  - Section title with question-circle icon
  - 4-step vertical timeline with connected line (2px, border colour)
  - Step numbers: 34×34px rounded squares (10px radius), brand gradient background, white text
  - Step 4 (Enjoy): green gradient background (`#16A34A → #22C55E`)
  - Steps: "Tap Redeem" → "Enter Branch PIN" → "Show Your Code" → "Enjoy Your Deal!"

### 3.7 Sticky Bottom CTA

- **Container:** sticky bottom, gradient fade from transparent to page bg
- **Button:** full width, 15px vertical padding, 16px rounded, brand gradient bg, white text 16px 800 weight, tag icon
- **Text:** "Redeem This Voucher"
- **Shadow:** `0 6px 24px rgba(226,12,4,0.3)`
- **Press feedback:** `transform: scale(0.97)` on active

---

## Section 4: Screen 2 — Voucher Detail (Free User)

Identical layout to Screen 1 except:

- **Header colour:** matches voucher type (example shows DISCOUNT red)
- **CTA button:** navy background (`#010C35`), lock icon, text "Subscribe to Redeem · £6.99/mo"
- **Shadow:** `0 6px 24px rgba(1,12,53,0.3)`
- **Tapping:** navigates to subscription purchase screen with full voucher-origin return context (see §4.1 below)

### 4.1 Conversion flow — as shipped in PR #40 (rounds 13–24)

Initial spec said "no How It Works" and "Tapping: navigates to subscription purchase screen." During M1 implementation owner direction expanded the surface to a full conversion flow. Recorded here so the spec reflects what actually ships.

**How It Works variant (rounds 17–19):** free users now SEE the section. 5-step variant starting "Subscribe to Unlock". Tappable card with chevron toggle, default expanded (the section still supports conversion).

**SubscriptionPromptModal (round 16):** auto-shown on Voucher Detail for non-subscribed users browsing a voucher. Replaces the deleted `FreeUserGateModal`. Dismissible via "Maybe later" / close icon / tap-out. Plan buttons (Continue with Annual / Continue with Monthly) and the embedded primary CTA all route to `/(auth)/subscription-prompt` with the URL contract below.

**Voucher-origin URL contract (rounds 20–21):**

```
/(auth)/subscription-prompt
  ?source=voucher
  &plan=<annual|monthly>
  &returnVoucherId=<voucherId>
  &branch=<selectedBranchId>
  &returnMerchantId=<merchantId>
  &tab=vouchers
```

`SubscribePromptScreen` honours these params:
- `source=voucher` swaps secondary CTA copy to "Continue with Free Account" (vs onboarding default "Start with free access").
- `plan=<plan>` initialises the plan selector to the user's pre-pick.
- `returnVoucherId` + `branch` + `returnMerchantId` + `tab` rebuild the exact return URL on the secondary CTA.
- Voucher-origin secondary CTA does NOT stamp `subscriptionPromptSeenAt` — user is past onboarding and that flag is first-run only.
- Defensive fallback: when return-context params are missing, secondary CTA falls back to `router.back()` rather than dropping the user on Discovery.

**Suppression flag (round 22):** secondary CTA's return URL appends `?suppressSubscribePrompt=1`. Voucher Detail reads it and skips the auto-modal so the user isn't nag-looped after a deliberate free-pick. Sticky CTA stays visible and tappable; only the auto-modal is gated.

**Branch source contract (PR #41, post-merge follow-up):** the `branch=<id>` parameter in the voucher-origin subscription URL is sourced from the Voucher Detail URL's `?branch=` param FIRST, falling back to `selectedBranch?.id` only on cold-open. This matters because the free-user CTA + modal plan buttons can fire while the merchant query is still in flight (selectedBranch null). Without the URL-first source, the subscription-prompt URL would omit `branch=`, and `Continue with Free Account` would lose the suppression contract on its return path. Symmetric to PR #40 §O7 on the outbound voucher-tap URL.

**Delayed auto-modal (round 22 part 5):** auto-modal waits 800ms after the screen becomes interactive before sliding in. Synchronous show felt gate-like — the same UX the modal was meant to replace. Cancellation paths: blur (sticky CTA tap → navigation → focus loss), dismiss (Maybe later / close), sub state change, suppression flag.

**Cross-ref:** the full as-shipped contract lives in [`docs/superpowers/plans/2026-05-06-voucher-detail-redemption-rebaseline.md`](../plans/2026-05-06-voucher-detail-redemption-rebaseline.md) §M1.1 ("As shipped, rounds 13–24"). This section is the spec-side summary; the plan §M1.1 is the implementation reference.

---

## Section 4b: Screens 1a/1b/1c — Time-Limited Voucher Variants

Time-limited vouchers use the same coupon structure as Screen 1 but add urgency/availability treatments. All three variants share the amber header colour (`#D97706`).

**Mockup:** `voucher-detail-timelimited-v1.html`

### 4b.1 Screen 1a — Time-Limited (Active, Within Availability Window)

Same layout as Screen 1 with these additions:

- **Header colour:** amber `#D97706`
- **Type badge:** clock icon + "Time-Limited Offer"
- **Countdown banner in header:** frosted glass card (`rgba(0,0,0,0.25)` bg, `backdrop-filter: blur(8px)`, 14px border-radius) at the bottom of the header, above the perforation
  - Clock icon in 32×32px frosted square
  - "Expires in" label (9px, uppercase, 0.1em letter-spacing)
  - Countdown: "2d 14h 32m" (16px, 800 weight, white, tabular-nums)
  - Exact expiry date below (10px, `rgba(255,255,255,0.6)`)
- **Expiry pill:** amber tint (`#FFFBEB` bg, `#B45309` text) with clock icon — "Expires 21 Apr 2026"
- **Time restriction pill:** neutral style — e.g. "Mon–Fri, 11am–3pm"
- **Urgency banner below coupon card:** amber card (`#FFFBEB` bg, `#FDE68A` border, 14px border-radius)
  - Amber icon square (36×36px, 10px border-radius, `#D97706` bg)
  - "Limited Time Remaining" title (12px, 800 weight, `#B45309`)
  - "This voucher expires on 21 Apr 2026. Redeem before it's gone!" (11px, `#92400E`)
- **CTA:** standard "Redeem This Voucher" — active and pressable

### 4b.2 Screen 1b — Time-Limited (Expired)

Same layout but washed out, matching the "Already Redeemed" treatment (Screen 8):

- **Header:** `filter: grayscale(0.5) brightness(0.75); opacity: 0.6`
- **"Voucher Expired" badge:** positioned OUTSIDE the filtered header (same pattern as Screen 8's green badge)
  - Solid red `#B91C1C` background — vivid, not washed
  - X-circle icon inside 28×28px frosted circle
  - "Voucher Expired" — 15px, 800 weight, white
  - Shadow: `0 8px 32px rgba(185,28,28,0.4), 0 2px 8px rgba(0,0,0,0.2)`
- **No countdown banner** — not relevant
- **Expiry pill:** red variant (`#FEF2F2` bg, `#B91C1C` text) — "Expired 21 Apr 2026" with X icon
- **Coupon card + body:** dimmed (opacity 0.5–0.6), banner greyscaled
- **CTA disabled:** muted grey background, "Voucher Has Expired" with X icon, opacity 0.6

### 4b.3 Screen 1c — Outside Availability Window

The voucher is still valid and hasn't expired, but the user is viewing it outside its operating hours (e.g. Saturday evening for a Mon–Fri 11am–3pm voucher).

- **Header:** full colour amber — NOT washed out (voucher is active)
- **All content fully visible** — terms, fair use, merchant card, how it works — nothing dimmed
- **Header banner** (replaces countdown): same frosted glass card but shows availability instead
  - "Available again in" label (9px, uppercase)
  - Countdown to next window: "1d 14h 22m" (16px, 800 weight, white, tabular-nums)
  - "Monday 11:00 AM · Mon–Fri, 11am–3pm" (10px, `rgba(255,255,255,0.6)`)
- **Availability banner below coupon card:** blue card (`#EFF6FF` bg, `#BFDBFE` border, 14px border-radius)
  - Blue icon square (36×36px, `#2563EB` bg, clock icon)
  - "Not Currently Available" title (12px, 800 weight, `#1D4ED8`)
  - "This voucher can only be redeemed Monday to Friday, 11:00 AM – 3:00 PM." (11px, `#1E40AF`)
  - "Next available: Monday 11:00 AM" chip (`rgba(37,99,235,0.1)` bg, 8px border-radius, chevron icon, 11px, 700 weight, `#1D4ED8`)
- **CTA disabled:** navy background (`#010C35`), two-line layout:
  - "Not Available Right Now" (16px, 800 weight, white)
  - "Mon–Fri, 11am–3pm" (11px, 600 weight, `rgba(255,255,255,0.65)`)
  - Not pressable, opacity 0.85

---

## Section 5: Screens 3–6 — PIN Entry + Redemption Flow

### 5.1 Screen 3 — PIN Entry (Keyboard Visible)

**Trigger:** user taps "Redeem This Voucher" on Screen 1

**Background:** voucher detail page dimmed (`brightness(0.5)`, pointer-events disabled)

**Bottom sheet:**
- Slides up with `sheetUp` animation (400ms)
- White background, 28px top border-radius
- Drag handle bar: 36×4px, `#D1D5DB`, centred, 16px bottom margin

**Sheet content:**
- **Merchant row:** 40×40px logo, merchant name (13px, 800 weight), branch with location icon (rose). 14px bottom padding, bottom border
- **Title:** "Enter Branch PIN" — 18px, 800 weight, navy
- **Subtitle:** "Ask a staff member at **Pizza Palace** for the 4-digit branch PIN to redeem your voucher." — 12px, secondary colour. Merchant name bolded (navy)

**PIN input:**
- 4 boxes, 54×54px each (meets 44px touch target), 12px gap, centred
- Default: 2px border (`#E8E2DC`), cream bg (`#FFF9F5`), 14px border-radius
- Active (current digit): rose border, `0 0 0 3px rgba(226,12,4,0.1)` ring, white bg
- Filled: rose border, white bg, digit shown 26px 800 weight navy
- **Input method:** `keyboardType="number-pad"` — uses native iOS/Android numeric keypad (not a custom keyboard)

**Disclaimer banner:**
- Amber warning style: `#FFF7ED` bg, `#FED7AA` border, 12px border-radius
- Triangle-alert icon (amber `#D97706`)
- Text: "Entering the correct PIN will immediately redeem this voucher. It will not be available again during your current monthly cycle." — 10px, `#92400E`

**Redeem button:**
- Same gradient style as Screen 1 CTA
- Text: "Redeem Voucher" with tag icon
- **Disabled state:** opacity 0.4, no pointer cursor — active only when all 4 digits entered

**Keyboard behaviour:**
- Sheet slides up to sit above the native keyboard
- All sheet content remains visible (merchant row, PIN boxes, disclaimer, button)
- Sheet + keyboard together fill the bottom portion of the screen

### 5.2 Screen 4 — PIN Entered (Ready to Confirm)

Same as Screen 3 but:
- All 4 PIN boxes show digits, all have filled styling (rose border, white bg)
- "Redeem Voucher" button is **active** (full opacity, pressable)
- Tapping the button triggers the redemption API call

### 5.3 Screen 5 — Wrong PIN (Error)

Same sheet layout but:
- **Title changes to:** "Incorrect PIN" — styled in red (`#B91C1C`)
- **Subtitle:** "That PIN doesn't match. Please ask the staff member to confirm the branch PIN and try again."
- **PIN boxes:** all 4 show error state — `#B91C1C` border, `#FEF2F2` bg, `shake` animation (400ms, ±6px/±3px translateX)
- **Error message bar:** appears below PIN boxes. Red bg `#FEF2F2`, `#FECACA` border, 10px border-radius, X-circle icon. Text: "Wrong PIN · X attempts remaining" — 11px, `#B91C1C`, 600 weight
- PIN boxes clear after shake animation, cursor resets to first box
- **Redeem button:** disabled again (opacity 0.4)

### 5.4 Screen 6 — Locked Out (Too Many Attempts)

**Trigger:** 5 wrong PIN attempts within 15 minutes (rate limit: 5 per 15 min per userId+branchId, enforced server-side)

Same sheet but keyboard is dismissed:
- **Lockout card:** centred in sheet, `#FEF2F2` bg, `#FECACA` border, 16px border-radius, 18px padding
- **Lock icon:** 44×44px square with 12px border-radius, `#B91C1C` bg, white lock SVG
- **Title:** "Too Many Attempts" — 14px, 800 weight, `#B91C1C`
- **Text:** "You've entered the wrong PIN too many times. Please wait before trying again." — 11px, `#92400E`, 1.5 line-height
- **Countdown timer:** "12:34" — 18px, 800 weight, `#B91C1C`, tabular-nums. Shows "minutes remaining" label below (10px, `#92400E`)
- **Redeem button:** deeply disabled (opacity 0.3)
- Timer counts down in real-time. When it reaches 0, sheet resets to Screen 3 (PIN entry)

### 5.5 As shipped (PRs #44 → #45 → #46)

Initial spec assumed a single happy/error/lockout flow per backend response. Device QA on PR #44 surfaced three additional concerns; PR #45 + PR #46 closed them.

- **Defensive INVALID_PIN fallback (PR #45):** when the backend returns a wrong-PIN error without the structured `remainingAttempts` payload (e.g. unexpected error shape, network glitch parsed as PIN-invalid), the sheet still falls back to a clear wrong-PIN banner and lets the user retry. The spec assumed the backend payload would always be well-formed.
- **No SMS one-time-code autofill (PR #45):** `textContentType="none"` on the PIN field. iOS otherwise hijacks the field with one-time-code autofill (the app uses Twilio for OTP flows elsewhere, so the OS sees the field as eligible). Suppresses the autofill prompt that would steal focus from the PIN entry.
- **Non-PIN backend errors visible to user (PR #45):** the 6 non-PIN error codes (PIN_NOT_CONFIGURED, BRANCH_UNAVAILABLE, BRANCH_MERCHANT_MISMATCH, PHONE_NOT_VERIFIED, SUBSCRIPTION_REQUIRED, VOUCHER_NOT_FOUND) now show a title + body banner inside the sheet rather than silently dismissing. Action-button routing on each banner (e.g. "Verify phone" / "Subscribe now" / "Choose another branch") is the §P4 deferred follow-up.

**Cross-ref:** the full as-shipped contract is captured in [`docs/superpowers/plans/2026-05-06-voucher-detail-redemption-rebaseline.md`](../plans/2026-05-06-voucher-detail-redemption-rebaseline.md) §M2.1.

---

## Section 6: Screen 7 — Redemption Success Popup

**Trigger:** correct PIN entered → API returns success → popup appears

### 6.1 Overlay

- **Background:** `rgba(1,12,53,0.55)` with `backdrop-filter: blur(10px)`
- **Behind the popup:** voucher detail page visible but heavily dimmed (`brightness(0.4)`, `blur(2px)`)
- **Layout:** flexbox centre-centre with 60px top/bottom padding, 24px side padding — popup floats mid-screen with blurred content visible above and below

### 6.2 Modal Container

- **Max-width:** 330px — compact, does NOT fill the screen
- **Border-radius:** 28px
- **Shadow:** `0 32px 80px rgba(0,0,0,0.35), 0 0 0 1px rgba(0,0,0,0.04)`
- **Entrance animation:** `modalSpring` — scale 0.8→1, translateY 30→0, 450ms spring easing

### 6.3 Confetti

- 7 confetti particles, positioned across top of modal
- Colours: brandRose, BOGO purple, amber, green, coral, blue
- Various sizes (4–10px), mix of rectangles and circles
- Staggered delays (0–0.35s), fall 250px over 2.8s with 900° rotation

### 6.4 Header

- **Background:** brand gradient (`#E20C04 → #E84A00`)
- **Padding:** 22px top/sides, 18px bottom
- **Checkmark icon:** 48×48px circle, **solid green** (`#16A34A`) background, white checkmark SVG, 2px white border, green glow shadow. `checkBounce` animation with 200ms delay
- **Title:** "Voucher Redeemed!" — 18px, 800 weight, white
- **Subtitle:** "Show this to staff to claim your discount" — 11px, `rgba(255,255,255,0.85)`

### 6.5 Voucher Strip

- **Purpose:** shows voucher info so merchant can see what discount to apply
- **Background:** cream (`#FFF9F5`), bottom border
- **Layout:** flex row, 10px gap, 12px padding
- **Banner thumbnail:** 56×40px, 8px border-radius — shows voucher banner image
- **Voucher type badge:** uses voucher's allocated colour (e.g. BOGO purple), 9px, 800 weight, uppercase
- **Voucher name:** 12px, 700 weight, navy
- **Merchant name:** 10px, muted

### 6.6 Body

- **Simple code display:** light bg (`#F8F6F3`), 14px border-radius, centred text
  - "Redemption Code" label: 9px, uppercase, muted
  - Code value: 26px, 800 weight, navy, 4px letter-spacing, tabular-nums
  - **No QR code** (that's on Screen 7b)
  - **No animated border** (that's on Screen 7b)
  - **No live timer** (not needed on confirmation popup)

- **Info rows:** date, time, branch — 11px, label muted / value navy bold

- **"Show to Staff" button:** full width, brand gradient, 14px padding, 14px border-radius, eye icon, 14px 800 weight white text. Shadow `0 4px 16px rgba(226,12,4,0.25)`

- **Secondary actions row:** flex, 8px gap
  - "Rate & Review" button: BOGO purple tint bg, purple text, star icon, 1.5px purple border
  - "Done" button: transparent, navy text, 1.5px border colour border

### 6.7 As shipped (PRs #44 → #46)

- **Code shape:** the spec example assumes a 10-char code with 4px letter-spacing. The shipped code is **8-char uppercase A–Z + 0–9 minus O,I**, displayed as **4+4 with monospace font** (e.g. `A7K2 P9X4`). Excluded characters eliminate the most common manual-entry confusion (O/0, I/1). Backend alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ0123456789` (34 chars). 34^8 ≈ 1.79 × 10^12 combinations; `redemptionCode @unique` constraint backstops collisions. Reason: device QA on the original 10-char mixed-case code (PR #44 first ship) surfaced staff-side transcription errors when writing codes onto bills.
- **No confetti yet:** the §6.3 confetti animation was descoped from PR #44 (Tier 1 polish). Tracked as deferred follow-up §P3 — not a regression, just deferred decoration.
- **"Show to Staff" button still fires a deferral alert** in M2 — the full §7 Show-to-Staff full-screen surface is required for M3 (re-framed as REQUIRED for merchant validation/manual-recording readiness, NOT optional polish — see §P1 deferred follow-up). Until M3, the formatted text code is the only customer-side surface for handing off to staff.

**Cross-ref:** [`docs/superpowers/plans/2026-05-06-voucher-detail-redemption-rebaseline.md`](../plans/2026-05-06-voucher-detail-redemption-rebaseline.md) §M2.1.

---

## Section 7: Screen 7b — Show to Staff (Full Screen)

**Trigger:** tapping "Show to Staff" on Screen 7 popup

### 7.1 Background

- **Full-screen gradient:** `linear-gradient(160deg, #E20C04 0%, #C50A03 30%, #B80902 50%, #E84A00 100%)` — rose/coral gradient
- **Depth overlays:** radial gradients for subtle light/shadow at 30%/70% positions
- **Padding:** 54px top, 24px sides, 32px bottom

### 7.2 Voucher Type Badge

- **Uses voucher's allocated colour** — NOT glassmorphic white. E.g. BOGO = solid `#7C3AED` purple background
- **Layout:** flex row, tag icon + type text, 8px/16px padding, 12px border-radius
- **Text:** 12px, 800 weight, white, uppercase, 0.1em letter-spacing

### 7.3 Voucher Info

- **Voucher name:** 20px, 800 weight, white, centred
- **Merchant + branch:** 13px, `rgba(255,255,255,0.75)`, centred, 24px bottom margin

### 7.4 Animated Code Card

This is the anti-fraud showpiece:

- **Animated border:** 3px padding wrapper with `gradientShift` animation — `linear-gradient(90deg, #FFF, rgba(255,255,255,0.5), #FCD34D, #FFF)`, 300% background-size, 2.5s linear infinite loop. White/gold gradient on the red background looks distinct from the popup version.
- **Inner card:** white, 20px border-radius, 24px/20px padding
- **LIVE badge:** pulsing red dot (7px, `livePulse` animation) + "LIVE" text (10px, 800 weight, rose, uppercase)
- **Code:** 38px, 800 weight, navy, 6px letter-spacing, tabular-nums
- **QR code:** 160×160px box, 16px border-radius, 2px border. QR pattern 120×120px. Redeemo "R" logo centred 28×28px with brand gradient
- **Live date & time:** prominent — **18px, 800 weight, navy**, tabular-nums, with rose clock icon (18px). Shows full date + time with seconds updating in real-time (e.g. "17 Apr 2026 · 1:24:38 PM"). Separated from QR by dashed border-top, 16px top margin/padding. **Screenshots freeze this clock** — trained staff can spot a static timestamp.

### 7.5 Info Card

- **Glassmorphic card:** `rgba(255,255,255,0.12)` bg, `backdrop-filter: blur(8px)`, 16px border-radius, `rgba(255,255,255,0.15)` border
- **Rows:** Customer name (first name + initial), Voucher Type, Redeemed date/time
- **Labels:** `rgba(255,255,255,0.6)`, 13px, 500 weight
- **Values:** white, 13px, 700 weight

### 7.6 Done Button

- `rgba(255,255,255,0.18)` bg, `backdrop-filter: blur(8px)`, `rgba(255,255,255,0.25)` border
- White text, 15px, 700 weight, 16px border-radius
- **Tapping:** dismisses back to Screen 7 popup

### 7.7 As shipped (M3, branch `feature/voucher-m3-show-to-staff`)

The full Show-to-Staff full-screen surface is now LIVE in M3. All five locked anti-fraud + UX behaviors are wired end-to-end. Ships INSIDE the M3 implementation PR per the standing merge rule.

**QR payload format (D5 + plan §Security model — locked).**
- The QR carries the OPAQUE 8-character redemption code only (e.g. `A7K2P9X4`).
- NO public validation URL. NO scheme. Generic scanners read it as plain text.
- **Self-validation loophole NOT possible.** The customer-side `me/:code` endpoint is read-only and customer-JWT-scoped. The staff `verify` route requires merchant/branch auth that the customer JWT cannot reach. There is no client-side mark-as-validated path. A leaked code from another customer cannot surface their redemption status to a third party's session (returns `REDEMPTION_NOT_FOUND`).

**Brightness boost — best-effort + kill-switch.**
- `useBrightnessBoost` ramps to maximum on mount, restores prior value on unmount. Every `expo-brightness` API call is wrapped in try/catch. Failures (Low Power Mode, permissions, platform quirks) silently no-op.
- Restore guard: only attempts a restore if the capture step succeeded.
- `BRIGHTNESS_BOOST_ENABLED` const at the top of `ShowToStaff.tsx` — flip to `false` to ship a build that disables brightness boost without affecting the QR, manual code, polling, auto-hide, or AppState wiring. Owner-clarification kill-switch (locked 2026-05-08).

**Auto-hide timer — 2 min idle / 10 s warning / freeze on validated.**
- 1m50s idle → state flips to `warning` (small inline hint above the Done button).
- +10 s → state flips to `hidden` (QR blurs via the QRCodeBlock blurred prop). Tap-to-show recovery via Pressable wrapper.
- `frozen: true` (validated phase) short-circuits — surface stays visible until the 2s auto-dismiss completes.
- `active: false` (background) clears all timers and pins `visible` so backgrounded time does NOT consume the 2-min idle budget.

**Validation polling — 5s cadence, 15-min budget, two flags.**
- `useRedemptionPolling(code, { enabled, paused })` — enabled drives mount-toggle; paused (AppState background) suspends refetch but PRESERVES `startedAt` so backgrounded time still consumes the 15-min budget. Resume on focus picks up where it left off.
- Phase flips polling → validated when backend `me/:code` returns `isValidated: true`.

**Validation success transition — ~2s validated state then auto-dismiss.**
- `successHaptic()` fires on phase flip.
- Surface shows green-tinted glassmorphic badge: "Verified by staff at <branch>" (deviation #2 from v6 — v6 was pre-validation-flow).
- After 2,000 ms, `onDone` is called automatically and the modal dismisses.
- **Reduced motion** (`AccessibilityInfo.isReduceMotionEnabled === true`): `onDone` fires instantly; Modal `animationType` is `'none'`; PulsingDot's reduced-motion fallback handles the LIVE pulse.

**Screenshot guard — best-effort + kill-switch + platform-specific.**
- iOS path: `expo-screen-capture.addScreenshotListener` subscription. On fire → `onBannerShown()` (caller blurs QR + surfaces a banner) THEN fire-and-forget POST to `/api/v1/redemption/:code/screenshot-flag`. **5-second client-side dedup** so rapid Side-button + Volume-Up bursts collapse to one banner + one POST. Backend Redis SETNX (Task 2) is the second layer.
- Android path: `preventScreenCaptureAsync()` enables `FLAG_SECURE` on mount, blocks screenshots system-wide while the surface is mounted; recents-screen previews go black. `allowScreenCaptureAsync()` clears on unmount. No listener — OS prevents capture before there's anything to react to.
- Banner copy: "Screenshot taken — staff verify only the live screen. Tap the QR to show again."
- **Anti-fraud invariant (pinned by `qr-code-block.test.tsx`):** when blurred, the QRCodeBlock returns ONLY a Pressable + BlurView. The QR child element is gone from the tree. A screenshot taken while blurred captures the blur, NOT the underlying code.
- `SCREENSHOT_GUARD_ENABLED` const matching the brightness pattern. Flip to `false` to disable the guard if `expo-screen-capture` misbehaves on a specific device/version.
- Validated phase takes precedence: when `phase === 'validated'`, the screenshot banner is suppressed even if the user hadn't dismissed it (the surface is about to auto-dismiss anyway).

**AppState backgrounding contract (locked plan §Backgrounding behavior).**
- Surface stays MOUNTED across background → foreground.
- Polling pauses on blur, resumes on focus (15-min budget continues counting).
- Auto-hide timer pauses on blur, re-arms on focus (2-min idle does NOT count backgrounded time).
- Brightness restores on blur, re-applies on foreground (try/catch silent on failure).
- App-killed → recovery via persisted RedemptionDetailsCard (§8.10 below).

**Customer name (M3 §U1 lock).** `<ShowToStaff customerName="">` is the M3 default. The component conditionally renders the "Customer" info-row only when `customerName.length > 0`. Empty string suppresses both label and value entirely. Surfacing first-name + last-initial is tracked as `§U1` deferred follow-up — pick up after merchant-portal validation surfaces (§R4) lock so both sides design together.

**Two reachability paths.**
- **SuccessPopup → ShowToStaff** (just-redeemed): `setSuccessPopup(null)` THEN `setShowToStaff({...})` — popup closes first so user lands cleanly on the QR.
- **RedemptionDetailsCard "Show to Staff" button → ShowToStaff** (return visit during active cycle): same `setShowToStaff` path, code/branchName sourced from `voucher.lastRedemption` (see §8.10).
- M2's `Alert.alert('Show to Staff', '…ships in next milestone')` stub is gone.

**Cross-ref:** plan `docs/superpowers/plans/2026-05-06-voucher-detail-redemption-rebaseline.md` §M3.1 carries the full implementation contract (commit map + 10 locked decisions + test counts + v6 deviations).

---

## Section 8: Screen 8 — Voucher Detail (Already Redeemed)

**When:** user returns to a voucher they've already redeemed in the current cycle

### 8.1 Washed-Out Coupon Header

- Same layout as Screen 1 header but with `filter: grayscale(0.4) brightness(0.8); opacity: 0.65`
- All header content (type badge, title, description, save badge) appears faded
- **Heart icon:** outline/unfilled — favourite is auto-removed after redemption

### 8.2 "Voucher Redeemed" Badge

- **Positioned OUTSIDE the filtered header** (sibling element, not child) — so it renders at full vivid colour while the header behind is washed out
- **Background:** solid `#16A34A` (savings green) — NO opacity reduction
- **Icon:** shield-check SVG inside a 28×28px frosted circle (`rgba(255,255,255,0.25)`)
- **Text:** "Voucher Redeemed" — 15px, 800 weight, white
- **Padding:** 12px/24px, 16px border-radius
- **Shadow:** `0 8px 32px rgba(22,163,74,0.4), 0 2px 8px rgba(0,0,0,0.2)` — green glow
- **Border:** 1.5px `rgba(255,255,255,0.25)`
- **Position:** absolute, bottom 20px, centred horizontally

### 8.3 Voucher Banner

- Same banner as Screen 1 but with `filter: grayscale(0.4); opacity: 0.6`
- Margin 0 14px, 16px border-radius, 140px height

### 8.4 Merchant Card

- Same design as Screen 1 but slightly reduced opacity (0.75)
- Still tappable — navigates to merchant profile

### 8.5 Redemption Details Card

- White card, 20px border-radius, 20px padding, subtle shadow
- **Header row:** green circle icon (check) + "Redemption Details" title (15px, 800 weight, navy) + date/time subtitle (11px, muted)
- **Info rows:** Code (16px, 800 weight, navy, 3px letter-spacing, tabular-nums), Branch, Date, Time — each 12px, labels muted, values navy bold
- **QR code section:** below info rows, separated by dashed border-top. "Redemption QR Code" label (10px, uppercase, muted). 100×100px QR box with Redeemo logo

### 8.6 Rate & Review CTA

- Full width, BOGO purple tint bg (`rgba(124,58,237,0.06)`), purple text, star icon, 1.5px purple border
- Text: "Rate & Review Pizza Palace" — 14px, 700 weight
- **Tapping:** opens merchant review flow

### 8.7 Terms & Conditions

- Same as Screen 1 but dimmed (`opacity: 0.45`)

### 8.8 Sticky Bottom — Disabled CTA

- Same position as Screen 1 CTA
- **Background:** muted grey (`#9CA3AF`), no shadow
- **Text:** "Already Redeemed This Cycle" with check icon
- **Opacity:** 0.6, `cursor: default` — not pressable

### 8.9 As shipped (PRs #44 → #46)

The full §8 visual treatment (washed-out coupon, REDEEMED stamp, dimmed merchant card, voucher-banner greyscale, terms opacity reduction) is **deferred** as §Q1-Q5 — a Tier 2 design + composition pass that pairs with M3. PR #46 closed the **functional** parts of redeemed-state safety; the **visual** redesign is held out intentionally.

What ships on M2:

- **State-3 (already-redeemed) safety hard-block:** branch picker / "Change ▾" pill / Redeem CTA all hard-blocked (three layers — see plan §M2.1 issue 1). Once redeemed, the user cannot reopen the redemption flow until the cycle rolls over.
- **MerchantRow `mode` prop:** in redeemed state, MerchantRow renders `mode='redeemed-known'` ("REDEEMED AT <branch>") when the redemption branch is known, or `mode='redeemed-unknown'` (neutral redeemed-cycle wording) when not known. The "Change ▾" pill is suppressed in both modes.
- **CycleRulesCard post-redemption variant** (new for PR #46): warmer state-aware copy "You've used this voucher for your current cycle. It will be ready to use again on the renewal date shown below." with the renewal date in a brand-rose tinted block.
- **RedemptionDetailsCard placement:** between hero and coupon body in redeemed state (NOT below all other cards). Includes voucher summary block (type, title, merchant, "Saved up to" past-tense + corrected disclaimer) above the redemption code/branch/date rows.
- **Redeemed-state DOM order (locked):** hero → RedemptionDetailsCard → CycleRulesCard → coupon body → MerchantRow → VoucherTypeExplainerCard (collapsible) → HowItWorks (collapsible).
- **M2 immediate-after-redemption only:** the RedemptionDetailsCard renders for users who just redeemed (driven by in-memory `lastRedemption` from the redeem mutation response). Return visits during the active cycle currently see only the RedeemedBadge + disabled CTA — not the full card. Persisted return-visit RedemptionDetailsCard remains deferred (§P2 — needs `redemptionCode` / `redeemedAt` / `branch` fields on the voucher payload).
- **Cycle-renewed cleanup invariant** (§Q6, locked 2026-05-08): when the cycle rolls over, the page-level state machine reverts to active automatically via `voucher.isRedeemedThisCycle === false`. The §P2 implementer must gate the persisted card on the same flag, NOT on persisted-fields-existing — past redemptions belong on Settings → Redemption History (§Q5), not on voucher detail.

What's deferred (§Q1-Q5):

- Washed-out coupon header (`grayscale(0.4) brightness(0.8) opacity(0.65)`).
- Solid green "Voucher Redeemed" stamp positioned outside the filtered header.
- Dimmed merchant card / banner / terms.
- Merchant profile voucher-card redeemed treatment.
- Settings → Redemption History surface for past redemptions.

**Cross-ref:** [`docs/superpowers/plans/2026-05-06-voucher-detail-redemption-rebaseline.md`](../plans/2026-05-06-voucher-detail-redemption-rebaseline.md) §M2.1 (locked DOM order + decisions); deferred follow-ups index §P2 / §Q1-Q6.

### 8.10 As shipped (M3 — persisted return-visit RedemptionDetailsCard live)

M3 closes the §P2 persisted-return-visit gap that M2 explicitly held back. The §8.9 line "M2 ships immediate-after-redemption RedemptionDetailsCard ONLY — return visits during the active cycle currently see only the RedeemedBadge + disabled CTA" is **superseded** for M3 onward.

**What's now live:**

- **`voucher.lastRedemption` payload extension** on `GET /api/v1/customer/vouchers/:id` (M3 Task 5). Surface shape:
  ```ts
  lastRedemption: {
    code:        string                    // 8-char canonical
    redeemedAt:  string                    // ISO
    branch:      { id: string; name: string }
    isValidated: boolean
    validatedAt: string | null             // ISO when validated
  } | null
  ```
- **Cycle-window-gated.** Non-null ONLY when (1) ACTIVE/TRIALLING subscription, (2) `isRedeemedThisCycle === true`, AND (3) a `VoucherRedemption` row exists for `(userId, voucherId)` with `redeemedAt` within `[cycleStart, cycleEnd)`. After cycle rollover, the backend flips `isRedeemedThisCycle` AND `lastRedemption` together by construction (single hoisted `getCurrentCycleWindow()` call drives all three derived values per §M3.1 / §Q6).

**Frontend rendering — dual-source `displayRedemption` shape.**

The `RedemptionDetailsCard` mount on `VoucherDetailScreen` resolves a single `displayRedemption` object from two possible sources:
- **PRIMARY: in-memory `lastRedemption`** (just-redeemed path). Freshest data + `branchName` sourced from the merchant-profile branch lookup. `isValidated: false` (just created).
- **FALLBACK: `voucher.lastRedemption`** (return visits during the active cycle). `isValidated` from the backend payload — drives a green "Validated by staff" pill when staff has already cleared the redemption.

The two sources never both render — the in-memory path takes precedence; the persisted path fills the gap for app relaunches and React Query cold-cache opens.

**§Q6 invariant — load-bearing gate (locked + pinned by Task 18).**

The `RedemptionDetailsCard` renders ONLY when `stateKey === 'redeemed-this-cycle'` (driven by `voucher.isRedeemedThisCycle`). The presence of `lastRedemption` data is a SECONDARY guard (no source → no render), NEVER the primary gate. Even if a stale `voucher.lastRedemption` lingers in a payload OR React Query cache after rollover, the frontend gate holds.

**Pinned by 4 phases** in `voucher-detail-redeem-flow.test.tsx`:
- PHASE 1 — current cycle: `isRedeemedThisCycle:true` + `lastRedemption` present → card renders.
- PHASE 2 — rolled-over: `isRedeemedThisCycle:false` + `lastRedemption: null` → card hidden, redeemable state restored.
- PHASE 3 — defensive drift: `isRedeemedThisCycle:false` + `lastRedemption` STILL PRESENT → card MUST stay hidden. **Critical pin** against future refactors that would otherwise break the gate.
- PHASE 4 — negative defense: `isRedeemedThisCycle:true` + `lastRedemption: null` → no card (no source to render from).

**RedemptionDetailsCard button — live in M3.**

The "Show to Staff" button is no longer disabled. testID `redemption-details-show-to-staff` (was `…-stub`); accessibility label drops the `(available in next milestone)` suffix; brand-rose → coral gradient matching the screen's primary CTA. Press fires `onShowToStaff()` which mounts the full-screen `<ShowToStaff>` modal (§7.7).

**Validated indicator on return visit.**

When `voucher.lastRedemption.isValidated === true`, the card renders a small green "Validated by staff" pill below the action button. Surfaces on return visits so the user doesn't need to reopen Show-to-Staff just to see status.

**Q1-Q5 visual redesign STILL deferred.**

The full washed-out coupon header / REDEEMED stamp / dimmed merchant card / merchant-profile voucher-card treatment / Settings → Redemption History surface — all remain deferred per §Q1-Q5. M3 ships the FUNCTIONAL persisted return-visit; the full visual redesign is a separate Tier 2 design pass paired with §S1-S3.

**Cross-ref:** plan `docs/superpowers/plans/2026-05-06-voucher-detail-redemption-rebaseline.md` §M3.1 (10 locked decisions + commit map); deferred-followups index §P1 (closed-by-M3), §P2 (closed-by-M3 for current cycle; past-cycle history → §Q5), §Q6 (pinned-by-Task-18).

### Post-Bundle-E final wave (locked 2026-05-08, 3 commits on top of original M3 contract)

After the Bundle E task list completed, three commits landed on the M3 branch addressing device-QA findings during the rebase-and-merge cycle. The as-shipped M3 surface includes:

**SuccessPopup anti-fraud parity (§7.6 update + §8.9 spec extension).**
- Live ticking timestamp (`Live: 08 May 2026 · 14:24:38`) inside the proof area, RIGHT NEXT TO the redemption code so a screenshot cannot crop one without the other. Updates every 1s including under reduced motion (trust signal, not decorative motion).
- Static "Redeemed on" receipt-style row replaces the previous separate Date + Time rows. Format `08 May 2026, 14:24` (en-GB / Europe/London, no seconds — receipt detail).
- Header subtitle: *"Staff verify on the live Show to Staff screen"* (replaces *"Show this to staff to claim your discount"* — old framing implied the popup itself was the proof).
- Closes the parity gap with §7.7 ShowToStaff: both surfaces now have live trust signals, so a screenshot of either freezes the live-clock and trained staff can spot it.

**Cross-platform screen-capture protection split (§7.6 + §7.7 update).**
- New `useScreenCaptureProtection(active)` hook owns the cross-platform prevent/allow lifecycle: Android FLAG_SECURE blocks screenshots + recordings; iOS 11+ overlays a blurred snapshot during active recording / mirroring. Per `expo-screen-capture@8.0.9` documentation.
- `useScreenshotGuard` slimmed to iOS-listener-only (post-fact screenshot detection + 5s dedup + best-effort telemetry + ref-pattern callback stability). Android branch removed (was a duplicate FLAG_SECURE call).
- `<ShowToStaff>` now calls BOTH hooks: `useScreenCaptureProtection` for prevention, `useScreenshotGuard` for iOS post-fact screenshot signalling.
- `<SuccessPopup>` now calls `useScreenCaptureProtection(visible)` to share the prevention baseline. Intentionally does NOT install the iOS screenshot listener — no banner, no telemetry. Both surfaces displaying the code now have parity protection without duplicating native call logic.
- Does NOT prevent SCREENSHOTS on iOS (Apple has no API). Listener-based post-fact path continues for screenshots on Show-to-Staff only.
- Banner copy tightened: `"Screenshot detected"` (was `"Screenshot taken"`) — more accurate framing of OS-driven detection.
- Cleanup symmetry: protection hook releases on unmount so other app screens can be recorded normally.

**Ref-pattern callback stability (post-review hardening).**
- `useScreenshotGuard` now stashes `onBannerShown` in a `useRef` and keys the native-subscription effect ONLY on `[active, code]`. Without this, parent re-renders that pass a fresh inline callback would tear down and re-install the screenshot listener AND `preventScreenCaptureAsync` on every render. For anti-fraud code we require zero re-arm windows. Pinned by `does NOT re-install ... when the parent passes a new callback identity (re-render stability)` test + the counterpart `DOES re-install when code changes` test.

**Locked iOS limitation (cross-ref §AB / §AE).** The FIRST screenshot on iOS will capture the unblurred QR + 8-char code BEFORE the listener-driven blur paints. The blur + banner are post-fact mitigations. Staff training + merchant validation policy (never accept screenshots as proof) is the load-bearing fraud control. Stronger anti-fraud options (QR hidden by default, tap-to-reveal, short-lived rotating QR, merchant validation policy formalisation, telemetry dashboards) are deferred to §AE for v2 product brainstorm.

**Locked SuccessPopup deferred polish (cross-ref §S2).** The broader visual redesign — confetti, saving amount surfacing, Rate & Review CTA visual treatment, Rate & Review routing — remains deferred. M3 ships the ANTI-FRAUD baseline (live timestamp + staff-verify copy); the design pass is a §S2 follow-up.

---

## Section 9: Post-Redemption Automations

These are triggered server-side when a voucher is successfully redeemed (VoucherRedemption record created).

### 9.1 Email to Merchant (Immediate)

**Recipients:** branch email + merchant admin email

**Content:**
- Subject: "Voucher Redeemed — [Voucher Name]"
- Body: voucher name, voucher type, customer first name, branch name, date/time, redemption code
- Sent via Resend (when integrated — Phase 6. Until then, logged as placeholder)

### 9.2 Email to Customer (Immediate)

**Recipient:** customer's registered email

**Content:**
- Subject: "Your voucher at [Merchant Name] has been redeemed"
- Body: voucher name, merchant name, branch, date/time, redemption code
- Friendly tone: "We hope you're enjoying Redeemo!"
- Prompt to leave a review/feedback for the merchant (if not already submitted)
- Sent via Resend (Phase 6 dependency)

**Opt-out:** customer can disable redemption emails from Account → Notification Preferences → "Redemption emails" toggle. Enabled by default.

### 9.3 Push Notification — Review Reminder (1 Hour Delay)

**Trigger:** 1 hour after successful redemption, IF customer has NOT already submitted a review for the merchant

**Content:**
- Title: "[Merchant Name]"
- Body: "We hope you had a great experience! Leave a review to help others discover them."
- Tapping opens the merchant review screen

**Conditions:**
- Not sent if review already submitted
- Not sent if customer has disabled "Review reminders" in Notification Preferences
- Sent via FCM (Firebase Cloud Messaging)
- Requires a scheduled job / delayed queue (e.g. BullMQ with Redis)

### 9.4 Notification Preferences (Account Section)

New toggles in Account → Notification Preferences:

| Toggle | Default | Controls |
|--------|---------|----------|
| Redemption emails | ON | Customer email confirmation after each redemption |
| Review reminders | ON | Push notification review nudge (1 hour post-redemption) |

---

## Section 10: Backend Interactions

### 10.1 Redemption Flow (existing API)

1. Customer taps "Redeem This Voucher" → PIN entry sheet opens
2. Customer enters 4-digit branch PIN → taps "Redeem Voucher"
3. `POST /api/v1/redemption/redeem` with `{ voucherId, branchId, pin }`
4. Server validates: subscription active, voucher active+approved, merchant active, branch matches merchant, not already redeemed this cycle, PIN correct, not rate-limited
5. On success: creates `VoucherRedemption` with `redemptionCode` (nanoid), updates `UserVoucherCycleState.isRedeemedInCurrentCycle = true` — atomically
6. Returns: redemption code, date/time, branch info
7. Client shows Screen 7 (success popup)

### 10.2 PIN Validation Errors

| Error | Client Response |
|-------|----------------|
| Wrong PIN | Screen 5: shake animation, "X attempts remaining" |
| Rate limited (5 attempts / 15 min) | Screen 6: lockout with countdown timer |
| Already redeemed this cycle | Toast/error, redirect to Screen 8 |
| Subscription inactive | Redirect to subscribe screen |
| Voucher/merchant inactive | Error message, back to discovery |

### 10.3 Staff Verification (existing API)

- `POST /api/v1/redemption/verify` — branch staff or merchant admin validates redemption
- Accepts QR scan or manual code entry
- Sets `isValidated = true`, records `validationMethod` (QR_SCAN / MANUAL)
- This is **not visible to the customer** — happens on the merchant side

### 10.4 Favourite Auto-Removal

- On successful redemption, backend removes the voucher from customer's favourites (if favourited)
- Client updates heart icon to outline (unfilled) on Screen 8
- Endpoint: `DELETE /api/v1/customer/favourites/vouchers/:voucherId` (called server-side as part of redemption flow, or client-side after receiving success response)

### 10.5 Post-Redemption Jobs (new)

| Job | Timing | Service | Dependency |
|-----|--------|---------|------------|
| Merchant email | Immediate | Resend | Phase 6 |
| Customer email | Immediate | Resend | Phase 6 |
| Review reminder push | 1 hour delay | FCM + scheduled queue | BullMQ/Redis |

---

## Section 11: Edge Cases & Guards

| Scenario | Behaviour |
|----------|-----------|
| Free user taps voucher | Sees Screen 2 — "Subscribe to Redeem" CTA |
| Subscribed user, already redeemed this cycle | Sees Screen 8 — greyed out, redemption details shown |
| Voucher redeemed at Branch A, user views from Branch B | Still shows Screen 8 — redemption is per-user per-cycle across ALL branches |
| Merchant suspended after redemption | Screen 8 still accessible with redemption details. Merchant card may show inactive state |
| PIN entry abandoned (sheet dismissed) | No redemption. Sheet dismisses, returns to Screen 1 |
| Network error during redemption | Show error toast on PIN sheet. PIN boxes stay filled. User can retry |
| Lockout timer expires while on Screen 6 | Sheet resets to Screen 3 (fresh PIN entry) |
| Customer screenshots Show to Staff screen | Animated border freezes, LIVE dot freezes, clock stops updating — trained staff can identify static screenshot |
| Customer navigates away from success popup | Popup persists until "Done" tapped. If app backgrounded + returned, popup should still be visible |
| Past-cycle redeemed voucher | Accessible from Account → Activity/History with full redemption details (code, date, time, branch, QR) |
| Time-limited voucher, active window | Screen 1a — amber countdown banner shows remaining time. Countdown updates live (per-second). CTA enabled |
| Time-limited voucher, countdown reaches zero while on screen | Transition to Screen 1b (expired). CTA disables. Countdown banner replaced with red "Voucher Expired" badge. No auto-navigation away |
| Time-limited voucher, expired | Screen 1b — header washed out (grayscale 40%, brightness 80%, opacity 65%). Red badge positioned OUTSIDE filtered header. CTA disabled with "Voucher Expired" text |
| Time-limited voucher, outside availability window | Screen 1c — full-colour header (not washed out). Blue availability banner with "Available again in" countdown + next active window details. CTA disabled with two-line text ("Not Available Right Now" / schedule) |
| Time-limited voucher, availability window opens while on Screen 1c | Transition to Screen 1a. Blue banner replaced with amber countdown. CTA re-enables |
| Time-limited voucher, user taps disabled CTA (expired) | No action. Button is visually and functionally disabled (opacity 0.5, no press handler) |
| Time-limited voucher, user taps disabled CTA (outside window) | No action. Button is visually and functionally disabled |
| Time-limited voucher, redeemed during active window, window closes | Screen 8 (already redeemed) — no change. Redemption is permanent for the cycle regardless of availability windows |

---

## Section 12: Accessibility

| Requirement | Implementation |
|-------------|----------------|
| Touch targets | All buttons ≥ 44×44px (PIN boxes 54×54px, CTAs full-width 15px padding) |
| Contrast ratios | All text meets 4.5:1 minimum (white on brand gradient, navy on white, error red on light bg) |
| PIN input | `keyboardType="number-pad"`, `accessibilityLabel="PIN digit X of 4"` per box |
| Animations | Use `transform`/`opacity` only (GPU-accelerated). Respect `prefers-reduced-motion` — disable confetti, shake, pulse animations |
| Screen reader | Success popup: announce "Voucher redeemed successfully" on appear. Lockout: announce remaining time. Error: announce "Incorrect PIN, X attempts remaining" |
| Focus management | After wrong PIN: focus returns to first PIN box. After lockout clears: focus returns to first PIN box |
