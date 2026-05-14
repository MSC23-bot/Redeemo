# Google Places — Setup Checklist (Phase 1 merchant-pin)

Owner-run setup. Done once per environment.

## What this key is for

Used by `prisma/suggest-branch-pin.ts` to suggest a merchant branch's exact
storefront pin via Google Places Text Search. The CLI requires explicit owner
confirmation before flipping the branch's `locationConfidence` to
`MANUALLY_CONFIRMED`. See:

- Spec: `docs/superpowers/specs/2026-05-14-merchant-exact-pin-confirmation-design.md`
- Plan: `docs/superpowers/plans/2026-05-14-merchant-exact-pin-confirmation.md`

## Phase 1 intended call pattern

**Admin / owner CLI only.** A Google Places call may originate ONLY from
`prisma/suggest-branch-pin.ts` invoked manually by the owner / admin.

NOT allowed in Phase 1:

- Customer search
- Customer map
- Customer postcode preview (PC2 / cold-open)
- Merchant organic signup
- Merchant branch creation
- Merchant portal viewing / editing

Organic and newly recruited merchants start at `POSTCODE_CENTROID`. The
admin then runs the CLI to suggest and confirm their exact pin; only
explicit confirmation flips the branch to `MANUALLY_CONFIRMED`.

When merchant-portal self-service is eventually scoped, it will call
`searchPlaces(query, { source: 'merchant_portal' })` so its usage lands
in its own `bySource` bucket inside `.cache/google-places-usage.json`.
Brainstorm-first per the Tier 3 standing rule before any merchant-side
Google call ships.

## What this key is NOT for

- NOT a customer-facing API call.
- NOT used during postcode preview, PC2 onboarding, customer discovery, search,
  map, or merchant profile.
- NOT cached or pre-fetched in bulk.
- NOT used to import opening hours / photos / ratings / phone / website.

## Setup steps

1. Create / reuse a Google Cloud project.
2. Enable **Billing** on the project (Google requires a card on file even for the free monthly credit on Maps).
3. Enable the **Places API (New)** (NOT the legacy Places API).
4. Generate an API key. Restrict to "Places API (New)" only.
5. **Application restriction** is optional for the server-side CLI from a
   laptop with a rotating IP. Leave as **None** until a static-IP host
   exists, then add **IP addresses**.
6. **Skip** the in-console daily quota cap — Google does NOT let you adjust
   the per-day quota for Places API (New) downward (the `Adjustable` column
   reads `No`). See "Local daily + monthly hard-stop" below for the
   replacement.
7. Set a **billing alert** at ~£5/month (or local-currency equivalent) on
   the billing account. 50% / 90% / 100% thresholds, "Actual" trigger, with
   "Email alerts to billing admins and users" ticked.
8. Save the key to `.env` as `GOOGLE_MAPS_API_KEY=...`. NEVER commit.
9. Verify with a single suggest call:

   ```
   npx tsx prisma/suggest-branch-pin.ts tax-branch-karaara-001
   ```

   You should see Google candidates printed; no DB write occurs.

## Local daily + monthly hard-stop (M2.3.5 — replaces the unavailable Google quota)

Google does not expose a per-day quota knob for Places API (New). The
billing alert is a notification, not a stop. To bound bug loops and
surprise invoices, the wrapper enforces TWO local caps before any
`fetch` call:

| Cap | Default | Override env var |
| --- | --- | --- |
| Daily   | **500 calls / local calendar day**   | `GOOGLE_PLACES_DAILY_CAP`   |
| Monthly | **4,500 calls / local calendar month** | `GOOGLE_PLACES_MONTHLY_CAP` |

Reasoning for the defaults:

- The monthly cap (4,500) sits below Google's **5,000 free Text Search Pro
  events / month** — staying inside the free tier even at worst-case usage.
- The daily cap (500) is a circuit-breaker — high enough for a busy
  onboarding day, low enough that a runaway script can't burn the whole
  monthly allowance in one afternoon.
- Daily is checked first; if both would trip, the daily error wins
  (deterministic user-facing message).

If either cap is reached, `searchPlaces()` returns one of:

- `LOCAL_DAILY_CAP_REACHED`
- `LOCAL_MONTHLY_CAP_REACHED`

The CLI surfaces a friendly message + override hint for both.

State lives at `.cache/google-places-usage.json` (gitignored). Shape:

```json
{
  "month": "2026-05",
  "monthTotal": 123,
  "monthBySource": { "admin_cli": 123 },
  "days": {
    "2026-05-14": { "total": 12, "bySource": { "admin_cli": 12 } }
  }
}
```

- A new local calendar day adds a new `days[YYYY-MM-DD]` entry; `monthTotal`
  keeps running.
- A new local calendar month wipes the structure entirely.
- A live `fetch` attempt counts ONCE — even on transport failure — so retry
  storms can't escape the bound.
- An attempt blocked by either cap does NOT increment (no double-count).
- The `bySource` buckets future-proof source tracking. Phase 1 = `admin_cli`
  only.

To temporarily raise either cap for a one-off batch:

```bash
GOOGLE_PLACES_DAILY_CAP=1000 npx tsx prisma/suggest-branch-pin.ts <args>
GOOGLE_PLACES_MONTHLY_CAP=6000 npx tsx prisma/suggest-branch-pin.ts <args>
```

Set sparingly. The defaults exist to prevent surprise invoices.

## Current pricing (verified 2026-05-14 — subject to Google pricing changes)

Verified against the [Google Maps Platform developer pricing page](https://developers.google.com/maps/billing-and-pricing/pricing).

The wrapper requests `places.id,places.displayName,places.formattedAddress,places.location,places.types`,
which lands us in the **Places API Text Search Pro** SKU (the IDs-only SKU
is too restrictive — we need name + location + types).

| SKU | Free monthly cap | Per 1,000 calls (first 100k) |
| --- | --- | --- |
| Text Search Pro ← our SKU       | **5,000 events** | **$32.00** |
| Text Search Enterprise          | 1,000 events | $35.00 |
| Text Search Essentials (IDs only — N/A) | Unlimited | $0 |

These figures **supersede** the spec's original assumption of ~$5/1,000.
Re-skim the developer pricing page before any volume-shifting change.

### Practical cost for Phase 1

| Scenario | Calls | Real cost |
| --- | --- | --- |
| Huddersfield trial (~30 branches × 1 suggest + 1 confirm) | 60 | **$0** (well within 5,000 free) |
| 300 merchants / month × 1 suggest + 1 confirm | 600 | **$0** (still inside free tier) |
| Whole 5,000 free tier burned in a month | 5,000 | $0 |
| 5,001st call (would be blocked by 4,500 local cap first) | — | — |
| Runaway bug loop, 1,000 calls/day for 5 days | 5,000 | $0; both local caps would have refused; £5 alert would still email at ~80 paid calls if a cap were absent |

The local caps + billing alert layered together mean the realistic
worst case for Phase 1 is **zero dollars**, full stop.

## When to rotate this key

- If the key leaks (committed accidentally, posted in a screenshot, etc.).
- If a new admin / dev needs access (give them a new key, not the existing one).
- Annually as good hygiene.
