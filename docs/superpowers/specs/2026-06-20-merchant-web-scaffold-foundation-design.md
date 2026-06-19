# Merchant Portal M0: `apps/merchant-web` Scaffold + Brand/Design-System Foundation

- Date: 2026-06-20
- Status: Design spec (M0 of the Merchant Portal build). Awaiting owner approval before `writing-plans`.
- Tier: 3 (new surface). M0 is foundation-only: scaffold + design system. No auth, no backend, no schema, no product surfaces.
- Phase: 4 (Merchant Portal), milestone M0.

---

## 1. Context and goal

The Redeemo Merchant Portal ("Redeemo for Business") has been fully prototyped in Claude Design and documented. The portal **frontend does not exist in the repo**: `apps/` holds `admin-web`, `customer-app`, `customer-web`, and there is **no `apps/merchant-web`**. The backend is substantially built (merchant auth, onboarding, profile, branch, voucher, redemption; admin create-draft/claim/documents; notifications write-side; storage; outbox), with a defined set of Phase-4 gaps and schema changes recorded in the build baseline.

**M0 goal:** stand up `apps/merchant-web` (Next.js) and the full Redeemo Merchant Portal brand/design-system foundation, so every later milestone (auth, onboarding, vouchers, redemptions, analytics, notifications, settings) builds on a consistent, brand-faithful shell and primitive set without a later visual rewrite.

**M0 explicitly builds only:** the app scaffold (cloned from `admin-web` plumbing), the brand token + font layer, the shell (left sidebar + top bar + status pill + responsive behaviour), and the base primitive component set. It wires no auth, no API calls, no backend, no schema, no product logic.

This spec is also the durable **prototype-reference record**: it catalogues the interactive prototype behaviours and dependencies (extracted from the handoff zip) and tags each to its future milestone, plus a consolidated stop-and-report ledger of every conflict found between the prototype, the blueprint, the live backend, and our architecture. None of that logic is implemented in M0; it is preserved here so future milestones do not have to re-derive it and do not silently copy or discard it.

---

## 2. Source / audit references

- **Verified current-state baseline (owner-accepted 2026-06-20):** memory `project_merchant_portal_build_baseline.md` (the 14-agent codebase audit: backend reuse map, gaps, the 9-item schema stop-and-report ledger, the M0-M8 sequence). This is ground truth for backend reality.
- **Build handover:** `docs/superpowers/2026-06-19-merchant-portal-build-handover.md`.
- **Findings (de-facto product spec):** `docs/superpowers/specs/2026-06-17-merchant-portal-prototype-findings.md` (Section 1 + 2A-2AS).
- **Blueprint (IA / capability / analytics / privacy):** `docs/superpowers/specs/2026-06-16-merchant-portal-product-blueprint.md` (§2.1 nav IA, §2.3 roles, §5.6 analytics, §5.6.4-5.6.5 privacy).
- **Brand foundations:** `docs/design/merchant-portal/upload-bundle/2026-06-10-brand-design-system-foundations-design.md`; brand tokens `apps/customer-app/src/design-system/tokens.ts`; web token source `docs/design/merchant-portal/design-system/tokens.css`; exported foundations/components `docs/design/merchant-portal/design-system/{01-foundations.html,02-components.html,03-voucher-blocks.html}`; fonts `docs/design/merchant-portal/design-system/fonts/` and `apps/customer-web/public/fonts/`.
- **Prototype handoff (reference artifact, this session):** `docs/design/merchant-portal/prototype-handoff/Redeemo-for-Business-Merchant-Portal-handoff.zip` (main file `Redeemo for Business.dc.html`, 14,700 lines; `support.js` = the Claude Design dc-runtime loader, not product logic). Extracted read-only to `/tmp` for behaviour cataloguing; treated as visual/UX reference, not implementation code. The behaviour catalogue in Appendix A was produced by an 11-agent read-only extraction over this file with line-cited evidence.
- **Scaffold template:** `apps/admin-web` (Next 15 App Router, Tailwind 4, shadcn new-york, React Query 5, zod 4); brand-font reference `apps/customer-web` (self-hosts Mustica Pro + Lato).
- **Style locks:** memory `feedback_style_no_emojis_brand_colors` (SVG icons not emojis; no em-dashes; real Redeemo hexes) + `feedback_claude_design_requirements_led` + `feedback_no_mvp_language_high_launch_bar`.

---

## 3. Locked decisions (owner-confirmed in M0 brainstorming)

1. **Scaffold = hybrid-clone `apps/admin-web`.** New `apps/merchant-web/` dir; copy admin-web's proven config + plumbing files verbatim, then re-skin to brand and rebuild the shell. Not `create-next-app`; not a full copy-then-strip. (Rationale: admin-web is the only web app with the right stack and a byte-identical-shaped two-step OTP auth contract for M1.)
2. **Full Redeemo Merchant Portal brand layer** (not admin-web's calm-neutral tone): Mustica Pro + Lato self-hosted fonts, brand red `#E20C04` / coral `#E84A00` / navy `#010C35` / cream `#FFF9F5`, the red-to-coral 135deg gradient as the signature CTA, navy-tinted shadows + brand-rose glow, voucher-type accent palette, fluid display type scale. Brand source = the prototype `tokens.css` + customer-web font hosting (admin-web omits the brand fonts; do not copy that gap).
3. **Foundation-set design system** (not thin, not broad): tokens + fonts + shell + status pill + the base primitives the prototype foundations define + an internal `/foundations` brand-QA page. No screen-specific components.
4. **Basic responsive shell:** sidebar collapses to a drawer; layout fluid. Polished mobile bottom-tab bar deferred until product surfaces exist.
5. **On-disk prototype export only** for M0 (the `tokens.css` + foundations HTML + the handoff zip already on disk). No live DesignSync `.dc.html` import into the app; the `.dc.html` is reference data, recreate-not-port.

---

## 4. Exact M0 scope

New workspace `apps/merchant-web/` (`@redeemo/merchant-web`, dev port **3003**: backend 3000, customer-web 3001, admin-web 3002, merchant-web 3003).

**4.1 Config (admin-web verbatim, adapted):**
- `package.json` (mirror admin-web dependency versions exactly: `next ^15`, `react/react-dom ^19`, `@tanstack/react-query ^5`, `radix-ui ^1.5`, `zod ^4.4`, `class-variance-authority`, `clsx`, `tailwind-merge ^2.5`, `lucide-react ^1.8`; dev: `tailwindcss ^4`, `@tailwindcss/postcss`, `jest ^29` + `jest-environment-jsdom` + `@testing-library/{react,jest-dom,user-event}`, `eslint ^9` + `eslint-config-next`, `typescript ^5`). Scripts: `dev` (port 3003), `build`, `start` (3003), `typecheck`, `lint`, `test`, `test:watch`.
- `tsconfig.json` (strict, `moduleResolution: bundler`, `@/*` paths), `components.json` (shadcn new-york, baseColor neutral, cssVariables, lucide, standard aliases), `postcss.config.mjs` (`@tailwindcss/postcss`), `eslint.config.mjs` (FlatCompat next/core-web-vitals + next/typescript), `next.config.ts` (`outputFileTracingRoot` to repo root, R2/S3 `remotePatterns`, `buildSecurityHeaders` from a copied `lib/securityHeaders.ts`, CSP `connect-src` from `NEXT_PUBLIC_API_URL`), `jest.config.mjs` (next/jest, jsdom, `@/*` alias, clearMocks) + `jest.setup.ts`.
- `lib/utils.ts` (`cn` = `twMerge(clsx())`).

**4.2 Brand layer:**
- `public/fonts/`: `MusticaPro-SemiBold.otf` + `Lato-{Regular,Medium,Semibold,Bold}.ttf` (optional `Lato-Light` if a 300 is wanted). Source: `apps/customer-web/public/fonts/` (byte-identical to the prototype fonts).
- `app/globals.css`: `@import "tailwindcss"` + the `@font-face` block (from customer-web, paths `/fonts/...`) + a full brand `:root` token layer ported from the prototype `tokens.css` (brand spine + gradient; warm neutrals incl `--tint-deep #FEF0EE`; the 7 voucher-type accents; functional signals incl `--trending`, `--featured`; fluid `clamp()` display scale + fixed heading/body/label; radii 10/14/18/pill; 4/8 spacing; navy-tinted shadows + brand-rose `--shadow-glow`; neutral text + border ramps; scrollbar styling; the `rdmoPulse`/`rdmoPop`/`rdmoIn` keyframes) + an `@theme inline` bridge mapping the brand tokens onto the shadcn semantic vars (`--primary` brand red, `--ring` brand red, `--foreground` navy, `--background` cream, radii from the brand scale, `--font-display` Mustica, `--font-body` Lato, `--chart-1..5`, sidebar tokens). Body = Lato 15px lh 1.5 `#010C35` ls -0.005em; headings = Mustica Pro.
- Brand R-mark asset for the lockup copied into `public/` (the prototype's `redeemo-r.png` or the customer-app SVG R; final choice in the plan).

**4.3 App shell + routing skeleton:**
- `app/layout.tsx` (metadata, `robots: { index:false, follow:false }` for now, body fonts), `app/providers.tsx` (QueryClient only: staleTime 60s, refetchOnWindowFocus false, retry 1; **no SessionProvider** in M0), `app/(app)/layout.tsx` rendering the portal shell, `app/(app)/page.tsx` placeholder landing, internal `app/(app)/foundations/page.tsx` brand-QA preview. Empty `app/(auth)/` route-group placeholder (no logic). No middleware auth gate (decision deferred to M1).

**4.4 Shell components (`components/shell/`):**
- `MerchantPortalShell` (two-column: left sidebar + sticky top bar + content area, max-width 1180px).
- Left sidebar: "Redeemo / for Business" lockup; a `StatusPill` slot (prop-driven, static default state in M0); standalone **Home**; grouped sections with the exact prototype/blueprint labels: **Vouchers & customers** (Vouchers, Redemptions, Insights & reports), **Locations & team** (Branches, Staff & access), **Business** (Business profile; Documents is folded into Business profile, no standalone item), **Grow your business** (Promote, Payments & billing) shown with "Coming soon"/"Soon" badges; pinned **My account** + **Help & support**. Nav items are **static, non-functional** in M0 (no routing wiring, no capability gating). Active/inactive/Soon visual treatments per the prototype.
- Top bar: brand-correct slot layout with placeholder (non-functional) controls in this fixed order: a navy "Validate a code" CTA, a quick-actions grid button, a notification bell, an account avatar. **The prototype-only View-as role lens and Demo lifecycle switcher are NOT included** (see exclusions).
- `StatusPill` component carrying the 7 lifecycle-state tokens (setup / submitted / in_review / changes / live / live_new / suspended) with the prototype colour + dot + pulse-on-live; M0 renders a static default state, the live state source (merchant status) is M7/backend.
- Shared `Popover`/overlay primitive + single click-catcher overlay pattern (the chrome menu primitive every later top-bar menu reuses) and the 38px icon-button pattern.
- Basic responsive: `isNarrow` (< 820px) collapses the sidebar to a 282px drawer with a navy backdrop; `wideTopbar` (>= 720px) gates top-bar button text labels.

**4.5 Base primitives (`components/ui/`, shadcn new-york, brand-skinned):**
- `Button` (primary = red-to-coral gradient + glow; secondary = white + `#E5E7EB` border; ghost; navy CTA; destructive = `#B91C1C`).
- `Card` (+ cream `#FFF9F5` variant), `Input`, `Label`.
- `Badge` (Caution amber `#B45309`/`#FEF6EC`; Restrictive red `#B91C1C`/`#FEECEC`; neutral).
- `Chip` (voucher-type accent chip; the 7-accent map lives in the token layer, the component renders accent + label).
- `Dialog`/modal (rdmoIn/rdmoPop entrance, navy-tinted shadow, ~22px radius).
- `Table` shell (header + rows + empty-state slot; no data wiring).
- `lib/icons.ts` re-export barrel for lucide (mirrors the customer-app pattern; keeps barrel-import lint clean).

**4.6 Internal brand-QA page** `/foundations`: renders the token swatches, the type scale, all primitive variants, the 7 status-pill states, and the 7 voucher-type chips. Internal verification surface only (noindex, not a product route).

**4.7 Tests + CI:**
- RTL smoke tests: shell renders the nav groups + pinned items; primitives render their variants; status pill renders all 7 states; `/foundations` mounts.
- New `merchant-web` job in `.github/workflows/ci.yml` mirroring the admin-web job: Node 24 (root `.nvmrc`), `npm ci`, typecheck + lint + `next build` (dummy `NEXT_PUBLIC_API_URL`) + `npm test`.

If, during the plan, a small additional foundation detail proves necessary for M0 coherence (e.g. a Skeleton primitive, a Toast host, or a focus-visible token), it may be added with a one-line rationale, but M0 must not broaden into auth, API, product surfaces, schema, or DesignSync.

---

## 5. Explicit exclusions (M0 does NOT include)

- **Auth / session / capability:** no login, OTP, forgot/reset, claim, self-serve registration, refresh, logout, SessionProvider, token storage, capability mirror, or route guard. (M1.)
- **API + data:** no `lib/api/*` clients, no React Query data hooks, no `apiFetch`, no real data fetching, no loading/error/empty states beyond the static `/foundations` preview. (Per-surface milestones.)
- **Middleware auth gate:** deferred to M1 (decide client-guard vs edge middleware then).
- **Backend / schema / migration:** zero backend, Prisma, or migration changes. (Any schema item is stop-and-report at its milestone.)
- **Product surfaces:** onboarding, voucher builder/management, redemptions/validate, branches, staff & access, business profile, documents, insights/analytics, notifications/bell wiring, settings, help. (M1-M8.)
- **Chart components:** deferred to M5 (they are data-driven and pair with the analytics dataset). M0 defines only the `--chart-1..5` tokens.
- **Prototype-only chrome controls (never shipped as merchant features):** the **View-as role lens** and the **Demo lifecycle switcher** (both top-bar dashed-border controls in the prototype, footer-labelled "Prototype control only. Not part of the live portal."). M0 does not build them. The RBAC model the View-as lens encodes is a real future input (M3/M7); the lifecycle model the Demo switcher encodes is real (M7, backend-driven); only the switcher UIs are non-shippable.
- **DesignSync `.dc.html` import:** the prototype is recreate-not-port reference data; its React-in-HTML / mock-data internals are never ported.
- **Shared `packages/tokens`:** not created in M0; merchant-web hand-authors its CSS-variable token layer like customer-web and admin-web (known duplication debt, future consolidation).

---

## 6. Architecture and file structure

```
apps/merchant-web/
  package.json              # @redeemo/merchant-web, port 3003, admin-web deps verbatim
  tsconfig.json
  components.json           # shadcn new-york, neutral base, cssVariables, lucide
  postcss.config.mjs
  eslint.config.mjs
  next.config.ts            # outputFileTracingRoot, R2/S3 remotePatterns, securityHeaders
  jest.config.mjs
  jest.setup.ts
  public/
    fonts/                  # MusticaPro-SemiBold.otf + Lato-{Regular,Medium,Semibold,Bold}.ttf
    redeemo-r.(png|svg)     # brand R mark for the lockup
  app/
    layout.tsx              # metadata, robots noindex, body fonts
    globals.css             # @import tailwindcss + @font-face + brand :root tokens + @theme inline bridge
    providers.tsx           # QueryClient only (no SessionProvider in M0)
    (app)/
      layout.tsx            # renders MerchantPortalShell
      page.tsx              # placeholder landing
      foundations/page.tsx  # internal brand-QA preview (noindex)
    (auth)/                 # empty route-group placeholder (no logic)
  components/
    shell/
      MerchantPortalShell.tsx
      Sidebar.tsx           # lockup + StatusPill slot + grouped static nav + pinned items
      Topbar.tsx            # validate/quick/bell/account placeholder slots (NO view-as, NO demo)
      StatusPill.tsx        # 7-state, prop-driven, static default in M0
      navItems.ts           # static IA config (labels + grouping + Soon flags)
    ui/
      button.tsx card.tsx input.tsx label.tsx badge.tsx chip.tsx
      status-pill helpers   # (or co-located in shell/StatusPill)
      dialog.tsx popover.tsx table.tsx
  lib/
    utils.ts                # cn()
    icons.ts                # lucide re-export barrel
    securityHeaders.ts      # copied from admin-web
```

**Boundaries:** M0 work stays inside `apps/merchant-web/**` plus the single `.github/workflows/ci.yml` job addition and the root `package-lock.json` change from `npm install`. No edits to backend, prisma, customer-app, customer-web, or admin-web.

**Isolation:** the shell is composed of small, single-purpose units (Sidebar, Topbar, StatusPill, each ui primitive), each understandable and testable in isolation, communicating via props. `navItems.ts` is the single source of nav structure; the shell reads it. The token layer in `globals.css` is the single source of brand values; primitives inherit via the shadcn semantic-var bridge rather than hardcoding hexes.

---

## 7. Brand / token / font strategy

- **Token source of truth for M0:** the prototype `docs/design/merchant-portal/design-system/tokens.css` (the most complete web token set; the RN `tokens.ts` still carries retired map-pin hues and lacks the web clamp scale, so it is a value reference only, not a copy source). Tokens are authored as CSS custom properties in `globals.css` `:root`, then bridged onto shadcn semantic variables via `@theme inline` (the admin-web pattern), so every shadcn primitive inherits the brand without per-component overrides.
- **Brand spine (locked, do not change):** rose `#E20C04`, coral `#E84A00`, navy `#010C35`, cream `#FFF9F5` / tint `#FEF6F5` / tint-deep `#FEF0EE`; brand gradient `linear-gradient(135deg, #E20C04, #E84A00)`; signature CTA glow `0 14px 30px -12px rgba(226,12,4,0.6)`; navy secondary CTA `#010C35`; ghost white + `#E5E7EB`; destructive `#B91C1C`/`#FEECEC`.
- **Voucher-type accents (7, token-only in M0):** bogo `#7C3AED`/proto `#6E3DD3`, discount `#E20C04`/`#D8302A`, freebie `#16A34A`/`#208E50`, spend&save `#E84A00`/`#D6531B`, package `#2563EB`/`#2D5BCC`, time-limited `#D97706`/`#BC6D1C`, reusable `#0D9488`/`#198375`. (The `tokens.css` flat-accent set is canonical for the chip; the deeper pastel-to-saturated gradients are M4 voucher-card work.)
- **Functional signals:** success `#0F7A3E`, savings `#16A34A`, warning `#B45309`/`#FEF6EC`, danger `#B91C1C`/`#FEECEC`, info `#0E7490`, trending `#DB2777`, featured `#C7891B`.
- **Radii:** sm 10 / md 14 / lg 18 / pill 999 (prototype web scale, larger/softer than admin-web's 0.625rem-derived). **Spacing:** 4/8 grid named `--space-1..7`. **Shadows:** navy-tinted sm/md/lg + brand-rose `--shadow-glow`.
- **Fonts:** Mustica Pro SemiBold (display, weight 600) for h1-h4; Lato (400/500/600/700) for body/UI. Self-hosted via `@font-face` (customer-web pattern, `font-display: swap`). Honour the brand spec's note to use a metric-matched serif fallback rather than bare `serif` for Mustica.
- **Type scale:** fluid `clamp()` on display sizes, fixed heading/body/label, per `tokens.css`.

---

## 8. Shell / navigation strategy

The shell recreates the prototype's two-column chrome (verified dimensions): left sidebar **262px** expanded / **72px** collapsed / **282px** mobile drawer with a `#EEF1F4` right border; sticky top bar **64px** with `rgba(255,255,255,0.86)` + backdrop blur and a `#EEF1F4` bottom border; content area white, max-width **1180px** centred, padding 30/40/64 wide and 20/16/88 narrow.

**Information architecture (static in M0, exact labels):**
- Brand lockup: R mark (~34px) + "Redeemo" (Lato 800, `#010C35`, ~15px) over "for Business" (12px, 700, uppercase, letter-spacing 1px, `#6B7390`); collapses to icon-only.
- `StatusPill` (prop-driven, static default).
- Standalone **Home**.
- Group **Vouchers & customers**: Vouchers, Redemptions, Insights & reports.
- Group **Locations & team**: Branches, Staff & access.
- Group **Business**: Business profile. (Documents is folded into Business profile per findings 2AH; no standalone Documents nav item.)
- Group **Grow your business** with a "Coming soon" section tag: Promote, Payments & billing (each carries a "Soon" badge). Phase-5 teasers, gated behind a feature flag so they can be hidden.
- Pinned bottom: **My account**, **Help & support**.

Section-header token: 12px, weight 800, uppercase, letter-spacing 1px, `#8089A4`, with an optional pill tag ("Coming soon"). Active nav item: weight 700, `#010C35`, background `#FEF6F5`, inset 3px left accent bar `#010C35`. Inactive: weight 500, `#455373`. Soon: weight 500, `#6B7390` + Soon pill.

**Top bar (placeholder slots, non-functional in M0):** navy "Validate a code" CTA, quick-actions grid button, notification bell, account avatar, in that order, using the 38px icon-button pattern (10px radius, 1px `#E5E7EB` border, `#455373` icon). The shared `Popover` + single click-catcher overlay primitive is built here as the reusable chrome-menu foundation, but the menus themselves carry no behaviour in M0.

In M0 the nav items render but do not route or gate (no router wiring beyond the placeholder pages, no capability logic). Live nav routing, capability/role gating, lifecycle-driven state, and the top-bar menu behaviours are later milestones (M1-M7).

---

## 9. Primitive / component foundation set

Built brand-skinned to the prototype's `02-components.html` + `03-voucher-blocks.html` contract:

| Primitive | Variants / states (M0) | Notes |
|---|---|---|
| Button | primary (gradient+glow), secondary (white+border), ghost, navy CTA, destructive; default/hover/disabled | gradient + glow is the signature; radius md |
| Card | default (white, navy soft shadow) + cream variant | No-card-on-card discipline |
| Input | default, focus (brand-red ring), disabled | warm hairline border |
| Label | default | |
| Badge | Caution (amber), Restrictive (red), neutral | uppercase 10px 800-weight pill |
| StatusPill | 7 states (setup/submitted/in_review/changes/live/live_new/suspended); pulse on live | prop-driven; static default in M0 |
| Chip | voucher-type accent chip (7 accents) | accent map from token layer |
| Dialog/modal | open/close; rdmoIn/rdmoPop entrance; scrim | navy-tinted shadow, ~22px radius |
| Popover | open/close; shared click-catcher overlay | the chrome-menu primitive |
| Table | header, rows, empty-state slot | shell only, no data |

Each primitive is a focused unit with a clear prop contract, testable in isolation, rendered together on `/foundations` for brand-fidelity QA.

---

## 10. Responsive behaviour

- `isNarrow` = viewport `< 820px`: sidebar becomes a fixed 282px overlay drawer (off-canvas translate) with a navy ~38%-opacity backdrop click-catcher; the top bar shows a centred "Redeemo for Business" wordmark and a hamburger toggle.
- `wideTopbar` = viewport `>= 720px`: top-bar buttons show text labels; below that they collapse to icon-only.
- Sidebar collapse (262 to 72px) is a separate user toggle on wide screens.
- Content padding switches between the wide and narrow values above.
- The polished mobile bottom-tab bar (Home / Vouchers / Redemptions / Insights, per blueprint §2.1) is **deferred** until the product surfaces exist; M0 ships the drawer + fluid layout only.

---

## 11. Prototype reference handling

**How M0 uses the zip:** the handoff zip (`docs/design/merchant-portal/prototype-handoff/...`) is treated as visual/UX reference, recreate-not-port (its own README says so). For M0 it confirmed and refined the locked design and is the source of the exact shell dimensions, the precise nav-group labels, the 7-state status pill, the top-bar slot order, the popover/overlay primitive, and the keyframes. The `.dc.html` React-in-HTML and its mock data are **not** ported; `support.js` is the dc-runtime loader (ignored). The zip remains an untracked local artifact under `docs/design/` (not committed by this spec; that tree is already untracked).

**The zip did NOT change any locked M0 decision.** It refined detail only (dimensions, exact labels, the 7-state pill, the prototype-only-controls exclusion, the shared popover primitive, the keyframe set). No scope expansion into product logic.

**How prototype logic/dependencies are preserved without implementing them in M0:** the prototype is a sophisticated clickable app (scoring engines, lifecycle state machine, validation flows, lifecycle-gated read-only states, cross-screen reconciliation). All of that interactive logic is **catalogued in Appendix A** (per future milestone, with line-cited evidence) and the conflicts it raises against the blueprint / live backend / our architecture are consolidated in **Appendix B** (the stop-and-report ledger). M0 implements none of it. Each future milestone reads its Appendix-A section as a design input and resolves its Appendix-B conflicts (owner decision, schema stop-and-report, or honour-prototype/honour-backend) before building, rather than silently copying or discarding prototype behaviour.

---

## 12. Test / CI expectations

- `tsc --noEmit` clean (merchant-web).
- `next lint` clean.
- `next build` passes with a dummy `NEXT_PUBLIC_API_URL` (the admin-web lesson: build catches Next 15 prerender errors that tsc/lint miss).
- Jest RTL smoke suite green: shell renders the four nav groups + Home + pinned items + the Soon-badged Grow group; each primitive renders its variants; StatusPill renders all 7 states; `/foundations` mounts.
- New `merchant-web` CI job added to `.github/workflows/ci.yml` and green (typecheck + lint + build + test, Node 24, build-with-dummy-env).
- Root `npm install` lockfile diff reviewed before staging.

---

## 13. Risks and stop-and-report items (M0)

- **Lockfile change:** adding the workspace mutates root `package-lock.json` on install. Report the install diff; do not stage it blindly (per the CLAUDE.md npm-install hook warning).
- **CI workflow edit:** `ci.yml` gains a job; lands in the M0 PR like any code.
- **Brand-vs-shadcn friction:** shadcn new-york defaults (radius, neutral base) must be overridden by the token bridge; the `/foundations` page is the brand-fidelity check.
- **Port 3003** assumed free; confirm at build.
- **Dependency-version mirroring:** `lucide-react ^1.8.0` and `radix-ui ^1.5.0` are mirrored from admin-web verbatim (not "latest") to stay CI-green and consistent; do not bump in M0.
- **Logo asset:** decide R-mark source (prototype `redeemo-r.png` vs customer-app SVG R) in the plan; small foundation detail.
- **No backend/schema/migration touched:** guaranteed by scope.

(Product-level stop-and-report items belong to future milestones and are consolidated in Appendix B; none are actioned in M0.)

---

## 14. Build acceptance criteria

M0 is complete when:
1. `apps/merchant-web` exists, runs on port 3003, and renders the brand-faithful shell (sidebar + top bar + status pill + content) with the exact static IA.
2. The brand layer is in place: Mustica Pro + Lato self-hosted and applied (display vs body), full brand token set in `globals.css` bridged to shadcn semantic vars, brand gradient + glow on the primary button.
3. The base primitive set renders correctly on `/foundations` with all variants and the 7 status-pill states, visually matching the prototype's component contract.
4. Responsive: sidebar collapses to a drawer below 820px; top-bar labels collapse below 720px; layout is fluid with no overflow.
5. The prototype-only View-as and Demo controls are absent.
6. Tests, lint, typecheck, and `next build` pass locally; the new `merchant-web` CI job is green.
7. No backend, schema, migration, auth, API, or product-surface code was added; the diff is confined to `apps/merchant-web/**` + the `ci.yml` job + the root lockfile.
8. Owner has reviewed the rendered shell/foundations (device/visual QA) and confirmed brand fidelity.

---

## 15. Cross-check table (reality to M0 decision)

| Concern | Source of truth | Reality | M0 decision |
|---|---|---|---|
| App existence | audit + `ls apps/` | no `apps/merchant-web` | create it |
| Stack/base | admin-web package.json | Next 15 / React 19 / Tailwind 4 / RQ 5 / zod 4 / shadcn new-york | hybrid-clone admin-web; mirror deps verbatim |
| Auth contract | audit be:auth + fe:customer-shared | merchant two-step OTP is byte-identical in shape to admin | base on admin-web (M1 reuses its auth client); no auth in M0 |
| Brand tokens | prototype tokens.css + brand spec | full web set (gradient, tint-deep, 7 accents, trending/featured, clamp scale) | port full set; bridge via @theme inline |
| Brand tone | admin-web globals.css | calm-neutral, brand hexes only on primary/ring, no brand fonts | M0 uses FULL brand (do not copy admin-web's calm tone) |
| Fonts | customer-web + prototype fonts | byte-identical Mustica + Lato self-hosted in customer-web; admin-web omits | copy customer-web's @font-face + fonts |
| Radii/type/shadow | prototype tokens.css | radii 10/14/18, fluid clamp display, navy shadows + glow | use prototype values, not admin-web's |
| Shell shape | prototype .dc.html + blueprint §2.1 | left sidebar 262/72/282 + 64px sticky topbar + 1180 content | rebuild fresh to these dims (admin-web is a top-bar shell) |
| Nav IA | prototype + blueprint §2.1 | Home; Vouchers&customers; Locations&team; Business; Grow(Coming soon); pinned My account + Help | static nav with exact labels; Documents folded into Business profile |
| Status pill | prototype shell-ds | 7 lifecycle states with colour/dot/pulse | build StatusPill (7 states), static default; live source = M7 |
| Top-bar controls | prototype shell-ds | includes prototype-only View-as + Demo switchers | EXCLUDE both; build only validate/quick/bell/account placeholder slots |
| Primitives | prototype 02/03 HTML | button/card/cream/input/badge/status/chip/dialog/table + popover | build the foundation set, brand-skinned |
| Charts | prototype insights (M5) | data-driven analytics components | DEFER to M5; M0 defines only --chart tokens |
| Capability/role | audit be:shared-infra + blueprint §2.3 | merchant authz role-only, no per-person caps (schema gap) | no capability code in M0; record RBAC model for M3/M7 |
| Lifecycle states | prototype cross-deps | one _LC model drives every module; demo switcher is prototype-only | record _LC model for M7; no lifecycle wiring in M0 |
| Shared tokens pkg | audit fe:customer-shared | no packages/; each app duplicates | local token layer; no packages/ in M0 |
| Tests/CI | audit tests:ci + ci.yml | admin-web jest is a required gate; jobs on Node 24 | mirror admin-web jest + add merchant-web CI job |
| Middleware gate | admin-web vs customer-web | admin client-guard, customer-web middleware | DEFER decision to M1 |
| Prototype source | handoff zip + README | recreate-not-port; on-disk export sufficient | on-disk only; no DesignSync import; catalogue logic in Appendices |

---

## Appendix A: Prototype interactive-behaviour catalogue (recorded for future milestones; NOT built in M0)

Extracted read-only from `Redeemo for Business.dc.html` (line-cited evidence available in the extraction record). Each domain is tagged to its primary future milestone. This is reference for the build team; M0 implements none of it.

### A.1 Shell + design system (M0 / M7 chrome)
Two-column shell (sidebar 262/72/282, 64px translucent sticky topbar, 1180 content). Status pill = 7 lifecycle states (colour/dot/pulse-on-live). Top-bar cluster: hamburger, [View-as proto-only], [Demo proto-only], navy Validate-a-code, quick-actions, bell, account avatar. Voucher-type accent+gradient+icon system (7). Voucher status-badge + Caution/Restrictive term-badge maps. Brand lockup, section headers, active-nav treatment, popover primitive + click-catcher, keyframes. **M0 builds the shell + tokens + status-pill component + popover primitive; the state-switching logic (status pill source, view-as, account menu, quick actions, bell) is M6/M7.**

### A.2 Voucher builder (M4)
3-tier holistic calibration meter (Too weak / Good / Great; NOT 4-tier). Meter hard-coupled to a live improvement list (4+ improvements or any severe issue forces Too weak; zero + generous + clean terms reaches Great). Absolute £5 minimum-saving floor (standalone-freebie + frequent-reusable exemptions) that also blocks submit. Per-type generosity gates (`isGenerous`, absolute + relative per type). Term taxonomy fair/caution/restrictive via `RESTRICTIVE_WORDS`; term count drives score (Great requires <=3 terms). 7 types where Time-limited + Reusable are WRAPPERS over one of 5 base mechanics. Per-type saving math + read-only-derived saving for spend/free/package; BOGO editable saving with mismatch warning + reset-to-suggested. Per-type helper copy (full-price vs value-of-free-item vs normal-minus-package vs %-of-reference). Suggested title/description that track amounts live. Curated category-sourced terms + suggestion chips + custom terms. Time-limited (recurring weekly windows + presets + 3-state preview) and Reusable (interval cadence, 30-min floor, 2-state preview). Two SVG-icon pickers (8-tile flagship + 7-row custom). canSubmit gate + contextual submit labels + Ask-the-team toggle.

### A.3 Onboarding guided staircase (M2)
6-step checklist (create account [pre-done] / choose category / complete business profile / add main branch / set up 2 flagship vouchers / sign merchant agreement). 3 per-step states (Done / in progress / todo). Category-first lock progression (`profileUnlocked = categoryDone`; `downstreamUnlocked = categoryDone && profileDone`). First-reachable "current" highlight. Flagship sub-progress (1 of 2 / 2 of 2). Progress bar + Submit-for-review confirm modal flipping lifecycle to in_review. "Nothing is public yet" reassurance + locked tool teasers. Optional "Verify your business sooner" documents card. Two entry models (self-serve register + admin claim) converge on the same staircase. Submitted/in-review status home with a 3-step review tracker.

### A.4 Home dashboard (M5 data / M7 chrome)
State machine on a lifecycle enum x view-as-role: setting-up checklist / in-review status / live-early (encouraging placeholder) / live-established (two charts + glance stats) / suspended (established dashboard, read-only, banner) / lean staff home. Encouragement framing (monthly MoM, +/-3% thresholds, soft amber on downturn never red, navy primary chart line, green reserved for success). Needs-your-attention cards + calm empty state. Privacy-safe recent-redemptions feed (voucher/branch/time only, never who). Live-vouchers snapshot reconciling to the Vouchers list. Early-to-established is enum-driven in the prototype, NOT a runtime counter (~20-30 validated is product intent only). Single canonical fact table (CANON_REDS = 318) reconciles Home / Insights / Vouchers / Redemptions; validated-only, reversed-excluded, pending-as-queue.

### A.5 Redemptions + validation (M4)
Two staff-visible states (Awaiting validation / Validated) + a merchant-only Reversed state. Validate-a-code manual 8-char entry (QR is staff-app-only) with an entry/confirm/done flow and 8 case-specific error states. Redemption log with branch/status/range/voucher filters, search, sort, paging, CSV export (no PII), detail drawer. Pending = informational nudge ("X codes out"), never a chore; bulk/validate-all explicitly banned. Reverse/undo = merchant-only, unvalidated-only, reason-gated, persists as a Reversed record, excluded from every metric, and must revert the customer's per-cycle/window/cooldown claim.

### A.6 Voucher lifecycle (M4)
Single per-voucher status string with 9 values (live / in_review / changes / changes_review / end_review / draft / expired / ended / suspended="Paused"). Grouping (Finished = expired+ended; live-like keeps the current version visible). One `actionsFor(v)` builder gates actions by status + flagship flag + capability + business lifecycle. Flagship (RMV) permanently live, never deletable, edits always via review, only Request-a-change + View-redemptions + Duplicate. Live-edit -> changes_review pending-edit lane (current version stays live until approved). Request-to-end -> end_review -> Ended. Draft submit / in_review withdraw / changes resubmit (separate per-voucher review post-launch). "Run this again" creates a new voucher, original keeps stats. Onboarding = business + 2 flagship vouchers as ONE submission. Suspended = derived business-lifecycle state, read-only.

### A.7 Branches + location (M3)
Three-category branch edit model: IMMEDIATE (contact, amenities, PIN), DELAYED-EFFECTIVE (~2h customer cool-off on opening hours), REVIEW (name/about/address/logo/banner/photos via a pending-edit lane with old->new diff + withdraw). Geocoded location (postcode lookup auto-fills address; "you do not enter coordinates"; Redeemo confirms the pin pre-go-live; confirmed/pending status). Reveal-on-demand 4-digit PIN (customer-entered at redemption, never public). Request-to-close-permanently review request replaces instant delete; main/last branch guarded. No open/closed (isActive) toggle (status derived from hours). Make-main-branch + withdraw flows. Amenities category-scoped (CategoryAmenity rules) = the only branch-level physical-attribute tier. Per-branch redemption-alert recipients.

### A.8 Staff & access + roles + view-as (M3 build / M7 view-as)
Three roles (Owner / Branch manager / Staff) + branch scope. Owner-grantable extra ("Manage vouchers"; campaigns/billing Phase-5). Never-delegable owner floor + last-owner protection. Two account caps (per-merchant portal members ~8 / per-branch staff ~20 placeholders) with at-cap blocking. Unified person record (portal membership + branch-staff app access on one record) [prototype simplification]. Automated-email recipient assignment per-person (owner/manager only, auto-scoped). View-as role lens (prototype-only) gates nav routes + capabilities + account menu.

### A.9 Insights & reports (M5)
Lifecycle-staged (locked / early / full / suspended-read-only). Three overview metric cards (Redemptions / Distinct customers / Value delivered) + MoM trend chips. Time-range/branch/voucher-type controls. Redemptions-over-time bar chart. Five tabs: Vouchers (ranking + by-type share), Branches (always all-locations), Customers (new-vs-returning + age/gender/areas demographics with MIN_SLICE=4 + <8 suppression + privacy banner), Busy times (7x4 heatmap), Validation (validated-vs-awaiting + QR-vs-manual). Two downloadable reports (monthly performance + redemption CSV, no PII). All from the single validated-only/reversed-excluded fact table.

### A.10 Notifications + connected states (M6 / M7)
In-app bell = account/business/voucher/MILESTONE events (NOT per-redemption); badge counts unseen, rows track unread separately; full-view New/Earlier split; per-item navigation. Settings per-event email toggles + marketing opt-in (bell always shows; toggles control which also email; security alerts always-on). Self-managed monthly performance report (scoped to access) + extra recipient emails. Per-branch real-time redemption-alert recipients (owner-chosen; email carries voucher/time/code, never customer PII). Account menu (role-aware). Log-out confirm. Quick actions (role/scope-aware). Suspended = portal read-only with history kept (cascades across every module). Lifecycle-driven empty/locked/early states. Loading/error states exist only in auth/validate (a known gap for real list endpoints).

### A.11 Cross-screen dependencies + data model (all milestones)
One canonical in-memory fact table (CANON_REDS=318) feeds Home / Insights / Vouchers / per-voucher detail with identical counting (validated-only, reversed-excluded, pending-as-queue) and reconciling branch splits. A SEPARATE operational log (RDM_RAW, named rows) drives Redemptions + validate + reverse, numerically independent but sharing persona/branches/types. Centralized `_LC` lifecycle model + view-as role lens flip every module. No router/URL: navigation is setState(route + detail keys vView/brSel/rdmDetail/inBranch/rdmBranch). Shared persona (The Old Foundry Kitchen / James Whitfield + Sam Thorne + Emma Cole; two branches). The real build must re-implement the one-dataset principle as a single backend aggregation that all surfaces consume, and translate the setState navigation into real routes + deep-links.

---

## Appendix B: Consolidated stop-and-report / conflict ledger (resolve at the relevant milestone; NONE actioned in M0)

Disposition key: **S&R** = stop-and-report (schema/contract/legal; present exact SQL + rollback or an owner/legal decision before building). **OWNER** = product decision needed. **HONOUR-PROTO** / **HONOUR-BACKEND** = direction already clear, recorded so it is not reversed.

| # | Conflict | Milestone | Disposition |
|---|---|---|---|
| 1 | Merchant login OTP is a no-send stub (not just "SMS sketched"); recommend email channel; build the send | M1 | S&R / OWNER (channel) |
| 2 | Self-serve registration route does not exist (admin-invite+claim only) | M1 | build (feeds existing approval queue) |
| 3 | Logged-in change-password + personal-account edit + sign-out-all-devices missing | M1/M7 | build (primitives exist) |
| 4 | Voucher quality scoring + £5 minimum-saving floor + term taxonomy are entirely client-side, no backend; £5 floor + BOGO-recommended + freebie/reusable exemptions are NEW unconfirmed product rules | M4 | S&R + OWNER |
| 5 | Voucher score is 3-tier (Too weak/Good/Great), not 4-tier | M4 | HONOUR-PROTO |
| 6 | Wrapper model (Time-limited/Reusable wrap a base mechanic) has no schema equivalent (VoucherType is a flat enum) | M4 | S&R (schema) |
| 7 | Per-type derived-vs-editable estimatedSaving (single nullable Decimal today) | M4 | OWNER |
| 8 | Flagship edit-via-review vs blueprint "cannot be edited"; flagship-eligible voucher types per category | M4 | OWNER (owner-input item) |
| 9 | Onboarding checklist gates on 6 steps incl category + profile; backend gates only branch + contract + 2 RMV; category-first lock + category->RMV provisioning is a prototype construct | M2 | S&R |
| 10 | Merchant agreement ordering (gated last behind category/profile) vs backend any-order contract | M2 | HONOUR-BACKEND |
| 11 | Reversal is greenfield (no field/route); needs a "Reversed" status column + a transactional reverse op that reverts the per-cycle/window/cooldown claim + audit | M4 | S&R (schema) |
| 12 | Voucher lifecycle: single status string (9 values) vs two-axis VoucherStatus x ApprovalStatus; changes_review + end_review have no backend representation (need a voucher-level pending-edit type); Ended-vs-Expired distinction | M4 | S&R (schema) + OWNER |
| 13 | Branch isActive toggle removed + request-to-close review lane; backend isActive/delete are merchant-DIRECT, no review lane | M3 | S&R (contract) |
| 14 | Delayed-effective opening hours (~2h cool-off) + multi-period days; one-period/day, no effective-at today | M3 | S&R (schema) |
| 15 | Three-tier attribute move (physical highlight/detail tags merchant->branch level) | M3 | S&R (schema) |
| 16 | Per-person grantable capabilities (manager + "Manage vouchers" extra); merchant authz is role-only, no capability store | M3 | S&R (schema) |
| 17 | Two account caps (per-merchant portal members / per-branch staff); no cap fields today | M3 | S&R (schema) + OWNER (numbers) |
| 18 | Unified person across portal membership + branch-staff (two unlinked models, no shared identity) | M3 | S&R (modelling) |
| 19 | businessType + conditional identifiers (charity no / UTR; VAT conditional) | M3 | S&R (schema; in baseline ledger) |
| 20 | Per-branch redemption-alert recipients (greenfield) + email dark until Phase 6 | M3/M6 | S&R (schema) |
| 21 | Merchant notification READ endpoints + bell not built (write-side fires but is invisible) | M6 | build (additive, no migration) |
| 22 | Per-event notification-preference fields on MerchantAdmin (none today) | M6 | S&R (schema) |
| 23 | Self-managed scoped monthly report email (dark + needs scoping job) | M6 | S&R + Phase-6 email |
| 24 | Entire merchant analytics aggregation is greenfield; one shared backend aggregation must feed Home/Insights/Vouchers/Redemptions; VoucherRedemption has no merchantId column; London-TZ buckets; isTestData filter; estimatedSaving Decimal coercion | M5 | S&R |
| 25 | Customer demographics (age/gender/areas) require a DPIA / privacy + legal sign-off before build (hard gate); gender is free-text String (needs enum); MIN_SLICE=4/<8 thresholds unvalidated | M5 | S&R (legal/DPIA) |
| 26 | Validated-only headline vs all-redeemed (incl pending) | M5 | OWNER |
| 27 | "Customers" metric label inconsistency (Home "Customers brought in" vs Insights "Distinct customers") | M5 | HONOUR-PROTO (align to one) |
| 28 | Single-dataset reconciliation runs on one in-memory constant; real build must derive identical figures from the aggregation | M5 | S&R |
| 29 | Notification milestone copy ("150 redemptions") does not reconcile with the canonical current-month figure; milestones must be aggregation-triggered | M6 | OWNER |
| 30 | No loading/error/skeleton states in the prototype (mock data); must be designed for real list endpoints | M1-M7 | S&R (gap) |
| 31 | View-as role lens + Demo lifecycle switcher are prototype-only top-bar controls; lifecycle/role must be backend/auth-driven, not client toggles | M7 | HONOUR-BACKEND (model real, switcher non-shippable) |
| 32 | "Coming soon" Grow group (Promote + Payments & billing) + Documents folded into Business profile | M8 / M3 | HONOUR-PROTO |
| 33 | Dead/stale prototype demo copy ("other types coming soon" otherTypeNote) + the brief's ".scratch picker PNGs" do not exist (picker is SVG-icon-driven) | M4 | do NOT carry forward |

M0 actions none of the above. Each is owned by the milestone in its row and must be resolved (owner decision, schema stop-and-report with exact SQL + rollback, or a recorded honour-direction) before that milestone builds.
