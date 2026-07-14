# LEGAL-REVIEW-REQUIRED · DRAFT · NOT FOR PRODUCTION SIGNING

**This is an operational draft prepared by the product team. It has NOT been reviewed or approved
by a qualified solicitor. It must not be presented to any merchant for binding signature, and no
Redeemo surface may state or imply that it carries legal approval, until a solicitor has reviewed
it and the owner has flipped `AGREEMENT_LEGAL_REVIEW_REQUIRED` to false.**

- Document: Redeemo Merchant Agreement
- Version: v2.0 (DRAFT)
- Supersedes: the hardcoded v1.0 text in `src/api/merchant/onboarding/service.ts:12-18`
- Jurisdiction assumed: England and Wales
- Every clause carries an inline `[SOLICITOR: ...]` question where wording needs legal judgement.
- Placeholders in `{{...}}` are populated at render time from merchant + platform data.

> Placement note: Redeemo's customer-facing legal text (Terms, Privacy, Cookies) lives in
> `apps/customer-web/app/{terms,privacy,cookies}` with versioning in
> `apps/customer-web/lib/legal.ts`. Those are consumer, statically-rendered pages. This is a
> **B2B contract artifact signed per-merchant**, not a published web page, so it is versioned as a
> backend/repo artifact under `docs/legal/` (draft here; frozen `docs/legal/agreements/` on
> sign-off) and rendered to a per-merchant signed PDF. The two share the "version pinned + never
> mutate a published version" discipline. [SOLICITOR: confirm this contract should be a signed
> per-merchant PDF rather than an incorporated-by-reference published web page; if the latter,
> advise how change-of-terms notice interacts with an already-signed 12-month term.]

---

## 1. Parties and definitions

This Agreement is between **Redeemo** ("Redeemo", "we", "us") and **{{businessLegalName}}**
(trading as **{{tradingName}}**), company number **{{companyNumber}}**, VAT number
**{{vatNumber}}** ("the Merchant", "you"), the business whose details are captured in the Redeemo
platform at the time of signing.

Definitions: "Platform" means the Redeemo marketplace (apps, websites, and merchant/admin portals);
"Consumer" or "Customer" means an end user of the Platform; "Voucher" means a digital offer you
publish; "RMV" means a Redeemo Mandatory Voucher; "Branch" means a physical location you operate;
"Redemption" means a Customer using a Voucher in person at a Branch; "Cycle" means the
subscription-anchored monthly window used to meter redemption eligibility.

[SOLICITOR: confirm Redeemo's correct contracting legal entity name, company number, and registered
address for the parties block; confirm whether the counterparty must be the registered company vs a
named individual sole trader, and how we bind unincorporated businesses (sole traders /
partnerships).]

## 2. The Platform and what Redeemo provides

Redeemo operates a location-first digital marketplace that connects Consumers who hold a paid
Redeemo membership with local businesses through exclusive digital Vouchers. Redeemo provides the
Merchant with: a listing for each approved Branch; tools to create and manage Vouchers; in-store
redemption validation; and optional paid promotional placements. Redeemo does not guarantee any
level of Customer traffic, redemptions, or revenue, and provides the Platform on a reasonable-
efforts basis.

[SOLICITOR: confirm the service-levels / availability position (we intend "no uptime warranty,
reasonable efforts"); confirm we can disclaim any guarantee of footfall or sales without falling
foul of misleading-representation rules given our sales messaging.]

## 3. Merchant obligations (general)

You agree to: provide accurate and current information about your business and Branches; hold all
licences, permits, and registrations required to operate lawfully; honour every Voucher a Customer
validly redeems on the terms you published; treat Customers fairly and in line with consumer-
protection law; and use the Platform only as permitted by this Agreement.

[SOLICITOR: confirm the breadth of the "hold all licences/permits" warranty and whether we need a
carve-out or an indemnity from the Merchant for operating without required licences (e.g. food
hygiene, alcohol, regulated services).]

## 4. Vouchers and redemption rules

4.1 **Mandatory Vouchers.** Before approval and throughout the term, you must configure and keep
active at least **two RMVs** (RMV-001 and RMV-002). You may not edit or delete the RMVs once
approved; you may add custom Vouchers (RCV-XXX). RMVs are performance-based: your Branch is promoted
when a Customer redeems.

4.2 **Honour the Voucher.** You must honour any Voucher a Customer validly redeems, exactly as
described (value, item, conditions, and any fair-use terms you set), for the full period the Voucher
is live. You must not add undisclosed conditions, minimum spends, or exclusions at the point of
redemption.

4.3 **One per Customer per Cycle.** A Voucher is redeemable once per Customer per Cycle across all
your Branches. You must not require a Customer to redeem more than once, or refuse a valid
first-in-Cycle redemption.

4.4 **In-store validation only.** Redemption is validated in person at the Branch (QR scan, manual
code entry, or the merchant Quick Validate). You must never self-redeem, pre-validate, or validate
a code the Customer is not physically present to use. The redemption code is valid for the Cycle.

[SOLICITOR: (a) confirm "must honour the Voucher for the full live period" is enforceable and how it
interacts with a Voucher we suspend/remove mid-Cycle; (b) confirm the position where a Merchant runs
out of stock of a Freebie/Package item - is "honour or offer equivalent" the right standard?;
(c) confirm the one-per-Cycle rule creates no issue under consumer law when a Customer is refused a
second redemption.]

## 5. Commercial terms and fees

5.1 **Free to join.** Listing on the Platform is free. You are not charged to create an account,
list Branches, or publish Vouchers.

5.2 **Paid placements.** Optional featured placement and marketing campaigns are chargeable at the
rates presented to you in the Platform at the time of purchase. Paid placements are separate orders
under this Agreement.

5.3 **No Consumer charges to you.** Redeemo's Consumer membership fees are between Redeemo and the
Consumer; you receive no share of and owe nothing toward them.

[SOLICITOR: confirm VAT treatment and invoicing obligations for paid placements; confirm whether
featured/campaign terms (cancellation, refunds, auto-renewal of a placement) need their own schedule
or can sit under the Platform's presented rates; confirm consumer-facing "exclusive" and "savings"
claims do not create a Merchant obligation we have not intended.]

## 6. Term and termination

6.1 **Term.** This Agreement runs for a fixed term of **12 months** from the date you sign, and is
signed digitally during onboarding.

6.2 **Termination for convenience.** [DRAFT position] Either party may terminate at the end of the
12-month term on notice; the term does not auto-renew into a new fixed term without your agreement.

6.3 **Termination / suspension for cause.** Redeemo may suspend or terminate immediately for breach
(see §11).

[SOLICITOR: (a) confirm the 12-month fixed term is what the business wants and whether it should
auto-renew (business rule 9 says "12-month contract, signed digitally" but is silent on renewal;
deferred follow-up §AH notes "don't promise renewal past final cycle"); (b) draft the correct
notice period and whether the Merchant has any early-exit right; (c) confirm early termination by
Redeemo for convenience vs for-cause only.]

## 7. Operational responsibilities

7.1 **Accuracy of Branch information.** You must keep each Branch's name, address, location, opening
hours, contact details, and amenities accurate and up to date. Location is confirmed during
onboarding and must reflect the real trading location.

7.2 **Staff conduct and validation discipline.** You are responsible for your staff's use of the
Platform, including keeping Branch redemption PINs confidential, validating only genuine in-person
redemptions, and not enabling fraudulent or courtesy validations. You must assign responsible staff
to each Branch.

7.3 **Quality.** You must maintain the quality and availability of the goods/services underlying
your Vouchers.

[SOLICITOR: confirm the Merchant carries full liability for its staff's acts/omissions on the
Platform, including fraudulent validations, and whether we need an express indemnity for
staff-caused fraud losses.]

## 8. Prohibited use

You must not: publish false, misleading, or unlawful Voucher content; use the Platform to
circumvent the one-per-Cycle rule or validation controls; harvest or misuse Customer data;
interfere with the Platform's operation or security; infringe third-party rights (including IP);
or use the Platform for any unlawful purpose. Redeemo may remove content or listings that breach
this clause.

[SOLICITOR: confirm this prohibited-use list is adequate and whether specific regulated-goods
restrictions (age-restricted products, financial promotions, health claims) must be enumerated.]

## 9. Customer treatment and consumer protection

You must treat Customers fairly, honour published terms, not discriminate unlawfully, and comply
with applicable consumer-protection law (including the Consumer Rights Act 2015 and the Digital
Markets, Competition and Consumers Act 2024 / consumer-protection provisions as in force). Any
dispute about goods or services provided at your Branch is between you and the Customer; Redeemo is
not a party to the underlying sale.

[SOLICITOR: confirm the correct current consumer-protection statutory references and the exact
allocation of consumer-law responsibility between Redeemo (as marketplace) and the Merchant (as
seller); confirm whether Redeemo has any residual liability to Consumers we must address.]

## 10. Data protection

10.1 **Roles.** Each party complies with UK GDPR and the Data Protection Act 2018. In respect of
Consumer personal data processed through the Platform, Redeemo determines the purposes and means of
processing for the marketplace and is the controller for that processing; the Merchant is a separate
controller for the personal data it processes for fulfilling its own goods/services and its own
business records. The parties are not joint controllers unless expressly agreed.

10.2 **Merchant duties.** You must process any Customer personal data you obtain through a Redemption
only for fulfilling that Redemption and your legal obligations, keep it secure, and not use Platform
data to build a competing marketing list without a lawful basis.

10.3 **Security.** Each party maintains appropriate technical and organisational measures.

[SOLICITOR: this is the highest-risk clause. Confirm the controller/controller vs
controller/processor characterisation for (a) Consumer identity shown to the Merchant at redemption
and (b) any data the Merchant captures; confirm whether a data-processing schedule or a data-sharing
agreement is required; confirm the lawful basis and any restriction on the Merchant's re-use of
Customer data for marketing. Cross-reference D48 (role-based internal PII access) for what identity
the Merchant actually sees.]

## 11. Suspension and termination for cause

Redeemo may suspend your account and Branches **immediately** where you fail to honour redeemed
Vouchers, breach this Agreement, act fraudulently, or where suspension is necessary to protect
Customers or the Platform. On suspension, all your Vouchers deactivate immediately; your redemption
history is preserved. Redeemo may reinstate, or terminate for cause, following review.

[SOLICITOR: confirm immediate suspension without prior notice is enforceable and proportionate for a
B2B counterparty (business rule 8 requires immediate suspension); draft any minimum
process/notification we must give on or after suspension, and whether any cure period is required
before termination for cause.]

## 12. Document verification

You must, on request, provide and keep current the verification documents Redeemo requires to
confirm your identity, ownership, and right to operate (business verification, and where applicable
price lists and supporting documents). Redeemo may withhold or withdraw approval where verification
is incomplete or fails.

[SOLICITOR: confirm what verification we are entitled to require and retain, for how long, and under
what lawful basis (this intersects with §10 and with the merchant-verification email-first strategy);
confirm we can condition go-live on verification.]

## 13. Intellectual property and licence

You grant Redeemo a non-exclusive licence to display your business name, logo, images, Branch
details, and Voucher content on the Platform for the purpose of operating the marketplace. You
warrant you own or are licensed to use that content. Redeemo retains all rights in the Platform.

[SOLICITOR: confirm the scope/duration of the content licence, whether it survives termination for
already-served impressions, and the IP warranty + indemnity from the Merchant for infringing
content.]

## 14. Liability

14.1 Nothing in this Agreement limits liability that cannot be limited by law (including for death
or personal injury caused by negligence, or fraud).

14.2 Subject to 14.1, Redeemo is not liable for indirect or consequential loss, loss of profit, or
loss of goodwill, and Redeemo's total aggregate liability under this Agreement is capped at
**[AMOUNT / formula to be set]** (for example, the fees you paid Redeemo in the 12 months before the
claim).

[SOLICITOR: set the liability cap figure/formula and confirm its enforceability given the Platform is
free to join (a fees-paid cap may be near-zero for a Merchant who buys no placements - advise an
alternative floor); confirm the mutual vs one-way liability position and the excluded loss list.]

## 15. Changes to these terms

Redeemo may update this Agreement. For a material change, Redeemo will give you reasonable notice
through the Platform or by email. [DRAFT position] Changes do not alter the fixed term already
signed; a new version is presented for signature at renewal or where a change requires re-consent.
The version you signed remains the version that governs your current term unless you accept a new
version.

[SOLICITOR: confirm how mid-term changes are handled for a fixed 12-month signed term - can we
unilaterally vary during the term, or only at renewal? Draft the correct notice mechanism and what
constitutes acceptance (continued use vs re-signature). This directly drives the versioning model in
the spec (append-never-mutate; re-sign produces a new evidence record).]

## 16. Disputes and governing law

This Agreement is governed by the law of England and Wales, and the parties submit to the exclusive
jurisdiction of the courts of England and Wales. The parties will first attempt to resolve disputes
in good faith; [DRAFT position] mediation before litigation.

[SOLICITOR: confirm governing law/jurisdiction is England and Wales for all merchant counterparties
(including those in Scotland/NI once we expand); confirm whether a mediation/ADR step should be
mandatory and which body.]

## 17. General

Entire agreement; no waiver by delay; severability; no partnership/agency created; assignment by
Redeemo permitted, by the Merchant only with consent; notices via the Platform or the email on
file.

[SOLICITOR: confirm the standard boilerplate set (entire agreement, third-party rights exclusion
under the Contracts (Rights of Third Parties) Act 1999, force majeure, assignment/novation) and add
any missing standard clauses.]

## Execution (signature)

Signed by the person named below, who confirms they are the owner or an authorised signatory able to
bind {{businessLegalName}} to this Agreement:

- Signatory full name (typed): **{{signerName}}**
- Role / authority: **{{signerRoleConfirmation}}**
- Business: **{{businessLegalName}}**
- Agreement version: **{{agreementVersion}}**  ·  Content hash: **{{contentHash}}**
- Date/time (Europe/London): **{{signedAt}}**
- Signing method: **{{method}}** (in-person assisted on a Redeemo representative's device, or
  self-serve in the merchant portal)
- Witnessed by (Redeemo representative, in-person assisted only): **{{actorAdminName}}**
- IP address: **{{ipAddress}}**  ·  Device/user-agent: **{{userAgent}}**

The typed full name above is the signatory's electronic signature. Where a touchscreen was
available, an optional drawn signature may also have been captured; it does not replace the typed
name as the acceptance.

[SOLICITOR: confirm a typed-name simple electronic signature + evidence pack is sufficient execution
for this Agreement, or whether a witnessed / advanced electronic signature is required; confirm the
in-person "hand the device to the owner; the Redeemo representative never signs for the owner"
ceremony is the right way to capture the owner's act and that the representative recorded as
"witness" carries no signatory liability; confirm the evidence fields listed here are the right ones
to hold and for how long.]

---

### Collected solicitor questions in this draft: 20

(One per: §1 parties, §2 platform/SLA, §3 obligations, §4 vouchers [multi-part], §5 fees, §6 term,
§7 staff liability, §8 prohibited use, §9 consumer protection, §10 data protection, §11 suspension,
§12 verification, §13 IP, §14 liability, §15 changes, §16 disputes, §17 boilerplate, §Execution,
plus the placement note and the parties-entity note.)
