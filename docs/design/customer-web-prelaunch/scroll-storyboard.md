# Landing Page Scroll Narrative · Storyboard & Structure (v2, for owner review)

2026-07-06 · Fable. Status: PROPOSED, not implemented. v2 folds in owner refinements:
conversion/psychology-first narrative, colour rebalance (navy is secondary, not the
face of Redeemo), real-app-UI video (no generic icon-phones), Huddersfield-first
rollout signal without a dedicated section. Customer side first; merchant video later.

## 0. Colour doctrine (rebalance)

Redeemo's face is the warm rose-to-coral gradient on warm ground; navy is structure,
not identity. Practically:
- Grounds: cream `#FFF9F5` and white carry the page. The HERO MOVES OFF NAVY to warm
  cream: navy type, gradient accent, warm light. This also kills the dark-SaaS-hero
  cliche.
- Navy full-bleed: exactly TWO moments: the Redeem beat (night-at-the-till cinema,
  where darkness means something) and the footer. Everything else warm.
- Gradient: never a wallpaper. CTA buttons, one accented headline word per section
  max, small marks, and the light accents inside video. Scarcity keeps it potent.

## 1. Conversion narrative (top to bottom)

Psychological throughline: Maya's three fears are quality doubt ("better-looking
Groupon?"), hidden catches, and counter embarrassment. The story answers them in
order, shows rather than claims, then asks. Merchants get a sharpened fork, not a
subplot.

| # | Beat | Ground | Job (psychology) | Content |
|---|------|--------|------------------|---------|
| 1 | Hook | Cream + warm video | Instant comprehension + identity ("smart, local, quality"). Real app visible in first second: product proof, not promise | H1 + sub + CTA "Get early access" + rollout badge: "Launching first in Huddersfield · rolling out across the UK" (pill by the eyebrow, not a section) |
| 2 | Find | Cream, video continues | Quality fear answered: curation, real places, the map moment | Real app UI journey: home feed -> categories -> map with pins -> merchant profile |
| 3 | Choose | White | Tangible value, no-catches: terms visible on real voucher UI; all 7 types as a card deck | Voucher deck around real voucher-detail screen |
| 4 | Redeem | NAVY (the one dark act) | Embarrassment fear answered: 2 seconds at the till, staff-confirmed, done | Code moment (code-rendered UI; ambient video glow) |
| 5 | The maths | Cream | Rational permission after emotional buy-in | One voucher > £6.99 = month paid for itself. Arithmetic, no invented stats |
| 6 | The standard | White (navy type) | Trust: we launch properly, city by city | Chosen places + honest terms + one rollout line ("Huddersfield first. Then city by city.") |
| 7 | Pricing | Cream | Clarity, zero surprises | 3 plans, facts unchanged |
| 8 | Waitlist | White card on cream | The ask. Postcode now has a REASON: "Tell us your postcode and you're first when we reach your area" (UK-wide capture, Huddersfield-first honest) | Email + postcode + incentive line |
| 9 | Merchant fork | Gradient band | Merchant hook: founding visibility ("Own a place in Huddersfield? Launch with us, day one") + UK interest welcome | Route to /for-businesses |
| 10 | Footer | Navy (moment two) | Close: app arrives with launch | Waitlist echo |

Beats 1-4 are the single pinned cinematic sequence (video + real UI scrubbed by
scroll, phone persistent). Beats 5-10 scroll normally and stay calm: motion persuades
up top, stillness converts below. Persistent nav CTA. Reduced-motion/mobile v1:
posters + static sections.

## 2. Video plan v2: the real app is the star

Owner direction: customers must see the actual app (layout, structure, feel), with
made-up merchants; no generic icon-phones. So:

- A-ROLL (carries the story): the owner's real customer-app screenshots (fictional
  seeded merchants) animated in Higgsfield (image-to-video: slow push-ins, screen-to-
  screen transitions, parallax cards, cursor/thumb-path suggestion) so the UI feels
  alive, not standstill.
- B-ROLL (connective tissue only): brand 3D atmosphere in the REBALANCED palette:
  warm cream light, rose-coral accents; navy reserved for the Redeem beat's backdrop.
- The redemption-code screen stays code-rendered on the website (the app blocks
  capture on code surfaces by design; our synthetic render is also always crisp).

Clip map: C1 hero warm drift (B-roll, cream/coral) · C2 find-journey (A-roll: feed ->
map -> profile) · C3 voucher deck (A-roll voucher detail + 3D type-cards) · C4 redeem
glow (B-roll navy + code-rendered UI on top).

## 3. Owner capture session: exact steps

Terminal (two tabs):

```bash
# Tab 1: backend API (repo root)
cd ~/Developer/Redeemo && npm run dev

# Tab 2: customer app (Node 20.19.4 via fnm, then Expo)
cd ~/Developer/Redeemo/apps/customer-app && fnm use && npx expo start
```

Phone: install "Expo Go" (App Store), same Wi-Fi as the Mac, scan the QR from Tab 2.
Log in as customer@redeemo.com / Customer1234!. If anything refuses to load, tell me
the error and I'll sort it from here.

SHOT LIST (portrait screenshots; the seeded merchants are fictional and safe):
1. Home feed (greeting, category rail, nearby tiles)
2. All-categories screen
3. Map view with pins (zoomed so pins cluster nicely)
4. Search results for "coffee"
5. Merchant profile: The Old Foundry Kitchen (hero + voucher list)
6. Merchant profile: Laneway Coffee Roasters
7. Voucher detail: a BOGO, pre-redemption state
8. Voucher detail: a Freebie
9. Favourites (heart 2-3 places first)
10. Savings screen
AVOID: the redemption code / show-to-staff screen (capture-protected and not needed),
any account/profile screen with your email, notification screens.

Drop them anywhere convenient (e.g. a Desktop folder "Customer App Screenshots") and
tell me; I vet every image for names/addresses/PII before anything goes to Higgsfield.

## 4. Reference kit for Higgsfield upload (owner approval)

1. Vetted real-app screenshots from §3 (fictional merchants only).
2. Our code-rendered stills (browse / voucher / code) as backup and for the code beat.
3. 2-4 of the app's 3D category card assets as style anchors.
4. Palette + art direction text (per §0: warm-first, navy only for the redeem beat).
NOT uploaded: source code, live/staging data, portal captures (merchant video is a
later phase), secrets, PII, owner account details.

## 5. Production sequence and cost gates (unchanged)

Owner `higgsfield auth login` -> Fable checks credits + quotes costs -> Phase 1 stills
(D4 ceiling approval) -> owner picks -> Phase 2 clips -> Phase 3 scroll integration
build (separate approval, per step-by-step instruction).

## 6. Decisions folded in / still open

- D3 RESOLVED (owner, 2026-07-06): Huddersfield first, rolling out across the UK;
  expressed as a hero pill + one line in the standard beat + waitlist postcode
  framing. No dedicated section.
- Structure sign-off on §1 (or reorder).
- Reference kit sign-off on §4.
- D4 budget ceiling once numbers are quoted post-login.
