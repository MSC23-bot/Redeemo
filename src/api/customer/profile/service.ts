import { PrismaClient } from '../../../../generated/prisma/client'
import { AppError } from '../../shared/errors'
import { hashPassword, verifyPassword } from '../../shared/password'
import { writeAuditLog } from '../../shared/audit'
import { resolvePostcode } from '../../lib/postcodeResolver'
import { findOrCreateLocality } from '../../lib/findOrCreateLocality'

// Profile completeness: 9 optional fields tracked. Percentage shown on profile screen.
function computeProfileCompleteness(user: {
  dateOfBirth: Date | null
  gender: string | null
  addressLine1: string | null
  city: string | null
  postcode: string | null
  profileImageUrl: string | null
  newsletterConsent: boolean
  interests: unknown[]
  phone: string | null
}): number {
  const optionalFields = [
    user.dateOfBirth !== null,
    user.gender !== null,
    user.addressLine1 !== null,
    user.city !== null,
    user.postcode !== null,
    user.profileImageUrl !== null,
    user.newsletterConsent === true,
    user.interests.length > 0,
    user.phone !== null,
  ]
  const filled = optionalFields.filter(Boolean).length
  return Math.round((filled / optionalFields.length) * 100)
}

export async function getCustomerProfile(prisma: PrismaClient, userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      profileImageUrl: true,
      dateOfBirth: true,
      gender: true,
      addressLine1: true,
      addressLine2: true,
      city: true,
      postcode: true,
      // §DF PR #128 R1-1 prereq — additive saved-postcode coordinates +
      // locality FK so Map locate-me + future surfaces can centre on
      // the user's saved profile area when GPS is unavailable.  These
      // are nullable; backend already maintains them in lock-step with
      // `postcode` via `updateCustomerProfile`'s postcode-resolve path.
      latitude: true,
      longitude: true,
      localityId: true,
      locality: { select: { id: true, name: true, postTown: true, region: true } },
      newsletterConsent: true,
      emailVerified: true,
      phoneVerified: true,
      onboardingCompletedAt: true,
      subscriptionPromptSeenAt: true,
      createdAt: true,
      interests: { select: { interest: { select: { id: true, name: true } } } },
    },
  })
  if (!user) throw new AppError('USER_NOT_FOUND')

  const interests = user.interests.map((ui) => ui.interest)
  return {
    ...user,
    interests,
    profileCompleteness: computeProfileCompleteness({ ...user, interests }),
  }
}

export async function updateCustomerProfile(
  prisma: PrismaClient,
  userId: string,
  data: {
    firstName?: string
    lastName?: string
    name?: string // deprecated legacy alias; maps to firstName if firstName not provided
    dateOfBirth?: string
    gender?: string
    addressLine1?: string
    addressLine2?: string
    city?: string
    postcode?: string
    profileImageUrl?: string | null
    newsletterConsent?: boolean
  },
  ctx?: { ipAddress: string; userAgent: string }
) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
  if (!user) throw new AppError('USER_NOT_FOUND')

  const resolvedFirstName =
    data.firstName !== undefined ? data.firstName
    : data.name !== undefined ? data.name
    : undefined

  // Plan 4 M1.20 — postcode resolve-on-write. When a postcode arrives in the
  // payload, we resolve it via postcodes.io BEFORE the user.update so the
  // existing valid location is never overwritten by an unresolved postcode.
  // Resolver failures throw AppError (POSTCODE_NOT_FOUND / GAZETTEER_UNAVAILABLE
  // — both defined in ERROR_DEFINITIONS, both surface as their declared
  // statusCode via the global error handler). On success, the full snapshot
  // (postcode + lat/lng + Locality FK + admin-hierarchy mirrors) is persisted
  // atomically with the rest of the update.
  let postcodeSnapshotUpdate: Record<string, unknown> = {}
  if (data.postcode !== undefined && data.postcode !== null) {
    const resolved = await resolvePostcode(data.postcode)
    if (!resolved.ok) throw new AppError(resolved.error)
    const locality = await findOrCreateLocality(prisma, resolved.snapshot)
    postcodeSnapshotUpdate = {
      postcode:           resolved.snapshot.postcode,
      latitude:           resolved.snapshot.latitude,
      longitude:          resolved.snapshot.longitude,
      localityId:         locality.id,
      postTown:           resolved.snapshot.postTown ?? locality.postTown,
      ladDistrict:        resolved.snapshot.ladDistrict,
      adminCounty:        resolved.snapshot.adminCounty,
      region:             resolved.snapshot.region,
      country:            resolved.snapshot.country,
      locationResolvedAt: new Date(),
      // Keep the legacy `city` field aligned with the locality name. M5
      // cleanup will audit and may remove the field entirely.
      city:               locality.name,
    }
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(resolvedFirstName !== undefined ? { firstName: resolvedFirstName } : {}),
      ...(data.lastName !== undefined ? { lastName: data.lastName } : {}),
      ...(data.dateOfBirth !== undefined ? { dateOfBirth: new Date(data.dateOfBirth) } : {}),
      ...(data.gender !== undefined ? { gender: data.gender } : {}),
      ...(data.addressLine1 !== undefined ? { addressLine1: data.addressLine1 } : {}),
      ...(data.addressLine2 !== undefined ? { addressLine2: data.addressLine2 } : {}),
      // Plan-4 postcode snapshot is the source of truth for city/postcode when
      // a postcode is provided. Direct `city` updates remain honoured when
      // the payload includes city without postcode (legacy compat).
      ...(data.postcode === undefined && data.city !== undefined ? { city: data.city } : {}),
      ...postcodeSnapshotUpdate,
      ...(data.profileImageUrl !== undefined ? { profileImageUrl: data.profileImageUrl } : {}),
      ...(data.newsletterConsent !== undefined ? { newsletterConsent: data.newsletterConsent } : {}),
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      profileImageUrl: true,
      dateOfBirth: true,
      gender: true,
      addressLine1: true,
      addressLine2: true,
      city: true,
      postcode: true,
      newsletterConsent: true,
      emailVerified: true,
      phoneVerified: true,
      onboardingCompletedAt: true,
      subscriptionPromptSeenAt: true,
      interests: { select: { interest: { select: { id: true, name: true } } } },
    },
  })

  if (ctx) {
    writeAuditLog(prisma, {
      entityId: userId,
      entityType: 'customer',
      event: 'PROFILE_UPDATED',
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    })
  }

  const interests = updated.interests.map((ui) => ui.interest)
  return {
    ...updated,
    interests,
    profileCompleteness: computeProfileCompleteness({ ...updated, interests }),
  }
}

export async function updateCustomerInterests(
  prisma: PrismaClient,
  userId: string,
  interestIds: string[]
) {
  // Validate all submitted IDs exist and are active before touching the user's data
  if (interestIds.length > 0) {
    const activeCount = await prisma.interest.count({
      where: { id: { in: interestIds }, isActive: true },
    })
    if (activeCount !== interestIds.length) throw new AppError('INVALID_INTERESTS')
  }

  // Full replace — atomically delete existing then insert new
  await prisma.$transaction([
    prisma.userInterest.deleteMany({ where: { userId } }),
    ...(interestIds.length > 0
      ? [prisma.userInterest.createMany({ data: interestIds.map(interestId => ({ userId, interestId })), skipDuplicates: true })]
      : []),
  ])

  const interests = await prisma.interest.findMany({
    where: { id: { in: interestIds } },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  })

  return { interests }
}

export async function getAvailableInterests(prisma: PrismaClient) {
  return prisma.interest.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  })
}

// One-shot marker: sets `onboardingCompletedAt` once and returns idempotently thereafter.
// The app uses this to gate the "Success" screen before the subscription prompt.
export async function markOnboardingComplete(prisma: PrismaClient, userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, onboardingCompletedAt: true },
  })
  if (!user) throw new AppError('USER_NOT_FOUND')

  if (user.onboardingCompletedAt) {
    return { onboardingCompletedAt: user.onboardingCompletedAt }
  }
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { onboardingCompletedAt: new Date() },
    select: { onboardingCompletedAt: true },
  })
  return updated
}

// One-shot marker: sets `subscriptionPromptSeenAt` so the soft subscribe prompt
// is shown at most once between onboarding-success and entering the app.
export async function markSubscriptionPromptSeen(prisma: PrismaClient, userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, subscriptionPromptSeenAt: true },
  })
  if (!user) throw new AppError('USER_NOT_FOUND')

  if (user.subscriptionPromptSeenAt) {
    return { subscriptionPromptSeenAt: user.subscriptionPromptSeenAt }
  }
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { subscriptionPromptSeenAt: new Date() },
    select: { subscriptionPromptSeenAt: true },
  })
  return updated
}

export async function changeCustomerPassword(
  prisma: PrismaClient,
  userId: string,
  currentPassword: string,
  newPassword: string,
  ctx?: { ipAddress: string; userAgent: string }
) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, passwordHash: true },
  })
  if (!user || !user.passwordHash) throw new AppError('USER_NOT_FOUND')

  const currentValid = await verifyPassword(currentPassword, user.passwordHash)
  if (!currentValid) throw new AppError('CURRENT_PASSWORD_INCORRECT')

  const newHash = await hashPassword(newPassword)
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: newHash },
  })

  if (ctx) {
    writeAuditLog(prisma, {
      entityId: userId,
      entityType: 'customer',
      event: 'PASSWORD_CHANGED',
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    })
  }

  return { success: true }
}
