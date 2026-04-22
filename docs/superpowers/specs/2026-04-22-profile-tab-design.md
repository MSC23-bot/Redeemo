# Profile Tab — Design Spec

**Date:** 2026-04-22
**Phase:** 3C.1h
**Surface:** Customer App (React Native / Expo)
**Status:** Approved — ready for implementation planning

---

## 1. Overview

The Profile tab is the account management hub of the customer app. It gives users a single place to view their identity, manage their subscription, control app behaviour, access community features, get help, and safely exit or remove their account.

Design intent: polished, breathable, informative — not a dense settings dump. Every section should feel intentional. Generous whitespace, clear hierarchy, spring-based motion. Consistent with the rest of the app's visual language (#010C35 navy, #E20C04/#E84A00 red-orange gradient, white cards on #FAF8F5 background).

---

## 2. Architecture

### Navigation
The Profile tab is a single scrollable screen (`ProfileScreen`). All editing happens in `BottomSheet` components anchored to the screen — no dedicated sub-screens for standard editing. The one exception is the support flow ("Get Help"), which uses a full-screen modal due to its complexity (ticket list + form + attachments + status).

### Sheet pattern
All sheets share a common pattern:
- Spring-based slide-up entrance (`useAnimatedStyle` + spring config)
- Scrim at 45% opacity
- Swipe-down to dismiss; confirmation alert if there are unsaved changes
- Save button at the bottom with loading spinner during the async call
- Keyboard-avoiding scroll view inside each sheet
- On success: close sheet + show toast (3.5s auto-dismiss)
- On error: inline error below the relevant field, sheet stays open

### Motion standards (UI/UX Pro Max compliance)
- Duration: 150–300ms for micro-interactions, ≤400ms for sheet entrance
- Easing: ease-out for entering, ease-in for exiting; spring physics for sheets
- Exit animations: 60–70% of enter duration
- Row mount: staggered FadeInDown (30ms offsets, `react-native-reanimated`)
- Press feedback: `scale(0.97)` on `Pressable`, restore on release
- Reduce motion: when `AccessibilityInfo.isReduceMotionEnabled()` is true, replace spring/stagger with instant opacity transitions
- No blocking animations: UI stays interactive during all transitions

### Spacing and typography
- 4/8pt rhythm throughout (no arbitrary values)
- Section group gap: 16pt
- Row height: minimum 52pt (touch target ≥44pt)
- Section headers: 11px semibold uppercase, letter-spacing 0.5px, navy/50
- Row labels: 15px medium, #010C35
- Row subtitles/previews: 12px regular, navy/50
- Muted/stub labels: 12px regular, navy/35

---

## 3. Screen Structure

```
ProfileScreen (ScrollView)
├── Header card
├── MY ACCOUNT section
├── SUBSCRIPTION section
├── NOTIFICATIONS section
├── APP SETTINGS section
├── REDEEMO section
├── SUPPORT & LEGAL section
└── Sign out / Delete account group
    └── App version (12px muted, centred)
```

Each section is a white rounded card (`borderRadius: 14`, `backgroundColor: #FFFFFF`, subtle shadow). Section label rendered above the card as a group header (not inside the card).

---

## 4. Header Card

### Layout
Compact card, white background, 14pt radius. Single horizontal row:

```
[Squircle avatar 52pt] [Name · email · completeness bar] [ACTIVE badge]
```

**Avatar (52×52pt, 14pt radius):**
- If `profileImageUrl` is set: display the image, cropped to fill
- Otherwise: initials from `firstName + lastName[0]`, white text on brand gradient (`#E20C04 → #E84A00`)
- Tapping the avatar opens the native image picker (`expo-image-picker`); selected image uploaded via `useUpdateAvatar()` hook
- Camera icon overlay (bottom-right, 20×20pt circle, white bg) indicates tappability
- Tap feedback: scale 0.95 on press

**Name and email:**
- Name: 15px semibold, #010C35, truncated with ellipsis after one line
- Email: 12px regular, navy/50, one line

**Completeness bar:**
- Labelled progress bar below name/email: `PROFILE STRENGTH · 72%` (11px caps, navy/40)
- Bar: 5pt tall, `#F3F4F6` track, brand gradient fill, `borderRadius: 3`
- Animated on mount: spring from 0 → actual value (400ms ease-out)
- Tip text (12px, navy/40): personalised based on what's missing — computed from `profileCompleteness` fields:
  - < 40%: "Add your date of birth, address, and interests to unlock more personalised deals"
  - 40–79%: "Add your address and interests to improve your recommendations"
  - 80–99%: "Almost there — add your profile photo to complete your profile"
  - 100%: tip text is hidden entirely (no auto-dismiss, no brief flash — just not shown)
- Tip text must NOT feel nagging — framing is always benefit-led ("unlock", "improve", "personalise")

**ACTIVE badge (top-right):**
- Brand gradient pill, 8px bold white text "ACTIVE"
- If subscription is CANCELLED: grey pill "CANCELLED"
- If no subscription: hidden
- Data from `useSubscription()` hook (already exists)

---

## 5. MY ACCOUNT Section

Four rows. Each row shows a current-value preview in muted text on the right side so the section feels informative before tapping.

| Row | Preview text | Opens |
|-----|-------------|-------|
| Personal info | "Shebin · Male" (name + gender if set, otherwise "Tap to add") | Personal Info sheet |
| Address | "Manchester, M1 4BT" (city + postcode if set, otherwise "Tap to add") | Address sheet |
| Interests | "Food & Drink, Fitness +2" (first two names + count if >2, otherwise "Tap to add") | Interests sheet |
| Change password | — | Change Password sheet |
| Active session | "iPhone 14 Pro" (device name from session) | Non-interactive — read-only |

### Personal Info sheet
Fields:
- First name (text input, required)
- Last name (text input, required)
- Date of birth (native date picker via `@react-native-community/datetimepicker`, iOS wheel / Android spinner)
- Gender (segmented selector or picker: Male / Female / Non-binary / Prefer not to say / Other)

**Email and phone — read-only display rows** (not form inputs):
- Each displayed as a labelled info row with a lock icon (16pt, navy/40)
- "Email address · shebin@email.com"
- "Phone number · +44 7700 900123" (or "Not added" if null)
- Below both rows, a single calm note: "For security, email and phone can only be changed by our team. Tap below to request a change."
- "Get help with this →" is a tappable link that dismisses the sheet and opens the Get Help modal, pre-populating the topic as "Account issue" and the message pre-filled with "I'd like to change my [email/phone number]."

Save calls `PATCH /api/v1/customer/profile` (existing endpoint). Inline error on failure. Toast on success.

### Address sheet
Fields: Address line 1, Address line 2 (optional), City, Postcode.
Save calls same PATCH endpoint.

### Interests sheet
Multi-select chip grid. Categories fetched from `GET /api/v1/discovery/categories` (same data as signup wizard). Chips are tappable toggles — navy fill when selected, outlined when not. Save button at bottom calls `PUT /api/v1/customer/interests`.

### Change Password sheet
Fields: Current password (with show/hide toggle), New password (with show/hide toggle), Confirm new password.
Client-side validation: new ≠ current, confirm === new, min 8 chars.
Calls `POST /api/v1/customer/change-password`. Error codes: `CURRENT_PASSWORD_INCORRECT` → "Your current password is incorrect."

---

## 6. SUBSCRIPTION Section

Two rows.

### Plan row
Displays current plan with subtitle. Examples:
- Primary: "Monthly · £6.99/mo"
- Subtitle: "Renews 12 May 2026"
- Or if cancelled: "Access until 12 May 2026"

Tapping opens a Subscription Management sheet:
- Plan card: plan name, price, renewal/expiry date
- Prominent callout: "Your access continues until [date] even after cancelling"
- "Cancel subscription" button — destructive secondary style (red outline, not filled)
- Confirmation bottom sheet before calling `DELETE /api/v1/subscription`
- After cancellation: sheet closes, badge updates to CANCELLED, row subtitle updates to "Access until [date]"
- Data from `useSubscription()` hook (already exists)

### Payment method row
Label: "Payment method"
Right side: small "Coming soon" pill (grey, 10px, rounded)
Non-interactive — rendered with 0.45 opacity, no `Pressable` wrapper
Must not look broken — it looks intentionally unavailable

---

## 7. NOTIFICATIONS Section

Two rows.

### Push notifications row
Rendered as a muted, non-interactive row. Where a toggle would be, instead shows a small "Coming soon" chip (grey, 10px). Row opacity: 0.45. No `Pressable`. This is a 🟡 stub — FCM infrastructure belongs in Phase 6. Must not look like a broken toggle.

**Critical implementation constraint:** The push notifications stub must not trigger any OS permission request — no `Notifications.requestPermissionsAsync()`, no `Notifications.getPermissionsAsync()`, no FCM token registration anywhere in the Profile screen mount lifecycle. Any future notification permission request belongs in Phase 6 and must be explicitly triggered by a user action, not on screen load.

### Email newsletter row
Fully live inline toggle. Reads `newsletterConsent` from `useMe()` / profile response. On toggle: optimistic update, call `PATCH /api/v1/customer/profile` with `{ newsletterConsent: bool }`. Roll back on error with toast "Couldn't update your preference."

---

## 8. APP SETTINGS Section

Two inline toggles — no sheets required.

### Haptics toggle
- Persisted to `AsyncStorage` key `redeemo:haptics` (default: true)
- A central `useHaptics()` hook reads this preference and exposes `trigger(style)` function
- All existing `Haptics.impact()` call sites across the app are replaced with `trigger()` so the preference is respected globally
- Toggle is interactive immediately; persists asynchronously

### Reduce motion toggle
- Persisted to `AsyncStorage` key `redeemo:reduceMotion` (default: false)
- Also checks `AccessibilityInfo.isReduceMotionEnabled()` on mount; if the OS setting is on, the toggle is locked on and disabled (not interactive — shown at 0.45 opacity)
- When on: Reanimated entrance animations are simplified (shorter spring, no stagger) — not removed entirely. The app still feels alive but less kinetic.
- A `useReduceMotion()` hook exposes `prefersReducedMotion: boolean` consumed by animation components

---

## 9. REDEEMO Section

Four rows.

### Become a merchant
External link. `Linking.openURL('https://merchant.redeemo.com')`. Arrow-out icon (↗) on right. No sheet.

### Request a merchant (🟢 built this phase)
Opens a BottomSheet form:
- **Business name** (text input, required, max 100 chars)
- **City / location** (text input, required, max 100 chars)
- **Note** (multiline, optional, placeholder "Anything specific to share about this place?", max 500 chars)
- Submit calls `POST /api/v1/customer/merchant-requests` (new endpoint)
- Success: sheet closes, toast "Thanks! We'll look into adding them."
- Error: inline error on sheet

**Backend (new):**
- `MerchantRequest` model: `id`, `userId`, `businessName`, `location`, `note?`, `createdAt`
- `POST /api/v1/customer/merchant-requests` — authenticated, stores request, returns 201
- No unique constraint — a user can request the same merchant multiple times (intentional)

### Rate Redeemo
Uses `expo-store-review`:
1. Check `StoreReview.isAvailableAsync()` — if true, call `StoreReview.requestReview()`
2. If false (emulator, unsupported OS version, recently rated): fall back to `Linking.openURL()` pointing to the appropriate store listing (App Store on iOS via `Platform.OS === 'ios'`, Play Store on Android)

### Share Redeemo
Uses `Share.share()` from React Native. Message: "I've been saving money with Redeemo — check it out! [app store URL]". Native share sheet appears.

---

## 10. SUPPORT & LEGAL Section

Six rows.

### Get help (full-screen modal)
This is the in-app support ticket system. Full-screen modal (not a sheet) because it has two states: ticket list and new ticket form.

**My Tickets screen (default state):**
- Header: "Get help" with a "New ticket +" button top-right
- Lists past tickets, most-recently-updated first (`updatedAt` sort)
- Each ticket row: ticket number (`RDM-YYYYMMDD-XXXX`), subject truncated, status badge (Open / In Progress / Resolved), relative date ("3 days ago")
- Empty state: calm illustration + "No open tickets. We're here if you need us." + "Create a request" CTA
- Pull-to-refresh

**Ticket detail screen:**
- Ticket number + status badge at top
- Subject as heading
- Original message body
- Attachment thumbnails (tappable to full-screen)
- Submitted date
- Admin response section: if `adminNote` is set, rendered as a reply bubble labelled "Redeemo Support"; if not set, muted text "We'll get back to you soon."
- Read-only — no reply in Phase 1

**New ticket form (full-screen, navigated from My Tickets):**
- Topic picker — topics must be defined as a shared constant/enum, not hardcoded strings in UI. Source of truth: `src/lib/constants/supportTopics.ts` (new file), exported as `SUPPORT_TOPICS` array. The backend validates submitted topic against this list. The website must also be updated to import from a shared constant (or match the list exactly) so topic values don't drift between platforms and admin view. Topics: `Account issue` / `Subscription` / `Technical problem` / `Voucher dispute` / `General enquiry` / `Other`
- Subject (text input, required, max 100 chars)
- Message (multiline, required, min 20 chars, max 2000 chars)
- Attachments (image picker via `expo-image-picker`, max 3, images only — simpler than web which also accepts PDF)
- Submit calls `POST /api/v1/customer/support/tickets`
- Success: full-screen confirmation showing ticket number prominently ("Ticket logged · RDM-20260422-0042") + "View my tickets" CTA
- Error: inline error, form stays open

**Backend (new — full system):**

`SupportTicket` Prisma model:
```
id              String   @id @default(cuid())
ticketNumber    String   @unique              // RDM-YYYYMMDD-XXXX (generated on create)
userId          String
user            User     @relation(...)
subject         String
message         String
topic           String
status          SupportTicketStatus @default(OPEN)
attachmentUrls  String[]
adminNote       String?
createdAt       DateTime @default(now())
updatedAt       DateTime @updatedAt
```

`SupportTicketStatus` enum: `OPEN`, `IN_PROGRESS`, `RESOLVED`

Ticket number generation: `RDM-` + `YYYYMMDD` + `-` + zero-padded 4-digit daily sequence (reset per day). Stored in Redis as a daily counter key: `ticket:seq:YYYYMMDD`, incremented atomically.

**Redis unavailability:** If the Redis INCR fails (Redis down, timeout), ticket creation must fail with a user-safe error (`503 Service Unavailable`, user sees "We couldn't log your request. Please try again."). Do not create a ticket without a ticket number — a ticket with no number cannot be tracked or referenced.

Routes:
- `GET /api/v1/customer/support/tickets` — list own tickets, sorted by `updatedAt DESC`, paginated (page/limit)
- `POST /api/v1/customer/support/tickets` — create ticket; attachments uploaded to S3/R2 first, URLs stored
- `GET /api/v1/customer/support/tickets/:id` — ticket detail (must belong to authenticated user)

Admin routes (Phase 5, schema supports it now):
- `status` is admin-writable; customer read-only
- `adminNote` is admin-writable; customer read-only
- Admin can view full history (all statuses, all time) — no filtering on status in the admin query

**Pre-population from Personal Info sheet:**
When "Get help with this →" is tapped from the Personal Info sheet email/phone note, the Personal Info sheet closes and the Get Help modal opens. The modal accepts an optional `initialTopic` and `initialMessage` prop passed at the point of opening. Pre-set: topic = "Account issue", message hint = "I'd like to change my [email/phone number]." Implemented via a `useGetHelp()` context or a ref-based imperative open call on the modal — not navigation params, since Get Help is a modal overlay on the same screen.

### About Redeemo
`WebBrowser.openBrowserAsync('https://redeemo.com/about')`. Arrow-out icon.

### FAQs
`WebBrowser.openBrowserAsync('https://redeemo.com/faq')`. Arrow-out icon.

### Terms of Use
`WebBrowser.openBrowserAsync('https://redeemo.com/terms')`. Arrow-out icon.

### Privacy Policy
`WebBrowser.openBrowserAsync('https://redeemo.com/privacy')`. Arrow-out icon.

All external URLs are constants in `src/lib/config/links.ts`.

---

## 11. Sign Out / Delete Account

Visually separated from all other sections. Distinct card with additional top margin. Sign out row above, delete account row below with red text.

### Sign out
Single tap. No confirmation prompt. Sequencing is explicit:

1. Dispatch `POST /api/v1/auth/customer/logout` — fire and do not await (do not block on result)
2. Immediately clear AsyncStorage: access token, refresh token, user data
3. Immediately clear React Query cache (`queryClient.clear()`)
4. Navigate to login screen

Steps 2–4 execute unconditionally regardless of whether the logout API call succeeds, fails, or times out. **Local state is cleared before any API response.** The user is signed out locally the moment they tap — network state is irrelevant.

### Delete account (App Store + Play Store compliance — mandatory)
Three-stage flow aligned exactly with the website's implementation:

**Stage 1 — Warning sheet:**
Consequences list (exact copy from website):
- "Your account will be permanently anonymised"
- "Your subscription will be cancelled immediately"
- "Your saved favourites and redemption history will be removed"
- "You will be signed out on all devices"

GDPR note: "Your redemption history is retained in anonymised form for fraud prevention. All personal data is deleted in line with our Privacy Policy and UK GDPR."

**Implementation note — removal vs. anonymisation:** These are not contradictory but must be handled carefully in copy and implementation. "Your favourites and redemption history will be removed" means removed from the user's visible account. Fraud-prevention records (anonymised redemption events) are retained with personal identifiers stripped — they are never visible to the user again. The distinction must be clear in both the user-facing copy and the backend delete logic. Do not use "deleted" and "anonymised" interchangeably in code comments or service calls.

Dark navy card with red tint (`rgba(226,12,4,0.14)` overlay) — matches website's warning visual.

CTA: "Send verification code" (red, filled) + "Keep my account" (neutral, outlined).

On "Send verification code": call `POST /api/v1/auth/customer/otp/send` (action: `delete-account`). Transition to Stage 2.

Error handling: if `PHONE_NOT_VERIFIED` → inline error: "You need a verified phone number to delete your account. Please add one via Get Help."

**Stage 2 — OTP sheet:**
"Step 2 of 2" label. 6-digit OTP input (same pattern as login OTP screen). Dot-progress indicator. 60s resend timer.

On valid OTP: call `POST /api/v1/auth/customer/otp/verify` → get `actionToken`. Call `POST /api/v1/auth/customer/delete-account` with token.

Error codes handled: `OTP_INVALID`, `OTP_MAX_ATTEMPTS`, `ACTION_TOKEN_INVALID` (same messages as website).

"Start over" link returns to Stage 1.

**Stage 3 — Done:**
Full-screen confirmation, not a sheet:
- Icon: shield-off (muted)
- Heading: "Account deleted."
- Body: "Your account has been permanently removed. We're sorry to see you go."
- Then: clear ALL local state (AsyncStorage tokens + user + query cache) and navigate to login screen

**Local state is always fully cleared after deletion** before navigation.

---

## 12. Anti-Fraud & Session Management

### Single mobile session (already enforced)
The auth service already enforces one active mobile session per user. When a new iOS/Android login occurs, the previous session is revoked immediately with reason `SUPERSEDED_BY_NEW_LOGIN`. This prevents subscription sharing via mobile.

### Session visibility (new UI row)
A read-only row inside the MY ACCOUNT section (below Change password). Non-interactive — informational only. Gives users visibility into their active session.

Display logic:
- If a reliable device name is available from session storage: "Signed in on iPhone 14 Pro"
- If no device name is stored or it is ambiguous: fallback to "Signed in on this device"

Implementation must not show a placeholder, empty string, or device ID. If the value is unavailable, use the fallback. Do not force-display a device name that cannot be reliably resolved.

### Email and phone — display-only
Email and phone are read-only on both web and mobile. Self-service change is not supported in this phase. The message "For security, these can only be changed by our team" is benefit-framed and routes users to the Get Help flow. This prevents a bad actor with temporary access from changing contact details and locking out the real owner.

### Audit log
`writeAuditLog` is called on `PROFILE_UPDATED` (existing). Support ticket creation should also write an audit event: `SUPPORT_TICKET_CREATED`.

---

## 13. Backend Summary (new work this phase)

| Item | Type | Endpoint / Model |
|------|------|-----------------|
| Request a merchant | New model + route | `MerchantRequest` model; `POST /api/v1/customer/merchant-requests` |
| Support tickets | New model + 3 routes | `SupportTicket` model; `GET/POST /api/v1/customer/support/tickets`, `GET /api/v1/customer/support/tickets/:id` |
| Ticket number generator | Redis daily counter | `ticket:seq:YYYYMMDD` key, atomic INCR |

All other profile, subscription, interests, and auth endpoints already exist.

---

## 14. App Settings — Local Persistence

| Key | Default | Notes |
|-----|---------|-------|
| `redeemo:haptics` | `true` | Global `useHaptics()` hook; all `Haptics.impact()` calls go through `trigger()` |
| `redeemo:reduceMotion` | `false` | OS setting overrides (cannot set off if OS is on); `useReduceMotion()` hook |

---

## 15. External Links

All URLs in `src/lib/config/links.ts`:

```typescript
export const LINKS = {
  merchantPortal:   'https://merchant.redeemo.com',
  about:            'https://redeemo.com/about',
  faq:              'https://redeemo.com/faq',
  terms:            'https://redeemo.com/terms',
  privacy:          'https://redeemo.com/privacy',
  appStoreIos:      'https://apps.apple.com/app/redeemo/...',
  appStoreAndroid:  'https://play.google.com/store/apps/details?id=com.redeemo...',
}
```

Placeholder URLs for app store listings — update when app is published.

---

## 16. Dependencies

| Package | Use | Status |
|---------|-----|--------|
| `expo-image-picker` | Avatar upload + support ticket attachments | ✅ Installed (`~17.0.10`) |
| `expo-store-review` | Rate Redeemo | ❌ Needs installing |
| `expo-web-browser` | External links (About, FAQs, T&Cs, Privacy) | ❌ Needs installing |
| `@react-native-community/datetimepicker` | Date of birth picker | ❌ Needs installing |
| `react-native` Share API | Share Redeemo | ✅ Built-in |
| Custom `BottomSheet` | All edit sheets | ✅ Built-in (`src/design-system/motion/BottomSheet.tsx`) |

**Haptics module:** The app already has `src/design-system/haptics.ts` with `setHapticsEnabled(v: boolean)` and a module-level `enabled` guard on all haptic calls. The haptics toggle in Profile just needs to persist the preference to `AsyncStorage` and call `setHapticsEnabled()` on load — no new hook infrastructure required beyond reading/writing the persisted value.

---

## 17. Testing Requirements

- Unit tests for `useHaptics`, `useReduceMotion` (mock AsyncStorage)
- Unit tests for `MerchantRequest` service (create, validates required fields)
- Unit tests for `SupportTicket` service (create, list, detail, ticket number generation)
- Unit tests for all new route handlers (auth guard, 400 on missing fields, 404 on wrong user's ticket)
- Component tests (RNTL) for: Header card (completeness bar, avatar initials, badge states), each sheet form (renders fields, calls correct hook on save, shows error on failure), notification rows (newsletter toggle, push stub non-interactive), app settings toggles (AsyncStorage read/write), support flow (empty state, ticket list, new ticket form, success screen)
- The delete account flow is covered by the existing auth test suite; add mobile-specific tests for local state clearing

---

## 18. Scope Boundary

**In scope (this phase):**
All sections described above. Two new backend features: merchant request + support ticket system.

**Explicitly out of scope:**
- OTP-gated email/phone self-service change (future phase, both web and mobile)
- Push notification preference backend (`user_push_prefs` table, FCM token endpoint) — Phase 6
- Payment method view/edit (Stripe Customer Portal API) — future phase
- Admin panel support ticket UI — Phase 5 (schema supports it now)
- Reply threads on support tickets — Phase 2 of support feature
- Push notification on new device login — Phase 6
