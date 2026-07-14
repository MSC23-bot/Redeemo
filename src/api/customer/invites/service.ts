// src/api/customer/invites/service.ts
//
// Customer merchant-invite programme, M0 (Phase 1, signed-in only).
//
// IDENTITY MODEL (Codex correction round 2026-07-14): registered inviters are
// identified by inviterKey = 'u:' + userId — stable across account-email
// changes, so a changed email can never bypass the person+business dedupe.
// Phase 1 persists NO email at all: inviterEmailNorm stays NULL on every
// Phase-1 row (it is Phase-2-anonymous-lane-only, reserved/not implemented
// here). The unique invariant is (inviterKey, placeKey), enforced by
// `MerchantInvite_inviterKey_placeKey_key`. Two same-transaction advisory
// locks (placeKey, then inviterKey — fixed order, deadlock-safe) serialise
// the races: one lead per business under concurrent first-submitters, and an
// atomic open-invite cap check per inviter.
//
// Spec-locked decisions this module preserves:
//   - Recruitment/pipeline STATE lives ONLY on MerchantLead (stage LEAD /
//     CONTACTED / VISIT_BOOKED / CONVERTED / LOST). MerchantInvite is
//     invitation FACTS only (who invited what, when, whether it counted).
//   - Pipeline privacy: a business that is a pipeline/draft (non-ACTIVE)
//     Merchant must be INDISTINGUISHABLE, API-side, from an unknown business.
//     ONLY a live (status ACTIVE) merchant is ever revealed via `already_live`.
//   - rewardEligible + countableAt are internal-only stamps — NEVER returned
//     on SubmitInviteResult.
//   - NEVER log emails, notes, tokens, or raw IPs anywhere in this module
//     (console/log output — NOT the audit trail, which is the sanctioned
//     store-of-record and already carries ipAddress per the house
//     AuditActorContext convention used across every other service).
//     HONEST SCOPE (adversarial review F2): the future invite anonymise
//     sweep covers INVITE-ROW fields only (note, emails, ipHash). The
//     LEAD_CREATED / INVITE_CREATED AuditLog rows written here retain the
//     raw IP + actorId under the platform's audit governance, so invite-row
//     anonymisation does NOT sever the inviter<->IP linkage on its own;
//     ipHash is a coarse clustering datum (keyless sha256/32 over a small
//     input space), NOT a privacy control. The sweep milestone must either
//     extend redaction to these audit rows or keep this documented limit.
//
// Release of a HELD_REVIEW invite (HELD_REVIEW -> ACTIVE, stamping
// countableAt + rewardEligible at release time) is an M2 admin action,
// deliberately NOT implemented here.

import type Redis from 'ioredis'
import { PrismaClient, Prisma } from '../../../../generated/prisma/client'
import { AppError } from '../../shared/errors'
import { writeAuditLogTx } from '../../shared/audit'
import { RedisKey } from '../../shared/redis-keys'
import { generateSecureToken } from '../../shared/tokens'
import { consumeInviteLocationSearch } from '../../shared/inviteLocationLimiter'
import { searchPlaces } from '../../lib/googlePlaces'
import { parseFormattedAddress, type MerchantLocationCandidate } from '../../merchant/location/service'
import {
  buildInviterKey,
  buildPlaceKey,
  hashInviteIp,
  validateInviteNote,
} from './identity'

const BUSINESS_NAME_MAX_LENGTH = 160
const OPEN_INVITE_CAP = 10

/** SQLSTATE 55P03 (lock_not_available) raised by SET LOCAL lock_timeout.
 * Duck-typed like the proven house classifier (isTimeout in
 * src/api/queues/maintenanceSweep.ts, round-3 review F-C1): the SQLSTATE is
 * read from meta.code REGARDLESS of the wrapping envelope, because the
 * driver adapter does not guarantee a KnownRequestError/P2010 wrapper for
 * every raw failure; the message check is the final fallback. */
function isLockTimeoutError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as { meta?: unknown; message?: unknown }
  const metaCode =
    e.meta && typeof e.meta === 'object' ? (e.meta as { code?: unknown }).code : undefined
  if (metaCode === '55P03') return true
  const msg = typeof e.message === 'string' ? e.message : ''
  return msg.includes('55P03') || /lock timeout/i.test(msg)
}

// ── M1: place-search (candidate-token stash) ────────────────────────────────
// Mirrors the Branches PR-6 §4a merchant location-search flow (searchMerchantLocations
// in src/api/merchant/location/service.ts) EXACTLY in shape, sized for the
// customer-facing "invite a business" flow: the customer searches a business
// name, picks a Google Text Search result, and the server stashes the
// place id + parsed address behind an opaque candidateToken (coords/placeId
// NEVER cross the wire — same L1 invariant as the merchant flow).

const INVITE_CANDIDATE_TTL_SECONDS = 15 * 60 // 15 minutes

/** The client-safe candidate DTO returned by POST .../place-search. */
export interface InviteLocationCandidate {
  candidateToken: string
  name: string
  formattedAddress: string
  addressParts: MerchantLocationCandidate['addressParts']
}

/** The server-held secret behind an invite candidate token (NEVER serialized
 * to the client). `locality` is a best-effort city/postcode fragment used
 * only for submitInvite's branch-locality matching — never the raw coords. */
export interface InviteLocationCandidateStash {
  googlePlaceId: string
  name: string
  formattedAddress: string
  locality: string | null
}

/**
 * Run a customer invite location search: enforce the inviteLocationLimiter,
 * call Google in the `customer_invite` usage bucket, stash each candidate's
 * placeId + parsed address behind a fresh opaque token, and return the
 * client-safe DTO array. NEVER throws on a provider failure (missing API key,
 * quota, transport, local caps, or genuinely no results) — the invite form's
 * search is a nicety, not a hard requirement, so every `searchPlaces`
 * `ok:false` case degrades to an empty candidate list and the customer falls
 * back to typing the business name by hand. The limiter's own
 * LOCATION_SEARCH_RATE_LIMITED throw is NOT swallowed here — it propagates as
 * a genuine 429.
 */
export async function searchInvitePlaces(
  redis: Redis,
  ctx: { userId: string; ip?: string | null },
  query: string,
): Promise<InviteLocationCandidate[]> {
  // Limiter FIRST — before any billable Google call.
  await consumeInviteLocationSearch(redis, { userId: ctx.userId, ip: ctx.ip ?? null })

  const result = await searchPlaces(query, { source: 'customer_invite' })
  if (!result.ok) return [] // graceful degrade — provider internals never surfaced to the client

  const out: InviteLocationCandidate[] = []
  for (const c of result.candidates) {
    const candidateToken = generateSecureToken(16)
    const addressParts = parseFormattedAddress(c.formattedAddress)
    const stash: InviteLocationCandidateStash = {
      googlePlaceId: c.placeId,
      name: c.name,
      formattedAddress: c.formattedAddress,
      // Best-effort locality for submitInvite's branch-address matching —
      // city when parseable, else the postcode fragment, else null.
      locality: addressParts.city ?? addressParts.postcode ?? null,
    }
    await redis.set(
      RedisKey.inviteLocationCandidate(ctx.userId, candidateToken),
      JSON.stringify(stash),
      'EX',
      INVITE_CANDIDATE_TTL_SECONDS,
    )
    out.push({ candidateToken, name: c.name, formattedAddress: c.formattedAddress, addressParts })
  }
  return out
}

/**
 * Resolve an invite candidate token to its server-held stash. Unlike the
 * merchant flow's `resolveLocationCandidate` (single-use, deletes on read),
 * this is a plain GET — the M1 contract explicitly allows reuse within the
 * TTL (a customer may re-open the submit form against the same search
 * result). Returns null when the token is missing / expired / malformed;
 * the route treats that identically to "no candidateToken was supplied" and
 * falls back to a free-text businessName when one was given.
 */
export async function resolveInviteLocationCandidate(
  redis: Redis,
  userId: string,
  token: string,
): Promise<InviteLocationCandidateStash | null> {
  const raw = await redis.get(RedisKey.inviteLocationCandidate(userId, token))
  if (!raw) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }

  const obj = parsed as Partial<InviteLocationCandidateStash>
  if (
    typeof obj.googlePlaceId !== 'string' ||
    typeof obj.name !== 'string' ||
    typeof obj.formattedAddress !== 'string'
  ) {
    return null
  }

  return {
    googlePlaceId: obj.googlePlaceId,
    name: obj.name,
    formattedAddress: obj.formattedAddress,
    locality: typeof obj.locality === 'string' ? obj.locality : null,
  }
}

// The three open pipeline lanes an attach-target lead can sit in (mirrors
// PIPELINE_LANES in src/api/admin/leads/service.ts — CONVERTED/LOST are
// terminal and never an attach target).
const OPEN_LEAD_STAGES = ['LEAD', 'CONTACTED', 'VISIT_BOOKED'] as const

export type SubmitInviteResult =
  | { kind: 'already_live'; merchantId: string; businessName: string }
  | { kind: 'ok' }

export interface SubmitInviteInput {
  userId: string
  businessNameRaw: string
  localityRaw?: string | null
  googlePlaceId?: string | null
  note?: string | null
  consentShareName: boolean
  ip: string
  userAgent?: string | null
}

// ── Locality matching (branch-side) ─────────────────────────────────────────
// Fields on Branch that carry free-text location — no single "locality"
// column is authoritative, so the conservative match checks all of them.
type BranchLocalityFields = {
  addressLine1: string
  addressLine2: string | null
  city: string
  postcode: string
  localityName: string | null
  postTown: string | null
}

function branchLocalityHaystack(branch: BranchLocalityFields): string {
  return [branch.addressLine1, branch.addressLine2, branch.city, branch.postcode, branch.localityName, branch.postTown]
    .filter((v): v is string => !!v)
    .join(' ')
    .toLowerCase()
}

/** True when localityRaw is absent/blank (no constraint), or when the branch's
 * address text contains the locality token, case-insensitively. */
function branchMatchesLocality(branch: BranchLocalityFields, localityRaw: string | null | undefined): boolean {
  const token = (localityRaw ?? '').trim().toLowerCase()
  if (token === '') return true
  return branchLocalityHaystack(branch).includes(token)
}

const BRANCH_LOCALITY_SELECT = {
  addressLine1: true, addressLine2: true, city: true, postcode: true,
  localityName: true, postTown: true,
} as const

type MatchedMerchant = { id: string; businessName: string; status: string }

/**
 * Resolve the merchant (if any) matching this invite's business, per spec
 * §(d). Two lanes:
 *   - googlePlaceId known: look up via an active Branch.googlePlaceId match.
 *   - no googlePlaceId: conservative case-insensitive businessName match,
 *     additionally requiring an active branch whose address text contains
 *     localityRaw (when supplied).
 * `activeOnly: true` reproduces the LIVE check (§d); `activeOnly: false`
 * reproduces the "any status" re-run used by the reward-eligibility stamp
 * (§f) — same matching rules, no status filter.
 */
async function findMatchingMerchant(
  prisma: PrismaClient | Prisma.TransactionClient,
  input: { googlePlaceId?: string | null; businessNameTrimmed: string; localityRaw?: string | null },
  opts: { activeOnly: boolean },
): Promise<MatchedMerchant | null> {
  if (input.googlePlaceId) {
    // The LIVE reveal (§d) requires an active branch; the eligibility lane
    // (§f) must also see inactive/draft branches, or a business mid-
    // onboarding would still stamp rewardEligible (D8 insider window).
    const branch = await prisma.branch.findFirst({
      where: { googlePlaceId: input.googlePlaceId, ...(opts.activeOnly ? { isActive: true } : {}) },
      select: { merchant: { select: { id: true, businessName: true, status: true } } },
    })
    const merchant = branch?.merchant ?? null
    if (merchant) {
      // A branch-level placeId hit precisely identifies THIS business, so a
      // non-ACTIVE result in the LIVE lane must NOT fall through to the name
      // lane (which could wrongly reveal a different live business of the
      // same name).
      if (opts.activeOnly && merchant.status !== 'ACTIVE') return null
      return merchant
    }
    // Branch MISS falls through to the name lane in BOTH lanes (adversarial
    // review F1): a freshly-converted draft has no branch at all, so the
    // eligibility lane would otherwise stamp rewardEligible for a business
    // already onboarding; and in the LIVE lane a live merchant whose pin is
    // manual/centroid (no googlePlaceId on any branch) is still matched by
    // name+locality at the same disclosure standard as the free-text lane.
  }

  const merchant = await prisma.merchant.findFirst({
    where: {
      ...(opts.activeOnly ? { status: 'ACTIVE' as const } : {}),
      businessName: { equals: input.businessNameTrimmed, mode: 'insensitive' },
    },
    select: {
      id: true, businessName: true, status: true,
      branches: { where: { isActive: true }, select: BRANCH_LOCALITY_SELECT },
    },
  })
  if (!merchant) return null
  if (merchant.branches.length === 0) {
    // §(d) LIVE reveal: a name match with no active branch is not a live,
    // locality-corroborated business — never revealed.
    // §(f) eligibility lane: a branchless merchant is exactly what a
    // freshly-converted draft looks like (convertLead creates no branch),
    // so a name match alone must disqualify (conservative toward D8;
    // documented false-negative risk for same-named businesses elsewhere,
    // acceptable pre-launch and admin-overridable later).
    return opts.activeOnly
      ? null
      : { id: merchant.id, businessName: merchant.businessName, status: merchant.status }
  }
  const hasBranchMatch = merchant.branches.some((b) => branchMatchesLocality(b, input.localityRaw))
  if (!hasBranchMatch) return null
  return { id: merchant.id, businessName: merchant.businessName, status: merchant.status }
}

// ── Lead matching (attach-target) ───────────────────────────────────────────

type LeadCandidate = { id: string; locationHint: string | null; convertedMerchantId: string | null }

/** True when the lead's locationHint and the invite's localityRaw are
 * compatible: either is null/blank, or one contains the other case-insensitively. */
function leadLocationMatches(locationHint: string | null, localityRaw: string | null | undefined): boolean {
  const hint = (locationHint ?? '').trim().toLowerCase()
  const raw = (localityRaw ?? '').trim().toLowerCase()
  if (hint === '' || raw === '') return true
  return hint.includes(raw) || raw.includes(hint)
}

/**
 * Find the open-pipeline lead (if any) this invite should attach to: same
 * businessName (case-insensitive), compatible locationHint, stage still in
 * an open lane. Shared by the eligibility stamp (§f, run pre-transaction on
 * the root client) and the attach step (§g, run fresh inside the transaction).
 */
/**
 * Eligibility-only (§f): a CONVERTED lead matching name+locality means the
 * business already began onboarding, even if the resulting draft merchant
 * was renamed or is otherwise unmatchable — disqualifies rewardEligible
 * (D8). Never used for attach or reveal.
 */
async function findConvertedLeadMatch(
  client: PrismaClient | Prisma.TransactionClient,
  businessNameTrimmed: string,
  localityRaw: string | null | undefined,
): Promise<{ id: string } | null> {
  const candidates = await client.merchantLead.findMany({
    where: {
      stage: 'CONVERTED',
      businessName: { equals: businessNameTrimmed, mode: 'insensitive' },
    },
    select: { id: true, locationHint: true },
    take: 10,
  })
  return candidates.find((c) => leadLocationMatches(c.locationHint, localityRaw)) ?? null
}

async function findAttachTargetLead(
  client: PrismaClient | Prisma.TransactionClient,
  businessNameTrimmed: string,
  localityRaw: string | null | undefined,
): Promise<LeadCandidate | null> {
  const candidates = await client.merchantLead.findMany({
    where: {
      stage: { in: [...OPEN_LEAD_STAGES] },
      businessName: { equals: businessNameTrimmed, mode: 'insensitive' },
    },
    select: { id: true, locationHint: true, convertedMerchantId: true },
    take: 10,
  })
  return candidates.find((c) => leadLocationMatches(c.locationHint, localityRaw)) ?? null
}

// ── submitInvite ─────────────────────────────────────────────────────────

export async function submitInvite(
  prisma: PrismaClient,
  input: SubmitInviteInput,
): Promise<SubmitInviteResult> {
  // (a) Business name.
  const businessNameTrimmed = input.businessNameRaw.trim()
  if (businessNameTrimmed === '') throw new AppError('INVITE_BUSINESS_NAME_REQUIRED')
  if (businessNameTrimmed.length > BUSINESS_NAME_MAX_LENGTH) throw new AppError('INVITE_BUSINESS_NAME_INVALID')

  // (b) Note.
  const noteResult = validateInviteNote(input.note)
  if (!noteResult.ok) throw new AppError(noteResult.code)

  // (c) Canonical identity.
  const inviterKey = buildInviterKey(input.userId)
  const placeKey = buildPlaceKey({
    googlePlaceId: input.googlePlaceId,
    businessName: businessNameTrimmed,
    locality: input.localityRaw,
  })

  // (d) LIVE check — pipeline privacy: only an ACTIVE merchant is revealed.
  const liveMatch = await findMatchingMerchant(
    prisma,
    { googlePlaceId: input.googlePlaceId, businessNameTrimmed, localityRaw: input.localityRaw },
    { activeOnly: true },
  )
  if (liveMatch) {
    return { kind: 'already_live', merchantId: liveMatch.id, businessName: liveMatch.businessName }
  }

  // (e) Open-invite cap moved INSIDE the transaction (below), after the
  // advisory locks — see the cap check inside prisma.$transaction.

  // (f) Eligibility stamp — computed BEFORE the transaction, same matching
  // rules as (d) but without the ACTIVE filter, plus the matched-lead
  // convertedMerchantId check. Never exposed on the response.
  const anyMerchantMatch = await findMatchingMerchant(
    prisma,
    { googlePlaceId: input.googlePlaceId, businessNameTrimmed, localityRaw: input.localityRaw },
    { activeOnly: false },
  )
  const matchedLeadForEligibility = await findAttachTargetLead(prisma, businessNameTrimmed, input.localityRaw)
  const convertedLeadMatch = await findConvertedLeadMatch(prisma, businessNameTrimmed, input.localityRaw)
  const rewardEligible =
    !anyMerchantMatch && !convertedLeadMatch && !matchedLeadForEligibility?.convertedMerchantId

  const ipHash = hashInviteIp(input.ip)
  const userAgent = input.userAgent ?? ''

  // (g)/(h) Atomic attach-or-create lead + create invite, with an in-lock
  // duplicate pre-check and a P2002 backstop. Unlike the redemption claim (which
  // needs a cross-transaction RETRY to distinguish "stale, reclaimable" from
  // "already claimed"), a duplicate invite has one meaning regardless of
  // ordering — so this follows the simpler try/$transaction/catch shape used
  // by convertLead in src/api/admin/leads/service.ts, not the two-transaction
  // retry shape.
  try {
    return await prisma.$transaction(async (tx) => {
      // Bounded, NAMESPACED advisory locks (correction round 3):
      // - the two-argument pg_advisory_xact_lock(namespace, key) form puts
      //   place locks (namespace 1) and inviter locks (namespace 2) in
      //   structurally distinct classes, and the fixed namespace order
      //   (1 then 2, identical for every caller) globally orders
      //   acquisition, so a cross-namespace inversion/deadlock cannot be
      //   constructed even under 32-bit hashtext() collisions.
      // - SET LOCAL lock_timeout bounds the wait under same-key pile-up;
      //   a timeout surfaces as the RETRYABLE INVITE_SUBMIT_CONTENTION 429
      //   (mapped in the catch below), never an opaque 500.
      // Both statements are transaction-scoped (auto-reset/release on
      // commit or rollback). The placeKey lock serialises lead
      // attach-or-create per business; the inviterKey lock serialises the
      // duplicate pre-check + cap per inviter (no TOCTOU overshoot).
      await tx.$executeRaw`SET LOCAL lock_timeout = '3s'`
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(1, hashtext(${placeKey})), pg_advisory_xact_lock(2, hashtext(${inviterKey}))`

      // Duplicate pre-check FIRST, under the inviterKey lock and BEFORE the
      // cap (correction round 3): an exact (inviterKey, placeKey) duplicate
      // is idempotent success — it must not consume cap headroom, be
      // rejected at cap, or write anything. Two identical concurrent
      // requests crossing the cap boundary both land here honestly: the
      // first creates, the second (serialised by the inviterKey lock) sees
      // the row and returns ok.
      const existingDuplicate = await tx.merchantInvite.findUnique({
        where: { inviterKey_placeKey: { inviterKey, placeKey } },
        select: { id: true },
      })
      if (existingDuplicate) return { kind: 'ok' } as const

      // (e) Open-invite cap — INSIDE the transaction, AFTER the inviterKey
      // lock and the duplicate pre-check.
      const openInviteCount = await tx.merchantInvite.count({
        where: { inviterKey, anonymisedAt: null },
      })
      if (openInviteCount >= OPEN_INVITE_CAP) throw new AppError('INVITE_CAP_REACHED')

      let leadId: string
      let isFreshlyCreatedLead = false

      const attachTarget = await findAttachTargetLead(tx, businessNameTrimmed, input.localityRaw)
      if (attachTarget) {
        leadId = attachTarget.id
      } else {
        const inviteWithLead = await tx.merchantInvite.findFirst({
          where: { placeKey, leadId: { not: null } },
          select: { leadId: true },
          orderBy: { createdAt: 'asc' },
        })
        if (inviteWithLead?.leadId) {
          leadId = inviteWithLead.leadId
        } else {
          const createdLead = await tx.merchantLead.create({
            data: {
              businessName: businessNameTrimmed,
              locationHint: input.localityRaw ?? null,
              source: 'CUSTOMER_REQUEST',
              stage: 'LEAD',
            },
            select: { id: true },
          })
          leadId = createdLead.id
          isFreshlyCreatedLead = true
          await writeAuditLogTx(tx, {
            entityId: leadId,
            entityType: 'lead',
            event: 'LEAD_CREATED',
            actorId: input.userId,
            actorType: 'CUSTOMER',
            metadata: { source: 'CUSTOMER_REQUEST', via: 'invite' },
            ipAddress: input.ip,
            userAgent,
          })
        }
      }

      // Attaching to a PRE-EXISTING lead (direct match or placeKey reuse)
      // bumps the anonymisation clock; a freshly-created lead's
      // lastActivityAt already defaults to now().
      if (!isFreshlyCreatedLead) {
        await tx.merchantLead.update({ where: { id: leadId }, data: { lastActivityAt: new Date() } })
      }

      const invite = await tx.merchantInvite.create({
        data: {
          inviterUserId: input.userId,
          inviterKey,
          // inviterEmailNorm intentionally omitted: Phase 1 persists no
          // email at all (defaults to NULL at the DB level).
          placeKey,
          googlePlaceId: input.googlePlaceId ?? null,
          businessNameRaw: businessNameTrimmed,
          localityRaw: input.localityRaw ?? null,
          note: noteResult.note,
          consentShareName: input.consentShareName,
          status: noteResult.held ? 'HELD_REVIEW' : 'ACTIVE',
          rewardEligible: noteResult.held ? false : rewardEligible,
          countableAt: noteResult.held ? null : new Date(),
          leadId,
          ipHash,
        },
        select: { id: true },
      })

      await writeAuditLogTx(tx, {
        entityId: invite.id,
        entityType: 'invite',
        event: 'INVITE_CREATED',
        actorId: input.userId,
        actorType: 'CUSTOMER',
        metadata: { placeKeyKind: input.googlePlaceId ? 'places' : 'fuzzy', held: noteResult.held },
        ipAddress: input.ip,
        userAgent,
      })

      return { kind: 'ok' } as const
    })
  } catch (e) {
    // (inviterKey, placeKey) unique (MerchantInvite_inviterKey_placeKey_key)
    // — idempotent duplicate submission, not an error. Hardened per
    // adversarial review F8, now EXACT rather than substring: only a P2002
    // whose meta.target is precisely this composite constraint is treated
    // as idempotent (either Prisma target shape — an array of column names,
    // order-insensitive, or the constraint name string). A P2002 from any
    // other (future) unique in the transaction must surface, never lie
    // 'ok'. Non-Prisma errors (e.g. the INVITE_CAP_REACHED AppError thrown
    // above) fall straight through to `throw e` below, untouched.
    // Bounded lock_timeout expiry (SQLSTATE 55P03) under same-key pile-up
    // maps to the RETRYABLE contention 429 (correction round 3), never an
    // opaque 500. Prisma surfaces raw-statement failures as P2010 with the
    // SQLSTATE in meta.code; the message check is a defensive fallback.
    if (isLockTimeoutError(e)) {
      throw new AppError('INVITE_SUBMIT_CONTENTION')
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const target = e.meta?.target
      const isExactCompositeTarget =
        (Array.isArray(target) &&
          target.length === 2 &&
          [...target].sort().join(',') === ['inviterKey', 'placeKey'].sort().join(',')) ||
        target === 'MerchantInvite_inviterKey_placeKey_key'
      if (isExactCompositeTarget) {
        return { kind: 'ok' }
      }
    }
    throw e
  }
}

/**
 * Account-erasure hook — called from the customer delete-account flow
 * (src/api/auth/customer/routes.ts), inside the same transaction as the
 * User anonymisation.
 *
 * On every non-anonymised invite this user submitted it nulls the PII
 * fields (note, inviterEmailNorm, ipHash) AND the person linkage
 * (inviterUserId, inviterKey), stamps anonymisedAt, and clears
 * rewardEligible. What survives on the invite row is genuinely
 * non-personal aggregate demand: placeKey, businessNameRaw, leadId,
 * countableAt, status. NULL inviterKey rows drop out of the
 * (inviterKey, placeKey) unique constraint (Postgres treats NULLs as
 * distinct) and out of the cap and /mine queries — terminal by design.
 *
 * REWARD GRANTS (round-4 correction, Codex): PENDING grants carry NO
 * financial value (nothing issued or consumed) and a deleted account's
 * eligibility LAPSES (D2: rewards pay registered accounts only). They
 * are DELETED outright, not voided-in-place — voiding retained
 * grant.userId, which (because the User row is anonymised in place under
 * the SAME id) kept the grant pseudonymously linked to the person.
 * Deletion removes that linkage genuinely. ISSUED/CONSUMED grants are
 * financial records and are DELIBERATELY RETAINED (grant.userId intact);
 * the retention basis/duration for those is the explicit owner/solicitor
 * gate in spec A3.1 and is NOT decided or altered here.
 *
 * Person linkage that this function does NOT sever, by documented design:
 * (a) ISSUED/CONSUMED reward grants (financial-record gate, A3.1);
 * (b) LEAD_CREATED / INVITE_CREATED AuditLog rows retain raw IP + actorId
 *     under platform audit governance (gate A2.6). This function makes
 *     the INVITE ROWS and PENDING grants non-personal; those two gated
 *     surfaces remain the owner/solicitor decision.
 *
 * Returns the number of invite rows severed.
 */
export async function scrubInvitesForUser(
  prisma: PrismaClient | Prisma.TransactionClient,
  userId: string,
): Promise<number> {
  await prisma.inviteRewardGrant.deleteMany({
    where: { userId, status: 'PENDING' },
  })
  const result = await prisma.merchantInvite.updateMany({
    where: { inviterUserId: userId, anonymisedAt: null },
    data: {
      note: null,
      inviterEmailNorm: null,
      ipHash: null,
      inviterUserId: null,
      inviterKey: null,
      rewardEligible: false,
      anonymisedAt: new Date(),
    },
  })
  return result.count
}

/** LEAD_SELECT extension contract (future): per-lead invite demand evidence. */
export async function getLeadDemand(
  prisma: PrismaClient,
  leadId: string,
): Promise<{ inviteCount: number; latestInviteAt: Date | null }> {
  const [inviteCount, latest] = await Promise.all([
    prisma.merchantInvite.count({ where: { leadId, status: 'ACTIVE' } }),
    prisma.merchantInvite.findFirst({
      where: { leadId, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
  ])
  return { inviteCount, latestInviteAt: latest?.createdAt ?? null }
}

export async function countActiveInvitesForPlace(prisma: PrismaClient, placeKey: string): Promise<number> {
  return prisma.merchantInvite.count({ where: { placeKey, status: 'ACTIVE' } })
}
