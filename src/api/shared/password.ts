import bcrypt from 'bcryptjs'
import { passwordSchema } from './schemas'

const BCRYPT_ROUNDS = 12

export async function hashPassword(plaintext: string): Promise<string> {
  return bcrypt.hash(plaintext, BCRYPT_ROUNDS)
}

export async function verifyPassword(plaintext: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plaintext, hash)
}

export function validatePasswordPolicy(password: string): boolean {
  const result = passwordSchema.safeParse(password)
  return result.success
}
