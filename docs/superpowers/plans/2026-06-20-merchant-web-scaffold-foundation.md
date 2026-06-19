# Merchant Portal M0: `apps/merchant-web` Scaffold + Brand Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create `apps/merchant-web` (Next.js) with the full Redeemo Merchant Portal brand layer, a brand-faithful left-sidebar + top-bar shell, and the base design-system primitive set, by hybrid-cloning the proven `apps/admin-web` plumbing. Foundation only: no auth, no API, no backend, no schema, no product surfaces.

**Architecture:** Clone admin-web's Next 15 / Tailwind 4 / shadcn new-york / React Query / jest plumbing verbatim, then replace its calm-neutral token layer with the full Redeemo brand (ported from the prototype `tokens.css` + customer-web font hosting) and rebuild the chrome as a left sidebar + top bar (admin-web is a top-bar-only shell). Nav items are static and non-functional in M0; the top bar carries placeholder slots only; the two prototype-only controls (View-as, Demo) are not built.

**Tech Stack:** Next.js 15 (App Router), React 19, Tailwind CSS v4 (`@tailwindcss/postcss`, no `tailwind.config`), shadcn/ui (new-york, neutral base, brand via CSS-var `@theme inline` bridge), `radix-ui` (unified package), `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, `@tanstack/react-query` v5, `zod` v4, jest + `@testing-library/react` (jsdom via `next/jest`). Node 24 (root `.nvmrc`). Self-hosted Mustica Pro + Lato.

**Spec:** `docs/superpowers/specs/2026-06-20-merchant-web-scaffold-foundation-design.md` (accepted). Treat its lists as anchors. Appendix A (prototype behaviour catalogue) and Appendix B (stop-and-report ledger) are reference for FUTURE milestones and are NOT implemented here.

---

## PR Sequencing (resolve BEFORE implementation; the docs-branch-vs-main issue)

Current git reality (verified):
- `origin/main` HAS the blueprint (`2026-06-16-merchant-portal-product-blueprint.md`).
- `origin/main` does NOT have the findings (`2026-06-17-...-prototype-findings.md`) or the handover (`2026-06-19-...-build-handover.md`); they live only on `docs/merchant-portal-prototype-findings` (~30 unmerged `findings(...)` commits).
- The M0 spec and this M0 plan were committed on `docs/merchant-web-m0-scaffold-foundation-spec`, which was branched off `docs/merchant-portal-prototype-findings` (so it also carries those ~30 docs commits).

**Recommended sequencing (clean, no messy history in the code PR):**

1. **Docs PR first (docs-only, no code).** Land the merchant-portal planning docs on `main` before any implementation. The current branch `docs/merchant-web-m0-scaffold-foundation-spec` already contains findings + handover + the M0 spec + this M0 plan, and its diff vs `origin/main` is **docs-only**. Open ONE docs PR from this branch to `main`.
   - Before opening/merging, verify the PR diff is docs-only and matches expectation using GitHub's live compare (per CLAUDE.md PR-scope rule): `gh api repos/:owner/:repo/compare/main...docs/merchant-web-m0-scaffold-foundation-spec --jq '.files[].filename'` and confirm every path is under `docs/`.
   - If the owner prefers two smaller PRs, split as: Docs-PR-A = merge `docs/merchant-portal-prototype-findings` (findings + handover); then re-create a Docs-PR-B branch off updated `main` containing only the M0 spec + plan. The single-PR route is simpler and the diff is purely docs either way.
   - The prototype handoff zip + the `docs/design/` tree stay UNTRACKED (do not commit the 5.5 MB binary in this PR; that tree is already untracked and is a local reference artifact). Owner decides separately whether `docs/design/` is ever committed or gitignored.

2. **M0 implementation branch off UPDATED main.** AFTER the docs land on `main`, `git fetch origin` and create the implementation branch FROM `origin/main`:
   `git checkout -b feat/merchant-web-m0-scaffold origin/main`.
   Do NOT branch the implementation off the docs branch (that would drag ~30 docs commits into the code PR). Branching off updated `main` keeps the code PR's diff = only the new app + the one CI job + the lockfile, with the docs already present on `main` for reference.

3. **M0 implementation PR.** Open from `feat/merchant-web-m0-scaffold` to `main` once all tasks below pass. Its diff MUST be confined to `apps/merchant-web/**` + `.github/workflows/ci.yml` + root `package-lock.json` (scope guard below). Verify with `git diff --stat origin/main` before opening.

This plan's Tasks 1-12 are the implementation; they assume you are on `feat/merchant-web-m0-scaffold` (step 2 above) with the docs already on `main`. (If the owner chooses to implement before docs merge, branch off the docs branch instead and note that the eventual PR will include the docs; flag this to the owner first.)

---

## File Structure (what each new file is responsible for)

```
apps/merchant-web/
  package.json            # workspace manifest; deps mirror admin-web; dev/start on port 3003
  tsconfig.json           # copy admin-web verbatim (strict, @/* paths)
  next-env.d.ts           # Next type shim (generated; copy admin-web's)
  components.json         # shadcn new-york, neutral base, cssVariables, lucide
  postcss.config.mjs      # @tailwindcss/postcss (copy admin-web verbatim)
  eslint.config.mjs       # next/core-web-vitals + next/typescript (copy admin-web verbatim)
  jest.config.mjs         # next/jest jsdom (copy admin-web verbatim)
  jest.setup.ts           # @testing-library/jest-dom (copy admin-web verbatim)
  next.config.ts          # outputFileTracingRoot + R2/S3 remotePatterns + securityHeaders
  public/
    fonts/                # Mustica + Lato (copy from customer-web/public/fonts)
    redeemo-r-mark.png    # brand R mark (copy from customer-app assets)
  app/
    globals.css           # @import tailwindcss + @font-face + brand :root + @theme inline bridge
    layout.tsx            # metadata, robots noindex, Providers
    providers.tsx         # QueryClient ONLY (no SessionProvider)
    (app)/
      layout.tsx          # renders <MerchantPortalShell>
      page.tsx            # placeholder landing
      foundations/page.tsx# internal brand-QA preview (noindex)
    (auth)/.gitkeep       # empty route-group placeholder (no logic)
  components/
    shell/
      navItems.ts         # static IA config (labels, grouping, Soon flags, lucide icons)
      Sidebar.tsx         # lockup + StatusPill slot + grouped static nav + pinned items
      Topbar.tsx          # validate/quick/bell/account placeholder slots (NO view-as, NO demo)
      MerchantPortalShell.tsx # two-column layout + responsive drawer/collapse
      StatusPill.tsx      # 7-state lifecycle pill (prop-driven, static default)
    ui/
      button.tsx          # brand-skinned (gradient/navy/secondary/ghost/destructive)
      badge.tsx           # Caution/Restrictive/neutral
      chip.tsx            # voucher-type accent chip
      card.tsx input.tsx label.tsx dialog.tsx  # copy admin-web verbatim (brand via tokens)
      popover.tsx         # radix popover wrapper (chrome-menu primitive)
      table.tsx           # table shell (header/rows/empty slot)
  lib/
    utils.ts              # cn() (copy admin-web verbatim)
    icons.ts              # lucide re-export barrel
    securityHeaders.ts    # copy admin-web verbatim (update comment admin->merchant)
.github/workflows/ci.yml  # add a merchant-web job (mirror admin-web job)
```

---

### Task 1: Workspace skeleton + config files + install

**Files:**
- Create: `apps/merchant-web/package.json`
- Create (copy verbatim from admin-web): `apps/merchant-web/{tsconfig.json, next-env.d.ts, postcss.config.mjs, eslint.config.mjs, jest.config.mjs, jest.setup.ts, components.json}`
- Create (copy + tiny adapt): `apps/merchant-web/next.config.ts`, `apps/merchant-web/lib/securityHeaders.ts`, `apps/merchant-web/lib/utils.ts`

- [ ] **Step 1: Create `apps/merchant-web/package.json`** (admin-web deps verbatim; name + port changed)

```json
{
  "name": "@redeemo/merchant-web",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev --port 3003",
    "build": "next build",
    "start": "next start --port 3003",
    "typecheck": "tsc --noEmit",
    "lint": "next lint",
    "test": "jest",
    "test:watch": "jest --watch"
  },
  "dependencies": {
    "@tanstack/react-query": "^5.0.0",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "lucide-react": "^1.8.0",
    "next": "^15.0.0",
    "radix-ui": "^1.5.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "tailwind-merge": "^2.5.0",
    "zod": "^4.4.1"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4.0.0",
    "@testing-library/jest-dom": "^6.4.0",
    "@testing-library/react": "^16.0.0",
    "@testing-library/user-event": "^14.5.0",
    "@types/jest": "^29.5.0",
    "@types/node": "22.19.17",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "eslint": "^9.0.0",
    "eslint-config-next": "^15.0.0",
    "jest": "^29.7.0",
    "jest-environment-jsdom": "^29.7.0",
    "postcss": "^8.0.0",
    "tailwindcss": "^4.0.0",
    "typescript": "^5.0.0"
  }
}
```

- [ ] **Step 2: Copy the stock config files verbatim from admin-web**

```bash
cd /Users/shebinchaliyath/Developer/Redeemo
mkdir -p apps/merchant-web/lib apps/merchant-web/app apps/merchant-web/components/ui apps/merchant-web/components/shell apps/merchant-web/public/fonts
cp apps/admin-web/tsconfig.json        apps/merchant-web/tsconfig.json
cp apps/admin-web/next-env.d.ts        apps/merchant-web/next-env.d.ts
cp apps/admin-web/postcss.config.mjs   apps/merchant-web/postcss.config.mjs
cp apps/admin-web/eslint.config.mjs    apps/merchant-web/eslint.config.mjs
cp apps/admin-web/jest.config.mjs      apps/merchant-web/jest.config.mjs
cp apps/admin-web/jest.setup.ts        apps/merchant-web/jest.setup.ts
cp apps/admin-web/components.json      apps/merchant-web/components.json
cp apps/admin-web/lib/utils.ts         apps/merchant-web/lib/utils.ts
cp apps/admin-web/lib/securityHeaders.ts apps/merchant-web/lib/securityHeaders.ts
cp apps/admin-web/next.config.ts       apps/merchant-web/next.config.ts
```
These are app-relative (no admin-specific values): `tsconfig.json` (`@/*` paths), `postcss.config.mjs`, `eslint.config.mjs`, `jest.config.mjs` (next/jest jsdom + `@/` mapper), `jest.setup.ts` (jest-dom), `components.json` (new-york / neutral / lucide), `lib/utils.ts` (`cn`), `next.config.ts` (outputFileTracingRoot + R2/S3 remotePatterns + buildSecurityHeaders), `lib/securityHeaders.ts` (CSP from `NEXT_PUBLIC_API_URL`; note its `font-src 'self'` already allows self-hosted fonts). `next.config.ts` needs no change (it reads `./lib/securityHeaders` and `NEXT_PUBLIC_API_URL`).

- [ ] **Step 3: Update the `securityHeaders.ts` comment (cosmetic, optional)**

In `apps/merchant-web/lib/securityHeaders.ts` change the header comment word "admin" to "merchant" (functional code is identical; no behaviour change). This is the only edit to a copied file in this task.

- [ ] **Step 4: Install (root install hoists the new workspace)**

```bash
cd /Users/shebinchaliyath/Developer/Redeemo
npm install
```
Expected: `package-lock.json` updates to include `@redeemo/merchant-web`. **STOP-AND-REPORT:** review the lockfile diff before staging (`git diff package-lock.json | head -40`); it should add the merchant-web workspace + hoist already-present deps, nothing unexpected. Do not stage the lockfile blind (CLAUDE.md npm-install hook warns).

- [ ] **Step 5: Commit**

```bash
git add apps/merchant-web/package.json apps/merchant-web/tsconfig.json apps/merchant-web/next-env.d.ts apps/merchant-web/postcss.config.mjs apps/merchant-web/eslint.config.mjs apps/merchant-web/jest.config.mjs apps/merchant-web/jest.setup.ts apps/merchant-web/components.json apps/merchant-web/lib/utils.ts apps/merchant-web/lib/securityHeaders.ts apps/merchant-web/next.config.ts package-lock.json
git commit -m "feat(merchant-web): scaffold workspace + config (cloned from admin-web)"
```

---

### Task 2: Brand foundation (fonts + globals.css + layout + providers + first build)

**Files:**
- Create: `apps/merchant-web/public/fonts/*` (copied), `apps/merchant-web/public/redeemo-r-mark.png` (copied)
- Create: `apps/merchant-web/app/globals.css`, `apps/merchant-web/app/layout.tsx`, `apps/merchant-web/app/providers.tsx`
- Create (temporary minimal, replaced in Task 9): `apps/merchant-web/app/(app)/layout.tsx`, `apps/merchant-web/app/(app)/page.tsx`, `apps/merchant-web/app/(auth)/.gitkeep`

- [ ] **Step 1: Copy fonts + brand mark**

```bash
cd /Users/shebinchaliyath/Developer/Redeemo
cp apps/customer-web/public/fonts/MusticaPro-SemiBold.otf apps/merchant-web/public/fonts/
cp apps/customer-web/public/fonts/Lato-Light.ttf          apps/merchant-web/public/fonts/
cp apps/customer-web/public/fonts/Lato-Regular.ttf        apps/merchant-web/public/fonts/
cp apps/customer-web/public/fonts/Lato-Medium.ttf         apps/merchant-web/public/fonts/
cp apps/customer-web/public/fonts/Lato-Semibold.ttf       apps/merchant-web/public/fonts/
cp apps/customer-web/public/fonts/Lato-Bold.ttf           apps/merchant-web/public/fonts/
cp apps/customer-app/assets/redeemo-r-mark.png            apps/merchant-web/public/redeemo-r-mark.png
```
(Filenames are exact, including `Lato-Semibold.ttf` lowercase b. `redeemo-r-mark.png` is the tracked brand R mark; alternatively the prototype `redeemo-r.png` from the handoff zip can be used, but the customer-app asset is already in-repo.)

- [ ] **Step 2: Create `apps/merchant-web/app/globals.css`** (the brand heart: `@font-face` from customer-web + brand `:root` ported from the prototype `tokens.css` + an `@theme inline` bridge in the admin-web pattern, pointed at the FULL brand)

```css
@import "tailwindcss";

/* Redeemo Merchant Portal design tokens.
 * shadcn primitives reference semantic utilities (bg-background, text-foreground,
 * border-border, bg-primary, ...). The @theme inline bridge below maps those onto
 * the full Redeemo brand palette + fonts, so every primitive inherits the brand.
 * Token values: docs/design/merchant-portal/design-system/tokens.css. */

/* Self-hosted fonts (public/fonts) */
@font-face { font-family: 'Mustica Pro'; src: url('/fonts/MusticaPro-SemiBold.otf') format('opentype'); font-weight: 600; font-style: normal; font-display: swap; }
@font-face { font-family: 'Lato'; src: url('/fonts/Lato-Light.ttf')    format('truetype'); font-weight: 300; font-style: normal; font-display: swap; }
@font-face { font-family: 'Lato'; src: url('/fonts/Lato-Regular.ttf')  format('truetype'); font-weight: 400; font-style: normal; font-display: swap; }
@font-face { font-family: 'Lato'; src: url('/fonts/Lato-Medium.ttf')   format('truetype'); font-weight: 500; font-style: normal; font-display: swap; }
@font-face { font-family: 'Lato'; src: url('/fonts/Lato-Semibold.ttf') format('truetype'); font-weight: 600; font-style: normal; font-display: swap; }
@font-face { font-family: 'Lato'; src: url('/fonts/Lato-Bold.ttf')     format('truetype'); font-weight: 700; font-style: normal; font-display: swap; }

:root {
  /* Brand spine */
  --rose: #E20C04;
  --coral: #E84A00;
  --navy: #010C35;
  --brand-gradient: linear-gradient(135deg, #E20C04, #E84A00);

  /* Warm neutrals */
  --page: #FFFFFF;
  --cream: #FFF9F5;
  --tint: #FEF6F5;
  --tint-deep: #FEF0EE;
  --neutral: #F8F9FA;
  --subtle: #F3F4F6;
  --border-subtle: #E5E7EB;
  --border-default: #D1D5DB;
  --border-strong: #9CA3AF;
  --sidebar-border: #EEF1F4;

  /* Voucher-type accents (token-only in M0; chip consumes) */
  --vt-bogo: #7C3AED;
  --vt-discount: #E20C04;
  --vt-freebie: #16A34A;
  --vt-spendsave: #E84A00;
  --vt-package: #2563EB;
  --vt-timelimited: #D97706;
  --vt-reusable: #0D9488;

  /* Functional signals */
  --success: #0F7A3E;
  --savings: #16A34A;
  --warning: #B45309;
  --warning-bg: #FEF6EC;
  --danger: #B91C1C;
  --danger-bg: #FEECEC;
  --info: #0E7490;
  --trending: #DB2777;
  --featured: #C7891B;

  /* Neutral text */
  --text-primary: #010C35;
  --text-secondary: #455373;
  --text-tertiary: #6B7390;
  --text-muted: #8089A4;

  /* shadcn semantic vars (brand-mapped) */
  --background: #FFF9F5;
  --foreground: #010C35;
  --card: #FFFFFF;
  --card-foreground: #010C35;
  --popover: #FFFFFF;
  --popover-foreground: #010C35;
  --primary: #E20C04;
  --primary-foreground: #FFFFFF;
  --secondary: #FFFFFF;
  --secondary-foreground: #010C35;
  --muted: #F3F4F6;
  --muted-foreground: #6B7390;
  --accent: #FEF6F5;
  --accent-foreground: #010C35;
  --destructive: #B91C1C;
  --destructive-foreground: #FFFFFF;
  --border: #E5E7EB;
  --input: #E5E7EB;
  --ring: #E20C04;

  /* Radii (prototype web scale) */
  --radius-sm: 10px;
  --radius-md: 14px;
  --radius-lg: 18px;
  --radius-pill: 999px;

  /* Shadows (navy-tinted + brand glow) */
  --shadow-sm: 0 1px 2px rgba(1, 12, 53, 0.06);
  --shadow-md: 0 4px 14px rgba(1, 12, 53, 0.08);
  --shadow-lg: 0 10px 30px rgba(1, 12, 53, 0.10);
  --shadow-glow: 0 14px 30px -12px rgba(226, 12, 4, 0.6);

  /* Type families */
  --font-display: 'Mustica Pro', Georgia, 'Times New Roman', serif;
  --font-body: 'Lato', system-ui, -apple-system, sans-serif;
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);

  /* Brand extras exposed as utilities */
  --color-navy: var(--navy);
  --color-cream: var(--cream);
  --color-tint: var(--tint);
  --color-tint-deep: var(--tint-deep);
  --color-success: var(--success);
  --color-savings: var(--savings);
  --color-warning: var(--warning);
  --color-info: var(--info);
  --color-trending: var(--trending);
  --color-featured: var(--featured);
  --color-vt-bogo: var(--vt-bogo);
  --color-vt-discount: var(--vt-discount);
  --color-vt-freebie: var(--vt-freebie);
  --color-vt-spendsave: var(--vt-spendsave);
  --color-vt-package: var(--vt-package);
  --color-vt-timelimited: var(--vt-timelimited);
  --color-vt-reusable: var(--vt-reusable);

  --font-display: var(--font-display);
  --font-body: var(--font-body);

  --radius-sm: var(--radius-sm);
  --radius-md: var(--radius-md);
  --radius-lg: var(--radius-lg);
}

* { box-sizing: border-box; }

@layer base {
  * {
    border-color: var(--border);
    outline-color: color-mix(in srgb, var(--ring) 50%, transparent);
  }
  html { accent-color: var(--navy); }
  body {
    background-color: var(--background);
    color: var(--foreground);
    font-family: var(--font-body);
    font-size: 15px;
    line-height: 1.5;
    letter-spacing: -0.005em;
    -webkit-font-smoothing: antialiased;
  }
  h1, h2, h3, h4 { font-family: var(--font-display); font-weight: 600; }
}

/* Status-pill live-state pulse (the only animation needed in M0) */
@keyframes rdmoPulse {
  0%   { box-shadow: 0 0 0 0 rgba(15, 122, 62, 0.45); }
  70%  { box-shadow: 0 0 0 6px rgba(15, 122, 62, 0); }
  100% { box-shadow: 0 0 0 0 rgba(15, 122, 62, 0); }
}
```

- [ ] **Step 3: Create `apps/merchant-web/app/providers.tsx`** (QueryClient ONLY; NO SessionProvider in M0)

```tsx
'use client'

import { useState, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

/**
 * App-wide client providers. React Query is wired now so later milestones can add
 * data hooks without touching this file. M0 has no auth, so there is NO
 * SessionProvider yet (M1 adds it).
 */
export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 60_000, refetchOnWindowFocus: false, retry: 1 },
        },
      })
  )
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
```

- [ ] **Step 4: Create `apps/merchant-web/app/layout.tsx`**

```tsx
import type { Metadata } from 'next'
import './globals.css'
import { Providers } from './providers'

export const metadata: Metadata = {
  title: 'Redeemo for Business',
  description: 'Redeemo merchant portal.',
  robots: { index: false, follow: false },
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
```

- [ ] **Step 5: Create temporary `(app)` + `(auth)` placeholders so the app builds**

`apps/merchant-web/app/(app)/layout.tsx` (temporary; Task 9 replaces with the shell):
```tsx
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
```
`apps/merchant-web/app/(app)/page.tsx`:
```tsx
export default function HomePlaceholder() {
  return <main style={{ padding: 24 }}><h1>Redeemo for Business</h1></main>
}
```
`apps/merchant-web/app/(auth)/.gitkeep`: empty file (route-group placeholder, no logic).

- [ ] **Step 6: Verify first build + typecheck + lint pass**

```bash
cd /Users/shebinchaliyath/Developer/Redeemo/apps/merchant-web
npm run typecheck && npm run lint && NEXT_PUBLIC_API_URL=http://localhost:3000 npm run build
```
Expected: all three exit 0; `next build` lists the `/` route. (If `next build` reports a prerender error, fix before continuing: the admin-web lesson is that `next build` catches Next 15 issues tsc/lint miss.)

- [ ] **Step 7: Commit**

```bash
cd /Users/shebinchaliyath/Developer/Redeemo
git add apps/merchant-web/public apps/merchant-web/app
git commit -m "feat(merchant-web): brand layer (fonts + tokens) + layout + providers"
```

---

### Task 3: Base ui primitives (copy stock; icons barrel)

**Files:**
- Create (copy verbatim from admin-web): `apps/merchant-web/components/ui/{card.tsx, input.tsx, label.tsx, dialog.tsx}`
- Create: `apps/merchant-web/lib/icons.ts`

- [ ] **Step 1: Copy the stock primitives verbatim** (they inherit the brand via the semantic-var bridge; no per-component edits)

```bash
cd /Users/shebinchaliyath/Developer/Redeemo
cp apps/admin-web/components/ui/card.tsx   apps/merchant-web/components/ui/card.tsx
cp apps/admin-web/components/ui/input.tsx  apps/merchant-web/components/ui/input.tsx
cp apps/admin-web/components/ui/label.tsx  apps/merchant-web/components/ui/label.tsx
cp apps/admin-web/components/ui/dialog.tsx apps/merchant-web/components/ui/dialog.tsx
```

- [ ] **Step 2: Create `apps/merchant-web/lib/icons.ts`** (lucide re-export barrel; add icons as later tasks need them)

```ts
// Re-export the lucide icons used by the portal chrome from one module so
// component files import from '@/lib/icons' (keeps barrel-import lint clean and
// gives one place to swap the icon set later).
export {
  Home,
  Ticket,
  ScanLine,
  BarChart3,
  MapPin,
  Users,
  Building2,
  Megaphone,
  CreditCard,
  Settings,
  LifeBuoy,
  Bell,
  Grid3x3,
  ChevronDown,
  Menu,
} from 'lucide-react'
```

- [ ] **Step 3: Verify typecheck + build**

```bash
cd /Users/shebinchaliyath/Developer/Redeemo/apps/merchant-web
npm run typecheck && NEXT_PUBLIC_API_URL=http://localhost:3000 npm run build
```
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add apps/merchant-web/components/ui apps/merchant-web/lib/icons.ts
git commit -m "feat(merchant-web): base ui primitives (card/input/label/dialog) + icons barrel"
```

---

### Task 4: Brand-skinned Button (TDD)

**Files:**
- Create: `apps/merchant-web/components/ui/button.tsx`
- Test: `apps/merchant-web/components/ui/__tests__/button.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react'
import { Button } from '../button'

describe('Button', () => {
  it('renders the gradient (signature) variant with the brand glow', () => {
    render(<Button variant="gradient">Save voucher</Button>)
    const btn = screen.getByRole('button', { name: 'Save voucher' })
    expect(btn).toHaveAttribute('data-variant', 'gradient')
    expect(btn.className).toMatch(/E20C04/) // brand-red gradient stop present
  })

  it('renders the navy CTA variant', () => {
    render(<Button variant="navy">Validate a code</Button>)
    expect(screen.getByRole('button', { name: 'Validate a code' })).toHaveAttribute('data-variant', 'navy')
  })

  it('exposes secondary, ghost, and destructive variants', () => {
    const { rerender } = render(<Button variant="secondary">a</Button>)
    expect(screen.getByRole('button')).toHaveAttribute('data-variant', 'secondary')
    rerender(<Button variant="ghost">a</Button>)
    expect(screen.getByRole('button')).toHaveAttribute('data-variant', 'ghost')
    rerender(<Button variant="destructive">a</Button>)
    expect(screen.getByRole('button')).toHaveAttribute('data-variant', 'destructive')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/merchant-web && npx jest components/ui/__tests__/button.test.tsx`
Expected: FAIL (cannot resolve `../button`).

- [ ] **Step 3: Write `apps/merchant-web/components/ui/button.tsx`** (brand variants; based on admin-web's shadcn button, replacing the variant set)

```tsx
import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-semibold whitespace-nowrap transition-all outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // Signature primary: red-to-coral 135deg gradient + brand-rose glow.
        gradient:
          "text-white border-0 bg-[linear-gradient(135deg,#E20C04_0%,#E84A00_100%)] shadow-[0_14px_30px_-12px_rgba(226,12,4,0.6)] hover:brightness-105 hover:-translate-y-px",
        // Solid brand-red (shadcn default mapping).
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        // Navy secondary CTA (e.g. Validate a code).
        navy: "bg-navy text-white border border-navy hover:bg-[#1b264f]",
        // White + hairline border.
        secondary:
          "bg-card text-foreground border border-border shadow-[var(--shadow-sm)] hover:bg-[#F8F9FA]",
        ghost: "text-foreground hover:bg-accent",
        destructive: "bg-destructive text-white hover:bg-destructive/90",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-5 py-2",
        sm: "h-8 px-3 text-xs",
        lg: "h-11 px-6",
        icon: "size-10",
      },
    },
    defaultVariants: { variant: "gradient", size: "default" },
  }
)

function Button({
  className,
  variant = "gradient",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "button"
  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/merchant-web && npx jest components/ui/__tests__/button.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/merchant-web/components/ui/button.tsx apps/merchant-web/components/ui/__tests__/button.test.tsx
git commit -m "feat(merchant-web): brand-skinned Button (gradient/navy/secondary/ghost/destructive)"
```

---

### Task 5: Badge + Chip + StatusPill (TDD)

**Files:**
- Create: `apps/merchant-web/components/ui/badge.tsx`, `apps/merchant-web/components/ui/chip.tsx`, `apps/merchant-web/components/shell/StatusPill.tsx`
- Test: `apps/merchant-web/components/shell/__tests__/status-pill.test.tsx`

- [ ] **Step 1: Write the failing StatusPill test** (the 7 lifecycle states; this is the load-bearing chrome primitive)

```tsx
import { render, screen } from '@testing-library/react'
import { StatusPill, type LifecycleState } from '../StatusPill'

const ALL: { state: LifecycleState; label: string }[] = [
  { state: 'setup', label: 'Setting up' },
  { state: 'submitted', label: 'Submitted' },
  { state: 'in_review', label: 'In review' },
  { state: 'changes', label: 'Changes needed' },
  { state: 'live', label: 'Live' },
  { state: 'live_new', label: 'Live, just started' },
  { state: 'suspended', label: 'Suspended' },
]

describe('StatusPill', () => {
  it.each(ALL)('renders the $state state as "$label"', ({ state, label }) => {
    render(<StatusPill state={state} />)
    expect(screen.getByText(label)).toBeInTheDocument()
  })

  it('defaults to "setup" when no state is given', () => {
    render(<StatusPill />)
    expect(screen.getByText('Setting up')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/merchant-web && npx jest components/shell/__tests__/status-pill.test.tsx`
Expected: FAIL (cannot resolve `../StatusPill`).

- [ ] **Step 3: Create `apps/merchant-web/components/shell/StatusPill.tsx`** (7-state map from the prototype; prop-driven, static default; pulse on live states)

```tsx
import * as React from 'react'

export type LifecycleState =
  | 'setup' | 'submitted' | 'in_review' | 'changes' | 'live' | 'live_new' | 'suspended'

interface PillStyle { label: string; dot: string; bg: string; fg: string; pulse?: boolean }

const STATUS: Record<LifecycleState, PillStyle> = {
  setup:     { label: 'Setting up',        dot: '#9CA3AF', bg: '#F3F4F6', fg: '#4B5563' },
  submitted: { label: 'Submitted',         dot: '#0E7490', bg: '#ECFEFF', fg: '#0E7490' },
  in_review: { label: 'In review',         dot: '#0E7490', bg: '#ECFEFF', fg: '#0E7490' },
  changes:   { label: 'Changes needed',    dot: '#B45309', bg: '#FEF6EC', fg: '#B45309' },
  live:      { label: 'Live',              dot: '#0F7A3E', bg: '#E9F7EF', fg: '#0F7A3E', pulse: true },
  live_new:  { label: 'Live, just started',dot: '#0F7A3E', bg: '#E9F7EF', fg: '#0F7A3E', pulse: true },
  suspended: { label: 'Suspended',         dot: '#B91C1C', bg: '#FEECEC', fg: '#B91C1C' },
}

/**
 * Sidebar business-status pill. M0 renders a static, prop-driven default; the live
 * state source (server merchant.status) is wired in a later milestone (M7).
 */
export function StatusPill({ state = 'setup' }: { state?: LifecycleState }) {
  const st = STATUS[state]
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: '6px 12px', borderRadius: 13, background: st.bg, color: st.fg,
        fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-body)',
      }}
    >
      <span
        style={{
          width: 8, height: 8, borderRadius: 999, background: st.dot,
          animation: st.pulse ? 'rdmoPulse 2.2s infinite' : undefined,
        }}
      />
      {st.label}
    </span>
  )
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/merchant-web && npx jest components/shell/__tests__/status-pill.test.tsx`
Expected: PASS (8 cases).

- [ ] **Step 5: Create `apps/merchant-web/components/ui/badge.tsx`** (Caution / Restrictive / neutral)

```tsx
import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide',
  {
    variants: {
      variant: {
        neutral: 'bg-[#F3F4F6] text-[#6B7390]',
        caution: 'bg-[#FEF6EC] text-[#B45309]',
        restrictive: 'bg-[#FEECEC] text-[#B91C1C]',
      },
    },
    defaultVariants: { variant: 'neutral' },
  }
)

export function Badge({
  className, variant = 'neutral', ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return <span data-variant={variant} className={cn(badgeVariants({ variant, className }))} {...props} />
}
```

- [ ] **Step 6: Create `apps/merchant-web/components/ui/chip.tsx`** (voucher-type accent chip; the 7-accent map)

```tsx
import * as React from 'react'
import { cn } from '@/lib/utils'

export type VoucherType =
  | 'bogo' | 'discount' | 'freebie' | 'spendsave' | 'package' | 'timelimited' | 'reusable'

const ACCENT: Record<VoucherType, string> = {
  bogo: '#7C3AED', discount: '#E20C04', freebie: '#16A34A', spendsave: '#E84A00',
  package: '#2563EB', timelimited: '#D97706', reusable: '#0D9488',
}

/** Voucher-type chip. Accent comes from the type map; usage (which voucher) is M4. */
export function Chip({
  type, className, children, ...props
}: React.ComponentProps<'span'> & { type: VoucherType }) {
  const accent = ACCENT[type]
  return (
    <span
      data-type={type}
      className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold', className)}
      style={{ background: `${accent}1A`, color: accent }}
      {...props}
    >
      <span style={{ width: 6, height: 6, borderRadius: 999, background: accent }} />
      {children}
    </span>
  )
}
```

- [ ] **Step 7: Verify typecheck + the status-pill test still pass; commit**

```bash
cd /Users/shebinchaliyath/Developer/Redeemo/apps/merchant-web && npm run typecheck && npx jest components/shell/__tests__/status-pill.test.tsx
cd /Users/shebinchaliyath/Developer/Redeemo
git add apps/merchant-web/components/ui/badge.tsx apps/merchant-web/components/ui/chip.tsx apps/merchant-web/components/shell/StatusPill.tsx apps/merchant-web/components/shell/__tests__/status-pill.test.tsx
git commit -m "feat(merchant-web): Badge, voucher-type Chip, 7-state StatusPill"
```

---

### Task 6: Popover + Table shell

**Files:**
- Create: `apps/merchant-web/components/ui/popover.tsx`, `apps/merchant-web/components/ui/table.tsx`

- [ ] **Step 1: Create `apps/merchant-web/components/ui/popover.tsx`** (radix popover wrapper, the chrome-menu primitive; navy-tinted shadow + entrance)

```tsx
'use client'
import * as React from 'react'
import { Popover as RadixPopover } from 'radix-ui'
import { cn } from '@/lib/utils'

export const Popover = RadixPopover.Root
export const PopoverTrigger = RadixPopover.Trigger

export function PopoverContent({
  className, align = 'end', sideOffset = 8, ...props
}: React.ComponentProps<typeof RadixPopover.Content>) {
  return (
    <RadixPopover.Portal>
      <RadixPopover.Content
        align={align}
        sideOffset={sideOffset}
        className={cn(
          'z-50 rounded-[18px] border border-border bg-popover p-2 text-popover-foreground',
          'shadow-[0_24px_60px_-24px_rgba(1,12,53,0.4)] outline-none',
          className
        )}
        {...props}
      />
    </RadixPopover.Portal>
  )
}
```
(If the unified `radix-ui` package does not export `Popover`, install is already present; verify the named export at build. The admin-web `NotificationBell` uses `radix-ui` Popover, so the export exists in this dependency.)

- [ ] **Step 2: Create `apps/merchant-web/components/ui/table.tsx`** (shell only: header / rows / empty-state slot, no data)

```tsx
import * as React from 'react'
import { cn } from '@/lib/utils'

export function Table({ className, ...props }: React.ComponentProps<'table'>) {
  return <table className={cn('w-full border-collapse text-sm', className)} {...props} />
}
export function THead({ className, ...props }: React.ComponentProps<'thead'>) {
  return <thead className={cn('text-left text-[12px] font-extrabold uppercase tracking-wide text-[#8089A4]', className)} {...props} />
}
export function TBody(props: React.ComponentProps<'tbody'>) { return <tbody {...props} /> }
export function TR({ className, ...props }: React.ComponentProps<'tr'>) {
  return <tr className={cn('border-b border-border', className)} {...props} />
}
export function TH({ className, ...props }: React.ComponentProps<'th'>) {
  return <th className={cn('px-3 py-2', className)} {...props} />
}
export function TD({ className, ...props }: React.ComponentProps<'td'>) {
  return <td className={cn('px-3 py-3', className)} {...props} />
}
export function TableEmpty({ children }: { children: React.ReactNode }) {
  return <div className="px-3 py-10 text-center text-sm text-muted-foreground">{children}</div>
}
```

- [ ] **Step 3: Verify typecheck + build; commit**

```bash
cd /Users/shebinchaliyath/Developer/Redeemo/apps/merchant-web && npm run typecheck && NEXT_PUBLIC_API_URL=http://localhost:3000 npm run build
cd /Users/shebinchaliyath/Developer/Redeemo
git add apps/merchant-web/components/ui/popover.tsx apps/merchant-web/components/ui/table.tsx
git commit -m "feat(merchant-web): Popover (chrome-menu primitive) + Table shell"
```

---

### Task 7: navItems + Sidebar (TDD)

**Files:**
- Create: `apps/merchant-web/components/shell/navItems.ts`, `apps/merchant-web/components/shell/Sidebar.tsx`
- Test: `apps/merchant-web/components/shell/__tests__/sidebar.test.tsx`

- [ ] **Step 1: Create `apps/merchant-web/components/shell/navItems.ts`** (static IA; exact labels + grouping + Soon flags)

```ts
import { Home, Ticket, ScanLine, BarChart3, MapPin, Users, Building2, Megaphone, CreditCard, Settings, LifeBuoy } from '@/lib/icons'
import type { ComponentType } from 'react'

export interface NavItem { label: string; href: string; icon: ComponentType<{ size?: number }>; soon?: boolean }
export interface NavGroup { title?: string; tag?: string; items: NavItem[] }

/** Static IA for M0. Items render but do not route or gate (no auth/capability). */
export const HOME_ITEM: NavItem = { label: 'Home', href: '/', icon: Home }

export const NAV_GROUPS: NavGroup[] = [
  {
    title: 'Vouchers & customers',
    items: [
      { label: 'Vouchers', href: '#', icon: Ticket },
      { label: 'Redemptions', href: '#', icon: ScanLine },
      { label: 'Insights & reports', href: '#', icon: BarChart3 },
    ],
  },
  {
    title: 'Locations & team',
    items: [
      { label: 'Branches', href: '#', icon: MapPin },
      { label: 'Staff & access', href: '#', icon: Users },
    ],
  },
  {
    // Documents is folded into Business profile (findings 2AH): no standalone item.
    title: 'Business',
    items: [{ label: 'Business profile', href: '#', icon: Building2 }],
  },
  {
    title: 'Grow your business',
    tag: 'Coming soon',
    items: [
      { label: 'Promote', href: '#', icon: Megaphone, soon: true },
      { label: 'Payments & billing', href: '#', icon: CreditCard, soon: true },
    ],
  },
]

export const PINNED_ITEMS: NavItem[] = [
  { label: 'My account', href: '#', icon: Settings },
  { label: 'Help & support', href: '#', icon: LifeBuoy },
]
```

- [ ] **Step 2: Write the failing Sidebar test**

```tsx
import { render, screen } from '@testing-library/react'
import { Sidebar } from '../Sidebar'

describe('Sidebar', () => {
  it('renders the brand lockup, Home, the four nav groups, and pinned items', () => {
    render(<Sidebar />)
    expect(screen.getByText('Redeemo')).toBeInTheDocument()
    expect(screen.getByText('for Business')).toBeInTheDocument()
    expect(screen.getByText('Home')).toBeInTheDocument()
    for (const label of ['Vouchers & customers', 'Locations & team', 'Business', 'Grow your business']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
    expect(screen.getByText('My account')).toBeInTheDocument()
    expect(screen.getByText('Help & support')).toBeInTheDocument()
  })

  it('shows the "Coming soon" tag + a Soon badge on the Grow group', () => {
    render(<Sidebar />)
    expect(screen.getByText('Coming soon')).toBeInTheDocument()
    expect(screen.getAllByText('Soon').length).toBeGreaterThanOrEqual(2)
  })

  it('does NOT render the Documents nav item (folded into Business profile)', () => {
    render(<Sidebar />)
    expect(screen.queryByText('Documents')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Run to verify it fails**

Run: `cd apps/merchant-web && npx jest components/shell/__tests__/sidebar.test.tsx`
Expected: FAIL (cannot resolve `../Sidebar`).

- [ ] **Step 4: Create `apps/merchant-web/components/shell/Sidebar.tsx`** (lockup + StatusPill + grouped static nav + pinned; active/inactive/Soon treatments)

```tsx
import * as React from 'react'
import Image from 'next/image'
import { StatusPill, type LifecycleState } from './StatusPill'
import { HOME_ITEM, NAV_GROUPS, PINNED_ITEMS, type NavItem } from './navItems'

function NavRow({ item, active = false }: { item: NavItem; active?: boolean }) {
  const Icon = item.icon
  return (
    <a
      href={item.href}
      aria-current={active ? 'page' : undefined}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '9px 12px',
        borderRadius: 10, textDecoration: 'none',
        fontWeight: active ? 700 : 500,
        color: item.soon ? '#6B7390' : active ? '#010C35' : '#455373',
        background: active ? '#FEF6F5' : 'transparent',
        boxShadow: active ? 'inset 3px 0 0 #010C35' : undefined,
        fontSize: 14,
      }}
    >
      <Icon size={18} />
      <span style={{ flex: 1 }}>{item.label}</span>
      {item.soon && (
        <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: '#6B7390', border: '1px solid #E5E7EB', borderRadius: 999, padding: '1px 6px' }}>Soon</span>
      )}
    </a>
  )
}

/** Left sidebar. M0: static nav (no routing, no capability gating). */
export function Sidebar({ status = 'setup' as LifecycleState }: { status?: LifecycleState }) {
  return (
    <nav aria-label="Primary" style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '18px 14px', height: '100%' }}>
      {/* Brand lockup */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 6px' }}>
        <Image src="/redeemo-r-mark.png" alt="Redeemo" width={34} height={34} />
        <div style={{ lineHeight: 1.1 }}>
          <div style={{ fontFamily: 'var(--font-body)', fontWeight: 800, fontSize: 15, color: '#010C35' }}>Redeemo</div>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: '#6B7390' }}>for Business</div>
        </div>
      </div>

      <div style={{ padding: '0 6px' }}><StatusPill state={status} /></div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <NavRow item={HOME_ITEM} />
      </div>

      {NAV_GROUPS.map((group) => (
        <div key={group.title} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px' }}>
            <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: '#8089A4' }}>{group.title}</span>
            {group.tag && (
              <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', color: '#6B7390', background: '#F3F4F6', borderRadius: 999, padding: '1px 6px' }}>{group.tag}</span>
            )}
          </div>
          {group.items.map((item) => <NavRow key={item.label} item={item} />)}
        </div>
      ))}

      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 2, paddingTop: 12, borderTop: '1px solid #EEF1F4' }}>
        {PINNED_ITEMS.map((item) => <NavRow key={item.label} item={item} />)}
      </div>
    </nav>
  )
}
```
(If `next/image` with a static `public/` png needs no remotePattern: local public assets are always allowed. The `<Image>` width/height are explicit, so no layout shift.)

- [ ] **Step 5: Run to verify it passes**

Run: `cd apps/merchant-web && npx jest components/shell/__tests__/sidebar.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/merchant-web/components/shell/navItems.ts apps/merchant-web/components/shell/Sidebar.tsx apps/merchant-web/components/shell/__tests__/sidebar.test.tsx
git commit -m "feat(merchant-web): static IA navItems + Sidebar (lockup, status pill, grouped nav, pinned)"
```

---

### Task 8: Topbar (placeholder slots; TDD)

**Files:**
- Create: `apps/merchant-web/components/shell/Topbar.tsx`
- Test: `apps/merchant-web/components/shell/__tests__/topbar.test.tsx`

- [ ] **Step 1: Write the failing test** (slots present; the prototype-only controls ABSENT)

```tsx
import { render, screen } from '@testing-library/react'
import { Topbar } from '../Topbar'

describe('Topbar', () => {
  it('renders the Validate-a-code CTA and the icon slots', () => {
    render(<Topbar onMenu={() => {}} />)
    expect(screen.getByRole('button', { name: /validate a code/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /quick actions/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /notifications/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /account/i })).toBeInTheDocument()
  })

  it('does NOT render the prototype-only View-as or Demo controls', () => {
    render(<Topbar onMenu={() => {}} />)
    expect(screen.queryByText(/view as/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/^demo/i)).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/merchant-web && npx jest components/shell/__tests__/topbar.test.tsx`
Expected: FAIL (cannot resolve `../Topbar`).

- [ ] **Step 3: Create `apps/merchant-web/components/shell/Topbar.tsx`** (38px icon buttons; navy CTA; NO view-as/demo; menus are non-functional placeholders in M0)

```tsx
'use client'
import * as React from 'react'
import { Menu, ScanLine, Grid3x3, Bell } from '@/lib/icons'
import { Button } from '@/components/ui/button'

function IconButton({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      style={{ width: 38, height: 38, borderRadius: 10, border: '1px solid #E5E7EB', background: '#fff', color: '#455373', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
    >
      {children}
    </button>
  )
}

/**
 * Top bar. M0 renders placeholder slots only (no behaviour): Validate-a-code CTA,
 * quick actions, notifications bell, account avatar. The prototype-only View-as and
 * Demo switchers are intentionally NOT built (spec exclusion).
 */
export function Topbar({ onMenu }: { onMenu: () => void }) {
  return (
    <header
      style={{
        position: 'sticky', top: 0, zIndex: 40, height: 64,
        display: 'flex', alignItems: 'center', gap: 12, padding: '0 24px',
        background: 'rgba(255,255,255,0.86)', backdropFilter: 'saturate(160%) blur(8px)',
        borderBottom: '1px solid #EEF1F4',
      }}
    >
      <button type="button" aria-label="Toggle navigation" onClick={onMenu} style={{ width: 38, height: 38, borderRadius: 10, border: '1px solid #E5E7EB', background: '#fff', color: '#455373', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
        <Menu size={18} />
      </button>
      <div style={{ flex: 1 }} />
      <Button variant="navy" size="default"><ScanLine size={16} /> Validate a code</Button>
      <IconButton label="Quick actions"><Grid3x3 size={18} /></IconButton>
      <IconButton label="Notifications"><Bell size={18} /></IconButton>
      <button type="button" aria-label="Account menu" style={{ width: 38, height: 38, borderRadius: 999, border: '1px solid #E5E7EB', background: '#FEF0EE', color: '#E20C04', fontWeight: 800, fontSize: 13 }}>R</button>
    </header>
  )
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/merchant-web && npx jest components/shell/__tests__/topbar.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/merchant-web/components/shell/Topbar.tsx apps/merchant-web/components/shell/__tests__/topbar.test.tsx
git commit -m "feat(merchant-web): Topbar placeholder slots (no view-as/demo controls)"
```

---

### Task 9: MerchantPortalShell + responsive + wire into (app) layout (TDD)

**Files:**
- Create: `apps/merchant-web/components/shell/MerchantPortalShell.tsx`
- Modify: `apps/merchant-web/app/(app)/layout.tsx` (replace the Task-2 temporary)
- Test: `apps/merchant-web/components/shell/__tests__/shell.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react'
import { MerchantPortalShell } from '../MerchantPortalShell'

describe('MerchantPortalShell', () => {
  it('renders the sidebar nav, the top bar, and its children', () => {
    render(<MerchantPortalShell><p>page content</p></MerchantPortalShell>)
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /validate a code/i })).toBeInTheDocument()
    expect(screen.getByText('page content')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/merchant-web && npx jest components/shell/__tests__/shell.test.tsx`
Expected: FAIL (cannot resolve `../MerchantPortalShell`).

- [ ] **Step 3: Create `apps/merchant-web/components/shell/MerchantPortalShell.tsx`** (two-column layout; responsive drawer < 820 + collapse toggle; verified dims)

```tsx
'use client'
import * as React from 'react'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'

const NARROW = 820

export function MerchantPortalShell({ children }: { children: React.ReactNode }) {
  const [drawerOpen, setDrawerOpen] = React.useState(false)
  const [isNarrow, setIsNarrow] = React.useState(false)

  React.useEffect(() => {
    const onResize = () => setIsNarrow(window.innerWidth < NARROW)
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const showDrawer = isNarrow && drawerOpen

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#fff' }}>
      {/* Sidebar: fixed drawer on narrow, static column on wide */}
      <aside
        style={
          isNarrow
            ? { position: 'fixed', top: 0, left: 0, bottom: 0, width: 282, zIndex: 60, background: '#fff', borderRight: '1px solid #EEF1F4', transform: showDrawer ? 'translateX(0)' : 'translateX(-100%)', transition: 'transform .2s ease' }
            : { width: 262, flexShrink: 0, borderRight: '1px solid #EEF1F4', background: '#fff' }
        }
      >
        <Sidebar />
      </aside>

      {showDrawer && (
        <div onClick={() => setDrawerOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(1,12,53,0.38)' }} />
      )}

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <Topbar onMenu={() => (isNarrow ? setDrawerOpen((v) => !v) : undefined)} />
        <main style={{ flex: 1, padding: isNarrow ? '20px 16px 88px' : '30px 40px 64px' }}>
          <div style={{ maxWidth: 1180, margin: '0 auto' }}>{children}</div>
        </main>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Replace `apps/merchant-web/app/(app)/layout.tsx`** with the shell

```tsx
import { MerchantPortalShell } from '@/components/shell/MerchantPortalShell'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <MerchantPortalShell>{children}</MerchantPortalShell>
}
```

- [ ] **Step 5: Run to verify the shell test passes + build**

Run: `cd apps/merchant-web && npx jest components/shell/__tests__/shell.test.tsx && NEXT_PUBLIC_API_URL=http://localhost:3000 npm run build`
Expected: PASS + build exit 0.

- [ ] **Step 6: Commit**

```bash
git add apps/merchant-web/components/shell/MerchantPortalShell.tsx "apps/merchant-web/app/(app)/layout.tsx" apps/merchant-web/components/shell/__tests__/shell.test.tsx
git commit -m "feat(merchant-web): MerchantPortalShell (two-column + responsive drawer) wired into (app) layout"
```

---

### Task 10: `/foundations` brand-QA page (TDD)

**Files:**
- Create: `apps/merchant-web/app/(app)/foundations/page.tsx`
- Test: `apps/merchant-web/app/(app)/foundations/__tests__/page.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react'
import FoundationsPage from '../page'

describe('Foundations page', () => {
  it('renders all 7 status-pill states and the button variants', () => {
    render(<FoundationsPage />)
    expect(screen.getByRole('heading', { name: /foundations/i })).toBeInTheDocument()
    for (const label of ['Setting up', 'Submitted', 'In review', 'Changes needed', 'Live', 'Live, just started', 'Suspended']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
    expect(screen.getByRole('button', { name: /^save voucher$/i })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/merchant-web && npx jest "app/(app)/foundations/__tests__/page.test.tsx"`
Expected: FAIL (cannot resolve `../page`).

- [ ] **Step 3: Create `apps/merchant-web/app/(app)/foundations/page.tsx`** (internal brand-QA surface: tokens, type scale, primitives, 7 status pills, 7 chips)

```tsx
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Chip, type VoucherType } from '@/components/ui/chip'
import { StatusPill, type LifecycleState } from '@/components/shell/StatusPill'

export const metadata = { robots: { index: false, follow: false } }

const STATES: LifecycleState[] = ['setup', 'submitted', 'in_review', 'changes', 'live', 'live_new', 'suspended']
const TYPES: VoucherType[] = ['bogo', 'discount', 'freebie', 'spendsave', 'package', 'timelimited', 'reusable']

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 32 }}>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 18, marginBottom: 12 }}>{title}</h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>{children}</div>
    </section>
  )
}

export default function FoundationsPage() {
  return (
    <div>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, marginBottom: 24 }}>Foundations</h1>
      <Section title="Buttons">
        <Button variant="gradient">Save voucher</Button>
        <Button variant="navy">Validate a code</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="destructive">Delete</Button>
      </Section>
      <Section title="Status pills">
        {STATES.map((s) => <StatusPill key={s} state={s} />)}
      </Section>
      <Section title="Voucher-type chips">
        {TYPES.map((t) => <Chip key={t} type={t}>{t}</Chip>)}
      </Section>
      <Section title="Badges">
        <Badge variant="neutral">Neutral</Badge>
        <Badge variant="caution">Caution</Badge>
        <Badge variant="restrictive">Restrictive</Badge>
      </Section>
    </div>
  )
}
```

- [ ] **Step 4: Run to verify it passes + build**

Run: `cd apps/merchant-web && npx jest "app/(app)/foundations/__tests__/page.test.tsx" && NEXT_PUBLIC_API_URL=http://localhost:3000 npm run build`
Expected: PASS + build exit 0 (build lists `/foundations`).

- [ ] **Step 5: Commit**

```bash
git add "apps/merchant-web/app/(app)/foundations"
git commit -m "feat(merchant-web): internal /foundations brand-QA page"
```

---

### Task 11: CI workflow (merchant-web job)

**Files:**
- Modify: `.github/workflows/ci.yml` (add a `merchant-web` job after the `admin-web` job, before `backend`)

- [ ] **Step 1: Insert the `merchant-web` job** (mirror of the admin-web job, lines 67-112; same gates: typecheck + lint + build + test + advisory audit). Add this block immediately after the `admin-web` job's last line and before `  backend:`

```yaml
  merchant-web:
    name: merchant-web (typecheck / lint / build / test)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up Node
        uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc # repo-level source of truth (root .nvmrc)
          cache: npm

      - name: Install (root install, hoists workspaces)
        run: npm ci

      - name: Typecheck (merchant-web)
        working-directory: apps/merchant-web
        run: npm run typecheck

      - name: Lint (merchant-web)
        working-directory: apps/merchant-web
        run: npm run lint

      - name: Build (merchant-web)
        working-directory: apps/merchant-web
        env:
          NEXT_PUBLIC_API_URL: http://localhost:3000
        run: npm run build

      - name: Test (merchant-web)
        working-directory: apps/merchant-web
        run: npm test

      - name: Dependency audit (advisory, merchant-web high+)
        if: ${{ always() }}
        continue-on-error: true
        run: npm audit --workspace=@redeemo/merchant-web --audit-level=high
```

- [ ] **Step 2: Validate the YAML locally** (no live CI run needed)

```bash
cd /Users/shebinchaliyath/Developer/Redeemo
node -e "const yaml=require('apps/admin-web/node_modules/yaml')||null" 2>/dev/null; python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/ci.yml')); print('ci.yml valid YAML')"
```
Expected: `ci.yml valid YAML` (and the file now has 4 jobs: customer-web, admin-web, merchant-web, backend).

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add merchant-web job (typecheck / lint / build / test)"
```

---

### Task 12: Final verification + scope guard

**Files:** none (verification only)

- [ ] **Step 1: Full local verification (the M0 gate)**

```bash
cd /Users/shebinchaliyath/Developer/Redeemo/apps/merchant-web
npm run typecheck
npm run lint
NEXT_PUBLIC_API_URL=http://localhost:3000 npm run build
npm test
```
Expected: typecheck exit 0; lint exit 0; build exit 0 (routes `/` and `/foundations`); jest green (Button, StatusPill, Badge/Chip implicitly, Sidebar, Topbar, Shell, Foundations suites all pass, 0 failures).

- [ ] **Step 2: Scope-guard diff** (the implementation PR must touch only the three allowed areas)

```bash
cd /Users/shebinchaliyath/Developer/Redeemo
git diff --stat origin/main -- . ':(exclude)apps/merchant-web' ':(exclude).github/workflows/ci.yml' ':(exclude)package-lock.json'
```
Expected: EMPTY output (no changes outside `apps/merchant-web/**`, the one CI job, and the root lockfile). If anything else appears, STOP and remove it.

- [ ] **Step 3: Confirm no forbidden content crept in** (closed-scope check)

```bash
cd /Users/shebinchaliyath/Developer/Redeemo/apps/merchant-web
grep -rIl --include='*.ts' --include='*.tsx' -E 'apiFetch|SessionProvider|useSession|prisma|/api/v1/|fetch\(' . || echo "clean: no auth/api/data wiring"
grep -rIn -P '[\x{2014}\x{2013}]' app components lib || echo "clean: no em/en dashes"
```
Expected: "clean: no auth/api/data wiring" + "clean: no em/en dashes". (No SessionProvider, no api clients, no data fetching, no Prisma, no product-surface API calls.)

- [ ] **Step 4: Manual visual QA (owner)** Run `npm run dev` (port 3003), open `http://localhost:3003/foundations` and `http://localhost:3003/`, and confirm: brand fonts render (Mustica headings, Lato body), the gradient primary button shows the glow, the 7 status pills + 7 chips render with correct colours, the sidebar shows the exact IA with the Coming-soon Grow group, and the layout collapses to a drawer below 820px. (Acceptance criterion 8 in the spec.)

- [ ] **Step 5: No commit** (verification only). The branch is ready for the M0 implementation PR (PR sequencing step 3).

---

## Test plan (summary)

| Suite | Asserts |
|---|---|
| `button.test.tsx` | gradient variant carries the brand-red gradient; navy/secondary/ghost/destructive variants resolve |
| `status-pill.test.tsx` | all 7 lifecycle states render their label; default is `setup` |
| `sidebar.test.tsx` | lockup + Home + 4 group titles + pinned items; Coming-soon tag + Soon badges; NO Documents item |
| `topbar.test.tsx` | Validate/quick/bell/account slots present; NO View-as / Demo controls |
| `shell.test.tsx` | sidebar nav + top bar + children all render |
| `foundations/page.test.tsx` | 7 status pills + button variants render on the QA page |

All tests are jsdom + RTL via `next/jest`, no network/DB. The CI `merchant-web` job runs typecheck + lint + `next build` + `npm test`.

## Local verification commands

```bash
cd apps/merchant-web
npm run typecheck
npm run lint
NEXT_PUBLIC_API_URL=http://localhost:3000 npm run build
npm test
npm run dev    # then open http://localhost:3003/foundations for visual QA
```

## Scope guard

The M0 implementation diff is confined to: `apps/merchant-web/**`, `.github/workflows/ci.yml` (one added job), and root `package-lock.json`. Task 12 Step 2 enforces this with a `git diff --stat origin/main` exclusion check that must be empty. No backend, Prisma, schema, migration, other-app, or docs changes.

## Risks and stop-and-report items

- **Lockfile change (Task 1 Step 4):** review the `package-lock.json` diff before staging; expect only the new workspace + dep hoist. STOP-AND-REPORT if anything unexpected appears.
- **Brand-vs-shadcn friction:** the stock primitives (card/input/label/dialog) inherit the brand via the `@theme inline` bridge; the `/foundations` page is the visual check that the bridge is correct.
- **`radix-ui` Popover export:** the unified `radix-ui` package is used by admin-web's NotificationBell, so `Popover` exists; verify at build (Task 6).
- **`lucide-react ^1.8.0` + `radix-ui ^1.5.0`:** mirrored from admin-web verbatim, not bumped (consistency + CI-green). Do not change versions in M0.
- **Port 3003:** assumed free (3000/3001/3002 taken). Confirm at `npm run dev`.
- **Docs-vs-main sequencing:** see the PR Sequencing section. Land docs on main first; branch the implementation off updated main; keep the code PR docs-free.
- **No backend/schema/migration touched:** guaranteed by scope; all product-level stop-and-report items (spec Appendix B) belong to later milestones and are not actioned here.

## Rollback / safety notes

- Every task ends in its own commit, so any task can be reverted independently (`git revert <sha>`).
- The entire M0 is additive: a new workspace + one CI job + a lockfile update. To abandon M0 entirely, delete `apps/merchant-web/`, revert the `ci.yml` job, and `npm install` to restore the lockfile. No existing app, backend, or schema is modified, so there is no migration or data rollback.
- The branch is not merged until the owner approves the rendered shell (acceptance criterion 8). No PR is opened by this plan.

## Explicit closed-scope exclusions (M0 does NOT build)

Auth / OTP / forgot-reset / claim / self-serve registration / SessionProvider / token storage / capability mirror / route guard / middleware; any `lib/api/*` client, React Query data hook, `apiFetch`, or real data fetching; any backend, Prisma, schema, or migration; every product surface (onboarding, voucher builder/management, redemptions/validate, branches, staff & access, business profile, documents, insights/analytics, notifications/bell wiring, settings, help); chart components (M5); the prototype-only View-as lens and Demo lifecycle switcher; the DesignSync `.dc.html` import; a shared `packages/tokens`. If a small additional scaffold/foundation step proves necessary for M0 coherence (e.g. a Skeleton primitive or a focus-visible token), it may be added with a one-line rationale, but none of the above may be.

---

## Self-review notes

- **Spec coverage:** §4 scope -> Tasks 1-11; §5 exclusions -> the closed-scope section + Task 12 Step 3 grep guard; §7 brand strategy -> Task 2 globals.css; §8 shell/nav -> Tasks 7-9; §9 primitives -> Tasks 3-6; §10 responsive -> Task 9; §12 test/CI -> Tasks 4-12 + the CI job; §13 risks -> Risks section; §14 acceptance -> Task 12 + visual QA; §15 cross-check -> honoured throughout. Appendix A/B are reference-only and intentionally not implemented.
- **Placeholder scan:** every code step contains complete, runnable content; copy-verbatim steps name exact source + destination paths.
- **Type consistency:** `LifecycleState` / `VoucherType` are defined once (StatusPill / Chip) and imported by the foundations page and tests; `NavItem` / `NavGroup` defined in `navItems.ts` and consumed by Sidebar; `Button` variant names (`gradient`/`navy`/`secondary`/`ghost`/`destructive`) are consistent across button.tsx, its test, Topbar, and the foundations page.
