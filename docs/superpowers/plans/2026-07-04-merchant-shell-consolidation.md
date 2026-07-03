# Merchant Portal - Global Shell & Navigation Consolidation (Option-C Track 1 shell wave)

**Date:** 2026-07-04 · **Base:** `origin/main` @ `cc507e6b` · **Branch:** `feature/merchant-shell-consolidation`
**Authority:** roadmap `docs/superpowers/roadmaps/merchant-portal-programme-roadmap.md` §2/§5/§6 (shell wave prescribed as ONE consolidated wave over the shared shell files); prototype = visual authority (`docs/design/merchant-portal/prototype-handoff/...dc.html`, extracted and mapped 2026-07-04); blueprint §2.2 + §13.4 (account menu + logout confirm).

## 1. Prototype/source cross-check (shell scope)

| Element | Prototype (mapped from dc.html) | Source @ cc507e6b | Action in this slice |
|---|---|---|---|
| Sidebar active route | `#FEF6F5` bg + inset 3px navy bar + 700 weight, `aria-current` | Styling exists but `active` is never set (no `usePathname`) | Wire `usePathname` prefix-match highlighting |
| Sidebar role filtering | Staff see Home/Redemptions/My account/Help only; Manager = all minus Grow; Grow group owner-only | Only Insights hidden for staff (capability) | Filter nav by `viewerCapabilities.role`; Grow group owner-only; unknown role renders the role-neutral baseline (no sensitive links; backend authz remains the boundary) |
| Sidebar collapse (wide) | Hamburger toggles 262px ↔ 72px icon-only rail; labels/badges/status-text hidden | No collapse; hamburger narrow-only | Add wide collapse; hamburger always rendered |
| Status pill | Two-line: "BUSINESS STATUS" micro-label over status; dot-only when collapsed | Single-line pill, palette already matches | Add micro-label + collapsed dot-only variant |
| Nav destinations | Business profile / My account / Help / Promote / Billing are screens | 5 dead `#` links | Honest placeholder routes (`/profile`, `/account`, `/help`, `/promote`, `/billing`) per roadmap §2 row "generic coming-soon module shell" (shell-wave prescription: honest placeholder route; no new dead links) |
| Topbar hamburger | Always present (wide=collapse, narrow=drawer) | Narrow-only | Always render; dual behaviour |
| Validate CTA | Enabled in ALL lifecycles incl. suspended; label icon-only < 720px; suspended surfaces IN-MODAL as "Validation paused" | Enabled always; label never collapses; dialog maps MERCHANT_SUSPENDED to a terse line | Keep enabled (prototype-conformant); icon-only < 720px; adopt prototype suspended copy |
| Quick Actions | 332px popover: Validate (all) / Create a voucher (canManageVouchers) / View a branch PIN (owner+manager; branch sub-picker; ROUTES to branch page PIN section, never inline reveal) / Today's redemptions (all) | Inert IconButton | Build popover; PIN action navigates to `/branches/{id}#pin` (reuses guarded `GET /branches/:id/pin` via the existing on-page PinCard; no new PIN surface) |
| Account menu | Identity header (gradient-avatar initials, business name, person · role, cream bg) + My account + Business profile (hidden for staff) + Help & support + Log out (red) with CONFIRM modal ("Log out of Redeemo for Business?" / "You will need your email and password to sign back in. This is handy on a shared till." / Stay logged in · Log out) | Business name + instant Sign out | Build full menu + logout-confirm Dialog (blueprint §13.4) |
| Notification popover | Header "Notifications" + "All caught up"/"N unread" + Mark-all (only when unread); 5 flat recent items; footer "See all notifications"; unread rows tinted `#FFF7F3` | 8 flat items; footer Mark-all + See-all | Restyle to prototype structure; 5 items; mutual exclusivity with other topbar menus |
| Notification deep-links | Items route to their subject | Resolver maps only `merchant`→`/`; live `voucher`/`redemption` rows dead-end at `/` | Add `voucher`→`/vouchers/{id}` (approval lane is custom-only: `isRmv:false` enforced in voucherApprover), `redemption`→`/redemptions` |
| All-notifications view | Centred overlay modal, grouped New/Earlier | In-shell page, flat + unread-only toggle | KEEP PAGE (page-vs-overlay = recorded open owner decision); adopt New/Earlier grouping inside the page |
| Responsive narrow | Drawer (282px) + bottom tab bar (Home/Vouchers/Redemptions/Insights, 64px, rose active) + 88px content bottom pad | Drawer exists; no tab bar (pad already 88px) | Add bottom tab bar (Insights tab capability-gated; staff variant drops role-hidden tabs) |
| View-as lens + Demo switcher | Both carry footer "Prototype control only. Not part of the live portal." | Absent | DO NOT BUILD - the prototype itself marks them non-product. Reported for owner confirmation; roadmap row stays open until owner records it |
| Favicon | None defined in prototype; deployed /favicon.ico 404 is a known cosmetic warning | No icon file | Add `app/icon.png` (Next injects the icon link) |
| Suspended banner | Home-only banner (not shell-wide) | LifecycleHome suspended home exists | No shell change |

## 2. Backend change (single, additive)

`getMerchantProfile` already resolves the membership via `resolveMerchantContext` (role + canManageVouchers). Extend the UX-hint block additively:

```
viewerCapabilities: { canViewInsights, canManageVouchers, role, displayName }
```

- `role`: the viewer's OWN membership role (they can already see it on /staff if owner; self-knowledge, not cross-tenant data).
- `canManageVouchers`: mirrors `assertCanManageVouchers` (OWNER or granted BM).
- `displayName`: viewer's own `MerchantAdmin.firstName + lastName` (self-identity for the account menu).
- Backend guards remain the real boundary; the frontend continues to FAIL CLOSED on absence (unknown role = role-neutral baseline nav, no Insights, no Grow group, no PIN/create-voucher quick actions).

No schema change. No auth/session/customer-API change.

## 3. Explicit deviations from prototype (recorded per the prototype-authority protocol)

1. **Business profile / My account / Help destinations are honest "being built" placeholder routes**, not the prototype's full screens - those are separate roadmap modules (Business-profile settings, My Account, Help & Support), some owner-gated. The placeholder is the roadmap-prescribed shell-wave interim.
2. **Promote / Billing teaser pages omit the "Notify me when it is ready" interest CTA** (requires interest-storage backend). Static teaser content ships; CTA deferred.
3. **Promote/Billing routes render for any authed member** (static marketing copy, zero data); the prototype hides the routes for non-owners. Nav visibility IS owner-gated; direct-URL render is harmless and avoids a role-flash redirect.
4. **Badge semantics:** prototype distinguishes "unseen" (badge) from "unread" (row tint); backend has only `isRead`. Badge stays unread-count. Deferred until a `seenAt` contract exists.
5. **Notifications full view stays a page** (open owner decision, roadmap §4); grouping fidelity adopted inside the page.
6. **Bottom tab bar active tint** uses brand tokens (`#E20C04`) per tokens.css - matches prototype.
7. **live_new** stays collapsed into `live` (no backend signal; recorded roadmap conflict, unchanged here).

## 4. Out of scope (unchanged open items)

Home Live dashboard; Staff Home; redemption reversal; flagship "Always live" semantics; business-profile/my-account/help real modules; Insights legal gates; staging acceptance/G1b smoke harness; custom domains; View-as (dropped-pending-owner-record); notification page-vs-overlay decision.

## 5. Test plan

- Unit/component (jest): Sidebar active-route + role filtering + collapsed; Topbar hamburger/validate-collapse/menus mutual exclusion; AccountMenu items + staff-hides-profile + logout-confirm flow (confirm calls signOut, cancel does not); QuickActions role/capability gating + PIN sub-picker + navigation targets; NotificationBell summary/mark-all/5-cap; resolveDestination new entries; notifications page grouping; placeholder routes render; MobileTabBar gating; StatusPill micro-label.
- Backend (vitest unit): viewerCapabilities role/canManageVouchers/displayName emit for OWNER/BM(granted/not)/STAFF.
- Full merchant-web jest + typecheck + lint + build; local Playwright fidelity pass (Sonnet agent) against `next dev` with mocked session where feasible.
