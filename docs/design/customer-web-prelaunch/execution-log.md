# Pre-Launch Website Workstream · Execution Log (Claude-owned)

Owner-readable running log for the 2026-07-06 pre-launch website and conversion
workstream. Plan: `docs/superpowers/plans/2026-07-06-prelaunch-website-conversion-rebaseline.md`.
This file is Claude-owned; it is NOT a Codex checklist and Codex checklists are not
edited by this workstream.

## 2026-07-06

- Workstream opened on direct owner instruction. Governance note: the open-register row
  "Pre-launch website redesign · GATED: owner sequencing 2026-06-09 (after Merchant
  Portal + Admin)" is treated as re-sequenced by the owner's 2026-07-06 brief for this
  workstream's scope. Recorded here rather than silently overridden; register update
  rides with PR-A.
- Discovery complete (3 parallel inventories: site implementation, brand/design assets,
  programme constraints). Key verified findings: `/for-businesses` CTAs 404 to
  `/contact`; no waitlist or MerchantLead exists anywhere (design-only); app badges
  decorative; "200+ merchants" + 2026-dated testimonials are pre-launch honesty
  liabilities; whileInView sections render blank without scroll; no
  prefers-reduced-motion handling; no analytics (PECR clean); legal pages remain the
  owner/legal hard launch gate (untouched).
- Owner voice note folded in: keep two-audience IA; landing customer-first; pre-launch
  must teach the product and capture a waitlist (admin-manageable, with a membership
  incentive); pre-launch and launched site should be the same site with marketplace
  switched on. Matches the existing NEXT_PUBLIC_MARKETPLACE_LIVE architecture.
- Higgsfield: official guidance verified (higgsfield.ai/cli + /mcp): Claude Code should
  use the CLI, not the MCP endpoint. Installed `@higgsfield/cli` 1.1.5 globally after
  verifying npm package identity (higgsfield.ai homepage, higgsfield-ai/cli repo,
  @higgsfield.ai maintainers). NOT authenticated: owner must run `higgsfield auth login`
  (browser flow). No credits purchased, no generation run; budget = owner decision D4.
- Baseline screenshots captured (desktop + mobile, home / for-businesses / pricing /
  how-it-works) to session scratchpad for before/after comparison.
- Owner screenshot library rescanned (51 PNGs, 8 modules, all 2026-07-06): fully
  synthetic prototype data; usable for `/for-businesses` after chrome cropping +
  "Example data" labelling.
- Worktree `prelaunch-website` created; plan doc written; implementation starting with
  PR-A (customer surface).
- Implementation complete (single PR, both surfaces). Landing: hero rebuilt around a
  code-rendered app preview (real app fonts/voucher colours/3D category card art, synthetic
  example places, accessible step controls, reduced-motion safe); voucher-type section
  rebuilt in the app's 7-type colour language; how-it-works collapsed to 3 steps;
  testimonials replaced pre-launch by a founding-promise band (fake 2026-dated quotes and
  the unverified "200+ merchants" stat removed); pricing facts kept, CTAs launch-aware,
  invented "most members save more..." stat replaced with arithmetic framing; waitlist
  section built but flag-gated dark pending D1; app badges labelled "Coming at launch";
  Discover hidden from nav pre-launch; footer dead /contact link removed. For-businesses:
  portal showcase band added (2 cropped synthetic prototype screens, "example data"
  labels, browser frame); both dead /contact CTAs now anchor to a working
  register-interest section (mailto to merchants@redeemo.co.uk now; full form flag-gated
  pending D1). Site-wide MotionConfig reducedMotion="user". Verification: tsc clean,
  production build clean, 30/30 root guard tests green, desktop+mobile visual QA and
  interaction checks passed (step controls, anchors, mailto).
- Register row "Redesign" updated to IN PROGRESS citing the 2026-07-06 owner brief.
- Opus 4.8 adversarial review: 10 findings. Fixed: nav "Join free" pre-launch bypass
  (now "Get early access", launch-aware), auth-shell fake-scale claims ("2,000+",
  "Hundreds of businesses", unlabelled invented merchant) de-scaled, AA contrast on
  navy hero labels, phone-frame void (content centred + home indicator), inert-badge
  hover affordance removed, reduced-motion skip for the hero cursor glow, pricing CTA
  aria-labels. Adjudicated, not changed: middleware gate (auth-public is approved
  SEC-C3 design; routes already noindexed), portal prototype chrome (logged limitation,
  clean re-capture later). D1 flag-ordering warning added to the plan.
- PR #397 opened (draft, review-only).
- Owner direction (same evening): scroll-driven storytelling; "Every kind of voucher"
  and "Simple to join" sections too boxy/AI. Built ScrollStory: 340vh pinned stage,
  find/choose/redeem chapters, cream-white-navy background journey, phone screens per
  chapter, voucher-type colour cycle with wordmarks and progress dashes. Desktop only;
  static sections remain for mobile/reduced-motion/crawlers (owner-visible limitation:
  mobile story is a follow-up). Debugging note for posterity: scroll-linked stacked
  layers froze because Chrome promotes directly-bound scroll transforms to native
  ScrollTimeline animations and the promotion misbinds; routing every scroll-linked
  value through useSpring keeps them on the JS path (and softens crossfades). Verified
  by DOM probes at p=0.15/0.45/0.66/0.85 and screenshots; guard tests 30/30; tsc clean.
