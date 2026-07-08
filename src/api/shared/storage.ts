// src/api/shared/storage.ts
//
// Phase 0 PR-0.5: the R2 (S3-compatible) storage LIBRARY. This is the presign +
// validation surface only — it deliberately ships NO HTTP route, NO multipart
// handler, NO DB writes, and NO moderation (those are Phase 2 / PR-0.6). There
// is no legitimate Phase-0 caller; Phase 2 wires a route on top WITH capability/
// ownership checks (the uploader must own the branch/merchant the key scopes to).
//
// Safety rails:
//   - STORAGE_ENABLED gates presigning. Off (the default) ⇒ presign throws and
//     the S3 client is never constructed, so a dark deploy boots without R2
//     secrets (validateRequiredEnv only requires R2_* when STORAGE_ENABLED=true).
//   - Per-kind allow-lists: documents (private, ≤10 MB, pdf/jpg/png) vs
//     logos/banners/photos (public, ≤5 MB, jpg/png/webp). Content-type AND size
//     are validated BEFORE a URL is issued.
//   - Deterministic, traversal-safe key scheme `kind/ownerId/<random>.<ext>`:
//     ownerId is validated `[A-Za-z0-9_-]+` (no `/`, `..`, spaces); the object
//     name is crypto-random; the extension comes from the content-type
//     allow-list. A user-supplied filename is NEVER used as (part of) a key.
//   - Presigned URLs are short-lived.

import crypto from 'node:crypto'
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { requireSecret } from './env'

export type StorageKind = 'document' | 'logo' | 'banner' | 'photo'

export interface KindPolicy {
  /** content-type → file extension (the allow-list — anything else is rejected). */
  contentTypes: Readonly<Record<string, string>>
  /** hard size cap in bytes. */
  maxBytes: number
  /** 'private' → access via presignGet only; 'public' → access via publicUrl. */
  visibility: 'private' | 'public'
}

const MB = 1024 * 1024
const IMAGE_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' } as const

const KIND_POLICIES: Readonly<Record<StorageKind, KindPolicy>> = {
  // Verification documents — private; viewed via a short-lived presigned GET.
  document: {
    contentTypes: { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' },
    maxBytes: 10 * MB,
    visibility: 'private',
  },
  logo: { contentTypes: IMAGE_TYPES, maxBytes: 5 * MB, visibility: 'public' },
  banner: { contentTypes: IMAGE_TYPES, maxBytes: 5 * MB, visibility: 'public' },
  photo: { contentTypes: IMAGE_TYPES, maxBytes: 5 * MB, visibility: 'public' },
}

export const STORAGE_KINDS = Object.keys(KIND_POLICIES) as StorageKind[]

/** The (immutable) policy for a kind. Throws on an unknown kind. */
export function kindPolicy(kind: StorageKind): KindPolicy {
  const p = KIND_POLICIES[kind]
  if (!p) throw new Error(`[storage] unknown kind "${kind}"`)
  return p
}

// Short presign TTLs — long enough to start an upload / open a doc, no longer.
export const PUT_URL_TTL_SECONDS = 300 // 5 min to begin the upload
export const GET_URL_TTL_SECONDS = 300 // 5 min to open a private document

const OWNER_ID_RE = /^[A-Za-z0-9_-]+$/

// A well-formed key is EXACTLY `kind/ownerId/<random>.<ext>` and nothing else.
// Matching the whole string rejects traversal (`..`), a leading `/`, extra
// segments, and unsafe characters — so consumers (presignGet, publicUrl) never
// trust a caller-shaped key. `presignPut` only ever mints keys of this form.
const KEY_RE = /^(document|logo|banner|photo)\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\.(pdf|jpg|png|webp)$/

function assertValidKey(key: string): void {
  if (!KEY_RE.test(key)) {
    throw new Error(`[storage] invalid object key "${key}"`)
  }
}

// Exported (B4) so an upload route can fail closed with a clean STORAGE_NOT_ENABLED
// BEFORE it reads any request bytes, rather than letting a deep helper throw.
export const isStorageEnabled = (): boolean => (process.env.STORAGE_ENABLED ?? '') === 'true'

function assertStorageEnabled(): void {
  if (!isStorageEnabled()) {
    throw new Error('[storage] STORAGE_ENABLED is not "true" — presigning is disabled')
  }
}

// Lazy singleton S3 client — constructed only on the first presign (after the
// enabled check), so a disabled deploy never needs the R2 secrets.
let client: S3Client | null = null
function s3(): S3Client {
  if (!client) {
    client = new S3Client({
      region: 'auto', // Cloudflare R2
      endpoint: requireSecret('R2_ENDPOINT'),
      forcePathStyle: true,
      credentials: {
        accessKeyId: requireSecret('R2_ACCESS_KEY_ID'),
        secretAccessKey: requireSecret('R2_SECRET_ACCESS_KEY'),
      },
    })
  }
  return client
}

const bucket = (): string => requireSecret('R2_BUCKET')

export interface PresignPutInput {
  kind: StorageKind
  /** Owner scope (merchant/branch id). Validated [A-Za-z0-9_-]+ — never a path. */
  ownerId: string
  contentType: string
  sizeBytes: number
}

export interface PresignPutResult {
  url: string
  key: string
  expiresIn: number
}

/**
 * Validate (kind / content-type / size / ownerId) and return a short-lived
 * presigned PUT URL + the deterministic object key. Throws if storage is
 * disabled or any input is invalid — BEFORE any URL is issued.
 */
export async function presignPut(input: PresignPutInput): Promise<PresignPutResult> {
  assertStorageEnabled()

  const policy = kindPolicy(input.kind) // throws on unknown kind

  if (!OWNER_ID_RE.test(input.ownerId)) {
    throw new Error('[storage] invalid ownerId — must match [A-Za-z0-9_-]+ (no path separators)')
  }

  // Object.hasOwn (not `in` / index-truthiness) so a content-type equal to an
  // inherited Object.prototype key (`constructor`, `toString`, `__proto__`, …)
  // can never be mistaken for an allow-listed entry — the prototype chain must
  // never decide this check.
  if (!Object.hasOwn(policy.contentTypes, input.contentType)) {
    throw new Error(
      `[storage] content-type "${input.contentType}" not allowed for kind "${input.kind}" ` +
        `(allowed: ${Object.keys(policy.contentTypes).join(', ')})`,
    )
  }
  const ext = policy.contentTypes[input.contentType]

  if (!Number.isInteger(input.sizeBytes) || input.sizeBytes <= 0) {
    throw new Error('[storage] sizeBytes must be a positive integer')
  }
  if (input.sizeBytes > policy.maxBytes) {
    throw new Error(
      `[storage] file size ${input.sizeBytes} exceeds the ${policy.maxBytes}-byte cap for kind "${input.kind}"`,
    )
  }

  const key = `${input.kind}/${input.ownerId}/${crypto.randomBytes(16).toString('hex')}.${ext}`

  // NOTE: we sign ContentType (so the uploaded object's type is enforced) but
  // NOT ContentLength — so the per-kind `sizeBytes` cap above is a PRE-FLIGHT
  // check on a client-declared value, not a hard server-side limit. A client
  // holding the presigned URL could PUT more bytes. PR-0.6 / the Phase-2 upload
  // route must enforce the real cap (sign ContentLength, an R2 bucket policy, or
  // a server-proxied upload).
  const url = await getSignedUrl(
    s3(),
    new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: input.contentType }),
    { expiresIn: PUT_URL_TTL_SECONDS },
  )
  return { url, key, expiresIn: PUT_URL_TTL_SECONDS }
}

export interface PresignGetResult {
  url: string
  expiresIn: number
}

/**
 * Short-lived presigned GET for a private object (e.g. a verification document).
 * Throws if storage is disabled.
 */
export async function presignGet(key: string): Promise<PresignGetResult> {
  assertStorageEnabled()
  assertValidKey(key) // reject malformed / traversal keys before signing
  const url = await getSignedUrl(s3(), new GetObjectCommand({ Bucket: bucket(), Key: key }), {
    expiresIn: GET_URL_TTL_SECONDS,
  })
  return { url, expiresIn: GET_URL_TTL_SECONDS }
}

export interface PutObjectInput {
  kind: StorageKind
  /** Owner scope (merchant/branch id), validated [A-Za-z0-9_-]+ (no path separators). */
  ownerId: string
  contentType: string
  /** The actual file bytes. Its length is the HARD size check (and ContentLength). */
  body: Buffer
}

/**
 * Option B B4: server-proxied upload. Unlike `presignPut` (which hands the client
 * a presigned URL and can only PRE-FLIGHT a client-declared size), this puts the
 * bytes from the server, so content-type AND size are HARD-enforced against the
 * real buffer before the object is written. Validates (kind / content-type /
 * size / ownerId), mints the same deterministic `kind/ownerId/<random>.<ext>` key,
 * sends it with an explicit ContentLength, and returns the key. Throws (BEFORE any
 * write) if storage is disabled or any input is invalid.
 */
export async function putObject(input: PutObjectInput): Promise<{ key: string }> {
  assertStorageEnabled()

  const policy = kindPolicy(input.kind) // throws on unknown kind

  if (!OWNER_ID_RE.test(input.ownerId)) {
    throw new Error('[storage] invalid ownerId, must match [A-Za-z0-9_-]+ (no path separators)')
  }

  // Object.hasOwn guard (see presignPut) — rejects a content-type that only
  // "matches" via the prototype chain (e.g. "constructor", "__proto__").
  if (!Object.hasOwn(policy.contentTypes, input.contentType)) {
    throw new Error(
      `[storage] content-type "${input.contentType}" not allowed for kind "${input.kind}" ` +
        `(allowed: ${Object.keys(policy.contentTypes).join(', ')})`,
    )
  }
  const ext = policy.contentTypes[input.contentType]

  if (!Buffer.isBuffer(input.body) || input.body.length === 0) {
    throw new Error('[storage] body must be a non-empty Buffer')
  }
  // HARD size check on the actual bytes (closes the presignPut ContentLength gap).
  if (input.body.length > policy.maxBytes) {
    throw new Error(
      `[storage] file size ${input.body.length} exceeds the ${policy.maxBytes}-byte cap for kind "${input.kind}"`,
    )
  }

  const key = `${input.kind}/${input.ownerId}/${crypto.randomBytes(16).toString('hex')}.${ext}`

  await s3().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: input.body,
      ContentType: input.contentType,
      ContentLength: input.body.length,
    }),
  )
  return { key }
}

/**
 * Option B B4: delete a stored object by its key. Validates the key shape first
 * (rejecting traversal / malformed keys) so a caller-shaped key can never delete
 * outside the scheme. Throws if storage is disabled. Callers treat this as
 * best-effort (a failed object delete must not fail the row delete it accompanies).
 */
export async function deleteObject(key: string): Promise<void> {
  assertStorageEnabled()
  assertValidKey(key)
  await s3().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }))
}

/**
 * Compose the public CDN URL for a PUBLIC-kind object. Throws for a private
 * (document) key — those must be accessed via presignGet.
 */
export function publicUrl(key: string): string {
  assertValidKey(key) // full-shape check first — a traversal key can't sneak past the kind prefix
  const kind = key.split('/')[0] as StorageKind
  const policy = KIND_POLICIES[kind]
  if (!policy || policy.visibility !== 'public') {
    throw new Error(`[storage] publicUrl is only valid for public kinds — key "${key}" is private/unknown`)
  }
  const base = (process.env.R2_PUBLIC_BASE_URL ?? '').replace(/\/+$/, '')
  if (!base) throw new Error('[storage] R2_PUBLIC_BASE_URL is not set')
  return `${base}/${key}`
}

// A public URL we minted is EXACTLY `${R2_PUBLIC_BASE_URL}/<kind>/<ownerId>/<rand>.<ext>`
// (the inverse of `publicUrl(putObject-key)`). This is the SAME `kind/ownerId/<segment>.<ext>`
// shape `KEY_RE` enforces, restated here as a single capturing match against the
// post-base key tail (ownerId reuses the OWNER_ID_RE charset). Matching the WHOLE
// tail rejects extra `/` segments, `..`, leading/trailing slashes, and a missing
// extension — so a caller-supplied URL can never claim to be one of our objects
// unless it actually parses back to our origin + scheme.
const PUBLIC_KEY_RE = /^([a-z]+)\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_-]+\.[A-Za-z0-9]+)$/

/**
 * Parse a public object URL back to its `{ kind, ownerId }`. Returns null for
 * anything that is NOT one of our minted public URLs: a different origin, a
 * malformed key, extra path segments, traversal, or a missing extension. Pure +
 * env-driven (reads R2_PUBLIC_BASE_URL at call time, mirroring `publicUrl`), so a
 * caller can verify a URL is an OWNED upload of a given kind/owner WITHOUT a DB or
 * storage round-trip.
 */
export function parsePublicUrl(url: string): { kind: string; ownerId: string } | null {
  if (typeof url !== 'string' || url.length === 0) return null
  const base = (process.env.R2_PUBLIC_BASE_URL ?? '').replace(/\/+$/, '')
  if (!base || !url.startsWith(base + '/')) return null
  const key = url.slice(base.length + 1)
  const m = PUBLIC_KEY_RE.exec(key)
  if (!m) return null
  return { kind: m[1], ownerId: m[2] }
}
