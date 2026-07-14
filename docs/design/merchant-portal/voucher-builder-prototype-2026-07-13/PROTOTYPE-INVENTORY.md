# Voucher Builder Prototype — Structured Inventory

Source: `docs/design/merchant-portal/voucher-builder-prototype-2026-07-13/`
Prototype: Claude Design "Redeemo for Business" (2-page canvas: page 1 = onboarding/dashboard/vouchers list,
page 2 = the voucher builder covered here). Demo merchant throughout: "The Old Foundry Kitchen" (avatar "OF"),
demo category: "Food & Drink".

## 0. Method note (read first — affects how to trust this document)

`Redeemo-for-Business.dc.html` is **truncated at exactly 262,144 bytes (256 KiB)**, mid-attribute, inside the
Vouchers-list markup (the file ends on `...pa` cutting off a `padding:` value). It contains **no `<script>`
logic beyond a `<script src="./support.js">` include** (that file is not present in this folder) and **no
scoring/JS for the builder** — the "sc-if / sc-for / {{ }}" tags are template bindings interpreted by the
Claude Design canvas engine, not literal JS in this export. Consequently:

- Everything about the **voucher builder itself** (all 7 type screens, the scoring panel, the live preview,
  the terms checklists, scheduling UI) is reconstructed **entirely from the 22 timestamped screenshots**
  (`proto-01_21_55.png` through `proto-01_31_37.png`), not from source markup. Treat copy quoted below as
  verbatim-from-screenshot, not verbatim-from-source, though it is transcribed exactly as rendered.
- The HTML **does** independently corroborate the visual-system tokens (fonts, the red→coral CTA gradient,
  the cream `#FFF9F5` background) and the **Vouchers list page** that precedes the builder (flagship-voucher
  cards, "Create a voucher" button, filters row), which is used for §1 navigation context only.
- The 23rd image (`proto-screencapture-claude-ai-design-p-...-2026-06-25-22_31_28.png`) is a **different,
  older prototype capture** — merchant onboarding "Add your main branch" (setup step 4 of 6). It is not part
  of the voucher builder flow; noted here only so it isn't mistaken for a missing builder screen.
- No screenshot ever shows the score panel in its "Too weak" or "Great" states, the discount-type "fixed
  amount off" branch, the Freebie "No, it is free on its own" branch, the Package-deal "List the items" tab,
  the minimum-spend field expanded, or the Time-limited/Reusable preview's alternate tabs ("Later today",
  "Future day", "Used, now waiting"). These are flagged again in §7.

---

## 1. FLOW MAP

```
Merchant Portal → Vouchers (list page, in HTML source)
  header: "Vouchers" / "Manage the vouchers customers see and redeem."
  counts pill: "{portfolioTotal} vouchers · {liveTotal} live · {redsTotalLabel} redemptions"
  [Create a voucher] button (red→coral gradient, calls `openBuilder`) ──────────┐
  status filter row (5 filter chips, labels not in surviving markup)           │
  FLAGSHIP section: badge "Always live. Edits go through review, and they      │
    cannot be deleted." + "Required" pill per card (RMV-001/002)               │
  "Your custom vouchers" section, grouped by type, same card style             │
                                                                                 ▼
                                                              ┌───────────────────────────────┐
                                                              │  Create a voucher (type picker) │  proto-01_24_26.png
                                                              │  "< Back to vouchers"           │
                                                              └───────────────┬─────────────────┘
                    picks one of 7 types (left list) → right panel updates    │
                    with "What it is / How it works / For your business /     │
                    Best for / What customers see (static example card)" +   │
                    [Create this voucher →] + review-gate notice              │
                                                                                ▼
              ┌───────────────────────────────────────────────────────────────────────────┐
              │           Build your custom {Type} voucher   (per-type builder)             │
              │  top bar: "< Change voucher type" · [type icon] {Type} voucher ·             │
              │           "OF  The Old Foundry Kitchen" chip · [X] close                     │
              │  DEMO banner: "Preview suggestions as [Food & Drink ▾]"                       │
              │  Left column "You decide": type-specific fields → "What customers will see"  │
              │           → "Your terms" checklist → "Ask the Redeemo team" toggle →          │
              │           "Strong for you, fair for customers" trust card                     │
              │  Right column: "How this voucher stacks up" score panel (live) +              │
              │           "How customers see your voucher" live preview card                  │
              │  Footer: "This voucher goes to Redeemo for review before it goes live." ·      │
              │          [Save as draft]  [Submit for review]                                 │
              └───────────────────────────────────────────────────────────────────────────────┘
```

Screen-by-screen (chronological by screenshot timestamp; the session jumps between types to demo each one —
this is a designer walking the type picker, not a single linear merchant session):

| # | File | Screen / state |
|---|---|---|
| 1 | proto-01_21_55.png | Discount builder, top half — fields + score panel ("Good") + preview card |
| 2 | proto-01_22_23.png | Discount builder, scrolled — Photo/Title/Description/Estimated saving, full terms checklist, "Ask the Redeemo team" toggle, trust card begins |
| 3 | proto-01_23_06.png | BOGO builder, top half |
| 4 | proto-01_23_50.png | Freebie builder, scrolled — Photo/Title/Description/Estimated saving, full terms checklist, trust-card intro |
| 5 | proto-01_24_07.png | Freebie builder, top half (full field set) |
| 6 | proto-01_24_26.png | **Type picker** "Create a voucher" — all 7 types listed, Spend & Save detail shown |
| 7 | proto-01_24_44.png | Spend & Save builder, top half |
| 8 | proto-01_25_08.png | Spend & Save builder, scrolled to bottom — terms, trust card, **footer bar** (Save as draft / Submit for review) |
| 9 | proto-01_25_34.png | Package deal builder, top half |
| 10 | proto-01_25_45.png | Package deal builder, scrolled to bottom footer |
| 11 | proto-01_26_17.png | Time limited voucher, **Step 1** (no sub-type chosen yet) — preview shows empty state "Pick what runs first"; footer's Submit is disabled |
| 12 | proto-01_26_33.png | Time limited + Discount selected, Step 2 scheduling begins; preview gains "In window / Later today / Future day" tabs |
| 13 | proto-01_27_45.png | Time limited + Discount, full Step 2 (Window 1 editor), "Does this voucher end on a date?" off |
| 14 | proto-01_28_08.png | Time limited + Discount, scrolled further — What customers will see + terms checklist |
| 15 | proto-01_28_26.png | Time limited + BOGO selected, Step 1 top + preview |
| 16 | proto-01_28_51.png | Time limited + BOGO, end-date toggle **on** (date field revealed), terms checklist |
| 17 | proto-01_29_35.png | Time limited + Freebie selected |
| 18 | proto-01_29_57.png | Time limited + Freebie, scrolled — Step 2 scheduling + end-date toggle |
| 19 | proto-01_30_13.png | Time limited + Spend & Save selected |
| 20 | proto-01_30_39.png | Time limited + Package deal selected |
| 21 | proto-01_31_17.png | **Reusable voucher**, Step 1 (Discount selected) + Step 2 frequency picker |
| 22 | proto-01_31_37.png | Reusable voucher, scrolled — frequency confirmation, end-date toggle, What customers will see, terms checklist (copy shown here reflects a Spend & Save selection — see §7 discrepancy note) |

Navigation controls present on every builder screen:
- **"< Change voucher type"** (top-left) — returns to the type picker (screen in row 6).
- **"OF  The Old Foundry Kitchen"** chip (top-right) — merchant/business switcher context, not interactive in the demo.
- **"X"** (top-right) — closes the builder.
- **"Save as draft"** / **"Submit for review"** — footer, present on every fully-built type; "Submit for review" is disabled until a sub-type is chosen (seen in the Time-limited Step-1-only state).

---

## 2. PER-SCREEN INVENTORY

### 2.1 Type picker — "Create a voucher" (proto-01_24_26.png)

Header: **"Create a voucher"**
Subhead: *"Pick the type that fits what you want to do. Each one works a little differently, so here is what it is, how it works, and what it is best for."*

Left list (7 selectable rows, icon + name + one-line "best for" caption):

| Type | Icon colour | Caption |
|---|---|---|
| Discount | red/coral tag | "Best for a simple, flexible saving" |
| Buy one, get one free | purple ticket | "Best for footfall and bring a friend" |
| Freebie | green gift | "Best for first visits and tasters" |
| Spend & save | orange $ | "Best for bigger baskets" |
| Package deal | blue box | "Best for selling more in one visit" |
| Time limited | amber clock, pill **"BUILDS ON ANOTHER VOUCHER"** | "Best for filling quieter times" |
| Reusable | teal refresh, pill **"BUILDS ON ANOTHER VOUCHER"** | "Best for loyalty and repeat visits" |

Selected item gets an orange left-accent card + orange checkmark badge (top-right of the row).

Right detail panel (updates per selection; example shown for **Spend & save**):
- Icon + name + caption repeated as a header
- **WHAT IT IS**: "Spend a set amount, save a set amount."
- **HOW IT WORKS**: "When the customer spends over a threshold you set, they save a fixed amount."
- **FOR YOUR BUSINESS**: "Encourages bigger baskets and protects your margin, because the saving only unlocks once they have spent enough."
- **BEST FOR** (peach callout box): "Lifting the average spend per visit."
- **WHAT CUSTOMERS SEE**: a small static example card — pill "SPEND & SAVE", headline "Spend £30, save £8", merchant chip "OF The Old Foundry Kitchen", caption "Example, as shown on the Redeemo app", and a red "Redeem" pill (not a full button here — this is the lightweight preview, distinct from the live preview used inside the builder).
- **[Create this voucher →]** primary button (full width, red→coral gradient)
- Footer notice (shield icon): *"Every voucher goes to Redeemo for review before it goes live. You will always approve it first."*

Below the list, a static info card, **always visible regardless of selection**:

> **"How Redeemo vouchers work"**
> "Each voucher you create can be used once a month by each customer. After a customer uses one of your vouchers, it turns off for them until their next monthly cycle, when it renews and they can use it again."
> "So you can offer plenty of vouchers with confidence. Each one is used at most once a month per customer, which means genuine value for them and a reason to keep coming back, while you protect your margin and never give away unlimited discounts."
> "Two types are the exception. **Time limited** can be used once each time its window comes around, and **Reusable** can be used again on the interval you set."

This matches CLAUDE.md's locked business rule #3 (once per cycle per user across all branches), with Time-limited and Reusable as the two designed exceptions.

### 2.2 Common per-type builder chrome (applies to all 7 "Build your custom {Type} voucher" screens)

- Top bar: "< Change voucher type" · type icon + "{Type} voucher" label · "OF The Old Foundry Kitchen" chip · X close.
- H1: **"Build your custom {Type} voucher"**
- Subhead: *"You decide the words customers see and the terms they redeem on. The score and preview on the right react live as you change things."*
- **DEMO banner** (dashed orange border, clock icon, label "DEMO"): "Preview suggestions as **[Food & Drink ▾]**" with helper: *"The merchant's real category drives this. This control is only here so you can see the chips and terms change."* Only "Food & Drink" was ever observed selected; other dropdown options were never opened in any screenshot.
- **"You decide"** section header (pencil icon): *"Your voucher, your terms. Change anything below."*
- **"What customers will see"** card (identical across all 7 types):
  - **Photo** — dashed upload zone, upload-arrow icon, label "Add a photo", helper: *"JPG or PNG, landscape, at least 1200 by 600 pixels, up to 5 MB."* / *"It fills the top of your voucher card. A photo of the item or your space works well."*
  - **Title** — single-line text input, prefilled/suggested. Helper: *"Suggested from what you entered. Edit it any way you like. 60 character limit."*
  - **Description** — multi-line textarea, prefilled/suggested. Helper: *"Suggested. Make it your own to sell the offer in your voice. 300 character limit."*
  - **Estimated saving** — £ numeric field, auto-computed from the type's inputs; helper text is type-specific (quoted per type below).
- **"Your terms"** card — header: *"Pick from this set so customers always know what to expect. The fewer you pick, the more people will redeem. **Caution** terms may put some customers off; **Restrictive** terms can stop people redeeming altogether."* (Caution/Restrictive coloured inline — only CAUTION badges were actually observed on chips; no chip was seen carrying a "Restrictive" badge in any screenshot, so that severity tier exists in the copy but its trigger wasn't demonstrated.) Below: a list of checkbox rows (checked rows get a navy border + filled navy checkbox), some tagged with an orange **CAUTION** pill on the right. At the bottom, an **"Add your own term"** mini-form: placeholder *"A short, plain line customers will read"*, helper *"Keep it simple and fair. 80 characters left of 80."*, disabled **[Add term]** button until text is entered.
- **"Ask the Redeemo team to help with this offer"** toggle (peach card, people icon): *"Turn this on if you would like our team to help build or improve this voucher with you. You always approve it before it goes live."* Off by default in every screenshot.
- **"Strong for you, fair for customers"** trust card (dark navy, shield icon) — base-type copy (Discount/BOGO/Freebie/Spend & Save/Package deal all identical):
  > • **Each customer can use this voucher once a month,** so your regulars still pay full price and you bring in new faces, not give away your margin.
  > • We help your offer stay strong enough to bring customers in and fair enough that it never lets anyone down.
  > • Pick your terms from a set we provide so customers always know what to expect, and add your own if you really need to.
  > • Want a hand? Turn on Ask the Redeemo team to help with this offer below, and we will help you build it. You always approve it before it goes live.

  Time-limited variant changes only bullet 1:
  > • **Each customer can use this voucher once each time the offer runs,** for example once a day for a daily happy hour. Use it to fill your quieter times and plan your saving around the footfall it brings.

  Reusable variant's trust card was never scrolled into view in the screenshots — not confirmed (see §7).

- **Footer bar** (sticky, full width): left — checkmark + *"This voucher goes to Redeemo for review before it goes live."*; right — **[Save as draft]** (outline button) and **[Submit for review]** (red→coral gradient button, disabled when no sub-type chosen yet).

### 2.3 Discount voucher (proto-01_21_55.png, proto-01_22_23.png)

- **"What kind of discount?"** — *"A straight discount off the price. Choose a fixed amount or a percentage."* Two-way toggle: **"A percentage off"** (default, selected) / **"A fixed amount off"** (never opened in screenshots — its fields are unconfirmed).
- **"What percentage off?"** — *"The share taken off the price."* Numeric field with **%** suffix (default `20`), plus quick chips **10% / 15% / 20%** (20% selected).
- **"What is a typical order value?"** — *"A normal order for your business, so we can estimate the saving."* £ field (default `30`), quick chips **£20 / £30 / £50**. Helper: *"We use this only to estimate the saving. It is not shown to customers."*
- **"Is there a minimum spend?"** — toggle, off by default. Helper: *"Optional. Apply the discount only when the customer spends at least this much. A percentage over a minimum, for example 20% off when you spend £25, is genuinely different from Spend and save."* (Field revealed when on was never captured — gap.)
- Estimated saving helper (auto): *"20% of a £30 order is about £6. This is the estimated saving customers see."*
- Suggested Title: **"20% off"**. Suggested Description: **"Get 20% off your order with this voucher. A simple saving when you visit."**
- Terms checklist (defaults checked in **bold**):
  1. **Valid on your total bill**
  2. **One discount per visit**
  3. **Tell the staff you are using a Redeemo voucher before you order or pay**
  4. Not valid with any other voucher
  5. One voucher per customer each visit
  6. Booking recommended `CAUTION`
  7. Advance booking required `CAUTION`
  8. Valid on full price items only `CAUTION`
  9. Dine in only `CAUTION`

### 2.4 Buy one, get one free (BOGO) voucher (proto-01_23_06.png)

- **"What does the customer buy?"** — *"The item they pay full price for. Describe it in your own words."* ITEM text field (default "A main course") + FULL PRICE £ field (default `18`). Helper: *"What this item normally costs without the voucher."* Suggestion chips: **Any full price item / A main / A hot drink / A starter**.
- **"What do they get free?"** — *"A second of the same or similar item. This is what the customer gets as their discount."* ITEM field (default "A second of equal or lower value") + VALUE OF THE FREE ITEM £ field (default `18`). Helper: *"What the free item normally sells for. This is the saving the customer gets."* Chips: **A second of equal or lower value / Another of the same item / A second item**.
- Suggested Title: **"Buy one main course, get one free"**. Suggested Description: **"When you buy a main course, we will give you a second one free at The Old Foundry Kitchen. If the two items are different prices, the cheaper one is free."**
- Estimated saving auto-set to the free item's full price (£18); helper: *"Set automatically from the free item's full price (£18). Edit if the real saving is different."*
- Terms checklist: only the top rows were captured — **"Tell the staff you are using a Redeemo voucher before you order or pay"** (checked) and **"Not valid with any other voucher"** (unchecked) are confirmed; the full list below the fold was not captured for this type specifically (inferred to match the Discount/Freebie pattern shape, not confirmed verbatim).

### 2.5 Freebie voucher (proto-01_23_50.png, proto-01_24_07.png)

- **"What does the customer get free?"** — *"The item the customer receives at no cost. A different item from anything they buy. Describe it in your own words."* Field (default "A dessert"). Chips: **A side / A dessert / A hot drink**.
- **"What is it worth?"** — *"What the free item normally costs. This is the saving the customer gets."* £ field (default `6`), chips **£4 / £6 / £8**. Helper: *"The free item's normal price. It also shows as the estimated saving."*
- **"Do they need to buy something to get it?"** — radio: **"Yes, with a purchase"** (default, selected) / "No, it is free on its own." (never opened — its hidden/shown field behaviour is unconfirmed).
- **"What do they need to buy?"** (only shown in the "Yes" branch) — *"The qualifying purchase that unlocks the free item."* Field (default "Any main"). Chips: **Any main / Any meal / A spend of £15 or more**.
- Suggested Title: **"Free dessert with any main"**. Suggested Description: **"Get a free dessert when you buy any main. A little treat on us when you visit."**
- Terms checklist:
  1. **One free item per visit** (checked)
  2. With any qualifying purchase
  3. **Tell the staff...** (checked)
  4. Not valid with any other voucher
  5. **One voucher per customer each visit** (checked)
  6. Booking recommended `CAUTION`
  7. Advance booking required `CAUTION`
  8. Valid on full price items only `CAUTION`
  9. Dine in only `CAUTION`
  10. While stocks last `CAUTION`

### 2.6 Spend & save voucher (proto-01_24_44.png, proto-01_25_08.png)

- **"How much does a customer need to spend?"** — *"The amount a customer spends in one visit to unlock the saving."* £ field (default `30`), chips **£15 / £25 / £40**. Helper: *"The total a customer spends in one visit before the saving applies."*
- **"How much do they save?"** — *"What they get off when they reach that spend."* £ field (default `8`), chips **£5 / £8 / £10**. Helper: *"This is the saving the customer gets. It also shows as the estimated saving."*
- Suggested Title: **"Spend £30, Save £8"**. Suggested Description: **"Spend £30 or more in a single visit and save £8. A little extra for treating yourself."**
- Estimated saving helper: *"Customers save £8 when they spend £30. This is also their estimated saving."*
- Terms checklist:
  1. **Spend £30 or more in a single visit** (checked, dynamic — mirrors the threshold set above)
  2. **Tell the staff...** (checked)
  3. Not valid with any other voucher
  4. **One voucher per customer each visit** (checked)
  5. Worked out before any service charge
  6. Booking recommended `CAUTION`
  7. Advance booking required `CAUTION`
  8. Valid on full price items only `CAUTION`
  9. Dine in only `CAUTION`

### 2.7 Package deal voucher (proto-01_25_34.png, proto-01_25_45.png)

- **"What is in the package?"** — *"The items you bundle together and sell at one price. Describe the bundle in a line, or list the items one by one."* Two-way toggle **"Describe it"** (default) / **"List the items"** (never opened — unconfirmed UI). Field (default "Two mains and a bottle of wine"). Chips: **A starter, main and dessert / Two mains and a side / A sharing platter for two**.
- **"What does the customer pay?"** — *"The one set price for the whole package."* £ field (default `40`), chips **£25 / £40 / £60**.
- **"What would these normally cost?"** — *"The total if a customer bought the items separately. We use this to work out the saving."* £ field (default `55`), chips **£35 / £55 / £80**. Helper: *"This should be higher than the package price, so customers see a saving."* Below: a computed confirmation strip — *"Customers save £15 on the normal total of £55."* (checkbox-styled but appears to be a computed statement, not a user toggle).
- Suggested Title: **"Two mains and a bottle of wine for £40"**. Suggested Description: **"Get two mains and a bottle of wine together for £40, normally £55. That is £15 saved when you take them as a set."**
- Estimated saving helper: *"Customers save £15, the £55 normal total minus the £40 package price."*
- Terms checklist:
  1. **The package is for one table or visit** (checked)
  2. **All items in the package are taken together** (checked)
  3. Worked out before any service charge
  4. **Tell the staff...** (checked)
  5. Not valid with any other voucher
  6. One voucher per customer each visit
  7. Booking recommended `CAUTION`
  8. Advance booking required `CAUTION`
  9. Valid on full price items only `CAUTION`
  10. Dine in only `CAUTION`

### 2.8 Time limited voucher (proto-01_26_17.png through proto-01_30_39.png)

Two-step wrapper around one of the 5 base types (Discount, BOGO, Freebie, Spend & save, Package deal — **not** Discount-only; every base type was demonstrated wrapped in Time limited). Reusable is not offered as a Time-limited base (nor vice versa).

- **STEP 1 — "What runs during these times?"** *"A time limited voucher is one of your normal vouchers with a schedule attached. Pick the voucher, then set when it runs."* Same 5-type card grid as the base type picker (minus Time limited/Reusable themselves). Until a type is picked, the right-hand preview shows a placeholder: clock icon, **"Pick what runs first"**, *"Choose the voucher in Step 1, then your score and live customer preview appear here."* — and "Submit for review" is disabled.
- Once a base type is chosen, that type's **full normal field set renders inline** (identical fields/copy to §2.3–2.7 above) directly beneath Step 1.
- **STEP 2 — "When does it run?"** *"Set the days and times the voucher is available. This schedule is what makes it a time limited voucher."*
  - **Quick start** chips: **Happy hour / Lunch / Weekend** (pre-fills a window).
  - **Window 1** card: DAYS row of 7 toggle chips Mon–Sun (Mon–Fri selected by default in the demo); FROM / TO hour dropdowns (default `5pm` → `7pm`); a computed amber summary strip, e.g. *"Monday to Friday, 5pm to 7pm — 2 hours each day."*
  - **[+ Add another window]** — adds further Window N cards (only Window 1 was ever populated in screenshots; multi-window behaviour unconfirmed).
  - Info callout (amber): *"Unlike other vouchers, a time limited voucher can be redeemed once each time a window comes around, not just once a month. So a daily happy hour can be used once a day by the same customer. Plan the saving and times around that footfall and your margin."*
  - **"Does this voucher end on a date?"** toggle (off by default). Helper: *"Optional. Set a date for the whole voucher to stop, for example the end of a seasonal promotion. Leave off to keep it running."* When on: reveals a `dd/mm/yyyy` date input.
- Title/Description suggestions append the schedule, e.g. Title **"20% off, Monday to Friday 5pm to 7pm"**; Description gains a trailing sentence *"...Available Monday to Friday, 5pm to 7pm."*
- Terms checklist (Discount-based example, replaces/adds relative to the base list):
  1. **Available only during the times shown** (checked)
  2. **One redemption per customer each time the voucher runs** (checked)
  3. **Tell the staff...** (checked)
  4. Not valid with any other voucher
  5. One voucher per customer each visit
  6. Booking recommended `CAUTION`
  7. Advance booking required `CAUTION`
  (list continues below the captured fold, presumably mirroring the base type's remaining CAUTION rows — not confirmed past this point)
- **Live-preview-only additions** (see §4b): countdown badge, "Preview the customer view in each state" tri-state tab.

### 2.9 Reusable voucher (proto-01_31_17.png, proto-01_31_37.png)

Two-step wrapper, same 5 base types offered (Discount shown selected in Step 1's screenshot).

- **STEP 1 — "What runs each time?"** *"A reusable voucher is one of your normal vouchers that a customer can use again and again. Pick the voucher, then set how often they can use it."* Same 5-card grid. Base type's full field set renders inline beneath.
- **STEP 2 — "How often can the same customer use this voucher?"** *"Set how soon a customer can redeem it again after each use. The minimum is 30 minutes."* Chips: **Every hour / Every 4 hours** (default selected) **/ Once a day / Custom**. Confirmation strip (green): *"Customers can redeem this again every 4 hours."*
  - Info callout (green): *"Unlike most vouchers, a customer can use this more than once. After each redemption it becomes available again after the time you set, instead of once a month. Set the interval around your footfall and your margin."*
  - **"Does this voucher end on a date?"** toggle (off by default). Helper: *"Optional. Set a date for the whole voucher to stop. Leave off to keep it running."* (Note: shorter than the Time-limited version's helper, which adds the "seasonal promotion" example — a genuine, small copy difference between the two wrapper types.)
- Terms checklist (confirmed portion):
  1. **Available again after the time shown, while your subscription stays active** (checked)
  2. **Tell the staff...** (checked)
  3. Not valid with any other voucher
  4. One voucher per customer each visit
  5. Booking recommended `CAUTION`
  6. Advance booking required `CAUTION`
  (list continues past the captured fold — unconfirmed)
- **Discrepancy in the captured data**: proto-01_31_17.png shows **Discount** selected in Step 1 (20% off, £30 typical order) with the preview headline "20% off, available again every 4 hours." proto-01_31_37.png (the next scroll-down capture) instead shows Title/Description/preview terms for a **Spend & Save** voucher ("Spend £30, Save £8, available again every 4 hours"). The base-type selection evidently changed between the two captures (the designer re-picked the base type mid-demo). Both states are documented above under their respective fields; do not read them as one continuous form-fill.

---

## 3. VOUCHER TYPES — SUMMARY TABLE

| Type | Redemption cadence | Builds on another type? | Unique inputs |
|---|---|---|---|
| Discount | Once per customer per month | No | % or £ off, typical order value, optional minimum spend |
| Buy one, get one free | Once per customer per month | No | Full-price item + price, free item + value |
| Freebie | Once per customer per month | No | Free item + value, optional qualifying purchase |
| Spend & save | Once per customer per month | No | Spend threshold, save amount |
| Package deal | Once per customer per month | No | Bundle description/list, package price, normal (separate) total |
| Time limited | Once per customer **each time the schedule window recurs** | Yes — wraps Discount/BOGO/Freebie/Spend & save/Package deal | Day/hour schedule (1+ windows), optional end date |
| Reusable | Repeatable on a merchant-set interval (min. 30 minutes) while subscription is active | Yes — wraps the same 5 base types | Redemption interval (Every hour/4 hours/Once a day/Custom), optional end date |

All 7 types share: photo, title (60 char), description (300 char), estimated saving, a terms checklist with
free-text add-on (80 char), an "Ask the Redeemo team" assist toggle, and go through Redeemo review before
going live (Save as draft / Submit for review).

---

## 4. LIVE BEHAVIOURS

### 4a. "How this voucher stacks up" scoring panel

Structure, identical shell on every builder screen:
- Header row: **"How this voucher stacks up"** with a coloured state label at top-right (only **"Good"**, in green, was ever observed across all 22 screenshots — see §7).
- Three-way segmented control: **Too weak** / **Good** / **Great**, with the active state highlighted (light green fill for Good).
- One-line summary under the control, tied to the active state. For Good: *"A solid offer. Address the points below to reach Great."* (Copy for Too weak/Great states was never rendered — not observed.)
- **"WHAT IS STRONG ABOUT YOUR VOUCHER"** (green heading) — a bulleted list, each row with a green checkmark. Observed strength lines, verbatim per type/config:
  - Discount 20%/£30: "A generous £6 saving (about 20% off £30)" · "A clear, easy title" · "Few, fair terms"
  - BOGO (£18 item): "A generous £18 saving (about 50% off £36)" · "A clear, easy title" · "Few, fair terms"
  - Freebie (£6 item): "A free item worth £6, above our £5 minimum" · "A clear, easy title" · "Few, fair terms"
  - Spend & save (£30/£8): "A generous £8 back on a £30 spend, about 27%" · "A clear, easy title" · "Few, fair terms"
  - Package deal (£55→£40): "A generous £15 off the £55 normal total, about 27%" · "A clear, easy title" · "Few, fair terms"
  - Time limited (any base): base-type strength lines **plus** a 4th line, e.g. "Clear, usable times customers can plan around: Monday to Friday, 5pm to 7pm"
  - Reusable (Discount base): "A generous £6 saving (about 20% off £30)" · "A clear, easy title" · **"Customers can come back and use it again every 4 hours, which keeps them returning"** · "Few, fair terms" (the repeat-use line is inserted as the 3rd bullet, before "Few, fair terms")

  This reveals the underlying rule set: the score engine appears to evaluate at minimum (a) saving generosity
  vs. a category/type baseline (Freebie explicitly names a **"£5 minimum"** threshold for the free item's
  value), (b) title clarity, (c) term count/fairness, and (d) for Time-limited/Reusable, an extra "usability of
  the schedule/cadence" factor.

- **"WHAT COULD MAKE IT BETTER"** (orange/coral heading) — bulleted list, orange "i" icon per row. Observed on every single screenshot, **identical two lines regardless of type or values**:
  1. "Make the description your own. Add a line about why customers will love it, or a detail only you would know."
  2. "Add a photo so your offer stands out to customers."

  Since no screenshot has a photo attached or a hand-edited description, it is unconfirmed whether these two
  improvement lines disappear once a photo is added / the description is edited, or whether other
  improvement messages exist for other conditions.

- Footer disclaimer (constant, every screen): *"The score compares this offer to similar businesses on Redeemo, so yours stands out where it counts."*

### 4b. Live customer preview card ("How customers see your voucher")

- Panel header: mobile-icon + **"HOW CUSTOMERS SEE YOUR VOUCHER"**; footer note: *"Updates live as you change the voucher."*
- Card anatomy (consistent across types):
  1. Colour-coded header banner with the type's pill label (e.g. `DISCOUNT`, `BUY ONE, GET ONE FREE`, `FREEBIE`, `SPEND & SAVE`, `PACKAGE DEAL`, `TIME LIMITED`, `REUSABLE`), a large translucent gift-box watermark icon, and top-right the merchant avatar ("OF") + "on Redeemo".
  2. Bold headline (mirrors the Title field).
  3. A short value chip (peach pill), e.g. "20% off", "Free with any main", "£8 off when you spend £30 or more", "£55 of items for £40".
  4. Green "Save / Save about / Save up to **£X**" line.
  5. Merchant identity row: avatar, name, branch ("The Old Foundry Kitchen, High Street").
  6. Body copy (mirrors the Description field).
  7. Divider, then **TERMS** — a plain bullet list of every checked term.
  8. Primary CTA button, gradient red→coral. Base types render it as **"Redeem this voucher"** (sentence case); the Time-limited and Reusable wrapper screens render it as **"Redeem This Voucher"** (title case) — a small, likely unintentional capitalisation inconsistency worth flagging to the build team.
- **Updates live**: every field edit on the left (percentage, prices, title, description, terms selection) is reflected immediately in this card — confirmed by the same £ and copy values appearing in both the input fields and the preview across every screenshot pair.
- **Time-limited only**: an extra sub-header *"Preview the customer view in each state"* with three tabs — **In window** (only one ever shown selected) / Later today / Future day. In the "In window" state, the card gains an amber status box: **"AVAILABLE NOW"** pill + a live countdown chip (e.g. "17h 34m", decrementing across screenshots taken moments apart — 17h34m → 17h32m → 17h31m → 17h30m, confirming it's a real countdown to window close) + "Window ends 7:00pm" line. The "Later today" and "Future day" tab contents were never opened — unconfirmed.
- **Reusable only**: two tabs — **Available now** (only one ever shown selected) / Used, now waiting. In "Available now": a green status box, **"AVAILABLE NOW"** dot + label, and *"Available again every 4 hours. Your subscription must stay active to redeem."* The "Used, now waiting" tab content was never opened — unconfirmed.

### 4c. Suggested title/description generation

Titles and descriptions are auto-populated from the structured field inputs and update live as those fields
change (confirmed: changing the discount % or the item description changes both the Title and Description
suggestions in step). Patterns observed:
- Discount: Title = `"{X}% off"`; Description = `"Get {X}% off your order with this voucher. A simple saving when you visit."`
- BOGO: Title = `"Buy one {item}, get one free"`; Description = `"When you buy {a/an} {item}, we will give you a second one free at {merchant}. If the two items are different prices, the cheaper one is free."`
- Freebie: Title = `"Free {item} with {qualifier}"`; Description = `"Get a free {item} when you buy {qualifier}. A little treat on us when you visit."`
- Spend & save: Title = `"Spend £{X}, Save £{Y}"`; Description = `"Spend £{X} or more in a single visit and save £{Y}. A little extra for treating yourself."`
- Package deal: Title = `"{bundle description} for £{price}"`; Description = `"Get {bundle description} together for £{price}, normally £{normalTotal}. That is £{saving} saved when you take them as a set."`
- Time limited appends `", {days} {fromHour} to {toHour}"` (or a shortened `"to {toHourNumberOnly}"` in one BOGO/Time-limited title) to the base Title, and appends `" Available {days}, {from} to {to}."` to the base Description.
- Reusable appends `", available again every {interval}"` to the base Title, and appends `" Available again every {interval}, so you can come back and use it more than once."` to the base Description.
- Helper text under both fields is constant: Title — *"Suggested from what you entered. Edit it any way you like. 60 character limit."*; Description — *"Suggested. Make it your own to sell the offer in your voice. 300 character limit."* Both remain freely editable (they are plain text inputs, not locked/derived-only fields).

### 4d. DEMO category selector banner

Every builder screen carries a dashed-border orange banner explicitly labelled **DEMO**: *"Preview suggestions
as **[Food & Drink ▾]**"* with the disclaimer *"The merchant's real category drives this. This control is only
here so you can see the chips and terms change."* This is prototype-only scaffolding — in production the
category comes from the merchant's actual business category (per CLAUDE.md's category-taxonomy model), and
this dropdown control itself should **not** ship. Only "Food & Drink" was ever selected in any screenshot, so
no other category's chip/terms variants (e.g. for a Beauty, Retail, or Leisure merchant) were observed —
build team will need to source those variants from elsewhere (the design spec or a follow-up prototype), not
this file.

---

## 5. TERMS SECTION — mechanics

- **Not free text primarily.** Terms are chosen from a **fixed, per-type checklist** of preset lines (checkbox
  rows), with 3 lines pre-checked by default (varies per type — see §2.3–2.9). Unchecking/checking updates the
  live preview's TERMS list immediately.
- Some preset lines carry a `CAUTION` badge (orange pill) — copy calls out that *"Caution terms may put some
  customers off"*. The intro copy also mentions a **"Restrictive"** severity tier ("Restrictive terms can stop
  people redeeming altogether") but no chip in any screenshot was ever tagged Restrictive — its trigger/styling
  is undefined in the available evidence.
- **Free-text addition** is supported via an **"Add your own term"** mini-form beneath the checklist: single-line
  input (placeholder *"A short, plain line customers will read"*), 80-character limit (helper: *"Keep it simple
  and fair. 80 characters left of 80."*), and a **[Add term]** button (disabled/grey until text is entered — the
  button was never seen in its enabled state, so the resulting UI for an added custom term, e.g. whether it
  appears as a new checked row above or below the preset list, is unconfirmed).
- The preset checklist itself changes per voucher type (see each type's list above) — e.g. Package deal
  surfaces "The package is for one table or visit"; Spend & save surfaces "Spend £{X} or more in a single visit"
  with the live threshold value substituted in; Time limited/Reusable each replace the top 1-2 lines with
  cadence-specific ones ("Available only during the times shown" / "Available again after the time shshown,
  while your subscription stays active").

---

## 6. VISUAL SYSTEM NOTES

**Layout**: two-column builder. Left column (~55% width, `max ~900px`) holds the input cards stacked
vertically: You decide → What customers will see → Your terms → Ask the Redeemo team → Strong for you trust
card. Right column (~45% width) is **sticky-feeling** (both cards visible without scrolling with the left
column's top, though it does scroll with the page in this static capture) holding: How this voucher stacks up
→ How customers see your voucher. Page content sits on a light grey-cream page background, with each card a
white rounded-corner (~16–20px radius) panel with a soft shadow.

**Colour tokens** (cross-checked against the surviving HTML source, which independently confirms these):
- Navy `#010C35` — all headings, primary text, selected-state fills (radio dots, checked checkboxes, selected
  chip backgrounds).
- Red→coral gradient `linear-gradient(135deg,#E20C04,#E84A00)` — confirmed verbatim in the HTML (`Create a
  voucher` button, `Back to dashboard` button) and matches the CTA/"Redeem this voucher" button, "Create this
  voucher" button, and "Submit for review" button seen in the builder screenshots. This is the same red
  `#E20C04` / coral `#E84A00` pair locked in CLAUDE.md §9.
- Cream `#FFF9F5` with a matching hairline border `#F4D9D2` — confirmed in the HTML for callout/info chips
  elsewhere in the same file; visually consistent with the DEMO banner and peach "Ask the Redeemo team" card
  in the builder screenshots (exact hex not independently confirmable from screenshots alone).
- Muted body text greys: `#566079` (secondary copy), `#8089A4` (tertiary/meta labels) — confirmed in HTML.
- Per-type accent colours (screenshot-only, hex not extractable): Discount = red/coral; BOGO = purple/violet;
  Freebie = green; Spend & save = orange/peach; Package deal = blue; Time limited = amber/gold; Reusable =
  teal-green (a distinct, cooler green from Freebie's).
- Status colours: green for "Good" score state, strengths, and Reusable's "available now" box; orange/amber for
  CAUTION badges, improvement bullets, and Time-limited's "available now" box.

**Typography**: headings use `'Mustica Pro','Lato',sans-serif` (confirmed via `@font-face` declaration and
repeated `h1/h2` usage in the HTML — Mustica Pro SemiBold, weight 600); body/UI copy uses `'Lato',sans-serif`.
This matches CLAUDE.md's tech-stack note of Lato + Mustica Pro fonts elsewhere in the portal, so no new font
loading is required.

**Spacing/shape patterns**: generous card padding (~24–30px), ~14–16px border radius on cards and inputs,
pill-shaped chips/badges (border-radius 99px) for type labels, status pills, and CAUTION tags, 1–1.5px hairline
borders in warm greys (`#E5DED8`/`#ECE6E0` family) separating cards from the page background, toggle switches
using the same navy/grey pattern as elsewhere in the portal (confirmed identical toggle markup for "Grant
manage vouchers" in the surviving HTML — width 38px/height 22px pill with a 18px knob).

---

## 7. AMBIGUITIES / GAPS (things the prototype leaves undefined)

1. **HTML source is truncated at 256 KiB** — no actual application logic (scoring formula, live-preview
   diffing, suggestion-generation templates) exists in this export; every rule stated in §4 is inferred from
   comparing screenshots, not read from code. Build team must treat the scoring thresholds/copy as a starting
   spec to validate with the design/product owner, not as a literal contract.
2. **Score states "Too weak" and "Great" were never observed** — no screenshot shows either state active, so
   their exact trigger thresholds and their "what's strong / what could be better" copy variants are unknown.
   Only the "Good" state's summary line and its two fixed improvement bullets are confirmed.
3. **"Restrictive" term severity** is named in copy but never demonstrated on any actual term chip — no visual
   treatment or example is available.
4. Time-limited preview's **"Later today"** and **"Future day"** tab contents, and Reusable's **"Used, now
   waiting"** tab content, were never opened in any screenshot.
5. **Discount's "fixed amount off" branch**, **Freebie's "No, it's free on its own" branch**, **Package deal's
   "List the items" tab**, and the **expanded minimum-spend field** (Discount) were never opened — their field
   sets are unconfirmed.
6. **BOGO's full terms checklist** was only partially captured (top ~2 rows); the remainder is assumed (not
   confirmed) to mirror the shape of the other base types' lists.
7. **Reusable's "Strong for you, fair for customers" trust card copy** (specifically its bullet-1 variant, by
   analogy with Time-limited's rewrite) was never scrolled into view — unconfirmed whether it exists / what it
   says.
8. **Reusable capture discrepancy** (see §2.9): the two Reusable screenshots show inconsistent base-type state
   (Discount vs. Spend & Save) between one scroll position and the next, implying the demo's selection changed
   mid-capture. Not a bug to "fix" — just a reminder that these two screenshots are two different demo runs,
   not one continuous form fill.
9. **"Redeem this voucher" vs "Redeem This Voucher"** capitalisation differs between base-type preview cards
   (sentence case) and Time-limited/Reusable preview cards (title case) — likely an authoring inconsistency in
   the prototype; flag for a single consistent choice before build.
10. **Submit / draft / edit-vs-create behaviour is entirely undefined.** No screenshot shows: what happens after
    "Submit for review" or "Save as draft" is pressed (confirmation screen? redirect to Vouchers list? toast?);
    any validation/error state (empty required field, over character limit, invalid £ value); or an "edit an
    existing voucher" entry point (the Vouchers list's kebab menu in the surviving HTML has `onClick="{{
    v.onView }}"` and a `menuItems` for-loop, implying edit/pause/delete actions exist, but their screens are not
    in this capture set).
11. **Flagship vs custom-voucher lane is not covered by this builder at all.** The HTML confirms flagship
    vouchers (RMV-001/002) are **"Always live. Edits go through review, and they cannot be deleted"** and carry
    a **"Required"** pill on the Vouchers list — consistent with CLAUDE.md's locked business rule #6 — but the
    builder screens captured here all default to creating a new **custom** voucher (RCV-XXX per CLAUDE.md); no
    screenshot shows the builder in an "editing a flagship voucher" mode, so it's unknown whether flagship edits
    reuse this exact same builder UI or a restricted variant of it.
12. **Status filter row on the Vouchers list** (`voucherFilters`, a 5-item `sc-for`) has no labels surviving in
    the truncated HTML — likely something like All/Live/In review/Draft/Paused, but unconfirmed.
13. **Multi-window scheduling** ("+ Add another window" for Time limited) was never exercised beyond Window 1 —
    unknown how a second window's UI, the customer-facing terms line, or the "available now" countdown logic
    behave with 2+ windows.
14. **"Custom" interval option** for Reusable's Step 2 (alongside Every hour / Every 4 hours / Once a day) was
    never opened — its input UI (presumably a number + unit picker, given the stated 30-minute minimum) is
    unconfirmed.

---

## Appendix: file inventory

| File | Role |
|---|---|
| `Redeemo-for-Business.dc.html` | Prototype source; truncated at 256 KiB before builder markup — used only for navigation context (Vouchers list) and token confirmation (fonts/colours) |
| `proto-01_21_55.png` → `proto-01_31_37.png` (22 files) | Sequential builder-flow captures — primary source for this entire document |
| `proto-screencapture-claude-ai-design-p-09a77423-ca03-4360-badb-1dca1687c5ab-2026-06-25-22_31_28.png` | Unrelated, older capture (merchant onboarding "Add your main branch", step 4 of 6) — not part of the voucher builder flow |

---

## Addendum: live-walk resolutions (2026-07-13)

Method: drove the live prototype in an owner-authenticated browser session at the Claude Design URL
(`claude.ai/design/p/09a77423-.../?file=Redeemo+for+Business.dc.html`), read-only on the design project.
Two evidence sources, both stronger than the §0 screenshot-only baseline:

1. **Full source recovered.** The raw file the design canvas loads was fetched directly from its serve
   endpoint (`https://09a77423-....claudeusercontent.com/v1/design/projects/.../serve/Redeemo%20for%20Business.dc.html?srcmap=1`)
   and saved as `Redeemo-for-Business.FULL.html` in this folder: **3,165,634 bytes** (the old copy truncated
   at 262,144). This is the raw served source, not a rendered-DOM dump. It contains the complete builder
   markup and the complete application script (~542 KB of JS between byte offsets ~1,125,340 and ~1,667,784),
   including the scoring engine, suggestion templates, terms pools, and submit handlers quoted below. The file
   ends with a `<script type="application/json">` source-map block appended by the serve endpoint (`?srcmap=1`);
   ignore it, it is canvas tooling, not prototype code. "How this voucher stacks up" appears in it; verified.
2. **Live drive.** Every resolvable §7 ambiguity was exercised in the running prototype (lifecycle set to
   "Live, established", role Owner). New-state screenshots are in `live-walk/` and cited per item.

**Version caveat:** the live prototype is a NEWER iteration than the 22 timestamped screenshots. Everything
in §2 to §6 still matches at field level, but the live build adds: a flagship-voucher builder lane, a
per-status voucher Actions menu (edit, duplicate, withdraw, request change, request end, run again, delete),
a working Restrictive term tier, default type-branded photo banners, and a BOGO saving-mismatch guard. Where
the live build differs from the screenshot-era notes above, the live build is quoted and the delta flagged.

### A1. Scoring engine (resolves §7.1 and §7.2): exact thresholds, from source

The score is computed in the app script (search `calWeak` in the FULL file). Verbatim logic:

- **£5 floor:** `belowMinSaving = savingValue < 5 && !freeStandalone`. Below it the improvements list gains
  "Raise the saving to at least £5" and the meter reads Too weak.
- **Generosity:**
  `generousAbsolute = (isSpend || isPackage) ? false : isFree ? savingValue >= 10 : isTimed ? savingValue >= 6 : savingValue >= 15;`
  `generousRelative = isFree ? false : (isSpend || isPackage || isDiscount) ? savingPercent >= 20 : savingPercent >= 40;`
  `isGenerous = (freeStandalone && savingValue > 0) || (reuseFrequent && savingValue >= 5) || (savingValue >= 5 && (generousAbsolute || generousRelative));`
  where `reuseFrequent` = Reusable with interval <= 1 day, and `savingPercent` is saving over the reference
  price (spend threshold, package normal total, typical order or minimum spend, or BOGO pair total).
- **Other factors:** `titleClear = previewTitle.length >= 8 || /\d+%\s*off|£\d+\s*off/i.test(previewTitle)`;
  `descHelpful = previewDesc.length >= 30 && !descUntouched` (the description must be EDITED, not just long);
  photo present; for Time limited a valid window of 2+ hours; terms cleanliness (next item).
- **Terms math:** `becomingRestrictive = restrictiveCount >= 1 || totalTermsCount >= 5 || cautionCount >= 2;`
  `tooRestrictive = restrictiveCount >= 2 || totalTermsCount >= 7 || cautionCount >= 4;`
  `tooManyTerms = totalTermsCount >= 5;` (counts include custom terms, auto-tiered; see A3).
- **State:** `calWeak = belowMinSaving || tooRestrictive || improveCount >= 4;`
  `calGreat = !calWeak && improveCount === 0 && isGenerous && !restrictiveOn && totalTermsCount <= 3;` else Good.
  `improveCount` counts the UNcapped improvements list; the panel displays at most 4 strengths and 4 improvements
  (`strengthsAll.slice(0, 4)` / `materialImprovements.slice(0, 4)`).
- **Submit gating (new finding):** `canSubmit = !calWeak && hasPrices && <per-type completeness>`. A Too weak
  voucher CANNOT be submitted: the "Submit for review" button greys out (verified live).

State copy, verbatim from source and confirmed live:

- Too weak (label colour `#B45309` on `#FEF6EC`), summary depends on cause:
  - too restrictive: "Your offer is too restrictive to score well. Drop a term or two so customers can actually redeem."
  - below £5: "Below Redeemo's £5 minimum saving. Make it more generous so it is worth a customer's trip."
  - otherwise (4+ improvement points): "This offer needs work before it is ready. Clear the points below to lift it out of Too weak."
- Good: "A solid offer. Address the points below to reach Great." (or just "A solid offer." if no improvements remain).
- Great: "Great offer. Customers will love this."

The full improvements vocabulary (each appears only when its condition holds): "Raise the saving to at least £5" ·
"Improve the saving. £{X} back on a £{Y} spend is {Z}%; a bigger share reads as Great." (Spend & save low-share) ·
"Improve the saving. £{X} off a £{Y} normal total is {Z}%; a bigger share reads as Great." (Package low-share) ·
"Lift the saving a little. {Z}% off £{Y} is fine, but a more generous cut reads as Great." (other types low-share) ·
"Write a clearer title" · "Make the description your own. Add a line about why customers will love it, or a detail
only you would know." (description present but untouched) · "Add a short description that sells the offer" (empty) ·
"Add a photo so your offer stands out to customers" · "Widen the times a little. A window under two hours is hard
for customers to catch, so a slightly longer window reads better." · "Add at least one availability window so
customers know when the offer runs" · "Drop or ease the restrictive term" · "Trim the terms. You have {N}; three
or fewer reads cleaner."

Additional strength lines beyond §4a: "A helpful description in your own voice" (edited description) · "A real
photo, not a placeholder" (photo added) · "A free item on its own, worth £{X}. That is a generous, easy yes for
customers" (standalone Freebie). So yes: the two §4a improvement bullets DO disappear once resolved, replaced by
their strength counterparts.

**Live proof:** `live-walk/tooweak.png` (Discount 10% of £30 = £3 saving; below-£5 summary; strengths reduced to
"A clear, easy title" and "Few, fair terms"; Submit disabled). `live-walk/great.png` (Discount 20%/£30 with an
edited description and an uploaded photo: "Great offer. Customers will love this.", four strengths, the WHAT COULD
MAKE IT BETTER section disappears entirely). `live-walk/tooweak-restrictive.png` shows the too-restrictive Too weak
variant (reached via edit mode; see A10).

### A2. Preview alternate tabs (resolves §7.4)

- Time limited "Later today": status box swaps to "AVAILABLE LATER TODAY" pill + countdown to window open
  (e.g. "14h 53m") + "Available from 5:00pm". The CTA becomes a greyed "Not Available Right Now" with a sub-line
  "Mon to Fri, 5:00pm to 7:00pm". `live-walk/tl-latertoday.png`
- Time limited "Future day": "AVAILABLE TUESDAY" (next scheduled weekday) + countdown (e.g. "1d 14h") +
  "Available from 5:00pm"; same "Not Available Right Now" CTA. `live-walk/tl-futureday.png`
- Reusable "Used, now waiting": green box becomes "AVAILABLE AGAIN" + countdown ("4h 0m") + "Available again
  from {clock}"; CTA becomes "Available again in 4h 0m". `live-walk/reusable-waiting.png`
- All countdowns are computed from the real clock (source: `fmtCountdown`, `stIn/stToday/stFuture`), and are
  based on Window 1 only.

### A3. Restrictive term tier (resolves §7.3)

Fully implemented in the live build. Tiering is per term: preset terms carry a `tier` of fair, caution, or
restrictive; the only preset restrictive term is the Discount minimum-spend line "Minimum spend of £{X} applies"
(appears in the pool only when a minimum spend is set). Custom terms are auto-tiered by regex:
`/minimum|only|excludes?|not valid|after \d|before \d|weekday|weekend|peak|restrict|members? only/i` reads as
restrictive, everything else as caution. The RESTRICTIVE badge renders red (`#B91C1C` on `#FEECEC`), distinct
from the orange CAUTION badge. Selecting a restrictive term adds the improvement "Drop or ease the restrictive
term", removes the "Few, fair terms" strength, and surfaces a terms-card note: "Your voucher is becoming
restrictive. Easing off can help more customers redeem it, and a clean, simple voucher always scores better."
(escalating to "Your voucher is too restrictive. Drop a term or two, especially the strictest, so customers can
actually redeem." at the tooRestrictive thresholds in A1, which also forces Too weak). While typing a custom term
that matches the regex, a live hint shows: "This reads as restrictive. Try to simplify before adding."
`live-walk/minspend-restrictive.png`

### A4. Discount branches (resolves §7.5, discount half)

- **"A fixed amount off":** replaces the percentage and typical-order fields with a single "How much off?"
  £ field (default `10`, quick chips £5 / £10 / £15), helper "The amount taken off the price. This is the
  estimated saving." A guidance callout follows: "A fixed amount off is a straight discount, like £10 off. If you
  want it to apply over a spend target, for example £10 off when you spend £40, that is the Spend and save type.
  Pick Spend and save from the voucher types instead." Estimated-saving helper: "Customers get £10 off. This is
  the estimated saving." Suggested Title `"£{X} off"`; Description "Get £{X} off your order with this voucher.
  A simple saving when you visit." The minimum-spend toggle is NOT shown in fixed mode (source:
  `discHasMin = discPercentKind && ...`; percent-only). `live-walk/fixedamount.png`
- **Minimum spend expanded (percent mode):** toggle reveals a £ field (placeholder `25`, chips £15 / £25 / £40).
  With a value set: Title becomes `"{X}% off when you spend £{Y}"`, Description inserts "Valid when you spend
  £{Y} or more.", the saving is recomputed as {X}% of the minimum spend (helper: "{X}% of the £{Y} minimum spend
  is £{Z}. Customers save at least this, and more when they spend more."), the preview saving line reads
  "Save at least £{Z}", and the restrictive preset term of A3 joins the pool (unchecked).
  `live-walk/minspend-restrictive.png`

### A5. Freebie standalone branch (resolves §7.5, freebie part)

Selecting "No, it is free on its own." removes the "What do they need to buy?" block AND drops the
"With any qualifying purchase" term from the pool. Suggested Title `"Free {item}"`; Description "Enjoy a free
{item} on us. Just show this voucher when you visit." Preview value chip and saving stay item-worth based.
Scoring treats any standalone free item with value > 0 as generous, with the strength line "A free item on its
own, worth £{X}. That is a generous, easy yes for customers". `live-walk/freebie-standalone.png`

### A6. Package deal "List the items" tab (resolves §7.5, package part)

Switching to "List the items" replaces the single describe-field with three numbered item inputs (placeholders
"e.g. a starter", "e.g. a main", "e.g. a drink"), an "Add another item" button, and the helper "Customers see
these items listed on the voucher." Filled items generate Title `"{Item1}, {item2} and {item3} for £{price}"`
(first item capitalised, rest lowercased, "and" join) and the same Description template as describe mode; the
customer preview additionally renders the items as their own line list above TERMS. With no items entered the
title falls back to `"A bundle for £{price}"`. `live-walk/package-items.png`

Spend & save details re-verified live and in source: identical to §2.6; the quick chips come from a per-category
table (`CATEGORY_DATA`), for Food & Drink spend £15 / £25 / £40 and save £5 / £8 / £10.

### A7. BOGO terms list (resolves §7.6)

From source, the BOGO pool is: "Tell the staff you are using a Redeemo voucher before you order or pay" ·
"Not valid with any other voucher" · "One voucher per customer each visit" · **"Both items must be in the same
transaction"** (fair tier; never visible in the old screenshots) · then the category caution rows (for Food &
Drink: Booking recommended, Advance booking required, Valid on full price items only, Dine in only). Defaults
checked in the live build: "Tell the staff..." and "Not valid with any other voucher" (a delta from the §2.4-era
screenshot, where "Not valid..." rendered unchecked).

### A8. Reusable trust card (resolves §7.7) and capture discrepancy (§7.8)

The Reusable "Strong for you, fair for customers" card exists; bullet 1 verbatim: "Each customer can use this
voucher again and again, becoming available again after the time you set, not once a month. It is built to
reward your regulars and keep them coming back, so set your saving and your interval around your margin."
Bullets 2 to 4 match the base card. (Bullet 4 rewrites itself once the assist toggle is on: "You have asked our
team to help with this offer. We will be in touch shortly, and you always approve it before it goes live.")
On §7.8: confirmed a non-issue; switching the Step 1 base type resets the suggestion state
(`bSavingEdited/bTitleEdited/bDescEdited` cleared), so the two old captures were simply two picks.

### A9. CTA capitalisation (resolves §7.9)

Still inconsistent in the live build: base-type preview CTA is "Redeem this voucher"; Time limited (in window)
and Reusable (available) render "Redeem This Voucher"; blocked states render "Not Available Right Now"
(Time limited) and "Available again in {countdown}" (Reusable). Flag stands for build.

### A10. Submit, draft, and edit (resolves §7.10)

- **Submit for review** (enabled only when `canSubmit`, see A1) opens a confirmation modal: heading "Confirm
  this is your voucher", body "Confirm this voucher is correct and yours. It goes to Redeemo for review, and
  goes live once approved.", a summary strip (title + "Save about £{X} · {merchant}"), buttons "Keep editing"
  and "Yes, this is my voucher". Confirming closes the builder straight back to the Vouchers list; the new
  voucher appears in the IN REVIEW group with the stub note "Live once approved" and the filter count
  increments. No toast, no separate success screen for custom vouchers. `live-walk/submit-confirm.png`,
  `live-walk/submitted-list.png`
- **Save as draft** is a stub: the button is bound to `closeBuilder` in the markup; it closes the builder
  without persisting anything (verified live: Draft filter count unchanged, no toast). Real draft behaviour is
  undefined in the prototype.
- **Edit mode exists** (new in the live build). Every voucher card has an Actions menu whose items are
  status-dependent (source `actionsFor`): live custom voucher = "Edit voucher" / "View redemptions" /
  "Duplicate" / "Request to end" with note "Changes to live vouchers are reviewed before customers see them.";
  draft = "Edit voucher" / "Submit for review" / "Duplicate" / "Delete" with note "Finish this voucher and
  submit it for review to go live."; in review = "Edit voucher" / "Withdraw submission" / "Duplicate";
  changes requested = "Edit and resubmit" / "Withdraw submission" / "Duplicate"; expired or ended =
  "Run this again" / "View redemptions" / "Duplicate". "Edit voucher" opens the SAME builder prefilled from the
  voucher (title and description marked as authored, saved terms seeded as custom term rows). View-only roles
  and the in-review or suspended lifecycles collapse the menu to "View redemptions" only.
  `live-walk/edit-menu.png`, `live-walk/edit-mode.png`
- **Prototype artifact worth flagging:** because edit mode re-seeds saved terms as custom rows and custom rows
  are auto-tiered by the A3 regex, editing the demo's live Reusable voucher immediately scored Too weak
  ("too restrictive" variant) with Submit disabled: an existing live voucher should not fail its own content.
  `live-walk/tooweak-restrictive.png`
- No field-level validation or error states exist beyond the disabled Submit, the package "should be higher"
  helper, and the Reusable 30-minute floor note (A13).

### A11. Flagship lane (resolves §7.11)

The recovered source shows the same builder component has a flagship mode (used during onboarding, `bCustom`
false): heading "Build Your Flagship Voucher", type default BOGO, footer note "Your vouchers are saved here and
go to Redeemo together when you submit your business for review.", submit button labelled "Save voucher 1 of 2"
then "Save voucher 2 of 2", a step chip "Voucher {N} of 2 · Step {1|2} of 2", a second-voucher chooser (start
from a copy of the first, or fresh), and a done step. Confirmation copy differs: "This is the second of your
two flagship vouchers. Confirm it is correct and yours. It is saved and ready, and goes to Redeemo with the
rest of your business when you press Submit for review." Once LIVE, flagship vouchers do NOT reuse the builder:
their Actions menu offers "Request a change" (a separate change-request form, `openChange`/`submitChange` in
source) plus "View redemptions" / "Duplicate", with the note "Flagship vouchers are always live. Edits go to
Redeemo for review, and they cannot be ended or deleted." (menu verified live: `live-walk/flagship-menu.png`).

### A12. Vouchers-list status filters (resolves §7.12)

Five chips with live counts: "All" · "Live" · "In review" · "Draft" · "Finished" (observed live as
All 8 / Live 4 / In review 1 / Draft 1 / Finished 2; "Finished" aggregates expired and ended). The source's
full status-badge set also includes Paused (suspended), plus changes_review and end_review states that render
under Live-like styling with their own menu actions ("Cancel change request" / "Cancel end request").

### A13. Multi-window scheduling (resolves §7.13) and Reusable Custom interval (resolves §7.14)

- **"+ Add another window"** appends a Window 2 card identical to Window 1 (7 day chips, FROM and TO dropdowns
  in 30-minute steps from 12am to 11:30pm, summary placeholder "Pick the days and a time range"); with 2+
  windows each card gains an enabled remove button. With two valid windows the suggested Description appends
  all windows joined with "; " ("... Available Monday to Friday, 5pm to 7pm; Saturday and Sunday, 12pm to 3pm.")
  but the suggested Title still uses only Window 1, and the preview's countdown states are computed from
  Window 1 only (source: `validWindows[0]`): a known simplification to flag for build. A window crossing
  midnight gets the note "This window runs past midnight into the next day." `live-walk/multiwindow.png`
- **Reusable "Custom" interval** reveals an inline row: "Every" + numeric input (default `2`) + unit dropdown
  (minutes / hours / days, default hours). The 30-minute floor is enforced: entering less shows "The shortest
  interval is 30 minutes. Please set 30 minutes or more." and the effective interval clamps to 30 minutes
  ("Customers can redeem this again every 30 minutes"). Interval text formats as minutes under an hour, hours
  under a day, days beyond; a 1-day interval reads "every day" in the suggested title. `live-walk/reusable-custom.png`

### A14. Extras surfaced by the live walk and source

- **DEMO category dropdown options (11):** Food & Drink, Beauty & Wellness, Health & Fitness, Out & About,
  Shopping, Home & Local Services, Travel & Hotels, Health & Medical, Family & Kids, Auto & Garage, Pet
  Services. Each has its own suggestion chips and term flags in source (`CATEGORY_DATA`): e.g. Shopping gets
  "While stocks last" and "Valid on full price items only" but no booking terms; Beauty & Wellness gets
  "One treatment per visit"; the Package "one table or visit" term reads "The package is for one visit" outside
  Food & Drink. The production rule stands: the merchant's registered category drives this and the switcher
  must not ship.
- **Custom terms:** an added term renders at the BOTTOM of the preset list as a permanently checked row with a
  teal CUSTOM badge (plus a RESTRICTIVE badge if the regex fires), with inline Edit and Remove; the form button
  toggles "Add term" / "Update term". `live-walk/custom-term.png`
- **Estimated saving editability:** derived (read-only in effect) for Discount, Spend & save, Freebie and
  Package; only BOGO accepts manual edits, guarded by "This no longer matches the free item's full price of
  £{X}." when it diverges.
- **Suggestion templates:** §4c confirmed against source, with these additions: Discount fixed `"£{X} off"`;
  Discount with minimum `"{X}% off when you spend £{Y}"` / `"£{X} off when you spend £{Y}"`; Freebie standalone
  `"Free {item}"`; BOGO different-item variant `"Buy a {buyItem}, get a {freeItem} free"`; Package list-mode
  title join per A6; Reusable 1-day special case "available again every day". Photo-less previews use a
  per-type brand-gradient banner (source `TYPE_BANNER`), not a grey placeholder.

### Live-walk screenshot index (`live-walk/`)

| File | State |
|---|---|
| typepicker.png | "Create a voucher" type picker, live build |
| tooweak.png | Too weak, below-£5 variant (Discount 10% of £30) |
| tooweak-restrictive.png | Too weak, too-restrictive variant (edit-mode seeded terms) |
| great.png | Great state (photo + edited description, improvements gone) |
| fixedamount.png | Discount "A fixed amount off" branch |
| minspend-restrictive.png | Minimum spend expanded + RESTRICTIVE badge term |
| freebie-standalone.png | Freebie "No, it is free on its own." branch |
| package-items.png | Package deal "List the items" tab, 3 items filled |
| tl-latertoday.png | Time limited preview, "Later today" tab |
| tl-futureday.png | Time limited preview, "Future day" tab |
| multiwindow.png | Time limited with two schedule windows |
| reusable-custom.png | Reusable Custom interval + 30-minute floor note |
| reusable-waiting.png | Reusable preview, "Used, now waiting" tab |
| custom-term.png | Custom term added (CUSTOM badge row) |
| submit-confirm.png | "Confirm this is your voucher" modal |
| submitted-list.png | Vouchers list after submit (new IN REVIEW card) |
| edit-menu.png | Live custom voucher Actions menu (Edit voucher etc.; includes design-app chrome) |
| edit-mode.png | Builder opened in edit mode, prefilled title visible |
| flagship-menu.png | Flagship voucher Actions menu (Request a change; no Edit/Delete) |
