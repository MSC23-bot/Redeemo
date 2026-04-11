import { PrismaClient } from '../../../../generated/prisma/client'
import { AppError } from '../../shared/errors'
import { hashPassword, verifyPassword } from '../../shared/password'
import { writeAuditLog } from '../../shared/audit'

// Profile completeness: 9 optional fields tracked. Percentage shown on profile screen.
function computeProfileCompleteness(user: {
  dateOfBirth: any
  gender: any
  addressLine1: any
  city: any
  postcode: any
  profileImageUrl: any
  newsletterConsent: boolean
  interests: any[]
  phone: any
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
      newsletterConsent: true,
      emailVerified: true,
      phoneVerified: true,
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
    name?: string
    dateOfBirth?: string
    gender?: string
    addressLine1?: string
    addressLine2?: string
    city?: string
    postcode?: string
    phone?: string
    profileImageUrl?: string
    newsletterConsent?: boolean
  },
  ctx?: { ipAddress: string; userAgent: string }
) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
  if (!user) throw new AppError('USER_NOT_FOUND')

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(data.name !== undefined ? { firstName: data.name } : {}),
      ...(data.dateOfBirth !== undefined ? { dateOfBirth: new Date(data.dateOfBirth) } : {}),
      ...(data.gender !== undefined ? { gender: data.gender } : {}),
      ...(data.addressLine1 !== undefined ? { addressLine1: data.addressLine1 } : {}),
      ...(data.addressLine2 !== undefined ? { addressLine2: data.addressLine2 } : {}),
      ...(data.city !== undefined ? { city: data.city } : {}),
      ...(data.postcode !== undefined ? { postcode: data.postcode } : {}),
      ...(data.phone !== undefined ? { phone: data.phone } : {}),
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

  // Full replace — delete existing then insert new
  await prisma.userInterest.deleteMany({ where: { userId } })

  if (interestIds.length > 0) {
    await prisma.userInterest.createMany({
      data: interestIds.map((interestId) => ({ userId, interestId })),
      skipDuplicates: true,
    })
  }

  const interests = await prisma.interest.findMany({
    where: { id: { in: interestIds } },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  })

  return { interests }
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
