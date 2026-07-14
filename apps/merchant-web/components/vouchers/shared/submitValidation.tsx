'use client'

import * as React from 'react'
import type { EffectiveVoucher, FieldError } from '@/lib/voucher/submitValidity'
import { collectSubmitErrors, resolveStructuredBag } from '@/lib/voucher/submitValidity'

// Voucher Builder shared core: the S5 submission-validity UI plumbing (owner requirement
// 2026-07-13). ONE context carries the current per-field errors down to the shared field
// primitives so each offending field marks itself inline; ONE hook (useSubmitValidation)
// owns the lane-level orchestration: validate-on-submit-attempt, live-clear as fields are
// fixed, focus the FIRST problem, and map a backend VOUCHER_INCOMPLETE response onto the
// same inline marks. The pure matrix lives in lib/voucher/submitValidity.ts; nothing here
// re-implements a rule.
//
// Server-error lifecycle (blocking fix 2026-07-14): a backend VOUCHER_INCOMPLETE field
// error is never retained-and-hidden. It is DROPPED permanently the moment the merchant
// changes that field's value (compared against a snapshot captured when the server errors
// were applied), or when a client error that shadowed it at apply time clears; a fresh
// submit attempt (or a fresh backend response) replaces the server-error set wholesale.
// Stale server marks can therefore never resurface after the merchant corrects a field.

interface SubmitValidationCtx {
  errorFor: (field: string) => FieldError | undefined
}

const Ctx = React.createContext<SubmitValidationCtx | null>(null)

/**
 * Read the current S5 error for a field, or undefined. Field primitives call this with
 * their stable S5 field code (e.g. 'bogoFreePrice'). Returns undefined outside a provider
 * or before a Submit attempt, so a resumed draft never shows phantom errors on mount.
 */
export function useFieldError(field?: string): FieldError | undefined {
  const ctx = React.useContext(Ctx)
  if (!ctx || !field) return undefined
  return ctx.errorFor(field)
}

/**
 * Stable, module-level provider. Wrap every builder field in it and pass
 * `errorFor={validation.errorFor}`. It is a fixed component type (never re-created per
 * render), so the field subtree is never remounted and inputs keep focus/state; the value
 * still updates each render so marks live-clear.
 */
export function SubmitValidationProvider({
  errorFor,
  children,
}: {
  errorFor: (field: string) => FieldError | undefined
  children: React.ReactNode
}) {
  const value = React.useMemo(() => ({ errorFor }), [errorFor])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export interface SubmitValidation {
  /** Attach to the element that encloses every builder field; focus-first searches inside it. */
  containerRef: React.RefObject<HTMLDivElement | null>
  /** The current display errors (client live-clear + any un-resolved backend fields). */
  errors: FieldError[]
  /** Pass to SubmitValidationProvider so the shared field primitives can read their error. */
  errorFor: (field: string) => FieldError | undefined
  /**
   * Run the matrix for the CURRENT effective voucher. When complete, returns true (the
   * caller proceeds to the confirm modal / API). When incomplete, marks every offending
   * field, focuses the first, and returns false (never reaches the modal or the API).
   */
  attemptSubmit: () => boolean
  /** Map a backend VOUCHER_INCOMPLETE `fields[]` onto the same inline marks + focus. */
  applyServerErrors: (fields: FieldError[]) => void
}

// Flatten the effective voucher into ONE per-S5-field-code value map so a server error's
// field can be compared against the value it was raised for. Structured mechanic fields
// come from the normalised bag; the non-bag S5 codes map onto their effective slots
// (availabilityWindows -> the window count the matrix checks).
function flattenEffective(v: EffectiveVoucher): Record<string, unknown> {
  return {
    ...(resolveStructuredBag(v.merchantFields) ?? {}),
    type: v.type,
    title: v.title,
    estimatedSaving: v.estimatedSaving,
    cooldownSeconds: v.cooldownSeconds,
    availabilityWindows: v.windowCount,
  }
}

// The retained backend VOUCHER_INCOMPLETE set + the context needed to retire each entry
// honestly: the per-field values at apply time, and which fields the client matrix was
// ALSO flagging then (those are shadowed by the client message and retire when it clears).
interface ServerErrorState {
  fields: FieldError[]
  valuesAtApply: Record<string, unknown>
  clientFlaggedAtApply: ReadonlySet<string>
}

/**
 * Lane-level S5 orchestration. `compute` returns the effective voucher for the current
 * builder state; it is re-read on every render so the marks live-clear as the merchant
 * fixes fields. Validation is inert until the first Submit attempt (or a backend
 * VOUCHER_INCOMPLETE), so opening an old draft shows no errors before Submit.
 */
export function useSubmitValidation(compute: () => EffectiveVoucher): SubmitValidation {
  const [attempted, setAttempted] = React.useState(false)
  const [serverState, setServerState] = React.useState<ServerErrorState | null>(null)
  const [focusTick, setFocusTick] = React.useState(0)
  const containerRef = React.useRef<HTMLDivElement | null>(null)

  // Client-side live errors: only once a Submit has been attempted; recomputed each
  // render from the live state so fixing a field clears its mark immediately.
  const effective = compute()
  const clientErrors = attempted ? collectSubmitErrors(effective) : []
  const clientFields = new Set(clientErrors.map((e) => e.field))

  // Honest server-error retirement (single mechanism, both lanes). A retained backend
  // field error survives ONLY while (a) its field's value is unchanged since apply AND
  // (b) any client error that shadowed it at apply time is still present. Once retired it
  // is dropped from STATE (never merely hidden), so it cannot resurface on later renders.
  let liveServer: FieldError[] = []
  if (serverState) {
    const now = flattenEffective(effective)
    liveServer = serverState.fields.filter((e) => {
      if (!Object.is(now[e.field], serverState.valuesAtApply[e.field])) return false
      if (serverState.clientFlaggedAtApply.has(e.field) && !clientFields.has(e.field)) return false
      return true
    })
  }
  // Persist any retirement (render-time filtering already hides it this same render; the
  // state write makes the drop permanent). Guarded so it cannot loop.
  React.useEffect(() => {
    if (serverState && liveServer.length !== serverState.fields.length) {
      setServerState(liveServer.length > 0 ? { ...serverState, fields: liveServer } : null)
    }
  })

  // Display: client errors first; a surviving server field is shown only while the client
  // is not flagging the same field (one message per field, the client wording wins).
  const extraServer = liveServer.filter((e) => !clientFields.has(e.field))
  const errors = [...clientErrors, ...extraServer]

  // A plain closure over the current errors (deliberately new each render so marks
  // live-clear); the stable SubmitValidationProvider prevents any field remount.
  const errorFor = (field: string) => errors.find((e) => e.field === field)

  // Focus + scroll the first invalid field (document order == visual order). Runs after
  // the marks have rendered (the focusTick bump re-renders first).
  React.useEffect(() => {
    if (focusTick === 0) return
    const el = containerRef.current?.querySelector<HTMLElement>('[data-invalid="true"]')
    if (el) {
      // scrollIntoView is unimplemented in jsdom (throws); guard so tests + SSR are safe.
      if (typeof el.scrollIntoView === 'function') {
        try {
          el.scrollIntoView({ block: 'center', behavior: 'smooth' })
        } catch {
          /* no-op in environments without layout */
        }
      }
      if (typeof el.focus === 'function') el.focus({ preventScroll: true })
    }
  }, [focusTick])

  const attemptSubmit = React.useCallback((): boolean => {
    // A fresh submit replaces the server-error set wholesale (the next backend response,
    // if any, re-applies its own); nothing stale survives an attempt.
    setServerState(null)
    const found = collectSubmitErrors(compute())
    setAttempted(true)
    if (found.length > 0) {
      setFocusTick((t) => t + 1)
      return false
    }
    return true
  }, [compute])

  const applyServerErrors = React.useCallback(
    (fields: FieldError[]) => {
      if (fields.length === 0) return
      // Wholesale replacement + a fresh retirement context: snapshot the per-field values
      // the backend rejected, and which of them the client matrix is also flagging now.
      const current = compute()
      setServerState({
        fields,
        valuesAtApply: flattenEffective(current),
        clientFlaggedAtApply: new Set(collectSubmitErrors(current).map((e) => e.field)),
      })
      setAttempted(true)
      setFocusTick((t) => t + 1)
    },
    [compute],
  )

  return { containerRef, errors, errorFor, attemptSubmit, applyServerErrors }
}

// ── backend VOUCHER_INCOMPLETE mapping ────────────────────────────────────────

/**
 * Map a backend VOUCHER_INCOMPLETE ApiError onto the shared FieldError[] so its fields[]
 * render as the same inline marks + summary (S5.5 belt-and-braces for direct-API drift).
 * Returns null for any other error (the caller shows its generic banner). Duck-typed on
 * ApiError's { code, body } so it stays decoupled from the client module.
 */
export function parseIncompleteFields(err: unknown): FieldError[] | null {
  const e = err as { code?: string; body?: unknown }
  if (e?.code !== 'VOUCHER_INCOMPLETE') return null
  const raw = (e.body as { error?: { fields?: unknown } } | null)?.error?.fields
  if (!Array.isArray(raw)) return null
  const fields = raw.filter(
    (f): f is FieldError =>
      !!f && typeof (f as FieldError).field === 'string' && typeof (f as FieldError).message === 'string',
  )
  return fields.length > 0 ? fields : null
}

// ── inline error primitives ──────────────────────────────────────────────────

const DANGER = '#B91C1C'

/**
 * The inline message under a field whose focusable INPUT already carries the
 * `data-invalid` focus marker (TextField / MoneyField). No marker here: the input is the
 * focus target.
 */
export function InlineError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <p role="alert" className="text-[12px] font-semibold" style={{ color: DANGER }}>
      {message}
    </p>
  )
}

/**
 * A standalone S5 error for a field with NO focusable input of its own (the base-mechanic
 * picker, the schedule windows, the cooldown). Renders nothing when the field is valid;
 * when invalid it carries the `data-invalid` focus marker and is itself focusable so
 * focus-first can land on it.
 */
export function FieldError({ errorKey }: { errorKey?: string }) {
  const err = useFieldError(errorKey)
  if (!err) return null
  return (
    <p
      role="alert"
      tabIndex={-1}
      data-invalid="true"
      className="text-[12px] font-semibold outline-none"
      style={{ color: DANGER }}
    >
      {err.message}
    </p>
  )
}

/**
 * The summary block above the footer: lists everything the merchant must fix. Renders
 * nothing when there are no errors.
 */
export function SubmitErrorSummary({ errors }: { errors: FieldError[] }) {
  if (errors.length === 0) return null
  return (
    <div
      role="alert"
      className="rounded-[12px] border p-3"
      style={{ background: '#FEECEC', borderColor: '#F5C2C2', color: DANGER }}
    >
      <p className="text-[13px] font-bold">Before you submit, please fix:</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[12px] font-medium">
        {errors.map((e) => (
          <li key={`${e.field}-${e.code}`}>{e.message}</li>
        ))}
      </ul>
    </div>
  )
}
